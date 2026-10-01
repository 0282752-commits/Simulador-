// Temporada NFL: calendario por fórmula, standings con desempates, playoffs, simulación semanal, draft y progresión.
import { Rng, addDays, clamp } from "../../lib/rng";
import type { DraftPick, NflGame, NflPlayer, NflResult, NflSave, NflTeam } from "./types";
import { NflGameSim, type NflGameInput } from "./game";
import { teamDepth } from "./depth";
import { aiSignings, aiTrades, ensureNflContracts } from "./market";

export interface NflConfig {
  season: number;
  source: string;
  teams: NflTeam[];
  scheduleRotation: { note: string; intra2026: Record<string, string>; inter2026: Record<string, string>; seventeenth2026: Record<string, string>; firstSunday: string; superBowl: string };
}
export interface NflData { cfg: NflConfig; players: { meta: { source: string; updated: string; demo: boolean }; players: NflPlayer[] } }

const DIVS = ["Este", "Norte", "Sur", "Oeste"] as const;

export function newNflSave(data: NflData, seed = Math.floor(Math.random() * 1e9)): NflSave {
  const save: NflSave = {
    mode: "nfl", version: 0, seasonYear: data.cfg.season, week: 1,
    teams: Object.fromEntries(data.cfg.teams.map((t) => [t.id, { ...structuredClone(t), autoDepth: true }])),
    players: Object.fromEntries(data.players.players.map((p) => [p.id, structuredClone(p)])),
    games: [], picks: [], history: [], transactions: [], dataSource: data.players.meta, seed, phase: "temporada",
  };
  for (const t of Object.values(save.teams)) for (let y = save.seasonYear + 1; y <= save.seasonYear + 3; y++) for (let r = 1; r <= 7; r++) save.picks.push({ id: `${y}-${r}-${t.id}`, year: y, round: r, originalTeam: t.id, owner: t.id });
  ensureNflContracts(save);
  createNflSchedule(save, data.cfg);
  return save;
}

// ===== Calendario =====
function rotate<T>(arr: readonly T[], k: number): T[] { const n = arr.length; return arr.map((_, i) => arr[(((i + k) % n) + n) % n]); }

