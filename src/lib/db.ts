// Partidas guardadas en IndexedDB (varias partidas, autoguardado, exportar/importar JSON).
import type { FootballSave } from "@/engine/football/types";
import type { NflSave } from "@/engine/nfl/types";
import type { DcSave } from "@/engine/dc/types";
import type { CupSave } from "@/engine/cup/types";

export type AnySave = FootballSave | NflSave | DcSave | CupSave;
export type Mode = AnySave["mode"];
export interface SaveMeta { id: string; name: string; mode: Mode; created: string; updated: string; summary: string }

const DB = "simulador-deportivo";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      if (!db.objectStoreNames.contains("saves")) db.createObjectStore("saves");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const r = fn(t);
    t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await tx<SaveMeta[]>(["meta"], "readonly", (t) => t.objectStore("meta").getAll())) ?? [];
  return all.sort((a, b) => b.updated.localeCompare(a.updated));
}

export async function loadSave(id: string): Promise<{ meta: SaveMeta; data: AnySave } | null> {
  const meta = await tx<SaveMeta>(["meta"], "readonly", (t) => t.objectStore("meta").get(id));
  const data = await tx<AnySave>(["saves"], "readonly", (t) => t.objectStore("saves").get(id));
  return meta && data ? { meta, data } : null;
}

export function summarize(s: AnySave): string {
  if (s.mode === "futbol") return `Temporada ${s.seasonYear}/${String((s.seasonYear + 1) % 100).padStart(2, "0")} · ${s.date}`;
  if (s.mode === "nfl") return `Temporada ${s.seasonYear} · semana ${Math.min(s.week, 22)}`;
  if (s.mode === "torneo") { const done = s.matches.filter((m) => m.result).length; return `${s.participants.length} equipos · ${s.champion ? `Campeón: ${s.teams[s.champion]?.name}` : `${done}/${s.matches.length} partidos`}`; }
  return `Día ${s.day} · ${s.tournaments.length} torneos`;
}

export async function writeSave(meta: Omit<SaveMeta, "updated" | "summary">, data: AnySave): Promise<SaveMeta> {
  const full: SaveMeta = { ...meta, updated: new Date().toISOString(), summary: summarize(data) };
  await tx(["meta", "saves"], "readwrite", (t) => { t.objectStore("meta").put(full); t.objectStore("saves").put(data, meta.id); });
  return full;
}

export async function deleteSave(id: string) {
  await tx(["meta", "saves"], "readwrite", (t) => { t.objectStore("meta").delete(id); t.objectStore("saves").delete(id); });
}

export function exportJson(meta: SaveMeta, data: AnySave) {
  const blob = new Blob([JSON.stringify({ app: "simulador-deportivo", format: 1, meta, data })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${meta.name.replace(/[^\w\-áéíóúñ ]/gi, "_")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importJson(file: File): Promise<SaveMeta> {
  const txt = await file.text();
  const obj = JSON.parse(txt);
  if (obj?.app !== "simulador-deportivo" || !obj.data?.mode) throw new Error("El archivo no es una partida válida de esta app.");
  const id = `p_${Date.now().toString(36)}`;
  return writeSave({ id, name: `${obj.meta?.name ?? "Partida"} (importada)`, mode: obj.data.mode, created: new Date().toISOString() }, obj.data);
}
