// Sorteos "como en la vida real": bombos, bolas una a una y restricciones (confederación, mismo grupo,
// cabezas de serie contra no cabezas). Todo sale de la semilla del torneo (+ una sal por sorteo para repetirlo),
// así que al recalcular el torneo el sorteo es el mismo y la UI puede reproducirlo bola a bola.
import { Rng } from "../../lib/rng";
import { swissDraw, scheduleRounds } from "../football/competitions";
import type { CupDraw, CupSave, DrawStep } from "./types";

export const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const hashSeed = (seed: number, key: string) => { let h = (seed ^ 0x9e3779b9) >>> 0; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0; return h % 2147483646 + 1; };
export const drawRng = (save: CupSave, key: string) => new Rng(hashSeed(save.seed + (save.drawSalt?.[key] ?? 0), key));
export function shuffle<T>(a: readonly T[], rng: Rng): T[] { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = rng.int(0, i); [x[i], x[j]] = [x[j], x[i]]; } return x; }

// ¿Se puede asignar cada elemento de A a uno distinto de B respetando ok? (backtracking pequeño)
function feasible<T, U>(A: T[], B: U[], ok: (a: T, b: U) => boolean): boolean {
  const used = new Set<number>();
  let steps = 0;
  const rec = (i: number): boolean => {
    if (i === A.length) return true;
    if (++steps > 20000) return true; // no bloquear: se acepta
    for (let j = 0; j < B.length; j++) if (!used.has(j) && ok(A[i], B[j])) { used.add(j); if (rec(i + 1)) return true; used.delete(j); }
    return false;
  };
  return rec(0);
}

// ----- Restricciones de grupo -----
function groupRule(save: CupSave): { label: string; max: (sub: string) => number } | null {
  if (save.sport === "selecciones") return { label: "Máximo una selección por confederación en cada grupo (dos de la UEFA)", max: (s) => (s === "UEFA" ? 2 : 1) };
  return null;
}

export function drawGroups(save: CupSave): { groups: Record<string, string[]>; draw: CupDraw } {
  const f = save.format, rng = drawRng(save, "grupos");
  const G = f.groups;
  const ordered = f.seeding === "fuerza" ? [...save.participants] : shuffle(save.participants, rng);
  const pots: string[][] = [];
  for (let i = 0; i < ordered.length; i += G) pots.push(ordered.slice(i, i + G));
  const rule = groupRule(save);
  const sub = (t: string) => save.teams[t]?.sub ?? "";
  const groups: string[][] = Array.from({ length: G }, () => []);
  const steps: DrawStep[] = [];
  let strict = true;
  // si hay demasiados de una confederación para el reparto ideal, el tope sube lo justo (como haría FIFA)
  const count = new Map<string, number>(); for (const t of ordered) count.set(sub(t), (count.get(sub(t)) ?? 0) + 1);
  const cap = (x: string) => Math.max(rule?.max(x) ?? 99, Math.ceil((count.get(x) ?? 0) / G));
  const ok = (t: string, gi: number) => !rule || !strict || groups[gi].filter((x) => sub(x) === sub(t)).length < cap(sub(t));
  pots.forEach((pot, pi) => {
    const order = shuffle(pot, rng);
    order.forEach((t, k) => {
      const free = [...Array(G).keys()].filter((gi) => groups[gi].length === pi);
      const rest = order.slice(k + 1);
      const can = (gi: number) => ok(t, gi) && feasible(rest, free.filter((x) => x !== gi), (a, g) => ok(a, g));
      let gi = free.find(can);
      const skipped = free.slice(0, gi === undefined ? 0 : free.indexOf(gi)).filter((x) => !ok(t, x));
      if (gi === undefined) { strict = false; gi = free[0]; }
      groups[gi].push(t);
      steps.push({ team: t, pot: pi, target: GROUP_LETTERS[gi], note: skipped.length ? `No puede ir al grupo ${skipped.map((x) => GROUP_LETTERS[x]).join(", ")} (misma confederación)` : undefined });
    });
  });
  const out = Object.fromEntries(groups.map((ids, i) => [GROUP_LETTERS[i], ids]));
  return {
    groups: out,
    draw: { key: "grupos", title: "Sorteo de la fase de grupos", kind: "grupos", potNames: pots.map((_, i) => `Bombo ${i + 1}`), pots, steps, targets: Object.keys(out), rules: [f.seeding === "fuerza" ? "Bombos por fuerza del equipo (bombo 1 = los mejores)" : "Bombos sorteados al azar", "Un equipo de cada bombo por grupo; cada bola va al primer grupo libre en orden alfabético que cumpla las reglas", ...(rule ? [rule.label] : [])] },
  };
}

