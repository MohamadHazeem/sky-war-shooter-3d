// Between-mission decisions (Phase 11 goal 13): the choices the player makes in the hangar
// before the next gunner mission, each with a simple, visible trade-off.
//
// - Ground crew: SHIFTS of work per break, spent on armour (less damage taken), guns (cooler,
//   tighter fire) or engines (tougher engines). A ship that came home badly shot up costs a
//   shift for patching holes first.
// - Volunteer for a dangerous mission: tougher, sharper fighters, but +50% merit and the
//   mission counts double for every crewman who flies it (faster tour progress, more fatigue).
// - Leave: a 48-hour pass for a tired man. He misses the next mission (a replacement flies),
//   then comes back fully rested with a skill bonus for one mission.
// - Fatigue: every mission flown in a row tires a man; from the third one his skills drop.
// - Replacements: a man out (hospital, leave, killed) is replaced by a green rookie for free,
//   or by a seasoned replacement from the depot for merit.
// Swapping stations is the crew roster (ui/CrewPanel.ts); the ship's name and nose art live in
// Progression.bomber (Customize.ts) and are edited from the same panel.
//
// Pure state and maths with type-only imports (unit-tested in Node). The UI is
// ui/CrewDecisionsPanel.ts; the game glue is game/CrewDecisionHooks.ts.
import type { ManId } from './CrewRoster';
import type { CrewId } from '../world/Crew';
import type { Loadout } from './Upgrades';

export type Work = 'armour' | 'guns' | 'engines';
export const WORKS: Work[] = ['armour', 'guns', 'engines'];
export const SHIFTS = 3;                 // ground-crew shifts per break
export const REPAIR_AT = 0.6;            // ship came home below this integrity: one shift goes on repairs
export const PER_SHIFT = { armour: 0.07, heat: 0.1, spread: 0.05, engines: 0.25 } as const;
export const VOLUNTEER = { enemy: 1.2, merit: 1.5 } as const;
export const MAX_LEAVE = 2;
export const ROOKIE_SKILL_FREE = 24;     // = CrewRoster.ROOKIE_SKILL
export const VETERAN_SKILL = 42;
export const VETERAN_COST = 250;
export const RESTED_BONUS = 1.06;
export const FATIGUE_MAX = 6;

export const WORK_LABEL: Record<Work, string> = { armour: 'Armour', guns: 'Guns', engines: 'Engines' };
export const WORK_GAIN: Record<Work, string> = {
  armour: '−{n}% damage taken',
  guns: '−{n}% barrel heat, tighter fire',
  engines: '+{n}% engine toughness',
};

/** Skill multiplier from fatigue: fresh up to two missions in a row, then −4% per mission. */
export function fatigueMult(f: number): number {
  return f <= 2 ? 1 : Math.max(0.84, 1 - 0.04 * (Math.min(f, FATIGUE_MAX) - 2));
}
export function fatigueLabel(f: number): 'Fresh' | 'Tired' | 'Exhausted' {
  return f <= 2 ? 'Fresh' : f <= 4 ? 'Tired' : 'Exhausted';
}

/** What the next mission flies with (frozen when it starts). */
export interface Plan { work: Record<Work, number>; volunteer: boolean }

/** The ground crew's work folded into the gunner loadout (multipliers). */
export function workEffects(work: Readonly<Record<Work, number>>) {
  return {
    armor: 1 - PER_SHIFT.armour * work.armour,
    heat: 1 - PER_SHIFT.heat * work.guns,
    spread: 1 - PER_SHIFT.spread * work.guns,
    engines: 1 + PER_SHIFT.engines * work.engines,
  };
}

/** Progression.loadout hook: the running gunner mission's ground-crew work (no change otherwise). */
export function groundCrewLoadout<L extends Pick<Loadout, 'armor' | 'heat' | 'spread'>>(l: L, role: 'gunner' | 'pilot', plan: Plan | null = crewDecisions.flying): L {
  if (role !== 'gunner' || !plan) return l;
  const fx = workEffects(plan.work);
  l.armor *= fx.armor; l.heat *= fx.heat; l.spread *= fx.spread;
  return l;
}

interface Saved {
  v: 1; work: Record<Work, number>; repairs: number; volunteer: boolean; leave: ManId[];
  fatigue: Partial<Record<ManId, number>>; rested: ManId[]; veterans: CrewId[];
}
const KEY = 'sws3d.decisions.v1';
const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
const zeroWork = (): Record<Work, number> => ({ armour: 0, guns: 0, engines: 0 });

export class CrewDecisions {
  work = zeroWork();
  repairs = 0;                              // shifts taken by battle-damage repairs this break
  volunteer = false;
  readonly leave = new Set<ManId>();         // on a pass: misses the next mission
  fatigue: Partial<Record<ManId, number>> = {};
  readonly rested = new Set<ManId>();        // back from leave: bonus on the next mission flown
  readonly veterans = new Set<CrewId>();     // depot replacements hired for the next mission
  /** The plan of the mission now running (null between missions or outside gunner missions). */
  flying: Plan | null = null;
  private missions0: Partial<Record<ManId, number>> = {};
  private listeners: (() => void)[] = [];

