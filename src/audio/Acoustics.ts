// Pure acoustics helpers (no Web Audio): distance delay and air absorption, the distance
// character of an explosion, blast ducking, which engine voice an aircraft type gets, and
// the engine "aspect" (which end of the aircraft faces the listener). Unit-tested in Node
// (tests/audio3.test.ts); Sound.ts, BossDrone.ts and Cabin.ts use them.

export const SPEED_OF_SOUND = 343; // m/s

const finite = (v: number, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, finite(v, lo)));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Seconds until a sound made `d` metres away arrives
export function soundDelay(d: number): number { return Math.max(0, finite(d)) / SPEED_OF_SOUND; }

// Low-pass cutoff (Hz) for a sound `d` metres away: the air eats the highs first.
// interior: heard from inside the bomber's fuselage (the skin muffles everything outside).
// Same curve the one-shots have always used (18 kHz near, ~6.6 kHz at 1 km, 150 Hz floor).
export function airLowpass(d: number, interior = false): number {
  const f = Math.max(150, 18000 * Math.exp(-Math.max(0, finite(d)) / 1000));
  return interior ? f * 0.55 : f;
}

// Darker curve for the rolling thunder of distant blasts (only the lows travel far)
export function thunderLowpass(d: number, interior = false): number {
  const f = Math.max(110, 1400 * Math.exp(-Math.max(0, finite(d) - 600) / 2500));
  return interior ? f * 0.7 : f;
}

export type BlastSize = 'small' | 'fighter' | 'heavy' | 'warship';

// How an explosion `d` metres away is built from its layers (gains 0..1):
//   crack    sharp shock crack, only close (< ~600 m)
//   boom     felt low boom, close to mid range (< ~1.6 km)
//   body     the recorded explosion (it carries the mid range)
//   thunder  rolling far rumble with no highs, takes over past ~1 km
export interface BlastMix { crack: number; boom: number; body: number; thunder: number }
export function blastMix(d: number): BlastMix {
  d = Math.max(0, finite(d, 1e9));
  return {
    crack: 1 - smooth(120, 600, d),
    boom: 1 - smooth(300, 1600, d),
    body: 1 - smooth(1200, 3200, d),
    thunder: smooth(500, 1800, d),
  };
}

// Extra stages after the first blast (seconds after it, relative gain, playback rate):
// fuel tanks and bomb loads cooking off in a heavy, a chain along a warship's hull.
export function blastStages(size: BlastSize, rnd: () => number = Math.random): { at: number; gain: number; rate: number }[] {
  if (size === 'heavy') return [
    { at: 0.28 + rnd() * 0.18, gain: 0.75, rate: 0.82 + rnd() * 0.08 },
    { at: 0.8 + rnd() * 0.4, gain: 0.55, rate: 0.7 + rnd() * 0.08 },
  ];
  if (size === 'warship') return [
    { at: 0.35 + rnd() * 0.2, gain: 0.8, rate: 0.7 },
    { at: 0.9 + rnd() * 0.3, gain: 0.7, rate: 0.62 },
    { at: 1.6 + rnd() * 0.5, gain: 0.6, rate: 0.55 },
  ];
  return [];
}

// Music + ambience duck for a blast `d` m away: null when it is too far to matter.
// depth is the bus level during the duck (lower = deeper); bigger blasts duck from further.
export function blastDuck(d: number, size: BlastSize = 'fighter'): { depth: number; seconds: number } | null {
  const reach = size === 'warship' ? 900 : size === 'heavy' ? 550 : size === 'small' ? 180 : 350;
  d = finite(d, Infinity);
  if (!(d < reach)) return null;
  const k = 1 - d / reach;                       // 1 at the blast, 0 at the edge
  return { depth: 1 - 0.55 * k, seconds: 0.35 + 0.9 * k + (size === 'warship' ? 0.8 : 0) };
}

// ---------------------------------------------------------------- engine voices
export type EngineKind = 'bmw' | 'merlin' | 'jumoTwin' | 'db603twin' | 'pushpull' | 'jet' | 'rocket';

