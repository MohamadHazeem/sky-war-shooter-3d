// Ground metres; one sample per carpet cluster. Shared by scoring and rendering.
export const ON_TARGET_RADIUS = 304.8; // 1,000 feet
export const BOMB_FALL = 25;
export const BOMB_DRAG = 0.93;
export interface BombImpact { x: number; z: number }
export interface BombSolution {
  x: number; z: number; forwardX: number; forwardZ: number; speed: number;
  windX: number; windZ: number; joltX: number; joltZ: number;
}
export function impactPattern(s: BombSolution, count: number): BombImpact[] {
  const x = s.x + s.forwardX * s.speed * BOMB_FALL * BOMB_DRAG + s.windX * BOMB_FALL + s.joltX;
  const z = s.z + s.forwardZ * s.speed * BOMB_FALL * BOMB_DRAG + s.windZ * BOMB_FALL + s.joltZ;
  // Deterministic phyllotaxis spread: no random scoring or different photo/ground patterns.
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => {
    const r = 240 * Math.sqrt((i + 0.5) / count), a = i * 2.399963229728653;
    return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r };
  });
}
export function bombingScore(impacts: readonly BombImpact[]) {
  const hits = impacts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.z) && Math.hypot(p.x, p.z) <= ON_TARGET_RADIUS).length;
  const percent = impacts.length ? Math.round(100 * hits / impacts.length) : 0;
  return { hits, percent, score: percent * 10, pickle: impacts.length > 0 && hits / impacts.length > 0.8 };
}
export function releaseDue(range: number, speed: number, holding: boolean, time: number, deadline: number) {
  return time >= deadline || (!holding && range <= speed * BOMB_FALL * BOMB_DRAG);
}
// Keep the aiming circle and even an early/off-target pattern inside the strike frame (48° lens).
export function strikePhotoAltitude(impacts: readonly BombImpact[], aspect: number) {
  let halfHeight = 0;
  for (const p of impacts) halfHeight = Math.max(halfHeight, Math.abs(p.z), Math.abs(p.x) / Math.max(0.1, aspect));
  return Math.max(3200, (halfHeight + 500) / Math.tan(24 * Math.PI / 180));
}
