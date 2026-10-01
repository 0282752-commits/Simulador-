"use client";
import { useMemo, useState } from "react";
import type { Player, TransferOffer } from "@/engine/football/types";
import { invalidateStrength } from "@/engine/football/season";
import { answerOffer, askingPrice, ensureContracts, estimateWage, prestige, prestigeStars, proposeTransfer, roleIn, squadValue, windowOpen } from "@/engine/football/market";
import { Badge, Field, Tabs, cx } from "@/components/ui";
import { fmtMoney, useF } from "./ctx";

type Kind = "traspaso" | "cesion" | "intercambio";
const STATUS: Record<TransferOffer["status"], string> = { pendiente: "Pendiente", aceptada: "✔ Aceptada", rechazada: "✘ Rechazada", contraoferta: "↔ Contraoferta", rechazada_jugador: "✘ El jugador dijo que no", cancelada: "Caducada" };

export function Market() {
  const { save, mutate, openPlayer } = useF();
  const [tab, setTab] = useState<"buscar" | "ofertas" | "noticias" | "editor">(save.offers?.some((o) => !o.byUser && o.status === "pendiente" && o.from === save.userClub) ? "ofertas" : "buscar");
  const [q, setQ] = useState("");
  const [pid, setPid] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<string>(save.userClub ?? "");
  const [kind, setKind] = useState<Kind>("traspaso");
  const [fee, setFee] = useState(0);
  const [wage, setWage] = useState(0);
  const [swap, setSwap] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [nego, setNego] = useState<{ fee?: number; wage?: number } | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const [maxAge, setMaxAge] = useState(40);
  const [minOvr, setMinOvr] = useState(70);
  const win = windowOpen(save.date);
  const results = useMemo(() => {
    const ql = q.toLowerCase();
    return Object.values(save.players).filter((p) => !p.retired && (onlyFree ? !p.clubId : true) && p.age <= maxAge && p.ovr >= minOvr && p.clubId !== buyer && (!ql || p.name.toLowerCase().includes(ql) || (p.clubId && save.clubs[p.clubId]?.name.toLowerCase().includes(ql)))).sort((a, b) => b.ovr - a.ovr).slice(0, 50);
  }, [save, q, onlyFree, maxAge, minOvr, buyer]);
  const p = pid ? save.players[pid] : null;
  const clubs = Object.values(save.clubs).sort((a, b) => a.name.localeCompare(b.name));
  const mySquad = buyer ? Object.values(save.players).filter((x) => x.clubId === buyer && !x.retired).sort((a, b) => b.ovr - a.ovr) : [];
  const incoming = (save.offers ?? []).filter((o) => !o.byUser && o.from === save.userClub);
  const mine = (save.offers ?? []).filter((o) => o.byUser).slice(0, 30);

  const select = (x: Player) => {
    ensureContracts(save);
    setPid(x.id); setMsg(null); setSwap("");
    setFee(x.clubId ? askingPrice(save, x) : 0);
    setWage(Math.round(((x.wage ?? estimateWage(x.ovr, x.age)) * 1.15) / 500) * 500);
    setKind("traspaso");
  };
  const send = (feeOverride?: number, wageOverride?: number) => {
    if (!p || !buyer) return setMsg("Elige el club que hace la oferta.");
    const f = feeOverride ?? fee, w = wageOverride ?? wage;
    if (feeOverride !== undefined) setFee(feeOverride);
    if (wageOverride !== undefined) setWage(wageOverride);
    let text = "";
    let n: { fee?: number; wage?: number } | null = null;
    mutate((s) => {
      const r = proposeTransfer(s, { player: p.id, from: p.clubId, to: buyer, fee: kind === "cesion" ? 0 : f, kind: kind === "cesion" ? "cesion" : "traspaso", swap: kind === "intercambio" ? swap || undefined : undefined, wage: w });
      text = r.status === "aceptada" ? `✔ ¡Fichado! ${r.result.reason}` : r.status === "contraoferta" ? `↔ El club contraoferta: ${r.note}` : `✘ ${r.note}`;
      if (r.status === "contraoferta" && r.counter) n = { fee: r.counter };
      if (r.status === "rechazada_jugador" && r.counterWage) n = { wage: r.counterWage };
    });
    setMsg(text);
    setNego(n);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className={cx("card text-xs", win ? "border-green-700/60" : "border-yellow-700/60")}>
        {win ? `Ventana de ${win} abierta${win === "verano" ? " hasta el 1 de septiembre" : " hasta el 2 de febrero"}.` : "Mercado cerrado: solo se pueden fichar agentes libres. Abre en enero y del 15 de junio al 1 de septiembre."}
        {" "}Los traspasos se negocian: primero acepta el club y luego el jugador. Valores, sueldos y contratos son estimaciones de la app.
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "buscar", label: "Buscar y ofertar" }, { id: "ofertas", label: `Ofertas${incoming.filter((o) => o.status === "pendiente").length ? ` (${incoming.filter((o) => o.status === "pendiente").length})` : ""}` }, { id: "noticias", label: "Noticias" }, { id: "editor", label: "Modo editor" }]} />

      {tab === "buscar" && (
        <>
          <Field label="Club que hace la oferta">
            <select className="input" value={buyer} onChange={(e) => { setBuyer(e.target.value); setPid(null); }}>
              <option value="">— Elegir —</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === save.userClub ? " ★" : ""}</option>)}
            </select>
          </Field>
          {buyer && <div className="text-xs text-gray-400">{save.clubs[buyer].name}: prestigio {"★".repeat(Math.floor(prestigeStars(prestige(save, buyer))))}{prestigeStars(prestige(save, buyer)) % 1 ? "½" : ""} · valor de plantilla {fmtMoney(squadValue(save, buyer))}{save.moneyMode && <> · presupuesto <b className="text-white">{fmtMoney(save.clubs[buyer].budget)}</b></>}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input className="input col-span-2" placeholder="Buscar jugador o club…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="text-xs">Media mín. <input type="number" className="input !py-1" value={minOvr} onChange={(e) => setMinOvr(Number(e.target.value) || 0)} /></label>
            <label className="text-xs">Edad máx. <input type="number" className="input !py-1" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value) || 40)} /></label>
          </div>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Solo agentes libres</label>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {results.map((x) => {
              const c = x.clubId ? save.clubs[x.clubId] : null;
              return (
                <div key={x.id} className={cx("flex items-center gap-2 rounded border px-2 py-1 text-sm", pid === x.id ? "border-acento" : "border-borde")}>
                  {c ? <Badge colors={c.colors} label={c.short} size={20} /> : <span className="w-5 text-center text-xs">🆓</span>}
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => openPlayer(x.id)}>{x.name} <span className="text-xs text-gray-400">{x.positions[0]} · {x.age} · {c?.name ?? "libre"}</span></button>
                  <span className="hidden text-xs text-gray-400 sm:inline">{fmtMoney(x.value)}</span>
                  <b className="tabular">{x.ovr}</b>
                  <button className="btn-ghost btn-sm" onClick={() => select(x)}>Ofertar</button>
                </div>
              );
            })}
          </div>
          {p && buyer && (
            <div className="card space-y-2">
              <div className="font-semibold">{p.name} <span className="text-xs text-gray-400">({p.clubId ? save.clubs[p.clubId].name : "agente libre"}) · {p.positions[0]} · {p.ovr} · {p.age} años</span></div>
              <div className="text-xs text-gray-400">Valor {fmtMoney(p.value)} · contrato hasta {p.contractEnd ?? "—"} · sueldo {fmtMoney(p.wage)}/sem{p.clubId ? ` · su club pide aprox. ${fmtMoney(askingPrice(save, p))} · ${["estrella", "titular", "rotación", "suplente"][roleIn(save, p)]} en su club · prestigio de su club ${prestigeStars(prestige(save, p.clubId))}★ vs ${prestigeStars(prestige(save, buyer))}★ del tuyo` : ""}</div>
              {p.clubId && <div className="flex flex-wrap gap-1">{(["traspaso", "cesion", "intercambio"] as Kind[]).map((k) => <button key={k} onClick={() => setKind(k)} className={cx("btn-sm btn", kind === k ? "bg-acento text-black" : "border border-borde")}>{{ traspaso: "Traspaso", cesion: "Pedir cesión", intercambio: "Intercambio + dinero" }[k]}</button>)}</div>}
              {kind !== "cesion" && p.clubId && <Field label={`Oferta al club (€)`}><input type="number" step={100000} className="input" value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} /></Field>}
              {kind === "intercambio" && (
                <Field label="Jugador que ofreces a cambio">
                  <select className="input" value={swap} onChange={(e) => setSwap(e.target.value)}><option value="">—</option>{mySquad.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.positions[0]} {x.ovr}, {fmtMoney(x.value)})</option>)}</select>
                </Field>
              )}
              <Field label="Sueldo que ofreces al jugador (€/semana)"><input type="number" step={500} className="input" value={wage} onChange={(e) => setWage(Number(e.target.value) || 0)} /></Field>
              <button className="btn-primary w-full" onClick={() => send()}>{p.clubId ? "Enviar oferta" : "Ofrecer contrato"}</button>
              {msg && (
                <div className="rounded-lg border border-borde p-2 text-sm">
                  {msg}
                  {nego?.fee && <div className="mt-2 flex gap-1"><button className="btn-primary btn-sm" onClick={() => send(nego.fee)}>Aceptar su precio ({fmtMoney(nego.fee)})</button><button className="btn-ghost btn-sm" onClick={() => send(Math.round((fee + nego.fee!) / 2 / 1e5) * 1e5)}>Ofrecer la mitad de la diferencia</button></div>}
                  {nego?.wage && <div className="mt-2 flex gap-1"><button className="btn-primary btn-sm" onClick={() => send(undefined, nego.wage)}>Subir sueldo a {fmtMoney(nego.wage)}/sem</button></div>}
                </div>
              )}
            </div>
          )}
          {msg && !(p && buyer) && <div className="card text-sm">{msg}</div>}
        </>
      )}

      {tab === "ofertas" && (
        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-sm font-semibold">Ofertas recibidas por mis jugadores</h4>
            {!save.userClub && <p className="text-xs text-gray-400">Marca “Mi club” en Equipos para recibir ofertas de otros clubes.</p>}
            {incoming.length === 0 && save.userClub && <p className="text-xs text-gray-400">Sin ofertas por ahora. Los clubes ofertan cuando el mercado está abierto.</p>}
            <div className="space-y-2">{incoming.slice(0, 30).map((o) => <IncomingOffer key={o.id} o={o} />)}</div>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Mis ofertas</h4>
            <div className="space-y-1 text-xs">
              {mine.map((o) => (
                <div key={o.id} className="rounded border border-borde p-2">
                  <b>{save.players[o.player]?.name}</b> · {o.from ? save.clubs[o.from]?.short : "libre"} → {save.clubs[o.to]?.short} · {o.kind === "cesion" ? "cesión" : fmtMoney(o.fee)} · <span className={o.status === "aceptada" ? "text-acento" : ""}>{STATUS[o.status]}</span>
                  {o.note && <div className="text-gray-400">{o.note}</div>}
                </div>
              ))}
              {!mine.length && <p className="text-gray-400">Todavía no has hecho ofertas.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "noticias" && (
        <div className="space-y-0.5 text-xs text-gray-300">
          {(save.news ?? []).slice(0, 120).map((n, i) => <div key={i}><span className="text-gray-500">{n.date}</span> · {n.text}</div>)}
          {!(save.news ?? []).length && <p className="text-gray-400">Aún no hay movimientos. La IA ficha cuando se abre el mercado.</p>}
        </div>
      )}

      {tab === "editor" && <EditorMode />}
    </div>
  );
}

