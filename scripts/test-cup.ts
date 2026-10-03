// Prueba de torneos personalizados: todos los deportes y formatos, simulación completa, edición y borrado de resultados.
// Uso: bun scripts/test-cup.ts [carpeta de datos, por defecto data/]
import { readFileSync } from "node:fs";
import { loadCupSource } from "../src/lib/cupSources";
import { canRedraw, createCup, cupLeaders, cupTable, playable, redraw, setCupResult, simulateWhile, validateFormat } from "../src/engine/cup/cup";
import { BASE_FORMAT, PRESETS } from "../src/engine/cup/presets";
import type { CupFormat, CupSport } from "../src/engine/cup/types";

const dir = process.argv[2] ?? "data/";
(globalThis as any).__DATA_BASE = dir;
(globalThis as any).fetch = async (u: string) => { try { return new Response(readFileSync(String(u))); } catch { return new Response("", { status: 404 }); } };
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.log("  ✗ " + msg); } };

async function run(sport: CupSport, presetId: string, n?: number, extra: Partial<CupFormat> = {}, dc?: { mode: "personajes" | "equipos"; teamSize: number }) {
  const src = await loadCupSource(sport, dc);
  const p = PRESETS.find((x) => x.id === presetId)!;
  const N = Math.min(n ?? p.teams, src.teams.length);
  const format = { ...BASE_FORMAT, ...p.format, ...extra, preset: p.id };
  if (presetId === "mundial2026" && !src.worldCupGroups || N < (n ?? p.teams)) { console.log(`${sport}/${presetId}: omitido (solo ${src.teams.length} equipos en estos datos)`); return; }
  const err = validateFormat(format, N);
  if (err) { console.log(`${sport}/${presetId}/${N}: formato inválido: ${err}`); fails++; return; }
  const ids = presetId === "mundial2026" ? Object.values(src.worldCupGroups!).flat() : [...src.teams].sort((a, b) => b.strength - a.strength).slice(0, N).map((t) => t.id);
  const t0 = Date.now();
  const save = createCup({ sport, title: "t", format, teams: src.teams.filter((t) => ids.includes(t.id)), ...src.build(ids), dataSource: src.dataSource, groups: presetId === "mundial2026" ? src.worldCupGroups : undefined, hosts: presetId === "mundial2026" ? ["n_MEX", "n_CAN", "n_USA"] : undefined });
  // sorteo inicial: reglas de confederación y repetir sorteo
  if (save.draws?.grupos && sport === "selecciones") {
    const bad = Object.values(save.groups!).filter((ids) => { const c: Record<string, number> = {}; ids.forEach((x) => (c[save.teams[x].sub!] = (c[save.teams[x].sub!] ?? 0) + 1)); const tot: Record<string, number> = {}; ids.length; Object.values(save.teams).forEach((t) => (tot[t.sub!] = (tot[t.sub!] ?? 0) + 1)); return Object.entries(c).some(([k, n]) => n > Math.max(k === "UEFA" ? 2 : 1, Math.ceil(tot[k] / format.groups))); });
    check(bad.length === 0, `grupos con confederación repetida: ${bad.length}`);
    check(save.draws.grupos.steps.length === N, "pasos del sorteo de grupos");
  }
  if (save.draws?.grupos && !save.draws.grupos.real) { const before = JSON.stringify(save.groups); check(canRedraw(save, "grupos"), "puede re-sortear"); redraw(save, "grupos"); check(JSON.stringify(save.groups) !== before, "re-sorteo cambia los grupos"); }
  if (save.draws?.suizo) check(save.draws.suizo.steps.length === N * format.swissMatches, `pasos sorteo suizo ${save.draws.suizo.steps.length}`);
  // simula media fase, edita un resultado y borra otro
  simulateWhile(save, "ronda");
  const first = save.matches.find((m) => m.result)!;
  setCupResult(save, first.id, { hs: 5, as: 0, w: 0, manual: true });
  check(save.matches.find((m) => m.id === first.id)?.result?.hs === 5, "editar resultado");
  setCupResult(save, first.id, undefined);
  check(!save.matches.find((m) => m.id === first.id)?.result, "borrar resultado");
  const played = simulateWhile(save, "todo");
  check(!!save.champion, `${sport}/${presetId}: sin campeón`);
  check(playable(save).length === 0, "quedan partidos");
  // cambiar un resultado de la primera fase regenera el cuadro y sigue siendo coherente
  const before = save.matches.length;
  const g = save.matches[0];
  setCupResult(save, g.id, { hs: g.result!.as + 3, as: 0, w: 0, manual: true });
  simulateWhile(save, "todo");
  check(!!save.champion && save.matches.every((m) => m.result), "re-simulación tras editar");
  const L = cupLeaders(save);
  const draws = Object.keys(save.draws ?? {});
  const ko = save.matches.filter((m) => m.phase === "ko");
  console.log(`${sport.padEnd(12)} ${presetId.padEnd(18)} ${String(N).padStart(3)} eq · ${String(save.matches.length).padStart(3)} partidos (${played} sim) · KO ${ko.length} · campeón ${save.teams[save.champion!]?.name} (2.º ${save.teams[save.runnerUp ?? ""]?.name ?? "-"}, 3.º ${save.teams[save.third ?? ""]?.name ?? "-"}) · ${L[0].title}: ${L[0].rows[0]?.name ?? "-"} ${L[0].rows[0]?.value ?? ""} · sorteos: ${draws.join(", ") || "-"} · ${Date.now() - t0} ms${before !== save.matches.length ? " · cuadro regenerado" : ""}`);
  if (save.groups && presetId.startsWith("mundial")) {
    const gm = save.matches.filter((m) => m.phase === "grupos");
    const A = cupTable(save, save.groups.A, gm.filter((m) => m.group === "A"));
    console.log("   Grupo A: " + A.map((r) => `${save.teams[r.team].short} ${r.pts}`).join(", "));
    const r32 = save.matches.filter((m) => m.stage.startsWith(m.phase === "ko" ? save.matches.find((x) => x.phase === "ko")!.stage.replace(/ · .*/, "") : "zz"));
    const sameGroup = r32.filter((m) => Object.values(save.groups!).some((ids) => ids.includes(m.home) && ids.includes(m.away)));
    check(sameGroup.length === 0, `cruces del mismo grupo en dieciseisavos: ${sameGroup.length}`);
  }
}

async function main() {
  await run("futbol", "champions");
  await run("futbol", "champions-clasica");
  await run("futbol", "champions-clasica", 32, { koDraw: "cuadro" });
  await run("selecciones", "mundial48");
  await run("selecciones", "mundial32", 32, { koDraw: "sorteo" });
  await run("futbol", "eliminatoria", 64, { koLegs: 2 });
  await run("futbol", "eliminatoria", 12);
  await run("futbol", "liga-final", 8);
  await run("futbol", "liga", 10);
  await run("selecciones", "mundial2026");
  await run("selecciones", "mundial32");
  await run("selecciones", "euro");
  await run("nfl", "eliminatoria", 16);
  await run("nfl", "liga-final", 32, { playoffTeams: 8 });
  await run("nfl", "mundial32");
  await run("dc", "eliminatoria", 64, {}, { mode: "personajes", teamSize: 1 });
  await run("dc", "champions", 36, {}, { mode: "personajes", teamSize: 1 });
  await run("dc", "liga-final", 8, { playoffTeams: 4 }, { mode: "equipos", teamSize: 3 });
  console.log(fails ? `FALLOS: ${fails}` : "OK");
  process.exit(fails ? 1 : 0);
}
main();
