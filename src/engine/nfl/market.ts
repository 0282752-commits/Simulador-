// Mercado NFL "estilo Madden": contratos y tope salarial (estimados), valor de trade de jugadores y
// selecciones, trades que deben aprobar ambos equipos, agencia libre con ofertas y actividad de la IA.
import { Rng, clamp } from "../../lib/rng";
import type { DraftPick, NflPlayer, NflPos, NflSave, NflTradeOffer } from "./types";

export const DEFAULT_CAP = 300_000_000; // tope estimado 2026 (el de 2025 fue 279,2 M)
const POS_SAL: Record<NflPos, number> = { QB: 1.9, WR: 1.15, DE: 1.15, OT: 1.0, CB: 0.95, DT: 0.95, S: 0.7, LB: 0.75, OG: 0.8, C: 0.7, TE: 0.75, RB: 0.65, K: 0.22, P: 0.18, LS: 0.08 };
const POS_TRADE: Record<NflPos, number> = { QB: 1.0, DE: 0.72, WR: 0.7, OT: 0.66, CB: 0.62, DT: 0.55, S: 0.45, LB: 0.45, OG: 0.42, C: 0.38, TE: 0.42, RB: 0.38, K: 0.08, P: 0.06, LS: 0.03 };
const MIN_SAL = 900_000;

