"use client";
import { useMemo, useState } from "react";
import type { CupMatch, CupResult, CupSave } from "@/engine/cup/types";
import { SPORT_LABEL, cupLeaders, cupTable, decisiveInfo, dcSides, fbInput, fbOptions, fbSquad, fromDc, fromFootball, fromNfl, groupQualifiers, nextRound, nflShim, playable, resetCup, setCupResult, simulateCupMatch, simulateWhile } from "@/engine/cup/cup";
import { formatSummary } from "@/engine/cup/presets";
import { FootballMatch } from "@/engine/football/match";
import type { MatchResult } from "@/engine/football/types";
import type { NflGame } from "@/engine/nfl/types";
import type { DcMatch, DcSave } from "@/engine/dc/types";
import { LiveMatchView } from "@/components/futbol/MatchLive";
import { ManualResultView } from "@/components/futbol/ManualResult";
import { NflDetail, NflLive, NflManual } from "@/components/nfl/NflGame";
import { DcDetail, DcLive, DcManual } from "@/components/dc/DcGame";
import { Badge, Empty, Modal, Progress, Tabs, cx } from "@/components/ui";

type Mut = (fn: (s: CupSave) => void) => void;
type Tab = "partidos" | "tabla" | "cuadro" | "stats" | "equipos";

// ===== Adaptadores para reutilizar las vistas de NFL y DC =====
function nflGameOf(save: CupSave, m: CupMatch): NflGame {
  return { id: m.id, week: 0, date: "", home: m.home, away: m.away, neutral: m.neutral, playoff: decisiveInfo(save, m).decisive, label: m.stage, result: m.result?.nfl } as unknown as NflGame;
}
function dcShim(save: CupSave): DcSave {
  const d = save.dc!;
  return {
    mode: "dc", version: save.version, day: 0, characters: d.characters, synergies: d.synergies, matches: [], randomness: d.randomness, seed: save.seed,
    teams: Object.fromEntries(save.participants.map((id) => [id, { id, name: save.teams[id].name, colors: save.teams[id].colors, members: d.members[id] ?? [] }])),
    tournaments: [{ id: "cup", name: save.title, format: "liga", teamSize: d.teamSize, participants: save.participants, startDay: 0, gap: 1, randomness: d.randomness }],
    dataSource: { source: save.dataSource, updated: "", demo: false },
  };
}
function dcMatchOf(m: CupMatch): DcMatch { return { id: m.id, tournament: "cup", day: 0, stage: m.stage, stageIdx: m.round, sides: [m.home, m.away], result: m.result?.dc }; }

function Team({ save, id, right, bold }: { save: CupSave; id: string; right?: boolean; bold?: boolean }) {
  const t = save.teams[id];
  if (!t) return <span className="text-gray-500">—</span>;
  return (
    <span className={cx("flex min-w-0 items-center gap-1.5", right && "flex-row-reverse text-right")}>
      <Badge colors={t.colors} label={t.short} size={22} />
      <span className={cx("truncate", bold && "font-semibold")}>{t.name}</span>
    </span>
  );
}

function score(r: CupResult) {
  return `${r.hs}-${r.as}${r.pens ? ` (${r.pens[0]}-${r.pens[1]} p.)` : r.et ? " pr." : ""}`;
}

