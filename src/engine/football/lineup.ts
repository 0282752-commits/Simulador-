import type { Club, Lineup, Player, Pos, Tactics } from "./types";

export interface Slot { pos: Pos; x: number; y: number }

// x: 0 izquierda - 100 derecha; y: 0 portería propia - 100 portería rival
const S = (pos: Pos, x: number, y: number): Slot => ({ pos, x, y });
export const FORMATIONS: Record<string, Slot[]> = {
  "4-3-3": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MC", 30, 48), S("MCD", 50, 40), S("MC", 70, 48), S("EI", 15, 75), S("DC", 50, 82), S("ED", 85, 75)],
  "4-2-3-1": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MCD", 38, 42), S("MCD", 62, 42), S("EI", 15, 66), S("MCO", 50, 64), S("ED", 85, 66), S("DC", 50, 84)],
  "4-4-2": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MI", 12, 55), S("MC", 38, 48), S("MC", 62, 48), S("MD", 88, 55), S("DC", 38, 80), S("DC", 62, 80)],
  "4-1-2-1-2": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MCD", 50, 38), S("MC", 30, 52), S("MC", 70, 52), S("MCO", 50, 65), S("DC", 38, 82), S("DC", 62, 82)],
  "4-5-1": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MI", 12, 58), S("MC", 32, 50), S("MCD", 50, 42), S("MC", 68, 50), S("MD", 88, 58), S("DC", 50, 82)],
  "3-5-2": [S("POR", 50, 5), S("DFC", 28, 20), S("DFC", 50, 18), S("DFC", 72, 20), S("CAI", 10, 50), S("MC", 33, 48), S("MCD", 50, 40), S("MC", 67, 48), S("CAD", 90, 50), S("DC", 38, 80), S("DC", 62, 80)],
  "3-4-3": [S("POR", 50, 5), S("DFC", 28, 20), S("DFC", 50, 18), S("DFC", 72, 20), S("MI", 10, 50), S("MC", 38, 46), S("MC", 62, 46), S("MD", 90, 50), S("EI", 18, 76), S("DC", 50, 82), S("ED", 82, 76)],
  "5-3-2": [S("POR", 50, 5), S("CAI", 8, 32), S("DFC", 30, 20), S("DFC", 50, 18), S("DFC", 70, 20), S("CAD", 92, 32), S("MC", 30, 50), S("MCD", 50, 44), S("MC", 70, 50), S("DC", 38, 80), S("DC", 62, 80)],
  "5-4-1": [S("POR", 50, 5), S("CAI", 8, 32), S("DFC", 30, 20), S("DFC", 50, 18), S("DFC", 70, 20), S("CAD", 92, 32), S("MI", 14, 58), S("MC", 38, 50), S("MC", 62, 50), S("MD", 86, 58), S("DC", 50, 82)],
  "4-3-2-1": [S("POR", 50, 5), S("LI", 12, 25), S("DFC", 37, 20), S("DFC", 63, 20), S("LD", 88, 25), S("MC", 30, 46), S("MCD", 50, 40), S("MC", 70, 46), S("MCO", 35, 66), S("MCO", 65, 66), S("DC", 50, 84)],
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

export function slotsOf(lineup: Lineup): Slot[] {
  return lineup.customSlots ?? FORMATIONS[lineup.formation] ?? FORMATIONS["4-3-3"];
}

// Compatibilidad entre posiciones (1 = natural).
const GROUPS: Record<Pos, Pos[][]> = {
  POR: [["POR"]],
  DFC: [["DFC"], ["MCD", "LD", "LI"], ["CAD", "CAI"]],
  LD: [["LD", "CAD"], ["DFC", "MD"], ["LI", "CAI", "ED"]],
  LI: [["LI", "CAI"], ["DFC", "MI"], ["LD", "CAD", "EI"]],
  CAD: [["CAD", "LD"], ["MD", "ED"], ["LI", "CAI"]],
  CAI: [["CAI", "LI"], ["MI", "EI"], ["LD", "CAD"]],
  MCD: [["MCD"], ["MC", "DFC"], ["MCO"]],
  MC: [["MC"], ["MCD", "MCO"], ["MI", "MD"]],
  MCO: [["MCO"], ["MC", "SD"], ["EI", "ED", "DC"]],
  MD: [["MD", "ED"], ["MC", "CAD"], ["MI", "EI", "LD"]],
  MI: [["MI", "EI"], ["MC", "CAI"], ["MD", "ED", "LI"]],
  ED: [["ED", "MD"], ["EI", "SD", "MCO"], ["DC", "MI"]],
  EI: [["EI", "MI"], ["ED", "SD", "MCO"], ["DC", "MD"]],
  DC: [["DC", "SD"], ["EI", "ED", "MCO"], ["MC"]],
  SD: [["SD", "DC", "MCO"], ["EI", "ED"], ["MC"]],
};

export function posFit(p: Player, slot: Pos): number {
  if (slot === "POR") return p.positions.includes("POR") ? 1 : 0.35;
  if (p.positions[0] === "POR") return 0.4;
  const g = GROUPS[slot];
  let best = 0.6;
  p.positions.forEach((pp, i) => {
    const primaryPenalty = i === 0 ? 0 : 0.01;
    for (let k = 0; k < g.length; k++) {
      if (g[k].includes(pp)) {
        const v = [1, 0.93, 0.84][k] - primaryPenalty;
        if (v > best) best = v;
      }
    }
  });
  return best;
}

// Valoración del jugador en un hueco concreto (sin estado físico).
export function slotRating(p: Player, slot: Pos): number {
  if (slot === "POR") {
    if (p.gk) return p.positions.includes("POR") ? p.ovr : (p.gk.div + p.gk.han + p.gk.ref + p.gk.pos) / 4;
    return 30;
  }
  const w = ATTR_WEIGHTS[slot];
  const raw = (p.pac * w[0] + p.sho * w[1] + p.pas * w[2] + p.dri * w[3] + p.def * w[4] + p.phy * w[5]) / (w[0] + w[1] + w[2] + w[3] + w[4] + w[5]);
  // mezcla con overall para suavizar
  const base = 0.55 * p.ovr + 0.45 * (raw + 6);
  return base * posFit(p, slot);
}

// Pesos PAC, SHO, PAS, DRI, DEF, PHY por posición
export const ATTR_WEIGHTS: Record<Pos, number[]> = {
  POR: [0, 0, 0, 0, 0, 0],
  DFC: [1.2, 0.1, 0.8, 0.3, 4.5, 2.6],
  LD: [2.4, 0.2, 1.6, 1.2, 3.0, 1.2],
  LI: [2.4, 0.2, 1.6, 1.2, 3.0, 1.2],
  CAD: [2.6, 0.4, 1.8, 1.6, 2.2, 1.2],
  CAI: [2.6, 0.4, 1.8, 1.6, 2.2, 1.2],
  MCD: [0.6, 0.4, 2.4, 1.2, 3.2, 2.2],
  MC: [0.8, 1.0, 3.4, 2.4, 1.4, 1.2],
  MCO: [1.0, 2.2, 3.2, 3.4, 0.2, 0.6],
  MD: [2.4, 1.4, 2.4, 2.6, 0.6, 0.6],
  MI: [2.4, 1.4, 2.4, 2.6, 0.6, 0.6],
  ED: [2.8, 2.2, 1.8, 3.2, 0.1, 0.5],
  EI: [2.8, 2.2, 1.8, 3.2, 0.1, 0.5],
  DC: [2.2, 4.4, 0.8, 2.2, 0.1, 1.6],
  SD: [2.0, 3.4, 2.0, 3.0, 0.1, 0.9],
};

export const DEFAULT_TACTICS: Tactics = { mentality: "equilibrada", pressing: "medio", tempo: "normal" };

export interface Availability {
  (playerId: string): { ok: boolean; fitness: number; form: number };
}

// Mejor once: asignación voraz por huecos más exigentes primero.
export function bestEleven(players: Player[], formation: string, avail?: Availability, rotate = false): Lineup {
  const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  const cache = new Map<string, ReturnType<Availability>>();
  const av = (id: string) => { let a = cache.get(id); if (!a) { a = avail!(id); cache.set(id, a); } return a; };
  const usable = players.filter((p) => !p.retired && (!avail || av(p.id).ok));
  const byId = new Map(usable.map((p) => [p.id, p]));
  const memo = new Map<string, number>();
  const score = (p: Player, pos: Pos) => {
    const key = p.id + pos;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let s = slotRating(p, pos);
    if (avail) {
      const a = av(p.id);
      s += a.form * 0.8;
      if (rotate) s -= Math.max(0, 88 - a.fitness) * 0.45;
      else s -= Math.max(0, 70 - a.fitness) * 0.5;
    }
    memo.set(key, s);
    return s;
  };
  const used = new Set<string>();
  const starters: (string | null)[] = new Array(slots.length).fill(null);
  // orden: portero, luego posiciones con menos candidatos naturales
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a].pos === "POR" ? -1 : slots[b].pos === "POR" ? 1 : 0));
  for (const i of order) {
    let best: Player | null = null;
    let bestS = -1e9;
    for (const p of usable) {
      if (used.has(p.id)) continue;
      const s = score(p, slots[i].pos);
      if (s > bestS) { bestS = s; best = p; }
    }
    if (best) { starters[i] = best.id; used.add(best.id); }
  }
  // Mejora local: intercambios que aumenten el total
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = starters[i], b = starters[j];
      if (!a || !b) continue;
      const pa = byId.get(a)!, pb = byId.get(b)!;
      const cur = score(pa, slots[i].pos) + score(pb, slots[j].pos);
      const sw = score(pb, slots[i].pos) + score(pa, slots[j].pos);
      if (sw > cur + 0.01) { starters[i] = b; starters[j] = a; }
    }
  }
  // Banca: portero suplente + mejores restantes variados
  const rest = usable.filter((p) => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  const bench: string[] = [];
  const gk = rest.find((p) => p.positions[0] === "POR");
  if (gk) bench.push(gk.id);
  for (const p of rest) {
    if (bench.length >= 9) break;
    if (p.id === gk?.id) continue;
    if (p.positions[0] === "POR") continue;
    bench.push(p.id);
  }
  const xi = starters.filter(Boolean).map((id) => byId.get(id!)!) as Player[];
  const outfield = xi.filter((p) => p.positions[0] !== "POR");
  const by = (f: (p: Player) => number) => [...outfield].sort((a, b) => f(b) - f(a))[0]?.id;
  return {
    formation,
    starters,
    bench,
    captain: [...xi].sort((a, b) => b.ovr + b.age * 0.3 - (a.ovr + a.age * 0.3))[0]?.id,
    penaltyTaker: by((p) => p.pen + p.sho * 0.3),
    fkTaker: by((p) => p.fk + p.pas * 0.2),
    cornerTaker: by((p) => p.crn + p.pas * 0.2),
    tactics: { ...DEFAULT_TACTICS },
    autoRotate: true,
  };
}

