// Progression: permanent Armory upgrades, weapons and aircraft bought with merit points,
// plus one-mission perks handed out at random during play. Everything folds into a
// Loadout of multipliers that the gun controllers and the world read.
import { applyWeaponMod } from './WeaponMods';
import { SkillBook, applySkills, skillDefaults, type SkillLoadout } from './Skills';

export type UpgradeId = 'firepower' | 'rate' | 'cooling' | 'velocity' | 'armor' | 'gyro';

export interface UpgradeDef { id: UpgradeId; name: string; desc: string; per: string }

export const UPGRADES: UpgradeDef[] = [
  { id: 'firepower', name: 'Heavy Ball Rounds', desc: 'Hotter loads hit harder', per: '+12% damage' },
  { id: 'rate', name: 'Buffer Springs', desc: 'Faster cycling bolt', per: '+7% rate of fire' },
  { id: 'cooling', name: 'Barrel Jackets', desc: 'Fire longer before overheating', per: '−12% barrel heat' },
  { id: 'velocity', name: 'Long Barrels', desc: 'Faster rounds: less lead, flatter fire', per: '+6% muzzle velocity' },
  { id: 'armor', name: 'Flak Plating', desc: 'Armour around your station', per: '−8% damage taken' },
  { id: 'gyro', name: 'Gyro Gunsight', desc: 'Near misses become hits', per: '+10% hit radius' },
];

export const MAX_LEVEL = 5;
const COSTS = [400, 900, 1600, 2500, 3600];
export const upgradeCost = (level: number) => (level >= MAX_LEVEL ? Infinity : COSTS[level]);

// ---------- weapons ----------
export type WeaponId = 'm2' | 'stinger' | 'hispano' | 'hellfire' | 'p6x50' | 'p8x50' | 'p4x20';

export interface WeaponDef {
  id: WeaponId; role: 'gunner' | 'pilot'; name: string; desc: string; cost: number;
  rate: number; damage: number; velocity: number; spread: number; heat: number;
  tracerEvery: number; tracer: [number, number, number]; cannon?: boolean; incendiary?: number; splash?: number;
}

export const WEAPONS: WeaponDef[] = [
  { id: 'm2', role: 'gunner', name: 'Browning M2 .50', desc: 'Balanced heavy machine gun', cost: 0, rate: 13, damage: 12, velocity: 870, spread: 0.0022, heat: 0.011, tracerEvery: 3, tracer: [10, 2.6, 0.9] },
  { id: 'stinger', role: 'gunner', name: 'Stinger twin-feed .50', desc: 'A storm of lighter rounds: 60% faster fire, less punch', cost: 1500, rate: 21, damage: 8.5, velocity: 860, spread: 0.0034, heat: 0.0085, tracerEvery: 2, tracer: [11, 4.5, 1.2] },
  { id: 'hispano', role: 'gunner', name: 'Hispano 20 mm cannon', desc: 'Slow, explosive shells that tear fighters apart', cost: 2500, rate: 7, damage: 30, velocity: 840, spread: 0.0018, heat: 0.02, tracerEvery: 2, tracer: [12, 6, 2], cannon: true, splash: 0.35 },
  { id: 'hellfire', role: 'gunner', name: 'M2 "Hellfire" AP-I', desc: 'Armour-piercing incendiary: hits often set engines alight', cost: 3500, rate: 13, damage: 14, velocity: 890, spread: 0.0022, heat: 0.012, tracerEvery: 3, tracer: [12, 3.2, 0.8], incendiary: 0.12 },
  { id: 'p6x50', role: 'pilot', name: '6 × .50 cal', desc: 'The Mustang\'s standard battery', cost: 0, rate: 13, damage: 14, velocity: 880, spread: 0.0035, heat: 0, tracerEvery: 4, tracer: [9, 3, 1] },
  { id: 'p8x50', role: 'pilot', name: 'Heavy battery (+30% fire)', desc: 'More guns, more lead in the air', cost: 2500, rate: 17, damage: 14, velocity: 880, spread: 0.004, heat: 0, tracerEvery: 4, tracer: [9, 3, 1] },
  { id: 'p4x20', role: 'pilot', name: '20 mm cannons', desc: 'Slower, devastating explosive shells', cost: 3000, rate: 8, damage: 34, velocity: 840, spread: 0.003, heat: 0, tracerEvery: 2, tracer: [12, 6, 2], cannon: true, splash: 0.35 },
];

// ---------- aircraft ----------
export type AircraftId = 'b17g' | 'b17f' | 'yb40' | 'p51d' | 'p51h' | 'p51armored';

export interface AircraftDef {
  id: AircraftId; role: 'gunner' | 'pilot'; name: string; desc: string; cost: number;
  armor: number; rate: number; traverse: number; power: number;
}

