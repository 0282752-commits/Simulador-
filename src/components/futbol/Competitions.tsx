"use client";
import { useMemo, useState } from "react";
import type { Competition, Fixture } from "@/engine/football/types";
import { computeRows, sortTable, TIEBREAK_LABEL, tieOutcome } from "@/engine/football/competitions";
import { leagueTable } from "@/engine/football/season";
import { playerStats } from "@/engine/football/career";
import { Badge, Empty, Tabs, cx } from "@/components/ui";
import { useF } from "./ctx";
import { FixtureRow } from "./FixtureRow";

const TYPE_LABEL: Record<Competition["type"], string> = { liga: "Ligas", copa: "Copas", supercopa: "Supercopas", europa: "Europa", playoff: "Playoffs" };

export function Competitions() {
  const { save } = useF();
  const comps = Object.values(save.comps);
  const [id, setId] = useState(comps[0]?.id ?? "");
  const [tab, setTab] = useState<"tabla" | "partidos" | "stats">("tabla");
  const comp = save.comps[id];
  return (
    <div className="mt-3">
      <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
        {(Object.keys(TYPE_LABEL) as Competition["type"][]).map((t) => {
          const cs = comps.filter((c) => c.type === t);
          return cs.length ? <optgroup key={t} label={TYPE_LABEL[t]}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.done && c.winner ? ` · 🏆 ${save.clubs[c.winner]?.short}` : ""}</option>)}</optgroup> : null;
        })}
      </select>
      {comp && (
        <>
          {comp.notes && <p className="mt-1 text-[11px] text-gray-400">{comp.notes}</p>}
          <div className="mt-2"><Tabs value={tab} onChange={setTab} tabs={[{ id: "tabla", label: comp.type === "liga" || comp.type === "europa" ? "Clasificación" : "Cuadro" }, { id: "partidos", label: "Partidos" }, { id: "stats", label: "Estadísticas" }]} /></div>
          {tab === "tabla" && (comp.type === "liga" ? <LeagueTable comp={comp} /> : comp.type === "europa" ? <><LeagueTable comp={comp} /><Bracket comp={comp} /></> : <Bracket comp={comp} />)}
          {tab === "partidos" && <CompFixtures comp={comp} />}
          {tab === "stats" && <CompStats comp={comp} />}
        </>
      )}
    </div>
  );
}

