"use client";
import { useMemo, useState } from "react";
import type { Fixture, MatchEvent, MatchResult, PlayerLine } from "@/engine/football/types";
import { matchInputs, setResult } from "@/engine/football/season";
import { Modal, Field } from "@/components/ui";
import { useF } from "./ctx";

interface GoalRow { scorer: string; assist: string; min: number; og?: boolean }

export function ManualResult({ f, onClose }: { f: Fixture; onClose: () => void }) {
  const { save, mutate, cfg } = useF();
  const inputs = useMemo(() => matchInputs(save, f), [save, f]);
  const prev = f.result;
  const [hg, setHg] = useState(prev?.hg ?? 0);
  const [ag, setAg] = useState(prev?.ag ?? 0);
  const [et, setEt] = useState(!!prev?.et);
  const [pens, setPens] = useState<[number, number]>(prev?.pens ?? [0, 0]);
  const initGoals = (side: 0 | 1): GoalRow[] => (prev?.events ?? []).filter((e) => (e.type === "gol" || e.type === "gol_pp") && e.side === side).map((e) => ({ scorer: e.player ?? "", assist: e.player2 ?? "", min: e.min, og: e.type === "gol_pp" }));
  const [goals, setGoals] = useState<[GoalRow[], GoalRow[]]>([initGoals(0), initGoals(1)]);
  const decisive = !!f.tieId && (f.leg === 2 || !save.fixtures.some((x) => x.tieId === f.tieId && x.id !== f.id));
  const l1 = f.leg === 2 ? save.fixtures.find((x) => x.tieId === f.tieId && x.leg === 1)?.result : undefined;
  const aggH = hg + (l1?.ag ?? 0), aggA = ag + (l1?.hg ?? 0);
  const needPens = decisive && aggH === aggA;
  const sides = [inputs.home, inputs.away];

  const syncGoals = (side: 0 | 1, n: number) => setGoals((g) => {
    const c: [GoalRow[], GoalRow[]] = [[...g[0]], [...g[1]]];
    while (c[side].length < n) c[side].push({ scorer: "", assist: "", min: 0 });
    c[side] = c[side].slice(0, n);
    return c;
  });

  function build(): MatchResult {
    const players: Record<string, PlayerLine> = {};
    const mins = et ? 120 : 90;
    sides.forEach((t, side) => {
      for (const id of t.lineup.starters) if (id) players[id] = { min: mins, g: 0, a: 0, r: 6.5, yc: 0, rc: 0, sh: 0, sv: 0, side: side as 0 | 1 };
    });
    const events: MatchEvent[] = [];
    const rnd = () => 1 + Math.floor(Math.random() * (mins - 1));
    ([0, 1] as const).forEach((side) => goals[side].forEach((g) => {
      const min = g.min || rnd();
      events.push({ min, type: g.og ? "gol_pp" : "gol", side, player: g.scorer || undefined, player2: g.og ? undefined : g.assist || undefined, detail: "jugada", text: "Gol (resultado manual)" });
      const ownSide = g.og ? (1 - side) as 0 | 1 : side;
      if (g.scorer) {
        const l = players[g.scorer] ??= { min: Math.max(1, mins - min), g: 0, a: 0, r: 6.5, yc: 0, rc: 0, sh: 0, sv: 0, side: ownSide };
        if (g.og) { l.og = (l.og ?? 0) + 1; l.r -= 0.8; } else { l.g++; l.r += 1; l.sh++; }
      }
      if (g.assist && !g.og) {
        const l = players[g.assist] ??= { min: Math.max(1, mins - min), g: 0, a: 0, r: 6.5, yc: 0, rc: 0, sh: 0, sv: 0, side };
        l.a++; l.r += 0.7;
      }
    }));
    // porterías a cero y ajuste por resultado
    for (const l of Object.values(players)) {
      const conceded = l.side === 0 ? ag : hg;
      const won = l.side === 0 ? hg > ag : ag > hg;
      if (conceded === 0) l.cs = true;
      if (won) l.r += 0.3;
      l.r = Math.round(Math.min(10, Math.max(3, l.r)) * 10) / 10;
    }
    events.sort((a, b) => a.min - b.min);
    return { hg, ag, et: et || undefined, pens: needPens ? pens : undefined, events, players, manual: true };
  }

  const pensOk = !needPens || pens[0] !== pens[1];
  return (
    <Modal title="Resultado manual" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as const).map((side) => (
          <Field key={side} label={sides[side].name}>
            <input type="number" min={0} max={30} className="input text-center text-lg font-bold" value={side === 0 ? hg : ag}
              onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); (side === 0 ? setHg : setAg)(v); syncGoals(side, v); }} />
          </Field>
        ))}
      </div>
      {f.leg === 2 && l1 && <p className="mt-2 text-xs text-gray-400">Ida: {l1.hg}-{l1.ag}. Global: {aggH}-{aggA}.</p>}
      {decisive && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={et} onChange={(e) => setEt(e.target.checked)} /> Hubo prórroga</label>}
      {needPens && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Penales local"><input type="number" min={0} className="input" value={pens[0]} onChange={(e) => setPens([Number(e.target.value) || 0, pens[1]])} /></Field>
          <Field label="Penales visitante"><input type="number" min={0} className="input" value={pens[1]} onChange={(e) => setPens([pens[0], Number(e.target.value) || 0])} /></Field>
        </div>
      )}
      <details className="mt-3" open={goals[0].length + goals[1].length > 0 && goals.flat().some((g) => g.scorer)}>
        <summary className="cursor-pointer text-sm text-gray-300">Goleadores y asistentes (opcional)</summary>
        {([0, 1] as const).map((side) => (
          <div key={side} className="mt-2 space-y-1">
            <div className="text-xs font-semibold text-gray-400">{sides[side].name}</div>
            {goals[side].map((g, i) => {
              const squad = sides[g.og ? 1 - side : side].squad;
              const upd = (p: Partial<GoalRow>) => setGoals((x) => { const c: [GoalRow[], GoalRow[]] = [[...x[0]], [...x[1]]]; c[side][i] = { ...c[side][i], ...p }; return c; });
              return (
                <div key={i} className="grid grid-cols-[1fr_1fr_56px_auto] gap-1">
                  <select className="input !px-1 text-xs" value={g.scorer} onChange={(e) => upd({ scorer: e.target.value })}>
                    <option value="">Goleador…</option>
                    {squad.map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}
                  </select>
                  <select className="input !px-1 text-xs" value={g.assist} disabled={g.og} onChange={(e) => upd({ assist: e.target.value })}>
                    <option value="">Asistencia…</option>
                    {sides[side].squad.filter((p) => p.id !== g.scorer).map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}
                  </select>
                  <input type="number" placeholder="min" className="input !px-1 text-xs" value={g.min || ""} onChange={(e) => upd({ min: Number(e.target.value) || 0 })} />
                  <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={!!g.og} onChange={(e) => upd({ og: e.target.checked, scorer: "", assist: "" })} />p.p.</label>
                </div>
              );
            })}
          </div>
        ))}
        <p className="mt-2 text-[11px] text-gray-500">Se registran como titulares las alineaciones actuales de ambos equipos (puedes cambiarlas antes en “Alineaciones”).</p>
      </details>
      {!pensOk && <p className="mt-2 text-xs text-red-300">La eliminatoria está empatada: indica un ganador en los penales.</p>}
      <button className="btn-primary mt-4 w-full" disabled={!pensOk} onClick={() => { mutate((s) => setResult(s, f.id, build(), cfg)); onClose(); }}>Guardar</button>
    </Modal>
  );
}
