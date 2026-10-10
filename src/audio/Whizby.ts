// Bullet whiz-bys: the zip of an enemy round passing close to the listener.
// - Three pre-rendered variants of band-passed noise whose band centre sweeps quickly
//   downward (the pitch drop of a passing object), with a fast rise and a swell that
//   peaks at closest approach.
// - Each zip is a positional, HRTF-panned one-shot placed at the round's position, so
//   the left/right and height of the pass come through the headphones.
// - Rate-limited: a volley of rounds past the gunner can't turn into a buzz.
import { GAIN, freeOnEnd, ok, place, setP } from './Safe';

const VARIANTS = 3;
const MAX_PER_SEC = 8;
const MIN_GAP = 1 / MAX_PER_SEC;

// Sweep start/end frequencies (Hz) per variant, so the three zips don't sound identical
const SWEEP: [number, number][] = [[4200, 1100], [3500, 900], [4800, 1400]];

// Mono one-shot: RBJ band-pass on white noise, centre frequency decays exponentially
// from f0 to f1 (the fast initial drop), amplitude follows a Gaussian swell around the
// point of closest approach (tp) with a short fade-in so there's no click at the start.
function makeZip(ctx: BaseAudioContext, variant: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 0.3 + variant * 0.02;
  const n = Math.floor(dur * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const [f0, f1] = SWEEP[variant];
  const tp = 0.07;      // closest approach
  const sigma = 0.065;  // swell width
  const Q = 3.2;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fc = f1 + (f0 - f1) * Math.exp(-t / 0.06);
    const w0 = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alpha) / a0;
    const x = Math.random() * 2 - 1;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const u = (t - tp) / sigma;
    const swell = Math.exp(-u * u) * Math.min(1, t / 0.008);
    const v = y * swell;
    d[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
  return buf;
}

export class Whizby {
  private zips: AudioBuffer[] = [];
  private last = -Infinity; // audio-clock time of the last zip started

  // room/hrtf: the engine's voice budget (Sound.ts) for one-shots and for HRTF panners
  constructor(private ctx: AudioContext, private out: AudioNode,
    private room: (when: number, dur: number) => boolean = () => true,
    private hrtf: (when: number, dur: number) => boolean = () => true) {
    for (let i = 0; i < VARIANTS; i++) this.zips.push(makeZip(ctx, i));
  }

  // pos is copied into the panner immediately (callers reuse their vector)
  play(pos: { x: number; y: number; z: number }, gain: number) {
    if (!ok(pos.x) || !ok(pos.y) || !ok(pos.z) || !ok(gain)) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.last < MIN_GAP) return;
    const buf = this.zips[Math.floor(Math.random() * this.zips.length)];
    const rate = 0.94 + Math.random() * 0.12;
    const dur = buf.duration / rate;
    if (!this.room(now, dur)) return;
    this.last = now;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    setP(g.gain, gain, GAIN);
    const p = ctx.createPanner();
    p.panningModel = this.hrtf(now, dur) ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    // the round passes within a few metres, so keep it at full level across that range
    p.refDistance = 10; p.rolloffFactor = 1; p.maxDistance = 200;
    place(p, pos.x, pos.y, pos.z);

    src.connect(g).connect(p).connect(this.out);
    freeOnEnd(src, [g, p]);
    src.start(now);
  }
}
