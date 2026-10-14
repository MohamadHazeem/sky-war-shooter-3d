import type { StationId } from '../world/B17Layout';

// AN/M2 mount response: the waist pintle flexes; powered mounts settle sooner.
export const MOUNT = {
  waistL: { frequency: 22, damping: 12, kick: 1 },
  waistR: { frequency: 22, damping: 12, kick: 1 },
  top: { frequency: 31, damping: 20, kick: .65 },
  ball: { frequency: 34, damping: 22, kick: .55 },
  tail: { frequency: 28, damping: 17, kick: .75 },
} as const;

/** Exact underdamped spring: stable at 30–144 Hz and during slow motion. */
export class RecoilSpring {
  x = 0;
  v = 0;
  reset() { this.x = this.v = 0; }
  update(dt: number, frequency: number, damping: number) {
    const w = Math.sqrt(frequency * frequency - damping * damping);
    const e = Math.exp(-damping * dt), c = Math.cos(w * dt), s = Math.sin(w * dt);
    const x = this.x, v = this.v;
    this.x = e * (x * c + (v + damping * x) * s / w);
    this.v = e * (v * c - (damping * v + frequency * frequency * x) * s / w);
  }
}

export class GunRecoil {
  readonly pitch = new RecoilSpring();
  readonly yaw = new RecoilSpring();
  age = 10;
  rate = 13;
  kick(station: StationId, recoil: number, recruit: boolean, side: number, rate: number) {
    const k = MOUNT[station].kick * recoil * (recruit ? .55 : 1);
    this.pitch.v += .12 * k;
    this.yaw.v += .08 * k * side;
    this.age = 0;
    this.rate = rate;
  }
  update(dt: number, station: StationId) {
    const m = MOUNT[station];
    this.pitch.update(dt, m.frequency, m.damping);
    this.yaw.update(dt, m.frequency, m.damping);
    this.age += dt;
  }
  // Each actual shot restarts this pulse; rate mods / Overdrive change its frequency.
  vibration(shakeScale: number) {
    return Math.sin(this.age * this.rate * Math.PI * 2) * Math.exp(-this.age * 24) * shakeScale;
  }
  reset() { this.pitch.reset(); this.yaw.reset(); this.age = 10; }
}

// Keep a standard 13 Hz M2 hot during a sustained burst; idle cooling stays forgiving.
export function barrelCooling(firing: boolean, overheated: boolean) { return overheated ? .22 : firing ? .075 : .16; }
