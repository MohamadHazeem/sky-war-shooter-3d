// Recorded crew voices over the interphone / radio.
// Clips are generated offline (tools/voice/generate.py, macOS `say`) into public/audio/voice/
// with a manifest (id -> file, role, text, duration). This plays them through a radio chain:
// interphone call-click and static burst, telephone band-pass (~300-3400 Hz), light
// saturation, a little static under the voice, click-off at the end. Music and ambience
// duck slightly while someone talks.
// - Lazy: the manifest loads after the first user gesture, each clip on first use (decoded
//   at 16 kHz, least recently used dropped past CACHE_S seconds of audio).
// - One line at a time: a small priority queue, stale lines expire, low-priority chatter is
//   rate-limited, a critical line cuts off chatter.
// - Missing clip: nothing plays (the subtitle still shows).
// API: voice.say(id, opts), voice.sayClock(prefixId, "nine o'clock low"), voice.sayLine(speaker,
// text, priority) for subtitle lines (World.callout), voice.enabled.
import { sound } from './Sound';
import { Interphone } from './Interphone';
import { FREQ, GAIN, fin, ok, setP } from './Safe';

interface Clip { file: string; role: string; text: string; dur: number }
interface Manifest {
  version: number;
  roles: Record<string, { speaker: string; aliases?: string[] }>;
  clockRoles?: string[];
  clips: Record<string, Clip>;
}

export interface SayOpts {
  priority?: number;  // 0 chatter, 1 normal, 2 important, 3 critical (cuts off chatter)
  maxDelay?: number;  // seconds the line may wait in the queue before it is dropped as stale
  speaker?: string;   // subtitle speaker ('Tail', 'Top Turret'...): picks his take of a multi-speaker line
  gain?: number;
}

const BASE = import.meta.env.BASE_URL + 'audio/voice/';
const LEAD_S = 0.3;            // call-click to first word (same as INTERPHONE_LEAD_S, so the subtitle lands with the voice)
const TAIL_S = 0.14;           // last word to click-off
const JOIN_S = 0.03;           // gap between joined clips ("Bandits," + "nine o'clock low!")
const LINE_GAP_S = 0.25;       // between two lines
const MAX_QUEUE = 4;
const RATE_WINDOW_S = 10;      // at most RATE_MAX lines below priority 2 per window
const RATE_MAX = 4;
const CACHE_S = 240;           // decoded audio kept in memory, seconds
const VOICE_GAIN = 1.15;       // radio chain output level on the sfx bus
const STATIC_GAIN = 0.05;      // static bed under the voice (before the band-pass)
const DUCK_DEPTH = 0.72;       // music + ambience level while someone talks
const HOURS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const CLOCK_RX = new RegExp(`^(.*?,)\\s*(${HOURS.slice(1).join('|')}) o'clock (high|level|low)!?\\s*(.*)$`, 'i');
const CLOCK_WORDS_RX = new RegExp(`(${HOURS.slice(1).join('|')}) o'clock (high|level|low)`, 'i');
// decoded as soon as the manifest is in, so the first lines of a mission are not late
const WARM = ['start_gunner', 'start_pilot', 'rc_round_start', 'rc_next_wave'];

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const now = () => performance.now() / 1000;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

interface Item { ids: string[]; prio: number; expires: number; seq: number; gain: number }
interface Playing { item: Item; ctx: AudioContext; srcs: AudioScheduledSourceNode[]; nodes: AudioNode[]; done: boolean; timer: number }

// Recorded voices used to default off (browser speechSynthesis): switch the Settings toggle on
// once for players whose saved settings still hold the old default. Runs before Game loads them.
function migrateRadioDefault() {
  try {
    const FLAG = 'sws3d.voice.v1', KEY = 'sws3d.settings.v2';
    if (localStorage.getItem(FLAG)) return;
    localStorage.setItem(FLAG, '1');
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s && s.radio === false) { s.radio = true; localStorage.setItem(KEY, JSON.stringify(s)); }
  } catch { /* storage unavailable */ }
}

