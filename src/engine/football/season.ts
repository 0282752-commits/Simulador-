// Temporada de fútbol: creación, calendario unificado, avance por días, condiciones derivadas.
import { Rng, addDays, clamp, daysBetween, dayOfWeek } from "../../lib/rng";
import type { Club, Competition, Fixture, FootballSave, KoInfo, KoStage, MatchResult, Player, SeasonArchive } from "./types";
import { computeRows, roundName, roundRobin, scheduleRounds, sortTable, swissDraw, tieOutcome, UEFA_TIEBREAKERS, type Row } from "./competitions";
import { ensureLineup, squadOf, type Availability } from "./lineup";
import { FootballMatch, type MatchOptions, type MatchTeamInput } from "./match";

// ===== Configuración (data/football/competitions.json) =====
export interface LeagueCfg {
  id: string; name: string; short: string; country: string; tier: number; teams: number; csvNames: string[];
  tiebreakers: string[]; relegation: number; promotion: number; europe?: { ucl: number; uel: number; uecl: number };
  cup?: string; leagueCup?: string; playoff?: { type: string; places: number[] }; relegationPlayoff?: number; promotionPlayoff?: number;
  promotionPlayoffL2?: number[]; verified?: boolean; notes?: string;
}
export interface CupCfg {
  id: string; name: string; short: string; country: string; leagues: string[]; rounds: string[]; twoLegSemis?: boolean; semiSecondLeg?: string;
  noExtraTime?: boolean; hostLowerTier?: boolean; finalNeutral?: boolean; semisNeutral?: boolean; verified?: boolean; notes?: string;
}
export interface SuperCfg { id: string; name: string; country: string; size: 2 | 4; date?: string; dates?: string[]; noExtraTime?: boolean; neutral?: boolean; from: string[]; verified?: boolean }
export interface EuroCfg { id: string; name: string; short: string; teams: number; pots: number; matches: number; leagueDates: string[]; koDates: Record<string, string[] | string> }
export interface FootballConfig {
  season: string; seasonYear: number; start: string; end: string; datesNote: string; internationalBreaks: string[];
  leagueWindows: Record<string, [string, string]>; leagues: LeagueCfg[]; cups: CupCfg[]; supercups: SuperCfg[]; europe: EuroCfg[];
  europeCountryCap: number; otherCountries: string[];
}

export const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

// Desplaza las fechas de la plantilla (2026/27) a otra temporada conservando el día de la semana.
function shift(cfg: FootballConfig, year: number) {
  const k = year - cfg.seasonYear;
  return (d: string) => addDays(d, 364 * k);
}

export { clubStrength, invalidateStrength } from "./strength";
import { clubStrength, invalidateStrength } from "./strength";
import { aiMarketDay } from "./market";

// ===== Índice de condiciones (cansancio, forma, lesiones, sanciones) =====
interface App { date: string; comp: string; fid: string; club: string; min: number; r: number; yc: number; rc: number; inj?: number }

export class ConditionIndex {
  apps = new Map<string, App[]>();
  clubFx = new Map<string, Fixture[]>();
  version = -1;
  constructor(save: FootballSave) {
    const done = save.fixtures.filter((f) => f.result).sort((a, b) => a.date.localeCompare(b.date));
    for (const f of done) this.add(f);
    this.version = save.version;
  }
  add(f: Fixture) {
    const r = f.result!;
    for (const [pid, l] of Object.entries(r.players)) {
      const arr = this.apps.get(pid) ?? this.apps.set(pid, []).get(pid)!;
      arr.push({ date: f.date, comp: f.comp, fid: f.id, club: l.side === 0 ? f.home : f.away, min: l.min, r: l.r, yc: l.yc, rc: l.rc, inj: l.inj });
    }
    for (const c of [f.home, f.away]) (this.clubFx.get(c) ?? this.clubFx.set(c, []).get(c)!).push(f);
  }
  fitness(pid: string, date: string): number {
    const a = this.apps.get(pid);
    if (!a) return 100;
    let load = 0;
    for (let i = a.length - 1; i >= 0; i--) {
      const d = daysBetween(a[i].date, date);
      if (d <= 0) continue;
      if (d > 12) break;
      load += 32 * (a[i].min / 90) * Math.exp(-d / 2.3);
    }
    return clamp(Math.round(100 - load), 35, 100);
  }
  form(pid: string, date: string): number {
    const a = (this.apps.get(pid) ?? []).filter((x) => x.date < date && x.min >= 20).slice(-5);
    if (!a.length) return 0;
    const avg = a.reduce((s, x) => s + x.r, 0) / a.length;
    return clamp(Math.round((avg - 6.6) * 20) / 10, -2, 2);
  }
  injury(pid: string, date: string): string | null {
    const a = this.apps.get(pid);
    if (!a) return null;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i].date >= date || !a[i].inj) continue;
      const until = addDays(a[i].date, a[i].inj!);
      if (until > date) return until;
    }
    return null;
  }
  // partidos de sanción pendientes para el jugador en la competición antes de la fecha
  suspension(pid: string, clubId: string, comp: Competition, date: string): number {
    const fx = (this.clubFx.get(clubId) ?? []).filter((f) => f.comp === comp.id && f.date < date);
    if (!fx.length) return 0;
    const europe = comp.type === "europa";
    const league = comp.type === "liga";
    let pending = 0, yellows = 0;
    for (const f of fx) {
      const l = f.result!.players[pid];
      if (pending > 0) { pending--; if (!l) continue; }
      if (!l) continue;
      if (l.rc) { pending += 1; if (l.yc >= 2) continue; }
      if (l.yc) {
        const before = yellows;
        yellows += l.yc;
        if (league && Math.floor(yellows / 5) > Math.floor(before / 5)) pending += 1;
        if (europe) {
          const th = (y: number) => (y >= 3 ? 1 + Math.floor((y - 3) / 2) : 0);
          pending += th(yellows) - th(before);
        }
      }
    }
    return pending;
  }
  morale(clubId: string, date: string): number {
    const fx = (this.clubFx.get(clubId) ?? []).filter((f) => f.date < date).slice(-5);
    if (!fx.length) return 0;
    let pts = 0;
    for (const f of fx) {
      const r = f.result!;
      const my = f.home === clubId ? r.hg : r.ag, ot = f.home === clubId ? r.ag : r.hg;
      pts += my > ot ? 3 : my === ot ? 1 : 0;
    }
    return clamp(Math.round(((pts / fx.length) - 1.5) * 8) / 10, -1.2, 1.2);
  }
  playerApps(pid: string) { return this.apps.get(pid) ?? []; }
}

