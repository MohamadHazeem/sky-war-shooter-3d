import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
vi.mock('../src/game/CrewRoster', () => ({ crewRoster: {} }));
import { CoopSession, SPEC_SLOTS } from '../src/game/CoopSession';
import {
  SPEC_VIEWS, cycleView, defaultView, delaySeconds, DelayLine, MAX_DELAY_ITEMS, aimOf, packAims, readAims, fireMask, firesAt,
  stationTarget, nextShot, shouldCut, shotOffset, SHOTS, SHOT_SECONDS, MIN_SHOT, CALM_SHOTS,
} from '../src/game/SpectatorRules';
import { STATIONS, STATION_ORDER, dirFromYawPitch } from '../src/world/B17Layout';
import { maskCode, crewLabel } from '../src/ui/Streamer';
import { emptyGunnerScore } from '../src/net/CoopResult';
import { CombatTally } from '../src/game/CombatTally';
import { setLang, tx } from '../src/i18n';
import table from '../src/i18n/ar/spectator';

afterEach(() => { setLang('en'); vi.restoreAllMocks(); });

describe('spectator views', () => {
  it('cycles the five gun positions and the cinematic camera, wrapping both ways', () => {
    expect(SPEC_VIEWS).toEqual([...STATION_ORDER, 'cine']);
    expect(cycleView('waistL', 1)).toBe('waistR');
    expect(cycleView('cine', 1)).toBe('waistL');
    expect(cycleView('waistL', -1)).toBe('cine');
    let v = cycleView('top', 1);
    for (let i = 1; i < SPEC_VIEWS.length; i++) v = cycleView(v, 1);
    expect(v).toBe('top');
  });
  it('starts on the host gun, else the first crewed gun, else the cinematic camera', () => {
    expect(defaultView([{ id: 2, seat: 'tail' }, { id: 0, seat: 'ball' }])).toBe('ball');
    expect(defaultView([{ id: 3, seat: 'tail' }, { id: 1, seat: 'top' }])).toBe('top');
    expect(defaultView([])).toBe('cine');
  });
});

describe('broadcast delay', () => {
  it('offers off, 5, 15, 30 and 60 s and reads anything else as off', () => {
    expect([0, 5, 15, 30, 60].map(delaySeconds)).toEqual([0, 5, 15, 30, 60]);
    expect(delaySeconds('15')).toBe(15);
    expect(delaySeconds(undefined)).toBe(0);
    expect(delaySeconds(7)).toBe(0);
    expect(delaySeconds(-5)).toBe(0);
  });
  it('lets every message out exactly the delay later, in arrival order', () => {
    const d = new DelayLine<string>(), out: string[] = [];
    d.push(1000, 'a'); d.push(1100, 'b'); d.push(1600, 'c');
    d.drain(15999, 15000, (x) => out.push(x));
    expect(out).toEqual([]);
    d.drain(16000, 15000, (x) => out.push(x));
    expect(out).toEqual(['a']);
    d.drain(17000, 15000, (x) => out.push(x));
    expect(out).toEqual(['a', 'b', 'c']);
    expect(d.length).toBe(0);
    d.push(20000, 'd'); d.drain(20000, 0, (x) => out.push(x));   // no delay: straight through
    expect(out.at(-1)).toBe('d');
  });
  it('counts down to the first message and never grows without bound', () => {
    const d = new DelayLine<number>();
    expect(d.wait(0, 15000, false)).toBe(15);
    d.push(1000, 1);
    expect(d.wait(6000, 15000, false)).toBe(10);
    expect(d.wait(30000, 15000, false)).toBe(0);
    expect(d.wait(6000, 15000, true)).toBe(0);
    for (let i = 0; i < MAX_DELAY_ITEMS + 500; i++) d.push(2000 + i, i);
    expect(d.length).toBe(MAX_DELAY_ITEMS);
    const out: number[] = [];
    d.drain(1e9, 1000, (x) => out.push(x));
    expect(out[0]).toBe(500);                    // the oldest were dropped
    expect(out.every((x, i) => i === 0 || x === out[i - 1] + 1)).toBe(true);
    d.clear();
    expect(d.length).toBe(0); expect(d.firstAt).toBe(-1);
  });
});

