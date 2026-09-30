"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSave } from "@/lib/useSave";
import { exportJson } from "@/lib/db";
import FootballGame from "@/components/futbol/FootballGame";
import NflGame from "@/components/nfl/NflGame";
import DcGame from "@/components/dc/DcGame";
import type { FootballSave } from "@/engine/football/types";
import type { NflSave } from "@/engine/nfl/types";
import type { DcSave } from "@/engine/dc/types";

function Inner() {
  const id = useSearchParams().get("id");
  const { state, error, tick, mutate, saving, flush } = useSave(id);
  if (error) return <div className="p-6 text-red-300">{error} <Link className="underline" href="/">Volver</Link></div>;
  if (!state) return <div className="p-6 text-gray-400">Cargando partida…</div>;
  const header = (
    <div className="flex items-center gap-2 border-b border-borde px-3 py-2 text-sm">
      <Link href="/" className="btn-ghost btn-sm" onClick={() => flush()}>←</Link>
      <div className="min-w-0 flex-1 truncate font-semibold">{state.meta.name}</div>
      <span className="text-xs text-gray-500">{saving ? "Guardando…" : "Guardado"}</span>
      <button className="btn-ghost btn-sm" onClick={async () => { await flush(); exportJson(state.meta, state.data); }}>Exportar</button>
    </div>
  );
  return (
    <div className="mx-auto max-w-6xl">
      {header}
      {state.data.mode === "futbol" && <FootballGame save={state.data as FootballSave} tick={tick} mutate={mutate as (fn: (s: FootballSave) => void) => void} />}
      {state.data.mode === "nfl" && <NflGame save={state.data as NflSave} tick={tick} mutate={mutate as (fn: (s: NflSave) => void) => void} />}
      {state.data.mode === "dc" && <DcGame save={state.data as DcSave} tick={tick} mutate={mutate as (fn: (s: DcSave) => void) => void} />}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-6 text-gray-400">Cargando…</div>}><Inner /></Suspense>;
}
