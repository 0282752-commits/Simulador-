// Motor de partido de fútbol minuto a minuto.
import { Rng, clamp, sigmoid } from "../../lib/rng";
import type { Lineup, MatchEvent, MatchResult, Player, PlayerLine, Pos, SideStats, Tactics } from "./types";
import { FORMATIONS, slotRating, slotsOf } from "./lineup";

export interface Condition { fitness: number; form: number; morale: number }

export interface MatchTeamInput {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
  lineup: Lineup;
  squad: Player[];
  cond?: (id: string) => Condition;
  ai?: boolean; // la IA hace cambios automáticos
}

export interface MatchOptions {
  neutral?: boolean;
  knockout?: boolean; // hay que decidir un ganador
  noExtraTime?: boolean; // directo a penales
  firstLeg?: [number, number]; // goles de la ida (desde la perspectiva de local/visitante de ESTE partido)
  seed?: number;
  homeAdv?: number; // multiplicador de ventaja local
}

// ====== Constantes de calibración (ver scripts/calibrate-football.ts) ======
export const CAL = {
  shotRate: 0.105, // tiros por minuto por equipo con fuerzas iguales
  strengthK: 0.078, // sensibilidad de tiros a la diferencia ataque-defensa
  homeShot: 1.21,
  awayShot: 0.845,
  bigChance: 0.06,
  xgBase: 0.079,
  qualityK: 0.022,
  gkK: 0.009,
  foulRate: 0.118,
  yellowPerFoul: 0.18,
  redPerFoul: 0.0022,
  penaltyRate: 0.0014,
  cornerRate: 0.036,
  cornerFromShot: 0.22,
  offsideRate: 0.021,
  injuryRate: 0.0015,
  directFkRate: 0.0055,
  varOverturn: 0.045,
  satur: 7,
};

interface OnPitch {
  id: string;
  p: Player;
  slot: Pos;
  x: number;
  y: number;
  fit: number; // 0-100
  form: number;
  yc: number;
  off: boolean; // expulsado
  inj: boolean;
  line: PlayerLine;
}

interface SideState {
  input: MatchTeamInput;
  on: OnPitch[];
  bench: Player[];
  used: Set<string>; // ya participaron
  subs: number;
  windows: number;
  tactics: Tactics;
  lineup: Lineup;
  morale: number;
  str: { att: number; mid: number; def: number; gk: number; n: number };
  lines: Record<string, PlayerLine>;
  pensOrder: string[];
}

const ATT_W: Record<Pos, number> = { POR: 0, DFC: 0.06, LD: 0.22, LI: 0.22, CAD: 0.35, CAI: 0.35, MCD: 0.2, MC: 0.45, MCO: 0.8, MD: 0.6, MI: 0.6, ED: 0.9, EI: 0.9, DC: 1, SD: 0.95 };
const DEF_W: Record<Pos, number> = { POR: 0, DFC: 1, LD: 0.8, LI: 0.8, CAD: 0.6, CAI: 0.6, MCD: 0.75, MC: 0.4, MCO: 0.15, MD: 0.3, MI: 0.3, ED: 0.12, EI: 0.12, DC: 0.05, SD: 0.08 };
const MID_W: Record<Pos, number> = { POR: 0, DFC: 0.15, LD: 0.3, LI: 0.3, CAD: 0.45, CAI: 0.45, MCD: 0.9, MC: 1, MCO: 0.9, MD: 0.7, MI: 0.7, ED: 0.45, EI: 0.45, DC: 0.25, SD: 0.4 };
const SHOT_W: Record<Pos, number> = { POR: 0, DFC: 0.25, LD: 0.3, LI: 0.3, CAD: 0.45, CAI: 0.45, MCD: 0.4, MC: 0.9, MCO: 1.7, MD: 1.1, MI: 1.1, ED: 2.2, EI: 2.2, DC: 3.6, SD: 2.8 };
const ASSIST_W: Record<Pos, number> = { POR: 0.02, DFC: 0.2, LD: 0.8, LI: 0.8, CAD: 1, CAI: 1, MCD: 0.6, MC: 1.3, MCO: 2, MD: 1.5, MI: 1.5, ED: 1.8, EI: 1.8, DC: 1.2, SD: 1.5 };
const FOUL_W: Record<Pos, number> = { POR: 0.05, DFC: 1.4, LD: 1.1, LI: 1.1, CAD: 1, CAI: 1, MCD: 1.6, MC: 1.1, MCO: 0.8, MD: 0.9, MI: 0.9, ED: 0.7, EI: 0.7, DC: 0.9, SD: 0.8 };

const DEF_COND: Condition = { fitness: 100, form: 0, morale: 0 };

export class FootballMatch {
  rng: Rng;
  sides: [SideState, SideState];
  minute = 0;
  added = 0;
  phase: "pre" | "1T" | "HT" | "2T" | "ET_BREAK" | "PR1" | "PR2" | "PEN" | "FIN" = "pre";
  add1: number;
  add2: number;
  score: [number, number] = [0, 0];
  pens: [number, number] = [0, 0];
  pensTaken: [number, number] = [0, 0];
  events: MatchEvent[] = [];
  stats: [SideStats, SideStats];
  possAcc: [number, number] = [0, 0];
  opts: MatchOptions;
  et = false;
  seed: number;

