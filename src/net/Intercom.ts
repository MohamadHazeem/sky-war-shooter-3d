// Co-op crew intercom: push-to-talk voice over the existing WebRTC links (Opus, WebRTC's default
// audio codec). No extra connections and no renegotiation: every link carries VOICE_SLOTS audio
// transceivers, negotiated with the initial offer, and talking only swaps tracks in and out of the
// senders (RTCRtpSender.replaceTrack). The host is the hub of the crew's star:
//   slot 0     both ways: a guest's own voice to the host, the host's voice to that guest;
//   slot j>0   host -> guest: crew member j's voice, relayed (the host forwards the received track).
// So a guest hears the host on slot 0 and crew member j on slot j. Nothing is sent while nobody
// holds the talk key (the sender has no track). Who is talking travels on the reliable events
// channel as { t: 'talk', on, from }; the host re-stamps `from` with the link's crew id and relays
// it. Mute and volume are local (the listener's side). Playback and the radio filter live in
// audio/RadioVoice.ts, the glue (mic, keys, HUD) in game/CrewIntercom.ts.

export const VOICE_SLOTS = 4;          // host + up to three guests
export const VOICE_BITRATE = 32000;    // bps cap per Opus sender: plenty for band-limited speech
export const LOCAL = -1;               // route source: this player's own microphone

export interface TalkMsg { t: 'talk'; on: boolean; from: number }
export function validTalk(m: any): m is TalkMsg {
  return m?.t === 'talk' && typeof m.on === 'boolean' && Number.isInteger(m.from) && m.from >= 0 && m.from < VOICE_SLOTS;
}

// Every link: host-created transceivers (slot 0 two-way, the relay slots one-way); the guest flips
// its slot-0 transceiver to send-and-receive while the offer is applied, before it answers.
export function addVoiceLines(pc: RTCPeerConnection, role: 'host' | 'guest') {
  if (typeof pc.addTransceiver !== 'function') return;
  try {
    if (role === 'host') for (let i = 0; i < VOICE_SLOTS; i++) pc.addTransceiver('audio', { direction: i === 0 ? 'sendrecv' : 'sendonly' });
    else pc.addEventListener('track', (e) => { if (e.transceiver && voiceSlots(pc)[0] === e.transceiver) e.transceiver.direction = 'sendrecv'; });
  } catch { /* no audio support: text pings still work */ }
}

// The link's voice transceivers in slot order (creation order on the host = m-line order on the guest)
export function voiceSlots(pc: Pick<RTCPeerConnection, 'getTransceivers'>): RTCRtpTransceiver[] {
  try { return pc.getTransceivers().filter(t => t.receiver?.track?.kind === 'audio').slice(0, VOICE_SLOTS); } catch { return []; }
}

export interface VoiceRoute { link: number; slot: number; src: number }   // src: LOCAL or a crew id to relay

// What every sender should carry. links = crew ids of the open links (the guest's only link is the host, 0).
export function voiceRoutes(role: 'host' | 'guest' | null, links: readonly number[], talkers: ReadonlySet<number>, local: boolean): VoiceRoute[] {
  const out: VoiceRoute[] = [];
  if (role === 'guest') { if (local && links.length) out.push({ link: links[0], slot: 0, src: LOCAL }); return out; }
  if (role !== 'host') return out;
  for (const l of links) {
    if (local) out.push({ link: l, slot: 0, src: LOCAL });
    for (const j of talkers) if (j > 0 && j < VOICE_SLOTS && j !== l && links.includes(j)) out.push({ link: l, slot: j, src: j });
  }
  return out;
}

// Where a crew member's voice arrives: on the host, slot 0 of their own link; on a guest, slot `id` of the host link.
export function speakerSource(role: 'host' | 'guest', id: number): { link: number; slot: number } {
  return role === 'host' ? { link: id, slot: 0 } : { link: 0, slot: id };
}

export interface VoiceLink { id: number; pc: Pick<RTCPeerConnection, 'getTransceivers'>; send(m: unknown): unknown }

export interface IntercomEnv {
  role(): 'host' | 'guest' | null;
  links(): VoiceLink[];
  mic(): MediaStreamTrack | null;
  onTalk?(id: number, on: boolean): void;   // a remote crew member keyed / released
}

export class Intercom {
  readonly talkers = new Set<number>();   // remote crew ids holding their talk key
  local = false;                          // this player is transmitting
  version = 0;                            // bumped on every talk change (cheap HUD dirty check)
  private sent = new WeakMap<RTCRtpSender, MediaStreamTrack | null>();
  private capped = new WeakSet<RTCRtpSender>();
  private told = new WeakSet<object>();   // links already given the current talk state
  private acc = 0;

  constructor(private env: IntercomEnv) {}

  isTalking(id: number) { return this.talkers.has(id); }

  // Push-to-talk pressed (with a live microphone) or released
  key(on: boolean) {
    if (on === this.local) return;
    if (on && !this.env.mic()) return;
    this.local = on; this.version++;
    for (const l of this.env.links()) { l.send({ t: 'talk', on, from: 0 }); this.told.add(l.pc); }
    this.apply();
  }

