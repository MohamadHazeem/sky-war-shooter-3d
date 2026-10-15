/** Distant activity is deterministic scenery, never combat AI or a source of score. */
export const SORTIE_PERIOD = 92;
export const SORTIE_SPACING = 23;
export const RUNWAY_V = -1185;
export const TRAIN_SPEED = 13; // m/s, a freight train through the works
export const TRAIN_LOOP = 6800;
export const wrapGroundTime = (t: number, period: number) => ((t % period) + period) % period;
export const freightHead = (clock: number) => wrapGroundTime(clock * TRAIN_SPEED + 3600, TRAIN_LOOP) - 3400;
export const hasGroundAirfield = (look: number) => look === 1 || look === 3;

export interface GroundSortie { u: number; v: number; altitude: number; visibility: number }
/** Mutates a caller-owned slot. Accelerate along the runway, rotate, then climb away. */
export function groundSortie(clock: number, index: number, out: GroundSortie): void {
  const age = wrapGroundTime(clock + 600 - index * SORTIE_SPACING, SORTIE_PERIOD);
  const roll = Math.min(age, 22), climb = Math.max(0, age - 22);
  out.u = -1550 + 2.35 * roll * roll + climb * 105;
  out.v = RUNWAY_V + Math.max(0, climb - 8) ** 2 * 0.32;
  out.altitude = 4 + climb * 23;
  out.visibility = Math.min(1, age / 2, Math.max(0, (52 - age) / 5));
}