  constructor(home: MatchTeamInput, away: MatchTeamInput, opts: MatchOptions = {}) {
    this.seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = new Rng(this.seed);
    this.opts = opts;
    this.sides = [this.buildSide(home, 0), this.buildSide(away, 1)];
    this.add1 = this.rng.int(1, 4);
    this.add2 = this.rng.int(3, 7);
    const z = (): SideStats => ({ poss: 50, shots: 0, onT: 0, xg: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, passes: 0 });
    this.stats = [z(), z()];
    this.recalc(0);
    this.recalc(1);
  }

  private buildSide(t: MatchTeamInput, side: 0 | 1): SideState {
    const slots = slotsOf(t.lineup);
    const byId = new Map(t.squad.map((p) => [p.id, p]));
    const lines: Record<string, PlayerLine> = {};
    const on: OnPitch[] = [];
    const used = new Set<string>();
    t.lineup.starters.forEach((id, i) => {
      if (!id) return;
      const p = byId.get(id);
      if (!p) return;
      const c = t.cond?.(id) ?? DEF_COND;
      const line: PlayerLine = { min: 0, g: 0, a: 0, r: 6.3, yc: 0, rc: 0, sh: 0, sv: 0, side };
      lines[id] = line;
      used.add(id);
      on.push({ id, p, slot: slots[i].pos, x: slots[i].x, y: slots[i].y, fit: c.fitness, form: c.form, yc: 0, off: false, inj: false, line });
    });
    const bench = t.lineup.bench.map((id) => byId.get(id)).filter((p): p is Player => !!p);
    const morale = t.squad.length ? (t.cond?.(t.squad[0].id) ?? DEF_COND).morale : 0;
    const pensOrder = [t.lineup.penaltyTaker, ...[...on].sort((a, b) => b.p.pen + b.p.sho * 0.3 - (a.p.pen + a.p.sho * 0.3)).map((o) => o.id)].filter((x, i, arr): x is string => !!x && arr.indexOf(x) === i);
    return {
      input: t, on, bench, used, subs: 0, windows: 0, tactics: { ...t.lineup.tactics }, lineup: t.lineup, morale,
      str: { att: 0, mid: 0, def: 0, gk: 0, n: 11 }, lines, pensOrder,
    };
  }

  // ===== Fuerza de equipo a partir de los 11 en el campo =====
  eff(o: OnPitch): number {
    const base = slotRating(o.p, o.slot);
    const fitF = 0.8 + 0.2 * (o.fit / 100);
    return base * fitF + o.form * 0.6;
  }

  recalc(s: 0 | 1) {
    const side = this.sides[s];
    const act = side.on.filter((o) => !o.off);
    let a = 0, aw = 0, m = 0, mw = 0, d = 0, dw = 0, gk = 45;
    for (const o of act) {
      const e = this.eff(o);
      if (o.slot === "POR") { gk = e; continue; }
      a += e * ATT_W[o.slot]; aw += ATT_W[o.slot];
      m += e * MID_W[o.slot]; mw += MID_W[o.slot];
      d += e * DEF_W[o.slot]; dw += DEF_W[o.slot];
    }
    const n = act.length;
    const missing = 11 - n;
    const pen = missing * 3.2; // cada jugador de menos pesa
    const mt = side.tactics.mentality === "ofensiva" ? 1.5 : side.tactics.mentality === "defensiva" ? -1.5 : 0;
    side.str = {
      att: (aw ? a / aw : 40) - pen + mt + side.morale,
      mid: (mw ? m / mw : 40) - pen * 1.1 + (side.tactics.pressing === "alto" ? 1 : side.tactics.pressing === "bajo" ? -0.8 : 0) + side.morale,
      def: (dw ? d / dw : 40) - pen - mt * 0.8 + side.morale,
      gk,
      n,
    };
  }

  get finished() { return this.phase === "FIN"; }
  displayMinute(): string {
    if (this.phase === "pre") return "0'";
    if (this.phase === "HT") return "DESC";
    if (this.phase === "ET_BREAK") return "90'";
    if (this.phase === "PEN") return "PEN";
    if (this.phase === "FIN") return "FINAL";
    return this.added > 0 ? `${this.minute}+${this.added}'` : `${this.minute}'`;
  }

  private ev(e: Omit<MatchEvent, "min" | "add">): MatchEvent {
    const full: MatchEvent = { min: this.minute, add: this.added || undefined, ...e };
    this.events.push(full);
    return full;
  }

  name(id?: string): string {
    if (!id) return "";
    for (const s of this.sides) {
      const p = s.input.squad.find((x) => x.id === id);
      if (p) return p.shortName;
    }
    return "";
  }

  // ===== Avance =====
  runToEnd(): MatchResult {
    let guard = 0;
    while (!this.finished && guard++ < 1000) this.step();
    return this.result();
  }

