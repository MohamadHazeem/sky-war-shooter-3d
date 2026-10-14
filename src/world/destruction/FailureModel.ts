import { CORE, DETACHABLE, FATAL, NEIGHBOURS, PART_COUNT, TAIL, WING_L, WING_L_TIP, WING_R, WING_R_TIP, subtree } from './Parts';

// The failure model: where an aircraft has been hit, and what gives way. Pure and deterministic
// (a seeded generator, no wall clock, no three.js), so the host's decisions can be replayed from
// a few bits on a co-op guest and the rules can be unit-tested.
//
// Each structural part (Parts.ts) has its own strength. Rounds are booked to the part they land
// on; a part shot through comes off (and everything hanging from it: a wing takes its outer
// panel). Hits on a fuel tank can start a fire. Fire grows (fast on fuel), eats the part's
// strength until it burns through, spreads to neighbouring parts, and a tank that burns long
// enough cooks off. The kill itself stays with World's zones (game balance); this model decides
// HOW the aircraft fails, and adds the failures that happen before the kill (a lost wingtip, a
// fire that makes the pilot bail out, a tank that explodes).

export const EV_DETACH = 1, EV_IGNITE = 2, EV_EXPLODE = 3;
const MAX_EV = 16;
const IGNITE_MG = 0.012;     // chance per .50 round on a full fuel tank (self-sealing tanks)
const IGNITE_CANNON = 0.1;   // per cannon shell
const BURN = 0.035;          // share of a part's strength a full fire eats per second (x0.6..1.6 with fuel)
const SPREAD = 0.12;         // 1/s, fire jumping to a neighbouring part (x fire x (0.35 + its fuel))
const COOK = 0.2;            // 1/s, a tank in a fierce fire going up (x fuel x fire), after HOT s
const HOT = 1.5;
export const DOOM_FIRE = 0.55;   // a fuel fire this big: the pilot gives the aircraft up

/** Deterministic generator (mulberry32). */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Structure {
  readonly hp = new Float32Array(PART_COUNT);
  readonly max = new Float32Array(PART_COUNT);
  readonly fuel = new Float32Array(PART_COUNT);
  readonly fire = new Float32Array(PART_COUNT);   // 0 none .. 1 raging
  readonly hot = new Float32Array(PART_COUNT);    // s a tank has burned fiercely
  detached = 0;            // bit per part
  exploded = false;
  playerFire = false;      // the player's rounds started the fire (World credits the burn)
  lastPart = -1;           // the part the last round landed on
  // events of the last hit() / tick(): kind (EV_*) and part, nEv entries (no allocation per call)
  readonly evKind = new Uint8Array(MAX_EV);
  readonly evPart = new Uint8Array(MAX_EV);
  nEv = 0;
  readonly rnd: () => number;

  constructor(hp: ArrayLike<number>, fuel: ArrayLike<number>, seed: number) {
    for (let i = 0; i < PART_COUNT; i++) { this.hp[i] = this.max[i] = hp[i]; this.fuel[i] = fuel[i] ?? 0; }
    this.rnd = mulberry(seed);
  }

  attached(p: number) { return !(this.detached & (1 << p)); }
  frac(p: number) { return this.max[p] > 0 ? Math.max(0, this.hp[p]) / this.max[p] : 1; }
  get burning() { for (let i = 0; i < PART_COUNT; i++) if (this.fire[i] > 0 && this.attached(i)) return true; return false; }

  private push(kind: number, part: number) {
    if (this.nEv >= MAX_EV) return;
    this.evKind[this.nEv] = kind; this.evPart[this.nEv] = part; this.nEv++;
  }

  /** A round of `dmg` lands on `part`. incendiary: extra ignition chance (perk). Returns the event count. */
  hit(part: number, dmg: number, cannon: boolean, incendiary = 0, player = false): number {
    this.nEv = 0;
    if (part < 0 || part >= PART_COUNT || !this.attached(part)) return 0;
    this.lastPart = part;
    this.hp[part] -= dmg;
    const f = this.fuel[part];
    if (f > 0 && this.fire[part] <= 0 && this.rnd() < Math.min(0.6, f * (cannon ? IGNITE_CANNON : IGNITE_MG) + incendiary)) this.ignite(part, player);
    if (DETACHABLE[part] && this.hp[part] <= 0) this.detach(part);
    return this.nEv;
  }

  ignite(part: number, player = false) {
    if (!this.attached(part) || this.fire[part] > 0) return;
    this.fire[part] = 0.15;
    if (player) this.playerFire = true;
    this.push(EV_IGNITE, part);
  }

  /** The part (and what hangs from it) comes off. Its fire goes with it. */
  detach(part: number) {
    if (!DETACHABLE[part] || !this.attached(part)) return;
    this.detached |= subtree(part);
    this.push(EV_DETACH, part);
  }

  /** Fire growth, burn-through, spread and cook-off. Returns the event count. */
  tick(dt: number): number {
    this.nEv = 0;
    if (this.exploded) return 0;
    for (let p = 0; p < PART_COUNT; p++) {
      if (this.fire[p] <= 0 || !this.attached(p)) continue;
      const f = this.fuel[p];
      this.fire[p] = Math.min(f > 0 ? 1 : 0.6, this.fire[p] + dt * (f > 0 ? 0.06 + 0.12 * Math.min(f, 1.5) : 0.03));
      const fire = this.fire[p];
      this.hp[p] -= fire * this.max[p] * BURN * (0.6 + 0.6 * Math.min(f, 1.6)) * dt;
      if (DETACHABLE[p] && this.hp[p] <= 0) { this.detach(p); continue; }
      for (const n of NEIGHBOURS[p]) {
        if (this.fire[n] <= 0 && this.attached(n) && this.rnd() < dt * SPREAD * fire * (0.35 + this.fuel[n])) this.ignite(n, this.playerFire);
      }
      if (f > 0 && fire > 0.5) {
        this.hot[p] += dt;
        if (this.hot[p] > HOT && this.rnd() < dt * COOK * Math.min(f, 1.6) * fire) { this.exploded = true; this.push(EV_EXPLODE, p); return this.nEv; }
      }
    }
    return this.nEv;
  }

  /** Beyond saving: a vital part is gone, a tank is ablaze, or it has blown up. */
  doomed(): boolean {
    if (this.exploded) return true;
    for (let p = 0; p < PART_COUNT; p++) {
      if (!this.attached(p)) { if (FATAL[p]) return true; continue; }
      if (this.fuel[p] > 0 && this.fire[p] >= DOOM_FIRE) return true;
    }
    return false;
  }

  /** Part-state bits for co-op snapshots: detached (7) | burning (7) << 7 | exploded << 14. */
  bits(): number {
    let b = this.detached & 0x7f;
    for (let p = 0; p < PART_COUNT; p++) if (this.fire[p] > 0) b |= 1 << (7 + p);
    if (this.exploded) b |= 1 << 14;
    return b;
  }

  /** Guest side: take the host's part state (the fires keep a nominal size). */
  applyBits(b: number) {
    this.detached = b & 0x7f;
    for (let p = 0; p < PART_COUNT; p++) this.fire[p] = b & (1 << (7 + p)) ? Math.max(this.fire[p], 0.4) : 0;
    this.exploded = !!(b & (1 << 14));
  }
}

