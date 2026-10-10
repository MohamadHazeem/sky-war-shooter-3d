import * as THREE from 'three';
import { Music } from './Music';
import { Whizby } from './Whizby';

// Procedural audio engine (no sample files).
// - Engines are synthesised as looping firing-pulse trains: Wright R-1820 Cyclones
//   (9-cyl radial) for the B-17, BMW 801 (14-cyl radial) for the Fw 190, Packard
//   Merlin (V-12) for the P-51, each with propeller blade-pass modulation.
// - Weapons, impacts, flak and explosions are layered one-shots with several
//   pre-rendered variations, positioned in 3D (HRTF up close), low-passed and
//   delayed by the speed of sound with distance, and sent to convolution reverbs:
//   a short metallic one for the inside of the bomber, a long open-air one outside.
type BufName =
  | 'm2' | 'm2far' | 'cannon' | 'mg131' | 'hit' | 'hitHeavy' | 'explosion' | 'explosionFar' | 'flak' | 'flakClose'
  | 'crack' | 'casing' | 'click' | 'glass' | 'whoosh' | 'static' | 'squelch' | 'rattle' | 'rocket' | 'debris';

const rand = () => Math.random() * 2 - 1;

// One-pole filter helpers for offline synthesis
class LP { y = 0; constructor(public a: number) {} run(x: number) { this.y += (x - this.y) * this.a; return this.y; } }
class HP { y = 0; x1 = 0; constructor(public a: number) {} run(x: number) { const y = this.a * (this.y + x - this.x1); this.x1 = x; this.y = y; return y; } }