// Elige formación que mejor encaja con la plantilla.
export function bestFormation(players: Player[], avail?: Availability): string {
  let best = "4-3-3", bestV = -1;
  for (const f of ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "5-3-2", "4-1-2-1-2", "3-4-3"]) {
    const l = bestEleven(players, f, avail);
    const v = lineupStrength(l, players);
    if (v > bestV) { bestV = v; best = f; }
  }
  return best;
}

export function lineupStrength(l: Lineup, players: Player[]): number {
  const slots = slotsOf(l);
  let t = 0;
  l.starters.forEach((id, i) => {
    const p = players.find((x) => x.id === id);
    if (p) t += slotRating(p, slots[i].pos);
  });
  return t / 11;
}

export function squadOf(clubId: string, players: Record<string, Player>): Player[] {
  return Object.values(players).filter((p) => p.clubId === clubId && !p.retired);
}

// Asegura una alineación válida (sin jugadores que ya no están, etc.).
export function ensureLineup(club: Club, squad: Player[], avail?: Availability): Lineup {
  const l = club.lineup;
  if (!l) return bestEleven(squad, bestFormation(squad), avail);
  const ids = new Set(squad.map((p) => p.id));
  const bad = l.starters.some((id) => !id || !ids.has(id) || (avail && !avail(id).ok));
  if (l.autoRotate || bad) {
    const nl = bestEleven(squad, l.formation, avail, l.autoRotate);
    // conserva lanzadores/capitán si siguen disponibles
    const keep = (id?: string) => (id && nl.starters.includes(id) ? id : undefined);
    return {
      ...nl,
      customSlots: l.customSlots,
      tactics: l.tactics,
      autoRotate: l.autoRotate,
      captain: keep(l.captain) ?? nl.captain,
      penaltyTaker: keep(l.penaltyTaker) ?? nl.penaltyTaker,
      fkTaker: keep(l.fkTaker) ?? nl.fkTaker,
      cornerTaker: keep(l.cornerTaker) ?? nl.cornerTaker,
    };
  }
  return { ...l, bench: l.bench.filter((id) => ids.has(id) && (!avail || avail(id).ok)) };
}
