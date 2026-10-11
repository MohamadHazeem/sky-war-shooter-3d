import { describe, it, expect, vi, afterEach } from 'vitest';
import { mergeCrew, splitCrewScore, buildCoopDebrief, isCoopDebrief } from '../src/net/CoopResult';
import { fetchIceServers, ICE_SERVERS } from '../src/net/Ice';
import { cleanScoreName, crewName } from '../src/net/Leaderboard';
import worker, { type Env } from '../worker';
import type { DebriefData } from '../src/ui/UI';
import { PHRASES } from '../src/i18n/phrases';

const host = { score: 900, kills: 7, shots: 100, hits: 40 };
const guest = { score: 200, kills: 2, shots: 200, hits: 20 };
const common: DebriefData = { success: true, title: 'Co-op Survival — Gunners', reason: 'The mission is over.', score: 1201, kills: 0, accuracy: 0, bombersLost: 1, bombersTotal: 8, time: 60, medals: [], waves: 1, survival: true, nextAvailable: false };
const ice = [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'], username: 'short-lived', credential: 'temporary' }];
const fetcher = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
afterEach(() => vi.unstubAllGlobals());

describe('crew score and personal results', () => {
  it('merges both authoritative ledgers without mutating them', () => {
    expect(mergeCrew(host, guest)).toEqual({ score: 1100, kills: 9, shots: 300, hits: 60 });
    expect(host.kills).toBe(7);
  });
  it('splits shared bonuses without creating extra score', () => {
    expect(splitCrewScore(1201, host, guest)).toEqual([951, 250]);
    expect(splitCrewScore(101, { ...host, score: 0 }, { ...guest, score: 0 })).toEqual([51, 50]);
  });
  it('round-trips a full result with one crew score but distinct stats, medals and merit', () => {
    const result = JSON.parse(JSON.stringify(buildCoopDebrief(1, common, host, guest, 1, false)));
    expect(isCoopDebrief(result)).toBe(true);
    expect(result.crew.kills).toBe(9);
    expect(result.host.score).toBe(result.guest.score);
    expect(result.host.kills).toBe(7);
    expect(result.guest.kills).toBe(2);
    expect(result.guest.accuracy).toBe(0.1);
    expect(result.host.medals).toContain('Distinguished Flying Cross');
    expect(result.guest.medals).toEqual([]);
    expect(result.host.merit + result.guest.merit).toBe(1201);
    expect(result.guest.personalScore).toBe(250);
  });
  it('failure reduces individual merit, and a non-shooting guest gets no accuracy medal', () => {
    const result = buildCoopDebrief(2, { ...common, success: false }, host, { ...guest, shots: 0 }, 0, true);
    expect(result.guest.accuracy).toBe(0);
    expect(result.guest.merit).toBe(125);
    expect(result.guest.medals).toEqual(['Purple Heart']);
  });
  it('rounds failed merit once across both profiles', () => {
    const result = buildCoopDebrief(2, { ...common, success: false, score: 2 }, { ...host, score: 1 }, { ...guest, score: 1 }, 0, false);
    expect(result.host.merit! + result.guest.merit!).toBe(1);
  });
  it('rejects stale protocol, missing payload, negative and nonfinite results', () => {
    const r = buildCoopDebrief(1, common, host, guest, 1, false);
    for (const bad of [null, {}, { ...r, v: 1 }, { ...r, run: 0 }, { ...r, guest: { ...r.guest, kills: -1 } }, { ...r, guest: { ...r.guest, time: Infinity } }]) expect(isCoopDebrief(bad)).toBe(false);
  });
  it('preserves two full Arabic/English callsigns and retains the solo name limit', () => {
    const names = crewName('ABCDEFGHIJKLMNOPQRST', 'Walsh');
    expect(cleanScoreName(names, 'coop-gunner')).toBe(names);
    expect(cleanScoreName(crewName('أحمد', 'Walsh'), 'coop-gunner')).toBe('أحمد + Walsh');
    expect(cleanScoreName('x'.repeat(43), 'survival-gunner')).toHaveLength(20);
    expect(crewName('a'.repeat(30), 'b'.repeat(30))).toHaveLength(43);
  });
});

describe('optional TURN with STUN fallback', () => {
  it('uses validated TURN credentials and always retains STUN', async () => {
    const request = fetcher({ iceServers: ice });
    expect(await fetchIceServers(request)).toEqual([...ICE_SERVERS, ...ice]);
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', cache: 'no-store' });
  });
  it.each([{}, { iceServers: [] }, { iceServers: [{ urls: 'turn:relay' }] }, { iceServers: [{ urls: 'https://bad' }] }])('falls back for malformed credentials %j', async body => {
    expect(await fetchIceServers(fetcher(body))).toEqual(ICE_SERVERS);
  });
  it('falls back on absent secrets, HTTP failure, invalid JSON and offline', async () => {
    expect(await fetchIceServers(fetcher({}, 503))).toEqual(ICE_SERVERS);
    expect(await fetchIceServers(vi.fn().mockResolvedValue(new Response('<html>')))).toEqual(ICE_SERVERS);
    expect(await fetchIceServers(vi.fn().mockRejectedValue(new Error('offline')))).toEqual(ICE_SERVERS);
  });
  it('bounds the wait even if a request ignores abort', async () => {
    const request = vi.fn<typeof fetch>(() => new Promise(() => {}));
    expect(await fetchIceServers(request, 5)).toEqual(ICE_SERVERS);
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe('TURN Worker', () => {
  const request = () => new Request('https://game.test/api/turn', { method: 'POST', headers: { Origin: 'https://game.test' } });
  const env: Env = { ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('asset')) }, TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'server-only' };
  it('mints bounded credentials server-side without caching or exposing the API token', async () => {
    const upstream = fetcher({ iceServers: ice }); vi.stubGlobal('fetch', upstream);
    const r = await worker.fetch(request(), env);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(await r.json()).toEqual({ iceServers: ice });
    expect(upstream.mock.calls[0][0]).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers');
    expect(upstream.mock.calls[0][1]).toMatchObject({ body: '{"ttl":7200}', headers: { Authorization: 'Bearer server-only' } });
  });
  it('serves assets normally, refuses cross-origin and GET minting, and handles missing secrets', async () => {
    expect((await worker.fetch(new Request('https://game.test/'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://game.test/api/turn'), env)).status).toBe(405);
    expect((await worker.fetch(new Request('https://game.test/api/turn', { method: 'POST' }), env)).status).toBe(403);
    expect((await worker.fetch(request(), { ASSETS: env.ASSETS })).status).toBe(503);
  });
  it('does not expose upstream errors or malformed credentials', async () => {
    vi.stubGlobal('fetch', fetcher({ secret: 'upstream error' }, 500));
    expect(await (await worker.fetch(request(), env)).json()).toEqual({ error: 'unavailable' });
    vi.stubGlobal('fetch', fetcher({ iceServers: [{ urls: 'turn:relay' }] }));
    expect((await worker.fetch(request(), env)).status).toBe(503);
  });
});

it('covers all co-op v2 copy in Arabic', () => {
  for (const text of ['Your callsign', 'Crew score', 'CREW LEADERBOARD', 'Return to co-op lobby', 'Waiting for your partner to return…', 'Shared crew score and personal rewards. Relay support is used when available.', 'Could not connect to the host. Try another network or try again.', '{name} (partner) destroyed {target}']) expect(PHRASES[text]).toBeTruthy();
});

// Exercise the session's reliable-message gate without creating a renderer or transport.
vi.mock('../src/game/CrewRoster', () => ({ crewRoster: {} }));
import { CoopSession } from '../src/game/CoopSession';
describe('co-op result delivery', () => {
  it('accepts only the active guest sortie and only a valid full payload', () => {
    const s = Object.create(CoopSession.prototype) as any;
    Object.assign(s, { role: 'guest', phase: 'mission', run: 4, presentDebrief: vi.fn() });
    const result = buildCoopDebrief(4, common, host, guest, 1, false);
    s.onEvent({ ...result, run: 3 });
    s.onEvent({ ...result, guest: null });
    expect(s.presentDebrief).not.toHaveBeenCalled();
    s.onEvent(result);
    expect(s.presentDebrief).toHaveBeenCalledOnce();
    s.phase = 'debrief'; s.onEvent(result);
    expect(s.presentDebrief).toHaveBeenCalledOnce();
  });
  it('lets only the host restart a connected sortie', () => {
    const s = Object.create(CoopSession.prototype) as any;
    Object.assign(s, { role: 'guest', phase: 'mission', connected: true, ui: { tip: vi.fn() }, teardownHost: vi.fn(), startHostMission: vi.fn() });
    expect(s.restart()).toBe(true);
    expect(s.startHostMission).not.toHaveBeenCalled();
    s.role = 'host';
    expect(s.restart()).toBe(true);
    expect(s.teardownHost).toHaveBeenCalledOnce();
    expect(s.startHostMission).toHaveBeenCalledOnce();
    expect(s.phase).toBe('lobby');
    expect(s.partnerReady).toBe(true);
  });
  it('never pays a result twice and ignores snapshots after the debrief', () => {
    const s = Object.create(CoopSession.prototype) as any;
    Object.assign(s, { role: 'guest', phase: 'debrief', run: 4, rewardedRun: 4, mission: {}, game: {} });
    expect(() => s.presentDebrief(buildCoopDebrief(4, common, host, guest, 1, false))).not.toThrow();
    expect(() => s.onSnap({ t: 's', run: 4, tm: 999, a: [], score: 0 })).not.toThrow();
    expect(s.game).toEqual({});
    expect(s.showDebrief()).toBe(true); // cannot enter the solo reward/submission path
  });
});
