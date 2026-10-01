// Aplica movimientos reales (traspasos, cortes, practice squad) sobre players.json de la NFL manteniendo las medias.
// Uso: bun scripts/apply-nfl-transactions.ts [carpeta de datos] [archivo de movimientos]
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "data/nfl/";
const file = process.argv[3] ?? "data/nfl/transactions-2026.json";
const playersF = JSON.parse(readFileSync(dir + "players.json", "utf8"));
const { moves } = JSON.parse(readFileSync(file, "utf8"));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
let done = 0, already = 0;
const missing: string[] = [];
for (const m of moves) {
  const cands = playersF.players.filter((p: any) => norm(p.name) === norm(m.player));
  const p = cands.find((x: any) => x.teamId === m.from) ?? cands.find((x: any) => x.teamId === m.to) ?? (cands.length === 1 ? cands[0] : undefined);
  if (!p) { missing.push(`${m.player}: no encontrado`); continue; }
  const target = m.type === "cut" ? null : m.to;
  if (p.teamId === target && (m.type !== "practice" || p.practiceSquad)) { already++; continue; }
  p.teamId = target;
  p.practiceSquad = m.type === "practice";
  if (m.type === "cut") p.exTeam = m.from;
  p.transactionNote = { trade: `Traspasado ${m.from}→${m.to}`, cut: `Cortado por ${m.from}`, practice: `Practice squad de ${m.to}` }[m.type as string] + (m.note ? ` (${m.note})` : "");
  done++;
}
if (!playersF.meta.source.includes("movimientos reales")) playersF.meta.source += ` + movimientos reales de 2026 (${file.split("/").pop()})`;
writeFileSync(dir + "players.json", JSON.stringify(playersF));
console.log(`Aplicados ${done} · ya estaban ${already} · sin aplicar ${missing.length}`);
if (missing.length) console.log(missing.join("\n"));