const idxCache = new WeakMap<FootballSave, ConditionIndex>();
export function getIndex(save: FootballSave): ConditionIndex {
  let idx = idxCache.get(save);
  if (!idx || idx.version !== save.version) { idx = new ConditionIndex(save); idxCache.set(save, idx); }
  return idx;
}

export interface PlayerStatus { ok: boolean; fitness: number; form: number; injuredUntil: string | null; suspended: number }
export function playerStatus(save: FootballSave, pid: string, date: string, comp?: Competition): PlayerStatus {
  const idx = getIndex(save);
  const p = save.players[pid];
  const injuredUntil = idx.injury(pid, date);
  const suspended = comp && p?.clubId ? idx.suspension(pid, p.clubId, comp, date) : 0;
  return { ok: !injuredUntil && suspended === 0, fitness: idx.fitness(pid, date), form: idx.form(pid, date), injuredUntil, suspended };
}

export function availability(save: FootballSave, idx: ConditionIndex, clubId: string, comp: Competition, date: string): Availability {
  void save;
  return (id: string) => {
    const inj = idx.injury(id, date);
    const sus = idx.suspension(id, clubId, comp, date);
    return { ok: !inj && !sus, fitness: idx.fitness(id, date), form: idx.form(id, date) };
  };
}

// ===== Construcción de partidos =====
export function squadsMap(save: FootballSave): Map<string, Player[]> {
  const m = new Map<string, Player[]>();
  for (const p of Object.values(save.players)) if (p.clubId && !p.retired) (m.get(p.clubId) ?? m.set(p.clubId, []).get(p.clubId)!).push(p);
  return m;
}

export function matchInputs(save: FootballSave, f: Fixture, idx = getIndex(save), squads?: Map<string, Player[]>): { home: MatchTeamInput; away: MatchTeamInput; opts: MatchOptions } {
  const comp = save.comps[f.comp];
  const mk = (clubId: string): MatchTeamInput => {
    const club = save.clubs[clubId];
    const av = availability(save, idx, clubId, comp, f.date);
    const squad = squads?.get(clubId) ?? squadOf(clubId, save.players);
    const lineup = ensureLineup(club, squad, av);
    const morale = idx.morale(clubId, f.date);
    return {
      id: club.id, name: club.name, short: club.short, colors: club.colors, lineup,
      squad,
      cond: (id) => ({ fitness: idx.fitness(id, f.date), form: idx.form(id, f.date), morale }),
    };
  };
  const opts: MatchOptions = { neutral: f.neutral, seed: Math.floor(Math.random() * 2 ** 31) };
  if (f.tieId) {
    const legs = save.fixtures.filter((x) => x.tieId === f.tieId);
    const isLast = legs.length === 1 || f.leg === 2;
    if (isLast) {
      opts.knockout = true;
      opts.noExtraTime = f.noExtraTime;
      if (f.leg === 2) {
        const l1 = legs.find((x) => x.leg === 1);
        if (l1?.result) opts.firstLeg = [l1.result.ag, l1.result.hg];
      }
    }
  }
  return { home: mk(f.home), away: mk(f.away), opts };
}

export function simulateFixture(save: FootballSave, f: Fixture, idx?: ConditionIndex, squads?: Map<string, Player[]>): MatchResult {
  const { home, away, opts } = matchInputs(save, f, idx, squads);
  return new FootballMatch(home, away, opts).runToEnd();
}

// ===== Creación de temporada =====
function weekendsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  let d = a;
  while (dayOfWeek(d) !== 6) d = addDays(d, 1);
  for (; d <= b; d = addDays(d, 7)) out.push(d);
  return out;
}

