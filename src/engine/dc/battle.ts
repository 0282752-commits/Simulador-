// Motor de batalla por rondas (escala propia de la app).
import { Rng, clamp } from "../../lib/rng";
import type { BattleEvent, BattleResult, DcCharacter, FighterLine, Synergy } from "./types";

export function overall(c: Pick<DcCharacter, "str" | "spd" | "dur" | "cmb" | "int" | "pow">): number {
  return Math.round(c.str * 0.18 + c.spd * 0.16 + c.dur * 0.18 + c.cmb * 0.16 + c.int * 0.12 + c.pow * 0.2);
}

export interface BattleSide { id: string; name: string; members: DcCharacter[] }

interface Fighter { c: DcCharacter; side: number; hp: number; maxHp: number; cd: number; stun: number; line: FighterLine }

export function teamSynergy(members: string[], syn: Synergy[]): { value: number; pairs: Synergy[] } {
  const set = new Set(members);
  const pairs = syn.filter((s) => set.has(s.a) && set.has(s.b));
  return { value: clamp(pairs.reduce((a, s) => a + s.value, 0), -0.3, 0.3), pairs };
}

export class Battle {
  rng: Rng;
  f: Fighter[] = [];
  round = 0;
  log: BattleEvent[] = [];
  syn: number[] = [];
  buff: { dmg: number; shield: number; until: number }[] = [];
  comeback: boolean[] = [];
  winner: number | null = null;
  koOrder: string[] = [];
  maxRounds = 25;
  private queue: Fighter[] = [];
  private lastHit = new Map<string, { actor: string; round: number }>();

  constructor(public sides: BattleSide[], public synergies: Synergy[], public randomness = 0.5, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rng = new Rng(seed);
    sides.forEach((s, i) => {
      for (const c of s.members) {
        const maxHp = Math.round(220 + c.dur * 6);
        this.f.push({ c, side: i, hp: maxHp, maxHp, cd: 1 + this.rng.int(0, 1), stun: 0, line: { id: c.id, side: i, dmg: 0, taken: 0, kos: 0, hp: maxHp, maxHp, ko: false } });
      }
      const ts = teamSynergy(s.members.map((m) => m.id), synergies);
      this.syn.push(ts.value);
      this.buff.push({ dmg: 0, shield: 0, until: 0 });
      this.comeback.push(false);
      for (const p of ts.pairs) this.ev({ type: "info", side: i, text: `${p.value > 0 ? "Sinergia" : "Tensión"} en ${s.name}: ${this.nm(p.a)} y ${this.nm(p.b)} (${p.label}, ${p.value > 0 ? "+" : ""}${Math.round(p.value * 100)}%).` });
    });
  }

  nm(id: string) { return this.f.find((x) => x.c.id === id)?.c.name ?? id; }
  private ev(e: Omit<BattleEvent, "round">) { this.log.push({ round: this.round, ...e }); }
  alive(side?: number) { return this.f.filter((x) => x.hp > 0 && (side === undefined || x.side === side)); }
  get finished() { return this.winner !== null; }

  private sidesAlive(): number[] { return [...new Set(this.alive().map((x) => x.side))]; }

  // Una acción por llamada (para el visor en vivo)
  step(): BattleEvent[] {
    const start = this.log.length;
    if (this.finished) return [];
    if (!this.queue.length) {
      this.round++;
      if (this.round > this.maxRounds) { this.decideByHp(); return this.log.slice(start); }
      this.ev({ type: "info", text: `— Ronda ${this.round} —` });
      this.checkComeback();
      const r = this.randomness;
      this.queue = this.alive().sort((a, b) => b.c.spd + this.rng.next() * 40 * r - (a.c.spd + this.rng.next() * 40 * r));
    }
    const actor = this.queue.shift()!;
    if (actor.hp > 0) this.act(actor);
    const alive = this.sidesAlive();
    if (alive.length <= 1) { this.winner = alive.length ? alive[0] : -1; this.ev({ type: "info", text: alive.length ? `¡Victoria de ${this.sides[alive[0]].name}!` : "¡Doble K.O.! Empate." }); }
    return this.log.slice(start);
  }

  runToEnd(): BattleResult {
    let g = 0;
    while (!this.finished && g++ < 5000) this.step();
    return this.result();
  }

  private decideByHp() {
    const pct = this.sides.map((_, i) => { const fs = this.f.filter((x) => x.side === i); return fs.reduce((a, x) => a + Math.max(0, x.hp), 0) / fs.reduce((a, x) => a + x.maxHp, 0); });
    const best = Math.max(...pct);
    const winners = pct.map((p, i) => (Math.abs(p - best) < 0.005 ? i : -1)).filter((i) => i >= 0);
    this.winner = winners.length === 1 ? winners[0] : -1;
    this.ev({ type: "info", text: this.winner >= 0 ? `Tiempo: gana ${this.sides[this.winner].name} por decisión (${Math.round(best * 100)}% de vida).` : "Tiempo cumplido: empate." });
  }

