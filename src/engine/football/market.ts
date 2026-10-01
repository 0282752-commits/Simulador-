// Mercado de fichajes realista: ventanas, valoraciones, negociación club-club y club-jugador,
// ofertas de la IA (también por jugadores del usuario), contratos y agentes libres.
// Valores, sueldos y contratos son ESTIMACIONES de la app (la base de EA no los incluye).
import { Rng, addDays, clamp } from "../../lib/rng";
import type { Club, FootballSave, Player, Pos, TransferOffer } from "./types";
import { invalidateStrength } from "./strength";

export function estimateValue(ovr: number, age: number): number {
  const f = age < 21 ? 1.6 : age < 24 ? 1.35 : age <= 28 ? 1 : age <= 30 ? 0.7 : age <= 32 ? 0.45 : 0.25;
  return Math.round((0.7e6 * Math.exp((ovr - 65) * 0.21) * f) / 1e5) * 1e5;
}
export const estimateWage = (ovr: number, age: number) => Math.max(1500, Math.round((estimateValue(ovr, Math.min(age, 28)) * 0.0008) / 500) * 500);
export const clubBudgetBase = (rep: number) => Math.round(1e6 * Math.exp((rep - 60) * 0.21) / 1e5) * 1e5;

const GROUP: Record<Pos, "POR" | "DEF" | "MED" | "DEL"> = { POR: "POR", DFC: "DEF", LD: "DEF", LI: "DEF", CAD: "DEF", CAI: "DEF", MCD: "MED", MC: "MED", MCO: "MED", MD: "MED", MI: "MED", ED: "DEL", EI: "DEL", DC: "DEL", SD: "DEL" };
const GROUP_MIN = { POR: 2, DEF: 6, MED: 6, DEL: 4 };

// ===== Ventanas de traspasos =====
export function windowOpen(date: string): "verano" | "invierno" | null {
  const md = date.slice(5);
  if (md >= "06-15" && md <= "09-01") return "verano";
  if (md >= "01-01" && md <= "02-02") return "invierno";
  return null;
}

// ===== Preparación (contratos y presupuestos estimados) =====
export function ensureContracts(save: FootballSave, seed = save.seed) {
  invalidateSquads();
  const rng = new Rng(seed + 77);
  for (const p of Object.values(save.players)) {
    if (p.retired) continue;
    if (!p.value) p.value = estimateValue(p.ovr, p.age);
    if (!p.wage) p.wage = estimateWage(p.ovr, p.age);
    if (p.clubId && !p.contractEnd) p.contractEnd = save.seasonYear + 1 + (p.age >= 32 ? rng.int(0, 1) : p.age >= 29 ? rng.int(0, 2) : rng.int(0, 4));
  }
  for (const c of Object.values(save.clubs)) if (c.budget === undefined) c.budget = clubBudgetBase(c.reputation ?? 70);
  save.offers ??= [];
  save.news ??= [];
}

// Caché de plantillas por club (se invalida cuando cambia la versión o hay traspasos)
let sqCache: { save: FootballSave; v: number; n: number; map: Map<string, Player[]> } | null = null;
function squads(save: FootballSave): Map<string, Player[]> {
  if (sqCache && sqCache.save === save && sqCache.v === save.version && sqCache.n === save.transfers.length) return sqCache.map;
  const map = new Map<string, Player[]>();
  for (const p of Object.values(save.players)) if (p.clubId && !p.retired) (map.get(p.clubId) ?? map.set(p.clubId, []).get(p.clubId)!).push(p);
  for (const l of map.values()) l.sort((a, b) => b.ovr - a.ovr);
  sqCache = { save, v: save.version, n: save.transfers.length, map };
  return map;
}
export function invalidateSquads() { sqCache = null; }
function squad(save: FootballSave, clubId: string) { return squads(save).get(clubId) ?? []; }

// Rol del jugador en su club: 0 estrella, 1 titular, 2 rotación, 3 sobrante
export function roleIn(save: FootballSave, p: Player): number {
  if (!p.clubId) return 3;
  const i = squad(save, p.clubId).indexOf(p);
  if (i < 3) return 0;
  if (i < 13) return 1;
  if (i < 20) return 2;
  return 3;
}

