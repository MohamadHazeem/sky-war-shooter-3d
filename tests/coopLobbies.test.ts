import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../src/game/CrewRoster', () => ({ crewRoster: {} }));
import { CoopSession } from '../src/game/CoopSession';
import {
  regionFromTimeZone, estimateRtt, latencyBars, parseListing, rankLobbies, quickJoinOrder, joinable, listingFields, sameListing,
  inviteLink, inviteCode, withoutInvite, REGIONS, REGION_LABEL, BROWSE_LIMIT, FRESH_MS, MAX_CREW, type LobbyListing, type Region,
} from '../src/net/Lobbies';
import { parseTicket, pickHeir, validPlan, lossAction, TICKET_MS, MIGRATE_TRIES, TICKET_KEY } from '../src/net/Rejoin';
import { emptyGunnerScore } from '../src/net/CoopResult';
import { setLang, tx } from '../src/i18n';

const NOW = 1_800_000_000_000;
const L = (code: string, o: Partial<LobbyListing> = {}): LobbyListing =>
  ({ code, name: 'Host', crew: 2, open: 2, phase: 'lobby', round: 0, region: 'eu', updated: NOW - 10_000, ...o });

describe('region and latency hints', () => {
  it('maps time zones to coarse regions', () => {
    const cases: [string, Region][] = [
      ['Europe/London', 'eu'], ['Europe/Berlin', 'eu'], ['Asia/Istanbul', 'eu'], ['Atlantic/Reykjavik', 'eu'],
      ['America/New_York', 'na'], ['America/Los_Angeles', 'na'], ['Pacific/Honolulu', 'na'],
      ['America/Sao_Paulo', 'sa'], ['America/Argentina/Buenos_Aires', 'sa'], ['America/Bogota', 'sa'],
      ['Asia/Dubai', 'me'], ['Asia/Riyadh', 'me'], ['Asia/Beirut', 'me'], ['Africa/Cairo', 'me'],
      ['Africa/Lagos', 'af'], ['Africa/Johannesburg', 'af'],
      ['Asia/Tokyo', 'as'], ['Asia/Kolkata', 'as'], ['Australia/Sydney', 'oc'], ['Pacific/Auckland', 'oc'],
      ['UTC', 'xx'], ['', 'xx'],
    ];
    for (const [tz, r] of cases) expect(regionFromTimeZone(tz), tz).toBe(r);
    expect(regionFromTimeZone(undefined)).toBe('xx');
  });
  it('estimates symmetric round trips and shows them on the 4-bar scale', () => {
    for (const a of REGIONS) for (const b of REGIONS) {
      expect(estimateRtt(a, b)).toBe(estimateRtt(b, a));
      expect(estimateRtt(a, b)).toBeGreaterThan(0);
    }
    for (const r of REGIONS) if (r !== 'xx') expect(estimateRtt(r, r)).toBeLessThan(estimateRtt(r, r === 'oc' ? 'sa' : 'oc'));
    expect(latencyBars(40)).toBe(4); expect(latencyBars(110)).toBe(3); expect(latencyBars(200)).toBe(2); expect(latencyBars(300)).toBe(1);
    expect(latencyBars(estimateRtt('eu', 'eu'))).toBe(4);
    expect(latencyBars(estimateRtt('eu', 'oc'))).toBe(1);
  });
});