export class Voice {
  private on = true;
  private man: Manifest | null = null;
  private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private byText = new Map<string, string[]>();     // normalised text -> clip ids
  private variants = new Map<string, string[]>();   // base id -> per-role ids (id__role)
  private roleBySpeaker = new Map<string, string>();
  private bufs = new Map<string, AudioBuffer>();    // insertion order = least recently used first
  private cachedS = 0;
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private missing = new Set<string>();
  private decoder: BaseAudioContext | null = null;
  private queue: Item[] = [];
  private playing: Playing | null = null;
  private seq = 0;
  private recent: number[] = [];
  private nextAt = 0;
  private timer = 0;
  // radio chain of the live AudioContext (rebuilt when Sound rebuilds its context)
  private ctx: AudioContext | null = null;
  private input: GainNode | null = null;
  private interphone: Interphone | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    migrateRadioDefault();
    const go = () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); void this.load(); };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    sound.onStopSpeech = () => this.stop();
  }

  // Heard only when this is on and the Settings "Radio voices" toggle (sound.radioEnabled) is on
  get enabled() { return this.on && sound.radioEnabled; }
  set enabled(v: boolean) { this.on = v; if (!v) this.stop(); }
  // Manifest loaded: recorded clips exist (speechSynthesis stays off from then on)
  get ready() { return this.state === 'ready'; }

  // ---------- public API ----------

  // A named line: 'rc_evasive', or a multi-speaker line 'kill_going_down' (opts.speaker picks
  // whose take, else a random one) or one take directly ('kill_going_down__tail').
  say(id: string, opts: SayOpts = {}): boolean {
    if (!this.enabled || !this.man) return false;
    const clip = this.idFor(id, opts.speaker);
    return clip ? this.enqueue([clip], opts) : false;
  }

  // "Bandits," + "nine o'clock low!": prefixId is a pfx_* line (or one take of it), clockWords
  // as World.clockPosition() writes them. Uses a role that has both the prefix and the clock clip.
  sayClock(prefixId: string, clockWords: string, opts: SayOpts = {}): boolean {
    if (!this.enabled || !this.man) return false;
    const m = CLOCK_WORDS_RX.exec(clockWords);
    if (!m) return false;
    const ids = this.man.clips[prefixId] ? [prefixId] : this.variants.get(prefixId) ?? [];
    const seq = this.clockSeq(ids, HOURS.indexOf(m[1].toLowerCase()), m[2].toLowerCase(), null, this.roleOf(opts.speaker));
    return seq ? this.enqueue(seq, opts) : false;
  }

  // Hook for subtitle lines (World.callout -> Game's radio event). Returns true when the
  // recorded voice takes care of the line's audio (clip queued, or no clip: just the
  // interphone click); false when it is off or has no clips, so the old path runs.
  sayLine(speaker: string, text: string, priority = 1): boolean {
    if (!this.enabled || this.state !== 'ready') return false;
    const ids = this.resolve(speaker, text);
    if (ids) this.enqueue(ids, { priority });
    else if (!this.playing) sound.radioStatic();
    return true;
  }

  // Silence: drop the queue and cut the current line (mission end, quit, toggle off)
  stop() {
    this.queue = [];
    if (this.playing) this.finish(this.playing);
    this.interphone?.cancel();
  }

  // ---------- lookup ----------

  private roleOf(speaker?: string) { return speaker ? this.roleBySpeaker.get(norm(speaker)) : undefined; }

  private idFor(id: string, speaker?: string): string | null {
    if (this.man!.clips[id]) return id;
    const v = this.variants.get(id);
    if (!v?.length) return null;
    const role = this.roleOf(speaker);
    return v.find((x) => this.man!.clips[x].role === role) ?? pick(v);
  }

  // Clip ids for a subtitle: exact text (the speaker's own take first), else a clock call
  // "Prefix, nine o'clock low! [Suffix]" from prefix + clock (+ suffix) clips of one role.
  private resolve(speaker: string, text: string): string[] | null {
    const clips = this.man!.clips;
    const role = this.roleOf(speaker);
    const exact = this.byText.get(norm(text));
    if (exact) return [exact.find((id) => clips[id].role === role) ?? pick(exact)];
    const m = CLOCK_RX.exec(text.replace(/[‘’]/g, "'").trim());
    if (!m) return null;
    const pres = this.byText.get(norm(m[1]));
    return pres ? this.clockSeq(pres, HOURS.indexOf(m[2].toLowerCase()), m[3].toLowerCase(), m[4] || null, role) : null;
  }

  private clockSeq(prefixIds: string[], hour: number, level: string, suffix: string | null, role?: string): string[] | null {
    const clips = this.man!.clips;
    if (hour < 1 || !prefixIds.length) return null;
    const roles = [...new Set(prefixIds.map((id) => clips[id].role))];
    // the speaker's own voice first, then the others in random order
    roles.sort((a, b) => (b === role ? 1 : 0) - (a === role ? 1 : 0) || Math.random() - 0.5);
    const sfx = suffix ? this.byText.get(norm(suffix)) : null;
    if (suffix && !sfx) return null;
    for (const r of roles) {
      const p = prefixIds.find((id) => clips[id].role === r);
      const c = `clock_${hour}_${level}__${r}`;
      if (!p || !clips[c]) continue;
      if (!sfx) return [p, c];
      const s = sfx.find((id) => clips[id].role === r);
      if (s) return [p, c, s];
    }
    return null;
  }

  // ---------- loading ----------

  private async load() {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const r = await fetch(BASE + 'manifest.json');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.json()) as Manifest;
      if (!m || typeof m.clips !== 'object') throw new Error('bad manifest');
      for (const [role, info] of Object.entries(m.roles ?? {})) {
        for (const s of [info.speaker, ...(info.aliases ?? [])]) if (s) this.roleBySpeaker.set(norm(s), role);
      }
      for (const [id, c] of Object.entries(m.clips)) {
        if (!c || typeof c.file !== 'string' || typeof c.text !== 'string') continue;
        const k = norm(c.text);
        (this.byText.get(k) ?? this.byText.set(k, []).get(k)!).push(id);
        const cut = id.indexOf('__');
        if (cut > 0) { const base = id.slice(0, cut); (this.variants.get(base) ?? this.variants.set(base, []).get(base)!).push(id); }
      }
      this.man = m;
      this.state = 'ready';
      for (const id of WARM) { const v = this.man.clips[id] ? [id] : this.variants.get(id) ?? []; for (const x of v) void this.fetchBuf(x); }
    } catch (e) {
      this.state = 'failed';
      console.info('Voice: no recorded crew voices', e);
    }
  }

  private decodeCtx(): BaseAudioContext | null {
    if (!this.decoder) {
      // decode at the clips' own rate: 3x less memory than the 48 kHz context, no resampling
      for (const sr of [16000, 22050, 44100]) {
        try { this.decoder = new OfflineAudioContext(1, 1, sr); break; } catch { /* rate unsupported */ }
      }
    }
    return this.decoder ?? sound.ctx;
  }

  private fetchBuf(id: string): Promise<AudioBuffer | null> {
    const have = this.bufs.get(id);
    if (have) { this.bufs.delete(id); this.bufs.set(id, have); return Promise.resolve(have); }
    if (this.missing.has(id)) return Promise.resolve(null);
    const p0 = this.pending.get(id);
    if (p0) return p0;
    const clip = this.man?.clips[id];
    if (!clip) return Promise.resolve(null);
    const p = (async () => {
      try {
        const r = await fetch(BASE + clip.file);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.arrayBuffer();
        const dc = this.decodeCtx();
        if (!dc) throw new Error('no audio context');
        const buf = await new Promise<AudioBuffer>((res, rej) => {
          const pr = dc.decodeAudioData(data, res, rej) as Promise<AudioBuffer> | undefined;
          pr?.then(res, rej);
        });
        if (!ok(buf.duration) || buf.duration <= 0) throw new Error('empty clip');
        this.bufs.set(id, buf);
        this.cachedS += buf.duration;
        this.evict();
        return buf;
      } catch {
        this.missing.add(id);
        return null;
      } finally {
        this.pending.delete(id);
      }
    })();
    this.pending.set(id, p);
    return p;
  }

  private evict() {
    const busy = new Set([...(this.playing?.item.ids ?? []), ...this.queue.flatMap((q) => q.ids)]);
    for (const [id, b] of this.bufs) {
      if (this.cachedS <= CACHE_S) break;
      if (busy.has(id)) continue;
      this.bufs.delete(id);
      this.cachedS -= b.duration;
    }
  }

  // ---------- queue ----------

  private enqueue(ids: string[], opts: SayOpts): boolean {
    const t = now();
    const prio = fin(opts.priority ?? 1, 1, [0, 9]);
    const key = ids.join('+');
    if (this.playing?.item.ids.join('+') === key || this.queue.some((q) => q.ids.join('+') === key)) return false;
    if (prio < 2) {
      this.recent = this.recent.filter((s) => t - s < RATE_WINDOW_S);
      if (this.recent.length >= RATE_MAX) return false;
    }
    const maxDelay = fin(opts.maxDelay ?? (prio >= 3 ? 8 : prio >= 2 ? 4.5 : 3), 3, [0.1, 60]);
    this.queue.push({ ids, prio, expires: t + maxDelay, seq: this.seq++, gain: fin(opts.gain ?? 1, 1, [0, 4]) });
    // overflow: drop the lowest priority, oldest first
    while (this.queue.length > MAX_QUEUE) {
      let w = 0;
      for (let i = 1; i < this.queue.length; i++) {
        const a = this.queue[i], b = this.queue[w];
        if (a.prio < b.prio || (a.prio === b.prio && a.seq < b.seq)) w = i;
      }
      this.queue.splice(w, 1);
    }
    for (const id of ids) void this.fetchBuf(id).then(() => this.pump());
    // a critical call cuts off chatter
    if (this.playing && prio >= 3 && this.playing.item.prio <= 1) this.finish(this.playing);
    this.pump();
    return true;
  }

  private later(s: number) {
    if (this.timer) return;
    this.timer = window.setTimeout(() => { this.timer = 0; this.pump(); }, Math.max(16, s * 1000));
  }

  private pump() {
    if (this.playing || !this.queue.length) return;
    const t = now();
    this.queue = this.queue.filter((q) => q.expires > t && !q.ids.some((id) => this.missing.has(id)));
    if (!this.queue.length) return;
    const ctx = sound.ctx;
    if (!ctx || ctx.state !== 'running' || !this.enabled) { this.later(0.25); return; }
    if (t < this.nextAt) { this.later(this.nextAt - t); return; }
    this.queue.sort((a, b) => b.prio - a.prio || a.seq - b.seq);
    const i = this.queue.findIndex((q) => q.ids.every((id) => this.bufs.has(id)));
    if (i < 0) { this.later(0.1); return; } // still loading
    const [item] = this.queue.splice(i, 1);
    this.play(ctx, item);
  }

  // ---------- playback ----------

  private play(ctx: AudioContext, item: Item) {
    if (!this.chain(ctx)) return;
    const bufs = item.ids.map((id) => this.bufs.get(id)!);
    const t0 = ctx.currentTime + 0.01;
    let t = t0 + LEAD_S;
    const g = ctx.createGain();
    setP(g.gain, item.gain, GAIN);
    g.connect(this.input!);
    const srcs: AudioScheduledSourceNode[] = [];
    for (const b of bufs) {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(g);
      s.start(t);
      s.onended = () => s.disconnect();
      srcs.push(s);
      t += b.duration + JOIN_S;
    }
    const end = t - JOIN_S;
    // a little static under the voice; it outlasts the words, so its end frees the line
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(STATIC_GAIN, t0 + LEAD_S);
    ng.gain.setValueAtTime(STATIC_GAIN, end);
    ng.gain.linearRampToValueAtTime(0, end + TAIL_S);
    n.connect(ng).connect(this.input!);
    n.start(t0);
    n.stop(end + TAIL_S + 0.02);
    srcs.push(n);
    const p: Playing = { item, ctx, srcs, nodes: [g, ng], done: false, timer: 0 };
    n.onended = () => this.finish(p);
    this.playing = p;
    this.interphone!.call(end + TAIL_S - ctx.currentTime);
    sound.duckFor(end - ctx.currentTime, DUCK_DEPTH);
    if (item.prio < 2) this.recent.push(now());
    for (const id of item.ids) { const b = this.bufs.get(id)!; this.bufs.delete(id); this.bufs.set(id, b); }
    this.watch(p, end + TAIL_S);
  }

  // Backstop for a line whose 'ended' never comes (context closed by a rebuild). While the
  // context is only suspended (pause menu) the line is kept and checked again later.
  private watch(p: Playing, endAt: number) {
    p.timer = window.setTimeout(() => {
      if (p.done) return;
      if (p.ctx === sound.ctx && p.ctx.state !== 'closed' && p.ctx.currentTime < endAt) this.watch(p, endAt);
      else this.finish(p);
    }, Math.max(0.5, endAt - p.ctx.currentTime + 1) * 1000);
  }

  private finish(p: Playing) {
    if (p.done) return;
    p.done = true;
    clearTimeout(p.timer);
    for (const s of p.srcs) {
      s.onended = null;
      try { s.stop(); } catch { /* not started or already stopped */ }
      s.disconnect();
    }
    for (const n of p.nodes) n.disconnect();
    if (this.playing === p) this.playing = null;
    this.nextAt = now() + LINE_GAP_S;
    if (this.queue.length) this.later(LINE_GAP_S);
  }

  // Radio chain on the live context: band-pass, presence lift, soft clip, band-pass again
  // (so the saturation harmonics stay in the telephone band), out to the sfx bus.
  private chain(ctx: AudioContext): boolean {
    if (this.ctx === ctx && this.input) return true;
    if (this.playing) this.finish(this.playing);
    const out = sound.sfxBus();
    if (!out) return false;
    const bq = (type: BiquadFilterType, f: number, q: number, gain = 0) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      setP(b.frequency, f, FREQ);
      b.Q.value = q;
      b.gain.value = gain;
      return b;
    };
    const input = ctx.createGain();
    const drive = ctx.createGain();
    drive.gain.value = 1.5;
    const shaper = ctx.createWaveShaper();
    const k = 1.8, N = 1024, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const level = ctx.createGain();
    setP(level.gain, VOICE_GAIN, GAIN);
    input
      .connect(bq('highpass', 300, 0.7)).connect(bq('highpass', 260, 0.5))
      .connect(bq('peaking', 1800, 0.9, 4))
      .connect(drive).connect(shaper)
      .connect(bq('lowpass', 3400, 0.7)).connect(bq('lowpass', 3800, 0.5))
      .connect(level).connect(out);
    if (!this.noise) {
      // 2 s of hiss with sparse crackle (the chain band-limits it). Buffers outlive contexts.
      const sr = ctx.sampleRate, len = Math.floor(sr * 2);
      this.noise = ctx.createBuffer(1, len, sr);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 2.5 : 0);
    }
    this.interphone?.cancel();
    this.interphone = new Interphone(ctx, out);
    this.ctx = ctx;
    this.input = input;
    return true;
  }
}

export const voice = new Voice();
