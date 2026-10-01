// Temporada baja NFL por fases: fin de temporada → draft (interactivo) → agencia libre → nueva temporada.
import { Rng, clamp } from "../../lib/rng";
import type { NflPlayer, NflSave } from "./types";
import { createNflSchedule, nflChampion, nflRows, recordNflCampaign, roster, type NflConfig } from "./season";
import { aiSignings, aiTrades, cutRoster, ensureNflContracts, estimateSalary, invalidateNflCache, positionNeed, rookieSalary, stamp } from "./market";

// 1) Cierre de temporada: historial, progresión, retiros, contratos que vencen, clase y orden del draft
export function beginOffseason(save: NflSave) {
  ensureNflContracts(save);
  recordNflCampaign(save);
  const rng = new Rng(save.seed + save.seasonYear * 13);
  const rows = nflRows(save);
  const champ = nflChampion(save);
  const sb = save.games.find((g) => g.week === 22);
  const runner = sb?.result ? (champ === sb.home ? sb.away : sb.home) : "";
  save.history.push({ season: save.seasonYear, champion: champ ?? "", runnerUp: runner, standings: [...rows.values()].sort((a, b) => b.pct - a.pct).map((r) => ({ team: r.team, w: r.w, l: r.l, t: r.t })) });
  // orden del draft: no clasificados por peor récord, luego por ronda de eliminación
  const elim = new Map<string, number>();
  for (const g of save.games.filter((x) => x.playoff && x.result)) elim.set(g.result!.hs > g.result!.as ? g.away : g.home, g.week);
  if (champ) elim.set(champ, 23);
  const order = Object.keys(save.teams).sort((a, b) => (elim.get(a) ?? 0) - (elim.get(b) ?? 0) || rows.get(a)!.pct - rows.get(b)!.pct || rows.get(a)!.pf - rows.get(b)!.pf);
  const year = save.seasonYear + 1;
  save.draftOrder = [];
  for (let round = 1; round <= 7; round++) for (const orig of order) { const pk = save.picks.find((p) => p.year === year && p.round === round && p.originalTeam === orig && !p.used); if (pk) save.draftOrder.push(pk.id); }
  save.draftPos = 0;
  save.draftLog = [];
  // progresión, retiros y contratos
  let retired = 0, expired = 0;
  for (const p of Object.values(save.players)) {
    if (p.retired || p.prospect) continue;
    p.age++; p.injuryWeeks = 0; p.rookie = false;
    const d = Math.round(p.age <= 24 ? rng.normal(2.5, 2) : p.age <= 28 ? rng.normal(0.5, 1.5) : p.age <= 31 ? rng.normal(-1.2, 1.5) : rng.normal(-3, 2));
    const k = (v: number) => clamp(v + d + Math.round(rng.normal(0, 0.7)), 20, 99);
    p.ovr = clamp(p.ovr + d, 35, 99);
    p.spd = k(p.spd - (p.age >= 30 ? 1 : 0)); p.str = k(p.str); p.tha = k(p.tha); p.thp = k(p.thp); p.cth = k(p.cth); p.car = k(p.car); p.rbk = k(p.rbk); p.pbk = k(p.pbk); p.tak = k(p.tak); p.prs = k(p.prs); p.cov = k(p.cov); p.kpw = k(p.kpw); p.kac = k(p.kac);
    const pr = p.age >= 37 ? 0.8 : p.age >= 34 ? 0.35 : p.age >= 32 ? 0.12 : 0;
    if (rng.chance(pr * (p.pos === "K" || p.pos === "P" || p.pos === "QB" ? 0.5 : 1)) || (!p.teamId && p.age >= 33)) { p.retired = true; p.teamId = null; retired++; continue; }
    if (p.contract) p.contract.years--;
    if (p.teamId && p.contract && p.contract.years <= 0) {
      // la IA renueva a titulares jóvenes; el resto sale a la agencia libre
      const t = p.teamId;
      const starterish = roster(save, t).filter((x) => x.pos === p.pos && x.ovr > p.ovr).length < 2;
      const keep = starterish && p.age <= 30 ? 0.8 : 0.25;
      if (rng.chance(keep)) p.contract = { years: rng.int(1, 4), salary: estimateSalary(p.pos, p.ovr, p.age) };
      else { p.exTeam = t; p.teamId = null; p.contract = undefined; expired++; save.transactions.unshift({ date: stamp(save), text: `AGENTE LIBRE: ${p.pos} ${p.name} (${p.ovr}) deja ${save.teams[t].abbr}.` }); }
    }
  }
  // clase del draft (prospectos ficticios: la clase real futura no se conoce)
  const POS: NflPlayer["pos"][] = ["QB", "RB", "WR", "WR", "TE", "OT", "OT", "OG", "C", "DE", "DE", "DT", "LB", "LB", "CB", "CB", "S", "S", "K", "P"];
  const FIRST = ["Jalen", "Caleb", "Marcus", "Devin", "Tyler", "Malik", "Bryce", "Jordan", "Isaiah", "Trey", "Quinn", "Darius", "Elijah", "Cole", "Xavier", "Zion", "Garrett", "Jaxon", "Cam", "Tre"];
  const LAST = ["Holloway", "Pruitt", "Okonkwo", "Vance", "McCray", "Booker", "Sanders", "Tillman", "Ruffin", "Fairley", "Hargrove", "Kincaid", "Lockett", "Mabry", "Nwosu", "Ogletree", "Pettaway", "Quarles", "Roddy", "Stallworth"];
  const COLLEGES = ["Alabama", "Georgia", "Ohio State", "Michigan", "LSU", "Texas", "Oregon", "USC", "Clemson", "Penn State", "Notre Dame", "Florida State", "Miami", "Tennessee", "Oklahoma", "Utah", "Washington", "Iowa", "Wisconsin", "TCU"];
  for (let i = 0; i < 300; i++) {
    const pos = rng.pick(POS);
    const ovr = clamp(Math.round(77 - i * 0.065 + rng.normal(0, 3.5)), 50, 84);
    const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 5)), 25, 99);
    const p: NflPlayer = { id: `d${year}_${i}`, name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`, teamId: null, pos, ovr, age: rng.int(21, 23), number: 0, practiceSquad: false, rookie: true, prospect: true, college: rng.pick(COLLEGES),
      spd: a(pos === "WR" || pos === "CB" ? 8 : 0), str: a(-5), thp: a(pos === "QB" ? 2 : -40), tha: a(pos === "QB" ? -3 : -45), cth: a(["WR", "TE"].includes(pos) ? 0 : -30), car: a(pos === "RB" ? 0 : -30),
      rbk: a(["OT", "OG", "C", "TE"].includes(pos) ? 0 : -40), pbk: a(["OT", "OG", "C"].includes(pos) ? 0 : -40), tak: a(["LB", "S", "DE", "DT", "CB"].includes(pos) ? 0 : -40),
      prs: a(["DE", "DT"].includes(pos) ? 0 : -35), cov: a(["CB", "S"].includes(pos) ? 0 : -35), kpw: a(pos === "K" || pos === "P" ? 10 : -50), kac: a(pos === "K" || pos === "P" ? 5 : -50) };
    save.players[p.id] = p;
  }
  save.phase = "draft";
  save.version++;
  invalidateNflCache(save);
  return { retired, expired };
}

export function draftBoard(save: NflSave): NflPlayer[] {
  return Object.values(save.players).filter((p) => p.prospect && !p.teamId).sort((a, b) => b.ovr - a.ovr);
}
export function onTheClock(save: NflSave) {
  const id = save.draftOrder?.[save.draftPos ?? 0];
  return id ? save.picks.find((p) => p.id === id) : undefined;
}

export function makePick(save: NflSave, playerId: string): string {
  const pk = onTheClock(save);
  const p = save.players[playerId];
  if (!pk || !p || !p.prospect || p.teamId) return "Selección no válida.";
  const n = (save.draftPos ?? 0) + 1;
  p.teamId = pk.owner; p.draftPick = n;
  p.contract = { years: 4, salary: rookieSalary(n) };
  pk.used = true; pk.playerId = p.id;
  save.draftLog!.push({ pick: n, round: pk.round, team: pk.owner, player: p.id });
  save.transactions.unshift({ date: stamp(save), text: `DRAFT #${n} (R${pk.round}): ${save.teams[pk.owner].abbr} elige a ${p.pos} ${p.name} (${p.college}, ${p.ovr}).` });
  save.draftPos = n;
  invalidateNflCache(save);
  if (n >= (save.draftOrder?.length ?? 0)) finishDraft(save);
  save.version++;
  return `${save.teams[pk.owner].abbr} elige a ${p.name}.`;
}