export interface EngineSpec {
  aux: number;         // level of the second loop (Do 335 rear pusher, Me 262 turbine whine); 0: none
  cutoff: number;      // distance low-pass base (Hz, outside); interior uses 40% of it
  gain: number;        // level on the voice (synthesised loops, matched by RMS to the recorded radial x its gain)
  rate: [number, number]; // playback rate at idle and full throttle (before Doppler)
}
// gains: loop RMS (tools/audio/audio3_report.mjs) jumoTwin -13.1, db603twin -15.8, pushFront -14.1,
// pushRear -16.9, jetRoar -11.5, jetWhine -10.2, rocket -15.3 dBFS against the recorded radial
// -19.5 x 0.8 and Merlin -16.0 x 0.8: the twins and the rocket sit ~2-4 dB over a single fighter
export const ENGINE_SPECS: Record<EngineKind, EngineSpec> = {
  bmw: { aux: 0, cutoff: 1600, gain: 1, rate: [0.82, 1.04] },
  merlin: { aux: 0, cutoff: 1600, gain: 1, rate: [0.82, 1.04] },
  jumoTwin: { aux: 0, cutoff: 1100, gain: 0.7, rate: [0.9, 1.02] },
  db603twin: { aux: 0, cutoff: 1500, gain: 0.85, rate: [0.88, 1.05] },
  pushpull: { aux: 0.9, cutoff: 1800, gain: 0.7, rate: [0.86, 1.06] },
  jet: { aux: 0.3, cutoff: 5200, gain: 0.5, rate: [0.8, 1.08] },
  rocket: { aux: 0, cutoff: 4200, gain: 0.9, rate: [0.97, 1.03] },
};

// Which engine voice an aircraft gets. kind: its model (ModelKind), type: EnemyType ('' for allies)
export function engineKindOf(kind: string, type = ''): EngineKind {
  switch (type || kind) {
    case 'fw190': return 'bmw';
    case 'he111': case 'ju88': return 'jumoTwin';      // twin Jumo 211
    case 'me410': case 'bf110': return 'db603twin';    // twin DB 603 / DB 601
    case 'do335': return 'pushpull';                   // DB 603 fore and aft
    case 'me262': return 'jet';                        // twin Jumo 004
    case 'me163': return 'rocket';                     // Walter HWK 509
    default: return 'merlin';                          // P-51, Spitfire, Bf 109 (V-12 recording)
  }
}

// Per-type rate trim on a shared loop (Ju 88 runs its Jumos a little faster than the laden He 111,
// the Bf 110's DB 601s a little slower than the Me 410's DB 603s)
export function engineRateTrim(kind: string, type = ''): number {
  const k = type || kind;
  return k === 'ju88' ? 1.06 : k === 'bf110' ? 0.94 : 1;
}

// Aspect of an aircraft to the listener: fwd = unit flight direction, toL = unit vector from the
// aircraft to the listener. Returns how much the listener hears the nose (front) and the tail (rear)
// end, each 0..1 (cardioid-like, never fully silent).
export function aspect(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): { front: number; rear: number } {
  const c = clamp(fx * tx + fy * ty + fz * tz, -1, 1); // +1 listener dead ahead, -1 dead astern
  return { front: 0.25 + 0.75 * (0.5 + 0.5 * c), rear: 0.25 + 0.75 * (0.5 - 0.5 * c) };
}

// Doppler factor for a source closing on the listener at vr m/s (positive = approaching),
// limited so a 900 km/h jet cannot drive the rate to absurd values
export function doppler(vr: number): number {
  return SPEED_OF_SOUND / Math.max(110, SPEED_OF_SOUND - clamp(vr, -2000, 2000));
}

// ---------------------------------------------------------------- rate limiter
// At most one event per `gap` seconds (pure: the caller passes the clock)
export class RateGate {
  private last = -Infinity;
  constructor(public gap: number) {}
  pass(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    if (now < this.last) this.last = -Infinity; // clock restarted (new AudioContext)
    if (now - this.last < this.gap) return false;
    this.last = now;
    return true;
  }
}

// ---------------------------------------------------------------- audio detail
export type AudioDetail = 'normal' | 'reduced';
export interface DetailCaps { voices: number; hrtf: number; engines: number; aux: boolean; shipEmitters: number; stages: boolean; cabinBed: boolean }
export const DETAIL: Record<AudioDetail, DetailCaps> = {
  normal: { voices: 48, hrtf: 6, engines: 6, aux: true, shipEmitters: 3, stages: true, cabinBed: true },
  reduced: { voices: 28, hrtf: 2, engines: 4, aux: false, shipEmitters: 1, stages: false, cabinBed: false },
};
