// Torneos personalizados: cualquier deporte, formatos de grupos, liga, eliminatoria directa o liga suiza (Champions actual).
import type { Club, MatchResult, Player } from "../football/types";
import type { NflPlayer, NflResult, NflTeam } from "../nfl/types";
import type { BattleResult, DcCharacter, Synergy } from "../dc/types";

export type CupSport = "futbol" | "selecciones" | "nfl" | "dc";
export type CupKind = "eliminatoria" | "liga" | "grupos" | "suizo";

export interface CupFormat {
  kind: CupKind;
  koLegs: 1 | 2; // eliminatorias a ida y vuelta (la final siempre a partido único)
  thirdPlace: boolean; // partido por el tercer puesto
  leagueLegs: 1 | 2; // liga y grupos: una o dos vueltas
  playoffTeams: number; // liga: equipos que pasan a la fase final (0 = campeón el líder)
  groups: number; // grupos: número de grupos
  perGroup: number; // grupos: clasificados directos por grupo
  bestThirds: number; // grupos: mejores terceros que también pasan
  swissMatches: number; // suizo: partidos por equipo
  koSize: number; // suizo: tamaño del cuadro final (16 = 8 directos + playoff del 9 al 24)
  seeding: "fuerza" | "aleatorio";
  preset?: string;
}

export interface CupTeam { id: string; name: string; short: string; colors: [string, string]; strength: number; sub?: string }

export interface CupResult {
  hs: number; as: number; // goles / puntos / K.O. (DC)
  w: 0 | 1 | -1; // ganador del partido (en eliminatoria a partido único incluye penales)
  et?: boolean;
  pens?: [number, number];
  manual?: boolean;
  fb?: MatchResult;
  nfl?: NflResult;
  dc?: BattleResult;
}

export interface CupMatch {
  id: string;
  phase: "liga" | "grupos" | "suizo" | "playoff" | "ko";
  stage: string; // "Grupo A · J2", "Octavos de final", "Final"...
  round: number; // orden de juego
  home: string; away: string;
  leg?: 1 | 2;
  tie?: string;
  group?: string;
  neutral?: boolean;
  result?: CupResult;
}

export interface CupSave {
  mode: "torneo";
  version: number;
  sport: CupSport;
  title: string;
  format: CupFormat;
  seed: number;
  teams: Record<string, CupTeam>;
  participants: string[]; // orden de cabezas de serie
  groups?: Record<string, string[]>;
  matches: CupMatch[];
  fb?: { players: Record<string, Player>; clubs: Record<string, Club> };
  nfl?: { teams: Record<string, NflTeam>; players: Record<string, NflPlayer> };
  dc?: { characters: Record<string, DcCharacter>; synergies: Synergy[]; teamSize: number; members: Record<string, string[]>; randomness: number };
  champion?: string;
  runnerUp?: string;
  third?: string;
  dataSource: string;
  note?: string;
}
