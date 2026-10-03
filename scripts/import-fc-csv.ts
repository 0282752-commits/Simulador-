// Importador de plantillas de fútbol desde CSV (formato EA SPORTS FC / SoFIFA / Kaggle).
// Uso: npm run datos:futbol -- ruta/al/archivo.csv [--fuente "texto"] [--otras-ligas "Liga Portugal,Eredivisie"] [--todas]
// Genera data/football/clubs.json y data/football/players.json (reemplaza los datos de demostración).
import { writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename } from "node:path";
import { readCsv, pick, num, arg, norm, colorFromName } from "./csv";
import { rowToPlayer } from "./fc-row";
import type { Club, Player, Pos } from "../src/engine/football/types";
import { estimateValue } from "../src/engine/football/career";

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("Uso: npm run datos:futbol -- archivo.csv [--fuente \"EA SPORTS FC 27, descargado el AAAA-MM-DD\"] [--todas]");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync("data/football/competitions.json", "utf8"));
const rows = readCsv(file);
console.log(`Leídas ${rows.length} filas de ${file}`);

// Ligas extra (clubes europeos sin liga simulada) → código de país
const OTHER: Record<string, string> = {
  "liga portugal": "POR", "liga portugal betclic": "POR", "portuguese liga zon sagres": "POR", "primeira liga": "POR",
  eredivisie: "NED", "vriendenloterij eredivisie": "NED", "belgian pro league": "BEL", "1a pro league": "BEL", "jupiler pro league": "BEL",
  "super lig": "TUR", "trendyol super lig": "TUR", "turkish super lig": "TUR", "scottish premiership": "SCO", "cinch premiership": "SCO", "william hill premiership": "SCO",
  "austrian bundesliga": "AUT", "admiral bundesliga": "AUT", "swiss super league": "SUI", "credit suisse super league": "SUI", "chance liga": "CZE", "czech first league": "CZE",
  "super league greece": "GRE", "danish superliga": "DEN", "3f superliga": "DEN", "eliteserien": "NOR", "hnl": "CRO", "supersport hnl": "CRO", "superliga srbije": "SRB",
  "ukrainian premier league": "UKR", "ukrayina liha": "UKR", "brack super league": "SUI", "o bundesliga": "AUT", "hellas liga": "GRE", "ceska liga": "CZE", "liga hrvatska": "CRO",
  "liga cyprus": "CYP", "magyar liga": "HUN", "liga azerbaijan": "AZE", "liga bulgaria": "BUL", "finnliiga": "FIN", "sse airtricity mens premier division": "IRL", "pko bp ekstraklasa": "POL", "ekstraklasa": "POL", "cyprus league": "CYP", "allsvenskan": "SWE", "ligat haal": "ISR", "nb i": "HUN", "otp bank liga": "HUN", "superliga": "ROU", "romanian superliga": "ROU",
};
const extra = (arg("otras-ligas") ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const all = process.argv.includes("--todas");

const leagueOf = (name: string): { id: string | null; country: string } | null => {
  const n = norm(name);
  for (const lg of cfg.leagues) if (lg.csvNames.some((x: string) => norm(x) === n) || norm(lg.name) === n) return { id: lg.id, country: lg.country };
  // coincidencia flexible (p. ej. "Ligue 1 McDonald's" vs "Ligue 1"), evitando confundir 1ª y 2ª división
  for (const lg of cfg.leagues) if (lg.csvNames.some((x: string) => { const m = norm(x); return m.length >= 6 && (n.startsWith(m) || m.startsWith(n)) && !/2|b$|hypermotion|championship/.test(n.replace(m, "")); })) return { id: lg.id, country: lg.country };
  const o = Object.entries(OTHER).find(([k]) => norm(k) === n);
  if (o) return { id: null, country: o[1] };
  if (extra.includes(name.toLowerCase()) || all) return { id: null, country: name.slice(0, 3).toUpperCase() };
  return null;
};

const KNOWN_COLORS: Record<string, [string, string]> = (() => { try { return JSON.parse(readFileSync("data/football/club-colors.json", "utf8")).colors; } catch { return {}; } })();
const clubs = new Map<string, Club>();
const players: Player[] = [];
const skipped = new Map<string, number>();
let i = 0;
for (const r of rows) {
  const gender = pick(r, ["gender", "genero"]);
  if (gender && /women|female|femen/i.test(gender)) continue;
  const clubName = pick(r, ["club_name", "club", "team", "equipo", "Team Name"]);
  const leagueName = pick(r, ["league_name", "league", "liga", "competition"]);
  if (!clubName || !leagueName) continue;
  const lg = leagueOf(leagueName);
  if (!lg) { skipped.set(leagueName, (skipped.get(leagueName) ?? 0) + 1); continue; }
  let club = clubs.get(clubName);
  if (!club) {
    club = { id: `c_${norm(clubName).slice(0, 24)}`, name: clubName, short: clubName.replace(/^(FC|AC|AS|SS|US|SV|VfB|TSV|SC|1\. FC|VfL|RC|Real|Club|CF|UD|CD|RCD|SD|SL|SK|FK) /i, "").slice(0, 3).toUpperCase(), country: lg.country, leagueId: lg.id, colors: KNOWN_COLORS[clubName] ?? colorFromName(clubName) };
    clubs.set(clubName, club);
  }
  const p = rowToPlayer(r, `p${++i}`, club.id);
  const loan = pick(r, ["club_loaned_from", "loaned_from"]);
  if (loan) p.loanFrom = loan; // se resuelve abajo
  players.push(p);
}
// resolver cedidos (nombre de club → id)
for (const p of players) if (p.loanFrom) p.loanFrom = clubs.get(p.loanFrom)?.id ?? null;
// Las plantillas incompletas de la base se completan al crear la partida (canteranos generados, marcados como cantera).
// reputación = media del top-16
for (const c of clubs.values()) {
  const top = players.filter((p) => p.clubId === c.id).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 16);
  c.reputation = Math.round(top.reduce((a, b) => a + b, 0) / Math.max(1, top.length));
}
const source = arg("fuente") ?? `CSV importado: ${basename(file)}`;
const meta = { source, updated: new Date().toISOString().slice(0, 10), demo: false };
writeFileSync("data/football/clubs.json", JSON.stringify({ meta, clubs: [...clubs.values()] }));
writeFileSync("data/football/players.json", JSON.stringify({ meta, players }));
console.log(`OK: ${clubs.size} clubes y ${players.length} jugadores.`);
// Traspasos posteriores a la base de EA (si existe el archivo y no se pasa --sin-traspasos)
if (!process.argv.includes("--sin-traspasos")) {
  try { readFileSync("data/football/transfers-2026-summer.json"); execSync("bun scripts/apply-transfers.ts data/football/ data/football/transfers-2026-summer.json || npx tsx scripts/apply-transfers.ts data/football/ data/football/transfers-2026-summer.json", { stdio: "inherit" }); } catch { /* sin archivo */ }
}
for (const lg of cfg.leagues) {
  const n = [...clubs.values()].filter((c) => c.leagueId === lg.id).length;
  console.log(`  ${lg.name.padEnd(22)} ${String(n).padStart(3)} clubes${n !== lg.teams ? `  ⚠ se esperaban ${lg.teams}` : ""}`);
}
const small = [...clubs.values()].filter((c) => players.filter((p) => p.clubId === c.id).length < 18);
if (small.length) console.log(`⚠ Clubes con menos de 18 jugadores: ${small.map((c) => c.name).join(", ")}`);
if (skipped.size) console.log(`Ligas ignoradas (usa --otras-ligas o --todas): ${[...skipped.entries()].slice(0, 25).map(([k, v]) => `${k} (${v})`).join(", ")}`);
