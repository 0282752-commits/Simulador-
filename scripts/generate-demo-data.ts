// Genera DATOS DE DEMOSTRACIÓN FICTICIOS para que la app funcione sin importar CSV.
// Ningún club ni jugador de este archivo es real. Para datos reales usa:
//   npm run datos:futbol -- ruta/al/archivo.csv
//   npm run datos:nfl -- ruta/al/archivo.csv
import { writeFileSync, readFileSync } from "node:fs";
import { Rng, clamp } from "../src/lib/rng";
import { FIRST, LAST, CITY, SUFFIX } from "./names";
import type { Player, Club, Pos } from "../src/engine/football/types";
import type { NflPlayer, NflPos } from "../src/engine/nfl/types";

const rng = new Rng(20260930);
const cfg = JSON.parse(readFileSync("data/football/competitions.json", "utf8"));

const NAT_MIX: Record<string, [string, number][]> = {
  ENG: [["ENG", 5], ["FRA", 1], ["BRA", 1], ["AFR", 1], ["ESP", 0.5], ["NED", 0.5], ["GEN", 1]],
  ESP: [["ESP", 6], ["ARG", 1], ["BRA", 1], ["FRA", 0.5], ["AFR", 0.5], ["GEN", 0.5]],
  ITA: [["ITA", 5], ["ARG", 1], ["BRA", 1], ["FRA", 0.5], ["GEN", 1.5], ["AFR", 0.5]],
  GER: [["GER", 5], ["GEN", 2], ["FRA", 0.7], ["AFR", 0.7], ["NED", 0.6]],
  FRA: [["FRA", 6], ["AFR", 2], ["BRA", 0.5], ["GEN", 0.5]],
  POR: [["POR", 5], ["BRA", 2], ["AFR", 1], ["ARG", 0.5]],
  NED: [["NED", 5], ["AFR", 1], ["GEN", 1]],
};
const NAT_LABEL: Record<string, string> = { ENG: "Inglaterra", ESP: "España", ITA: "Italia", GER: "Alemania", FRA: "Francia", POR: "Portugal", NED: "Países Bajos", BRA: "Brasil", ARG: "Argentina", AFR: "Senegal", GEN: "Croacia" };

function nat(country: string): string {
  const mix = NAT_MIX[country] ?? [["GEN", 6], ["BRA", 1], ["AFR", 1]];
  return rng.weighted(mix, (m) => m[1])[0];
}

const usedNames = new Set<string>();
function playerName(n: string): [string, string] {
  for (let i = 0; i < 50; i++) {
    const f = rng.pick(FIRST[n] ?? FIRST.GEN);
    const l = rng.pick(LAST[n] ?? LAST.GEN);
    const full = `${f} ${l}`;
    if (!usedNames.has(full) || i > 40) { usedNames.add(full); return [full, `${f[0]}. ${l}`]; }
  }
  return ["Jugador", "Jugador"];
}

const SQUAD: [Pos, number][] = [["POR", 3], ["DFC", 4], ["LD", 2], ["LI", 2], ["MCD", 2], ["MC", 4], ["MCO", 2], ["EI", 2], ["ED", 2], ["DC", 3]];
const ALT: Partial<Record<Pos, Pos[]>> = { DFC: ["MCD"], LD: ["CAD", "MD"], LI: ["CAI", "MI"], MCD: ["MC", "DFC"], MC: ["MCD", "MCO"], MCO: ["MC", "SD"], EI: ["MI", "ED"], ED: ["MD", "EI"], DC: ["SD"] };
// perfil de atributos por posición: [PAC, SHO, PAS, DRI, DEF, PHY] desviación sobre overall
const PROFILE: Record<string, number[]> = {
  DFC: [-10, -30, -12, -14, 4, 2], LD: [2, -22, -6, -4, -2, -6], LI: [2, -22, -6, -4, -2, -6],
  MCD: [-12, -14, -2, -6, 0, 0], MC: [-8, -8, 2, 0, -12, -6], MCO: [-4, -2, 2, 3, -35, -14],
  EI: [4, -4, -4, 3, -45, -16], ED: [4, -4, -4, 3, -45, -16], DC: [0, 2, -12, -4, -50, -2],
};

