"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BattleResult, DcCharacter, DcMatch, DcSave, DcTeam, SpecialType, TournamentFormat } from "@/engine/dc/types";
import { Battle, overall, teamSynergy } from "@/engine/dc/battle";
import { createTournament, lineupOf, nextDcDay, playDcDay, rankings, setDcResult, sidesFor, simulateDcMatch, standings, teamPower } from "@/engine/dc/tournaments";
import { Badge, Empty, Field, Modal, Progress, SpeedControls, Tabs, cx } from "@/components/ui";

type Tab = "hoy" | "torneos" | "personajes" | "equipos" | "ranking";
type Mut = (fn: (s: DcSave) => void) => void;
const FORMAT_LABEL: Record<TournamentFormat, string> = { liga: "Liga (todos contra todos)", eliminacion: "Eliminación directa", grupos: "Grupos + eliminatoria", royale: "Battle royale", equipos: "Torneo por equipos (duelos 1 vs 1)" };

export default function DcGame({ save, tick, mutate }: { save: DcSave; tick: number; mutate: Mut }) {
  const [tab, setTab] = useState<Tab>("hoy");
  const [live, setLive] = useState<DcMatch | null>(null);
  const [manual, setManual] = useState<DcMatch | null>(null);
  const [detail, setDetail] = useState<DcMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const next = nextDcDay(save);
  const today = next !== null ? save.matches.filter((m) => m.day === next) : [];

  async function advance(all: boolean) {
    setBusy(true);
    let d: number | null;
    while ((d = nextDcDay(save)) !== null) {
      playDcDay(save, d);
      await new Promise((r) => setTimeout(r, 0));
      if (!all) break;
    }
    setBusy(false);
    mutate(() => {});
  }

  return (
    <div className="px-3 pb-24">
      <div className="sticky top-0 z-20 -mx-3 border-b border-borde bg-fondo/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-xs text-gray-400">DC Comics · escala propia de la app</div><div className="font-semibold">Día {next ?? save.day}</div></div>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" disabled={next === null} onClick={() => advance(true)}>Hasta el final</button>
            <button className="btn-primary" disabled={next === null} onClick={() => advance(false)}>Continuar ▸</button>
          </div>
        </div>
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ id: "hoy", label: "Batallas" }, { id: "torneos", label: "Torneos" }, { id: "personajes", label: "Personajes" }, { id: "equipos", label: "Equipos" }, { id: "ranking", label: "Ranking" }]} />
      </div>
      {tab === "hoy" && (
        <div className="mt-3 space-y-2">
          {next === null && <Empty>No hay batallas pendientes. Crea un torneo en la pestaña “Torneos”.</Empty>}
          {today.map((m) => <MatchRow key={m.id} m={m} save={save} mutate={mutate} onLive={() => setLive(m)} onManual={() => setManual(m)} onDetail={() => setDetail(m)} />)}
        </div>
      )}
      {tab === "torneos" && <Tournaments save={save} tick={tick} mutate={mutate} onDetail={setDetail} onLive={setLive} onManual={setManual} />}
      {tab === "personajes" && <Characters save={save} mutate={mutate} />}
      {tab === "equipos" && <Teams save={save} mutate={mutate} />}
      {tab === "ranking" && <Ranking save={save} tick={tick} />}
      {live && <DcLive m={live} save={save} onClose={() => setLive(null)} onSave={(r) => { mutate((s) => setDcResult(s, live.id, r)); setLive(null); }} />}
      {manual && <DcManual m={manual} save={save} onClose={() => setManual(null)} onSave={(r) => { mutate((s) => setDcResult(s, manual.id, r)); setManual(null); }} />}
      {detail?.result && <DcDetail m={detail} save={save} onClose={() => setDetail(null)} />}
      {busy && <Progress text="Simulando batallas…" pct={0.5} />}
    </div>
  );
}

