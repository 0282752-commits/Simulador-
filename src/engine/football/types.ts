// Tipos del modo Fútbol.
export type Pos =
  | "POR" | "DFC" | "LD" | "LI" | "CAD" | "CAI"
  | "MCD" | "MC" | "MD" | "MI" | "MCO"
  | "ED" | "EI" | "DC" | "SD";

export type Foot = "Diestro" | "Zurdo";

export interface GkAttrs {
  div: number; // estirada
  han: number; // manos
  kic: number; // saque
  ref: number; // reflejos
  pos: number; // colocación
}

export interface Player {
  id: string;
  name: string;
  shortName: string;
  clubId: string | null; // null = agente libre
  loanFrom?: string | null; // club dueño si está cedido
  positions: Pos[]; // la primera es la principal
  age: number;
  birthYear?: number;
  nationality: string;
  foot: Foot;
  ovr: number;
  pot: number;
  pac: number; sho: number; pas: number; dri: number; def: number; phy: number;
  gk?: GkAttrs;
  pen: number; // penales
  fk: number;  // tiros libres
  hea: number; // cabezazo
  crn: number; // córners/centros
  value?: number; // valor de mercado (EUR)
  wage?: number; // sueldo semanal estimado (EUR)
  contractEnd?: number; // año en que termina (junio)
  shirt?: number;
  retired?: boolean;
  custom?: boolean; // creado/editado por el usuario
  estimated?: boolean; // no está en la base de EA FC 27: medias estimadas
  youth?: boolean;
  clubName?: string; // selecciones: club donde juega
  filler?: boolean; // selecciones: relleno genérico (no es un jugador real)
}

export interface Tactics {
  mentality: "defensiva" | "equilibrada" | "ofensiva";
  pressing: "bajo" | "medio" | "alto";
  tempo: "lento" | "normal" | "rapido";
}

export interface Lineup {
  formation: string;
  starters: (string | null)[]; // ids por hueco de la formación (11)
  bench: string[]; // hasta 9-12
  captain?: string;
  penaltyTaker?: string;
  fkTaker?: string;
  cornerTaker?: string;
  tactics: Tactics;
  autoRotate: boolean; // la IA rota según cansancio
  customSlots?: { pos: Pos; x: number; y: number }[]; // posiciones personalizadas
}

export interface Club {
  id: string;
  name: string;
  short: string; // 3 letras
  country: string; // código de país (ENG, ESP...)
  leagueId: string | null; // liga doméstica simulada o null
  colors: [string, string];
  stadium?: string;
  budget?: number;
  lineup?: Lineup;
  reputation?: number;
}

export type CompType = "liga" | "copa" | "supercopa" | "europa" | "playoff";

export interface Fixture {
  id: string;
  comp: string;
  stage: string; // "J1", "Octavos", "Fase liga J3"...
  stageIdx: number;
  date: string;
  home: string;
  away: string;
  tieId?: string; // eliminatoria
  leg?: 1 | 2;
  neutral?: boolean;
  noExtraTime?: boolean; // directo a penales
  result?: MatchResult;
}

export type EvType =
  | "gol" | "gol_pp" | "penal_fallado" | "penal_atajado" | "tiro_atajado" | "tiro_fuera" | "tiro_bloqueado" | "palo"
  | "corner" | "falta" | "fuera_juego" | "amarilla" | "doble_amarilla" | "roja" | "var" | "lesion" | "cambio"
  | "inicio" | "descanso" | "final" | "prorroga" | "penales" | "tanda" | "info";

export interface MatchEvent {
  min: number;
  add?: number; // minuto añadido
  type: EvType;
  side: 0 | 1 | -1; // 0 local, 1 visitante
  player?: string;
  player2?: string; // asistente, jugador que sale, etc.
  detail?: string; // "cabeza", "tiro libre", "penal"...
  text?: string;
  xg?: number;
  scored?: boolean; // tanda
}

