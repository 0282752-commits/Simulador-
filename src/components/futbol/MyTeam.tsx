"use client";
import { useMemo, useState } from "react";
import { nextClubMatch, recordMyCampaign, startNewSeason, teamCampaign } from "@/engine/football/career";
import { nextMatchDate, playDay, seasonFinished, seasonLabel, setResult, simulateFixture, leagueTable } from "@/engine/football/season";
import { fmtDate } from "@/lib/rng";
import { Badge, Empty, Modal, cx } from "@/components/ui";
import { useF } from "./ctx";
import { FixtureRow } from "./FixtureRow";

export function TeamPicker({ onClose }: { onClose?: () => void }) {
  const { save, mutate } = useF();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const g: { name: string; ids: string[] }[] = [];
    for (const c of Object.values(save.comps).filter((c) => c.type === "liga").sort((a, b) => (a.tier ?? 1) - (b.tier ?? 1))) g.push({ name: c.name, ids: [...c.clubs].sort((a, b) => save.clubs[a].name.localeCompare(save.clubs[b].name)) });
    return g;
  }, [save]);
  const ql = q.toLowerCase();
  return (
    <Modal title="Elige tu equipo" onClose={onClose ?? (() => {})} wide>
      <input className="input" placeholder="Buscar club…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mt-3 space-y-4">
        {groups.map((g) => {
          const ids = g.ids.filter((id) => !ql || save.clubs[id].name.toLowerCase().includes(ql));
          if (!ids.length) return null;
          return (
            <div key={g.name}>
              <div className="mb-1 text-xs font-semibold uppercase text-gray-400">{g.name}</div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {ids.map((id) => (
                  <button key={id} className="flex items-center gap-2 rounded-lg border border-borde p-2 text-left text-sm hover:border-acento" onClick={() => { mutate((s) => { s.userClub = id; s.focusMode = true; }); onClose?.(); }}>
                    <Badge colors={save.clubs[id].colors} label={save.clubs[id].short} size={24} /><span className="truncate">{save.clubs[id].name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function MyTeam({ run }: { run: (label: string, task: (progress: (t: string, p: number) => void) => Promise<void>) => Promise<void> }) {
  const { save, cfg, tick, mutate, openLineup } = useF();
  const [picker, setPicker] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const club = save.userClub ? save.clubs[save.userClub] : null;
  const camp = useMemo(() => (club ? teamCampaign(save, club.id) : []), [save, tick, club]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!club) return <div className="mt-6 text-center"><p className="text-sm text-gray-400">Elige un equipo para seguir sus campañas.</p><button className="btn-primary mt-3" onClick={() => setPicker(true)}>Elegir equipo</button>{picker && <TeamPicker onClose={() => setPicker(false)} />}</div>;
  const next = nextClubMatch(save, club.id);
  const finished = seasonFinished(save);
  const recent = save.fixtures.filter((f) => f.result && (f.home === club.id || f.away === club.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const league = club.leagueId ? leagueTable(save, club.leagueId) : [];

  // Simula todo hasta el partido de mi equipo (sin jugarlo) o incluyéndolo
  const toMyMatch = (includeMine: boolean) => run(includeMine ? "Jugando hasta mi partido…" : "Simulando hasta mi partido…", async (progress) => {
    const my = nextClubMatch(save, club.id);
    if (!my) return;
    let d: string | null;
    while ((d = nextMatchDate(save)) && d < my.date) { playDay(save, d, cfg); progress(`Simulando ${fmtDate(d)}`, 0.5); await tickUI(); }
    playDay(save, my.date, cfg, (f) => f.id === my.id);
    if (includeMine) setResult(save, my.id, simulateFixture(save, my), cfg);
  });

  const seasons = (n: number) => run(`Simulando ${n} temporada${n > 1 ? "s" : ""}…`, async (progress) => {
    const labels: string[] = [];
    if (seasonFinished(save)) startNewSeason(save, cfg);
    for (let k = 0; k < n; k++) {
      let d: string | null;
      while ((d = nextMatchDate(save))) { playDay(save, d, cfg); progress(`Temporada ${seasonLabel(save.seasonYear)} · ${fmtDate(d)}`, (k + dayFrac(d, save.seasonYear)) / n); await tickUI(); }
      labels.push(seasonLabel(save.seasonYear));
      if (k < n - 1) startNewSeason(save, cfg);
      else recordMyCampaign(save);
    }
    const hist = (save.myHistory ?? []).filter((h) => labels.includes(h.season));
    setSummary(hist.map((h) => `${h.season}${h.titles.length ? ` 🏆 ${h.titles.join(", ")}` : ""}\n  ${h.lines.join("\n  ")}`).join("\n\n"));
  });

  return (
    <div className="mt-3 space-y-3">
      <div className="card flex flex-wrap items-center gap-3">
        <Badge colors={club.colors} label={club.short} size={48} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{club.name}</div>
          <div className="text-xs text-gray-400">Temporada {seasonLabel(save.seasonYear)} · {club.leagueId ? `${save.comps[club.leagueId]?.name}: ${league.findIndex((r) => r.club === club.id) + 1}º` : ""}</div>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => openLineup(club.id, next)}>Alineación</button>
        <button className="btn-ghost btn-sm" onClick={() => setPicker(true)}>Cambiar equipo</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {!finished ? (
          <>
            <button className="btn-primary !py-3" onClick={() => toMyMatch(true)} disabled={!next}>⚡ Jugar mi próximo partido</button>
            <button className="btn-ghost !py-3" onClick={() => toMyMatch(false)} disabled={!next}>⏩ Avanzar hasta mi partido (para verlo en vivo)</button>
            <button className="btn-primary !py-3 sm:col-span-2" onClick={() => seasons(1)}>⏭ Simular toda la temporada (todas las competiciones)</button>
          </>
        ) : (
          <button className="btn-primary !py-3 sm:col-span-2" onClick={() => mutate((s) => { startNewSeason(s, cfg); })}>Empezar temporada {seasonLabel(save.seasonYear + 1)} ▸</button>
        )}
        <div className="flex flex-wrap items-center gap-1 sm:col-span-2">
          <span className="text-xs text-gray-400">Simular varias temporadas seguidas:</span>
          {[3, 5, 10].map((n) => <button key={n} className="btn-ghost btn-sm" onClick={() => seasons(n)}>{n} temporadas</button>)}
        </div>
      </div>

      {(() => {
        const pend = (save.offers ?? []).filter((o) => !o.byUser && o.status === "pendiente" && o.from === club.id).length;
        const exp = Object.values(save.players).filter((p) => p.clubId === club.id && !p.retired && (p.contractEnd ?? 9999) <= save.seasonYear + 1).length;
        return pend || exp ? (
          <div className="card border-yellow-700/60 text-xs">
            {pend > 0 && <div>📨 Tienes {pend} oferta(s) de otros clubes por tus jugadores (Mercado → Ofertas).</div>}
            {exp > 0 && <div>📝 {exp} jugador(es) terminan contrato este verano: renuévalos en Equipos o se irán libres.</div>}
          </div>
        ) : null;
      })()}

      {next && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-gray-300">Próximo partido · {fmtDate(next.date)}</h4>
          <FixtureRow f={next} showComp />
        </div>
      )}

      <div className="card">
        <h4 className="mb-2 text-sm font-semibold">Campaña {seasonLabel(save.seasonYear)}</h4>
        {camp.length === 0 && <Empty>Sin competiciones.</Empty>}
        <div className="space-y-1">
          {camp.map((c) => (
            <div key={c.comp} className={cx("flex flex-wrap items-baseline justify-between gap-2 border-b border-borde/50 py-1 text-sm", c.won && "text-acento")}>
              <span className="font-medium">{c.name}</span>
              <span className="text-right text-xs text-gray-300">{c.status}{c.record ? <span className="text-gray-500"> · {c.record}</span> : null}</span>
            </div>
          ))}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold text-gray-300">Últimos resultados</h4>
          <div className="grid gap-2 md:grid-cols-2">{recent.map((f) => <FixtureRow key={f.id} f={f} showComp showDate />)}</div>
        </div>
      )}

      {(save.myHistory?.length ?? 0) > 0 && (
        <div className="card">
          <h4 className="mb-2 text-sm font-semibold">Historial de mis temporadas</h4>
          <div className="space-y-2 text-xs">
            {[...save.myHistory!].reverse().map((h) => (
              <div key={h.season} className="border-b border-borde/50 pb-1">
                <b>{h.season}</b> · {save.clubs[h.club]?.name}{h.titles.length ? <span className="text-acento"> · 🏆 {h.titles.join(", ")}</span> : null}
                <div className="text-gray-400">{h.lines.join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {picker && <TeamPicker onClose={() => setPicker(false)} />}
      {summary && <Modal title="Resumen de las temporadas" onClose={() => setSummary(null)}><pre className="whitespace-pre-wrap text-sm">{summary}</pre></Modal>}
    </div>
  );
}

export const tickUI = () => new Promise((r) => setTimeout(r, 0));
function dayFrac(d: string, year: number) {
  const a = Date.parse(`${year}-08-01`), b = Date.parse(`${year + 1}-06-05`);
  return Math.max(0, Math.min(1, (Date.parse(d) - a) / (b - a)));
}