describe('crew aims', () => {
  it('turns a gun direction into the yaw/pitch the stations use, and back', () => {
    for (const [y, p] of [[0.4, 0.2], [-2.8, -0.9], [Math.PI / 2, 0], [0, 1.2]]) {
      const [ry, rp] = aimOf(dirFromYawPitch(y, p));
      expect(dirFromYawPitch(ry, rp).distanceTo(dirFromYawPitch(y, p))).toBeLessThan(1e-9);
    }
  });
  it('packs ten rounded numbers and rejects malformed fields without touching the old aims', () => {
    const packed = packAims([0.12345, 1, 2, 3, -1, 0.5, 3.1, -3.1, 0.2, -0.98765]);
    expect(packed).toHaveLength(10);
    expect(packed[0]).toBe(0.123); expect(packed[9]).toBe(-0.988);
    const out = new Float32Array(10).fill(9);
    expect(readAims(packed, out)).toBe(true);
    expect(out[0]).toBeCloseTo(0.123, 5);
    out.fill(9);
    for (const bad of [null, 'x', [1, 2], [...packed, 1], packed.map((v, i) => (i === 3 ? NaN : v)), packed.map((v, i) => (i === 3 ? 99 : v)), packed.map((v, i) => (i === 3 ? '1' : v))]) {
      expect(readAims(bad, out)).toBe(false);
    }
    expect(out[0]).toBe(9);
  });
  it('marks the guns that are firing, one bit per station', () => {
    const m = fireMask((s) => s === 'top' || s === 'tail');
    expect(firesAt(m, 'top')).toBe(true); expect(firesAt(m, 'tail')).toBe(true);
    expect(firesAt(m, 'waistL')).toBe(false); expect(firesAt(m, 'ball')).toBe(false);
    expect(firesAt(0, 'top')).toBe(false);
  });
  it('turns an absolute aim into the gunner controller target, inside the station limits', () => {
    const w = STATIONS.waistL;
    const t = stationTarget(w, w.rest.yaw + 2, 3);   // far past the window's arc and over the top
    expect(t.y).toBeCloseTo(w.yaw[1]); expect(t.p).toBeCloseTo(w.pitch[1] - w.rest.pitch);
    const top = STATIONS.top;   // the turret goes all the way round: the angle wraps, no clamp
    expect(stationTarget(top, 3.5, 0.5).y).toBeCloseTo(3.5 - 2 * Math.PI);
    expect(stationTarget(top, 3.5, 0.5).p).toBeCloseTo(0.5 - top.rest.pitch);
  });
});

describe('cinematic camera', () => {
  it('cuts to the fight when a fighter is near, never two fight shots in a row, else works through the calm shots', () => {
    expect(nextShot(null, true, 0)).toBe('action');
    expect(nextShot('chase', true, 1)).toBe('action');
    expect(nextShot('action', true, 1)).toBe(CALM_SHOTS[1]);
    expect(CALM_SHOTS.map((_, i) => nextShot('chase', false, i))).toEqual([...CALM_SHOTS]);
    expect(nextShot(null, false, CALM_SHOTS.length + 2)).toBe(CALM_SHOTS[2]);
  });
  it('holds every shot for a minimum, cuts calm shots early for a fighter and fight shots when their subject is gone', () => {
    expect(shouldCut('chase', MIN_SHOT - 0.1, true, false)).toBe(false);
    expect(shouldCut('chase', MIN_SHOT + 0.1, true, false)).toBe(true);
    expect(shouldCut('nose', MIN_SHOT + 0.1, true, false)).toBe(false);   // the head-on pass plays out
    expect(shouldCut('chase', SHOT_SECONDS.chase, false, false)).toBe(true);
    expect(shouldCut('action', 1, true, true)).toBe(true);
    expect(shouldCut('action', 3, true, false)).toBe(false);
    expect(shouldCut('action', SHOT_SECONDS.action, true, false)).toBe(true);
  });
  it('eases every calm shot from its start to its end position, clear of the airframe', () => {
    for (const k of CALM_SHOTS) {
      const s = SHOTS[k];
      expect(shotOffset(k, 0, new THREE.Vector3()).toArray()).toEqual(s.from);
      expect(shotOffset(k, 1, new THREE.Vector3()).toArray()).toEqual(s.to);
      for (const u of [0, 0.5, 1]) expect(shotOffset(k, u, new THREE.Vector3()).length()).toBeGreaterThan(14);   // well clear of the fuselage (the camera never clips the ship)
    }
  });
});