  step(): MatchEvent[] {
    const start = this.events.length;
    switch (this.phase) {
      case "pre":
        this.phase = "1T";
        this.minute = 0;
        this.ev({ type: "inicio", side: -1, text: `¡Rueda el balón! ${this.sides[0].input.name} vs ${this.sides[1].input.name}.` });
        break;
      case "1T":
        this.tickClock(45, this.add1, () => {
          this.phase = "HT";
          this.ev({ type: "descanso", side: -1, text: `Descanso: ${this.sides[0].input.short} ${this.score[0]}-${this.score[1]} ${this.sides[1].input.short}.` });
        });
        break;
      case "HT":
        this.halftimeAI();
        this.phase = "2T";
        this.minute = 45;
        this.added = 0;
        this.ev({ type: "info", side: -1, text: "Arranca la segunda parte." });
        break;
      case "2T":
        this.tickClock(90, this.add2, () => this.endRegulation());
        break;
      case "ET_BREAK":
        this.phase = "PR1";
        this.minute = 90;
        this.added = 0;
        break;
      case "PR1":
        this.tickClock(105, this.rng.int(0, 2), () => { this.phase = "PR2"; this.minute = 105; this.added = 0; this.ev({ type: "info", side: -1, text: "Cambio de campo en la prórroga." }); });
        break;
      case "PR2":
        this.tickClock(120, this.rng.int(0, 3), () => this.endExtraTime());
        break;
      case "PEN":
        this.penaltyKick();
        break;
      case "FIN":
        break;
    }
    return this.events.slice(start);
  }

  private pendingAdd = -1;
  private tickClock(end: number, add: number, onEnd: () => void) {
    if (this.minute < end) {
      this.minute++;
      this.playMinute();
      return;
    }
    if (this.pendingAdd < 0) this.pendingAdd = add;
    if (this.added < this.pendingAdd) {
      if (this.added === 0 && this.pendingAdd > 0) this.ev({ type: "info", side: -1, text: `Se añaden ${this.pendingAdd} minutos.` });
      this.added++;
      this.playMinute();
      return;
    }
    this.pendingAdd = -1;
    onEnd();
  }

  private aggregate(): [number, number] {
    const f = this.opts.firstLeg ?? [0, 0];
    return [this.score[0] + f[0], this.score[1] + f[1]];
  }

  private endRegulation() {
    const agg = this.aggregate();
    if (this.opts.knockout && agg[0] === agg[1]) {
      if (this.opts.noExtraTime) {
        this.phase = "PEN";
        this.ev({ type: "penales", side: -1, text: "¡Empate! Se decide en la tanda de penales." });
      } else {
        this.phase = "ET_BREAK";
        this.et = true;
        this.ev({ type: "prorroga", side: -1, text: "Empate al final de los 90 minutos: ¡vamos a la prórroga!" });
      }
      return;
    }
    this.finish();
  }

  private endExtraTime() {
    const agg = this.aggregate();
    if (agg[0] === agg[1]) {
      this.phase = "PEN";
      this.ev({ type: "penales", side: -1, text: "Sigue el empate tras la prórroga. ¡Penales!" });
      return;
    }
    this.finish();
  }

  private finish() {
    this.phase = "FIN";
    // valoraciones finales
    for (const s of [0, 1] as const) {
      const conceded = this.score[1 - s];
      const won = this.score[s] > this.score[1 - s];
      const lost = this.score[s] < this.score[1 - s];
      for (const l of Object.values(this.sides[s].lines)) {
        if (l.min <= 0) continue;
        const p = this.sides[s].input.squad.find((x) => this.sides[s].lines[x.id] === l);
        const pos = p ? this.slotOf(s, p.id) ?? p.positions[0] : "MC";
        const defensive = pos === "POR" || DEF_W[pos] >= 0.6;
        if (defensive) {
          if (conceded === 0 && l.min >= 60) { l.r += pos === "POR" ? 0.8 : 0.5; l.cs = true; }
          l.r -= conceded * (pos === "POR" ? 0.35 : 0.2);
        }
        if (won) l.r += 0.3;
        if (lost) l.r -= 0.25;
        l.r = clamp(Math.round(l.r * 10) / 10, 3, 10);
      }
    }
    let txt = `¡Final! ${this.sides[0].input.name} ${this.score[0]}-${this.score[1]} ${this.sides[1].input.name}`;
    if (this.pensTaken[0] + this.pensTaken[1] > 0) txt += ` (${this.pens[0]}-${this.pens[1]} en penales)`;
    this.ev({ type: "final", side: -1, text: txt + "." });
  }

  private slotOf(s: 0 | 1, id: string): Pos | undefined {
    return this.sides[s].on.find((o) => o.id === id)?.slot ?? this.lastSlot.get(id);
  }
  private lastSlot = new Map<string, Pos>();

  private active(s: 0 | 1) {
    return this.sides[s].on.filter((o) => !o.off);
  }