  private checkComeback() {
    this.sides.forEach((s, i) => {
      if (this.comeback[i]) return;
      const mine = this.alive(i).length, total = this.f.filter((x) => x.side === i).length;
      const others = this.alive().filter((x) => x.side !== i).length;
      const hpPct = this.alive(i).reduce((a, x) => a + x.hp / x.maxHp, 0) / total;
      if (mine > 0 && ((mine < others && hpPct < 0.35) || hpPct < 0.2)) {
        this.comeback[i] = true;
        this.ev({ type: "remontada", side: i, text: `¡${s.name} se niega a caer! Adrenalina: +15% de daño.` });
      }
    });
  }

  private pickTarget(a: Fighter): Fighter | undefined {
    const enemies = this.alive().filter((x) => x.side !== a.side);
    if (!enemies.length) return undefined;
    const smart = a.c.int / 100;
    return this.rng.weighted(enemies, (e) => {
      let w = 1;
      w += (1 - e.hp / e.maxHp) * 2 * smart; // rematar
      for (const t of a.c.attackTags) if (e.c.weaknesses[t]) w += 3 * smart * e.c.weaknesses[t]; // explotar debilidades
      w += (e.c.pow + e.c.str) / 200 * smart; // amenaza
      return w;
    });
  }

  private weaknessMult(a: Fighter, t: Fighter, kind: "fisico" | "poder" | "especial"): [number, string | null] {
    let m = 1, tag: string | null = null;
    for (const at of a.c.attackTags) {
      const w = t.c.weaknesses[at];
      if (w && w > m && (kind !== "fisico" || at === "kryptonita" || at === "magia" || at === "nth")) { m = w; tag = at; }
    }
    return [m, tag];
  }

  private act(a: Fighter) {
    if (a.stun > 0) { a.stun--; this.ev({ type: "aturdido", actor: a.c.id, side: a.side, text: `${a.c.name} está aturdido y pierde el turno.` }); return; }
    const r = this.randomness;
    a.cd = Math.max(0, a.cd - 1);
    // especial
    if (a.cd === 0 && this.rng.chance(0.55 + a.c.int / 400)) {
      a.cd = 3;
      this.special(a);
      // las habilidades de apoyo no consumen el ataque del turno
      if (!["cura", "escudo", "potenciar"].includes(a.c.special.type)) return;
    }
    const t = this.pickTarget(a);
    if (!t) return;
    const usePower = a.c.pow > a.c.str ? this.rng.chance(0.75) : this.rng.chance(a.c.pow / 200);
    const atk = a.c.cmb * 0.55 + a.c.spd * 0.3 + a.c.int * 0.15;
    const def = t.c.cmb * 0.45 + t.c.spd * 0.4 + t.c.int * 0.15;
    let pHit = 0.66 + (atk - def) / 170 + this.syn[a.side] / 2;
    pHit = clamp(pHit * (1 - r * 0.2) + 0.5 * r * 0.2, 0.2, 0.96);
    if (!this.rng.chance(pHit)) {
      this.ev({ type: "fallo", actor: a.c.id, target: t.c.id, side: a.side, text: `${t.c.name} ${this.rng.pick(["esquiva", "bloquea", "detiene", "desvía"])} el ${usePower ? "ataque de poder" : "golpe"} de ${a.c.name}.` });
      return;
    }
    const base = usePower ? a.c.pow * 1.0 + a.c.int * 0.15 : a.c.str * 0.85 + a.c.cmb * 0.45;
    this.hit(a, t, base, usePower ? "poder" : "fisico");
  }

