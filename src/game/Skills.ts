// Skill tree: a persistent, long-term build on top of the Armory. Skill points come from the
// career (two per promotion, then one per 3,000 XP past Major, so they never stop coming) and
// buy nodes in three branches with prerequisites; a respec refunds every point for merit.
//
// Pure data and maths plus guarded localStorage (sws3d.skills.v1, mirrored by the cloud save
// like every sws3d.* key), so it is unit-tested in Node. Owned nodes fold into
// Progression.loadout() through applySkills(); SkillRuntime.ts carries the effects that live
// outside the loadout (crits, Deadeye, Fortress, Second Wind, field repairs, boss armour).
import type { Loadout } from './Upgrades';
import { RANKS } from './Career';

// ---------------- the tree ----------------

export type Branch = 'marksman' | 'gunnery' | 'survivor';

export type SkillId =
  | 'sight' | 'steady' | 'vital' | 'eagle' | 'breach' | 'deadeye'
  | 'discipline' | 'buffer' | 'odDrill' | 'readyRack' | 'coldNerves' | 'ironLungs'
  | 'plating' | 'vests' | 'damageCtl' | 'secondWind' | 'fireDrill' | 'fortress';

export interface SkillDef {
  id: SkillId;
  branch: Branch;
  tier: 0 | 1 | 2 | 3;      // row in the branch (3 = capstone)
  col: -1 | 0 | 1;          // column in the branch: left, centre, right
  name: string;
  desc: string;             // what it does, in numbers
  cost: number;             // skill points
  req: SkillId[];           // prerequisites
  reqAny?: boolean;         // true: any one prerequisite is enough (capstones)
  capstone?: boolean;
}

export const BRANCHES: { id: Branch; name: string; motto: string; code: string }[] = [
  { id: 'marksman', name: 'Marksman', motto: 'Put every round where it counts', code: 'FM 1-M' },
  { id: 'gunnery', name: 'Gunnery Sergeant', motto: 'Keep the guns hot and talking', code: 'FM 1-G' },
  { id: 'survivor', name: 'Survivor', motto: 'Bring her home in one piece', code: 'FM 1-S' },
];

const ROOT = 1, MID = 1, DEEP = 2, CAP = 3;   // costs by tier

