// Robustness helpers for the audio graph.
// - Finite-safe AudioParam writes: a NaN or Infinity throws in the setters, and a huge but
//   finite value can blow up a biquad or compressor state, which in Chrome then silences
//   the whole graph for good. Non-finite values are skipped (the param keeps its last
//   value), finite ones are clamped to a sane range.
// - A voice budget that counts overlapping scheduled one-shots, so bursts of gunfire
//   cannot overload the audio thread.

export type Range = readonly [number, number];
export const GAIN: Range = [0, 16];
export const FREQ: Range = [10, 22000];
export const RATE: Range = [0.05, 8];
export const POS: Range = [-1e6, 1e6];

export const ok = Number.isFinite;
export const lim = (v: number, r: Range) => Math.min(r[1], Math.max(r[0], v));
// v if finite (clamped to r), else def
export const fin = (v: number, def: number, r: Range = POS) => (ok(v) ? lim(v, r) : def);

export function setP(p: AudioParam, v: number, r: Range) { if (ok(v)) p.value = lim(v, r); }
export function towards(p: AudioParam, v: number, r: Range, t: number, tc: number) {
  if (ok(v) && ok(t)) p.setTargetAtTime(lim(v, r), t, Math.max(0.001, tc));
}

// Panner position (immediate, or at audio time t); skipped whole if any axis is non-finite
export function place(p: PannerNode, x: number, y: number, z: number, t?: number) {
  if (!ok(x) || !ok(y) || !ok(z)) return;
  x = lim(x, POS); y = lim(y, POS); z = lim(z, POS);
  if (t === undefined) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else { p.positionX.setValueAtTime(x, t); p.positionY.setValueAtTime(y, t); p.positionZ.setValueAtTime(z, t); }
}

// Disconnect a one-shot's nodes once its source has ended, so nothing stays wired to the buses
export function freeOnEnd(src: AudioScheduledSourceNode, nodes: AudioNode[]) {
  src.onended = () => { src.disconnect(); for (const n of nodes) n.disconnect(); };
}

// Overlap counter for scheduled one-shots, [start, end) in audio-clock seconds
export class Budget {
  private s: number[] = [];
  private e: number[] = [];
  constructor(readonly max: number) {}

  // Room for one more starting at `when`? Prunes what ended before `now`; slack raises the cap.
  take(now: number, when: number, dur: number, slack = 0): boolean {
    const S = this.s, E = this.e;
    let j = 0, n = 0;
    for (let i = 0; i < S.length; i++) {
      if (E[i] <= now) continue;
      S[j] = S[i]; E[j] = E[i]; j++;
      if (S[i] <= when && E[i] > when) n++;
    }
    S.length = j; E.length = j;
    if (n >= this.max + slack) return false;
    S.push(when); E.push(when + Math.max(0.05, ok(dur) ? dur : 1));
    return true;
  }

  clear() { this.s.length = 0; this.e.length = 0; }
}
