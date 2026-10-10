import { PerkDef, PERKS, Progression } from './Upgrades';
import { Rarity, RARITIES } from './WeaponMods';
import { COLLECTABLES, Collectable, KIND_LABEL, owns } from './Customize';

// Loot crates: one at the end of every round, before the hangar opens. A strong round
// (kills, merit bonus) earns a better crate, which rolls rarer contents: merit points, a
// perk for the rest of the mission, a persistent weapon mod, or a cosmetic unlock.
// The reward is granted when the crate is rolled; the UI (CrateUI.ts) only shows it.

export interface RoundPerf { kills: number; merit: number; round: number }

export const CRATE_NAME: Record<Rarity, string> = {
  common: 'Field supply crate', rare: 'Reinforced crate', epic: 'Officer\'s crate', legendary: 'Ace\'s strongbox',
};

// Grade of the crate from the round: kills count most, merit (combos, big targets) adds
export function crateGrade(p: RoundPerf): Rarity {
  const s = p.kills + p.merit / 700;
  return s >= 12 ? 'legendary' : s >= 8 ? 'epic' : s >= 4.5 ? 'rare' : 'common';
}

// Item rarity weights by crate grade (common, rare, epic, legendary)
const WEIGHTS: Record<Rarity, number[]> = {
  common: [68, 25, 6, 1],
  rare: [42, 38, 16, 4],
  epic: [18, 42, 31, 9],
  legendary: [0, 34, 44, 22],
};

export interface LootItem {
  kind: 'points' | 'perk' | 'mod' | 'nose' | 'paint' | 'name';
  rarity: Rarity;
  label: string;        // kind label for the card ("Weapon mod", "Field perk"…)
  title: string;
  desc: string;
  id?: string;          // design / paint / mod id, for the card's icon
  points?: number;
}

const POINTS: Record<Rarity, [number, number]> = { common: [150, 300], rare: [400, 700], epic: [900, 1300], legendary: [1800, 2400] };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function pickRarity(grade: Rarity): Rarity {
  const w = WEIGHTS[grade];
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return RARITIES[i]; }
  return 'common';
}

function points(prog: Progression, rarity: Rarity, note = ''): LootItem {
  const [a, b] = POINTS[rarity];
  const n = Math.round(rnd(a, b) / 10) * 10;
  prog.earn(n);
  return { kind: 'points', rarity, label: 'Merit', title: `+${n} merit points`, desc: note || 'Spend them in the hangar', points: n };
}

// Perks carry into the next round (Progression.perks lasts the mission). Field Repairs is
// left out: its patch-up only means something the moment it is handed out.
function perks(prog: Progression, rarity: Rarity): LootItem {
  const n = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : 1;
  const got: PerkDef[] = [];
  for (let i = 0; i < n; i++) {
    const pool = PERKS.filter((p) => p.id !== 'repair' && (p.stack || !prog.perks.includes(p.id)));
    if (!pool.length) break;
    const p = pool[Math.floor(Math.random() * pool.length)];
    prog.perks.push(p.id);
    got.push(p);
  }
  if (!got.length) return points(prog, rarity);
  const kit = got.length > 1;
  return {
    kind: 'perk', rarity, label: kit ? 'Field kit' : 'Field perk',
    title: kit ? got.map((p) => p.name).join(' + ') : got[0].name,
    desc: (kit ? got.map((p) => p.desc).join(' · ') : got[0].desc) + ' — rest of this mission',
  };
}

function unlock(prog: Progression, c: Collectable): LootItem {
  prog.unlocked.add(c.key);
  prog.save();
  return { kind: c.kind, rarity: c.rarity, label: KIND_LABEL[c.kind], title: c.name, desc: c.kind === 'mod' ? `${c.desc} · fit it in the hangar` : c.desc, id: c.id };
}

// Roll and grant one item from a crate of the given grade
export function rollCrate(prog: Progression, grade: Rarity): LootItem {
  const rarity = pickRarity(grade);
  const r = Math.random();
  const kind = r < 0.28 ? 'points' : r < 0.46 ? 'perk' : r < 0.73 ? 'mod' : 'cosmetic';
  if (kind === 'points') return points(prog, rarity);
  if (kind === 'perk') return perks(prog, rarity);
  // items: something not yet owned of that rarity (the other item family if none is left,
  // then a lower rarity), otherwise a duplicate pays out in merit
  const families = kind === 'mod' ? [['mod'], ['nose', 'paint', 'name']] : [['nose', 'paint', 'name'], ['mod']];
  for (let ri = RARITIES.indexOf(rarity); ri >= 0; ri--) {
    for (const fam of families) {
      const pool = COLLECTABLES.filter((c) => fam.includes(c.kind) && c.rarity === RARITIES[ri] && !owns(prog, c.key));
      if (pool.length) return unlock(prog, pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  return points(prog, rarity, 'Duplicate salvaged for merit');
}

// ---------- hand-off to the UI ----------
export interface CrateResult { grade: Rarity; item: LootItem; round: number }
let pending: CrateResult | null = null;

// Game.endRound: roll the round's crate (granted now) and leave it for the hangar to open
export function queueCrate(prog: Progression, perf: RoundPerf) {
  const grade = crateGrade(perf);
  pending = { grade, item: rollCrate(prog, grade), round: perf.round };
}

export function takePendingCrate(): CrateResult | null {
  const p = pending;
  pending = null;
  return p;
}
