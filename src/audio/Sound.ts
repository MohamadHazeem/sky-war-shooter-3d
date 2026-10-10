import * as THREE from 'three';
import { Music } from './Music';
import { AirframeCreaks } from './Creaks';
import { Breathing } from './Breathing';
import { Whizby } from './Whizby';
import { Interphone } from './Interphone';
import { Budget, FREQ, GAIN, RATE, fin, freeOnEnd, ok, place, setP, towards } from './Safe';
import { json, take } from '../core/Assets';
import { AUDIO_MANIFEST, P_LOOPS, P_MENU_MUSIC, P_MISSION_MUSIC, P_REST, P_SFX } from '../core/Preload';

// Procedural audio engine (no sample files).
// - Engines are synthesised as looping firing-pulse trains: Wright R-1820 Cyclones
//   (9-cyl radial) for the B-17, BMW 801 (14-cyl radial) for the Fw 190, Packard
//   Merlin (V-12) for the P-51, each with propeller blade-pass modulation.
// - Weapons, impacts, flak and explosions are layered one-shots with several
//   pre-rendered variations, positioned in 3D (HRTF up close), low-passed and
//   delayed by the speed of sound with distance, and sent to convolution reverbs:
//   a short metallic one for the inside of the bomber, a long open-air one outside.
// Robustness (the "sound suddenly disappears" reports): a watchdog resumes the context
// whenever sound is wanted, every param write is finite-safe (Safe.ts), a scope after the
// compressor rebuilds the engine if the output goes non-finite or dead, and a voice budget
// keeps gunfire from overloading the audio thread.
export type BufName =
  | 'm2' | 'm2far' | 'cannon' | 'mg131' | 'hit' | 'hitHeavy' | 'explosion' | 'explosionFar' | 'flak' | 'flakClose'
  | 'crack' | 'casing' | 'click' | 'glass' | 'whoosh' | 'static' | 'squelch' | 'rattle' | 'rocket' | 'debris' | 'beltTick'
  | 'm2thump' | 'm2mech';

type ShotOpts = { gain?: number; rate?: number; delay?: boolean; ref?: number; reverb?: number };

const rand = () => Math.random() * 2 - 1;
// Voice budget: concurrent one-shots. Low priority (far) drops at MAX_VOICES, close/big
// ones get some headroom, the player's guns and UI never drop.
const MAX_VOICES = 48;
const MAX_HRTF = 6;          // concurrent HRTF one-shots, the rest pan equal-power
// Far (> FAR m) spammy sounds: at most one per name per gap (seconds)
const FAR = 300;
const FAR_GAP: Partial<Record<BufName, number>> = { m2far: 0.06, mg131: 0.05, cannon: 0.07, hit: 0.03, crack: 0.06, flak: 0.1, debris: 0.3 };
const BIG = new Set<BufName>(['explosion', 'flakClose', 'hitHeavy', 'rocket', 'whoosh']);
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

// One-pole filter helpers for offline synthesis
class LP { y = 0; constructor(public a: number) {} run(x: number) { this.y += (x - this.y) * this.a; return this.y; } }
class HP { y = 0; x1 = 0; constructor(public a: number) {} run(x: number) { const y = this.a * (this.y + x - this.x1); this.x1 = x; this.y = y; return y; } }