function pickSpread<T>(arr: T[], n: number): T[] {
  if (n >= arr.length) return [...arr];
  if (n <= 0) return [];
  if (n === 1) return [arr[Math.floor(arr.length / 2)]];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

function leagueRoundDates(cfg: FootballConfig, lg: LeagueCfg, year: number, reserved: Set<string>): string[] {
  const sh = shift(cfg, year);
  const [a, b] = cfg.leagueWindows[String(lg.tier)].map(sh);
  const breaks = new Set(cfg.internationalBreaks.map(sh));
  const winterBreak = lg.country === "GER" || lg.country === "FRA";
  let sats = weekendsBetween(a, b).filter((d) => !breaks.has(d));
  if (winterBreak) sats = sats.filter((d) => !(d.slice(5) >= "12-24" || d.slice(5) <= "01-08"));
  const rounds = 2 * (lg.teams - 1);
  if (sats.length >= rounds) return pickSpread(sats, rounds);
  // faltan fechas: jornadas entre semana (martes/miércoles sin competiciones europeas ni copas cerca)
  const need = rounds - sats.length;
  const collect = (minGap: number, strict: boolean) => {
    const mids: string[] = [];
    for (let d = addDays(a, 10); d <= addDays(b, -3); d = addDays(d, 1)) {
      const w = dayOfWeek(d);
      if (w !== 2 && w !== 3 && !(lg.country === "ENG" && (d.slice(5) === "12-26" || d.slice(5) === "01-01"))) continue;
      if ([-1, 0, 1].some((k) => reserved.has(addDays(d, k)))) continue;
      if (strict && [-2, 2].some((k) => reserved.has(addDays(d, k)))) continue;
      if (breaks.has(addDays(d, 3)) || breaks.has(addDays(d, -4))) continue;
      if (mids.length && daysBetween(mids[mids.length - 1], d) < minGap) continue;
      mids.push(d);
    }
    return mids;
  };
  let mids = collect(6, true);
  if (mids.length < need) mids = collect(6, false);
  if (mids.length < need) mids = collect(3, false);
  if (mids.length < need) {
    // último recurso: cualquier martes libre de la liga (los choques se aplazan al simular)
    const used = new Set([...sats, ...mids]);
    for (let d = addDays(a, 3); d <= b && mids.length < need; d = addDays(d, 7)) {
      let t = d;
      while (dayOfWeek(t) !== 2) t = addDays(t, 1);
      if (!used.has(t)) { mids.push(t); used.add(t); }
    }
    mids.sort();
  }
  const chosen = pickSpread(mids, need);
  return [...sats, ...chosen].sort();
}

function addLeagueFixtures(save: FootballSave, comp: Competition, dates: string[], rng: Rng) {
  const rounds = roundRobin(comp.clubs, rng);
  rounds.forEach((round, i) => {
    const base = dates[i] ?? dates[dates.length - 1];
    const weekend = dayOfWeek(base) === 6;
    round.forEach(([h, a], k) => {
      const date = weekend && k % 2 === 1 ? addDays(base, 1) : base;
      save.fixtures.push({ id: `${comp.id}-${i + 1}-${k}`, comp: comp.id, stage: `Jornada ${i + 1}`, stageIdx: i, date, home: h, away: a });
    });
  });
}

function tierOf(save: FootballSave, clubId: string): number {
  const c = save.clubs[clubId];
  return c.leagueId ? save.comps[c.leagueId]?.tier ?? 3 : 3;
}

// Crea las eliminatorias de una ronda.
function createTies(save: FootballSave, comp: Competition, stageIdx: number, stage0: KoStage, pairs: [string, string][]) {
  const ko = comp.ko!;
  // si la fecha prevista ya pasó, se retrasa la ronda
  let stage = stage0;
  if (stage.dates[0] <= save.date && save.fixtures.some((f) => f.result)) {
    const off = daysBetween(stage.dates[0], save.date) + 3;
    stage = { ...stage, dates: stage.dates.map((d) => addDays(d, off)) };
  }
  pairs.forEach(([a, b], k) => {
    const tieId = `${comp.id}-T${stageIdx}-${k}`;
    if (stage.dates.length === 2) {
      // a = mejor cabeza de serie: juega la vuelta en casa
      save.fixtures.push({ id: `${tieId}-1`, comp: comp.id, stage: stage.name + " (ida)", stageIdx, date: stage.dates[0], home: b, away: a, tieId, leg: 1 });
      save.fixtures.push({ id: `${tieId}-2`, comp: comp.id, stage: stage.name + " (vuelta)", stageIdx, date: stage.dates[1], home: a, away: b, tieId, leg: 2, noExtraTime: stage.noET });
    } else {
      let [h, aw] = [a, b];
      if (ko.hostLower && !stage.neutral && tierOf(save, b) > tierOf(save, a)) [h, aw] = [b, a];
      save.fixtures.push({ id: `${tieId}-1`, comp: comp.id, stage: stage.name, stageIdx, date: stage.dates[0], home: h, away: aw, tieId, neutral: stage.neutral, noExtraTime: stage.noET });
    }
  });
}

function stageTies(save: FootballSave, comp: string, stageIdx: number): Fixture[][] {
  const fx = save.fixtures.filter((f) => f.comp === comp && f.stageIdx === stageIdx && f.tieId);
  const byTie = new Map<string, Fixture[]>();
  for (const f of fx) (byTie.get(f.tieId!) ?? byTie.set(f.tieId!, []).get(f.tieId!)!).push(f);
  return [...byTie.entries()].sort((a, b) => Number(a[0].split("-").pop()) - Number(b[0].split("-").pop())).map(([, legs]) => legs.sort((x, y) => (x.leg ?? 1) - (y.leg ?? 1)));
}

function setupCup(save: FootballSave, cfg: CupCfg, year: number, base: FootballConfig, rng: Rng) {
  const sh = shift(base, year);
  const clubs = cfg.leagues.flatMap((l) => save.comps[l]?.clubs ?? []);
  const n = clubs.length;
  let P = 1;
  while (P * 2 <= n) P *= 2;
  const nRounds = Math.log2(P);
  const dates = cfg.rounds.map(sh);
  const mainDates = dates.slice(-nRounds);
  const stages: KoStage[] = [];
  const prelim = n > P;
  if (prelim) stages.push({ name: "Ronda previa", dates: [dates[Math.max(0, dates.length - nRounds - 1)]], noET: cfg.noExtraTime });
  for (let r = 0; r < nRounds; r++) {
    const teams = P / 2 ** r;
    const isFinal = teams === 2, isSemi = teams === 4;
    const st: KoStage = { name: roundName(teams), dates: [mainDates[r]], noET: cfg.noExtraTime && !isFinal, neutral: (isFinal && cfg.finalNeutral) || (isSemi && cfg.semisNeutral) };
    if (isSemi && cfg.twoLegSemis && cfg.semiSecondLeg) { st.dates = [mainDates[r], sh(cfg.semiSecondLeg)]; st.neutral = false; }
    stages.push(st);
  }
  const comp: Competition = {
    id: cfg.id, name: cfg.name, short: cfg.short, type: "copa", country: cfg.country, clubs,
    ko: { stages, firstStageIdx: 0, hostLower: cfg.hostLowerTier }, notes: cfg.notes + (cfg.verified === false ? " (formato pendiente de verificar)" : ""),
  };
  save.comps[comp.id] = comp;
  // ordenar por categoría y fuerza: los más débiles juegan la previa
  const sorted = [...clubs].sort((a, b) => tierOf(save, a) - tierOf(save, b) || clubStrength(b, save.players) - clubStrength(a, save.players));
  if (prelim) {
    const k = n - P;
    const weak = rng.shuffle(sorted.slice(n - 2 * k));
    comp.ko!.entries = { 1: sorted.slice(0, n - 2 * k) };
    const pairs: [string, string][] = [];
    for (let i = 0; i < weak.length; i += 2) pairs.push([weak[i], weak[i + 1]]);
    createTies(save, comp, 0, stages[0], pairs);
  } else {
    const all = rng.shuffle([...clubs]);
    const pairs: [string, string][] = [];
    for (let i = 0; i < all.length; i += 2) pairs.push([all[i], all[i + 1]]);
    createTies(save, comp, 0, stages[0], pairs);
  }
}

function setupSupercup(save: FootballSave, cfg: SuperCfg, year: number, base: FootballConfig, prev: SeasonArchive | undefined) {
  const sh = shift(base, year);
  // participantes: de la temporada anterior o estimados por fuerza
  const pickFrom = (spec: string, taken: Set<string>): string | undefined => {
    const [comp, what] = spec.split(":");
    if (prev) {
      if (what === "champion" || what === "winner") { const w = prev.winners[comp]; if (w && !taken.has(w) && save.clubs[w]) return w; }
      if (what === "runnerup") { const w = prev.winners[comp + ":runnerup"]; if (w && !taken.has(w) && save.clubs[w]) return w; }
      const table = prev.tables[comp.replace(/_.*/, "") + "1"] ?? prev.tables[`${cfg.country === "ENG" ? "ENG1" : cfg.country + "1"}`];
      return table?.map((r) => r.club).find((c) => !taken.has(c) && save.clubs[c]);
    }
    return undefined;
  };
  const league = `${cfg.country}1`;
  const byStrength = [...(save.comps[league]?.clubs ?? [])].sort((a, b) => clubStrength(b, save.players) - clubStrength(a, save.players));
  const taken = new Set<string>();
  const parts: string[] = [];
  for (const spec of cfg.from) {
    const c = pickFrom(spec, taken) ?? byStrength.find((x) => !taken.has(x));
    if (c) { taken.add(c); parts.push(c); }
  }
  if (parts.length < cfg.size) return;
  const stages: KoStage[] = cfg.size === 2
    ? [{ name: "Final", dates: [sh(cfg.date!)], noET: cfg.noExtraTime, neutral: cfg.neutral }]
    : [{ name: "Semifinales", dates: [sh(cfg.dates![0])], noET: cfg.noExtraTime, neutral: cfg.neutral }, { name: "Final", dates: [sh(cfg.dates![1])], noET: cfg.noExtraTime, neutral: cfg.neutral }];
  const comp: Competition = {
    id: cfg.id, name: cfg.name, short: cfg.name.split(" ")[0], type: "supercopa", country: cfg.country, clubs: parts, estimated: !prev,
    ko: { stages, firstStageIdx: 0, bracket: true },
    notes: !prev ? "Participantes estimados por fuerza de plantilla (sin datos de la temporada anterior en la partida)." : undefined,
  };
  save.comps[comp.id] = comp;
  const pairs: [string, string][] = cfg.size === 2 ? [[parts[0], parts[1]]] : [[parts[0], parts[3]], [parts[1], parts[2]]];
  createTies(save, comp, 0, stages[0], pairs);
}

export function selectEurope(save: FootballSave, cfg: FootballConfig, prev: SeasonArchive | undefined, overrides?: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = { UCL: [], UEL: [], UECL: [] };
  const taken = new Set<string>();
  const byName = new Map(Object.values(save.clubs).map((c) => [c.name.toLowerCase(), c.id]));
  if (overrides && !prev) {
    for (const k of ["UCL", "UEL", "UECL"]) {
      for (const n of overrides[k] ?? []) { const id = byName.get(n.toLowerCase()); if (id && !taken.has(id)) { out[k].push(id); taken.add(id); } }
    }
  }
  const str = (c: string) => clubStrength(c, save.players);
  for (const lg of cfg.leagues.filter((l) => l.europe)) {
    const order = prev?.tables[lg.id]?.map((r) => r.club).filter((c) => save.clubs[c]) ?? [...(save.comps[lg.id]?.clubs ?? [])].sort((a, b) => str(b) - str(a));
    const cupWinner = prev?.winners[lg.cup ?? ""];
    const e = lg.europe!;
    const queue = order.filter((c) => !taken.has(c));
    const take = (k: string, n: number) => { for (let i = 0; i < n && queue.length; i++) { const c = queue.shift()!; out[k].push(c); taken.add(c); } };
    if (overrides && !prev && (overrides.UCL?.length || overrides.UEL?.length)) continue;
    take("UCL", e.ucl);
    if (cupWinner && !taken.has(cupWinner) && save.clubs[cupWinner]) { out.UEL.push(cupWinner); taken.add(cupWinner); queue.splice(queue.indexOf(cupWinner), 1); take("UEL", e.uel); }
    else take("UEL", e.uel + 1);
    take("UECL", e.uecl);
  }
  // resto de Europa por fuerza con tope por país
  const pool = Object.values(save.clubs).filter((c) => !c.leagueId && !taken.has(c.id)).sort((a, b) => str(b.id) - str(a.id));
  const fallback = Object.values(save.clubs).filter((c) => c.leagueId && !taken.has(c.id)).sort((a, b) => str(b.id) - str(a.id));
  for (const k of ["UCL", "UEL", "UECL"]) {
    const count = new Map<string, number>();
    for (const c of out[k]) { const ct = save.clubs[c].country; count.set(ct, (count.get(ct) ?? 0) + 1); }
    for (const c of [...pool, ...fallback]) {
      if (out[k].length >= 36) break;
      if (taken.has(c.id)) continue;
      if (!c.leagueId && (count.get(c.country) ?? 0) >= cfg.europeCountryCap) continue;
      out[k].push(c.id); taken.add(c.id); count.set(c.country, (count.get(c.country) ?? 0) + 1);
    }
  }
  return out;
}

function setupEurope(save: FootballSave, e: EuroCfg, clubs: string[], year: number, base: FootballConfig, rng: Rng) {
  const sh = shift(base, year);
  const seeded = [...clubs].sort((a, b) => clubStrength(b, save.players) - clubStrength(a, save.players));
  const potSize = e.teams / e.pots;
  const pots: string[][] = [];
  for (let i = 0; i < e.pots; i++) pots.push(seeded.slice(i * potSize, (i + 1) * potSize));
  const matches = swissDraw(pots, (c) => save.clubs[c].country, rng, e.matches) ?? swissDraw(pots, (c) => c, rng, e.matches)!;
  const rounds = scheduleRounds(matches, e.matches, rng);
  const kd = e.koDates as Record<string, string[] | string>;
  const two = (k: string) => (kd[k] as string[]).map(sh);
  const comp: Competition = {
    id: e.id, name: e.name, short: e.short, type: "europa", clubs, matchdays: e.matches, tiebreakers: UEFA_TIEBREAKERS,
    zones: [{ from: 1, to: 8, label: "Octavos", color: "#22c55e" }, { from: 9, to: 24, label: "Playoff", color: "#3b82f6" }, { from: 25, to: 36, label: "Eliminado", color: "#ef4444" }],
    ko: {
      firstStageIdx: 100,
      bracket: true,
      stages: [
        { name: "Playoff", dates: two("playoff") },
        { name: "Octavos de final", dates: two("r16") },
        { name: "Cuartos de final", dates: two("qf") },
        { name: "Semifinales", dates: two("sf") },
        { name: "Final", dates: [sh(kd.final as string)], neutral: true },
      ],
    },
    notes: `Fase liga: ${e.matches} partidos por equipo, ${e.pots} bombos. ${e.id === "UECL" ? "La Conference League juega 6 partidos (un rival por bombo), no 8." : ""} Fechas aproximadas.`,
  };
  save.comps[comp.id] = comp;
  rounds.forEach((round, i) => {
    const d = sh(e.leagueDates[i]);
    round.forEach(([h, a], k) => {
      // reparte entre martes y miércoles (o jueves) — la última jornada, todos a la vez
      const date = i < e.matches - 1 && k % 2 === 1 && e.id === "UCL" ? addDays(d, 1) : d;
      save.fixtures.push({ id: `${e.id}-MD${i + 1}-${k}`, comp: e.id, stage: `Fase liga · J${i + 1}`, stageIdx: i, date, home: h, away: a });
    });
  });
}

export function createSeason(save: FootballSave, cfg: FootballConfig, prev?: SeasonArchive, europeOverrides?: Record<string, string[]>) {
  const year = save.seasonYear;
  invalidateStrength(save.players);
  const rng = new Rng(save.seed + year);
  save.comps = {};
  save.fixtures = [];
  // Ligas
  for (const lg of cfg.leagues) {
    const clubs = Object.values(save.clubs).filter((c) => c.leagueId === lg.id).map((c) => c.id);
    const nEu = lg.europe ? lg.europe.ucl + lg.europe.uel + lg.europe.uecl : 0;
    const zones: Competition["zones"] = [];
    if (lg.europe) {
      zones.push({ from: 1, to: lg.europe.ucl, label: "Champions League", color: "#2563eb" });
      zones.push({ from: lg.europe.ucl + 1, to: lg.europe.ucl + lg.europe.uel, label: "Europa League", color: "#f97316" });
      zones.push({ from: lg.europe.ucl + lg.europe.uel + 1, to: nEu, label: "Conference League", color: "#22c55e" });
    }
    if (lg.promotion) zones.push({ from: 1, to: lg.promotion, label: "Ascenso", color: "#22c55e" });
    if (lg.playoff) zones.push({ from: lg.playoff.places[0], to: lg.playoff.places[lg.playoff.places.length - 1], label: "Playoff de ascenso", color: "#3b82f6" });
    if (lg.promotionPlayoff) zones.push({ from: lg.promotionPlayoff, to: lg.promotionPlayoff, label: "Playoff de ascenso", color: "#3b82f6" });
    if (lg.promotionPlayoffL2) zones.push({ from: lg.promotionPlayoffL2[0], to: lg.promotionPlayoffL2[lg.promotionPlayoffL2.length - 1], label: "Playoff de ascenso", color: "#3b82f6" });
    if (lg.relegationPlayoff) zones.push({ from: lg.relegationPlayoff, to: lg.relegationPlayoff, label: "Playoff de descenso", color: "#eab308" });
    if (lg.relegation) zones.push({ from: clubs.length - lg.relegation + 1, to: clubs.length, label: "Descenso", color: "#ef4444" });
    save.comps[lg.id] = {
      id: lg.id, name: lg.name, short: lg.short, type: "liga", country: lg.country, tier: lg.tier, clubs, tiebreakers: lg.tiebreakers, zones,
      relegation: lg.relegation, promotion: lg.promotion, notes: [lg.notes, lg.verified === false ? "Criterios pendientes de verificar." : ""].filter(Boolean).join(" "),
    };
  }
  // Fechas reservadas (Europa y copas) para no programar jornadas entre semana encima
  const sh = shift(cfg, year);
  const reserved = new Set<string>();
  for (const e of cfg.europe) { e.leagueDates.forEach((d) => reserved.add(sh(d))); Object.values(e.koDates).flat().forEach((d) => reserved.add(sh(d as string))); }
  for (const c of cfg.cups) c.rounds.forEach((d) => reserved.add(sh(d)));
  for (const lg of cfg.leagues) {
    const comp = save.comps[lg.id];
    if (comp.clubs.length < 2) continue;
    addLeagueFixtures(save, comp, leagueRoundDates(cfg, { ...lg, teams: comp.clubs.length }, year, reserved), rng);
  }
  for (const c of cfg.cups) if (c.leagues.every((l) => save.comps[l]?.clubs.length)) setupCup(save, c, year, cfg, rng);
  for (const s of cfg.supercups) if (save.comps[`${s.country}1`]?.clubs.length) setupSupercup(save, s, year, cfg, prev);
  const eu = selectEurope(save, cfg, prev, europeOverrides);
  for (const e of cfg.europe) if (eu[e.id].length === e.teams) setupEurope(save, e, eu[e.id], year, cfg, rng);
  save.fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.comp.localeCompare(b.comp));
  save.date = sh(cfg.start);
  save.version++;
}