// ---------------------------------------------------------------- how it dies
export type Ending = 'none' | 'explode' | 'wing' | 'tail';
const ENDINGS: Ending[] = ['none', 'explode', 'wing', 'tail'];
export interface Plan { ending: Ending; part: number; bail: boolean }

/**
 * The break-up the damage calls for when the aircraft is killed by `cause` (a zone name, 'fire',
 * 'fuel', 'engine', ...). 'none': nothing structural gave way, the caller picks a scripted ending
 * (engine fire, bail-out, dead pilot). roll: two uniform numbers (the structure's own generator
 * on the host, so the guest replays the plan from its code).
 */
export function planEnding(s: Structure, cause: string, r1: number, r2: number, out: Plan): Plan {
  out.ending = 'none'; out.part = CORE; out.bail = false;
  if (s.exploded || cause === 'fuel') { out.ending = 'explode'; return out; }
  // a wing: the side that was shot away, else the one already gone
  let side = cause === 'wingL' ? WING_L : cause === 'wingR' ? WING_R : -1;
  if (side < 0) for (const w of [WING_L, WING_R]) if (!s.attached(w)) side = w;
  if (side < 0 && cause !== 'tail' && s.attached(TAIL)) {
    // burned through, or nearly shot away: the weaker wing goes if it is far gone
    const l = Math.min(s.frac(WING_L), s.frac(WING_L_TIP) + 0.3), r = Math.min(s.frac(WING_R), s.frac(WING_R_TIP) + 0.3);
    if (Math.min(l, r) < 0.2) side = l < r ? WING_L : WING_R;
  }
  if (side >= 0) {
    const tip = side === WING_L ? WING_L_TIP : WING_R_TIP;
    // a wet wing on fire goes up rather than folding
    if (s.fuel[side] > 0 && s.fire[side] > 0.3 && r1 < 0.45) { out.ending = 'explode'; return out; }
    out.ending = 'wing';
    // where it gives way: the root unless the damage is out on the panel
    out.part = !s.attached(side) || !s.attached(tip) ? side
      : (1 - s.frac(tip)) > (1 - s.frac(side)) + 0.15 ? tip : side;
    out.bail = r2 < 0.4;   // the spin pins most pilots in their seats
    return out;
  }
  if (cause === 'tail' || !s.attached(TAIL) || s.frac(TAIL) <= 0) {
    out.ending = 'tail'; out.part = TAIL; out.bail = r2 < 0.45;
    return out;
  }
  // a big fuel fire: a third of the time the tank goes before anything else
  for (let p = 0; p < PART_COUNT; p++) if (s.fuel[p] > 0 && s.fire[p] >= DOOM_FIRE && s.attached(p) && r1 < 0.35) { out.ending = 'explode'; return out; }
  return out;
}

/** Plan <-> small integer (co-op kill events). */
export function encodePlan(p: Plan): number { return ENDINGS.indexOf(p.ending) | (p.part << 2) | (p.bail ? 32 : 0); }
export function decodePlan(code: number, out: Plan): Plan {
  out.ending = ENDINGS[code & 3] ?? 'none'; out.part = (code >> 2) & 7; out.bail = !!(code & 32);
  if (out.part >= PART_COUNT) out.part = CORE;
  return out;
}
