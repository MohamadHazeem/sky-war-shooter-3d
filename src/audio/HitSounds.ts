import type { Aircraft } from '../world/Aircraft';
import { sound } from './Sound';
import { Budget } from './Safe';

// Hit feedback for the player's rounds connecting: un-positioned UI layers on top of the
// positional impact (World.onHit), so a hit always reads clearly whatever the range.
//
// Per hit (one voice pair):
//   body   a .50 round punching aluminium skin: a pitched "tunk" that drops an octave in a
//          few ms, an inharmonic panel "clank" (plate-mode partials), a band-passed noise
//          punch, and a subtle low thud underneath. Six variants, random pitch per hit.
//   tick   a short bright transient on top, in four brightness tiers. During a streak of
//          consecutive hits on the same target the tier and pitch climb (hit-marker combo),
//          and the body brightens slightly.
// On crossing a damage stage: a heavier crunch (low crump, crumpling-metal pings, a
// groaning airframe partial), deeper the further gone the target is.
// On a kill: crunch, then metal tearing (swept band-passed rip with a screech), then a
// boom with a crackling tail, in one stereo buffer.
//
// A 13-26 rounds/s stream is merged to at most ~12 events per second (merged hits make the
// next event a little heavier), and the layers have their own small voice cap on top of
// the engine's voice budget (playBuffer counts every voice there). Buffers are synthesized
// once, shortly after load (or on first use), and are not tied to an AudioContext.

const SR = 48000;
const MIN_GAP = 1 / 12;     // s between hit events
const STREAK_GAP = 0.5;     // s without a hit on the target that ends a streak
const ESC_EVENTS = 10;      // events to reach full escalation
const CRUNCH_GAP = 0.25;    // s, per target
const MAX_VOICES = 8;       // concurrent hit-feedback voices
const BODY_GAIN = 0.34;
const TICK_GAIN = 0.2;
const CRUNCH_GAIN = 0.58;
const KILL_GAIN = 0.55;      // loudness report: ~-11 LUFS-M, under the guns and the kill explosion
const STAGE_AT = [0.85, 0.65, 0.45, 0.25]; // as DamageStages

const rnd = Math.random;
const nz = () => Math.random() * 2 - 1;
const TAU = Math.PI * 2;

// Chamberlin state-variable band-pass (stable for fc < SR/6)
class SVF {
  lp = 0; bp = 0; f = 0.1; q = 1;
  set(fc: number, q: number) { this.f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 7) / SR); this.q = 1 / q; return this; }
  run(x: number) { this.lp += this.f * this.bp; const hp = x - this.lp - this.q * this.bp; this.bp += this.f * hp; return this.bp; }
}

function buffer(seconds: number, channels: number, fn: (t: number, ch: number) => number, peak: number, drive: number): AudioBuffer {
  const n = Math.floor(seconds * SR);
  const b = new AudioBuffer({ length: n, numberOfChannels: channels, sampleRate: SR });
  let m = 0;
  for (let ch = 0; ch < channels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) { const v = Math.tanh(fn(i / SR, ch) * drive); d[i] = v; m = Math.max(m, Math.abs(v)); }
  }
  if (m > 0) for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= peak / m; }
  // short fade-out so a truncated tail never clicks
  const f = Math.min(n, Math.floor(0.01 * SR));
  for (let ch = 0; ch < channels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f; }
  return b;
}

// Crumpling metal: a cluster of short inharmonic pings, denser at the start
function pings(count: number, span: number, fLo: number, fHi: number) {
  return Array.from({ length: count }, () => {
    const t0 = span * Math.pow(rnd(), 1.7);
    return { t0, f: fLo + rnd() * (fHi - fLo), d: 110 + rnd() * 130, a: (0.35 + 0.65 * rnd()) * (1 - 0.7 * t0 / span) };
  });
}
function pingSum(ps: ReturnType<typeof pings>, t: number) {
  let s = 0;
  for (const p of ps) {
    const dt = t - p.t0;
    if (dt < 0 || dt > 0.05) continue;
    s += (Math.sin(TAU * p.f * dt) * 0.7 + nz() * 0.5 * Math.exp(-dt * 600)) * Math.exp(-dt * p.d) * p.a;
  }
  return s;
}

