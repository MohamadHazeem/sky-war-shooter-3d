import { DuckEnvelope, engineMask, skinDamage } from './Soundscape';
import { weatherNow } from '../render/WeatherState';
import * as THREE from 'three';
import { Music } from './Music';
import { AirframeCreaks } from './Creaks';
import { TurretDrive } from './TurretDrive';
import { Breathing } from './Breathing';
import { Whizby } from './Whizby';
import { Interphone } from './Interphone';
import { Budget, FREQ, GAIN, RATE, fin, freeOnEnd, ok, place, setP, towards } from './Safe';
import { DETAIL, ENGINE_SPECS, RateGate, airLowpass, aspect, blastDuck, blastMix, blastStages, cycloneMix, engineKindOf, engineRateTrim, soundDelay, thunderLowpass, type AudioDetail, type BlastSize, type DetailCaps, type EngineKind } from './Acoustics';
import { SYNTH3, type PCM, type Synth3Name } from './Synth3';
import { FIELD, FIELD_SHOTS, type FieldLoop, type FieldName } from './SynthField';
import { Cabin, WAIST_WINDOWS } from './Cabin';
import { FlakRumble, ListenerMotion, ROOMS, SPATIAL_DETAIL, compartmentOf, bomberRpm, doppler2, engineHarmonics, hrtfScore, isStation, occlusion, passBy, pickHrtf, rpmFor, type Compartment, type Occlusion, type SpatialCaps, type StationKey } from './Spatial2';
import { HarmonicBank, RoomChain, RumbleBed } from './SpatialNodes';
import { json, take } from '../core/Assets';
import { AUDIO_MANIFEST, P_LOOPS, P_MENU_MUSIC, P_MISSION_MUSIC, P_REST, P_SFX } from '../core/Preload';

// Recorded and procedural audio engine.
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
//
// Audio pass 3 (late-war content, see Synth3.ts / Acoustics.ts / Cabin.ts / BossDrone.ts):
// - every aircraft type has its own engine voice (World.fighterSoundInfo passes `type`): twin
//   Jumo 211 beat for the He 111 / Ju 88, twin DB 603 for the Me 410 / Bf 110, the Do 335's
//   push-pull pair (rear pusher buzz louder from behind), Me 262 roar + turbine whine (whine
//   louder from ahead), Me 163 rocket roar; the boss warships drone from several points
// - explosions are built by distance (crack + felt boom close, rolling thunder far, all delayed
//   by distance / 343 m/s), heavies and warships go up in stages, near blasts duck the music
// - weapons: BK 5 50 mm thump, MG 81Z rear-gunner rattle, ground flak (below)
// - the B-17 waist: wind roar at the open windows, a rattle bed while it jinks, the other waist
//   gunner's M2, brass on the floor pile, subtle oxygen breathing (Settings can switch it off)
// - Settings "Audio detail": Reduced trims voices, HRTF, engine voices and extra layers
//
// Sound names other systems can play: sound.play(name, worldPos | null, opts?)
//   'flak20'       a 20 mm Flak 38 firing on the ground (one call per round; far spam is gated)
//   'flak20burst'  a 20 mm flak shell bursting in the air
//   'flakTower'    a Flakturm 12.8 cm gun firing (one call per gun)
//   'flak'         a heavy (88 / 128 mm) shell burst; sound.flakBurst(pos) adds the close whump
//                  and shrapnel patter on the skin
//   'bk5'          the Me 410's 50 mm BK 5, 'mg81' a rear gunner's MG 81Z burst
// Each has sensible defaults (reference distance, reverb), so sound.play('flak20', pos) is enough.
//
// Airfield sounds of the take-off / landing scenes (SynthField.ts, built lazily from
// sound.prepareField(), which Bookends calls when a B-17 briefing opens): one-shots 'tyreChirp',
// 'gearThump', 'flarePop', 'bellyImpact'; loops on moving emitters (sound.emitter(), Field.ts):
// the flare's hiss, the belly scrape, the crash crews' bells; and the B-17's own outside engine
// voice (FighterSound type 'b17': four Cyclones, take-off roar and taxi idle cross-faded by throttle).
export type BufName =
  | 'm2' | 'm2far' | 'cannon' | 'mg131' | 'hit' | 'hitHeavy' | 'explosion' | 'explosionFar' | 'flak' | 'flakClose'
  | 'crack' | 'casing' | 'click' | 'glass' | 'whoosh' | 'static' | 'squelch' | 'rattle' | 'rocket' | 'debris' | 'beltTick'
  | 'm2thump' | 'm2mech' | 'm2inside' | 'skin'
  | 'bk5' | 'mg81' | 'flak20' | 'flak20burst' | 'flakTower'
  | 'blastCrack' | 'blastBoom' | 'thunder' | 'rumbleLong' | 'whump' | 'patter' | 'brassPile' | 'tear'
  | 'tyreChirp' | 'gearThump' | 'flarePop' | 'waterImpact' | 'bellyImpact';

// at: extra start delay (s); lp: low-pass cutoff override (Hz); size: explosion size (explosions only)
type ShotOpts = { gain?: number; rate?: number; delay?: boolean; ref?: number; reverb?: number; at?: number; lp?: number; size?: BlastSize };
export type PlayOpts = ShotOpts;

// Synthesised one-shots of pass 3 (built lazily): manifest-style level, and the defaults a bare
// sound.play(name, pos) gets
const SYNTH_GAIN: Partial<Record<BufName, number>> = {
  bk5: 1.0, mg81: 0.55, flak20: 0.75, flak20burst: 0.8, flakTower: 1.0, blastCrack: 0.9, blastBoom: 0.85, thunder: 1.0,
  rumbleLong: 1.0, whump: 0.9, patter: 0.5, brassPile: 1, tear: 0.9,
  tyreChirp: 0.8, gearThump: 0.9, flarePop: 0.8, bellyImpact: 1.0,
};
const NAME_DEFAULTS: Partial<Record<BufName, ShotOpts>> = {
  flak20: { ref: 90, reverb: 0.5 }, flak20burst: { ref: 60, reverb: 0.45 }, flakTower: { ref: 300, reverb: 0.9 },
  bk5: { ref: 260, reverb: 0.6 }, mg81: { ref: 60, reverb: 0.3 },
  tyreChirp: { ref: 25, reverb: 0.3 }, gearThump: { ref: 30, reverb: 0.3 }, flarePop: { ref: 20, reverb: 0.5 }, bellyImpact: { ref: 90, reverb: 0.6 },
};
// Until the lazy synthesis is done a new name borrows an old sound: [name, rate, gain]
const STAND_IN: Partial<Record<BufName, [BufName, number, number]>> = {
  bk5: ['cannon', 0.55, 2.2], mg81: ['mg131', 1.25, 0.8], flak20: ['cannon', 1.35, 0.6], flak20burst: ['flak', 1.7, 0.35], flakTower: ['flak', 0.6, 1.1],
  gearThump: ['hitHeavy', 0.7, 0.5], flarePop: ['crack', 1.5, 0.9], bellyImpact: ['hitHeavy', 0.55, 1.2],
  tear: ['hitHeavy', 0.6, 1.1],
};

const rand = () => Math.random() * 2 - 1;
// Voice budget: concurrent one-shots. Low priority (far) drops at MAX_VOICES, close/big
// ones get some headroom, the player's guns and UI never drop.
const MAX_VOICES = DETAIL.normal.voices;
const MAX_HRTF = DETAIL.normal.hrtf;   // concurrent HRTF one-shots, the rest pan equal-power
// Far (> FAR m) spammy sounds: at most one per name per gap (seconds)
const FAR = 300;
const FAR_GAP: Partial<Record<BufName, number>> = {
  m2far: 0.06, mg131: 0.05, cannon: 0.07, hit: 0.03, crack: 0.06, flak: 0.1, debris: 0.3,
  mg81: 0.06, flak20: 0.07, flak20burst: 0.08, flakTower: 0.2, bk5: 0.2, whump: 0.15, thunder: 0.25,
};
const BIG = new Set<BufName>(['explosion', 'flakClose', 'hitHeavy', 'rocket', 'whoosh', 'bk5', 'flakTower', 'blastBoom', 'blastCrack', 'thunder', 'rumbleLong', 'whump', 'bellyImpact']);
const ZERO3 = new Float32Array(3);
const CYCLONE_TRIM = [1.0, 1.004, 0.9965, 1.0075];   // the four Cyclones slightly off-speed (they beat)
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
// Sounds with a single recording rotate through these pitch offsets (cents) instead of
// repeating identically; multi-variant sounds rotate through a shuffle bag (no immediate repeat).
const ROTATE_CENTS = [0, 70, -55, 120, -110, 35, -30];

// Master bus: glue compressor -> peak limiter -> soft clipper. The limiter holds stacked
// explosions near -1.5 dBFS; the clipper rounds off the few transients that get through
// the limiter's 6 ms look-ahead instead of letting them hard-clip (see limiterCheck()).
export const MASTER = {
  trim: 0.82,
  glue: { threshold: -14, knee: 10, ratio: 4, attack: 0.003, release: 0.25 },
  limiter: { threshold: -3, knee: 1, ratio: 20, attack: 0.001, release: 0.12 },
};
const SOFT_CLIP = (() => {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28));
  }
  return c;
})();
// Build the master chain on any context (live, or offline for limiterCheck); returns [input, output]
export function masterChain(ctx: BaseAudioContext, opts = MASTER): [AudioNode, AudioNode] {
  const trim = ctx.createGain(); trim.gain.value = opts.trim;
  const comp = (o: typeof MASTER.glue) => {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = o.threshold; c.knee.value = o.knee; c.ratio.value = o.ratio; c.attack.value = o.attack; c.release.value = o.release;
    return c;
  };
  const clip = ctx.createWaveShaper(); clip.curve = SOFT_CLIP as Float32Array<ArrayBuffer>; clip.oversample = '2x';
  trim.connect(comp(opts.glue)).connect(comp(opts.limiter)).connect(clip);
  return [trim, clip];
}

// One-pole filter helpers for offline synthesis
class LP { y = 0; constructor(public a: number) {} run(x: number) { this.y += (x - this.y) * this.a; return this.y; } }
class HP { y = 0; x1 = 0; constructor(public a: number) {} run(x: number) { const y = this.a * (this.y + x - this.x1); this.x1 = x; this.y = y; return y; } }

interface Voice {
  src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: PannerNode;
  whoosh: AudioBufferSourceNode; whooshGain: GainNode; whooshFilter: BiquadFilterNode;
  owner: number; radial: boolean; freeAt: number;
  dmg: GainNode; stage: number; nextPop: number; // damaged engine: misfire dips (DamageStages stage)
  kind: EngineKind; buf: AudioBuffer | null;     // engine voice and the loop it plays
  aux: AudioBufferSourceNode | null; auxGain: GainNode; auxBuf: AudioBuffer | null; // second loop (push-pull rear, jet whine)
  mainGain: GainNode;                            // level of the main loop alone (the B-17 voice cross-fades its two loops)
}

// Engine voice info per fighter (World.fighterSoundInfo); stage: DamageStages 0..4;
// type: EnemyType for axis aircraft, else the model kind (picks the engine voice, Acoustics.engineKindOf)
export interface FighterSound { id: number; pos: THREE.Vector3; vel: THREE.Vector3; radial: boolean; throttle: number; stage?: number; type?: string }

// A looping sound on a moving point (sound.emitter()): update it every frame (position, velocity for
// the Doppler shift, level, playback rate, optional low-pass); stop() fades it out and frees it. An
// emitter not updated for 1.5 s stops by itself, and one from a replaced AudioContext reports !alive.
export interface LoopEmitter {
  readonly alive: boolean;
  update(pos: THREE.Vector3, vel: THREE.Vector3 | null, gain: number, rate?: number, lp?: number): void;
  stop(fade?: number): void;
}
export interface EmitterOpts { ref?: number; reverb?: number; variant?: number }

