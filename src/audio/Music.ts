// Procedural score in D minor. Menu: slow string pads and a horn line. Missions: an
// ostinato, a military snare and timpani that grow with combat intensity. Also short
// victory/defeat stingers for the debrief.
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Chord = number[]; // MIDI notes, root first
const Dm: Chord = [50, 53, 57], Bb: Chord = [46, 50, 53], Gm: Chord = [43, 50, 55], A: Chord = [45, 49, 52], C: Chord = [48, 52, 55], F: Chord = [41, 48, 53];

const MENU_PROG = [Dm, Bb, Gm, A];
const MISSION_PROG = [Dm, Dm, Bb, C, Dm, F, Gm, A];
// slow horn melody for the menu (one entry per beat, 0 = rest)
const MENU_MELODY = [69, 0, 65, 0, 62, 0, 0, 0, 67, 0, 65, 64, 69, 0, 0, 0, 74, 0, 72, 0, 70, 0, 69, 0, 67, 0, 65, 0, 64, 0, 0, 0];

export class Music {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private rev!: AudioNode;
  private noise!: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private scene: 'menu' | 'mission' | 'none' = 'none';
  private intensity = 0;
  private smoothIntensity = 0;
  enabled = true;

  init(ctx: AudioContext, dest: AudioNode, reverb: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const send = ctx.createGain(); send.gain.value = 0.9;
    this.out.connect(send).connect(reverb);
    this.rev = reverb;
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  setIntensity(x: number) { this.intensity = x; }

  setScene(s: 'menu' | 'mission') {
    if (!this.ctx || s === this.scene) return;
    this.scene = s;
    this.beat = 0;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(this.enabled ? (s === 'menu' ? 0.5 : 0.32) : 0, t, 1.0);
    if (!this.timer) {
      this.nextTime = t + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 50);
    }
  }

  stop() {
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }

  stinger(win: boolean) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.05;
    const chord = win ? [50, 54, 57, 62, 66] : [38, 45, 50, 53];
    for (const m of chord) this.pad(mtof(m), t, 4.5, 0.05, win ? 1600 : 700);
    this.timpani(win ? mtof(38) : mtof(33), t, 1.2);
    if (win) this.horn([62, 66, 69, 74], t + 0.4, 0.55);
  }

  private schedule() {
    const ctx = this.ctx!;
    if (this.scene === 'none' || !this.enabled) { this.nextTime = ctx.currentTime + 0.1; return; }
    const bpm = this.scene === 'menu' ? 64 : 96;
    const spb = 60 / bpm;
    this.smoothIntensity += (this.intensity - this.smoothIntensity) * 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playBeat(this.nextTime, spb);
      this.nextTime += spb;
      this.beat++;
    }
  }

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
    }
  }

  private bass(freq: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.3); g.gain.setTargetAtTime(0, t + dur * 0.8, 0.3);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 1.5);
  }

  private pluck(freq: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
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
    }
  }

  private snare(t: number, gain: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 1 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + 0.2);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const og = ctx.createGain(); og.gain.setValueAtTime(gain * 0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.1);
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
      o.connect(g).connect(this.out); o.start(t); o.stop(t + 1.7);
    }
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 0.3);
  }
}