// Precio que pide el club dueño
export function askingPrice(save: FootballSave, p: Player): number {
  if (!p.clubId) return 0;
  const yrs = (p.contractEnd ?? save.seasonYear + 2) - save.seasonYear;
  const contractF = yrs <= 0 ? 0.35 : yrs === 1 ? 0.7 : yrs === 2 ? 0.9 : 1.05;
  const roleF = [1.35, 1.2, 1.0, 0.75][roleIn(save, p)];
  return Math.round(((p.value ?? estimateValue(p.ovr, p.age)) * contractF * roleF) / 1e5) * 1e5;
}

export interface NegotiationResult { ok: boolean; stage: "club" | "jugador" | "reglas"; counter?: number; reason: string }

// ¿Acepta el club vendedor?
export function clubResponse(save: FootballSave, o: Pick<TransferOffer, "player" | "from" | "to" | "fee" | "kind" | "swap">, rng = new Rng()): NegotiationResult {
  const p = save.players[o.player];
  if (!o.from) return { ok: true, stage: "club", reason: "Agente libre" };
  const sellerSquad = squad(save, o.from);
  if (sellerSquad.length <= 20 && !o.swap) return { ok: false, stage: "club", reason: `${save.clubs[o.from].name} no quiere quedarse con la plantilla corta.` };
  const g = GROUP[p.positions[0]];
  if (sellerSquad.filter((x) => GROUP[x.positions[0]] === g).length <= GROUP_MIN[g] && !o.swap) return { ok: false, stage: "club", reason: `${save.clubs[o.from].name} no tiene recambio en esa posición.` };
  if (o.kind === "cesion") {
    const role = roleIn(save, p);
    if (role <= 1 && p.age >= 21) return { ok: false, stage: "club", reason: "Es titular: no lo ceden." };
    return { ok: true, stage: "club", reason: "Aceptan la cesión." };
  }
  let ask = askingPrice(save, p);
  if (o.swap) { const sw = save.players[o.swap]; ask -= (sw?.value ?? 0) * (sw && sw.ovr >= p.ovr - 6 ? 0.9 : 0.5); }
  ask = Math.max(0, ask) * (0.95 + rng.next() * 0.15);
  if (o.fee >= ask) return { ok: true, stage: "club", reason: "Oferta aceptada." };
  if (o.fee >= ask * 0.75) return { ok: false, stage: "club", counter: Math.round(ask / 1e5) * 1e5, reason: `Piden ${fmtM(ask)}.` };
  return { ok: false, stage: "club", reason: `Oferta insuficiente (lo valoran en unos ${fmtM(ask)}).` };
}

// ¿Acepta el jugador ir al club comprador?
export function playerResponse(save: FootballSave, o: Pick<TransferOffer, "player" | "to" | "wage" | "kind">, rng = new Rng()): NegotiationResult {
  const p = save.players[o.player];
  const to = save.clubs[o.to];
  const from = p.clubId ? save.clubs[p.clubId] : null;
  const repTo = to.reputation ?? 70, repFrom = from?.reputation ?? 60;
  const toSquad = squad(save, o.to);
  const wouldRank = toSquad.filter((x) => x.ovr > p.ovr).length;
  const wage = o.wage ?? p.wage ?? estimateWage(p.ovr, p.age);
  const wanted = (p.wage ?? estimateWage(p.ovr, p.age)) * (repTo >= repFrom ? 1.05 : 1.25);
  let score = (repTo - repFrom) * 0.08 + (wage / wanted - 1) * 2.2 + (wouldRank < 11 ? 0.3 : wouldRank < 16 ? 0 : -0.5) + (p.age >= 31 ? 0.2 : 0) + rng.normal(0, 0.25);
  if (o.kind === "cesion") score += 0.4; // le darán minutos
  if (!from) score += 0.6; // libre: quiere equipo
  if (score >= 0) return { ok: true, stage: "jugador", reason: `${p.shortName} acepta las condiciones.` };
  const why = wouldRank >= 16 ? "no tendría minutos" : repTo < repFrom - 5 ? "el club es menor que el suyo" : "pide más sueldo";
  return { ok: false, stage: "jugador", reason: `${p.shortName} rechaza: ${why}.` };
}

