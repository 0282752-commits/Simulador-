// Genera las selecciones nacionales (convocatoria estimada de 26 por media y posición) desde el CSV COMPLETO de EA FC
// (incluye ligas no simuladas: MLS, Saudí, Brasil, etc.). Aplica los traspasos del verano y los fichajes añadidos.
// Uso: bun scripts/build-nations.ts archivo.csv [carpeta de salida, por defecto data/football/]
import { readFileSync, writeFileSync } from "node:fs";
import { readCsv, pick, norm } from "./csv";
import { rowToPlayer } from "./fc-row";
import { buildNations, type NationsMetaFile } from "../src/engine/cup/nations";
import type { Player } from "../src/engine/football/types";

const file = process.argv[2];
const out = process.argv[3] ?? "data/football/";
if (!file) { console.error("Uso: bun scripts/build-nations.ts archivo.csv [carpeta]"); process.exit(1); }
const meta: NationsMetaFile = JSON.parse(readFileSync("data/football/nations-meta.json", "utf8"));
const club = new Map<string, string>();
const players: Player[] = [];
let i = 0;
for (const r of readCsv(file)) {
  const gender = pick(r, ["gender", "genero"]);
  if (gender && /women|female|femen/i.test(gender)) continue;
  const clubName = pick(r, ["club_name", "club", "team"]) ?? "";
  const p = rowToPlayer(r, `x${++i}`, "x");
  club.set(p.id, clubName);
  players.push(p);
}
// traspasos del verano (nombre → club destino) y fichajes que no están en la base
try {
  const { transfers } = JSON.parse(readFileSync("data/football/transfers-2026-summer.json", "utf8"));
  const dest = new Map<string, string>(transfers.filter((t: any) => t.to !== "FUERA").map((t: any) => [norm(t.player), t.to]));
  for (const p of players) { const d = dest.get(norm(p.name)) ?? dest.get(norm(p.shortName)); if (d) club.set(p.id, d); }
} catch { /* sin archivo */ }
try {
  const extra = JSON.parse(readFileSync("data/football/added-players-2026.json", "utf8")).players;
  for (const e of extra) { const { club: c, source: _s, ...rest } = e; const p = { id: `x${++i}`, clubId: "x", ...rest, estimated: true } as Player; club.set(p.id, c); players.push(p); }
} catch { /* sin archivo */ }
const nations = buildNations(players, meta.nations, (p) => club.get(p.id));
const fillers = nations.filter((n) => n.real < 23).map((n) => `${n.name} (${n.real} reales)`);
writeFileSync(out + "nations.json", JSON.stringify({ meta: { source: "Convocatorias ESTIMADAS a partir de la base de EA SPORTS FC 27 (no son las listas oficiales)", updated: new Date().toISOString().slice(0, 10), note: fillers.length ? `Completadas con jugadores de relleno (no reales): ${fillers.join(", ")}` : "" }, nations }));
console.log(`OK: ${nations.length} selecciones. Con relleno: ${fillers.join(", ") || "ninguna"}`);
