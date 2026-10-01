// Importador de plantillas de fútbol desde CSV (formato EA SPORTS FC / SoFIFA / Kaggle).
// Uso: npm run datos:futbol -- ruta/al/archivo.csv [--fuente "texto"] [--otras-ligas "Liga Portugal,Eredivisie"] [--todas]
// Genera data/football/clubs.json y data/football/players.json (reemplaza los datos de demostración).
import { writeFileSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { readCsv, pick, num, arg, norm, colorFromName } from "./csv";
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

const POS: Record<string, Pos> = { GK: "POR", CB: "DFC", RB: "LD", LB: "LI", RWB: "CAD", LWB: "CAI", CDM: "MCD", DM: "MCD", CM: "MC", RM: "MD", LM: "MI", CAM: "MCO", AM: "MCO", RW: "ED", LW: "EI", ST: "DC", CF: "SD", RF: "SD", LF: "SD",
  POR: "POR", DFC: "DFC", LD: "LD", LI: "LI", CAD: "CAD", CAI: "CAI", MCD: "MCD", MC: "MC", MD: "MD", MI: "MI", MCO: "MCO", ED: "ED", EI: "EI", DC: "DC", SD: "SD" };

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
const ageFrom = (b?: string): number | undefined => {
  if (!b) return undefined;
  const m = b.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) ?? null;
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(b);
  if (isNaN(+d)) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};
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
  const posRaw = (pick(r, ["player_positions", "positions", "position", "posicion", "Position", "Alternate positions"]) ?? "CM").split(/[,/ ]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const alt = (pick(r, ["Alternate positions", "alt_positions"]) ?? "").split(/[,/ ]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const positions = [...new Set([...posRaw, ...alt].map((p) => POS[p]).filter(Boolean))] as Pos[];
  if (!positions.length) positions.push("MC");
  const ovr = num(r, ["overall", "ovr", "overall_rating", "rating", "media"], 60);
  const first = pick(r, ["first_name", "firstName"]), last = pick(r, ["last_name", "lastName"]);
  const common = pick(r, ["common_name", "commonName"]);
  const name = pick(r, ["long_name", "name", "full_name", "nombre", "Player Name"]) ?? common ?? (`${first ?? ""} ${last ?? ""}`.trim() || pick(r, ["short_name"]) || "Jugador");
  const short = pick(r, ["short_name", "Known As"]) ?? common ?? (first && last ? `${first[0]}. ${last}` : name);
  const isGk = positions[0] === "POR";
  const p: Player = {
    id: `p${++i}`, name, shortName: short, clubId: club.id, positions,
    age: pick(r, ["age", "edad"]) ? num(r, ["age", "edad"], 25) : ageFrom(pick(r, ["birthdate", "dob", "fecha_nacimiento"])) ?? 25, nationality: pick(r, ["nationality_name", "nationality", "nation", "nacionalidad", "country"]) ?? "—",
    foot: /left|zurdo|izq/i.test(pick(r, ["preferred_foot", "foot", "pie", "Preferred foot"]) ?? "") ? "Zurdo" : "Diestro",
    ovr, pot: pick(r, ["potential", "pot", "potencial"]) ? num(r, ["potential", "pot", "potencial"], ovr) : -1,
    pac: num(r, ["pace", "pac"], ovr), sho: num(r, ["shooting", "sho"], ovr - 10), pas: num(r, ["passing", "pas"], ovr - 5), dri: num(r, ["dribbling", "dri"], ovr - 5), def: num(r, ["defending", "def"], ovr - 20), phy: num(r, ["physic", "physical", "physicality", "phy"], ovr - 5),
    pen: num(r, ["mentality_penalties", "penalties", "penaltis", "Penalties"], 50), fk: num(r, ["skill_fk_accuracy", "fk_accuracy", "free_kick_accuracy", "Free Kick Accuracy"], 50),
    hea: num(r, ["attacking_heading_accuracy", "heading_accuracy", "heading", "Heading Accuracy"], 50), crn: num(r, ["attacking_crossing", "crossing", "Crossing", "curve"], 50),
    value: num(r, ["value_eur", "value", "valor"], 0) || undefined, wage: num(r, ["wage_eur", "wage"], 0) || undefined,
    shirt: num(r, ["club_jersey_number", "jersey_number", "shirt", "dorsal"], 0) || undefined,
  };
  if (isGk) {
    p.gk = { div: num(r, ["goalkeeping_diving", "gk_diving", "diving", "GK Diving"], ovr), han: num(r, ["goalkeeping_handling", "gk_handling", "handling", "GK Handling"], ovr), kic: num(r, ["goalkeeping_kicking", "gk_kicking", "kicking", "GK Kicking"], ovr - 5), ref: num(r, ["goalkeeping_reflexes", "gk_reflexes", "reflexes", "GK Reflexes"], ovr), pos: num(r, ["goalkeeping_positioning", "gk_positioning", "GK Positioning"], ovr) };
    // en el formato EA, las 6 medias del portero vienen en PAC..PHY
    if (!pick(r, ["goalkeeping_diving", "gk_diving", "diving", "GK Diving"]) && pick(r, ["pac"])) p.gk = { div: p.pac, han: p.sho, kic: p.pas, ref: p.dri, pos: p.phy };
  }
  // sin potencial en el archivo: estimación propia (no es dato de EA) según la edad
  if (p.pot < 0) p.pot = Math.min(95, p.age < 24 ? p.ovr + Math.round((24 - p.age) * 1.8) : p.ovr);
  if (!p.value) p.value = estimateValue(p.ovr, p.age);
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
for (const lg of cfg.leagues) {
  const n = [...clubs.values()].filter((c) => c.leagueId === lg.id).length;
  console.log(`  ${lg.name.padEnd(22)} ${String(n).padStart(3)} clubes${n !== lg.teams ? `  ⚠ se esperaban ${lg.teams}` : ""}`);
}
const small = [...clubs.values()].filter((c) => players.filter((p) => p.clubId === c.id).length < 18);
if (small.length) console.log(`⚠ Clubes con menos de 18 jugadores: ${small.map((c) => c.name).join(", ")}`);
if (skipped.size) console.log(`Ligas ignoradas (usa --otras-ligas o --todas): ${[...skipped.entries()].slice(0, 25).map(([k, v]) => `${k} (${v})`).join(", ")}`);
