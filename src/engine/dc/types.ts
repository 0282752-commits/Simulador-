// Tipos del modo DC Comics. Los stats son una ESCALA PROPIA de la app (no oficiales).
export type SpecialType = "dano" | "aturdir" | "cura" | "escudo" | "potenciar" | "drenar";

export interface DcCharacter {
  id: string;
  name: string;
  str: number; // fuerza
  spd: number; // velocidad
  dur: number; // durabilidad
  cmb: number; // combate
  int: number; // inteligencia
  pow: number; // energía / poderes
  alignment: "heroe" | "villano" | "antiheroe";
  teams: string[];
  colors: [string, string];
  attackTags: string[];
  weaknesses: Record<string, number>;
  special: { name: string; type: SpecialType; power: number };
  abilities: string[];
  custom?: boolean;
}

export interface DcTeam { id: string; name: string; colors: [string, string]; members: string[]; custom?: boolean }
export interface Synergy { a: string; b: string; value: number; label: string }

export interface BattleEvent { round: number; text: string; type: "ataque" | "poder" | "especial" | "combo" | "critico" | "ko" | "defensa" | "fallo" | "remontada" | "info" | "cura" | "aturdido"; actor?: string; target?: string; dmg?: number; side?: number }

export interface FighterLine { id: string; side: number; dmg: number; taken: number; kos: number; hp: number; maxHp: number; ko: boolean }

export interface BattleResult {
  winner: number; // índice del bando ganador, -1 = empate
  rounds: number;
  fighters: FighterLine[];
  mvp?: string;
  koOrder: string[];
  log?: BattleEvent[];
  manual?: boolean;
}

export type TournamentFormat = "liga" | "eliminacion" | "grupos" | "royale" | "equipos";

export interface DcMatch {
  id: string;
  tournament: string;
  day: number;
  stage: string;
  stageIdx: number;
  sides: string[]; // ids de equipos (2, o N en battle royale)
  lineups?: string[][]; // integrantes congelados de cada bando
  group?: string;
  result?: BattleResult;
  duels?: { a: string; b: string; result?: BattleResult }[]; // torneo por equipos
}

export interface DcTournament {
  id: string;
  name: string;
  format: TournamentFormat;
  teamSize: number; // 1, 3, 5, 7
  participants: string[];
  startDay: number;
  gap: number; // días entre rondas
  groups?: Record<string, string[]>;
  done?: boolean;
  winner?: string;
  placements?: Record<string, number>; // equipo -> puesto
  randomness: number;
}

export interface DcSave {
  mode: "dc";
  version: number;
  day: number;
  characters: Record<string, DcCharacter>;
  teams: Record<string, DcTeam>;
  synergies: Synergy[];
  tournaments: DcTournament[];
  matches: DcMatch[];
  randomness: number;
  seed: number;
  dataSource: { source: string; updated: string; demo: boolean };
}