  // ===== Un minuto de juego =====
  private playMinute() {
    const [H, A] = this.sides;
    const hAdv = this.opts.neutral ? 1 : this.opts.homeAdv ?? 1;
    // posesión
    const midDiff = H.str.mid - A.str.mid;
    const tempoAdj = (t: Tactics) => (t.tempo === "lento" ? 0.15 : t.tempo === "rapido" ? -0.1 : 0);
    let pHome = sigmoid(midDiff * 0.07 + (this.opts.neutral ? 0 : 0.08) + tempoAdj(H.tactics) - tempoAdj(A.tactics));
    pHome = clamp(pHome, 0.25, 0.75);
    this.possAcc[0] += pHome;
    this.possAcc[1] += 1 - pHome;
    this.stats[0].passes += Math.round(pHome * 11 + this.rng.next() * 2);
    this.stats[1].passes += Math.round((1 - pHome) * 11 + this.rng.next() * 2);

    for (const s of [0, 1] as const) {
      const me = this.sides[s];
      const op = this.sides[1 - s];
      const poss = s === 0 ? pHome : 1 - pHome;
      // efecto del marcador
      const agg = this.aggregate();
      const diff = agg[s] - agg[1 - s];
      const late = this.minute >= 70 ? 1 : this.minute >= 55 ? 0.5 : 0;
      let scoreAdj = 1;
      if (diff < 0) scoreAdj += 0.26 * late + 0.08;
      else if (diff > 0) scoreAdj -= 0.16 * late + 0.06;
      else if (this.minute >= 70) scoreAdj -= 0.08;
      const ment = me.tactics.mentality === "ofensiva" ? 1.12 : me.tactics.mentality === "defensiva" ? 0.86 : 1;
      const opMent = op.tactics.mentality === "defensiva" ? 0.93 : op.tactics.mentality === "ofensiva" ? 1.06 : 1;
      const adv = s === 0 ? (this.opts.neutral ? 1 : CAL.homeShot * hAdv) : this.opts.neutral ? 1 : CAL.awayShot;
      // saturación suave: las diferencias grandes no se disparan (evita ligas de 100 puntos)
      const strDiff = CAL.satur * Math.tanh((me.str.att - op.str.def) / CAL.satur);
      const rate = CAL.shotRate * Math.exp(CAL.strengthK * strDiff) * (0.55 + 0.9 * poss) * scoreAdj * ment * opMent * adv;

      if (this.rng.chance(rate)) this.shot(s, "jugada");
      if (this.rng.chance(CAL.cornerRate * (0.6 + 0.8 * poss) * Math.exp(0.04 * strDiff))) this.corner(s);
      if (this.rng.chance(CAL.penaltyRate * Math.exp(0.05 * strDiff) * adv)) this.penalty(s);
      if (this.rng.chance(CAL.directFkRate * (0.6 + 0.8 * poss))) this.directFreeKick(s);
      if (this.rng.chance(CAL.offsideRate * (0.5 + poss))) this.offside(s);
      const pressF = op.tactics.pressing === "alto" ? 1.15 : op.tactics.pressing === "bajo" ? 0.88 : 1;
      if (this.rng.chance(CAL.foulRate * (0.4 + poss) * pressF * (s === 1 && !this.opts.neutral ? 1.03 : 1))) this.foul(1 - s as 0 | 1);
      // el foul lo comete el rival (1-s) sobre s. Arriba: falta cometida por op
    }

    // cansancio, lesiones y minutos
    for (const s of [0, 1] as const) {
      const side = this.sides[s];
      const pressCost = side.tactics.pressing === "alto" ? 1.25 : side.tactics.pressing === "bajo" ? 0.85 : 1;
      const tempoCost = side.tactics.tempo === "rapido" ? 1.1 : side.tactics.tempo === "lento" ? 0.92 : 1;
      for (const o of side.on) {
        if (o.off) continue;
        o.line.min++;
        const phyF = 1.25 - o.p.phy / 200;
        o.fit = Math.max(20, o.fit - (o.slot === "POR" ? 0.05 : 0.2 * pressCost * tempoCost * phyF));
        if (o.slot !== "POR" && this.rng.chance(CAL.injuryRate / 10 * (o.fit < 50 ? 2 : 1))) this.injury(s, o);
      }
      if (this.minute % 5 === 0) this.recalc(s);
      if (side.input.ai !== false) this.aiSubs(s);
    }
  }

  private pickPlayer(s: 0 | 1, w: (o: OnPitch) => number, exclude?: string): OnPitch | undefined {
    const c = this.active(s).filter((o) => o.id !== exclude);
    if (!c.length) return undefined;
    return this.rng.weighted(c, w);
  }

  private gkOf(s: 0 | 1): OnPitch | undefined {
    return this.active(s).find((o) => o.slot === "POR") ?? this.active(s)[0];
  }