function makeBody(): AudioBuffer {
  const f0 = 520 + rnd() * 260;
  const ratios = [1, 1.5 + rnd() * 0.08, 2.27 + rnd() * 0.12, 2.98 + rnd() * 0.15, 4.1 + rnd() * 0.2];
  const amps = [1, 0.75, 0.55, 0.4, 0.28];
  const k = 0.85 + rnd() * 0.3;
  const decays = [20, 28, 40, 55, 75].map((d) => d * k);
  const fb = 150 + rnd() * 70;   // tunk
  const fT = 62 + rnd() * 22;    // thud
  const bp = new SVF().set(2600 + rnd() * 1200, 1.2);
  let phB = 0, phT = 0, lpn = 0;
  return buffer(0.34, 1, (t) => {
    phB += TAU * fb * (1 + 1.4 * Math.exp(-t * 90)) / SR;
    phT += TAU * fT * (1 + 0.8 * Math.exp(-t * 60)) / SR;
    const n = nz();
    lpn += (n - lpn) * 0.02;
    const tunk = Math.sin(phB) * (1 - Math.exp(-t * 3000)) * Math.exp(-t * 32) * 0.9;
    let clank = 0;
    for (let i = 0; i < 5; i++) clank += amps[i] * Math.sin(TAU * f0 * ratios[i] * t) * Math.exp(-t * decays[i]);
    clank *= 0.42 * (1 - Math.exp(-t * 4000));
    const punch = bp.run(n) * Math.exp(-t * 140) * 0.9;
    const thud = Math.sin(phT) * (1 - Math.exp(-t * 600)) * Math.exp(-t * 15) * 0.5 + lpn * Math.exp(-t * 25) * 1.2;
    return tunk + clank + punch + thud;
  }, 0.9, 1.5);
}

function makeTick(tier: number): AudioBuffer {
  const ft = 2700 + tier * 500 + rnd() * 250;
  let x1 = 0;
  return buffer(0.08, 1, (t) => {
    const n = nz(), hp = n - x1; x1 = n;
    return hp * Math.exp(-t * 1100) * 0.9
      + Math.sin(TAU * ft * t) * Math.exp(-t * (85 + tier * 12)) * 0.7
      + Math.sin(TAU * ft * 2.03 * t) * Math.exp(-t * 170) * 0.22 * (1 + tier * 0.3);
  }, 0.9, 1.2);
}

function makeCrunch(): AudioBuffer {
  const fc = 46 + rnd() * 14, g0 = 200 + rnd() * 70, am = 31 + rnd() * 15;
  const ps = pings(20, 0.24, 900, 3500);
  let ph = 0, lpn = 0;
  return buffer(0.75, 1, (t) => {
    ph += TAU * fc * (1 + 1.6 * Math.exp(-t * 45)) / SR;
    const n = nz();
    lpn += (n - lpn) * 0.05;
    const crump = Math.sin(ph) * (1 - Math.exp(-t * 900)) * Math.exp(-t * 7) + lpn * Math.exp(-t * 9) * 2.2;
    const g = g0 * (1 - 0.18 * Math.min(1, t / 0.45));
    const groan = (Math.sin(TAU * g * t) + Math.sin(TAU * g * 1.37 * t) * 0.6 + Math.sin(TAU * g * 2.11 * t) * 0.3)
      * (0.55 + 0.45 * Math.sin(TAU * am * t)) * (1 - Math.exp(-t * 50)) * Math.exp(-t * 5.5) * 0.32;
    return crump + (t < 0.3 ? pingSum(ps, t) * 0.55 : 0) + groan;
  }, 0.92, 1.5);
}

