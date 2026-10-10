// Entry bundled by loudness.mjs (esbuild, platform node): renders every synthesized buffer of
// the game's audio code against a stub AudioContext, so the loudness tool can measure them.
import { sound } from '../../src/audio/Sound';
import { hitSounds } from '../../src/audio/HitSounds';
import { playCue } from '../../src/audio/FeedbackCues';
import { AirframeCreaks } from '../../src/audio/Creaks';
import { taikoBar, brassBar, stringsBar, LAYER_SR } from '../../src/audio/MusicLayers';
import { LAYER_MIX } from '../../src/audio/Music';
import { SYNTH3 } from '../../src/audio/Synth3';

export interface Buf { name: string; sampleRate: number; channels: Float32Array[] }

class StubBuffer {
  readonly numberOfChannels: number; readonly length: number; readonly sampleRate: number;
  private data: Float32Array[];
  constructor(o: { length: number; numberOfChannels?: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels ?? 1; this.length = o.length; this.sampleRate = o.sampleRate;
    this.data = Array.from({ length: this.numberOfChannels }, () => new Float32Array(o.length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(c: number) { return this.data[c]; }
  copyToChannel(src: Float32Array, c: number) { this.data[c].set(src); }
}
const node = () => { const n: any = { gain: { value: 1 }, connect: () => n, disconnect() {} }; return n; };

export function render(sr = 44100): { bufs: Buf[]; layerMix: typeof LAYER_MIX } {
  (globalThis as any).AudioBuffer = StubBuffer;
  const ctx: any = {
    sampleRate: sr, currentTime: 0,
    createBuffer: (ch: number, n: number, rate: number) => new StubBuffer({ length: n, numberOfChannels: ch, sampleRate: rate }),
    createGain: node,
  };
  const out: Buf[] = [];
  const add = (name: string, b: any) => out.push({ name, sampleRate: b.sampleRate, channels: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)) });
  const s = sound as any;
  s.ctx = ctx;
  s.buildBuffers();
  for (const [name, arr] of s.bufs as Map<string, any[]>) arr.forEach((b, i) => add(`synth:${name}#${i}`, b));
  for (const [k, b] of Object.entries(s.engineBufs as Record<string, any>)) add(`synth:engine_${k}`, b);
  // audio pass 3 voices (Synth3.ts, built lazily in the game)
  for (const [name, def] of Object.entries(SYNTH3)) for (let i = 0; i < def.variants; i++) { const p = def.make(def.seed + i); out.push({ name: `synth3:${name}#${i}`, sampleRate: p.sr, channels: p.ch }); }
  hitSounds.init();
  const h = hitSounds as any;
  h.body.forEach((b: any, i: number) => add(`hit:body#${i}`, b));
  h.tick.forEach((pair: any[], t: number) => add(`hit:tick${t}`, pair[0]));
  h.crunch.forEach((b: any, i: number) => add(`hit:crunch#${i}`, b));
  h.kill.forEach((b: any, i: number) => add(`hit:kill#${i}`, b));
  s.playBuffer = (b: any) => add(`cue:${cueName}`, b);
  let cueName = '';
  for (const c of ['warn', 'ignite', 'douse'] as const) { cueName = c; playCue(c, 1); }
  const cr = new AirframeCreaks(ctx, node(), node()) as any;
  ['hinge', 'ticks', 'groan', 'rattle'].forEach((n, i) => add(`creak:${n}`, cr.clips[i].buf));
  // music layers at the tracks' tempi (spb), roots as in music_meta.json
  const mk = (name: string, d: Float32Array) => out.push({ name, sampleRate: LAYER_SR, channels: [d] });
  for (const [trk, spb] of [['tension', 60 / 83], ['combat', 60 / 166], ['climax', 60 / 130]] as const) {
    for (const p of ['heart', 'drive', 'fill'] as const) mk(`layer:${trk}:taiko_${p}`, taikoBar(spb, p, 11));
  }
  mk('layer:climax:brass_A', brassBar(60 / 130, 9, true, 21));
  mk('layer:climax:brass_F', brassBar(60 / 130, 5, true, 21));
  mk('layer:climax:strings_A', stringsBar(60 / 130, 9, true, 0, 31));
  return { bufs: out, layerMix: LAYER_MIX };
}
