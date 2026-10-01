// Importador de rosters NFL desde CSV (exportación de ratings de Madden NFL).
// Uso: npm run datos:nfl -- ruta/al/archivo.csv [--fuente "Madden NFL 27, AAAA-MM-DD"]
import { writeFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { execSync } from "node:child_process";
import { readCsv, pick, num, arg, norm } from "./csv";
import type { NflPlayer, NflPos } from "../src/engine/nfl/types";

const file = process.argv[2];
if (!file || file.startsWith("--")) { console.error("Uso: npm run datos:nfl -- archivo.csv [--fuente \"...\"]"); process.exit(1); }
const teams = JSON.parse(readFileSync("data/nfl/teams.json", "utf8")).teams as { id: string; city: string; name: string; abbr: string }[];
const rows = readCsv(file);
const POS: Record<string, NflPos> = { QB: "QB", HB: "RB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", LT: "OT", RT: "OT", OT: "OT", T: "OT", LG: "OG", RG: "OG", OG: "OG", G: "OG", C: "C",
  LE: "DE", RE: "DE", DE: "DE", LEDGE: "DE", REDGE: "DE", LEDG: "DE", REDG: "DE", EDGE: "DE", DT: "DT", NT: "DT", DL: "DT", LOLB: "LB", ROLB: "LB", MLB: "LB", OLB: "LB", ILB: "LB", LB: "LB", SAM: "LB", WILL: "LB", MIKE: "LB",
  CB: "CB", FS: "S", SS: "S", S: "S", K: "K", P: "P", LS: "LS" };
const teamOf = (s: string) => {
  const n = norm(s);
  return teams.find((t) => norm(t.abbr) === n || norm(t.name) === n || norm(`${t.city} ${t.name}`) === n || n.endsWith(norm(t.name)))?.id ?? null;
};
const players: NflPlayer[] = [];
const unknown = new Set<string>();
let i = 0;
for (const r of rows) {
  const teamRaw = pick(r, ["team_name", "team", "teamName", "Team", "equipo", "Team Name"]) ?? "";
  const teamId = teamOf(teamRaw);
  if (!teamId) { if (teamRaw) unknown.add(teamRaw); continue; }
  const posRaw = (pick(r, ["position", "pos", "Position", "posicion"]) ?? "").toUpperCase();
  const pos = POS[posRaw];
  if (!pos) { unknown.add(`posición ${posRaw}`); continue; }
  const first = pick(r, ["firstName", "first_name", "First Name"]);
  const last = pick(r, ["lastName", "last_name", "Last Name"]);
  const name = pick(r, ["fullNameForSearch", "full_name", "Full Name", "name", "player", "Player"]) ?? `${first ?? ""} ${last ?? ""}`.trim();
  const ovr = num(r, ["overall_rating", "overallRating", "overall", "ovr", "OVR", "Overall Rating"], 60);
  const avg = (...xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  players.push({
    id: `n${++i}`, name, teamId, pos, ovr, age: num(r, ["age", "Age"], 25), number: num(r, ["jerseyNum", "jersey_num", "jersey_number", "number", "Jersey Number"], 0), practiceSquad: false,
    spd: num(r, ["speed_rating", "speed", "spd", "Speed"], 60), str: num(r, ["strength_rating", "strength", "str", "Strength"], 60),
    thp: num(r, ["throwPower_rating", "throw_power", "thp", "Throw Power"], 40),
    tha: pick(r, ["throwAccuracy_rating", "throw_accuracy", "Throw Accuracy"]) ? num(r, ["throwAccuracy_rating", "throw_accuracy", "Throw Accuracy"], 40) : avg(num(r, ["throwAccuracyShort_rating", "throw_acc_short_rating", "Short Throw Accuracy", "throw_accuracy_short"], 40), num(r, ["throwAccuracyMid_rating", "throw_acc_mid_rating", "Medium Throw Accuracy", "throw_accuracy_mid"], 40), num(r, ["throwAccuracyDeep_rating", "throw_acc_deep_rating", "Deep Throw Accuracy", "throw_accuracy_deep"], 40)),
    cth: num(r, ["catching_rating", "catch_rating", "catching", "cth", "Catching"], 40), car: num(r, ["carrying_rating", "carry_rating", "carrying", "Carrying", "bCVision_rating", "bcv_rating", "Ball Carrier Vision"], 40),
    rbk: num(r, ["runBlock_rating", "run_block", "Run Block"], 40), pbk: num(r, ["passBlock_rating", "pass_block", "Pass Block"], 40),
    tak: num(r, ["tackle_rating", "tackle", "Tackle"], 40),
    prs: Math.max(num(r, ["powerMoves_rating", "power_moves", "Power Moves"], 30), num(r, ["finesseMoves_rating", "finesse_moves", "Finesse Moves"], 30), num(r, ["pass_rush", "Pass Rush"], 30)),
    cov: avg(num(r, ["manCoverage_rating", "man_cover_rating", "man_coverage", "Man Coverage"], 35), num(r, ["zoneCoverage_rating", "zone_cover_rating", "zone_coverage", "Zone Coverage"], 35)),
    kpw: num(r, ["kickPower_rating", "kick_power", "Kick Power"], 30), kac: num(r, ["kickAccuracy_rating", "kick_acc_rating", "kick_accuracy", "Kick Accuracy"], 30),
    college: pick(r, ["college", "College"]),
  });
}
// 53 activos + practice squad por equipo (por overall si el CSV no trae el estado)
for (const t of teams) {
  const r = players.filter((p) => p.teamId === t.id).sort((a, b) => b.ovr - a.ovr);
  r.forEach((p, k) => (p.practiceSquad = k >= 53));
  console.log(`  ${t.abbr.padEnd(4)} ${r.length} jugadores${r.length < 53 ? "  ⚠ menos de 53" : ""}`);
}
const meta = { source: arg("fuente") ?? `CSV importado: ${basename(file)}`, updated: new Date().toISOString().slice(0, 10), demo: false };
writeFileSync("data/nfl/players.json", JSON.stringify({ meta, players }));
console.log(`OK: ${players.length} jugadores.`);
if (unknown.size) console.log(`Ignorados: ${[...unknown].slice(0, 20).join(", ")}`);
// Movimientos reales posteriores a los ratings de lanzamiento (si no se pasa --sin-movimientos)
if (!process.argv.includes("--sin-movimientos")) {
  try { readFileSync("data/nfl/transactions-2026.json"); execSync("bun scripts/apply-nfl-transactions.ts data/nfl/ data/nfl/transactions-2026.json || npx tsx scripts/apply-nfl-transactions.ts data/nfl/ data/nfl/transactions-2026.json", { stdio: "inherit" }); } catch { /* sin archivo */ }
}
