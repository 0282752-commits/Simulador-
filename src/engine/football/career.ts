// Partida nueva, archivo de temporada, fin de temporada (ascensos, envejecimiento, retiros, juveniles) y estadísticas.
import { Rng, clamp, addDays } from "../../lib/rng";
import type { Club, Fixture, FootballSave, Player, Pos, SeasonArchive } from "./types";
import { createSeason, leagueTable, nextMatchDate, playDay, seasonFinished, seasonLabel, type FootballConfig } from "./season";
import { tieOutcome } from "./competitions";
import { ensureContracts, estimateValue as estValue, expireContracts, aiMarketDay, clubBudgetBase, fillSquadHoles, GROUP, GROUP_LIMITS, type Group } from "./market";
import { FIRST, LAST } from "./names";
import { clubStrength } from "./strength";

export interface FootballData {
  cfg: FootballConfig;
  clubs: { meta: { source: string; updated: string; demo: boolean }; clubs: Club[] };
  players: { meta: { source: string; updated: string; demo: boolean }; players: Player[] };
  europe?: Record<string, string[]>;
}

export function newFootballSave(data: FootballData, seed = Math.floor(Math.random() * 1e9)): FootballSave {
  const save: FootballSave = {
    mode: "futbol", version: 0, seasonYear: data.cfg.seasonYear, date: data.cfg.start,
    clubs: Object.fromEntries(data.clubs.clubs.map((c) => [c.id, structuredClone(c)])),
    players: Object.fromEntries(data.players.players.map((p) => [p.id, structuredClone(p)])),
    comps: {}, fixtures: [], transfers: [], history: [], honours: {}, moneyMode: true, userClub: null,
    dataSource: data.players.meta, seed,
  };
  ensureContracts(save);
  const rng = new Rng(seed + 5);
  fillSquadHoles(save, rng, (c, pos) => makeYouth(c, rng, save.seasonYear, 0, pos));
  createSeason(save, data.cfg, undefined, data.europe);
  return save;
}

// ===== Estadísticas =====
export interface PlayerSeasonStats { pid: string; club: string; apps: number; starts: number; min: number; g: number; a: number; yc: number; rc: number; cs: number; sh: number; sv: number; rating: number; og: number; pen: number; motm: number }

export function playerStats(save: FootballSave, compId?: string): Map<string, PlayerSeasonStats> {
  const out = new Map<string, PlayerSeasonStats>();
  for (const f of save.fixtures) {
    if (!f.result || (compId && f.comp !== compId)) continue;
    const r = f.result;
    let best: string | null = null, bestR = -1;
    for (const [pid, l] of Object.entries(r.players)) {
      if (l.min <= 0) continue;
      const s = out.get(pid) ?? out.set(pid, { pid, club: l.side === 0 ? f.home : f.away, apps: 0, starts: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0, cs: 0, sh: 0, sv: 0, rating: 0, og: 0, pen: 0, motm: 0 }).get(pid)!;
      s.apps++; s.min += l.min; s.g += l.g; s.a += l.a; s.yc += l.yc; s.rc += l.rc; s.sh += l.sh; s.sv += l.sv; s.og += l.og ?? 0;
      if (l.cs) s.cs++;
      s.rating += l.r;
      if (l.r > bestR) { bestR = l.r; best = pid; }
    }
    for (const e of r.events) if (e.type === "gol" && e.detail === "penal" && e.player && out.has(e.player)) out.get(e.player)!.pen++;
    if (best) out.get(best)!.motm++;
    // titulares = jugadores sin evento de entrada
    const subsIn = new Set(r.events.filter((e) => e.type === "cambio").map((e) => e.player));
    for (const pid of Object.keys(r.players)) if (!subsIn.has(pid) && out.has(pid)) out.get(pid)!.starts++;
  }
  for (const s of out.values()) s.rating = s.apps ? Math.round((s.rating / s.apps) * 100) / 100 : 0;
  return out;
}