let pid = 0;
function makePlayer(clubId: string | null, pos: Pos, level: number, country: string): Player {
  const n = nat(country);
  const [name, short] = playerName(n);
  const age = clamp(Math.round(rng.normal(26, 4.2)), 17, 37);
  const ageAdj = age < 21 ? -(21 - age) * 1.2 : age > 32 ? -(age - 32) * 0.8 : 0;
  const ovr = clamp(Math.round(level + ageAdj + rng.normal(0, 2.3)), 45, 93);
  const pot = clamp(Math.max(ovr, Math.round(ovr + (age < 24 ? (24 - age) * rng.int(1, 3) : 0))), ovr, 95);
  const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 4)), 20, 97);
  const prof = PROFILE[pos] ?? [0, 0, 0, 0, 0, 0];
  const positions: Pos[] = [pos];
  if (ALT[pos] && rng.chance(0.55)) positions.push(rng.pick(ALT[pos]!));
  const p: Player = {
    id: `f${++pid}`,
    name, shortName: short, clubId, positions, age, birthYear: cfg.seasonYear - age,
    nationality: NAT_LABEL[n] ?? n, foot: pos === "LI" || pos === "EI" ? (rng.chance(0.7) ? "Zurdo" : "Diestro") : rng.chance(0.22) ? "Zurdo" : "Diestro",
    ovr, pot,
    pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0,
    pen: 0, fk: 0, hea: 0, crn: 0,
  };
  if (pos === "POR") {
    Object.assign(p, { pac: a(-35), sho: a(-55), pas: a(-25), dri: a(-30), def: a(-55), phy: a(-15) });
    p.gk = { div: a(0), han: a(-2), kic: a(-8), ref: a(1), pos: a(-1) };
    Object.assign(p, { pen: a(-50), fk: a(-55), hea: a(-50), crn: a(-55) });
  } else {
    Object.assign(p, { pac: a(prof[0]), sho: a(prof[1]), pas: a(prof[2]), dri: a(prof[3]), def: a(prof[4]), phy: a(prof[5]) });
    Object.assign(p, { pen: a(prof[1] - 4), fk: a(prof[2] - 10), hea: a(pos === "DFC" || pos === "DC" ? 0 : -14), crn: a(prof[2] - 6) });
  }
  p.value = Math.round(Math.pow(Math.max(0, ovr - 55), 2.6) * (age < 24 ? 900 : age > 30 ? 350 : 650) / 1000) * 1000;
  return p;
}

const clubs: Club[] = [];
const players: Player[] = [];
const COLORS = ["#c8102e", "#1d428a", "#034694", "#fdb913", "#6cabdd", "#132257", "#7a263a", "#00a650", "#ef0107", "#241f20", "#ffffff", "#f58220", "#5c2d91", "#0f9d58", "#e30613", "#003399", "#000000", "#ffd700", "#8b0000", "#87ceeb"];
let cid = 0;
function makeClub(country: string, leagueId: string | null, level: number) {
  const cities = CITY[country] ?? CITY.GEN;
  const suf = SUFFIX[country] ?? SUFFIX.GEN;
  let name = "";
  for (let i = 0; i < 100; i++) {
    name = rng.pick(suf).replace("{c}", rng.pick(cities));
    if (!clubs.some((c) => c.name === name)) break;
  }
  const words = name.replace(/^(FC|AC|AS|SS|US|SV|VfB|TSV|SC|1\. FC|VfL|UD|CD|SD|RC|AJ|EA|FK|SK) /, "").split(" ");
  const short = (words[0].slice(0, 3)).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const c1 = rng.pick(COLORS);
  let c2 = rng.pick(COLORS);
  while (c2 === c1) c2 = rng.pick(COLORS);
  const club: Club = { id: `c${++cid}`, name, short, country, leagueId, colors: [c1, c2], reputation: Math.round(level) };
  clubs.push(club);
  let shirt = 1;
  for (const [pos, n] of SQUAD) {
    for (let k = 0; k < n; k++) {
      const role = k === 0 ? 0 : k === 1 && (pos === "DFC" || pos === "MC") ? 0 : k === 1 ? -4 : -7;
      const pl = makePlayer(club.id, pos, level + role + (pos === "POR" && k > 0 ? -5 : 0), country);
      pl.shirt = shirt++;
      players.push(pl);
    }
  }
  // 2 juveniles
  for (let k = 0; k < 2; k++) {
    const pl = makePlayer(club.id, rng.pick(["DFC", "MC", "ED", "DC"] as Pos[]), level - 12, country);
    pl.age = rng.int(17, 19); pl.birthYear = cfg.seasonYear - pl.age; pl.pot = clamp(pl.ovr + rng.int(10, 22), pl.ovr, 92); pl.youth = true; pl.shirt = shirt++;
    players.push(pl);
  }
}

