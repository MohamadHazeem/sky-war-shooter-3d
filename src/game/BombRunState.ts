export const BOMB_RUN_TEXT = {
  inbound: 'IP INBOUND', level: 'STRAIGHT AND LEVEL', doors: 'BOMB BAY DOORS OPEN',
  countdown: 'RELEASE IN {time}', away: 'BOMBS AWAY', falling: 'BOMBS FALLING · {time} s',
  strike: 'STRIKE BELOW', rally: 'RALLY POINT · FIGHTERS RETURNING', clear: 'Target markers below · Hold formation',
  overcast: 'Bombing through overcast · Following the lead ship',
  watch: 'Watch the strike from the ball turret · 4',
  on: 'Strike result: on target', off: 'Strike result: off target',
} as const;

/** Mission-time clock: 28 s IP to release, 29 s to strike confirmation, 5 s rally.
 * A held Norden release can extend this 62 s sequence by at most 12 s. */
export type BombRunPhase = 'idle' | 'inbound' | 'level' | 'doors' | 'countdown' | 'away' | 'falling' | 'strike' | 'rally' | 'complete';
export class BombRunState {
  phase: BombRunPhase = 'idle';
  releasedAt = -1;
  reset() { this.phase = 'idle'; this.releasedAt = -1; }
  advance(time: number, scheduled: number, releasedAt = -1) {
    if (this.releasedAt < 0 && releasedAt >= 0) this.releasedAt = releasedAt;
    const t = time - scheduled, fall = time - this.releasedAt;
    this.phase = this.releasedAt >= 0
      ? fall < 3 ? 'away' : fall < 25 ? 'falling' : fall < 29 ? 'strike' : fall < 34 ? 'rally' : 'complete'
      : t < -28 ? 'idle' : t < -22 ? 'inbound' : t < -16 ? 'level' : t < -5 ? 'doors' : 'countdown';
    return this.phase;
  }
  get active() { return this.phase !== 'idle' && this.phase !== 'complete'; }
  get holdFighters() { return this.active && this.phase !== 'rally'; }
  get level() { return this.active && this.releasedAt < 0; }
  get doors() { return this.phase === 'doors' || this.phase === 'countdown' || this.phase === 'away'; }
}

/** Six shells outline a box whose centre walks from 650 m to 55 m off the ship.
 * Caller supplies a reusable output. Side alternates between batteries, never random per frame. */
export function flakWalk(out: { x: number; y: number; z: number }, elapsed: number, shell: number) {
  const cycle = Math.max(0, elapsed) % 10;
  const approach = 1 - Math.min(1, cycle / 8);
  const side = Math.floor(Math.max(0, elapsed) / 10) % 2 === 0 ? 1 : -1;
  const i = ((shell % 6) + 6) % 6;
  out.x = side * (55 + 595 * approach) + (i % 3 - 1) * 28;
  out.y = -18 + Math.floor(i / 3) * 45;
  out.z = 25 + 220 * approach + (i % 3 - 1) * 38;
  return out;
}

export function bombingOvercast(cloud: number, mood: string) {
  return cloud >= 0.6 || mood === 'overcast' || mood === 'storm';
}