// ===== Progresión de competiciones =====
export function leagueTable(save: FootballSave, compId: string): Row[] {
  const comp = save.comps[compId];
  const fx = save.fixtures.filter((f) => f.comp === compId && (comp.type !== "europa" || f.stageIdx < 100));
  return sortTable(computeRows(comp.clubs, fx), fx, comp.tiebreakers ?? ["pts", "gd", "gf"]);
}

function stageComplete(save: FootballSave, comp: string, stageIdx: number): boolean {
  const fx = save.fixtures.filter((f) => f.comp === comp && f.stageIdx === stageIdx);
  return fx.length > 0 && fx.every((f) => f.result);
}

// Crea las rondas siguientes cuando la anterior se completa. Devuelve true si creó algo.
export function progress(save: FootballSave, cfg?: FootballConfig): boolean {
  let changed = false;
  const rng = new Rng(save.seed + save.version * 7919);
  for (const comp of Object.values(save.comps)) {
    if (comp.done) continue;
    if (comp.type === "liga") {
      const fx = save.fixtures.filter((f) => f.comp === comp.id);
      if (fx.length && fx.every((f) => f.result)) {
        const t = leagueTable(save, comp.id);
        comp.done = true; comp.winner = t[0]?.club; comp.runnerUp = t[1]?.club;
        changed = true;
        if (cfg) changed = createLeaguePlayoffs(save, cfg, comp, t.map((r) => r.club), rng) || changed;
      }
      continue;
    }
    const ko = comp.ko;
    if (!ko) continue;
    // Europa: fase liga completa -> playoff
    if (comp.type === "europa") {
      const lp = save.fixtures.filter((f) => f.comp === comp.id && f.stageIdx < 100);
      const hasKo = save.fixtures.some((f) => f.comp === comp.id && f.stageIdx >= 100);
      if (!hasKo && lp.length && lp.every((f) => f.result)) {
        const table = leagueTable(save, comp.id).map((r) => r.club);
        ko.seeds = table;
        const pairs: [string, string][] = [];
        for (let k = 1; k <= 8; k++) pairs.push([table[16 - k], table[15 + k]]); // (16,17) ... (9,24)
        createTies(save, comp, 100, ko.stages[0], pairs);
        changed = true;
        continue;
      }
      if (!hasKo) continue;
    }
    const first = ko.firstStageIdx;
    const existing = [...new Set(save.fixtures.filter((f) => f.comp === comp.id && f.stageIdx >= first).map((f) => f.stageIdx))].sort((a, b) => a - b);
    if (!existing.length) continue;
    const cur = existing[existing.length - 1];
    if (!stageComplete(save, comp.id, cur)) continue;
    const ties = stageTies(save, comp.id, cur);
    const outs = ties.map((legs) => tieOutcome(legs));
    if (outs.some((o) => !o)) continue;
    const winners = outs.map((o) => o!.winner);
    const nextIdx = cur - first + 1;
    if (nextIdx >= ko.stages.length || winners.length === 1 && cur - first === ko.stages.length - 1) {
      comp.done = true;
      comp.winner = winners[0];
      comp.runnerUp = outs[0]!.loser;
      changed = true;
      continue;
    }
    let entrants = winners;
    let pairs: [string, string][] = [];
    if (comp.type === "europa" && cur === 100) {
      const seeds = ko.seeds!;
      // Octavos: cabeza k contra ganador de la eliminatoria k; orden de cuadro 1,8,4,5,2,7,3,6
      const tieFor = (k: number) => [seeds[k - 1], winners[k - 1]] as [string, string];
      pairs = [1, 8, 4, 5, 2, 7, 3, 6].map(tieFor);
    } else {
      const late = ko.entries?.[nextIdx];
      if (late?.length) {
        if (ko.bracket) { entrants = []; for (let i = 0; i < Math.max(late.length, winners.length); i++) { if (late[i]) entrants.push(late[i]); if (winners[i]) entrants.push(winners[i]); } }
        else entrants = [...late, ...winners];
      }
      if (ko.bracket) {
        for (let i = 0; i < entrants.length; i += 2) pairs.push(orderBySeed(entrants[i], entrants[i + 1], ko.seeds));
      } else {
        const sh = rng.shuffle([...entrants]);
        for (let i = 0; i < sh.length; i += 2) pairs.push([sh[i], sh[i + 1]]);
      }
    }
    createTies(save, comp, first + nextIdx, ko.stages[nextIdx], pairs);
    changed = true;
  }
  if (changed) { save.fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.comp.localeCompare(b.comp)); save.version++; }
  return changed;
}

