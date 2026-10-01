// Auditoría de plantillas: tamaño, porteros, líneas, duplicados, nombres genéricos y fuerza por liga.
// Uso: bun scripts/audit-squads.ts [carpeta de datos] [temporadas a simular]
import { readFileSync } from "node:fs";
import { newFootballSave, startNewSeason } from "../src/engine/football/career";
import { nextMatchDate, playDay, clubStrength } from "../src/engine/football/season";
import type { FootballSave } from "../src/engine/football/types";
import { GROUP, GROUP_LIMITS, type Group } from "../src/engine/football/market";
const base = process.argv[2] ?? "public/data/football/";
const seasons = Number(process.argv[3] ?? 0);
const cfg = JSON.parse(readFileSync(base + "competitions.json", "utf8"));
const save = newFootballSave({ cfg, clubs: JSON.parse(readFileSync(base + "clubs.json", "utf8")), players: JSON.parse(readFileSync(base + "players.json", "utf8")) }, 11);
function audit(s: FootballSave, label: string) {
  const issues: string[] = [];
  const by = new Map<string, typeof s.players[string][]>();
  for (const p of Object.values(s.players)) if (p.clubId && !p.retired) (by.get(p.clubId) ?? by.set(p.clubId, []).get(p.clubId)!).push(p);
  let generic = 0, total = 0;
  const sizes: number[] = [];
  for (const c of Object.values(s.clubs)) {
    const sq = by.get(c.id) ?? [];
    total += sq.length;
    if (c.leagueId) sizes.push(sq.length);
    generic += sq.filter((p) => /Juvenil|Canterano|relleno/.test(p.name)).length;
    if (!c.leagueId) continue;
    if (sq.length < 22 || sq.length > 34) issues.push(`${c.name}: ${sq.length} jugadores`);
    for (const g of ["POR", "DEF", "MED", "ATA"] as Group[]) { const n = sq.filter((p) => GROUP[p.positions[0]] === g).length; if (n < GROUP_LIMITS[g][0] || n > GROUP_LIMITS[g][1] + 2) issues.push(`${c.name}: ${n} ${g}`); }
  }
  console.log(`\n== ${label} == jugadores en clubes: ${total} · genéricos: ${generic} · libres: ${Object.values(s.players).filter((p) => !p.clubId && !p.retired).length} · problemas: ${issues.length} · plantilla media (ligas): ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`);
  console.log(issues.slice(0, 25).join("\n"));
  for (const l of ["ENG1", "ESP1", "ITA1", "GER1", "FRA1"]) {
    const cl = Object.values(s.clubs).filter((c) => c.leagueId === l).map((c) => ({ n: c.name, v: clubStrength(c.id, s.players) })).sort((a, b) => b.v - a.v);
    console.log(`  ${l}: ${cl.slice(0, 4).map((x) => `${x.n} ${x.v.toFixed(1)}`).join(" | ")} … ${cl[cl.length - 1].n} ${cl[cl.length - 1].v.toFixed(1)}`);
  }
}
audit(save, "Inicio");
for (let k = 0; k < seasons; k++) {
  let d; while ((d = nextMatchDate(save))) playDay(save, d, cfg);
  startNewSeason(save, cfg);
  audit(save, `Tras temporada ${k + 1}`);
  const rm = Object.values(save.clubs).find((c) => c.name === "Real Madrid")!;
  console.log("  Real Madrid:", Object.values(save.players).filter((p) => p.clubId === rm.id).sort((a, b) => b.ovr - a.ovr).slice(0, 18).map((p) => `${p.shortName} ${p.ovr}`).join(", "));
}