class Emitter implements LoopEmitter {
  alive = true;
  last: number;
  private src: AudioBufferSourceNode; private f: BiquadFilterNode; private g: GainNode; private p: PannerNode; private send: GainNode;
  private to = new THREE.Vector3();
  constructor(private ctx: AudioContext, buf: AudioBuffer, out: AudioNode, revBus: AudioNode, private host: { listener: THREE.Vector3; motion: ListenerMotion; interior: () => boolean }, private rev: number, ref: number) {
    const t = ctx.currentTime;
    this.last = t;
    this.src = ctx.createBufferSource(); this.src.buffer = buf; this.src.loop = true;
    this.f = ctx.createBiquadFilter(); this.f.type = 'lowpass'; this.f.frequency.value = 12000;
    this.g = ctx.createGain(); this.g.gain.value = 0;
    this.p = ctx.createPanner();
    this.p.panningModel = 'equalpower'; this.p.distanceModel = 'inverse'; this.p.refDistance = fin(ref, 30, [0.1, 1e4]); this.p.rolloffFactor = 1; this.p.maxDistance = 10000;
    this.send = ctx.createGain(); this.send.gain.value = 0;
    this.src.connect(this.f).connect(this.g).connect(this.p).connect(out);
    this.p.connect(this.send).connect(revBus);
    this.src.start(t, Math.random() * buf.duration);
  }
  update(pos: THREE.Vector3, vel: THREE.Vector3 | null, gain: number, rate = 1, lp = 18000) {
    if (!this.alive) return;
    if (this.ctx.state === 'closed') { this.alive = false; return; }
    const t = this.ctx.currentTime;
    this.last = t;
    const to = this.to.copy(this.host.listener).sub(pos), d = Math.max(0.5, to.length());
    if (!ok(d)) return;
    const vr = vel ? fin(vel.dot(to) / d, 0, [-2000, 2000]) : 0;   // approaching = positive
    const m = this.host.motion, vl = -(m.vx * to.x + m.vy * to.y + m.vz * to.z) / d;   // listener closing on it
    towards(this.src.playbackRate, rate * doppler2(vr, vl), RATE, t, 0.04);
    towards(this.g.gain, gain, GAIN, t, 0.06);
    towards(this.f.frequency, Math.min(lp, airLowpass(d, this.host.interior())), FREQ, t, 0.05);
    place(this.p, pos.x, pos.y, pos.z, t);
    towards(this.send.gain, this.rev * Math.min(1, 0.3 + d / 1500), GAIN, t, 0.1);
  }
  stop(fade = 0.4) {
    if (!this.alive) return;
    this.alive = false;
    if (this.ctx.state === 'closed') return;
    const t = this.ctx.currentTime;
    freeOnEnd(this.src, [this.f, this.g, this.p, this.send]);
    try {
      this.g.gain.cancelScheduledValues(t);
      this.g.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 4));
      this.src.stop(t + Math.max(0.02, fade) + 0.05);
    } catch { /* already stopped */ }
  }
}

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;      // sfx slider: effects and their reverb tails
  private crewVoice!: GainNode;
  private fx!: GainNode;       // effects, ducked under the crew voices so they stay intelligible
  private ducks = new DuckEnvelope();
  private recorded = new Set<BufName>();
  private engineGains: GainNode[] = [];
  private liveEngineMask = 15;
  private cabinDamage = 0;
  private holeBuf: AudioBuffer | null = null;
  private breathBuf: AudioBuffer | null = null;
  private turretBuf: AudioBuffer | null = null;
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
  private rainGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  samplesLoaded = false;
  private engineBufs: Record<'cyclone' | 'bmw' | 'merlin', AudioBuffer> = {} as any;
  private listenerPos = new THREE.Vector3();
  private b17: { gain: GainNode; filter: BiquadFilterNode; srcs: AudioBufferSourceNode[] } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode; flutter: GainNode } | null = null;
  // Gust stage (see updateWind): its own level and filter, so it never fights the per-frame wind setters
  private gust: { gain: GainNode; filter: BiquadFilterNode; walkG: number; walkF: number } | null = null;
  bombBayOpen = false;
  private windSpeed = 0;   // player airspeed (m/s), scales gust strength in the fighter
  private whistle: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private maneuver = 0;    // 0..1 evasive jink / hard manoeuvre (setManeuver)
  private windCut = 800;   // base wind-filter cutoff that the gust filter is relative to
  private voices: Voice[] = [];
  private playerEngine: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; dmg?: GainNode; nextPop: number } | null = null;
  private radioBed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private interphone: Interphone | null = null;
  readonly music = new Music();
  private creaks: AirframeCreaks | null = null;
  private breathing: Breathing | null = null;
  private turretDrive: TurretDrive | null = null;
  setTurretTraverse(speed: number) { this.turretDrive?.update(this.mode === 'bomber' ? speed : 0); }
  private whizbyFx: Whizby | null = null;
  volume = 0.8;
  // Per-bus levels (0..1) from the Settings sliders
  musicVolume = 1;
  sfxVolume = 1;
  voiceVolume = 1;
  ambVolume = 1;
  radioEnabled = true;
  musicEnabled = true;
  private lastShot = 0;
  private interior = 1;
  private mode: 'bomber' | 'fighter' | 'ground' | 'menu' = 'menu';
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
  // Audio pass 3
  detail: AudioDetail = 'normal';
  private caps: DetailCaps = DETAIL.normal;
  breathingEnabled = true;
  private cabin: Cabin | null = null;
  private synth3 = new Map<Synth3Name, AudioBuffer[]>();  // lazily synthesised (Synth3.ts), kept across rebuilds
  private synthSteps: (() => void)[] | null = null;        // pending lazy build steps (null: not started)
  private fieldBufs = new Map<FieldName, AudioBuffer[]>();  // airfield sounds (SynthField.ts), lazily, kept across rebuilds
  private fieldSteps: (() => void)[] | null = null;
  private emitters: Emitter[] = [];
  private patterGate = new RateGate(0.25);
  private crewGate = new RateGate(1 / 13);
  private brassGate = new RateGate(0.045);
  // Dev meter (sws.sound.stats()): one-shots played / refused by priority, peaks, render load
  // Spatial audio 2.0 (Spatial2.ts / SpatialNodes.ts)
  private spatial: SpatialCaps = SPATIAL_DETAIL.normal;
  private motion = new ListenerMotion();
  private station: StationKey | null = null;  // the gunner's station while the camera is in the cabin
  private occlOn = false;                     // listener at that station: occlusion by the fuselage applies
  private bomberInvQ = new THREE.Quaternion();
  private occ: Occlusion = { gain: 1, lp: 1 };
  private flakRumble = new FlakRumble();
  private rumbleBed: RumbleBed | null = null;
  private roomChain: RoomChain | null = null;
  private roomIRs = new Map<Compartment, AudioBuffer>();
  private bomberHarm: HarmonicBank | null = null;
  private playerHarm: HarmonicBank | null = null;
  private hf = new Float32Array(3);
  private hg = new Float32Array(3);
  private rpmWander = 0;
  private hrtfScores = new Float32Array(8);
  private hrtfWas = new Uint8Array(8);
  private hrtfOn = new Uint8Array(8);
  private pb = { tca: 0, miss: 0 };
  private meter = { played: 0, dropped: [0, 0, 0], peakIn: 0, peakOut: 0, nonFinite: 0, rc: null as null | { avg: number; peak: number; underrun: number; n: number } };
  private preScope: AnalyserNode | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'closed') this.rebuild('context closed', true);
      else this.ctx.resume().catch(() => {});
      return;
    }
    this.build();
    this.arm();
    // pass-3 voices are synthesised lazily: when the first mission starts, or after a while in the menus
    setTimeout(() => this.startSynth3(), 25000);
  }

  // Graph construction. Decoded buffers (synthesized or recorded) are kept across a
  // rebuild: AudioBuffers are not tied to a context.
  private build() {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.track(ctx);
    const [chainIn, chainOut] = masterChain(ctx);
    this.master = ctx.createGain();
    setP(this.master.gain, this.volume, GAIN);
    this.master.connect(chainIn);
    chainOut.connect(ctx.destination);
    // scope on the final output: the watchdog checks it for NaN / dead output
    this.scope = ctx.createAnalyser(); this.scope.fftSize = this.scopeBuf.length;
    chainOut.connect(this.scope);
    // pre-limiter tap for the dev meter (how hard the limiter is pushed)
    this.preScope = ctx.createAnalyser(); this.preScope.fftSize = this.scopeBuf.length;
    this.master.connect(this.preScope);
    this.ducks.clear();
    // ducking bus for radio/explosions (music + ambience go through it)
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVolume; this.sfx.connect(this.master);
    this.crewVoice = ctx.createGain(); this.crewVoice.gain.value = this.voiceVolume; this.crewVoice.connect(this.master);
    this.fx = ctx.createGain(); this.fx.connect(this.sfx);
    this.interphone = new Interphone(ctx, this.crewVoice);
    this.amb = ctx.createGain(); this.amb.gain.value = this.ambVolume * this.sfxVolume; this.amb.connect(this.duck);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume; this.musicBus.connect(this.duck);
    this.musicWet = ctx.createGain(); this.musicWet.gain.value = this.musicVolume;
    // Reverbs
    this.revIn = ctx.createConvolver(); this.revIn.buffer = this.impulse(0.75, 6.5, true);
    this.revOut = ctx.createConvolver(); this.revOut.buffer = this.impulse(3.8, 1.4, false);
    this.revInSend = ctx.createGain(); this.revInSend.gain.value = 0.55;
    this.revOutSend = ctx.createGain(); this.revOutSend.gain.value = 0.5;
    this.roomChain = new RoomChain(ctx, this.revIn);
    this.revInSend.connect(this.roomChain.input);
    this.revIn.connect(this.fx);
    this.rumbleBed = new RumbleBed(ctx, this.noiseLoop(6, 'brown'), this.amb);
    this.revOutSend.connect(this.revOut).connect(this.fx);
    this.creaks = new AirframeCreaks(ctx, this.amb, this.revInSend);
    this.cabin = new Cabin(ctx, this.amb, this.revInSend, this.caps.hrtf > 2);
    this.cabin.setBuffers(this.synth3.get('windowRoar')?.[0] ?? null, this.synth3.get('rattleBed')?.[0] ?? null);
    const musicReverb = ctx.createConvolver(); musicReverb.buffer = this.revOut.buffer;
    this.musicWet.connect(musicReverb).connect(this.duck);
    const first = !this.bufs.size;
    if (first) this.buildBuffers();
    this.startAmbience();
    this.breathing = new Breathing(ctx, this.amb);
    this.turretDrive = new TurretDrive(ctx, this.amb);
    this.applyInteriorBuffers();
    for (let i = 0; i < 6; i++) this.voices.push(this.makeVoice());
    this.whizbyFx = new Whizby(ctx, this.fx, (when, dur) => this.room(when, dur, 1), (when, dur) => this.hrtfShots.take(ctx.currentTime, when, dur));
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
    this.turretDrive?.dispose(); this.turretDrive = null;
    this.creaks?.setActive(false); this.creaks = null;
    this.cabin?.stopSources(); this.cabin = null;
    this.preScope = null;
    this.interphone?.cancel(); this.interphone = null;
    this.whizbyFx = null;
    this.voices = [];
    this.b17 = null; this.wind = null; this.gust = null; this.windSrc = null; this.rainGain = null; this.whistle = null;
    this.playerEngine = null; this.radioBed = null;
    this.bomberHarm = null; this.playerHarm = null; this.rumbleBed = null; this.roomChain = null;
    this.flakRumble.reset(); this.motion.reset(); this.hrtfWas.fill(0);
    this.b17Sputter = null; this.b17Depth = null; this.b17Sampled = false;
    this.scope = null;
    this.oneShots.clear(); this.hrtfShots.clear(); this.lastFar.clear();
    for (const e of this.emitters) e.alive = false;   // their nodes go with the old context
    this.emitters = [];
    this.lastShot = 0; // audio clocks restart at 0 on the new context
    this.patterGate = new RateGate(0.25); this.crewGate = new RateGate(1 / 13); this.brassGate = new RateGate(0.045);
  }

  // Voice budget gate for a one-shot starting at `when` (prio 2 always passes)
  private room(when: number, dur: number, prio: number) {
    const got = this.oneShots.take(this.ctx!.currentTime, when, dur, prio > 1 ? Infinity : prio ? 16 : 0);
    if (got) this.meter.played++; else this.meter.dropped[Math.max(0, Math.min(2, prio))]++;
    return got;
  }

  setVolume(v: number) { if (!ok(v)) return; this.volume = v; if (this.master) setP(this.master.gain, v, GAIN); }
  // Sound-effects bus, for one-off synthesized cues that should follow the volume setting
  // (ducked while the crew talks)
  sfxBus(): GainNode | null { return this.ctx ? this.fx : null; }
  // Independent crew voice slider, never ducked (Voice.ts)
  voiceBus(): GainNode | null { return this.ctx ? this.crewVoice : null; }
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
  setVoiceVolume(v: number) { this.voiceVolume = clamp01(v); this.setBus(this.crewVoice, this.voiceVolume); }
  setSfxVolume(v: number) { this.sfxVolume = clamp01(v); this.setBus(this.sfx, this.sfxVolume); this.setBus(this.amb, this.ambVolume * this.sfxVolume); }
  setAmbVolume(v: number) { this.ambVolume = clamp01(v); this.setBus(this.amb, this.ambVolume * this.sfxVolume); }

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

  // ---------------- pass 3: lazy synthesis (Synth3.ts) ----------------
  // One buffer per idle slice (each 2-35 ms), engines first; nothing is downloaded. Until a
  // sound is built its callers get a stand-in (STAND_IN, the old engine loops, or nothing).
  private startSynth3() {
    if (this.synthSteps) return;
    this.synthSteps = this.lazyBuild(SYNTH3, (name, arr) => this.synthDone(name, arr));
  }

  // Airfield sounds of the take-off / landing scenes (SynthField.ts): Bookends calls this when a
  // B-17 briefing opens (and again when a scene starts); engines first. Needs a live context.
  prepareField() {
    if (this.fieldSteps || !this.ctx) return;
    this.fieldSteps = this.lazyBuild(FIELD, (name, arr) => {
      this.fieldBufs.set(name, arr);
      if ((FIELD_SHOTS as readonly string[]).includes(name)) { const bn = name as BufName; this.bufs.set(bn, arr); this.gainMap.set(bn, SYNTH_GAIN[bn] ?? 1); }
    });
  }

  // Queue one build step per variant of a catalogue and run them one per idle slice
  private lazyBuild<N extends string>(cat: Readonly<Record<N, { readonly variants: number; readonly seed: number; readonly make: (seed: number) => PCM }>>, done: (name: N, arr: AudioBuffer[]) => void): (() => void)[] {
    const steps: (() => void)[] = [];
    for (const name of Object.keys(cat) as N[]) {
      const def = cat[name];
      const arr: AudioBuffer[] = [];
      for (let i = 0; i < def.variants; i++) steps.push(() => {
        const b = this.toBuffer(def.make(def.seed + i));
        if (b) arr.push(b);
        if (i === def.variants - 1 && arr.length) done(name, arr);
      });
    }
    const idle = (fn: () => void) => (typeof window !== 'undefined' && window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 30));
    const next = () => {
      const f = steps.shift();
      if (!f) return;
      try { f(); } catch (e) { console.warn('Audio: lazy synthesis step failed', e); }
      idle(next);
    };
    idle(next);
    return steps;
  }

  /** A built airfield buffer (variant n, or a random one), or null while it is not synthesised yet. */
  fieldBuffer(name: FieldName, variant = -1): AudioBuffer | null {
    const arr = this.fieldBufs.get(name);
    if (!arr?.length) return null;
    return arr[variant >= 0 ? variant % arr.length : Math.floor(Math.random() * arr.length)];
  }

  // A looping buffer on a moving point (see LoopEmitter). Null without a live context or buffer, so
  // callers simply retry on a later frame (the lazy synthesis may finish meanwhile).
  emitter(name: FieldLoop, opts: EmitterOpts = {}): LoopEmitter | null {
    const ctx = this.ctx, buf = this.fieldBuffer(name, opts.variant ?? -1);
    if (!ctx || !buf || ctx.state === 'closed') return null;
    try {
      const e = new Emitter(ctx, buf, this.fx, this.revOutSend, { listener: this.listenerPos, motion: this.motion, interior: () => !!this.interior }, opts.reverb ?? 0.35, opts.ref ?? 30);
      this.emitters.push(e);
      return e;
    } catch { return null; }
  }

  // Stop emitters nobody updates any more (a caller that forgot, or went away mid-scene)
  private reapEmitters(t: number) {
    if (!this.emitters.length) return;
    for (const e of this.emitters) if (e.alive && t - e.last > 1.5) e.stop(0.3);
    this.emitters = this.emitters.filter((e) => e.alive);
  }

  private toBuffer(p: PCM): AudioBuffer | null {
    try {
      const n = p.ch[0].length;
      const b = this.ctx ? this.ctx.createBuffer(p.ch.length, n, p.sr) : new AudioBuffer({ length: n, numberOfChannels: p.ch.length, sampleRate: p.sr });
      p.ch.forEach((d, c) => b.getChannelData(c).set(d));
      return b;
    } catch { return null; }
  }

  private synthDone(name: Synth3Name, arr: AudioBuffer[]) {
    this.synth3.set(name, arr);
    if (name === 'windowRoar' || name === 'rattleBed') { this.cabin?.setBuffers(name === 'windowRoar' ? arr[0] : null, name === 'rattleBed' ? arr[0] : null); return; }
    if (name.startsWith('eng_')) return;          // engine voices pick it up on their next update
    const bn = name as BufName;
    if (this.recorded.has(bn)) return;
    this.bufs.set(bn, arr);
    this.gainMap.set(bn, SYNTH_GAIN[bn] ?? 1);
  }

  // Run the whole lazy synthesis now (tests, measurements)
  synthAll() {
    this.startSynth3(); this.prepareField();
    for (const st of [this.synthSteps, this.fieldSteps]) if (st) while (st.length) st.shift()!();
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
    // per-file level trims (dB) from the loudness tool, so all variants of a sound sit level.
    // Decodes are shared between names, so a trimmed buffer is a scaled copy.
    const trimmed = (b: AudioBuffer | null, db?: number) => {
      if (!b || !db || !ok(db) || !this.ctx) return b;
      const k = Math.pow(10, Math.max(-12, Math.min(12, db)) / 20);
      const c = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
      for (let ch = 0; ch < b.numberOfChannels; ch++) { const s = b.getChannelData(ch), d = c.getChannelData(ch); for (let j = 0; j < s.length; j++) d[j] = s[j] * k; }
      return c;
    };
    const SFX: [BufName, string, number][] = [
      ['m2', 'mg50_shot', 1], ['m2far', 'mg50_burst_far', 1], ['cannon', 'cannon_shot', 1], ['mg131', 'mg50_shot', 0.7],
      ['hit', 'impact_metal', 1], ['hitHeavy', 'impact_heavy', 1], ['explosion', 'explosion_air', 1], ['explosionFar', 'explosion_far', 1],
      ['flak', 'flak_far', 1], ['flakClose', 'flak_near', 1.2], ['rattle', 'shrapnel_rattle', 1], ['casing', 'casing', 1],
      ['glass', 'glass_crack', 1], ['rocket', 'rocket_launch', 1], ['click', 'ui_click', 1], ['squelch', 'radio_squelch_on', 1],
      ['debris', 'shrapnel_rattle', 0.8], ['whoosh', 'flyby', 1],
      ['m2inside', 'm2_interior', 1], ['skin', 'skin', 1], ['m2mech', 'receiver', 1], ['patter', 'skin_patter', 1],
    ];
    const sfx = SFX.map(async ([name, key, g]) => {
      const e = man.sfx?.[key];
      if (!e) return;
      const files: string[] = e.files ?? (e.file ? [e.file] : []);
      const bufs = (await Promise.all(files.map(async (f, i) => trimmed(await decode(f, P_SFX), e.trim?.[i])))).filter((b): b is AudioBuffer => !!b);
      if (bufs.length) { this.bufs.set(name, bufs); this.recorded.add(name); this.gainMap.set(name, (e.gain ?? 1) * g); if (name === 'whoosh') this.flybyPeak = e.peakAt ?? 0; }
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
        if (radial?.buf) { this.engineBufs.bmw = radial.buf; this.voiceGain = radial.gain; this.radialRate = 2.2; for (const v of this.voices) if (v.kind === 'bmw') { this.reseat(v, radial.buf); v.buf = radial.buf; } }
      }),
      loop('merlin', P_LOOPS).then((merlin) => {
        if (merlin?.buf) { this.engineBufs.merlin = merlin.buf; this.merlinGain = merlin.gain; if (this.playerEngine) { this.playerEngine.src.stop(); this.playerEngine.src.disconnect(); this.playerEngine.src = this.loopSrc(merlin.buf); this.playerEngine.src.connect(this.playerEngine.filter); } }
      }),
      loop('holes', P_LOOPS).then((b) => { if (b?.buf) { this.holeBuf = b.buf; this.applyInteriorBuffers(); } }),
      loop('breath', P_LOOPS).then((b) => { if (b?.buf) { this.breathBuf = b.buf; this.applyInteriorBuffers(); } }),
      loop('turret', P_LOOPS).then((b) => { if (b?.buf) { this.turretBuf = b.buf; this.applyInteriorBuffers(); } }),
      loop('radio_static', P_REST).then((radio) => { if (radio?.buf) this.radioStaticBuf = radio.buf; }),
    ];
    await Promise.all([...sfx, ...confirms, ...loops]);
    this.samplesLoaded = true;
    console.info('Audio: recorded samples loaded');
    if (man.music) void this.loadMusic(man.music, (f) => decode(f, P_MENU_MUSIC));
  }

  // Music streams in after the effects, one track at a time (the score uses each as soon as
  // it is decoded): menu first, then the mission tracks and stingers; the large extras
  // (the climax) only once a mission starts, or after a minute in the menus.
  private async loadMusic(entries: Record<string, any>, decode: (f: string) => Promise<AudioBuffer | null>) {
    const first = ['menu', 'tension', 'combat', 'victory', 'defeat'];
    const load = async (k: string) => {
      const e = entries[k];
      if (!e?.file) return;
      const b = await decode(e.file);
      if (b) this.music.addTrack(k, b, e);
    };
    for (const k of first) await load(k);
    await new Promise<void>((res) => { if (this.mode !== 'menu') res(); else { this.onMission = res; setTimeout(res, 60000); } });
    this.onMission = null;
    for (const k of Object.keys(entries)) if (!first.includes(k)) await load(k);
  }
  private onMission: (() => void) | null = null;

  // Recorded cabin and wind loops swap in for the synthesized ones in the live graph
  // (on load, and again after a rebuild)
  private swapLoops() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const b17 = this.b17Loop;
    if (b17 && this.b17 && !this.b17Sampled) {
      for (const s of this.b17.srcs) { try { s.stop(); } catch { /* */ } s.disconnect(); }
      // Preserve four independently panned engines when recordings arrive.
      this.b17.srcs = [1, 1.004, .9965, 1.0075].map((r, i) => {
        const src = this.loopSrc(b17.buf, r);
        this.engineGains[i].gain.value = (this.liveEngineMask & (1 << i)) ? .55 * b17.gain : 0;
        src.connect(this.engineGains[i]);
        return src;
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
    v.src.connect(v.mainGain);
  }

  // Satisfying feedback when the player's rounds connect / score a kill
  confirm(kind: 'hit_confirm' | 'kill_confirm') {
    const arr = this.extra.get(kind);
    if (!this.ctx || !arr) { this.play(kind === 'kill_confirm' ? 'hitHeavy' : 'hit', null, { gain: kind === 'kill_confirm' ? 0.5 : 0.18 }); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = this.pick(kind, arr);
    setP(src.playbackRate, this.rotation(kind, arr.length) * (0.98 + Math.random() * 0.04), RATE);
    const g = this.ctx.createGain(); setP(g.gain, (kind === 'kill_confirm' ? 0.7 : 0.35) * (this.extraGain.get(kind) ?? 1), GAIN);
    src.connect(g).connect(this.fx);
    const now = this.ctx.currentTime;
    this.room(now, src.buffer.duration, 2);
    this.lastAudible = Math.max(this.lastAudible, now);
    freeOnEnd(src, [g]);
    src.start();
  }

  private baseRate = new WeakMap<AudioBufferSourceNode, number>(); // loop rates before the dead-engine sag

  private loopSrc(buf: AudioBuffer, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    this.baseRate.set(s, rate);
    s.start(this.ctx!.currentTime + Math.random() * 0.2);
    return s;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // A filtered noise bed plus sparse baked impacts: rain on aluminium / perspex.
    const rb = this.noiseLoop(5, 'pink');
    const rd = rb.getChannelData(0);
    for (let i = 0; i < rd.length; i += 1 + Math.floor(Math.random() * 900)) {
      for (let j = 0; j < 100 && i + j < rd.length; j++) rd[i + j] += Math.sin(j * .9) * Math.exp(-j / 16) * .45;
    }
    const rs = this.loopSrc(rb), rf = ctx.createBiquadFilter(), rainLevel = ctx.createGain();
    rf.type = 'bandpass'; rf.frequency.value = 2600; rf.Q.value = .6; rainLevel.gain.value = 0;
    rs.connect(rf).connect(rainLevel).connect(this.amb); this.rainGain = rainLevel;
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
    // Strain whistle: a resonant band of the slipstream that rises when the aircraft jinks
    const whs = this.loopSrc(this.noiseLoop(4, 'pink'));
    const whf = ctx.createBiquadFilter(); whf.type = 'bandpass'; whf.frequency.value = 1200; whf.Q.value = 6;
    const whg = ctx.createGain(); whg.gain.value = 0;
    whs.connect(whf).connect(whg).connect(this.amb);
    this.whistle = { gain: whg, filter: whf };
    this.gust = { gain: gg, filter: gf, walkG: 0, walkF: 0 };
    // B-17 interior: four Cyclones, each slightly off-speed so they beat ("wow-wow")
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.8;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const srcs: AudioBufferSourceNode[] = [];
    this.engineGains = [];
    [1.0, 1.004, 0.9965, 1.0075].forEach((r, i) => {
      const s = this.loopSrc(this.engineBufs.cyclone, r);
      const p = ctx.createStereoPanner(); p.pan.value = [-0.7, -0.3, 0.3, 0.7][i];
      const g = ctx.createGain(); g.gain.value = (this.liveEngineMask & (1 << i)) ? .32 : 0;
      this.engineGains.push(g);
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
    const dmg = ctx.createGain(); dmg.gain.value = 1;
    const mainGain = ctx.createGain(); mainGain.gain.value = 1;
    src.connect(mainGain).connect(filter).connect(dmg).connect(gain).connect(pan);
    whoosh.connect(whooshFilter).connect(whooshGain).connect(pan);
    // second loop (push-pull rear engine / jet whine) joins before the distance filter
    const auxGain = ctx.createGain(); auxGain.gain.value = 0; auxGain.connect(filter);
    pan.connect(this.fx);
    const send = ctx.createGain(); send.gain.value = 0.25; pan.connect(send).connect(this.revOutSend);
    return { src, gain, filter, pan, whoosh, whooshGain, whooshFilter, owner: -1, radial: true, freeAt: 0, dmg, stage: 0, nextPop: 0, kind: 'bmw', buf: this.engineBufs.bmw, aux: null, auxGain, auxBuf: null, mainGain };
  }

  // The loops an engine voice plays: [main, aux], the synthesised pass-3 loop once built, else a stand-in
  // (thr: throttle, only the B-17 voice uses it: at Reduced detail it plays one loop, idle or roar)
  private engineLoops(kind: EngineKind, thr = 1): [AudioBuffer, AudioBuffer | null] {
    const e3 = (n: Synth3Name) => this.synth3.get(n)?.[0] ?? null;
    const aux = ENGINE_SPECS[kind].aux > 0 && this.caps.aux;
    switch (kind) {
      case 'cyclone4': {
        const roar = this.fieldBufs.get('eng_cycloneRoar')?.[0], idle = this.fieldBufs.get('eng_cycloneIdle')?.[0];
        if (!roar || !idle) return [this.engineBufs.bmw, null];   // until built: the old radial voice
        return aux ? [roar, idle] : [thr < 0.6 ? idle : roar, null];
      }
      case 'bmw': return [this.engineBufs.bmw, null];
      case 'merlin': return [this.engineBufs.merlin, null];
      case 'jumoTwin': return [e3('eng_jumoTwin') ?? this.engineBufs.cyclone, null];
      case 'db603twin': return [e3('eng_db603twin') ?? this.engineBufs.merlin, null];
      case 'pushpull': return [e3('eng_pushFront') ?? this.engineBufs.merlin, aux ? e3('eng_pushRear') : null];
      case 'jet': return [e3('eng_jetRoar') ?? this.engineBufs.merlin, aux ? e3('eng_jetWhine') : null];
      case 'rocket': return [e3('eng_rocket') ?? this.engineBufs.merlin, null];
    }
  }

  // Put voice v on the loops for its kind (no-op when it already plays them)
  private seat(v: Voice, thr = 1) {
    const [main, aux] = this.engineLoops(v.kind, thr);
    if (v.buf !== main) { this.reseat(v, main); v.buf = main; }
    if (v.auxBuf !== aux) {
      if (v.aux) { try { v.aux.stop(); } catch { /* */ } v.aux.disconnect(); v.aux = null; }
      if (aux) { v.aux = this.loopSrc(aux); v.aux.connect(v.auxGain); }
      v.auxBuf = aux;
    }
  }

  setMode(mode: 'bomber' | 'fighter' | 'ground' | 'menu') {
    this.turretDrive?.update(0);
    this.mode = mode;
    if (mode !== 'menu') this.onMission?.();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.interior = mode === 'bomber' ? 1 : 0;
    this.b17?.gain.gain.setTargetAtTime(mode === 'bomber' ? 0.62 : mode === 'menu' ? 0.16 : 0.0, t, 0.6);
    this.b17?.filter.frequency.setTargetAtTime(this.b17Sampled ? (mode === 'bomber' ? 2400 : 900) : mode === 'bomber' ? 520 : 300, t, 0.3);
    this.wind?.gain.gain.setTargetAtTime(mode === 'menu' ? 0.1 : mode === 'bomber' ? 0.3 : 0.18, t, 0.5);
    this.windCut = mode === 'bomber' ? 1400 : 800;
    this.wind?.filter.frequency.setTargetAtTime(this.windCut, t, 0.5);
    this.revInSend.gain.setTargetAtTime(mode === 'bomber' ? ROOMS[this.compartment()].send : 0.0, t, 0.2);
    this.applyRoom();
    this.applyHarmonics();
    this.creaks?.setActive(mode === 'bomber');
    this.cabin?.setActive(mode === 'bomber');
    if (mode !== 'menu') this.startSynth3();
    if (mode === 'fighter') this.ensurePlayerEngine();
    else if (this.playerEngine) this.playerEngine.gain.gain.setTargetAtTime(0, t, 0.3);
    this.music.setScene(mode === 'menu' ? 'menu' : 'mission');
    // Oxygen-mask breathing runs in the aircraft, silent on the menus
    if (mode === 'menu' || mode === 'ground' || !this.breathingEnabled) this.breathing?.stop(); else this.breathing?.start();
  }

  // Settings: oxygen-mask breathing on/off
  setBreathing(on: boolean) {
    this.breathingEnabled = on !== false;
    if (!this.breathingEnabled) this.breathing?.stop();
    else if (this.mode !== 'menu' && this.mode !== 'ground') this.breathing?.start();
  }

  // Settings "Audio detail": 'reduced' for weak devices (fewer one-shot voices, HRTF voices and
  // engine voices, no second engine loops, one drone point per warship, no blast stages or cabin rattle bed)
  setDetail(d: AudioDetail) {
    const k: AudioDetail = d === 'reduced' ? 'reduced' : 'normal';
    if (k === this.detail) return;
    this.detail = k; this.caps = DETAIL[k];
    this.music.setDetail(k === 'reduced');
    this.cabin?.setDetail(k === 'normal');
    this.breathing?.setDetail(k === 'normal');
    this.oneShots = new Budget(this.caps.voices);
    this.hrtfShots = new Budget(this.caps.hrtf);
    for (const v of this.voices) this.seat(v);   // drops / restores the second loops
    this.spatial = SPATIAL_DETAIL[k];
    this.applyHarmonics();
    this.applyRoom();
  }

  // ---------------------------------------------------------------- spatial audio 2.0
  // The player's gun station on the B-17 (World.playerStationId; null when not a gunner): picks the
  // fuselage occlusion and the compartment's interior reverb. Called every frame by Game (cheap repeats).
  setStation(id: string | null) {
    const st = isStation(id) ? id : null;
    if (st === this.station) return;
    this.station = st;
    if (!st) this.occlOn = false;
    this.applyRoom();
  }
  // Compartment the interior reverb is voiced for (the waist when the station is unknown)
  private compartment(): Compartment { return this.station ? compartmentOf(this.station) : 'waist'; }
  private applyRoom() {
    if (!this.ctx || !this.roomChain) return;
    const room = this.compartment();
    this.roomChain.set(room);
    if (this.mode === 'bomber') towards(this.revInSend.gain, ROOMS[room].send, GAIN, this.ctx.currentTime, 0.2);
    // Normal detail: each compartment its own impulse (length and decay); Reduced keeps the waist's
    const ir = this.spatial.compartmentIRs ? room : 'waist';
    let buf = this.roomIRs.get(ir);
    if (!buf) { const r = ROOMS[ir]; buf = this.impulse(r.length, r.decay, true); this.roomIRs.set(ir, buf); }
    if (this.revIn.buffer !== buf) try { this.revIn.buffer = buf; } catch { /* keep the current impulse */ }
  }
  // Engine order tones: the B-17's four Cyclones in the bomber, the Merlin in the fighter (Normal only)
  private applyHarmonics() {
    const ctx = this.ctx;
    if (!ctx) return;
    const bomber = this.spatial.harmonics && this.mode === 'bomber';
    const fighter = this.spatial.harmonics && this.mode === 'fighter';
    if (bomber && !this.bomberHarm) this.bomberHarm = new HarmonicBank(ctx, this.amb, [-0.7, -0.3, 0.3, 0.7], 0.05, 700);
    if (fighter && !this.playerHarm) this.playerHarm = new HarmonicBank(ctx, this.amb, [0], 0.045, 1100);
    this.bomberHarm?.setActive(bomber);
    this.playerHarm?.setActive(fighter);
    const drop = (h: HarmonicBank | null, keep: boolean) => { if (h && !keep) setTimeout(() => h.stop(), 400); return keep ? h : null; };
    this.bomberHarm = drop(this.bomberHarm, bomber);
    this.playerHarm = drop(this.playerHarm, fighter);
  }
  // Fuselage occlusion of an outside sound at pos (fills this.occ): gain and low-pass factors.
  // Only while the camera sits at the gunner's station; elsewhere both are 1.
  private occlude(pos: THREE.Vector3): Occlusion {
    const o = this.occ;
    if (!this.occlOn || this.mode !== 'bomber' || !this.station) { o.gain = 1; o.lp = 1; return o; }
    const d = this.tmpOcc.copy(pos).sub(this.listenerPos).applyQuaternion(this.bomberInvQ);
    return occlusion(this.station, d.x, d.y, d.z, o);
  }
  private tmpOcc = new THREE.Vector3();
  private updateSpatial(dt: number) {
    if (!this.ctx) return;
    this.flakRumble.step(dt);
    const mission = this.mode === 'bomber' || this.mode === 'fighter' || this.mode === 'ground';
    // inside the fuselage the barrage comes through the skin: a little darker
    this.rumbleBed?.update(mission ? this.flakRumble.level : 0, this.flakRumble.lp, this.mode === 'bomber' ? 0.8 : 1);
    if (this.bomberHarm) {
      const h = Math.min(Math.max(dt, 0), 0.1);
      this.rpmWander = fin(Math.max(-1, Math.min(1, this.rpmWander * (1 - 0.3 * h) + rand() * Math.sqrt(3 * h) * 0.5)), 0);
      const rpm = bomberRpm(this.engineAlive, this.rpmWander);
      engineHarmonics('cyclone', rpm, this.hf, this.hg);
      for (let i = 0; i < 4; i++) {
        const on = !!(this.liveEngineMask & (1 << i));
        this.bomberHarm.set(i, this.hf, on ? this.hg : ZERO3, CYCLONE_TRIM[i], on ? 0.6 : 0.35);
      }
    }
  }
  get detailCaps(): DetailCaps { return this.caps; }

  // The player's B-17 (its root Object3D) while the camera is in the gunner's cabin, else null:
  // positions the window roar (Cabin.ts). Called every frame by Game.
  private winL = new THREE.Vector3();
  private winR = new THREE.Vector3();
  setCabin(bomber: THREE.Object3D | null) {
    if (!bomber || this.mode !== 'bomber') this.occlOn = false;
    if (!this.cabin || this.mode !== 'bomber') return;
    if (!bomber) { this.cabin.update(null, null, this.maneuver, false); return; }
    const l = bomber.localToWorld(this.winL.set(...WAIST_WINDOWS[0])), r = bomber.localToWorld(this.winR.set(...WAIST_WINDOWS[1]));
    // the camera far from the cabin (kill cam, photo mode): no window roar
    const near = Math.min(l.distanceTo(this.listenerPos), r.distanceTo(this.listenerPos)) < 25;
    // fuselage occlusion (Spatial2.occlusion) needs the bomber's orientation, and the camera aboard
    this.occlOn = near && !!this.station;
    if (this.occlOn) bomber.getWorldQuaternion(this.bomberInvQ).invert();
    this.cabin.update(near ? l : null, near ? r : null, this.maneuver, this.caps.cabinBed, this.cabinDamage);
  }

  private ensurePlayerEngine() {
    const ctx = this.ctx!;
    if (!this.playerEngine) {
      const src = this.loopSrc(this.engineBufs.merlin);
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 1.4;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const dmg = ctx.createGain(); dmg.gain.value = 1;
      src.connect(filter).connect(dmg).connect(gain).connect(this.amb);
      this.playerEngine = { src, gain, filter, dmg, nextPop: 0 };
    }
  }

  // damage: 0 (healthy) .. 1 (engine zone destroyed): the Merlin sags, hunts and misfires
  setPlayerEngine(throttle: number, speed: number, damage = 0) {
    if (!this.ctx || !this.playerEngine || !ok(throttle) || !ok(speed)) return;
    speed = Math.min(1000, Math.max(0, speed));
    const t = this.ctx.currentTime;
    const dmg = fin(damage, 0, [0, 1]);
    const hunt = dmg > 0.35 ? 1 - 0.08 * dmg + 0.03 * dmg * Math.sin(t * 4.1) * Math.sin(t * 1.3) : 1;
    towards(this.playerEngine.src.playbackRate, (0.78 + throttle * 0.3 + speed * 0.0004) * hunt, RATE, t, 0.15);
    const pe = this.playerEngine;
    if (pe.dmg && dmg > 0.35 && t >= pe.nextPop) {
      const depth = 1 - 0.75 * dmg, len = 0.04 + Math.random() * 0.1 * dmg;
      pe.dmg.gain.cancelScheduledValues(t);
      pe.dmg.gain.setValueAtTime(1, t + 0.02);
      pe.dmg.gain.linearRampToValueAtTime(depth, t + 0.035);
      pe.dmg.gain.setValueAtTime(depth, t + 0.02 + len);
      pe.dmg.gain.linearRampToValueAtTime(1, t + 0.05 + len);
      pe.nextPop = t + len + (1.6 - 1.4 * dmg) * (0.4 + Math.random());
    }
    towards(this.playerEngine.filter.frequency, 380 + throttle * 1100, FREQ, t, 0.1);
    if (this.playerHarm) {
      // Merlin order tones follow the rpm (a sick engine hunts with it)
      engineHarmonics('merlin', rpmFor('merlin', throttle) * hunt, this.hf, this.hg);
      this.playerHarm.set(0, this.hf, this.hg, 1, 0.15);
    }
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
    if (this.ctx) this.updateSpatial(dt);
    if (!this.ctx || !this.gust) return;
    if (this.rainGain) towards(this.rainGain.gain, this.mode === 'menu' ? 0 : weatherNow.rain * .16, GAIN, this.ctx.currentTime, .5);
    const h = Math.min(dt, 0.1); // clamp so a stalled tab cannot jump the walks
    if (!(h >= 0)) return;     // a NaN dt would poison the walks for good
    const fighter = this.mode === 'fighter';
    const speedN = fighter ? THREE.MathUtils.clamp((this.windSpeed - 60) / 90, 0, 1) : 0;
    const s = Math.min(1, (fighter ? 0.35 + 0.65 * speedN : 0.3) + weatherNow.turbulence * .4);
    const g = this.gust;
    const sig = (0.45 + 0.35 * s) * Math.sqrt(3 * h); // uniform rand() has variance 1/3
    g.walkG = fin(THREE.MathUtils.clamp(g.walkG - 0.35 * g.walkG * h + rand() * sig, -1, 1), 0);
    g.walkF = fin(THREE.MathUtils.clamp(g.walkF - 0.35 * g.walkF * h + rand() * sig, -1, 1), 0);
    const t = this.ctx.currentTime;
    // an evasive jink: the slipstream roars up and brightens, and the strain whistle sings
    const m = this.mode === 'menu' ? 0 : Math.max(this.maneuver, this.mode === 'bomber' && this.bombBayOpen ? .8 : 0);
    towards(g.gain.gain, (1 + (0.15 + 0.45 * s) * g.walkG) * (1 + 0.9 * m), GAIN, t, 0.3);
    towards(g.filter.frequency, this.windCut * Math.pow(2, 0.7 + g.walkF * (0.25 + 0.75 * s) + 1.1 * m), FREQ, t, 0.3);
    if (this.whistle) {
      towards(this.whistle.gain.gain, (this.mode === 'bomber' ? 0.07 : 0.045) * Math.pow(m, 1.5), GAIN, t, 0.25);
      towards(this.whistle.filter.frequency, 1000 + 1100 * m + 120 * g.walkF, FREQ, t, 0.3);
    }
  }

  // How hard the player's aircraft is manoeuvring, 0..1 (World.maneuverLevel: the B-17's evasive
  // jink profile, or the P-51's g-load). Drives the wind roar / strain whistle (updateWind)
  // and the airframe creaks in the bomber.
  setManeuver(x: number) {
    if (!ok(x)) return;
    this.maneuver = Math.min(1, Math.max(0, x));
    this.creaks?.setStress(this.maneuver);
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
    // the drone sags a little in pitch as the remaining engines labour
    for (const s of this.b17?.srcs ?? []) s.playbackRate.setTargetAtTime((this.baseRate.get(s) ?? 1) * (1 - 0.022 * (4 - a)), t, 1.4);
  }

  setBomberDamage(dead: readonly boolean[], zones: readonly { name: string; hp: number; maxHp: number }[]) {
    const mask = engineMask(dead);
    this.cabinDamage = skinDamage(zones);
    if (mask === this.liveEngineMask) return;
    this.liveEngineMask = mask;
    let alive = 0;
    for (let i = 0; i < 4; i++) {
      const on = !!(mask & (1 << i));
      if (on) alive++;
      if (this.ctx && this.engineGains[i]) this.engineGains[i].gain.setTargetAtTime(on ? (this.b17Sampled ? .55 * (this.b17Loop?.gain ?? 1) : .32) : 0, this.ctx.currentTime, .35);
    }
    this.setEngineHealth(alive);
  }

  private applyInteriorBuffers() {
    this.cabin?.setLeakBuffer(this.holeBuf);
    this.breathing?.setBuffer(this.breathBuf);
    this.breathing?.setDetail(this.detail === 'normal');
    this.cabin?.setDetail(this.detail === 'normal');
    this.turretDrive?.setBuffer(this.turretBuf);
  }

  // One of the gunner's own engines dies (0..3, left to right): a low growl winding down
  // with a couple of backfire coughs, panned toward that engine. Synthesised, one-shot.
  engineFail(index: number) {
    if (!this.ctx || !ok(index) || this.mode !== 'bomber') return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner(); pan.pan.value = [-0.7, -0.3, 0.3, 0.7][Math.max(0, Math.min(3, index | 0))];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.05);
    g.gain.setTargetAtTime(0.0001, t + 0.6, 0.7);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(140, t + 2.6);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(88, t); o.frequency.exponentialRampToValueAtTime(22, t + 2.8);
    o.connect(f).connect(g).connect(pan).connect(this.sfx);
    o.start(t); o.stop(t + 3.2);
    o.onended = () => { o.disconnect(); f.disconnect(); g.disconnect(); pan.disconnect(); };
    // backfire coughs
    for (const dt of [0.15, 0.55 + Math.random() * 0.3]) setTimeout(() => this.play('cannon', null, { gain: 0.25, rate: 0.5, reverb: 0.3 }), dt * 1000);
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
    this.motion.update(p.x, p.y, p.z, performance.now() / 1000);   // for the relative Doppler
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

  // Engine voices for the nearest aircraft: each type its own engine (Acoustics.engineKindOf),
  // Doppler pitch, distance filtering, a rush of air on close passes, and for the push-pull
  // Do 335 / the Me 262 a second loop weighted by aspect (rear pusher / exhaust roar from behind,
  // turbine whine from ahead). Also feeds the combat intensity to the score and the breathing.
  private tmpFwd = new THREE.Vector3();
  updateFighterVoices(fighters: FighterSound[]) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.reapEmitters(t);
    const L = this.listenerPos;
    const nv = Math.min(this.voices.length, this.caps.engines);
    // (d < 4000 also drops NaN positions)
    const sorted = fighters.map((f) => ({ f, d: f.pos.distanceTo(L) })).filter((x) => x.d < 4000).sort((a, b) => a.d - b.d).slice(0, nv);
    let intensity = 0;
    const used = new Set<Voice>();
    const M = this.motion, sc = this.hrtfScores;
    sc.fill(0);
    for (const { f, d } of sorted) {
      let v = this.voices.find((vv, i) => i < nv && vv.owner === f.id);
      if (!v) v = this.voices.find((vv, i) => i < nv && !used.has(vv) && !sorted.some((s) => s.f.id === vv.owner));
      if (!v) continue;
      used.add(v);
      const kind = engineKindOf(f.type ?? (f.radial ? 'fw190' : 'p51d'));
      if (v.owner !== f.id || v.kind !== kind) {
        v.kind = kind; v.radial = kind === 'bmw';
        v.owner = f.id;
        v.dmg.gain.cancelScheduledValues(t); v.dmg.gain.setValueAtTime(1, t); v.stage = 0; v.nextPop = t;
        v.mainGain.gain.cancelScheduledValues(t); v.mainGain.gain.setValueAtTime(1, t);
      }
      this.seat(v, fin(f.throttle, 1, [0, 2]));   // also swaps in a pass-3 loop the moment it is built
      const stage = Math.max(0, Math.min(4, Math.round(fin(f.stage ?? 0, 0, [0, 4]))));
      v.stage = stage;
      if (stage >= 2 && t >= v.nextPop) this.misfire(v, t);
      const toL = this.tmpTo.copy(L).sub(f.pos);
      const dist = Math.max(1, toL.length());
      toL.divideScalar(dist);
      const vr = fin(f.vel.dot(toL), 0, [-2000, 2000]); // approaching = positive
      // the listener rides along (the bomber at ~75 m/s): Doppler from both ends (Spatial2.doppler2)
      const vl = -fin(M.vx * toL.x + M.vy * toL.y + M.vz * toL.z, 0, [-2000, 2000]);
      const dop = doppler2(vr, vl);
      // a damaged engine sags and hunts: rpm down, a slow uneven wobble (stage 3-4)
      const sag = v.stage >= 3 ? (v.stage === 4 ? 0.9 : 0.96) * (1 + (v.stage === 4 ? 0.035 : 0.02) * Math.sin(t * (5.3 + (f.id % 5)) + f.id) * Math.sin(t * 1.7 + f.id * 0.7)) : 1;
      const spec = ENGINE_SPECS[kind];
      const synth = v.buf !== this.engineBufs.bmw && v.buf !== this.engineBufs.merlin && v.buf !== this.engineBufs.cyclone;
      const thr = fin(f.throttle, 1, [0, 2]);
      const base = synth ? spec.rate[0] + (spec.rate[1] - spec.rate[0]) * Math.min(1, thr) : 0.82 + thr * 0.22;
      const trim = engineRateTrim(f.type ?? '', f.type ?? '');
      let rate = base * dop * sag * trim * (v.buf === this.engineBufs.bmw ? this.radialRate : 1);
      // the B-17 from outside: take-off roar and taxi idle cross-faded by throttle (Acoustics.cycloneMix)
      const cy = kind === 'cyclone4' && synth ? cycloneMix(thr) : null;
      const cyIdleMain = !!cy && v.buf === this.fieldBufs.get('eng_cycloneIdle')?.[0];
      if (cy) rate = (cyIdleMain ? cy.idleRate : cy.roarRate) * dop * sag;
      towards(v.src.playbackRate, rate, RATE, t, 0.04);
      const cut = cy ? spec.cutoff * cy.bright : synth ? spec.cutoff : 1600;
      // inside the bomber: through the skin, or out of the gunner's window / glazing (Spatial2.occlusion)
      const oc = this.occlOn ? this.occlude(f.pos) : null;
      towards(v.filter.frequency, cut * (oc ? oc.lp : this.interior ? 0.4 : 1) * Math.max(0.3, Math.exp(-d / 2200)) + 160, FREQ, t, 0.05);
      const occGain = oc ? oc.gain : 1;
      place(v.pan, f.pos.x, f.pos.y, f.pos.z, t);
      // HRTF goes to the fighters passing close (scored here, picked after the loop)
      const vi = this.voices.indexOf(v);
      const pb = passBy(-toL.x * dist, -toL.y * dist, -toL.z * dist, f.vel.x - M.vx, f.vel.y - M.vy, f.vel.z - M.vz, this.pb);
      if (vi >= 0 && vi < sc.length) sc[vi] = hrtfScore(d, pb.tca, pb.miss);
      // aspect: which end of the aircraft faces us
      let main = 1;
      if (cy) {
        // Normal: roar on the main loop, idle on the second; Reduced: one loop, the one for the throttle
        main = v.aux ? 1 : cyIdleMain ? spec.aux * Math.max(cy.idle, 0.5) : Math.max(cy.roar, 0.3);
        towards(v.mainGain.gain, v.aux ? cy.roar : 1, GAIN, t, 0.08);
        towards(v.auxGain.gain, v.aux ? spec.aux * cy.idle : 0, GAIN, t, 0.08);
        if (v.aux) towards(v.aux.playbackRate, cy.idleRate * dop * sag, RATE, t, 0.04);
      } else if (spec.aux > 0) {
        const sp = f.vel.length();
        const fw = sp > 1 ? this.tmpFwd.copy(f.vel).divideScalar(sp) : this.tmpFwd.set(0, 0, 1);
        const a = aspect(fw.x, fw.y, fw.z, toL.x, toL.y, toL.z);
        if (kind === 'pushpull') { main = 0.55 + 0.45 * a.front; towards(v.auxGain.gain, v.aux ? spec.aux * a.rear : 0, GAIN, t, 0.06); }
        else { main = 0.45 + 0.55 * a.rear; towards(v.auxGain.gain, v.aux ? spec.aux * (0.25 + a.front) : 0, GAIN, t, 0.06); }
        if (v.aux) towards(v.aux.playbackRate, (kind === 'jet' ? 0.86 + 0.18 * Math.min(1, thr) : base * 1.01) * dop * sag, RATE, t, 0.04);
      }
      towards(v.gain.gain, (this.interior ? 0.5 : 0.65) * (synth ? spec.gain : this.voiceGain) * main * occGain, GAIN, t, 0.08);
      // (a taxiing bomber makes no rush of air: scale it by speed)
      const close = Math.max(0, 1 - d / 450) * (kind === 'cyclone4' ? Math.min(1, f.vel.length() / 70) : 1);
      towards(v.whooshGain.gain, close * close * 0.9, GAIN, t, 0.05);
      towards(v.whooshFilter.frequency, 500 + Math.max(0, vr) * 6, FREQ, t, 0.05);
      intensity = Math.max(intensity, Math.max(0, 1 - d / 2500));
    }
    // HRTF panners for the k fighters most worth it (Audio detail: 4 at Normal, 1 at Reduced)
    const nh = Math.min(this.voices.length, sc.length);
    for (let i = 0; i < nh; i++) this.hrtfWas[i] = this.voices[i].pan.panningModel === 'HRTF' ? 1 : 0;
    pickHrtf(sc, nh, this.spatial.hrtfFighters, this.hrtfWas, this.hrtfOn);
    for (let i = 0; i < nh; i++) {
      const v = this.voices[i];
      if (!used.has(v)) continue;
      const pm = this.hrtfOn[i] ? 'HRTF' : 'equalpower';
      if (v.pan.panningModel !== pm) v.pan.panningModel = pm;
    }
    for (const v of this.voices) if (!used.has(v)) {
      if (v.owner !== -1) v.freeAt = t;
      v.gain.gain.setTargetAtTime(0, t, 0.25); v.whooshGain.gain.setTargetAtTime(0, t, 0.1); v.auxGain.gain.setTargetAtTime(0, t, 0.25); v.owner = -1;
      // back to equal-power once the fade-out is over
      if (v.pan.panningModel !== 'equalpower' && t - v.freeAt > 1.5) v.pan.panningModel = 'equalpower';
    }
    this.music.setIntensity(fighters.length ? Math.max(intensity, 0.35) : 0);
    // breathing quickens with the threat (the score's), or the nearest engine if that is higher
    this.breathing?.setIntensity(Math.max(fighters.length ? intensity : 0, this.music.threatLevel));
  }

  // A damaged enemy engine misfires: short dips in its level (deeper and more often the worse
  // the damage stage), sometimes in a stuttering pair. Scheduled a little ahead on the audio clock.
  private misfire(v: Voice, t: number) {
    const st = v.stage;
    const depth = st === 2 ? 0.55 : st === 3 ? 0.28 : 0.1;
    const t0 = t + 0.02;
    const g = v.dmg.gain;
    const dip = (at: number, len: number) => {
      g.setValueAtTime(1, at);
      g.linearRampToValueAtTime(depth * (0.8 + Math.random() * 0.4), at + 0.012);
      g.setValueAtTime(depth, at + len);
      g.linearRampToValueAtTime(1, at + len + 0.03);
    };
    g.cancelScheduledValues(t0);
    const len = 0.04 + Math.random() * (st === 4 ? 0.14 : 0.09);
    dip(t0, len);
    if (st >= 3 && Math.random() < 0.45) dip(t0 + len + 0.06 + Math.random() * 0.08, len * 0.7);
    const gap = st === 2 ? 0.7 + Math.random() * 1.6 : st === 3 ? 0.22 + Math.random() * 0.6 : 0.09 + Math.random() * 0.3;
    v.nextPop = t + len * 2 + gap;
  }

  play(name: BufName, pos: THREE.Vector3 | null, opts: PlayOpts = {}) {
    if (!this.ctx) return;
    const def = NAME_DEFAULTS[name];
    if (def) opts = { ...def, ...opts };
    if (name === 'explosion') { this.explode(pos, opts); return; }
    let arr = this.bufs.get(name);
    if (!arr) {
      // a pass-3 sound not synthesised yet: borrow its stand-in
      const si = STAND_IN[name];
      if (!si || !(arr = this.bufs.get(si[0]))) return;
      opts = { ...opts, rate: (opts.rate ?? 1) * si[1], gain: (opts.gain ?? 1) * si[2] };
      name = si[0];
    }
    const buffer = this.pick(name, arr);
    const rot = this.rotation(name, arr.length);
    this.shot(buffer, pos, rot === 1 ? opts : { ...opts, rate: (opts.rate ?? 1) * rot }, (opts.gain ?? 1) * (this.gainMap.get(name) ?? 1), name);
  }

  // Shorthand for a synthesised layer (skipped while it is not built yet)
  private layer(name: BufName, pos: THREE.Vector3 | null, opts: ShotOpts, gain: number) {
    const arr = this.bufs.get(name);
    if (!arr || !(gain > 0.01)) return;
    this.shot(this.pick(name, arr), pos, opts, gain * (this.gainMap.get(name) ?? 1), name);
  }

  // An explosion, built for the distance (Acoustics.blastMix): close, a sharp shock crack and a
  // felt low boom on top of the recorded blast; far, the recorded far blast and a rolling thunder
  // with the highs gone. Everything arrives distance / 343 m/s later (shot()). Heavies and
  // warships go up in stages; a near blast ducks the music and ambience for a moment.
  // size: opts.size, or from the caller's reference distance (>= 400: warship, >= 200: heavy)
  private explode(pos: THREE.Vector3 | null, opts: ShotOpts) {
    const ex = this.bufs.get('explosion');
    if (!ex) return;
    const g = opts.gain ?? 1, ref = opts.ref ?? 150, rev = opts.reverb ?? 0.35;
    const exG = this.gainMap.get('explosion') ?? 1;
    if (!pos) { this.shot(this.pick('explosion', ex), null, opts, g * exG, 'explosion'); return; }
    const d = pos.distanceTo(this.listenerPos);
    if (!(d <= 12000)) return;
    const size: BlastSize = opts.size ?? (ref >= 400 ? 'warship' : ref >= 200 ? 'heavy' : ref <= 90 ? 'small' : 'fighter');
    const big = size === 'heavy' || size === 'warship' ? 1.25 : size === 'small' ? 0.7 : 1;
    const mix = blastMix(d);
    const far = this.bufs.get('explosionFar');
    const thunderReady = this.bufs.has('thunder');
    const farBody = d > 2500 && !!far;
    // body: the recorded blast (the far recording past 2.5 km, as before)
    if (mix.body > 0.02 || !thunderReady) {
      const nm: BufName = farBody ? 'explosionFar' : 'explosion';
      const arr = farBody ? far! : ex;
      const rot = this.rotation(nm, arr.length);
      this.shot(this.pick(nm, arr), pos, { ...opts, rate: (opts.rate ?? 1) * rot }, g * (thunderReady ? Math.max(mix.body, 0.15) : 1) * (this.gainMap.get(nm) ?? 1), nm);
    }
    this.layer('blastCrack', pos, { ref: ref * 0.5, reverb: rev * 0.4, rate: 0.9 + Math.random() * 0.2 }, g * 0.7 * mix.crack);
    this.layer('blastBoom', pos, { ref: ref * 1.6, reverb: rev * 0.6, rate: (0.92 + Math.random() * 0.12) / Math.sqrt(big) }, g * 0.55 * mix.boom * big);
    this.layer('thunder', pos, { ref: Math.max(600, ref * 3), reverb: rev, lp: thunderLowpass(d, !!this.interior), rate: 0.85 + Math.random() * 0.2 }, g * 0.9 * mix.thunder * big);
    // stages: only when the caller names the size, or for a warship-sized blast
    if (this.caps.stages && (opts.size || size === 'warship')) {
      for (const st of blastStages(size)) {
        const nm: BufName = farBody ? 'explosionFar' : 'explosion';
        this.shot(this.pick(nm, farBody ? far! : ex), pos, { ...opts, at: st.at, rate: (opts.rate ?? 1) * st.rate }, g * st.gain * (this.gainMap.get(nm) ?? 1) * Math.max(mix.body, 0.3), nm);
        this.layer('blastBoom', pos, { ref: ref * 1.6, reverb: rev * 0.6, at: st.at + 0.02, rate: st.rate }, g * 0.6 * st.gain * mix.boom);
      }
    }
    this.blastDuckAt(d, size);
  }

  // Duck music + ambience when a near blast arrives (Acoustics.blastDuck)
  private blastDuckAt(d: number, size: BlastSize) {
    const dk = blastDuck(d, size);
    if (!dk) return;
    const go = () => this.duckFor(dk.seconds, dk.depth, 1);
    const ms = soundDelay(d) * 1000;
    if (ms < 15) go(); else setTimeout(go, ms);
  }

  // A boss warship breaking up (BossDrone, once per ship): the long rumble rolling on under the blasts
  warshipDeath(pos: THREE.Vector3) {
    if (!this.ctx || !ok(pos.x + pos.y + pos.z)) return;
    const d = pos.distanceTo(this.listenerPos);
    this.layer('rumbleLong', pos, { ref: 900, reverb: 1, lp: Math.max(240, thunderLowpass(d, !!this.interior) * 1.8) }, 1.0);
    this.blastDuckAt(d, 'warship');
  }

  // A heavy flak shell bursting (World.flak; open to other systems): the recorded burst, a dull
  // whump under it when near, and shrapnel pattering on the skin when it bursts close to us
  flakBurst(pos: THREE.Vector3, gain = 1) {
    if (!this.ctx || !ok(pos.x + pos.y + pos.z)) return;
    const d = pos.distanceTo(this.listenerPos);
    if (d < 160) this.play('flakClose', pos, { gain: 1.5 * gain, ref: 60, reverb: 0.5 });
    else this.play('flak', pos, { gain: 1.3 * gain, ref: 80, reverb: 0.6 });
    if (d < 900) this.layer('whump', pos, { ref: 70, reverb: 0.4, rate: 0.9 + Math.random() * 0.2 }, gain * 1.1 * (1 - d / 900));
    if (d < 130 && this.mode !== 'menu') this.patter(1 - d / 130, soundDelay(d) + d / 700);
    if (d < 260) this.blastDuckAt(d, 'small');
    this.flakRumble.burst(d, gain);   // the barrage's rolling bed (updateSpatial)
  }

  // Shrapnel on our own skin (k 0..1), `after` seconds from now; rate-limited
  private patter(k: number, after = 0) {
    if (!this.ctx || !this.patterGate.pass(this.ctx.currentTime)) return;
    if (this.bufs.has('patter')) this.layer('patter', null, { reverb: 0.5, at: after, rate: 0.9 + Math.random() * 0.2 }, 0.35 + 0.65 * k);
    else setTimeout(() => this.play('rattle', null, { gain: 0.7 * k, reverb: 0.5 }), after * 1000);
  }

  // Shuffle bag per sound: every variant once before any repeats, never the same one twice running
  private bags = new Map<string, number[]>();
  private lastPick = new Map<string, number>();
  private pick<T>(name: string, arr: T[]): T {
    if (arr.length < 2) return arr[0];
    let bag = this.bags.get(name);
    if (!bag || !bag.length) {
      bag = arr.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag[bag.length - 1] === this.lastPick.get(name)) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.bags.set(name, bag);
    }
    const i = bag.pop()!;
    this.lastPick.set(name, i);
    return arr[Math.min(i, arr.length - 1)];
  }
  // Pitch rotation for sounds with a single buffer (1 otherwise)
  private rot = new Map<string, number>();
  private rotation(name: string, variants: number) {
    if (variants > 1) return 1;
    const k = (this.rot.get(name) ?? Math.floor(Math.random() * ROTATE_CENTS.length)) + 1;
    this.rot.set(name, k);
    return Math.pow(2, ROTATE_CENTS[k % ROTATE_CENTS.length] / 1200);
  }

  // One-off synthesized buffers (see Ricochet.ts): same positional chain as play(), caller supplies the buffer
  playBuffer(buffer: AudioBuffer, pos: THREE.Vector3 | null, opts: PlayOpts = {}) {
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
      if (opts.delay !== false) when += soundDelay(d);
    }
    if (opts.at && opts.at > 0 && opts.at < 10) when += opts.at;
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
      // an outside sound heard at the gunner's station: muffled by the skin or open through a window
      const oc = this.occlOn && d > 15 ? this.occlude(pos) : null;
      setP(f.frequency, opts.lp ?? (oc ? airLowpass(d) * oc.lp : airLowpass(d, !!this.interior)), FREQ);
      if (oc) setP(g.gain, gain * oc.gain, GAIN);
      const p = ctx.createPanner();
      // HRTF only for a few very close sounds at a time
      p.panningModel = d < 60 && this.hrtfShots.take(now, when, dur) ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse'; p.refDistance = fin(opts.ref ?? 40, 40, [0.1, 1e4]); p.rolloffFactor = 1;
      place(p, pos.x, pos.y, pos.z);
      src.connect(f).connect(g).connect(p).connect(this.fx);
      out = p;
      const send = ctx.createGain();
      setP(send.gain, (opts.reverb ?? 0.35) * Math.min(1, 0.3 + d / 1500), GAIN);
      p.connect(send).connect(this.revOutSend);
      nodes.push(f, p, send);
    } else {
      src.connect(g).connect(this.fx);
    }
    if (this.interior && (opts.reverb ?? 0) > 0) { const s = ctx.createGain(); setP(s.gain, opts.reverb!, GAIN); out.connect(s).connect(this.revInSend); nodes.push(s); }
    freeOnEnd(src, nodes);
    src.start(when, offset);
    if (gain > 0.02) this.lastAudible = Math.max(this.lastAudible, when);
  }

  // Distant battle ambience (DistantBattle.ts): engines of an unseen formation or fighter
  // group droning past far off, swelling in and out over `seconds` while drifting along `drift`
  distantDrone(pos: THREE.Vector3, drift: THREE.Vector3, seconds: number, radial: boolean, gain = 1) {
    const ctx = this.ctx;
    if (!ctx || !ok(seconds) || seconds <= 0) return;
    const d = pos.distanceTo(this.listenerPos);
    if (!(d < 12000)) return;
    const now = ctx.currentTime, end = now + seconds;
    if (!this.room(now, seconds, 0)) return;
    const src = ctx.createBufferSource();
    src.buffer = radial ? this.engineBufs.bmw : this.engineBufs.cyclone;
    src.loop = true;
    setP(src.playbackRate, (radial ? this.radialRate * 0.85 : 0.97) * (0.95 + Math.random() * 0.1), RATE);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; setP(f.frequency, Math.max(180, 900 * Math.exp(-d / 3000)) * (this.interior ? 0.6 : 1), FREQ);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(fin(gain, 1, GAIN) * (radial ? this.voiceGain : 1) * 0.5, now + seconds * 0.45);
    g.gain.linearRampToValueAtTime(0, end);
    const p = ctx.createPanner();
    p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 600; p.rolloffFactor = 1;
    place(p, pos.x, pos.y, pos.z, now);
    if (ok(drift.x + drift.y + drift.z)) {
      p.positionX.linearRampToValueAtTime(pos.x + drift.x, end); p.positionY.linearRampToValueAtTime(pos.y + drift.y, end); p.positionZ.linearRampToValueAtTime(pos.z + drift.z, end);
    }
    const send = ctx.createGain(); send.gain.value = 0.6;
    src.connect(f).connect(g).connect(p).connect(this.fx);
    p.connect(send).connect(this.revOutSend);
    freeOnEnd(src, [f, g, p, send]);
    src.start(now, Math.random() * 1.5);
    src.stop(end + 0.05);
  }

  // A shot-down aircraft falling far away: a long descending whine (pitch dives as it
  // drops away), two synthesized variants
  private whineBufs: AudioBuffer[] = [];
  distantWhine(pos: THREE.Vector3, gain = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.whineBufs.length < 2) {
      const f0 = 700 + Math.random() * 300, f1 = 260 + Math.random() * 80, T = 3.6;
      let ph = 0, ph2 = 0;
      const lp = [new LP(0.08), new LP(0.08)];
      this.whineBufs.push(this.stereo(T, (t, ch) => {
        const u = t / T, f = f0 * Math.pow(f1 / f0, u * u);
        if (ch === 0) { ph += 2 * Math.PI * f / ctx.sampleRate; ph2 += 2 * Math.PI * f * 2.01 / ctx.sampleRate; }
        const env = Math.min(1, t / 0.8) * Math.pow(1 - u, 0.6);
        return (Math.sin(ph + ch * 0.3) * 0.6 + Math.sin(ph2) * 0.15 + lp[ch].run(rand()) * 0.9) * env;
      }, 0.8));
    }
    this.playBuffer(this.whineBufs[Math.floor(Math.random() * this.whineBufs.length)], pos, { gain, ref: 500, reverb: 0.8 });
  }

  // Enemy round passing close to the listener: a zip panned to where the round is (rate-limited in Whizby.ts)
  whizby(pos: THREE.Vector3, gain: number) { this.whizbyFx?.play(pos, gain); }

  // Player's own guns: un-positioned, close, with the fuselage ringing around them
  playerGun(twin: boolean, cannon = false, ejectOutside = false) {
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
      this.play(this.mode === 'bomber' && this.bufs.has('m2inside') ? 'm2inside' : 'm2', null, { gain: twin ? 0.9 : 0.8, reverb: rev * .45 });
      this.play('m2thump', null, { gain: twin ? 1.15 : 1.0, reverb: rev * 0.8 });
      if (this.caps.aux) this.play('m2mech', null, { gain: 0.4, reverb: rev * 0.2 });
      // the Mustang's six wing guns never fire in step: a second report a few ms behind and a
      // lower thump make the stack thicker than one gun
      if (this.mode === 'fighter') {
        this.play('m2', null, { gain: 0.55, rate: 0.9, at: 0.009 + Math.random() * 0.006 });
        this.play('m2thump', null, { gain: 0.6, rate: 0.82, at: 0.005 });
      }
    }
    // the guns drown out everything else for an instant
    this.duckFor(0.09, 0.5);
    // spent brass rings on the turret floor; a Mustang's casings fall out of the wing chutes unheard
    if (!ejectOutside && this.mode !== 'fighter' && Math.random() < 0.35) this.play('casing', null, { gain: 0.12, rate: 0.9 + Math.random() * 0.4, reverb: 0.2, at: .15 + Math.random() * .25 });
  }

  // Shrapnel / rounds hitting our own aircraft
  playerImpact(heavy: boolean) {
    this.play(this.mode === 'bomber' && this.bufs.has('skin') ? 'skin' : heavy ? 'hitHeavy' : 'hit', null, { gain: heavy ? 1.2 : .9, rate: heavy ? .8 : 1, reverb: .3 });
    this.duckFor(.25, .45);
  }

  rattle() { this.patter(0.8); }

  // The other waist gunner's M2 a couple of metres away (LivingInterior.crewShot, every round):
  // positional (HRTF when there is room), inside the fuselage reverb; at most ~13 a second
  crewGun(pos: THREE.Vector3) {
    if (!this.ctx || this.mode !== 'bomber' || !this.crewGate.pass(this.ctx.currentTime)) return;
    const o: ShotOpts = { ref: 2.5, reverb: 0.75, delay: false, rate: 0.97 + Math.random() * 0.06 };
    this.play('m2', pos, { ...o, gain: 0.5 });
    this.play('m2thump', pos, { ...o, gain: 0.5, lp: 4000 });
  }

  // A spent casing landing (Brass.ts): on the floor heap (pile = true) a duller chink, else the
  // bright ring of brass on bare metal; rate-limited so a long burst does not turn into a shower
  brass(pile: boolean, gain = 1) {
    if (!this.ctx || !this.brassGate.pass(this.ctx.currentTime)) return;
    const g = (0.045 + Math.random() * 0.03) * fin(gain, 1, [0, 2]);
    if (pile && this.bufs.has('brassPile')) this.layer('brassPile', null, { reverb: 0.35, rate: 0.9 + Math.random() * 0.25 }, g * 1.4);
    else this.play('casing', null, { gain: g, rate: 0.9 + Math.random() * 0.3, reverb: 0.3 });
  }

  // Hits on the bomber shake the airframe: extra creaks (no-op outside the bomber)
  airframeHit(heavy: boolean) { this.creaks?.hit(heavy); }

  // Duck music + ambience to `depth` (and the effects to `fx`) for `seconds`. Requests
  // overlap: the deepest active one wins, so a gun burst during a radio call does not
  // release the call's duck early.
  duckFor(seconds: number, depth = 0.45, fx = 1) {
    if (!this.ctx || !ok(seconds) || !ok(depth) || !ok(fx)) return;
    const t = this.ctx.currentTime;
    seconds = Math.min(30, Math.max(0, seconds));
    this.ducks.add(t, seconds, depth, fx);
    this.ducks.schedule(this.duck.gain, t);
    this.ducks.schedule(this.fx.gain, t, true);
  }

  // Master limiter check (dev console: await sws.sound.limiterCheck()): renders `n` close
  // explosions stacked 40 ms apart over a gun burst through the master chain, offline, and
  // reports the peak going in and coming out (dBFS).
  async limiterCheck(n = 8) {
    const ex = this.bufs.get('explosion'), gun = this.bufs.get('m2'), thump = this.bufs.get('m2thump');
    if (!ex || !gun || !thump) return null;
    const crack = this.bufs.get('blastCrack'), boom = this.bufs.get('blastBoom');
    const sr = 48000, len = sr * 4;
    const run = async (chain: boolean) => {
      const oc = new OfflineAudioContext(2, len, sr);
      const [inp, out] = chain ? masterChain(oc) : [oc.createGain(), null];
      if (out) out.connect(oc.destination); else inp.connect(oc.destination);
      const vol = oc.createGain(); vol.gain.value = this.volume; vol.connect(inp);
      const add = (b: AudioBuffer, at: number, g: number) => { const s = oc.createBufferSource(); s.buffer = b; const gg = oc.createGain(); gg.gain.value = g; s.connect(gg).connect(vol); s.start(at); };
      for (let i = 0; i < n; i++) {
        add(ex[i % ex.length], 0.2 + i * 0.04, (this.gainMap.get('explosion') ?? 1) * 1.6);
        // pass-3 close layers at their in-game level (explode(): crack 0.7, boom 0.55 x size)
        if (crack) add(crack[i % crack.length], 0.2 + i * 0.04, 1.6 * 0.7 * (this.gainMap.get('blastCrack') ?? 1));
        if (boom) add(boom[i % boom.length], 0.2 + i * 0.04, 1.6 * 0.55 * 1.25 * (this.gainMap.get('blastBoom') ?? 1));
      }
      for (let i = 0; i < 40; i++) { add(gun[i % gun.length], 0.1 + i * 0.077, 0.9 * (this.gainMap.get('m2') ?? 1)); add(thump[i % thump.length], 0.1 + i * 0.077, 1.15); }
      const r = await oc.startRendering();
      let pk = 0;
      for (let c = 0; c < r.numberOfChannels; c++) { const d = r.getChannelData(c); for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); }
      return +(20 * Math.log10(pk)).toFixed(2);
    };
    return { stacked: n, inputPeakDb: await run(false), outputPeakDb: await run(true) };
  }

  // ---------------- dev meter (audio pass 3 measurements) ----------------
  // sws.sound.meterReset(); ... sws.sound.stats(): one-shots played / refused per priority
  // (0 far, 1 close / big, 2 player + UI: never refused), voices sounding now, output and
  // pre-limiter peaks since the reset (polled from the scopes by meterPoll(), call it often),
  // non-finite samples seen, and the AudioContext render capacity where the browser has it.
  meterReset() {
    this.meter.played = 0; this.meter.dropped = [0, 0, 0]; this.meter.peakIn = 0; this.meter.peakOut = 0; this.meter.nonFinite = 0;
    if (this.meter.rc) this.meter.rc = { avg: 0, peak: 0, underrun: 0, n: 0 };
  }
  meterPoll() {
    const d = this.scopeBuf;
    for (const [sc, k] of [[this.scope, 'peakOut'], [this.preScope, 'peakIn']] as const) {
      if (!sc) continue;
      sc.getFloatTimeDomainData(d);
      let pk = this.meter[k];
      for (let i = 0; i < d.length; i++) { const v = d[i]; if (!ok(v)) { this.meter.nonFinite++; continue; } const a = Math.abs(v); if (a > pk) pk = a; }
      this.meter[k] = pk;
    }
  }
  stats() {
    const now = this.ctx?.currentTime ?? 0;
    const dB = (v: number) => (v > 0 ? +(20 * Math.log10(v)).toFixed(2) : -Infinity);
    const m = this.meter;
    return {
      detail: this.detail, played: m.played, dropped: [...m.dropped], voicesNow: this.oneShots.count(now), hrtfNow: this.hrtfShots.count(now),
      engineVoices: this.voices.filter((v) => v.owner !== -1).length, engineAux: this.voices.filter((v) => v.aux && v.owner !== -1).length,
      peakOutDb: dB(m.peakOut), peakInDb: dB(m.peakIn), nonFinite: m.nonFinite,
      renderCapacity: m.rc && m.rc.n ? { avg: +(m.rc.avg / m.rc.n).toFixed(3), peak: +m.rc.peak.toFixed(3), underrunRatio: +m.rc.underrun.toFixed(4), updates: m.rc.n } : null,
      synthesised: [...this.synth3.keys()].length, state: this.ctx?.state ?? 'none', sampleRate: this.ctx?.sampleRate ?? 0, baseLatency: (this.ctx as any)?.baseLatency ?? null,
    };
  }
  // AudioContext.renderCapacity (Chrome 125+ with the feature on): average/peak load of the audio thread
  monitorRender(on = true): boolean {
    const rc = (this.ctx as any)?.renderCapacity;
    if (!rc) return false;
    if (!on) { try { rc.stop(); } catch { /* */ } return true; }
    this.meter.rc = { avg: 0, peak: 0, underrun: 0, n: 0 };
    rc.onupdate = (e: any) => { const r = this.meter.rc; if (!r) return; r.n++; r.avg += e.averageLoad; r.peak = Math.max(r.peak, e.peakLoad); r.underrun = Math.max(r.underrun, e.underrunRatio); };
    try { rc.start({ updateInterval: 0.5 }); } catch { return false; }
    return true;
  }

  // CPU cost of a worst case, measured offline (sws.sound.cpuCheck()): renders `seconds` of a
  // replica of a boss fight over a 30-fighter final wave through the same node types: the engine
  // voices (with their second loops), 4 warships x drone points, a full voice budget of
  // positional one-shots (HRTF for the close ones), both convolution reverbs and the master chain.
  // Returns the render time per audio second for both detail levels (1.0 = a whole core).
  // Airfield sounds of the bookends measured offline (swsSound.fieldCheck(), FieldCheck.ts): peak,
  // RMS, centroid, Doppler and non-finite samples per scenario, the old and new B-17 engine voices
  // side by side, and the belly-landing mix through the master chain.
  async fieldCheck() {
    if (!this.ctx) return null;
    this.synthAll();
    const { fieldCheck } = await import('./FieldCheck');
    return fieldCheck({
      radial: this.engineBufs.bmw, radialRate: this.radialRate, voiceGain: this.voiceGain, recorded: this.samplesLoaded,
      field: (n) => this.fieldBufs.get(n) ?? [], gain: (n) => this.gainMap.get(n) ?? 1, volume: this.volume,
    });
  }

  async cpuCheck(seconds = 6) {
    if (!this.ctx) return null;
    this.synthAll();
    const run = async (caps: DetailCaps) => {
      const sr = this.ctx!.sampleRate, oc = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
      const [inp, out] = masterChain(oc); out.connect(oc.destination);
      const rin = oc.createConvolver(); rin.buffer = this.revIn.buffer; const rout = oc.createConvolver(); rout.buffer = this.revOut.buffer;
      const sIn = oc.createGain(); sIn.gain.value = 0.5; sIn.connect(rin).connect(inp);
      const sOut = oc.createGain(); sOut.gain.value = 0.5; sOut.connect(rout).connect(inp);
      oc.listener.positionX.value = 0;
      const loop = (b: AudioBuffer, rate: number, to: AudioNode) => { const s = oc.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.connect(to); s.start(); };
      const pan = (x: number, y: number, z: number, hrtf: boolean) => { const p = oc.createPanner(); p.panningModel = hrtf ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 60; p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; p.connect(inp); p.connect(sOut); return p; };
      const kinds: EngineKind[] = ['jumoTwin', 'jet', 'pushpull', 'db603twin', 'bmw', 'rocket'];
      for (let i = 0; i < caps.engines; i++) {
        const k = kinds[i % kinds.length], [main, aux] = this.engineLoops(k);
        const f = oc.createBiquadFilter(); f.frequency.value = 1500; const g = oc.createGain(); g.gain.value = 0.3;
        f.connect(g).connect(pan(200 * Math.cos(i), 50, 200 * Math.sin(i), i < 2 && caps.hrtf > 2));
        loop(main, 1, f); if (aux && caps.aux) loop(aux, 1, f);
        loop(this.engineBufs.cyclone, 1, oc.createGain()); // whoosh loop stand-in (always running)
      }
      for (let s = 0; s < 4; s++) for (let e = 0; e < caps.shipEmitters; e++) {
        const f = oc.createBiquadFilter(); f.frequency.value = 340; const g = oc.createGain(); g.gain.value = 0.2;
        f.connect(g).connect(pan(800 + s * 300, 100, e * 60, false));
        loop(this.engineBufs.cyclone, 0.43, f); loop(this.engineBufs.bmw, 0.3, f);
        const o = oc.createOscillator(); o.frequency.value = 31; o.connect(f); o.start();
      }
      // a full one-shot budget, re-triggered as voices end
      const names: BufName[] = ['m2', 'mg131', 'mg81', 'cannon', 'explosion', 'flak', 'hit', 'thunder', 'blastBoom', 'whump', 'flak20'];
      let n = 0;
      for (let t = 0; t < seconds; t += 0.05) {
        for (let k = 0; k < Math.ceil(caps.voices * 0.05 / 0.5); k++) {
          const arr = this.bufs.get(names[n++ % names.length]); if (!arr) continue;
          const b = arr[n % arr.length], src = oc.createBufferSource(); src.buffer = b;
          const f = oc.createBiquadFilter(); f.frequency.value = 3000; const g = oc.createGain(); g.gain.value = 0.05;
          src.connect(f).connect(g).connect(pan(300 * Math.sin(n), 20, 300 * Math.cos(n), n % 8 < caps.hrtf));
          src.start(t); src.stop(t + 0.5);
        }
      }
      const t0 = performance.now();
      const r = await oc.startRendering();
      const ms = performance.now() - t0;
      let pk = 0, bad = 0;
      for (let c = 0; c < 2; c++) for (const v of r.getChannelData(c)) { if (!ok(v)) bad++; else pk = Math.max(pk, Math.abs(v)); }
      return { msPerAudioSecond: +(ms / seconds).toFixed(1), load: +(ms / seconds / 1000).toFixed(3), peakDb: +(20 * Math.log10(pk)).toFixed(2), nonFinite: bad };
    };
    return { normal: await run(DETAIL.normal), reduced: await run(DETAIL.reduced) };
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
    bus.connect(this.fx);
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
      u.rate = 1.08; u.pitch = 0.85 + (voiceIdx % 3) * 0.08; u.volume = 0.9 * this.volume * this.voiceVolume;
      // interphone static bed + squelch while the crewman talks
      u.onstart = () => this.radioBedOn(true);
      u.onend = () => this.radioBedOn(false);
      speechSynthesis.speak(u);
      this.duckFor(Math.min(4, 0.6 + text.length * 0.06), 0.6, 0.65);
    } catch { /* speech unavailable */ }
  }

  private radioBedOn(on: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.radioBed) {
      const src = this.loopSrc(this.radioStaticBuf ?? this.noiseLoop(2, 'pink'));
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = this.radioStaticBuf ? 0.3 : 1.2;
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.crewVoice);
      this.radioBed = { src, gain };
    }
    this.radioBed.gain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.05);
  }

  stopSpeech() { try { speechSynthesis.cancel(); } catch { /* ignore */ } this.radioBedOn(false); this.interphone?.cancel(); this.onStopSpeech?.(); }
  // Set by the recorded crew voices (Voice.ts) so mission end / quit also silences them
  onStopSpeech: (() => void) | null = null;
}

export const sound = new Sound();
// dev console: swsSound.limiterCheck(), swsSound.music.mood ...
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).swsSound = sound;
