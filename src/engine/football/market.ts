// Mercado de fichajes realista: ventanas, valoraciones, negociación club-club y club-jugador,
// ofertas de la IA (también por jugadores del usuario), contratos y agentes libres.
// Valores, sueldos y contratos son ESTIMACIONES de la app (la base de EA no los incluye).
import { Rng, addDays, clamp } from "../../lib/rng";
import type { Club, FootballSave, Player, Pos, TransferOffer } from "./types";
import { invalidateStrength } from "./strength";

export function estimateValue(ovr: number, age: number): number {
  const f = age < 21 ? 1.6 : age < 24 ? 1.35 : age <= 28 ? 1 : age <= 30 ? 0.7 : age <= 32 ? 0.45 : 0.25;
  return Math.round((0.7e6 * Math.exp((ovr - 65) * 0.19) * f) / 1e5) * 1e5;
}
export const estimateWage = (ovr: number, age: number) => Math.max(1500, Math.round((estimateValue(ovr, Math.min(age, 28)) * 0.0011) / 500) * 500);
export const clubBudgetBase = (rep: number) => Math.round(1e6 * Math.exp((rep - 60) * 0.21) / 1e5) * 1e5;

export type Group = "POR" | "DEF" | "MED" | "ATA";
export const GROUP: Record<Pos, Group> = { POR: "POR", DFC: "DEF", LD: "DEF", LI: "DEF", CAD: "DEF", CAI: "DEF", MCD: "MED", MC: "MED", MCO: "MED", MD: "ATA", MI: "ATA", ED: "ATA", EI: "ATA", DC: "ATA", SD: "ATA" };
export const GROUP_LABEL: Record<Group, string> = { POR: "porteros", DEF: "defensas", MED: "centrocampistas", ATA: "atacantes" };
export const GROUP_LIMITS: Record<Group, [number, number]> = { POR: [2, 3], DEF: [7, 10], MED: [5, 9], ATA: [5, 10] };
const GROUP_MIN = { POR: 2, DEF: 7, MED: 5, ATA: 5 };
export const SQUAD_MIN = 22, SQUAD_MAX = 30;
const STARTERS_G: Record<Group, number> = { POR: 1, DEF: 4, MED: 3, ATA: 3 };

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
    if (!p.custom || !p.value) p.value = estimateValue(p.ovr, p.age); // valor siempre al día con media y edad
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
export function groupCount(save: FootballSave, clubId: string, g: Group) { return squad(save, clubId).filter((p) => GROUP[p.positions[0]] === g).length; }
export function squadValue(save: FootballSave, clubId: string) { return squad(save, clubId).reduce((a, p) => a + (p.value ?? estimateValue(p.ovr, p.age)), 0); }
export function prestige(save: FootballSave, clubId: string | null): number { return clubId ? save.clubs[clubId]?.reputation ?? 70 : 55; }
export function prestigeStars(rep: number) { return rep >= 84 ? 5 : rep >= 80 ? 4.5 : rep >= 77 ? 4 : rep >= 74 ? 3.5 : rep >= 71 ? 3 : rep >= 68 ? 2.5 : rep >= 65 ? 2 : 1.5; }
// Fichajes de un club en la ventana actual
function windowStart(date: string) { const y = date.slice(0, 4); const md = date.slice(5); return md <= "02-02" ? `${y}-01-01` : `${y}-06-15`; }
function movesInWindow(save: FootballSave, clubId: string, dir: "in" | "out") {
  const from = windowStart(save.date);
  let n = 0;
  for (const t of save.transfers) { if (t.date < from) break; if (t.type === "retiro" || t.type === "fin_cesion") continue; if (dir === "in" ? t.to === clubId : t.from === clubId) n++; }
  return n;
}

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
  const roleF = [1.5, 1.2, 1.0, 0.75][roleIn(save, p)];
  return Math.round(((p.value ?? estimateValue(p.ovr, p.age)) * contractF * roleF) / 1e5) * 1e5;
}

export interface NegotiationResult { ok: boolean; stage: "club" | "jugador" | "reglas"; counter?: number; counterWage?: number; reason: string }