interface Voice {
  src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: PannerNode;
  whoosh: AudioBufferSourceNode; whooshGain: GainNode; whooshFilter: BiquadFilterNode;
  owner: number; radial: boolean; freeAt: number;
}

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private duck!: GainNode;
  // Music bus (dry) and its reverb send: both follow the music slider so muting music
  // also silences its reverb tail.
  private musicBus!: GainNode;
  private musicWet!: GainNode;
  private revIn!: ConvolverNode;
  private revOut!: ConvolverNode;
  private revInSend!: GainNode;
  private revOutSend!: GainNode;
  private bufs = new Map<BufName, AudioBuffer[]>();
  private gainMap = new Map<BufName, number>();
  private windSrc: AudioBufferSourceNode | null = null;
  samplesLoaded = false;
  private engineBufs: Record<'cyclone' | 'bmw' | 'merlin', AudioBuffer> = {} as any;
  private listenerPos = new THREE.Vector3();
  private b17: { gain: GainNode; filter: BiquadFilterNode; srcs: AudioBufferSourceNode[] } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode; flutter: GainNode } | null = null;
  // Gust stage (see updateWind): its own level and filter, so it never fights the per-frame wind setters
  private gust: { gain: GainNode; filter: BiquadFilterNode; walkG: number; walkF: number } | null = null;
  private windSpeed = 0;   // player airspeed (m/s), scales gust strength in the fighter
  private windCut = 800;   // base wind-filter cutoff that the gust filter is relative to
  private voices: Voice[] = [];
  private playerEngine: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private radioBed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private interphone: Interphone | null = null;
  readonly music = new Music();
  private creaks: AirframeCreaks | null = null;
  private breathing: Breathing | null = null;
  private whizbyFx: Whizby | null = null;
  volume = 0.8;
  // Per-bus levels (0..1) from the Settings sliders
  musicVolume = 1;
  sfxVolume = 1;
  ambVolume = 1;
  radioEnabled = true;
  musicEnabled = true;
  private lastShot = 0;
  private interior = 1;
  private mode: 'bomber' | 'fighter' | 'menu' = 'menu';
  // Watchdog state. wanted: the game wants sound (false only while it is deliberately
  // suspended, e.g. the pause menu); the context's own suspend/resume are wrapped to track it.
  private wanted = true;
  private rawResume: (() => Promise<void>) | null = null;
  private armed = false;
  private scope: AnalyserNode | null = null;
  private scopeBuf = new Float32Array(1024);
  private silentSince = -1;    // audio time the scope first read all zeros (-1: not silent)
  private lastAudible = -1;    // audio time the latest audible one-shot was due
  private lastCt = -1;         // clock watch: last seen currentTime and how long it has stalled
  private stalled = 0;
  private lastTick = 0;
  private rebuildAt = -Infinity;
  private backoff = 0;
  private oneShots = new Budget(MAX_VOICES);
  private hrtfShots = new Budget(MAX_HRTF);
  private lastFar = new Map<BufName, number>();

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'closed') this.rebuild('context closed', true);
      else this.ctx.resume().catch(() => {});
      return;
    }
    this.build();
    this.arm();
  }

  // Graph construction. Decoded buffers (synthesized or recorded) are kept across a
  // rebuild: AudioBuffers are not tied to a context.
  private build() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.track(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.002; comp.release.value = 0.22;
    this.master = ctx.createGain();
    setP(this.master.gain, this.volume, GAIN);
    this.master.connect(comp).connect(ctx.destination);
    // scope on the final output: the watchdog checks it for NaN / dead output
    this.scope = ctx.createAnalyser(); this.scope.fftSize = this.scopeBuf.length;
    comp.connect(this.scope);
    // ducking bus for radio/explosions (music + ambience go through it)
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVolume; this.sfx.connect(this.master);
    this.interphone = new Interphone(ctx, this.sfx);
    this.amb = ctx.createGain(); this.amb.gain.value = this.ambVolume; this.amb.connect(this.duck);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume; this.musicBus.connect(this.duck);
    this.musicWet = ctx.createGain(); this.musicWet.gain.value = this.musicVolume;
    // Reverbs
    this.revIn = ctx.createConvolver(); this.revIn.buffer = this.impulse(0.75, 6.5, true);
    this.revOut = ctx.createConvolver(); this.revOut.buffer = this.impulse(3.8, 1.4, false);
    this.revInSend = ctx.createGain(); this.revInSend.gain.value = 0.55;
    this.revOutSend = ctx.createGain(); this.revOutSend.gain.value = 0.5;
    this.revInSend.connect(this.revIn).connect(this.master);
    this.revOutSend.connect(this.revOut).connect(this.master);
    this.creaks = new AirframeCreaks(ctx, this.amb, this.revInSend);
    this.musicWet.connect(this.revOutSend);
    const first = !this.bufs.size;
    if (first) this.buildBuffers();
    this.startAmbience();
    this.breathing = new Breathing(ctx, this.amb);
    for (let i = 0; i < 6; i++) this.voices.push(this.makeVoice());
    this.whizbyFx = new Whizby(ctx, this.sfx, (when, dur) => this.room(when, dur, 1), (when, dur) => this.hrtfShots.take(ctx.currentTime, when, dur));
    this.music.init(ctx, this.musicBus, this.musicWet);
    this.music.enabled = this.musicEnabled;
    if (first) void this.loadSamples(); else this.swapLoops();
    this.setMode(this.mode);
  }

  // Wrap the context's suspend/resume (the game pauses through sound.ctx directly) so the
  // watchdog knows when silence is intended and never fights the pause menu.
  private track(ctx: AudioContext) {
    const suspend = ctx.suspend.bind(ctx), resume = ctx.resume.bind(ctx);
    ctx.suspend = () => { this.wanted = false; return suspend(); };
    ctx.resume = () => { this.wanted = true; return resume(); };
    this.rawResume = resume;
    this.wanted = true;
    this.lastCt = -1; this.stalled = 0; this.silentSince = -1; this.lastAudible = -1;
    ctx.onstatechange = () => {
      if (ctx !== this.ctx) return;
      if (ctx.state === 'closed') this.rebuild('context closed');
      else if (ctx.state !== 'running' && this.wanted) this.kick();
    };
  }

  // Explicit form of the same switch: false suspends (pause menu), true resumes
  setWanted(on: boolean) {
    this.wanted = on;
    if (!this.ctx) return;
    if (on) this.kick(); else this.ctx.suspend().catch(() => {});
  }

  // Resume if sound is wanted but the context is suspended/interrupted (output device
  // change, tab switch, OS audio session). A rejection is retried by the next tick or gesture.
  private kick() {
    const c = this.ctx;
    if (!c || !this.wanted || c.state === 'running' || c.state === 'closed') return;
    this.rawResume?.().catch(() => {});
  }

  // Once: gesture/visibility fallbacks and the twice-a-second watchdog
  private arm() {
    if (this.armed) return;
    this.armed = true;
    const kick = () => this.kick();
    for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, kick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
    setInterval(() => this.watch(), 500);
  }

  private watch() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'closed') { this.rebuild('context closed'); return; }
    if (ctx.state !== 'running') { this.lastCt = -1; this.stalled = 0; this.silentSince = -1; this.kick(); return; }
    // Clock watch: "running" but currentTime frozen means the output device died under us
    const wall = performance.now() / 1000;
    const dw = Math.min(1, wall - this.lastTick); // a tick after sleep or tab throttling counts as one
    this.lastTick = wall;
    const now = ctx.currentTime;
    if (this.lastCt >= 0 && now === this.lastCt) {
      this.stalled += dw;
      if (this.stalled > 3) this.rebuild('audio clock stalled');
      return;
    }
    this.lastCt = now; this.stalled = 0;
    // Scope: any non-finite sample means a poisoned node (it never recovers by itself);
    // all-zero output for > 3 s while audible one-shots were due means the graph is dead.
    const sc = this.scope;
    if (!sc) return;
    const d = this.scopeBuf;
    sc.getFloatTimeDomainData(d);
    let live = false;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!ok(v)) { this.rebuild('non-finite samples in the output'); return; }
      if (v !== 0) live = true;
    }
    if (live) { this.silentSince = -1; return; }
    if (this.silentSince < 0) { this.silentSince = now; return; }
    const audible = this.volume > 0.01 && this.sfxVolume > 0.01;
    if (audible && now - this.silentSince > 3 && this.lastAudible > this.silentSince + 0.2 && this.lastAudible < now - 0.2) {
      this.rebuild('output stuck at zero');
    }
  }

  // Full re-init on a fresh AudioContext: the poisoned or dead graph is dropped whole,
  // decoded buffers and settings carry over. Backs off if it keeps happening.
  private rebuild(why: string, force = false) {
    const t = performance.now();
    if (!force && t < this.rebuildAt + this.backoff) return;
    this.backoff = t - this.rebuildAt > 120000 ? 5000 : Math.min(60000, this.backoff * 2 || 5000);
    this.rebuildAt = t;
    console.warn(`Audio: ${why}; rebuilding the audio engine`);
    const old = this.ctx;
    const wanted = this.wanted;
    this.teardown();
    if (old) { old.onstatechange = null; old.close().catch(() => {}); }
    this.ctx = null;
    try { this.build(); } catch (e) { console.warn('Audio: rebuild failed', e); return; }
    if (!wanted) this.ctx!.suspend().catch(() => {});
  }

  // Stop timers and drop every reference into the old graph
  private teardown() {
    this.breathing?.stop(); this.breathing = null;
    this.creaks?.setActive(false); this.creaks = null;
    this.interphone?.cancel(); this.interphone = null;
    this.whizbyFx = null;
    this.voices = [];
    this.b17 = null; this.wind = null; this.gust = null; this.windSrc = null;
    this.playerEngine = null; this.radioBed = null;
    this.b17Sputter = null; this.b17Depth = null; this.b17Sampled = false;
    this.scope = null;
    this.oneShots.clear(); this.hrtfShots.clear(); this.lastFar.clear();
    this.lastShot = 0; // audio clocks restart at 0 on the new context
  }

  // Voice budget gate for a one-shot starting at `when` (prio 2 always passes)
  private room(when: number, dur: number, prio: number) {
    return this.oneShots.take(this.ctx!.currentTime, when, dur, prio > 1 ? Infinity : prio ? 16 : 0);
  }

  setVolume(v: number) { if (!ok(v)) return; this.volume = v; if (this.master) setP(this.master.gain, v, GAIN); }
  // Sound-effects bus, for one-off synthesized cues that should follow the volume setting
  sfxBus(): GainNode | null { return this.ctx ? this.sfx : null; }
  setMusic(on: boolean) {
    const was = this.music.enabled;
    this.musicEnabled = on; this.music.enabled = on;
    if (!on) this.music.stop(); else if (!was) this.music.resume();
  }

  // Bus levels from the Settings sliders. Before init() they are only remembered and
  // applied when the graph is built.
  setMusicVolume(v: number) {
    this.musicVolume = clamp01(v);
    this.setBus(this.musicBus, this.musicVolume);
    this.setBus(this.musicWet, this.musicVolume);
  }
  setSfxVolume(v: number) { this.sfxVolume = clamp01(v); this.setBus(this.sfx, this.sfxVolume); }
  setAmbVolume(v: number) { this.ambVolume = clamp01(v); this.setBus(this.amb, this.ambVolume); }

  // Short smoothing ramp so dragging a slider does not click
  private setBus(node: GainNode | undefined, v: number) {
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  // ---------------- synthesis ----------------
  private stereo(len: number, fn: (t: number, ch: number, i: number) => number, normalize = 0.95): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.max(1, Math.floor(len * ctx.sampleRate));
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    let m = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) { d[i] = fn(i / ctx.sampleRate, ch, i); m = Math.max(m, Math.abs(d[i])); }
    }
    if (m > 0 && normalize) for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= normalize / m; }
    return b;
  }

  private impulse(seconds: number, decay: number, metallic: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(seconds * ctx.sampleRate);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const lp = new LP(metallic ? 0.6 : 0.25);
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        // high frequencies die faster outdoors
        lp.a = metallic ? 0.6 : Math.max(0.03, 0.35 * Math.exp(-t * 1.6));
        d[i] = lp.run(rand()) * Math.exp(-t * decay);
      }
      if (metallic) {
        // early reflections off the fuselage walls + ringing skin
        const taps = [0.0043, 0.0079, 0.0121, 0.0167, 0.0231];
        for (const tp of taps) {
          const o = Math.floor((tp + ch * 0.0007) * ctx.sampleRate);
          for (let i = 0; i < 200 && o + i < n; i++) d[o + i] += rand() * 0.5 * Math.exp(-i / 40);
        }
        for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; d[i] += Math.sin(2 * Math.PI * (310 + ch * 7) * t) * 0.05 * Math.exp(-t * 9); }
      }
    }
    return b;
  }

  // A seamless engine loop: firing pulses (filtered noise bursts) + firing tone, AM by
  // propeller blade-pass, slight cycle-to-cycle variation for a living, rough sound.
  private engineLoop(firingHz: number, bladeHz: number, opts: { rough: number; bright: number; banks?: number; seconds?: number }): AudioBuffer {
    const ctx = this.ctx!;
    const sec = opts.seconds ?? 2;
    const pulses = Math.round(firingHz * sec);
    const period = sec / pulses;
    const blades = Math.max(1, Math.round(bladeHz * sec));
    const sr = ctx.sampleRate;
    const n = Math.floor(sec * sr);
    const b = ctx.createBuffer(2, n, sr);
    const amps = Array.from({ length: pulses }, (_, i) => 0.75 + Math.random() * 0.5 * opts.rough + (opts.banks && i % 2 ? -0.25 : 0));
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const lp = new LP(opts.bright);
      const lp2 = new LP(0.08);
      const hp = new HP(0.995);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = Math.floor(t / period) % pulses;
        const tp = t - Math.floor(t / period) * period;
        const burst = Math.exp(-tp / (period * 0.22)) * amps[k];
        const noise = lp.run(rand()) * burst * 1.4;
        const tone = Math.sin(2 * Math.PI * pulses / sec * t) * 0.35 + Math.sin(4 * Math.PI * pulses / sec * t + 0.6) * 0.12;
        const prop = 1 + 0.32 * Math.sin(2 * Math.PI * blades / sec * t + ch * 0.4);
        const rumble = lp2.run(rand()) * 0.9;
        d[i] = hp.run((noise + tone * burst * 0.8 + rumble) * prop);
      }
    }
    // normalise
    let m = 0;
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i])); }
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= 0.9 / m; }
    return b;
  }

  private noiseLoop(seconds: number, color: 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(seconds * ctx.sampleRate);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, br = 0;
      for (let i = 0; i < n; i++) {
        const w = rand();
        if (color === 'pink') {
          b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
          d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
        } else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; }
      }
      // crossfade the ends for a seamless loop
      const f = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
    }
    return b;
  }

  private variants(name: BufName, count: number, make: () => AudioBuffer) {
    const arr: AudioBuffer[] = [];
    for (let i = 0; i < count; i++) arr.push(make());
    this.bufs.set(name, arr);
  }

  private buildBuffers() {
    // Browning M2 .50 cal: muzzle crack, chest-thumping blast, bolt/mechanism clatter
    this.variants('m2', 4, () => {
      const lp = [new LP(0.32), new LP(0.32)], lpb = [new LP(0.05), new LP(0.05)];
      const f1 = 1100 + Math.random() * 300, f2 = 2600 + Math.random() * 400;
      const dt = 0.028 + Math.random() * 0.01;
      return this.stereo(0.42, (t, ch) => {
        const n = rand();
        const crack = n * Math.exp(-t * 140) * 1.2;
        const blast = lp[ch].run(n) * Math.exp(-t * 26) * 1.6;
        const boom = lpb[ch].run(n) * Math.exp(-t * 11) * 2.8 + Math.sin(2 * Math.PI * 58 * t * (1 - t)) * Math.exp(-t * 16) * 1.1;
        const mech = t > dt ? (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.35 + rand() * 0.4) * Math.exp(-(t - dt) * 95) * 0.45 : 0;
        return crack + blast + boom + mech;
      });
    });
    // Player's .50 cal weight layers (always synthesized, stacked under the recorded report):
    // a chest-punch blast whose pitch drops like a small explosion, and the bolt slamming home.
    this.variants('m2thump', 4, () => {
      const lpn = [new LP(0.035), new LP(0.035)], lpm = [new LP(0.18), new LP(0.18)];
      const f0 = 34 + Math.random() * 8, sweep = 80 + Math.random() * 30;
      let ph = 0;
      return this.stereo(0.38, (t, ch, i) => {
        if (ch === 0) ph += 2 * Math.PI * (f0 + sweep * Math.exp(-t * 32)) / this.ctx!.sampleRate;
        const n = rand();
        const atk = 1 - Math.exp(-t * 1400);
        const sub = Math.sin(ph) * atk * Math.exp(-t * 13) * 1.6;
        const rumble = lpn[ch].run(n) * Math.exp(-t * 18) * 5.5;
        const blast = lpm[ch].run(n) * Math.exp(-t * 55) * 1.8;
        return Math.tanh((sub + rumble + blast) * 1.6);
      });
    });
    this.variants('m2mech', 3, () => {
      const d0 = 0.03 + Math.random() * 0.012, f1 = 1500 + Math.random() * 400, f2 = 3200 + Math.random() * 500;
      const hp = [new HP(0.7), new HP(0.7)];
      return this.stereo(0.16, (t, ch) => {
        const tt = t - d0;
        if (tt < 0) return 0;
        const ring = (Math.sin(2 * Math.PI * f1 * tt) * 0.6 + Math.sin(2 * Math.PI * f2 * tt) * 0.4) * Math.exp(-tt * 70);
        return ring * 0.7 + hp[ch].run(rand()) * Math.exp(-tt * 160) * 0.8;
      });
    });
    this.variants('m2far', 3, () => {
      const lp = [new LP(0.09), new LP(0.09)], lp2 = [new LP(0.25), new LP(0.25)];
      return this.stereo(0.5, (t, ch) => lp2[ch].run(lp[ch].run(rand())) * Math.exp(-t * 12) * 2 + Math.sin(2 * Math.PI * 64 * t) * Math.exp(-t * 15) * 0.5);
    });
    // MG 151/20 cannon: slower, heavier, with a ringing report
    this.variants('cannon', 3, () => {
      const lp = [new LP(0.2), new LP(0.2)], lpb = [new LP(0.04), new LP(0.04)];
      return this.stereo(0.7, (t, ch) => {
        const n = rand();
        return n * Math.exp(-t * 70) * 0.9 + lp[ch].run(n) * Math.exp(-t * 14) * 1.4 + lpb[ch].run(n) * Math.exp(-t * 6) * 3 + Math.sin(2 * Math.PI * 44 * t) * Math.exp(-t * 8) * 1.2;
      });
    });
    this.variants('mg131', 3, () => {
      const lp = [new LP(0.4), new LP(0.4)];
      return this.stereo(0.25, (t, ch) => { const n = rand(); return n * Math.exp(-t * 120) + lp[ch].run(n) * Math.exp(-t * 32) * 1.2 + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 28) * 0.7; });
    });
    // Rounds punching through aluminium: sharp tick + panel ring
    this.variants('hit', 4, () => {
      const f = [700 + Math.random() * 400, 1500 + Math.random() * 600, 2600 + Math.random() * 900, 3900 + Math.random() * 700];
      return this.stereo(0.4, (t) => { let s = rand() * Math.exp(-t * 380) * 1.4; f.forEach((fr, k) => { s += Math.sin(2 * Math.PI * fr * t) * Math.exp(-t * (16 + k * 10)) * (0.55 / (k + 1)); }); return s; });
    });
    this.variants('hitHeavy', 3, () => {
      const lp = [new LP(0.25), new LP(0.25)];
      const f = [160 + Math.random() * 60, 420, 830, 1350];
      return this.stereo(0.9, (t, ch) => { const n = rand(); let s = lp[ch].run(n) * Math.exp(-t * 12) * 2 + n * Math.exp(-t * 90); f.forEach((fr, k) => { s += Math.sin(2 * Math.PI * fr * t) * Math.exp(-t * (7 + k * 5)) * (0.5 / (k + 1)); }); return s; });
    });
    // Explosions: initial crack, low boom with a long tail and debris
    this.variants('explosion', 3, () => {
      const lp = [new LP(0.2), new LP(0.2)], lp2 = [new LP(0.02), new LP(0.02)];
      return this.stereo(4.0, (t, ch) => {
        const n = rand();
        lp[ch].a = 0.03 + 0.3 * Math.exp(-t * 4);
        const env = Math.min(1, t * 300) * Math.exp(-t * 1.3);
        return lp[ch].run(n) * env * 1.6 + lp2[ch].run(n) * Math.exp(-t * 0.8) * 5 + Math.sin(2 * Math.PI * 31 * t) * Math.exp(-t * 2.5) * 1.1 + n * Math.exp(-t * 60) * 0.6;
      });
    });
    this.variants('explosionFar', 2, () => {
      const lp = [new LP(0.015), new LP(0.015)];
      return this.stereo(3.5, (t, ch) => lp[ch].run(rand()) * Math.min(1, t * 40) * Math.exp(-t * 1.4) * 6 + Math.sin(2 * Math.PI * 28 * t) * Math.exp(-t * 3) * 0.6);
    });
    // 88 mm flak: hard "crump", heavier and sharper when close
    this.variants('flak', 3, () => {
      const lp = [new LP(0.1), new LP(0.1)];
      return this.stereo(2.0, (t, ch) => { const n = rand(); lp[ch].a = 0.04 + 0.35 * Math.exp(-t * 12); return lp[ch].run(n) * Math.min(1, t * 500) * Math.exp(-t * 2.8) * 2 + Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t * 6) * 1.2; });
    });
    this.variants('flakClose', 2, () => {
      const lp = [new LP(0.3), new LP(0.3)];
      return this.stereo(1.6, (t, ch) => { const n = rand(); return n * Math.exp(-t * 50) * 1.3 + lp[ch].run(n) * Math.exp(-t * 4) * 1.6 + Math.sin(2 * Math.PI * 42 * t) * Math.exp(-t * 5) * 1.4; });
    });
    // Shrapnel on the skin: "gravel thrown on a tin roof"
    this.variants('rattle', 2, () => {
      const hits = Array.from({ length: 22 }, () => ({ t: Math.random() * 0.55, f: 1800 + Math.random() * 3500, a: 0.3 + Math.random() * 0.7 }));
      return this.stereo(0.75, (t, ch) => { let s = 0; for (const h of hits) { if (t < h.t) continue; const dt = t - h.t; s += (Math.sin(2 * Math.PI * h.f * dt) * 0.5 + rand() * 0.5) * Math.exp(-dt * 140) * h.a * (ch ? 0.9 : 1); } return s; });
    });
    this.variants('crack', 3, () => this.stereo(0.1, (t) => rand() * Math.exp(-t * 160) + Math.sin(2 * Math.PI * 2900 * t) * Math.exp(-t * 110) * 0.3));
    this.variants('casing', 3, () => { const f = 3800 + Math.random() * 900; return this.stereo(0.3, (t) => Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 28) * 0.6 + Math.sin(2 * Math.PI * f * 1.53 * t) * Math.exp(-t * 40) * 0.4); });
    this.variants('click', 1, () => this.stereo(0.06, (t) => rand() * Math.exp(-t * 300) + Math.sin(2 * Math.PI * 1700 * t) * Math.exp(-t * 200) * 0.5));
    // Ammo belt running low: a tiny inharmonic metal clink (link hitting the feed tray)
    this.variants('beltTick', 3, () => { const f = 1900 + Math.random() * 800; return this.stereo(0.12, (t) => rand() * Math.exp(-t * 900) * 0.7 + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 70) * 0.5 + Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 95) * 0.35 + Math.sin(2 * Math.PI * f * 4.17 * t) * Math.exp(-t * 120) * 0.2); });
    this.variants('glass', 2, () => this.stereo(1.0, (t) => { let s = rand() * Math.exp(-t * 25) * 0.7; for (let k = 0; k < 7; k++) s += Math.sin(2 * Math.PI * (2500 + k * 913) * t + k) * Math.exp(-t * (10 + k * 3)) * 0.15 * (Math.sin(t * 80 + k) > 0.3 ? 1 : 0.2); return s; }));
    // Close fly-by: rising then falling broadband rush
    this.variants('whoosh', 2, () => {
      const lp = [new LP(0.1), new LP(0.1)];
      return this.stereo(1.6, (t, ch) => { lp[ch].a = 0.05 + 0.25 * Math.sin(Math.PI * Math.min(1, t / 1.6)); return lp[ch].run(rand()) * Math.pow(Math.sin(Math.PI * t / 1.6), 2); });
    });
    this.variants('rocket', 2, () => {
      const lp = [new LP(0.3), new LP(0.3)];
      return this.stereo(2.2, (t, ch) => lp[ch].run(rand()) * Math.min(1, t * 30) * Math.exp(-t * 1.2) + rand() * Math.exp(-t * 40) * 0.8);
    });
    this.variants('debris', 2, () => {
      const hits = Array.from({ length: 14 }, () => ({ t: Math.random() * 1.2, f: 300 + Math.random() * 1500 }));
      return this.stereo(1.6, (t) => { let s = 0; for (const h of hits) { if (t < h.t) continue; const dt = t - h.t; s += Math.sin(2 * Math.PI * h.f * dt) * Math.exp(-dt * 40); } return s; });
    });
    this.variants('static', 2, () => this.stereo(0.35, (t) => rand() * (0.5 + 0.5 * Math.sin(t * 300)) * Math.exp(-t * 6)));
    this.variants('squelch', 1, () => { const hp = new HP(0.8); return this.stereo(0.12, (t) => hp.run(rand()) * Math.exp(-t * 35) + Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 60) * 0.3); });

    // Engines (seconds chosen so pulse and blade periods loop seamlessly)
    this.engineBufs.cyclone = this.engineLoop(172.5, 64.7, { rough: 0.6, bright: 0.18 });  // R-1820 @ 2300 rpm, 3-blade prop
    this.engineBufs.bmw = this.engineLoop(280, 90, { rough: 0.8, bright: 0.22 });           // BMW 801 @ 2400 rpm
    this.engineBufs.merlin = this.engineLoop(300, 72, { rough: 0.3, bright: 0.3, banks: 2 }); // Merlin V-1650 @ 3000 rpm, banks alternate
  }

  // Real recordings (public/audio, see CREDITS.md) replace the synthesized sounds as
  // soon as they are decoded; anything missing keeps its synthesized fallback.
  // The bytes come through core/Assets (shared with the preloader, which fetches the core
  // one-shots before the menu and the rest in the background, see core/Preload.ts); each
  // group is swapped in as soon as its files are in.
  private async loadSamples() {
    let man: any;
    try { man = await json(AUDIO_MANIFEST); } catch { return; }
    // one decode per file (some files serve two names), on whichever context is live (a rebuild closes the old one)
    const decoded = new Map<string, Promise<AudioBuffer | null>>();
    const decode = (f: string, prio = P_REST) => {
      let p = decoded.get(f);
      if (!p) {
        p = (async () => { try { const ab = await take('audio/' + f, prio); return this.ctx ? await this.ctx.decodeAudioData(ab) : null; } catch { return null; } })();
        decoded.set(f, p);
      }
      return p;
    };
    const SFX: [BufName, string, number][] = [
      ['m2', 'mg50_shot', 1], ['m2far', 'mg50_burst_far', 1], ['cannon', 'cannon_shot', 1], ['mg131', 'mg50_shot', 0.7],
      ['hit', 'impact_metal', 1], ['hitHeavy', 'impact_heavy', 1], ['explosion', 'explosion_air', 1], ['explosionFar', 'explosion_far', 1],
      ['flak', 'flak_burst', 1], ['flakClose', 'flak_burst', 1.2], ['rattle', 'shrapnel_rattle', 1], ['casing', 'casing', 1],
      ['glass', 'glass_crack', 1], ['rocket', 'rocket_launch', 1], ['click', 'ui_click', 1], ['squelch', 'radio_squelch_on', 1],
      ['debris', 'shrapnel_rattle', 0.8], ['whoosh', 'flyby', 1],
    ];
    const sfx = SFX.map(async ([name, key, g]) => {
      const e = man.sfx?.[key];
      if (!e) return;
      const files: string[] = e.files ?? (e.file ? [e.file] : []);
      const bufs = (await Promise.all(files.map((f) => decode(f, P_SFX)))).filter((b): b is AudioBuffer => !!b);
      if (bufs.length) { this.bufs.set(name, bufs); this.gainMap.set(name, (e.gain ?? 1) * g); if (name === 'whoosh') this.flybyPeak = e.peakAt ?? 0; }
    });
    const confirms = (['hit_confirm', 'kill_confirm'] as const).map(async (k) => {
      const e = man.sfx?.[k];
      if (e) { const b = (await Promise.all((e.files ?? [e.file]).map((f: string) => decode(f, P_SFX)))).filter(Boolean) as AudioBuffer[]; if (b.length) { this.extra.set(k, b); this.extraGain.set(k, e.gain ?? 1); } }
    });
    const loop = async (k: string, prio: number) => { const e = man.loops?.[k]; return e ? { buf: await decode(e.file, prio), gain: e.gain ?? 1 } : null; };
    // (the graph may have been rebuilt while decoding: everything below uses the live one)
    const loops = [
      loop('b17_interior', P_LOOPS).then((b17) => { if (b17?.buf) { this.b17Loop = { buf: b17.buf, gain: b17.gain }; this.swapLoops(); } }),
      loop('wind', P_LOOPS).then((wind) => { if (wind?.buf) { this.windBuf = wind.buf; this.swapLoops(); } }),
      loop('radial_exterior', P_LOOPS).then((radial) => {
        if (radial?.buf) { this.engineBufs.bmw = radial.buf; this.voiceGain = radial.gain; this.radialRate = 2.2; for (const v of this.voices) this.reseat(v, radial.buf); }
      }),
      loop('merlin', P_LOOPS).then((merlin) => {
        if (merlin?.buf) { this.engineBufs.merlin = merlin.buf; this.merlinGain = merlin.gain; if (this.playerEngine) { this.playerEngine.src.stop(); this.playerEngine.src.disconnect(); this.playerEngine.src = this.loopSrc(merlin.buf); this.playerEngine.src.connect(this.playerEngine.filter); } }
      }),
      loop('radio_static', P_REST).then((radio) => { if (radio?.buf) this.radioStaticBuf = radio.buf; }),
    ];
    // music: each track joins the score as it arrives (the menu track first)
    const music = Object.entries(man.music ?? {}).map(async ([k, e]: [string, any]) => {
      const b = await decode(e.file, k === 'menu' ? P_MENU_MUSIC : k === 'tension' || k === 'combat' ? P_MISSION_MUSIC : P_REST);
      if (b) this.music.useTracks({ [k]: b }, { [k]: e.gain ?? 0.6 });
    });
    await Promise.all([...sfx, ...confirms, ...loops, ...music]);
    this.samplesLoaded = true;
    console.info('Audio: recorded samples loaded');
  }

  // Recorded cabin and wind loops swap in for the synthesized ones in the live graph
  // (on load, and again after a rebuild)
  private swapLoops() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const b17 = this.b17Loop;
    if (b17 && this.b17 && !this.b17Sampled) {
      for (const s of this.b17.srcs) { try { s.stop(); } catch { /* */ } s.disconnect(); }
      // two slightly detuned copies of the cabin recording: a living, beating drone
      this.b17.srcs = [1, 1.006].map((r, i) => {
        const s = this.loopSrc(b17.buf, r);
        const g = ctx.createGain(); g.gain.value = b17.gain * (i ? 0.45 : 0.8);
        s.connect(g).connect(this.b17!.filter);
        return s;
      });
      this.b17.filter.frequency.setValueAtTime(this.mode === 'bomber' ? 2400 : 900, t);
      this.b17Sampled = true;
    }
    if (this.windBuf && this.windSrc && this.wind && this.windSrc.buffer !== this.windBuf) { this.windSrc.stop(); this.windSrc.disconnect(); this.windSrc = this.loopSrc(this.windBuf); this.windSrc.connect(this.wind.filter); this.wind.filter.frequency.value = 6000; }
  }

  private extra = new Map<string, AudioBuffer[]>();
  private extraGain = new Map<string, number>();
  private b17Loop: { buf: AudioBuffer; gain: number } | null = null;
  private windBuf: AudioBuffer | null = null;
  private b17Sampled = false;
  private b17Sputter: GainNode | null = null;   // drone level, lowered per dead engine
  private b17Depth: GainNode | null = null;     // depth of the uneven sputter wobble
  private engineAlive = 4;
  private voiceGain = 1;
  private radialRate = 1; // recorded radial loop is at taxi rpm
  private flybyPeak = 0;
  private merlinGain = 1;
  private radioStaticBuf: AudioBuffer | null = null;

  private reseat(v: Voice, buf: AudioBuffer) {
    try { v.src.stop(); } catch { /* */ }
    v.src.disconnect();
    v.src = this.loopSrc(buf);
    v.src.connect(v.filter);
  }

  // Satisfying feedback when the player's rounds connect / score a kill
  confirm(kind: 'hit_confirm' | 'kill_confirm') {
    const arr = this.extra.get(kind);
    if (!this.ctx || !arr) { this.play(kind === 'kill_confirm' ? 'hitHeavy' : 'hit', null, { gain: kind === 'kill_confirm' ? 0.5 : 0.18 }); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = arr[Math.floor(Math.random() * arr.length)];
    const g = this.ctx.createGain(); setP(g.gain, (kind === 'kill_confirm' ? 0.7 : 0.35) * (this.extraGain.get(kind) ?? 1), GAIN);
    src.connect(g).connect(this.sfx);
    const now = this.ctx.currentTime;
    this.room(now, src.buffer.duration, 2);
    this.lastAudible = Math.max(this.lastAudible, now);
    freeOnEnd(src, [g]);
    src.start();
  }

  private loopSrc(buf: AudioBuffer, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.start(this.ctx!.currentTime + Math.random() * 0.2);
    return s;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // Slipstream wind with gusts (louder through the open waist windows)
    const ws = this.loopSrc(this.noiseLoop(5, 'pink'));
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 900; wf.Q.value = 0.5;
    // Gust stage between the base shaping and the level: swept by updateWind
    const gf = ctx.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 2000; gf.Q.value = 0.5;
    const gg = ctx.createGain(); gg.gain.value = 1;
    const flutter = ctx.createGain(); flutter.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.31;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(flutter.gain); lfo.start();
    const wg = ctx.createGain(); wg.gain.value = 0;
    ws.connect(wf).connect(gf).connect(flutter).connect(gg).connect(wg).connect(this.amb);
    this.windSrc = ws;
    this.wind = { gain: wg, filter: wf, flutter };
    this.gust = { gain: gg, filter: gf, walkG: 0, walkF: 0 };
    // B-17 interior: four Cyclones, each slightly off-speed so they beat ("wow-wow")
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.8;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const srcs: AudioBufferSourceNode[] = [];
    [1.0, 1.004, 0.9965, 1.0075].forEach((r, i) => {
      const s = this.loopSrc(this.engineBufs.cyclone, r);
      const p = ctx.createStereoPanner(); p.pan.value = [-0.7, -0.3, 0.3, 0.7][i];
      const g = ctx.createGain(); g.gain.value = 0.32;
      s.connect(g).connect(p).connect(filter);
      srcs.push(s);
    });
    const rumble = this.loopSrc(this.noiseLoop(4, 'brown'));
    const rg = ctx.createGain(); rg.gain.value = 0.55;
    rumble.connect(rg).connect(filter);
    // Damage path: the drone level follows setEngineHealth, and a two-rate wobble
    // (depth set by dead engines) makes a damaged bomber sound uneven. Neutral at 4 engines.
    const sputter = ctx.createGain(); sputter.gain.value = 0.2 + 0.2 * this.engineAlive;
    const depth = ctx.createGain(); depth.gain.value = 0.04 * (4 - this.engineAlive);
    [2.7, 5.3].forEach((f) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const half = ctx.createGain(); half.gain.value = 0.5;
      o.connect(half).connect(depth); o.start();
    });
    depth.connect(sputter.gain);
    this.b17Sputter = sputter; this.b17Depth = depth;
    filter.connect(sputter).connect(gain).connect(this.amb);
    srcs.push(rumble);
    this.b17 = { gain, filter, srcs };
  }

  private makeVoice(): Voice {
    const ctx = this.ctx!;
    const src = this.loopSrc(this.engineBufs.bmw);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 1.2;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createPanner();
    // equal-power until the fighter is close (updateFighterVoices): idle HRTF panners still cost
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 70; pan.rolloffFactor = 1.1; pan.maxDistance = 10000;
    const whoosh = this.loopSrc(this.noiseLoop(3, 'pink'));
    const whooshFilter = ctx.createBiquadFilter(); whooshFilter.type = 'bandpass'; whooshFilter.frequency.value = 800; whooshFilter.Q.value = 0.7;
    const whooshGain = ctx.createGain(); whooshGain.gain.value = 0;
    src.connect(filter).connect(gain).connect(pan);
    whoosh.connect(whooshFilter).connect(whooshGain).connect(pan);
    pan.connect(this.sfx);
    const send = ctx.createGain(); send.gain.value = 0.25; pan.connect(send).connect(this.revOutSend);
    return { src, gain, filter, pan, whoosh, whooshGain, whooshFilter, owner: -1, radial: true, freeAt: 0 };
  }

  setMode(mode: 'bomber' | 'fighter' | 'menu') {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.interior = mode === 'bomber' ? 1 : 0;
    this.b17?.gain.gain.setTargetAtTime(mode === 'bomber' ? 0.62 : mode === 'menu' ? 0.16 : 0.0, t, 0.6);
    this.b17?.filter.frequency.setTargetAtTime(this.b17Sampled ? (mode === 'bomber' ? 2400 : 900) : mode === 'bomber' ? 520 : 300, t, 0.3);
    this.wind?.gain.gain.setTargetAtTime(mode === 'menu' ? 0.1 : mode === 'bomber' ? 0.3 : 0.18, t, 0.5);
    this.windCut = mode === 'bomber' ? 1400 : 800;
    this.wind?.filter.frequency.setTargetAtTime(this.windCut, t, 0.5);
    this.revInSend.gain.setTargetAtTime(mode === 'bomber' ? 0.55 : 0.0, t, 0.2);
    this.creaks?.setActive(mode === 'bomber');
    if (mode === 'fighter') this.ensurePlayerEngine();
    else if (this.playerEngine) this.playerEngine.gain.gain.setTargetAtTime(0, t, 0.3);
    this.music.setScene(mode === 'menu' ? 'menu' : 'mission');
    // Oxygen-mask breathing runs in the aircraft, silent on the menus
    if (mode === 'menu') this.breathing?.stop(); else this.breathing?.start();
  }

  private ensurePlayerEngine() {
    const ctx = this.ctx!;
    if (!this.playerEngine) {
      const src = this.loopSrc(this.engineBufs.merlin);
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 1.4;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.amb);
      this.playerEngine = { src, gain, filter };
    }
  }

  setPlayerEngine(throttle: number, speed: number) {
    if (!this.ctx || !this.playerEngine || !ok(throttle) || !ok(speed)) return;
    speed = Math.min(1000, Math.max(0, speed));
    const t = this.ctx.currentTime;
    towards(this.playerEngine.src.playbackRate, 0.78 + throttle * 0.3 + speed * 0.0004, RATE, t, 0.15);
    towards(this.playerEngine.filter.frequency, 380 + throttle * 1100, FREQ, t, 0.1);
    towards(this.playerEngine.gain.gain, (0.26 + throttle * 0.2) * this.merlinGain, GAIN, t, 0.1);
    if (this.wind) towards(this.wind.gain.gain, 0.05 + speed / 800, GAIN, t, 0.2);
    this.windSpeed = speed;
    this.windCut = 350 + speed * 7;
    if (this.wind) towards(this.wind.filter.frequency, this.windCut, FREQ, t, 0.2);
  }

  // Wind gusts: two slow mean-reverting random walks. One swells the wind level and
  // the other sweeps the gust filter, which only muffles the lulls (its cutoff sits above
  // the base wind filter), so gusts stay full and lulls go dull. Strength scales with
  // airspeed in the P-51 and stays subtle inside the bomber.
  updateWind(dt: number) {
    if (!this.ctx || !this.gust) return;
    const h = Math.min(dt, 0.1); // clamp so a stalled tab cannot jump the walks
    if (!(h >= 0)) return;     // a NaN dt would poison the walks for good
    const fighter = this.mode === 'fighter';
    const speedN = fighter ? THREE.MathUtils.clamp((this.windSpeed - 60) / 90, 0, 1) : 0;
    const s = fighter ? 0.35 + 0.65 * speedN : 0.3;
    const g = this.gust;
    const sig = (0.45 + 0.35 * s) * Math.sqrt(3 * h); // uniform rand() has variance 1/3
    g.walkG = fin(THREE.MathUtils.clamp(g.walkG - 0.35 * g.walkG * h + rand() * sig, -1, 1), 0);
    g.walkF = fin(THREE.MathUtils.clamp(g.walkF - 0.35 * g.walkF * h + rand() * sig, -1, 1), 0);
    const t = this.ctx.currentTime;
    towards(g.gain.gain, 1 + (0.15 + 0.45 * s) * g.walkG, GAIN, t, 0.3);
    towards(g.filter.frequency, this.windCut * Math.pow(2, 0.7 + g.walkF * (0.25 + 0.75 * s)), FREQ, t, 0.3);
  }

  // Engine damage in the B-17 interior: each dead engine lowers the drone by a fifth and
  // deepens an uneven sputter. alive is 0..4; cached so per-frame calls are cheap.
  setEngineHealth(alive: number) {
    if (!ok(alive)) return;
    const a = Math.max(0, Math.min(4, Math.round(alive)));
    if (a === this.engineAlive) return;
    this.engineAlive = a;
    if (!this.ctx || !this.b17Sputter || !this.b17Depth) return;
    const t = this.ctx.currentTime;
    this.b17Sputter.gain.setTargetAtTime(0.2 + 0.2 * a, t, 0.4);
    this.b17Depth.gain.setTargetAtTime(0.04 * (4 - a), t, 0.4);
  }

  private tmpPos = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpF = new THREE.Vector3();
  private tmpU = new THREE.Vector3();
  private tmpTo = new THREE.Vector3();

  setListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this.tmpPos);
    const q = cam.getWorldQuaternion(this.tmpQ);
    const f = this.tmpF.set(0, 0, -1).applyQuaternion(q);
    const u = this.tmpU.set(0, 1, 0).applyQuaternion(q);
    // a NaN listener would poison every panner at once: keep the last good one
    if (!ok(p.x + p.y + p.z + f.x + f.y + f.z + u.x + u.y + u.z) || p.lengthSq() > 1e12) return;
    this.listenerPos.copy(p);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(u.x, t); l.upY.setValueAtTime(u.y, t); l.upZ.setValueAtTime(u.z, t);
    } else {
      (l as any).setPosition(p.x, p.y, p.z);
      (l as any).setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // Engine voices for the nearest fighters: Doppler pitch, distance filtering, a rush
  // of air on close passes. Also feeds the combat intensity to the score.
  updateFighterVoices(fighters: { id: number; pos: THREE.Vector3; vel: THREE.Vector3; radial: boolean; throttle: number }[]) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.listenerPos;
    // (d < 4000 also drops NaN positions)
    const sorted = fighters.map((f) => ({ f, d: f.pos.distanceTo(L) })).filter((x) => x.d < 4000).sort((a, b) => a.d - b.d).slice(0, this.voices.length);
    let intensity = 0;
    const used = new Set<Voice>();
    for (const { f, d } of sorted) {
      let v = this.voices.find((vv) => vv.owner === f.id);
      if (!v) v = this.voices.find((vv) => !used.has(vv) && !sorted.some((s) => s.f.id === vv.owner));
      if (!v) continue;
      used.add(v);
      if (v.owner !== f.id || v.radial !== f.radial) {
        // re-seat the voice on the right engine type
        if (v.radial !== f.radial) {
          v.src.stop(); v.src.disconnect();
          v.src = this.loopSrc(f.radial ? this.engineBufs.bmw : this.engineBufs.merlin);
          v.src.connect(v.filter);
          v.radial = f.radial;
        }
        v.owner = f.id;
      }
      const toL = this.tmpTo.copy(L).sub(f.pos);
      const dist = Math.max(1, toL.length());
      toL.divideScalar(dist);
      const vr = fin(f.vel.dot(toL), 0, [-2000, 2000]); // approaching = positive
      const dop = 343 / Math.max(110, 343 - vr);
      towards(v.src.playbackRate, (0.82 + fin(f.throttle, 1, [0, 2]) * 0.22) * dop * (v.radial ? this.radialRate : 1), RATE, t, 0.04);
      towards(v.filter.frequency, (this.interior ? 650 : 1600) * Math.max(0.3, Math.exp(-d / 2200)) + 160, FREQ, t, 0.05);
      place(v.pan, f.pos.x, f.pos.y, f.pos.z, t);
      // HRTF only while the fighter is close (hysteresis so it does not flip at the edge)
      const pm = d < (v.pan.panningModel === 'HRTF' ? 1000 : 800) ? 'HRTF' : 'equalpower';
      if (v.pan.panningModel !== pm) v.pan.panningModel = pm;
      towards(v.gain.gain, (this.interior ? 0.5 : 0.65) * this.voiceGain, GAIN, t, 0.08);
      const close = Math.max(0, 1 - d / 450);
      towards(v.whooshGain.gain, close * close * 0.9, GAIN, t, 0.05);
      towards(v.whooshFilter.frequency, 500 + Math.max(0, vr) * 6, FREQ, t, 0.05);
      intensity = Math.max(intensity, Math.max(0, 1 - d / 2500));
    }
    for (const v of this.voices) if (!used.has(v)) {
      if (v.owner !== -1) v.freeAt = t;
      v.gain.gain.setTargetAtTime(0, t, 0.25); v.whooshGain.gain.setTargetAtTime(0, t, 0.1); v.owner = -1;
      // back to equal-power once the fade-out is over
      if (v.pan.panningModel !== 'equalpower' && t - v.freeAt > 1.5) v.pan.panningModel = 'equalpower';
    }
    this.music.setIntensity(fighters.length ? Math.max(intensity, 0.35) : 0);
    this.breathing?.setIntensity(fighters.length ? intensity : 0);
  }

  play(name: BufName, pos: THREE.Vector3 | null, opts: { gain?: number; rate?: number; delay?: boolean; ref?: number; reverb?: number } = {}) {
    if (!this.ctx) return;
    const arr = this.bufs.get(name);
    if (!arr) return;
    let buffer = arr[Math.floor(Math.random() * arr.length)];
    // distant explosions lose their crack: use the rolling far variant
    if (name === 'explosion' && pos && pos.distanceTo(this.listenerPos) > 2500) buffer = (this.bufs.get('explosionFar') ?? arr)[0];
    this.shot(buffer, pos, opts, (opts.gain ?? 1) * (this.gainMap.get(name) ?? 1), name);
  }

  // One-off synthesized buffers (see Ricochet.ts): same positional chain as play(), caller supplies the buffer
  playBuffer(buffer: AudioBuffer, pos: THREE.Vector3 | null, opts: { gain?: number; rate?: number; delay?: boolean; ref?: number; reverb?: number } = {}) {
    if (this.ctx) this.shot(buffer, pos, opts, opts.gain ?? 1);
  }

  // Shared one-shot chain: src -> [lowpass] -> gain -> [panner] -> sfx, plus reverb sends.
  // Non-positional sounds (player's guns, cockpit, UI) always play; positional ones go
  // through the far-spam gaps and the voice budget. Nodes are released on 'ended'.
  private shot(buffer: AudioBuffer, pos: THREE.Vector3 | null, opts: ShotOpts, gain: number, name?: BufName) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const rate = (opts.rate ?? 1) * (0.95 + Math.random() * 0.1);
    if (!ok(gain) || !ok(rate) || gain <= 0) return;
    let d = 0, when = now;
    if (pos) {
      d = pos.distanceTo(this.listenerPos);
      if (!(d <= 12000)) return; // also drops NaN positions
      if (opts.delay !== false) when += d / 343;
    }
    const offset = name === 'whoosh' ? Math.max(0, this.flybyPeak - 0.7) : 0;
    const dur = (buffer.duration - offset) / rate;
    const prio = !pos ? 2 : d < 150 || (name && BIG.has(name) && d < 3000) ? 1 : 0;
    const gap = name && pos && d > FAR ? FAR_GAP[name] : undefined;
    if (gap) {
      const last = this.lastFar.get(name!) ?? -Infinity;
      if (now >= last && now - last < gap) return;
      this.lastFar.set(name!, now);
    }
    if (!this.room(when, dur, prio)) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    setP(src.playbackRate, rate, RATE);
    const g = ctx.createGain();
    setP(g.gain, gain, GAIN);
    const nodes: AudioNode[] = [g];
    let out: AudioNode = g;
    if (pos) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      setP(f.frequency, Math.max(150, 18000 * Math.exp(-d / 1000)) * (this.interior ? 0.55 : 1), FREQ);
      const p = ctx.createPanner();
      // HRTF only for a few very close sounds at a time
      p.panningModel = d < 60 && this.hrtfShots.take(now, when, dur) ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse'; p.refDistance = fin(opts.ref ?? 40, 40, [0.1, 1e4]); p.rolloffFactor = 1;
      place(p, pos.x, pos.y, pos.z);
      src.connect(f).connect(g).connect(p).connect(this.sfx);
      out = p;
      const send = ctx.createGain();
      setP(send.gain, (opts.reverb ?? 0.35) * Math.min(1, 0.3 + d / 1500), GAIN);
      p.connect(send).connect(this.revOutSend);
      nodes.push(f, p, send);
    } else {
      src.connect(g).connect(this.sfx);
    }
    if (this.interior && (opts.reverb ?? 0) > 0) { const s = ctx.createGain(); setP(s.gain, opts.reverb!, GAIN); out.connect(s).connect(this.revInSend); nodes.push(s); }
    freeOnEnd(src, nodes);
    src.start(when, offset);
    if (gain > 0.02) this.lastAudible = Math.max(this.lastAudible, when);
  }

  // Enemy round passing close to the listener: a zip panned to where the round is (rate-limited in Whizby.ts)
  whizby(pos: THREE.Vector3, gain: number) { this.whizbyFx?.play(pos, gain); }

  // Player's own guns: un-positioned, close, with the fuselage ringing around them
  playerGun(twin: boolean, cannon = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.028) return;
    this.lastShot = now;
    const rev = this.mode === 'bomber' ? 0.7 : 0;
    // recorded report + synthesized blast + bolt: reads as a heavy weapon, each round a small explosion
    if (cannon) {
      // 20 mm: a slower, deeper boom with the same blast layer pitched down
      this.play('cannon', null, { gain: 1.0, reverb: rev });
      this.play('m2thump', null, { gain: 1.3, rate: 0.72, reverb: rev * 0.9 });
      this.play('m2mech', null, { gain: 0.35, rate: 0.8, reverb: rev * 0.4 });
    } else {
      this.play('m2', null, { gain: twin ? 0.9 : 0.8, reverb: rev });
      this.play('m2thump', null, { gain: twin ? 1.15 : 1.0, reverb: rev * 0.8 });
      this.play('m2mech', null, { gain: 0.28, reverb: rev * 0.4 });
    }
    // the guns drown out everything else for an instant
    this.duckFor(0.09, 0.5);
    if (Math.random() < 0.35) setTimeout(() => this.play('casing', null, { gain: 0.07, rate: 0.9 + Math.random() * 0.4, reverb: 0.3 }), 150 + Math.random() * 250);
  }

  // Shrapnel / rounds hitting our own aircraft
  playerImpact(heavy: boolean) {
    this.play(heavy ? 'hitHeavy' : 'hit', null, { gain: heavy ? 1.0 : 0.6, reverb: 0.6 });
  }

  rattle() { this.play('rattle', null, { gain: 0.7, reverb: 0.5 }); }

  // Hits on the bomber shake the airframe: extra creaks (no-op outside the bomber)
  airframeHit(heavy: boolean) { this.creaks?.hit(heavy); }

  duckFor(seconds: number, depth = 0.45) {
    if (!this.ctx || !ok(seconds) || !ok(depth)) return;
    const t = this.ctx.currentTime;
    seconds = Math.max(0, seconds); depth = Math.min(1, Math.max(0, depth));
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(depth, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  // Interphone call-click + static burst; the click-off follows automatically
  radioStatic() { this.interphone?.call(); }

  // Alarm bell inside the bomber: a struck-bell partial stack plus a clapper click, rung
  // `strikes` times. Synthesised on the fly (no sample), through the sfx bus and interior reverb.
  alarmBell(strikes = 4, gap = 0.7, gain = 0.35) {
    if (!this.ctx || !ok(strikes) || !ok(gap) || !ok(gain)) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const partials: [number, number, number][] = [ // [frequency ratio, amplitude, decay seconds]
      [1, 1, 1.9], [2.0, 0.55, 1.4], [2.76, 0.4, 1.0], [4.07, 0.2, 0.6], [5.4, 0.12, 0.35],
    ];
    const click = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.012), ctx.sampleRate);
    const cd = click.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = rand() * Math.exp(-i / 30);
    const bus = ctx.createGain();
    setP(bus.gain, gain, GAIN);
    bus.connect(this.sfx);
    const send = ctx.createGain(); send.gain.value = 0.5;
    bus.connect(send).connect(this.revInSend);
    let last = null as OscillatorNode | null;
    for (let s = 0; s < strikes; s++) {
      const t = t0 + s * gap;
      for (const [ratio, amp, decay] of partials) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 620 * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + decay + 0.05);
        freeOnEnd(o, [g]);
        if (s === strikes - 1 && decay === partials[0][2]) last = o; // longest partial of the last strike
      }
      const c = ctx.createBufferSource();
      c.buffer = click;
      const cg = ctx.createGain(); cg.gain.value = 0.35;
      c.connect(cg).connect(bus);
      freeOnEnd(c, [cg]);
      c.start(t);
    }
    // the bus and its send go once the last strike has rung out
    if (last) { const o = last, free = o.onended; o.onended = (e) => { free?.call(o, e); bus.disconnect(); send.disconnect(); }; }
  }

  speak(text: string, voiceIdx = 0) {
    if (!this.radioEnabled || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[—–]/g, ', '));
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
      const preferred = voices.filter((v) => /US|United States|Alex|Daniel|Fred|Male/i.test(v.name + v.lang));
      const pool = preferred.length ? preferred : voices;
      if (pool.length) u.voice = pool[voiceIdx % pool.length];
      u.rate = 1.08; u.pitch = 0.85 + (voiceIdx % 3) * 0.08; u.volume = 0.9 * this.volume;
      // interphone static bed + squelch while the crewman talks
      u.onstart = () => this.radioBedOn(true);
      u.onend = () => { this.radioBedOn(false); this.play('squelch', null, { gain: 0.2 }); };
      speechSynthesis.speak(u);
      this.duckFor(Math.min(4, 0.6 + text.length * 0.06), 0.6);
    } catch { /* speech unavailable */ }
  }

  private radioBedOn(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.radioBed) {
      const src = this.loopSrc(this.radioStaticBuf ?? this.noiseLoop(2, 'pink'));
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = this.radioStaticBuf ? 0.3 : 1.2;
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.sfx);
      this.radioBed = { src, gain };
    }
    this.radioBed.gain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.05);
  }

  stopSpeech() { try { speechSynthesis.cancel(); } catch { /* ignore */ } this.radioBedOn(false); this.interphone?.cancel(); this.onStopSpeech?.(); }
  // Set by the recorded crew voices (Voice.ts) so mission end / quit also silences them
  onStopSpeech: (() => void) | null = null;
}

export const sound = new Sound();
