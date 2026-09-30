"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSave, exportJson, importJson, listSaves, loadSave, writeSave, type Mode, type SaveMeta } from "@/lib/db";
import { loadDcData, loadFootballData, loadNflData } from "@/lib/data";
import { newFootballSave } from "@/engine/football/career";
import { newNflSave } from "@/engine/nfl/season";
import { newDcSave } from "@/engine/dc/tournaments";
import { Modal, Progress, cx } from "@/components/ui";

const MODES: { id: Mode; name: string; desc: string; color: string; icon: string }[] = [
  { id: "futbol", name: "Fútbol", desc: "Ligas, copas y Europa en un calendario unificado. Motor minuto a minuto.", color: "from-green-600 to-emerald-900", icon: "⚽" },
  { id: "nfl", name: "NFL", desc: "Franquicia: 17 partidos, playoffs, Super Bowl y draft. Motor jugada por jugada.", color: "from-blue-700 to-indigo-950", icon: "🏈" },
  { id: "dc", name: "DC Comics", desc: "Batallas y torneos simultáneos con sinergias, debilidades y ranking histórico.", color: "from-red-700 to-zinc-900", icon: "⚡" },
];

export default function Home() {
  const router = useRouter();
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [creating, setCreating] = useState<Mode | null>(null);
  const [name, setName] = useState("");
  const [money, setMoney] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listSaves().then(setSaves).catch((e) => setErr(String(e)));
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!creating) return;
    setBusy("Creando partida y calendario…");
    try {
      await new Promise((r) => setTimeout(r, 30));
      const id = `p_${Date.now().toString(36)}`;
      const created = new Date().toISOString();
      const title = name.trim() || `${MODES.find((m) => m.id === creating)!.name} ${new Date().toLocaleDateString("es")}`;
      if (creating === "futbol") {
        const s = newFootballSave(await loadFootballData());
        s.moneyMode = money;
        if (money) for (const c of Object.values(s.clubs)) c.budget = Math.round(((c.reputation ?? 70) - 55) ** 2.4 * 40000);
        await writeSave({ id, name: title, mode: "futbol", created }, s);
      } else if (creating === "nfl") {
        await writeSave({ id, name: title, mode: "nfl", created }, newNflSave(await loadNflData()));
      } else {
        await writeSave({ id, name: title, mode: "dc", created }, newDcSave(await loadDcData()));
      }
      router.push(`/partida?id=${id}`);
    } catch (e) {
      setErr(String(e));
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <h1 className="text-2xl font-bold">Simulador Deportivo</h1>
      <p className="mt-1 text-sm text-gray-400">Gestiona, simula, mete resultados a mano y mira los partidos en vivo. Sin jugar: solo mánager.</p>

      <h2 className="mt-6 text-sm font-semibold uppercase text-gray-400">Nueva partida</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => { setCreating(m.id); setName(""); }} className={cx("rounded-2xl bg-gradient-to-br p-4 text-left shadow-lg transition active:scale-[.98]", m.color)}>
            <div className="text-3xl">{m.icon}</div>
            <div className="mt-2 text-lg font-bold">{m.name}</div>
            <div className="mt-1 text-xs text-white/80">{m.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-gray-400">Partidas guardadas</h2>
        <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Importar JSON</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { await importJson(f); refresh(); } catch (x) { setErr(String(x)); }
          e.target.value = "";
        }} />
      </div>
      <div className="mt-2 space-y-2">
        {saves === null && <div className="text-sm text-gray-500">Cargando…</div>}
        {saves?.length === 0 && <div className="card text-sm text-gray-400">Aún no tienes partidas. Crea una arriba.</div>}
        {saves?.map((s) => (
          <div key={s.id} className="card flex items-center gap-3">
            <div className="text-2xl">{MODES.find((m) => m.id === s.mode)?.icon}</div>
            <button className="min-w-0 flex-1 text-left" onClick={() => router.push(`/partida?id=${s.id}`)}>
              <div className="truncate font-medium">{s.name}</div>
              <div className="truncate text-xs text-gray-400">{s.summary} · guardada {new Date(s.updated).toLocaleString("es")}</div>
            </button>
            <button className="btn-ghost btn-sm" title="Exportar" onClick={async () => { const r = await loadSave(s.id); if (r) exportJson(r.meta, r.data); }}>⬇</button>
            <button className="btn-ghost btn-sm" title="Borrar" onClick={async () => { if (confirm(`¿Borrar "${s.name}"? No se puede deshacer.`)) { await deleteSave(s.id); refresh(); } }}>🗑</button>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-gray-500">
        Sin escudos, logos ni imágenes oficiales: colores e iniciales propios. Los datos de /data indican su fuente y fecha; los datos incluidos de fútbol y los jugadores NFL son de DEMOSTRACIÓN hasta que importes los CSV reales. Los stats del modo DC son una escala propia de la app.
      </p>

      {creating && (
        <Modal title={`Nueva partida · ${MODES.find((m) => m.id === creating)!.name}`} onClose={() => setCreating(null)}>
          <label className="block text-sm">Nombre
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi partida" />
          </label>
          {creating === "futbol" && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={money} onChange={(e) => setMoney(e.target.checked)} />
              Modo con presupuestos y valores de mercado (si no, mercado libre sin dinero)
            </label>
          )}
          <button className="btn-primary mt-4 w-full" onClick={create}>Crear</button>
        </Modal>
      )}
      {busy && <Progress text={busy} pct={0.5} />}
      {err && <Modal title="Error" onClose={() => setErr(null)}><p className="text-sm text-red-300">{err}</p></Modal>}
    </main>
  );
}
