"use client";
import { useEffect, useRef, useState } from "react";
import type { Fixture, MatchEvent, MatchResult, Tactics } from "@/engine/football/types";
import { FootballMatch } from "@/engine/football/match";
import { matchInputs, setResult } from "@/engine/football/season";
import { FORMATION_NAMES } from "@/engine/football/lineup";
import { Badge, Modal, SpeedControls, Stat, Tabs, cx } from "@/components/ui";
import { useF } from "./ctx";

const ICON: Partial<Record<MatchEvent["type"], string>> = { gol: "⚽", gol_pp: "⚽", amarilla: "🟨", doble_amarilla: "🟨🟥", roja: "🟥", cambio: "🔁", lesion: "🚑", var: "📺", penal_fallado: "❌", penal_atajado: "🧤", tiro_atajado: "🧤", palo: "🥅", corner: "⛳", tanda: "🎯", descanso: "⏸", final: "🏁", inicio: "▶", prorroga: "⏱", penales: "🎯", fuera_juego: "🚩" };

function useTicker(active: boolean, speed: number, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active || speed === 0) return;
    const id = setInterval(() => ref.current(), 1000 / speed);
    return () => clearInterval(id);
  }, [active, speed]);
}

export function LiveMatch({ f, onClose }: { f: Fixture; onClose: () => void }) {
  const { save, mutate, cfg } = useF();
  const [m] = useState(() => { const { home, away, opts } = matchInputs(save, f); return new FootballMatch(home, away, opts); });
  return <LiveMatchView m={m} title={`${save.comps[f.comp]?.name} · ${f.stage}`} onClose={onClose} onSave={(r) => { mutate((s) => setResult(s, f.id, r, cfg)); onClose(); }} />;
}

// Vista en vivo reutilizable (también la usan los torneos personalizados)
export function LiveMatchView({ m, title, onClose, onSave }: { m: FootballMatch; title: string; onClose: () => void; onSave: (r: MatchResult) => void }) {
  const [, setV] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<"narracion" | "stats" | "campo" | "gestion">("narracion");
  const bump = () => setV((v) => v + 1);
  useTicker(!m.finished, speed, () => { m.step(); if (m.finished) setSpeed(0); bump(); });
  useEffect(() => { if (speed === 0 && !m.finished) setTab((t) => (t === "narracion" ? "gestion" : t)); }, [speed, m.finished]);

  const [H, A] = m.sides;
  const r = m.result();
  const save_ = () => onSave(m.result());
  const evs = [...m.events].reverse().filter((e) => e.type !== "info" || e.text);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="rounded-xl bg-gradient-to-r from-sky-900/40 to-rose-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2"><Badge colors={H.input.colors} label={H.input.short} size={34} /><span className="truncate font-semibold">{H.input.name}</span></div>
          <div className="text-center">
            <div className="text-3xl font-bold tabular">{m.score[0]} - {m.score[1]}</div>
            <div className="text-xs text-acento">{m.displayMinute()}</div>
            {m.pensTaken[0] + m.pensTaken[1] > 0 && <div className="text-xs">Penales {m.pens[0]}-{m.pens[1]}</div>}
            {m.opts.firstLeg && <div className="text-[10px] text-gray-400">Global {m.score[0] + m.opts.firstLeg[0]}-{m.score[1] + m.opts.firstLeg[1]}</div>}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2"><span className="truncate text-right font-semibold">{A.input.name}</span><Badge colors={A.input.colors} label={A.input.short} size={34} /></div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <SpeedControls speed={speed} setSpeed={setSpeed} finished={m.finished} onEnd={() => { m.runToEnd(); setSpeed(0); bump(); }} />
          {m.finished && <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={onClose}>Descartar</button><button className="btn-primary btn-sm" onClick={save_}>Guardar resultado</button></div>}
        </div>
      </div>
      <div className="mt-2"><Tabs value={tab} onChange={setTab} tabs={[{ id: "narracion", label: "Narración" }, { id: "stats", label: "Estadísticas" }, { id: "campo", label: "Campo" }, { id: "gestion", label: "Cambios y táctica" }]} /></div>
      {tab === "narracion" && (
        <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
          {evs.map((e, i) => (
            <div key={i} className={cx("flex gap-2 rounded px-2 py-1 text-sm", (e.type === "gol" || e.type === "gol_pp") && "bg-acento/15 font-semibold")}>
              <span className="w-12 shrink-0 text-right text-xs text-gray-400 tabular">{e.min ? `${e.min}${e.add ? "+" + e.add : ""}'` : ""}</span>
              <span className="w-5 shrink-0">{ICON[e.type] ?? "·"}</span>
              <span className={cx(e.side === 0 && "text-sky-200", e.side === 1 && "text-rose-200")}>{e.text}</span>
            </div>
          ))}
        </div>
      )}
      {tab === "stats" && r.stats && (
        <div className="mt-3 space-y-2">
          <Stat label="Posesión" a={r.stats[0].poss} b={r.stats[1].poss} pct />
          <Stat label="Tiros" a={r.stats[0].shots} b={r.stats[1].shots} />
          <Stat label="A puerta" a={r.stats[0].onT} b={r.stats[1].onT} />
          <Stat label="xG" a={r.stats[0].xg.toFixed(2)} b={r.stats[1].xg.toFixed(2)} />
          <Stat label="Córners" a={r.stats[0].corners} b={r.stats[1].corners} />
          <Stat label="Faltas" a={r.stats[0].fouls} b={r.stats[1].fouls} />
          <Stat label="Fueras de juego" a={r.stats[0].offsides} b={r.stats[1].offsides} />
          <Stat label="Amarillas" a={r.stats[0].yellows} b={r.stats[1].yellows} />
          <Stat label="Rojas" a={r.stats[0].reds} b={r.stats[1].reds} />
          <Stat label="Atajadas" a={r.stats[0].saves} b={r.stats[1].saves} />
        </div>
      )}
      {tab === "campo" && <LivePitch m={m} />}
      {tab === "gestion" && <Management m={m} onChange={bump} />}
    </Modal>
  );
}