function IncomingOffer({ o }: { o: TransferOffer }) {
  const { save, mutate } = useF();
  const [counter, setCounter] = useState(Math.round((o.fee * 1.2) / 1e5) * 1e5);
  const [msg, setMsg] = useState<string | null>(null);
  const p = save.players[o.player];
  const act = (a: "aceptar" | "rechazar" | "contraoferta") => { let t = ""; mutate((s) => { t = answerOffer(s, o.id, a, counter); }); setMsg(t); };
  return (
    <div className="rounded-lg border border-borde p-2 text-sm">
      <div><b>{save.clubs[o.to]?.name}</b> ofrece <b>{fmtMoney(o.fee)}</b> por <b>{p?.name}</b> <span className="text-xs text-gray-400">({p?.positions[0]} {p?.ovr}, valor {fmtMoney(p?.value)})</span></div>
      <div className="text-xs text-gray-400">{o.date} · vence {o.expires} · {STATUS[o.status]}{o.note ? ` · ${o.note}` : ""}</div>
      {o.status === "pendiente" && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <button className="btn-primary btn-sm" onClick={() => act("aceptar")}>Aceptar</button>
          <button className="btn-ghost btn-sm" onClick={() => act("rechazar")}>Rechazar</button>
          <input type="number" step={100000} className="input !w-32 !py-1 text-xs" value={counter} onChange={(e) => setCounter(Number(e.target.value) || 0)} />
          <button className="btn-ghost btn-sm" onClick={() => act("contraoferta")}>Contraoferta</button>
        </div>
      )}
      {msg && <div className="mt-1 text-xs">{msg}</div>}
    </div>
  );
}

