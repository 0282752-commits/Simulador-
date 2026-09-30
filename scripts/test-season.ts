// Prueba de humo: crea una partida con los datos de /data y simula la temporada completa y el paso a la siguiente.
import { readFileSync } from "node:fs";
import { newFootballSave, startNewSeason, playerStats } from "../src/engine/football/career";
import { nextMatchDate, playDay, leagueTable, seasonFinished } from "../src/engine/football/season";

const cfg = JSON.parse(readFileSync("data/football/competitions.json", "utf8"));
const clubs = JSON.parse(readFileSync("data/football/clubs.json", "utf8"));
const players = JSON.parse(readFileSync("data/football/players.json", "utf8"));
const europe = JSON.parse(readFileSync("data/football/europe-participants.json", "utf8"));
const save = newFootballSave({ cfg, clubs, players, europe }, 42);
console.log("Competiciones:", Object.keys(save.comps).join(", "), "· partidos iniciales:", save.fixtures.length);
for (let season = 0; season < 2; season++) {
  const t0 = Date.now();
  let d: string | null;
  let days = 0;
  while ((d = nextMatchDate(save))) { playDay(save, d, cfg); days++; if (days > 400) break; }
  console.log(`Temporada ${save.seasonYear}: ${days} días con partidos, ${save.fixtures.length} partidos, ${((Date.now() - t0) / 1000).toFixed(1)} s, terminada=${seasonFinished(save)}`);
  for (const c of Object.values(save.comps)) {
    const pend = save.fixtures.filter((f) => f.comp === c.id && !f.result).length;
    console.log(`  ${c.name.padEnd(34)} campeón: ${c.winner ? save.clubs[c.winner].name : "-"}${pend ? " PENDIENTES " + pend : ""}${c.done ? "" : " (no terminada)"}`);
  }
  const t = leagueTable(save, "ENG1");
  console.log("  PL top3:", t.slice(0, 3).map((r) => `${save.clubs[r.club].name} ${r.pts}`).join(" | "), "· último:", save.clubs[t[t.length - 1].club].name, t[t.length - 1].pts);
  const top = [...playerStats(save, "ENG1").values()].sort((a, b) => b.g - a.g)[0];
  console.log("  Pichichi PL:", save.players[top.pid].name, top.g);
  const rep = startNewSeason(save, cfg);
  console.log(`  -> Ascensos: ${rep.promoted.map((c) => save.clubs[c].short).join(",")} · Descensos: ${rep.relegated.map((c) => save.clubs[c].short).join(",")} · Retiros: ${rep.retired.length} · Juveniles: ${rep.youth}`);
}
