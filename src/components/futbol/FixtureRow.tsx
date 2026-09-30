"use client";
import type { Fixture } from "@/engine/football/types";
import { Badge, cx } from "@/components/ui";
import { useF } from "./ctx";
import { simulateFixture, setResult } from "@/engine/football/season";

export function FixtureRow({ f, showComp = false, showDate = false }: { f: Fixture; showComp?: boolean; showDate?: boolean }) {
  const { save, mutate, cfg, openLive, openManual, openDetail, openLineup } = useF();
  const h = save.clubs[f.home], a = save.clubs[f.away];
  const r = f.result;
  const comp = save.comps[f.comp];
  const legInfo = f.leg === 2 ? (() => {
    const l1 = save.fixtures.find((x) => x.tieId === f.tieId && x.leg === 1);
    return l1?.result ? `Ida ${l1.result.ag}-${l1.result.hg}` : "";
  })() : "";
  return (
    <div className={cx("rounded-lg border border-borde bg-fondo/60 p-2", save.userClub && (f.home === save.userClub || f.away === save.userClub) && "ring-1 ring-acento")}>
      <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400">
        <span className="truncate">{showComp && <b className="text-gray-300">{comp?.short ?? f.comp} · </b>}{f.stage}{legInfo && ` · ${legInfo}`}{f.neutral && " · campo neutral"}</span>
        {showDate && <span>{f.date}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => r ? openDetail(f) : openLineup(f.home, f)}>
          <Badge colors={h.colors} label={h.short} size={24} />
          <span className="truncate text-sm">{h.name}</span>
        </button>
        <button onClick={() => r && openDetail(f)} className={cx("min-w-[64px] rounded px-2 py-1 text-center font-bold tabular", r ? "bg-white/10" : "text-gray-500")}>
          {r ? `${r.hg} - ${r.ag}` : "vs"}
          {r?.pens && <div className="text-[10px] font-normal text-gray-300">pen. {r.pens[0]}-{r.pens[1]}</div>}
          {r?.et && !r.pens && <div className="text-[10px] font-normal text-gray-300">prórroga</div>}
        </button>
        <button className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right" onClick={() => r ? openDetail(f) : openLineup(f.away, f)}>
          <span className="truncate text-sm">{a.name}</span>
          <Badge colors={a.colors} label={a.short} size={24} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1">
        {!r ? (
          <>
            <button className="btn-ghost btn-sm" onClick={() => openLineup(f.home, f)}>Alineaciones</button>
            <button className="btn-ghost btn-sm" onClick={() => openManual(f)}>✍ Manual</button>
            <button className="btn-ghost btn-sm" onClick={() => openLive(f)}>▶ En vivo</button>
            <button className="btn-primary btn-sm" onClick={() => mutate((s) => setResult(s, f.id, simulateFixture(s, f), cfg))}>⚡ Simular</button>
          </>
        ) : (
          <>
            <button className="btn-ghost btn-sm" onClick={() => openDetail(f)}>Resumen</button>
            <button className="btn-ghost btn-sm" onClick={() => openManual(f)}>Editar</button>
            <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Borrar este resultado? Se recalcularán tablas y estadísticas.")) mutate((s) => setResult(s, f.id, undefined, cfg)); }}>Borrar</button>
          </>
        )}
      </div>
    </div>
  );
}