const fmtM = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M€` : `${Math.round(n / 1e3)} mil €`);

// Ejecuta el movimiento
export function executeTransfer(save: FootballSave, o: TransferOffer) {
  const p = save.players[o.player];
  const from = p.clubId;
  if (o.kind === "cesion") { p.loanFrom = p.loanFrom ?? from; p.clubId = o.to; }
  else { p.clubId = o.to; p.loanFrom = null; p.contractEnd = save.seasonYear + (p.age >= 31 ? 2 : p.age >= 27 ? 3 : 4); }
  if (o.wage) p.wage = o.wage;
  if (save.moneyMode && from && o.kind === "traspaso") {
    save.clubs[o.to].budget = (save.clubs[o.to].budget ?? 0) - o.fee;
    save.clubs[from].budget = (save.clubs[from].budget ?? 0) + o.fee;
  }
  if (o.swap) { const sw = save.players[o.swap]; sw.clubId = from; sw.loanFrom = null; }
  save.transfers.unshift({ date: save.date, player: p.id, from, to: o.to, fee: o.kind === "traspaso" ? o.fee : undefined, type: o.swap ? "intercambio" : o.kind === "cesion" ? "cesion" : from ? "fichaje" : "libre" });
  for (const c of [from, o.to]) if (c && save.clubs[c]?.lineup) { const l = save.clubs[c].lineup!; l.starters = l.starters.map((x) => (x && save.players[x]?.clubId === c ? x : null)); l.bench = l.bench.filter((x) => save.players[x]?.clubId === c); l.autoRotate = true; }
  invalidateStrength(save.players);
  addNews(save, `${o.kind === "cesion" ? "CESIÓN" : from ? "FICHAJE" : "LIBRE"}: ${p.name} (${p.ovr}) ${from ? `del ${save.clubs[from].name} ` : ""}al ${save.clubs[o.to].name}${o.kind === "traspaso" && from ? ` por ${fmtM(o.fee)}` : ""}${o.swap ? ` + ${save.players[o.swap].name}` : ""}.`);
}

export function addNews(save: FootballSave, text: string) {
  save.news ??= [];
  save.news.unshift({ date: save.date, text });
  if (save.news.length > 300) save.news.length = 300;
}

// ===== Oferta del usuario (negociación completa) =====
export function proposeTransfer(save: FootballSave, o: Omit<TransferOffer, "id" | "date" | "status" | "byUser" | "expires">): TransferOffer & { result: NegotiationResult } {
  ensureContracts(save);
  const offer: TransferOffer = { ...o, id: `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, date: save.date, status: "pendiente", byUser: true, expires: addDays(save.date, 7) };
  const p = save.players[o.player];
  const fail = (reason: string, status: TransferOffer["status"] = "rechazada", counter?: number) => { offer.status = status; offer.note = reason; offer.counter = counter; save.offers!.unshift(offer); return { ...offer, result: { ok: false, stage: "reglas" as const, reason, counter } }; };
  if (p.clubId && !save.freeMarket && !windowOpen(save.date)) return fail("El mercado está cerrado (ventanas: verano hasta el 1 de septiembre e invierno en enero). Los agentes libres se pueden fichar siempre.");
  if (save.moneyMode && o.kind === "traspaso" && p.clubId && (save.clubs[o.to].budget ?? 0) < o.fee) return fail(`Presupuesto insuficiente (${fmtM(save.clubs[o.to].budget ?? 0)}).`);
  const rc = clubResponse(save, offer);
  if (!rc.ok) return { ...fail(rc.reason, rc.counter ? "contraoferta" : "rechazada", rc.counter), result: rc };
  const rp = playerResponse(save, offer);
  if (!rp.ok) { const r = fail(rp.reason, "rechazada_jugador"); return { ...r, result: rp }; }
  offer.status = "aceptada";
  offer.note = rp.reason;
  save.offers!.unshift(offer);
  executeTransfer(save, offer);
  return { ...offer, result: rp };
}

