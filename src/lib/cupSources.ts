// Fuentes de participantes para los torneos personalizados (carga los datos de /data y arma los equipos).
import { get, loadDcData, loadFootballData, loadNflData } from "./data";
import type { Club, Player } from "@/engine/football/types";
import type { NflPlayer, NflTeam } from "@/engine/nfl/types";
import { buildNations, type NationsFile, type NationsMetaFile } from "@/engine/cup/nations";
import { dcStrength, footballStrength } from "@/engine/cup/cup";
import { teamStrength } from "@/engine/nfl/season";
import { overall } from "@/engine/dc/battle";
import type { CupSport, CupTeam } from "@/engine/cup/types";
import type { NewCupOpts } from "@/engine/cup/cup";

export interface CupSource {
  sport: CupSport;
  teams: CupTeam[];
  filters: string[];
  filterLabel: string;
  dataSource: string;
  note?: string;
  worldCupGroups?: Record<string, string[]>;
  worldCupSource?: string;
  build: (ids: string[]) => Pick<NewCupOpts, "fb" | "nfl" | "dc">;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const initials = (s: string) => s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || s.slice(0, 3).toUpperCase();
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export async function loadCupSource(sport: CupSport, dc?: { mode: "personajes" | "equipos"; teamSize: number }): Promise<CupSource> {
  if (sport === "futbol") {
    const d = await loadFootballData();
    const players: Record<string, Player> = Object.fromEntries(d.players.players.map((p) => [p.id, p]));
    const league = (c: Club) => d.cfg.leagues.find((l) => l.id === c.leagueId)?.name ?? `Otros · ${c.country}`;
    const teams = d.clubs.clubs.map((c) => ({ id: c.id, name: c.name, short: c.short, colors: c.colors, strength: Math.round(footballStrength(c.id, players) * 10) / 10, sub: league(c) }));
    return {
      sport, teams, filters: uniq(teams.map((t) => t.sub)), filterLabel: "Liga", dataSource: d.players.meta.source,
      build: (ids) => {
        const set = new Set(ids);
        return { fb: { clubs: Object.fromEntries(d.clubs.clubs.filter((c) => set.has(c.id)).map((c) => [c.id, clone(c)])), players: Object.fromEntries(d.players.players.filter((p) => p.clubId && set.has(p.clubId)).map((p) => [p.id, clone(p)])) } };
      },
    };
  }
  if (sport === "selecciones") {
    const meta = await get<NationsMetaFile>("football/nations-meta.json");
    let file: NationsFile;
    try { file = await get<NationsFile>("football/nations.json"); } catch {
      // sin archivo generado: se arman con los jugadores de las ligas simuladas
      const d = await loadFootballData();
      const clubName = new Map(d.clubs.clubs.map((c) => [c.id, c.name]));
      const nations = buildNations(d.players.players, meta.nations, (p) => (p.clubId ? clubName.get(p.clubId) : undefined));
      file = { meta: { source: `Convocatorias ESTIMADAS a partir de ${d.players.meta.source} (solo ligas simuladas)`, updated: d.players.meta.updated, note: "" }, nations };
    }
    const all: Record<string, Player> = {};
    for (const n of file.nations) for (const p of n.players) all[p.id] = p;
    const teams = file.nations.map((n) => ({ id: n.id, name: n.name, short: n.code, colors: n.colors, strength: Math.round(footballStrength(n.id, all) * 10) / 10, sub: n.confed }));
    const have = new Set(teams.map((t) => t.id));
    const wc = meta.meta.worldCup2026;
    const groups = wc ? Object.fromEntries(Object.entries(wc.groups).map(([g, codes]) => [g, codes.map((c) => `n_${c}`)])) : undefined;
    const fillers = file.nations.filter((n) => n.real < n.players.length);
    return {
      sport, teams, filters: uniq(teams.map((t) => t.sub)), filterLabel: "Confederación", dataSource: file.meta.source,
      note: fillers.length ? `Selecciones con pocos jugadores en la base de EA, completadas con jugadores de RELLENO genéricos (no reales): ${fillers.map((n) => `${n.name} (${n.real} reales)`).join(", ")}.` : undefined,
      worldCupGroups: groups && Object.values(groups).flat().every((id) => have.has(id)) ? groups : undefined,
      worldCupSource: wc?.source,
      build: (ids) => {
        const set = new Set(ids);
        const clubs: Record<string, Club> = {};
        for (const n of file.nations) if (set.has(n.id)) clubs[n.id] = { id: n.id, name: n.name, short: n.code, country: n.code, leagueId: null, colors: n.colors };
        return { fb: { clubs, players: Object.fromEntries(Object.values(all).filter((p) => p.clubId && set.has(p.clubId)).map((p) => [p.id, clone(p)])) } };
      },
    };
  }
  if (sport === "nfl") {
    const d = await loadNflData();
    const players: Record<string, NflPlayer> = Object.fromEntries(d.players.players.map((p) => [p.id, p]));
    const tm: Record<string, NflTeam> = Object.fromEntries(d.cfg.teams.map((t) => [t.id, t]));
    const shim = { teams: tm, players } as never;
    const teams = d.cfg.teams.map((t) => ({ id: t.id, name: `${t.city} ${t.name}`, short: t.abbr, colors: t.colors, strength: Math.round(teamStrength(shim, t.id) * 10) / 10, sub: `${t.conf} ${t.div}` }));
    return {
      sport, teams, filters: uniq(teams.map((t) => t.sub)), filterLabel: "División", dataSource: d.players.meta.source,
      build: (ids) => {
        const set = new Set(ids);
        return { nfl: { teams: Object.fromEntries(d.cfg.teams.filter((t) => set.has(t.id)).map((t) => [t.id, clone(t)])), players: Object.fromEntries(d.players.players.filter((p) => p.teamId && set.has(p.teamId) && !p.retired).map((p) => [p.id, clone(p)])) } };
      },
    };
  }
  const d = await loadDcData();
  const chars = Object.fromEntries(d.characters.map((c) => [c.id, c]));
  const mode = dc?.mode ?? "personajes", size = dc?.teamSize ?? 3;
  const ALIGN = { heroe: "Héroes", villano: "Villanos", antiheroe: "Antihéroes" } as const;
  const members: Record<string, string[]> = mode === "personajes"
    ? Object.fromEntries(d.characters.map((c) => [c.id, [c.id]]))
    : Object.fromEntries(d.teams.map((t) => [t.id, t.members.filter((m) => chars[m]).sort((a, b) => overall(chars[b]) - overall(chars[a])).slice(0, size)]));
  const teams: CupTeam[] = mode === "personajes"
    ? d.characters.map((c) => ({ id: c.id, name: c.name, short: initials(c.name), colors: c.colors, strength: Math.round(overall(c) * 10) / 10, sub: ALIGN[c.alignment] }))
    : d.teams.map((t) => ({ id: t.id, name: t.name, short: initials(t.name), colors: t.colors, strength: Math.round(dcStrength(members[t.id], chars) * 10) / 10, sub: `${members[t.id].length} integrantes` }));
  return {
    sport, teams, filters: uniq(teams.map((t) => t.sub)), filterLabel: mode === "personajes" ? "Bando" : "Equipo", dataSource: `${d.scale} (escala propia de la app, no oficial)`,
    build: (ids) => ({ dc: { characters: clone(chars), synergies: clone(d.synergies), teamSize: mode === "personajes" ? 1 : size, members: Object.fromEntries(ids.map((id) => [id, members[id]])), randomness: 0.5 } }),
  };
}