// ===== Archivo y fin de temporada =====
export function archiveSeason(save: FootballSave): SeasonArchive {
  const season = seasonLabel(save.seasonYear);
  const arch: SeasonArchive = { season, tables: {}, winners: {}, topScorers: {} };
  for (const c of Object.values(save.comps)) {
    if (c.type === "liga") {
      arch.tables[c.id] = leagueTable(save, c.id).map((r) => ({ club: r.club, pts: r.pts, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga }));
      arch.winners[c.id] = arch.tables[c.id][0]?.club;
      arch.winners[c.id + ":runnerup"] = arch.tables[c.id][1]?.club;
    } else if (c.winner) {
      arch.winners[c.id] = c.winner;
      if (c.runnerUp) arch.winners[c.id + ":runnerup"] = c.runnerUp;
    }
    const st = [...playerStats(save, c.id).values()].filter((s) => s.g > 0).sort((a, b) => b.g - a.g || a.min - b.min).slice(0, 5);
    arch.topScorers[c.id] = st.map((s) => ({ player: s.pid, name: save.players[s.pid]?.name ?? "?", club: s.club, goals: s.g }));
    const w = arch.winners[c.id];
    if (w && c.type !== "playoff") (save.honours[w] ??= []).push({ comp: c.name, season });
  }
  save.history.push(arch);
  return arch;
}

const POS_POOL: Pos[] = ["POR", "DFC", "DFC", "LD", "LI", "MCD", "MC", "MC", "MCO", "ED", "EI", "DC"];

const NAT_POOL: Record<string, [string, string]> = { ENG: ["ENG", "Inglaterra"], ESP: ["ESP", "España"], ITA: ["ITA", "Italia"], GER: ["GER", "Alemania"], FRA: ["FRA", "Francia"], POR: ["POR", "Portugal"], NED: ["NED", "Países Bajos"] };
let youthSeq = 0;
// Canterano generado (ficticio): nombre según el país del club, nivel según el prestigio de la academia
export function makeYouth(club: Club, rng: Rng, year: number, _idNum = 0, pos: Pos = rng.pick(POS_POOL)): Player {
  const rep = club.reputation ?? 70;
  const [poolKey, natName] = NAT_POOL[club.country] ?? (rng.chance(0.5) ? ["GEN", "—"] : [rng.pick(["BRA", "ARG", "AFR"]), "—"]);
  const first = rng.pick(FIRST[poolKey] ?? FIRST.GEN), last = rng.pick(LAST[poolKey] ?? LAST.GEN);
  const age = rng.int(17, 19);
  const ovr = clamp(Math.round(rng.normal(rep - 19 + (age - 17) * 2, 3.5)), 45, 72);
  const pot = clamp(Math.round(ovr + rng.normal(14, 5) + (rep - 72) * 0.35), ovr + 3, 93);
  const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 4)), 20, 90);
  const ATT = ["DC", "SD", "ED", "EI"].includes(pos), DEF = ["DFC", "LD", "LI", "CAD", "CAI", "MCD"].includes(pos);
  const id = `y${year}_${club.id}_${++youthSeq}_${rng.int(0, 1e6)}`;
  const p: Player = {
    id, name: `${first} ${last}`, shortName: `${first[0]}. ${last}`, clubId: club.id, positions: [pos], age, birthYear: year - age,
    nationality: natName === "—" ? club.country : natName, foot: rng.chance(0.25) ? "Zurdo" : "Diestro", ovr, pot,
    pac: a(ATT ? 6 : 0), sho: a(ATT ? 2 : DEF ? -18 : -6), pas: a(DEF ? -6 : 0), dri: a(ATT ? 3 : -4), def: a(DEF ? 4 : -25), phy: a(-2),
    pen: a(-10), fk: a(-14), hea: a(pos === "DFC" || pos === "DC" ? 0 : -10), crn: a(-10), youth: true, value: estValue(ovr, age), contractEnd: year + 3,
  };
  if (pos === "POR") { p.gk = { div: a(1), han: a(0), kic: a(-6), ref: a(1), pos: a(-2) }; Object.assign(p, { pac: a(-30), sho: a(-50), def: a(-50) }); }
  return p;
}