  private hit(a: Fighter, t: Fighter, base: number, kind: "fisico" | "poder" | "especial", label?: string) {
    const r = this.randomness;
    const variance = 1 + this.rng.normal(0, 0.18 + 0.4 * r);
    const [wm, tag] = this.weaknessMult(a, t, kind);
    const mitig = kind === "fisico" ? 1 - (t.c.dur / 150) * 0.62 : 1 - (t.c.dur / 150) * 0.45;
    const buffA = this.buff[a.side].until >= this.round ? this.buff[a.side].dmg : 0;
    const shieldT = this.buff[t.side].until >= this.round ? this.buff[t.side].shield : 0;
    let dmg = base * clamp(variance, 0.4, 1.8) * mitig * wm * (1 + this.syn[a.side] + buffA + (this.comeback[a.side] ? 0.15 : 0)) * (1 - shieldT);
    const critP = (0.06 + a.c.int / 1000 + a.c.cmb / 1500) * (0.5 + r);
    const crit = this.rng.chance(critP);
    if (crit) dmg *= 1.7;
    // combo con compañero en sinergia que golpeó este objetivo en esta ronda
    const prev = this.lastHit.get(t.c.id);
    const partner = prev && prev.round === this.round && prev.actor !== a.c.id && this.synergies.some((s) => s.value > 0 && ((s.a === a.c.id && s.b === prev.actor) || (s.b === a.c.id && s.a === prev.actor)));
    if (partner) dmg *= 1.3;
    dmg = Math.max(1, Math.round(dmg));
    t.hp -= dmg;
    a.line.dmg += dmg;
    t.line.taken += dmg;
    this.lastHit.set(t.c.id, { actor: a.c.id, round: this.round });
    const verb = kind === "especial" ? `usa ${label}` : kind === "poder" ? this.rng.pick(["lanza una ráfaga de energía", "descarga sus poderes", "desata su poder"]) : this.rng.pick(["conecta un golpe", "golpea con fuerza", "lanza un combo de puñetazos", "embiste"]);
    let text = `${a.c.name} ${verb} contra ${t.c.name}: ${dmg} de daño.`;
    if (tag) text += ` ¡Explota su debilidad (${tag})!`;
    this.ev({ type: partner ? "combo" : crit ? "critico" : kind === "especial" ? "especial" : kind === "poder" ? "poder" : "ataque", actor: a.c.id, target: t.c.id, dmg, side: a.side, text: (partner ? `¡COMBO con ${this.nm(prev!.actor)}! ` : "") + (crit ? "¡CRÍTICO! " : "") + text });
    if (t.hp <= 0) {
      t.hp = 0;
      t.line.ko = true;
      a.line.kos++;
      this.koOrder.push(t.c.id);
      this.ev({ type: "ko", actor: a.c.id, target: t.c.id, side: a.side, text: `💥 ¡${t.c.name} queda NOQUEADO por ${a.c.name}!` });
    }
  }

  private special(a: Fighter) {
    const sp = a.c.special;
    const allies = this.alive(a.side);
    switch (sp.type) {
      case "cura": {
        const t = allies.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        const heal = Math.round(a.c.pow * 1.5 * sp.power + 40);
        t.hp = Math.min(t.maxHp, t.hp + heal);
        this.ev({ type: "cura", actor: a.c.id, target: t.c.id, side: a.side, text: `${a.c.name} usa ${sp.name}: ${t.c.name} recupera ${heal} de vida.` });
        return;
      }
      case "escudo": {
        this.buff[a.side] = { ...this.buff[a.side], shield: 0.3 * sp.power, until: this.round + 1 };
        this.ev({ type: "defensa", actor: a.c.id, side: a.side, text: `${a.c.name} usa ${sp.name}: su equipo recibe ${Math.round(30 * sp.power)}% menos daño durante 2 rondas.` });
        return;
      }
      case "potenciar": {
        this.buff[a.side] = { ...this.buff[a.side], dmg: 0.2 * sp.power, until: this.round + 1 };
        this.ev({ type: "especial", actor: a.c.id, side: a.side, text: `${a.c.name} usa ${sp.name}: +${Math.round(20 * sp.power)}% de daño para su equipo.` });
        return;
      }
      case "aturdir": {
        const t = this.pickTarget(a);
        if (!t) return;
        const p = clamp(0.45 + (a.c.int + a.c.pow - t.c.int - t.c.dur) / 300, 0.15, 0.85) * sp.power;
        if (this.rng.chance(p)) {
          t.stun = 1;
          this.hit(a, t, (a.c.pow * 0.5 + a.c.str * 0.3), "especial", sp.name);
          if (t.hp > 0) this.ev({ type: "aturdido", actor: a.c.id, target: t.c.id, side: a.side, text: `${t.c.name} queda aturdido.` });
        } else this.ev({ type: "fallo", actor: a.c.id, target: t.c.id, side: a.side, text: `${t.c.name} resiste ${sp.name} de ${a.c.name}.` });
        return;
      }
      case "drenar": {
        const t = this.pickTarget(a);
        if (!t) return;
        const before = t.hp;
        this.hit(a, t, Math.max(a.c.pow, a.c.str) * sp.power, "especial", sp.name);
        const drained = Math.round((before - Math.max(0, t.hp)) * 0.5);
        a.hp = Math.min(a.maxHp, a.hp + drained);
        return;
      }
      default: {
        const t = this.pickTarget(a);
        if (!t) return;
        this.hit(a, t, Math.max(a.c.pow, a.c.str * 0.85 + a.c.cmb * 0.3) * sp.power * 0.85, "especial", sp.name);
      }
    }
  }

  result(): BattleResult {
    for (const x of this.f) x.line.hp = Math.max(0, x.hp);
    const lines = this.f.map((x) => ({ ...x.line }));
    const mvp = [...lines].filter((l) => l.side === this.winner || this.winner === -1).sort((a, b) => b.dmg + b.kos * 150 - (a.dmg + a.kos * 150))[0]?.id;
    return { winner: this.winner ?? -1, rounds: this.round, fighters: lines, mvp, koOrder: this.koOrder };
  }
}