// Modo editor: mover jugadores sin negociar (para corregir plantillas)
function EditorMode() {
  const { save, mutate } = useF();
  const [q, setQ] = useState("");
  const [pid, setPid] = useState("");
  const [to, setTo] = useState("");
  const list = q ? Object.values(save.players).filter((p) => !p.retired && p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20) : [];
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!save.freeMarket} onChange={(e) => mutate((s) => { s.freeMarket = e.target.checked; })} /> Desactivar el mercado de la IA y las ventanas (modo editor)</label>
      <p className="text-xs text-gray-400">Mueve un jugador a cualquier club al instante, sin negociación (útil para corregir plantillas con fichajes reales).</p>
      <input className="input" placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((p) => <button key={p.id} className={cx("block w-full rounded border px-2 py-1 text-left text-sm", pid === p.id ? "border-acento" : "border-borde")} onClick={() => setPid(p.id)}>{p.name} · {p.clubId ? save.clubs[p.clubId]?.name : "libre"}</button>)}
      <select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Agente libre</option>{Object.values(save.clubs).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <button className="btn-primary w-full" disabled={!pid} onClick={() => mutate((s) => { const p = s.players[pid]; s.transfers.unshift({ date: s.date, player: pid, from: p.clubId, to: to || null, type: to ? "fichaje" : "libre" }); p.clubId = to || null; p.loanFrom = null; for (const c of Object.values(s.clubs)) if (c.lineup) c.lineup.autoRotate = true; invalidateStrength(s.players); })}>Mover</button>
    </div>
  );
}