export const SKILLS: SkillDef[] = [
  // ---- Marksman ----
  { id: 'sight', branch: 'marksman', tier: 0, col: 0, cost: ROOT, req: [], name: 'Computing Sight', desc: 'The lead indicator computes with your gun\'s true muzzle velocity (upgrades and mods included). +6% hit radius.' },
  { id: 'steady', branch: 'marksman', tier: 1, col: -1, cost: MID, req: ['sight'], name: 'Steady Eye', desc: '+30% aim assist strength.' },
  { id: 'vital', branch: 'marksman', tier: 1, col: 1, cost: MID, req: ['sight'], name: 'Vital Points', desc: 'Critical hits: +30% damage on cockpits and engines.' },
  { id: 'eagle', branch: 'marksman', tier: 2, col: -1, cost: DEEP, req: ['steady'], name: 'Eagle Eye', desc: '+12% hit radius, −20% spread.' },
  { id: 'breach', branch: 'marksman', tier: 2, col: 1, cost: DEEP, req: ['vital'], name: 'Sweet Spot', desc: 'Boss weak points are 30% larger, armour breaks one part sooner and the hull takes double chip damage before the breach.' },
  { id: 'deadeye', branch: 'marksman', tier: 3, col: 0, cost: CAP, req: ['eagle', 'breach'], reqAny: true, capstone: true, name: 'Deadeye', desc: 'Every 10th round is a guaranteed hit: it flies true onto the bandit nearest your aim (within 8°).' },
  // ---- Gunnery Sergeant ----
  { id: 'discipline', branch: 'gunnery', tier: 0, col: 0, cost: ROOT, req: [], name: 'Barrel Discipline', desc: '−15% barrel heat.' },
  { id: 'buffer', branch: 'gunnery', tier: 1, col: -1, cost: MID, req: ['discipline'], name: 'Buffer Tuning', desc: '+8% rate of fire.' },
  { id: 'odDrill', branch: 'gunnery', tier: 1, col: 1, cost: MID, req: ['discipline'], name: 'Overdrive Drill', desc: 'Overdrive lasts 40% longer (8 s → 11.2 s).' },
  { id: 'readyRack', branch: 'gunnery', tier: 2, col: -1, cost: DEEP, req: ['buffer'], name: 'Ready Rack', desc: 'All ability cooldowns −20% (Mustangs, Overdrive, Focus).' },
  { id: 'coldNerves', branch: 'gunnery', tier: 2, col: 1, cost: DEEP, req: ['odDrill'], name: 'Cold Nerves', desc: 'Focus lasts 50% longer (3 s → 4.5 s).' },
  { id: 'ironLungs', branch: 'gunnery', tier: 3, col: 0, cost: CAP, req: ['readyRack', 'coldNerves'], reqAny: true, capstone: true, name: 'Iron Lungs', desc: 'The barrel never overheats: at full heat it keeps firing at 75% rate. Every kill during Overdrive tops it up by 1 s.' },
  // ---- Survivor ----
  { id: 'plating', branch: 'survivor', tier: 0, col: 0, cost: ROOT, req: [], name: 'Extra Plating', desc: '−10% damage taken.' },
  { id: 'vests', branch: 'survivor', tier: 1, col: -1, cost: MID, req: ['plating'], name: 'Flak Suits', desc: 'Crew wound chance −40%, yours included.' },
  { id: 'damageCtl', branch: 'survivor', tier: 1, col: 1, cost: MID, req: ['plating'], name: 'Damage Control', desc: 'Faster field repairs: +50% from kills and between rounds, and the crew patches 0.4% a second after 8 s without a hit.' },
  { id: 'secondWind', branch: 'survivor', tier: 2, col: -1, cost: DEEP, req: ['vests'], name: 'Second Wind', desc: 'Once per mission, when a vital part drops below 25%, the crew patches your aircraft back up by 40%.' },
  { id: 'fireDrill', branch: 'survivor', tier: 2, col: 1, cost: DEEP, req: ['damageCtl'], name: 'Fire Drill', desc: 'Extinguishers work 95% of the time (from 75%) and every engine carries two bottles.' },
  { id: 'fortress', branch: 'survivor', tier: 3, col: 0, cost: CAP, req: ['secondWind', 'fireDrill'], reqAny: true, capstone: true, name: 'Fortress', desc: 'The first heavy cannon hit each round is ignored: it glances off the armour plate.' },
];

const BY_ID = new Map<SkillId, SkillDef>(SKILLS.map((s) => [s.id, s]));
export const skillDef = (id: SkillId): SkillDef | undefined => BY_ID.get(id);
export const isSkillId = (id: unknown): id is SkillId => typeof id === 'string' && BY_ID.has(id as SkillId);
export const TREE_COST = SKILLS.reduce((a, s) => a + s.cost, 0);

// ---------------- points ----------------

export const POINTS_PER_RANK = 2;
export const XP_PER_POINT_AFTER_TOP = 3000;
const TOP_XP = RANKS[RANKS.length - 1].xp;

// Skill points earned by a career with this much XP: two per promotion, then one for every
// 3,000 XP past the top rank (Major)
export function skillPointsFor(xp: number): number {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let ranks = 0;
  for (let i = 1; i < RANKS.length; i++) if (x >= RANKS[i].xp) ranks++;
  return ranks * POINTS_PER_RANK + Math.floor(Math.max(0, x - TOP_XP) / XP_PER_POINT_AFTER_TOP);
}

// XP at which the next skill point arrives
export function nextPointAt(xp: number): number {
  const x = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  for (let i = 1; i < RANKS.length; i++) if (x < RANKS[i].xp) return RANKS[i].xp;
  return TOP_XP + (Math.floor((x - TOP_XP) / XP_PER_POINT_AFTER_TOP) + 1) * XP_PER_POINT_AFTER_TOP;
}