describe('streamer mode', () => {
  it('masks codes (same length) and callsigns only when on', () => {
    expect(maskCode('K7PQ2M', true)).toBe('••••••');
    expect(maskCode('ABCD-EFGH', true)).toBe('••••-••••');
    expect(maskCode('K7PQ2M', false)).toBe('K7PQ2M');
    expect(crewLabel('Sam the gunner', 2, false, true)).toBe('Gunner 3');
    expect(crewLabel('Sam', 0, true, true)).toBe('You');
    expect(crewLabel('Sam', 2, false, false)).toBe('Sam');
  });
  it('has Arabic for every new phrase', () => {
    setLang('ar');
    for (const en of Object.keys(table.phrases)) expect(tx(en, { n: 3 }), en).toMatch(/[؀-ۿ]/);
    for (const en of ['SPECTATING', 'Cinematic', 'Stop watching', 'Streamer mode', 'Spectator delay', 'Watch', 'You', 'Off']) expect(tx(en)).toMatch(/[؀-ۿ]/);
  });
});

// ---------------- the session (no network: links and screens are stubs) ----------------

function link() { return { status: 'open', sendEvent: vi.fn(), sendState: vi.fn(() => true), close: vi.fn() }; }
function peer(id: number, seat: string, spec = false) {
  return { id, run: 3, seat, name: `Crew ${id}`, ready: true, link: link(), signal: null, score: emptyGunnerScore(), owner: { id }, age: 0, wall: 0, seq: -1, cd: 0, shots: 0, inp: null, hits: [], tally: new CombatTally(), spec };
}
function session(role: 'host' | 'guest') {
  const s = Object.create(CoopSession.prototype) as any;
  Object.assign(s, {
    role, mode: 'gunner', phase: 'mission', run: 3, myId: role === 'host' ? 0 : 4, myName: 'Host', myReady: true, hostSeat: 'top', guestSeat: 'waistR',
    peers: role === 'host' ? [peer(1, 'waistR'), peer(4, 'waistL', true)] : [], departed: [], crewNames: [], code: 'ABCDEF', connectionAttempt: 1, endWhy: '',
    rewardedRun: 0, result: null, hostScore: emptyGunnerScore(), guestScore: emptyGunnerScore(), guestTally: new CombatTally(),
    mission: { title: 'Co-op Survival — Gunners', bombers: 12, duration: Infinity },
    game: {
      world: { remoteStations: new Set(), stats: { kills: 3, hits: 30, shots: 200, bombersLost: 0 }, time: 120, combatLosses: 0, crewWounded: 0, aircraft: [], bombers: () => [] },
      gunner: { station: 'top', def: STATIONS.top, state: { yaw: 0.5, pitch: 0.2 }, firing: true },
      roundIdx: 2, score: 1500, state: 'playing', endResult: { success: true, reason: 'Done' }, tally: new CombatTally(), settings: {},
    },
    ui: { tip: vi.fn(), feed: vi.fn() }, engine: { paused: false, timeScale: 1 },
    screen: { lobby: vi.fn(), waiting: vi.fn(), markPartner: vi.fn(), setPing: vi.fn(), toast: vi.fn(), menu: vi.fn(), hide: vi.fn() },
    pings: { reset: vi.fn(), receive: vi.fn() }, stats: { inputsRecv: 0, guestRounds: 0 }, renderLobby: vi.fn(),
    origin: new THREE.Vector3(), tracers: [], pbHits: [], aimBuf: new Float32Array(10), aim2: [0, 0],
    held: new DelayLine(), crewAim: new Float32Array(10), crewFire: 0, watching: role === 'guest', watchers: 0, heldStart: false, heldT: 0,
  });
  if (role === 'host') s.refreshCrew();
  return s;
}
const sent = (p: any, t: string) => p.link.sendEvent.mock.calls.map((c: any) => c[0]).filter((m: any) => m.t === t);

