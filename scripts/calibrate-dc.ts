// "Calibración" del motor DC: no hay estadísticas reales; se verifica coherencia interna con N batallas.
import { readFileSync } from "node:fs";
import { Battle, overall } from "../src/engine/dc/battle";
import type { DcCharacter, Synergy } from "../src/engine/dc/types";
import { Rng } from "../src/lib/rng";

const N = Number(process.argv[2] ?? 10000);
const data = JSON.parse(readFileSync("data/dc/characters.json", "utf8"));
const chars: DcCharacter[] = data.characters;
const syn: Synergy[] = data.synergies;
const by = (id: string) => chars.find((c) => c.id === id)!;
const rng = new Rng(11);
const t0 = Date.now();
let favWins = 0, decided = 0, rounds = 0, draws = 0, comebacks = 0, crits = 0, combos = 0;
const buckets = new Map<number, [number, number]>();
for (let i = 0; i < N; i++) {
  const size = rng.pick([1, 3, 5]);
  const pool = rng.shuffle([...chars]);
  const A = pool.slice(0, size), B = pool.slice(size, 2 * size);
  const b = new Battle([{ id: "A", name: "A", members: A }, { id: "B", name: "B", members: B }], syn, 0.5, rng.int(1, 2 ** 30));
  const r = b.runToEnd();
  rounds += r.rounds;
  const oa = A.reduce((s, c) => s + overall(c), 0) / size, ob = B.reduce((s, c) => s + overall(c), 0) / size;
  if (r.winner === -1) { draws++; continue; }
  decided++;
  const fav = oa >= ob ? 0 : 1;
  if (r.winner === fav) favWins++;
  const d = Math.min(30, Math.floor(Math.abs(oa - ob) / 5) * 5);
  const bk = buckets.get(d) ?? [0, 0];
  bk[0]++; if (r.winner === fav) bk[1]++;
  buckets.set(d, bk);
  comebacks += b.log.filter((e) => e.type === "remontada").length;
  crits += b.log.filter((e) => e.type === "critico").length;
  combos += b.log.filter((e) => e.type === "combo").length;
}
const duel = (a: string, bId: string, n = 2000, rnd = 0.5) => { let w = 0; for (let i = 0; i < n; i++) { const r = new Battle([{ id: "a", name: "a", members: [by(a)] }, { id: "b", name: "b", members: [by(bId)] }], syn, rnd, i + 1).runToEnd(); if (r.winner === 0) w++; } return ((w / n) * 100).toFixed(1) + "%"; };
console.log(`\n=== Calibración DC (${N} batallas aleatorias 1v1/3v3/5v5, ${((Date.now() - t0) / 1000).toFixed(1)} s) — escala propia, sin referencia oficial ===`);
console.log(`Gana el favorito (mayor overall medio): ${((favWins / decided) * 100).toFixed(1)}%   (objetivo de diseño: 70-80%)`);
console.log(`Empates: ${((draws / N) * 100).toFixed(2)}%   Rondas medias: ${(rounds / N).toFixed(1)}   Remontadas/batalla: ${(comebacks / N).toFixed(2)}   Críticos/batalla: ${(crits / N).toFixed(2)}   Combos/batalla: ${(combos / N).toFixed(2)}`);
console.log("Diferencia de overall → % victoria del favorito:");
for (const k of [...buckets.keys()].sort((a, b) => a - b)) { const [n, w] = buckets.get(k)!; console.log(`  ${String(k).padStart(2)}-${k + 4} pts: ${((w / n) * 100).toFixed(1)}%  (${n} batallas)`); }
console.log("Duelos de referencia (aleatoriedad 0.5):");
for (const [a, b] of [["superman", "batman"], ["superman", "wonder-woman"], ["superman", "general-zod"], ["batman", "the-joker"], ["flash", "reverse-flash"], ["wonder-woman", "cheetah"], ["darkseid", "superman"], ["batman", "deathstroke"], ["green-lantern-hal-jordan", "sinestro"], ["black-adam", "shazam"]]) console.log(`  ${by(a).name} vs ${by(b).name}: ${duel(a, b)}`);
console.log(`  Superman vs Batman con aleatoriedad 1.0: ${duel("superman", "batman", 2000, 1)}`);
