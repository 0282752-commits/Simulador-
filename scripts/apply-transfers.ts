// Aplica una lista de traspasos reales sobre clubs.json/players.json manteniendo las medias.
// Uso: bun scripts/apply-transfers.ts [carpeta de datos] [archivo de traspasos]
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2] ?? "data/football/";
const file = process.argv[3] ?? "data/football/transfers-2026-summer.json";
const clubsF = JSON.parse(readFileSync(dir + "clubs.json", "utf8"));
const playersF = JSON.parse(readFileSync(dir + "players.json", "utf8"));
const { transfers } = JSON.parse(readFileSync(file, "utf8"));
const norm = (s: string) => s.toLowerCase().replace(/ð/g, "d").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const clubByName = new Map<string, any>(clubsF.clubs.map((c: any) => [norm(c.name), c]));
const findClub = (n: string) => clubByName.get(norm(n));
let done = 0, already = 0, removed = 0;
const missing: string[] = [];
for (const t of transfers) {
  const q = norm(t.player).split(" ");
  const from = findClub(t.from), to = t.to === "FUERA" ? null : findClub(t.to);
  if (t.to !== "FUERA" && !to) { missing.push(`${t.player}: destino ${t.to} no está en la base`); continue; }
  // candidatos: todas las palabras del nombre buscado aparecen en nombre/nombre corto
  const cands = playersF.players.filter((p: any) => { const h = norm(`${p.name} ${p.shortName}`); return q.every((w: string) => h.split(" ").includes(w)) || (q.length > 1 && h.includes(q.join(" "))); });
  let p = cands.find((x: any) => from && x.clubId === from.id) ?? cands.find((x: any) => to && x.clubId === to.id) ?? (cands.length === 1 ? cands[0] : undefined);
  if (!p) { missing.push(`${t.player} (${t.from}): no encontrado${cands.length > 1 ? ` (${cands.length} homónimos)` : ""}`); continue; }
  if (to && p.clubId === to.id) { already++; continue; }
  if (!to) { playersF.players = playersF.players.filter((x: any) => x !== p); removed++; continue; }
  if (t.loan) p.loanFrom = p.clubId; else p.loanFrom = undefined;
  p.clubId = to.id;
  p.transferNote = `${t.loan ? "Cedido" : "Fichado"} en verano 2026 (${t.source})`;
  done++;
}
// Fichajes que no están en la base de EA: se crean con medias estimadas
let added = 0;
try {
  const extra = JSON.parse(readFileSync(file.replace(/[^/]*$/, "added-players-2026.json"), "utf8")).players;
  for (const e of extra) {
    const club = findClub(e.club);
    if (!club) { missing.push(`${e.name}: club ${e.club} no está en la base`); continue; }
    if (playersF.players.some((x: any) => norm(x.name) === norm(e.name))) continue;
    const { club: _c, source, ...rest } = e;
    playersF.players.push({ id: "px_" + norm(e.name).replace(/ /g, "_"), clubId: club.id, ...rest, estimated: true, transferNote: `Fichado en verano 2026 (${source}) · medias estimadas, no de EA` });
    added++;
  }
} catch { /* sin archivo */ }
console.log(`Añadidos con media estimada: ${added}`);
playersF.meta.source += ` + traspasos del cierre del verano 2026 (${file.split("/").pop()}, ${done} aplicados)`;
writeFileSync(dir + "players.json", JSON.stringify(playersF));
console.log(`Aplicados ${done} · ya estaban ${already} · salen de las ligas simuladas ${removed} · sin aplicar ${missing.length}`);
if (missing.length) console.log(missing.join("\n"));
