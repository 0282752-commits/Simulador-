"use client";
import type { Fixture, MatchEvent } from "@/engine/football/types";
import { Badge, Modal, Stat, cx } from "@/components/ui";
import { useF } from "./ctx";

const ICON: Partial<Record<MatchEvent["type"], string>> = { gol: "⚽", gol_pp: "⚽ (p.p.)", amarilla: "🟨", doble_amarilla: "🟨🟥", roja: "🟥", cambio: "🔁", lesion: "🚑", var: "📺", penal_fallado: "❌ penal", penal_atajado: "🧤 penal", tanda: "🎯" };

export function MatchDetail({ f, onClose }: { f: Fixture; onClose: () => void }) {
  const { save, openPlayer } = useF();
  const r = f.result;
  if (!r) return null;
  const h = save.clubs[f.home], a = save.clubs[f.away];
  const nm = (id?: string) => (id ? save.players[id]?.shortName ?? "?" : "");
  const lines = Object.entries(r.players).sort((x, y) => y[1].r - x[1].r);
  return (
    <Modal title={`${save.comps[f.comp]?.name} · ${f.stage} · ${f.date}`} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2"><Badge colors={h.colors} label={h.short} size={32} /><b className="truncate">{h.name}</b></div>
        <div className="text-center"><div className="text-3xl font-bold tabular">{r.hg} - {r.ag}</div>{r.et && <div className="text-xs">tras prórroga</div>}{r.pens && <div className="text-xs">penales {r.pens[0]}-{r.pens[1]}</div>}{r.manual && <div className="text-[10px] text-yellow-300">resultado manual</div>}</div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2"><b className="truncate text-right">{a.name}</b><Badge colors={a.colors} label={a.short} size={32} /></div>
      </div>
      <div className="mt-3 space-y-1">
        {r.events.filter((e) => e.type !== "tanda").map((e, i) => (
          <div key={i} className={cx("flex text-sm", e.side === 1 && "flex-row-reverse text-right")}>
            <div className="w-1/2">
              <span className="text-xs text-gray-400">{e.min}{e.add ? `+${e.add}` : ""}&apos; </span>
              {ICON[e.type] ?? ""} {e.type === "cambio" ? `${nm(e.player)} ⇄ ${nm(e.player2)}` : nm(e.player)}
              {(e.type === "gol") && e.player2 && <span className="text-xs text-gray-400"> (asist. {nm(e.player2)})</span>}
              {e.type === "gol" && e.detail && e.detail !== "jugada" && <span className="text-xs text-gray-400"> · {e.detail}</span>}
              {e.type === "lesion" && <span className="text-xs text-gray-400"> · {e.detail} días</span>}
            </div>
          </div>
        ))}
        {r.pens && <div className="text-center text-xs text-gray-400">Tanda: {r.events.filter((e) => e.type === "tanda").map((e) => (e.scored ? "✔" : "✘")).join(" ")}</div>}
      </div>
      {r.stats && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Stat label="Posesión" a={r.stats[0].poss} b={r.stats[1].poss} pct />
          <Stat label="Tiros (a puerta)" a={`${r.stats[0].shots} (${r.stats[0].onT})`} b={`${r.stats[1].shots} (${r.stats[1].onT})`} />
          <Stat label="xG" a={r.stats[0].xg} b={r.stats[1].xg} />
          <Stat label="Córners" a={r.stats[0].corners} b={r.stats[1].corners} />
          <Stat label="Faltas" a={r.stats[0].fouls} b={r.stats[1].fouls} />
          <Stat label="Tarjetas" a={r.stats[0].yellows + r.stats[0].reds} b={r.stats[1].yellows + r.stats[1].reds} />
        </div>
      )}
      <h4 className="mt-4 text-sm font-semibold">Valoraciones</h4>
      <div className="mt-1 grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <div key={side}>
            {lines.filter(([, l]) => l.side === side).map(([pid, l]) => (
              <button key={pid} className="flex w-full justify-between border-b border-borde/50 py-0.5 text-left" onClick={() => openPlayer(pid)}>
                <span className="truncate">{nm(pid)} <span className="text-xs text-gray-500">{l.min}&apos;</span>{l.g ? ` ⚽${l.g}` : ""}{l.a ? ` 🅰${l.a}` : ""}{l.yc ? " 🟨" : ""}{l.rc ? " 🟥" : ""}</span>
                <b className={cx(l.r >= 7.5 ? "text-green-400" : l.r < 6 ? "text-red-400" : "")}>{l.r.toFixed(1)}</b>
              </button>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