function LeagueTable({ comp }: { comp: Competition }) {
  const { save, tick, openClub } = useF();
  const [mode, setMode] = useState<"total" | "local" | "visitante">("total");
  const rows = useMemo(() => {
    if (mode === "total") return leagueTable(save, comp.id);
    const fx = save.fixtures.filter((f) => f.comp === comp.id && (comp.type !== "europa" || f.stageIdx < 100));
    const map = computeRows(comp.clubs, fx);
    for (const r of map.values()) {
      if (mode === "local") Object.assign(r, { pj: r.hw + r.hd + r.hl, w: r.hw, d: r.hd, l: r.hl, gf: r.hgf, ga: r.hga, gd: r.hgf - r.hga, pts: r.hw * 3 + r.hd });
      else Object.assign(r, { pj: r.aw + r.ad + r.al, w: r.aw, d: r.ad, l: r.al, gf: r.agf, ga: r.aga, gd: r.agf - r.aga, pts: r.aw * 3 + r.ad });
    }
    return sortTable(map, [], ["pts", "gd", "gf"]);
  }, [save, tick, comp, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const zone = (pos: number) => comp.zones?.find((z) => pos >= z.from && pos <= z.to);
  return (
    <div className="mt-2">
      <div className="mb-2 flex gap-1">{(["total", "local", "visitante"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx("btn-sm btn", mode === m ? "bg-acento text-black" : "border border-borde")}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div>
      <div className="scroll-x">
        <table className="w-full min-w-[520px]">
          <thead><tr><th className="th">#</th><th className="th">Club</th><th className="th">PJ</th><th className="th">G</th><th className="th">E</th><th className="th">P</th><th className="th">GF</th><th className="th">GC</th><th className="th">DG</th><th className="th">Pts</th><th className="th">Racha</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const z = mode === "total" ? zone(i + 1) : undefined;
              const c = save.clubs[r.club];
              return (
                <tr key={r.club} className="border-t border-borde/60">
                  <td className="td tabular" style={{ borderLeft: `3px solid ${z?.color ?? "transparent"}` }}>{i + 1}</td>
                  <td className="td"><button className="flex items-center gap-2 text-left" onClick={() => openClub(r.club)}><Badge colors={c.colors} label={c.short} size={20} /><span className="max-w-[160px] truncate">{c.name}</span></button></td>
                  <td className="td tabular">{r.pj}</td><td className="td tabular">{r.w}</td><td className="td tabular">{r.d}</td><td className="td tabular">{r.l}</td>
                  <td className="td tabular">{r.gf}</td><td className="td tabular">{r.ga}</td><td className="td tabular">{r.gd > 0 ? "+" : ""}{r.gd}</td><td className="td font-bold tabular">{r.pts}</td>
                  <td className="td"><div className="flex gap-0.5">{r.form.map((x, k) => <span key={k} className={cx("inline-block h-4 w-4 rounded text-center text-[9px] font-bold leading-4 text-black", x === "V" ? "bg-green-500" : x === "E" ? "bg-gray-400" : "bg-red-500")}>{x}</span>)}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
        {comp.zones?.map((z) => <span key={z.label + z.from} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded" style={{ background: z.color }} />{z.label}</span>)}
      </div>
      {comp.tiebreakers && <p className="mt-1 text-[11px] text-gray-500">Desempate: {comp.tiebreakers.map((t) => TIEBREAK_LABEL[t] ?? t).join(" → ")}.</p>}
    </div>
  );
}

function Bracket({ comp }: { comp: Competition }) {
  const { save } = useF();
  const fx = save.fixtures.filter((f) => f.comp === comp.id && f.tieId);
  const stages = [...new Set(fx.map((f) => f.stageIdx))].sort((a, b) => a - b);
  if (!stages.length) return <Empty>{comp.type === "europa" ? "La fase eliminatoria empezará al terminar la fase liga." : "Sin eliminatorias todavía."}</Empty>;
  return (
    <div className="mt-3 space-y-3">
      {comp.winner && comp.done && <div className="card text-center">🏆 Campeón: <b>{save.clubs[comp.winner]?.name}</b></div>}
      {stages.map((st) => {
        const ties = new Map<string, Fixture[]>();
        for (const f of fx.filter((x) => x.stageIdx === st)) (ties.get(f.tieId!) ?? ties.set(f.tieId!, []).get(f.tieId!)!).push(f);
        const name = fx.find((f) => f.stageIdx === st)!.stage.replace(/ \((ida|vuelta)\)/, "");
        return (
          <div key={st}>
            <h4 className="mb-1 text-sm font-semibold text-gray-300">{name}</h4>
            <div className="grid gap-1 sm:grid-cols-2">
              {[...ties.values()].map((legs) => {
                legs.sort((a, b) => (a.leg ?? 1) - (b.leg ?? 1));
                const o = tieOutcome(legs);
                const a = legs[legs.length - 1].home, b = legs[legs.length - 1].away;
                const agg = (club: string) => legs.reduce((s, f) => s + (f.result ? (f.home === club ? f.result.hg : f.result.ag) : 0), 0);
                return (
                  <div key={legs[0].tieId} className="rounded border border-borde p-2 text-sm">
                    {[a, b].map((c) => (
                      <div key={c} className={cx("flex items-center gap-2", o?.winner === c && "font-bold text-acento")}>
                        <Badge colors={save.clubs[c].colors} label={save.clubs[c].short} size={18} />
                        <span className="flex-1 truncate">{save.clubs[c].name}</span>
                        <span className="text-xs text-gray-400">{legs.map((f) => (f.result ? (f.home === c ? f.result.hg : f.result.ag) : "-")).join(" · ")}</span>
                        {legs.length > 1 && <b className="tabular">{agg(c)}</b>}
                      </div>
                    ))}
                    {legs[legs.length - 1].result?.pens && <div className="text-right text-[10px] text-gray-400">pen. {legs[legs.length - 1].result!.pens!.join("-")}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompFixtures({ comp }: { comp: Competition }) {
  const { save } = useF();
  const fx = save.fixtures.filter((f) => f.comp === comp.id);
  const stages = [...new Set(fx.map((f) => f.stage.replace(/ \(aplazado\)$/, "")))];
  const firstPending = fx.find((f) => !f.result)?.stage.replace(/ \(aplazado\)$/, "") ?? stages[stages.length - 1];
  const [stage, setStage] = useState(firstPending);
  return (
    <div className="mt-2">
      <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((s) => <option key={s}>{s}</option>)}</select>
      <div className="mt-2 grid gap-2 md:grid-cols-2">{fx.filter((f) => f.stage.replace(/ \(aplazado\)$/, "") === stage).map((f) => <FixtureRow key={f.id} f={f} showDate />)}</div>
    </div>
  );
}

function CompStats({ comp }: { comp: Competition }) {
  const { save, tick, openPlayer } = useF();
  const stats = useMemo(() => [...playerStats(save, comp.id).values()], [save, tick, comp]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<"g" | "a" | "cs" | "yc" | "rating" | "ga">("g");
  const val = (s: (typeof stats)[number]) => (kind === "ga" ? s.g + s.a : kind === "yc" ? s.yc * 1 + s.rc * 3 : s[kind]);
  const list = stats.filter((s) => (kind === "cs" ? save.players[s.pid]?.positions[0] === "POR" : true) && (kind === "rating" ? s.apps >= Math.max(3, Math.floor(stats.reduce((m, x) => Math.max(m, x.apps), 0) / 3)) : val(s) > 0)).sort((a, b) => val(b) - val(a) || a.min - b.min).slice(0, 30);
  return (
    <div className="mt-2">
      <div className="scroll-x flex gap-1">
        {([["g", "Goleadores"], ["a", "Asistencias"], ["ga", "G+A"], ["cs", "Porterías a cero"], ["yc", "Tarjetas"], ["rating", "Valoración"]] as const).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={cx("btn-sm btn whitespace-nowrap", kind === k ? "bg-acento text-black" : "border border-borde")}>{l}</button>)}
      </div>
      <table className="mt-2 w-full">
        <thead><tr><th className="th">#</th><th className="th">Jugador</th><th className="th">PJ</th><th className="th">Min</th><th className="th text-right">{kind === "yc" ? "🟨/🟥" : "Valor"}</th></tr></thead>
        <tbody>
          {list.map((s, i) => {
            const p = save.players[s.pid];
            const c = save.clubs[s.club];
            return (
              <tr key={s.pid} className="border-t border-borde/60">
                <td className="td tabular">{i + 1}</td>
                <td className="td"><button className="flex items-center gap-2 text-left" onClick={() => openPlayer(s.pid)}>{c && <Badge colors={c.colors} label={c.short} size={18} />}<span className="truncate">{p?.name ?? "?"}</span></button></td>
                <td className="td tabular">{s.apps}</td><td className="td tabular">{s.min}</td>
                <td className="td text-right font-bold tabular">{kind === "yc" ? `${s.yc}/${s.rc}` : kind === "rating" ? s.rating.toFixed(2) : val(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!list.length && <Empty>Sin datos todavía.</Empty>}
    </div>
  );
}