export default function CupGame({ save, tick, mutate }: { save: CupSave; tick: number; mutate: Mut }) {
  const [tab, setTab] = useState<Tab>("partidos");
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState<CupMatch | null>(null);
  const [manual, setManual] = useState<CupMatch | null>(null);
  const [detail, setDetail] = useState<CupMatch | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const f = save.format;
  const nr = nextRound(save);
  const left = playable(save).length;
  const total = save.matches.length;
  const played = save.matches.filter((m) => m.result).length;

  async function run(label: string, scope: "partido" | "ronda" | "fase" | "todo") {
    setBusy(label);
    await new Promise((r) => setTimeout(r, 30));
    mutate((s) => { simulateWhile(s, scope); });
    setBusy(null);
  }
  const saveResult = (m: CupMatch, r: CupResult) => { mutate((s) => setCupResult(s, m.id, r)); setLive(null); setManual(null); };

  const tabs: { id: Tab; label: string }[] = [
    { id: "partidos", label: "Partidos" },
    ...(f.kind !== "eliminatoria" ? [{ id: "tabla" as Tab, label: f.kind === "grupos" ? "Grupos" : "Tabla" }] : []),
    { id: "cuadro", label: "Cuadro" },
    { id: "stats", label: "Estadísticas" },
    { id: "equipos", label: "Equipos" },
  ];

  return (
    <div className="px-3 pb-16 pt-3">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs text-gray-400">🏆 {SPORT_LABEL[save.sport]} · {formatSummary(f, save.participants.length)}</div>
            <div className="mt-1 text-lg font-bold">{save.champion ? <>Campeón: {save.teams[save.champion].name} 🏆</> : nr !== null ? `Siguiente: ${playable(save).find((m) => m.round === nr)?.stage}` : "Esperando resultados"}</div>
            {save.champion && <div className="text-xs text-gray-400">Subcampeón: {save.teams[save.runnerUp ?? ""]?.name ?? "—"}{save.third ? ` · 3.º ${save.teams[save.third]?.name}` : ""}</div>}
            <div className="text-xs text-gray-500">{played}/{total} partidos jugados{left ? ` · ${left} por jugar` : ""}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            <button className="btn-ghost btn-sm" disabled={nr === null} onClick={() => run("Simulando partido…", "partido")}>▶ Partido</button>
            <button className="btn-ghost btn-sm" disabled={nr === null} onClick={() => run("Simulando jornada…", "ronda")}>⏩ Jornada / ronda</button>
            <button className="btn-ghost btn-sm" disabled={nr === null} onClick={() => run("Simulando fase…", "fase")}>⏭ Fase</button>
            <button className="btn-primary btn-sm" disabled={nr === null} onClick={() => run("Simulando todo el torneo…", "todo")}>🏁 Todo</button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>↺</button>
          </div>
        </div>
        {save.note && <p className="mt-2 text-[11px] text-yellow-300/80">{save.note}</p>}
      </div>
      <div className="mt-2"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="mt-3">
        {tab === "partidos" && <Matches save={save} tick={tick} mutate={mutate} onLive={setLive} onManual={setManual} onDetail={setDetail} />}
        {tab === "tabla" && <Tables save={save} tick={tick} />}
        {tab === "cuadro" && <Bracket save={save} tick={tick} onDetail={setDetail} />}
        {tab === "stats" && <Leaders save={save} tick={tick} />}
        {tab === "equipos" && <Teams save={save} />}
      </div>

      {live && <LiveModal save={save} m={live} onClose={() => setLive(null)} onSave={(r) => saveResult(live, r)} />}
      {manual && <ManualModal save={save} m={manual} onClose={() => setManual(null)} onSave={(r) => saveResult(manual, r)} />}
      {detail?.result && <DetailModal save={save} m={detail} onClose={() => setDetail(null)} />}
      {confirmReset && (
        <Modal title="Reiniciar torneo" onClose={() => setConfirmReset(false)}>
          <p className="text-sm text-gray-300">Se borran todos los resultados. Los participantes se mantienen.</p>
          <div className="mt-3 grid gap-2">
            <button className="btn-ghost" onClick={() => { mutate((s) => resetCup(s, false)); setConfirmReset(false); }}>Borrar resultados (mismo sorteo)</button>
            <button className="btn-ghost" onClick={() => { mutate((s) => resetCup(s, true)); setConfirmReset(false); }}>Borrar resultados y hacer un nuevo sorteo</button>
          </div>
        </Modal>
      )}
      {busy && <Progress text={busy} pct={0.6} />}
    </div>
  );
}