export interface SideStats {
  poss: number; shots: number; onT: number; xg: number; corners: number; fouls: number;
  offsides: number; yellows: number; reds: number; saves: number; passes: number;
}

export interface PlayerLine {
  min: number; g: number; a: number; r: number; yc: number; rc: number; sh: number; sv: number; cs?: boolean; side: 0 | 1; og?: number; inj?: number;
}

export interface MatchResult {
  hg: number; ag: number;
  et?: boolean;
  pens?: [number, number];
  events: MatchEvent[];
  stats?: [SideStats, SideStats];
  players: Record<string, PlayerLine>;
  manual?: boolean;
  seed?: number;
}

export interface Competition {
  id: string;
  name: string;
  short: string;
  type: CompType;
  country?: string;
  tier?: number;
  clubs: string[];
  // Liga
  tiebreakers?: string[];
  zones?: { from: number; to: number; label: string; color: string }[];
  relegation?: number;
  promotion?: number;
  // Copas
  twoLegRounds?: string[];
  noExtraTimeRounds?: string[];
  hostLowerTier?: boolean;
  roundDates?: string[];
  finalNeutral?: boolean;
  // Europa: estado de fase liga
  potsDrawn?: boolean;
  seeds?: string[]; // orden de clasificación de la fase liga
  done?: boolean;
  ko?: KoInfo;
  matchdays?: number; // fase liga europea
  estimated?: boolean; // participantes estimados (sin datos de la temporada anterior)
  playoffFor?: string; // liga a la que pertenece el playoff
  playoffKind?: "ascenso" | "descenso";
  winner?: string;
  runnerUp?: string;
  notes?: string;
}

export interface KoStage { name: string; dates: string[]; neutral?: boolean; noET?: boolean }
export interface KoInfo {
  stages: KoStage[];
  firstStageIdx: number; // índice (stageIdx) de la primera ronda eliminatoria
  entries?: Record<number, string[]>; // clubes que entran en rondas posteriores (índice relativo de ronda)
  bracket?: boolean; // cuadro fijo (ganadores se emparejan en orden)
  hostLower?: boolean; // juega en casa el de menor categoría
  seeds?: string[]; // orden de siembra (mejor primero)
  initialPairs?: [string, string][];
}

export interface TransferRecord {
  date: string; player: string; from: string | null; to: string | null; fee?: number; type: "fichaje" | "cesion" | "intercambio" | "libre" | "fin_cesion" | "retiro";
}

export interface TransferOffer {
  id: string;
  date: string;
  player: string;
  from: string | null; // club vendedor (null = agente libre)
  to: string; // club comprador
  fee: number;
  kind: "traspaso" | "cesion";
  swap?: string; // jugador que va a cambio
  wage?: number;
  status: "pendiente" | "aceptada" | "rechazada" | "contraoferta" | "rechazada_jugador" | "cancelada";
  counter?: number;
  byUser: boolean; // la hizo el usuario
  expires: string;
  note?: string;
}

export interface SeasonArchive {
  season: string;
  tables: Record<string, { club: string; pts: number; w: number; d: number; l: number; gf: number; ga: number }[]>;
  winners: Record<string, string>;
  topScorers: Record<string, { player: string; name: string; club: string; goals: number }[]>;
}

export interface FootballSave {
  mode: "futbol";
  version: number;
  seasonYear: number; // 2026 = temporada 2026/27
  date: string;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  comps: Record<string, Competition>;
  fixtures: Fixture[];
  transfers: TransferRecord[];
  history: SeasonArchive[];
  honours: Record<string, { comp: string; season: string }[]>; // por club
  moneyMode: boolean;
  freeMarket?: boolean; // modo editor: mover jugadores sin negociar
  offers?: TransferOffer[];
  news?: { date: string; text: string }[];
  userClub?: string | null;
  focusMode?: boolean; // modo "mi equipo"
  myHistory?: { season: string; club: string; lines: string[]; titles: string[] }[];
  dataSource: { source: string; updated: string; demo: boolean };
  seed: number;
}
