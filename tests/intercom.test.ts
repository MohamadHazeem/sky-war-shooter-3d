import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  Intercom, LOCAL, VOICE_SLOTS, addVoiceLines, defaultPrefs, loadPrefs, playerPref, savePrefs, setPlayerPref,
  speakerSource, validTalk, voiceGain, voiceRoutes, voiceSlots, type VoiceLink,
} from '../src/net/Intercom';
import { radioCurve } from '../src/audio/RadioVoice';
import { ACTIONS, KeyMap } from '../src/core/KeyMap';
import { PHRASES } from '../src/i18n/phrases';

// Fake WebRTC: transceivers with a receive track and a sender that records replaceTrack
const track = (id: string) => ({ id, kind: 'audio', readyState: 'live' }) as unknown as MediaStreamTrack;
function fakePc(name: string) {
  const ts = Array.from({ length: VOICE_SLOTS }, (_, i) => {
    const sender = { track: null as MediaStreamTrack | null, replaceTrack: vi.fn(async (t: MediaStreamTrack | null) => { sender.track = t; }), getParameters: () => ({ encodings: [{}] }), setParameters: vi.fn(async () => {}) };
    return { receiver: { track: track(`${name}.rx${i}`) }, sender, direction: i === 0 ? 'sendrecv' : 'sendonly' };
  });
  return { getTransceivers: () => ts as unknown as RTCRtpTransceiver[], ts };
}
function link(id: number) {
  const pc = fakePc(`L${id}`), sent: any[] = [];
  return { id, pc, send: (m: unknown) => { sent.push(m); return true; }, sent } satisfies VoiceLink & { sent: any[] };
}
function setup(role: 'host' | 'guest', ids: number[]) {
  const links = ids.map(link);
  const mic = track('mic');
  const onTalk = vi.fn();
  const ic = new Intercom({ role: () => role, links: () => links, mic: () => mic, onTalk });
  return { ic, links, mic, onTalk };
}
const senderTrack = (l: ReturnType<typeof link>, slot: number) => l.pc.ts[slot].sender.track;

describe('intercom routing', () => {
  it('host sends its own voice on slot 0 of every link and relays guest j on slot j to the others', () => {
    expect(voiceRoutes('host', [1, 2, 3], new Set([2]), true)).toEqual([
      { link: 1, slot: 0, src: LOCAL }, { link: 1, slot: 2, src: 2 },
      { link: 2, slot: 0, src: LOCAL },
      { link: 3, slot: 0, src: LOCAL }, { link: 3, slot: 2, src: 2 },
    ]);
    expect(voiceRoutes('host', [1, 3], new Set([2, 3]), false)).toEqual([{ link: 1, slot: 3, src: 3 }]);   // 2 has left
    expect(voiceRoutes('guest', [0], new Set([0, 2]), true)).toEqual([{ link: 0, slot: 0, src: LOCAL }]);  // guests never relay
    expect(voiceRoutes('guest', [0], new Set(), false)).toEqual([]);
    expect(voiceRoutes(null, [1], new Set([1]), true)).toEqual([]);
  });

  it('maps each speaker to the link and slot their voice arrives on', () => {
    expect(speakerSource('host', 2)).toEqual({ link: 2, slot: 0 });
    expect(speakerSource('guest', 0)).toEqual({ link: 0, slot: 0 });
    expect(speakerSource('guest', 3)).toEqual({ link: 0, slot: 3 });
  });

  it('validates talk messages', () => {
    expect(validTalk({ t: 'talk', on: true, from: 0 })).toBe(true);
    expect(validTalk({ t: 'talk', on: 1, from: 0 })).toBe(false);
    expect(validTalk({ t: 'talk', on: true, from: 4 })).toBe(false);
    expect(validTalk({ t: 'talk', on: true, from: -1 })).toBe(false);
    expect(validTalk({ t: 'mark', on: true, from: 0 })).toBe(false);
    expect(validTalk(null)).toBe(false);
  });
});