function develop(p: Player, rng: Rng) {
  p.age++;
  let d: number;
  if (p.age <= 21) d = Math.max(0, (p.pot - p.ovr) * rng.next() * 0.45 + rng.normal(1, 1.5));
  else if (p.age <= 24) d = Math.max(-1, (p.pot - p.ovr) * rng.next() * 0.35 + rng.normal(0.5, 1.5));
  else if (p.age <= 28) d = rng.normal(0.2, 1.4);
  else if (p.age <= 30) d = rng.normal(-0.6, 1.3);
  else if (p.age <= 32) d = rng.normal(-1.8, 1.4);
  else d = rng.normal(-3, 1.6);
  d = Math.round(d);
  const ovr = clamp(p.ovr + d, 35, 95);
  const delta = ovr - p.ovr;
  p.ovr = ovr;
  p.pot = Math.max(p.pot, p.ovr);
  const adj = (v: number, k = 1) => clamp(Math.round(v + delta * k + rng.normal(0, 0.6)), 15, 99);
  const paceK = p.age >= 30 ? 1.6 : 1;
  p.pac = adj(p.pac, paceK); p.sho = adj(p.sho); p.pas = adj(p.pas, 0.8); p.dri = adj(p.dri); p.def = adj(p.def); p.phy = adj(p.phy, p.age >= 31 ? 1.2 : 1);
  p.pen = adj(p.pen, 0.5); p.fk = adj(p.fk, 0.5); p.hea = adj(p.hea, 0.7); p.crn = adj(p.crn, 0.5);
  if (p.gk) p.gk = { div: adj(p.gk.div), han: adj(p.gk.han), kic: adj(p.gk.kic, 0.6), ref: adj(p.gk.ref), pos: adj(p.gk.pos) };
  if (p.value !== undefined) p.value = estValue(p.ovr, p.age);
}

export interface OffseasonReport { promoted: string[]; relegated: string[]; retired: string[]; youth: number; champions: Record<string, string> }