function LivePitch({ m }: { m: FootballMatch }) {
  return (
    <div className="pitch relative mx-auto mt-3 aspect-[2/3] max-w-md overflow-hidden rounded-xl border border-white/20">
      <div className="absolute left-0 right-0 top-1/2 border-t border-white/30" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
      {([0, 1] as const).map((s) => m.sides[s].on.map((o) => {
        const x = s === 0 ? o.x : 100 - o.x;
        const y = s === 0 ? 100 - o.y / 2 : o.y / 2;
        return (
          <div key={o.id} className={cx("absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center", o.off && "opacity-30")} style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/60 text-[10px] font-bold" style={{ background: m.sides[s].input.colors[0], color: "#fff" }}>{o.p.shirt ?? o.slot}</div>
            <div className="mt-0.5 max-w-[70px] truncate rounded bg-black/60 px-1 text-[9px]">{o.p.shortName}</div>
            <div className={cx("rounded px-1 text-[9px] font-bold", o.line.r >= 7.5 ? "bg-green-500 text-black" : o.line.r >= 6.5 ? "bg-yellow-400 text-black" : "bg-red-500")}>{o.line.r.toFixed(1)}{o.yc ? " 🟨" : ""}{o.line.g ? ` ⚽${o.line.g > 1 ? o.line.g : ""}` : ""}</div>
          </div>
        );
      }))}
    </div>
  );
}

