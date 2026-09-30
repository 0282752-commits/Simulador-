"use client";
import { useEffect, useMemo, useState } from "react";
import type { FootballSave, Fixture } from "@/engine/football/types";
import { nextMatchDate, playDay, seasonFinished, seasonLabel, type FootballConfig } from "@/engine/football/season";
import { startNewSeason, type OffseasonReport } from "@/engine/football/career";
import { addDays, fmtDate } from "@/lib/rng";
import { loadFootballConfig } from "@/lib/data";
import { Modal, Progress, Tabs, Empty } from "@/components/ui";
import { FootballContext, useF, type FCtx } from "./ctx";
import { FixtureRow } from "./FixtureRow";
import { LiveMatch, MultiLive } from "./MatchLive";
import { ManualResult } from "./ManualResult";
import { MatchDetail } from "./MatchDetail";
import { LineupEditor } from "./LineupEditor";
import { Competitions } from "./Competitions";
import { Teams, PlayerModal } from "./Teams";
import { Market } from "./Market";
import { History } from "./History";
import { MyTeam, TeamPicker } from "./MyTeam";

type Tab = "mi" | "hoy" | "calendario" | "comps" | "equipos" | "mercado" | "historial";

export default function FootballGame({ save, tick, mutate }: { save: FootballSave; tick: number; mutate: (fn: (s: FootballSave) => void) => void }) {
  const [cfg, setCfg] = useState<FootballConfig | null>(null);
  const [tab, setTab] = useState<Tab>(save.focusMode || save.userClub ? "mi" : "hoy");
  const [live, setLive] = useState<Fixture | null>(null);
  const [multi, setMulti] = useState<Fixture[] | null>(null);
  const [manual, setManual] = useState<Fixture | null>(null);
  const [detail, setDetail] = useState<Fixture | null>(null);
  const [lineup, setLineup] = useState<{ club: string; f?: Fixture } | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [clubFocus, setClubFocus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ text: string; pct: number } | null>(null);
  const [report, setReport] = useState<OffseasonReport | null>(null);
  const [untilDate, setUntilDate] = useState("");

  useEffect(() => { loadFootballConfig().then(setCfg); }, []);

  const ctx: FCtx | null = cfg ? {
    save, cfg, tick, mutate,
    openLive: setLive, openManual: setManual, openDetail: setDetail,
    openLineup: (club, f) => setLineup({ club, f }), openPlayer: setPlayer,
    openClub: (c) => { setClubFocus(c); setTab("equipos"); },
  } : null;

  const next = useMemo(() => nextMatchDate(save), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const finished = useMemo(() => seasonFinished(save), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function advance(kind: "dia" | "semana" | "mes" | "fin" | "fecha") {
    if (!cfg) return;
    const start = nextMatchDate(save);
    if (!start) return;
    const stop = kind === "dia" ? start : kind === "semana" ? addDays(save.date, 7) : kind === "mes" ? addDays(save.date, 30) : kind === "fecha" ? (untilDate || start) : "9999-12-31";
    const span = Math.max(1, (Date.parse(stop > "2100" ? cfg.end : stop) - Date.parse(start)) / 864e5);
    let d: string | null;
    let n = 0;
    setProgress({ text: "Simulando…", pct: 0 });
    while ((d = nextMatchDate(save)) && d <= stop) {
      const played = playDay(save, d, cfg);
      n += played.length;
      setProgress({ text: `Simulando ${fmtDate(d)} · ${n} partidos`, pct: Math.min(1, (Date.parse(d) - Date.parse(start)) / 864e5 / (span > 400 ? 330 : span)) });
      await new Promise((r) => setTimeout(r, 0));
      if (kind === "dia") break;
    }
    if (kind !== "dia" && stop < "9999" && save.date < stop) save.date = stop;
    setProgress(null);
    mutate(() => {});
  }

  async function run(label: string, task: (progress: (t: string, p: number) => void) => Promise<void>) {
    setProgress({ text: label, pct: 0 });
    try { await task((t, p) => setProgress({ text: t, pct: p })); } finally { setProgress(null); mutate(() => {}); }
  }

  if (!ctx) return <div className="p-4 text-gray-400">Cargando configuración…</div>;
  const today = next ? save.fixtures.filter((f) => f.date === next) : [];
  const byComp = new Map<string, Fixture[]>();
  for (const f of today) (byComp.get(f.comp) ?? byComp.set(f.comp, []).get(f.comp)!).push(f);

  return (
    <FootballContext.Provider value={ctx}>
      <div className="px-3 pb-24">
        <div className="sticky top-0 z-20 -mx-3 border-b border-borde bg-fondo/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-gray-400">Temporada {seasonLabel(save.seasonYear)}{save.dataSource.demo && <span className="ml-1 rounded bg-yellow-500/20 px-1 text-yellow-300">DATOS DEMO</span>}</div>
              <div className="font-semibold">{fmtDate(save.date)}</div>
            </div>
            {!finished ? (
              <button className="btn-primary" onClick={() => advance("dia")} disabled={!next}>Continuar ▸</button>
            ) : (
              <button className="btn-primary" onClick={() => { if (confirm("¿Cerrar la temporada? Se archivarán tablas, habrá ascensos/descensos, envejecimiento, retiros y juveniles.")) mutate((s) => setReport(startNewSeason(s, cfg!))); }}>Nueva temporada ▸</button>
            )}
          </div>
          {!finished && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <button className="btn-ghost btn-sm" onClick={() => advance("semana")}>+1 semana</button>
              <button className="btn-ghost btn-sm" onClick={() => advance("mes")}>+1 mes</button>
              <button className="btn-ghost btn-sm" onClick={() => advance("fin")}>⏭ Simular temporada completa</button>
              <input type="date" className="input !w-auto !py-1 text-xs" value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
              <button className="btn-ghost btn-sm" disabled={!untilDate} onClick={() => advance("fecha")}>Hasta fecha</button>
            </div>
          )}
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[...(save.focusMode || save.userClub ? [{ id: "mi" as Tab, label: "★ Mi equipo" }] : []), { id: "hoy", label: "Próximos" }, { id: "calendario", label: "Calendario" }, { id: "comps", label: "Competiciones" }, { id: "equipos", label: "Equipos" }, { id: "mercado", label: "Mercado" }, { id: "historial", label: "Historial" }]} />
        </div>

        {tab === "hoy" && (
          <div className="mt-3 space-y-4">
            {save.dataSource.demo && (
              <div className="card border-yellow-600/50 text-xs text-yellow-200">
                Estás usando datos de demostración ficticios. Para las plantillas reales con medias de EA SPORTS FC 27 ejecuta <code>npm run datos:fc27</code> en tu computadora y crea una partida nueva (ver README).
              </div>
            )}
            {finished && <div className="card text-sm">🏁 Temporada terminada. Revisa el historial y pulsa <b>Nueva temporada</b>.</div>}
            {!next && !finished && <Empty>No quedan partidos programados.</Empty>}
            {next && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Próxima jornada: {fmtDate(next)}</h3>
                  <button className="btn-ghost btn-sm" onClick={() => setMulti(today.filter((f) => !f.result))}>▶ Ver todos en vivo</button>
                </div>
                {[...byComp.entries()].map(([c, fs]) => (
                  <div key={c}>
                    <div className="mb-1 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-gray-300">{save.comps[c]?.name ?? c}</h4>
                      <button className="btn-ghost btn-sm" onClick={() => setMulti(fs.filter((f) => !f.result))}>▶ En vivo ({fs.filter((f) => !f.result).length})</button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">{fs.map((f) => <FixtureRow key={f.id} f={f} />)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {tab === "mi" && <MyTeam run={run} />}
        {tab === "calendario" && <Calendar />}
        {tab === "comps" && <Competitions />}
        {tab === "equipos" && <Teams focus={clubFocus} />}
        {tab === "mercado" && <Market />}
        {tab === "historial" && <History />}
      </div>

      {save.focusMode && !save.userClub && <TeamPicker />}
      {live && <LiveMatch f={live} onClose={() => setLive(null)} />}
      {multi && <MultiLive fixtures={multi} onClose={() => setMulti(null)} />}
      {manual && <ManualResult f={manual} onClose={() => setManual(null)} />}
      {detail && <MatchDetail f={detail} onClose={() => setDetail(null)} />}
      {lineup && <LineupEditor clubId={lineup.club} fixture={lineup.f} onClose={() => setLineup(null)} />}
      {player && <PlayerModal pid={player} onClose={() => setPlayer(null)} />}
      {progress && <Progress text={progress.text} pct={progress.pct} />}
      {report && (
        <Modal title={`Nueva temporada ${seasonLabel(save.seasonYear)}`} onClose={() => setReport(null)}>
          <div className="space-y-2 text-sm">
            <div><b>Campeones:</b> {Object.entries(report.champions).map(([l, c]) => `${cfg!.leagues.find((x) => x.id === l)?.short ?? l}: ${save.clubs[c]?.name}`).join(" · ")}</div>
            <div><b>Ascienden:</b> {report.promoted.map((c) => save.clubs[c]?.name).join(", ") || "—"}</div>
            <div><b>Descienden:</b> {report.relegated.map((c) => save.clubs[c]?.name).join(", ") || "—"}</div>
            <div><b>Retirados:</b> {report.retired.length} jugadores · <b>Juveniles nuevos:</b> {report.youth}</div>
            <p className="text-xs text-gray-400">Los clasificados a Europa salen de la tabla final; las supercopas, de los campeones.</p>
          </div>
        </Modal>
      )}
    </FootballContext.Provider>
  );
}

function Calendar() {
  const { save, tick } = useF();
  const dates = useMemo(() => [...new Set(save.fixtures.map((f) => f.date))].sort(), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(() => dates.find((d) => d >= save.date) ?? dates[0]);
  const [comp, setComp] = useState("");
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  const [month, setMonth] = useState(() => (sel ?? save.date).slice(0, 7));
  const fx = save.fixtures.filter((f) => f.date === sel && (!comp || f.comp === comp));
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{new Date(m + "-15").toLocaleDateString("es", { month: "long", year: "numeric" })}</option>)}
        </select>
        <select className="input" value={comp} onChange={(e) => setComp(e.target.value)}>
          <option value="">Todas las competiciones</option>
          {Object.values(save.comps).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="scroll-x mt-2 flex gap-1 pb-1">
        {dates.filter((d) => d.startsWith(month)).map((d) => {
          const n = save.fixtures.filter((f) => f.date === d && (!comp || f.comp === comp)).length;
          if (!n) return null;
          const done = save.fixtures.filter((f) => f.date === d).every((f) => f.result);
          return (
            <button key={d} onClick={() => setSel(d)} className={`shrink-0 rounded-lg border px-2 py-1 text-center text-xs ${sel === d ? "border-acento bg-acento/10" : "border-borde"} ${done ? "opacity-70" : ""}`}>
              <div>{fmtDate(d).split(" ").slice(0, 2).join(" ")}</div>
              <div className="text-gray-400">{n} p.</div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-2">
        {fx.length === 0 && <Empty>No hay partidos este día.</Empty>}
        {[...new Set(fx.map((f) => f.comp))].map((c) => (
          <div key={c}>
            <h4 className="mb-1 text-sm font-semibold text-gray-300">{save.comps[c]?.name}</h4>
            <div className="grid gap-2 md:grid-cols-2">{fx.filter((f) => f.comp === c).map((f) => <FixtureRow key={f.id} f={f} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

