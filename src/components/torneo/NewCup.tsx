"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadCupSource, type CupSource } from "@/lib/cupSources";
import { createCup, shuffle, validateFormat } from "@/engine/cup/cup";
import { BASE_FORMAT, KIND_LABEL, PRESETS, formatSummary } from "@/engine/cup/presets";
import type { CupFormat, CupSave, CupSport } from "@/engine/cup/types";
import { Rng } from "@/lib/rng";
import { Badge, Field, cx } from "@/components/ui";

const SPORTS: { id: CupSport; label: string; icon: string }[] = [
  { id: "futbol", label: "Fútbol · clubes", icon: "⚽" },
  { id: "selecciones", label: "Selecciones", icon: "🌎" },
  { id: "nfl", label: "NFL", icon: "🏈" },
  { id: "dc", label: "DC Comics", icon: "⚡" },
];

const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));

export function NewCup({ onCreate, onError }: { onCreate: (save: CupSave, title: string) => void; onError: (e: string) => void }) {
  const [sport, setSport] = useState<CupSport>("futbol");
  const [dcMode, setDcMode] = useState<"personajes" | "equipos">("personajes");
  const [dcSize, setDcSize] = useState(3);
  const [src, setSrc] = useState<CupSource | null>(null);
  const [presetId, setPresetId] = useState("champions");
  const [format, setFormat] = useState<CupFormat>({ ...BASE_FORMAT, ...PRESETS[0].format, preset: "champions" });
  const [target, setTarget] = useState(36);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const presetRef = useRef(presetId);
  presetRef.current = presetId;

  const presets = PRESETS.filter((p) => !p.sports || p.sports.includes(sport));
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const best = (s: CupSource, n: number) => new Set([...s.teams].sort((a, b) => b.strength - a.strength).slice(0, n).map((t) => t.id));

  // carga de participantes al cambiar de deporte
  useEffect(() => {
    let alive = true;
    setSrc(null);
    loadCupSource(sport, { mode: dcMode, teamSize: dcSize }).then((s) => {
      if (!alive) return;
      setSrc(s);
      const want = sport === "selecciones" && presetRef.current === "champions" ? "mundial2026" : presetRef.current;
      const p = PRESETS.find((x) => x.id === want && (!x.sports || x.sports.includes(sport))) ?? PRESETS[0];
      applyPreset(p.id, s);
    }).catch((e) => onError(String(e)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, dcMode, dcSize]);

  function applyPreset(id: string, s = src) {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setFormat({ ...BASE_FORMAT, ...p.format, preset: id });
    if (!s) return;
    const n = Math.min(p.teams, s.teams.length);
    setTarget(n);
    if (id === "mundial2026" && s.worldCupGroups) setSel(new Set(Object.values(s.worldCupGroups).flat()));
    else setSel(best(s, n));
  }
  const setF = (x: Partial<CupFormat>) => setFormat((f) => ({ ...f, ...x }));

  const teams = useMemo(() => {
    if (!src) return [];
    const nq = q.trim().toLowerCase();
    return [...src.teams].sort((a, b) => b.strength - a.strength).filter((t) => (!filter || t.sub === filter) && (!nq || t.name.toLowerCase().includes(nq)));
  }, [src, filter, q]);

  const n = sel.size;
  const realWc = presetId === "mundial2026" && !!src?.worldCupGroups && Object.values(src.worldCupGroups).flat().every((id) => sel.has(id)) && n === 48;
  const err = src ? validateFormat(format, n) : null;

  function create() {
    if (!src || err) return;
    const ids = [...sel];
    const f: CupFormat = { ...format, preset: realWc ? "mundial2026" : format.preset === "mundial2026" ? "mundial48" : format.preset };
    const name = title.trim() || `${preset.label.replace(/ \(.*\)$/, "")} · ${SPORTS.find((s) => s.id === sport)!.label}`;
    const save = createCup({ sport, title: name, format: f, teams: src.teams.filter((t) => sel.has(t.id)), ...src.build(ids), dataSource: src.dataSource, groups: realWc ? src.worldCupGroups : undefined, note: sport === "selecciones" ? src.note : undefined });
    onCreate(save, name);
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400">1 · Deporte</h3>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SPORTS.map((s) => (
            <button key={s.id} onClick={() => setSport(s.id)} className={cx("rounded-lg border p-2 text-left text-sm", sport === s.id ? "border-acento bg-acento/10" : "border-borde")}>{s.icon} {s.label}</button>
          ))}
        </div>
        {sport === "dc" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <button className={cx("btn-sm btn", dcMode === "personajes" ? "bg-acento text-black" : "border border-borde")} onClick={() => setDcMode("personajes")}>Personajes 1 vs 1</button>
            <button className={cx("btn-sm btn", dcMode === "equipos" ? "bg-acento text-black" : "border border-borde")} onClick={() => setDcMode("equipos")}>Equipos</button>
            {dcMode === "equipos" && <label className="text-xs">Integrantes <select className="input !inline !w-16 !py-1" value={dcSize} onChange={(e) => setDcSize(Number(e.target.value))}>{[3, 5, 7].map((x) => <option key={x}>{x}</option>)}</select></label>}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase text-gray-400">2 · Formato</h3>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {presets.map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id)} className={cx("rounded-lg border p-2 text-left", presetId === p.id ? "border-acento bg-acento/10" : "border-borde")}>
              <div className="text-sm font-semibold">{p.label}</div>
              <div className="text-[11px] text-gray-400">{p.desc}</div>
            </button>
          ))}
        </div>
        <div className="card mt-2 space-y-2">
          <div className="text-xs text-gray-300">{formatSummary(format, n)}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Tipo"><select className="input" value={format.kind} onChange={(e) => setF({ kind: e.target.value as CupFormat["kind"] })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Número de equipos">
              <div className="flex gap-1">
                <input type="number" className="input" value={target} min={2} max={src?.teams.length ?? 128} onChange={(e) => setTarget(num(e.target.value, 2, src?.teams.length ?? 128))} />
                <button className="btn-ghost btn-sm" title="Seleccionar los mejores" onClick={() => src && setSel(best(src, target))}>✓</button>
              </div>
            </Field>
            {preset.sizes && <Field label="Tamaño rápido"><div className="flex flex-wrap gap-1">{preset.sizes.filter((s) => s <= (src?.teams.length ?? 0)).map((s) => <button key={s} className={cx("btn-sm btn", n === s ? "bg-acento text-black" : "border border-borde")} onClick={() => { setTarget(s); if (src) setSel(best(src, s)); }}>{s}</button>)}</div></Field>}
            {format.kind !== "liga" || format.playoffTeams ? (
              <Field label="Eliminatorias"><select className="input" value={format.koLegs} onChange={(e) => setF({ koLegs: Number(e.target.value) as 1 | 2 })}><option value={1}>Partido único</option><option value={2}>Ida y vuelta (final única)</option></select></Field>
            ) : null}
            {format.kind !== "suizo" && format.kind !== "liga" && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={format.thirdPlace} onChange={(e) => setF({ thirdPlace: e.target.checked })} />Partido por el 3.er puesto</label>}
            {(format.kind === "liga" || format.kind === "grupos") && <Field label="Vueltas"><select className="input" value={format.leagueLegs} onChange={(e) => setF({ leagueLegs: Number(e.target.value) as 1 | 2 })}><option value={1}>Una vuelta</option><option value={2}>Ida y vuelta</option></select></Field>}
            {format.kind === "liga" && <Field label="Pasan a la fase final (0 = gana el líder)"><input type="number" className="input" min={0} value={format.playoffTeams} onChange={(e) => setF({ playoffTeams: num(e.target.value, 0, 64) })} /></Field>}
            {format.kind === "liga" && !!format.playoffTeams && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={format.thirdPlace} onChange={(e) => setF({ thirdPlace: e.target.checked })} />3.er puesto</label>}
            {format.kind === "grupos" && <>
              <Field label="Grupos"><input type="number" className="input" min={1} value={format.groups} onChange={(e) => setF({ groups: num(e.target.value, 1, 26) })} /></Field>
              <Field label="Clasifican por grupo"><input type="number" className="input" min={1} value={format.perGroup} onChange={(e) => setF({ perGroup: num(e.target.value, 1, 8) })} /></Field>
              <Field label={`Mejores ${format.perGroup + 1}.º que pasan`}><input type="number" className="input" min={0} value={format.bestThirds} onChange={(e) => setF({ bestThirds: num(e.target.value, 0, 26) })} /></Field>
            </>}
            {format.kind === "suizo" && <>
              <Field label="Partidos por equipo"><input type="number" className="input" min={1} value={format.swissMatches} onChange={(e) => setF({ swissMatches: num(e.target.value, 1, 40) })} /></Field>
              <Field label="Cuadro final"><select className="input" value={format.koSize} onChange={(e) => setF({ koSize: Number(e.target.value) })}>{[4, 8, 16, 32].map((x) => <option key={x} value={x}>{x} ({x / 2} directos + playoff de {x})</option>)}</select></Field>
            </>}
            <Field label="Cabezas de serie / bombos"><select className="input" value={format.seeding} onChange={(e) => setF({ seeding: e.target.value as CupFormat["seeding"] })}><option value="fuerza">Por fuerza del equipo</option><option value="aleatorio">Sorteo puro</option></select></Field>
          </div>
          {presetId === "mundial2026" && <p className="text-[11px] text-gray-400">{realWc ? "✓ Grupos reales del sorteo del Mundial 2026." : "Si cambias las 48 selecciones, los grupos se sortean."} {src?.worldCupSource}</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-gray-400">3 · Participantes <span className={cx(n === target ? "text-acento" : "text-yellow-300")}>({n} de {target})</span></h3>
          <div className="flex gap-1">
            <button className="btn-ghost btn-sm" onClick={() => src && setSel(best(src, target))}>Mejores {target}</button>
            <button className="btn-ghost btn-sm" onClick={() => src && setSel(new Set(shuffle(src.teams.map((t) => t.id), new Rng()).slice(0, target)))}>Al azar</button>
            <button className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>Ninguno</button>
          </div>
        </div>
        {!src ? <div className="py-6 text-center text-sm text-gray-500">Cargando…</div> : (
          <>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">{src.filterLabel}: todas</option>{src.filters.map((f) => <option key={f}>{f}</option>)}</select>
            </div>
            {filter && <button className="btn-ghost btn-sm mt-1" onClick={() => setSel(new Set([...sel, ...teams.map((t) => t.id)]))}>Añadir todos los de {filter}</button>}
            <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-borde">
              {teams.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 border-b border-borde/50 px-2 py-1 text-sm last:border-0">
                  <input type="checkbox" checked={sel.has(t.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(t.id); else s.delete(t.id); setSel(s); }} />
                  <Badge colors={t.colors} label={t.short} size={22} />
                  <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-[11px] text-gray-500">{t.sub}</span></span>
                  <span className="text-xs tabular text-gray-400">{t.strength.toFixed(1)}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">Fuente: {src.dataSource}. La cifra es la fuerza del equipo (media de su once/plantilla).</p>
            {sport === "selecciones" && <p className="mt-1 text-[11px] text-yellow-300/80">Convocatorias ESTIMADAS: los 26 mejores por posición según EA FC 27, no las listas oficiales. {src.note}</p>}
          </>
        )}
      </section>

      <section>
        <Field label="Nombre del torneo"><input className="input" value={title} placeholder={preset.label} onChange={(e) => setTitle(e.target.value)} /></Field>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        <button className="btn-primary mt-3 w-full" disabled={!src || !!err} onClick={create}>Crear torneo ({n} equipos)</button>
      </section>
    </div>
  );
}