// Recreación de un sorteo real ya conocido (grupos fijos): bombos por fuerza dentro de cada grupo
export function replayGroups(save: CupSave, groups: Record<string, string[]>, hosts: string[] = []): CupDraw {
  const rng = drawRng(save, "grupos-real");
  const letters = Object.keys(groups);
  const size = Math.max(...Object.values(groups).map((g) => g.length));
  const pots: string[][] = Array.from({ length: size }, () => []);
  const where = new Map<string, string>();
  for (const g of letters) {
    const sorted = [...groups[g]].sort((a, b) => (hosts.includes(b) ? 1 : 0) - (hosts.includes(a) ? 1 : 0) || save.teams[b].strength - save.teams[a].strength);
    sorted.forEach((t, k) => { pots[k].push(t); where.set(t, g); });
  }
  const steps: DrawStep[] = [];
  pots.forEach((pot, pi) => {
    const order = pi === 0 ? [...pot.filter((t) => hosts.includes(t)), ...shuffle(pot.filter((t) => !hosts.includes(t)), rng)] : shuffle(pot, rng);
    for (const t of order) steps.push({ team: t, pot: pi, target: where.get(t)!, note: hosts.includes(t) ? "Anfitrión: grupo asignado de antemano" : undefined });
  });
  return { key: "grupos", title: "Sorteo de la fase de grupos (recreación del sorteo real)", kind: "grupos", potNames: pots.map((_, i) => `Bombo ${i + 1}`), pots, steps, targets: letters, rules: ["Grupos reales del sorteo del 5 de diciembre de 2025", "El orden de las bolas y la composición de los bombos son una recreación"], real: true };
}

// ----- Cruces de eliminatoria -----
export interface DrawnTie { first: string; second: string; seeded?: string }
// seeded: cabezas de serie (juegan la vuelta en casa) contra no cabezas; open: todos en un bombo, el primero en salir es local
export function drawTies(save: CupSave, key: string, title: string, pool: { seeded?: string[]; unseeded?: string[]; open?: string[] }, avoid?: { fn: (a: string, b: string) => boolean; label: string }[]): { ties: DrawnTie[]; draw: CupDraw } {
  const rng = drawRng(save, key);
  const steps: DrawStep[] = [];
  const ties: DrawnTie[] = [];
  const rules: string[] = [];
  if (pool.seeded && pool.unseeded) {
    rules.push("Cabezas de serie contra no cabezas de serie; el cabeza de serie juega la vuelta (o el partido único) en casa");
    const levels = avoid ?? [];
    rules.push(...levels.map((l) => l.label));
    const ok = (lvl: number) => (u: string, s: string) => levels.slice(0, lvl).every((l) => l.fn(u, s));
    const order = shuffle(pool.unseeded, rng);
    const left = [...pool.seeded];
    order.forEach((u, i) => {
      const rest = order.slice(i + 1);
      let pick: string | undefined, skipped: string[] = [];
      for (let lvl = levels.length; lvl >= 0 && !pick; lvl--) {
        const okL = ok(lvl);
        const cands = left.filter((s) => okL(u, s) && feasible(rest, left.filter((x) => x !== s), okL));
        if (cands.length) { pick = cands[rng.int(0, cands.length - 1)]; skipped = left.filter((s) => !okL(u, s)); }
      }
      pick ??= left[0];
      left.splice(left.indexOf(pick), 1);
      const target = `Cruce ${i + 1}`;
      steps.push({ team: u, pot: 1, target });
      steps.push({ team: pick, pot: 0, target, note: skipped.length ? `No podía tocarle: ${skipped.map((x) => save.teams[x]?.short ?? x).join(", ")}` : undefined });
      ties.push({ first: u, second: pick, seeded: pick });
    });
    return { ties, draw: { key, title, kind: "cruces", potNames: ["Cabezas de serie", "No cabezas de serie"], pots: [pool.seeded, pool.unseeded], steps, targets: ties.map((_, i) => `Cruce ${i + 1}`), rules } };
  }
  const order = shuffle(pool.open ?? [], rng);
  rules.push("Sorteo puro: todos en el mismo bombo; el primero en salir de cada cruce juega en casa (la ida si es a doble partido)");
  for (let i = 0; i + 1 < order.length; i += 2) {
    const target = `Cruce ${i / 2 + 1}`;
    steps.push({ team: order[i], pot: 0, target }, { team: order[i + 1], pot: 0, target });
    ties.push({ first: order[i], second: order[i + 1] });
  }
  return { ties, draw: { key, title, kind: "cruces", potNames: ["Bombo único"], pots: [pool.open ?? []], steps, targets: ties.map((_, i) => `Cruce ${i + 1}`), rules } };
}

