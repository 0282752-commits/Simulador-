"use client";
import { useEffect, useRef, useState } from "react";
import type { CupDraw, CupSave } from "@/engine/cup/types";
import { Badge, Modal, cx } from "@/components/ui";

const CSS = `
@keyframes bolaIn { 0% { transform: scale(.2) rotate(-200deg); opacity: 0 } 60% { transform: scale(1.15) rotate(10deg); opacity: 1 } 100% { transform: scale(1) rotate(0) } }
@keyframes slotIn { 0% { background: rgba(250,204,21,.55) } 100% { background: transparent } }
.bola-in { animation: bolaIn .6s ease-out both }
.slot-in { animation: slotIn 1.4s ease-out both }
`;

function Chip({ save, id, dim, small }: { save: CupSave; id: string; dim?: boolean; small?: boolean }) {
  const t = save.teams[id];
  if (!t) return null;
  return (
    <span className={cx("flex min-w-0 items-center gap-1", dim && "opacity-30 line-through")}>
      <Badge colors={t.colors} label={t.short} size={small ? 16 : 20} />
      <span className={cx("truncate", small ? "text-[11px]" : "text-xs")}>{t.name}</span>
    </span>
  );
}

export function DrawCeremony({ save, draw, onClose, onRedraw, canRedraw }: { save: CupSave; draw: CupDraw; onClose: () => void; onRedraw?: () => void; canRedraw?: boolean }) {
  const [n, setN] = useState(0); // bolas reveladas
  const [auto, setAuto] = useState(false);
  const [speed, setSpeed] = useState(1);
  const total = draw.steps.length;
  const done = n >= total;
  const per = draw.kind === "suizo" ? save.format.swissMatches : 1;
  const next = () => setN((x) => Math.min(total, x + per));
  const ref = useRef(next);
  ref.current = next;
  useEffect(() => {
    if (!auto || done) return;
    const id = setInterval(() => ref.current(), (draw.kind === "suizo" ? 1400 : 1100) / speed);
    return () => clearInterval(id);
  }, [auto, done, speed, draw.kind]);
  useEffect(() => { if (done) setAuto(false); }, [done]);
  useEffect(() => { setN(0); }, [draw]);

  const shown = draw.steps.slice(0, n);
  const last = shown[shown.length - 1];
  const drawnSet = new Set(draw.kind === "suizo" ? shown.map((s) => s.target) : shown.map((s) => s.team));

  return (
    <Modal title={`🎱 ${draw.title}`} onClose={onClose} wide>
      <style>{CSS}</style>
      <ul className="mb-2 list-disc pl-5 text-[11px] text-gray-400">{draw.rules.map((r) => <li key={r}>{r}</li>)}</ul>
      {draw.byes?.length ? <p className="mb-2 text-[11px] text-sky-300">Exentos de esta ronda: {draw.byes.map((b) => save.teams[b]?.name).join(", ")}</p> : null}

      {/* Bola actual */}
      <div className="flex min-h-[112px] flex-col items-center justify-center rounded-xl bg-gradient-to-b from-white/10 to-transparent p-3">
        {last ? (
          <div key={n} className="bola-in flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white shadow-lg">
              <Badge colors={save.teams[last.team].colors} label={save.teams[last.team].short} size={40} />
            </div>
            <div className="mt-1 text-base font-bold">{draw.kind === "suizo" ? save.teams[last.target]?.name : save.teams[last.team]?.name}</div>
            <div className="text-xs text-acento">
              {draw.kind === "grupos" ? `➜ Grupo ${last.target}` : draw.kind === "cruces" ? `➜ ${last.target}` : `rivales sorteados (${draw.potNames.length} bombos)`}
            </div>
            {last.note && <div className="mt-0.5 text-[11px] text-yellow-300">{last.note}</div>}
          </div>
        ) : <div className="text-sm text-gray-400">Pulsa “Sacar bola” para empezar el sorteo</div>}
      </div>

      {/* Controles */}
      <div className="sticky top-12 z-10 mt-2 flex flex-wrap items-center gap-1 bg-panel py-1">
        <button className="btn-primary btn-sm" disabled={done} onClick={next}>🎱 {draw.kind === "suizo" ? "Siguiente equipo" : "Sacar bola"}</button>
        <button className="btn-ghost btn-sm" disabled={done} onClick={() => setAuto(!auto)}>{auto ? "⏸ Pausa" : "▶ Automático"}</button>
        {[1, 2, 4].map((s) => <button key={s} className={cx("btn-sm btn", speed === s ? "bg-acento text-black" : "border border-borde")} onClick={() => setSpeed(s)}>x{s}</button>)}
        <button className="btn-ghost btn-sm" disabled={done} onClick={() => setN(total)}>⏭ Ver todo</button>
        <span className="ml-auto text-xs text-gray-400">{Math.min(n, total)}/{total}</span>
        {canRedraw && onRedraw && <button className="btn-ghost btn-sm" onClick={() => { onRedraw(); setN(0); }}>🔁 Repetir sorteo</button>}
        {done && <button className="btn-primary btn-sm" onClick={onClose}>Listo</button>}
      </div>

      {/* Bombos */}
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(draw.pots.length, 4)}, minmax(0, 1fr))` }}>
        {draw.pots.map((pot, i) => (
          <div key={i} className="rounded-lg border border-borde p-1.5">
            <div className="mb-1 text-[10px] font-semibold uppercase text-gray-400">{draw.potNames[i]}</div>
            <div className="space-y-0.5">{pot.map((t) => <Chip key={t} save={save} id={t} small dim={drawnSet.has(t)} />)}</div>
          </div>
        ))}
      </div>

      {/* Resultado que se va llenando */}
      {draw.kind === "grupos" && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {draw.targets.map((g) => {
            const inG = shown.filter((s) => s.target === g);
            const size = draw.steps.filter((s) => s.target === g).length;
            return (
              <div key={g} className="rounded-lg border border-borde p-1.5">
                <div className="mb-1 text-xs font-bold">Grupo {g}</div>
                {Array.from({ length: size }).map((_, k) => (
                  <div key={k} className={cx("flex h-6 items-center gap-1 rounded border-b border-borde/40 px-1 text-[11px] last:border-0", inG[k] && inG[k] === last && "slot-in")}>
                    <span className="w-3 text-gray-500">{g}{k + 1}</span>{inG[k] ? <Chip save={save} id={inG[k].team} small /> : <span className="text-gray-600">—</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {draw.kind === "cruces" && (
        <div className="mt-3 grid gap-1 sm:grid-cols-2">
          {draw.targets.map((c) => {
            const s = shown.filter((x) => x.target === c);
            return (
              <div key={c} className={cx("flex items-center gap-2 rounded-lg border border-borde px-2 py-1", s.length > 0 && s[s.length - 1] === last && "slot-in")}>
                <span className="w-14 shrink-0 text-[10px] text-gray-500">{c}</span>
                <span className="min-w-0 flex-1">{s[0] ? <Chip save={save} id={s[0].team} small /> : <span className="text-gray-600">?</span>}</span>
                <span className="text-[10px] text-gray-500">vs</span>
                <span className="min-w-0 flex-1">{s[1] ? <Chip save={save} id={s[1].team} small /> : <span className="text-gray-600">?</span>}</span>
              </div>
            );
          })}
        </div>
      )}
      {draw.kind === "suizo" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...new Set(shown.map((s) => s.target))].reverse().map((t) => (
            <div key={t} className={cx("rounded-lg border border-borde p-1.5", last?.target === t && "slot-in")}>
              <div className="mb-1 font-semibold"><Chip save={save} id={t} /></div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {shown.filter((s) => s.target === t).map((s, k) => (
                  <div key={k} className="flex items-center gap-1 text-[11px]"><span className="w-4 text-gray-500">B{s.pot + 1}</span><span className="min-w-0 flex-1"><Chip save={save} id={s.team} small /></span><span className="text-[10px] text-gray-500">{s.note === "en casa" ? "🏠" : "✈️"}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
