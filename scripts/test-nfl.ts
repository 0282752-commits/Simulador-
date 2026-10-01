import { readFileSync } from "node:fs";
import { nflOffseason } from "../src/engine/nfl/offseason";
import { newNflSave, currentWeek, playNflWeek, nflChampion, divisionStandings, nflRows, conferenceSeeds } from "../src/engine/nfl/season";
const cfg = JSON.parse(readFileSync("data/nfl/teams.json", "utf8"));
const players = JSON.parse(readFileSync("data/nfl/players.json", "utf8"));
const save = newNflSave({ cfg, players }, 5);
const perTeam = new Map<string, number>();
for (const g of save.games) for (const t of [g.home, g.away]) perTeam.set(t, (perTeam.get(t) ?? 0) + 1);
console.log("Partidos:", save.games.length, "· por equipo:", [...new Set(perTeam.values())], "· semanas:", Math.max(...save.games.map((g) => g.week)));
const homes = new Map<string, number>(); for (const g of save.games) homes.set(g.home, (homes.get(g.home) ?? 0) + 1);
console.log("Partidos de local por equipo:", [...new Set(homes.values())].sort());
for (let s = 0; s < 2; s++) {
  let w: number | null; let n = 0;
  while ((w = currentWeek(save)) !== null && n++ < 30) playNflWeek(save, w);
  const rows = nflRows(save);
  const d = divisionStandings(save, rows);
  console.log(`Temporada ${save.seasonYear}: campeón ${save.teams[nflChampion(save)!].name}`);
  console.log("  AFC seeds:", conferenceSeeds(save, "AFC", rows).slice(0, 7).map((t) => `${t} ${rows.get(t)!.w}-${rows.get(t)!.l}`).join(", "));
  console.log("  NFC Norte:", d["NFC Norte"].map((t) => `${t} ${rows.get(t)!.w}-${rows.get(t)!.l}-${rows.get(t)!.t}`).join(", "));
  nflOffseason(save, cfg);
  console.log(`  Draft: ${save.draftLog?.length ?? 0} elecciones; movimientos registrados: ${save.transactions.length}`);
}
