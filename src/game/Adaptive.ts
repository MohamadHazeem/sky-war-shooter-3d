// Adaptive difficulty: watches how the player is doing and gently scales the director's
// target fighter count and enemy skill. Struggling (aircraft badly hurt, few kills) eases off
// to ~0.75x; dominating (healthy, fast kills) pushes up to ~1.3x. Changes are slow so the
// player never feels a sudden switch, and it never overrides the round's own ramp.

export class Adaptive {
  mult = 1;          // applied to the target number of fighters in the air
  skill = 1;         // applied to enemy skill
  private kills: number[] = [];   // timestamps of recent player kills
  enabled = true;

  reset() { this.mult = 1; this.skill = 1; this.kills = []; }

  onKill(t: number) { this.kills.push(t); }

  // health: player's aircraft health 0..1, t: world time, dt: frame time
  update(t: number, dt: number, health: number) {
    if (!this.enabled) { this.mult = this.skill = 1; return; }
    while (this.kills.length && t - this.kills[0] > 60) this.kills.shift();
    const kpm = this.kills.length;                        // kills in the last minute
    // performance score: -1 struggling .. +1 dominating
    let p = 0;
    p += health < 0.35 ? -0.8 : health < 0.6 ? -0.35 : health > 0.85 ? 0.25 : 0;
    p += kpm >= 10 ? 0.7 : kpm >= 6 ? 0.35 : kpm <= 1 && t > 60 ? -0.3 : 0;
    p = Math.max(-1, Math.min(1, p));
    const want = p >= 0 ? 1 + 0.3 * p : 1 + 0.25 * p;
    // ease toward the wanted level over ~20 s
    const k = 1 - Math.exp(-dt / 20);
    this.mult += (want - this.mult) * k;
    this.skill += ((p >= 0 ? 1 + 0.12 * p : 1 + 0.15 * p) - this.skill) * k;
  }
}
