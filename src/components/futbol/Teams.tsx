"use client";
import { useEffect, useMemo, useState } from "react";
import type { Foot, Player, Pos } from "@/engine/football/types";
import { squadOf } from "@/engine/football/lineup";
import { clubStrength, getIndex, invalidateStrength, playerStatus } from "@/engine/football/season";
import { playerStats } from "@/engine/football/career";
import { estimateWage, prestige, prestigeStars, renewContract, squadValue } from "@/engine/football/market";
import { Badge, Field, Modal, cx } from "@/components/ui";
import { fmtMoney, useF } from "./ctx";

const POS_ORDER: Pos[] = ["POR", "DFC", "LD", "LI", "CAD", "CAI", "MCD", "MC", "MD", "MI", "MCO", "ED", "EI", "SD", "DC"];

export function Teams({ focus }: { focus: string | null }) {
  const { save, mutate, openLineup, openPlayer } = useF();
  const [q, setQ] = useState("");
  const [cid, setCid] = useState<string>(focus ?? save.userClub ?? Object.keys(save.clubs)[0]);
  const [creating, setCreating] = useState(false);
  const [renew, setRenew] = useState<string | null>(null);
  useEffect(() => { if (focus) setCid(focus); }, [focus]);
  const club = save.clubs[cid];
  const squad = squadOf(cid, save.players).sort((a, b) => POS_ORDER.indexOf(a.positions[0]) - POS_ORDER.indexOf(b.positions[0]) || b.ovr - a.ovr);
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const c of Object.values(save.clubs)) {
      const key = c.leagueId ? save.comps[c.leagueId]?.name ?? c.leagueId : `Otros · ${c.country}`;
      (g.get(key) ?? g.set(key, []).get(key)!).push(c.id);
    }
    return [...g.entries()];
  }, [save]);
  const filtered = q ? Object.values(save.clubs).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <select className="input" value={cid} onChange={(e) => setCid(e.target.value)}>
          {groups.map(([g, ids]) => <optgroup key={g} label={g}>{ids.map((id) => <option key={id} value={id}>{save.clubs[id].name}</option>)}</optgroup>)}
        </select>
        <input className="input !w-40" placeholder="Buscar club" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q && <div className="mt-1 flex flex-wrap gap-1">{filtered.slice(0, 12).map((c) => <button key={c.id} className="btn-ghost btn-sm" onClick={() => { setCid(c.id); setQ(""); }}>{c.name}</button>)}</div>}
      <div className="card mt-3 flex flex-wrap items-center gap-3">
        <Badge colors={club.colors} label={club.short} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold">{club.name}</div>
          <div className="text-xs text-gray-400">{club.leagueId ? save.comps[club.leagueId]?.name : club.country} · media top-16: {clubStrength(cid, save.players).toFixed(1)} · prestigio {prestigeStars(prestige(save, cid))}★ · valor de plantilla {fmtMoney(squadValue(save, cid))} · {squad.length} jugadores{save.moneyMode ? ` · presupuesto ${fmtMoney(club.budget)}` : ""}</div>
          {save.honours[cid]?.length ? <div className="mt-1 text-xs">🏆 {save.honours[cid].map((h) => `${h.comp} ${h.season}`).join(" · ")}</div> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <button className="btn-primary btn-sm" onClick={() => openLineup(cid)}>Alineación</button>
          <button className="btn-ghost btn-sm" onClick={() => setCreating(true)}>+ Crear jugador</button>
          <button className={cx("btn-sm btn", save.userClub === cid ? "bg-acento text-black" : "border border-borde")} onClick={() => mutate((s) => { s.userClub = s.userClub === cid ? null : cid; })}>{save.userClub === cid ? "★ Mi club" : "☆ Marcar como mi club"}</button>
          <label className="btn-ghost btn-sm cursor-pointer">Colores
            <input type="color" className="ml-1 h-4 w-6" value={club.colors[0]} onChange={(e) => mutate((s) => { s.clubs[cid].colors = [e.target.value, s.clubs[cid].colors[1]]; })} />
            <input type="color" className="h-4 w-6" value={club.colors[1]} onChange={(e) => mutate((s) => { s.clubs[cid].colors = [s.clubs[cid].colors[0], e.target.value]; })} />
          </label>
        </div>
      </div>
      <div className="scroll-x mt-3">
        <table className="w-full min-w-[560px]">
          <thead><tr><th className="th">Pos</th><th className="th">Jugador</th><th className="th">Edad</th><th className="th">Med</th><th className="th">Pot</th><th className="th">Físico</th><th className="th">Forma</th><th className="th">Estado</th><th className="th">Contrato</th>{save.moneyMode && <th className="th">Valor</th>}</tr></thead>
          <tbody>
            {squad.map((p) => {
              const st = playerStatus(save, p.id, save.date);
              return (
                <tr key={p.id} className="cursor-pointer border-t border-borde/60 hover:bg-white/5" onClick={() => openPlayer(p.id)}>
                  <td className="td text-xs">{p.positions.join("/")}</td>
                  <td className="td"><span className="font-medium">{p.name}</span>{p.youth && <span className="ml-1 text-[10px] text-emerald-300">cantera</span>}{p.loanFrom && <span className="ml-1 text-[10px] text-sky-300">cedido</span>}{p.custom && <span className="ml-1 text-[10px] text-yellow-300">editado</span>}</td>
                  <td className="td tabular">{p.age}</td>
                  <td className="td font-bold tabular">{p.ovr}</td>
                  <td className="td tabular text-gray-400">{p.pot}</td>
                  <td className="td tabular">{st.fitness}%</td>
                  <td className="td">{st.form > 0.5 ? "▲" : st.form < -0.5 ? "▼" : "—"}</td>
                  <td className="td text-xs">{st.injuredUntil ? `🚑 hasta ${st.injuredUntil}` : "✔"}</td>
                  <td className="td text-xs">
                    <span className={cx((p.contractEnd ?? 9999) <= save.seasonYear + 1 && "text-yellow-300")}>{p.contractEnd ?? "—"}</span>
                    {cid === save.userClub && (p.contractEnd ?? 9999) <= save.seasonYear + 2 && <button className="btn-ghost btn-sm ml-1 !px-1 !py-0" onClick={(e) => { e.stopPropagation(); setRenew(p.id); }}>Renovar</button>}
                  </td>
                  {save.moneyMode && <td className="td text-xs">{fmtMoney(p.value)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {creating && <PlayerEditor clubId={cid} onClose={() => setCreating(false)} />}
      {renew && <RenewModal pid={renew} onClose={() => setRenew(null)} />}
    </div>
  );
}

export function PlayerModal({ pid, onClose }: { pid: string; onClose: () => void }) {
  const { save, tick } = useF();
  const p = save.players[pid];
  const [edit, setEdit] = useState(false);
  const perComp = useMemo(() => Object.values(save.comps).map((c) => ({ c, s: playerStats(save, c.id).get(pid) })).filter((x) => x.s), [save, tick, pid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  const club = p.clubId ? save.clubs[p.clubId] : null;
  const st = playerStatus(save, pid, save.date);
  const idx = getIndex(save);
  const apps = idx.playerApps(pid).slice(-8).reverse();
  const bar = (label: string, v: number) => (
    <div className="text-xs"><div className="flex justify-between"><span className="text-gray-400">{label}</span><b>{v}</b></div><div className="h-1.5 rounded bg-fondo"><div className={cx("h-full rounded", v >= 80 ? "bg-green-500" : v >= 65 ? "bg-yellow-400" : "bg-red-500")} style={{ width: `${v}%` }} /></div></div>
  );
  if (edit) return <PlayerEditor player={p} clubId={p.clubId} onClose={() => setEdit(false)} />;
  return (
    <Modal title={p.name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold">{p.ovr}</div>
        <div className="text-sm">
          <div>{p.positions.join(" / ")} · {p.age} años · {p.nationality} · {p.foot}</div>
          <div className="text-gray-400">{club ? club.name : "Agente libre"}{p.loanFrom ? ` (cedido por ${save.clubs[p.loanFrom]?.name})` : ""} · potencial {p.pot}{save.moneyMode ? ` · ${fmtMoney(p.value)}` : ""}</div>
          <div className="text-xs text-gray-400">Físico {st.fitness}% · forma {st.form > 0 ? "+" : ""}{st.form}{st.injuredUntil ? ` · 🚑 lesionado hasta ${st.injuredUntil}` : ""}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {p.gk ? <>{bar("Estirada", p.gk.div)}{bar("Manos", p.gk.han)}{bar("Saque", p.gk.kic)}{bar("Reflejos", p.gk.ref)}{bar("Colocación", p.gk.pos)}{bar("Velocidad", p.pac)}</>
          : <>{bar("Ritmo (PAC)", p.pac)}{bar("Tiro (SHO)", p.sho)}{bar("Pase (PAS)", p.pas)}{bar("Regate (DRI)", p.dri)}{bar("Defensa (DEF)", p.def)}{bar("Físico (PHY)", p.phy)}</>}
        {bar("Penales", p.pen)}{bar("Tiros libres", p.fk)}{bar("Cabezazo", p.hea)}{bar("Córners/centros", p.crn)}
      </div>
      <h4 className="mt-3 text-sm font-semibold">Temporada por competición</h4>
      <table className="mt-1 w-full text-xs">
        <thead><tr><th className="th">Comp.</th><th className="th">PJ</th><th className="th">Min</th><th className="th">G</th><th className="th">A</th><th className="th">🟨</th><th className="th">🟥</th><th className="th">Val</th></tr></thead>
        <tbody>{perComp.map(({ c, s }) => <tr key={c.id} className="border-t border-borde/60"><td className="td">{c.short}</td><td className="td">{s!.apps}</td><td className="td">{s!.min}</td><td className="td">{s!.g}</td><td className="td">{s!.a}</td><td className="td">{s!.yc}</td><td className="td">{s!.rc}</td><td className="td">{s!.rating.toFixed(2)}</td></tr>)}</tbody>
      </table>
      {apps.length > 0 && <div className="mt-2 text-xs text-gray-400">Últimos partidos: {apps.map((a) => `${a.r.toFixed(1)} (${a.min}')`).join(" · ")}</div>}
      <button className="btn-ghost mt-3 w-full" onClick={() => setEdit(true)}>Editar medias y atributos</button>
    </Modal>
  );
}

const ALL_POS: Pos[] = ["POR", "DFC", "LD", "LI", "CAD", "CAI", "MCD", "MC", "MD", "MI", "MCO", "ED", "EI", "SD", "DC"];

export function PlayerEditor({ player, clubId, onClose }: { player?: Player; clubId: string | null; onClose: () => void }) {
  const { save, mutate } = useF();
  const [p, setP] = useState<Player>(() => player ? structuredClone(player) : {
    id: `u${Date.now().toString(36)}`, name: "Nuevo Jugador", shortName: "N. Jugador", clubId, positions: ["MC"], age: 20, nationality: "—", foot: "Diestro",
    ovr: 65, pot: 75, pac: 65, sho: 60, pas: 65, dri: 65, def: 55, phy: 62, pen: 55, fk: 50, hea: 55, crn: 55, custom: true, value: 1000000,
  });
  const num = (k: keyof Player, label: string) => (
    <Field label={label}><input type="number" min={1} max={99} className="input" value={p[k] as number} onChange={(e) => setP({ ...p, [k]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })} /></Field>
  );
  const isGk = p.positions[0] === "POR";
  return (
    <Modal title={player ? `Editar · ${player.name}` : "Crear jugador"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Nombre"><input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="Nombre corto"><input className="input" value={p.shortName} onChange={(e) => setP({ ...p, shortName: e.target.value })} /></Field>
        <Field label="Posiciones (la 1ª es la principal)">
          <select multiple className="input h-24" value={p.positions} onChange={(e) => { const v = [...e.target.selectedOptions].map((o) => o.value as Pos); if (v.length) setP({ ...p, positions: v, gk: v[0] === "POR" ? p.gk ?? { div: p.ovr, han: p.ovr, kic: p.ovr - 5, ref: p.ovr, pos: p.ovr } : p.gk }); }}>
            {ALL_POS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <div className="grid gap-2">
          {num("age", "Edad")}
          <Field label="Pie"><select className="input" value={p.foot} onChange={(e) => setP({ ...p, foot: e.target.value as Foot })}><option>Diestro</option><option>Zurdo</option></select></Field>
        </div>
        <Field label="Nacionalidad"><input className="input" value={p.nationality} onChange={(e) => setP({ ...p, nationality: e.target.value })} /></Field>
        {num("ovr", "Media (overall)")}{num("pot", "Potencial")}
        {num("pac", "PAC")}{num("sho", "SHO")}{num("pas", "PAS")}{num("dri", "DRI")}{num("def", "DEF")}{num("phy", "PHY")}
        {num("pen", "Penales")}{num("fk", "Tiros libres")}{num("hea", "Cabezazo")}{num("crn", "Córners")}
        {isGk && p.gk && (["div", "han", "kic", "ref", "pos"] as const).map((k) => (
          <Field key={k} label={{ div: "Estirada", han: "Manos", kic: "Saque", ref: "Reflejos", pos: "Colocación" }[k]}>
            <input type="number" className="input" value={p.gk![k]} onChange={(e) => setP({ ...p, gk: { ...p.gk!, [k]: Number(e.target.value) || 1 } })} />
          </Field>
        ))}
        {save.moneyMode && <Field label="Valor (€)"><input type="number" className="input" value={p.value ?? 0} onChange={(e) => setP({ ...p, value: Number(e.target.value) || 0 })} /></Field>}
      </div>
      <button className="btn-primary mt-4 w-full" onClick={() => { mutate((s) => { s.players[p.id] = { ...p, custom: true }; invalidateStrength(s.players); s.version++; }); onClose(); }}>Guardar</button>
    </Modal>
  );
}

function RenewModal({ pid, onClose }: { pid: string; onClose: () => void }) {
  const { save, mutate } = useF();
  const p = save.players[pid];
  const [years, setYears] = useState(p.age >= 31 ? 1 : 3);
  const [wage, setWage] = useState(Math.round(((p.wage ?? estimateWage(p.ovr, p.age)) * 1.15) / 500) * 500);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal title={`Renovar a ${p.name}`} onClose={onClose}>
      <p className="text-xs text-gray-400">Contrato actual hasta {p.contractEnd} · sueldo {fmtMoney(p.wage)}/semana (estimado).</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Años adicionales"><select className="input" value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y}</option>)}</select></Field>
        <Field label="Sueldo (€/semana)"><input type="number" step={500} className="input" value={wage} onChange={(e) => setWage(Number(e.target.value) || 0)} /></Field>
      </div>
      <button className="btn-primary mt-3 w-full" onClick={() => { let t = ""; mutate((s) => { t = renewContract(s, pid, years, wage); }); setMsg(t); }}>Ofrecer renovación</button>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </Modal>
  );
}