export function aiPick(save: NflSave) {
  const pk = onTheClock(save);
  if (!pk) return;
  const board = draftBoard(save).slice(0, 10);
  const best = board.sort((a, b) => (b.ovr + positionNeed(save, pk.owner, b.pos) * 0.4 - (b.pos === "K" || b.pos === "P" ? 6 : 0)) - (a.ovr + positionNeed(save, pk.owner, a.pos) * 0.4 - (a.pos === "K" || a.pos === "P" ? 6 : 0)))[0];
  if (best) makePick(save, best.id);
}

// Simula el draft hasta que le toque al usuario (o hasta el final)
export function simDraft(save: NflSave, untilUser: boolean) {
  let guard = 0;
  while (save.phase === "draft" && guard++ < 400) {
    const pk = onTheClock(save);
    if (!pk) { finishDraft(save); break; }
    if (untilUser && pk.owner === save.userTeam) break;
    aiPick(save);
  }
}

function finishDraft(save: NflSave) {
  // prospectos no elegidos: agentes libres no drafteados
  for (const p of Object.values(save.players)) if (p.prospect) { p.prospect = false; if (!p.teamId) p.contract = undefined; }
  save.phase = "agencia";
  save.faDay = 0;
}

// 2) Agencia libre: cada "día" la IA firma y hace trades
export function faDayAdvance(save: NflSave) {
  const rng = new Rng(save.seed + save.seasonYear * 7 + (save.faDay ?? 0));
  aiSignings(save, rng, 1);
  if ((save.faDay ?? 0) % 2 === 0) aiTrades(save, rng, 2);
  save.faDay = (save.faDay ?? 0) + 1;
  save.version++;
}