export function estimateSalary(pos: NflPos, ovr: number, age: number): number {
  const ageF = age >= 33 ? 0.6 : age >= 31 ? 0.8 : 1;
  return Math.max(MIN_SAL, Math.round((0.55e6 * Math.exp((ovr - 60) * 0.1) * POS_SAL[pos] * ageF) / 5e4) * 5e4);
}
export const rookieSalary = (pick: number) => Math.round((MIN_SAL + 9.5e6 * Math.exp(-0.045 * (pick - 1))) / 5e4) * 5e4;
export const fmtUsd = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)} M` : `$${Math.round(n / 1e3)} mil`);

// Cachés por estado de la partida (se invalidan al cambiar versión o movimientos)
const cache = new WeakMap<NflSave, { key: string; rosters: Map<string, NflPlayer[]>; rank?: Map<string, number> }>();
function stateKey(save: NflSave) { return `${save.version}|${save.transactions.length}|${save.games.filter((g) => g.result).length}`; }
function c(save: NflSave) {
  const key = stateKey(save);
  let e = cache.get(save);
  if (!e || e.key !== key) {
    const rosters = new Map<string, NflPlayer[]>();
    for (const p of Object.values(save.players)) if (p.teamId && !p.retired) (rosters.get(p.teamId) ?? rosters.set(p.teamId, []).get(p.teamId)!).push(p);
    e = { key, rosters };
    cache.set(save, e);
  }
  return e;
}
export function invalidateNflCache(save: NflSave) { cache.delete(save); }
export function teamPlayers(save: NflSave, team: string) { return c(save).rosters.get(team) ?? []; }
export function payroll(save: NflSave, team: string) { return teamPlayers(save, team).reduce((a, p) => a + (p.contract?.salary ?? 0), 0); }
export function capRoom(save: NflSave, team: string) { return (save.cap ?? DEFAULT_CAP) - payroll(save, team); }

export function ensureNflContracts(save: NflSave) {
  save.cap ??= DEFAULT_CAP;
  save.tradeOffers ??= [];
  save.phase ??= "temporada";
  const rng = new Rng(save.seed + 991);
  let any = false;
  for (const p of Object.values(save.players)) {
    if (p.retired || p.contract) continue;
    any = true;
    const yrs = p.age <= 24 ? rng.int(2, 4) : p.age <= 29 ? rng.int(1, 5) : rng.int(1, 2);
    p.contract = { years: yrs, salary: p.practiceSquad ? MIN_SAL : estimateSalary(p.pos, p.ovr, p.age) };
  }
  if (!any) return;
  // ajustar para que la nómina media quede cerca del 92 % del tope
  const teams = Object.keys(save.teams);
  const avg = teams.reduce((a, t) => a + payroll(save, t), 0) / teams.length;
  const f = (save.cap * 0.88) / Math.max(1, avg);
  for (const p of Object.values(save.players)) if (p.contract && !p.practiceSquad) p.contract.salary = Math.max(MIN_SAL, Math.round((p.contract.salary * f) / 5e4) * 5e4);
  // ningún equipo empieza por encima del tope
  for (const t of teams) {
    const pr = payroll(save, t);
    if (pr <= save.cap * 0.99) continue;
    const g = (save.cap * 0.97) / pr;
    for (const p of teamPlayers(save, t)) if (p.contract) p.contract.salary = Math.max(MIN_SAL, Math.round((p.contract.salary * g) / 5e4) * 5e4);
  }
}

// ===== Valor de trade (escala tipo tabla de selecciones: #1 global ≈ 3000) =====
export function playerTradeValue(p: NflPlayer): number {
  const ageF = p.age <= 25 ? 1.12 : p.age <= 28 ? 1 : p.age === 29 ? 0.88 : p.age === 30 ? 0.75 : p.age === 31 ? 0.6 : p.age === 32 ? 0.48 : 0.32;
  const base = 3000 * Math.pow(clamp((p.ovr - 60) / 39, 0, 1.2), 3.1) * POS_TRADE[p.pos] * ageF;
  const yrs = p.contract?.years ?? 1;
  return Math.round(base * (yrs <= 1 ? 0.8 : 1) + (p.prospect ? 0 : 0));
}
export function pickSlotValue(n: number): number {
  return n <= 32 ? 3000 * Math.exp(-0.0575 * (n - 1)) : 500 * Math.exp(-0.03 * (n - 32));
}
export function pickValue(save: NflSave, pk: DraftPick): number {
  // posición estimada: según el récord del equipo original (o el orden real si ya está fijado)
  let slot: number;
  const idx = save.draftOrder?.indexOf(pk.id) ?? -1;
  if (idx >= 0) slot = idx + 1;
  else {
    const rank = teamRankForDraft(save, pk.originalTeam); // 1 = peor equipo
    slot = (pk.round - 1) * 32 + rank;
  }
  const yearsAhead = Math.max(0, pk.year - (save.seasonYear + 1));
  return Math.round(pickSlotValue(slot) * Math.pow(0.8, yearsAhead));
}
function teamRankForDraft(save: NflSave, team: string): number {
  const e = c(save);
  if (!e.rank) e.rank = computeRanks(save);
  return e.rank.get(team) ?? 16;
}
function computeRanks(save: NflSave): Map<string, number> {
  const rec = new Map<string, number>();
  for (const t of Object.keys(save.teams)) rec.set(t, 0);
  for (const g of save.games) if (g.result && !g.playoff) { const hw = g.result.hs > g.result.as ? 1 : g.result.hs === g.result.as ? 0.5 : 0; rec.set(g.home, rec.get(g.home)! + hw); rec.set(g.away, rec.get(g.away)! + 1 - hw); }
  const anyPlayed = save.games.some((g) => g.result);
  const strength = (t: string) => (anyPlayed ? rec.get(t)! : teamPlayers(save, t).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 30).reduce((a, b) => a + b, 0));
  const order = Object.keys(save.teams).sort((a, b) => strength(a) - strength(b));
  return new Map(order.map((t, i) => [t, i + 1]));
}

export function assetValue(save: NflSave, id: string): number {
  const p = save.players[id];
  if (p) return playerTradeValue(p);
  const pk = save.picks.find((x) => x.id === id);
  return pk ? pickValue(save, pk) : 0;
}
export function assetLabel(save: NflSave, id: string): string {
  const p = save.players[id];
  if (p) return `${p.pos} ${p.name} (${p.ovr})`;
  const pk = save.picks.find((x) => x.id === id);
  return pk ? `${pk.year} ronda ${pk.round}${pk.originalTeam !== pk.owner ? ` (de ${pk.originalTeam})` : ""}` : id;
}

const STARTERS: Partial<Record<NflPos, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
// Necesidad del equipo en una posición (0 = cubierto, >0 = necesita)
export function positionNeed(save: NflSave, team: string, pos: NflPos): number {
  const r = teamPlayers(save, team).filter((p) => p.pos === pos && !p.practiceSquad).sort((a, b) => b.ovr - a.ovr);
  const n = STARTERS[pos] ?? 1;
  const starters = r.slice(0, n);
  const lack = Math.max(0, n + 1 - r.length);
  const avg = starters.length ? starters.reduce((a, p) => a + p.ovr, 0) / starters.length : 50;
  return lack * 8 + Math.max(0, 80 - avg) / 3;
}

export interface TradeVerdict { accept: boolean; reason: string; receive: number; give: number }

// Evalúa la operación desde el punto de vista de `team`
export function evaluateTradeFor(save: NflSave, team: string, receive: string[], give: string[]): TradeVerdict {
  let rv = 0, gv = 0;
  for (const id of receive) { const p = save.players[id]; rv += assetValue(save, id) * (p ? 1 + Math.min(0.3, positionNeed(save, team, p.pos) / 30) : 1); }
  for (const id of give) { const p = save.players[id]; gv += assetValue(save, id) * (p ? 1 + Math.min(0.25, positionNeed(save, team, p.pos) / 40) * 0.5 : 1); }
  // tope salarial
  const salIn = receive.reduce((a, id) => a + (save.players[id]?.contract?.salary ?? 0), 0);
  const salOut = give.reduce((a, id) => a + (save.players[id]?.contract?.salary ?? 0), 0);
  if (capRoom(save, team) - salIn + salOut < 0) return { accept: false, reason: `Excede el tope salarial de ${save.teams[team].abbr}.`, receive: rv, give: gv };
  const rosterAfter = teamPlayers(save, team).length + receive.filter((id) => save.players[id]).length - give.filter((id) => save.players[id]).length;
  if (rosterAfter < 46) return { accept: false, reason: `${save.teams[team].abbr} se quedaría sin jugadores suficientes.`, receive: rv, give: gv };
  if (rv >= gv * 1.03 + 5) return { accept: true, reason: `${save.teams[team].abbr} acepta.`, receive: rv, give: gv };
  return { accept: false, reason: `${save.teams[team].abbr} lo rechaza: da ${Math.round(gv)} pts de valor y recibe ${Math.round(rv)}.`, receive: rv, give: gv };
}

export function tradeWindowOpen(save: NflSave): boolean {
  return save.phase !== "temporada" || save.week <= 9; // fecha límite de traspasos: semana 9
}

export function executeTrade(save: NflSave, a: string, b: string, aGives: string[], bGives: string[]) {
  const move = (ids: string[], to: string) => { for (const id of ids) { const p = save.players[id]; if (p) { p.teamId = to; p.practiceSquad = false; } const pk = save.picks.find((x) => x.id === id); if (pk) pk.owner = to; } };
  move(aGives, b); move(bGives, a);
  invalidateNflCache(save);
  for (const t of [a, b]) save.teams[t].autoDepth = save.teams[t].autoDepth || t !== save.userTeam;
  save.transactions.unshift({ date: stamp(save), text: `TRADE: ${save.teams[a].abbr} envía ${aGives.map((x) => assetLabel(save, x)).join(", ") || "nada"} a ${save.teams[b].abbr} por ${bGives.map((x) => assetLabel(save, x)).join(", ") || "nada"}.` });
  save.version++;
}
export const stamp = (save: NflSave) => (save.phase === "temporada" ? `${save.seasonYear} S${Math.min(save.week, 22)}` : `${save.seasonYear + 1} ${save.phase}`);

// Propuesta (usuario o modo general): deben aceptar los equipos controlados por la IA
export function proposeTrade(save: NflSave, a: string, b: string, aGives: string[], bGives: string[]): { ok: boolean; msg: string } {
  ensureNflContracts(save);
  if (!save.freeMarket && !tradeWindowOpen(save)) return { ok: false, msg: "Pasó la fecha límite de traspasos (semana 9). Se reabre en la temporada baja." };
  const verdicts: TradeVerdict[] = [];
  for (const [t, rec, giv] of [[a, bGives, aGives], [b, aGives, bGives]] as const) {
    if (t === save.userTeam && !save.freeMarket) continue; // el usuario ya está de acuerdo con su parte
    const v = evaluateTradeFor(save, t, [...rec], [...giv]);
    verdicts.push(v);
    if (!v.accept) return { ok: false, msg: v.reason };
  }
  executeTrade(save, a, b, aGives, bGives);
  return { ok: true, msg: `¡Trade aprobado! ${verdicts.map((v) => v.reason).join(" ")}` };
}

// ===== Agencia libre =====
export function freeAgents(save: NflSave) { return Object.values(save.players).filter((p) => !p.teamId && !p.retired && !p.prospect); }
export function askingSalary(save: NflSave, p: NflPlayer): number {
  const day = save.phase === "agencia" ? save.faDay ?? 0 : 10;
  return Math.max(MIN_SAL, Math.round((estimateSalary(p.pos, p.ovr, p.age) * (1.1 - Math.min(0.45, day * 0.06))) / 5e4) * 5e4);
}
export function offerContract(save: NflSave, team: string, pid: string, salary: number, years: number): { ok: boolean; msg: string } {
  ensureNflContracts(save);
  const p = save.players[pid];
  if (!p || p.teamId) return { ok: false, msg: "Ya no está disponible." };
  if (capRoom(save, team) < salary) return { ok: false, msg: `Sin espacio en el tope salarial (${fmtUsd(capRoom(save, team))} libres).` };
  const ask = askingSalary(save, p);
  const yearsOk = p.age >= 31 ? years <= 2 : true;
  if (salary < ask * 0.95) return { ok: false, msg: `${p.name} pide al menos ${fmtUsd(ask)} por año.` };
  if (!yearsOk) return { ok: false, msg: `${p.name} (${p.age} años) solo firma por 1-2 años.` };
  sign(save, p, team, salary, years);
  return { ok: true, msg: `${p.name} firma con ${save.teams[team].name}: ${years} año(s), ${fmtUsd(salary)}/año.` };
}
function sign(save: NflSave, p: NflPlayer, team: string, salary: number, years: number) {
  p.teamId = team; p.contract = { years, salary }; p.practiceSquad = false; p.exTeam = null;
  invalidateNflCache(save);
  save.transactions.unshift({ date: stamp(save), text: `FIRMA: ${save.teams[team].abbr} contrata a ${p.pos} ${p.name} (${p.ovr}) · ${years} año(s), ${fmtUsd(salary)}.` });
}

// Un "día" de agencia libre o una semana de temporada: la IA firma agentes libres por necesidad
export function aiSignings(save: NflSave, rng: Rng, intensity = 1) {
  ensureNflContracts(save);
  const fas = freeAgents(save).sort((a, b) => b.ovr - a.ovr);
  if (!fas.length) return;
  for (const t of rng.shuffle(Object.keys(save.teams))) {
    if (t === save.userTeam && save.focusMode) continue;
    if (!rng.chance(0.6 * intensity)) continue;
    const roomBase = capRoom(save, t);
    const size = teamPlayers(save, t).length;
    // posición más necesitada
    const needs = (Object.keys(STARTERS) as NflPos[]).map((pos) => ({ pos, n: positionNeed(save, t, pos) })).sort((a, b) => b.n - a.n);
    const top = needs[0];
    if (top.n < 4 && size >= 53) continue;
    const cand = fas.find((p) => !p.teamId && p.pos === top.pos && askingSalary(save, p) <= roomBase * 0.5);
    if (!cand) continue;
    const sal = askingSalary(save, cand);
    sign(save, cand, t, sal, cand.age >= 31 ? 1 : rng.int(1, 4));
  }
}

// La IA hace trades entre sí y propone trades al usuario
export function aiTrades(save: NflSave, rng: Rng, attempts = 2) {
  if (!tradeWindowOpen(save)) return;
  ensureNflContracts(save);
  const teams = Object.keys(save.teams);
  for (let k = 0; k < attempts; k++) {
    const buyer = rng.pick(teams);
    if (buyer === save.userTeam && save.focusMode) continue;
    const needs = (Object.keys(STARTERS) as NflPos[]).filter((p) => p !== "K" && p !== "P").map((pos) => ({ pos, n: positionNeed(save, buyer, pos) })).sort((a, b) => b.n - a.n);
    const pos = needs[0].pos;
    if (needs[0].n < 2) continue;
    // vendedor con excedente en esa posición
    const sellers = teams.filter((t) => t !== buyer && teamPlayers(save, t).filter((p) => p.pos === pos && p.ovr >= 70).length > (STARTERS[pos] ?? 1));
    if (!sellers.length) continue;
    const seller = rng.pick(sellers);
    const target = teamPlayers(save, seller).filter((p) => p.pos === pos && !p.practiceSquad).sort((a, b) => b.ovr - a.ovr)[(STARTERS[pos] ?? 1)];
    if (!target) continue;
    const need = assetValue(save, target.id) * 1.08 + 10;
    // paquete de selecciones del comprador
    const picks = save.picks.filter((p) => p.owner === buyer && !p.used).sort((a, b) => pickValue(save, b) - pickValue(save, a));
    const pkg: string[] = [];
    let sum = 0;
    for (const pk of [...picks].reverse()) { if (sum >= need) break; pkg.push(pk.id); sum += pickValue(save, pk); if (pkg.length >= 3) break; }
    if (sum < need) { const one = [...picks].reverse().find((pk) => pickValue(save, pk) >= need); if (!one) continue; pkg.length = 0; pkg.push(one.id); }
    if (seller === save.userTeam) {
      if (!save.tradeOffers!.some((o) => o.status === "pendiente" && o.get.includes(target.id))) {
        save.tradeOffers!.unshift({ id: `t${save.version}_${k}_${rng.int(0, 1e6)}`, week: stamp(save), from: buyer, to: seller, give: pkg, get: [target.id], status: "pendiente" });
      }
      continue;
    }
    const vb = evaluateTradeFor(save, buyer, [target.id], pkg);
    const vs = evaluateTradeFor(save, seller, pkg, [target.id]);
    const capOk = (v: TradeVerdict) => !/tope|suficientes/.test(v.reason);
    // entre equipos de la IA basta con un trato razonable para ambos
    if (capOk(vb) && capOk(vs) && vb.receive >= vb.give * 0.95 && vs.receive >= vs.give * 0.98) executeTrade(save, buyer, seller, pkg, [target.id]);
  }
}

export function answerTradeOffer(save: NflSave, id: string, accept: boolean): string {
  const o = save.tradeOffers?.find((x) => x.id === id);
  if (!o || o.status !== "pendiente") return "La oferta ya no está disponible.";
  if (!accept) { o.status = "rechazada"; return "Oferta rechazada."; }
  const still = [...o.give, ...o.get].every((x) => (save.players[x] ? save.players[x].teamId === (o.give.includes(x) ? o.from : o.to) : save.picks.some((pk) => pk.id === x && !pk.used && pk.owner === (o.give.includes(x) ? o.from : o.to))));
  if (!still) { o.status = "caducada"; return "Los jugadores o selecciones ya no están disponibles."; }
  executeTrade(save, o.from, o.to, o.give, o.get);
  o.status = "aceptada";
  return "Trade completado.";
}
