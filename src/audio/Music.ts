// Adaptive score.
//
// Recorded tracks (Kevin MacLeod, CC BY 4.0, see public/audio/CREDITS.md) carry the music:
//   menu     "For the Fallen"
//   tension  "Constance"       83 bpm  calm (muffled, quieter) and tension (open)
//   combat   "Clenched Teeth" 166 bpm  full combat
//   climax   "Heroic Age"     130 bpm  A minor: bosses, ON FIRE, the final wave pressing hard
// and procedural layers (MusicLayers.ts) build on top of them, tempo-locked to the playing
// track's beat grid: war drums from tension upwards, and over the climax low brass and a
// string ostinato that follow the track's bass root bar by bar.
//
// Everything is driven by one threat value (setThreat, see Threat.ts), smoothed (fast up,
// slow down) and turned into a mood with hysteresis and a minimum dwell, so the music
// does not flap. Track changes wait for the next bar line of the playing track: the new
// track enters on its downbeat (resuming where it was left if it played recently) while the
// old one fades over a bar or two; layer levels glide. Within the tension track, calm and
// tension are a filter/level change, not a switch.
//
// Loops play between loopStart and loopEnd from the manifest (the baked loops are padded
// with their own wrapped audio, so an AAC decoder that keeps the encoder priming still loops
// cleanly; the priming is detected from the decoded length and the beat grid shifted).
// Without any recorded track the old procedural score (D minor, intensity-driven) plays.
import { freeOnEnd } from './Safe';
import { LAYER_SR, brassBar, stringsBar, taikoBar, type TaikoPattern } from './MusicLayers';
import { CLIMAX } from './Threat';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Chord = number[]; // MIDI notes, root first
const Dm: Chord = [50, 53, 57], Bb: Chord = [46, 50, 53], Gm: Chord = [43, 50, 55], A: Chord = [45, 49, 52], C: Chord = [48, 52, 55], F: Chord = [41, 48, 53];

const MENU_PROG = [Dm, Bb, Gm, A];
const MISSION_PROG = [Dm, Dm, Bb, C, Dm, F, Gm, A];
// slow horn melody for the menu (one entry per beat, 0 = rest)
const MENU_MELODY = [69, 0, 65, 0, 62, 0, 0, 0, 67, 0, 65, 64, 69, 0, 0, 0, 74, 0, 72, 0, 70, 0, 69, 0, 67, 0, 65, 0, 64, 0, 0, 0];

export interface TrackMeta {
  gain?: number;
  loop?: boolean;
  bpm?: number;        // tempo of the beat grid (loops)
  bars?: number;       // loop length in bars
  loopStart?: number;  // s
  loopEnd?: number;    // s
  beat0?: number;      // first downbeat after loopStart, s
  frames?: number;     // length as encoded (sampleRate units): untrimmed priming shows as extra length
  sampleRate?: number;
  root?: number;       // key root, pitch class
  pitched?: boolean;   // drone / ostinato allowed
  roots?: number[];    // bass root per bar
}

interface Track {
  name: string; buf: AudioBuffer; meta: TrackMeta; gain: number; loop: boolean;
  ls: number; le: number;      // loop region in the decoded buffer
  spb: number;                 // seconds per beat (0: no grid)
  beat0: number;               // first downbeat, s after ls
  lastPos: number; lastAt: number; // where it was left (file s) and when (ctx s)
}

interface Bed { track: Track; src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; when: number; off: number; mood: Mood }