describe('spectators in the crew session', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });

  it('opens two spectator rooms after the three crew rooms', () => {
    expect(SPEC_SLOTS).toEqual([3, 4]);
  });

  it('keeps a spectator out of the roster, the seats and the guns, and counts it', () => {
    const s = session('host');
    expect(s.roster.map((p: any) => p.id)).toEqual([0, 1]);
    expect([...s.game.world.remoteStations]).toEqual(['waistR']);
    expect(s.watchers).toBe(1);
    expect(s.partnerSeat).toBe('waistR');
    s.sendLobby();
    const spec = s.peers[1];
    const lobby = sent(spec, 'lobby')[0];
    expect(lobby.watchers).toBe(1);
    expect(lobby.crew.map((p: any) => p.id)).toEqual([0, 1]);
    expect(lobby.plan.heir).toBe(1);   // never the heir
  });

  it('keeps crew intercom links private and disables spectator microphones', () => {
    const host = session('host');
    expect(host.voiceLinks().map((p: any) => p.id)).toEqual([1]);
    expect(host.voiceLive).toBe(true);
    host.peers[0].link.status = 'closed';
    expect(host.voiceLinks()).toEqual([]);
    expect(host.voiceLive).toBe(false);
    const guest = session('guest');
    guest.link = link();
    expect(guest.voiceLinks()).toEqual([]);
    expect(guest.voiceLive).toBe(false);
    guest.watching = false;
    expect(guest.voiceLinks().map((p: any) => p.id)).toEqual([0]);
    expect(guest.voiceLive).toBe(true);
  });

  it('ignores a spectator asking for a seat or marking a target', () => {
    const s = session('host');
    const spec = s.peers[1];
    s.onEvent({ t: 'seat', s: 'tail' }, spec);
    s.onEvent({ t: 'mark', run: 3, target: 1, clock: 6, level: 0, from: 4 }, spec);
    s.onEvent({ t: 'crewReady', ready: false }, spec);
    expect(spec.seat).toBe('waistL');
    expect(sent(spec, 'seatAck')).toEqual([]);
    expect(s.pings.receive).not.toHaveBeenCalled();
    s.onEvent({ t: 'hello', name: 'Watcher<>' }, spec);   // late arrival mid-round: gets the start
    expect(spec.name).toBe('Watcher');
    expect(sent(spec, 'start')).toHaveLength(1);
  });

  it('streams every gun aim and the firing mask', () => {
    const s = session('host');
    const pb = { zones: [], guns: new Map(STATION_ORDER.map((st) => [st, { cur: dirFromYawPitch(STATIONS[st].rest.yaw + 0.1, -0.05) }])) };
    s.game.world.playerBomber = pb;
    s.game.world.formationCenter = new THREE.Vector3(); s.game.world.formationForward = new THREE.Vector3(0, 0, 1);
    s.game.prog = { perks: [] };
    s.peers[0].inp = { s: 'waistR', y: 0, p: 0, f: true };
    const snap = s.buildSnap();
    const aims = new Float32Array(10);
    expect(readAims(snap.ca, aims)).toBe(true);
    const top = STATION_ORDER.indexOf('top'), tail = STATION_ORDER.indexOf('tail');
    expect(aims[top * 2]).toBeCloseTo(STATIONS.top.rest.yaw + 0.5, 3);   // the host's own gun: its controller's aim
    expect(aims[top * 2 + 1]).toBeCloseTo(STATIONS.top.rest.pitch + 0.2, 3);
    expect(aims[tail * 2]).toBeCloseTo(STATIONS.tail.rest.yaw + 0.1 - 2 * Math.PI, 3);   // the others: the guns on the ship
    expect(aims[tail * 2 + 1]).toBeCloseTo(-0.05, 3);
    expect(firesAt(snap.cf, 'top')).toBe(true);
    expect(firesAt(snap.cf, 'waistR')).toBe(true);
    expect(firesAt(snap.cf, 'waistL')).toBe(false);   // the spectator's placeholder seat never fires
  });

  it('leaves spectators out of the debrief split and sends them the crew result', () => {
    const s = session('host');
    s.presentDebrief = vi.fn();
    s.peers[0].score = { kills: 2, hits: 20, shots: 100, score: 300 };
    expect(s.showDebrief()).toBe(true);
    const crew = sent(s.peers[0], 'debrief')[0], spec = sent(s.peers[1], 'debrief')[0];
    expect(crew.guest.kills).toBe(2);
    expect(spec.guest).toEqual(spec.host);
    expect(crew.crew.kills).toBe(5);
    const host = s.presentDebrief.mock.calls[0][0];
    expect(host.host.merit + crew.guest.merit).toBe(Math.round(host.crew.score));   // the merit splits over the two gunners only
  });

  it('a spectator holds snapshots, kills and the start back by its delay; lobby traffic stays live', () => {
    const s = session('guest');
    s.game.settings.spectatorDelay = 15;
    s.onSnap = vi.fn(); s.onEvent = vi.fn();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    s.ingest(false, { t: 'start', run: 4 });
    s.ingest(true, { t: 's', tm: 1 });
    s.ingest(false, { t: 'k', id: 7 });
    s.ingest(false, { t: 'lobby', crew: [] });
    expect(s.onEvent.mock.calls.map((c: any) => c[0].t)).toEqual(['lobby']);
    expect(s.onSnap).not.toHaveBeenCalled();
    now = 15999; s.release(0.016);
    expect(s.onEvent).toHaveBeenCalledTimes(1);
    now = 16000; s.release(0.016);
    expect(s.onEvent.mock.calls.map((c: any) => c[0].t)).toEqual(['lobby', 'start', 'k']);
    expect(s.onSnap).toHaveBeenCalledTimes(1);
    // delay off: straight through
    s.game.settings.spectatorDelay = 0;
    s.ingest(true, { t: 's', tm: 2 });
    expect(s.onSnap).toHaveBeenCalledTimes(2);
  });

  it('a gunner (not watching) never delays anything', () => {
    const s = session('guest');
    s.watching = false; s.game.settings.spectatorDelay = 30;
    s.onSnap = vi.fn(); s.onEvent = vi.fn();
    s.ingest(true, { t: 's' }); s.ingest(false, { t: 'k' });
    expect(s.onSnap).toHaveBeenCalledTimes(1); expect(s.onEvent).toHaveBeenCalledTimes(1);
  });

  it('swings the crewmates\' guns on our ship from the streamed aims (not our own gun)', () => {
    const s = session('guest');
    s.watching = false;
    const guns = new Map(STATION_ORDER.map((st) => [st, { want: null as THREE.Vector3 | null }]));
    s.game.world.playerBomber = { alive: true, zones: [], guns };
    s.game.world.formationCenter = new THREE.Vector3(); s.game.world.formationForward = new THREE.Vector3();
    s.game.gunner.station = 'waistR';
    s.wantBuf = STATION_ORDER.map(() => new THREE.Vector3());
    const aims = STATION_ORDER.flatMap((st) => [STATIONS[st].rest.yaw + 0.2, 0.1]);
    s.meta = { hs: 'top', ha: [0, 0], ca: packAims(aims), cf: 4 };
    s.applyMeta();
    expect(guns.get('waistR')!.want).toBeNull();   // ours
    expect(guns.get('tail')!.want!.distanceTo(dirFromYawPitch(STATIONS.tail.rest.yaw + 0.2, 0.1))).toBeLessThan(1e-3);
    expect(s.crewFire).toBe(4);
    expect(s.crewAim[0]).toBeCloseTo(aims[0], 3);
  });
});