export const AIRCRAFT: AircraftDef[] = [
  { id: 'b17g', role: 'gunner', name: 'B-17G "Sky Queen"', desc: 'The Fortress as built: balanced', cost: 0, armor: 1, rate: 1, traverse: 1, power: 1 },
  { id: 'b17f', role: 'gunner', name: 'B-17F "Lucky Lady"', desc: 'Lighter ship: guns swing 20% faster and fire 10% faster, 15% less armour', cost: 1200, armor: 1.15, rate: 1.1, traverse: 1.2, power: 1 },
  { id: 'yb40', role: 'gunner', name: 'YB-40 Gunship', desc: 'Escort gunship: 45% more armour, heavier guns swing slower', cost: 3000, armor: 0.55, rate: 1, traverse: 0.85, power: 1 },
  { id: 'p51d', role: 'pilot', name: 'P-51D Mustang', desc: 'Fast, long-legged escort fighter', cost: 0, armor: 1, rate: 1, traverse: 1, power: 1 },
  { id: 'p51h', role: 'pilot', name: 'P-51H Lightweight', desc: '15% more power and agility, 20% less armour', cost: 1800, armor: 1.2, rate: 1, traverse: 1, power: 1.15 },
  { id: 'p51armored', role: 'pilot', name: 'P-51D "Iron Mustang"', desc: '40% more armour, 8% less power', cost: 2600, armor: 0.6, rate: 1, traverse: 1, power: 0.92 },
];

// ---------- perks (random, during play) ----------
export type PerkId =
  | 'ap' | 'incendiary' | 'steady' | 'cool' | 'executioner' | 'hawkeye' | 'repair' | 'medic' | 'rapid'
  | 'vest' | 'explosive' | 'hotloads' | 'gyrolock' | 'berserk' | 'lucky' | 'acepay' | 'shredder' | 'fearsome' | 'bullettime' | 'vampire';

export interface PerkDef { id: PerkId; name: string; desc: string; stack: boolean }

export const PERKS: PerkDef[] = [
  { id: 'ap', name: 'Armour-Piercing', desc: '+25% damage', stack: true },
  { id: 'incendiary', name: 'Incendiary Belts', desc: 'Hits can set engines on fire', stack: false },
  { id: 'steady', name: 'Steady Hands', desc: '−45% recoil and spread', stack: false },
  { id: 'cool', name: 'Cold Barrels', desc: '−40% barrel heat', stack: true },
  { id: 'executioner', name: 'Finisher', desc: '+50% damage to fighters below half health', stack: false },
  { id: 'hawkeye', name: 'Hawkeye', desc: 'Stronger aim assist', stack: true },
  { id: 'repair', name: 'Field Repairs', desc: 'Aircraft patched up (+35% health)', stack: true },
  { id: 'medic', name: 'Crew Chief', desc: 'Each kill patches 5% of your aircraft', stack: false },
  { id: 'rapid', name: 'Hair Trigger', desc: '+15% rate of fire', stack: true },
  { id: 'vest', name: 'Flak Vest', desc: '−20% damage taken', stack: true },
  { id: 'explosive', name: 'Explosive Tips', desc: '1 hit in 8 explodes for triple damage', stack: true },
  { id: 'hotloads', name: 'Hot Loads', desc: '+12% muzzle velocity', stack: true },
  { id: 'gyrolock', name: 'Gyro Lock', desc: '+15% hit radius', stack: true },
  { id: 'berserk', name: 'Berserker', desc: '+40% fire rate for 6 s after every kill', stack: false },
  { id: 'lucky', name: 'Lucky Charm', desc: '15% of hits on you glance off', stack: false },
  { id: 'acepay', name: 'Ace Pay', desc: '+25% score and merit', stack: true },
  { id: 'shredder', name: 'Wing Shredder', desc: '+60% damage to wings and tails', stack: false },
  { id: 'fearsome', name: 'Fearsome Gunner', desc: 'Enemy fire 25% less accurate', stack: false },
  { id: 'bullettime', name: 'Bullet Time', desc: 'Longer slow motion on every kill', stack: false },
  { id: 'vampire', name: 'Scrap Collector', desc: 'Every 3rd kill repairs 10%', stack: false },
];

// Skill-tree fields (SkillLoadout, Skills.ts) ride along with neutral defaults
export interface Loadout extends SkillLoadout {
  damage: number; rate: number; heat: number; velocity: number; armor: number; hitScale: number;
  spread: number; recoil: number; leadPip: boolean; incendiary: number; execute: number; killRepair: number;
  assist: number; explosive: number; berserk: boolean; lucky: number; scoreMult: number; wingDmg: number;
  enemyAim: number; bulletTime: boolean; vampire: boolean; splash: number; traverse: number; power: number;
  weapon: WeaponDef; aircraft: AircraftDef;
}

const KEY = 'sws3d.armory.v1';

