// Tablas, criterios de desempate, todos contra todos, sorteo de fase liga y eliminatorias.
import { Rng } from "../../lib/rng";
import type { Fixture } from "./types";

export interface Row {
  club: string; pj: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number;
  hw: number; hd: number; hl: number; hgf: number; hga: number;
  aw: number; ad: number; al: number; agf: number; aga: number;
  form: ("V" | "E" | "D")[];
}

function emptyRow(club: string): Row {
  return { club, pj: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, hw: 0, hd: 0, hl: 0, hgf: 0, hga: 0, aw: 0, ad: 0, al: 0, agf: 0, aga: 0, form: [] };
}

export function computeRows(clubs: string[], fixtures: Fixture[], pointsDeduction: Record<string, number> = {}): Map<string, Row> {
  const rows = new Map(clubs.map((c) => [c, emptyRow(c)]));
  const sorted = fixtures.filter((f) => f.result).sort((a, b) => a.date.localeCompare(b.date));
  for (const f of sorted) {
    const r = f.result!;
    const h = rows.get(f.home), a = rows.get(f.away);
    if (!h || !a) continue;
    h.pj++; a.pj++;
    h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    h.hgf += r.hg; h.hga += r.ag; a.agf += r.ag; a.aga += r.hg;
    if (r.hg > r.ag) { h.w++; h.hw++; a.l++; a.al++; h.pts += 3; h.form.push("V"); a.form.push("D"); }
    else if (r.hg < r.ag) { a.w++; a.aw++; h.l++; h.hl++; a.pts += 3; a.form.push("V"); h.form.push("D"); }
    else { h.d++; a.d++; h.hd++; a.ad++; h.pts++; a.pts++; h.form.push("E"); a.form.push("E"); }
  }
  for (const r of rows.values()) { r.gd = r.gf - r.ga; r.pts -= pointsDeduction[r.club] ?? 0; r.form = r.form.slice(-5); }
  return rows;
}

// Criterios: pts, gd, gf, h2h_pts, h2h_gd, h2h_gf, h2h_away_gf, away_gf, wins, away_wins
export function sortTable(rows: Map<string, Row>, fixtures: Fixture[], tiebreakers: string[], rng?: Rng): Row[] {
  const list = [...rows.values()];
  const h2hCache = new Map<string, Map<string, Row>>();
  const h2h = (group: string[]) => {
    const key = [...group].sort().join("|");
    if (!h2hCache.has(key)) {
      const set = new Set(group);
      h2hCache.set(key, computeRows(group, fixtures.filter((f) => set.has(f.home) && set.has(f.away))));
    }
    return h2hCache.get(key)!;
  };
  const val = (r: Row, crit: string, group: string[]): number => {
    switch (crit) {
      case "pts": return r.pts;
      case "gd": return r.gd;
      case "gf": return r.gf;
      case "wins": return r.w;
      case "away_gf": return r.agf;
      case "away_wins": return r.aw;
      case "h2h_pts": return h2h(group).get(r.club)!.pts;
      case "h2h_gd": return h2h(group).get(r.club)!.gd;
      case "h2h_gf": return h2h(group).get(r.club)!.gf;
      case "h2h_away_gf": return h2h(group).get(r.club)!.agf;
      default: return 0;
    }
  };
  // ordenación por grupos: se aplican criterios en orden; los h2h se calculan entre los empatados
  const rank = (group: Row[], critIdx: number): Row[] => {
    if (group.length <= 1 || critIdx >= tiebreakers.length) {
      // sorteo / orden alfabético estable
      return rng ? rng.shuffle([...group]) : [...group].sort((a, b) => a.club.localeCompare(b.club));
    }
    const crit = tiebreakers[critIdx];
    const ids = group.map((r) => r.club);
    const buckets = new Map<number, Row[]>();
    for (const r of group) {
      const v = val(r, crit, ids);
      (buckets.get(v) ?? buckets.set(v, []).get(v)!).push(r);
    }
    const keys = [...buckets.keys()].sort((a, b) => b - a);
    const out: Row[] = [];
    for (const k of keys) out.push(...rank(buckets.get(k)!, critIdx + 1));
    return out;
  };
  return rank(list, 0);
}

export const TIEBREAK_LABEL: Record<string, string> = {
  pts: "Puntos", gd: "Diferencia de goles", gf: "Goles a favor", wins: "Victorias", away_gf: "Goles como visitante", away_wins: "Victorias como visitante",
  h2h_pts: "Puntos en enfrentamientos directos", h2h_gd: "Diferencia de goles en enfrentamientos directos", h2h_gf: "Goles en enfrentamientos directos", h2h_away_gf: "Goles de visitante en enfrentamientos directos",
};
export const UEFA_TIEBREAKERS = ["pts", "gd", "gf", "away_gf", "wins", "away_wins"];