describe('intercom transport', () => {
  it('negotiates four audio transceivers on the host and flips only the guest slot 0 to two-way', () => {
    const added: any[] = [];
    const host = { addTransceiver: vi.fn((kind: string, init: any) => added.push({ kind, ...init })) } as unknown as RTCPeerConnection;
    addVoiceLines(host, 'host');
    expect(added.map(a => a.direction)).toEqual(['sendrecv', 'sendonly', 'sendonly', 'sendonly']);
    expect(added.every(a => a.kind === 'audio')).toBe(true);
    let onTrack: (e: any) => void = () => {};
    const ts = Array.from({ length: 4 }, () => ({ receiver: { track: { kind: 'audio' } }, direction: 'recvonly' }));
    const guest = { addTransceiver: vi.fn(), addEventListener: (_: string, f: any) => { onTrack = f; }, getTransceivers: () => ts } as unknown as RTCPeerConnection;
    addVoiceLines(guest, 'guest');
    for (const t of ts) onTrack({ transceiver: t });
    expect(ts.map(t => t.direction)).toEqual(['sendrecv', 'recvonly', 'recvonly', 'recvonly']);
    expect(guest.addTransceiver).not.toHaveBeenCalled();
    addVoiceLines({} as RTCPeerConnection, 'host');   // no WebRTC audio: nothing thrown
    expect(voiceSlots({ getTransceivers: () => { throw new Error('closed'); } })).toEqual([]);
  });

  it('a guest transmits on slot 0 only while the key is held, and tells the host', () => {
    const { ic, links, mic } = setup('guest', [0]);
    ic.key(true);
    expect(senderTrack(links[0], 0)).toBe(mic);
    expect(links[0].sent).toEqual([{ t: 'talk', on: true, from: 0 }]);
    expect(links[0].pc.ts[0].sender.setParameters).toHaveBeenCalledTimes(1);   // Opus bitrate cap
    ic.key(true);
    expect(links[0].pc.ts[0].sender.replaceTrack).toHaveBeenCalledTimes(1);
    ic.key(false);
    expect(senderTrack(links[0], 0)).toBeNull();
    expect(links[0].sent.at(-1)).toEqual({ t: 'talk', on: false, from: 0 });
    for (let s = 1; s < VOICE_SLOTS; s++) expect(links[0].pc.ts[s].sender.replaceTrack).not.toHaveBeenCalled();
  });

  it('no microphone: the key does nothing', () => {
    const links = [link(0)];
    const ic = new Intercom({ role: () => 'guest', links: () => links, mic: () => null });
    ic.key(true);
    expect(ic.local).toBe(false); expect(links[0].sent).toEqual([]);
  });

  it('the host relays a guest voice and its talk state to the rest of the crew, never back to the speaker', () => {
    const { ic, links, onTalk } = setup('host', [1, 2, 3]);
    ic.receive({ t: 'talk', on: true, from: 3 }, 2);   // `from` is re-stamped with the link's crew id
    expect(ic.isTalking(2)).toBe(true); expect(onTalk).toHaveBeenCalledWith(2, true);
    const voice2 = links[1].pc.ts[0].receiver.track;
    expect(senderTrack(links[0], 2)).toBe(voice2);
    expect(senderTrack(links[2], 2)).toBe(voice2);
    expect(links[1].pc.ts[2].sender.replaceTrack).not.toHaveBeenCalled();
    expect(links[0].sent).toEqual([{ t: 'talk', on: true, from: 2 }]);
    expect(links[1].sent).toEqual([]);
    ic.receive({ t: 'talk', on: true, from: 2 }, 2);   // duplicate: ignored
    expect(links[0].sent).toHaveLength(1);
    ic.receive({ t: 'talk', on: false, from: 2 }, 2);
    expect(senderTrack(links[0], 2)).toBeNull(); expect(senderTrack(links[2], 2)).toBeNull();
    expect(onTalk).toHaveBeenLastCalledWith(2, false);
    ic.receive({ t: 'talk', on: true, from: 0 }, 0);   // nobody is crew id 0 but the host
    expect(ic.talkers.size).toBe(0);
  });

  it('host and a relayed guest can talk at once on separate slots', () => {
    const { ic, links, mic } = setup('host', [1, 2]);
    ic.key(true);
    ic.receive({ t: 'talk', on: true, from: 0 }, 1);
    expect(senderTrack(links[1], 0)).toBe(mic);
    expect(senderTrack(links[1], 1)).toBe(links[0].pc.ts[0].receiver.track);
    expect(senderTrack(links[0], 0)).toBe(mic);
    expect(senderTrack(links[0], 1)).toBeNull();
  });

  it('a guest shows whoever the host says is talking', () => {
    const { ic, onTalk } = setup('guest', [0]);
    ic.receive({ t: 'talk', on: true, from: 2 }, 0);
    ic.receive({ t: 'talk', on: true, from: 0 }, 0);
    expect([...ic.talkers].sort()).toEqual([0, 2]);
    expect(onTalk).toHaveBeenCalledTimes(2);
  });

  it('a crewman joining mid-call is routed in; a leaver stops talking', () => {
    const links = [link(1)];
    const onTalk = vi.fn();
    const ic = new Intercom({ role: () => 'host', links: () => links, mic: () => null, onTalk });
    ic.receive({ t: 'talk', on: true, from: 1 }, 1);
    links.push(link(2));
    ic.tick(1);
    expect(senderTrack(links[1], 1)).toBe(links[0].pc.ts[0].receiver.track);
    links.shift();
    ic.tick(1);
    expect(ic.isTalking(1)).toBe(false); expect(onTalk).toHaveBeenLastCalledWith(1, false);
    expect(senderTrack(links[0], 1)).toBeNull();
  });

  it('a link that opens mid-call is told who is already talking', () => {
    const { ic, links } = setup('host', [1]);
    ic.key(true); ic.receive({ t: 'talk', on: true, from: 0 }, 1);
    ic.tick(1);
    expect(links[0].sent).toEqual([{ t: 'talk', on: true, from: 0 }]);   // already up to date
    links.push(link(2));
    ic.tick(1);
    expect(links[1].sent).toEqual([{ t: 'talk', on: true, from: 0 }, { t: 'talk', on: true, from: 1 }]);
    ic.tick(1);
    expect(links[1].sent).toHaveLength(2);
    const g = setup('guest', [0]);
    g.links[0].pc = fakePc('reconnected');   // same crew id, new connection
    g.ic.key(true); g.links[0].sent.length = 0;
    g.links.push(link(0)); g.links.shift();
    g.ic.tick(1);
    expect(g.links[0].sent).toEqual([{ t: 'talk', on: true, from: 0 }]);
  });

  it('reset forgets everything', () => {
    const { ic } = setup('host', [1]);
    ic.key(true); ic.receive({ t: 'talk', on: true, from: 1 }, 1);
    const v = ic.version; ic.reset();
    expect(ic.local).toBe(false); expect(ic.talkers.size).toBe(0); expect(ic.version).toBeGreaterThan(v);
  });
});

