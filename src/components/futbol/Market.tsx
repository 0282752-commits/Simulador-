"use client";
import { useMemo, useState } from "react";
import type { Player, TransferRecord } from "@/engine/football/types";
import { invalidateStrength } from "@/engine/football/season";
import { Badge, Field, cx } from "@/components/ui";
import { fmtMoney, useF } from "./ctx";

type Kind = "fichaje" | "cesion" | "intercambio" | "liberar";

export function Market() {
  const { save, mutate, openPlayer } = useF();
  const [q, setQ] = useState("");
  const [pid, setPid] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("fichaje");
  const [to, setTo] = useState<string>(save.userClub ?? "");
  const [swap, setSwap] = useState("");
  const [fee, setFee] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const results = useMemo(() => {
    const ql = q.toLowerCase();
    return Object.values(save.players).filter((p) => !p.retired && (onlyFree ? !p.clubId : true) && (!ql || p.name.toLowerCase().includes(ql))).sort((a, b) => b.ovr - a.ovr).slice(0, 40);
  }, [save, q, onlyFree]);
  const p = pid ? save.players[pid] : null;
  const clubs = Object.values(save.clubs).sort((a, b) => a.name.localeCompare(b.name));
  const toSquad = to ? Object.values(save.players).filter((x) => x.clubId === to && !x.retired) : [];

  function execute() {
    if (!p) return;
    const from = p.clubId;
    if (kind !== "liberar" && (!to || to === from)) return setMsg("Elige un club de destino distinto.");
    if (save.moneyMode && kind === "fichaje" && from && (save.clubs[to].budget ?? 0) < fee) return setMsg("El club de destino no tiene presupuesto suficiente.");
    mutate((s) => {
      const pl = s.players[p.id];
      const rec = (r: Omit<TransferRecord, "date">) => s.transfers.unshift({ date: s.date, ...r });
      if (kind === "liberar") { pl.clubId = null; pl.loanFrom = null; rec({ player: pl.id, from, to: null, type: "libre" }); }
      if (kind === "fichaje") {
        pl.clubId = to; pl.loanFrom = null;
        if (s.moneyMode && from) { s.clubs[to].budget = (s.clubs[to].budget ?? 0) - fee; s.clubs[from].budget = (s.clubs[from].budget ?? 0) + fee; }
        rec({ player: pl.id, from, to, fee: s.moneyMode ? fee : undefined, type: from ? "fichaje" : "libre" });
      }
      if (kind === "cesion") { pl.loanFrom = pl.loanFrom ?? from; pl.clubId = to; rec({ player: pl.id, from, to, type: "cesion" }); }
      if (kind === "intercambio" && swap) {
        const other = s.players[swap];
        other.clubId = from; pl.clubId = to;
        rec({ player: pl.id, from, to, type: "intercambio" });
        rec({ player: other.id, from: to, to: from, type: "intercambio" });
      }
      // quitar de alineaciones guardadas
      for (const c of [from, to]) if (c && s.clubs[c]?.lineup) { const l = s.clubs[c].lineup!; l.starters = l.starters.map((x) => (x && s.players[x].clubId === c ? x : null)); l.bench = l.bench.filter((x) => s.players[x].clubId === c); l.autoRotate = true; }
      invalidateStrength(s.players);
      s.version++;
    });
    setMsg(`Operación realizada: ${p.name}.`);
    setPid(null); setSwap("");
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="card text-xs text-gray-400">Mercado {save.moneyMode ? "con presupuestos: los fichajes descuentan el precio al comprador y lo suman al vendedor." : "libre (sin dinero)."} Puedes mover jugadores entre cualquier club.</div>
      <div className="flex gap-2">
        <input className="input" placeholder="Buscar jugador…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Solo libres</label>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {results.map((x: Player) => {
          const c = x.clubId ? save.clubs[x.clubId] : null;
          return (
            <div key={x.id} className={cx("flex items-center gap-2 rounded border px-2 py-1 text-sm", pid === x.id ? "border-acento" : "border-borde")}>
              {c ? <Badge colors={c.colors} label={c.short} size={20} /> : <span className="w-5 text-center text-xs">🆓</span>}
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => openPlayer(x.id)}>{x.name} <span className="text-xs text-gray-400">{x.positions[0]} · {x.age} · {c?.name ?? "libre"}</span></button>
              <b className="tabular">{x.ovr}</b>
              <button className="btn-ghost btn-sm" onClick={() => { setPid(x.id); setFee(x.value ?? 0); setMsg(null); }}>Operar</button>
            </div>
          );
        })}
      </div>
      {p && (
        <div className="card space-y-2">
          <div className="font-semibold">{p.name} <span className="text-xs text-gray-400">({p.clubId ? save.clubs[p.clubId].name : "agente libre"})</span></div>
          <div className="flex flex-wrap gap-1">{(["fichaje", "cesion", "intercambio", "liberar"] as Kind[]).map((k) => <button key={k} onClick={() => setKind(k)} className={cx("btn-sm btn", kind === k ? "bg-acento text-black" : "border border-borde")}>{{ fichaje: "Comprar/fichar", cesion: "Ceder", intercambio: "Intercambiar", liberar: "Liberar" }[k]}</button>)}</div>
          {kind !== "liberar" && (
            <Field label="Club de destino">
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
          )}
          {kind === "intercambio" && to && (
            <Field label="Jugador que va a cambio">
              <select className="input" value={swap} onChange={(e) => setSwap(e.target.value)}><option value="">—</option>{toSquad.sort((a, b) => b.ovr - a.ovr).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.positions[0]} {x.ovr})</option>)}</select>
            </Field>
          )}
          {kind === "fichaje" && save.moneyMode && p.clubId && (
            <Field label={`Precio (valor ${fmtMoney(p.value)}; presupuesto destino ${to ? fmtMoney(save.clubs[to].budget) : "—"})`}>
              <input type="number" className="input" value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} />
            </Field>
          )}
          <button className="btn-primary w-full" onClick={execute}>Confirmar</button>
        </div>
      )}
      {msg && <div className="text-sm text-acento">{msg}</div>}
      <div>
        <h4 className="text-sm font-semibold">Movimientos recientes</h4>
        <div className="mt-1 space-y-0.5 text-xs text-gray-300">
          {save.transfers.slice(0, 40).map((t, i) => <div key={i}>{t.date} · {save.players[t.player]?.name ?? "?"}: {t.from ? save.clubs[t.from]?.short : "libre"} → {t.to ? save.clubs[t.to]?.short : t.type === "retiro" ? "retiro" : "libre"} ({t.type}{t.fee ? `, ${fmtMoney(t.fee)}` : ""})</div>)}
          {!save.transfers.length && <div className="text-gray-500">Todavía no hay movimientos.</div>}
        </div>
      </div>
    </div>
  );
}