export function createNflSchedule(save: NflSave, cfg: NflConfig) {
  const rng = new Rng(save.seed + save.seasonYear);
  const y = save.seasonYear;
  const teams = Object.values(save.teams);
  const div = (conf: string, d: string) => teams.filter((t) => t.conf === conf && t.div === d);
  // posición del año anterior dentro de la división
  const prev = save.history[save.history.length - 1];
  const rankInDiv = new Map<string, number>();
  for (const conf of ["AFC", "NFC"]) for (const d of DIVS) {
    const ts = div(conf, d);
    const sorted = prev ? [...ts].sort((a, b) => prev.standings.findIndex((s) => s.team === a.id) - prev.standings.findIndex((s) => s.team === b.id)) : [...ts].sort((a, b) => teamStrength(save, b.id) - teamStrength(save, a.id));
    sorted.forEach((t, i) => rankInDiv.set(t.id, i));
  }
  const games: [string, string][] = [];
  const addPair = (h: NflTeam, a: NflTeam) => games.push([h.id, a.id]);
  // Ciclos de rotación (base 2026)
  const k = y - 2026;
  const intraMap = (d: string): string => {
    const base = { Este: "Oeste", Oeste: "Este", Norte: "Sur", Sur: "Norte" } as Record<string, string>;
    const cycle: Record<string, string>[] = [base, { Este: "Sur", Sur: "Este", Norte: "Oeste", Oeste: "Norte" }, { Este: "Norte", Norte: "Este", Sur: "Oeste", Oeste: "Sur" }];
    return cycle[((k % 3) + 3) % 3][d];
  };
  const interOrder = ["Norte", "Oeste", "Este", "Sur"]; // AFC Este vs NFC Norte en 2026
  const interFor = (afcDiv: string, shiftK: number) => rotate(interOrder, shiftK)[DIVS.indexOf(afcDiv as typeof DIVS[number])];
  for (const conf of ["AFC", "NFC"] as const) {
    for (const d of DIVS) {
      const ts = div(conf, d);
      // división: ida y vuelta
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) addPair(ts[i], ts[j]);
      // intraconferencia (4 partidos): solo una vez por par de divisiones
      const od = intraMap(d);
      if (DIVS.indexOf(d) < DIVS.indexOf(od as typeof DIVS[number])) {
        const os = div(conf, od);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) (i + j + k) % 2 === 0 ? addPair(ts[i], os[j]) : addPair(os[j], ts[i]);
      }
      // mismo puesto intraconferencia (2 partidos): ciclo d -> c1 -> od -> c2 -> d para que cada uno tenga 1 local y 1 visitante
      if (d === "Este") {
        const [c1, c2] = DIVS.filter((x) => x !== d && x !== od);
        const cyc = [d, c1, od, c2];
        for (let r = 0; r < 4; r++) {
          const at = cyc.map((dv) => div(conf, dv).find((t) => rankInDiv.get(t.id) === r)!);
          for (let i = 0; i < 4; i++) {
            const a = at[i], b = at[(i + 1) % 4];
            (r + k) % 2 === 0 ? addPair(a, b) : addPair(b, a);
          }
        }
      }
    }
  }
  // interconferencia (4 partidos) y partido 17
  for (const d of DIVS) {
    const afc = div("AFC", d);
    const nfc = div("NFC", interFor(d, k));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) (i + j + k) % 2 === 0 ? addPair(afc[i], nfc[j]) : addPair(nfc[j], afc[i]);
    const n17 = div("NFC", interFor(d, k + 2));
    for (const t of afc) {
      const r = rankInDiv.get(t.id)!;
      const opp = n17.find((x) => rankInDiv.get(x.id) === r)!;
      y % 2 === 0 ? addPair(opp, t) : addPair(t, opp); // años pares: local la NFC
    }
  }
  // semanas de descanso (5-14)
  const byeCounts = [2, 4, 4, 2, 4, 4, 2, 4, 4, 2];
  const order = rng.shuffle(teams.map((t) => t.id));
  const byeWeek = new Map<string, number>();
  let idx = 0;
  byeCounts.forEach((n, w) => { for (let i = 0; i < n; i++) byeWeek.set(order[idx++], 5 + w); });
  const weeks = scheduleNflWeeks(games, byeWeek, rng);
  const first = cfg.scheduleRotation.firstSunday;
  const sunday = (w: number) => addDays(first, 364 * (y - 2026) + 7 * (w - 1));
  save.games = [];
  weeks.forEach((wk, wi) => wk.forEach(([h, a], gi) => {
    const s = sunday(wi + 1);
    const date = gi === 0 ? addDays(s, -3) : gi === wk.length - 1 ? addDays(s, 1) : s; // jueves y lunes
    save.games.push({ id: `W${wi + 1}-${gi}`, week: wi + 1, date, home: h, away: a });
  }));
  save.week = 1;
  save.version++;
}

function scheduleNflWeeks(games: [string, string][], bye: Map<string, number>, rng: Rng): [string, string][][] {
  const teams = [...new Set(games.flat())];
  for (let attempt = 0; attempt < 200; attempt++) {
    let remaining = rng.shuffle([...games]);
    const out: [string, string][][] = [];
    let ok = true;
    for (let w = 1; w <= 18; w++) {
      const active = teams.filter((t) => bye.get(t) !== w);
      const m = matching(active, remaining, rng);
      if (!m) { ok = false; break; }
      out.push(m);
      const used = new Set(m);
      remaining = remaining.filter((g) => !used.has(g));
    }
    if (ok && !remaining.length) return out;
  }
  throw new Error("No se pudo generar el calendario NFL");
}

function matching(teams: string[], edges: [string, string][], rng: Rng): [string, string][] | null {
  const adj = new Map<string, [string, string][]>();
  for (const e of edges) for (const t of e) (adj.get(t) ?? adj.set(t, []).get(t)!).push(e);
  const matched = new Set<string>();
  const chosen: [string, string][] = [];
  let steps = 0;
  const rec = (): boolean => {
    if (++steps > 30000) return false;
    if (matched.size === teams.length) return true;
    let best: string | null = null, bestN = 1e9, bestRem = -1;
    for (const t of teams) {
      if (matched.has(t)) continue;
      const opts = (adj.get(t) ?? []).filter(([h, a]) => !matched.has(h) && !matched.has(a) && teams.includes(h) && teams.includes(a));
      const rem = (adj.get(t) ?? []).length;
      if (opts.length < bestN || (opts.length === bestN && rem > bestRem)) { bestN = opts.length; best = t; bestRem = rem; }
    }
    if (!best || bestN === 0) return false;
    // priorizar rivales con más partidos pendientes
    const opts = rng.shuffle((adj.get(best) ?? []).filter(([h, a]) => !matched.has(h) && !matched.has(a) && teams.includes(h) && teams.includes(a)))
      .sort((x, y) => (adj.get(x[0] === best ? x[1] : x[0])!.length) - (adj.get(y[0] === best ? y[1] : y[0])!.length)).reverse();
    for (const e of opts) {
      matched.add(e[0]); matched.add(e[1]); chosen.push(e);
      if (rec()) return true;
      matched.delete(e[0]); matched.delete(e[1]); chosen.pop();
    }
    return false;
  };
  return rec() ? chosen : null;
}

