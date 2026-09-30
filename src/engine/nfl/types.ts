// Tipos del modo NFL.
export type NflPos = "QB" | "RB" | "WR" | "TE" | "OT" | "OG" | "C" | "DE" | "DT" | "LB" | "CB" | "S" | "K" | "P" | "LS";

export interface NflPlayer {
  id: string;
  name: string;
  teamId: string | null;
  pos: NflPos;
  ovr: number;
  age: number;
  number: number;
  practiceSquad: boolean;
  spd: number; // velocidad
  str: number; // fuerza
  thp: number; // potencia de pase
  tha: number; // precisión de pase
  cth: number; // atrapadas
  car: number; // manejo de balón / carrera
  rbk: number; // bloqueo de carrera
  pbk: number; // bloqueo de pase
  tak: number; // tacleo
  prs: number; // presión / pass rush
  cov: number; // cobertura
  kpw: number; // potencia de pateo
  kac: number; // precisión de pateo
  injuryWeeks?: number;
  retired?: boolean;
  rookie?: boolean;
  college?: string;
}

export type DepthSlot = "QB" | "RB" | "WR" | "TE" | "OL" | "DL" | "LB" | "CB" | "S" | "K" | "P";
export const DEPTH_SLOTS: DepthSlot[] = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P"];
export const DEPTH_STARTERS: Record<DepthSlot, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };

export interface NflTeam {
  id: string;
  city: string;
  name: string;
  abbr: string;
  conf: "AFC" | "NFC";
  div: "Este" | "Norte" | "Sur" | "Oeste";
  colors: [string, string];
  depth?: Partial<Record<DepthSlot, string[]>>;
  autoDepth?: boolean;
}

export interface NflPlayLog {
  q: number;
  clock: number; // segundos restantes en el cuarto
  off: 0 | 1;
  down: number;
  togo: number;
  yardline: number; // yardas desde la propia end zone del equipo ofensivo (0-100)
  type: string;
  yards: number;
  text: string;
  score?: [number, number];
  scoring?: boolean;
}

export interface NflPlayerLine {
  side: 0 | 1;
  passAtt?: number; passCmp?: number; passYds?: number; passTD?: number; int?: number;
  rushAtt?: number; rushYds?: number; rushTD?: number;
  rec?: number; recYds?: number; recTD?: number; tgt?: number;
  tkl?: number; sacks?: number; defInt?: number; ff?: number;
  fgm?: number; fga?: number; xpm?: number; xpa?: number; punts?: number; puntYds?: number;
  fum?: number;
}

export interface NflTeamStats {
  yards: number; passYds: number; rushYds: number; plays: number; firstDowns: number; turnovers: number; sacks: number;
  penalties: number; penYds: number; top: number; thirdAtt: number; thirdConv: number;
}

export interface NflResult {
  hs: number; as: number;
  ot?: boolean;
  quarters: [number[], number[]];
  stats?: [NflTeamStats, NflTeamStats];
  players: Record<string, NflPlayerLine>;
  scoring: { q: number; clock: number; side: 0 | 1; text: string }[];
  manual?: boolean;
  injuries?: { player: string; weeks: number }[];
}

export interface NflGame {
  id: string;
  week: number; // 1-18 temporada regular, 19 WC, 20 DIV, 21 CONF, 22 SB
  date: string;
  home: string;
  away: string;
  neutral?: boolean;
  result?: NflResult;
  playoff?: boolean;
  label?: string;
}

export interface DraftPick { id: string; year: number; round: number; originalTeam: string; owner: string; used?: boolean; playerId?: string }

export interface NflSave {
  mode: "nfl";
  version: number;
  seasonYear: number;
  week: number; // semana actual
  teams: Record<string, NflTeam>;
  players: Record<string, NflPlayer>;
  games: NflGame[];
  picks: DraftPick[];
  history: { season: number; champion: string; runnerUp: string; mvp?: string; standings: { team: string; w: number; l: number; t: number }[] }[];
  transactions: { date: string; text: string }[];
  userTeam?: string | null;
  focusMode?: boolean;
  myHistory?: { season: number; team: string; lines: string[]; champion: boolean }[];
  dataSource: { source: string; updated: string; demo: boolean };
  seed: number;
}