export type Mood = 'calm' | 'tension' | 'combat' | 'climax';
const MOOD_TRACK: Record<Mood, string[]> = {
  calm: ['tension', 'combat'], tension: ['tension', 'combat'], combat: ['combat', 'tension'], climax: ['climax', 'combat', 'tension'],
};
const UP: Record<Mood, number> = { calm: 0, tension: 0.18, combat: 0.45, climax: CLIMAX };
const DOWN: Record<Mood, number> = { calm: 0, tension: 0.1, combat: 0.3, climax: 0.68 };
const DWELL: Record<Mood, number> = { calm: 4, tension: 8, combat: 10, climax: 14 };
const ORDER: Mood[] = ['calm', 'tension', 'combat', 'climax'];
const RANK: Record<string, number> = { tension: 1, combat: 2, climax: 3 };
// Layer bus levels at full (1.0) layer level, set from the loudness report so that the full
// climax layers sit ~6 LU under the climax track: drums ~-30, brass ~-32, strings ~-34 LUFS
// against the track's ~-22 (tools/audio/loudness.mjs, "music layers").
export const LAYER_MIX = { drums: 0.13, brass: 0.095, strings: 0.16 };
const LOOKAHEAD = 0.3;
const RESUME_S = 120;  // a track left less than this long ago resumes where it was

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private layerBus!: GainNode;
  private layerGain!: Record<'drums' | 'brass' | 'strings', GainNode>;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private scene: 'menu' | 'mission' | 'none' = 'none';
  private intensity = 0;
  private smoothIntensity = 0;
  enabled = true;

  // threat -> mood
  private threat = 0;
  private threatAt = -1;       // performance time of the last setThreat (s)
  private intensityAt = -1;
  private smooth = 0;
  mood: Mood = 'calm';
  private moodAt = 0;
  private lastTick = 0;

  // Also called again on a fresh context when Sound rebuilds the engine: the scene, the
  // loaded tracks and the scheduler carry over, the clock-based state restarts.
  init(ctx: AudioContext, dest: AudioNode, reverb: AudioNode) {
    const again = !!this.ctx;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = again && this.enabled && this.scene !== 'none' ? (this.tracks.size ? 1 : this.scene === 'menu' ? 0.5 : 0.32) : 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.lastSwitch = -99;
    this.beds = []; this.lead = null; this.lastLayerAt = -1; this.moodAt = ctx.currentTime; this.lastTick = ctx.currentTime;
    for (const t of this.tracks.values()) t.lastAt = -Infinity;
    this.out.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.9;
    this.out.connect(send).connect(reverb);
    this.layerBus = ctx.createGain(); this.layerBus.connect(this.out);
    const lg = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.layerBus); return g; };
    this.layerGain = { drums: lg(), brass: lg(), strings: lg() };
    this.layerSet = { drums: 0, brass: 0, strings: 0 };
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---- recorded score ----
  private tracks = new Map<string, Track>();
  private beds: Bed[] = [];
  private lead: Bed | null = null;
  private lastSwitch = 0;
  private lastLayerAt = -1;
  private layerCache = new Map<string, AudioBuffer>();
  private layerSet = { drums: 0, brass: 0, strings: 0 };

  get hasTracks() { return this.tracks.size > 0; }
  get playing() { return this.lead?.track.name ?? null; }

  // A decoded track (any order, any time): the scheduler picks it up when the mood wants it
  addTrack(name: string, buf: AudioBuffer, meta: TrackMeta = {}) {
    const loop = meta.loop ?? (name !== 'victory' && name !== 'defeat');
    let ls = Math.max(0, meta.loopStart ?? 0), le = Math.min(buf.duration, meta.loopEnd ?? buf.duration);
    // untrimmed AAC priming (or MP3 decoder delay): the decoded buffer is longer than encoded
    if (meta.frames && meta.sampleRate) {
      const extra = buf.duration - meta.frames / meta.sampleRate;
      const delay = extra > 2000 / 44100 ? 2112 / meta.sampleRate : extra > 1000 / 44100 ? 1105 / meta.sampleRate : 0;
      if (delay > 0) { ls += delay; le = Math.min(buf.duration, le + delay); }
    }
    if (!(le - ls > 1)) { ls = 0; le = buf.duration; }
    const spb = meta.bpm && meta.bars ? (le - ls) / (meta.bars * 4) : 0;
    const first = !this.tracks.size;
    this.tracks.set(name, { name, buf, meta, gain: meta.gain ?? 0.6, loop, ls, le, spb, beat0: meta.beat0 ?? 0, lastPos: -1, lastAt: -Infinity });
    if (first && this.ctx) { this.out.gain.cancelScheduledValues(this.ctx.currentTime); this.out.gain.setTargetAtTime(this.enabled && this.scene !== 'none' ? 1 : 0, this.ctx.currentTime, 0.5); }
    this.prerender(name);
  }

  // Back-compat: a set of tracks at once
  useTracks(tracks: Record<string, AudioBuffer>, gains: Record<string, number>) {
    for (const [k, b] of Object.entries(tracks)) this.addTrack(k, b, { gain: gains[k] });
  }

  // ---- grid ----
  private filePos(b: Bed, t: number) {
    const T = b.track;
    let p = b.off + Math.max(0, t - b.when);
    if (T.loop && p >= T.le) p = T.ls + ((p - T.ls) % (T.le - T.ls));
    return p;
  }
  private barDur(T: Track) { return 4 * T.spb; }
  // first downbeat at or after t (beds always start on a downbeat)
  private nextDownbeat(b: Bed, t: number) {
    const T = b.track;
    if (!T.spb) return t;
    if (t <= b.when) return b.when;
    const bar = this.barDur(T);
    const ph = (((this.filePos(b, t) - T.ls - T.beat0) % bar) + bar) % bar;
    return ph < 1e-4 ? t : t + bar - ph;
  }
  private barIndex(b: Bed, t: number) {
    const T = b.track;
    const bar = this.barDur(T), bars = T.meta.bars ?? 1;
    const k = Math.floor((this.filePos(b, t + 1e-3) - T.ls - T.beat0) / bar);
    return ((k % bars) + bars) % bars;
  }
  private rootAt(b: Bed | null, t: number) {
    const T = b?.track;
    if (!T) return 2; // D, the procedural score's key
    const r = T.meta.roots;
    return r?.length && T.spb ? r[this.barIndex(b!, t) % r.length] : T.meta.root ?? 9;
  }

  // Start `name` at ctx time `at` (on its downbeat, or where it was left) and fade the others
  private startTrack(name: string, at: number, fadeIn: number, fadeOut: number) {
    const ctx = this.ctx!;
    const T = this.tracks.get(name);
    if (!T) return;
    for (const b of this.beds) {
      b.track.lastPos = this.filePos(b, at); b.track.lastAt = at;
      b.gain.gain.cancelScheduledValues(at);
      b.gain.gain.setTargetAtTime(0, at, Math.max(0.05, fadeOut / 3));
      try { b.src.stop(at + fadeOut * 2 + 0.5); } catch { /* already stopped */ }
    }
    let off = T.ls + (T.spb ? T.beat0 : 0);
    if (T.loop && T.spb && T.lastPos >= 0 && at - T.lastAt < RESUME_S) {
      // resume on the next bar line after where it was left
      const bar = this.barDur(T);
      const k = Math.ceil((T.lastPos - T.ls - T.beat0) / bar - 1e-3);
      off = T.ls + T.beat0 + k * bar;
      if (off >= T.le - 0.05) off = T.ls + T.beat0;
    }
    const src = ctx.createBufferSource();
    src.buffer = T.buf;
    src.loop = T.loop;
    if (T.loop) { src.loopStart = T.ls; src.loopEnd = T.le; }
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.5;
    filter.frequency.value = this.moodCutoff(name);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(T.gain * this.moodLevel(name), at + Math.max(0.02, fadeIn));
    src.connect(filter).connect(gain).connect(this.out);
    freeOnEnd(src, [filter, gain]);
    src.start(at, off);
    const bed: Bed = { track: T, src, gain, filter, when: at, off, mood: this.mood };
    src.addEventListener('ended', () => { this.beds = this.beds.filter((x) => x !== bed); if (this.lead === bed) this.lead = null; });
    this.beds.push(bed);
    this.lead = bed;
    this.lastSwitch = ctx.currentTime;
    // the new track's first bar gets its layers, unless that downbeat is already scheduled
    if (Math.abs(this.lastLayerAt - at) > 0.05) this.lastLayerAt = Math.min(this.lastLayerAt, at - 0.2);
  }

  // calm: the tension track muffled and lower
  private moodCutoff(name: string) { return name === 'tension' && this.mood === 'calm' ? 700 : 20000; }
  private moodLevel(name: string) { return name === 'tension' && this.mood === 'calm' ? 0.6 : 1; }

  private wantTrack(): string | null {
    if (this.scene === 'menu') return this.tracks.has('menu') ? 'menu' : null;
    for (const n of MOOD_TRACK[this.mood]) if (this.tracks.has(n)) return n;
    return [...this.tracks.keys()].find((k) => this.tracks.get(k)!.loop && k !== 'menu') ?? null;
  }

  private updateTracks() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (!this.enabled || this.scene === 'none') return;
    const cur = this.lead?.track.name;
    // a stinger plays out; the menu music comes back in under its last seconds
    if (this.lead && (cur === 'victory' || cur === 'defeat')) {
      const b = this.lead;
      if (this.scene !== 'menu' || now < b.when + (b.track.buf.duration - b.off) - 2.5) return;
    }
    const want = this.wantTrack();
    if (!want) return;
    if (cur === want) {
      // calm <-> tension inside the same track
      const b = this.lead!;
      if (b.mood !== this.mood && now >= b.when) {
        b.mood = this.mood;
        b.filter.frequency.setTargetAtTime(this.moodCutoff(want), now, 1.5);
        b.gain.gain.setTargetAtTime(b.track.gain * this.moodLevel(want), now, 1.5);
      }
      return;
    }
    if (this.lead && this.lastSwitch > now - 0.5) return; // a switch is already scheduled
    if (!this.lead || this.scene === 'menu' || !this.lead.track.spb) {
      this.startTrack(want, now + 0.08, this.scene === 'menu' ? 2.5 : 1.2, 2.5);
      return;
    }
    // on the next bar line: up = enter on the downbeat, the old track gone within a bar;
    // down = fade in over a bar while the old one fades over two
    const up = (RANK[want] ?? 0) > (RANK[this.lead.track.name] ?? 0);
    const at = this.nextDownbeat(this.lead, now + 0.12);
    const bar = this.barDur(this.lead.track);
    this.startTrack(want, at, up ? 0.03 : bar, up ? bar * 0.8 : bar * 2);
    if (up) this.hit(at);
  }

  setIntensity(x: number) { if (Number.isFinite(x)) { this.intensity = Math.min(1, Math.max(0, x)); this.intensityAt = performance.now() / 1000; } }

  // The game's threat value (0..1, Threat.ts), set every frame during a mission
  setThreat(x: number) {
    if (!Number.isFinite(x)) return;
    this.threat = Math.min(1, Math.max(0, x));
    this.threatAt = performance.now() / 1000;
  }

  private updateMood(dt: number) {
    const wall = performance.now() / 1000;
    // threat if the game sends it; the fighter-engine intensity otherwise; calm if both went stale (hangar)
    let raw = wall - this.threatAt < 2 ? this.threat : wall - this.intensityAt < 2 ? this.intensity * 0.8 : 0.08;
    if (this.scene !== 'mission') raw = 0;
    const tc = raw > this.smooth ? 0.9 : 4.5;
    this.smooth += (raw - this.smooth) * (1 - Math.exp(-dt / tc));
    this.smoothIntensity = this.smooth;
    const s = this.smooth, now = this.ctx!.currentTime;
    let i = ORDER.indexOf(this.mood);
    const was = this.mood;
    // up: as soon as the threshold is crossed (several steps at once if needed)
    while (i < 3 && s >= UP[ORDER[i + 1]]) i++;
    if (i > ORDER.indexOf(was)) this.mood = ORDER[i];
    // down: one step at a time, after the dwell
    else if (i > 0 && s < DOWN[ORDER[i]] && now - this.moodAt > DWELL[ORDER[i]]) this.mood = ORDER[i - 1];
    if (this.mood !== was) this.moodAt = now;
  }

  // Layer levels (gliding) for the mood and threat; pitched layers only over pitched tracks
  private layerLevels() {
    const s = this.smooth, m = this.mood;
    const lin = (a: number, b: number) => Math.min(1, Math.max(0, (s - a) / (b - a)));
    const pitched = !!this.lead?.track.meta.pitched && this.scene === 'mission';
    const drums = m === 'calm' ? 0 : m === 'tension' ? 0.6 + 0.4 * lin(0.18, 0.45) : m === 'combat' ? 0.5 + 0.35 * lin(0.45, CLIMAX) : 0.9;
    const brass = !pitched ? 0 : m === 'climax' ? 0.75 + 0.25 * lin(CLIMAX, 1) : m === 'combat' ? 0.45 * lin(0.55, CLIMAX) : 0;
    const strings = !pitched ? 0 : m === 'climax' ? 0.8 : m === 'combat' ? 0.5 * lin(0.65, CLIMAX) : 0;
    return { drums: this.scene === 'mission' ? drums : 0, brass, strings };
  }

  private updateLayers() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const lv = this.layerLevels();
    for (const k of ['drums', 'brass', 'strings'] as const) {
      const v = lv[k] * LAYER_MIX[k];
      if (Math.abs(v - this.layerSet[k]) < 0.002) continue;
      this.layerSet[k] = v;
      this.layerGain[k].gain.setTargetAtTime(v, now, 1.2);
    }
    const b = this.lead;
    if (!b || !b.track.spb || this.scene !== 'mission') return;
    const T = b.track;
    const at = this.nextDownbeat(b, now + 0.02);
    if (at > now + LOOKAHEAD || at <= this.lastLayerAt + 0.1) return;
    this.lastLayerAt = at;
    const bi = this.barIndex(b, at);
    const root = this.rootAt(b, at);
    const fifth = !!T.meta.pitched;
    if (lv.drums > 0.02) {
      const fill = (this.mood === 'climax' || this.smooth > 0.62) && bi % 4 === 3;
      const pat: TaikoPattern = this.mood === 'tension' ? 'heart' : fill ? 'fill' : 'drive';
      this.layerShot('drums', this.layer('taiko', T.spb, pat, 0, bi % 2), at);
    }
    if (lv.brass > 0.02) this.layerShot('brass', this.layer('brass', T.spb, root, fifth, 0), at);
    if (lv.strings > 0.02) this.layerShot('strings', this.layer('strings', T.spb, root, fifth, bi % 2), at);
  }

  private layerShot(bus: 'drums' | 'brass' | 'strings', buf: AudioBuffer | null, at: number) {
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.layerGain[bus]);
    src.onended = () => src.disconnect();
    src.start(at);
  }

  // Bar buffers, cached by kind / tempo / root / variant (rendered on first use or ahead, see prerender)
  private layer(kind: 'taiko' | 'brass' | 'strings', spb: number, a: TaikoPattern | number, fifth: boolean | number, variant: number): AudioBuffer | null {
    if (typeof AudioBuffer === 'undefined') return null;
    const key = `${kind}|${spb.toFixed(5)}|${a}|${fifth}|${variant}`;
    let buf = this.layerCache.get(key);
    if (buf) return buf;
    let d: Float32Array;
    try {
      d = kind === 'taiko' ? taikoBar(spb, a as TaikoPattern, 11 + variant)
        : kind === 'brass' ? brassBar(spb, a as number, !!fifth, 21 + variant)
          : stringsBar(spb, a as number, !!fifth, variant, 31 + variant);
    } catch { return null; }
    buf = new AudioBuffer({ length: d.length, numberOfChannels: 1, sampleRate: LAYER_SR });
    buf.copyToChannel(d as Float32Array<ArrayBuffer>, 0);
    this.layerCache.set(key, buf);
    return buf;
  }

  // Render a track's layer bars in idle slices once it has loaded, so no bar renders on a frame
  private prerender(name: string) {
    const T = this.tracks.get(name);
    if (!T?.spb || typeof window === 'undefined') return;
    const jobs: (() => void)[] = [];
    jobs.push(() => this.layer('taiko', T.spb, 'hit', 0, 0));
    for (const v of [0, 1]) for (const p of ['heart', 'drive', 'fill'] as TaikoPattern[]) jobs.push(() => this.layer('taiko', T.spb, p, 0, v));
    if (T.meta.pitched) {
      for (const r of new Set(T.meta.roots ?? [T.meta.root ?? 9])) {
        jobs.push(() => this.layer('brass', T.spb, r, true, 0));
        for (const v of [0, 1]) jobs.push(() => this.layer('strings', T.spb, r, true, v));
      }
    }
    const idle = (fn: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 30));
    const next = () => { const j = jobs.shift(); if (!j) return; j(); idle(next); };
    idle(next);
  }

  // One big drum on a transition downbeat
  private hit(at: number) {
    const T = this.lead?.track;
    if (!T?.spb) return;
    this.layerShot('drums', this.layer('taiko', T.spb, 'hit', 0, 0), at);
  }

  setScene(s: 'menu' | 'mission') {
    if (!this.ctx || s === this.scene) return;
    this.scene = s;
    this.beat = 0;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.enabled ? (this.tracks.size ? 1 : s === 'menu' ? 0.5 : 0.32) : 0, t, 1.0);
    if (s === 'mission') { this.mood = 'calm'; this.moodAt = t; this.smooth = 0; }
    if (this.tracks.size) { this.lastSwitch = -99; this.updateTracks(); }
    if (!this.timer) {
      this.nextTime = t + 0.1;
      this.lastTick = t;
      this.timer = window.setInterval(() => this.schedule(), 50);
    }
  }

  // Music switched back on in Settings: bring the current scene's music back up
  resume() {
    const s = this.scene;
    if (!this.ctx || s === 'none') return;
    this.scene = 'none';
    this.setScene(s);
  }

  stop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const b of this.beds) { b.track.lastPos = this.filePos(b, t); b.track.lastAt = t; b.gain.gain.setTargetAtTime(0, t, 0.4); try { b.src.stop(t + 2); } catch { /* */ } }
    this.beds = []; this.lead = null;
    this.out.gain.setTargetAtTime(0, t, 0.4);
  }

  stinger(win: boolean) {
    if (!this.ctx || !this.enabled) return;
    const name = win ? 'victory' : 'defeat';
    if (this.tracks.has(name)) {
      for (const k of ['drums', 'brass', 'strings'] as const) { this.layerGain[k].gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); this.layerSet[k] = 0; }
      this.startTrack(name, this.ctx.currentTime + 0.05, 0.6, 1.5);
      return;
    }
    const t = this.ctx.currentTime + 0.05;
    const chord = win ? [50, 54, 57, 62, 66] : [38, 45, 50, 53];
    for (const m of chord) this.pad(mtof(m), t, 4.5, 0.05, win ? 1600 : 700);
    this.timpani(win ? mtof(38) : mtof(33), t, 1.2);
    if (win) this.horn([62, 66, 69, 74], t + 0.4, 0.55);
  }

  // ON FIRE: a short rising swell over whatever is playing, in the key of the bar it lands
  // in (root, fifth and octave: no third, so it never fights the track's major/minor), kept
  // well under the score so it reads as a lift, not a cue. The threat (Threat.ts) also takes
  // the score up to the climax.
  swell() {
    if (!this.ctx || !this.enabled || this.scene !== 'mission') return;
    const t = this.ctx.currentTime + 0.03;
    const r = 48 + ((this.rootAt(this.lead, t) % 12) + 12) % 12; // root in C3..B3
    for (const m of [r - 12, r, r + 7, r + 12]) this.pad(mtof(m), t, 2.4, 0.026, 1500);
    this.timpani(mtof(r - 24), t, 0.55);
    this.timpani(mtof(r - 24), t + 0.16, 0.4);
    this.horn([r + 7, r + 12], t + 0.3, 0.32, 1.4);
  }

  private schedule() {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const dt = Math.min(2, Math.max(0, now - this.lastTick)); // (background tabs tick about once a second)
    this.lastTick = now;
    if (this.scene === 'none' || !this.enabled) { this.nextTime = now + 0.1; return; }
    this.updateMood(dt);
    if (this.tracks.size) {
      this.updateTracks();
      this.updateLayers();
      this.nextTime = now + 0.1;
      return;
    }
    const bpm = this.scene === 'menu' ? 64 : 96;
    const spb = 60 / bpm;
    while (this.nextTime < now + 0.25) {
      this.playBeat(this.nextTime, spb);
      this.nextTime += spb;
      this.beat++;
    }
  }

  // ----- procedural fallback score (no recorded tracks) -----
  private playBeat(t: number, spb: number) {
    const b = this.beat;
    const inBar = b % 4;
    if (this.scene === 'menu') {
      const chord = MENU_PROG[Math.floor(b / 4) % MENU_PROG.length];
      if (inBar === 0) {
        for (const m of chord) { this.pad(mtof(m), t, spb * 4.2, 0.035, 1100); this.pad(mtof(m + 12), t, spb * 4.2, 0.012, 1400); }
        this.bass(mtof(chord[0] - 12), t, spb * 4, 0.09);
        if (b % 16 === 0) this.timpani(mtof(38), t, 0.5);
      }
      const mel = MENU_MELODY[b % MENU_MELODY.length];
      if (mel && Math.floor(b / MENU_MELODY.length) % 2 === 1) this.horn([mel], t, 0.4, spb * 1.6);
      if (inBar === 3) this.snareRoll(t, spb, 0.05);
    } else {
      const I = this.smoothIntensity;
      const chord = MISSION_PROG[Math.floor(b / 4) % MISSION_PROG.length];
      if (inBar === 0) {
        for (const m of chord) this.pad(mtof(m), t, spb * 4.1, 0.022 + I * 0.02, 900 + I * 900);
        this.bass(mtof(chord[0] - 12), t, spb * 4, 0.07 + I * 0.05);
        if (I > 0.25) this.timpani(mtof(chord[0] - 12), t, 0.35 + I * 0.5);
      }
      // ostinato: driving eighths when fighters are near
      if (I > 0.15) {
        for (let k = 0; k < 2; k++) {
          const m = (k === 0 ? chord[0] : chord[2]) - 12;
          this.pluck(mtof(m), t + k * spb / 2, spb * 0.4, 0.05 * I);
        }
      }
      // military snare
      const snare = 0.05 + I * 0.16;
      if (inBar === 1 || inBar === 3) this.snare(t, snare);
      if (I > 0.5) { this.snare(t + spb * 0.75, snare * 0.5); if (inBar === 3) this.snareRoll(t + spb * 0.5, spb * 0.5, snare * 0.6); }
      if (I < 0.2 && inBar === 0 && b % 16 === 0) this.horn([chord[0] + 12, chord[1] + 12], t, 0.25, spb * 3);
    }
  }

  // ----- instruments -----
  private pad(freq: number, t: number, dur: number, gain: number, cutoff: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.setTargetAtTime(0, t + dur * 0.75, dur * 0.2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
    f.connect(g).connect(this.out);
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur * 1.6);
      freeOnEnd(o, [f, g]); // both stop together
    }
  }

  private bass(freq: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.3); g.gain.setTargetAtTime(0, t + dur * 0.8, 0.3);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 1.5); freeOnEnd(o, [g]);
  }

  private pluck(freq: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05); freeOnEnd(o, [f, g]);
  }

  private horn(notes: number[], t: number, gain: number, dur = 1.2) {
    const ctx = this.ctx!;
    for (const m of notes) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
      const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = 4;
      vib.connect(vg).connect(o.detune); vib.start(t); vib.stop(t + dur + 1);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1500, t + 0.25); f.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * gain * 3, t + 0.2); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.25);
      o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 1);
      freeOnEnd(o, [f, g, vib, vg]);
    }
  }

  private snare(t: number, gain: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 1 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + 0.2); freeOnEnd(s, [f, g]);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const og = ctx.createGain(); og.gain.setValueAtTime(gain * 0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.1); freeOnEnd(o, [og]);
  }

  private snareRoll(t: number, len: number, gain: number) {
    const n = 8;
    for (let i = 0; i < n; i++) this.snare(t + (i / n) * len, gain * (0.4 + 0.6 * i / n));
  }

  private timpani(freq: number, t: number, gain: number) {
    const ctx = this.ctx!;
    for (const [mul, a] of [[1, 1], [1.5, 0.35], [1.98, 0.2]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq * mul * 1.04, t); o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.15);
      const g = ctx.createGain(); g.gain.setValueAtTime(gain * a * 0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + 1.7); freeOnEnd(o, [g]);
    }
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 0.3); freeOnEnd(s, [f, g]);
  }
}