// ===== Fuerza, rosters y lesiones =====
export function roster(save: NflSave, teamId: string): NflPlayer[] {
  return Object.values(save.players).filter((p) => p.teamId === teamId && !p.retired);
}
export function injuredWeeks(save: NflSave, pid: string): number {
  return save.players[pid]?.injuryWeeks ?? 0;
}
export function teamStrength(save: NflSave, teamId: string): number {
  const r = roster(save, teamId).filter((p) => !p.practiceSquad).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 30);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
}
export function gameInput(save: NflSave, teamId: string): NflGameInput {
  const team = save.teams[teamId];
  const r = roster(save, teamId);
  return { team, roster: r, depth: teamDepth(team, r, (p) => !p.injuryWeeks) };
}

// ===== Standings y desempates =====
export interface NflRow { team: string; w: number; l: number; t: number; pf: number; pa: number; divW: number; divL: number; divT: number; confW: number; confL: number; confT: number; home: string; away: string; streak: string; pct: number }

function pct(w: number, l: number, t: number) { const g = w + l + t; return g ? (w + t / 2) / g : 0; }

export function nflRows(save: NflSave): Map<string, NflRow> {
  const rows = new Map<string, NflRow>();
  const hw = new Map<string, number[]>();
  for (const t of Object.values(save.teams)) { rows.set(t.id, { team: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, home: "", away: "", streak: "", pct: 0 }); hw.set(t.id, [0, 0, 0, 0]); }
  const res: Map<string, string[]> = new Map();
  for (const g of save.games.filter((x) => !x.playoff && x.result).sort((a, b) => a.date.localeCompare(b.date))) {
    const r = g.result!;
    const H = rows.get(g.home)!, A = rows.get(g.away)!;
    const th = save.teams[g.home], ta = save.teams[g.away];
    H.pf += r.hs; H.pa += r.as; A.pf += r.as; A.pa += r.hs;
    const sameDiv = th.conf === ta.conf && th.div === ta.div, sameConf = th.conf === ta.conf;
    const rec = (row: NflRow, k: "w" | "l" | "t") => {
      row[k]++;
      if (sameDiv) row[("div" + k.toUpperCase()) as "divW"]++;
      if (sameConf) row[("conf" + k.toUpperCase()) as "confW"]++;
      (res.get(row.team) ?? res.set(row.team, []).get(row.team)!).push(k.toUpperCase());
    };
    if (r.hs > r.as) { rec(H, "w"); rec(A, "l"); hw.get(g.home)![0]++; hw.get(g.away)![3]++; }
    else if (r.hs < r.as) { rec(A, "w"); rec(H, "l"); hw.get(g.home)![1]++; hw.get(g.away)![2]++; }
    else { rec(H, "t"); rec(A, "t"); }
  }
  for (const row of rows.values()) {
    row.pct = pct(row.w, row.l, row.t);
    const x = hw.get(row.team)!;
    row.home = `${x[0]}-${x[1]}`; row.away = `${x[2]}-${x[3]}`;
    const seq = res.get(row.team) ?? [];
    if (seq.length) { const last = seq[seq.length - 1]; let n = 0; for (let i = seq.length - 1; i >= 0 && seq[i] === last; i--) n++; row.streak = `${last === "W" ? "G" : last === "L" ? "P" : "E"}${n}`; }
  }
  return rows;
}

function recordVs(save: NflSave, team: string, opps: Set<string>): [number, number, number] {
  let w = 0, l = 0, t = 0;
  for (const g of save.games) {
    if (g.playoff || !g.result) continue;
    const me = g.home === team ? 0 : g.away === team ? 1 : -1;
    if (me < 0) continue;
    const opp = me === 0 ? g.away : g.home;
    if (!opps.has(opp)) continue;
    const a = me === 0 ? g.result.hs : g.result.as, b = me === 0 ? g.result.as : g.result.hs;
    if (a > b) w++; else if (a < b) l++; else t++;
  }
  return [w, l, t];
}
function opponents(save: NflSave, team: string): string[] {
  return save.games.filter((g) => !g.playoff && (g.home === team || g.away === team)).map((g) => (g.home === team ? g.away : g.home));
}

