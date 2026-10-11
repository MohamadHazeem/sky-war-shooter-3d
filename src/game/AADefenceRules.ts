import type { EnemyType } from '../world/EnemyTypes';

export type AAProfile = 'strafe' | 'dive' | 'level' | 'rocket';
export interface AAGroup { type: EnemyType; profile: AAProfile; count: number; at: number; bearing: number; speed: number }
export interface AAWave { groups: AAGroup[]; major: boolean; count: number }
/** Bounded groups; later waves escalate cadence, speed and composition. */
export function aaWave(wave: number): AAWave {
  const n = Math.max(1, Math.floor(wave)), major = n % 5 === 0;
  const groups: AAGroup[] = [];
  const add = (type: EnemyType, profile: AAProfile, count: number, speed: number) => {
    const i = groups.length;
    groups.push({ type, profile, count, speed: speed + Math.min(65, n * 2), at: i * Math.max(5, 14 - n * 0.3), bearing: (n * 0.72 + i * 1.9) % (Math.PI * 2) });
  };
  add(n % 2 ? 'bf109' : 'fw190', 'strafe', Math.min(7, 2 + Math.ceil(n / 2)), 125);
  if (n >= 2) add('ju88', 'dive', Math.min(5, 1 + Math.floor(n / 3)), 120);
  if (n >= 3) add('he111', 'level', Math.min(5, 2 + Math.floor(n / 5)), 90);
  if (n >= 4) add('bf110', 'rocket', Math.min(4, 1 + Math.floor(n / 5)), 135);
  if (n >= 6) add('me262', 'strafe', Math.min(4, 1 + Math.floor(n / 6)), 240);
  if (n >= 8) add('me163', 'strafe', Math.min(3, 1 + Math.floor(n / 8)), 290);
  if (major) add('fw190', 'strafe', 7, 160);
  return { groups, major, count: groups.reduce((s, g) => s + g.count, 0) };
}

export type AAAssetKind = 'hangar' | 'bomber' | 'fuel' | 'tower' | 'pit';
export interface AAAssetHealth { kind: AAAssetKind; hp: number; maxHp: number; repair: number }
export function damageAAAsset(a: AAAssetHealth, damage: number): boolean {
  if (!Number.isFinite(damage) || damage <= 0 || a.hp <= 0 || a.repair > 0) return false;
  a.hp = Math.max(0, a.hp - damage);
  if (a.kind === 'pit' && a.hp === 0) a.repair = 12;
  return a.hp === 0;
}
export function repairAAPit(a: AAAssetHealth, dt: number) {
  if (a.kind !== 'pit' || a.repair <= 0) return;
  a.repair = Math.max(0, a.repair - Math.max(0, dt));
  if (!a.repair) a.hp = a.maxHp * 0.6;
}
export function aaDefeated(assets: readonly AAAssetHealth[]): boolean {
  let bombers = 0;
  for (const a of assets) {
    if (a.kind === 'tower' && a.hp <= 0) return true;
    if (a.kind === 'bomber' && a.hp > 0) bombers++;
  }
  return bombers === 0;
}
export function aaIntegrity(assets: readonly AAAssetHealth[]): number {
  let hp = 0, max = 0;
  for (const a of assets) { hp += a.hp; max += a.maxHp; }
  return max ? hp / max : 0;
}
export const AA_GUNS = [
  { name: 'Quad .50', yawRate: 1.35, pitchRate: 0.95, ammo: 480, rate: 12, reload: 4, heat: 0.038, cool: 0.17, speed: 880 },
  { name: '40 mm Bofors', yawRate: 0.65, pitchRate: 0.5, ammo: 24, rate: 2, reload: 3.2, heat: 0.13, cool: 0.14, speed: 850 },
] as const;
export interface AAMount { yaw: number; pitch: number; wantYaw: number; wantPitch: number; heat: number; ammo: number; reload: number; locked: boolean; cooldown: number }
export function aaMount(kind: number): AAMount {
  return { yaw: 0, pitch: 0.2, wantYaw: 0, wantPitch: 0.2, heat: 0, ammo: AA_GUNS[kind].ammo, reload: 0, locked: false, cooldown: 0 };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function traverseAA(m: AAMount, kind: number, dt: number, upgrade = 1) {
  const g = AA_GUNS[kind], t = Math.max(0, dt);
  const delta = Math.atan2(Math.sin(m.wantYaw - m.yaw), Math.cos(m.wantYaw - m.yaw));
  m.yaw += clamp(delta, -g.yawRate * t * upgrade, g.yawRate * t * upgrade);
  m.yaw = Math.atan2(Math.sin(m.yaw), Math.cos(m.yaw));
  m.wantYaw = Math.atan2(Math.sin(m.wantYaw), Math.cos(m.wantYaw));
  m.wantPitch = clamp(m.wantPitch, -0.06, 1.48);
  m.pitch = clamp(m.pitch + clamp(m.wantPitch - m.pitch, -g.pitchRate * t * upgrade, g.pitchRate * t * upgrade), -0.06, 1.48);
}
export function tickAAGun(m: AAMount, kind: number, dt: number, ammoMult = 1) {
  m.heat = Math.max(0, m.heat - AA_GUNS[kind].cool * dt);
  if (m.locked && m.heat < 0.3) m.locked = false;
  m.cooldown = Math.max(0, m.cooldown - dt);
  if (m.reload > 0) { m.reload = Math.max(0, m.reload - dt); if (!m.reload) m.ammo = Math.round(AA_GUNS[kind].ammo * ammoMult); }
}
export function fireAAGun(m: AAMount, kind: number): boolean {
  const g = AA_GUNS[kind];
  if (m.reload || m.locked || m.cooldown > 0) return false;
  if (m.ammo <= 0) { m.reload = g.reload; return false; }
  m.ammo--; m.heat = Math.min(1, m.heat + g.heat); m.locked = m.heat >= 1;
  m.cooldown = 1 / g.rate;
  if (!m.ammo) m.reload = g.reload;
  return true;
}
