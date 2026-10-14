import type { SurvivalDifficulty } from './GunnerSurvival';
import type { StationId } from '../world/B17Layout';

export const DAMAGE_TUNING = {
  recruit: { chance: .08, gap: 150, hold: 1.2, crew: 8, burn: .12 },
  veteran: { chance: .2, gap: 100, hold: 2.2, crew: 16, burn: .35 },
  ace: { chance: .3, gap: 80, hold: 3, crew: 22, burn: .6 },
} as const;
export type CabinFire = 'fuselage' | 'bombBay';
export type CrewTask = 'idle' | 'fire' | 'aid' | 'ammo';
export const DAMAGE_TEXT = {
  fuselage: 'FUSELAGE FIRE', bombBay: 'BOMB BAY FIRE',
  waist: 'Waist guns · hold {key} to extinguish', top: 'Top turret · hold {key} to extinguish',
  feather: 'Top turret · hold {key} to feather number {n}', runaway: 'ENGINE {n} · RUNAWAY',
  feathered: 'ENGINE {n} · FEATHERED', burning: 'ENGINE {n} · FIRE',
  controls: 'CONTROL CABLES DAMAGED · pilot fighting the drift',
  fire: 'Crew fighting the fire', aid: 'Crew giving first aid / taking over the gun', ammo: 'Crew carrying ammunition',
  out: 'Fire out', escape: 'CREW ESCAPE RECORD', safe: 'Parachute open', missing: 'Missing',
} as const;
export const DAMAGE_RADIO = {
  fuselage: ['Radio', 'Fire in the fuselage! Waist gunners, get the extinguisher!'],
  bombBay: ['Top Turret', 'Fire in the bomb bay! Get forward with the extinguisher!'],
  runaway: ['Pilot', 'Runaway propeller! Engineer, feather that engine!'],
  controls: ['Pilot', 'Control cables hit. Help me hold her steady!'],
  fireOut: ['Radio', 'Cabin fire is out. Keep those guns covered.'],
  aid: ['Radio', 'Coming aft with the first aid kit. I will take his gun.'],
  ammo: ['Radio', 'Bringing another ammunition can down the catwalk.'],
} as const;

/** Only heavy combat hits can start an incident. One shared cooldown keeps crises sparse. */
export class B17DamageRules {
  difficulty: SurvivalDifficulty = 'veteran';
  fire: CabinFire | null = null;
  fireAge = 0;
  fill = 0;
  cooldown = 30;
  controls = 0;
  runaway = [false, false, false, false];
  feathered = [false, false, false, false];
  engineAge = [0, 0, 0, 0];
  featherFill = 0;
  get tuning() { return DAMAGE_TUNING[this.difficulty]; }
  reset(difficulty: SurvivalDifficulty) {
    this.difficulty = difficulty; this.fire = null; this.fireAge = this.fill = this.controls = this.featherFill = 0;
    this.cooldown = 30; this.runaway.fill(false); this.feathered.fill(false); this.engineAge.fill(0);
  }
  hit(zone: string, heavy: boolean, random = Math.random): boolean {
    if (!heavy || this.cooldown > 0 || this.fire || random() >= this.tuning.chance) return false;
    const engine = /^engine([1-4])$/.exec(zone);
    if (engine) {
      const i = Number(engine[1]) - 1;
      if (this.feathered[i] || this.runaway[i]) return false;
      this.runaway[i] = true; this.engineAge[i] = 0;
    } else if (zone === 'tail' || zone === 'cockpit') this.controls = Math.min(1, this.controls + .4);
    else if (zone.includes('fuselage') || zone === 'top' || zone === 'ball') this.ignite(zone === 'top' || zone === 'ball' || zone === 'fuselageFwd' || zone === 'fuselageMid' ? 'bombBay' : 'fuselage');
    else return false;
    this.cooldown = this.tuning.gap;
    return true;
  }
  ignite(site: CabinFire) { if (!this.fire) { this.fire = site; this.fireAge = this.fill = 0; this.cooldown = this.tuning.gap; } }
  reachable(station: StationId) { return this.fire === 'bombBay' ? station === 'top' : this.fire === 'fuselage' && (station === 'waistL' || station === 'waistR'); }
  feather(i: number) { this.runaway[i] = false; this.feathered[i] = true; this.featherFill = 0; }
  /** Returns true on extinguishing. Interrupted holds lose their progress. */
  update(dt: number, station: StationId, held: boolean, crewAtFire: boolean) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (let i = 0; i < 4; i++) if (this.runaway[i]) this.engineAge[i] += dt;
    if (!this.fire) { this.fill = 0; return false; }
    this.fireAge += dt;
    if (held && this.reachable(station)) this.fill += dt / this.tuning.hold;
    else if (crewAtFire) this.fill += dt / (this.tuning.hold * 2);
    else this.fill = 0;
    if (this.fill < 1) return false;
    this.fire = null; this.fill = 0; return true;
  }
}
export interface EscapeMan { name: string; wounded: boolean; player: boolean }
export interface EscapeEntry { name: string; at: number; escaped: boolean; player: boolean }
/** Resolve once at abandonment. Skipping the scene cannot alter anybody's outcome. */
export function escapeManifest(men: readonly EscapeMan[], altitude: number): EscapeEntry[] {
  const window = Math.max(0, Math.min(7, (altitude - 90) / 55));
  return men.map((m, i) => {
    const at = m.player ? 3.1 : .6 + i * .48 + (m.wounded ? 1.2 : 0);
    return { name: m.name, at, player: m.player, escaped: m.player || at <= window };
  });
}