// Aplica los criterios en orden (aproximación de las reglas oficiales para empates múltiples).
export function breakTies(save: NflSave, group: string[], rows: Map<string, NflRow>, division: boolean, rng = new Rng(save.seed)): string[] {
  const crit: ((ids: string[]) => Map<string, number>)[] = [
    (ids) => new Map(ids.map((id) => [id, pct(...recordVs(save, id, new Set(ids.filter((x) => x !== id))))])), // enfrentamientos directos
    ...(division ? [(ids: string[]) => new Map(ids.map((id) => { const r = rows.get(id)!; return [id, pct(r.divW, r.divL, r.divT)]; }))] : [(ids: string[]) => new Map(ids.map((id) => { const r = rows.get(id)!; return [id, pct(r.confW, r.confL, r.confT)]; }))]),
    (ids) => { // partidos comunes
      const sets = ids.map((id) => new Set(opponents(save, id)));
      const common = new Set([...sets[0]].filter((o) => sets.every((s) => s.has(o)) && !ids.includes(o)));
      return new Map(ids.map((id) => [id, common.size >= (division ? 1 : 4) ? pct(...recordVs(save, id, common)) : 0]));
    },
    ...(division ? [(ids: string[]) => new Map(ids.map((id) => { const r = rows.get(id)!; return [id, pct(r.confW, r.confL, r.confT)]; }))] : []),
    (ids) => new Map(ids.map((id) => { // fuerza de la victoria
      const beaten = save.games.filter((g) => !g.playoff && g.result && ((g.home === id && g.result.hs > g.result.as) || (g.away === id && g.result.as > g.result.hs))).map((g) => (g.home === id ? g.away : g.home));
      const t = beaten.map((b) => rows.get(b)!); const w = t.reduce((a, r) => a + r.w, 0), l = t.reduce((a, r) => a + r.l, 0), tt = t.reduce((a, r) => a + r.t, 0);
      return [id, pct(w, l, tt)];
    })),
    (ids) => new Map(ids.map((id) => { // fuerza del calendario
      const t = opponents(save, id).map((b) => rows.get(b)!); const w = t.reduce((a, r) => a + r.w, 0), l = t.reduce((a, r) => a + r.l, 0), tt = t.reduce((a, r) => a + r.t, 0);
      return [id, pct(w, l, tt)];
    })),
    (ids) => new Map(ids.map((id) => [id, rows.get(id)!.pf - rows.get(id)!.pa])), // diferencia de puntos
  ];
  const rank = (ids: string[], ci: number): string[] => {
    if (ids.length <= 1) return ids;
    if (ci >= crit.length) return rng.shuffle([...ids]); // volado
    const vals = crit[ci](ids);
    const buckets = new Map<number, string[]>();
    for (const id of ids) { const v = Math.round((vals.get(id) ?? 0) * 10000); (buckets.get(v) ?? buckets.set(v, []).get(v)!).push(id); }
    const keys = [...buckets.keys()].sort((a, b) => b - a);
    if (keys.length === 1) return rank(ids, ci + 1);
    return keys.flatMap((k) => rank(buckets.get(k)!, ci + 1));
  };
  return rank(group, 0);
}

function sortByPct(save: NflSave, ids: string[], rows: Map<string, NflRow>, division: boolean): string[] {
  const byPct = new Map<number, string[]>();
  for (const id of ids) { const v = Math.round(rows.get(id)!.pct * 10000); (byPct.get(v) ?? byPct.set(v, []).get(v)!).push(id); }
  return [...byPct.keys()].sort((a, b) => b - a).flatMap((k) => breakTies(save, byPct.get(k)!, rows, division));
}

export function divisionStandings(save: NflSave, rows = nflRows(save)): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const conf of ["AFC", "NFC"]) for (const d of DIVS) {
    const ids = Object.values(save.teams).filter((t) => t.conf === conf && t.div === d).map((t) => t.id);
    out[`${conf} ${d}`] = sortByPct(save, ids, rows, true);
  }
  return out;
}