describe('public lobby listings', () => {
  it('parses only well-formed listings', () => {
    const ok = { host: 'u1', name: ' Walsh ', crew: 2, open: 2, phase: 'mission', round: 3, region: 'me', updatedAt: { toMillis: () => NOW } };
    expect(parseListing('K7PQ2M', ok)).toEqual({ code: 'K7PQ2M', name: 'Walsh', crew: 2, open: 2, phase: 'mission', round: 3, region: 'me', updated: NOW, host: 'u1' });
    expect(parseListing('k7pq2m', ok)).toBeNull();          // not canonical
    expect(parseListing('K7PQ0M', ok)).toBeNull();          // 0 is never used
    expect(parseListing('K7PQ2M', { ...ok, crew: 5 })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, open: 4 })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, phase: 'debrief' })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, name: '' })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, name: 'x'.repeat(21) })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, updatedAt: null })).toBeNull();
    expect(parseListing('K7PQ2M', { ...ok, region: 'mars' })!.region).toBe('xx');
    expect(parseListing('K7PQ2M', null)).toBeNull();
  });
  it('hides full, stale, future-dated and own games', () => {
    expect(joinable(L('AAAAAA'), NOW)).toBe(true);
    expect(joinable(L('AAAAAA', { open: 0, crew: 4 }), NOW)).toBe(false);
    expect(joinable(L('AAAAAA', { updated: NOW - FRESH_MS - 1 }), NOW)).toBe(false);
    expect(joinable(L('AAAAAA', { updated: NOW + 120_000 }), NOW)).toBe(false);
    expect(joinable(L('AAAAAA', { host: 'me' }), NOW, 'me')).toBe(false);
  });
  it('ranks the closest crews first, then lobbies over battles, fuller crews, fresher listings', () => {
    const list = [
      L('FARAAA', { region: 'oc', crew: 3, open: 1 }),
      L('BATTLE', { phase: 'mission', round: 4, crew: 3, open: 1 }),
      L('SMALLL', { crew: 1, open: 3 }),
      L('FULLER', { crew: 3, open: 1, updated: NOW - 50_000 }),
      L('FRESHH', { crew: 3, open: 1, updated: NOW - 1_000 }),
      L('NEARME', { region: 'me', crew: 1, open: 3 }),   // eu-me: 90 ms, one band down
      L('MINEEE', { host: 'me' }),
      L('NOROOM', { crew: 4, open: 0 }),
    ];
    expect(rankLobbies(list, 'eu', NOW, 'me').map(l => l.code)).toEqual(['FRESHH', 'FULLER', 'SMALLL', 'BATTLE', 'NEARME', 'FARAAA']);
    expect(quickJoinOrder(list, 'eu', NOW, 'me')).toEqual(['FRESHH', 'FULLER', 'SMALLL']);
    expect(quickJoinOrder(list, 'eu', NOW, 'me', ['FRESHH'], 2)).toEqual(['FULLER', 'SMALLL']);
    expect(quickJoinOrder([], 'eu', NOW)).toEqual([]);
  });
  it('builds the published fields and detects real changes only', () => {
    const f = listingFields('  Walsh  ', 3, 'mission', 2.4, 'eu');
    expect(f).toEqual({ name: 'Walsh', crew: 3, open: 1, phase: 'mission', round: 2, region: 'eu' });
    expect(listingFields('', 9, 'lobby', -3, 'xx')).toEqual({ name: 'Gunner', crew: MAX_CREW, open: 0, phase: 'lobby', round: 0, region: 'xx' });
    expect(listingFields('x'.repeat(40), 1, 'lobby', 0, 'na').name).toHaveLength(20);
    expect(sameListing(null, f)).toBe(false);
    expect(sameListing({ ...f }, f)).toBe(true);
    expect(sameListing({ ...f, crew: 2, open: 2 }, f)).toBe(false);
  });
});

describe('invite links', () => {
  it('round-trips a code through a link and strips it again', () => {
    const link = inviteLink('https://example.dev/play/?lang=ar#top', 'K7PQ2M');
    expect(link).toBe('https://example.dev/play/?join=K7PQ2M');
    expect(inviteCode(link)).toBe('K7PQ2M');
    expect(inviteCode('https://example.dev/?join=k7pq-2m')).toBe('K7PQ2M');
    expect(inviteCode('https://example.dev/#join=K7PQ2M')).toBe('K7PQ2M');
    expect(inviteCode('https://example.dev/?join=K7PQ0M')).toBeNull();
    expect(inviteCode('https://example.dev/')).toBeNull();
    expect(inviteCode('not a url')).toBeNull();
    expect(withoutInvite('https://example.dev/?lang=ar&join=K7PQ2M')).toBe('https://example.dev/?lang=ar');
    expect(withoutInvite('https://example.dev/#join=K7PQ2M')).toBe('https://example.dev/');
  });
});

describe('rejoin tickets and migration plans', () => {
  it('keeps a ticket for a limited time only', () => {
    const t = JSON.stringify({ code: 'K7PQ2M', at: NOW });
    expect(parseTicket(t, NOW + 1000)).toEqual({ code: 'K7PQ2M', at: NOW });
    expect(parseTicket(t, NOW + TICKET_MS + 1)).toBeNull();
    expect(parseTicket(JSON.stringify({ code: 'nope', at: NOW }), NOW)).toBeNull();
    expect(parseTicket('{', NOW)).toBeNull();
    expect(parseTicket(null, NOW)).toBeNull();
  });
  it('picks the lowest connected crew id as heir and validates plans', () => {
    expect(pickHeir([{ id: 0 }, { id: 3 }, { id: 2 }])).toBe(2);
    expect(pickHeir([{ id: 0 }])).toBe(-1);
    expect(validPlan({ heir: 1, next: 'K7PQ2M', pub: true })).toBe(true);
    expect(validPlan({ heir: 0, next: 'K7PQ2M', pub: true })).toBe(false);
    expect(validPlan({ heir: 1, next: 'k7pq2m', pub: true })).toBe(false);
    expect(validPlan({ heir: 1, next: 'K7PQ2M' })).toBe(false);
  });
  it('decides between reconnecting, taking over, following the heir and ending gracefully', () => {
    const plan = { heir: 2, next: 'K7PQ2M', pub: false };
    const base = { crewMode: true, plan, myId: 1, hostLeft: false, reconnectFailed: false };
    expect(lossAction(base)).toBe('reconnect');
    expect(lossAction({ ...base, hostLeft: true })).toBe('follow');
    expect(lossAction({ ...base, hostLeft: true, myId: 2 })).toBe('takeover');
    expect(lossAction({ ...base, reconnectFailed: true, myId: 2 })).toBe('takeover');
    expect(lossAction({ ...base, hostLeft: true, plan: null })).toBe('end');
    expect(lossAction({ ...base, crewMode: false })).toBe('end');
  });
});