  receive(m: unknown, linkId: number) {
    if (!validTalk(m)) return;
    const role = this.env.role();
    const from = role === 'host' ? linkId : m.from;
    if (role === 'host' && (from <= 0 || from >= VOICE_SLOTS)) return;
    if (m.on === this.talkers.has(from)) return;
    if (m.on) this.talkers.add(from); else this.talkers.delete(from);
    this.version++;
    if (role === 'host') for (const l of this.env.links()) if (l.id !== from) { l.send({ t: 'talk', on: m.on, from }); this.told.add(l.pc); }
    this.apply();
    this.env.onTalk?.(from, m.on);
  }

  // Once a second: forget talkers whose link is gone and re-apply the routes (a crewman joined mid-call)
  tick(dt: number) {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    const links = this.env.links();
    for (const id of this.talkers) {
      const gone = this.env.role() === 'host' ? !links.some(l => l.id === id) : !links.length;
      if (gone) { this.talkers.delete(id); this.version++; this.env.onTalk?.(id, false); }
    }
    if (this.local && !this.env.mic()) { this.local = false; this.version++; for (const l of links) l.send({ t: 'talk', on: false, from: 0 }); }
    // a link that opened (or reconnected) mid-call: tell it who is talking right now
    for (const l of links) {
      if (this.told.has(l.pc)) continue;
      this.told.add(l.pc);
      if (this.local) l.send({ t: 'talk', on: true, from: 0 });
      if (this.env.role() === 'host') for (const j of this.talkers) if (j !== l.id) l.send({ t: 'talk', on: true, from: j });
    }
    this.apply(links);
  }

  // Put the right track (or none) into every voice sender
  apply(links = this.env.links()) {
    const role = this.env.role();
    const routes = voiceRoutes(role, links.map(l => l.id), this.talkers, this.local);
    for (const l of links) {
      const slots = voiceSlots(l.pc);
      for (let s = 0; s < slots.length; s++) {
        const sender = slots[s].sender;
        if (!sender || (role === 'guest' && s > 0)) continue;
        const r = routes.find(x => x.link === l.id && x.slot === s);
        const want = !r ? null : r.src === LOCAL ? this.env.mic() : this.received(links, r.src);
        if ((this.sent.get(sender) ?? null) === want) continue;
        this.sent.set(sender, want);
        sender.replaceTrack(want).catch(() => this.sent.delete(sender));
        if (want && !this.capped.has(sender)) { this.capped.add(sender); capBitrate(sender); }
      }
    }
  }

  // Host: the track crew member `id` sends us (slot 0 of their link)
  private received(links: readonly VoiceLink[], id: number): MediaStreamTrack | null {
    const l = links.find(x => x.id === id);
    return (l && voiceSlots(l.pc)[0]?.receiver.track) || null;
  }

  // The session ended: stop everything (senders go with their closed connections)
  reset() {
    const was = this.talkers.size > 0 || this.local;
    this.talkers.clear(); this.local = false; this.acc = 0;
    this.sent = new WeakMap(); this.capped = new WeakSet(); this.told = new WeakSet();
    if (was) this.version++;
  }
}

function capBitrate(sender: RTCRtpSender) {
  try {
    const p = sender.getParameters();
    if (!p.encodings?.length) return;
    p.encodings[0].maxBitrate = VOICE_BITRATE;
    sender.setParameters(p).catch(() => {});
  } catch { /* not supported: the browser default (~32-40 kbps Opus) */ }
}

// ---------------- per-player mute and volume (saved by callsign) ----------------

export interface PlayerVoicePref { v: number; m: boolean }
export interface IntercomPrefs { volume: number; players: Record<string, PlayerVoicePref> }
const PREFS_KEY = 'sws3d.intercom.v1';
const MAX_PLAYERS = 40;
const clamp01 = (x: unknown, d: number) => typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d;
const key = (name: string) => name.trim().toLowerCase().slice(0, 24);

export function defaultPrefs(): IntercomPrefs { return { volume: 0.9, players: {} }; }

export function loadPrefs(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): IntercomPrefs {
  const p = defaultPrefs();
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return p;
    p.volume = clamp01(raw.volume, p.volume);
    if (raw.players && typeof raw.players === 'object') {
      for (const [k, v] of Object.entries(raw.players).slice(-MAX_PLAYERS)) {
        if (v && typeof v === 'object') p.players[key(k)] = { v: clamp01((v as any).v, 1), m: (v as any).m === true };
      }
    }
  } catch { /* corrupt or unavailable: defaults */ }
  return p;
}

export function savePrefs(p: IntercomPrefs, storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null) {
  const names = Object.keys(p.players);
  for (const n of names.slice(0, Math.max(0, names.length - MAX_PLAYERS))) delete p.players[n];
  try { storage?.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

export function playerPref(p: IntercomPrefs, name: string): PlayerVoicePref { return p.players[key(name)] ?? { v: 1, m: false }; }

export function setPlayerPref(p: IntercomPrefs, name: string, change: Partial<PlayerVoicePref>) {
  const k = key(name), cur = playerPref(p, name);
  delete p.players[k];   // re-insert: the most recently touched names are kept
  p.players[k] = { v: clamp01(change.v ?? cur.v, 1), m: change.m ?? cur.m };
}

// Playback gain of one crew member's voice
export function voiceGain(p: IntercomPrefs, name: string, talking: boolean) {
  const q = playerPref(p, name);
  return talking && !q.m ? p.volume * q.v : 0;
}