export function conferenceSeeds(save: NflSave, conf: "AFC" | "NFC", rows = nflRows(save)): string[] {
  const divs = divisionStandings(save, rows);
  const winners = DIVS.map((d) => divs[`${conf} ${d}`][0]);
  const seededWinners = sortByPct(save, winners, rows, false);
  const rest = Object.values(save.teams).filter((t) => t.conf === conf && !winners.includes(t.id)).map((t) => t.id);
  // para comodines: primero se eliminan empates dentro de la misma división
  const wc = sortByPct(save, rest, rows, false);
  return [...seededWinners, ...wc];
}

// ===== Simulación =====
export function simulateGame(save: NflSave, g: NflGame): NflResult {
  const sim = new NflGameSim(gameInput(save, g.home), gameInput(save, g.away), { neutral: g.neutral, playoff: g.playoff });
  return sim.runToEnd();
}

export function applyNflResult(save: NflSave, gameId: string, result: NflResult | undefined) {
  const g = save.games.find((x) => x.id === gameId);
  if (!g) return;
  const prev = g.result;
  if (prev?.injuries) for (const i of prev.injuries) { const p = save.players[i.player]; if (p) p.injuryWeeks = Math.max(0, (p.injuryWeeks ?? 0) - i.weeks); }
  g.result = result;
  if (result?.injuries) for (const i of result.injuries) { const p = save.players[i.player]; if (p) p.injuryWeeks = (p.injuryWeeks ?? 0) + i.weeks; }
  save.version++;
  // si cambia un partido de playoffs, se rehacen las rondas posteriores sin jugar
  if (g.playoff) {
    const later = save.games.filter((x) => x.playoff && x.week > g.week);
    if (later.every((x) => !x.result)) save.games = save.games.filter((x) => !later.includes(x));
  } else {
    const po = save.games.filter((x) => x.playoff);
    if (po.length && po.every((x) => !x.result)) save.games = save.games.filter((x) => !x.playoff);
  }
  progressNfl(save);
}

export function currentWeek(save: NflSave): number | null {
  const pending = save.games.filter((g) => !g.result);
  if (!pending.length) return null;
  return Math.min(...pending.map((g) => g.week));
}

export function playNflWeek(save: NflSave, week: number, skip?: (g: NflGame) => boolean) {
  const games = save.games.filter((g) => g.week === week && !g.result && !skip?.(g));
  for (const g of games) g.result = simulateGame(save, g);
  // lesiones: avanzar una semana y aplicar las nuevas
  for (const p of Object.values(save.players)) if (p.injuryWeeks) p.injuryWeeks = Math.max(0, p.injuryWeeks - 1);
  for (const g of games) for (const i of g.result!.injuries ?? []) { const p = save.players[i.player]; if (p) p.injuryWeeks = (p.injuryWeeks ?? 0) + i.weeks; }
  save.week = week + 1;
  // movimientos de la IA: fichajes por lesiones/necesidad y trades antes de la fecha límite
  const rng = new Rng(save.seed + save.seasonYear * 100 + week);
  if (!save.freeMarket) { aiSignings(save, rng, 0.25); if (week <= 9) aiTrades(save, rng, 3); }
  save.version++;
  progressNfl(save);
}

const PO_WEEKS = { 19: "Wild Card", 20: "Divisional", 21: "Campeonato de conferencia", 22: "Super Bowl" } as Record<number, string>;
export function progressNfl(save: NflSave) {
  const regular = save.games.filter((g) => !g.playoff);
  if (regular.some((g) => !g.result)) return;
  const po = save.games.filter((g) => g.playoff);
  const rows = nflRows(save);
  const sb = new Date(Date.UTC(save.seasonYear + 1, 1, 14)).toISOString().slice(0, 10);
  const lastSunday = regular.map((g) => g.date).sort().pop()!;
  const dateFor = (w: number) => (w === 22 ? addDays(sb, 364 * 0) : addDays(lastSunday, 7 * (w - 18) - 1));
  const seeds = { AFC: conferenceSeeds(save, "AFC", rows).slice(0, 7), NFC: conferenceSeeds(save, "NFC", rows).slice(0, 7) };
  const winnerOf = (g: NflGame) => (g.result!.hs > g.result!.as ? g.home : g.away);
  const mk = (week: number, conf: string, home: string, away: string, neutral = false) => save.games.push({ id: `PO${week}-${conf}-${home}`, week, date: dateFor(week), home, away, playoff: true, neutral, label: `${PO_WEEKS[week]}${conf ? " " + conf : ""}` });
  if (!po.length) {
    for (const conf of ["AFC", "NFC"] as const) { const s = seeds[conf]; mk(19, conf, s[1], s[6]); mk(19, conf, s[2], s[5]); mk(19, conf, s[3], s[4]); }
    save.version++;
    return;
  }
  const maxW = Math.max(...po.map((g) => g.week));
  const cur = po.filter((g) => g.week === maxW);
  if (cur.some((g) => !g.result) || maxW === 22) return;
  if (maxW === 21) {
    const a = winnerOf(cur.find((g) => g.label!.includes("AFC"))!), n = winnerOf(cur.find((g) => g.label!.includes("NFC"))!);
    mk(22, "", a, n, true);
  } else {
    for (const conf of ["AFC", "NFC"] as const) {
      const s = seeds[conf];
      const alive = cur.filter((g) => g.label!.endsWith(conf)).map(winnerOf);
      if (maxW === 19) alive.push(s[0]);
      alive.sort((a, b) => s.indexOf(a) - s.indexOf(b)); // reordenar por siembra
      if (alive.length === 4) { mk(20, conf, alive[0], alive[3]); mk(20, conf, alive[1], alive[2]); }
      else if (alive.length === 2) mk(21, conf, alive[0], alive[1]);
    }
  }
  save.version++;
}

