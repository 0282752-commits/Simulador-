// Motor de partido NFL jugada por jugada.
import { Rng, clamp } from "../../lib/rng";
import type { DepthSlot, NflPlayer, NflPlayerLine, NflPlayLog, NflResult, NflTeam, NflTeamStats } from "./types";
import { DEPTH_STARTERS } from "./types";

export interface NflGameInput { team: NflTeam; roster: NflPlayer[]; depth: Record<DepthSlot, string[]> }
export interface NflGameOpts { neutral?: boolean; playoff?: boolean; seed?: number }

export const NCAL = {
  runMean: 4.3, runSd: 4.2, runK: 0.07, breakaway: 0.02,
  sackBase: 0.064, sackK: 0.045,
  cmpShort: 0.77, cmpMid: 0.575, cmpDeep: 0.395, cmpK: 0.006,
  intShort: 0.012, intMid: 0.026, intDeep: 0.049,
  fumbleRun: 0.009, fumbleCatch: 0.006,
  penalty: 0.088,
  passRate: 0.58,
  homeEdge: 1.9, // puntos de "rating" a favor del local
  runClock: 38.5, hurryClock: 14,
  // medias de referencia (titulares de Madden NFL 27): el motor mide cada equipo contra ellas
  ref: { qb: 85.8, qbSpd: 85, rb: 87.8, recvCover: 11.5, runGap: -6.5, rushGap: -4.2, k: 86, kpw: 95.5, p: 93.6 },
};

interface Units { qb: number; qbSpd: number; qbPow: number; rb: number; recv: number; olPass: number; olRun: number; rush: number; runStop: number; cover: number; k: number; kpw: number; p: number }

interface SideState {
  input: NflGameInput;
  byId: Map<string, NflPlayer>;
  depth: Record<DepthSlot, string[]>;
  out: Set<string>; // lesionados en el partido
  u: Units;
  timeouts: number;
}

const zeroStats = (): NflTeamStats => ({ yards: 0, passYds: 0, rushYds: 0, plays: 0, firstDowns: 0, turnovers: 0, sacks: 0, penalties: 0, penYds: 0, top: 0, thirdAtt: 0, thirdConv: 0 });

export class NflGameSim {
  rng: Rng;
  sides: [SideState, SideState];
  opts: NflGameOpts;
  q = 1;
  clock = 900;
  poss: 0 | 1 = 0;
  ball = 25;
  down = 1;
  togo = 10;
  score: [number, number] = [0, 0];
  quarters: [number[], number[]] = [[0, 0, 0, 0], [0, 0, 0, 0]];
  phase: "kickoff" | "play" | "pat" | "end" = "kickoff";
  kicker: 0 | 1 = 0; // quien patea la próxima patada inicial
  openingReceiver: 0 | 1 = 0;
  clockRunning = false;
  twoMinWarned = false;
  log: NflPlayLog[] = [];
  stats: [NflTeamStats, NflTeamStats] = [zeroStats(), zeroStats()];
  lines: Record<string, NflPlayerLine> = {};
  scoring: NflResult["scoring"] = [];
  injuries: { player: string; weeks: number }[] = [];
  ot = false;
  otPoss: [number, number] = [0, 0];
  onsideNext = false;
  seed: number;