  private shot(s: 0 | 1, kind: "jugada" | "corner" | "tiro libre", headerForced = false) {
    const me = this.sides[s], op = this.sides[1 - s];
    const header = headerForced || this.rng.chance(kind === "corner" ? 0.7 : 0.13);
    const shooter = this.pickPlayer(s, (o) => (header ? SHOT_W[o.slot] * 0.6 + (o.p.hea - 40) / 18 + (o.slot === "DFC" ? 0.9 : 0) : SHOT_W[o.slot] * Math.pow(o.p.sho / 60, 1.4)));
    if (!shooter) return;
    const gk = this.gkOf(1 - s as 0 | 1);
    const quality = CAL.satur * Math.tanh((me.str.att - op.str.def) / CAL.satur) * CAL.qualityK;
    let xg: number;
    if (kind === "tiro libre") xg = 0.04 + (me.on.find((o) => o.id === me.lineup.fkTaker)?.p.fk ?? 60) / 3000;
    else if (this.rng.chance(CAL.bigChance * Math.exp(quality))) xg = 0.3 + this.rng.next() * 0.35;
    else xg = Math.min(0.5, CAL.xgBase * Math.exp(this.rng.normal(-0.35, 0.75)) * Math.exp(quality));
    if (header) xg *= 0.8;
    xg = clamp(xg, 0.01, 0.8);
    const skill = header ? shooter.p.hea : shooter.p.sho;
    const gkSkill = gk ? this.eff(gk) : 40;
    let pGoal = 1.03 * xg * Math.exp((skill - 70) * 0.009) * Math.exp(-(gkSkill - 75) * CAL.gkK) * (0.85 + 0.15 * shooter.fit / 100);
    pGoal = clamp(pGoal, 0.005, 0.85);
    this.stats[s].shots++;
    this.stats[s].xg += xg;
    shooter.line.sh++;
    const r = this.rng.next();
    const how = header ? "de cabeza" : kind === "tiro libre" ? "de tiro libre" : this.rng.pick(["con la derecha", "con la izquierda", "desde fuera del área", "a bocajarro", "cruzado", "al primer toque"]);
    if (r < pGoal) {
      this.stats[s].onT++;
      const assist = kind === "tiro libre" ? undefined : this.rng.chance(kind === "corner" ? 0.85 : 0.74) ? (kind === "corner" ? this.cornerTaker(s) : this.pickPlayer(s, (o) => ASSIST_W[o.slot] * Math.pow(o.p.pas / 60, 2), shooter.id)) : undefined;
      this.goal(s, shooter, assist, header ? "cabeza" : kind === "tiro libre" ? "tiro libre" : "jugada", xg, how);
      return;
    }
    const rest = this.rng.next();
    if (rest < 0.26) {
      this.stats[s].onT++;
      this.stats[1 - s].saves++;
      if (gk) { gk.line.sv++; gk.line.r += 0.22; }
      this.ev({ type: "tiro_atajado", side: s, player: shooter.id, player2: gk?.id, xg, text: `${this.name(shooter.id)} remata ${how}... ¡atajada de ${this.name(gk?.id)}!` });
      if (this.rng.chance(CAL.cornerFromShot * 1.2)) this.corner(s, true);
    } else if (rest < 0.31) {
      this.ev({ type: "palo", side: s, player: shooter.id, xg, text: `¡Al palo! ${this.name(shooter.id)} lo tuvo ${how}.` });
    } else if (rest < 0.6) {
      this.ev({ type: "tiro_bloqueado", side: s, player: shooter.id, xg, text: `Tiro de ${this.name(shooter.id)} bloqueado por la defensa.` });
      if (this.rng.chance(CAL.cornerFromShot)) this.corner(s, true);
    } else {
      this.ev({ type: "tiro_fuera", side: s, player: shooter.id, xg, text: `${this.name(shooter.id)} prueba ${how}, pero se va fuera.` });
    }
  }

  private cornerTaker(s: 0 | 1): OnPitch | undefined {
    const me = this.sides[s];
    return this.active(s).find((o) => o.id === me.lineup.cornerTaker) ?? this.pickPlayer(s, (o) => o.p.crn);
  }

  private corner(s: 0 | 1, fromShot = false) {
    this.stats[s].corners++;
    const t = this.cornerTaker(s);
    this.ev({ type: "corner", side: s, player: t?.id, text: `Córner para ${this.sides[s].input.short}${fromShot ? " tras el rechace" : ""}. Lo saca ${this.name(t?.id)}.` });
    const q = (t?.p.crn ?? 60) / 70;
    if (this.rng.chance(0.24 * q)) this.shot(s, "corner", this.rng.chance(0.8));
  }

  private goal(s: 0 | 1, scorer: OnPitch, assist: OnPitch | undefined, detail: string, xg: number, how: string) {
    // autogol: el remate lo desvía un defensor rival
    if (detail === "jugada" && this.rng.chance(0.035)) {
      const og = this.pickPlayer(1 - s as 0 | 1, (o) => DEF_W[o.slot]);
      if (og) {
        this.score[s]++;
        og.line.og = (og.line.og ?? 0) + 1;
        og.line.r -= 0.8;
        this.ev({ type: "gol_pp", side: s, player: og.id, xg, text: `¡Autogol! ${this.name(og.id)} desvía a su propia portería el disparo de ${this.name(scorer.id)}. ${this.sides[0].input.short} ${this.score[0]}-${this.score[1]} ${this.sides[1].input.short}` });
        this.recalc(0); this.recalc(1);
        return;
      }
    }
    // revisión VAR
    if (this.rng.chance(CAL.varOverturn)) {
      this.ev({ type: "var", side: s, player: scorer.id, text: `¡${this.name(scorer.id)} marca! ... El VAR revisa ... ¡Gol anulado por ${this.rng.pick(["fuera de juego milimétrico", "falta previa", "mano en la jugada"])}!` });
      return;
    }
    this.score[s]++;
    scorer.line.g++;
    scorer.line.r += 1.1;
    if (assist) { assist.line.a++; assist.line.r += 0.7; }
    const gk = this.gkOf(1 - s as 0 | 1);
    if (gk) gk.line.r -= 0.15;
    const sc = `${this.score[0]}-${this.score[1]}`;
    const verbs = ["¡GOOOL!", "¡GOLAZO!", "¡Gol!", "¡Adentro!"];
    this.ev({
      type: "gol", side: s, player: scorer.id, player2: assist?.id, detail, xg,
      text: `${this.rng.pick(verbs)} ${this.name(scorer.id)} ${how}${assist ? ` tras pase de ${this.name(assist.id)}` : ""}. ${this.sides[0].input.short} ${sc} ${this.sides[1].input.short}`,
    });
    this.recalc(0); this.recalc(1);
  }

