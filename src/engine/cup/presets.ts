import type { CupFormat, CupSport } from "./types";

export const BASE_FORMAT: CupFormat = { kind: "eliminatoria", koLegs: 1, thirdPlace: false, leagueLegs: 1, playoffTeams: 0, groups: 8, perGroup: 2, bestThirds: 0, swissMatches: 8, koSize: 16, seeding: "fuerza" };

export interface Preset { id: string; label: string; desc: string; teams: number; sizes?: number[]; format: Partial<CupFormat>; sports?: CupSport[] }

export const PRESETS: Preset[] = [
  { id: "champions", label: "Champions actual (liga suiza)", desc: "36 equipos y 8 rivales distintos cada uno en una sola tabla. Del 1.º al 8.º directo a octavos; del 9.º al 24.º playoff a ida y vuelta; eliminatorias a ida y vuelta y final a partido único.", teams: 36, format: { kind: "suizo", swissMatches: 8, koSize: 16, koLegs: 2 } },
  { id: "mundial2026", label: "Mundial 2026 (48 · grupos reales)", desc: "Las 48 selecciones y los 12 grupos reales del sorteo. Pasan los 2 primeros y los 8 mejores terceros a dieciseisavos; eliminatoria a partido único y tercer puesto.", teams: 48, format: { kind: "grupos", groups: 12, perGroup: 2, bestThirds: 8, leagueLegs: 1, koLegs: 1, thirdPlace: true }, sports: ["selecciones"] },
  { id: "mundial48", label: "Formato Mundial 48 (sorteo propio)", desc: "12 grupos de 4; pasan 2 por grupo + 8 mejores terceros; eliminatoria directa desde dieciseisavos.", teams: 48, format: { kind: "grupos", groups: 12, perGroup: 2, bestThirds: 8, leagueLegs: 1, koLegs: 1, thirdPlace: true } },
  { id: "mundial32", label: "Mundial clásico (32)", desc: "8 grupos de 4; pasan los 2 primeros a octavos; partido único y tercer puesto.", teams: 32, format: { kind: "grupos", groups: 8, perGroup: 2, bestThirds: 0, leagueLegs: 1, koLegs: 1, thirdPlace: true } },
  { id: "euro", label: "Eurocopa (24)", desc: "6 grupos de 4; pasan 2 por grupo + 4 mejores terceros a octavos.", teams: 24, format: { kind: "grupos", groups: 6, perGroup: 2, bestThirds: 4, leagueLegs: 1, koLegs: 1 } },
  { id: "champions-clasica", label: "Champions clásica (grupos)", desc: "8 grupos de 4 a ida y vuelta; pasan 2 por grupo; eliminatorias a ida y vuelta y final única.", teams: 32, format: { kind: "grupos", groups: 8, perGroup: 2, bestThirds: 0, leagueLegs: 2, koLegs: 2 } },
  { id: "copa16", label: "Copa con grupos (16)", desc: "4 grupos de 4; pasan 2 por grupo a cuartos.", teams: 16, format: { kind: "grupos", groups: 4, perGroup: 2, bestThirds: 0, leagueLegs: 1, koLegs: 1, thirdPlace: true } },
  { id: "eliminatoria", label: "Eliminatoria directa", desc: "Cuadro clásico por cabezas de serie (1 contra el último). Si no es potencia de 2, los mejores quedan exentos de la primera ronda.", teams: 16, sizes: [4, 8, 16, 32, 64, 128], format: { kind: "eliminatoria", koLegs: 1 } },
  { id: "liga-final", label: "Liga + fase final", desc: "Todos contra todos en una tabla y los primeros juegan una eliminatoria (por defecto Final Four).", teams: 16, sizes: [4, 6, 8, 10, 12, 16, 20], format: { kind: "liga", leagueLegs: 1, playoffTeams: 4, koLegs: 1 } },
  { id: "liga", label: "Liga (solo tabla)", desc: "Todos contra todos; campeón el líder.", teams: 20, sizes: [4, 6, 8, 10, 12, 16, 18, 20], format: { kind: "liga", leagueLegs: 2, playoffTeams: 0 } },
  { id: "custom", label: "Personalizado", desc: "Elige tú el formato, número de equipos, grupos, clasificados e ida y vuelta.", teams: 16, format: {} },
];

export const KIND_LABEL: Record<CupFormat["kind"], string> = { eliminatoria: "Eliminatoria directa", liga: "Liga (tabla)", grupos: "Grupos + eliminatoria", suizo: "Liga suiza + eliminatoria (Champions)" };

export function formatSummary(f: CupFormat, n: number): string {
  const ko = f.koLegs === 2 ? "eliminatorias a ida y vuelta (final única)" : "eliminatorias a partido único";
  if (f.kind === "eliminatoria") return `${n} equipos · ${ko}${f.thirdPlace ? " · 3.er puesto" : ""}`;
  if (f.kind === "liga") return `${n} equipos · liga a ${f.leagueLegs === 2 ? "doble" : "una"} vuelta${f.playoffTeams ? ` · los ${f.playoffTeams} primeros a la fase final (${ko})` : " · campeón el líder"}`;
  if (f.kind === "grupos") return `${n} equipos · ${f.groups} grupos a ${f.leagueLegs === 2 ? "doble" : "una"} vuelta · pasan ${f.perGroup} por grupo${f.bestThirds ? ` + ${f.bestThirds} mejores ${f.perGroup + 1}.º` : ""} · ${ko}${f.thirdPlace ? " · 3.er puesto" : ""}`;
  return `${n} equipos · ${f.swissMatches} partidos por equipo en una tabla · ${f.koSize / 2} directos + playoff del ${f.koSize / 2 + 1}.º al ${f.koSize / 2 + f.koSize}.º · ${ko}`;
}
