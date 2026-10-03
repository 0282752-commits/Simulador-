// Motor de torneos personalizados. Todo el cuadro se DERIVA de los resultados: al editar o borrar un resultado
// se regenera cada fase (con la misma semilla) y se conservan los resultados de los cruces que no cambian.
import type { Rng } from "../../lib/rng";
import { roundName } from "../football/competitions";
import { clubStrength } from "../football/strength";
import { ensureLineup } from "../football/lineup";
import { FootballMatch, type MatchOptions, type MatchTeamInput } from "../football/match";
import type { MatchResult } from "../football/types";
import { gameInput, teamStrength } from "../nfl/season";
import { simulateNflGame } from "../nfl/game";
import type { NflResult, NflSave } from "../nfl/types";
import { Battle, overall, type BattleSide } from "../dc/battle";
import type { BattleResult } from "../dc/types";
import type { CupFormat, CupMatch, CupResult, CupSave, CupSport, CupTeam } from "./types";
import { GROUP_LETTERS, drawGroups, drawRng, drawSwiss, drawTies, replayGroups, shuffle, type DrawnTie } from "./draw";

export const SPORT_LABEL: Record<CupSport, string> = { futbol: "Fútbol (clubes)", selecciones: "Selecciones", nfl: "NFL", dc: "DC Comics" };
export { GROUP_LETTERS, shuffle };
const rngFor = (save: CupSave, key: string) => drawRng(save, key);
const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

// ===== Calendarios =====
function roundRobin(ids: string[], rng: Rng): [string, string][][] {
  const a = shuffle(ids, rng);
  if (a.length % 2) a.push("__BYE__");
  const n = a.length, rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x !== "__BYE__" && y !== "__BYE__") round.push((r + i) % 2 ? [y, x] : [x, y]); }
    rounds.push(round);
    a.splice(1, 0, a.pop()!);
  }
  return rounds;
}
function roundRobinLegs(ids: string[], legs: 1 | 2, rng: Rng): [string, string][][] {
  const first = roundRobin(ids, rng);
  return legs === 2 ? [...first, ...first.map((r) => r.map(([h, a]) => [a, h] as [string, string]))] : first;
}
// Cuadro estándar: 1 contra el último, y los mejores no se cruzan hasta el final
export function bracketOrder(n: number): number[] { let o = [1]; while (o.length < n) { const m = o.length * 2; o = o.flatMap((s) => [s, m + 1 - s]); } return o; }