export function startNewSeason(save: FootballSave, cfg: FootballConfig): OffseasonReport {
  recordMyCampaign(save);
  const arch = save.history[save.history.length - 1]?.season === seasonLabel(save.seasonYear) ? save.history[save.history.length - 1] : archiveSeason(save);
  const rng = new Rng(save.seed + save.seasonYear * 31);
  const report: OffseasonReport = { promoted: [], relegated: [], retired: [], youth: 0, champions: {} };
  for (const c of cfg.leagues) if (arch.winners[c.id]) report.champions[c.id] = arch.winners[c.id];
  // Ascensos y descensos
  for (const top of cfg.leagues.filter((l) => l.tier === 1)) {
    const second = cfg.leagues.find((l) => l.country === top.country && l.tier === 2);
    if (!second) continue;
    const t1 = arch.tables[top.id]?.map((r) => r.club) ?? [];
    const t2 = arch.tables[second.id]?.map((r) => r.club) ?? [];
    if (!t1.length || !t2.length) continue;
    const down = t1.slice(t1.length - top.relegation);
    const up = t2.slice(0, second.promotion);
    const po2 = save.comps[`PO_${second.id}`];
    if (po2?.winner) up.push(po2.winner);
    const po1 = save.comps[`PO_${top.id}`];
    if (po1?.winner) {
      const rel = t1[(top.relegationPlayoff ?? 16) - 1];
      if (po1.winner !== rel) { down.push(rel); up.push(po1.winner); }
    }
    for (const c of down) { save.clubs[c].leagueId = second.id; report.relegated.push(c); }
    for (const c of up) { save.clubs[c].leagueId = top.id; report.promoted.push(c); }
  }
  // Cesiones que terminan
  for (const p of Object.values(save.players)) {
    if (p.loanFrom) {
      save.transfers.push({ date: save.date, player: p.id, from: p.clubId, to: p.loanFrom, type: "fin_cesion" });
      p.clubId = p.loanFrom; p.loanFrom = null;
    }
  }
  // Desarrollo, retiros
  for (const p of Object.values(save.players)) {
    if (p.retired) continue;
    develop(p, rng);
    const retireP = p.age >= 38 ? 0.9 : p.age >= 36 ? 0.55 : p.age >= 35 ? 0.35 : p.age >= 34 ? 0.2 : p.age >= 33 ? 0.08 : 0;
    const lowF = p.ovr < 65 ? 1.4 : 1;
    if (rng.chance(retireP * lowF)) {
      p.retired = true;
      report.retired.push(p.id);
      save.transfers.push({ date: save.date, player: p.id, from: p.clubId, to: null, type: "retiro" });
      p.clubId = null;
    }
  }
  // Agentes libres: los veteranos o de bajo nivel que nadie fichó se retiran
  for (const p of Object.values(save.players)) {
    if (p.clubId || p.retired) continue;
    if (p.age >= 33 || p.ovr < 58 || (p.age >= 30 && rng.chance(0.4))) { p.retired = true; report.retired.push(p.id); }
  }
  // Contratos que terminan → agentes libres
  expireContracts(save, rng);
  // Prestigio: mezcla del anterior, la fuerza actual de la plantilla y los títulos de la temporada
  for (const c of Object.values(save.clubs)) {
    const titles = Object.entries(arch.winners).filter(([k, w]) => w === c.id && !k.includes(":")).length;
    const str = clubStrength(c.id, save.players);
    if (str > 0) c.reputation = Math.round((0.55 * (c.reputation ?? str) + 0.45 * str + Math.min(2, titles * 0.7)) * 10) / 10;
  }
  // Cantera: 0-2 canteranos por club según su academia, en la posición más necesitada
  let n = 0;
  for (const club of Object.values(save.clubs)) {
    const sq = Object.values(save.players).filter((p) => p.clubId === club.id && !p.retired);
    if (sq.length >= 30) continue;
    const k = (rng.chance(0.65) ? 1 : 0) + ((club.reputation ?? 70) >= 78 && rng.chance(0.35) ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const counts = (g: Group) => sq.filter((p) => GROUP[p.positions[0]] === g).length / GROUP_LIMITS[g][0];
      const g = (["POR", "DEF", "MED", "ATA"] as Group[]).sort((a, b) => counts(a) - counts(b))[0];
      const pos = rng.pick({ POR: ["POR"], DEF: ["DFC", "LD", "LI", "DFC"], MED: ["MC", "MCD", "MCO"], ATA: ["DC", "ED", "EI"] }[g] as Pos[]);
      const y = makeYouth(club, rng, save.seasonYear + 1, ++n, pos);
      save.players[y.id] = y; sq.push(y);
    }
    report.youth += k;
    if (club.lineup) club.lineup = { ...club.lineup, autoRotate: true };
  }
  // Presupuestos de la nueva temporada y mercado de verano (julio)
  for (const c of Object.values(save.clubs)) c.budget = Math.round(((c.budget ?? 0) * 0.5 + clubBudgetBase(c.reputation ?? 70)) / 1e5) * 1e5;
  save.date = `${save.seasonYear + 1}-07-01`;
  for (let k = 0; k < 30; k++) { aiMarketDay(save, rng); save.date = `${save.seasonYear + 1}-07-${String(1 + Math.floor(k / 1.1)).padStart(2, "0")}`; }
  fillSquadHoles(save, rng, (c, pos) => makeYouth(c, rng, save.seasonYear + 1, 0, pos));
  // Nueva temporada
  save.seasonYear++;
  for (const c of Object.values(save.clubs)) if (c.lineup) c.lineup.starters = c.lineup.starters.map((id) => (id && save.players[id]?.clubId === c.id ? id : null));
  createSeason(save, cfg, arch);
  void addDays;
  return report;
}

export function fixturesOfClub(save: FootballSave, clubId: string): Fixture[] {
  return save.fixtures.filter((f) => f.home === clubId || f.away === clubId);
}

export { estimateValue } from "./market";

// ===== Modo "mi equipo" =====
export interface CampaignLine { comp: string; name: string; status: string; won: boolean; done: boolean; pos?: number; record?: string }

