// Score multiplier that builds on consecutive kills and hits. Each kill adds a big step,
// each hit a small one. The multiplier is held for COMBO_WINDOW seconds after the last
// action (the HUD bar drains during that time), then decays back to x1.0, so sustained
// shooting pays off but a lull costs points.
export const COMBO_MAX = 3;
export const COMBO_WINDOW = 6; // seconds of hold after the last kill or hit
const KILL_STEP = 0.5;
const HIT_STEP = 0.02;
const DECAY_RATE = 0.6; // multiplier points lost per second once the hold has run out

export class Combo {
  mult = 1;
  private hold = 0;

  /** Remaining hold time as a 0..1 fraction, drives the decay bar. */
  get fraction(): number { return this.hold / COMBO_WINDOW; }

  reset() { this.mult = 1; this.hold = 0; }

  onKill() { this.bump(KILL_STEP); }
  onHit() { this.bump(HIT_STEP); }

  update(dt: number) {
    if (this.hold > 0) { this.hold = Math.max(0, this.hold - dt); return; }
    if (this.mult > 1) this.mult = Math.max(1, this.mult - DECAY_RATE * dt);
  }

  private bump(step: number) {
    this.mult = Math.min(COMBO_MAX, this.mult + step);
    this.hold = COMBO_WINDOW;
  }
}
