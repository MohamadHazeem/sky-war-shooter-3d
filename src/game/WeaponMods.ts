// Weapon mods: persistent items found in loot crates. Each weapon has one mod slot; an owned
// mod can be fitted to any weapon (the armourers keep the pattern). Owned mods are stored in
// Progression.unlocked as 'mod:<id>', the fitted one per weapon in Progression.mods.
import type { Loadout } from './Upgrades';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

export interface ModEffect { damage?: number; rate?: number; spread?: number; heat?: number; velocity?: number; hitScale?: number }

export interface WeaponModDef { id: string; name: string; desc: string; rarity: Rarity; fx: ModEffect }

export const WEAPON_MODS: WeaponModDef[] = [
  { id: 'polished', name: 'Polished feed', desc: '+5% rate of fire', rarity: 'common', fx: { rate: 1.05 } },
  { id: 'matchbarrel', name: 'Match-grade barrel', desc: '−15% spread', rarity: 'common', fx: { spread: 0.85 } },
  { id: 'jacket', name: 'Vented jacket', desc: '−12% barrel heat', rarity: 'common', fx: { heat: 0.88 } },
  { id: 'hotbelts', name: 'Hot-loaded belts', desc: '+8% damage', rarity: 'rare', fx: { damage: 1.08 } },
  { id: 'boattail', name: 'Boat-tail rounds', desc: '+8% muzzle velocity', rarity: 'rare', fx: { velocity: 1.08 } },
  { id: 'ringsight', name: 'Ground ring sight', desc: '+8% hit radius', rarity: 'rare', fx: { hitScale: 1.08 } },
  { id: 'headspace', name: 'Precision headspace', desc: '−25% spread, +4% damage', rarity: 'epic', fx: { spread: 0.75, damage: 1.04 } },
  { id: 'armourer', name: 'Armourer\'s special', desc: '+6% damage, +5% rate of fire', rarity: 'epic', fx: { damage: 1.06, rate: 1.05 } },
  { id: 'handloads', name: 'Ace\'s hand-loads', desc: '+10% damage, +6% rate, −10% spread', rarity: 'legendary', fx: { damage: 1.1, rate: 1.06, spread: 0.9 } },
  { id: 'fortressfeed', name: 'Fortress pattern feed', desc: '+12% rate of fire, −20% barrel heat', rarity: 'legendary', fx: { rate: 1.12, heat: 0.8 } },
];

export const modDef = (id: string | undefined) => (id ? WEAPON_MODS.find((m) => m.id === id) : undefined);

// Folded into Progression.loadout(): multiplies the fitted mod's effects in place
export function applyWeaponMod(l: Loadout, id: string | undefined): Loadout {
  const m = modDef(id);
  if (!m) return l;
  const f = m.fx;
  l.damage *= f.damage ?? 1;
  l.rate *= f.rate ?? 1;
  l.spread *= f.spread ?? 1;
  l.heat *= f.heat ?? 1;
  l.velocity *= f.velocity ?? 1;
  l.hitScale *= f.hitScale ?? 1;
  return l;
}