// Career XP straight from its save (Career.ts writes it after every debrief and daily order)
export function careerXp(): number {
  try {
    const o = JSON.parse(localStorage.getItem('sws3d.career.v1') ?? 'null');
    return o && typeof o.xp === 'number' && Number.isFinite(o.xp) ? Math.max(0, o.xp) : 0;
  } catch { return 0; }
}

// Merit cost of a respec: a base fee plus 100 per point refunded
export const respecCostFor = (spent: number) => (spent > 0 ? 250 + 100 * spent : 0);

// ---------------- the player's book ----------------

export const SKILLS_KEY = 'sws3d.skills.v1';

export type NodeState = 'owned' | 'available' | 'short' | 'locked';   // short = unlocked but too few points

// The merit wallet a respec is paid from (Progression satisfies it)
export interface MeritWallet { points: number; save(): void }

export class SkillBook {
  readonly owned = new Set<SkillId>();
  respecs = 0;

  constructor(load = true) {
    if (!load) return;
    try {
      const s = JSON.parse(localStorage.getItem(SKILLS_KEY) ?? 'null');
      if (s && typeof s === 'object') {
        if (Array.isArray(s.owned)) for (const id of s.owned) if (isSkillId(id)) this.owned.add(id);
        this.respecs = Math.max(0, Number(s.respecs) || 0);
        this.prune();
      }
    } catch { /* storage unavailable or corrupt: empty book */ }
  }

  save() {
    try { localStorage.setItem(SKILLS_KEY, JSON.stringify({ v: 1, owned: [...this.owned], respecs: this.respecs })); } catch { /* */ }
  }

  has(id: SkillId) { return this.owned.has(id); }

  spent(): number { let n = 0; for (const id of this.owned) n += BY_ID.get(id)?.cost ?? 0; return n; }
  available(xp: number): number { return Math.max(0, skillPointsFor(xp) - this.spent()); }

  prereqMet(id: SkillId): boolean {
    const d = BY_ID.get(id);
    if (!d) return false;
    if (!d.req.length) return true;
    return d.reqAny ? d.req.some((r) => this.owned.has(r)) : d.req.every((r) => this.owned.has(r));
  }

  state(id: SkillId, xp: number): NodeState {
    if (this.owned.has(id)) return 'owned';
    if (!this.prereqMet(id)) return 'locked';
    return this.available(xp) >= (BY_ID.get(id)?.cost ?? Infinity) ? 'available' : 'short';
  }

  canBuy(id: SkillId, xp: number) { return this.state(id, xp) === 'available'; }

  buy(id: SkillId, xp: number): boolean {
    if (!this.canBuy(id, xp)) return false;
    this.owned.add(id);
    this.save();
    return true;
  }

  respecCost() { return respecCostFor(this.spent()); }

  // Refund every point for merit. False when there is nothing to refund or merit is short.
  respec(wallet: MeritWallet): boolean {
    const cost = this.respecCost();
    if (cost <= 0 || wallet.points < cost) return false;
    wallet.points -= cost;
    wallet.save();
    this.owned.clear();
    this.respecs++;
    this.save();
    return true;
  }

  // Drop nodes whose prerequisites are no longer owned (old or hand-edited saves)
  private prune() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...this.owned]) if (!this.prereqMet(id)) { this.owned.delete(id); changed = true; }
    }
  }
}

// ---------------- loadout ----------------