// ----- Fase liga estilo Champions (bombos, 2 rivales de cada bombo) -----
export function drawSwiss(save: CupSave, roundRobinFallback: () => [string, string][][]): { rounds: [string, string][][]; draw: CupDraw } {
  const f = save.format, P = save.participants, N = P.length, M = f.swissMatches;
  const rng = drawRng(save, "suizo");
  const nPots = M === 8 && N % 4 === 0 && N >= 16 ? 4 : M === 6 && N % 6 === 0 && (N / 6) % 2 === 0 ? 6 : 0;
  const ordered = f.seeding === "fuerza" ? [...P] : shuffle(P, rng);
  let pairs: [string, string][] | null = null;
  let pots: string[][] = [];
  const country = (t: string) => t; // sin restricción de liga/país
  if (nPots) {
    const size = N / nPots;
    pots = Array.from({ length: nPots }, (_, i) => ordered.slice(i * size, (i + 1) * size));
    pairs = swissDraw(pots.map((p) => [...p]), country, rng, M);
  }
  let rounds: [string, string][][];
  if (pairs) rounds = scheduleRounds(pairs, M, rng);
  else { rounds = roundRobinFallback(); pots = [ordered]; }
  const all = rounds.flat();
  const potOf = new Map<string, number>(); pots.forEach((p, i) => p.forEach((t) => potOf.set(t, i)));
  const steps: DrawStep[] = [];
  pots.forEach((pot) => {
    for (const t of shuffle(pot, rng)) {
      const mine = all.filter(([h, a]) => h === t || a === t).map(([h, a]) => (h === t ? { o: a, home: true } : { o: h, home: false }));
      mine.sort((x, y) => (potOf.get(x.o) ?? 0) - (potOf.get(y.o) ?? 0) || Number(y.home) - Number(x.home));
      for (const x of mine) steps.push({ team: x.o, pot: potOf.get(x.o) ?? 0, target: t, note: x.home ? "en casa" : "fuera" });
    }
  });
  return {
    rounds,
    draw: {
      key: "suizo", title: "Sorteo de la fase liga", kind: "suizo", potNames: pots.map((_, i) => `Bombo ${i + 1}`), pots, steps, targets: pots.flat(),
      rules: nPots ? [`${nPots} bombos de ${N / nPots}; cada equipo recibe ${M / nPots} rival${M / nPots > 1 ? "es" : ""} de cada bombo (mitad en casa, mitad fuera)`] : ["Sin bombos (número de equipos o partidos distinto al de la Champions): rivales al azar sin repetir"],
    },
  };
}