// Respuesta del usuario a una oferta de la IA por su jugador
export function answerOffer(save: FootballSave, id: string, action: "aceptar" | "rechazar" | "contraoferta", counter?: number): string {
  const o = save.offers?.find((x) => x.id === id);
  if (!o || o.status !== "pendiente") return "La oferta ya no está disponible.";
  if (action === "rechazar") { o.status = "rechazada"; return "Oferta rechazada."; }
  if (action === "contraoferta") {
    // la IA acepta si la contraoferta no supera su máximo (≈ 1.3× valor)
    const p = save.players[o.player];
    const max = (p.value ?? estimateValue(p.ovr, p.age)) * 1.3;
    if (!counter || counter > max || (save.moneyMode && counter > (save.clubs[o.to].budget ?? 0))) { o.status = "rechazada"; o.note = "No aceptan tu contraoferta."; return `${save.clubs[o.to].name} no acepta ${counter ? fmtM(counter) : "eso"}.`; }
    o.fee = counter;
  }
  const rp = playerResponse(save, o);
  if (!rp.ok) { o.status = "rechazada_jugador"; o.note = rp.reason; return rp.reason; }
  o.status = "aceptada";
  executeTransfer(save, o);
  return `Traspaso cerrado: ${save.players[o.player].name} se va al ${save.clubs[o.to].name}.`;
}

// ===== Actividad de la IA (cada día de mercado) =====
function needGroup(save: FootballSave, c: Club): { group: "POR" | "DEF" | "MED" | "DEL"; target: number } | null {
  const sq = squad(save, c.id);
  const top = sq.map((p) => p.ovr).sort((a, b) => b - a).slice(0, 14);
  const level = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  let worst: { group: "POR" | "DEF" | "MED" | "DEL"; gap: number } | null = null;
  for (const g of ["POR", "DEF", "MED", "DEL"] as const) {
    const ps = sq.filter((p) => GROUP[p.positions[0]] === g).sort((a, b) => b.ovr - a.ovr);
    const starters = { POR: 1, DEF: 4, MED: 3, DEL: 3 }[g];
    const lack = Math.max(0, GROUP_MIN[g] - ps.length) * 6;
    const weak = level - (ps.slice(0, starters).reduce((a, p) => a + p.ovr, 0) / Math.max(1, Math.min(starters, ps.length)) || 0);
    const gap = lack + weak;
    if (!worst || gap > worst.gap) worst = { group: g, gap };
  }
  if (!worst || worst.gap < 1.5) return null;
  return { group: worst.group, target: Math.round(level + 1) };
}