// fuerza media por liga: [mejor, peor]
const LEVELS: Record<string, [number, number]> = {
  ENG1: [85, 75], ESP1: [86, 72], ITA1: [84, 71], GER1: [85, 70], FRA1: [84, 69],
  ENG2: [74, 66], ESP2: [71, 64], ITA2: [70, 63], GER2: [72, 64], FRA2: [69, 62],
};
for (const lg of cfg.leagues) {
  const [hi, lo] = LEVELS[lg.id];
  for (let i = 0; i < lg.teams; i++) {
    const t = i / (lg.teams - 1);
    const lvl = hi - (hi - lo) * Math.pow(t, 0.8) + rng.normal(0, 0.8);
    makeClub(lg.country, lg.id, lvl);
  }
}
// Otros países (clubes europeos sin liga simulada)
const OTHER_N: Record<string, number> = { POR: 6, NED: 6, BEL: 5, TUR: 5, SCO: 4, AUT: 4, SUI: 4, CZE: 4, GRE: 4, DEN: 4, NOR: 3, CRO: 3, SRB: 3, UKR: 3, POL: 3, CYP: 3, SWE: 3, ISR: 2, HUN: 2, ROU: 2 };
const OTHER_TOP: Record<string, number> = { POR: 81, NED: 80, BEL: 77, TUR: 78, SCO: 75, AUT: 74, SUI: 73, CZE: 73, GRE: 74, DEN: 73, NOR: 71, CRO: 73, SRB: 72, UKR: 72, POL: 71, CYP: 70, SWE: 70, ISR: 69, HUN: 69, ROU: 69 };
for (const [c, n] of Object.entries(OTHER_N)) {
  for (let i = 0; i < n; i++) makeClub(c, null, OTHER_TOP[c] - i * 1.8 + rng.normal(0, 0.8));
}
// agentes libres
for (let i = 0; i < 40; i++) {
  const pos = rng.pick(SQUAD.map((s) => s[0]));
  const p = makePlayer(null, pos, 66 + rng.normal(0, 4), "GEN");
  p.age = rng.int(28, 35);
  players.push(p);
}

const meta = { source: "DATOS DE DEMOSTRACIÓN FICTICIOS generados por scripts/generate-demo-data.ts (no son clubes ni jugadores reales)", updated: new Date().toISOString().slice(0, 10), demo: true };
writeFileSync("data/football/clubs.json", JSON.stringify({ meta, clubs }));
writeFileSync("data/football/players.json", JSON.stringify({ meta, players }));
console.log(`Fútbol: ${clubs.length} clubes, ${players.length} jugadores (demo).`);

