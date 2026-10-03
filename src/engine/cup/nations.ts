// Selecciones nacionales armadas a partir de la base de jugadores (convocatoria estimada por media y posición).
import type { Player, Pos } from "../football/types";

export interface NationMeta { csv: string; name: string; code: string; colors: [string, string]; confed: string }
export interface NationsMetaFile { meta: { worldCup2026?: { groups: Record<string, string[]>; source: string } }; nations: NationMeta[] }
export interface Nation { id: string; name: string; code: string; colors: [string, string]; confed: string; players: Player[]; real: number }
export interface NationsFile { meta: { source: string; updated: string; note: string }; nations: Nation[] }

const LINE: Record<Pos, "POR" | "DEF" | "MED" | "ATA"> = { POR: "POR", DFC: "DEF", LD: "DEF", LI: "DEF", CAD: "DEF", CAI: "DEF", MCD: "MED", MC: "MED", MCO: "MED", MD: "MED", MI: "MED", ED: "ATA", EI: "ATA", DC: "ATA", SD: "ATA" };
const QUOTA = { POR: 3, DEF: 9, MED: 8, ATA: 6 };
export const SQUAD_SIZE = 26, MIN_SQUAD = 23;

// 26 convocados: cupos por línea (3 POR, 9 DEF, 8 MED, 6 ATA) por media; los huecos se completan con los mejores restantes.
export function pickNationalSquad(cands: Player[]): Player[] {
  const sorted = [...cands].sort((a, b) => b.ovr - a.ovr);
  const out: Player[] = [];
  const used = new Set<string>();
  for (const [line, n] of Object.entries(QUOTA)) {
    for (const p of sorted.filter((x) => LINE[x.positions[0]] === line).slice(0, n)) { out.push(p); used.add(p.id); }
  }
  for (const p of sorted) { if (out.length >= SQUAD_SIZE) break; if (!used.has(p.id) && (LINE[p.positions[0]] !== "POR" || out.filter((x) => x.positions[0] === "POR").length < 3)) { out.push(p); used.add(p.id); } }
  return out;
}

// Relleno genérico para selecciones con pocos jugadores en la base (marcado: NO son jugadores reales).
export function fillSquad(nation: { id: string; name: string; csv: string }, squad: Player[]): Player[] {
  const out = [...squad];
  const base = out.length ? Math.max(55, Math.round(out.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 11).reduce((a, b) => a + b, 0) / Math.min(11, out.length)) - 6) : 60;
  const need: Pos[] = [];
  const count = (l: string) => out.filter((p) => LINE[p.positions[0]] === l).length;
  const want: [string, Pos[], number][] = [["POR", ["POR"], 3], ["DEF", ["DFC", "DFC", "LD", "LI", "DFC", "LD", "LI", "DFC"], 8], ["MED", ["MC", "MCD", "MCO", "MC", "MD", "MI", "MC"], 7], ["ATA", ["DC", "ED", "EI", "DC", "SD"], 5]];
  for (const [line, list, n] of want) for (let k = count(line); k < n; k++) need.push(list[k % list.length]);
  let k = 0;
  for (const pos of need) {
    if (out.length >= MIN_SQUAD && count(LINE[pos]) > 0) break;
    const o = base - (k % 4);
    const isGk = pos === "POR";
    out.push({ id: `${nation.id}_r${++k}`, name: `Relleno ${nation.name} ${k}`, shortName: `Relleno ${k}`, clubId: nation.id, positions: [pos], age: 26, nationality: nation.csv, foot: "Diestro", ovr: o, pot: o,
      pac: o, sho: isGk ? 20 : o - 4, pas: o - 3, dri: o - 2, def: isGk ? 20 : o - 6, phy: o, pen: 50, fk: 45, hea: 50, crn: 50, gk: isGk ? { div: o, han: o, kic: o - 5, ref: o, pos: o } : undefined, filler: true, estimated: true });
  }
  return out;
}

export function buildNations(players: Player[], meta: NationMeta[], clubName?: (p: Player) => string | undefined): Nation[] {
  const byNat = new Map<string, Player[]>();
  for (const p of players) { if (p.retired) continue; (byNat.get(p.nationality) ?? byNat.set(p.nationality, []).get(p.nationality)!).push(p); }
  const out: Nation[] = [];
  for (const m of meta) {
    const cands = byNat.get(m.csv) ?? byNat.get(m.name) ?? [];
    if (!cands.length) continue;
    const id = `n_${m.code}`;
    const squad = pickNationalSquad(cands).map((p, i) => ({ ...p, id: `${id}_${i + 1}`, clubName: clubName?.(p) ?? p.clubName, clubId: id, loanFrom: undefined, shirt: i + 1 }));
    out.push({ id, name: m.name, code: m.code, colors: m.colors, confed: m.confed, real: squad.length, players: fillSquad({ id, name: m.name, csv: m.csv }, squad) });
  }
  return out;
}