// Todos contra todos (método del círculo), doble vuelta.
export function roundRobin(clubs: string[], rng: Rng): [string, string][][] {
  const teams = rng.shuffle([...clubs]);
  if (teams.length % 2) teams.push("__BYE__");
  const n = teams.length;
  const rounds: [string, string][][] = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === "__BYE__" || b === "__BYE__") continue;
      // alternar localía
      const flip = (r + i) % 2 === 0;
      round.push(i === 0 ? (r % 2 === 0 ? [a, b] : [b, a]) : flip ? [a, b] : [b, a]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  const second = rounds.map((r) => r.map(([h, a]) => [a, h] as [string, string]));
  return [...rounds, ...second];
}

// ===== Sorteo de la fase liga (formato suizo UEFA) =====
// pots: bombos en orden. matchesPerTeam 8 (4 bombos, 2 rivales por bombo) o 6 (6 bombos, 1 rival por bombo).
export function swissDraw(pots: string[][], country: (c: string) => string, rng: Rng, matchesPerTeam: number): [string, string][] | null {
  const perPot = matchesPerTeam / pots.length; // 2 o 1
  for (let attempt = 0; attempt < 400; attempt++) {
    const matches: [string, string][] = [];
    const opp = new Map<string, string[]>();
    const add = (h: string, a: string) => { matches.push([h, a]); (opp.get(h) ?? opp.set(h, []).get(h)!).push(a); (opp.get(a) ?? opp.set(a, []).get(a)!).push(h); };
    const countryCount = (c: string, ctry: string) => (opp.get(c) ?? []).filter((o) => country(o) === ctry).length;
    const okPair = (a: string, b: string) => a !== b && country(a) !== country(b) && !(opp.get(a) ?? []).includes(b) && countryCount(a, country(b)) < 2 && countryCount(b, country(a)) < 2;
    let fail = false;
    for (let i = 0; i < pots.length && !fail; i++) {
      for (let j = i; j < pots.length && !fail; j++) {
        const A = pots[i], B = pots[j];
        if (perPot === 2) {
          if (i === j) {
            // permutación sin puntos fijos ni 2-ciclos: a recibe a p(a)
            const p = findPerm(A, A, (a, b) => okPair(a, b), rng, (perm) => A.every((a, k) => perm[A.indexOf(perm[k])] !== a));
            if (!p) { fail = true; break; }
            A.forEach((a, k) => add(a, p[k]));
          } else {
            const p1 = findPerm(A, B, okPair, rng);
            if (!p1) { fail = true; break; }
            A.forEach((a, k) => add(a, p1[k]));
            const p2 = findPerm(A, B, okPair, rng);
            if (!p2) { fail = true; break; }
            A.forEach((a, k) => add(p2[k], a));
          }
        } else {
          if (i === j) {
            // emparejamiento perfecto dentro del bombo
            const m = findMatching(A, okPair, rng);
            if (!m) { fail = true; break; }
            m.forEach(([a, b]) => add(a, b));
          } else {
            const p = findPerm(A, B, okPair, rng);
            if (!p) { fail = true; break; }
            A.forEach((a, k) => add(a, p[k]));
          }
        }
      }
    }
    if (fail) continue;
    if (perPot === 1) orientBalanced(matches, rng);
    return matches;
  }
  return null;
}

function findPerm(A: string[], B: string[], ok: (a: string, b: string) => boolean, rng: Rng, final?: (perm: string[]) => boolean): string[] | null {
  for (let t = 0; t < 200; t++) {
    const used = new Set<string>();
    const perm: string[] = [];
    const order = A.map((_, i) => i);
    let steps = 0;
    const rec = (k: number): boolean => {
      if (++steps > 5000) return false;
      if (k === A.length) return final ? final(perm) : true;
      const cands = rng.shuffle(B.filter((b) => !used.has(b) && ok(A[k], b)));
      for (const b of cands) {
        used.add(b); perm[k] = b;
        if (rec(k + 1)) return true;
        used.delete(b);
      }
      return false;
    };
    void order;
    if (rec(0)) return perm;
  }
  return null;
}

function findMatching(A: string[], ok: (a: string, b: string) => boolean, rng: Rng): [string, string][] | null {
  for (let t = 0; t < 200; t++) {
    const rest = rng.shuffle([...A]);
    const out: [string, string][] = [];
    let good = true;
    while (rest.length) {
      const a = rest.shift()!;
      const i = rest.findIndex((b) => ok(a, b));
      if (i < 0) { good = false; break; }
      out.push([a, rest.splice(i, 1)[0]]);
    }
    if (good) return out;
  }
  return null;
}