export function aiMarketDay(save: FootballSave, rng: Rng) {
  ensureContracts(save);
  const win = windowOpen(save.date);
  // caducan ofertas pendientes
  for (const o of save.offers ?? []) if (o.status === "pendiente" && o.expires < save.date) o.status = "cancelada";
  const clubs = Object.values(save.clubs);
  const active = win ? Math.max(3, Math.round(clubs.length * 0.025)) : 1; // fuera de ventana solo agentes libres
  const all = Object.values(save.players).filter((p) => !p.retired);
  for (let k = 0; k < active; k++) {
    const c = rng.pick(clubs);
    if (c.id === save.userClub && save.focusMode) continue; // el usuario decide sus fichajes
    const need = needGroup(save, c);
    if (!need) continue;
    const budget = save.moneyMode ? (c.budget ?? 0) : Infinity;
    const cands = all.filter((p) => p.clubId !== c.id && p.ovr >= need.target - 3 && p.ovr <= need.target + 5 && GROUP[p.positions[0]] === need.group && (win || !p.clubId) && !p.loanFrom && askingPrice(save, p) <= budget * 0.6);
    if (!cands.length) continue;
    const p = rng.weighted(cands, (x) => (x.clubId ? 1 : 2) * (x.age <= 29 ? 1.5 : 0.7) * (x.ovr - need.target + 6));
    const ask = askingPrice(save, p);
    const fee = p.clubId ? Math.round((ask * (0.85 + rng.next() * 0.3)) / 1e5) * 1e5 : 0;
    const wage = Math.round((p.wage ?? estimateWage(p.ovr, p.age)) * (1.05 + rng.next() * 0.3));
    const offer: TransferOffer = { id: `o${save.version}_${k}_${rng.int(0, 1e6)}`, date: save.date, player: p.id, from: p.clubId, to: c.id, fee, kind: "traspaso", wage, status: "pendiente", byUser: false, expires: addDays(save.date, 5) };
    if (p.clubId && p.clubId === save.userClub) {
      // oferta por un jugador del usuario: va a su bandeja
      if (!(save.offers ?? []).some((x) => x.status === "pendiente" && x.player === p.id)) { save.offers!.unshift(offer); addNews(save, `${c.name} ofrece ${fmtM(fee)} por ${p.name}.`); }
      continue;
    }
    const rc = clubResponse(save, offer, rng);
    if (!rc.ok) { if (rc.counter && rc.counter <= budget * 0.7 && rng.chance(0.6)) offer.fee = rc.counter; else continue; }
    if (!playerResponse(save, offer, rng).ok) continue;
    executeTransfer(save, offer);
  }
  // clubes con plantilla larga liberan sobrantes; cortos firman libres
  if (win && rng.chance(0.3)) {
    const c = rng.pick(clubs);
    const sq = squad(save, c.id);
    if (sq.length > 30 && c.id !== save.userClub) { const p = sq[sq.length - 1]; invalidateSquads(); p.clubId = null; p.loanFrom = null; addNews(save, `${c.name} rescinde el contrato de ${p.name}.`); invalidateStrength(save.players); }
  }
}

// ===== Fin de temporada: contratos que terminan =====
export function expireContracts(save: FootballSave, rng: Rng): { freed: string[]; renewed: number } {
  ensureContracts(save);
  const freed: string[] = [];
  let renewed = 0;
  const expiring = Object.values(save.players).filter((p) => !p.retired && p.clubId && !p.loanFrom && (p.contractEnd ?? 9999) <= save.seasonYear + 1);
  const roles = new Map(expiring.map((p) => [p.id, roleIn(save, p)]));
  for (const p of expiring) {
    if (!p.clubId) continue;
    const role = roles.get(p.id)!;
    const keepP = p.clubId === save.userClub ? 0 : role <= 1 ? (p.age < 32 ? 0.8 : 0.45) : role === 2 ? 0.45 : 0.15;
    if (rng.chance(keepP)) { p.contractEnd = save.seasonYear + 1 + (p.age >= 31 ? 1 : rng.int(2, 4)); p.wage = Math.round((p.wage ?? 0) * 1.1); renewed++; }
    else { addNews(save, `${p.name} termina contrato con ${save.clubs[p.clubId].name} y queda libre.`); p.clubId = null; freed.push(p.id); }
  }
  invalidateStrength(save.players);
  invalidateSquads();
  return { freed, renewed };
}

// Renovación pedida por el usuario
export function renewContract(save: FootballSave, pid: string, years: number, wage: number): string {
  const p = save.players[pid];
  const wanted = (p.wage ?? estimateWage(p.ovr, p.age)) * (roleIn(save, p) <= 1 ? 1.2 : 1.05) * (p.age >= 31 && years > 2 ? 0.9 : 1);
  if (wage < wanted * 0.95) return `${p.shortName} pide al menos ${fmtM(wanted)}/sem.`.replace(" M€", " M€").replace("mil €", "mil €");
  p.contractEnd = save.seasonYear + 1 + years; // años adicionales a partir del próximo verano
  p.wage = Math.round(wage);
  return `${p.shortName} renueva hasta ${p.contractEnd}.`;
}

export { clamp };
