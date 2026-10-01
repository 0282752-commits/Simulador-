"use client";
import { useEffect, useMemo, useState } from "react";
import type { DepthSlot, NflGame as Game, NflPlayer, NflResult, NflSave } from "@/engine/nfl/types";
import { DEPTH_SLOTS, DEPTH_STARTERS } from "@/engine/nfl/types";
import { nflTeamSummary, nextTeamGame, recordNflCampaign, simulateNflSeason, applyNflResult, conferenceSeeds, currentWeek, divisionStandings, gameInput, nflChampion, nflLeaders, nflRows, playNflWeek, roster, simulateGame, teamStrength, type NflConfig } from "@/engine/nfl/season";
import { nflOffseason, beginOffseason, draftBoard, onTheClock, makePick, simDraft, faDayAdvance, startNflSeason } from "@/engine/nfl/offseason";
import { answerTradeOffer, askingSalary, assetLabel, assetValue, capRoom, evaluateTradeFor, fmtUsd, freeAgents, offerContract, payroll, proposeTrade, tradeWindowOpen, ensureNflContracts, estimateSalary } from "@/engine/nfl/market";
import { teamDepth, teamOverall, slotValue, SLOT_POS } from "@/engine/nfl/depth";
import { NflGameSim } from "@/engine/nfl/game";
import { loadNflData } from "@/lib/data";
import { Badge, Empty, Field, Modal, Progress, SpeedControls, Stat, Tabs, cx } from "@/components/ui";
import { fmtDate } from "@/lib/rng";

type Tab = "mi" | "draft" | "agencia" | "semana" | "standings" | "playoffs" | "lideres" | "equipos" | "mercado" | "historial";
type Mut = (fn: (s: NflSave) => void) => void;
const WEEK_LABEL = (w: number) => (w <= 18 ? `Semana ${w}` : ({ 19: "Wild Card", 20: "Divisional", 21: "Campeonatos de conferencia", 22: "Super Bowl" } as Record<number, string>)[w]);

export default function NflGame({ save, tick, mutate }: { save: NflSave; tick: number; mutate: Mut }) {
  const [tab, setTab] = useState<Tab>(save.focusMode || save.userTeam ? "mi" : "semana");
  const cw = currentWeek(save);
  const [week, setWeek] = useState<number>(cw ?? 1);
  const [live, setLive] = useState<Game | null>(null);
  const [manual, setManual] = useState<Game | null>(null);
  const [detail, setDetail] = useState<Game | null>(null);
  const [team, setTeam] = useState<string>(Object.keys(save.teams)[0]);
  const [busy, setBusy] = useState<{ t: string; p: number } | null>(null);
  const [cfg, setCfg] = useState<NflConfig | null>(null);
  const champ = nflChampion(save);
  const weeks = [...new Set(save.games.map((g) => g.week))].sort((a, b) => a - b);
  const games = save.games.filter((g) => g.week === week);

  async function simUntil(stop: "semana" | "regular" | "fin") {
    let w: number | null;
    setBusy({ t: "Simulando…", p: 0 });
    while ((w = currentWeek(save)) !== null) {
      if (stop === "regular" && w > 18) break;
      playNflWeek(save, w);
      setBusy({ t: `Simulando ${WEEK_LABEL(w)}`, p: w / 22 });
      await new Promise((r) => setTimeout(r, 0));
      if (stop === "semana") break;
    }
    setBusy(null);
    const nw = currentWeek(save);
    if (nw) setWeek(nw);
    mutate(() => {});
  }

  async function run(label: string, task: (p: (t: string, x: number) => void) => Promise<void>) {
    setBusy({ t: label, p: 0 });
    try { await task((t, x) => setBusy({ t, p: x })); } finally { setBusy(null); const nw = currentWeek(save); if (nw) setWeek(nw); mutate(() => {}); }
  }
  const getCfg = async () => { const c = cfg ?? (await loadNflData()).cfg; setCfg(c); return c; };

  async function newSeason() {
    const c = cfg ?? (await loadNflData()).cfg;
    setCfg(c);
    mutate((s) => { nflOffseason(s, c); });
    setWeek(1);
  }

  return (
    <div className="px-3 pb-24">
      <div className="sticky top-0 z-20 -mx-3 border-b border-borde bg-fondo/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs text-gray-400">Temporada NFL {save.seasonYear}{save.dataSource.demo && <span className="ml-1 rounded bg-yellow-500/20 px-1 text-yellow-300">JUGADORES DEMO</span>}</div>
            <div className="font-semibold">{cw ? WEEK_LABEL(cw) : save.phase === "draft" ? `Draft ${save.seasonYear + 1}` : save.phase === "agencia" ? `Agencia libre · día ${(save.faDay ?? 0) + 1}` : champ ? `Campeón: ${save.teams[champ].city} ${save.teams[champ].name}` : "Temporada terminada"}</div>
          </div>
          {cw ? <button className="btn-primary" onClick={() => simUntil("semana")}>Simular semana ▸</button>
            : save.phase === "draft" ? <button className="btn-primary" onClick={() => setTab("draft")}>Ir al draft ▸</button>
            : save.phase === "agencia" ? <button className="btn-primary" onClick={async () => { const c = await getCfg(); mutate((s) => startNflSeason(s, c)); setWeek(1); setTab(save.focusMode ? "mi" : "semana"); }}>Empezar temporada {save.seasonYear + 1} ▸</button>
            : <button className="btn-primary" onClick={() => { mutate((s) => { beginOffseason(s); }); setTab("draft"); }}>Temporada baja: draft ▸</button>}
        </div>
        {cw && <div className="mt-2 flex gap-1"><button className="btn-ghost btn-sm" disabled={cw > 18} onClick={() => simUntil("regular")}>Hasta fin de temporada regular</button><button className="btn-ghost btn-sm" onClick={() => simUntil("fin")}>⏭ Simular temporada completa</button></div>}
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[...(save.focusMode || save.userTeam ? [{ id: "mi" as Tab, label: "★ Mi equipo" }] : []), { id: "semana", label: "Partidos" }, { id: "draft", label: save.phase === "draft" ? "● Draft" : "Draft" }, { id: "agencia", label: save.phase === "agencia" ? "● Agentes libres" : "Agentes libres" }, { id: "standings", label: "Standings" }, { id: "playoffs", label: "Playoffs" }, { id: "lideres", label: "Líderes" }, { id: "equipos", label: "Equipos" }, { id: "mercado", label: "Mercado" }, { id: "historial", label: "Historial" }]} />
      </div>

      {tab === "mi" && <MyNfl save={save} mutate={mutate} run={run} getCfg={getCfg} onLive={setLive} onManual={setManual} onDetail={setDetail} />}
      {save.focusMode && !save.userTeam && <NflTeamPicker save={save} mutate={mutate} />}
      {tab === "semana" && (
        <div className="mt-3">
          <select className="input" value={week} onChange={(e) => setWeek(Number(e.target.value))}>{weeks.map((w) => <option key={w} value={w}>{WEEK_LABEL(w)}</option>)}</select>
          {week <= 18 && <p className="mt-1 text-xs text-gray-400">Descansan: {Object.keys(save.teams).filter((t) => !games.some((g) => g.home === t || g.away === t)).join(", ") || "nadie"}</p>}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {games.map((g) => <GameRow key={g.id} g={g} save={save} mutate={mutate} onLive={() => setLive(g)} onManual={() => setManual(g)} onDetail={() => setDetail(g)} />)}
          </div>
          {!games.length && <Empty>Sin partidos.</Empty>}
        </div>
      )}
      {tab === "draft" && <DraftRoom save={save} mutate={mutate} />}
      {tab === "agencia" && <FreeAgency save={save} mutate={mutate} />}
      {tab === "standings" && <Standings save={save} tick={tick} />}
      {tab === "playoffs" && <Playoffs save={save} onDetail={setDetail} />}
      {tab === "lideres" && <Leaders save={save} tick={tick} />}
      {tab === "equipos" && <TeamView save={save} mutate={mutate} team={team} setTeam={setTeam} />}
      {tab === "mercado" && <NflMarket save={save} mutate={mutate} />}
      {tab === "historial" && (
        <div className="mt-3 space-y-2 text-sm">
          {!save.history.length && <Empty>Las temporadas cerradas aparecerán aquí.</Empty>}
          {[...save.history].reverse().map((h) => <div key={h.season} className="card">🏆 {h.season}: <b>{save.teams[h.champion]?.city} {save.teams[h.champion]?.name}</b> · subcampeón {save.teams[h.runnerUp]?.name ?? "—"}</div>)}
          {save.transactions.length > 0 && <div className="card text-xs"><b>Movimientos</b>{save.transactions.slice(0, 40).map((t, i) => <div key={i}>{t.date} · {t.text}</div>)}</div>}
        </div>
      )}

      {live && <NflLive g={live} save={save} onClose={() => setLive(null)} onSave={(r) => { mutate((s) => applyNflResult(s, live.id, r)); setLive(null); }} />}
      {manual && <NflManual g={manual} save={save} onClose={() => setManual(null)} onSave={(r) => { mutate((s) => applyNflResult(s, manual.id, r)); setManual(null); }} />}
      {detail && detail.result && <NflDetail g={detail} save={save} onClose={() => setDetail(null)} />}
      {busy && <Progress text={busy.t} pct={busy.p} />}
    </div>
  );
}

