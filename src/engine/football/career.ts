// Partida nueva, archivo de temporada, fin de temporada (ascensos, envejecimiento, retiros, juveniles) y estadísticas.
import { Rng, clamp, addDays } from "../../lib/rng";
import type { Club, Fixture, FootballSave, Player, Pos, SeasonArchive } from "./types";
import { createSeason, leagueTable, seasonLabel, type FootballConfig } from "./season";

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
    comps: {}, fixtures: [], transfers: [], history: [], honours: {}, moneyMode: false, userClub: null,
    dataSource: data.players.meta, seed,
  };
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

export function makeYouth(club: Club, rng: Rng, year: number, idNum: number): Player {
  const pos = rng.pick(POS_POOL);
  const rep = club.reputation ?? 70;
  const ovr = clamp(Math.round(rng.normal(rep - 20, 4)), 42, 68);
  const pot = clamp(Math.round(ovr + rng.normal(18, 6) + (rep - 70) * 0.3), ovr + 4, 94);
  const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 5)), 20, 90);
  const age = rng.int(16, 18);
  const p: Player = {
    id: `y${year}_${idNum}`, name: `Juvenil ${club.short} ${idNum % 1000}`, shortName: `Juv. ${club.short} ${idNum % 1000}`, clubId: club.id, positions: [pos], age, birthYear: year - age,
    nationality: "—", foot: rng.chance(0.25) ? "Zurdo" : "Diestro", ovr, pot, pac: a(4), sho: a(pos === "DC" ? 2 : -10), pas: a(-2), dri: a(0), def: a(pos === "DFC" ? 4 : -20), phy: a(-4),
    pen: a(-10), fk: a(-14), hea: a(-8), crn: a(-12), youth: true, value: 100000,
  };
  if (pos === "POR") p.gk = { div: a(0), han: a(0), kic: a(-6), ref: a(1), pos: a(-2) };
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
  if (p.value !== undefined) p.value = Math.round(Math.pow(Math.max(0, p.ovr - 55), 2.6) * (p.age < 24 ? 900 : p.age > 30 ? 350 : 650) / 1000) * 1000;
}

export interface OffseasonReport { promoted: string[]; relegated: string[]; retired: string[]; youth: number; champions: Record<string, string> }

export function startNewSeason(save: FootballSave, cfg: FootballConfig): OffseasonReport {
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
  // Juveniles y relleno de plantillas
  let n = 0;
  for (const club of Object.values(save.clubs)) {
    const squad = Object.values(save.players).filter((p) => p.clubId === club.id && !p.retired);
    const want = Math.max(2, 24 - squad.length);
    const gks = squad.filter((p) => p.positions[0] === "POR").length;
    for (let i = 0; i < want; i++) {
      const y = makeYouth(club, rng, save.seasonYear + 1, ++n);
      if (i === 0 && gks < 3) { y.positions = ["POR"]; y.gk = { div: y.ovr, han: y.ovr - 1, kic: y.ovr - 6, ref: y.ovr + 1, pos: y.ovr - 2 }; }
      save.players[y.id] = y;
    }
    report.youth += want;
    if (club.lineup) club.lineup = { ...club.lineup, autoRotate: true };
  }
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
