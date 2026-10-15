/** Remaining boost is compressed to one combat pass (seconds at full throttle). */
export const KOMET_BOOST = 32;
export function burnRocket(fuel: number, throttle: number, dt: number): number {
  return Math.max(0, fuel - Math.max(0, dt) * Math.max(0, Math.min(1, throttle)));
}
export const NIGHT_FIGHTER = { radarRange: 4500, lockTime: 3, warningTime: 4, height: 160, aft: 43, burst: 1.2, cooldown: 4, maxBursts: 3 } as const;
export const SCHRAGE_Y = Math.sin(Math.PI * 75 / 180), SCHRAGE_Z = Math.cos(Math.PI * 75 / 180);
/** Radar has a forward cone; clouds/darkness do not change radio acquisition. */
export function radarContact(range: number, forwardDot: number): boolean {
  return range > 0 && range <= NIGHT_FIGHTER.radarRange && forwardDot >= .35;
}
/** Fixed upward mount: never redirect the projectile towards an arbitrary target. */
export function schrageSolution(range: number, mountDot: number, above: number): boolean {
  return range >= 85 && range <= 360 && above > 60 && mountDot > .992;
}
