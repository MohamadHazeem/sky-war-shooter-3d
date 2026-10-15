// Crew intercom playback: each crew member's received voice goes through an interphone filter
// (telephone band, a nasal presence peak and soft overdrive) into the crew-voice bus, with a
// squelch click + short static burst when a transmission opens and a click-off when it closes.
// The gain follows talk state, mute and volume (net/Intercom.ts voiceGain). Built lazily on the
// first transmission; everything is synthesised, no sample files.

export const RADIO_BAND = { lo: 320, hi: 3000, peak: 1700, peakDb: 5, drive: 2.6 } as const;
const RELEASE_S = 0.25;   // the talk-off event can overtake the last audio frames: let them out

// Soft overdrive (tanh), normalised so full scale stays full scale
export function radioCurve(n = 1024, drive: number = RADIO_BAND.drive): Float32Array {
  const c = new Float32Array(n), norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(drive * x) / norm; }
  return c;
}

interface Channel { track: MediaStreamTrack; src: MediaStreamAudioSourceNode; out: GainNode; el: HTMLAudioElement | null }

export class RadioVoice {
  private chans = new Map<number, Channel>();
  private curve: Float32Array<ArrayBuffer> | null = null;
  private clicks: { on: AudioBuffer; off: AudioBuffer } | null = null;
  private ctx: AudioContext | null = null;

  constructor(private context: () => AudioContext | null, private bus: () => AudioNode | null) {}

  // Feed crew member `id`'s received track (a new track replaces the old chain)
  attach(id: number, track: MediaStreamTrack | null) {
    const ctx = this.context(), bus = this.bus();
    if (!ctx || !bus || !track) return;
    if (ctx !== this.ctx) { this.dispose(); this.ctx = ctx; }
    const cur = this.chans.get(id);
    if (cur?.track === track) return;
    if (cur) this.drop(id);
    const stream = new MediaStream([track]);
    // Chrome only pulls a remote WebRTC track into Web Audio while a media element plays it too (muted)
    let el: HTMLAudioElement | null = null;
    try { el = new Audio(); el.muted = true; el.srcObject = stream; void el.play().catch(() => {}); } catch { el = null; }
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = RADIO_BAND.lo; hp.Q.value = 0.8;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = RADIO_BAND.peak; pk.Q.value = 1.2; pk.gain.value = RADIO_BAND.peakDb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = RADIO_BAND.hi; lp.Q.value = 0.9;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = RADIO_BAND.hi * 1.15; lp2.Q.value = 0.6;
    const sh = ctx.createWaveShaper(); sh.curve = (this.curve ??= radioCurve() as Float32Array<ArrayBuffer>); sh.oversample = '2x';
    const out = ctx.createGain(); out.gain.value = 0;
    src.connect(hp).connect(pk).connect(lp).connect(sh).connect(lp2).connect(out).connect(bus);
    this.chans.set(id, { track, src, out, el });
  }

  // Target loudness of crew member `id` (0 = silent)
  level(id: number, gain: number) {
    const c = this.chans.get(id), ctx = this.ctx;
    if (!c || !ctx) return;
    const t = ctx.currentTime;
    c.out.gain.cancelScheduledValues(t);
    if (gain > 0) c.out.gain.setTargetAtTime(gain, t, 0.015);
    else c.out.gain.setTargetAtTime(0, t + RELEASE_S, 0.03);
  }

  // Key-on click with a short static burst / key-off click
  squelch(on: boolean, gain = 0.5) {
    const ctx = this.context(), bus = this.bus();
    if (!ctx || !bus || gain <= 0) return;
    this.clicks ??= { on: this.render(ctx, 0.16, true), off: this.render(ctx, 0.08, false) };
    const s = ctx.createBufferSource(); s.buffer = on ? this.clicks.on : this.clicks.off;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(bus);
    s.start(ctx.currentTime + (on ? 0 : RELEASE_S));
  }

  private render(ctx: BaseAudioContext, dur: number, burst: boolean) {
    const sr = ctx.sampleRate, n = Math.floor(dur * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let lp = 0, hpY = 0, hpX = 0;
    const a = 1 - Math.exp(-2 * Math.PI * 3000 / sr), h = 1 / (1 + 2 * Math.PI * 400 / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr, x = Math.random() * 2 - 1;
      hpY = h * (hpY + x - hpX); hpX = x; lp += a * (hpY - lp);
      const click = Math.sin(2 * Math.PI * (burst ? 1400 : 950) * t) * Math.exp(-t * (burst ? 140 : 90)) * 0.6;
      const hiss = lp * (burst ? Math.min(1, t / 0.006) * Math.exp(-t * 22) : Math.exp(-t * 60)) * 0.9;
      d[i] = click + hiss;
    }
    return b;
  }

  private drop(id: number) {
    const c = this.chans.get(id);
    if (!c) return;
    try { c.src.disconnect(); c.out.disconnect(); } catch { /* already gone */ }
    if (c.el) { c.el.srcObject = null; }
    this.chans.delete(id);
  }

  dispose() { for (const id of [...this.chans.keys()]) this.drop(id); }
}