export function nflChampion(save: NflSave): string | null {
  const sb = save.games.find((g) => g.week === 22 && g.result);
  return sb ? (sb.result!.hs > sb.result!.as ? sb.home : sb.away) : null;
}

// ===== Líderes =====
export function nflLeaders(save: NflSave) {
  const tot = new Map<string, Record<string, number>>();
  for (const g of save.games) {
    if (!g.result) continue;
    for (const [pid, l] of Object.entries(g.result.players)) {
      const t = tot.get(pid) ?? tot.set(pid, {}).get(pid)!;
      for (const [k, v] of Object.entries(l)) if (k !== "side" && typeof v === "number") t[k] = (t[k] ?? 0) + v;
      t.gp = (t.gp ?? 0) + 1;
    }
  }
  return tot;
}

export type { DraftPick };

// ===== Modo "mi equipo" =====
export function nflTeamSummary(save: NflSave, team: string): { lines: string[]; champion: boolean } {
  const rows = nflRows(save);
  const r = rows.get(team)!;
  const t = save.teams[team];
  const div = divisionStandings(save, rows)[`${t.conf} ${t.div}`];
  const lines = [`Récord ${r.w}-${r.l}${r.t ? `-${r.t}` : ""} · ${div.indexOf(team) + 1}º en la ${t.conf} ${t.div} · PF ${r.pf} / PC ${r.pa}`];
  const regDone = save.games.filter((g) => !g.playoff).every((g) => g.result);
  let champion = false;
  if (regDone) {
    const seeds = conferenceSeeds(save, t.conf, rows);
    const seed = seeds.indexOf(team) + 1;
    if (seed >= 1 && seed <= 7) {
      const po = save.games.filter((g) => g.playoff && (g.home === team || g.away === team) && g.result).sort((a, b) => a.week - b.week);
      const lost = po.find((g) => (g.home === team ? g.result!.hs < g.result!.as : g.result!.as < g.result!.hs));
      champion = nflChampion(save) === team;
      lines.push(`Playoffs como semilla #${seed}: ${champion ? "🏆 ¡CAMPEÓN DEL SUPER BOWL!" : lost ? `eliminado en ${lost.label}` : po.length ? `sigue vivo (${po[po.length - 1].label})` : seed === 1 ? "descansa en Wild Card" : "por jugar"}`);
    } else lines.push("No se clasificó a playoffs");
  }
  return { lines, champion };
}

export function recordNflCampaign(save: NflSave) {
  if (!save.userTeam) return;
  const s = nflTeamSummary(save, save.userTeam);
  save.myHistory = (save.myHistory ?? []).filter((h) => h.season !== save.seasonYear);
  save.myHistory.push({ season: save.seasonYear, team: save.userTeam, lines: s.lines, champion: s.champion });
}

export function simulateNflSeason(save: NflSave, onWeek?: (w: number) => void) {
  let w: number | null;
  let g = 0;
  while ((w = currentWeek(save)) !== null && g++ < 40) { playNflWeek(save, w); onWeek?.(w); }
}

export function nextTeamGame(save: NflSave, team: string) {
  return save.games.filter((g) => !g.result && (g.home === team || g.away === team)).sort((a, b) => a.week - b.week)[0];
}