function Management({ m, onChange }: { m: FootballMatch; onChange: () => void }) {
  const [side, setSide] = useState<0 | 1>(0);
  const [out, setOut] = useState("");
  const [inn, setInn] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const s = m.sides[side];
  const act = s.on.filter((o) => !o.off);
  const bench = s.bench.filter((p) => !s.used.has(p.id));
  const setT = (t: Partial<Tactics>) => { m.setTactics(side, t); onChange(); };
  return (
    <div className="mt-3 space-y-3 text-sm">
      <div className="flex gap-1">{([0, 1] as const).map((x) => <button key={x} className={cx("btn-sm btn flex-1", side === x ? "bg-acento text-black" : "border border-borde")} onClick={() => setSide(x)}>{m.sides[x].input.name}</button>)}</div>
      {!m.finished && m.phase !== "pre" && <p className="text-xs text-gray-400">Pausa el partido para hacer cambios. Cambios: {s.subs}/5 · ventanas usadas: {s.windows}/3 (el descanso no cuenta).</p>}
      <div className="card space-y-2">
        <div className="font-semibold">Cambio</div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={out} onChange={(e) => setOut(e.target.value)}>
            <option value="">Sale…</option>
            {act.map((o) => <option key={o.id} value={o.id}>{o.slot} · {o.p.shortName} ({Math.round(o.fit)}% · {o.line.r.toFixed(1)})</option>)}
          </select>
          <select className="input" value={inn} onChange={(e) => setInn(e.target.value)}>
            <option value="">Entra…</option>
            {bench.map((p) => <option key={p.id} value={p.id}>{p.positions[0]} · {p.shortName} ({p.ovr})</option>)}
          </select>
        </div>
        <button className="btn-primary btn-sm" disabled={!out || !inn || m.finished} onClick={() => { const e = m.manualSub(side, out, inn); setMsg(e ?? "Cambio realizado."); setOut(""); setInn(""); onChange(); }}>Hacer cambio</button>
        {msg && <div className="text-xs text-gray-300">{msg}</div>}
      </div>
      <div className="card grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-xs">Mentalidad<select className="input mt-1" value={s.tactics.mentality} onChange={(e) => setT({ mentality: e.target.value as Tactics["mentality"] })}><option value="defensiva">Defensiva</option><option value="equilibrada">Equilibrada</option><option value="ofensiva">Ofensiva</option></select></label>
        <label className="text-xs">Presión<select className="input mt-1" value={s.tactics.pressing} onChange={(e) => setT({ pressing: e.target.value as Tactics["pressing"] })}><option value="bajo">Baja</option><option value="medio">Media</option><option value="alto">Alta</option></select></label>
        <label className="text-xs">Ritmo<select className="input mt-1" value={s.tactics.tempo} onChange={(e) => setT({ tempo: e.target.value as Tactics["tempo"] })}><option value="lento">Lento</option><option value="normal">Normal</option><option value="rapido">Rápido</option></select></label>
        <label className="text-xs">Formación<select className="input mt-1" value={s.lineup.formation} onChange={(e) => { m.setFormation(side, e.target.value); onChange(); }}>{FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}</select></label>
      </div>
      <div className="text-xs text-gray-400">Ataque {s.str.att.toFixed(1)} · Medio {s.str.mid.toFixed(1)} · Defensa {s.str.def.toFixed(1)} · Portero {s.str.gk.toFixed(1)}</div>
    </div>
  );
}

// Varios partidos a la vez
export function MultiLive({ fixtures, onClose }: { fixtures: Fixture[]; onClose: () => void }) {
  const { save, mutate, cfg } = useF();
  const [ms] = useState(() => fixtures.map((f) => { const { home, away, opts } = matchInputs(save, f); return { f, m: new FootballMatch(home, away, opts) }; }));
  const [, setV] = useState(0);
  const [speed, setSpeed] = useState(2);
  const allDone = ms.every((x) => x.m.finished);
  useTicker(!allDone, speed, () => { for (const x of ms) if (!x.m.finished) x.m.step(); if (ms.every((x) => x.m.finished)) setSpeed(0); setV((v) => v + 1); });
  return (
    <Modal title={`En vivo · ${fixtures.length} partidos`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SpeedControls speed={speed} setSpeed={setSpeed} finished={allDone} onEnd={() => { ms.forEach((x) => x.m.runToEnd()); setSpeed(0); setV((v) => v + 1); }} />
        {allDone && <button className="btn-primary btn-sm" onClick={() => { mutate((s) => { for (const x of ms) setResult(s, x.f.id, x.m.result(), cfg); }); onClose(); }}>Guardar todos</button>}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {ms.map(({ f, m }) => {
          const last = [...m.events].reverse().find((e) => ["gol", "gol_pp", "roja", "doble_amarilla", "penal_atajado", "penal_fallado", "tanda"].includes(e.type));
          return (
            <div key={f.id} className="rounded-lg border border-borde p-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge colors={m.sides[0].input.colors} label={m.sides[0].input.short} size={20} />
                <span className="flex-1 truncate">{m.sides[0].input.name}</span>
                <b className="tabular">{m.score[0]}-{m.score[1]}</b>
                <span className="flex-1 truncate text-right">{m.sides[1].input.name}</span>
                <Badge colors={m.sides[1].input.colors} label={m.sides[1].input.short} size={20} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-gray-400"><span className="truncate">{last?.text ?? save.comps[f.comp]?.short}</span><span className="text-acento">{m.displayMinute()}</span></div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
