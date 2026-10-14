/** Allocation-free controls for the bomber interior and overlapping mix priorities. */
export function engineMask(dead: readonly boolean[]): number {
  let mask = 0;
  for (let i = 0; i < 4; i++) if (!dead[i]) mask |= 1 << i;
  return mask;
}
export function skinDamage(zones: readonly { name: string; hp: number; maxHp: number }[]): number {
  let lost = 0, total = 0;
  for (const z of zones) if (z.name.startsWith('fuselage') && z.maxHp > 0 && Number.isFinite(z.hp)) {
    total += z.maxHp; lost += Math.max(0, z.maxHp - Math.max(0, z.hp));
  }
  return total ? Math.min(1, lost / total) : 0;
}

// Fixed slots; identical requests extend their slot. Saturation conservatively merges the
// earliest expiry so a burst can never evict a crew call or release its duck prematurely.
export class DuckEnvelope {
  private ends = new Float64Array(16);
  private depths = new Float32Array(16).fill(1);
  private effects = new Float32Array(16).fill(1);
  clear() { this.ends.fill(0); }
  add(now: number, seconds: number, depth: number, fx: number) {
    if (!Number.isFinite(now + seconds + depth + fx)) return;
    depth = Math.max(0, Math.min(1, depth)); fx = Math.max(0, Math.min(1, fx));
    let slot = 0;
    for (let i = 0; i < 16; i++) {
      if (this.ends[i] <= now || (Math.abs(this.depths[i] - depth) < .001 && Math.abs(this.effects[i] - fx) < .001)) { slot = i; break; }
      if (this.ends[i] < this.ends[slot]) slot = i;
    }
    const live = this.ends[slot] > now;
    this.ends[slot] = Math.max(live ? this.ends[slot] : 0, now + Math.max(0, Math.min(30, seconds)));
    this.depths[slot] = live ? Math.min(this.depths[slot], depth) : depth;
    this.effects[slot] = live ? Math.min(this.effects[slot], fx) : fx;
  }
  level(time: number, fx = false): number {
    let v = 1;
    const levels = fx ? this.effects : this.depths;
    for (let i = 0; i < 16; i++) if (this.ends[i] > time) v = Math.min(v, levels[i]);
    return v;
  }
  schedule(param: AudioParam, now: number, fx = false) {
    param.cancelScheduledValues(now);
    param.setTargetAtTime(this.level(now, fx), now, .025);
    let at = now;
    for (let n = 0; n < 16; n++) {
      let next = Infinity;
      for (let i = 0; i < 16; i++) if (this.ends[i] > at) next = Math.min(next, this.ends[i]);
      if (!Number.isFinite(next)) break;
      param.setTargetAtTime(this.level(next, fx), next, .3);
      at = next;
    }
  }
}
