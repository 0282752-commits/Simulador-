import type { DepthSlot, NflPlayer, NflPos, NflTeam } from "./types";
import { DEPTH_SLOTS, DEPTH_STARTERS } from "./types";

export const SLOT_POS: Record<DepthSlot, NflPos[]> = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], OL: ["OT", "OG", "C"], DL: ["DE", "DT"], LB: ["LB"], CB: ["CB"], S: ["S"], K: ["K"], P: ["P"],
};

// Valoración de un jugador en un puesto del depth chart
export function slotValue(p: NflPlayer, slot: DepthSlot): number {
  const natural = SLOT_POS[slot].includes(p.pos);
  const pen = natural ? 0 : 18;
  switch (slot) {
    case "QB": return (natural ? p.ovr : (p.tha + p.thp) / 2 - 10) - pen;
    case "RB": return (natural ? p.ovr : (p.car + p.spd) / 2) - pen;
    case "WR": return (natural ? p.ovr : (p.cth + p.spd) / 2) - pen;
    case "TE": return (natural ? p.ovr : (p.cth + p.rbk) / 2) - pen;
    case "OL": return (natural ? p.ovr : (p.rbk + p.pbk) / 2) - pen;
    case "DL": return (natural ? p.ovr : (p.prs + p.str) / 2) - pen;
    case "LB": return (natural ? p.ovr : (p.tak + p.cov) / 2) - pen;
    case "CB": return (natural ? p.ovr : (p.cov + p.spd) / 2) - pen;
    case "S": return (natural ? p.ovr : (p.cov + p.tak) / 2) - pen;
    case "K": return (natural ? p.ovr : (p.kpw + p.kac) / 2 - 10) - pen;
    case "P": return (natural ? p.ovr : p.kpw - 10) - pen;
  }
}

export function autoDepth(players: NflPlayer[], available: (p: NflPlayer) => boolean = () => true): Record<DepthSlot, string[]> {
  const pool = players.filter((p) => !p.practiceSquad && !p.retired && available(p));
  const out = {} as Record<DepthSlot, string[]>;
  for (const slot of DEPTH_SLOTS) {
    const nat = pool.filter((p) => SLOT_POS[slot].includes(p.pos)).sort((a, b) => slotValue(b, slot) - slotValue(a, slot));
    out[slot] = nat.map((p) => p.id);
  }
  // si falta gente en un puesto, completar con el mejor de otras posiciones
  for (const slot of DEPTH_SLOTS) {
    const need = DEPTH_STARTERS[slot] + 1;
    if (out[slot].length >= need) continue;
    const extra = pool.filter((p) => !out[slot].includes(p.id)).sort((a, b) => slotValue(b, slot) - slotValue(a, slot)).slice(0, need - out[slot].length);
    out[slot].push(...extra.map((p) => p.id));
  }
  return out;
}

export function teamDepth(team: NflTeam, roster: NflPlayer[], available: (p: NflPlayer) => boolean = () => true): Record<DepthSlot, string[]> {
  const auto = autoDepth(roster, available);
  if (team.autoDepth !== false || !team.depth) return auto;
  const ids = new Set(roster.filter((p) => !p.practiceSquad && available(p)).map((p) => p.id));
  const out = {} as Record<DepthSlot, string[]>;
  for (const slot of DEPTH_SLOTS) {
    const manual = (team.depth[slot] ?? []).filter((id) => ids.has(id));
    out[slot] = [...manual, ...auto[slot].filter((id) => !manual.includes(id))];
  }
  return out;
}

export function teamOverall(roster: NflPlayer[], depth: Record<DepthSlot, string[]>): { off: number; def: number; st: number; ovr: number } {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const avg = (slot: DepthSlot) => {
    const ids = depth[slot].slice(0, DEPTH_STARTERS[slot]);
    const v = ids.map((id) => byId.get(id)).filter(Boolean).map((p) => slotValue(p!, slot));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 40;
  };
  const off = avg("QB") * 0.35 + avg("RB") * 0.08 + avg("WR") * 0.2 + avg("TE") * 0.07 + avg("OL") * 0.3;
  const def = avg("DL") * 0.33 + avg("LB") * 0.22 + avg("CB") * 0.27 + avg("S") * 0.18;
  const st = (avg("K") + avg("P")) / 2;
  return { off: Math.round(off), def: Math.round(def), st: Math.round(st), ovr: Math.round(off * 0.5 + def * 0.44 + st * 0.06) };
}
