// Compact pilot protocol. Absolute coordinates survive independent floating origins.
import type { Fighter } from '../world/Aircraft';
import type { SnapAircraft } from '../game/CoopSession';
import { ENEMY_VARIANTS } from '../world/EnemyTypes';
import type { Vector3 } from 'three';
export type CoopMode = 'gunner' | 'pilot';
export const coopBoard = (mode: CoopMode) => `coop-${mode}`;
const q = (n: number, k = 100) => Math.round(n * k) / k;
// sequence, life epoch, position, quaternion, velocity, throttle, trigger
export function pilotInput(f: Fighter, o: Vector3, seq: number, life: number, fire = f.trigger): number[] {
  const p = f.pos, r = f.quat, v = f.vel;
  return [seq, life, q(p.x + o.x), q(p.y + o.y), q(p.z + o.z), q(r.x, 10000), q(r.y, 10000), q(r.z, 10000), q(r.w, 10000), q(v.x), q(v.y), q(v.z), q(f.fm.throttle), fire ? 1 : 0];
}
export function validPilotInput(d: unknown): d is number[] {
  if (!Array.isArray(d) || d.length !== 14 || !d.every(Number.isFinite)) return false;
  const norm = d[5] ** 2 + d[6] ** 2 + d[7] ** 2 + d[8] ** 2;
  return Number.isSafeInteger(d[0]) && d[0] >= 0 && Number.isSafeInteger(d[1]) && d[1] >= 0 &&
    d.slice(2, 5).every(n => Math.abs(n) < 1e8) && d.slice(9, 12).every(n => Math.abs(n) < 600) &&
    norm > .9 && norm < 1.1 && d[12] >= 0 && d[12] <= 1.2 && (d[13] === 0 || d[13] === 1);
}
export interface PilotDamage { life: number; alive: boolean; hp: number; zones: number[]; fire: number; ammo: number[] }
export function pilotDamage(f: Fighter, life: number): PilotDamage {
  let fire = 0;
  const zones = f.zones.map((z, i) => { if (z.burning) fire |= 1 << i; return q(Math.max(0, z.hp) / z.maxHp, 1000); });
  return { life, alive: f.alive, hp: q(Math.max(0, f.structureFrac), 1000), zones, fire, ammo: f.guns.map(g => Number.isFinite(g.ammo) ? g.ammo : -1) };
}
export function applyPilotDamage(f: Fighter, d: PilotDamage, life: number): boolean {
  if (!d || d.life !== life || typeof d.alive !== 'boolean' || !Number.isFinite(d.hp) || d.hp < 0 || d.hp > 1 ||
    !Array.isArray(d.zones) || d.zones.length !== f.zones.length || !d.zones.every(n => Number.isFinite(n) && n >= 0 && n <= 1) ||
    !Array.isArray(d.ammo) || d.ammo.length !== f.guns.length || !d.ammo.every(n => Number.isInteger(n) && n >= -1)) return false;
  f.structure = d.hp * f.maxStructure;
  for (let i = 0; i < f.zones.length; i++) { f.zones[i].hp = d.zones[i] * f.zones[i].maxHp; f.zones[i].burning = !!(d.fire & (1 << i)); }
  for (let i = 0; i < f.guns.length; i++) f.guns[i].ammo = d.ammo[i] === -1 ? Infinity : d.ammo[i];
  return true; // caller plays the death once; health never changes local flight transforms
}
const kinds = ['B', 'P', ...Object.keys(ENEMY_VARIANTS)];
const STRIDE = 28;
// 28 bytes/aircraft: id:u32, kind:u8, flags:u16, health:u8, xyz:f32, quat:i16.
export function packAircraft(rows: SnapAircraft[]): string {
  const bytes = new Uint8Array(rows.length * STRIDE), v = new DataView(bytes.buffer);
  rows.forEach((r, i) => {
    const b = i * STRIDE;
    v.setUint32(b, r[0]); v.setUint8(b + 4, kinds.indexOf(r[1])); v.setUint16(b + 5, r[9]); v.setUint8(b + 7, Math.round(Math.max(0, Math.min(1, r[10])) * 255));
    for (let j = 0; j < 3; j++) v.setFloat32(b + 8 + j * 4, Number(r[2 + j]));
    for (let j = 0; j < 4; j++) v.setInt16(b + 20 + j * 2, Math.round(Number(r[5 + j]) * 32767));
  });
  return btoa(String.fromCharCode(...bytes));
}
export function unpackAircraft(s: unknown): SnapAircraft[] | null {
  if (typeof s !== 'string' || s.length > 24000) return null;
  try {
    const raw = atob(s); if (raw.length % STRIDE) return null;
    const v = new DataView(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer), rows: SnapAircraft[] = [];
    for (let b = 0; b < raw.length; b += STRIDE) {
      const kind = kinds[v.getUint8(b + 4)]; if (!kind) return null;
      const r: SnapAircraft = [v.getUint32(b), kind, v.getFloat32(b + 8), v.getFloat32(b + 12), v.getFloat32(b + 16), v.getInt16(b + 20) / 32767, v.getInt16(b + 22) / 32767, v.getInt16(b + 24) / 32767, v.getInt16(b + 26) / 32767, v.getUint16(b + 5), v.getUint8(b + 7) / 255];
      if (![r[2], r[3], r[4]].every(Number.isFinite)) return null;
      rows.push(r);
    }
    return rows;
  } catch { return null; }
}