// ---------------- the session flow (no network: links and screens are stubs) ----------------

function link() { return { status: 'open', sendEvent: vi.fn(), sendState: vi.fn(() => true), close: vi.fn() }; }
function peer(id: number, seat: string) {
  return { id, run: 1, seat, name: `Crew ${id}`, ready: true, link: link(), signal: null, score: emptyGunnerScore(), owner: { id }, age: 0, wall: 0, seq: -1, cd: 0, shots: 0, inp: null, hits: [] };
}
function session(role: 'host' | 'guest') {
  const s = Object.create(CoopSession.prototype) as any;
  Object.assign(s, {
    role, mode: 'gunner', phase: 'mission', run: 3, myId: role === 'host' ? 0 : 2, myName: 'Host', myReady: true, hostSeat: 'waistL', guestSeat: 'top',
    peers: role === 'host' ? [peer(2, 'top'), peer(1, 'waistR')] : [], departed: [], crewNames: [], code: 'ABCDEF', connectionAttempt: 1, endWhy: '',
    rewardedRun: 0, result: null, hostScore: { kills: 4, hits: 40, shots: 300, score: 900 }, guestScore: { kills: 2, hits: 20, shots: 150, score: 400 },
    mission: { title: 'Co-op Survival — Gunners', bombers: 12, duration: Infinity },
    game: { world: { remoteStations: new Set(), stats: { kills: 2, bombersLost: 1 }, time: 120, combatLosses: 1, crewWounded: 0 }, gunner: { station: 'top' }, roundIdx: 2, score: 1500, state: 'playing', startMenu: vi.fn(), startMission: vi.fn() },
    ui: { tip: vi.fn(), feed: vi.fn() }, engine: { paused: false },
    screen: { lobby: vi.fn(), waiting: vi.fn(), markPartner: vi.fn(), setPing: vi.fn(), toast: vi.fn(), menu: vi.fn(), hide: vi.fn() },
    pings: { reset: vi.fn() }, stats: { inputsRecv: 0, guestRounds: 0 }, renderLobby: vi.fn(),
  });
  if (role === 'host') s.refreshCrew();
  return s;
}

