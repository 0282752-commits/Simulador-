// Carga de los datos de /data (copiados a /public/data en dev/build por scripts/copy-data.mjs).
import type { FootballData } from "@/engine/football/career";
import type { NflData } from "@/engine/nfl/season";
import type { DcData } from "@/engine/dc/tournaments";
import type { FootballConfig } from "@/engine/football/season";

async function get<T>(path: string): Promise<T> {
  const base = (globalThis as { __DATA_BASE?: string }).__DATA_BASE ?? "/data/";
  const r = await fetch(`${base}${path}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`No se pudo cargar /data/${path} (${r.status})`);
  return r.json() as Promise<T>;
}

export async function loadFootballData(): Promise<FootballData> {
  const [cfg, clubs, players, europe] = await Promise.all([
    get<FootballConfig>("football/competitions.json"),
    get<FootballData["clubs"]>("football/clubs.json"),
    get<FootballData["players"]>("football/players.json"),
    get<Record<string, string[]>>("football/europe-participants.json"),
  ]);
  return { cfg, clubs, players, europe };
}
export const loadFootballConfig = () => get<FootballConfig>("football/competitions.json");
export async function loadNflData(): Promise<NflData> {
  const [cfg, players] = await Promise.all([get<NflData["cfg"]>("nfl/teams.json"), get<NflData["players"]>("nfl/players.json")]);
  return { cfg, players };
}
export const loadDcData = () => get<DcData>("dc/characters.json");
