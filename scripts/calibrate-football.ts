// Calibración del motor de fútbol: simula N partidos de liga con plantillas reales del archivo de datos.
import { readFileSync } from "node:fs";
import { FootballMatch, type MatchTeamInput } from "../src/engine/football/match";
import { bestEleven, bestFormation } from "../src/engine/football/lineup";
import type { Club, Player } from "../src/engine/football/types";
import { Rng } from "../src/lib/rng";

const N = Number(process.argv[2] ?? 10000);
const clubs: Club[] = JSON.parse(readFileSync("data/football/clubs.json", "utf8")).clubs;
const players: Player[] = JSON.parse(readFileSync("data/football/players.json", "utf8")).players;
const byClub = new Map<string, Player[]>();
for (const p of players) if (p.clubId) (byClub.get(p.clubId) ?? byClub.set(p.clubId, []).get(p.clubId)!).push(p);

const leagues = new Map<string, Club[]>();
for (const c of clubs) if (c.leagueId) (leagues.get(c.leagueId) ?? leagues.set(c.leagueId, []).get(c.leagueId)!).push(c);
const inputs = new Map<string, MatchTeamInput>();
for (const c of clubs) {
  const squad = byClub.get(c.id) ?? [];
  const lineup = bestEleven(squad, bestFormation(squad));
  inputs.set(c.id, { id: c.id, name: c.name, short: c.short, colors: c.colors, lineup, squad });
}
const rng = new Rng(7);
const lgList = [...leagues.values()].filter((l) => l[0].leagueId!.endsWith("1"));
const t = { goals: 0, hg: 0, ag: 0, hw: 0, d: 0, aw: 0, corners: 0, pens: 0, penGoals: 0, shots: 0, onT: 0, yel: 0, red: 0, fouls: 0, off: 0, xg: 0, og: 0, subs: 0, inj: 0, headers: 0, fk: 0, var: 0, zero: 0, over25: 0 };
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const lg = rng.pick(lgList);
  const h = rng.pick(lg);
  let a = rng.pick(lg);
  while (a.id === h.id) a = rng.pick(lg);
  const m = new FootballMatch(inputs.get(h.id)!, inputs.get(a.id)!, { seed: rng.int(1, 2 ** 30) });
  const r = m.runToEnd();
  const g = r.hg + r.ag;
  t.goals += g; t.hg += r.hg; t.ag += r.ag;
  if (r.hg > r.ag) t.hw++; else if (r.hg === r.ag) t.d++; else t.aw++;
  if (g === 0) t.zero++;
  if (g > 2) t.over25++;
  const [s0, s1] = r.stats!;
  t.corners += s0.corners + s1.corners; t.shots += s0.shots + s1.shots; t.onT += s0.onT + s1.onT;
  t.yel += s0.yellows + s1.yellows; t.red += s0.reds + s1.reds; t.fouls += s0.fouls + s1.fouls; t.off += s0.offsides + s1.offsides; t.xg += s0.xg + s1.xg;
  for (const e of m.events) {
    if (e.type === "info" && e.text?.startsWith("¡PENAL")) t.pens++;
    if (e.type === "gol" && e.detail === "penal") t.penGoals++;
    if (e.type === "gol" && e.detail === "cabeza") t.headers++;
    if (e.type === "gol" && e.detail === "tiro libre") t.fk++;
    if (e.type === "gol_pp") t.og++;
    if (e.type === "cambio") t.subs++;
    if (e.type === "lesion") t.inj++;
    if (e.type === "var") t.var++;
  }
}
const f = (x: number, d = 2) => (x / N).toFixed(d);
const pct = (x: number) => ((x / N) * 100).toFixed(1) + "%";
console.log(`\n=== Calibración FÚTBOL (${N} partidos de primera división, ${((Date.now() - t0) / 1000).toFixed(1)} s) ===`);
const rows: [string, string, string][] = [
  ["Goles por partido", f(t.goals), "~2.70"],
  ["Goles local / visitante", `${f(t.hg)} / ${f(t.ag)}`, "~1.50 / ~1.20"],
  ["Victorias local", pct(t.hw), "~45%"],
  ["Empates", pct(t.d), "~25%"],
  ["Victorias visitante", pct(t.aw), "~30%"],
  ["0-0", pct(t.zero), "~7%"],
  ["Más de 2.5 goles", pct(t.over25), "~50%"],
  ["Tiros por partido", f(t.shots, 1), "~25"],
  ["Tiros a puerta", f(t.onT, 1), "~8.5"],
  ["xG por partido", f(t.xg), "~2.7"],
  ["Córners por partido", f(t.corners, 1), "~10"],
  ["Penales señalados", f(t.pens), "~0.25-0.30"],
  ["Goles de penal", f(t.penGoals), "~0.20"],
  ["Goles de cabeza", f(t.headers), "~0.40"],
  ["Goles de tiro libre directo", f(t.fk, 3), "~0.05"],
  ["Autogoles", f(t.og, 3), "~0.08"],
  ["Faltas", f(t.fouls, 1), "~22"],
  ["Amarillas", f(t.yel, 1), "~4.0"],
  ["Rojas (incl. doble amarilla)", f(t.red, 2), "~0.15"],
  ["Fueras de juego", f(t.off, 1), "~4"],
  ["Cambios", f(t.subs, 1), "~8-9"],
  ["Lesiones", f(t.inj, 2), "~0.3"],
  ["Revisiones VAR que anulan", f(t.var, 2), "~0.15"],
];
for (const [k, v, ref] of rows) console.log(`${k.padEnd(30)} ${v.padStart(14)}   (real ${ref})`);