// Fields the skill tree adds to Progression's Loadout (neutral values = no skills)
export interface SkillLoadout {
  leadVel: number;        // m/s the lead indicator computes with (0 = the old fixed 870/880)
  critMult: number;       // damage multiplier on cockpit / engine zones of enemy aircraft
  bossBreach: boolean;    // Sweet Spot: bigger boss weak points, earlier breach
  deadeye: number;        // every Nth player round is guided (0 = off)
  cooldownMult: number;   // ability cooldowns
  overdriveDur: number;   // Overdrive duration multiplier
  focusDur: number;       // Focus duration multiplier
  ironLungs: boolean;     // no overheating; Overdrive kills extend it
  crewWound: number;      // multiplier on crew wound chances
  repairMult: number;     // multiplier on round patch-ups (kill repairs are folded into killRepair)
  regen: number;          // in-flight patching, share of max hp per second (0 = off)
  extinguish: number;     // chance an extinguisher puts a fire out
  bottles: number;        // extinguisher bottles per engine
  secondWind: number;     // one-off patch-up below 25% integrity (0 = off)
  fortress: boolean;      // first heavy hit each round ignored
}

export const skillDefaults = (): SkillLoadout => ({
  leadVel: 0, critMult: 1, bossBreach: false, deadeye: 0, cooldownMult: 1, overdriveDur: 1, focusDur: 1, ironLungs: false,
  crewWound: 1, repairMult: 1, regen: 0, extinguish: 0.75, bottles: 1, secondWind: 0, fortress: false,
});

// Fold the owned nodes into a loadout in place (after the weapon mod, so the Computing Sight
// sees the final muzzle velocity)
export function applySkills(l: Loadout, owned: ReadonlySet<SkillId>): Loadout {
  const has = (id: SkillId) => owned.has(id);
  if (has('sight')) { l.leadVel = l.weapon.velocity * l.velocity; l.hitScale *= 1.06; }
  if (has('steady')) l.assist *= 1.3;
  if (has('vital')) l.critMult *= 1.3;
  if (has('eagle')) { l.hitScale *= 1.12; l.spread *= 0.8; }
  if (has('breach')) l.bossBreach = true;
  if (has('deadeye')) l.deadeye = 10;
  if (has('discipline')) l.heat *= 0.85;
  if (has('buffer')) l.rate *= 1.08;
  if (has('odDrill')) l.overdriveDur *= 1.4;
  if (has('readyRack')) l.cooldownMult *= 0.8;
  if (has('coldNerves')) l.focusDur *= 1.5;
  if (has('ironLungs')) l.ironLungs = true;
  if (has('plating')) l.armor *= 0.9;
  if (has('vests')) l.crewWound *= 0.6;
  if (has('damageCtl')) { l.repairMult *= 1.5; l.killRepair *= 1.5; l.regen = 0.004; }
  if (has('secondWind')) l.secondWind = 0.4;
  if (has('fireDrill')) { l.extinguish = 0.95; l.bottles = 2; }
  if (has('fortress')) l.fortress = true;
  return l;
}

// ---------------- Deadeye ----------------

export interface V3 { x: number; y: number; z: number }

// Launch velocity that puts a round fired from `pos` onto a target at `tpos` moving at `tvel`,
// for a gun moving at `svel` with muzzle speed `muzzle`, under the Ballistics model (gravity,
// drag e^(-k t)). Returns null when there is no sensible solution (out of range).
export function interceptVelocity(pos: V3, svel: V3, muzzle: number, tpos: V3, tvel: V3, g = 9.81, k = 0.12): V3 | null {
  const dx0 = tpos.x - pos.x, dy0 = tpos.y - pos.y, dz0 = tpos.z - pos.z;
  let t = Math.hypot(dx0, dy0, dz0) / Math.max(1, muzzle);
  let out: V3 | null = null;
  for (let i = 0; i < 12; i++) {
    if (!(t > 0) || t > 3) return null;
    const f = (1 - Math.exp(-k * t)) / k;          // distance per unit launch speed after t
    const drop = (g / k) * (t - f);                 // gravity fall with drag
    const vx = (dx0 + tvel.x * t) / f, vy = (dy0 + tvel.y * t + drop) / f, vz = (dz0 + tvel.z * t) / f;
    out = { x: vx, y: vy, z: vz };
    const rel = Math.hypot(vx - svel.x, vy - svel.y, vz - svel.z);
    const next = t * (rel / muzzle);
    if (Math.abs(next - t) < 1e-5) break;
    t = next;
  }
  return out;
}