export function teamCampaign(save: FootballSave, clubId: string): CampaignLine[] {
  const out: CampaignLine[] = [];
  for (const c of Object.values(save.comps)) {
    const fx = save.fixtures.filter((f) => f.comp === c.id && (f.home === clubId || f.away === clubId));
    if (!c.clubs.includes(clubId) && !fx.length) continue;
    const played = fx.filter((f) => f.result);
    let w = 0, d = 0, l = 0;
    for (const f of played) { const r = f.result!; const my = f.home === clubId ? r.hg : r.ag, ot = f.home === clubId ? r.ag : r.hg; if (my > ot) w++; else if (my < ot) l++; else d++; }
    const record = `${w}G ${d}E ${l}P`;
    const won = c.winner === clubId && !!c.done;
    if (c.type === "liga") {
      const t = leagueTable(save, c.id);
      const pos = t.findIndex((r) => r.club === clubId) + 1;
      const row = t[pos - 1];
      const zone = c.zones?.find((z) => pos >= z.from && pos <= z.to)?.label;
      out.push({ comp: c.id, name: c.name, pos, record, won: !!c.done && pos === 1, done: !!c.done, status: `${pos}º · ${row?.pts ?? 0} pts (${row?.pj ?? 0} PJ)${zone ? ` · ${zone}` : ""}${c.done && pos === 1 ? " · 🏆 CAMPEÓN" : ""}` });
      continue;
    }
    if (won) { out.push({ comp: c.id, name: c.name, status: "🏆 CAMPEÓN", won: true, done: true, record }); continue; }
    // eliminatorias: última ronda del club
    const ko = fx.filter((f) => f.tieId).sort((a, b) => a.stageIdx - b.stageIdx);
    const lastStage = ko.length ? ko[ko.length - 1].stageIdx : -1;
    let status = "";
    if (c.type === "europa") {
      const lp = leagueTable(save, c.id);
      const pos = lp.findIndex((r) => r.club === clubId) + 1;
      status = `Fase liga: ${pos}º`;
      const lpDone = save.fixtures.filter((f) => f.comp === c.id && f.stageIdx < 100).every((f) => f.result);
      if (lpDone && pos > 24) status += " · eliminado";
    }
    if (lastStage >= 0) {
      const legs = ko.filter((f) => f.stageIdx === lastStage);
      const stageName = legs[0].stage.replace(/ \((ida|vuelta)\)/, "");
      const o = tieOutcome(legs);
      if (!o) status += `${status ? " · " : ""}En ${stageName}`;
      else if (o.loser === clubId) status += `${status ? " · " : ""}Eliminado en ${stageName} por ${save.clubs[o.winner]?.name ?? "?"}`;
      else status += `${status ? " · " : ""}Pasa ${stageName}`;
    } else if (!status) status = c.clubs.includes(clubId) ? "Por empezar" : "—";
    out.push({ comp: c.id, name: c.name, status, won: false, done: !!c.done, record: played.length ? record : undefined });
  }
  return out;
}

export function recordMyCampaign(save: FootballSave) {
  const club = save.userClub;
  if (!club) return;
  const lines = teamCampaign(save, club);
  save.myHistory ??= [];
  const season = seasonLabel(save.seasonYear);
  save.myHistory = save.myHistory.filter((h) => h.season !== season);
  save.myHistory.push({ season, club, lines: lines.map((l) => `${l.name}: ${l.status}`), titles: lines.filter((l) => l.won).map((l) => l.name) });
}

// Simula todo lo pendiente de la temporada (todas las competiciones a la vez)
export function simulateRestOfSeason(save: FootballSave, cfg: FootballConfig, onDay?: (date: string) => void) {
  let d: string | null;
  let guard = 0;
  while ((d = nextMatchDate(save)) && guard++ < 500) { playDay(save, d, cfg); onDay?.(d); }
  return seasonFinished(save);
}

// Próxima fecha con partido del club
export function nextClubMatch(save: FootballSave, clubId: string) {
  return save.fixtures.filter((f) => !f.result && (f.home === clubId || f.away === clubId)).sort((a, b) => a.date.localeCompare(b.date))[0];
}