describe('host migration and rejoin in the crew session', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });

  it('the host names the lowest crew id heir in every lobby update and keeps one next code', () => {
    const s = session('host');
    s.sendLobby(); s.sendLobby();
    const sent = s.peers.map((p: any) => p.link.sendEvent.mock.calls.map((c: any) => c[0]).filter((m: any) => m.t === 'lobby'));
    for (const msgs of sent) for (const m of msgs) {
      expect(validPlan(m.plan)).toBe(true);
      expect(m.plan.heir).toBe(1);
      expect(m.plan.next).toBe(sent[0][0].plan.next);
    }
    expect(sent[0][0].plan.next).not.toBe(s.code);
  });

  it('a host leaving mid-round announces the migration before saying goodbye', () => {
    const s = session('host');
    const p = s.peers[0];
    s.leave();
    const msgs = p.link.sendEvent.mock.calls.map((c: any) => c[0]);
    expect(msgs).toContainEqual(expect.objectContaining({ t: 'migrate', heir: 1 }));
    expect(p.link.close).toHaveBeenCalledWith('local', true);
    expect(s.phase).toBe('idle');
  });

  it('no migration once the round has ended or outside a mission', () => {
    for (const patch of [{ endWhy: 'ended' }, { phase: 'lobby' }]) {
      const s = session('host'); Object.assign(s, patch);
      const p = s.peers[0]; s.leave();
      expect(p.link.sendEvent.mock.calls.map((c: any) => c[0].t)).not.toContain('migrate');
    }
  });

  it('guests follow the plan: the heir takes over, the others end gracefully and follow its code', () => {
    for (const myId of [1, 2]) {
      const s = session('guest'); s.myId = myId;
      const l = link(); s.link = l;
      s.takeOver = vi.fn(); s.gracefulEnd = vi.fn(); s.reconnect = vi.fn();
      s.onEvent({ t: 'lobby', mode: 'gunner', scenario: 'survival', crew: [{ id: 0 }, { id: 1 }, { id: myId }], id: myId, plan: { heir: 1, next: 'K7PQ2M', pub: true } });
      s.onEvent({ t: 'migrate', heir: 1, next: 'K7PQ2M', pub: true });
      s.onLinkClosed(l, 'left');
      expect(s.reconnect).not.toHaveBeenCalled();
      if (myId === 1) { expect(s.takeOver).toHaveBeenCalled(); expect(s.gracefulEnd).not.toHaveBeenCalled(); }
      else expect(s.gracefulEnd).toHaveBeenCalledWith(expect.stringContaining('new host'), 'K7PQ2M');
    }
  });

  it('a dropped link first tries to rejoin the same game', () => {
    const s = session('guest'); const l = link(); s.link = l;
    s.plan = { heir: 2, next: 'K7PQ2M', pub: false };
    s.takeOver = vi.fn(); s.gracefulEnd = vi.fn(); s.reconnect = vi.fn();
    s.onLinkClosed(l, 'lost');
    expect(s.reconnect).toHaveBeenCalled(); expect(s.takeOver).not.toHaveBeenCalled();
  });

  it('pilot guests and plan-less crews end gracefully instead of dropping to the title', () => {
    const s = session('guest'); s.mode = 'pilot'; const l = link(); s.link = l;
    s.gracefulEnd = vi.fn(); s.reconnect = vi.fn();
    s.onLinkClosed(l, 'left');
    expect(s.gracefulEnd).toHaveBeenCalledWith('The host left the game. Co-op session ended.', '');
    expect(s.game.startMenu).not.toHaveBeenCalled();
  });

  it('the graceful end is a personal debrief of the sortie so far and remembers where the crew went', () => {
    const s = session('guest');
    s.presentDebrief = vi.fn();
    s.gracefulEnd('The host left. Return to the co-op lobby to rejoin your crew under the new host.', 'K7PQ2M');
    const d = s.presentDebrief.mock.calls[0][0];
    expect(d.guest.success).toBe(false);
    expect(d.guest.kills).toBe(2);
    expect(d.crew.score).toBe(1500);
    expect(d.guest.waves).toBe(2);
    expect(JSON.parse(localStorage.getItem(TICKET_KEY)!).code).toBe('K7PQ2M');
    // "Return to co-op lobby" regroups under the heir
    s.join = vi.fn(); s.connected = false;
    s.returnToLobby();
    expect(s.game.startMenu).toHaveBeenCalled();
    expect(s.join).toHaveBeenCalledWith('K7PQ2M', MIGRATE_TRIES);
  });

  it('accepts the same round again only while rejoining', () => {
    const s = session('guest');
    Object.assign(s, { teardownGuest: vi.fn(), beginRun: vi.fn(), coopMission: vi.fn(() => ({})), installGuest: vi.fn() });
    s.startGuestMission({ run: 3, mode: 'gunner', hs: 'waistL', gs: 'top' });
    expect(s.game.startMission).not.toHaveBeenCalled();
    s.rejoining = true;
    s.startGuestMission({ run: 3, mode: 'gunner', hs: 'waistL', gs: 'tail', plan: { heir: 2, next: 'K7PQ2M', pub: false } });
    expect(s.game.startMission).toHaveBeenCalled();
    expect(s.rejoining).toBe(false);
    expect(s.guestSeat).toBe('tail');
    expect(s.plan).toEqual({ heir: 2, next: 'K7PQ2M', pub: false });
  });
});

describe('rules and Arabic', () => {
  it('firestore.rules lists lobbies with the same limits and regions as the client', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const block = rules.slice(rules.indexOf('match /coop_lobbies/{code}'));
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain(`request.query.limit <= ${BROWSE_LIMIT}`);
    expect(block).toContain(`d.region in [${REGIONS.map(r => `'${r}'`).join(', ')}]`);
    expect(block).toMatch(/allow create:[^;]*roomOwner\(\)/);
    expect(block).toMatch(/allow delete: if request\.auth != null && resource\.data\.host == request\.auth\.uid;/);
    // nothing else changed: the signalling rooms still cannot be listed
    expect(rules).toMatch(/match \/coop_rooms\/\{code\}[\s\S]*?allow list: if false;/);
  });
  it('every region label and lobby-browser text has Arabic', () => {
    setLang('ar');
    for (const s of Object.values(REGION_LABEL)) expect(tx(s), s).toMatch(/[؀-ۿ]/);
    expect(tx('In battle · wave {n}', { n: 4 })).toContain('4');
    expect(tx('Estimated round trip: {ms} ms', { ms: 90 })).toContain('90');
    setLang('en');
  });
});
