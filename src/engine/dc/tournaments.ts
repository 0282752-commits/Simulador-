// Torneos DC simultáneos con calendario común, clasificación y ranking histórico.
import { Rng } from "../../lib/rng";
import { Battle, overall, type BattleSide } from "./battle";
import type { BattleResult, DcCharacter, DcMatch, DcSave, DcTeam, DcTournament, Synergy, TournamentFormat } from "./types";

export interface DcData { characters: DcCharacter[]; teams: DcTeam[]; synergies: Synergy[]; scale: string }

export function newDcSave(data: DcData, seed = Math.floor(Math.random() * 1e9)): DcSave {
  return {
    mode: "dc", version: 0, day: 1,
    characters: Object.fromEntries(data.characters.map((c) => [c.id, structuredClone(c)])),
    teams: Object.fromEntries(data.teams.map((t) => [t.id, structuredClone(t)])),
    synergies: structuredClone(data.synergies), tournaments: [], matches: [], randomness: 0.5, seed,
    dataSource: { source: data.scale, updated: new Date().toISOString().slice(0, 10), demo: false },
  };
}

// Integrantes que pelean: los primeros N del equipo (el orden se edita en la app)
export function lineupOf(save: DcSave, teamId: string, size: number): string[] {
  const t = save.teams[teamId];
  return (t?.members ?? []).filter((id) => save.characters[id]).slice(0, size);
}
export function teamPower(save: DcSave, teamId: string, size: number): number {
  const l = lineupOf(save, teamId, size);
  return l.length ? l.reduce((a, id) => a + overall(save.characters[id]), 0) / l.length : 0;
}

export function sidesFor(save: DcSave, m: DcMatch): BattleSide[] {
  const t = save.tournaments.find((x) => x.id === m.tournament)!;
  return m.sides.map((sid, i) => ({ id: sid, name: save.teams[sid]?.name ?? sid, members: (m.lineups?.[i] ?? lineupOf(save, sid, t.teamSize)).map((id) => save.characters[id]).filter(Boolean) }));
}

export function simulateDcMatch(save: DcSave, m: DcMatch, rng = new Rng()): { result: BattleResult; duels?: DcMatch["duels"] } {
  const t = save.tournaments.find((x) => x.id === m.tournament)!;
  if (t.format === "equipos") {
    const [A, B] = sidesFor(save, m);
    const duels: NonNullable<DcMatch["duels"]> = [];
    let wa = 0, wb = 0;
    const n = Math.min(A.members.length, B.members.length);
    for (let i = 0; i < n; i++) {
      const b = new Battle([{ ...A, members: [A.members[i]] }, { ...B, members: [B.members[i]] }], save.synergies, t.randomness, rng.int(1, 2 ** 30));
      const r = b.runToEnd();
      duels.push({ a: A.members[i].id, b: B.members[i].id, result: r });
      if (r.winner === 0) wa++; else if (r.winner === 1) wb++;
    }
    const fighters = duels.flatMap((d) => d.result!.fighters);
    const winner = wa > wb ? 0 : wb > wa ? 1 : -1;
    return { result: { winner, rounds: duels.length, fighters, koOrder: duels.flatMap((d) => d.result!.koOrder), mvp: fighters.filter((f) => f.side === winner).sort((x, y) => y.dmg - x.dmg)[0]?.id }, duels };
  }
  const b = new Battle(sidesFor(save, m), save.synergies, t.randomness, rng.int(1, 2 ** 30));
  return { result: b.runToEnd() };
}

// ===== Creación =====
function rr(ids: string[]): [string, string][][] {
  const a = [...ids];
  if (a.length % 2) a.push("__BYE__");
  const n = a.length, rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x !== "__BYE__" && y !== "__BYE__") round.push(r % 2 ? [y, x] : [x, y]); }
    rounds.push(round);
    a.splice(1, 0, a.pop()!);
  }
  return rounds;
}

export interface NewTournament { name: string; format: TournamentFormat; teamSize: number; participants: string[]; startDay: number; gap: number; randomness: number }

