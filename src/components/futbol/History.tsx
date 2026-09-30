"use client";
import { useMemo, useState } from "react";
import { Badge, Tabs } from "@/components/ui";
import { useF } from "./ctx";
import { FixtureRow } from "./FixtureRow";

export function History() {
  const { save, tick } = useF();
  const [tab, setTab] = useState<"partidos" | "palmares" | "temporadas" | "records">("partidos");
  const [club, setClub] = useState(save.userClub ?? "");
  const played = useMemo(() => save.fixtures.filter((f) => f.result && (!club || f.home === club || f.away === club)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60), [save, tick, club]); // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => {
    const done = save.fixtures.filter((f) => f.result);
    const bigWin = [...done].sort((a, b) => Math.abs(b.result!.hg - b.result!.ag) - Math.abs(a.result!.hg - a.result!.ag))[0];
    const most = [...done].sort((a, b) => b.result!.hg + b.result!.ag - (a.result!.hg + a.result!.ag))[0];
    let hat: { pid: string; g: number; f: string } | null = null;
    for (const f of done) for (const [pid, l] of Object.entries(f.result!.players)) if (l.g >= 3 && (!hat || l.g > hat.g)) hat = { pid, g: l.g, f: f.id };
    const allTime = new Map<string, number>();
    for (const h of save.history) for (const list of Object.values(h.topScorers)) for (const s of list) allTime.set(s.name, Math.max(allTime.get(s.name) ?? 0, s.goals));
    return { bigWin, most, hat, allTime: [...allTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) };
  }, [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const honours = Object.entries(save.honours).sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="mt-3">
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "partidos", label: "Partidos" }, { id: "palmares", label: "Palmarés" }, { id: "temporadas", label: "Temporadas" }, { id: "records", label: "Récords" }]} />
      {tab === "partidos" && (
        <div className="mt-2">
          <select className="input" value={club} onChange={(e) => setClub(e.target.value)}><option value="">Todos los clubes</option>{Object.values(save.clubs).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <div className="mt-2 grid gap-2 md:grid-cols-2">{played.map((f) => <FixtureRow key={f.id} f={f} showComp showDate />)}</div>
        </div>
      )}
      {tab === "palmares" && (
        <div className="mt-2 space-y-1">
          {!honours.length && <p className="text-sm text-gray-400">Los títulos se registran al cerrar cada temporada.</p>}
          {honours.map(([cid, hs]) => (
            <div key={cid} className="card flex items-start gap-2 !p-2 text-sm">
              <Badge colors={save.clubs[cid]?.colors ?? ["#333", "#666"]} label={save.clubs[cid]?.short ?? "?"} size={24} />
              <div><b>{save.clubs[cid]?.name}</b> · {hs.length} títulos<div className="text-xs text-gray-400">{hs.map((h) => `${h.comp} (${h.season})`).join(" · ")}</div></div>
            </div>
          ))}
        </div>
      )}
      {tab === "temporadas" && (
        <div className="mt-2 space-y-3">
          {!save.history.length && <p className="text-sm text-gray-400">Aún no hay temporadas cerradas.</p>}
          {[...save.history].reverse().map((h) => (
            <div key={h.season} className="card text-sm">
              <div className="font-semibold">Temporada {h.season}</div>
              <div className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
                {Object.entries(h.winners).filter(([k]) => !k.includes(":")).map(([k, c]) => <div key={k}>🏆 {save.comps[k]?.name ?? k}: <b>{save.clubs[c]?.name ?? "?"}</b>{h.topScorers[k]?.[0] && <span className="text-gray-400"> · máx. goleador {h.topScorers[k][0].name} ({h.topScorers[k][0].goals})</span>}</div>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "records" && (
        <div className="mt-2 space-y-2 text-sm">
          {records.bigWin && <div className="card">Mayor goleada de la temporada: <b>{save.clubs[records.bigWin.home].name} {records.bigWin.result!.hg}-{records.bigWin.result!.ag} {save.clubs[records.bigWin.away].name}</b></div>}
          {records.most && <div className="card">Partido con más goles: <b>{save.clubs[records.most.home].name} {records.most.result!.hg}-{records.most.result!.ag} {save.clubs[records.most.away].name}</b></div>}
          {records.hat && <div className="card">Mejor actuación: <b>{save.players[records.hat.pid]?.name}</b> con {records.hat.g} goles en un partido</div>}
          {records.allTime.length > 0 && <div className="card">Mejores registros de goleador por temporada (historial): {records.allTime.map(([n, g]) => `${n} ${g}`).join(" · ")}</div>}
        </div>
      )}
    </div>
  );
}