  constructor(private storage: () => Storage | null = () => (typeof localStorage === 'undefined' ? null : localStorage)) {
    try {
      const s = JSON.parse(this.storage()?.getItem(KEY) ?? 'null') as Partial<Saved> | null;
      if (s && typeof s === 'object') {
        this.repairs = int(s.repairs, 0, SHIFTS, 0);
        for (const w of WORKS) this.work[w] = int(s.work?.[w], 0, SHIFTS, 0);
        while (this.used() > this.shifts()) { const w = WORKS.find((k) => this.work[k] > 0)!; this.work[w]--; }
        this.volunteer = s.volunteer === true;
        for (const id of (s.leave ?? []).slice(0, MAX_LEAVE)) this.leave.add(id);
        for (const id of s.rested ?? []) this.rested.add(id);
        for (const c of s.veterans ?? []) this.veterans.add(c);
        for (const [id, f] of Object.entries(s.fatigue ?? {})) this.fatigue[id as ManId] = int(f, 0, FATIGUE_MAX, 0);
      }
    } catch { /* storage unavailable or corrupt: defaults */ }
  }

  save() {
    try {
      this.storage()?.setItem(KEY, JSON.stringify({
        v: 1, work: this.work, repairs: this.repairs, volunteer: this.volunteer, leave: [...this.leave],
        fatigue: this.fatigue, rested: [...this.rested], veterans: [...this.veterans],
      } satisfies Saved));
    } catch { /* */ }
  }
  on(f: () => void) { this.listeners.push(f); }
  private changed() { this.save(); for (const f of this.listeners) f(); }

  // ---------- ground crew ----------
  shifts() { return SHIFTS - this.repairs; }
  used() { return this.work.armour + this.work.guns + this.work.engines; }
  free() { return this.shifts() - this.used(); }
  /** +1 / −1 shift on one job; false when there is no shift left (or none to take back). */
  assign(w: Work, delta: 1 | -1): boolean {
    if (delta > 0 ? this.free() <= 0 : this.work[w] <= 0) return false;
    this.work[w] += delta;
    this.changed();
    return true;
  }

  // ---------- volunteer ----------
  setVolunteer(on: boolean) { if (this.volunteer !== on) { this.volunteer = on; this.changed(); } }

  // ---------- fatigue and leave ----------
  fatigueOf(id: ManId) { return this.fatigue[id] ?? 0; }
  /** Multiplier on a crewman's skills: fatigue, or the bonus after a pass. */
  skillMult(id: ManId) { return this.rested.has(id) ? RESTED_BONUS : fatigueMult(this.fatigueOf(id)); }
  /** Can he take a pass now? (not already out, a free pass left) */
  canLeave(id: ManId, out: boolean) { return !this.leave.has(id) && !out && this.leave.size < MAX_LEAVE; }
  grantLeave(id: ManId) { this.leave.add(id); this.changed(); }
  cancelLeave(id: ManId) { if (this.leave.delete(id)) this.changed(); }

  // ---------- replacements ----------
  replacementSkill(c: CrewId) { return this.veterans.has(c) ? VETERAN_SKILL : ROOKIE_SKILL_FREE; }
  hireVeteran(c: CrewId) { if (!this.veterans.has(c)) { this.veterans.add(c); this.changed(); } }
  releaseVeteran(c: CrewId) { if (this.veterans.delete(c)) this.changed(); }

  // ---------- mission hooks ----------
  /** A gunner mission starts: freeze the plan and note who has flown how much. */
  begin(missions: Readonly<Record<ManId, { missions: number }>>): Plan {
    this.flying = { work: { ...this.work }, volunteer: this.volunteer };
    this.missions0 = {};
    for (const id of Object.keys(missions) as ManId[]) this.missions0[id] = missions[id].missions;
    return this.flying;
  }
  /** Any other mission (pilot, co-op, tutorial) runs with no plan. */
  skip() { this.flying = null; }
  meritMult() { return this.flying?.volunteer ? VOLUNTEER.merit : 1; }

  /**
   * The gunner mission is over (debrief). `men` is the roster after its own endMission;
   * `integrity` the ship's state (0 when she was lost). Returns the men who flew; a volunteer
   * mission counts double for them (the caller adds the extra mission to their record).
   */
  end(men: Readonly<Record<ManId, { missions: number; rest: number; dead: boolean }>>, integrity: number): ManId[] {
    const plan = this.flying;
    if (!plan) return [];
    const flew: ManId[] = [];
    for (const id of Object.keys(men) as ManId[]) {
      const st = men[id];
      if (st.dead) { delete this.fatigue[id]; this.rested.delete(id); continue; }
      if (st.missions > (this.missions0[id] ?? st.missions)) {
        flew.push(id);
        this.rested.delete(id); this.leave.delete(id);
        this.fatigue[id] = Math.min(FATIGUE_MAX, this.fatigueOf(id) + (plan.volunteer ? 2 : 1));
      } else if (this.leave.has(id)) {
        if (st.rest === 0) { this.leave.delete(id); this.fatigue[id] = 0; this.rested.add(id); }
      } else {
        this.fatigue[id] = Math.max(0, this.fatigueOf(id) - 2);   // a mission on the ground
      }
    }
    // the next break: work done, patching holes first if she came home shot up (a lost ship is replaced)
    this.repairs = integrity > 0 && integrity < REPAIR_AT ? 1 : 0;
    this.work = zeroWork();
    this.volunteer = false;
    this.veterans.clear();
    this.flying = null;
    this.changed();
    return flew;
  }
}

export const crewDecisions = new CrewDecisions();