function TeamChip({ save, id }: { save: DcSave; id: string }) {
  const t = save.teams[id];
  return <span className="flex min-w-0 items-center gap-2"><Badge colors={t?.colors ?? ["#333", "#777"]} label={t?.name ?? id} size={22} /><span className="truncate">{t?.name ?? id}</span></span>;
}

function MatchRow({ m, save, mutate, onLive, onManual, onDetail }: { m: DcMatch; save: DcSave; mutate: Mut; onLive: () => void; onManual: () => void; onDetail: () => void }) {
  const t = save.tournaments.find((x) => x.id === m.tournament);
  const r = m.result;
  const bye = m.stage.includes("pase directo");
  return (
    <div className="rounded-lg border border-borde bg-fondo/60 p-2 text-sm">
      <div className="mb-1 flex justify-between text-[11px] text-gray-400"><span>{t?.name} · {m.stage}</span><span>Día {m.day}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        {m.sides.map((s, i) => (
          <span key={s} className={cx("flex items-center gap-1", r && r.winner === i && "font-bold text-acento")}>{i > 0 && <span className="text-gray-500">vs</span>}<TeamChip save={save} id={s} /></span>
        ))}
      </div>
      {!bye && (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {!r ? (
            <>
              <button className="btn-ghost btn-sm" onClick={onManual}>✍ Manual</button>
              {t?.format !== "equipos" && <button className="btn-ghost btn-sm" onClick={onLive}>▶ En vivo</button>}
              <button className="btn-primary btn-sm" onClick={() => mutate((s) => { const mm = s.matches.find((x) => x.id === m.id)!; const { result, duels } = simulateDcMatch(s, mm); if (duels) mm.duels = duels; setDcResult(s, m.id, result); })}>⚡ Simular</button>
            </>
          ) : (
            <>
              <span className="mr-auto text-xs text-gray-400">{r.winner >= 0 ? `Gana ${save.teams[m.sides[r.winner]]?.name}` : "Empate"}{r.mvp ? ` · MVP ${save.characters[r.mvp]?.name}` : ""}</span>
              <button className="btn-ghost btn-sm" onClick={onDetail}>Resumen</button>
              <button className="btn-ghost btn-sm" onClick={onManual}>Editar</button>
              <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Borrar resultado?")) mutate((s) => setDcResult(s, m.id, undefined)); }}>Borrar</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ===== Batalla en vivo =====
export function DcLive({ m, save, onClose, onSave }: { m: DcMatch; save: DcSave; onClose: () => void; onSave: (r: BattleResult) => void }) {
  const t = save.tournaments.find((x) => x.id === m.tournament)!;
  const [b] = useState(() => new Battle(sidesFor(save, m), save.synergies, t.randomness));
  const [, setV] = useState(0);
  const [speed, setSpeed] = useState(1);
  const ref = useRef(() => {});
  ref.current = () => { b.step(); if (b.finished) setSpeed(0); setV((v) => v + 1); };
  useEffect(() => { if (speed === 0 || b.finished) return; const id = setInterval(() => ref.current(), 700 / speed); return () => clearInterval(id); }, [speed, b]);
  return (
    <Modal title={`${t.name} · ${m.stage}`} onClose={onClose} wide>
      <div className="grid gap-2 sm:grid-cols-2">
        {b.sides.map((s, i) => (
          <div key={s.id} className={cx("card !p-2", b.winner === i && "ring-2 ring-acento")}>
            <div className="mb-1 flex items-center justify-between text-sm font-semibold"><TeamChip save={save} id={s.id} />{b.comeback[i] && <span className="text-xs text-orange-300">🔥 remontada</span>}</div>
            {b.f.filter((x) => x.side === i).map((x) => (
              <div key={x.c.id} className={cx("mb-1 text-xs", x.hp <= 0 && "opacity-40")}>
                <div className="flex justify-between"><span>{x.c.name}{x.stun ? " 💫" : ""}{x.hp <= 0 ? " 💥 K.O." : ""}</span><span className="tabular">{Math.max(0, x.hp)}/{x.maxHp}</span></div>
                <div className="h-1.5 rounded bg-fondo"><div className={cx("h-full rounded transition-all", x.hp / x.maxHp > 0.5 ? "bg-green-500" : x.hp / x.maxHp > 0.2 ? "bg-yellow-400" : "bg-red-500")} style={{ width: `${Math.max(0, (x.hp / x.maxHp) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <SpeedControls speed={speed} setSpeed={setSpeed} finished={b.finished} onEnd={() => { b.runToEnd(); setSpeed(0); setV((v) => v + 1); }} />
        {b.finished && <div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={onClose}>Descartar</button><button className="btn-primary btn-sm" onClick={() => onSave(b.result())}>Guardar resultado</button></div>}
      </div>
      <div className="mt-2 max-h-[40vh] space-y-0.5 overflow-y-auto text-sm">
        {[...b.log].reverse().map((e, i) => (
          <div key={i} className={cx("rounded px-2 py-0.5", e.type === "ko" && "bg-red-500/20 font-semibold", e.type === "combo" && "bg-purple-500/20", e.type === "critico" && "text-yellow-200", e.type === "remontada" && "bg-orange-500/20", e.type === "info" && "text-gray-400")}>{e.text}</div>
        ))}
      </div>
    </Modal>
  );
}

export function DcManual({ m, save, onClose, onSave }: { m: DcMatch; save: DcSave; onClose: () => void; onSave: (r: BattleResult) => void }) {
  const sides = sidesFor(save, m);
  const [winner, setWinner] = useState(m.result?.winner ?? 0);
  const [kos, setKos] = useState<Record<string, number>>({});
  const [down, setDown] = useState<Set<string>>(new Set());
  const build = (): BattleResult => {
    const fighters = sides.flatMap((s, i) => s.members.map((c) => ({ id: c.id, side: i, dmg: 0, taken: 0, kos: kos[c.id] ?? 0, hp: down.has(c.id) ? 0 : 1, maxHp: 1, ko: down.has(c.id) })));
    return { winner, rounds: 0, fighters, koOrder: [...down], manual: true, mvp: fighters.filter((f) => f.side === winner).sort((a, b) => b.kos - a.kos)[0]?.id };
  };
  return (
    <Modal title="Resultado manual" onClose={onClose}>
      <Field label="Ganador">
        <select className="input" value={winner} onChange={(e) => setWinner(Number(e.target.value))}>
          {sides.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}
          {sides.length === 2 && <option value={-1}>Empate</option>}
        </select>
      </Field>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">K.O. por personaje (opcional)</summary>
        {sides.map((s) => (
          <div key={s.id} className="mt-2">
            <div className="text-xs font-semibold text-gray-400">{s.name}</div>
            {s.members.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1">{c.name}</span>
                <label>K.O. hechos <input type="number" min={0} className="input !inline !w-14 !px-1" value={kos[c.id] ?? 0} onChange={(e) => setKos({ ...kos, [c.id]: Number(e.target.value) || 0 })} /></label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={down.has(c.id)} onChange={(e) => { const n = new Set(down); if (e.target.checked) n.add(c.id); else n.delete(c.id); setDown(n); }} />noqueado</label>
              </div>
            ))}
          </div>
        ))}
      </details>
      <button className="btn-primary mt-4 w-full" onClick={() => onSave(build())}>Guardar</button>
    </Modal>
  );
}

export function DcDetail({ m, save, onClose }: { m: DcMatch; save: DcSave; onClose: () => void }) {
  const r = m.result!;
  return (
    <Modal title={`${m.stage} · Día ${m.day}`} onClose={onClose}>
      <div className="text-sm">{r.winner >= 0 ? <>Gana <b>{save.teams[m.sides[r.winner]]?.name}</b></> : "Empate"}{r.rounds ? ` en ${r.rounds} rondas` : ""}{r.manual ? " (manual)" : ""}{r.mvp ? ` · MVP: ${save.characters[r.mvp]?.name}` : ""}</div>
      {m.duels && <div className="mt-2 space-y-0.5 text-xs">{m.duels.map((d, i) => <div key={i}>{save.characters[d.a]?.name} vs {save.characters[d.b]?.name}: gana {d.result && d.result.winner >= 0 ? save.characters[d.result.winner === 0 ? d.a : d.b]?.name : "empate"}</div>)}</div>}
      <table className="mt-3 w-full text-xs">
        <thead><tr><th className="th">Personaje</th><th className="th">Daño</th><th className="th">Recibido</th><th className="th">K.O.</th><th className="th">Estado</th></tr></thead>
        <tbody>{r.fighters.map((f) => <tr key={f.id + f.side} className="border-t border-borde/60"><td className="td">{save.characters[f.id]?.name} <span className="text-gray-500">({save.teams[m.sides[f.side]]?.name})</span></td><td className="td">{f.dmg}</td><td className="td">{f.taken}</td><td className="td">{f.kos}</td><td className="td">{f.ko ? "💥" : "✔"}</td></tr>)}</tbody>
      </table>
    </Modal>
  );
}

// ===== Torneos =====
function Tournaments({ save, tick, mutate, onDetail, onLive, onManual }: { save: DcSave; tick: number; mutate: Mut; onDetail: (m: DcMatch) => void; onLive: (m: DcMatch) => void; onManual: (m: DcMatch) => void }) {
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<string | null>(save.tournaments[save.tournaments.length - 1]?.id ?? null);
  const t = save.tournaments.find((x) => x.id === sel);
  void tick;
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <select className="input" value={sel ?? ""} onChange={(e) => setSel(e.target.value)}>
          <option value="">— Elegir torneo —</option>
          {save.tournaments.map((x) => <option key={x.id} value={x.id}>{x.name} · {FORMAT_LABEL[x.format]}{x.done ? " ✔" : ""}</option>)}
        </select>
        <button className="btn-primary whitespace-nowrap" onClick={() => setCreating(true)}>+ Nuevo torneo</button>
      </div>
      {t && (
        <div className="mt-3 space-y-3">
          <div className="card text-sm">
            <b>{t.name}</b> · {FORMAT_LABEL[t.format]} · {t.teamSize} vs {t.teamSize} · azar {Math.round(t.randomness * 100)}% · {t.participants.length} participantes · días {t.startDay}+ (cada {t.gap})
            {t.done && t.winner && <div className="mt-1">🏆 Campeón: <b>{save.teams[t.winner]?.name}</b></div>}
          </div>
          {(t.format === "liga" || t.format === "equipos") && <DcTable save={save} tId={t.id} />}
          {t.format === "grupos" && Object.keys(t.groups ?? {}).map((g) => <div key={g}><h4 className="text-sm font-semibold">Grupo {g}</h4><DcTable save={save} tId={t.id} group={g} /></div>)}
          {t.placements && <div className="card text-xs">Clasificación final: {Object.entries(t.placements).sort((a, b) => a[1] - b[1]).map(([id, p]) => `${p}. ${save.teams[id]?.name}`).join(" · ")}</div>}
          <div className="space-y-2">
            {save.matches.filter((m) => m.tournament === t.id).sort((a, b) => a.day - b.day).map((m) => <MatchRow key={m.id} m={m} save={save} mutate={mutate} onLive={() => onLive(m)} onManual={() => onManual(m)} onDetail={() => onDetail(m)} />)}
          </div>
        </div>
      )}
      {!t && !creating && <Empty>Crea torneos: pueden correr varios a la vez con un calendario común (día a día).</Empty>}
      {creating && <NewTournamentModal save={save} onClose={() => setCreating(false)} onCreate={(o) => { let id = ""; mutate((s) => { for (const p of o.participants) if (p.startsWith("solo-") && !s.teams[p]) { const c = s.characters[p.slice(5)]; s.teams[p] = { id: p, name: c.name, colors: c.colors, members: [c.id] }; } id = createTournament(s, o).id; }); setSel(id); setCreating(false); }} />}
    </div>
  );
}

function DcTable({ save, tId, group }: { save: DcSave; tId: string; group?: string }) {
  const rows = standings(save, tId, group);
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="th">#</th><th className="th">Equipo</th><th className="th">PJ</th><th className="th">G</th><th className="th">E</th><th className="th">P</th><th className="th">K.O.±</th><th className="th">Pts</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.team} className="border-t border-borde/60"><td className="td">{i + 1}</td><td className="td"><TeamChip save={save} id={r.team} /></td><td className="td">{r.pj}</td><td className="td">{r.w}</td><td className="td">{r.d}</td><td className="td">{r.l}</td><td className="td">{r.kf - r.ka}</td><td className="td font-bold">{r.pts}</td></tr>)}</tbody>
    </table>
  );
}

function NewTournamentModal({ save, onClose, onCreate }: { save: DcSave; onClose: () => void; onCreate: (o: Parameters<typeof createTournament>[1]) => void }) {
  const [name, setName] = useState(`Torneo ${save.tournaments.length + 1}`);
  const [format, setFormat] = useState<TournamentFormat>("eliminacion");
  const [size, setSize] = useState(3);
  const [parts, setParts] = useState<string[]>(Object.keys(save.teams).slice(0, 8));
  const [startDay, setStart] = useState(nextDcDay(save) ?? save.day);
  const [gap, setGap] = useState(1);
  const [rnd, setRnd] = useState(save.randomness);
  const [soloMode, setSoloMode] = useState(false);
  const [solo, setSolo] = useState<string[]>([]);
  const teams = Object.values(save.teams);
  const valid = soloMode ? solo.length >= 2 : parts.length >= 2 && parts.every((p) => lineupOf(save, p, size).length > 0);
  return (
    <Modal title="Nuevo torneo" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Formato"><select className="input" value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>{(Object.keys(FORMAT_LABEL) as TournamentFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}</select></Field>
        <Field label="Tamaño"><select className="input" value={size} onChange={(e) => setSize(Number(e.target.value))}>{[1, 3, 5, 7].map((n) => <option key={n} value={n}>{n} vs {n}</option>)}</select></Field>
        <Field label={`Factor de azar: ${Math.round(rnd * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={rnd} onChange={(e) => setRnd(Number(e.target.value))} /></Field>
        <Field label="Día de inicio"><input type="number" className="input" value={startDay} onChange={(e) => setStart(Number(e.target.value) || 1)} /></Field>
        <Field label="Días entre rondas"><input type="number" min={1} className="input" value={gap} onChange={(e) => setGap(Number(e.target.value) || 1)} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={soloMode} onChange={(e) => { setSoloMode(e.target.checked); if (e.target.checked) setSize(1); }} /> Torneo individual (cada personaje es un participante)</label>
      {!soloMode ? (
        <div className="mt-2 max-h-56 overflow-y-auto rounded border border-borde p-2">
          {teams.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={parts.includes(t.id)} onChange={(e) => setParts(e.target.checked ? [...parts, t.id] : parts.filter((x) => x !== t.id))} />
              <span className="flex-1 truncate">{t.name}</span><span className="text-xs text-gray-400">{Math.min(size, t.members.length)} luchadores · poder {teamPower(save, t.id, size).toFixed(0)}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-2 max-h-56 overflow-y-auto rounded border border-borde p-2">
          {Object.values(save.characters).sort((a, b) => overall(b) - overall(a)).map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={solo.includes(c.id)} onChange={(e) => setSolo(e.target.checked ? [...solo, c.id] : solo.filter((x) => x !== c.id))} /><span className="flex-1">{c.name}</span><span className="text-xs text-gray-400">{overall(c)}</span></label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-500">Luchan los primeros {size} integrantes de cada equipo (ordénalos en “Equipos”).</p>
      <button className="btn-primary mt-3 w-full" disabled={!valid} onClick={() => {
        if (!soloMode) return onCreate({ name, format, teamSize: size, participants: parts, startDay, gap, randomness: rnd });
        // equipos individuales automáticos
        onCreate({ name, format, teamSize: 1, participants: solo.map((c) => `solo-${c}`), startDay, gap, randomness: rnd });
      }}>Crear</button>
    </Modal>
  );
}

// ===== Personajes =====
const SPECIAL_LABEL: Record<SpecialType, string> = { dano: "Daño", aturdir: "Aturdir", cura: "Curación", escudo: "Escudo", potenciar: "Potenciar", drenar: "Drenar" };
function Characters({ save, mutate }: { save: DcSave; mutate: Mut }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<DcCharacter | null>(null);
  const list = Object.values(save.characters).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => overall(b) - overall(a));
  return (
    <div className="mt-3">
      <div className="card text-xs text-yellow-200">Estos stats son una escala propia de esta app (1-100), inventados para el juego y editables. No son valores oficiales de DC Comics.</div>
      <div className="mt-2 flex gap-2"><input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn-primary whitespace-nowrap" onClick={() => setEdit({ id: `c${Date.now().toString(36)}`, name: "Nuevo personaje", str: 50, spd: 50, dur: 50, cmb: 50, int: 50, pow: 50, alignment: "heroe", teams: [], colors: ["#2563eb", "#facc15"], attackTags: [], weaknesses: {}, special: { name: "Golpe especial", type: "dano", power: 1.5 }, abilities: [], custom: true })}>+ Crear</button></div>
      <div className="scroll-x mt-2">
        <table className="w-full min-w-[620px] text-sm">
          <thead><tr>{["Personaje", "OVR", "FUE", "VEL", "DUR", "COM", "INT", "POD", "Debilidades", "Especial"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id} className="cursor-pointer border-t border-borde/60 hover:bg-white/5" onClick={() => setEdit(c)}>
              <td className="td"><span className="flex items-center gap-2"><Badge colors={c.colors} label={c.name} size={22} />{c.name}</span></td>
              <td className="td font-bold">{overall(c)}</td><td className="td">{c.str}</td><td className="td">{c.spd}</td><td className="td">{c.dur}</td><td className="td">{c.cmb}</td><td className="td">{c.int}</td><td className="td">{c.pow}</td>
              <td className="td text-xs">{Object.entries(c.weaknesses).map(([k, v]) => `${k} x${v}`).join(", ") || "—"}</td>
              <td className="td text-xs">{c.special.name} ({SPECIAL_LABEL[c.special.type]})</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {edit && <CharEditor c={edit} save={save} onClose={() => setEdit(null)} onSave={(c) => { mutate((s) => { s.characters[c.id] = c; }); setEdit(null); }} onDelete={edit.custom ? () => { mutate((s) => { delete s.characters[edit.id]; for (const t of Object.values(s.teams)) t.members = t.members.filter((m) => m !== edit.id); }); setEdit(null); } : undefined} />}
    </div>
  );
}

function CharEditor({ c: c0, save, onClose, onSave, onDelete }: { c: DcCharacter; save: DcSave; onClose: () => void; onSave: (c: DcCharacter) => void; onDelete?: () => void }) {
  const [c, setC] = useState<DcCharacter>(structuredClone(c0));
  const [weak, setWeak] = useState(Object.entries(c0.weaknesses).map(([k, v]) => `${k}:${v}`).join(", "));
  const num = (k: "str" | "spd" | "dur" | "cmb" | "int" | "pow", label: string) => <Field label={label}><input type="number" min={1} max={100} className="input" value={c[k]} onChange={(e) => setC({ ...c, [k]: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} /></Field>;
  return (
    <Modal title={c0.name} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre"><input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Alineación"><select className="input" value={c.alignment} onChange={(e) => setC({ ...c, alignment: e.target.value as DcCharacter["alignment"] })}><option value="heroe">Héroe</option><option value="villano">Villano</option><option value="antiheroe">Antihéroe</option></select></Field>
        {num("str", "Fuerza")}{num("spd", "Velocidad")}{num("dur", "Durabilidad")}{num("cmb", "Combate")}{num("int", "Inteligencia")}{num("pow", "Energía / poderes")}
        <Field label="Habilidad especial"><input className="input" value={c.special.name} onChange={(e) => setC({ ...c, special: { ...c.special, name: e.target.value } })} /></Field>
        <Field label="Tipo"><select className="input" value={c.special.type} onChange={(e) => setC({ ...c, special: { ...c.special, type: e.target.value as SpecialType } })}>{(Object.keys(SPECIAL_LABEL) as SpecialType[]).map((k) => <option key={k} value={k}>{SPECIAL_LABEL[k]}</option>)}</select></Field>
        <Field label="Potencia especial"><input type="number" step={0.1} className="input" value={c.special.power} onChange={(e) => setC({ ...c, special: { ...c.special, power: Number(e.target.value) || 1 } })} /></Field>
        <Field label="Colores"><span className="flex gap-1"><input type="color" value={c.colors[0]} onChange={(e) => setC({ ...c, colors: [e.target.value, c.colors[1]] })} /><input type="color" value={c.colors[1]} onChange={(e) => setC({ ...c, colors: [c.colors[0], e.target.value] })} /></span></Field>
        <Field label="Tipos de ataque (coma)"><input className="input" value={c.attackTags.join(", ")} onChange={(e) => setC({ ...c, attackTags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
        <Field label="Debilidades (tipo:multiplicador)"><input className="input" value={weak} onChange={(e) => setWeak(e.target.value)} placeholder="kryptonita:2.5, magia:1.6" /></Field>
      </div>
      <p className="mt-2 text-xs text-gray-400">Overall calculado: <b>{overall(c)}</b> · Equipos: {c.teams.map((t) => save.teams[t]?.name ?? t).join(", ") || "—"}</p>
      <div className="mt-3 flex gap-2">
        {onDelete && <button className="btn-ghost" onClick={() => { if (confirm("¿Eliminar personaje?")) onDelete(); }}>Eliminar</button>}
        <button className="btn-primary flex-1" onClick={() => {
          const w: Record<string, number> = {};
          for (const part of weak.split(",")) { const [k, v] = part.split(":").map((x) => x.trim()); if (k) w[k] = Number(v) || 1.5; }
          onSave({ ...c, weaknesses: w });
        }}>Guardar</button>
      </div>
    </Modal>
  );
}

// ===== Equipos (canónicos y propios) =====
function Teams({ save, mutate }: { save: DcSave; mutate: Mut }) {
  const [sel, setSel] = useState<string>(Object.keys(save.teams)[0]);
  const t = save.teams[sel];
  const [add, setAdd] = useState("");
  const syn = t ? teamSynergy(t.members.slice(0, 7), save.synergies) : null;
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <select className="input" value={sel} onChange={(e) => setSel(e.target.value)}>{Object.values(save.teams).filter((x) => !x.id.startsWith("solo-")).map((x) => <option key={x.id} value={x.id}>{x.name}{x.custom ? " (propio)" : ""}</option>)}</select>
        <button className="btn-primary whitespace-nowrap" onClick={() => { const id = `eq${Date.now().toString(36)}`; mutate((s) => { s.teams[id] = { id, name: "Mi equipo", colors: ["#7c3aed", "#facc15"], members: [], custom: true }; }); setSel(id); }}>+ Equipo propio</button>
      </div>
      {t && (
        <div className="card mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input !w-56" value={t.name} onChange={(e) => mutate((s) => { s.teams[sel].name = e.target.value; })} />
            <input type="color" value={t.colors[0]} onChange={(e) => mutate((s) => { s.teams[sel].colors = [e.target.value, t.colors[1]]; })} />
            <input type="color" value={t.colors[1]} onChange={(e) => mutate((s) => { s.teams[sel].colors = [t.colors[0], e.target.value]; })} />
            {t.custom && <button className="btn-ghost btn-sm" onClick={() => { if (confirm("¿Borrar equipo?")) mutate((s) => { delete s.teams[sel]; }); setSel(Object.keys(save.teams)[0]); }}>Borrar</button>}
          </div>
          <p className="text-xs text-gray-400">El orden importa: en un torneo de N vs N pelean los primeros N. Sinergia de los 7 primeros: {syn ? `${syn.value >= 0 ? "+" : ""}${Math.round(syn.value * 100)}%` : "—"} {syn?.pairs.map((p) => `(${save.characters[p.a]?.name} + ${save.characters[p.b]?.name}: ${p.label})`).join(" ")}</p>
          {t.members.map((id, i) => {
            const c = save.characters[id];
            if (!c) return null;
            const mv = (d: number) => mutate((s) => { const m = s.teams[sel].members; const j = i + d; if (j < 0 || j >= m.length) return; [m[i], m[j]] = [m[j], m[i]]; });
            return (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-gray-400">{i + 1}</span><Badge colors={c.colors} label={c.name} size={22} /><span className="flex-1">{c.name}</span><span className="text-xs text-gray-400">{overall(c)}</span>
                <button className="btn-ghost btn-sm !px-1" onClick={() => mv(-1)}>▲</button><button className="btn-ghost btn-sm !px-1" onClick={() => mv(1)}>▼</button>
                <button className="btn-ghost btn-sm !px-1" onClick={() => mutate((s) => { s.teams[sel].members = s.teams[sel].members.filter((m) => m !== id); })}>✕</button>
              </div>
            );
          })}
          <div className="flex gap-2">
            <select className="input" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Añadir personaje (de cualquier equipo)…</option>{Object.values(save.characters).filter((c) => !t.members.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name} ({overall(c)})</option>)}</select>
            <button className="btn-ghost" disabled={!add} onClick={() => { mutate((s) => { s.teams[sel].members.push(add); }); setAdd(""); }}>Añadir</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Ranking =====
function Ranking({ save, tick }: { save: DcSave; tick: number }) {
  const r = useMemo(() => rankings(save), [save, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<"characters" | "teams">("characters");
  const list = r[kind];
  return (
    <div className="mt-3">
      <div className="flex gap-1">{(["characters", "teams"] as const).map((k) => <button key={k} className={cx("btn-sm btn", kind === k ? "bg-acento text-black" : "border border-borde")} onClick={() => setKind(k)}>{k === "characters" ? "Personajes" : "Equipos"}</button>)}</div>
      <p className="mt-1 text-[11px] text-gray-500">Puntos acumulados entre todos los torneos: victoria 3 (battle royale 10), empate 1, K.O. 1, MVP 2, y por puesto final (1º 30, 2º 18, semis 10, cuartos 5).</p>
      <table className="mt-2 w-full text-sm">
        <thead><tr><th className="th">#</th><th className="th">{kind === "characters" ? "Personaje" : "Equipo"}</th><th className="th">Pts</th><th className="th">Batallas</th><th className="th">Victorias</th><th className="th">K.O.</th><th className="th">Títulos</th></tr></thead>
        <tbody>{list.map((e, i) => <tr key={e.id} className="border-t border-borde/60"><td className="td">{i + 1}</td><td className="td">{kind === "characters" ? save.characters[e.id]?.name ?? e.id : save.teams[e.id]?.name ?? e.id}</td><td className="td font-bold">{e.pts}</td><td className="td">{e.battles}</td><td className="td">{e.wins}</td><td className="td">{e.kos}</td><td className="td">{e.titles}</td></tr>)}</tbody>
      </table>
      {!list.length && <Empty>Juega batallas para construir el ranking histórico.</Empty>}
    </div>
  );
}

export type { DcTeam };