function orderBySeed(a: string, b: string, seeds?: string[]): [string, string] {
  if (!seeds) return [a, b];
  const ia = seeds.indexOf(a), ib = seeds.indexOf(b);
  return (ia >= 0 && (ib < 0 || ia < ib)) ? [a, b] : [b, a];
}

function createLeaguePlayoffs(save: FootballSave, cfg: FootballConfig, comp: Competition, table: string[], rng: Rng): boolean {
  void rng;
  const lg = cfg.leagues.find((l) => l.id === comp.id);
  if (!lg) return false;
  const sh = shift(cfg, save.seasonYear);
  const d = (md: string) => sh(`2027-${md}`);
  const mk = (id: string, name: string, clubs: string[], stages: KoStage[], kind: "ascenso" | "descenso", pairs: [string, string][], seeds: string[]) => {
    if (save.comps[id]) return false;
    const c: Competition = { id, name, short: "PO", type: "playoff", country: lg.country, clubs, playoffFor: lg.id, playoffKind: kind, ko: { stages, firstStageIdx: 0, bracket: true, seeds } };
    save.comps[id] = c;
    createTies(save, c, 0, stages[0], pairs);
    return true;
  };
  if (lg.playoff) {
    const p = lg.playoff.places.map((pl) => table[pl - 1]).filter(Boolean);
    if (lg.playoff.type === "semis2_final1") return mk(`PO_${lg.id}`, `Playoff de ascenso ${lg.short}`, p, [{ name: "Semifinales", dates: [d("05-13"), d("05-16")] }, { name: "Final", dates: [d("05-24")], neutral: true }], "ascenso", [[p[0], p[3]], [p[1], p[2]]], p);
    if (lg.playoff.type === "semis2_final2") return mk(`PO_${lg.id}`, `Playoff de ascenso ${lg.short}`, p, [{ name: "Semifinales", dates: [d("05-13"), d("05-16")] }, { name: "Final", dates: [d("05-20"), d("05-23")] }], "ascenso", [[p[0], p[3]], [p[1], p[2]]], p);
    if (lg.playoff.type === "serieb") {
      // Ronda previa 5-8 y 6-7; semifinales 3 vs ganador(6-7) y 4 vs ganador(5-8)
      return mk(`PO_${lg.id}`, `Playoff de ascenso ${lg.short}`, p, [{ name: "Ronda previa", dates: [d("05-12")] }, { name: "Semifinales", dates: [d("05-16"), d("05-20")] }, { name: "Final", dates: [d("05-24"), d("05-28")] }], "ascenso", [[p[3], p[4]], [p[2], p[5]]], p)
        && (save.comps[`PO_${lg.id}`].ko!.entries = { 1: [p[0], p[1]] }, true);
    }
  }
  if (lg.promotionPlayoff || lg.promotionPlayoffL2) {
    const top = cfg.leagues.find((l) => l.country === lg.country && l.tier === 1)!;
    const topComp = save.comps[top.id];
    if (!topComp.done) return false; // se crea cuando ambas ligas terminan
    const topTable = leagueTable(save, top.id).map((r) => r.club);
    const rel = topTable[(top.relegationPlayoff ?? 16) - 1];
    if (lg.promotionPlayoff) {
      const pro = table[lg.promotionPlayoff - 1];
      return mk(`PO_${top.id}`, `Playoff de descenso ${top.short}`, [rel, pro], [{ name: "Final", dates: [d("05-27"), d("05-31")] }], "descenso", [[rel, pro]], [rel, pro]);
    }
    if (lg.promotionPlayoffL2) {
      const [a, b, c] = lg.promotionPlayoffL2.map((x) => table[x - 1]);
      // previa 4-5, luego 3 vs ganador, luego contra el 16º de Ligue 1
      const ok = mk(`PO_${top.id}`, `Playoff de ascenso/descenso ${top.short}`, [rel, a, b, c], [{ name: "Ronda previa", dates: [d("05-18")] }, { name: "Semifinal", dates: [d("05-22")] }, { name: "Final", dates: [d("05-27"), d("05-31")] }], "descenso", [[b, c]], [rel, a, b, c]);
      if (ok) { const k = save.comps[`PO_${top.id}`].ko!; k.bracket = true; k.entries = { 1: [a], 2: [rel] }; }
      return ok;
    }
  }
  return false;
}