interface Voice {
  src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: PannerNode;
  whoosh: AudioBufferSourceNode; whooshGain: GainNode; whooshFilter: BiquadFilterNode;
  owner: number; radial: boolean;
}

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private duck!: GainNode;
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
  private voices: Voice[] = [];
  private playerEngine: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private radioBed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  readonly music = new Music();
  private whizbyFx: Whizby | null = null;
  volume = 0.8;
  radioEnabled = true;
  musicEnabled = true;
  private lastShot = 0;
  private interior = 1;
  private mode: 'bomber' | 'fighter' | 'menu' = 'menu';

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.002; comp.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    // ducking bus for radio/explosions (music + ambience go through it)
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.duck);
    // Reverbs
    this.revIn = ctx.createConvolver(); this.revIn.buffer = this.impulse(0.75, 6.5, true);
    this.revOut = ctx.createConvolver(); this.revOut.buffer = this.impulse(3.8, 1.4, false);
    this.revInSend = ctx.createGain(); this.revInSend.gain.value = 0.55;
    this.revOutSend = ctx.createGain(); this.revOutSend.gain.value = 0.5;
    this.revInSend.connect(this.revIn).connect(this.master);
    this.revOutSend.connect(this.revOut).connect(this.master);
    this.buildBuffers();
    this.startAmbience();
    for (let i = 0; i < 6; i++) this.voices.push(this.makeVoice());
    this.whizbyFx = new Whizby(ctx, this.sfx);
    this.music.init(ctx, this.duck, this.revOutSend);
    this.music.enabled = this.musicEnabled;
    void this.loadSamples();
    this.setMode(this.mode);
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusic(on: boolean) { this.musicEnabled = on; this.music.enabled = on; if (!on) this.music.stop(); }

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
  private async loadSamples() {
    const ctx = this.ctx!;
    const base = import.meta.env.BASE_URL + 'audio/';
    let man: any;
    try { const r = await fetch(base + 'manifest.json'); if (!r.ok) return; man = await r.json(); } catch { return; }
    const decode = async (f: string) => { try { const r = await fetch(base + f); return await ctx.decodeAudioData(await r.arrayBuffer()); } catch { return null; } };
    const SFX: [BufName, string, number][] = [
      ['m2', 'mg50_shot', 1], ['m2far', 'mg50_burst_far', 1], ['cannon', 'cannon_shot', 1], ['mg131', 'mg50_shot', 0.7],
      ['hit', 'impact_metal', 1], ['hitHeavy', 'impact_heavy', 1], ['explosion', 'explosion_air', 1], ['explosionFar', 'explosion_far', 1],
      ['flak', 'flak_burst', 1], ['flakClose', 'flak_burst', 1.2], ['rattle', 'shrapnel_rattle', 1], ['casing', 'casing', 1],
      ['glass', 'glass_crack', 1], ['rocket', 'rocket_launch', 1], ['click', 'ui_click', 1], ['squelch', 'radio_squelch_on', 1],
      ['debris', 'shrapnel_rattle', 0.8], ['whoosh', 'flyby', 1],
    ];
    await Promise.all(SFX.map(async ([name, key, g]) => {
      const e = man.sfx?.[key];
      if (!e) return;
      const files: string[] = e.files ?? (e.file ? [e.file] : []);
      const bufs = (await Promise.all(files.map(decode))).filter((b): b is AudioBuffer => !!b);
      if (bufs.length) { this.bufs.set(name, bufs); this.gainMap.set(name, (e.gain ?? 1) * g); }
    }));
    for (const k of ['hit_confirm', 'kill_confirm'] as const) {
      const e = man.sfx?.[k];
      if (e) { const b = (await Promise.all((e.files ?? [e.file]).map(decode))).filter(Boolean) as AudioBuffer[]; if (b.length) { this.extra.set(k, b); this.extraGain.set(k, e.gain ?? 1); } }
    }
    const loop = async (k: string) => { const e = man.loops?.[k]; return e ? { buf: await decode(e.file), gain: e.gain ?? 1 } : null; };
    const [b17, radial, merlin, wind, radio] = await Promise.all(['b17_interior', 'radial_exterior', 'merlin', 'wind', 'radio_static'].map(loop));
    const t = ctx.currentTime;
    if (b17?.buf && this.b17) {
      for (const s of this.b17.srcs) { try { s.stop(); } catch { /* */ } s.disconnect(); }
      // two slightly detuned copies of the cabin recording: a living, beating drone
      this.b17.srcs = [1, 1.006].map((r, i) => {
        const s = this.loopSrc(b17.buf!, r);
        const g = ctx.createGain(); g.gain.value = b17.gain * (i ? 0.45 : 0.8);
        s.connect(g).connect(this.b17!.filter);
        return s;
      });
      this.b17.filter.frequency.setValueAtTime(this.mode === 'bomber' ? 2400 : 900, t);
      this.b17Sampled = true;
    }
    if (radial?.buf) { this.engineBufs.bmw = radial.buf; this.voiceGain = radial.gain; for (const v of this.voices) this.reseat(v, radial.buf); }
    if (merlin?.buf) { this.engineBufs.merlin = merlin.buf; this.merlinGain = merlin.gain; if (this.playerEngine) { this.playerEngine.src.stop(); this.playerEngine.src.disconnect(); this.playerEngine.src = this.loopSrc(merlin.buf); this.playerEngine.src.connect(this.playerEngine.filter); } }
    if (wind?.buf && this.windSrc && this.wind) { this.windSrc.stop(); this.windSrc.disconnect(); this.windSrc = this.loopSrc(wind.buf); this.windSrc.connect(this.wind.filter); this.wind.filter.frequency.value = 6000; }
    if (radio?.buf) this.radioStaticBuf = radio.buf;
    if (man.music) {
      const tracks: Record<string, AudioBuffer> = {};
      await Promise.all(Object.entries(man.music).map(async ([k, e]: [string, any]) => { const b = await decode(e.file); if (b) tracks[k] = b; }));
      this.music.useTracks(tracks, Object.fromEntries(Object.entries(man.music).map(([k, e]: [string, any]) => [k, e.gain ?? 0.6])));
    }
    this.samplesLoaded = true;
    console.info('Audio: recorded samples loaded');
  }

  private extra = new Map<string, AudioBuffer[]>();
  private extraGain = new Map<string, number>();
  private b17Sampled = false;
  private voiceGain = 1;
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
    const g = this.ctx.createGain(); g.gain.value = (kind === 'kill_confirm' ? 0.7 : 0.35) * (this.extraGain.get(kind) ?? 1);
    src.connect(g).connect(this.sfx);
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
    const flutter = ctx.createGain(); flutter.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.31;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(flutter.gain); lfo.start();
    const wg = ctx.createGain(); wg.gain.value = 0;
    ws.connect(wf).connect(flutter).connect(wg).connect(this.amb);
    this.windSrc = ws;
    this.wind = { gain: wg, filter: wf, flutter };
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
    filter.connect(gain).connect(this.amb);
    srcs.push(rumble);
    this.b17 = { gain, filter, srcs };
  }

  private makeVoice(): Voice {
    const ctx = this.ctx!;
    const src = this.loopSrc(this.engineBufs.bmw);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = 1.2;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 70; pan.rolloffFactor = 1.1; pan.maxDistance = 10000;
    const whoosh = this.loopSrc(this.noiseLoop(3, 'pink'));
    const whooshFilter = ctx.createBiquadFilter(); whooshFilter.type = 'bandpass'; whooshFilter.frequency.value = 800; whooshFilter.Q.value = 0.7;
    const whooshGain = ctx.createGain(); whooshGain.gain.value = 0;
    src.connect(filter).connect(gain).connect(pan);
    whoosh.connect(whooshFilter).connect(whooshGain).connect(pan);
    pan.connect(this.sfx);
    const send = ctx.createGain(); send.gain.value = 0.25; pan.connect(send).connect(this.revOutSend);
    return { src, gain, filter, pan, whoosh, whooshGain, whooshFilter, owner: -1, radial: true };
  }

  setMode(mode: 'bomber' | 'fighter' | 'menu') {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.interior = mode === 'bomber' ? 1 : 0;
    this.b17?.gain.gain.setTargetAtTime(mode === 'bomber' ? 0.62 : mode === 'menu' ? 0.16 : 0.0, t, 0.6);
    this.b17?.filter.frequency.setTargetAtTime(this.b17Sampled ? (mode === 'bomber' ? 2400 : 900) : mode === 'bomber' ? 520 : 300, t, 0.3);
    this.wind?.gain.gain.setTargetAtTime(mode === 'menu' ? 0.1 : mode === 'bomber' ? 0.3 : 0.18, t, 0.5);
    this.wind?.filter.frequency.setTargetAtTime(mode === 'bomber' ? 1400 : 800, t, 0.5);
    this.revInSend.gain.setTargetAtTime(mode === 'bomber' ? 0.55 : 0.0, t, 0.2);
    if (mode === 'fighter') this.ensurePlayerEngine();
    else if (this.playerEngine) this.playerEngine.gain.gain.setTargetAtTime(0, t, 0.3);
    this.music.setScene(mode === 'menu' ? 'menu' : 'mission');
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
    if (!this.ctx || !this.playerEngine) return;
    const t = this.ctx.currentTime;
    this.playerEngine.src.playbackRate.setTargetAtTime(0.78 + throttle * 0.3 + speed * 0.0004, t, 0.15);
    this.playerEngine.filter.frequency.setTargetAtTime(380 + throttle * 1100, t, 0.1);
    this.playerEngine.gain.gain.setTargetAtTime((0.26 + throttle * 0.2) * this.merlinGain, t, 0.1);
    this.wind?.gain.gain.setTargetAtTime(0.05 + speed / 800, t, 0.2);
    this.wind?.filter.frequency.setTargetAtTime(350 + speed * 7, t, 0.2);
  }

  setListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this.listenerPos);
    const q = cam.getWorldQuaternion(new THREE.Quaternion());
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
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
      const toL = L.clone().sub(f.pos);
      const dist = Math.max(1, toL.length());
      toL.divideScalar(dist);
      const vr = f.vel.dot(toL); // approaching = positive
      const dop = 343 / Math.max(110, 343 - vr);
      v.src.playbackRate.setTargetAtTime((0.82 + f.throttle * 0.22) * dop, t, 0.04);
      v.filter.frequency.setTargetAtTime((this.interior ? 650 : 1600) * Math.max(0.3, Math.exp(-d / 2200)) + 160, t, 0.05);
      v.pan.positionX.setValueAtTime(f.pos.x, t); v.pan.positionY.setValueAtTime(f.pos.y, t); v.pan.positionZ.setValueAtTime(f.pos.z, t);
      v.gain.gain.setTargetAtTime((this.interior ? 0.5 : 0.65) * this.voiceGain, t, 0.08);
      const close = Math.max(0, 1 - d / 450);
      v.whooshGain.gain.setTargetAtTime(close * close * 0.9, t, 0.05);
      v.whooshFilter.frequency.setTargetAtTime(500 + Math.max(0, vr) * 6, t, 0.05);
      intensity = Math.max(intensity, Math.max(0, 1 - d / 2500));
    }
    for (const v of this.voices) if (!used.has(v)) { v.gain.gain.setTargetAtTime(0, t, 0.25); v.whooshGain.gain.setTargetAtTime(0, t, 0.1); v.owner = -1; }
    this.music.setIntensity(fighters.length ? Math.max(intensity, 0.35) : 0);
  }

  play(name: BufName, pos: THREE.Vector3 | null, opts: { gain?: number; rate?: number; delay?: boolean; ref?: number; reverb?: number } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const arr = this.bufs.get(name);
    if (!arr) return;
    const src = ctx.createBufferSource();
    let buffer = arr[Math.floor(Math.random() * arr.length)];
    // distant explosions lose their crack: use the rolling far variant
    if (name === 'explosion' && pos && pos.distanceTo(this.listenerPos) > 2500) buffer = (this.bufs.get('explosionFar') ?? arr)[0];
    src.buffer = buffer;
    src.playbackRate.value = (opts.rate ?? 1) * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain();
    g.gain.value = (opts.gain ?? 1) * (this.gainMap.get(name) ?? 1);
    let when = ctx.currentTime;
    let out: AudioNode = g;
    if (pos) {
      const d = pos.distanceTo(this.listenerPos);
      if (d > 12000) return;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(150, 18000 * Math.exp(-d / 1000)) * (this.interior ? 0.55 : 1);
      const p = ctx.createPanner();
      p.panningModel = d < 60 ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = opts.ref ?? 40; p.rolloffFactor = 1;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      src.connect(f).connect(g).connect(p).connect(this.sfx);
      out = p;
      if (opts.delay !== false) when += d / 343;
      const send = ctx.createGain();
      send.gain.value = (opts.reverb ?? 0.35) * Math.min(1, 0.3 + d / 1500);
      p.connect(send).connect(this.revOutSend);
    } else {
      src.connect(g).connect(this.sfx);
    }
    if (this.interior && (opts.reverb ?? 0) > 0) { const s = ctx.createGain(); s.gain.value = opts.reverb!; out.connect(s).connect(this.revInSend); }
    src.start(when);
  }

  // Enemy round passing close to the listener: a zip panned to where the round is (rate-limited in Whizby.ts)
  whizby(pos: THREE.Vector3, gain: number) { this.whizbyFx?.play(pos, gain); }

  // Player's own guns: un-positioned, close, with the fuselage ringing around them
  playerGun(twin: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.028) return;
    this.lastShot = now;
    this.play('m2', null, { gain: twin ? 0.85 : 0.75, reverb: this.mode === 'bomber' ? 0.7 : 0 });
    if (Math.random() < 0.35) setTimeout(() => this.play('casing', null, { gain: 0.07, rate: 0.9 + Math.random() * 0.4, reverb: 0.3 }), 150 + Math.random() * 250);
  }

  // Shrapnel / rounds hitting our own aircraft
  playerImpact(heavy: boolean) {
    this.play(heavy ? 'hitHeavy' : 'hit', null, { gain: heavy ? 1.0 : 0.6, reverb: 0.6 });
  }

  rattle() { this.play('rattle', null, { gain: 0.7, reverb: 0.5 }); }

  duckFor(seconds: number, depth = 0.45) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(depth, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  radioStatic() { this.play('squelch', null, { gain: 0.25 }); }

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

  stopSpeech() { try { speechSynthesis.cancel(); } catch { /* ignore */ } this.radioBedOn(false); }
}

export const sound = new Sound();