  private penalty(s: 0 | 1) {
    const me = this.sides[s];
    const fouler = this.pickPlayer(1 - s as 0 | 1, (o) => DEF_W[o.slot] + 0.05);
    if (this.rng.chance(0.08)) {
      this.ev({ type: "var", side: s, text: `El árbitro pita penal para ${me.input.short}... pero el VAR lo revisa y lo anula.` });
      return;
    }
    const taker = this.active(s).find((o) => o.id === me.lineup.penaltyTaker) ?? this.pickPlayer(s, (o) => Math.pow(o.p.pen, 3));
    if (!taker) return;
    this.stats[s].shots++; this.stats[s].xg += 0.76; taker.line.sh++;
    if (fouler) {
      fouler.line.r -= 0.4;
      if (this.rng.chance(0.2)) this.card(1 - s as 0 | 1, fouler, "amarilla", "por el penal cometido");
      else if (this.rng.chance(0.025)) this.card(1 - s as 0 | 1, fouler, "roja", "por evitar una ocasión manifiesta");
    }
    this.ev({ type: "info", side: s, player: taker.id, text: `¡PENAL para ${me.input.short}!${fouler ? ` Falta de ${this.name(fouler.id)}.` : ""} ${this.name(taker.id)} al punto de penal...` });
    const gk = this.gkOf(1 - s as 0 | 1);
    const p = clamp(0.76 + (taker.p.pen - 75) * 0.005 - ((gk ? this.eff(gk) : 60) - 78) * 0.004, 0.55, 0.92);
    const r = this.rng.next();
    if (r < p) {
      this.stats[s].onT++;
      this.goal(s, taker, undefined, "penal", 0.76, "desde el punto de penal");
    } else if (r < p + (1 - p) * 0.62) {
      this.stats[s].onT++; this.stats[1 - s].saves++;
      if (gk) { gk.line.sv++; gk.line.r += 0.9; }
      taker.line.r -= 0.6;
      this.ev({ type: "penal_atajado", side: s, player: taker.id, player2: gk?.id, text: `¡${this.name(gk?.id)} ATAJA el penal de ${this.name(taker.id)}!` });
    } else {
      taker.line.r -= 0.6;
      this.ev({ type: "penal_fallado", side: s, player: taker.id, text: `¡Falla ${this.name(taker.id)}! El penal se va ${this.rng.pick(["por encima del larguero", "al poste", "fuera"])}.` });
    }
  }

  private directFreeKick(s: 0 | 1) {
    const me = this.sides[s];
    const t = this.active(s).find((o) => o.id === me.lineup.fkTaker) ?? this.pickPlayer(s, (o) => Math.pow(o.p.fk, 2));
    if (!t) return;
    this.ev({ type: "falta", side: 1 - s as 0 | 1, text: `Falta peligrosa al borde del área. ${this.name(t.id)} se prepara...` });
    this.stats[1 - s].fouls++;
    // el lanzador remata
    const saved = t.p.sho;
    t.p = { ...t.p, sho: t.p.fk } as Player;
    this.shot(s, "tiro libre");
    t.p = { ...t.p, sho: saved } as Player;
  }

  private offside(s: 0 | 1) {
    this.stats[s].offsides++;
    const o = this.pickPlayer(s, (x) => SHOT_W[x.slot]);
    this.ev({ type: "fuera_juego", side: s, player: o?.id, text: `Fuera de juego de ${this.name(o?.id)}.` });
  }

  // falta cometida por el equipo s
  private foul(s: 0 | 1) {
    this.stats[s].fouls++;
    const f = this.pickPlayer(s, (o) => FOUL_W[o.slot] * (1 + (o.p.def - 50) / 100));
    if (!f) return;
    const aggressive = this.sides[s].tactics.pressing === "alto" ? 1.15 : 1;
    if (this.rng.chance(CAL.redPerFoul)) { this.card(s, f, "roja", "por una entrada durísima"); return; }
    if (this.rng.chance(CAL.yellowPerFoul * aggressive * (this.minute > 60 ? 1.15 : 1) * (f.yc ? 0.3 : 1))) {
      this.card(s, f, "amarilla", this.rng.pick(["por una entrada a destiempo", "por cortar un contragolpe", "por protestar", "por una falta táctica"]));
      return;
    }
    if (this.rng.chance(0.18)) this.ev({ type: "falta", side: s, player: f.id, text: `Falta de ${this.name(f.id)}.` });
  }

  private card(s: 0 | 1, o: OnPitch, kind: "amarilla" | "roja", why: string) {
    if (kind === "amarilla") {
      o.yc++;
      o.line.yc++;
      o.line.r -= 0.3;
      this.stats[s].yellows++;
      if (o.yc >= 2) {
        o.line.rc++;
        o.off = true;
        o.line.r -= 1.2;
        this.stats[s].reds++;
        this.ev({ type: "doble_amarilla", side: s, player: o.id, text: `¡Segunda amarilla para ${this.name(o.id)}! ${this.sides[s].input.short} se queda con uno menos.` });
        this.afterRed(s, o);
      } else {
        this.ev({ type: "amarilla", side: s, player: o.id, text: `Tarjeta amarilla para ${this.name(o.id)} ${why}.` });
      }
    } else {
      o.line.rc++;
      o.off = true;
      o.line.r -= 1.5;
      this.stats[s].reds++;
      this.ev({ type: "roja", side: s, player: o.id, text: `¡ROJA DIRECTA! ${this.name(o.id)} expulsado ${why}.` });
      this.afterRed(s, o);
    }
  }

