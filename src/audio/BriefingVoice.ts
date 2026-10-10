// Recorded mission briefings: the intelligence officer reads the briefing paragraphs aloud.
// One clip per paragraph, public/audio/voice/brief_<mission id>_<n>.m4a (tools/voice/briefings.mjs
// + generate.py). Played clean, not through the radio chain (he is in the room with you), on the
// sfx bus with the music ducked under him. A missing clip is skipped, so a briefing whose text
// changed after the last render simply reads the paragraphs it has.
import { sound } from './Sound';

const BASE = import.meta.env.BASE_URL + 'audio/voice/';
const GAIN = 0.95;
const GAP_S = 0.55;        // pause between paragraphs
const DUCK_DEPTH = 0.5;    // music level while he talks

export const briefingClipId = (missionId: string, paragraph: number) => `brief_${missionId}_${paragraph + 1}`;

export interface BriefingListener {
  paragraph?(i: number): void;  // paragraph i starts
  end?(completed: boolean): void;
}

class BriefingVoice {
  private run = 0;                                         // bumps on every play/stop: stale callbacks bail out
  private bufs = new Map<string, Promise<AudioBuffer | null>>();
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private listener: BriefingListener | null = null;
  playing = false;

  // Auto-play follows the Settings "Radio voices" switch; the Play button works regardless
  get autoEnabled() { return sound.radioEnabled; }

  // Start fetching a mission's clips (the briefing screen calls this as it opens)
  preload(missionId: string, count: number) {
    const ctx = sound.ctx;
    if (!ctx) return;
    // keep only this mission's clips around
    for (const k of this.bufs.keys()) if (!k.startsWith(`brief_${missionId}_`)) this.bufs.delete(k);
    for (let i = 0; i < count; i++) this.load(ctx, briefingClipId(missionId, i));
  }

  async play(missionId: string, count: number, from = 0, l: BriefingListener = {}) {
    this.stop();
    const run = ++this.run;
    this.listener = l;
    this.playing = true;
    const ctx = sound.ctx;
    const bus = sound.sfxBus();
    if (!ctx || !bus) { this.done(run, false); return; }
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    this.preload(missionId, count);
    for (let i = from; i < count; i++) {
      const buf = await this.load(ctx, briefingClipId(missionId, i));
      if (run !== this.run) return;
      if (!buf) continue;
      l.paragraph?.(i);
      await this.playBuf(ctx, bus, buf, run);
      if (run !== this.run) return;
      await new Promise((r) => setTimeout(r, GAP_S * 1000));
      if (run !== this.run) return;
    }
    this.done(run, true);
  }

  stop() {
    this.run++;
    if (this.src) { try { this.src.onended = null; this.src.stop(); } catch { /* not started */ } }
    this.src?.disconnect(); this.gain?.disconnect();
    this.src = null; this.gain = null;
    if (this.playing) { this.playing = false; const l = this.listener; this.listener = null; l?.end?.(false); }
    // let the music come back up
    if (sound.ctx) sound.duckFor(0.01, 1);
  }

  private done(run: number, completed: boolean) {
    if (run !== this.run) return;
    this.playing = false;
    const l = this.listener; this.listener = null;
    l?.end?.(completed);
  }

  private playBuf(ctx: AudioContext, bus: AudioNode, buf: AudioBuffer, run: number): Promise<void> {
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = GAIN;
      src.connect(g).connect(bus);
      this.src = src; this.gain = g;
      src.onended = () => { src.disconnect(); g.disconnect(); if (this.src === src) { this.src = null; this.gain = null; } resolve(); };
      src.start(ctx.currentTime + 0.02);
      sound.duckFor(buf.duration + 0.3, DUCK_DEPTH);
      // a suspended context never fires onended: give up after the clip's length plus slack
      setTimeout(() => { if (run === this.run && this.src === src) { try { src.stop(); } catch { /* */ } } }, (buf.duration + 3) * 1000);
    });
  }

  private load(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
    let p = this.bufs.get(id);
    if (!p) {
      p = (async () => {
        try {
          const r = await fetch(BASE + id + '.m4a');
          // a dev server / SPA host answers a missing file with index.html
          if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) return null;
          const data = await r.arrayBuffer();
          return await new Promise<AudioBuffer | null>((res) => {
            const pr = ctx.decodeAudioData(data, res, () => res(null)) as Promise<AudioBuffer> | undefined;
            pr?.catch(() => res(null));
          });
        } catch { return null; }
      })();
      this.bufs.set(id, p);
    }
    return p;
  }
}

export const briefingVoice = new BriefingVoice();
