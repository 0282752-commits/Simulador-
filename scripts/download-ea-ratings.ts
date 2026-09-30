// Descarga la base de ratings de EA SPORTS FC 27 desde la web oficial de EA (ea.com/games/ea-sports-fc/ratings)
// y la guarda en data/football/raw/ (ignorado por git) como JSON crudo + CSV listo para `npm run datos:futbol`.
//
// Uso:  npm run datos:ea                       (descarga todo)
//       npm run datos:ea -- --limite 500       (prueba rápida)
//
// Nota: los ratings son contenido de Electronic Arts. Úsalos para tu partida personal; no subas estos archivos
// a un repositorio público. El endpoint es el que usa la propia web de EA y puede cambiar sin aviso: si falla,
// usa la opción manual descrita en el README.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.EA_RATINGS_URL ?? "https://drop-api.ea.com/rating/ea-sports-fc";
const i = process.argv.indexOf("--limite");
const MAX = i >= 0 ? Number(process.argv[i + 1]) : Infinity;
const PAGE = 100;

type Stat = { value?: number } | number | undefined;
type Item = Record<string, unknown> & {
  firstName?: string; lastName?: string; commonName?: string | null; overallRating?: number; birthdate?: string; preferredFoot?: number | string;
  leagueName?: string; team?: { label?: string }; nationality?: { label?: string }; position?: { shortLabel?: string }; alternatePositions?: { shortLabel?: string }[];
  stats?: Record<string, Stat>; gender?: { id?: number; label?: string };
};

const v = (s: Stat): number | "" => (typeof s === "number" ? s : s && typeof s.value === "number" ? s.value : "");

async function page(offset: number): Promise<Item[]> {
  const url = `${BASE}?locale=en&limit=${PAGE}&offset=${offset}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (simulador-deportivo)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { items?: Item[] };
      return j.items ?? [];
    } catch (e) {
      if (attempt === 4) throw new Error(`No se pudo descargar ${url}: ${e}`);
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
  return [];
}

const all: Item[] = [];
for (let offset = 0; offset < MAX; offset += PAGE) {
  const items = await page(offset);
  all.push(...items);
  process.stdout.write(`\r${all.length} jugadores…`);
  if (items.length < PAGE) break;
  await new Promise((res) => setTimeout(res, 250)); // no saturar el servidor
}
console.log(`\nDescargados ${all.length} jugadores.`);
if (!all.length) process.exit(1);

mkdirSync("data/football/raw", { recursive: true });
const today = new Date().toISOString().slice(0, 10);
writeFileSync("data/football/raw/fc27-ea.json", JSON.stringify({ source: BASE, downloaded: today, items: all }));

// CSV con columnas estilo SoFIFA (las que entiende scripts/import-fc-csv.ts)
const cols = ["short_name", "long_name", "player_positions", "overall", "age", "nationality_name", "preferred_foot", "pace", "shooting", "passing", "dribbling", "defending", "physic",
  "goalkeeping_diving", "goalkeeping_handling", "goalkeeping_kicking", "goalkeeping_positioning", "goalkeeping_reflexes",
  "attacking_heading_accuracy", "mentality_penalties", "skill_fk_accuracy", "attacking_crossing", "club_name", "league_name", "gender"];
const esc = (x: unknown) => { const s = String(x ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const ageOf = (b?: string) => { if (!b) return ""; const d = new Date(b); if (isNaN(+d)) return ""; const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
const lines = [cols.join(",")];
let women = 0;
for (const p of all) {
  const s = p.stats ?? {};
  const g = p.gender?.label ?? "";
  if (/female|women|mujer/i.test(g) || p.gender?.id === 1) women++;
  const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  const pos = [p.position?.shortLabel, ...(p.alternatePositions ?? []).map((a) => a.shortLabel)].filter(Boolean).join(", ");
  const foot = p.preferredFoot === 2 || /left/i.test(String(p.preferredFoot)) ? "Left" : "Right";
  lines.push([
    p.commonName || name, name, pos, p.overallRating, ageOf(p.birthdate), p.nationality?.label, foot,
    v(s.pac), v(s.sho), v(s.pas), v(s.dri), v(s.def), v(s.phy),
    v(s.gkDiving), v(s.gkHandling), v(s.gkKicking), v(s.gkPositioning), v(s.gkReflexes),
    v(s.headingAccuracy), v(s.penalties), v(s.freeKickAccuracy), v(s.crossing), p.team?.label, p.leagueName, g,
  ].map(esc).join(","));
}
writeFileSync("data/football/raw/fc27.csv", lines.join("\n"));
console.log(`Guardado data/football/raw/fc27.csv (${lines.length - 1} filas${women ? `, ${women} de fútbol femenino que el importador ignorará si su liga no está configurada` : ""}).`);
console.log(`Siguiente paso: npm run datos:futbol -- data/football/raw/fc27.csv --fuente "EA SPORTS FC 27 (ea.com/ratings), descargado ${today}"`);