// ===== Partidos =====
function Matches({ save, tick, mutate, onLive, onManual, onDetail }: { save: CupSave; tick: number; mutate: Mut; onLive: (m: CupMatch) => void; onManual: (m: CupMatch) => void; onDetail: (m: CupMatch) => void }) {
  const stages = useMemo(() => {
    const out: { key: string; label: string; round: number }[] = [];
    for (const m of save.matches) { const key = `${m.round}|${m.stage}`; if (!out.some((x) => x.key === key)) out.push({ key, label: m.stage, round: m.round }); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, tick]);
  const nr = nextRound(save);
  const def = stages.find((s) => s.round === nr)?.key ?? stages[stages.length - 1]?.key ?? "";
  const [pick, setPick] = useState<string | null>(null);
  const cur = pick && stages.some((s) => s.key === pick) ? pick : def;
  const [round, stage] = cur.split("|");
  const list = save.matches.filter((m) => String(m.round) === round && m.stage === stage);
  const can = new Set(playable(save).map((m) => m.id));
  if (!stages.length) return <Empty>Sin partidos.</Empty>;
  return (
    <div>
      <select className="input" value={cur} onChange={(e) => setPick(e.target.value)}>
        {stages.map((s) => { const ms = save.matches.filter((m) => `${m.round}|${m.stage}` === s.key); const done = ms.every((m) => m.result); return <option key={s.key} value={s.key}>{done ? "✓ " : s.round === nr ? "▶ " : ""}{s.label} ({ms.filter((m) => m.result).length}/{ms.length})</option>; })}
      </select>
      <div className="mt-2 space-y-1">
        {list.map((m) => {
          const r = m.result;
          return (
            <div key={m.id} className="card !p-2">
              {m.group && <div className="mb-1 text-[10px] uppercase text-gray-500">Grupo {m.group}</div>}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <Team save={save} id={m.home} bold={r?.w === 0} />
                <button className={cx("min-w-[64px] rounded px-2 py-0.5 text-center font-bold tabular", r ? "bg-white/10" : "text-gray-500")} disabled={!r} onClick={() => onDetail(m)}>{r ? score(r) : "vs"}</button>
                <Team save={save} id={m.away} right bold={r?.w === 1} />
              </div>
              <div className="mt-1 flex flex-wrap justify-end gap-1">
                {r?.manual && <span className="mr-auto text-[10px] text-yellow-300">manual</span>}
                {!r && can.has(m.id) && <button className="btn-ghost btn-sm" onClick={() => mutate((s) => { const x = s.matches.find((y) => y.id === m.id); if (x) setCupResult(s, m.id, simulateCupMatch(s, x)); })}>⚡ Simular</button>}
                {!r && can.has(m.id) && <button className="btn-ghost btn-sm" onClick={() => onLive(m)}>📺 En vivo</button>}
                {(r || can.has(m.id)) && <button className="btn-ghost btn-sm" onClick={() => onManual(m)}>✏️ {r ? "Editar" : "Manual"}</button>}
                {r && <button className="btn-ghost btn-sm" onClick={() => mutate((s) => setCupResult(s, m.id, undefined))}>🗑</button>}
                {!r && !can.has(m.id) && <span className="text-[11px] text-gray-500">Se juega después de la ida</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-500">Al editar o borrar un resultado se recalculan tablas y cruces; los partidos de rondas siguientes que cambien de rival se descartan.</p>
    </div>
  );
}

// ===== Tablas =====
function TableView({ save, rows, zones }: { save: CupSave; rows: ReturnType<typeof cupTable>; zones?: (i: number, team: string) => string | undefined }) {
  const nfl = save.sport === "nfl", dc = save.sport === "dc";
  return (
    <table className="w-full text-xs">
      <thead><tr><th className="th">#</th><th className="th">Equipo</th><th className="th">PJ</th><th className="th">G</th><th className="th">E</th><th className="th">P</th><th className="th">{nfl ? "PF" : dc ? "KO" : "GF"}</th><th className="th">{nfl ? "PC" : dc ? "KR" : "GC"}</th><th className="th">Dif</th><th className="th">Pts</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.team} className={cx("border-t border-borde/60", zones?.(i, r.team))}>
            <td className="td tabular">{i + 1}</td><td className="td"><Team save={save} id={r.team} /></td>
            <td className="td tabular">{r.pj}</td><td className="td tabular">{r.w}</td><td className="td tabular">{r.d}</td><td className="td tabular">{r.l}</td>
            <td className="td tabular">{r.gf}</td><td className="td tabular">{r.ga}</td><td className="td tabular">{r.gf - r.ga > 0 ? "+" : ""}{r.gf - r.ga}</td><td className="td font-bold tabular">{r.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tables({ save, tick }: { save: CupSave; tick: number }) {
  const f = save.format;
  void tick;
  if (f.kind === "grupos" && save.groups) {
    const gm = save.matches.filter((m) => m.phase === "grupos");
    const thirds = f.bestThirds ? Object.entries(save.groups).map(([g, ids]) => ({ g, r: cupTable(save, ids, gm.filter((m) => m.group === g))[f.perGroup] })).filter((x) => x.r) : [];
    const thirdsSorted = [...thirds].sort((a, b) => b.r.pts - a.r.pts || (b.r.gf - b.r.ga) - (a.r.gf - a.r.ga) || b.r.gf - a.r.gf || b.r.w - a.r.w);
    const qualified = gm.length && gm.every((m) => m.result) ? new Set(groupQualifiers(save, gm).map((x) => x.team)) : null;
    const bestThirdIds = new Set(thirdsSorted.slice(0, f.bestThirds).map((x) => x.r.team));
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {Object.entries(save.groups).map(([g, ids]) => (
          <div key={g} className="card !p-2">
            <div className="mb-1 text-sm font-semibold">Grupo {g}</div>
            <TableView save={save} rows={cupTable(save, ids, gm.filter((m) => m.group === g))} zones={(i, t) => (i < f.perGroup ? "bg-green-500/10" : i === f.perGroup && f.bestThirds && bestThirdIds.has(t) ? "bg-yellow-500/10" : qualified && !qualified.has(t) ? "opacity-60" : undefined)} />
          </div>
        ))}
        {f.bestThirds > 0 && (
          <div className="card !p-2 lg:col-span-2">
            <div className="mb-1 text-sm font-semibold">Mejores {f.perGroup + 1}.º (pasan {f.bestThirds})</div>
            <table className="w-full text-xs">
              <tbody>{thirdsSorted.map((x, i) => <tr key={x.g} className={cx("border-t border-borde/60", i < f.bestThirds && "bg-yellow-500/10")}><td className="td">{i + 1}</td><td className="td">{x.g}</td><td className="td"><Team save={save} id={x.r.team} /></td><td className="td tabular">{x.r.pts} pts</td><td className="td tabular">{x.r.gf - x.r.ga > 0 ? "+" : ""}{x.r.gf - x.r.ga}</td><td className="td tabular">{x.r.gf} a favor</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
  const phase = f.kind === "suizo" ? "suizo" : "liga";
  const rows = cupTable(save, save.participants, save.matches.filter((m) => m.phase === phase));
  const D = f.koSize / 2;
  return (
    <div className="card !p-2">
      <TableView save={save} rows={rows} zones={(i) => f.kind === "suizo" ? (i < D ? "bg-green-500/10" : i < D + f.koSize ? "bg-yellow-500/10" : "opacity-60") : f.playoffTeams && i < f.playoffTeams ? "bg-green-500/10" : undefined} />
      <p className="mt-2 text-[11px] text-gray-500">{f.kind === "suizo" ? `Verde: directo a ${D === 8 ? "octavos" : "la eliminatoria"} · Amarillo: playoff · Resto: eliminado.` : f.playoffTeams ? `Verde: pasa a la fase final.` : "Campeón: el primero."} Desempate: puntos, diferencia, a favor, victorias.</p>
    </div>
  );
}

// ===== Cuadro =====
function Bracket({ save, tick, onDetail }: { save: CupSave; tick: number; onDetail: (m: CupMatch) => void }) {
  void tick;
  const ko = save.matches.filter((m) => m.phase === "ko" || m.phase === "playoff");
  if (!ko.length) return <Empty>El cuadro se arma al terminar la primera fase.</Empty>;
  const cols: { name: string; ties: CupMatch[][] }[] = [];
  for (const m of ko) {
    const name = m.stage.replace(/ · (ida|vuelta)$/, "");
    let col = cols.find((c) => c.name === name);
    if (!col) cols.push((col = { name, ties: [] }));
    const tie = col.ties.find((t) => t[0].tie === m.tie);
    if (tie) tie.push(m); else col.ties.push([m]);
  }
  return (
    <div className="scroll-x -mx-3 flex gap-3 px-3 pb-2">
      {cols.map((c) => (
        <div key={c.name} className="w-56 shrink-0">
          <div className="mb-1 text-xs font-semibold uppercase text-gray-400">{c.name}</div>
          <div className="space-y-2">
            {c.ties.map((legs) => {
              const last = legs[legs.length - 1];
              const a = last.home, b = last.away;
              const agg = (side: string) => legs.reduce((acc, m) => acc + (m.result ? (m.home === side ? m.result.hs : m.result.as) : 0), 0);
              const done = legs.every((m) => m.result);
              const winner = done ? (() => { const ga = agg(a), gb = agg(b); if (ga !== gb) return ga > gb ? a : b; const r = last.result!; if (r.pens && r.pens[0] !== r.pens[1]) return r.pens[0] > r.pens[1] ? a : b; return r.w === 0 ? a : r.w === 1 ? b : undefined; })() : undefined;
              return (
                <button key={last.id} className="card block w-full !p-2 text-left text-xs" onClick={() => last.result && onDetail(last)}>
                  {[a, b].map((t) => (
                    <div key={t} className={cx("flex items-center justify-between gap-1", winner && winner !== t && "opacity-50")}>
                      <Team save={save} id={t} bold={winner === t} />
                      <span className="tabular">{legs.some((m) => m.result) ? agg(t) : ""}</span>
                    </div>
                  ))}
                  {legs.length > 1 && <div className="mt-0.5 text-[10px] text-gray-500">{legs.map((m) => (m.result ? `${m.leg === 1 ? "Ida" : "Vuelta"} ${m.result.hs}-${m.result.as}` : `${m.leg === 1 ? "Ida" : "Vuelta"} pendiente`)).join(" · ")}</div>}
                  {last.result?.pens && <div className="text-[10px] text-gray-400">Penales {last.result.pens[0]}-{last.result.pens[1]}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== Estadísticas =====
function Leaders({ save, tick }: { save: CupSave; tick: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const L = useMemo(() => cupLeaders(save), [save, tick]);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {L.map((l) => (
        <div key={l.title} className="card !p-2">
          <div className="mb-1 text-sm font-semibold">{l.title}</div>
          {l.rows.length === 0 ? <div className="text-xs text-gray-500">Aún sin datos.</div> : (
            <table className="w-full text-xs"><tbody>{l.rows.map((r, i) => <tr key={r.id} className="border-t border-borde/60"><td className="td w-6">{i + 1}</td><td className="td">{r.name}</td><td className="td text-gray-400">{save.teams[r.team]?.short ?? ""}</td><td className="td text-right font-bold tabular">{r.value}{r.extra ? <span className="ml-1 font-normal text-gray-400">({r.extra})</span> : null}</td></tr>)}</tbody></table>
          )}
        </div>
      ))}
      <p className="text-[11px] text-gray-500 md:col-span-2">Los resultados manuales solo cuentan aquí si indicas goleadores / anotadores.</p>
    </div>
  );
}

// ===== Equipos =====
function Teams({ save }: { save: CupSave }) {
  const [open, setOpen] = useState<string | null>(null);
  const ids = [...save.participants].sort((a, b) => save.teams[b].strength - save.teams[a].strength);
  return (
    <div className="space-y-1">
      {ids.map((id) => (
        <div key={id} className="card !p-2">
          <button className="flex w-full items-center justify-between gap-2 text-left text-sm" onClick={() => setOpen(open === id ? null : id)}>
            <Team save={save} id={id} />
            <span className="text-xs text-gray-400">{save.teams[id].sub} · {save.teams[id].strength.toFixed(1)} {open === id ? "▲" : "▼"}</span>
          </button>
          {open === id && <Squad save={save} id={id} />}
        </div>
      ))}
    </div>
  );
}
function Squad({ save, id }: { save: CupSave; id: string }) {
  if (save.fb) {
    const sq = fbSquad(save, id).sort((a, b) => b.ovr - a.ovr);
    return (
      <table className="mt-2 w-full text-xs"><tbody>{sq.map((p) => <tr key={p.id} className="border-t border-borde/60"><td className="td w-10 text-gray-400">{p.positions[0]}</td><td className="td">{p.name}{p.filler && <span className="ml-1 text-[10px] text-orange-300">relleno (no real)</span>}{p.estimated && !p.filler && <span className="ml-1 text-[10px] text-orange-300">media estimada</span>}</td><td className="td text-gray-400">{p.clubName ?? ""}</td><td className="td text-gray-400">{p.age}</td><td className="td text-right font-bold tabular">{p.ovr}</td></tr>)}</tbody></table>
    );
  }
  if (save.nfl) {
    const r = Object.values(save.nfl.players).filter((p) => p.teamId === id).sort((a, b) => b.ovr - a.ovr).slice(0, 53);
    return <table className="mt-2 w-full text-xs"><tbody>{r.map((p) => <tr key={p.id} className="border-t border-borde/60"><td className="td w-10 text-gray-400">{p.pos}</td><td className="td">{p.name}</td><td className="td text-gray-400">{p.age}</td><td className="td text-right font-bold tabular">{p.ovr}</td></tr>)}</tbody></table>;
  }
  const d = save.dc!;
  return <div className="mt-2 text-xs">{(d.members[id] ?? []).map((c) => d.characters[c]?.name).join(" · ")}</div>;
}

// ===== Modales =====
function LiveModal({ save, m, onClose, onSave }: { save: CupSave; m: CupMatch; onClose: () => void; onSave: (r: CupResult) => void }) {
  const [fm] = useState(() => (save.fb ? new FootballMatch(fbInput(save, m.home), fbInput(save, m.away), fbOptions(save, m)) : null));
  const decisive = decisiveInfo(save, m).decisive;
  if (fm) return <LiveMatchView m={fm} title={`${save.title} · ${m.stage}`} onClose={onClose} onSave={(r) => onSave(fromFootball(r))} />;
  if (save.nfl) return <NflLive g={nflGameOf(save, m)} save={nflShim(save)} onClose={onClose} onSave={(r) => onSave(fromNfl(r))} />;
  return <DcLive m={dcMatchOf(m)} save={dcShim(save)} onClose={onClose} onSave={(r) => onSave(fromDc(r, decisive))} />;
}

function ManualModal({ save, m, onClose, onSave }: { save: CupSave; m: CupMatch; onClose: () => void; onSave: (r: CupResult) => void }) {
  const { decisive, l1 } = decisiveInfo(save, m);
  if (save.fb) {
    const asMr = (r?: CupResult): MatchResult | undefined => (r ? r.fb ?? { hg: r.hs, ag: r.as, et: r.et, pens: r.pens, events: [], players: {}, manual: true } : undefined);
    return <ManualResultView home={fbInput(save, m.home)} away={fbInput(save, m.away)} prev={asMr(m.result)} decisive={decisive} l1={asMr(l1)} onClose={onClose} onSave={(r) => onSave(fromFootball(r, true))} />;
  }
  if (save.nfl) return <NflManual g={nflGameOf(save, m)} save={nflShim(save)} onClose={onClose} onSave={(r) => onSave(fromNfl({ ...r, manual: true }))} />;
  return <DcManual m={dcMatchOf(m)} save={dcShim(save)} onClose={onClose} onSave={(r) => onSave(fromDc({ ...r, manual: true }, decisive))} />;
}

function DetailModal({ save, m, onClose }: { save: CupSave; m: CupMatch; onClose: () => void }) {
  const r = m.result!;
  if (save.nfl && r.nfl) return <NflDetail g={nflGameOf(save, m)} save={nflShim(save)} onClose={onClose} />;
  if (save.dc && r.dc) return <DcDetail m={dcMatchOf(m)} save={dcShim(save)} onClose={onClose} />;
  const P = save.fb?.players ?? {};
  const nm = (id?: string) => (id ? P[id]?.shortName ?? "?" : "");
  const ICON: Record<string, string> = { gol: "⚽", gol_pp: "⚽ (p.p.)", roja: "🟥", doble_amarilla: "🟨🟥", penal_fallado: "❌ penal", penal_atajado: "🧤 penal" };
  return (
    <Modal title={`${save.title} · ${m.stage}`} onClose={onClose}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Team save={save} id={m.home} bold />
        <div className="text-center"><div className="text-2xl font-bold tabular">{r.hs} - {r.as}</div>{r.et && <div className="text-xs">tras prórroga</div>}{r.pens && <div className="text-xs">penales {r.pens[0]}-{r.pens[1]}</div>}{r.manual && <div className="text-[10px] text-yellow-300">resultado manual</div>}</div>
        <Team save={save} id={m.away} right bold />
      </div>
      <div className="mt-3 space-y-1">
        {(r.fb?.events ?? []).filter((e) => e.type !== "tanda").map((e, i) => (
          <div key={i} className={cx("flex text-sm", e.side === 1 && "flex-row-reverse text-right")}>
            <div className="w-1/2"><span className="text-xs text-gray-400">{e.min}{e.add ? `+${e.add}` : ""}&apos; </span>{ICON[e.type] ?? ""} {nm(e.player)}{e.type === "gol" && e.player2 && <span className="text-xs text-gray-400"> (asist. {nm(e.player2)})</span>}</div>
          </div>
        ))}
      </div>
      {r.fb?.stats && <div className="mt-3 text-xs text-gray-400">Posesión {r.fb.stats[0].poss}%-{r.fb.stats[1].poss}% · Tiros {r.fb.stats[0].shots}-{r.fb.stats[1].shots} · xG {r.fb.stats[0].xg.toFixed(2)}-{r.fb.stats[1].xg.toFixed(2)}</div>}
    </Modal>
  );
}