describe('intercom preferences and radio sound', () => {
  it('saves per-callsign mute and volume, clamped, and survives junk', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const p = loadPrefs(storage);
    expect(p).toEqual(defaultPrefs());
    setPlayerPref(p, ' Walsh ', { m: true });
    setPlayerPref(p, 'Baker', { v: 7 });
    p.volume = 0.5;
    savePrefs(p, storage);
    const q = loadPrefs(storage);
    expect(playerPref(q, 'walsh')).toEqual({ v: 1, m: true });
    expect(playerPref(q, 'BAKER')).toEqual({ v: 1, m: false });
    expect(playerPref(q, 'Nobody')).toEqual({ v: 1, m: false });
    expect(voiceGain(q, 'Walsh', true)).toBe(0);
    setPlayerPref(q, 'Baker', { v: 0.4 });
    expect(voiceGain(q, 'Baker', true)).toBeCloseTo(0.2);
    expect(voiceGain(q, 'Baker', false)).toBe(0);
    store.set('sws3d.intercom.v1', '{"volume":"loud","players":{"x":{"v":-3,"m":"yes"}}}');
    expect(loadPrefs(storage)).toEqual({ volume: 0.9, players: { x: { v: 0, m: false } } });
    store.set('sws3d.intercom.v1', 'not json');
    expect(loadPrefs(storage)).toEqual(defaultPrefs());
  });

  it('keeps only the most recently touched callsigns', () => {
    const p = defaultPrefs();
    for (let i = 0; i < 60; i++) setPlayerPref(p, `p${i}`, { m: true });
    setPlayerPref(p, 'p0', { v: 0.5 });
    savePrefs(p, null);
    expect(Object.keys(p.players)).toHaveLength(40);
    expect(playerPref(p, 'p0')).toEqual({ v: 0.5, m: true });
    expect(playerPref(p, 'p1').m).toBe(false);
  });

  it('the overdrive curve is odd, monotonic and keeps full scale', () => {
    const c = radioCurve(513);
    expect(c[0]).toBeCloseTo(-1); expect(c[512]).toBeCloseTo(1); expect(c[256]).toBeCloseTo(0);
    for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]);
    expect(c[384]).toBeGreaterThan(0.5);   // soft-saturating: half input reads louder than half
  });
});

describe('intercom controls and text', () => {
  it('push to talk is a remappable action on a free key in both roles', () => {
    const talk = ACTIONS.find(a => a.id === 'talk')!;
    expect(talk.def).toBe('KeyY'); expect(talk.scope).toBeUndefined();
    expect(ACTIONS.filter(a => a.def === 'KeyY')).toHaveLength(1);
    const km = new KeyMap(null);
    expect(km.label('talk')).toBe('Y');
    km.bind('talk', 'KeyT');
    km.scope = 'gunner';
    expect(km.translate('KeyT', true)).toBe('KeyY');
  });

  it('every intercom string has Arabic', () => {
    const src = ['ui/IntercomHud.ts', 'game/CrewIntercom.ts'].map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
    const literals = [...src.matchAll(/tx\(\s*'([^']+)'/g), ...src.matchAll(/toast\('([^']+)'/g), ...src.matchAll(/\? '([A-Z][^']+)' :/g), ...src.matchAll(/: '([A-Z][^']+)'\)/g)].map(m => m[1]);
    expect(literals.length).toBeGreaterThan(8);
    for (const s of new Set(literals)) expect(PHRASES[s], s).toBeTruthy();
  });
});