function TeamName({ save, id, short }: { save: NflSave; id: string; short?: boolean }) {
  const t = save.teams[id];
  return <span className="flex min-w-0 items-center gap-2"><Badge colors={t.colors} label={t.abbr} size={22} /><span className="truncate">{short ? t.abbr : `${t.city} ${t.name}`}</span></span>;
}

function GameRow({ g, save, mutate, onLive, onManual, onDetail }: { g: Game; save: NflSave; mutate: Mut; onLive: () => void; onManual: () => void; onDetail: () => void }) {
  const r = g.result;
  return (
    <div className="rounded-lg border border-borde bg-fondo/60 p-2 text-sm">
      <div className="mb-1 flex justify-between text-[11px] text-gray-400"><span>{g.label ?? WEEK_LABEL(g.week)}{g.neutral ? " · campo neutral" : ""}</span><span>{fmtDate(g.date)}</span></div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><TeamName save={save} id={g.away} /></div>
        <b className="tabular">{r ? r.as : ""}</b>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="min-w-0 flex-1"><TeamName save={save} id={g.home} /> </div>
        <b className="tabular">{r ? r.hs : ""}</b>
      </div>
      {r?.ot && <div className="text-right text-[10px] text-gray-400">prórroga</div>}
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        {!r ? (
          <>
            <button className="btn-ghost btn-sm" onClick={onManual}>✍ Manual</button>
            <button className="btn-ghost btn-sm" onClick={onLive}>▶ En vivo</button>
            <button className="btn-primary btn-sm" onClick={() => mutate((s) => applyNflResult(s, g.id, simulateGame(s, g)))}>⚡ Simular</button>
          </>
        ) : (
          <>
            <button className="btn-ghost btn-sm" onClick={onDetail}>Resumen</button>
            <button className="btn-ghost btn-sm" onClick={onManual}>Editar</button>
            <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Borrar el resultado?")) mutate((s) => applyNflResult(s, g.id, undefined)); }}>Borrar</button>
          </>
        )}
      </div>
    </div>
  );
}

