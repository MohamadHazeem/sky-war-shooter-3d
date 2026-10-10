// Score multiplier that builds on consecutive kills and hits. Each kill adds a big step,
// each hit a small one. The multiplier is held for COMBO_WINDOW seconds after the last
// action (the HUD bar drains during that time), then decays back to x1.0, so sustained
// shooting pays off but a lull costs points.
//
// Alongside it runs the streak meter ("heat", 0..1): kills fill it a fifth at a time,
// it holds briefly and then drains. Filling it (about five kills in quick succession)
// sets the player ON FIRE: +50% score until the meter runs dry or a heavy hit lands.
export const COMBO_MAX = 3;
export const COMBO_WINDOW = 6; // seconds of hold after the last kill or hit
const KILL_STEP = 0.5;
const HIT_STEP = 0.02;
const DECAY_RATE = 0.6; // multiplier points lost per second once the hold has run out

export const FIRE_KILLS = 5;          // kills in quick succession to go ON FIRE
export const FIRE_SCORE = 1.5;        // score multiplier while ON FIRE
const HEAT_KILL = 1 / FIRE_KILLS + 0.02; // a little slack so five quick kills always fill it
const HEAT_HIT = 0.006;
const HEAT_HOLD = 3.5;                // s the meter holds after a kill before it drains
const HEAT_DRAIN = 0.075;             // per second (empty to full ~13 s)
const FIRE_DRAIN = 0.06;              // slower while ON FIRE (~17 s from full without a kill)

export class Combo {
  mult = 1;
  private hold = 0;
  /** Streak meter 0..1: fills with kills, decays over time. */
  heat = 0;
  private heatHold = 0;
  /** ON FIRE: full meter reached; ends when the meter drains or on a heavy hit. */
  onFire = false;

  /** Remaining hold time as a 0..1 fraction, drives the decay bar. */
  get fraction(): number { return this.hold / COMBO_WINDOW; }
  /** Multiplier applied to kill score: the combo multiplier, x1.5 while ON FIRE. */
  get scoreMult(): number { return this.mult * (this.onFire ? FIRE_SCORE : 1); }

  reset() { this.mult = 1; this.hold = 0; this.heat = 0; this.heatHold = 0; this.onFire = false; }

  onKill() {
    this.bump(KILL_STEP);
    this.heat = Math.min(1, this.heat + HEAT_KILL);
    this.heatHold = HEAT_HOLD;
    if (this.heat >= 1) this.onFire = true;
  }
  onHit() { this.bump(HIT_STEP); this.heat = Math.min(this.onFire ? 1 : 0.99, this.heat + HEAT_HIT); }

  /** A heavy (cannon) hit on the player's aircraft puts the fire out and knocks the meter back. */
  onHeavyHit() {
    if (!this.onFire) return;
    this.onFire = false;
    this.heat = Math.min(this.heat, 0.4);
    this.heatHold = 0;
  }

  update(dt: number) {
    if (this.heatHold > 0) this.heatHold = Math.max(0, this.heatHold - dt);
    else if (this.heat > 0) {
      this.heat = Math.max(0, this.heat - (this.onFire ? FIRE_DRAIN : HEAT_DRAIN) * dt);
      if (this.heat <= 0) this.onFire = false;
    }
    if (this.hold > 0) { this.hold = Math.max(0, this.hold - dt); return; }
    if (this.mult > 1) this.mult = Math.max(1, this.mult - DECAY_RATE * dt);
  }

  private bump(step: number) {
    this.mult = Math.min(COMBO_MAX, this.mult + step);
    this.hold = COMBO_WINDOW;
  }
}
