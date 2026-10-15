// Pure survival rules. Seconds, rounds and probabilities live here, independent of rendering.
export type SurvivalDifficulty = 'recruit' | 'veteran' | 'ace';
export const STATION_AMMO = { waistL: 600, waistR: 600, top: 750, ball: 1000, tail: 1000 } as const;
export const SURVIVAL = {
  recruit: { risk: 0, jamRate: 0, jamGap: 180, freezeAfter: Infinity, oxygenGrace: 12, oxygenRise: 60, rescue: 18, clear: .7, reload: 2, supply: 4, wounds: .25 },
  veteran: { risk: 1, jamRate: .00018, jamGap: 120, freezeAfter: 90, oxygenGrace: 6, oxygenRise: 35, rescue: 45, clear: 1.4, reload: 4.5, supply: 12, wounds: .65 },
  ace: { risk: 1.5, jamRate: .0003, jamGap: 120, freezeAfter: 65, oxygenGrace: 4, oxygenRise: 25, rescue: 55, clear: 1.8, reload: 5, supply: 18, wounds: 1 },
} as const;
export const SURVIVAL_RULES = { oxygenHit: .12, circuitHit: .16, damageGap: 90, repair: 60, recovery: 8, freezeBurst: .4, lowAmmo: .2, doubleTap: .45 };
export interface SurvivalGun {
  ammo: number; maxAmmo: number; reload: number; reserve: number; supply: number;
  idle: number; frost: number; jam: boolean; clear: number; tapAge: number;
}
export function survivalGun(maxAmmo: number): SurvivalGun {
  return { ammo: maxAmmo, maxAmmo, reload: 0, reserve: maxAmmo, supply: 0, idle: 0, frost: 0, jam: false, clear: 0, tapAge: Infinity };
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function jamProbability(base: number, heat: number, damage: number, cold: number) {
  return base * (1 + 3 * clamp(heat) ** 2 + 2 * clamp(damage) + 2 * clamp(cold));
}
export function hypoxiaCurve(seconds: number, grace: number, rise: number) {
  const t = clamp((seconds - grace) / rise);
  return t * t * (3 - 2 * t);
}
export class GunnerSurvival {
  difficulty: SurvivalDifficulty = 'veteran';
  oxygen = false;
  hypoxia = 0;
  oxygenTime = 0;
  circuit = 0;
  chill = 0;
  wound = 0;
  jamCooldown = 0;
  damageCooldown = 0;
  // Station lessons (LessonRunner): a hose cut with its own pace, the same on every difficulty
  oxygenDrill: { oxygenGrace: number; oxygenRise: number; rescue: number } | null = null;
  get tuning() { return SURVIVAL[this.difficulty]; }
  reset(difficulty = this.difficulty) {
    this.difficulty = difficulty;
    this.oxygen = false;
    this.hypoxia = this.oxygenTime = this.circuit = this.chill = this.wound = this.damageCooldown = 0;
    this.oxygenDrill = null;
    this.jamCooldown = this.tuning.jamGap;
  }
  // Heavy hits to the fuselage / turret can sever a hose or short a heated-suit lead.
  hit(electrical: boolean, random = Math.random) {
    if (this.damageCooldown > 0 || !this.tuning.risk) return;
    const r = random();
    if (electrical && r < SURVIVAL_RULES.circuitHit * this.tuning.risk) this.circuit = SURVIVAL_RULES.repair;
    else if (r < ((electrical ? SURVIVAL_RULES.circuitHit : 0) + SURVIVAL_RULES.oxygenHit) * this.tuning.risk) this.oxygen = true;
    else return;
    this.damageCooldown = SURVIVAL_RULES.damageGap;
  }
  reconnect() { this.oxygen = false; this.oxygenTime = 0; }
  update(dt: number, cold: number, snow: number, wounds: number) {
    this.jamCooldown = Math.max(0, this.jamCooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.circuit = Math.max(0, this.circuit - dt);
    const target = this.tuning.risk ? clamp(cold * .25 + snow * .55 + (this.circuit > 0 ? .7 : 0)) : 0;
    this.chill += (target - this.chill) * (1 - Math.exp(-dt / 12));
    this.wound += (clamp(wounds / 3) * this.tuning.wounds - this.wound) * (1 - Math.exp(-dt / 2));
    if (this.oxygen) {
      this.oxygenTime += dt;
      const o = this.oxygenDrill ?? this.tuning;
      this.hypoxia = hypoxiaCurve(this.oxygenTime, o.oxygenGrace, o.oxygenRise);
      if (this.oxygenTime >= o.rescue) this.reconnect();
    } else this.hypoxia = Math.max(0, this.hypoxia - dt / SURVIVAL_RULES.recovery);
  }
  tickGun(s: SurvivalGun, dt: number, waist: boolean) {
    s.tapAge += dt;
    s.idle = Math.min(this.tuning.freezeAfter + 20, s.idle + dt * (.5 + this.chill));
    s.frost = this.tuning.risk ? clamp((s.idle - this.tuning.freezeAfter) / 20) : 0;
    if (s.ammo <= s.maxAmmo * SURVIVAL_RULES.lowAmmo && s.reserve === 0 && s.supply === 0) s.supply = this.tuning.supply;
    if (s.supply > 0) {
      s.supply = Math.max(0, s.supply - dt);
      if (s.supply === 0) {
        if (waist) s.reserve = s.maxAmmo;
        else { s.ammo = s.maxAmmo; s.reload = 0; }
      }
    }
    if (s.reload > 0) {
      s.reload = Math.max(0, s.reload - dt);
      if (s.reload === 0) { const n = Math.min(s.maxAmmo - s.ammo, s.reserve); s.ammo += n; s.reserve -= n; }
    }
    // Fixed turret boxes are serviced by the crew; no magical R reload in a turret.
    if (!waist && s.ammo <= s.maxAmmo * SURVIVAL_RULES.lowAmmo && s.reserve > 0) { s.reserve = 0; s.supply = this.tuning.supply; }
  }
  reload(s: SurvivalGun, waist: boolean) {
    if (waist && !s.jam && !s.reload && s.reserve > 0 && s.ammo < s.maxAmmo) s.reload = this.tuning.reload;
  }
  clearJam(s: SurvivalGun, dt: number, held: boolean, tapped: boolean) {
    if (!s.jam) return false;
    if (tapped) { if (s.tapAge <= SURVIVAL_RULES.doubleTap) s.clear = 1; s.tapAge = 0; }
    if (held) s.clear += dt / this.tuning.clear;
    else if (!tapped && s.tapAge > SURVIVAL_RULES.doubleTap) s.clear = 0;
    if (s.clear < 1) return false;
    s.jam = false; s.clear = 0; s.tapAge = Infinity;
    return true;
  }
  // First sustained burst warms a frozen receiver before the first round leaves.
  thaw(s: SurvivalGun, dt: number) {
    if (s.frost <= 0) return true;
    s.idle = Math.max(0, s.idle - dt * (20 / SURVIVAL_RULES.freezeBurst));
    s.frost = clamp((s.idle - this.tuning.freezeAfter) / 20);
    return s.frost === 0;
  }
  shot(s: SurvivalGun, heat: number, damage: number, random = Math.random) {
    if (s.jam || s.reload > 0 || s.ammo <= 0 || s.frost > 0) return false;
    if (this.jamCooldown === 0 && random() < jamProbability(this.tuning.jamRate, heat, damage, this.chill)) {
      s.jam = true; s.clear = 0; s.tapAge = Infinity; this.jamCooldown = this.tuning.jamGap; return false;
    }
    if (this.difficulty !== 'recruit') s.ammo--;
    s.idle = s.frost = 0;
    return true;
  }
  get aimScale() { return 1 - this.hypoxia * .35 - this.wound * .12; }
}