// Orienta los partidos para que cada equipo tenga mitad local, mitad visitante (grafo de grado par: circuito euleriano).
function orientBalanced(matches: [string, string][], rng: Rng) {
  for (let t = 0; t < 300; t++) {
    const home = new Map<string, number>();
    for (const m of matches) if (rng.chance(0.5)) { const x = m[0]; m[0] = m[1]; m[1] = x; }
    // corrección local
    for (let it = 0; it < 200; it++) {
      home.clear();
      const deg = new Map<string, number>();
      for (const [h, a] of matches) { home.set(h, (home.get(h) ?? 0) + 1); deg.set(h, (deg.get(h) ?? 0) + 1); deg.set(a, (deg.get(a) ?? 0) + 1); }
      const bad = matches.find(([h, a]) => (home.get(h) ?? 0) > (deg.get(h)! / 2) && (home.get(a) ?? 0) < deg.get(a)! / 2);
      if (!bad) break;
      const x = bad[0]; bad[0] = bad[1]; bad[1] = x;
    }
    const deg = new Map<string, number>();
    home.clear();
    for (const [h, a] of matches) { home.set(h, (home.get(h) ?? 0) + 1); deg.set(h, (deg.get(h) ?? 0) + 1); deg.set(a, (deg.get(a) ?? 0) + 1); }
    if ([...deg.entries()].every(([c, d]) => Math.abs((home.get(c) ?? 0) - d / 2) <= 0.5)) return;
  }
}

// Reparte partidos en jornadas: cada equipo juega una vez por jornada.
export function scheduleRounds(matches: [string, string][], rounds: number, rng: Rng): [string, string][][] {
  for (let attempt = 0; attempt < 300; attempt++) {
    let remaining = rng.shuffle([...matches]);
    const out: [string, string][][] = [];
    let ok = true;
    for (let r = 0; r < rounds; r++) {
      const teams = new Set<string>();
      for (const [h, a] of remaining) { teams.add(h); teams.add(a); }
      const m = perfectMatching([...teams], remaining, rng);
      if (!m) { ok = false; break; }
      out.push(m);
      const used = new Set(m);
      remaining = remaining.filter((x) => !used.has(x));
    }
    if (ok && remaining.length === 0) return out;
  }
  // último recurso: voraz
  const out: [string, string][][] = Array.from({ length: rounds }, () => []);
  for (const m of matches) {
    const r = out.findIndex((rd) => !rd.some(([h, a]) => [h, a].includes(m[0]) || [h, a].includes(m[1])));
    (out[r >= 0 ? r : rounds - 1]).push(m);
  }
  return out;
}

function perfectMatching(teams: string[], edges: [string, string][], rng: Rng): [string, string][] | null {
  const adj = new Map<string, [string, string][]>();
  for (const e of edges) { (adj.get(e[0]) ?? adj.set(e[0], []).get(e[0])!).push(e); (adj.get(e[1]) ?? adj.set(e[1], []).get(e[1])!).push(e); }
  const matched = new Set<string>();
  const chosen: [string, string][] = [];
  let steps = 0;
  const rec = (): boolean => {
    if (++steps > 20000) return false;
    if (matched.size === teams.length) return true;
    // equipo con menos opciones
    let best: string | null = null, bestN = 1e9;
    for (const t of teams) {
      if (matched.has(t)) continue;
      const n = (adj.get(t) ?? []).filter(([h, a]) => !matched.has(h) && !matched.has(a)).length;
      if (n < bestN) { bestN = n; best = t; }
    }
    if (!best || bestN === 0) return false;
    const opts = rng.shuffle((adj.get(best) ?? []).filter(([h, a]) => !matched.has(h) && !matched.has(a)));
    for (const e of opts) {
      matched.add(e[0]); matched.add(e[1]); chosen.push(e);
      if (rec()) return true;
      matched.delete(e[0]); matched.delete(e[1]); chosen.pop();
    }
    return false;
  };
  return rec() ? chosen : null;
}

// ===== Eliminatorias =====
export interface TieOutcome { winner: string; loser: string; decided: boolean }

export function tieOutcome(legs: Fixture[]): TieOutcome | null {
  if (!legs.length || legs.some((f) => !f.result)) return null;
  const last = legs[legs.length - 1];
  const a = last.home, b = last.away;
  let ga = 0, gb = 0;
  for (const f of legs) {
    if (f.home === a) { ga += f.result!.hg; gb += f.result!.ag; } else { ga += f.result!.ag; gb += f.result!.hg; }
  }
  if (ga > gb) return { winner: a, loser: b, decided: true };
  if (gb > ga) return { winner: b, loser: a, decided: true };
  const p = last.result!.pens;
  if (p && p[0] !== p[1]) return p[0] > p[1] ? { winner: a, loser: b, decided: true } : { winner: b, loser: a, decided: true };
  // sin penales registrados: gana el local (no debería ocurrir)
  return { winner: a, loser: b, decided: false };
}

export function roundName(teams: number): string {
  return ({ 2: "Final", 4: "Semifinales", 8: "Cuartos de final", 16: "Octavos de final", 32: "Dieciseisavos", 64: "Treintaidosavos", 128: "Ronda 128" } as Record<number, string>)[teams] ?? `Ronda de ${teams}`;
}