  private afterRed(s: 0 | 1, o: OnPitch) {
    this.lastSlot.set(o.id, o.slot);
    // si expulsan al portero, entra el suplente si hay cambios
    if (o.slot === "POR") {
      const side = this.sides[s];
      const gk = side.bench.find((p) => p.positions[0] === "POR" && !side.used.has(p.id));
      const outO = this.active(s).filter((x) => x.slot !== "POR").sort((a, b) => ATT_W[b.slot] - ATT_W[a.slot])[0];
      if (gk && outO && side.subs < 5 && side.windows < 3) {
        this.doSub(s, outO.id, gk.id, "POR");
      } else if (outO) {
        outO.slot = "POR";
      }
    }
    this.recalc(s);
  }

  private injury(s: 0 | 1, o: OnPitch) {
    o.inj = true;
    const days = this.rng.chance(0.55) ? this.rng.int(3, 14) : this.rng.chance(0.75) ? this.rng.int(15, 45) : this.rng.int(46, 180);
    o.line.inj = days;
    this.ev({ type: "lesion", side: s, player: o.id, detail: String(days), text: `${this.name(o.id)} se duele y pide el cambio. Lesión: ~${days} días de baja.` });
    const side = this.sides[s];
    if (side.subs < 5 && (side.windows < 3 || this.phase === "HT")) {
      const rep = this.bestReplacement(s, o.slot);
      if (rep) { this.doSub(s, o.id, rep.id); side.windows++; return; }
    }
    // sin cambios: sigue mermado
    o.fit = Math.min(o.fit, 30);
    this.recalc(s);
  }

  bestReplacement(s: 0 | 1, slot: Pos): Player | undefined {
    const side = this.sides[s];
    const cand = side.bench.filter((p) => !side.used.has(p.id));
    if (!cand.length) return undefined;
    if (slot !== "POR") {
      const outf = cand.filter((p) => p.positions[0] !== "POR");
      if (outf.length) return outf.sort((a, b) => slotRating(b, slot) - slotRating(a, slot))[0];
    }
    return cand.sort((a, b) => slotRating(b, slot) - slotRating(a, slot))[0];
  }

  // Cambio: devuelve false si no es posible.
  doSub(s: 0 | 1, outId: string, inId: string, forceSlot?: Pos): boolean {
    const side = this.sides[s];
    const o = side.on.find((x) => x.id === outId && !x.off);
    const p = side.bench.find((x) => x.id === inId);
    if (!o || !p || side.used.has(inId) || side.subs >= 5) return false;
    side.subs++;
    const line: PlayerLine = { min: 0, g: 0, a: 0, r: 6.2, yc: 0, rc: 0, sh: 0, sv: 0, side: s };
    side.lines[inId] = line;
    side.used.add(inId);
    const c = side.input.cond?.(inId) ?? DEF_COND;
    this.lastSlot.set(outId, o.slot);
    const idx = side.on.indexOf(o);
    side.on[idx] = { id: inId, p, slot: forceSlot ?? o.slot, x: o.x, y: o.y, fit: c.fitness, form: c.form, yc: 0, off: false, inj: false, line };
    this.ev({ type: "cambio", side: s, player: inId, player2: outId, text: `Cambio en ${side.input.short}: entra ${this.name(inId)}, sale ${this.name(outId)}.` });
    this.recalc(s);
    return true;
  }

  // Cambio manual desde el visor (cuenta ventana salvo en el descanso)
  manualSub(s: 0 | 1, outId: string, inId: string): string | null {
    const side = this.sides[s];
    if (side.subs >= 5) return "Ya se hicieron los 5 cambios.";
    const inHT = this.phase === "HT" || this.phase === "pre" || this.phase === "ET_BREAK";
    if (!inHT && side.windows >= 3 && this.lastWindowMinute[s] !== this.minute) return "No quedan ventanas de cambio.";
    if (!this.doSub(s, outId, inId)) return "Cambio no válido.";
    if (!inHT && this.lastWindowMinute[s] !== this.minute) { side.windows++; this.lastWindowMinute[s] = this.minute; }
    return null;
  }
  private lastWindowMinute: [number, number] = [-1, -1];

  setTactics(s: 0 | 1, t: Partial<Tactics>) {
    this.sides[s].tactics = { ...this.sides[s].tactics, ...t };
    this.recalc(s);
  }

  setFormation(s: 0 | 1, formation: string) {
    const slots = FORMATIONS[formation];
    if (!slots) return;
    const side = this.sides[s];
    const act = side.on.filter((o) => !o.off);
    // reasignación voraz de los jugadores activos a los huecos
    const free = [...slots];
    const gk = act.find((o) => o.slot === "POR");
    const assign = new Map<OnPitch, (typeof slots)[number]>();
    if (gk) { const i = free.findIndex((x) => x.pos === "POR"); assign.set(gk, free[i]); free.splice(i, 1); }
    const others = act.filter((o) => o !== gk);
    for (const o of others.sort((a, b) => b.p.ovr - a.p.ovr)) {
      let bi = 0, bv = -1;
      free.forEach((sl, i) => { if (sl.pos === "POR") return; const v = slotRating(o.p, sl.pos); if (v > bv) { bv = v; bi = i; } });
      assign.set(o, free[bi]);
      free.splice(bi, 1);
    }
    for (const [o, sl] of assign) { o.slot = sl.pos; o.x = sl.x; o.y = sl.y; }
    side.lineup = { ...side.lineup, formation };
    this.recalc(s);
    this.ev({ type: "info", side: s, text: `${side.input.short} cambia el dibujo a ${formation}.` });
  }