function makeKill(): AudioBuffer {
  const tb = 0.3 + rnd() * 0.1;                // boom onset
  const fs = 1050 + rnd() * 250;               // tear screech
  const fsub = 36 + rnd() * 8;
  const ps = [pings(26, 0.2, 700, 3800), pings(26, 0.2, 700, 3800)];
  const st = [0, 1].map(() => ({ svf: new SVF(), x1: 0, pr: 0, grain: 1, lpr: 0, lpb: 0, cr: 0, ph: 0, phs: 0 }));
  return buffer(2.8, 2, (t, ch) => {
    const s = st[ch];
    const n = nz();
    // crunch
    const hp = n - s.x1; s.x1 = n;
    let out = hp * Math.exp(-t * 70) * 0.9 + (t < 0.26 ? pingSum(ps[ch], t) * 0.6 : 0);
    // tearing: swept band-passed noise chopped into rough grains, plus a falling screech
    if (t > 0.04 && t < 0.95) {
      const u = t - 0.04;
      const env = Math.min(1, u / 0.03) * Math.exp(-u * 3.2) * Math.min(1, (0.95 - t) / 0.08);
      s.svf.set(2600 * Math.exp(-u * 1.8) + 500, 3);
      s.pr += (45 + 25 * Math.sin(TAU * 2.3 * t + ch)) / SR;
      if (s.pr >= 1) { s.pr -= 1; s.grain = 0.4 + 0.6 * rnd(); }
      const amp = s.grain * Math.exp(-s.pr * 6);
      s.phs += TAU * fs * Math.exp(-u * 0.9) * (1 + 0.03 * Math.sin(TAU * 13 * t)) / SR;
      out += (s.svf.run(n) * amp * 1.6 + Math.sin(s.phs) * 0.18) * env;
    }
    // boom: falling sub, rumble, blast, then crackle
    if (t >= tb) {
      const u = t - tb;
      s.ph += TAU * fsub * (1 + 1.5 * Math.exp(-u * 30)) / SR;
      const a = 0.012 + 0.04 * Math.exp(-u * 1.5);
      s.lpr += (n - s.lpr) * a;
      s.lpb += (n - s.lpb) * 0.3;
      if (rnd() < 0.0025 * Math.exp(-u * 1.5)) s.cr = 0.3 + 0.7 * rnd();
      s.cr *= 0.93;
      out += Math.sin(s.ph) * (1 - Math.exp(-u * 400)) * Math.exp(-u * 2.6) * 1.25
        + s.lpr * (1 - Math.exp(-u * 200)) * Math.exp(-u * 1.5) * 3.2
        + s.lpb * Math.exp(-u * 10) * 1.3
        + s.cr * n * 0.5;
    }
    return out;
  }, 0.95, 1.25);
}

const stageIdx = (frac: number) => { let s = 0; while (s < 4 && frac <= STAGE_AT[s]) s++; return s; };

class HitSounds {
  private body: AudioBuffer[] = [];
  private tick: AudioBuffer[][] = [];
  private crunch: AudioBuffer[] = [];
  private kill: AudioBuffer[] = [];
  private built = false;
  private voices = new Budget(MAX_VOICES);
  private lastAt = -Infinity;
  private merged = 0;
  private mergedHeavy = false;
  private target: Aircraft | null = null;
  private lastHit = -Infinity;
  private streak = 0;
  private lastBody = -1;
  private crunchAt = new WeakMap<Aircraft, number>();
  private killed = new WeakSet<Aircraft>();

  // Synthesis steps (~100 ms in all): run one per idle slice after load, or all at once
  // on first use. Buffers are made once and survive an audio-engine rebuild.
  private steps: (() => void)[] = [
    () => { for (let i = 0; i < 6; i++) this.body.push(makeBody()); for (let t = 0; t < 4; t++) this.tick.push([makeTick(t), makeTick(t)]); },
    () => { for (let i = 0; i < 3; i++) this.crunch.push(makeCrunch()); },
    () => this.kill.push(makeKill()),
    () => this.kill.push(makeKill()),
    () => this.kill.push(makeKill()),
  ];

