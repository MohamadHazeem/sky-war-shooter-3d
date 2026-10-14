import type { Vector3 } from 'three';

export const BULLET_DRAG = .12;
export const BULLET_GRAVITY = 9.81;
export const TWIN_CONVERGENCE = 300;
export const M2_TRACER_EVERY = 5;

export function travelFactor(time: number) { return -Math.expm1(-BULLET_DRAG * time) / BULLET_DRAG; }
export function flightTime(distance: number, speed: number) {
  return -Math.log1p(-Math.min(.95, Math.max(0, distance) * BULLET_DRAG / Math.max(1, speed))) / BULLET_DRAG;
}
export function bulletDrop(time: number) { return BULLET_GRAVITY * (time - travelFactor(time)) / BULLET_DRAG; }

/** Ring-sight hold: target motion, inherited airspeed and gravity under the same light drag as rounds.
 * Returns time of flight; writes to caller-owned storage. No wind automation: the gunner holds off. */
export function gunLead(out: Vector3, origin: Vector3, target: Vector3, velocity: Vector3, shooterVelocity: Vector3, speed: number) {
  let t = flightTime(origin.distanceTo(target), speed);
  for (let i = 0; i < 5; i++) {
    out.copy(target).addScaledVector(velocity, t).addScaledVector(shooterVelocity, -travelFactor(t));
    out.y += bulletDrop(t);
    t = flightTime(origin.distanceTo(out), speed);
  }
  return t;
}

/** Both bores meet on the pivot's sight axis; caller supplies that world-space point. */
export function converge(out: Vector3, muzzle: Vector3, sightPoint: Vector3) {
  return out.subVectors(sightPoint, muzzle).normalize();
}

// Compound extinguishes around 1.2 km at .50 muzzle speed; the projectile remains lethal.
export function tracerBurn(age: number) {
  const t = Math.max(0, Math.min(1, (age - 1.15) / .4));
  return 1 - t * t * (3 - 2 * t);
}