// ===== Visor en vivo =====
function NflLive({ g, save, onClose, onSave }: { g: Game; save: NflSave; onClose: () => void; onSave: (r: NflResult) => void }) {
  const [sim] = useState(() => new NflGameSim(gameInput(save, g.home), gameInput(save, g.away), { neutral: g.neutral, playoff: g.playoff }));
  const [, setV] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<"jugadas" | "stats" | "depth">("jugadas");
  useTickerN(!sim.finished, speed, () => { sim.step(); if (sim.finished) setSpeed(0); setV((v) => v + 1); });
  const r = sim.result();
  const offTeam = save.teams[sim.sides[sim.poss].input.team.id];
  // posición del balón en el campo (0-100 desde la end zone izquierda = local defiende la izquierda)
  const x = sim.poss === 0 ? sim.ball : 100 - sim.ball;
  const toGo = sim.poss === 0 ? sim.ball + sim.togo : 100 - sim.ball - sim.togo;
  const H = save.teams[g.home], A = save.teams[g.away];
  return (
    <Modal title={`${A.abbr} @ ${H.abbr} · ${g.label ?? WEEK_LABEL(g.week)}`} onClose={onClose} wide>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-white/5 p-3">
        <TeamName save={save} id={g.away} />
        <div className="text-center">
          <div className="text-3xl font-bold tabular">{sim.score[1]} - {sim.score[0]}</div>
          <div className="text-xs text-acento">{sim.q <= 4 ? `${sim.q}º C` : `PR${sim.q - 4}`} · {sim.clockStr()}</div>
          {!sim.finished && sim.phase === "play" && <div className="text-xs">{sim.downStr()} · {sim.spot()} · 🏈 {offTeam.abbr}</div>}
          <div className="text-[10px] text-gray-400">Tiempos: {sim.sides[1].timeouts} · {sim.sides[0].timeouts}</div>
        </div>
        <div className="flex justify-end"><TeamName save={save} id={g.home} /></div>
      </div>
      <div className="field-nfl relative mt-2 h-20 overflow-hidden rounded-lg border border-white/30">
        <div className="absolute inset-y-0 left-0 w-[8%] opacity-80" style={{ background: H.colors[0] }} />
        <div className="absolute inset-y-0 right-0 w-[8%] opacity-80" style={{ background: A.colors[0] }} />
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => <div key={y} className="absolute inset-y-0 border-l border-white/30 text-[9px] text-white/60" style={{ left: `${8 + y * 0.84}%` }}><span className="ml-0.5">{y <= 50 ? y : 100 - y}</span></div>)}
        {sim.phase === "play" && !sim.finished && <div className="absolute inset-y-0 border-l-2 border-yellow-300" style={{ left: `${8 + Math.max(0, Math.min(100, toGo)) * 0.84}%` }} />}
        <div className="absolute top-1/2 h-4 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-800 ring-2 ring-white transition-all" style={{ left: `${8 + x * 0.84}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <SpeedControls speed={speed} setSpeed={setSpeed} finished={sim.finished} onEnd={() => { sim.runToEnd(); setSpeed(0); setV((v) => v + 1); }} />
        {sim.finished && <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={onClose}>Descartar</button><button className="btn-primary btn-sm" onClick={() => onSave(sim.result())}>Guardar resultado</button></div>}
      </div>
      <div className="mt-2"><Tabs value={tab} onChange={setTab} tabs={[{ id: "jugadas", label: "Jugada a jugada" }, { id: "stats", label: "Estadísticas" }, { id: "depth", label: "Depth chart (pausa)" }]} /></div>
      {tab === "jugadas" && (
        <div className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto text-sm">
          {[...sim.log].reverse().map((e, i) => (
            <div key={i} className={cx("rounded px-2 py-1", e.scoring && "bg-acento/15 font-semibold")}>
              <span className="mr-2 text-xs text-gray-400">{e.q <= 4 ? `${e.q}C` : "PR"} {sim.clockStr(e.clock)}</span>{e.text}
            </div>
          ))}
        </div>
      )}
      {tab === "stats" && r.stats && (
        <div className="mt-2 space-y-2">
          <div className="flex justify-between text-xs text-gray-400"><span>{H.abbr}</span><span>{A.abbr}</span></div>
          <Stat label="Yardas totales" a={r.stats[0].yards} b={r.stats[1].yards} />
          <Stat label="Pase" a={r.stats[0].passYds} b={r.stats[1].passYds} />
          <Stat label="Carrera" a={r.stats[0].rushYds} b={r.stats[1].rushYds} />
          <Stat label="Primeros downs" a={r.stats[0].firstDowns} b={r.stats[1].firstDowns} />
          <Stat label="Pérdidas" a={r.stats[0].turnovers} b={r.stats[1].turnovers} />
          <Stat label="Capturas" a={r.stats[0].sacks} b={r.stats[1].sacks} />
          <Stat label="Castigos" a={r.stats[0].penalties} b={r.stats[1].penalties} />
          <Stat label="3ª conversión" a={`${r.stats[0].thirdConv}/${r.stats[0].thirdAtt}`} b={`${r.stats[1].thirdConv}/${r.stats[1].thirdAtt}`} />
          <div className="text-xs text-gray-400">Por cuartos: {H.abbr} {r.quarters[0].join(" · ")} | {A.abbr} {r.quarters[1].join(" · ")}</div>
        </div>
      )}
      {tab === "depth" && (
        <div className="mt-2 space-y-2">
          {speed !== 0 && !sim.finished && <p className="text-xs text-yellow-300">Pausa el partido para editar el depth chart.</p>}
          {([0, 1] as const).map((s) => (
            <details key={s} className="card">
              <summary className="cursor-pointer text-sm font-semibold">{sim.sides[s].input.team.name}</summary>
              <DepthEditor players={sim.sides[s].input.roster} depth={sim.sides[s].depth} disabled={speed !== 0 || sim.finished} onChange={(d) => { sim.setDepth(s, d); setV((v) => v + 1); }} />
            </details>
          ))}
        </div>
      )}
    </Modal>
  );
}

function useTickerN(active: boolean, speed: number, fn: () => void) {
  const [ref] = useState(() => ({ fn }));
  ref.fn = fn;
  useIntervalEffect(active && speed > 0 ? 1000 / (speed * 1.5) : null, () => ref.fn());
}
function useIntervalEffect(ms: number | null, fn: () => void) {
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [ms]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ===== Editor de depth chart =====
function DepthEditor({ players, depth, onChange, disabled }: { players: NflPlayer[]; depth: Record<DepthSlot, string[]>; onChange: (d: Record<DepthSlot, string[]>) => void; disabled?: boolean }) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const move = (slot: DepthSlot, i: number, dir: -1 | 1) => {
    const list = [...depth[slot]];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange({ ...depth, [slot]: list });
  };
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {DEPTH_SLOTS.map((slot) => (
        <div key={slot} className="rounded border border-borde p-2">
          <div className="mb-1 text-xs font-bold">{slot} <span className="font-normal text-gray-400">(titulares: {DEPTH_STARTERS[slot]})</span></div>
          {depth[slot].slice(0, DEPTH_STARTERS[slot] + 3).map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <div key={id} className={cx("flex items-center gap-1 text-xs", i < DEPTH_STARTERS[slot] ? "text-white" : "text-gray-400")}>
                <span className="w-4">{i + 1}.</span>
                <span className="flex-1 truncate">{p.name} <span className="text-gray-500">{p.pos} {Math.round(slotValue(p, slot))}{p.injuryWeeks ? " 🚑" : ""}</span></span>
                <button disabled={disabled} className="btn-ghost btn-sm !px-1" onClick={() => move(slot, i, -1)}>▲</button>
                <button disabled={disabled} className="btn-ghost btn-sm !px-1" onClick={() => move(slot, i, 1)}>▼</button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ===== Resultado manual =====
function NflManual({ g, save, onClose, onSave }: { g: Game; save: NflSave; onClose: () => void; onSave: (r: NflResult) => void }) {
  const [hs, setHs] = useState(g.result?.hs ?? 0);
  const [as, setAs] = useState(g.result?.as ?? 0);
  const [ot, setOt] = useState(!!g.result?.ot);
  type Td = { side: 0 | 1; kind: "TD pase" | "TD carrera" | "FG"; player: string; passer: string };
  const [plays, setPlays] = useState<Td[]>([]);
  const rosters = [roster(save, g.home), roster(save, g.away)];
  const tie = hs === as;
  function build(): NflResult {
    const players: NflResult["players"] = {};
    const line = (id: string, side: 0 | 1) => (players[id] ??= { side });
    for (const p of plays) {
      if (!p.player) continue;
      const l = line(p.player, p.side);
      if (p.kind === "FG") { l.fgm = (l.fgm ?? 0) + 1; l.fga = (l.fga ?? 0) + 1; }
      else if (p.kind === "TD carrera") { l.rushTD = (l.rushTD ?? 0) + 1; }
      else { l.recTD = (l.recTD ?? 0) + 1; l.rec = (l.rec ?? 0) + 1; if (p.passer) { const q = line(p.passer, p.side); q.passTD = (q.passTD ?? 0) + 1; } }
    }
    return { hs, as, ot: ot || undefined, quarters: [[hs, 0, 0, 0], [as, 0, 0, 0]], players, scoring: plays.map((p) => ({ q: 0, clock: 0, side: p.side, text: `${p.kind} ${save.players[p.player]?.name ?? ""}` })), manual: true };
  }
  return (
    <Modal title="Resultado manual" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${save.teams[g.away].name} (visitante)`}><input type="number" className="input text-lg font-bold" value={as} onChange={(e) => setAs(Number(e.target.value) || 0)} /></Field>
        <Field label={`${save.teams[g.home].name} (local)`}><input type="number" className="input text-lg font-bold" value={hs} onChange={(e) => setHs(Number(e.target.value) || 0)} /></Field>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={ot} onChange={(e) => setOt(e.target.checked)} /> Prórroga</label>
      {g.playoff && tie && <p className="mt-1 text-xs text-red-300">En playoffs no puede haber empate.</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Anotaciones (opcional)</summary>
        {plays.map((p, i) => {
          const upd = (x: Partial<Td>) => setPlays(plays.map((y, k) => (k === i ? { ...y, ...x } : y)));
          const r = rosters[p.side];
          return (
            <div key={i} className="mt-1 grid grid-cols-4 gap-1 text-xs">
              <select className="input !px-1" value={p.side} onChange={(e) => upd({ side: Number(e.target.value) as 0 | 1, player: "", passer: "" })}><option value={0}>{save.teams[g.home].abbr}</option><option value={1}>{save.teams[g.away].abbr}</option></select>
              <select className="input !px-1" value={p.kind} onChange={(e) => upd({ kind: e.target.value as Td["kind"] })}><option>TD pase</option><option>TD carrera</option><option>FG</option></select>
              <select className="input !px-1" value={p.player} onChange={(e) => upd({ player: e.target.value })}><option value="">Jugador…</option>{r.filter((x) => (p.kind === "FG" ? x.pos === "K" : p.kind === "TD carrera" ? ["RB", "QB", "WR"].includes(x.pos) : ["WR", "TE", "RB"].includes(x.pos))).map((x) => <option key={x.id} value={x.id}>{x.pos} {x.name}</option>)}</select>
              {p.kind === "TD pase" ? <select className="input !px-1" value={p.passer} onChange={(e) => upd({ passer: e.target.value })}><option value="">QB…</option>{r.filter((x) => x.pos === "QB").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select> : <span />}
            </div>
          );
        })}
        <button className="btn-ghost btn-sm mt-2" onClick={() => setPlays([...plays, { side: 0, kind: "TD pase", player: "", passer: "" }])}>+ Anotación</button>
      </details>
      <button className="btn-primary mt-4 w-full" disabled={!!g.playoff && tie} onClick={() => onSave(build())}>Guardar</button>
    </Modal>
  );
}

function NflDetail({ g, save, onClose }: { g: Game; save: NflSave; onClose: () => void }) {
  const r = g.result!;
  const lines = Object.entries(r.players);
  const nm = (id: string) => save.players[id]?.name ?? "?";
  const top = (side: 0 | 1, k: "passYds" | "rushYds" | "recYds") => lines.filter(([, l]) => l.side === side && l[k]).sort((a, b) => (b[1][k] ?? 0) - (a[1][k] ?? 0))[0];
  return (
    <Modal title={`${save.teams[g.away].abbr} ${r.as} @ ${r.hs} ${save.teams[g.home].abbr}${r.ot ? " (PR)" : ""}`} onClose={onClose}>
      <div className="text-xs text-gray-400">Por cuartos — {save.teams[g.away].abbr}: {r.quarters[1].join(" · ")} | {save.teams[g.home].abbr}: {r.quarters[0].join(" · ")}</div>
      <h4 className="mt-3 text-sm font-semibold">Anotaciones</h4>
      <div className="text-sm">{r.scoring.map((s, i) => <div key={i}>{s.q ? `${s.q <= 4 ? s.q + "C" : "PR"} · ` : ""}{save.teams[s.side === 0 ? g.home : g.away].abbr}: {s.text}</div>)}</div>
      <h4 className="mt-3 text-sm font-semibold">Destacados</h4>
      {([1, 0] as const).map((side) => (
        <div key={side} className="text-xs">
          <b>{save.teams[side === 0 ? g.home : g.away].abbr}</b>
          {(["passYds", "rushYds", "recYds"] as const).map((k) => { const t = top(side, k); return t ? <span key={k}> · {nm(t[0])} {t[1][k]} yd {k === "passYds" ? `(${t[1].passCmp}/${t[1].passAtt}, ${t[1].passTD ?? 0} TD, ${t[1].int ?? 0} INT)` : ""}</span> : null; })}
        </div>
      ))}
      {r.injuries?.length ? <div className="mt-2 text-xs">🚑 {r.injuries.map((i) => `${nm(i.player)} (${i.weeks} sem.)`).join(" · ")}</div> : null}
    </Modal>
  );
}

// ===== Standings, playoffs, líderes =====
function Standings({ save, tick }: { save: NflSave; tick: number }) {
  const rows = useMemo(() => nflRows(save), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const divs = useMemo(() => divisionStandings(save, rows), [save, rows]);
  const [view, setView] = useState<"div" | "conf">("div");
  return (
    <div className="mt-3">
      <div className="mb-2 flex gap-1">{(["div", "conf"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx("btn-sm btn", view === v ? "bg-acento text-black" : "border border-borde")}>{v === "div" ? "Divisiones" : "Conferencias (siembra)"}</button>)}</div>
      {view === "div" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(divs).map(([d, ids]) => (
            <div key={d} className="card !p-2">
              <div className="mb-1 text-sm font-semibold">{d}</div>
              <table className="w-full text-sm">
                <thead><tr><th className="th">Equipo</th><th className="th">G</th><th className="th">P</th><th className="th">E</th><th className="th">Pct</th><th className="th">PF</th><th className="th">PC</th><th className="th">Div</th><th className="th">Racha</th></tr></thead>
                <tbody>{ids.map((id) => { const r = rows.get(id)!; return <tr key={id} className="border-t border-borde/60"><td className="td"><TeamName save={save} id={id} short /></td><td className="td">{r.w}</td><td className="td">{r.l}</td><td className="td">{r.t}</td><td className="td">{r.pct.toFixed(3).replace(/^0/, "")}</td><td className="td">{r.pf}</td><td className="td">{r.pa}</td><td className="td">{r.divW}-{r.divL}</td><td className="td">{r.streak}</td></tr>; })}</tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(["AFC", "NFC"] as const).map((c) => (
            <div key={c} className="card !p-2">
              <div className="mb-1 text-sm font-semibold">{c}</div>
              {conferenceSeeds(save, c, rows).map((id, i) => { const r = rows.get(id)!; return <div key={id} className={cx("flex items-center gap-2 border-t border-borde/60 py-1 text-sm", i === 6 && "border-b-2 border-b-acento")}><span className="w-5 text-gray-400">{i + 1}</span><div className="min-w-0 flex-1"><TeamName save={save} id={id} /></div><span className="tabular">{r.w}-{r.l}{r.t ? `-${r.t}` : ""}</span></div>; })}
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-500">Desempates: enfrentamientos directos, récord divisional/de conferencia, partidos comunes, fuerza de la victoria, fuerza del calendario, diferencia de puntos y volado. Los empates de 3+ equipos se resuelven aplicando los criterios en orden (aproximación del reglamento).</p>
    </div>
  );
}

function Playoffs({ save, onDetail }: { save: NflSave; onDetail: (g: Game) => void }) {
  const po = save.games.filter((g) => g.playoff);
  if (!po.length) return <Empty>Los playoffs (14 equipos) empiezan al terminar la semana 18.</Empty>;
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-4">
      {[19, 20, 21, 22].map((w) => (
        <div key={w}>
          <div className="mb-1 text-sm font-semibold">{WEEK_LABEL(w)}</div>
          <div className="space-y-2">
            {po.filter((g) => g.week === w).map((g) => (
              <button key={g.id} className="card block w-full !p-2 text-left text-sm" onClick={() => g.result && onDetail(g)}>
                {[g.away, g.home].map((t) => {
                  const won = g.result && ((t === g.home) === (g.result.hs > g.result.as));
                  return <div key={t} className={cx("flex items-center justify-between", won && "font-bold text-acento")}><TeamName save={save} id={t} short /><span>{g.result ? (t === g.home ? g.result.hs : g.result.as) : ""}</span></div>;
                })}
                <div className="text-[10px] text-gray-400">{g.label}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Leaders({ save, tick }: { save: NflSave; tick: number }) {
  const tot = useMemo(() => nflLeaders(save), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats: [string, string, string?][] = [["passYds", "Yardas de pase", "passTD"], ["passTD", "TD de pase"], ["rushYds", "Yardas por tierra", "rushTD"], ["recYds", "Yardas de recepción", "rec"], ["recTD", "TD de recepción"], ["sacks", "Capturas"], ["defInt", "Intercepciones"], ["tkl", "Tacleadas"], ["fgm", "Goles de campo", "fga"]];
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      {cats.map(([k, label, extra]) => {
        const list = [...tot.entries()].filter(([, t]) => t[k]).sort((a, b) => (b[1][k] ?? 0) - (a[1][k] ?? 0)).slice(0, 8);
        return (
          <div key={k} className="card !p-2">
            <div className="mb-1 text-sm font-semibold">{label}</div>
            {list.map(([pid, t], i) => { const p = save.players[pid]; return <div key={pid} className="flex justify-between text-xs"><span className="truncate">{i + 1}. {p?.name} <span className="text-gray-500">{p?.teamId ? save.teams[p.teamId]?.abbr : ""}</span></span><b>{t[k]}{extra ? <span className="font-normal text-gray-400"> ({t[extra] ?? 0})</span> : null}</b></div>; })}
            {!list.length && <div className="text-xs text-gray-500">Sin datos.</div>}
          </div>
        );
      })}
    </div>
  );
}

// ===== Equipos =====
function TeamView({ save, mutate, team, setTeam }: { save: NflSave; mutate: Mut; team: string; setTeam: (t: string) => void }) {
  const t = save.teams[team];
  const r = roster(save, team);
  const depth = teamDepth(t, r, (p) => !p.injuryWeeks);
  const ov = teamOverall(r, depth);
  const [edit, setEdit] = useState<NflPlayer | null>(null);
  return (
    <div className="mt-3">
      <select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>
        {Object.values(save.teams).sort((a, b) => a.city.localeCompare(b.city)).map((x) => <option key={x.id} value={x.id}>{x.city} {x.name} ({x.conf} {x.div})</option>)}
      </select>
      <div className="card mt-3 flex flex-wrap items-center gap-3">
        <Badge colors={t.colors} label={t.abbr} size={44} />
        <div className="flex-1"><div className="text-lg font-bold">{t.city} {t.name}</div><div className="text-xs text-gray-400">Nómina {fmtUsd(payroll(save, team))} · espacio bajo el tope {fmtUsd(capRoom(save, team))} · OVR {ov.ovr} · Ataque {ov.off} · Defensa {ov.def} · Especiales {ov.st} · {r.filter((p) => !p.practiceSquad).length} en el roster + {r.filter((p) => p.practiceSquad).length} en practice squad</div></div>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={t.autoDepth !== false} onChange={(e) => mutate((s) => { s.teams[team].autoDepth = e.target.checked; if (!e.target.checked) s.teams[team].depth = teamDepth(s.teams[team], roster(s, team)); })} /> Depth chart automático</label>
        <button className="btn-ghost btn-sm" onClick={() => setEdit({ id: `nu${Date.now().toString(36)}`, name: "Nuevo Jugador", teamId: team, pos: "WR", ovr: 70, age: 23, number: 0, practiceSquad: false, spd: 80, str: 60, thp: 30, tha: 30, cth: 72, car: 60, rbk: 40, pbk: 40, tak: 40, prs: 30, cov: 35, kpw: 20, kac: 20 })}>+ Crear jugador</button>
      </div>
      <details className="card mt-3" open={t.autoDepth === false}>
        <summary className="cursor-pointer text-sm font-semibold">Depth chart {t.autoDepth !== false && <span className="font-normal text-gray-400">(automático: desactívalo para editar)</span>}</summary>
        <DepthEditor players={r} depth={depth} disabled={t.autoDepth !== false} onChange={(d) => mutate((s) => { s.teams[team].depth = d; })} />
      </details>
      <div className="scroll-x mt-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr>{["Pos", "Jugador", "Edad", "OVR", "VEL", "FUE", "PRE", "POT", "ATR", "TAC", "COB", "BLQ", "Estado", "Contrato"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {r.sort((a, b) => Object.values(SLOT_POS).flat().indexOf(a.pos) - Object.values(SLOT_POS).flat().indexOf(b.pos) || b.ovr - a.ovr).map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-borde/60 hover:bg-white/5" onClick={() => setEdit(p)}>
                <td className="td">{p.pos}</td><td className="td">{p.name}{p.practiceSquad && <span className="ml-1 text-[10px] text-gray-400">PS</span>}{p.rookie && <span className="ml-1 text-[10px] text-sky-300">novato</span>}</td>
                <td className="td">{p.age}</td><td className="td font-bold">{p.ovr}</td><td className="td">{p.spd}</td><td className="td">{p.str}</td><td className="td">{p.tha}</td><td className="td">{p.thp}</td><td className="td">{p.cth}</td><td className="td">{p.tak}</td><td className="td">{p.cov}</td><td className="td">{Math.round((p.rbk + p.pbk) / 2)}</td>
                <td className="td text-xs">{p.injuryWeeks ? `🚑 ${p.injuryWeeks} sem.` : "✔"}</td>
                <td className="td whitespace-nowrap text-xs">{p.contract ? `${fmtUsd(p.contract.salary)} · ${p.contract.years}a` : "—"}{team === save.userTeam && p.contract && p.contract.years <= 1 && <button className="btn-ghost btn-sm ml-1 !px-1 !py-0" onClick={(e) => { e.stopPropagation(); const sal = Math.round(estimateSalary(p.pos, p.ovr, p.age) * 1.05 / 5e4) * 5e4; if (capRoom(save, team) + p.contract!.salary < sal) { alertMsg(`Sin espacio: extender a ${p.name} cuesta ${fmtUsd(sal)}/año.`); return; } mutate((s) => { s.players[p.id].contract = { years: p.age >= 31 ? 2 : 4, salary: sal }; s.transactions.unshift({ date: `${s.seasonYear}`, text: `EXTENSIÓN: ${s.teams[team].abbr} renueva a ${p.name} (${fmtUsd(sal)}/año).` }); }); }}>Extender</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">Fuerza del equipo: {teamStrength(save, team).toFixed(1)} (media de los 30 mejores).</p>
      {edit && <NflPlayerEditor p={edit} onClose={() => setEdit(null)} onSave={(p) => { mutate((s) => { s.players[p.id] = p; }); setEdit(null); }} />}
    </div>
  );
}

function NflPlayerEditor({ p: p0, onClose, onSave }: { p: NflPlayer; onClose: () => void; onSave: (p: NflPlayer) => void }) {
  const [p, setP] = useState<NflPlayer>({ ...p0 });
  const num = (k: keyof NflPlayer, label: string) => <Field label={label}><input type="number" min={1} max={99} className="input" value={p[k] as number} onChange={(e) => setP({ ...p, [k]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} /></Field>;
  return (
    <Modal title={`Editar · ${p0.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre"><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="Posición"><select className="input" value={p.pos} onChange={(e) => setP({ ...p, pos: e.target.value as NflPlayer["pos"] })}>{["QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        {num("age", "Edad")}{num("ovr", "Overall")}{num("spd", "Velocidad")}{num("str", "Fuerza")}{num("tha", "Precisión de pase")}{num("thp", "Potencia de pase")}{num("cth", "Atrapadas")}{num("car", "Carrera")}{num("rbk", "Bloqueo de carrera")}{num("pbk", "Bloqueo de pase")}{num("tak", "Tacleo")}{num("prs", "Presión")}{num("cov", "Cobertura")}{num("kpw", "Potencia de pateo")}{num("kac", "Precisión de pateo")}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={p.practiceSquad} onChange={(e) => setP({ ...p, practiceSquad: e.target.checked })} /> Practice squad</label>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={() => onSave(p)}>Guardar</button>
    </Modal>
  );
}

// ===== Mercado: trades que deben aprobar ambos equipos =====
function alertMsg(m: string) { if (typeof window !== "undefined") window.alert?.(m); }
function NflMarket({ save, mutate }: { save: NflSave; mutate: Mut }) {
  ensureNflContracts(save);
  const ids = Object.keys(save.teams).sort();
  const [a, setA] = useState(save.userTeam ?? ids[0]);
  const [b, setB] = useState(ids.find((x) => x !== (save.userTeam ?? ids[0]))!);
  const [selA, setSelA] = useState<string[]>([]);
  const [selB, setSelB] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const assets = (t: string) => [
    ...roster(save, t).sort((x, y) => y.ovr - x.ovr).map((p) => ({ id: p.id, label: `${p.pos} ${p.name} (${p.ovr}, ${p.age}a, ${p.contract ? fmtUsd(p.contract.salary) : "—"})` })),
    ...save.picks.filter((pk) => pk.owner === t && !pk.used).sort((x, y) => x.year - y.year || x.round - y.round).map((pk) => ({ id: pk.id, label: `🎟 ${assetLabel(save, pk.id)}` })),
  ];
  const sum = (l: string[]) => l.reduce((s, id) => s + assetValue(save, id), 0);
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const col = (t: string, setT: (v: string) => void, sel: string[], setSel: (v: string[]) => void, title: string) => (
    <div>
      <div className="text-xs text-gray-400">{title}</div>
      <select className="input" value={t} onChange={(e) => { setT(e.target.value); setSel([]); setMsg(null); }}>{ids.map((x) => <option key={x} value={x}>{save.teams[x].city} {save.teams[x].name}{x === save.userTeam ? " ★" : ""}</option>)}</select>
      <div className="mt-1 text-[11px] text-gray-400">Espacio bajo el tope: {fmtUsd(capRoom(save, t))}</div>
      <div className="mt-1 max-h-72 overflow-y-auto rounded border border-borde p-1">
        {assets(t).map((x) => <label key={x.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={sel.includes(x.id)} onChange={() => toggle(sel, setSel, x.id)} /><span className="flex-1">{x.label}</span><span className="text-gray-500">{assetValue(save, x.id)}</span></label>)}
      </div>
    </div>
  );
  const va = sum(selA), vb = sum(selB);
  const preview = a !== b && (selA.length || selB.length) ? [a, b].filter((t) => t !== save.userTeam).map((t) => (t === a ? evaluateTradeFor(save, a, selB, selA) : evaluateTradeFor(save, b, selA, selB))) : [];
  return (
    <div className="mt-3 space-y-3">
      <div className="card text-xs text-gray-400">
        {tradeWindowOpen(save) ? "Ventana de trades abierta (fecha límite: semana 9; se reabre en la temporada baja)." : "Pasó la fecha límite de trades (semana 9). Se reabre al terminar la temporada."}
        {" "}Cada equipo controlado por la IA evalúa el valor que recibe (jugadores según media, edad, posición y contrato; selecciones según la tabla de valor del draft), sus necesidades y el tope salarial. Contratos y salarios son estimaciones de la app.
      </div>
      <TradeInbox save={save} mutate={mutate} />
      <div className="grid gap-3 md:grid-cols-2">{col(a, setA, selA, setSelA, "Equipo A entrega")}{col(b, setB, selB, setSelB, "Equipo B entrega")}</div>
      <div className="text-sm">Valor: {save.teams[a].abbr} entrega <b>{va}</b> · {save.teams[b].abbr} entrega <b>{vb}</b></div>
      {preview.map((v, i) => <div key={i} className={cx("text-xs", v.accept ? "text-acento" : "text-yellow-300")}>{v.accept ? "Probablemente acepten: " : "Ahora mismo no aceptarían: "}{v.reason}</div>)}
      <button className="btn-primary w-full" disabled={a === b || (!selA.length && !selB.length)} onClick={() => { let r = { ok: false, msg: "" }; mutate((s) => { r = proposeTrade(s, a, b, selA, selB); }); setMsg(r.msg); if (r.ok) { setSelA([]); setSelB([]); } }}>Proponer trade</button>
      {msg && <div className="card text-sm">{msg}</div>}
      <div className="text-xs text-gray-400">{save.userTeam ? `Como ${save.teams[save.userTeam].abbr} aceptas tu parte; el otro equipo decide.` : "Sin equipo propio: deben aceptar los dos equipos."}</div>
    </div>
  );
}

function TradeInbox({ save, mutate }: { save: NflSave; mutate: Mut }) {
  const [msg, setMsg] = useState<string | null>(null);
  const pend = (save.tradeOffers ?? []).filter((o) => o.status === "pendiente" && o.to === save.userTeam);
  if (!pend.length && !msg) return null;
  return (
    <div className="card space-y-2">
      <h4 className="text-sm font-semibold">📨 Ofertas de trade por tus jugadores</h4>
      {pend.map((o) => (
        <div key={o.id} className="rounded border border-borde p-2 text-sm">
          <b>{save.teams[o.from].city} {save.teams[o.from].name}</b> ofrece {o.give.map((x) => assetLabel(save, x)).join(", ")} por {o.get.map((x) => assetLabel(save, x)).join(", ")}
          <div className="text-[11px] text-gray-400">Valor que recibes {o.give.reduce((s, x) => s + assetValue(save, x), 0)} · valor que das {o.get.reduce((s, x) => s + assetValue(save, x), 0)}</div>
          <div className="mt-1 flex gap-1"><button className="btn-primary btn-sm" onClick={() => { let t = ""; mutate((s) => { t = answerTradeOffer(s, o.id, true); }); setMsg(t); }}>Aceptar</button><button className="btn-ghost btn-sm" onClick={() => { let t = ""; mutate((s) => { t = answerTradeOffer(s, o.id, false); }); setMsg(t); }}>Rechazar</button></div>
        </div>
      ))}
      {msg && <div className="text-xs">{msg}</div>}
    </div>
  );
}

// ===== Sala de draft =====
function DraftRoom({ save, mutate }: { save: NflSave; mutate: Mut }) {
  const [pos, setPos] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (save.phase !== "draft") {
    const log = save.draftLog ?? [];
    return (
      <div className="mt-3 space-y-2">
        <p className="text-sm text-gray-400">{save.phase === "agencia" ? "El draft terminó." : "El draft se abre al terminar el Super Bowl (botón “Temporada baja”)."} {log.length ? "Resultados del último draft:" : ""}</p>
        <div className="max-h-[60vh] overflow-y-auto text-xs">{log.map((l) => { const p = save.players[l.player]; return <div key={l.pick} className={cx("border-b border-borde/50 py-0.5", l.team === save.userTeam && "text-acento")}>#{l.pick} (R{l.round}) {save.teams[l.team].abbr}: {p?.pos} {p?.name} · {p?.college} · {p?.ovr}</div>; })}</div>
      </div>
    );
  }
  const pk = onTheClock(save);
  const mine = pk?.owner === save.userTeam;
  const board = draftBoard(save).filter((p) => !pos || p.pos === pos).slice(0, 60);
  const recent = [...(save.draftLog ?? [])].reverse().slice(0, 12);
  return (
    <div className="mt-3 space-y-3">
      <div className={cx("card", mine && "ring-2 ring-acento")}>
        <div className="text-sm">Selección #{(save.draftPos ?? 0) + 1} · ronda {pk?.round} · en el reloj: <b>{pk ? `${save.teams[pk.owner].city} ${save.teams[pk.owner].name}` : "—"}</b>{pk && pk.originalTeam !== pk.owner ? ` (vía ${pk.originalTeam})` : ""}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {save.userTeam && <button className="btn-ghost btn-sm" disabled={mine} onClick={() => mutate((s) => simDraft(s, true))}>⏩ Simular hasta mi turno</button>}
          <button className="btn-ghost btn-sm" onClick={() => mutate((s) => simDraft(s, false))}>⏭ Simular draft completo</button>
        </div>
        {mine && <p className="mt-2 text-sm text-acento">¡Te toca! Elige un jugador del tablero.</p>}
      </div>
      <div className="flex flex-wrap gap-1">{["", "QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S", "K", "P"].map((p) => <button key={p} onClick={() => setPos(p)} className={cx("btn-sm btn", pos === p ? "bg-acento text-black" : "border border-borde")}>{p || "Todos"}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="space-y-1">
          {board.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-borde px-2 py-1 text-sm">
              <span className="w-6 text-xs text-gray-500">{i + 1}</span>
              <span className="w-8 text-xs font-bold">{p.pos}</span>
              <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-gray-400">{p.college} · {p.age}a · VEL {p.spd}</span></span>
              <b className="tabular">{p.ovr}</b>
              {mine && <button className="btn-primary btn-sm" onClick={() => { let t = ""; mutate((s) => { t = makePick(s, p.id); if (s.userTeam) simDraft(s, true); }); setMsg(t); }}>Elegir</button>}
            </div>
          ))}
        </div>
        <div className="card text-xs">
          <div className="mb-1 font-semibold">Últimas selecciones</div>
          {recent.map((l) => { const p = save.players[l.player]; return <div key={l.pick} className={cx(l.team === save.userTeam && "text-acento")}>#{l.pick} {save.teams[l.team].abbr}: {p?.pos} {p?.name} ({p?.ovr})</div>; })}
        </div>
      </div>
      {msg && <div className="text-sm">{msg}</div>}
      <p className="text-[11px] text-gray-500">Clase del draft generada por la app (los prospectos reales de años futuros no se conocen).</p>
    </div>
  );
}

// ===== Agencia libre =====
function FreeAgency({ save, mutate }: { save: NflSave; mutate: Mut }) {
  ensureNflContracts(save);
  const [pos, setPos] = useState("");
  const [team, setTeam] = useState(save.userTeam ?? Object.keys(save.teams)[0]);
  const [offer, setOffer] = useState<{ id: string; salary: number; years: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = freeAgents(save).filter((p) => !pos || p.pos === pos).sort((a, b) => b.ovr - a.ovr).slice(0, 80);
  return (
    <div className="mt-3 space-y-3">
      <div className="card text-xs text-gray-400">
        {save.phase === "agencia" ? `Agencia libre abierta (día ${(save.faDay ?? 0) + 1}). Cada día que avanzas, la IA firma jugadores y los precios bajan.` : "Durante la temporada puedes firmar agentes libres disponibles (por ejemplo, para cubrir lesiones)."}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>{Object.keys(save.teams).sort().map((t) => <option key={t} value={t}>{save.teams[t].city} {save.teams[t].name}</option>)}</select>
        <span className="text-xs text-gray-400">Espacio bajo el tope: <b className="text-white">{fmtUsd(capRoom(save, team))}</b> · {roster(save, team).length} jugadores</span>
        {save.phase === "agencia" && <button className="btn-primary btn-sm ml-auto" onClick={() => mutate((s) => faDayAdvance(s))}>Avanzar un día ▸</button>}
      </div>
      <div className="flex flex-wrap gap-1">{["", "QB", "RB", "WR", "TE", "OT", "OG", "C", "DE", "DT", "LB", "CB", "S", "K", "P"].map((p) => <button key={p} onClick={() => setPos(p)} className={cx("btn-sm btn", pos === p ? "bg-acento text-black" : "border border-borde")}>{p || "Todos"}</button>)}</div>
      <div className="space-y-1">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 rounded border border-borde px-2 py-1 text-sm">
            <span className="w-8 text-xs font-bold">{p.pos}</span>
            <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-xs text-gray-400">{p.age}a{p.exTeam ? ` · ex ${p.exTeam}` : ""} · pide {fmtUsd(askingSalary(save, p))}/año</span></span>
            <b className="tabular">{p.ovr}</b>
            <button className="btn-ghost btn-sm" onClick={() => { setOffer({ id: p.id, salary: askingSalary(save, p), years: p.age >= 31 ? 1 : 3 }); setMsg(null); }}>Ofertar</button>
          </div>
        ))}
        {!list.length && <Empty>No hay agentes libres en esa posición.</Empty>}
      </div>
      {offer && (
        <Modal title={`Oferta a ${save.players[offer.id].name}`} onClose={() => setOffer(null)}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Salario anual (USD)"><input type="number" step={50000} className="input" value={offer.salary} onChange={(e) => setOffer({ ...offer, salary: Number(e.target.value) || 0 })} /></Field>
            <Field label="Años"><select className="input" value={offer.years} onChange={(e) => setOffer({ ...offer, years: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></Field>
          </div>
          <button className="btn-primary mt-3 w-full" onClick={() => { let r = { ok: false, msg: "" }; mutate((s) => { r = offerContract(s, team, offer.id, offer.salary, offer.years); }); setMsg(r.msg); if (r.ok) setOffer(null); }}>Enviar oferta</button>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
        </Modal>
      )}
      {msg && !offer && <div className="card text-sm">{msg}</div>}
    </div>
  );
}

// ===== Modo "mi equipo" =====
function NflTeamPicker({ save, mutate, onClose }: { save: NflSave; mutate: Mut; onClose?: () => void }) {
  return (
    <Modal title="Elige tu equipo" onClose={onClose ?? (() => {})} wide>
      {(["AFC", "NFC"] as const).map((conf) => (
        <div key={conf} className="mb-3">
          <div className="mb-1 text-xs font-semibold uppercase text-gray-400">{conf}</div>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {Object.values(save.teams).filter((t) => t.conf === conf).sort((a, b) => a.div.localeCompare(b.div) || a.city.localeCompare(b.city)).map((t) => (
              <button key={t.id} className="flex items-center gap-2 rounded-lg border border-borde p-2 text-left text-sm hover:border-acento" onClick={() => { mutate((s) => { s.userTeam = t.id; s.focusMode = true; }); onClose?.(); }}>
                <Badge colors={t.colors} label={t.abbr} size={24} /><span className="truncate">{t.city} {t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

function MyNfl({ save, mutate, run, getCfg, onLive, onManual, onDetail }: { save: NflSave; mutate: Mut; run: (l: string, t: (p: (t: string, x: number) => void) => Promise<void>) => Promise<void>; getCfg: () => Promise<NflConfig>; onLive: (g: Game) => void; onManual: (g: Game) => void; onDetail: (g: Game) => void }) {
  const [picker, setPicker] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const team = save.userTeam ? save.teams[save.userTeam] : null;
  if (!team) return <div className="mt-6 text-center"><button className="btn-primary" onClick={() => setPicker(true)}>Elegir equipo</button>{picker && <NflTeamPicker save={save} mutate={mutate} onClose={() => setPicker(false)} />}</div>;
  const next = nextTeamGame(save, team.id);
  const done = currentWeek(save) === null;
  const phase = save.phase ?? "temporada";
  const sum = nflTeamSummary(save, team.id);
  const mine = save.games.filter((g) => g.result && (g.home === team.id || g.away === team.id)).sort((a, b) => b.week - a.week).slice(0, 6);
  const wait = () => new Promise((r) => setTimeout(r, 0));
  const toMyGame = (play: boolean) => run("Simulando hasta mi partido…", async (p) => {
    const g = nextTeamGame(save, team.id);
    if (!g) return;
    let w: number | null;
    while ((w = currentWeek(save)) !== null && w < g.week) { playNflWeek(save, w); p(WEEK_LABEL(w), w / 22); await wait(); }
    for (const x of save.games.filter((x) => x.week === g.week && !x.result && x.id !== g.id)) applyNflResult(save, x.id, simulateGame(save, x));
    if (play) { applyNflResult(save, g.id, simulateGame(save, g)); const wk = currentWeek(save); if (wk === g.week) playNflWeek(save, g.week); }
  });
  const seasons = (n: number) => run(`Simulando ${n} temporada${n > 1 ? "s" : ""}…`, async (p) => {
    const c = await getCfg();
    const years: number[] = [];
    if (currentWeek(save) === null || save.phase !== "temporada") nflOffseason(save, c);
    for (let k = 0; k < n; k++) {
      simulateNflSeason(save, (w) => p(`Temporada ${save.seasonYear} · ${WEEK_LABEL(w)}`, (k + w / 22) / n));
      years.push(save.seasonYear);
      await wait();
      if (k < n - 1) nflOffseason(save, c); else recordNflCampaign(save);
    }
    setSummary((save.myHistory ?? []).filter((h) => years.includes(h.season)).map((h) => `${h.season}${h.champion ? " 🏆 CAMPEÓN" : ""}\n  ${h.lines.join("\n  ")}`).join("\n\n"));
  });
  return (
    <div className="mt-3 space-y-3">
      <div className="card flex flex-wrap items-center gap-3">
        <Badge colors={team.colors} label={team.abbr} size={48} />
        <div className="min-w-0 flex-1"><div className="text-lg font-bold">{team.city} {team.name}</div><div className="text-xs text-gray-400">{sum.lines.join(" · ")}</div></div>
        <button className="btn-ghost btn-sm" onClick={() => setPicker(true)}>Cambiar equipo</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {!done ? (
          <>
            <button className="btn-primary !py-3" disabled={!next} onClick={() => toMyGame(true)}>⚡ Jugar mi próximo partido</button>
            <button className="btn-ghost !py-3" disabled={!next} onClick={() => toMyGame(false)}>⏩ Avanzar hasta mi partido (para verlo en vivo)</button>
            <button className="btn-primary !py-3 sm:col-span-2" onClick={() => seasons(1)}>⏭ Simular toda la temporada (regular + playoffs)</button>
          </>
        ) : phase === "temporada" ? (
          <>
            <button className="btn-primary !py-3" onClick={() => mutate((s) => { beginOffseason(s); })}>Temporada baja: ir al draft ▸</button>
            <button className="btn-ghost !py-3" onClick={async () => { const c = await getCfg(); mutate((s) => { nflOffseason(s, c); }); }}>Simular draft y agencia libre automáticamente</button>
          </>
        ) : (
          <div className="card text-sm sm:col-span-2">{phase === "draft" ? "📋 Estás en el draft: ve a la pestaña Draft para hacer tus selecciones." : "✍ Agencia libre abierta: ficha jugadores en la pestaña Agentes libres y luego empieza la temporada."}</div>
        )}
        <div className="flex flex-wrap items-center gap-1 sm:col-span-2"><span className="text-xs text-gray-400">Simular varias temporadas seguidas (con draft):</span>{[3, 5, 10].map((n) => <button key={n} className="btn-ghost btn-sm" onClick={() => seasons(n)}>{n} temporadas</button>)}</div>
      </div>
      <TradeInbox save={save} mutate={mutate} />
      {next && <div><h4 className="mb-1 text-sm font-semibold text-gray-300">Próximo partido</h4><GameRow g={next} save={save} mutate={mutate} onLive={() => onLive(next)} onManual={() => onManual(next)} onDetail={() => onDetail(next)} /></div>}
      {mine.length > 0 && <div><h4 className="mb-1 text-sm font-semibold text-gray-300">Últimos resultados</h4><div className="grid gap-2 md:grid-cols-2">{mine.map((g) => <GameRow key={g.id} g={g} save={save} mutate={mutate} onLive={() => onLive(g)} onManual={() => onManual(g)} onDetail={() => onDetail(g)} />)}</div></div>}
      {(save.myHistory?.length ?? 0) > 0 && (
        <div className="card text-xs">
          <h4 className="mb-2 text-sm font-semibold">Historial de mis temporadas</h4>
          {[...save.myHistory!].reverse().map((h) => <div key={h.season} className="border-b border-borde/50 py-1"><b>{h.season}</b> · {save.teams[h.team]?.name}{h.champion && <span className="text-acento"> · 🏆 Campeón</span>}<div className="text-gray-400">{h.lines.join(" · ")}</div></div>)}
        </div>
      )}
      {picker && <NflTeamPicker save={save} mutate={mutate} onClose={() => setPicker(false)} />}
      {summary && <Modal title="Resumen de las temporadas" onClose={() => setSummary(null)}><pre className="whitespace-pre-wrap text-sm">{summary}</pre></Modal>}
    </div>
  );
}
