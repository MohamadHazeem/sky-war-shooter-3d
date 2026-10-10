// Progression: permanent Armory upgrades bought with merit points earned in missions,
// plus one-mission perks picked (1 of 3) after each cleared wave. Both fold into a
// Loadout of multipliers that the gun controllers and the world read.

export type UpgradeId = 'firepower' | 'rate' | 'cooling' | 'belts' | 'armor' | 'reload';

export interface UpgradeDef { id: UpgradeId; name: string; desc: string; per: string }

export const UPGRADES: UpgradeDef[] = [
  { id: 'firepower', name: 'Heavy Ball Rounds', desc: 'Hotter loads hit harder', per: '+12% damage' },
  { id: 'rate', name: 'Buffer Springs', desc: 'Faster cycling bolt', per: '+7% rate of fire' },
  { id: 'cooling', name: 'Barrel Jackets', desc: 'Fire longer before overheating', per: '−12% barrel heat' },
  { id: 'belts', name: 'Long Belts', desc: 'Bigger ammunition boxes', per: '+15% ammo' },
  { id: 'armor', name: 'Flak Plating', desc: 'Armour around your station', per: '−8% damage taken' },
  { id: 'reload', name: 'Belt Chutes', desc: 'Quicker box changes', per: '−12% reload time' },
];

export const MAX_LEVEL = 5;
const COSTS = [400, 900, 1600, 2500, 3600];
export const upgradeCost = (level: number) => (level >= MAX_LEVEL ? Infinity : COSTS[level]);

export type PerkId = 'ap' | 'incendiary' | 'steady' | 'cool' | 'belt' | 'eagle' | 'repair' | 'scavenger' | 'rapid';

export interface PerkDef { id: PerkId; name: string; desc: string; stack: boolean }

export const PERKS: PerkDef[] = [
  { id: 'ap', name: 'Armour-Piercing', desc: '+25% damage to every hit', stack: true },
  { id: 'incendiary', name: 'Incendiary Belts', desc: '+10% damage; hits can set engines on fire', stack: false },
  { id: 'steady', name: 'Steady Hands', desc: '−45% recoil and spread', stack: false },
  { id: 'cool', name: 'Cold Barrels', desc: '−40% barrel heat', stack: true },
  { id: 'belt', name: 'Double Feed', desc: '+50% ammo, boxes refilled now', stack: true },
  { id: 'eagle', name: 'Eagle Eye', desc: 'Lead indicator shows where to aim', stack: false },
  { id: 'repair', name: 'Field Repairs', desc: 'Patch up the aircraft (+35% health)', stack: true },
  { id: 'scavenger', name: 'Scavenger', desc: 'Each kill refills 30% ammo and cools the gun', stack: false },
  { id: 'rapid', name: 'Hair Trigger', desc: '+15% rate of fire', stack: true },
];

export interface Loadout {
  damage: number; rate: number; heat: number; ammo: number; armor: number; reload: number;
  spread: number; recoil: number; leadPip: boolean; incendiary: boolean; killRefill: number;
}

const KEY = 'sws3d.armory.v1';

export class Progression {
  points = 0;
  levels: Record<UpgradeId, number> = { firepower: 0, rate: 0, cooling: 0, belts: 0, armor: 0, reload: 0 };
  perks: PerkId[] = [];   // this mission only

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (s) { this.points = s.points ?? 0; Object.assign(this.levels, s.levels ?? {}); }
    } catch { /* storage unavailable */ }
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify({ points: this.points, levels: this.levels })); } catch { /* */ } }

  buy(id: UpgradeId): boolean {
    const c = upgradeCost(this.levels[id]);
    if (this.points < c) return false;
    this.points -= c; this.levels[id]++; this.save();
    return true;
  }

  earn(n: number) { this.points += Math.max(0, Math.round(n)); this.save(); }

  // three different perks, skipping non-stacking ones already taken
  offer(): PerkDef[] {
    const pool = PERKS.filter((p) => p.stack || !this.perks.includes(p.id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }

  loadout(): Loadout {
    const L = this.levels, n = (p: PerkId) => this.perks.filter((x) => x === p).length;
    return {
      damage: (1 + 0.12 * L.firepower) * (1 + 0.25 * n('ap')) * (n('incendiary') ? 1.1 : 1),
      rate: (1 + 0.07 * L.rate) * (1 + 0.15 * n('rapid')),
      heat: (1 - 0.12 * L.cooling) * Math.pow(0.6, n('cool')),
      ammo: (1 + 0.15 * L.belts) * (1 + 0.5 * n('belt')),
      armor: 1 - 0.08 * L.armor,
      reload: 1 - 0.12 * L.reload,
      spread: n('steady') ? 0.55 : 1,
      recoil: n('steady') ? 0.55 : 1,
      leadPip: n('eagle') > 0,
      incendiary: n('incendiary') > 0,
      killRefill: n('scavenger') ? 0.3 : 0,
    };
  }
}