export function createTournament(save: DcSave, o: NewTournament): DcTournament {
  const id = `t${save.tournaments.length + 1}_${Date.now().toString(36).slice(-4)}`;
  const rng = new Rng(save.seed + save.tournaments.length);
  const t: DcTournament = { id, name: o.name, format: o.format, teamSize: o.teamSize, participants: [...o.participants], startDay: o.startDay, gap: Math.max(1, o.gap), randomness: o.randomness };
  save.tournaments.push(t);
  const seeded = [...o.participants].sort((a, b) => teamPower(save, b, o.teamSize) - teamPower(save, a, o.teamSize));
  const push = (stage: string, stageIdx: number, day: number, sides: string[], group?: string) =>
    save.matches.push({ id: `${id}-${stageIdx}-${save.matches.length}`, tournament: id, day, stage, stageIdx, sides, group, lineups: sides.map((s) => lineupOf(save, s, o.teamSize)) });
  if (o.format === "liga" || o.format === "equipos") {
    rr(rng.shuffle([...o.participants])).forEach((round, r) => round.forEach((p) => push(`Jornada ${r + 1}`, r, o.startDay + r * t.gap, p)));
  } else if (o.format === "royale") {
    push("Battle royale", 0, o.startDay, rng.shuffle([...o.participants]));
  } else if (o.format === "eliminacion") {
    koRound(save, t, seeded, 0, o.startDay, push);
  } else if (o.format === "grupos") {
    const nG = Math.max(2, Math.round(o.participants.length / 4));
    const groups: Record<string, string[]> = {};
    seeded.forEach((p, i) => { const g = String.fromCharCode(65 + (Math.floor(i / nG) % 2 === 0 ? i % nG : nG - 1 - (i % nG))); (groups[g] ??= []).push(p); });
    t.groups = groups;
    for (const [g, ids] of Object.entries(groups)) rr(ids).forEach((round, r) => round.forEach((p) => push(`Grupo ${g} · J${r + 1}`, r, o.startDay + r * t.gap, p, g)));
  }
  save.version++;
  return t;
}

const KO_NAMES = (n: number) => ({ 2: "Final", 4: "Semifinales", 8: "Cuartos de final", 16: "Octavos de final", 32: "Dieciseisavos" } as Record<number, string>)[n] ?? `Ronda de ${n}`;

function koRound(save: DcSave, t: DcTournament, seeded: string[], stageIdx: number, day: number, push: (stage: string, stageIdx: number, day: number, sides: string[]) => void) {
  let P = 1; while (P < seeded.length) P *= 2;
  // posiciones de siembra estándar
  let order = [1];
  while (order.length < P) { const m = order.length * 2 + 1; order = order.flatMap((x) => [x, m - x]); }
  const slots = order.map((s) => seeded[s - 1] ?? null);
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i], b = slots[i + 1];
    if (a && b) push(KO_NAMES(P), stageIdx, day, [a, b]);
    else if (a || b) save.matches.push({ id: `${t.id}-${stageIdx}-bye-${i}`, tournament: t.id, day, stage: KO_NAMES(P) + " (pase directo)", stageIdx, sides: [(a ?? b)!], result: { winner: 0, rounds: 0, fighters: [], koOrder: [] } });
  }
}

// ===== Clasificación =====
export interface DcRow { team: string; pj: number; w: number; d: number; l: number; pts: number; kf: number; ka: number; dmg: number }
export function standings(save: DcSave, tId: string, group?: string): DcRow[] {
  const t = save.tournaments.find((x) => x.id === tId)!;
  const ids = group ? t.groups![group] : t.participants;
  const rows = new Map(ids.map((id) => [id, { team: id, pj: 0, w: 0, d: 0, l: 0, pts: 0, kf: 0, ka: 0, dmg: 0 }]));
  for (const m of save.matches) {
    if (m.tournament !== tId || !m.result || m.sides.length !== 2 || (group && m.group !== group) || m.stage.includes("pase directo")) continue;
    if (!group && t.format === "grupos") continue;
    const [a, b] = m.sides.map((s) => rows.get(s));
    if (!a || !b) continue;
    a.pj++; b.pj++;
    const r = m.result;
    if (r.winner === 0) { a.w++; b.l++; a.pts += 3; } else if (r.winner === 1) { b.w++; a.l++; b.pts += 3; } else { a.d++; b.d++; a.pts++; b.pts++; }
    for (const f of r.fighters) { const row = f.side === 0 ? a : b, other = f.side === 0 ? b : a; row.kf += f.kos; row.dmg += f.dmg; other.ka += f.kos; }
  }
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.kf - y.ka) - (x.kf - x.ka) || y.dmg - x.dmg);
}

