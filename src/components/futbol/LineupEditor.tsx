"use client";
import { useMemo, useRef, useState } from "react";
import type { Fixture, Lineup, Player, Pos, Tactics } from "@/engine/football/types";
import { FORMATIONS, FORMATION_NAMES, bestEleven, ensureLineup, slotRating, slotsOf, squadOf, type Slot } from "@/engine/football/lineup";
import { availability, getIndex, playerStatus } from "@/engine/football/season";
import { Badge, Modal, cx } from "@/components/ui";
import { useF } from "./ctx";

const POS_LIST: Pos[] = ["POR", "DFC", "LD", "LI", "CAD", "CAI", "MCD", "MC", "MD", "MI", "MCO", "ED", "EI", "DC", "SD"];
type Sel = { kind: "xi"; i: number } | { kind: "bench"; id: string } | { kind: "res"; id: string } | null;

export function LineupEditor({ clubId, fixture, onClose }: { clubId: string; fixture?: Fixture; onClose: () => void }) {
  const { save, mutate } = useF();
  const [cid, setCid] = useState(clubId);
  const club = save.clubs[cid];
  const date = fixture?.date ?? save.date;
  const comp = save.comps[fixture?.comp ?? club.leagueId ?? ""] ?? Object.values(save.comps)[0];
  const squad = useMemo(() => squadOf(cid, save.players), [save, cid]);
  const idx = getIndex(save);
  const avail = useMemo(() => availability(save, idx, cid, comp, date), [save, idx, cid, comp, date]);
  const [draft, setDraft] = useState<Lineup>(() => structuredClone(ensureLineup(club, squad, avail)));
  const [sel, setSel] = useState<Sel>(null);
  const [moveMode, setMoveMode] = useState(false);
  const pitchRef = useRef<HTMLDivElement>(null);
  const slots: Slot[] = draft.customSlots ?? FORMATIONS[draft.formation];
  const byId = new Map(squad.map((p) => [p.id, p]));
  const status = (id: string) => playerStatus(save, id, date, comp);
  const reserves = squad.filter((p) => !draft.starters.includes(p.id) && !draft.bench.includes(p.id));

  const switchClub = (c: string) => {
    const cl = save.clubs[c];
    const sq = squadOf(c, save.players);
    setCid(c);
    setDraft(structuredClone(ensureLineup(cl, sq, availability(save, idx, c, save.comps[fixture?.comp ?? cl.leagueId ?? ""] ?? comp, date))));
    setSel(null);
  };

  const idAt = (s: Sel): string | null => (!s ? null : s.kind === "xi" ? draft.starters[s.i] : s.id);
  function place(a: Sel, b: Sel) {
    if (!a || !b) return;
    const d: Lineup = structuredClone(draft);
    const ida = idAt(a), idb = idAt(b);
    const put = (s: Sel, id: string | null) => {
      if (!s) return;
      if (s.kind === "xi") d.starters[s.i] = id;
      else if (s.kind === "bench") { const k = d.bench.indexOf(s.id); if (id) d.bench[k] = id; else d.bench.splice(k, 1); }
    };
    if (b.kind === "res" && a.kind === "xi") { d.starters[a.i] = idb; }
    else if (a.kind === "res" && b.kind === "xi") { d.starters[b.i] = ida; }
    else if (a.kind === "res" && b.kind === "bench") { d.bench[d.bench.indexOf(b.id)] = ida!; }
    else if (a.kind === "bench" && b.kind === "res") { d.bench[d.bench.indexOf(a.id)] = idb!; }
    else { put(a, idb); put(b, ida); }
    d.autoRotate = false;
    setDraft(d);
  }
  const tap = (s: Sel) => {
    if (moveMode) return;
    if (!sel) return setSel(s);
    if (JSON.stringify(sel) === JSON.stringify(s)) return setSel(null);
    place(sel, s);
    setSel(null);
  };
  const dragProps = (s: Sel) => ({
    draggable: !moveMode,
    onDragStart: (e: React.DragEvent) => e.dataTransfer.setData("text/plain", JSON.stringify(s)),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const from = JSON.parse(e.dataTransfer.getData("text/plain")) as Sel; place(from, s); setSel(null); },
  });

  const setFormation = (f: string) => {
    const nl = bestEleven(squad.filter((p) => draft.starters.includes(p.id) || draft.bench.includes(p.id) || true), f, avail);
    setDraft({ ...draft, formation: f, customSlots: undefined, starters: nl.starters, bench: nl.bench, autoRotate: false });
  };
  const auto = () => { const nl = bestEleven(squad, draft.formation, avail); setDraft({ ...nl, tactics: draft.tactics, customSlots: draft.customSlots, autoRotate: draft.autoRotate }); };

  // mover huecos (posiciones personalizadas)
  const drag = useRef<number | null>(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current === null || !pitchRef.current) return;
    const r = pitchRef.current.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(3, Math.min(97, 100 - ((e.clientY - r.top) / r.height) * 100));
    const cs = [...slots].map((s) => ({ ...s }));
    cs[drag.current] = { ...cs[drag.current], x, y };
    setDraft({ ...draft, customSlots: cs });
  };

  const selSlot = sel?.kind === "xi" ? sel.i : null;
  const chip = (p: Player | undefined, pos?: Pos) => {
    if (!p) return <span className="text-[10px] text-gray-300">vacío</span>;
    const st = status(p.id);
    return (
      <>
        <span className="max-w-[72px] truncate rounded bg-black/60 px-1 text-[10px]">{p.shortName}</span>
        <span className="rounded bg-black/50 px-1 text-[9px]">{pos ? Math.round(slotRating(p, pos)) : p.ovr} · {st.fitness}%{!st.ok ? (st.injuredUntil ? " 🚑" : " 🟥") : ""}</span>
      </>
    );
  };

  return (
    <Modal title="Alineación" onClose={onClose} wide>
      {fixture && (
        <div className="mb-2 flex gap-1">
          {[fixture.home, fixture.away].map((c) => (
            <button key={c} onClick={() => switchClub(c)} className={cx("btn-sm btn flex-1", c === cid ? "bg-acento text-black" : "border border-borde")}>
              <Badge colors={save.clubs[c].colors} label={save.clubs[c].short} size={18} /> {save.clubs[c].name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="input !w-auto" value={draft.customSlots ? "" : draft.formation} onChange={(e) => setFormation(e.target.value)}>
          {draft.customSlots && <option value="">Personalizada ({draft.formation})</option>}
          {FORMATION_NAMES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <button className="btn-ghost btn-sm" onClick={auto}>Mejor once automático</button>
        <button className={cx("btn-sm btn", moveMode ? "bg-acento text-black" : "border border-borde")} onClick={() => { setMoveMode(!moveMode); setSel(null); }}>{moveMode ? "Listo" : "Mover posiciones"}</button>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={draft.autoRotate} onChange={(e) => setDraft({ ...draft, autoRotate: e.target.checked })} /> IA rota según cansancio</label>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Toca un jugador y luego otro (campo, banca o reservas) para intercambiarlos, o arrástralos. Con “IA rota” activado la IA rehace el once antes de cada partido.</p>

      <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,420px)_1fr]">
        <div ref={pitchRef} className="pitch relative aspect-[3/4] w-full touch-none overflow-hidden rounded-xl border border-white/20" onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
          <div className="absolute left-0 right-0 top-0 h-[14%] border-b border-white/30" />
          <div className="absolute bottom-0 left-1/4 right-1/4 h-[12%] border-t border-l border-r border-white/30" />
          {slots.map((s, i) => {
            const p = byId.get(draft.starters[i] ?? "");
            return (
              <div key={i} {...dragProps({ kind: "xi", i })}
                onPointerDown={(e) => { if (moveMode) { drag.current = i; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } }}
                onClick={() => tap({ kind: "xi", i })}
                className={cx("absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none flex-col items-center", selSlot === i && "scale-110")}
                style={{ left: `${s.x}%`, top: `${100 - s.y}%` }}>
                <div className={cx("flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-bold", selSlot === i ? "border-yellow-300" : "border-white/70")} style={{ background: club.colors[0], color: "#fff" }}>{s.pos}</div>
                {chip(p, s.pos)}
                {p && draft.captain === p.id && <span className="text-[9px]">©</span>}
              </div>
            );
          })}
        </div>
        <div className="space-y-3 text-sm">
          {selSlot !== null && moveMode === false && (
            <label className="block text-xs">Rol del hueco seleccionado
              <select className="input mt-1" value={slots[selSlot].pos} onChange={(e) => { const cs = slots.map((x) => ({ ...x })); cs[selSlot].pos = e.target.value as Pos; setDraft({ ...draft, customSlots: cs, autoRotate: false }); }}>
                {POS_LIST.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          )}
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-400">BANCA ({draft.bench.length})</div>
            <div className="flex flex-wrap gap-1">
              {draft.bench.map((id) => { const p = byId.get(id); const st = status(id); return (
                <button key={id} {...dragProps({ kind: "bench", id })} onClick={() => tap({ kind: "bench", id })} className={cx("rounded border px-2 py-1 text-xs", sel?.kind === "bench" && sel.id === id ? "border-yellow-300" : "border-borde")}>
                  {p?.positions[0]} {p?.shortName} <span className="text-gray-400">{p?.ovr} · {st.fitness}%{!st.ok && " ⛔"}</span>
                </button>); })}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-400">RESERVAS</div>
            <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
              {reserves.sort((a, b) => b.ovr - a.ovr).map((p) => { const st = status(p.id); return (
                <button key={p.id} {...dragProps({ kind: "res", id: p.id })} onClick={() => tap({ kind: "res", id: p.id })} className={cx("rounded border px-2 py-1 text-xs", sel?.kind === "res" && sel.id === p.id ? "border-yellow-300" : "border-borde", !st.ok && "opacity-50")}>
                  {p.positions[0]} {p.shortName} <span className="text-gray-400">{p.ovr} · {st.fitness}%{st.injuredUntil ? ` 🚑 hasta ${st.injuredUntil}` : st.suspended ? " 🟥 sancionado" : ""}</span>
                </button>); })}
              {draft.bench.length < 12 && sel?.kind === "res" && <button className="btn-ghost btn-sm" onClick={() => { setDraft({ ...draft, bench: [...draft.bench, sel.id] }); setSel(null); }}>+ a la banca</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([["captain", "Capitán"], ["penaltyTaker", "Penales"], ["fkTaker", "Tiros libres"], ["cornerTaker", "Córners"]] as const).map(([k, label]) => (
              <label key={k} className="text-xs">{label}
                <select className="input mt-1" value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value || undefined })}>
                  <option value="">—</option>
                  {draft.starters.filter(Boolean).map((id) => <option key={id!} value={id!}>{byId.get(id!)?.shortName}</option>)}
                </select>
              </label>
            ))}
            <label className="text-xs">Mentalidad<select className="input mt-1" value={draft.tactics.mentality} onChange={(e) => setDraft({ ...draft, tactics: { ...draft.tactics, mentality: e.target.value as Tactics["mentality"] } })}><option value="defensiva">Defensiva</option><option value="equilibrada">Equilibrada</option><option value="ofensiva">Ofensiva</option></select></label>
            <label className="text-xs">Presión<select className="input mt-1" value={draft.tactics.pressing} onChange={(e) => setDraft({ ...draft, tactics: { ...draft.tactics, pressing: e.target.value as Tactics["pressing"] } })}><option value="bajo">Baja</option><option value="medio">Media</option><option value="alto">Alta</option></select></label>
            <label className="text-xs">Ritmo<select className="input mt-1" value={draft.tactics.tempo} onChange={(e) => setDraft({ ...draft, tactics: { ...draft.tactics, tempo: e.target.value as Tactics["tempo"] } })}><option value="lento">Lento</option><option value="normal">Normal</option><option value="rapido">Rápido</option></select></label>
          </div>
          {draft.starters.some((id) => id && !status(id).ok) && <p className="text-xs text-red-300">Hay titulares lesionados o sancionados: la IA los sustituirá al jugar.</p>}
          <button className="btn-primary w-full" onClick={() => { mutate((s) => { s.clubs[cid].lineup = structuredClone(draft); }); onClose(); }}>Guardar alineación</button>
        </div>
      </div>
      {slotsOf(draft).length !== 11 && <p className="text-xs text-red-300">La formación debe tener 11 huecos.</p>}
    </Modal>
  );
}