// ¿Acepta el club vendedor?
export function clubResponse(save: FootballSave, o: Pick<TransferOffer, "player" | "from" | "to" | "fee" | "kind" | "swap">, rng = new Rng()): NegotiationResult {
  const p = save.players[o.player];
  if (!o.from) return { ok: true, stage: "club", reason: "Agente libre" };
  const sellerSquad = squad(save, o.from);
  const seller = save.clubs[o.from];
  if (sellerSquad.length <= SQUAD_MIN && !o.swap) return { ok: false, stage: "club", reason: `${seller.name} no quiere quedarse con la plantilla corta.` };
  const g = GROUP[p.positions[0]];
  if (groupCount(save, o.from, g) <= GROUP_MIN[g] && !(o.swap && GROUP[save.players[o.swap].positions[0]] === g)) return { ok: false, stage: "club", reason: `${seller.name} no tiene recambio: se quedaría con muy pocos ${GROUP_LABEL[g]}.` };
  if (o.from !== save.userClub && movesInWindow(save, o.from, "out") >= 4) return { ok: false, stage: "club", reason: `${seller.name} ya hizo suficientes ventas en esta ventana.` };
  if (o.kind === "cesion") {
    const role = roleIn(save, p);
    if (role <= 1 && p.age >= 21) return { ok: false, stage: "club", reason: "Es titular: no lo ceden." };
    return { ok: true, stage: "club", reason: "Aceptan la cesión." };
  }
  let ask = askingPrice(save, p);
  const gap = prestige(save, o.to) - prestige(save, o.from);
  const role = roleIn(save, p);
  // un club no vende a su estrella a uno menor salvo con una oferta enorme; si llama un grande, el jugador presiona
  if (role === 0 && gap < 2) ask *= 1.3;
  else if (gap >= 5 && role <= 1) ask *= 0.92;
  if (o.swap) { const sw = save.players[o.swap]; ask -= (sw?.value ?? 0) * (sw && sw.ovr >= p.ovr - 6 ? 0.9 : 0.5); }
  ask = Math.max(0, ask) * (0.97 + rng.next() * 0.1);
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
  // pide más cuanto menor es el club al que va; a un grande va casi por lo mismo
  const base = p.wage ?? estimateWage(p.ovr, p.age);
  const wanted = base * (repTo >= repFrom + 4 ? 1.0 : repTo >= repFrom ? 1.1 : 1.15 + Math.min(0.6, (repFrom - repTo) * 0.04));
  const minutes = wouldRank < 11 ? 0.35 : wouldRank < 16 ? 0 : wouldRank < 22 ? -0.5 : -1;
  // estrellas no bajan de categoría salvo al final de su carrera
  const stepDown = repTo < repFrom - 6 && p.ovr >= 80 && p.age < 31 ? -1.2 : 0;
  let score = (repTo - repFrom) * 0.12 + (wage / wanted - 1) * 3 + minutes + stepDown + (p.age >= 32 ? 0.3 : 0) + rng.normal(0, 0.2);
  if (o.kind === "cesion") score += minutes > 0 ? 0.5 : 0;
  if (!from) score += 0.5; // libre: quiere equipo
  if (score >= 0) return { ok: true, stage: "jugador", reason: `${p.shortName} acepta: ${repTo > repFrom + 3 ? "le ilusiona dar el salto" : wouldRank < 11 ? "tendrá minutos" : "condiciones aceptadas"}.` };
  // ¿qué sueldo le haría cambiar de opinión?
  const need = (-(score - (wage / wanted - 1) * 3) / 3 + 1) * wanted;
  if (minutes >= 0 && stepDown === 0 && need < wanted * 2.2) return { ok: false, stage: "jugador", counterWage: Math.round(need / 500) * 500 + 500, reason: `${p.shortName} pide un sueldo de ${fmtM(need)}/semana.` };
  const why = minutes < 0 ? "no tendría minutos en esa plantilla" : stepDown ? "no quiere bajar de nivel de club" : repTo < repFrom ? "el proyecto no le convence" : "no le convence la oferta";
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
export function proposeTransfer(save: FootballSave, o: Omit<TransferOffer, "id" | "date" | "status" | "byUser" | "expires">): TransferOffer & { result: NegotiationResult; counterWage?: number } {
  ensureContracts(save);
  const offer: TransferOffer = { ...o, id: `o${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, date: save.date, status: "pendiente", byUser: true, expires: addDays(save.date, 7) };
  const p = save.players[o.player];
  const fail = (reason: string, status: TransferOffer["status"] = "rechazada", counter?: number): TransferOffer & { result: NegotiationResult; counterWage?: number } => { offer.status = status; offer.note = reason; offer.counter = counter; save.offers!.unshift(offer); return { ...offer, result: { ok: false, stage: "reglas" as const, reason, counter } }; };
  if (p.clubId && !save.freeMarket && !windowOpen(save.date)) return fail("El mercado está cerrado (ventanas: verano hasta el 1 de septiembre e invierno en enero). Los agentes libres se pueden fichar siempre.");
  if (save.moneyMode && o.kind === "traspaso" && p.clubId && (save.clubs[o.to].budget ?? 0) < o.fee) return fail(`Presupuesto insuficiente (${fmtM(save.clubs[o.to].budget ?? 0)}).`);
  if (squad(save, o.to).length >= 34 && o.kind !== "cesion") return fail(`${save.clubs[o.to].name} ya tiene 34 jugadores: vende o cede antes de fichar.`);
  const rc = clubResponse(save, offer);
  if (!rc.ok) return { ...fail(rc.reason, rc.counter ? "contraoferta" : "rechazada", rc.counter), result: rc };
  const rp = playerResponse(save, offer);
  if (!rp.ok) { const r = fail(rp.reason, "rechazada_jugador"); r.counterWage = rp.counterWage; return { ...r, result: rp }; }
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
interface Need { group: Group; min: number; max: number; urgent: boolean }
function needOf(save: FootballSave, c: Club): Need | null {
  const sq = squad(save, c.id);
  const top = sq.slice(0, 14).map((p) => p.ovr);
  const level = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  let best: { g: Group; score: number; urgent: boolean } | null = null;
  for (const g of ["POR", "DEF", "MED", "ATA"] as Group[]) {
    const ps = sq.filter((p) => GROUP[p.positions[0]] === g);
    const [mn, mx] = GROUP_LIMITS[g];
    if (ps.length >= mx || sq.length >= SQUAD_MAX + 2) continue;
    const st = ps.slice(0, STARTERS_G[g]);
    const weak = st.length < STARTERS_G[g] ? 6 : level - st.reduce((a, p) => a + p.ovr, 0) / st.length;
    const lack = Math.max(0, mn - ps.length);
    const score = lack * 6 + weak;
    if (!best || score > best.score) best = { g, score, urgent: lack > 0 };
  }
  if (!best || (best.score < 2 && sq.length >= SQUAD_MIN)) return null;
  // nivel buscado: titular (≈ nivel del once) o recambio si solo falta número
  return best.urgent && best.score < 6 ? { group: best.g, min: Math.round(level - 7), max: Math.round(level - 1), urgent: true } : { group: best.g, min: Math.round(level - 1), max: Math.round(level + 4), urgent: best.urgent };
}

export function aiMarketDay(save: FootballSave, rng: Rng) {
  ensureContracts(save);
  const win = windowOpen(save.date);
  for (const o of save.offers ?? []) if (o.status === "pendiente" && o.expires < save.date) o.status = "cancelada";
  const clubs = Object.values(save.clubs);
  const attempts = win ? Math.max(4, Math.round(clubs.length * 0.03)) : 2;
  const all = Object.values(save.players).filter((p) => !p.retired);
  for (let k = 0; k < attempts; k++) {
    const c = rng.pick(clubs);
    if (c.id === save.userClub && save.focusMode) continue; // el usuario decide sus fichajes
    if (movesInWindow(save, c.id, "in") >= 4 && win) continue;
    const need = needOf(save, c);
    if (!need) continue;
    const budget = save.moneyMode ? (c.budget ?? 0) : Infinity;
    const rep = prestige(save, c.id);
    const cands = all.filter((p) => p.clubId !== c.id && p.ovr >= need.min && p.ovr <= need.max && GROUP[p.positions[0]] === need.group && (win || !p.clubId) && !p.loanFrom
      && prestige(save, p.clubId) <= rep + 3 && p.age <= 33 && askingPrice(save, p) <= budget * 0.55);
    if (!cands.length) continue;
    const p = rng.weighted(cands, (x) => (x.clubId ? 1 : 1.6) * (x.age <= 23 ? 1.6 : x.age <= 28 ? 1.3 : 0.6) * (1 + (x.ovr - need.min)) * (x.clubId && save.clubs[x.clubId]?.country === c.country ? 1.5 : 1));
    const ask = askingPrice(save, p);
    const fee = p.clubId ? Math.round((ask * (0.9 + rng.next() * 0.25)) / 1e5) * 1e5 : 0;
    const wage = Math.round((p.wage ?? estimateWage(p.ovr, p.age)) * (1.05 + rng.next() * 0.25));
    const offer: TransferOffer = { id: `o${save.version}_${k}_${rng.int(0, 1e6)}`, date: save.date, player: p.id, from: p.clubId, to: c.id, fee, kind: "traspaso", wage, status: "pendiente", byUser: false, expires: addDays(save.date, 7) };
    if (p.clubId && p.clubId === save.userClub) {
      if (!(save.offers ?? []).some((x) => x.status === "pendiente" && x.player === p.id)) { save.offers!.unshift(offer); addNews(save, `${c.name} ofrece ${fmtM(fee)} por ${p.name}.`); }
      continue;
    }
    const rc = clubResponse(save, offer, rng);
    if (!rc.ok) { if (rc.counter && rc.counter <= budget * 0.6 && rng.chance(0.55)) offer.fee = rc.counter; else continue; }
    const rp = playerResponse(save, offer, rng);
    if (!rp.ok) { if (rp.counterWage && rp.counterWage <= offer.wage! * 1.35) offer.wage = rp.counterWage; else continue; }
    executeTransfer(save, offer);
  }
  // equilibrar plantillas: excedentes por posición y plantillas demasiado largas
  if (win) for (let k = 0; k < 3; k++) {
    const c = rng.pick(clubs);
    if (c.id === save.userClub) continue;
    const sq = squad(save, c.id);
    for (const g of ["POR", "DEF", "MED", "ATA"] as Group[]) {
      const ps = sq.filter((p) => GROUP[p.positions[0]] === g);
      if (ps.length > GROUP_LIMITS[g][1] || (sq.length > SQUAD_MAX && ps.length > GROUP_LIMITS[g][0] + 2)) {
        const out = ps[ps.length - 1];
        if (out.loanFrom) { const owner = out.loanFrom; out.clubId = owner; out.loanFrom = null; addNews(save, `${out.name} vuelve de su cesión al ${save.clubs[owner].name}.`); }
        else { out.clubId = null; addNews(save, `${c.name} rescinde el contrato de ${out.name}.`); }
        invalidateSquads(); invalidateStrength(save.players);
        break;
      }
    }
  }
}

// Plantillas con huecos (pretemporada): fichan agentes libres o, si no hay, suben canteranos
export function fillSquadHoles(save: FootballSave, rng: Rng, makeYouth: (c: Club, pos: Pos) => Player) {
  const free = Object.values(save.players).filter((p) => !p.clubId && !p.retired).sort((a, b) => b.ovr - a.ovr);
  const DEFAULT_POS: Record<Group, Pos[]> = { POR: ["POR"], DEF: ["DFC", "DFC", "LD", "LI"], MED: ["MC", "MCD", "MCO"], ATA: ["DC", "ED", "EI"] };
  for (const c of Object.values(save.clubs)) {
    const level = squad(save, c.id).slice(0, 14).reduce((a, p, _i, arr) => a + p.ovr / arr.length, 0);
    for (const g of ["POR", "DEF", "MED", "ATA"] as Group[]) {
      let guard = 0;
      while (groupCount(save, c.id, g) < GROUP_LIMITS[g][0] && guard++ < 6) {
        const fa = c.id === save.userClub && save.focusMode ? undefined : free.find((p) => !p.clubId && GROUP[p.positions[0]] === g && p.ovr <= level + 2 && p.ovr >= level - 12);
        if (fa) { fa.clubId = c.id; fa.contractEnd = save.seasonYear + 2; save.transfers.unshift({ date: save.date, player: fa.id, from: null, to: c.id, type: "libre" }); addNews(save, `LIBRE: ${fa.name} (${fa.ovr}) firma con ${c.name}.`); }
        else { const y = makeYouth(c, rng.pick(DEFAULT_POS[g])); save.players[y.id] = y; }
        invalidateSquads();
      }
    }
    // completar hasta 24: primero agentes libres de nivel adecuado, después canteranos
    let guard = 0;
    while (squad(save, c.id).length < 24 && guard++ < 10) {
      const sq = squad(save, c.id);
      const g = (["DEF", "MED", "ATA", "POR"] as Group[]).sort((a, b) => groupCount(save, c.id, a) / GROUP_LIMITS[a][1] - groupCount(save, c.id, b) / GROUP_LIMITS[b][1])[0];
      const fa = c.id === save.userClub && save.focusMode ? undefined : free.find((p) => !p.clubId && GROUP[p.positions[0]] === g && p.ovr <= level + 1 && p.ovr >= level - 10);
      if (fa) { fa.clubId = c.id; fa.contractEnd = save.seasonYear + 2; save.transfers.unshift({ date: save.date, player: fa.id, from: null, to: c.id, type: "libre" }); addNews(save, `LIBRE: ${fa.name} (${fa.ovr}) firma con ${c.name}.`); }
      else if (sq.length < SQUAD_MIN) { const y = makeYouth(c, rng.pick(DEFAULT_POS[g])); save.players[y.id] = y; }
      else break;
      invalidateSquads();
    }
  }
  invalidateStrength(save.players);
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
    const keepP = (p.clubId === save.userClub && save.focusMode ? 0 : role <= 1 ? (p.age < 32 ? 0.88 : 0.55) : role === 2 ? 0.65 : 0.3) + (p.age <= 22 ? 0.2 : 0);
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