// ===================== NFL (roster de demostración) =====================
const nflTeams = JSON.parse(readFileSync("data/nfl/teams.json", "utf8")).teams as { id: string }[];
const NFL_ROSTER: [NflPos, number][] = [["QB", 3], ["RB", 4], ["WR", 6], ["TE", 3], ["OT", 4], ["OG", 4], ["C", 2], ["DE", 4], ["DT", 4], ["LB", 6], ["CB", 6], ["S", 4], ["K", 1], ["P", 1], ["LS", 1]];
const NFL_FIRST = ["Jalen", "Tyler", "Marcus", "Derrick", "Brandon", "Caleb", "Trey", "Jordan", "Malik", "Andre", "Cole", "Blake", "Darius", "Isaiah", "Josh", "Kendall", "Lamar", "Nate", "Quinton", "Reggie", "Shane", "Travis", "Wyatt", "Zach", "Austin", "Bryce", "Cody", "Devin", "Elijah", "Garrett"];
const NFL_LAST = ["Anderson", "Brooks", "Carter", "Dawson", "Ellis", "Foster", "Graves", "Hayes", "Irving", "Jennings", "Knox", "Lawson", "Mitchell", "Nash", "Owens", "Porter", "Quarles", "Reeves", "Sutton", "Tate", "Underwood", "Vance", "Whitfield", "Young", "Barrett", "Coleman", "Dixon", "Fuller", "Griffin", "Holt"];
const nflPlayers: NflPlayer[] = [];
let nid = 0;
for (const t of nflTeams) {
  const level = 74 + rng.normal(0, 3);
  for (const [pos, n] of NFL_ROSTER) {
    for (let k = 0; k < n; k++) {
      const role = k === 0 ? 4 : k === 1 && ["WR", "OT", "OG", "DE", "DT", "LB", "CB", "S"].includes(pos) ? 3 : k < 3 ? -3 : -8;
      const ovr = clamp(Math.round(level + role + rng.normal(0, 4) + (pos === "QB" && k === 0 ? rng.normal(2, 5) : 0)), 45, 99);
      const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 5)), 25, 99);
      const age = clamp(Math.round(rng.normal(26.5, 3.2)), 21, 38);
      nflPlayers.push({
        id: `n${++nid}`, name: `${rng.pick(NFL_FIRST)} ${rng.pick(NFL_LAST)}`, teamId: t.id, pos, ovr, age, number: 0, practiceSquad: false,
        spd: a({ QB: -12, RB: 6, WR: 8, TE: -4, OT: -30, OG: -32, C: -32, DE: -6, DT: -18, LB: -2, CB: 8, S: 4, K: -30, P: -30, LS: -30 }[pos]),
        str: a({ QB: -20, RB: -8, WR: -20, TE: -2, OT: 6, OG: 8, C: 5, DE: 2, DT: 8, LB: -2, CB: -25, S: -15, K: -40, P: -40, LS: -10 }[pos]),
        thp: a(pos === "QB" ? 4 : -40), tha: a(pos === "QB" ? 0 : -45),
        cth: a({ WR: 2, TE: -2, RB: -8 }[pos as string] ?? -40), car: a(pos === "RB" ? 0 : -30),
        rbk: a(["OT", "OG", "C"].includes(pos) ? 0 : pos === "TE" ? -8 : -40), pbk: a(["OT", "OG", "C"].includes(pos) ? 0 : pos === "TE" ? -12 : -40),
        tak: a(["LB", "S"].includes(pos) ? 0 : ["DE", "DT", "CB"].includes(pos) ? -4 : -45), prs: a(["DE", "DT"].includes(pos) ? 0 : pos === "LB" ? -12 : -45),
        cov: a(["CB", "S"].includes(pos) ? 0 : pos === "LB" ? -12 : -45),
        kpw: a(pos === "K" || pos === "P" ? 2 : -50), kac: a(pos === "K" || pos === "P" ? 0 : -50),
      });
    }
  }
  // practice squad (16)
  for (let k = 0; k < 16; k++) {
    const pos = rng.pick(NFL_ROSTER.map((r) => r[0]).filter((p) => p !== "LS" && p !== "K" && p !== "P"));
    const ovr = clamp(Math.round(level - 14 + rng.normal(0, 3)), 45, 75);
    const a = (d: number) => clamp(Math.round(ovr + d + rng.normal(0, 5)), 25, 99);
    nflPlayers.push({ id: `n${++nid}`, name: `${rng.pick(NFL_FIRST)} ${rng.pick(NFL_LAST)}`, teamId: t.id, pos, ovr, age: rng.int(22, 26), number: 0, practiceSquad: true,
      spd: a(0), str: a(-5), thp: a(pos === "QB" ? 0 : -40), tha: a(pos === "QB" ? 0 : -45), cth: a(-10), car: a(-10), rbk: a(-20), pbk: a(-20), tak: a(-10), prs: a(-20), cov: a(-15), kpw: a(-50), kac: a(-50) });
  }
}
const nmeta = { source: "DATOS DE DEMOSTRACIÓN FICTICIOS (jugadores inventados; equipos, divisiones y colores reales)", updated: new Date().toISOString().slice(0, 10), demo: true };
writeFileSync("data/nfl/players.json", JSON.stringify({ meta: nmeta, players: nflPlayers }));
console.log(`NFL: ${nflPlayers.length} jugadores (demo).`);