  constructor(home: NflGameInput, away: NflGameInput, opts: NflGameOpts = {}) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = new Rng(this.seed);
    this.opts = opts;
    this.sides = [this.mk(home), this.mk(away)];
    this.openingReceiver = this.rng.chance(0.5) ? 0 : 1;
    this.kicker = (1 - this.openingReceiver) as 0 | 1;
  }

  private mk(input: NflGameInput): SideState {
    const s: SideState = { input, byId: new Map(input.roster.map((p) => [p.id, p])), depth: input.depth, out: new Set(), u: null as unknown as Units, timeouts: 3 };
    s.u = this.units(s);
    return s;
  }

  starters(s: SideState, slot: DepthSlot, n = DEPTH_STARTERS[slot]): NflPlayer[] {
    return s.depth[slot].filter((id) => !s.out.has(id)).map((id) => s.byId.get(id)).filter((p): p is NflPlayer => !!p).slice(0, n);
  }

  private units(s: SideState): Units {
    const av = (ps: NflPlayer[], f: (p: NflPlayer) => number, def = 45) => (ps.length ? ps.reduce((a, p) => a + f(p), 0) / ps.length : def);
    const qb = this.starters(s, "QB")[0];
    const rb = this.starters(s, "RB");
    const wr = this.starters(s, "WR");
    const te = this.starters(s, "TE");
    const ol = this.starters(s, "OL");
    const dl = this.starters(s, "DL");
    const lb = this.starters(s, "LB");
    const cb = this.starters(s, "CB");
    const sf = this.starters(s, "S");
    const k = this.starters(s, "K")[0];
    const p = this.starters(s, "P")[0];
    return {
      qb: qb ? qb.tha * 0.7 + qb.ovr * 0.3 : 45, qbSpd: qb?.spd ?? 50, qbPow: qb?.thp ?? 50,
      rb: av(rb, (x) => x.car * 0.5 + x.spd * 0.3 + x.str * 0.2),
      recv: av([...wr, ...te], (x) => x.cth * 0.6 + x.spd * 0.4),
      olPass: av(ol, (x) => x.pbk) + (ol.length < 5 ? -8 : 0),
      olRun: av(ol, (x) => x.rbk) * 0.85 + av(te, (x) => x.rbk) * 0.15,
      rush: av(dl, (x) => x.prs) * 0.75 + av(lb, (x) => x.prs) * 0.25,
      runStop: av(dl, (x) => (x.str + x.tak) / 2) * 0.5 + av(lb, (x) => x.tak) * 0.5,
      cover: av(cb, (x) => x.cov) * 0.5 + av(sf, (x) => x.cov) * 0.3 + av(lb, (x) => x.cov) * 0.2,
      k: k ? k.kac : 60, kpw: k ? k.kpw : 60, p: p ? p.kpw : 60,
    };
  }

  setDepth(side: 0 | 1, depth: Record<DepthSlot, string[]>) {
    this.sides[side].depth = depth;
    this.sides[side].u = this.units(this.sides[side]);
  }

  get finished() { return this.phase === "end"; }
  line(id: string, side: 0 | 1): NflPlayerLine { return (this.lines[id] ??= { side }); }
  abbr(s: 0 | 1) { return this.sides[s].input.team.abbr; }
  name(p?: NflPlayer) { return p ? p.name.split(" ").slice(-1)[0] : "?"; }

  spot(): string {
    const b = Math.round(this.ball);
    if (b === 50) return "medio campo";
    return b < 50 ? `${this.abbr(this.poss)} ${b}` : `${this.abbr((1 - this.poss) as 0 | 1)} ${100 - b}`;
  }
  clockStr(c = this.clock) { const m = Math.floor(c / 60), s = Math.floor(c % 60); return `${m}:${String(s).padStart(2, "0")}`; }
  downStr() { return `${["", "1º", "2º", "3º", "4º"][this.down]} y ${this.ball + this.togo >= 100 ? "gol" : this.togo}`; }

  private push(type: string, yards: number, text: string, scoring = false) {
    const e: NflPlayLog = { q: this.q, clock: this.clock, off: this.poss, down: this.down, togo: this.togo, yardline: this.ball, type, yards, text, score: [...this.score] as [number, number], scoring };
    this.log.push(e);
    return e;
  }

  private addScore(s: 0 | 1, pts: number, text: string) {
    this.score[s] += pts;
    const qi = Math.min(this.q, 4) - 1;
    if (this.q <= 4) this.quarters[s][qi] += pts;
    else { while (this.quarters[s].length < this.q) this.quarters[s].push(0); this.quarters[s][this.q - 1] += pts; }
    this.scoring.push({ q: this.q, clock: this.clock, side: s, text });
  }

  runToEnd(): NflResult {
    let g = 0;
    while (!this.finished && g++ < 3000) this.step();
    return this.result();
  }

  step(): NflPlayLog[] {
    const start = this.log.length;
    if (this.phase === "kickoff") this.kickoff();
    else if (this.phase === "pat") this.pat();
    else if (this.phase === "play") this.play();
    return this.log.slice(start);
  }

  // ===== Reloj =====
  private hurry(side: 0 | 1): boolean {
    const diff = this.score[side] - this.score[1 - side];
    return this.ot || (this.q === 2 && this.clock < 120) || (this.q >= 4 && diff < 0 && this.clock < 300);
  }

  private runClock(playSecs: number, stops: boolean) {
    let t = playSecs;
    const off = this.poss;
    const def = (1 - off) as 0 | 1;
    if (!stops) {
      // tiempo entre jugadas
      let between = this.hurry(off) ? NCAL.hurryClock : NCAL.runClock - 6;
      const lead = this.score[off] - this.score[def];
      if (this.q >= 4 && lead > 0 && this.clock < 420) between = 38; // gastar reloj
      // tiempo muerto del equipo que va perdiendo
      const trailing = lead > 0 ? def : lead < 0 ? off : null;
      if (trailing !== null && this.q >= 4 && this.clock < 150 && this.sides[trailing].timeouts > 0) {
        this.sides[trailing].timeouts--;
        this.push("timeout", 0, `Tiempo muerto de ${this.abbr(trailing)} (le quedan ${this.sides[trailing].timeouts}).`);
        between = 0;
      }
      t += between;
    }
    this.stats[off].top += t;
    const before = this.clock;
    this.clock -= t;
    if ((this.q === 2 || this.q === 4) && before > 120 && this.clock <= 120 && !this.twoMinWarned) {
      this.clock = 120;
      this.twoMinWarned = true;
      this.push("aviso", 0, "Aviso de los dos minutos.");
    }
    if (this.clock <= 0) {
      if (this.phase === "pat") this.clock = 0;
      else this.endPeriod();
    }
  }

  private endPeriod() {
    this.clock = 0;
    if (this.phase === "end") return;
    if (this.q === 1 || this.q === 3) {
      this.push("cuarto", 0, `Fin del ${this.q}º cuarto: ${this.abbr(0)} ${this.score[0]} - ${this.score[1]} ${this.abbr(1)}.`);
      this.q++;
      this.clock = 900;
      return;
    }
    if (this.q === 2) {
      this.push("medio", 0, `Medio tiempo: ${this.abbr(0)} ${this.score[0]} - ${this.score[1]} ${this.abbr(1)}.`);
      this.q = 3;
      this.clock = 900;
      this.twoMinWarned = false;
      this.sides[0].timeouts = 3; this.sides[1].timeouts = 3;
      this.kicker = this.openingReceiver;
      this.phase = "kickoff";
      return;
    }
    // fin del 4º cuarto o de una prórroga
    if (this.score[0] !== this.score[1]) return this.finish();
    if (this.q >= 5 && !this.opts.playoff) return this.finish();
    // prórroga
    this.q++;
    this.ot = true;
    this.otPoss = [0, 0];
    this.clock = this.opts.playoff ? 900 : 600;
    this.twoMinWarned = false;
    this.sides[0].timeouts = this.opts.playoff ? 3 : 2; this.sides[1].timeouts = this.sides[0].timeouts;
    const rec = this.rng.chance(0.5) ? 0 : 1;
    this.kicker = (1 - rec) as 0 | 1;
    this.phase = "kickoff";
    this.push("prorroga", 0, `¡Prórroga! ${this.abbr(rec as 0 | 1)} gana el volado y recibe.`);
  }

  private finish() {
    this.phase = "end";
    const tie = this.score[0] === this.score[1];
    this.push("final", 0, `FINAL${this.ot ? " (prórroga)" : ""}: ${this.sides[0].input.team.name} ${this.score[0]} - ${this.score[1]} ${this.sides[1].input.team.name}${tie ? " · Empate" : ""}.`);
  }

  // Prórroga: ¿termina el partido?
  private otCheckAfterScore(scorer: 0 | 1) {
    if (!this.ot) return;
    const other = (1 - scorer) as 0 | 1;
    // quien anota termina su posesión
    this.otPoss[scorer]++;
    if (this.otPoss[other] >= 1 && this.score[scorer] > this.score[other]) this.finish();
  }
  private otPossessionEnded(side: 0 | 1) {
    if (!this.ot) return;
    this.otPoss[side]++;
    const other = (1 - side) as 0 | 1;
    if (this.otPoss[0] >= 1 && this.otPoss[1] >= 1 && this.score[0] !== this.score[1]) this.finish();
    void other;
  }

  private changePossession(newBall: number) {
    const prev = this.poss;
    this.poss = (1 - this.poss) as 0 | 1;
    this.ball = clamp(newBall, 1, 99);
    this.down = 1;
    this.togo = Math.min(10, 100 - this.ball);
    this.otPossessionEnded(prev);
  }

  // ===== Patadas =====
  private kickoff() {
    const k = this.kicker;
    const r = (1 - k) as 0 | 1;
    const diff = this.score[k] - this.score[r];
    const onside = this.q >= 4 && !this.ot && diff < 0 && diff >= -16 && this.clock < 180;
    this.poss = r;
    this.phase = "play";
    this.twoMinWarned = this.twoMinWarned && this.clock <= 120;
    if (onside) {
      if (this.rng.chance(0.12)) {
        this.poss = k;
        this.ball = 47; this.down = 1; this.togo = 10;
        this.push("onside", 0, `¡Patada corta de ${this.abbr(k)}... y la recuperan! Balón en ${this.spot()}.`);
      } else {
        this.ball = 55; this.down = 1; this.togo = 10;
        this.push("onside", 0, `Patada corta de ${this.abbr(k)}; la asegura ${this.abbr(r)} en ${this.spot()}.`);
      }
      this.runClock(4, true);
      return;
    }
    const roll = this.rng.next();
    if (roll < 0.62) {
      this.ball = 35; this.down = 1; this.togo = 10;
      this.push("kickoff", 0, `Patada inicial de ${this.abbr(k)}: touchback, ${this.abbr(r)} empieza en su 35.`);
    } else if (roll < 0.623) {
      const ret = this.starters(this.sides[r], "WR", 4)[3] ?? this.starters(this.sides[r], "RB", 2)[1];
      this.push("kickoff", 100, `¡Patada de ${this.abbr(k)} devuelta hasta la end zone por ${this.name(ret)}! TOUCHDOWN.`, true);
      this.touchdown(r, ret?.id, "retorno");
      this.runClock(12, true);
      return;
    } else {
      const yd = clamp(Math.round(this.rng.normal(29, 7)), 12, 60);
      this.ball = yd; this.down = 1; this.togo = 10;
      this.push("kickoff", yd, `Patada inicial de ${this.abbr(k)}, retorno hasta la ${this.spot()}.`);
    }
    this.runClock(6, true);
  }

  private fgProb(dist: number): number {
    const s = this.sides[this.poss].u;
    const base = dist < 30 ? 0.985 : dist < 40 ? 0.93 : dist < 50 ? 0.83 : dist < 55 ? 0.72 : dist < 60 ? 0.58 : 0.35;
    const maxD = 55 + (s.kpw - NCAL.ref.kpw) * 0.35;
    const acc = (s.k - NCAL.ref.k) * 0.004;
    return clamp(base + acc - (dist > maxD ? (dist - maxD) * 0.06 : 0), 0.02, 0.995);
  }

  private fieldGoal() {
    const s = this.poss;
    const dist = Math.round(100 - this.ball + 17);
    const k = this.starters(this.sides[s], "K")[0];
    const l = k ? this.line(k.id, s) : undefined;
    if (l) l.fga = (l.fga ?? 0) + 1;
    const made = this.rng.chance(this.fgProb(dist));
    if (made) {
      if (l) l.fgm = (l.fgm ?? 0) + 1;
      this.addScore(s, 3, `FG de ${dist} yardas de ${this.name(k)}`);
      this.push("fg", 0, `¡${this.name(k)} convierte el gol de campo de ${dist} yardas! ${this.abbr(0)} ${this.score[0]}-${this.score[1]} ${this.abbr(1)}.`, true);
      this.kicker = s;
      this.phase = "kickoff";
      this.runClock(5, true);
      this.otCheckAfterScore(s);
    } else {
      this.push("fg_fallado", 0, `${this.name(k)} falla el gol de campo de ${dist} yardas.`);
      this.runClock(5, true);
      this.changePossession(Math.max(20, 100 - this.ball - 7));
    }
  }

  private punt() {
    const s = this.poss;
    const p = this.starters(this.sides[s], "P")[0];
    const l = p ? this.line(p.id, s) : undefined;
    if (this.rng.chance(0.005)) {
      this.push("punt", 0, `¡Despeje BLOQUEADO! ${this.abbr((1 - s) as 0 | 1)} recupera en ${this.spot()}.`);
      this.runClock(5, true);
      this.changePossession(100 - this.ball + 8);
      return;
    }
    const gross = clamp(Math.round(this.rng.normal(47 + (this.sides[s].u.p - NCAL.ref.p) * 0.15, 6)), 25, 70);
    let land = this.ball + gross;
    let text: string;
    if (l) { l.punts = (l.punts ?? 0) + 1; l.puntYds = (l.puntYds ?? 0) + gross; }
    if (land >= 100) {
      text = `Despeje de ${this.name(p)} de ${gross} yardas, touchback.`;
      this.push("punt", gross, text);
      this.runClock(8, true);
      this.changePossession(20);
      return;
    }
    const ret = this.rng.chance(0.45) ? 0 : clamp(Math.round(this.rng.normal(9, 7)), -2, 40);
    land -= ret;
    text = `Despeje de ${this.name(p)} de ${gross} yardas${ret ? `, retorno de ${ret}` : ", recepción limpia"}.`;
    this.push("punt", gross, text);
    this.runClock(8, true);
    this.changePossession(100 - land);
  }

  private touchdown(s: 0 | 1, playerId: string | undefined, how: string) {
    this.addScore(s, 6, `TD ${how}${playerId ? " de " + this.name(this.sides[s].byId.get(playerId)) : ""}`);
    this.poss = s;
    this.phase = "pat";
    if (this.ot) {
      // en prórroga, un TD del segundo equipo que se pone arriba termina el partido
      const other = (1 - s) as 0 | 1;
      if (this.otPoss[other] >= 1 && this.score[s] > this.score[other]) { this.otPoss[s]++; this.finish(); }
    }
  }

  private pat() {
    const s = this.poss;
    const o = (1 - s) as 0 | 1;
    const diff = this.score[s] - this.score[o];
    const late = this.q >= 4 && this.clock < 600;
    const goFor2 = (late && [-2, -5, -10, 1, 5, -16, -13].includes(diff)) || this.rng.chance(0.03);
    if (goFor2) {
      const ok = this.rng.chance(0.47 + (this.sides[s].u.qb - this.sides[o].u.cover) * 0.004);
      if (ok) this.addScore(s, 2, "Conversión de 2 puntos");
      this.push("dos_puntos", 0, ok ? `¡Conversión de dos puntos buena! ${this.abbr(0)} ${this.score[0]}-${this.score[1]} ${this.abbr(1)}.` : "Falla la conversión de dos puntos.", ok);
    } else {
      const k = this.starters(this.sides[s], "K")[0];
      const l = k ? this.line(k.id, s) : undefined;
      if (l) l.xpa = (l.xpa ?? 0) + 1;
      const ok = this.rng.chance(clamp(0.957 + (this.sides[s].u.k - NCAL.ref.k) * 0.002, 0.8, 0.995));
      if (ok) { this.addScore(s, 1, "Punto extra"); if (l) l.xpm = (l.xpm ?? 0) + 1; }
      this.push("extra", 0, ok ? `Punto extra bueno. ${this.abbr(0)} ${this.score[0]}-${this.score[1]} ${this.abbr(1)}.` : `¡${this.name(k)} falla el punto extra!`, ok);
    }
    this.kicker = s;
    this.phase = this.phase === "end" as string ? "end" : "kickoff";
    if (this.ot) this.otCheckAfterScore(s);
    if (this.clock <= 0) this.endPeriod();
  }

  // ===== Jugada de scrimmage =====
  private decideFourth(): "go" | "fg" | "punt" {
    const s = this.poss;
    const diff = this.score[s] - this.score[1 - s];
    const dist = 100 - this.ball + 17;
    const fgRange = dist <= 53 + (this.sides[s].u.kpw - NCAL.ref.kpw) * 0.3;
    const lateTrail = this.q >= 4 && diff < 0 && this.clock < 300;
    if (lateTrail && (diff < -3 || !fgRange)) return "go";
    if (this.q >= 4 && this.clock < 5 && diff >= -3 && diff <= 0 && fgRange) return "fg";
    if (this.ot && fgRange && diff >= -3) return "fg";
    if (this.togo <= 1 && this.ball >= 40 && this.ball <= 97) return this.rng.chance(0.62) ? "go" : fgRange ? "fg" : "punt";
    if (this.togo <= 3 && this.ball >= 55 && this.ball < 70 && !fgRange) return this.rng.chance(0.5) ? "go" : "punt";
    if (this.togo <= 2 && this.ball >= 45 && this.ball < 60) return this.rng.chance(0.4) ? "go" : "punt";
    if (fgRange) return "fg";
    return "punt";
  }

  private play() {
    const s = this.poss;
    const o = (1 - s) as 0 | 1;
    const off = this.sides[s], def = this.sides[o];
    const diff = this.score[s] - this.score[o];
    // rodilla para cerrar
    if (this.q >= 4 && diff > 0 && this.clock <= 110 && this.down <= 3 && this.clock <= (4 - this.down) * 40 + def.timeouts * 40) {
      this.push("rodilla", -1, `${this.downStr()} en ${this.spot()}: ${this.name(this.starters(off, "QB")[0])} se arrodilla.`);
      this.ball -= 1; this.down++; this.stats[s].plays++;
      this.runClock(2, false);
      if (this.down > 4) this.changePossession(100 - this.ball);
      return;
    }
    if (this.down === 4) {
      const d = this.decideFourth();
      if (d === "fg") return this.fieldGoal();
      if (d === "punt") return this.punt();
    }
    if (this.down === 3) this.stats[s].thirdAtt++;
    // castigos
    if (this.rng.chance(NCAL.penalty)) {
      const offensive = this.rng.chance(0.52);
      const pen = offensive ? this.rng.pick([["salida en falso", 5], ["holding ofensivo", 10], ["retraso del juego", 5]] as const) : this.rng.pick([["fuera de lugar", 5], ["holding defensivo", 5], ["interferencia de pase", 15], ["rudeza innecesaria", 15]] as const);
      const who = offensive ? s : o;
      this.stats[who].penalties++; this.stats[who].penYds += pen[1];
      if (offensive) {
        const y = Math.min(pen[1], Math.floor(this.ball / 2));
        this.ball -= y; this.togo += y;
        this.push("castigo", -y, `Castigo: ${pen[0]} contra ${this.abbr(s)}, ${y} yardas. Se repite el down.`);
      } else {
        const y = Math.min(pen[1], Math.floor((100 - this.ball) / 2));
        this.ball += y; this.togo -= y;
        const auto = pen[1] >= 15 || pen[0] === "holding defensivo";
        if (this.togo <= 0 || auto) { this.down = 1; this.togo = Math.min(10, 100 - this.ball); this.stats[s].firstDowns++; }
        this.push("castigo", y, `Castigo: ${pen[0]} contra ${this.abbr(o)}, ${y} yardas${auto ? " y primero automático" : ""}.`);
      }
      this.runClock(0, true);
      return;
    }
    // ¿pase o carrera?
    let pr = NCAL.passRate;
    if (this.down === 3 && this.togo >= 7) pr = 0.88;
    else if (this.down === 3 && this.togo <= 2) pr = 0.42;
    else if (this.down === 2 && this.togo >= 8) pr = 0.66;
    else if (this.down === 1) pr = 0.5;
    if (this.hurry(s)) pr = 0.82;
    if (this.q >= 4 && diff > 7 && this.clock < 420) pr = 0.28;
    if (this.down === 4) pr = this.togo <= 2 ? 0.45 : 0.85;
    pr += (off.u.qb - NCAL.ref.qb) * 0.004 - (off.u.rb - NCAL.ref.rb) * 0.002;
    const home = this.opts.neutral ? 0 : s === 0 ? NCAL.homeEdge : -NCAL.homeEdge;
    this.stats[s].plays++;
    const startDown = this.down;
    const res = this.rng.chance(pr) ? this.pass(s, o, home) : this.run(s, o, home);
    if (res === "turnover" || res === "score") return;
    if (startDown === 3 && this.down === 1) this.stats[s].thirdConv++;
  }

  private tackler(o: 0 | 1, kind: "run" | "pass"): NflPlayer | undefined {
    const d = this.sides[o];
    const pool = kind === "run" ? [...this.starters(d, "LB"), ...this.starters(d, "DL"), ...this.starters(d, "S")] : [...this.starters(d, "CB"), ...this.starters(d, "S"), ...this.starters(d, "LB")];
    return pool.length ? this.rng.weighted(pool, (p) => p.tak + (kind === "run" && p.pos === "LB" ? 30 : 0)) : undefined;
  }

  // avanza el balón y gestiona downs/TD. Devuelve "score" si anotó.
  private gain(s: 0 | 1, y: number, scorerId: string | undefined, how: string): "score" | "ok" | "turnover" {
    if (this.ball + y >= 100) {
      this.touchdown(s, scorerId, how);
      return "score";
    }
    if (this.ball + y <= 0) {
      // safety
      const o = (1 - s) as 0 | 1;
      this.addScore(o, 2, "Safety");
      this.push("safety", y, `¡SAFETY! ${this.abbr(o)} suma 2 puntos.`, true);
      this.kicker = s;
      this.phase = "kickoff";
      this.otPossessionEnded(s);
      return "score";
    }
    this.ball += y;
    this.togo -= y;
    if (this.togo <= 0) {
      this.down = 1;
      this.togo = Math.min(10, 100 - this.ball);
      this.stats[s].firstDowns++;
    } else {
      this.down++;
      if (this.down > 4) {
        this.push("downs", 0, `¡Pérdida por downs! ${this.abbr((1 - s) as 0 | 1)} toma el balón.`);
        this.changePossession(100 - this.ball);
        return "turnover";
      }
    }
    return "ok";
  }

  private run(s: 0 | 1, o: 0 | 1, home: number): "score" | "ok" | "turnover" {
    const off = this.sides[s], def = this.sides[o];
    const rbs = this.starters(off, "RB", 2);
    const carrier = rbs.length ? (this.rng.chance(0.78) || rbs.length < 2 ? rbs[0] : rbs[1]) : this.starters(off, "QB")[0];
    const edge = off.u.olRun - def.u.runStop - NCAL.ref.runGap + (off.u.rb - NCAL.ref.rb) * 0.4 + home;
    let y = Math.round(this.rng.normal(NCAL.runMean + edge * NCAL.runK - 0.4, NCAL.runSd));
    if (this.rng.chance(NCAL.breakaway * Math.exp(edge * 0.03))) y = this.rng.int(12, 50) + (this.rng.chance(0.2) ? this.rng.int(0, 35) : 0);
    y = Math.max(y, -6);
    const pre = this.downStr() + " en " + this.spot();
    const l = this.line(carrier.id, s);
    l.rushAtt = (l.rushAtt ?? 0) + 1;
    const capped = Math.min(y, 100 - this.ball);
    l.rushYds = (l.rushYds ?? 0) + capped;
    this.stats[s].rushYds += capped; this.stats[s].yards += capped;
    const t = this.tackler(o, "run");
    if (t && capped < 100 - this.ball) { const tl = this.line(t.id, o); tl.tkl = (tl.tkl ?? 0) + 1; }
    this.maybeInjury(s, carrier);
    // fumble
    if (this.rng.chance(NCAL.fumbleRun) && capped < 100 - this.ball) {
      l.fum = (l.fum ?? 0) + 1;
      if (t) { const tl = this.line(t.id, o); tl.ff = (tl.ff ?? 0) + 1; }
      this.stats[s].turnovers++;
      this.push("fumble", capped, `${pre}: carrera de ${this.name(carrier)}... ¡FUMBLE! Recupera ${this.abbr(o)}.`);
      this.runClock(6, true);
      this.changePossession(100 - (this.ball + capped));
      return "turnover";
    }
    const r = this.gain(s, capped, carrier.id, "por tierra");
    if (r === "score") {
      l.rushTD = (l.rushTD ?? 0) + 1;
      this.push("carrera", capped, `${pre}: ¡${this.name(carrier)} corre ${capped} yardas hasta la end zone! TOUCHDOWN ${this.abbr(s)}.`, true);
      this.runClock(6, true);
      return "score";
    }
    if (r === "ok") this.push("carrera", capped, `${pre}: carrera de ${this.name(carrier)} ${capped >= 0 ? `para ${capped} yardas` : `con pérdida de ${-capped}`}${t ? `, placaje de ${this.name(t)}` : ""}.`);
    this.runClock(6, false);
    return r;
  }

  private pass(s: 0 | 1, o: 0 | 1, home: number): "score" | "ok" | "turnover" {
    const off = this.sides[s], def = this.sides[o];
    const qb = this.starters(off, "QB")[0];
    const pre = this.downStr() + " en " + this.spot();
    const ql = this.line(qb.id, s);
    // captura
    const press = def.u.rush - off.u.olPass - NCAL.ref.rushGap - home * 0.5 - (off.u.qbSpd - NCAL.ref.qbSpd) * 0.1;
    if (this.rng.chance(NCAL.sackBase * Math.exp(NCAL.sackK * press))) {
      const y = -this.rng.int(3, 11);
      const rusher = this.rng.weighted([...this.starters(def, "DL"), ...this.starters(def, "LB")], (p) => p.prs);
      const rl = this.line(rusher.id, o);
      rl.sacks = (rl.sacks ?? 0) + 1; rl.tkl = (rl.tkl ?? 0) + 1;
      this.stats[o].sacks++;
      this.stats[s].yards += y; this.stats[s].passYds += y;
      if (this.rng.chance(0.09)) {
        rl.ff = (rl.ff ?? 0) + 1;
        if (this.rng.chance(0.5)) {
          ql.fum = (ql.fum ?? 0) + 1;
          this.stats[s].turnovers++;
          this.push("fumble", y, `${pre}: ¡CAPTURA de ${this.name(rusher)} y FUMBLE de ${this.name(qb)}! Recupera ${this.abbr(o)}.`);
          this.runClock(6, true);
          this.changePossession(100 - Math.max(1, this.ball + y));
          return "turnover";
        }
      }
      const r = this.gain(s, y, undefined, "");
      if (r === "ok") this.push("captura", y, `${pre}: ¡CAPTURA! ${this.name(rusher)} derriba a ${this.name(qb)} para pérdida de ${-y}.`);
      this.runClock(6, false);
      return r;
    }
    // scramble
    if (this.rng.chance(0.03 + (qb.spd - NCAL.ref.qbSpd) * 0.001)) {
      const y = Math.round(this.rng.normal(5 + (qb.spd - 70) * 0.1, 4));
      const cap = Math.min(y, 100 - this.ball);
      ql.rushAtt = (ql.rushAtt ?? 0) + 1; ql.rushYds = (ql.rushYds ?? 0) + cap;
      this.stats[s].rushYds += cap; this.stats[s].yards += cap;
      const r = this.gain(s, cap, qb.id, "por tierra");
      if (r === "score") { ql.rushTD = (ql.rushTD ?? 0) + 1; this.push("carrera", cap, `${pre}: ¡${this.name(qb)} escapa y entra corriendo! TOUCHDOWN.`, true); this.runClock(6, true); return r; }
      if (r === "ok") this.push("carrera", cap, `${pre}: ${this.name(qb)} sale de la bolsa y corre ${cap} yardas.`);
      this.runClock(6, false);
      return r;
    }
    // profundidad
    const need = this.togo;
    let wS = 0.66, wM = 0.24, wD = 0.1;
    if (need >= 12) { wS = 0.4; wM = 0.4; wD = 0.2; }
    if (this.down >= 3 && need >= 5 && need < 12) { wS = 0.35; wM = 0.5; wD = 0.15; }
    if (this.hurry(s) && this.clock < 40 && 100 - this.ball > 30) { wS = 0.2; wM = 0.3; wD = 0.5; }
    const r0 = this.rng.next() * (wS + wM + wD);
    const depth: "corto" | "medio" | "largo" = r0 < wS ? "corto" : r0 < wS + wM ? "medio" : "largo";
    const targets = [...this.starters(off, "WR"), ...this.starters(off, "TE"), ...(depth === "corto" ? this.starters(off, "RB") : [])];
    const tgt = this.rng.weighted(targets, (p) => Math.pow(p.cth, 2) * (p.pos === "WR" ? 1.2 : p.pos === "TE" ? 0.8 : 0.5) * (depth === "largo" ? p.spd / 70 : 1));
    const tl = this.line(tgt.id, s);
    tl.tgt = (tl.tgt ?? 0) + 1;
    ql.passAtt = (ql.passAtt ?? 0) + 1;
    const edge = off.u.qb - NCAL.ref.qb + (off.u.recv - def.u.cover - NCAL.ref.recvCover) * 0.8 + home;
    const base = depth === "corto" ? NCAL.cmpShort : depth === "medio" ? NCAL.cmpMid : NCAL.cmpDeep;
    const pInt = (depth === "corto" ? NCAL.intShort : depth === "medio" ? NCAL.intMid : NCAL.intDeep) * Math.exp(-(off.u.qb - NCAL.ref.qb - (def.u.cover - (NCAL.ref.qb - NCAL.ref.recvCover))) * 0.03);
    let air = depth === "corto" ? this.rng.int(-2, 6) : depth === "medio" ? this.rng.int(9, 17) : this.rng.int(20, 42);
    if (this.down >= 3 && this.rng.chance(0.6)) air = Math.max(air, Math.min(need, depth === "corto" ? 7 : 20)); // rutas hasta la línea de primero
    const rr = this.rng.next();
    if (rr < pInt) {
      const dp = this.rng.weighted([...this.starters(def, "CB"), ...this.starters(def, "S"), ...this.starters(def, "LB")], (p) => p.cov);
      const dl = this.line(dp.id, o);
      dl.defInt = (dl.defInt ?? 0) + 1;
      ql.int = (ql.int ?? 0) + 1;
      this.stats[s].turnovers++;
      const spot = Math.min(99, this.ball + air);
      if (this.rng.chance(0.06)) {
        this.push("intercepcion", 0, `${pre}: ¡INTERCEPTADO por ${this.name(dp)} y lo devuelve hasta la end zone! PICK-SIX.`, true);
        this.runClock(8, true);
        this.otPossessionEnded(s);
        this.poss = o;
        this.touchdown(o, dp.id, "de retorno de intercepción");
        return "score";
      }
      const ret = clamp(Math.round(this.rng.normal(8, 9)), 0, 50);
      this.push("intercepcion", 0, `${pre}: pase ${depth} de ${this.name(qb)} hacia ${this.name(tgt)}... ¡INTERCEPTADO por ${this.name(dp)}!`);
      this.runClock(7, true);
      this.changePossession(Math.max(1, 100 - spot + ret));
      return "turnover";
    }
    const pCmp = clamp(base + NCAL.cmpK * edge, 0.15, 0.92);
    if (rr < pInt + pCmp * (1 - pInt)) {
      let yac = Math.max(0, Math.round(this.rng.normal(depth === "corto" ? 3.2 : depth === "medio" ? 2 : 2.5, 3.5)));
      if (this.rng.chance(0.02)) yac += this.rng.int(8, 45);
      let y = Math.min(air + yac, 100 - this.ball);
      // desafío arbitral en jugadas grandes
      if (y >= 20 && this.rng.chance(0.04)) {
        const reversed = this.rng.chance(0.35);
        this.push("desafio", 0, `${this.abbr(o)} lanza el pañuelo rojo para desafiar la recepción de ${this.name(tgt)}... ${reversed ? "¡Se revierte: pase incompleto!" : "La jugada se mantiene."}`);
        if (reversed) { this.down++; if (this.down > 4) { this.changePossession(100 - this.ball); return "turnover"; } this.runClock(5, true); return "ok"; }
        else this.sides[o].timeouts = Math.max(0, this.sides[o].timeouts - 1);
      }
      ql.passCmp = (ql.passCmp ?? 0) + 1; ql.passYds = (ql.passYds ?? 0) + y;
      tl.rec = (tl.rec ?? 0) + 1; tl.recYds = (tl.recYds ?? 0) + y;
      this.stats[s].passYds += y; this.stats[s].yards += y;
      const t = this.tackler(o, "pass");
      if (t && y < 100 - this.ball) { const x = this.line(t.id, o); x.tkl = (x.tkl ?? 0) + 1; }
      this.maybeInjury(s, tgt);
      if (this.rng.chance(NCAL.fumbleCatch) && y < 100 - this.ball) {
        tl.fum = (tl.fum ?? 0) + 1;
        this.stats[s].turnovers++;
        this.push("fumble", y, `${pre}: ${this.name(tgt)} atrapa pero ¡suelta el balón! Recupera ${this.abbr(o)}.`);
        this.runClock(6, true);
        this.changePossession(100 - (this.ball + y));
        return "turnover";
      }
      const r = this.gain(s, y, tgt.id, "por aire");
      if (r === "score") {
        ql.passTD = (ql.passTD ?? 0) + 1; tl.recTD = (tl.recTD ?? 0) + 1;
        this.push("pase", y, `${pre}: ¡${this.name(qb)} conecta con ${this.name(tgt)}, ${y} yardas, TOUCHDOWN ${this.abbr(s)}!`, true);
        this.runClock(6, true);
        return r;
      }
      const oob = this.rng.chance(0.18);
      if (r === "ok") this.push("pase", y, `${pre}: pase ${depth} completo de ${this.name(qb)} a ${this.name(tgt)} para ${y} yardas${oob ? ", sale por la banda" : ""}.`);
      this.runClock(6, oob && (this.hurry(s) || this.clock < 120));
      return r;
    }
    const r = this.gain(s, 0, undefined, "");
    if (r === "ok") this.push("incompleto", 0, `${pre}: pase ${depth} de ${this.name(qb)} para ${this.name(tgt)}, incompleto.`);
    this.runClock(5, true);
    return r;
  }

  private maybeInjury(s: 0 | 1, p: NflPlayer) {
    if (!this.rng.chance(0.0035)) return;
    const side = this.sides[s];
    side.out.add(p.id);
    const weeks = this.rng.chance(0.5) ? this.rng.int(1, 2) : this.rng.chance(0.7) ? this.rng.int(3, 6) : this.rng.int(7, 17);
    this.injuries.push({ player: p.id, weeks });
    this.push("lesion", 0, `${p.name} (${this.abbr(s)}) se lesiona: baja estimada de ${weeks} semana${weeks > 1 ? "s" : ""}.`);
    side.u = this.units(side);
  }

  result(): NflResult {
    return {
      hs: this.score[0], as: this.score[1], ot: this.ot || undefined, quarters: this.quarters,
      stats: this.stats, players: this.lines, scoring: this.scoring, injuries: this.injuries,
    };
  }
}

export function simulateNflGame(home: NflGameInput, away: NflGameInput, opts: NflGameOpts = {}): NflResult {
  return new NflGameSim(home, away, opts).runToEnd();
}