// ===== Tablas =====
export interface CupRow { team: string; pj: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; group?: string }
export const pointsSystem = (sport: CupSport) => (sport === "nfl" ? { w: 2, d: 1 } : { w: 3, d: 1 });
export function cupTable(save: CupSave, teams: string[], matches: CupMatch[]): CupRow[] {
  const rows = new Map<string, CupRow>(teams.map((t) => [t, { team: t, pj: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  const ps = pointsSystem(save.sport);
  for (const m of matches) {
    const r = m.result, h = rows.get(m.home), a = rows.get(m.away);
    if (!r || !h || !a) continue;
    h.pj++; a.pj++; h.gf += r.hs; h.ga += r.as; a.gf += r.as; a.ga += r.hs;
    if (r.w === 0) { h.w++; a.l++; h.pts += ps.w; } else if (r.w === 1) { a.w++; h.l++; a.pts += ps.w; } else { h.d++; a.d++; h.pts += ps.d; a.pts += ps.d; }
  }
  return [...rows.values()].sort((x, y) => compareRows(save, x, y));
}
function compareRows(save: CupSave, x: CupRow, y: CupRow) {
  return y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || y.w - x.w || (save.teams[y.team]?.strength ?? 0) - (save.teams[x.team]?.strength ?? 0) || x.team.localeCompare(y.team);
}

// ===== Validación de formato =====
export function validateFormat(f: CupFormat, n: number): string | null {
  if (n < 2) return "Elige al menos 2 participantes.";
  if (f.kind === "liga" && f.playoffTeams && (f.playoffTeams < 2 || f.playoffTeams > n)) return "La fase final debe tener entre 2 y el total de equipos.";
  if (f.kind === "grupos") {
    if (f.groups < 1 || n < f.groups * 2) return `Con ${n} equipos caben como mucho ${Math.floor(n / 2)} grupos.`;
    const minSize = Math.floor(n / f.groups);
    if (f.perGroup < 1 || f.perGroup > minSize) return `Pueden clasificar entre 1 y ${minSize} por grupo.`;
    if (f.bestThirds < 0 || f.bestThirds > f.groups || (f.bestThirds && f.perGroup + 1 > minSize)) return "Número de mejores siguientes no válido.";
    if (f.groups * f.perGroup + f.bestThirds < 2) return "Deben clasificar al menos 2 equipos.";
  }
  if (f.kind === "suizo") {
    if (n % 2) return "La liga suiza necesita un número par de equipos.";
    if (f.swissMatches < 1 || f.swissMatches > n - 1) return `Cada equipo puede jugar entre 1 y ${n - 1} partidos.`;
    if (![2, 4, 8, 16, 32, 64].includes(f.koSize)) return "El cuadro final debe ser de 2, 4, 8, 16, 32 o 64.";
    if (n < f.koSize / 2 + f.koSize) return `Con cuadro de ${f.koSize} necesitas al menos ${f.koSize / 2 + f.koSize} equipos (${f.koSize / 2} directos + ${f.koSize} al playoff).`;
  }
  return null;
}

// ===== Regeneración del torneo =====
type Add = (m: CupMatch) => CupMatch;

function tieWinner(legs: CupMatch[]): { winner: string; loser: string } | undefined {
  if (legs.length === 1) {
    const [m] = legs; const r = m.result;
    if (!r || r.w === -1) return undefined;
    return r.w === 0 ? { winner: m.home, loser: m.away } : { winner: m.away, loser: m.home };
  }
  const l1 = legs.find((x) => x.leg === 1), l2 = legs.find((x) => x.leg === 2);
  if (!l1?.result || !l2?.result) return undefined;
  const a = l2.home, b = l2.away;
  const ga = l2.result.hs + l1.result.as, gb = l2.result.as + l1.result.hs;
  if (ga !== gb) return ga > gb ? { winner: a, loser: b } : { winner: b, loser: a };
  const p = l2.result.pens;
  if (p && p[0] !== p[1]) return p[0] > p[1] ? { winner: a, loser: b } : { winner: b, loser: a };
  if (l2.result.w !== -1) return l2.result.w === 0 ? { winner: a, loser: b } : { winner: b, loser: a };
  return undefined;
}

function addTie(save: CupSave, add: Add, o: { phase: CupMatch["phase"]; stage: string; key: string; hi: string; lo: string; legs: 1 | 2; round: number; neutral: boolean }): CupMatch[] {
  const id = `${o.key}:${o.hi}-${o.lo}`;
  if (o.legs === 1) return [add({ id, phase: o.phase, stage: o.stage, round: o.round, home: o.hi, away: o.lo, tie: id, neutral: o.neutral || undefined })];
  return [
    add({ id: `${id}#1`, phase: o.phase, stage: `${o.stage} · ida`, round: o.round, home: o.lo, away: o.hi, tie: id, leg: 1 }),
    add({ id: `${id}#2`, phase: o.phase, stage: `${o.stage} · vuelta`, round: o.round + 1, home: o.hi, away: o.lo, tie: id, leg: 2 }),
  ];
}

interface KoOpts { groupOf?: (t: string) => string | undefined; couples?: boolean; seededFirst?: boolean }

// Eliminatoria a partir de una lista de cabezas de serie (índice 0 = mejor). Admite exentos si no es potencia de 2.
// koDraw "cuadro": cuadro fijo (1 contra el último). "sorteo": cada ronda se sortea al conocerse los clasificados,
// salvo con couples (Champions actual), donde el sorteo decide el lado del cuadro dentro de cada pareja de cabezas.
function knockout(save: CupSave, entrants: string[], startRound: number, add: Add, o: KoOpts = {}) {
  const f = save.format;
  if (f.koDraw === "sorteo" && !o.couples) return knockoutDrawn(save, entrants, startRound, add, o);
  const size = nextPow2(entrants.length);
  let ent = [...entrants];
  if (f.koDraw === "sorteo" && o.couples) {
    const rng = rngFor(save, `ko:${roundName(size)}`);
    for (let k = 0; k + 1 < size / 2 && k + 1 < ent.length; k += 2) if (rng.chance(0.5)) [ent[k], ent[k + 1]] = [ent[k + 1], ent[k]];
  }
  const seedOf = new Map(ent.map((t, i) => [t, i]));
  let cur: (string | null | undefined)[] = bracketOrder(size).map((s) => ent[s - 1] ?? null);
  // evita cruces de equipos del mismo grupo en la primera ronda
  if (o.groupOf) {
    const g = o.groupOf;
    for (let i = 0; i < cur.length; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (!a || !b || g(a) !== g(b)) continue;
      for (let j = 0; j < cur.length; j += 2) {
        if (j === i) continue;
        const c = cur[j], d = cur[j + 1];
        if (!c || !d) continue;
        if (g(a) !== g(d) && g(c) !== g(b)) { cur[i + 1] = d; cur[j + 1] = b; break; }
      }
    }
  }
  if (f.koDraw === "sorteo" && o.couples) {
    const name = roundName(size);
    const ties = [] as DrawnTie[];
    for (let i = 0; i < cur.length; i += 2) if (cur[i] && cur[i + 1]) ties.push({ first: cur[i + 1]!, second: cur[i]!, seeded: cur[i]! });
    save.draws![`ko:${name}`] = { key: `ko:${name}`, title: `Sorteo del cuadro final (${name.toLowerCase()} en adelante)`, kind: "cruces", potNames: ["Cabezas de serie (1.º-8.º)", "Ganadores del playoff"], pots: [ties.map((t) => t.second), ties.map((t) => t.first)], steps: ties.flatMap((t, i) => [{ team: t.first, pot: 1, target: `Cruce ${i + 1}` }, { team: t.second, pot: 0, target: `Cruce ${i + 1}` }]), targets: ties.map((_, i) => `Cruce ${i + 1}`), rules: ["Cuadro fijo por parejas de puestos (1.º-2.º, 3.º-4.º…): el sorteo decide qué equipo de cada pareja va a cada lado", "Los mejor clasificados juegan la vuelta en casa"] };
  }
  let round = startRound;
  const neutralAll = save.sport === "selecciones";
  while (cur.length > 1) {
    const n = cur.length, isFinal = n === 2, name = roundName(n);
    const legs: 1 | 2 = isFinal ? 1 : f.koLegs;
    const next: (string | null | undefined)[] = [];
    const sfLosers: (string | undefined)[] = [];
    for (let i = 0; i < n; i += 2) {
      const a = cur[i], b = cur[i + 1];
      if (a === undefined || b === undefined) { next.push(undefined); sfLosers.push(undefined); continue; }
      if (a === null || b === null) { next.push(a ?? b); continue; }
      const [hi, lo] = (seedOf.get(a) ?? 0) <= (seedOf.get(b) ?? 0) ? [a, b] : [b, a];
      const ms = addTie(save, add, { phase: "ko", stage: name, key: name, hi, lo, legs, round, neutral: isFinal || neutralAll });
      const res = tieWinner(ms);
      next.push(res?.winner);
      sfLosers.push(res?.loser);
      if (isFinal && res) { save.champion = res.winner; save.runnerUp = res.loser; }
    }
    thirdPlace(save, add, n, sfLosers, (x, y) => (seedOf.get(x) ?? 0) <= (seedOf.get(y) ?? 0), round + legs);
    round += legs;
    cur = next;
  }
}

function thirdPlace(save: CupSave, add: Add, n: number, losers: (string | undefined)[], better: (x: string, y: string) => boolean, round: number) {
  if (n !== 4 || !save.format.thirdPlace || losers.length !== 2 || !losers[0] || !losers[1]) return;
  const [x, y] = losers as string[];
  const [hi, lo] = better(x, y) ? [x, y] : [y, x];
  const res = tieWinner(addTie(save, add, { phase: "ko", stage: "Tercer puesto", key: "3P", hi, lo, legs: 1, round, neutral: true }));
  if (res) save.third = res.winner;
}

// Eliminatoria con sorteo en cada ronda
function knockoutDrawn(save: CupSave, entrants: string[], startRound: number, add: Add, o: KoOpts) {
  const f = save.format;
  const neutralAll = save.sport === "selecciones";
  const seedOf = new Map(entrants.map((t, i) => [t, i]));
  let cur = [...entrants], round = startRound, first = true;
  while (cur.length > 1) {
    const size = nextPow2(cur.length), name = roundName(size), isFinal = size === 2;
    const nByes = size - cur.length;
    const byes = cur.slice(0, nByes), pool = cur.slice(nByes);
    const seeded = first && (o.seededFirst ?? f.seeding === "fuerza") && pool.length >= 4;
    const half = pool.length / 2;
    const avoid = first && o.groupOf ? [{ fn: (a: string, b: string) => o.groupOf!(a) !== o.groupOf!(b), label: "No se repiten rivales del mismo grupo" }] : undefined;
    const { ties, draw } = drawTies(save, `ko:${name}`, isFinal ? "La final" : `Sorteo de ${name.toLowerCase()}`, seeded ? { seeded: pool.slice(0, half), unseeded: pool.slice(half) } : { open: pool }, avoid);
    if (!isFinal) save.draws![`ko:${name}`] = { ...draw, byes: byes.length ? byes : undefined };
    const legs: 1 | 2 = isFinal ? 1 : f.koLegs;
    const next: (string | undefined)[] = [...byes];
    const losers: (string | undefined)[] = [];
    for (const t of ties) {
      // single: local = cabeza de serie o primero en salir; doble: vuelta en casa del cabeza de serie, ida en casa del primero en salir
      const hi = t.seeded ?? (legs === 1 ? t.first : t.second), lo = hi === t.first ? t.second : t.first;
      const res = tieWinner(addTie(save, add, { phase: "ko", stage: name, key: name, hi, lo, legs, round, neutral: isFinal || neutralAll }));
      next.push(res?.winner);
      losers.push(res?.loser);
      if (isFinal && res) { save.champion = res.winner; save.runnerUp = res.loser; }
    }
    thirdPlace(save, add, size, losers, (x, y) => (seedOf.get(x) ?? 0) <= (seedOf.get(y) ?? 0), round + legs);
    round += legs;
    if (next.some((x) => x === undefined)) break;
    cur = (next as string[]).sort((a, b) => (seedOf.get(a) ?? 0) - (seedOf.get(b) ?? 0));
    first = false;
  }
}

export function groupQualifiers(save: CupSave, gm: CupMatch[]): { team: string; group: string }[] {
  const f = save.format;
  const tables = Object.entries(save.groups ?? {}).map(([g, ids]) => ({ g, t: cupTable(save, ids, gm.filter((m) => m.group === g)) }));
  const byPos = (k: number) => tables.filter((x) => x.t[k]).map((x) => ({ ...x.t[k], group: x.g })).sort((x, y) => compareRows(save, x, y));
  const out: { team: string; group: string }[] = [];
  for (let k = 0; k < f.perGroup; k++) out.push(...byPos(k).map((r) => ({ team: r.team, group: r.group })));
  if (f.bestThirds) out.push(...byPos(f.perGroup).slice(0, f.bestThirds).map((r) => ({ team: r.team, group: r.group })));
  return out;
}

export function rebuild(save: CupSave) {
  const keep = new Map(save.matches.filter((m) => m.result).map((m) => [m.id, m.result!]));
  const ms: CupMatch[] = [];
  const add: Add = (m) => { const r = keep.get(m.id); if (r) m.result = r; ms.push(m); return m; };
  const f = save.format, P = save.participants;
  const neutral = save.sport === "selecciones" || undefined;
  save.champion = save.runnerUp = save.third = undefined;
  save.draws = Object.fromEntries(Object.entries(save.draws ?? {}).filter(([k]) => !k.startsWith("ko:") && k !== "playoff"));
  const done = (xs: CupMatch[]) => xs.length > 0 && xs.every((m) => m.result);

  if (f.kind === "eliminatoria") knockout(save, P, 0, add, { seededFirst: f.seeding === "fuerza" });
  else if (f.kind === "liga") {
    const rounds = roundRobinLegs(P, f.leagueLegs, rngFor(save, "liga"));
    rounds.forEach((r, i) => r.forEach(([h, a]) => add({ id: `J${i + 1}:${h}-${a}`, phase: "liga", stage: `Jornada ${i + 1}`, round: i, home: h, away: a, neutral })));
    const lm = ms.filter((m) => m.phase === "liga");
    if (done(lm)) {
      const t = cupTable(save, P, lm);
      if (f.playoffTeams >= 2) knockout(save, t.slice(0, f.playoffTeams).map((r) => r.team), rounds.length, add);
      else { save.champion = t[0]?.team; save.runnerUp = t[1]?.team; save.third = t[2]?.team; }
    }
  } else if (f.kind === "grupos") {
    if (!save.groups) { const d = drawGroups(save); save.groups = d.groups; save.draws.grupos = d.draw; }
    let maxR = 0;
    for (const [g, ids] of Object.entries(save.groups)) {
      roundRobinLegs(ids, f.leagueLegs, rngFor(save, `g${g}`)).forEach((r, i) => { maxR = Math.max(maxR, i + 1); r.forEach(([h, a]) => add({ id: `G${g}${i + 1}:${h}-${a}`, phase: "grupos", stage: `Grupos · J${i + 1}`, round: i, group: g, home: h, away: a, neutral })); });
    }
    const gm = ms.filter((m) => m.phase === "grupos");
    if (done(gm)) {
      const q = groupQualifiers(save, gm);
      const gOf = new Map(q.map((x) => [x.team, x.group]));
      knockout(save, q.map((x) => x.team), maxR, add, { groupOf: (t) => gOf.get(t), seededFirst: true });
    }
  } else {
    if (!save.swiss) { const d = drawSwiss(save, () => roundRobin(P, rngFor(save, "suizo")).slice(0, f.swissMatches)); save.swiss = d.rounds; save.draws.suizo = d.draw; }
    const rounds = save.swiss;
    rounds.forEach((r, i) => r.forEach(([h, a]) => add({ id: `S${i + 1}:${h}-${a}`, phase: "suizo", stage: `Fase liga · J${i + 1}`, round: i, home: h, away: a, neutral })));
    const sm = ms.filter((m) => m.phase === "suizo");
    if (done(sm)) {
      const t = cupTable(save, P, sm).map((r) => r.team);
      const D = f.koSize / 2, po = t.slice(D, D + f.koSize);
      // playoff: puesto j contra puesto P-1-j; con sorteo, parejas de puestos (9.º/10.º contra 23.º/24.º…) como en la Champions
      const H = po.length / 2;
      const pairs: [string, string][] = [];
      if (f.koDraw === "sorteo") {
        const rng = rngFor(save, "playoff");
        const steps: { team: string; pot: number; target: string }[] = [];
        for (let c = 0; c < H; c += 2) {
          const top = po.slice(c, Math.min(c + 2, H)), bot = [po[po.length - 1 - c], po[po.length - 2 - c]].slice(0, top.length);
          const bo = rng.chance(0.5) ? bot : [...bot].reverse();
          top.forEach((x, k) => { pairs.push([x, bo[k]]); steps.push({ team: bo[k], pot: 1, target: `Cruce ${pairs.length}` }, { team: x, pot: 0, target: `Cruce ${pairs.length}` }); });
        }
        save.draws.playoff = { key: "playoff", title: "Sorteo del playoff", kind: "cruces", potNames: [`Cabezas de serie (${D + 1}.º-${D + H}.º)`, `No cabezas (${D + H + 1}.º-${D + po.length}.º)`], pots: [po.slice(0, H), po.slice(H)], steps, targets: pairs.map((_, i) => `Cruce ${i + 1}`), rules: [`Por parejas de puestos: ${D + 1}.º/${D + 2}.º contra ${D + po.length - 1}.º/${D + po.length}.º, etc.`, "El cabeza de serie juega la vuelta en casa"] };
      } else for (let j = 0; j < H; j++) pairs.push([po[j], po[po.length - 1 - j]]);
      // el ganador ocupa el puesto de su cabeza de serie en el cuadro
      const slot = new Map(po.slice(0, H).map((x, i) => [x, i]));
      const winners: (string | undefined)[] = Array(H).fill(undefined);
      for (const [hi, lo] of pairs) winners[slot.get(hi)!] = tieWinner(addTie(save, add, { phase: "playoff", stage: "Playoff", key: "PO", hi, lo, legs: f.koLegs, round: rounds.length, neutral: !!neutral }))?.winner;
      if (winners.every(Boolean)) knockout(save, [...t.slice(0, D), ...(winners as string[])], rounds.length + f.koLegs, add, { couples: true });
    }
  }
  ms.sort((a, b) => a.round - b.round);
  save.matches = ms;
  save.version++;
}

// Partidos que ya se pueden jugar (la vuelta solo cuando hay resultado de la ida)
export function playable(save: CupSave): CupMatch[] {
  const leg1 = new Map(save.matches.filter((m) => m.leg === 1).map((m) => [m.tie, m]));
  return save.matches.filter((m) => !m.result && (m.leg !== 2 || !!leg1.get(m.tie)?.result));
}
export function nextRound(save: CupSave): number | null {
  const p = playable(save);
  return p.length ? Math.min(...p.map((m) => m.round)) : null;
}

// ===== Simulación =====
export function decisiveInfo(save: CupSave, m: CupMatch): { decisive: boolean; l1?: CupResult } {
  if (m.phase !== "ko" && m.phase !== "playoff") return { decisive: false };
  if (!m.leg) return { decisive: true };
  if (m.leg === 1) return { decisive: false };
  return { decisive: true, l1: save.matches.find((x) => x.tie === m.tie && x.leg === 1)?.result };
}

export function fbSquad(save: CupSave, teamId: string) { return Object.values(save.fb!.players).filter((p) => p.clubId === teamId && !p.retired); }
export function fbInput(save: CupSave, teamId: string): MatchTeamInput {
  const club = save.fb!.clubs[teamId];
  const squad = fbSquad(save, teamId);
  return { id: teamId, name: club.name, short: club.short, colors: club.colors, lineup: ensureLineup(club, squad), squad };
}
export function fbOptions(save: CupSave, m: CupMatch): MatchOptions {
  const { decisive, l1 } = decisiveInfo(save, m);
  return { neutral: m.neutral, knockout: decisive, firstLeg: l1 ? [l1.as, l1.hs] : undefined, seed: Math.floor(Math.random() * 2 ** 31) };
}
export function nflShim(save: CupSave): NflSave { return { teams: save.nfl!.teams, players: save.nfl!.players } as unknown as NflSave; }
export function dcSides(save: CupSave, m: CupMatch): BattleSide[] {
  const d = save.dc!;
  return [m.home, m.away].map((id) => ({ id, name: save.teams[id]?.name ?? id, members: (d.members[id] ?? []).map((c) => d.characters[c]).filter(Boolean) }));
}

const KEEP_EV = ["gol", "gol_pp", "roja", "doble_amarilla", "penal_fallado", "penal_atajado", "tanda"];
export function fromFootball(r: MatchResult, manual = false): CupResult {
  const w: CupResult["w"] = r.hg > r.ag ? 0 : r.ag > r.hg ? 1 : r.pens && r.pens[0] !== r.pens[1] ? (r.pens[0] > r.pens[1] ? 0 : 1) : -1;
  const players = Object.fromEntries(Object.entries(r.players).filter(([, l]) => l.g || l.a || l.rc || l.og));
  return { hs: r.hg, as: r.ag, w, et: r.et, pens: r.pens, manual: manual || r.manual || undefined, fb: { ...r, events: r.events.filter((e) => KEEP_EV.includes(e.type)), players } };
}
export function fromNfl(r: NflResult): CupResult {
  return { hs: r.hs, as: r.as, w: r.hs > r.as ? 0 : r.as > r.hs ? 1 : -1, et: r.ot, manual: r.manual, nfl: { ...r, injuries: undefined } };
}
export function fromDc(r: BattleResult, decisive: boolean): CupResult {
  const ko = (side: number) => r.fighters.filter((x) => x.side === side && x.ko).length;
  let w = r.winner as CupResult["w"];
  if (w === -1 && decisive) {
    const hp = (side: number) => r.fighters.filter((x) => x.side === side).reduce((a, x) => a + Math.max(0, x.hp) / Math.max(1, x.maxHp), 0);
    w = hp(0) >= hp(1) ? 0 : 1;
  }
  const { log: _log, ...rest } = r;
  return { hs: ko(1), as: ko(0), w, manual: r.manual, dc: { ...rest, winner: w } };
}

export function simulateCupMatch(save: CupSave, m: CupMatch): CupResult {
  if (save.sport === "futbol" || save.sport === "selecciones") return fromFootball(new FootballMatch(fbInput(save, m.home), fbInput(save, m.away), fbOptions(save, m)).runToEnd());
  if (save.sport === "nfl") {
    const sh = nflShim(save);
    return fromNfl(simulateNflGame(gameInput(sh, m.home), gameInput(sh, m.away), { neutral: m.neutral, playoff: decisiveInfo(save, m).decisive }));
  }
  const d = save.dc!;
  return fromDc(new Battle(dcSides(save, m), d.synergies, d.randomness, Math.floor(Math.random() * 2 ** 30)).runToEnd(), decisiveInfo(save, m).decisive);
}

export function setCupResult(save: CupSave, matchId: string, r: CupResult | undefined) {
  const m = save.matches.find((x) => x.id === matchId);
  if (!m) return;
  m.result = r;
  rebuild(save);
}

// Simula partidos jugables hasta que stop() diga basta (devuelve cuántos se jugaron)
export function simulateWhile(save: CupSave, scope: "partido" | "ronda" | "fase" | "todo"): number {
  let n = 0;
  const startPhase = playable(save).sort((a, b) => a.round - b.round)[0]?.phase;
  for (let guard = 0; guard < 500; guard++) {
    const r = nextRound(save);
    if (r === null) break;
    const batch = playable(save).filter((m) => m.round === r);
    if (scope === "fase" && batch[0].phase !== startPhase) break;
    for (const m of scope === "partido" ? batch.slice(0, 1) : batch) { m.result = simulateCupMatch(save, m); n++; }
    rebuild(save);
    if (scope === "partido" || scope === "ronda") break;
  }
  return n;
}

// Reiniciar: borra resultados (y opcionalmente rehace todos los sorteos)
export function resetCup(save: CupSave, redraw: boolean) {
  for (const m of save.matches) m.result = undefined;
  save.matches = [];
  if (redraw) {
    save.seed = Math.floor(Math.random() * 2 ** 31);
    save.drawSalt = {}; save.drawSeen = {}; save.swiss = undefined;
    if (save.format.kind === "grupos" && !save.draws?.grupos?.real) save.groups = undefined;
    if (save.format.seeding === "aleatorio") save.participants = shuffle(save.participants, rngFor(save, "orden"));
    save.draws = save.draws?.grupos?.real ? { grupos: save.draws.grupos } : {};
  }
  rebuild(save);
}

// ¿Se puede repetir este sorteo? Solo si no se ha jugado ningún partido que dependa de él.
export function canRedraw(save: CupSave, key: string): boolean {
  const d = save.draws?.[key];
  if (!d || d.real) return false;
  if (key === "grupos") return !save.matches.some((m) => m.result);
  if (key === "suizo") return !save.matches.some((m) => m.result);
  const stage = key === "playoff" ? "Playoff" : key.slice(3);
  const firstRound = Math.min(...save.matches.filter((m) => m.stage.startsWith(stage)).map((m) => m.round));
  return !save.matches.some((m) => m.result && m.round >= firstRound && (m.phase === "ko" || m.phase === "playoff"));
}
export function redraw(save: CupSave, key: string) {
  if (!canRedraw(save, key)) return;
  save.drawSalt = { ...(save.drawSalt ?? {}), [key]: Math.floor(Math.random() * 1e9) };
  save.drawSeen = { ...(save.drawSeen ?? {}), [key]: false };
  if (key === "grupos") save.groups = undefined;
  if (key === "suizo") save.swiss = undefined;
  rebuild(save);
}

// ===== Creación =====
export interface NewCupOpts { sport: CupSport; title: string; format: CupFormat; teams: CupTeam[]; fb?: CupSave["fb"]; nfl?: CupSave["nfl"]; dc?: CupSave["dc"]; dataSource: string; groups?: Record<string, string[]>; hosts?: string[]; note?: string }
export function createCup(o: NewCupOpts): CupSave {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const save: CupSave = { mode: "torneo", version: 0, sport: o.sport, title: o.title, format: o.format, seed, teams: Object.fromEntries(o.teams.map((t) => [t.id, t])), participants: [], matches: [], fb: o.fb, nfl: o.nfl, dc: o.dc, dataSource: o.dataSource, groups: o.groups, note: o.note, draws: {}, drawSeen: {} };
  if (o.groups) save.draws!.grupos = replayGroups(save, o.groups, o.hosts);
  const ids = o.teams.map((t) => t.id);
  save.participants = o.format.seeding === "fuerza" ? [...ids].sort((a, b) => save.teams[b].strength - save.teams[a].strength) : shuffle(ids, rngFor(save, "orden"));
  rebuild(save);
  return save;
}

// Fuerza para ordenar cabezas de serie
export function footballStrength(clubId: string, players: Parameters<typeof clubStrength>[1]) { return clubStrength(clubId, players); }
export function nflTeamStrength(save: CupSave, id: string) { return teamStrength(nflShim(save), id); }
export function dcStrength(members: string[], chars: Record<string, Parameters<typeof overall>[0]>) { const l = members.map((m) => chars[m]).filter(Boolean); return l.length ? l.reduce((a, c) => a + overall(c), 0) / l.length : 0; }

// ===== Estadísticas =====
export interface Leader { id: string; name: string; team: string; value: number; extra?: string }
export function cupLeaders(save: CupSave): { title: string; rows: Leader[] }[] {
  const played = save.matches.filter((m) => m.result);
  if (save.sport === "futbol" || save.sport === "selecciones") {
    const goals = new Map<string, number>(), assists = new Map<string, number>();
    for (const m of played) for (const e of m.result!.fb?.events ?? []) {
      if (e.type === "gol" && e.player) { goals.set(e.player, (goals.get(e.player) ?? 0) + 1); if (e.player2) assists.set(e.player2, (assists.get(e.player2) ?? 0) + 1); }
    }
    const P = save.fb!.players;
    const top = (mp: Map<string, number>) => [...mp].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, v]) => ({ id, name: P[id]?.shortName ?? "?", team: P[id]?.clubId ?? "", value: v }));
    return [{ title: "Goleadores", rows: top(goals) }, { title: "Asistencias", rows: top(assists) }];
  }
  if (save.sport === "nfl") {
    const acc = new Map<string, { td: number; pass: number; rush: number; rec: number; ptd: number }>();
    for (const m of played) for (const [id, l] of Object.entries(m.result!.nfl?.players ?? {})) {
      const a = acc.get(id) ?? { td: 0, pass: 0, rush: 0, rec: 0, ptd: 0 };
      a.td += (l.rushTD ?? 0) + (l.recTD ?? 0); a.pass += l.passYds ?? 0; a.rush += l.rushYds ?? 0; a.rec += l.recYds ?? 0; a.ptd += l.passTD ?? 0;
      acc.set(id, a);
    }
    const P = save.nfl!.players;
    const top = (k: "td" | "pass" | "rush" | "rec", extra?: (x: { ptd: number }) => string) => [...acc].filter(([, a]) => a[k] > 0).sort((a, b) => b[1][k] - a[1][k]).slice(0, 12).map(([id, a]) => ({ id, name: P[id]?.name ?? "?", team: P[id]?.teamId ?? "", value: a[k], extra: extra?.(a) }));
    return [{ title: "Touchdowns (carrera + recepción)", rows: top("td") }, { title: "Yardas de pase", rows: top("pass", (a) => `${a.ptd} TD`) }, { title: "Yardas de carrera", rows: top("rush") }, { title: "Yardas de recepción", rows: top("rec") }];
  }
  const kos = new Map<string, number>(), dmg = new Map<string, number>(), team = new Map<string, string>();
  for (const m of played) for (const fx of m.result!.dc?.fighters ?? []) {
    kos.set(fx.id, (kos.get(fx.id) ?? 0) + fx.kos); dmg.set(fx.id, (dmg.get(fx.id) ?? 0) + fx.dmg); team.set(fx.id, fx.side === 0 ? m.home : m.away);
  }
  const C = save.dc!.characters;
  const top = (mp: Map<string, number>) => [...mp].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, v]) => ({ id, name: C[id]?.name ?? "?", team: team.get(id) ?? "", value: v }));
  return [{ title: "K.O. provocados", rows: top(kos) }, { title: "Daño total", rows: top(dmg) }];
}