// Tras terminar la 1ª división (GER/FRA), crear el playoff de descenso si la 2ª ya terminó.
export function ensurePendingPlayoffs(save: FootballSave, cfg: FootballConfig) {
  for (const lg of cfg.leagues.filter((l) => l.promotionPlayoff || l.promotionPlayoffL2)) {
    const comp = save.comps[lg.id];
    if (comp?.done) createLeaguePlayoffs(save, cfg, comp, leagueTable(save, lg.id).map((r) => r.club), new Rng(1));
  }
}

// ===== Avance del calendario =====
export function nextMatchDate(save: FootballSave, from = save.date): string | null {
  let best: string | null = null;
  for (const f of save.fixtures) {
    if (f.result) continue;
    if (f.date < from) f.date = from; // partido atrasado: se juega en la fecha actual
    if (!best || f.date < best) best = f.date;
  }
  return best;
}

export function pendingBefore(save: FootballSave, date: string): Fixture[] {
  return save.fixtures.filter((f) => !f.result && f.date < date);
}

// Si un club tiene dos partidos el mismo día (o días consecutivos), aplaza el de liga.
export function resolveClashes(save: FootballSave, date: string) {
  const day = save.fixtures.filter((f) => f.date === date && !f.result);
  const seen = new Map<string, Fixture>();
  for (const f of day.sort((a, b) => (save.comps[a.comp].type === "liga" ? 1 : 0) - (save.comps[b.comp].type === "liga" ? 1 : 0))) {
    for (const c of [f.home, f.away]) {
      if (seen.has(c) && save.comps[f.comp].type === "liga") {
        let nd = addDays(date, 3);
        while (save.fixtures.some((x) => x !== f && x.date === nd && [x.home, x.away].some((y) => y === f.home || y === f.away))) nd = addDays(nd, 1);
        f.date = nd;
        f.stage = f.stage.replace(/ \(aplazado\)$/, "") + " (aplazado)";
      }
      seen.set(c, f);
    }
  }
}