  // One build step; false when everything is built
  step(): boolean {
    if (this.built || typeof AudioBuffer === 'undefined') return false;
    const s = this.steps.shift();
    try { s?.(); } catch (e) {
      console.warn('Audio: hit sounds unavailable', e);
      this.steps.length = 0; this.body = []; this.tick = []; this.crunch = []; this.kill = [];
    }
    if (!this.steps.length) this.built = true;
    return !this.built;
  }

  init() { while (this.step()) { /* build the rest now */ } }

  private ready() {
    const c = sound.ctx;
    if (!c || c.state !== 'running') return false;
    this.init();
    return this.body.length > 0;
  }

  // through the local voice cap, then the engine (un-positioned, counted in its budget)
  private play(buf: AudioBuffer, gain: number, rate: number, now: number, slack = 0) {
    if (!this.voices.take(now, now, buf.duration / rate, slack)) return;
    sound.playBuffer(buf, null, { gain, rate, delay: false });
  }

  // A player round hit `target`. `heavy`: cannon-calibre round. `stageCrossed`: this hit
  // took the target into a worse damage stage.
  onHit(target: Aircraft, heavy: boolean, stageCrossed: boolean) {
    if (!this.ready()) return;
    const now = performance.now() / 1000;
    if (target !== this.target || now - this.lastHit > STREAK_GAP) { this.target = target; this.streak = 0; }
    this.lastHit = now;

    if (stageCrossed && now - (this.crunchAt.get(target) ?? -Infinity) > CRUNCH_GAP) {
      this.crunchAt.set(target, now);
      const stage = stageIdx(target.structureFrac);
      this.lastAt = now; this.merged = 0; this.mergedHeavy = false;
      this.streak++;
      const c = this.crunch[Math.floor(rnd() * this.crunch.length)];
      this.play(c, CRUNCH_GAIN * (1 + 0.08 * stage), (1.06 - 0.06 * stage) * (0.96 + rnd() * 0.08), now, 2);
      this.playTick(now, 1.1);
      return;
    }

    // rate limit: hits inside the gap are merged into the next event
    if (now - this.lastAt < MIN_GAP) { this.merged++; this.mergedHeavy ||= heavy; return; }
    const m = Math.min(3, this.merged);
    heavy ||= this.mergedHeavy;
    this.merged = 0; this.mergedHeavy = false;
    this.lastAt = now;
    this.streak++;
    const esc = Math.min(1, (this.streak - 1) / ESC_EVENTS);

    let i = Math.floor(rnd() * this.body.length);
    if (i === this.lastBody) i = (i + 1) % this.body.length;
    this.lastBody = i;
    const rate = (0.9 + rnd() * 0.22) * (1 + 0.06 * esc) * (heavy ? 0.85 : 1);
    const gain = BODY_GAIN * (1 + 0.1 * m) * (1 + 0.15 * esc) * (heavy ? 1.25 : 1);
    this.play(this.body[i], gain, rate, now);
    this.playTick(now, 1);
  }

  private playTick(now: number, k: number) {
    const esc = Math.min(1, (this.streak - 1) / ESC_EVENTS);
    const tier = Math.min(3, Math.floor(esc * 4));
    const set = this.tick[tier];
    this.play(set[Math.floor(rnd() * set.length)], TICK_GAIN * (1 + 0.4 * esc) * k, (1 + 0.16 * esc) * (0.98 + rnd() * 0.04), now);
  }

  // The player's fire destroyed `target` (once per target)
  onKill(target: Aircraft) {
    if (this.killed.has(target)) return;
    this.killed.add(target);
    if (!this.ready()) return;
    const now = performance.now() / 1000;
    this.play(this.kill[Math.floor(rnd() * this.kill.length)], KILL_GAIN, 0.94 + rnd() * 0.12, now, 4);
    this.target = null; this.streak = 0;
    this.lastAt = now; this.merged = 0; this.mergedHeavy = false;
  }
}

export const hitSounds = new HitSounds();

// Build the buffers shortly after load, one step per idle slice, off any hit's frame
if (typeof window !== 'undefined') {
  const idle = (fn: () => void) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50));
  const next = () => { if (hitSounds.step()) idle(next); };
  setTimeout(() => idle(next), 1500);
}
