// Calibración del motor NFL: simula N partidos entre equipos del archivo de datos.
import { readFileSync } from "node:fs";
import { NflGameSim } from "../src/engine/nfl/game";
import { newNflSave, gameInput } from "../src/engine/nfl/season";
import { Rng } from "../src/lib/rng";

const N = Number(process.argv[2] ?? 10000);
const cfg = JSON.parse(readFileSync("data/nfl/teams.json", "utf8"));
const players = JSON.parse(readFileSync("data/nfl/players.json", "utf8"));
const save = newNflSave({ cfg, players }, 1);
const ids = Object.keys(save.teams);
const inputs = new Map(ids.map((id) => [id, gameInput(save, id)]));
const rng = new Rng(3);
const t = { pts: 0, hp: 0, ap: 0, hw: 0, tie: 0, ot: 0, yds: 0, pass: 0, rush: 0, sacks: 0, to: 0, int: 0, plays: 0, pen: 0, fga: 0, fgm: 0, xpa: 0, xpm: 0, punts: 0, third: 0, thirdA: 0, cmp: 0, att: 0, tds: 0, two: 0 };
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const h = rng.pick(ids); let a = rng.pick(ids); while (a === h) a = rng.pick(ids);
  const sim = new NflGameSim(inputs.get(h)!, inputs.get(a)!, { seed: rng.int(1, 2 ** 30) });
  const r = sim.runToEnd();
  t.pts += r.hs + r.as; t.hp += r.hs; t.ap += r.as;
  if (r.hs > r.as) t.hw++; else if (r.hs === r.as) t.tie++;
  if (r.ot) t.ot++;
  for (const s of r.stats!) { t.yds += s.yards; t.pass += s.passYds; t.rush += s.rushYds; t.sacks += s.sacks; t.to += s.turnovers; t.plays += s.plays; t.pen += s.penalties; t.third += s.thirdConv; t.thirdA += s.thirdAtt; }
  for (const l of Object.values(r.players)) { t.int += l.int ?? 0; t.fga += l.fga ?? 0; t.fgm += l.fgm ?? 0; t.xpa += l.xpa ?? 0; t.xpm += l.xpm ?? 0; t.punts += l.punts ?? 0; t.cmp += l.passCmp ?? 0; t.att += l.passAtt ?? 0; t.tds += (l.passTD ?? 0) + (l.rushTD ?? 0); }
  t.two += sim.log.filter((e) => e.type === "dos_puntos").length;
}
const f = (x: number, d = 1) => (x / N).toFixed(d);
const g2 = (x: number, d = 1) => (x / N / 2).toFixed(d);
console.log(`\n=== Calibración NFL (${N} partidos, ${((Date.now() - t0) / 1000).toFixed(1)} s) ===`);
const rows: [string, string, string][] = [
  ["Puntos totales por partido", f(t.pts), "~45"],
  ["Puntos local / visitante", `${f(t.hp)} / ${f(t.ap)}`, "~23.5 / ~21.5"],
  ["Victorias local", ((t.hw / (N - t.tie)) * 100).toFixed(1) + "%", "~55-57%"],
  ["Prórrogas", ((t.ot / N) * 100).toFixed(1) + "%", "~5-6%"],
  ["Empates", ((t.tie / N) * 100).toFixed(2) + "%", "~0.3%"],
  ["Yardas por equipo", g2(t.yds), "~330"],
  ["Yardas de pase por equipo (netas)", g2(t.pass), "~210"],
  ["Yardas por tierra por equipo", g2(t.rush), "~118"],
  ["Jugadas ofensivas por equipo", g2(t.plays), "~62"],
  ["% de pases completos", ((t.cmp / t.att) * 100).toFixed(1) + "%", "~65%"],
  ["Capturas por equipo", g2(t.sacks, 2), "~2.4"],
  ["Pérdidas de balón por equipo", g2(t.to, 2), "~1.2"],
  ["Intercepciones por equipo", g2(t.int, 2), "~0.75"],
  ["Castigos por equipo", g2(t.pen, 1), "~6"],
  ["% 3ª oportunidad", ((t.third / t.thirdA) * 100).toFixed(1) + "%", "~39%"],
  ["Goles de campo intentados por equipo", g2(t.fga, 2), "~1.8"],
  ["% goles de campo", ((t.fgm / t.fga) * 100).toFixed(1) + "%", "~85%"],
  ["% puntos extra", ((t.xpm / t.xpa) * 100).toFixed(1) + "%", "~95%"],
  ["Despejes por equipo", g2(t.punts, 2), "~3.8"],
  ["Touchdowns ofensivos por equipo", g2(t.tds, 2), "~2.4"],
  ["Conversiones de 2 por partido", f(t.two, 2), "~0.6"],
];
for (const [k, v, ref] of rows) console.log(`${k.padEnd(38)} ${v.padStart(14)}   (real ${ref})`);
