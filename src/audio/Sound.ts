import * as THREE from 'three';

// Fully procedural audio (no sample files): synthesized gunfire, engines, flak,
// explosions and impacts, positioned in 3D with distance filtering and
// speed-of-sound delay for far events.
type BufName = 'm2' | 'm2far' | 'cannon' | 'mg131' | 'hit' | 'hitHeavy' | 'explosion' | 'flak' | 'crack' | 'casing' | 'click' | 'glass' | 'whoosh' | 'static';

function rand() { return Math.random() * 2 - 1; }

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private bufs = new Map<BufName, AudioBuffer>();
  private listenerPos = new THREE.Vector3();
  private interiorDrone: { gain: GainNode; filter: BiquadFilterNode; oscs: OscillatorNode[] } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private voices: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; pan: PannerNode; filter: BiquadFilterNode; owner: number }[] = [];
  private playerEngine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  volume = 0.8;
  radioEnabled = true;
  private lastShot = 0;
  private interior = 1; // 1 = inside the bomber (muffled outside sounds)

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    ctx.listener.positionX && (ctx.listener.positionX.value = 0);
    this.buildBuffers();
    this.startAmbience();
    for (let i = 0; i < 5; i++) this.voices.push(this.makeVoice());
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }

  private buf(len: number, fn: (t: number, i: number) => number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(len * ctx.sampleRate);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i / ctx.sampleRate, i);
    // normalise
    let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) for (let i = 0; i < n; i++) d[i] /= m;
    return b;
  }

  private buildBuffers() {
    let lp = 0, lp2 = 0, br = 0;
    // Browning M2 .50 cal: hard crack + chesty thump + mechanical clack
    this.bufs.set('m2', this.buf(0.32, (t) => {
      const n = rand();
      lp += (n - lp) * 0.35;
      const crack = n * Math.exp(-t * 90) * 0.9;
      const body = lp * Math.exp(-t * 22) * 1.2;
      const thump = Math.sin(2 * Math.PI * 62 * t * (1 - t * 1.5)) * Math.exp(-t * 18) * 1.4;
      const clack = Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-Math.max(0, t - 0.035) * 160) * (t > 0.035 ? 0.25 : 0);
      return crack + body + thump + clack;
    }));
    lp = 0;
    this.bufs.set('m2far', this.buf(0.35, (t) => {
      const n = rand(); lp += (n - lp) * 0.12; lp2 += (lp - lp2) * 0.2;
      return lp2 * Math.exp(-t * 14) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 16) * 0.6;
    }));
    lp = 0; lp2 = 0;
    this.bufs.set('cannon', this.buf(0.5, (t) => {
      const n = rand(); lp += (n - lp) * 0.25;
      return n * Math.exp(-t * 60) * 0.7 + lp * Math.exp(-t * 12) + Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 9) * 1.3;
    }));
    lp = 0;
    this.bufs.set('mg131', this.buf(0.2, (t) => {
      const n = rand(); lp += (n - lp) * 0.4;
      return n * Math.exp(-t * 110) * 0.8 + lp * Math.exp(-t * 30) + Math.sin(2 * Math.PI * 85 * t) * Math.exp(-t * 25) * 0.8;
    }));
    // Metal impact: inharmonic partials
    this.bufs.set('hit', this.buf(0.35, (t) => {
      const f = [612, 1377, 2213, 3301];
      let s = rand() * Math.exp(-t * 300) * 1.2;
      f.forEach((fr, k) => { s += Math.sin(2 * Math.PI * fr * t) * Math.exp(-t * (14 + k * 9)) * (0.6 / (k + 1)); });
      return s;
    }));
    lp = 0;
    this.bufs.set('hitHeavy', this.buf(0.7, (t) => {
      const n = rand(); lp += (n - lp) * 0.3;
      const f = [180, 437, 811, 1290];
      let s = lp * Math.exp(-t * 15) * 1.6 + n * Math.exp(-t * 80);
      f.forEach((fr, k) => { s += Math.sin(2 * Math.PI * fr * t) * Math.exp(-t * (8 + k * 6)) * (0.5 / (k + 1)); });
      return s;
    }));
    lp = 0; lp2 = 0; br = 0;
    this.bufs.set('explosion', this.buf(3.2, (t) => {
      const n = rand(); br = (br + 0.02 * n) / 1.02; lp += (n - lp) * (0.04 + 0.2 * Math.exp(-t * 3)); lp2 += (lp - lp2) * 0.3;
      const env = Math.min(1, t * 200) * Math.exp(-t * 1.6);
      return (lp2 * 1.6 + br * 3) * env + Math.sin(2 * Math.PI * 34 * t) * Math.exp(-t * 3) * 0.9;
    }));
    lp = 0; lp2 = 0;
    this.bufs.set('flak', this.buf(1.6, (t) => {
      const n = rand(); lp += (n - lp) * (0.05 + 0.3 * Math.exp(-t * 10)); lp2 += (lp - lp2) * 0.35;
      const env = Math.min(1, t * 400) * Math.exp(-t * 3.2);
      return lp2 * env * 1.8 + Math.sin(2 * Math.PI * 41 * t) * Math.exp(-t * 6) * 0.9;
    }));
    this.bufs.set('crack', this.buf(0.09, (t) => rand() * Math.exp(-t * 120) + Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t * 90) * 0.3));
    this.bufs.set('casing', this.buf(0.25, (t) => Math.sin(2 * Math.PI * 4100 * t) * Math.exp(-t * 30) * 0.6 + Math.sin(2 * Math.PI * 6230 * t) * Math.exp(-t * 45) * 0.4));
    this.bufs.set('click', this.buf(0.05, (t) => rand() * Math.exp(-t * 300)));
    this.bufs.set('glass', this.buf(0.9, (t) => {
      let s = rand() * Math.exp(-t * 25) * 0.7;
      for (let k = 0; k < 7; k++) s += Math.sin(2 * Math.PI * (2500 + k * 913) * t + k) * Math.exp(-t * (10 + k * 3)) * 0.15 * (Math.sin(t * 80 + k) > 0.3 ? 1 : 0.2);
      return s;
    }));
    lp = 0;
    this.bufs.set('whoosh', this.buf(1.4, (t) => {
      const n = rand(); lp += (n - lp) * 0.08;
      return lp * Math.sin(Math.PI * t / 1.4);
    }));
    this.bufs.set('static', this.buf(0.35, (t) => rand() * (0.5 + 0.5 * Math.sin(t * 300)) * Math.exp(-t * 6)));
  }

  private noiseLoop(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(seconds * ctx.sampleRate);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { // pink-ish
      const w = rand();
      b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
    }
    return b;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // Wind
    const ws = ctx.createBufferSource();
    ws.buffer = this.noiseLoop(4); ws.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700; wf.Q.value = 0.4;
    const wg = ctx.createGain(); wg.gain.value = 0.0;
    ws.connect(wf).connect(wg).connect(this.amb);
    ws.start();
    this.wind = { gain: wg, filter: wf };
    // B-17 interior drone: four Wright R-1820s slightly out of sync, beating against each other
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = 0.7;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const oscs: OscillatorNode[] = [];
    [57.2, 57.6, 56.9, 57.9].forEach((f, k) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.18;
      o.connect(og).connect(shaper);
      o.start(); oscs.push(o);
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 3.02 + k * 0.3;
      const og2 = ctx.createGain(); og2.gain.value = 0.05;
      o2.connect(og2).connect(shaper); o2.start(); oscs.push(o2);
    });
    const rumble = ctx.createBufferSource(); rumble.buffer = this.noiseLoop(3); rumble.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 140;
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    rumble.connect(rf).connect(rg).connect(shaper);
    rumble.start();
    shaper.connect(filter).connect(gain).connect(this.amb);
    this.interiorDrone = { gain, filter, oscs };
  }

  private makeVoice() {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 100;
    const osc2 = ctx.createOscillator(); osc2.type = 'square'; osc2.frequency.value = 50;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 60; pan.rolloffFactor = 1.1; pan.maxDistance = 10000;
    osc.connect(filter); osc2.connect(g2).connect(filter);
    filter.connect(gain).connect(pan).connect(this.sfx);
    osc.start(); osc2.start();
    return { osc, osc2, gain, pan, filter, owner: -1 };
  }

  // Interior (bomber) vs open cockpit/exterior mix
  setMode(mode: 'bomber' | 'fighter' | 'menu') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.interior = mode === 'bomber' ? 1 : 0;
    this.interiorDrone?.gain.gain.setTargetAtTime(mode === 'bomber' ? 0.55 : mode === 'menu' ? 0.18 : 0.0, t, 0.5);
    this.wind?.gain.gain.setTargetAtTime(mode === 'menu' ? 0.12 : mode === 'bomber' ? 0.22 : 0.18, t, 0.5);
    if (mode === 'fighter') this.ensurePlayerEngine();
    else if (this.playerEngine) this.playerEngine.gain.gain.setTargetAtTime(0, t, 0.3);
  }

  private ensurePlayerEngine() {
    const ctx = this.ctx!;
    if (!this.playerEngine) {
      // Packard Merlin V-1650: 12 cylinders, growling exhaust note
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth';
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 1.5;
      const gain = ctx.createGain(); gain.gain.value = 0;
      osc.connect(filter); osc2.connect(filter); filter.connect(gain).connect(this.amb);
      osc.start(); osc2.start();
      this.playerEngine = { osc, osc2, gain, filter };
    }
  }

  setPlayerEngine(throttle: number, speed: number) {
    if (!this.ctx || !this.playerEngine) return;
    const t = this.ctx.currentTime;
    const f = 70 + throttle * 45 + speed * 0.05;
    this.playerEngine.osc.frequency.setTargetAtTime(f, t, 0.1);
    this.playerEngine.osc2.frequency.setTargetAtTime(f * 0.502, t, 0.1);
    this.playerEngine.filter.frequency.setTargetAtTime(350 + throttle * 900, t, 0.1);
    this.playerEngine.gain.gain.setTargetAtTime(0.16 + throttle * 0.12, t, 0.1);
    this.wind?.gain.gain.setTargetAtTime(0.06 + speed / 900, t, 0.2);
    this.wind?.filter.frequency.setTargetAtTime(400 + speed * 6, t, 0.2);
  }

  setListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this.listenerPos);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
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

  // Engine voices for the nearest enemy/friendly fighters with doppler shift.
  updateFighterVoices(fighters: { id: number; pos: THREE.Vector3; vel: THREE.Vector3; radial: boolean; throttle: number }[]) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const L = this.listenerPos;
    const sorted = fighters
      .map((f) => ({ f, d: f.pos.distanceTo(L) }))
      .filter((x) => x.d < 3500)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.voices.length);
    const used = new Set<number>();
    for (const { f, d } of sorted) {
      let v = this.voices.find((vv) => vv.owner === f.id && !used.has(this.voices.indexOf(vv)));
      if (!v) v = this.voices.find((vv, i) => !used.has(i) && !sorted.some((s) => s.f.id === vv.owner)) ?? this.voices.find((_, i) => !used.has(i));
      if (!v) continue;
      used.add(this.voices.indexOf(v));
      v.owner = f.id;
      const toL = L.clone().sub(f.pos).normalize();
      const vr = f.vel.dot(toL); // approaching = positive
      const dop = 343 / Math.max(120, 343 - vr);
      const base = (f.radial ? 92 : 104) * (0.85 + f.throttle * 0.25);
      v.osc.frequency.setTargetAtTime(base * dop, t, 0.05);
      v.osc2.frequency.setTargetAtTime(base * 0.5 * dop, t, 0.05);
      v.filter.frequency.setTargetAtTime((this.interior ? 500 : 1100) * Math.max(0.35, Math.exp(-d / 2500)) + 150, t, 0.05);
      v.pan.positionX.setValueAtTime(f.pos.x, t); v.pan.positionY.setValueAtTime(f.pos.y, t); v.pan.positionZ.setValueAtTime(f.pos.z, t);
      v.gain.gain.setTargetAtTime(this.interior ? 0.33 : 0.45, t, 0.08);
    }
    this.voices.forEach((v, i) => { if (!used.has(i)) { v.gain.gain.setTargetAtTime(0, t, 0.2); v.owner = -1; } });
  }

  play(name: BufName, pos: THREE.Vector3 | null, opts: { gain?: number; rate?: number; delay?: boolean; ref?: number } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const b = this.bufs.get(name);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    let when = ctx.currentTime;
    if (pos) {
      const d = pos.distanceTo(this.listenerPos);
      if (d > 9000) return;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(180, 18000 * Math.exp(-d / 900)) * (this.interior ? 0.5 : 1);
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = opts.ref ?? 40; p.rolloffFactor = 1;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      src.connect(f).connect(g).connect(p).connect(this.sfx);
      if (opts.delay !== false) when += d / 343;
    } else {
      src.connect(g).connect(this.sfx);
    }
    src.start(when);
  }

  // Player's own gun: un-positioned, rate limited to avoid stacking
  playerGun(twin: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.03) return;
    this.lastShot = now;
    this.play('m2', null, { gain: twin ? 0.85 : 0.7 });
    if (Math.random() < 0.3) setTimeout(() => this.play('casing', null, { gain: 0.08, rate: 0.9 + Math.random() * 0.4 }), 120 + Math.random() * 200);
  }

  radioStatic() { this.play('static', null, { gain: 0.12 }); }

  speak(text: string, voiceIdx = 0) {
    if (!this.radioEnabled || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[—–]/g, ', '));
      const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
      const preferred = voices.filter((v) => /US|United States|Alex|Daniel|Fred|Male/i.test(v.name + v.lang));
      const pool = preferred.length ? preferred : voices;
      if (pool.length) u.voice = pool[voiceIdx % pool.length];
      u.rate = 1.08; u.pitch = 0.85 + (voiceIdx % 3) * 0.08; u.volume = 0.9 * this.volume;
      speechSynthesis.speak(u);
    } catch { /* speech unavailable */ }
  }

  stopSpeech() { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
}

export const sound = new Sound();
