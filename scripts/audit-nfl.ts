// Auditoría de rosters NFL: tamaño, posiciones mínimas y nómina, durante varias temporadas.
import { readFileSync } from "node:fs";
import { newNflSave, currentWeek, playNflWeek } from "../src/engine/nfl/season";
import { nflOffseason } from "../src/engine/nfl/offseason";
import { payroll, capRoom, freeAgents } from "../src/engine/nfl/market";
import type { NflSave } from "../src/engine/nfl/types";
const cfg = JSON.parse(readFileSync("data/nfl/teams.json", "utf8"));
const save = newNflSave({ cfg, players: JSON.parse(readFileSync(process.argv[2] ?? "public/data/nfl/players.json", "utf8")) }, 3);
const MIN: Record<string, number> = { QB: 2, RB: 3, WR: 5, TE: 3, OT: 4, OG: 4, C: 2, DE: 4, DT: 4, LB: 5, CB: 5, S: 4, K: 1, P: 1 };
function audit(s: NflSave, label: string) {
  const issues: string[] = [];
  for (const t of Object.keys(s.teams)) {
    const r = Object.values(s.players).filter((p) => p.teamId === t && !p.retired);
    const act = r.filter((p) => !p.practiceSquad);
    if (act.length < 50 || act.length > 53) issues.push(`${t}: ${act.length} activos`);
    for (const [pos, m] of Object.entries(MIN)) { const n = act.filter((p) => p.pos === pos).length; if (n < m) issues.push(`${t}: ${n} ${pos}`); }
    if (capRoom(s, t) < 0) issues.push(`${t}: sobre el tope (${Math.round(payroll(s, t) / 1e6)} M)`);
    if (r.some((p) => /Prospecto/.test(p.name))) issues.push(`${t}: nombres genéricos`);
  }
  console.log(`== ${label}: problemas ${issues.length} · libres ${freeAgents(s).length}`);
  console.log(issues.slice(0, 20).join(" | "));
}
audit(save, "Inicio");
for (let k = 0; k < 3; k++) { let w; while ((w = currentWeek(save)) !== null) playNflWeek(save, w); nflOffseason(save, cfg); audit(save, `Tras temporada ${k + 1}`); }
const kc = Object.values(save.players).filter((p) => p.teamId === "KC" && !p.practiceSquad).sort((a, b) => b.ovr - a.ovr).slice(0, 12);
console.log("KC:", kc.map((p) => `${p.pos} ${p.name} ${p.ovr}`).join(", "));