// ===== Progresión =====
export function progressDc(save: DcSave) {
  for (const t of save.tournaments) {
    if (t.done) continue;
    const ms = save.matches.filter((m) => m.tournament === t.id);
    if (ms.some((m) => !m.result)) continue;
    const push = (stage: string, stageIdx: number, day: number, sides: string[]) => save.matches.push({ id: `${t.id}-${stageIdx}-${save.matches.length}`, tournament: t.id, day, stage, stageIdx, sides, lineups: sides.map((s) => lineupOf(save, s, t.teamSize)) });
    const lastDay = Math.max(...ms.map((m) => m.day));
    if (t.format === "liga" || t.format === "equipos") {
      const st = standings(save, t.id);
      finish(t, st.map((r) => r.team));
    } else if (t.format === "royale") {
      const m = ms[0];
      const r = m.result!;
      // orden de eliminación por bandos
      const sideOut: number[] = [];
      for (const id of r.koOrder) {
        const f = r.fighters.find((x) => x.id === id)!;
        const allOut = r.fighters.filter((x) => x.side === f.side).every((x) => r.koOrder.indexOf(x.id) >= 0 && r.koOrder.indexOf(x.id) <= r.koOrder.indexOf(id));
        if (allOut && !sideOut.includes(f.side)) sideOut.push(f.side);
      }
      const remaining = m.sides.map((_, i) => i).filter((i) => !sideOut.includes(i)).sort((a, b) => (a === r.winner ? -1 : b === r.winner ? 1 : 0));
      finish(t, [...remaining, ...sideOut.reverse()].map((i) => m.sides[i]));
    } else {
      const koMs = ms.filter((m) => !m.group);
      if (t.format === "grupos" && !koMs.length) {
        const gs = Object.keys(t.groups!).sort();
        const q = gs.map((g) => standings(save, t.id, g).slice(0, 2).map((r) => r.team));
        const pairs: string[][] = [];
        for (let i = 0; i < gs.length; i += 2) {
          const A = q[i], B = q[i + 1] ?? q[0];
          pairs.push([A[0], B[1]], [B[0], A[1]]);
        }
        pairs.forEach((p) => push(KO_NAMES(pairs.length * 2), 100, lastDay + t.gap, p));
        save.version++;
        continue;
      }
      const maxIdx = Math.max(...koMs.map((m) => m.stageIdx));
      const cur = koMs.filter((m) => m.stageIdx === maxIdx);
      const winners = cur.map((m) => m.sides[m.result!.winner >= 0 ? m.result!.winner : 0]);
      if (winners.length === 1) {
        const final = cur[0];
        const loser = final.sides.find((s) => s !== winners[0]);
        const place: string[] = [winners[0], ...(loser ? [loser] : [])];
        // resto por ronda de eliminación
        for (let idx = maxIdx - 1; idx >= Math.min(...koMs.map((m) => m.stageIdx)); idx--) {
          for (const m of koMs.filter((x) => x.stageIdx === idx && x.sides.length === 2)) { const l = m.sides[m.result!.winner === 0 ? 1 : 0]; if (!place.includes(l)) place.push(l); }
        }
        if (t.format === "grupos") for (const p of t.participants) if (!place.includes(p)) place.push(p);
        finish(t, place);
      } else {
        for (let i = 0; i < winners.length; i += 2) push(KO_NAMES(winners.length), maxIdx + 1, lastDay + t.gap, [winners[i], winners[i + 1]]);
      }
    }
    save.version++;
  }
}

