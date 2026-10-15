import type { Bomber } from '../world/Aircraft';
import { Progression } from './Upgrades';
import { Rarity, WEAPON_MODS } from './WeaponMods';
import { applyNoseArt, NOSE_ARTS } from '../render/NoseArt';
import { applyPaint, PAINTS } from '../render/Paint';

// Bomber customisation: the player's B-17 gets a name, nose art and a paint scheme. The
// choice lives in Progression.bomber; cosmetic unlocks are 'nose:<id>', 'paint:<id>' and
// 'name:<name>' entries in Progression.unlocked (from crates or bought with merit).

export const DEFAULT_NAME = 'Sky Queen';
export const NAME_MAX = 22;

export interface NamePreset { name: string; rarity: Rarity; free?: boolean; exclusive?: string }   // exclusive: how it is earned (never in crates or for merit)
export const NAME_PRESETS: NamePreset[] = [
  { name: 'Sky Queen', rarity: 'common', free: true },
  { name: 'Lucky Lady', rarity: 'common', free: true },
  { name: 'Flak Magnet', rarity: 'common', free: true },
  { name: 'Iron Annie', rarity: 'common' },
  { name: 'Prairie Thunder', rarity: 'rare' },
  { name: 'Boston Bombshell', rarity: 'rare' },
  { name: 'Dixie Darlin\'', rarity: 'rare' },
  { name: 'Wing an\' a Prayer', rarity: 'epic' },
  { name: 'Ol\' Rattletrap', rarity: 'epic' },
  { name: 'Queen of Spades', rarity: 'legendary' },
  // Gunner Mastery (Mastery.ts): station rank 7 and the challenge sets
  ...['Left Hook', 'Right Cross', 'High Noon', 'Belly Gunner', 'Tail-End Charlie'].map((name): NamePreset => ({ name, rarity: 'epic', exclusive: 'Gunner Mastery reward' })),
  ...['Deflection Queen', 'Ace Hunter', 'Untouchable', 'Long Reach'].map((name): NamePreset => ({ name, rarity: 'legendary', exclusive: 'Gunner Mastery reward' })),
];

// Every collectable in one list (the hangar's collection view and the crate pool)
export type ItemKind = 'mod' | 'nose' | 'paint' | 'name';
export interface Collectable { key: string; kind: ItemKind; id: string; name: string; desc: string; rarity: Rarity; free: boolean; exclusive?: string }   // exclusive: earned one way only (no crates, no merit)

export const COLLECTABLES: Collectable[] = [
  ...WEAPON_MODS.map((m): Collectable => ({ key: 'mod:' + m.id, kind: 'mod', id: m.id, name: m.name, desc: m.desc, rarity: m.rarity, free: false })),
  ...NOSE_ARTS.filter((n) => n.id !== 'none').map((n): Collectable => ({ key: 'nose:' + n.id, kind: 'nose', id: n.id, name: n.name, desc: 'Painted on the nose of your B-17 · pick it in the hangar', rarity: n.rarity, free: !!n.free, exclusive: n.exclusive })),
  ...PAINTS.map((p): Collectable => ({ key: 'paint:' + p.id, kind: 'paint', id: p.id, name: p.name, desc: p.desc, rarity: p.rarity, free: !!p.free })),
  ...NAME_PRESETS.map((n): Collectable => ({ key: 'name:' + n.name, kind: 'name', id: n.name, name: `"${n.name}"`, desc: 'A name for your B-17 · pick it in the hangar', rarity: n.rarity, free: !!n.free, exclusive: n.exclusive })),
];

export const KIND_LABEL: Record<ItemKind, string> = { mod: 'Weapon mod', nose: 'Nose art', paint: 'Paint scheme', name: 'Bomber name' };

// Merit price of a cosmetic in the hangar (weapon mods only come from crates)
export const COSMETIC_COST: Record<Rarity, number> = { common: 300, rare: 750, epic: 1500, legendary: 2800 };

export const owns = (p: Progression, key: string) => key === 'nose:none' || !!COLLECTABLES.find((c) => c.key === key && c.free) || p.unlocked.has(key);

export function cleanName(s: string) {
  return s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function bomberName(): string {
  return cleanName(Progression.current?.bomber.name ?? '') || DEFAULT_NAME;
}

// Display text: the code and mission texts call the player's ship "Sky Queen"
export const withName = (s: string) => s.replace(/Sky Queen/g, bomberName());

// ---------- the 3D aircraft ----------
let dressed: Bomber | null = null;

/** The nose art painted on the player's B-17 (an owned design, else the default script). */
export function noseArtId(): string {
  const p = Progression.current;
  return p && owns(p, 'nose:' + p.bomber.nose) ? p.bomber.nose : 'script';
}

// Called when the player's B-17 is spawned (World.spawnFormation): name, paint, nose art
export function dressPlayerBomber(b: Bomber) {
  dressed = b;
  const p = Progression.current;
  b.name = bomberName();
  const paint = p && owns(p, 'paint:' + p.bomber.paint) ? p.bomber.paint : 'olive';
  const nose = noseArtId();
  applyPaint(b.model, paint);
  applyNoseArt(b.model, nose, b.name, paint === 'silver' ? 0.45 : 0.1);
}

// Re-dress the current player bomber after a change in the hangar / Armory
export function refreshPlayerBomber() {
  if (dressed && !dressed.remove && dressed.root.parent) dressPlayerBomber(dressed);
}
