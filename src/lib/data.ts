// Carga perezosa de los datos de /data (se separan en chunks para no inflar el bundle inicial).
import type { FootballData } from "@/engine/football/career";
import type { NflData } from "@/engine/nfl/season";
import type { DcData } from "@/engine/dc/tournaments";
import type { FootballConfig } from "@/engine/football/season";

export async function loadFootballData(): Promise<FootballData> {
  const [cfg, clubs, players, europe] = await Promise.all([
    import("@data/football/competitions.json"),
    import("@data/football/clubs.json"),
    import("@data/football/players.json"),
    import("@data/football/europe-participants.json"),
  ]);
  return { cfg: cfg.default as unknown as FootballConfig, clubs: clubs.default as unknown as FootballData["clubs"], players: players.default as unknown as FootballData["players"], europe: europe.default as unknown as Record<string, string[]> };
}
export async function loadFootballConfig(): Promise<FootballConfig> {
  return (await import("@data/football/competitions.json")).default as unknown as FootballConfig;
}
export async function loadNflData(): Promise<NflData> {
  const [cfg, players] = await Promise.all([import("@data/nfl/teams.json"), import("@data/nfl/players.json")]);
  return { cfg: cfg.default as unknown as NflData["cfg"], players: players.default as unknown as NflData["players"] };
}
export async function loadDcData(): Promise<DcData> {
  return (await import("@data/dc/characters.json")).default as unknown as DcData;
}