function finish(t: DcTournament, order: string[]) {
  t.done = true;
  t.winner = order[0];
  t.placements = Object.fromEntries(order.map((id, i) => [id, i + 1]));
}

export function nextDcDay(save: DcSave): number | null {
  const p = save.matches.filter((m) => !m.result);
  return p.length ? Math.min(...p.map((m) => m.day)) : null;
}

export function playDcDay(save: DcSave, day: number, skip?: (m: DcMatch) => boolean) {
  const rng = new Rng(save.seed + day * 101 + save.version);
  for (const m of save.matches.filter((x) => x.day === day && !x.result && !skip?.(x))) {
    const { result, duels } = simulateDcMatch(save, m, rng);
    m.result = result;
    if (duels) m.duels = duels;
  }
  save.day = day;
  save.version++;
  progressDc(save);
}

export function setDcResult(save: DcSave, matchId: string, result: BattleResult | undefined) {
  const m = save.matches.find((x) => x.id === matchId);
  if (!m) return;
  m.result = result;
  const t = save.tournaments.find((x) => x.id === m.tournament)!;
  // rehacer rondas posteriores sin jugar
  const later = save.matches.filter((x) => x.tournament === t.id && x.stageIdx > m.stageIdx && (m.group ? !x.group : true));
  if (later.length && later.every((x) => !x.result || x.stage.includes("pase directo")) && t.format !== "liga" && t.format !== "equipos") {
    save.matches = save.matches.filter((x) => !later.includes(x) || x.stage.includes("pase directo") && x.stageIdx === 0);
  }
  t.done = false; t.winner = undefined; t.placements = undefined;
  save.version++;
  progressDc(save);
}

// ===== Ranking histórico (derivado de todos los resultados) =====
export interface RankEntry { id: string; pts: number; battles: number; wins: number; kos: number; titles: number; dmg: number }
const PLACE_PTS = [30, 18, 10, 10, 5, 5, 5, 5];

export function rankings(save: DcSave): { characters: RankEntry[]; teams: RankEntry[] } {
  const ch = new Map<string, RankEntry>(), tm = new Map<string, RankEntry>();
  const get = (m: Map<string, RankEntry>, id: string) => m.get(id) ?? m.set(id, { id, pts: 0, battles: 0, wins: 0, kos: 0, titles: 0, dmg: 0 }).get(id)!;
  for (const m of save.matches) {
    if (!m.result || m.stage.includes("pase directo")) continue;
    const r = m.result;
    m.sides.forEach((sid, i) => {
      const e = get(tm, sid);
      e.battles++;
      if (r.winner === i) { e.wins++; e.pts += m.sides.length > 2 ? 10 : 3; } else if (r.winner === -1) e.pts += 1;
    });
    for (const f of r.fighters) {
      const e = get(ch, f.id);
      e.battles++; e.kos += f.kos; e.dmg += f.dmg; e.pts += f.kos;
      if (r.winner === f.side) { e.wins++; e.pts += m.sides.length > 2 ? 10 : 3; } else if (r.winner === -1) e.pts += 1;
      const tSide = m.sides[f.side];
      if (tSide) get(tm, tSide).kos += f.kos;
    }
    if (r.mvp) get(ch, r.mvp).pts += 2;
  }
  for (const t of save.tournaments) {
    if (!t.done || !t.placements) continue;
    for (const [team, place] of Object.entries(t.placements)) {
      const p = PLACE_PTS[place - 1] ?? 1;
      const e = get(tm, team);
      e.pts += p;
      if (place === 1) e.titles++;
      const used = new Set(save.matches.filter((m) => m.tournament === t.id).flatMap((m) => m.sides.flatMap((s, i) => (s === team ? m.lineups?.[i] ?? [] : []))));
      for (const c of used) { const ce = get(ch, c); ce.pts += p; if (place === 1) ce.titles++; }
    }
  }
  const sort = (m: Map<string, RankEntry>) => [...m.values()].sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  return { characters: sort(ch), teams: sort(tm) };
}

export { overall };