export class Progression {
  points = 0;
  levels: Record<UpgradeId, number> = { firepower: 0, rate: 0, cooling: 0, velocity: 0, armor: 0, gyro: 0 };
  unlocked = new Set<string>(['m2', 'p6x50', 'b17g', 'p51d']);
  weapon: Record<'gunner' | 'pilot', WeaponId> = { gunner: 'm2', pilot: 'p6x50' };
  aircraft: Record<'gunner' | 'pilot', AircraftId> = { gunner: 'b17g', pilot: 'p51d' };
  perks: PerkId[] = [];   // this mission only
  role: 'gunner' | 'pilot' = 'gunner';
  // loot crates & customisation (Loot.ts / Customize.ts). Crate items and cosmetic unlocks
  // live in `unlocked` as 'mod:<id>', 'nose:<id>', 'paint:<id>', 'name:<name>'.
  mods: Partial<Record<WeaponId, string>> = {};   // weapon mod fitted per weapon
  bomber = { name: 'Sky Queen', nose: 'script', paint: 'olive' };
  static current: Progression | null = null;      // the first instance = the game's (read by Customize)
  // skill tree (Skills.ts): saved under its own key (sws3d.skills.v1), so the armory save is unchanged
  readonly skills = new SkillBook();

  constructor() {
    Progression.current ??= this;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) {
        this.points = s.points ?? 0;
        const L = s.levels ?? {};
        // ammo upgrades became pointless with unlimited belts: their levels carry over
        if (L.belts !== undefined) { L.velocity ??= L.belts; delete L.belts; }
        if (L.reload !== undefined) { L.gyro ??= L.reload; delete L.reload; }
        Object.assign(this.levels, L);
        for (const u of s.unlocked ?? []) this.unlocked.add(u);
        if (s.weapon) Object.assign(this.weapon, s.weapon);
        if (s.aircraft) Object.assign(this.aircraft, s.aircraft);
        if (s.mods) Object.assign(this.mods, s.mods);
        if (s.bomber) Object.assign(this.bomber, s.bomber);
      }
    } catch { /* storage unavailable */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ points: this.points, levels: this.levels, unlocked: [...this.unlocked], weapon: this.weapon, aircraft: this.aircraft, mods: this.mods, bomber: this.bomber }));
    } catch { /* */ }
  }

  buy(id: UpgradeId): boolean {
    const c = upgradeCost(this.levels[id]);
    if (this.points < c) return false;
    this.points -= c; this.levels[id]++; this.save();
    return true;
  }

  // weapons and aircraft: buy once, then select freely
  unlock(id: string, cost: number): boolean {
    if (this.unlocked.has(id)) return true;
    if (this.points < cost) return false;
    this.points -= cost; this.unlocked.add(id); this.save();
    return true;
  }
  selectWeapon(w: WeaponDef) { if (this.unlocked.has(w.id)) { this.weapon[w.role] = w.id; this.save(); } }
  selectAircraft(a: AircraftDef) { if (this.unlocked.has(a.id)) { this.aircraft[a.role] = a.id; this.save(); } }

  earn(n: number) { this.points += Math.max(0, Math.round(n)); this.save(); }

  // one random perk, skipping non-stacking ones already held
  award(): PerkDef {
    const pool = PERKS.filter((p) => p.stack || !this.perks.includes(p.id));
    const p = pool[Math.floor(Math.random() * pool.length)];
    this.perks.push(p.id);
    return p;
  }

  loadout(): Loadout {
    const L = this.levels, n = (p: PerkId) => this.perks.filter((x) => x === p).length;
    const weapon = WEAPONS.find((w) => w.id === this.weapon[this.role]) ?? WEAPONS[this.role === 'gunner' ? 0 : 4];
    const aircraft = AIRCRAFT.find((a) => a.id === this.aircraft[this.role]) ?? AIRCRAFT[this.role === 'gunner' ? 0 : 3];
    return applySkills(applyWeaponMod({
      damage: (1 + 0.12 * L.firepower) * (1 + 0.25 * n('ap')),
      rate: (1 + 0.07 * L.rate) * (1 + 0.15 * n('rapid')) * aircraft.rate,
      heat: (1 - 0.12 * L.cooling) * Math.pow(0.6, n('cool')),
      velocity: (1 + 0.06 * L.velocity) * (1 + 0.12 * n('hotloads')),
      armor: (1 - 0.08 * L.armor) * Math.pow(0.8, n('vest')) * aircraft.armor,
      hitScale: (1 + 0.1 * L.gyro) * (1 + 0.15 * n('gyrolock')),
      spread: n('steady') ? 0.55 : 1,
      recoil: n('steady') ? 0.55 : 1,
      leadPip: true,
      incendiary: Math.max(weapon.incendiary ?? 0, n('incendiary') ? 0.06 : 0),
      execute: n('executioner') ? 1.5 : 1,
      killRepair: n('medic') ? 0.05 : 0,
      assist: 1 + 0.3 * n('hawkeye'),
      explosive: 1 - Math.pow(7 / 8, n('explosive')),
      berserk: n('berserk') > 0,
      lucky: n('lucky') ? 0.15 : 0,
      scoreMult: 1 + 0.25 * n('acepay'),
      wingDmg: n('shredder') ? 1.6 : 1,
      enemyAim: n('fearsome') ? 1.33 : 1,
      bulletTime: n('bullettime') > 0,
      vampire: n('vampire') > 0,
      splash: weapon.splash ?? 0,
      traverse: aircraft.traverse,
      power: aircraft.power,
      weapon, aircraft,
      ...skillDefaults(),
    }, this.mods[weapon.id]), this.skills.owned);
  }
}