// Juega todos los partidos pendientes de un día (salvo los excluidos). Devuelve los partidos jugados.
export function playDay(save: FootballSave, date: string, cfg?: FootballConfig, skip?: (f: Fixture) => boolean): Fixture[] {
  progress(save, cfg);
  resolveClashes(save, date);
  const idx = getIndex(save);
  const today = save.fixtures.filter((f) => f.date === date && !f.result && !(skip?.(f)));
  // primero las idas/partidos que no dependen de otros del mismo día
  const squads = squadsMap(save);
  for (const f of today) f.result = simulateFixture(save, f, idx, squads);
  save.date = date;
  save.version++;
  for (const f of today) idx.add(f);
  idx.version = save.version;
  progress(save, cfg);
  if (cfg) ensurePendingPlayoffs(save, cfg);
  if (!save.freeMarket) aiMarketDay(save, new Rng(save.seed + Date.parse(date) / 864e5));
  return today;
}

export function setResult(save: FootballSave, fixtureId: string, result: MatchResult | undefined, cfg?: FootballConfig) {
  const f = save.fixtures.find((x) => x.id === fixtureId);
  if (!f) return;
  f.result = result;
  save.version++;
  const comp = save.comps[f.comp];
  // Eliminatorias: si cambia el resultado, se regeneran rondas posteriores sin jugar
  if (comp.ko && f.stageIdx >= comp.ko.firstStageIdx || comp.type === "europa") {
    const later = save.fixtures.filter((x) => x.comp === f.comp && x.stageIdx > f.stageIdx && (comp.type !== "europa" || x.stageIdx >= 100));
    if (later.every((x) => !x.result)) {
      save.fixtures = save.fixtures.filter((x) => !later.includes(x));
      comp.done = false; comp.winner = undefined; comp.runnerUp = undefined;
    }
  }
  if (comp.type === "liga" && !result) { comp.done = false; comp.winner = undefined; }
  progress(save, cfg);
}

export function seasonFinished(save: FootballSave): boolean {
  return save.fixtures.every((f) => f.result) && Object.values(save.comps).every((c) => c.done || !save.fixtures.some((f) => f.comp === c.id));
}

export type { Row };
export { squadOf };
export type { Club };