  private halftimeAI() {
    for (const s of [0, 1] as const) {
      const side = this.sides[s];
      if (side.input.ai === false) continue;
      // cambia amonestados de riesgo o muy cansados en el descanso (sin gastar ventana)
      const risky = this.active(s).filter((o) => o.slot !== "POR" && (o.yc > 0 && FOUL_W[o.slot] > 1.2 && this.rng.chance(0.3)));
      for (const o of risky.slice(0, 1)) {
        const rep = this.bestReplacement(s, o.slot);
        if (rep && side.subs < 5) this.doSub(s, o.id, rep.id);
      }
    }
  }

  private aiSubs(s: 0 | 1) {
    const side = this.sides[s];
    if (side.subs >= 5 || side.windows >= 3) return;
    const m = this.minute;
    const windowsAt = [60, 70, 80, 105];
    const due = windowsAt.findIndex((w) => w === m && this.added === 0);
    if (due < 0) return;
    const cands = this.active(s)
      .filter((o) => o.slot !== "POR")
      .map((o) => ({ o, need: (100 - o.fit) + (o.yc ? 12 : 0) + (6.5 - o.line.r) * 8 - (o.line.g ? 10 : 0) }))
      .sort((a, b) => b.need - a.need);
    const n = Math.min(5 - side.subs, m >= 80 ? 1 : 2);
    let did = 0;
    for (const { o, need } of cands) {
      if (did >= n || need < 12) break;
      const rep = this.bestReplacement(s, o.slot);
      if (!rep) break;
      if (slotRating(rep, o.slot) < this.eff(o) - 8 && need < 30) continue;
      if (this.doSub(s, o.id, rep.id)) did++;
    }
    if (did) side.windows++;
  }

  private penaltyKick() {
    const kicks = this.pensTaken[0] + this.pensTaken[1];
    const s = (kicks % 2) as 0 | 1;
    const side = this.sides[s];
    const act = this.active(s);
    const order = side.pensOrder.filter((id) => act.some((o) => o.id === id));
    for (const o of act) if (!order.includes(o.id)) order.push(o.id);
    const taker = act.find((o) => o.id === order[this.pensTaken[s] % order.length])!;
    const gk = this.gkOf(1 - s as 0 | 1);
    const p = clamp(0.75 + (taker.p.pen - 75) * 0.005 - ((gk ? this.eff(gk) : 60) - 78) * 0.004 - (this.pensTaken[s] >= 5 ? 0.03 : 0), 0.5, 0.92);
    const scored = this.rng.chance(p);
    this.pensTaken[s]++;
    if (scored) this.pens[s]++;
    this.ev({
      type: "tanda", side: s, player: taker.id, scored,
      text: scored ? `${this.name(taker.id)} anota. (${this.pens[0]}-${this.pens[1]})` : `¡${this.name(taker.id)} falla! ${this.rng.chance(0.6) ? `Lo ataja ${this.name(gk?.id)}` : "Se va fuera"}. (${this.pens[0]}-${this.pens[1]})`,
    });
    // ¿terminó?
    const [a, b] = this.pensTaken;
    const [pa, pb] = this.pens;
    if (a <= 5 && b <= 5) {
      const remA = 5 - a, remB = 5 - b;
      if (pa > pb + remB || pb > pa + remA) this.finish();
    } else if (a === b && pa !== pb) this.finish();
  }

  // ===== Resultado =====
  result(): MatchResult {
    const tot = this.possAcc[0] + this.possAcc[1] || 1;
    this.stats[0].poss = Math.round((this.possAcc[0] / tot) * 100);
    this.stats[1].poss = 100 - this.stats[0].poss;
    this.stats.forEach((s) => (s.xg = Math.round(s.xg * 100) / 100));
    const players: Record<string, PlayerLine> = {};
    for (const s of this.sides) for (const [id, l] of Object.entries(s.lines)) players[id] = l;
    const keep: MatchEvent["type"][] = ["gol", "gol_pp", "penal_fallado", "penal_atajado", "amarilla", "doble_amarilla", "roja", "lesion", "cambio", "var", "tanda"];
    return {
      hg: this.score[0],
      ag: this.score[1],
      et: this.et || undefined,
      pens: this.pensTaken[0] + this.pensTaken[1] > 0 ? [...this.pens] as [number, number] : undefined,
      events: this.events.filter((e) => keep.includes(e.type)),
      stats: this.stats,
      players,
      seed: this.seed,
    };
  }
}

// Utilidad: simula un partido completo
export function simulateMatch(home: MatchTeamInput, away: MatchTeamInput, opts: MatchOptions = {}): MatchResult {
  return new FootballMatch(home, away, opts).runToEnd();
}