// 3) Nueva temporada: recortes a 53 + practice squad, plantillas mínimas y calendario
export function startNflSeason(save: NflSave, cfg: NflConfig) {
  const rng = new Rng(save.seed + save.seasonYear * 3);
  for (let k = 0; k < 3; k++) aiSignings(save, rng, 1.5);
  for (const t of Object.keys(save.teams)) cutRoster(save, t, true);
  for (let k = 0; k < 2; k++) aiSignings(save, rng, 2); // cubrir posiciones que quedaron cortas
  // agentes libres que nadie quiere se retiran
  for (const p of Object.values(save.players)) if (!p.teamId && !p.retired && (p.age >= 31 || p.ovr < 58)) p.retired = true;
  invalidateNflCache(save);
  for (const t of Object.keys(save.teams)) for (let r = 1; r <= 7; r++) { const y = save.seasonYear + 4; if (!save.picks.some((p) => p.year === y && p.round === r && p.originalTeam === t)) save.picks.push({ id: `${y}-${r}-${t}`, year: y, round: r, originalTeam: t, owner: t }); }
  save.picks = save.picks.filter((p) => p.year > save.seasonYear + 1 || p.used);
  for (const o of save.tradeOffers ?? []) if (o.status === "pendiente") o.status = "caducada";
  save.tradeOffers = (save.tradeOffers ?? []).slice(0, 40);
  invalidateNflCache(save);
  save.seasonYear++;
  save.phase = "temporada";
  save.draftOrder = undefined; save.draftPos = undefined; save.faDay = undefined;
  createNflSchedule(save, cfg);
}

// Temporada baja completa automática (para simular varias temporadas seguidas)
export function nflOffseason(save: NflSave, cfg: NflConfig) {
  if (save.phase === "temporada") beginOffseason(save);
  if (save.phase === "draft") simDraft(save, false);
  while (save.phase === "agencia" && (save.faDay ?? 0) < 6) faDayAdvance(save);
  startNflSeason(save, cfg);
}
