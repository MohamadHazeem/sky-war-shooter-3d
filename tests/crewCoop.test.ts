import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../src/game/CrewRoster', () => ({ crewRoster: {} }));
import { CoopSession } from '../src/game/CoopSession';
import { CrewPings } from '../src/game/CrewPings';
import { canTakeSeat, freeSeat, crewCode, snapshotInterval, validCrewPing, clockCall } from '../src/net/Crew';
import { crewDebriefs, emptyGunnerScore, isCoopDebrief, buildCoopDebrief } from '../src/net/CoopResult';
import { crewName, cleanScoreName } from '../src/net/Leaderboard';
import { packAircraft, unpackAircraft } from '../src/net/CoopPilot';
import { STATIONS } from '../src/world/B17Layout';
import { PHRASES } from '../src/i18n/phrases';
import { readFileSync } from 'node:fs';
import type { DebriefData } from '../src/ui/UI';
import type { SnapAircraft } from '../src/game/CoopSession';

function peer(id: number, seat: string) {
  return { id, run: 1, seat, name: `Crew ${id}`, ready: false, link: { status: 'open', sendEvent: vi.fn(), sendState: vi.fn(() => true) }, signal: null,
    score: emptyGunnerScore(), owner: { id }, age: 0, wall: performance.now(), seq: -1, cd: 0, shots: 0, inp: null, hits: [] };
}
function session() {
  const s = Object.create(CoopSession.prototype) as any;
  Object.assign(s, { role: 'host', mode: 'gunner', phase: 'lobby', run: 1, myId: 0, myName: 'Host', myReady: false, hostSeat: 'waistL', guestSeat: 'waistR',
    peers: [peer(1, 'waistR'), peer(2, 'top'), peer(3, 'ball')], departed: [], crewNames: [], code: '', connectionAttempt: 1,
    game: { world: { remoteStations: new Set(), stats: { kills: 2 } } }, ui: { tip: vi.fn() }, screen: { lobby: vi.fn() }, stats: { inputsRecv: 0, guestRounds: 0 }, guestScore: emptyGunnerScore(), renderLobby: vi.fn(), sendStart: vi.fn() });
  s.refreshCrew(); return s;
}

describe('four-person crew', () => {
  it('allocates unique seats, rejects conflicts and invalid seats, and releases only the leaver', async () => {
    const s = session();
    expect(s.roster).toHaveLength(4); expect(freeSeat(s.roster)).toBe('tail');
    expect(canTakeSeat(s.roster, 1, 'waistL')).toBe(false);
    expect(canTakeSeat(s.roster, 1, '__proto__')).toBe(false);
    s.onEvent({ t: 'seat', s: 'top' }, s.peers[0]); expect(s.peers[0].seat).toBe('waistR');
    s.onEvent({ t: 'seat', s: 'tail' }, s.peers[0]); expect(s.peers[0].seat).toBe('tail');
    s.phase = 'mission'; s.refreshCrew();
    const leaving = s.peers[1]; s.onLinkClosed(leaving.link, 'left');
    expect(s.peers).toHaveLength(2); expect(s.connected).toBe(true);
    expect([...s.game.world.remoteStations]).toEqual(['tail', 'ball']);
    expect(s.departed).toContain(leaving); expect(s.peers.every((p: any) => p.link.status === 'open')).toBe(true);
  });
  it('requires every connected player ready and resets readiness when changing seats', () => {
    const s = session(); s.toggleReady();
    expect(s.partnerReady).toBe(false);
    for (const p of s.peers) s.onEvent({ t: 'crewReady', ready: true }, p);
    expect(s.partnerReady).toBe(true);
    s.onEvent({ t: 'seat', s: 'tail' }, s.peers[1]); expect(s.partnerReady).toBe(false);
    for (const p of s.peers) expect(p.link.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ t: 'lobby', id: p.id, gs: p.seat, crew: expect.any(Array) }));
  });
  it('late hello starts only the new peer and broadcasts to all independent links', () => {
    const s = session(); s.phase = 'mission'; s.endWhy = ''; s.sentWx = 'weather';
    s.onEvent({ t: 'hello', name: 'Late Arrival' }, s.peers[2]);
    expect(s.sendStart).toHaveBeenCalledExactlyOnceWith(s.peers[2]);
    expect(s.peers[2].name).toBe('Late Arrival');
    const event = { t: 'end', run: 1 }; s.broadcast(event);
    for (const p of s.peers) expect(p.link.sendEvent).toHaveBeenCalledWith(event);
  });
  it('routes sequenced input to its authenticated link and fires all three authoritative guns', () => {
    const s = session(); s.phase = 'mission';
    const fire = vi.fn(), pb = { alive: true, quat: new THREE.Quaternion(), vel: new THREE.Vector3(), guns: new Map(), localToWorld: (v: THREE.Vector3) => v };
    Object.assign(s.game, { state: 'playing', gunner: { loadout: { weapon: { rate: 10, spread: 0, velocity: 880, damage: 14, tracerEvery: 3, tracer: [1, 1, 1] }, rate: 1, spread: 1, velocity: 1, damage: 1 } } });
    Object.assign(s.game.world, { playerBomber: pb, ballistics: { fire }, effects: { muzzleFlash: vi.fn() } });
    for (const p of s.peers) {
      const def = STATIONS[p.seat as keyof typeof STATIONS];
      const m = { t: 'i', run: 1, seq: 1, s: p.seat, y: def.rest.yaw, p: def.rest.pitch, f: 1 };
      s.onInput(m, p); expect(p.inp.f).toBe(true);
      s.onInput({ ...m, f: 0 }, p); expect(p.inp.f).toBe(true); // duplicate cannot release newer input
      s.onInput({ ...m, seq: 2, run: 0 }, p); expect(p.seq).toBe(1);
      s.onInput({ ...m, seq: 3, s: 'waistL' }, p); expect(p.seq).toBe(1);
      s.remoteGun(1 / 60, p);
      expect(fire.mock.calls.at(-1)![6]).toBe(p.owner);
      expect(p.score.shots).toBe(1);
      p.age = 1; s.remoteGun(.1, p); expect(p.score.shots).toBe(1);
    }
    expect(fire).toHaveBeenCalledTimes(3); expect(s.stats.inputsRecv).toBe(3);
  });
  it('keeps shared totals and per-player rewards exact, including odd failure merit', () => {
    const common = { success: false, title: 'Crew', reason: 'End', score: 1103, time: 10, kills: 0, accuracy: 0, medals: [], bombersLost: 0, bombersTotal: 8, waves: 1, nextAvailable: false } as DebriefData;
    const members = [1, 2, 3, 4].map(n => ({ score: n * 100, kills: n, shots: n * 10, hits: n }));
    const all = crewDebriefs(1, common, members, 0, false);
    expect(all.reduce((n, d) => n + d.personalScore!, 0)).toBe(1103);
    expect(all.reduce((n, d) => n + d.merit!, 0)).toBe(552);
    expect(all.map(d => d.kills)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < 4; i++) {
      const result = buildCoopDebrief(1, common, members[0], members[i], 0, false);
      result.host = all[0]; result.guest = all[i]; expect(isCoopDebrief(JSON.parse(JSON.stringify(result)))).toBe(true);
    }
    const s = session(); s.peers[0].score.kills = 3; s.departed.push({ score: { ...emptyGunnerScore(), kills: 4 } });
    expect(s.aggregateGuests().kills).toBe(7); expect(s.crewKills).toBe(9);
  });
  it('encodes full aircraft sets and budgets even large battles below 30 KB/s per guest', () => {
    for (const n of [10, 30, 100, 240]) {
      const rows = Array.from({ length: n }, (_, id): SnapAircraft => [id, 'B', 10000 + id, 8000, -20000, 0, 0, 0, 1, 3, .5]);
      const encoded = packAircraft(rows), decoded = unpackAircraft(encoded)!;
      expect(decoded).toHaveLength(n); expect(decoded[n - 1][2]).toBe(10000 + n - 1);
      const bytes = JSON.stringify({ a: encoded, meta: 'x'.repeat(600) }).length;
      expect(bytes / snapshotInterval(bytes)).toBeLessThan(30000);
    }
    expect([0, 1, 2].map(i => crewCode('ABCDE9', i))).toEqual(['ABCDE9', 'ABCDEA', 'ABCDEB']);
  });
  it('retains four full callsigns and the existing solo/pilot rule limits', () => {
    const name = crewName(...['A', 'B', 'C', 'D'].map(c => c.repeat(20)));
    expect(name).toHaveLength(89); expect(cleanScoreName(name, 'coop-gunner')).toBe(name);
    expect(cleanScoreName(name, 'coop-pilot')).toHaveLength(43); expect(cleanScoreName(name, 'survival-gunner')).toHaveLength(20);
    expect(readFileSync('firestore.rules', 'utf8')).toContain("mode == 'coop-gunner' ? 89 : request.resource.data.mode == 'coop-pilot' ? 43 : 20");
    for (const text of ['Ready', 'Not ready', 'Ping target', 'Open crew slot · AI covering', 'That gun is crewed', 'Crew connected — pick a seat and ready up']) expect(PHRASES[text]).toMatch(/[\u0600-\u06ff]/);
  });
});

describe('crew pings', () => {
  const ping = { t: 'mark', run: 2, target: -1, from: 1, clock: 3, level: 1 };
  it('validates clock/target encoding and reuses a recorded, translated callout', () => {
    expect(validCrewPing(ping)).toBe(true); expect(clockCall(ping)).toBe("three o'clock high!");
    for (const bad of [{ ...ping, from: -1 }, { ...ping, from: undefined }, { ...ping, clock: 0 }, { ...ping, level: 2 }, { ...ping, target: NaN }, { ...ping, run: 0 }]) expect(validCrewPing(bad)).toBe(false);
    expect(readFileSync('public/audio/voice/manifest.json', 'utf8')).toContain("three o'clock high!");
  });
  it('host stamps sender identity, rejects old epochs, rate limits, and expires markers', () => {
    const c: any = { phase: 'mission', mode: 'gunner', role: 'host', epoch: 2, broadcast: vi.fn(), pingTarget: () => null };
    const g: any = { input: { hit: () => false }, world: { events: { radio: vi.fn() } }, settings: { markers: true, hudDetail: 'full' } };
    const p = new CrewPings(g, c);
    p.receive({ ...ping, run: 1 }, 2); expect(c.broadcast).not.toHaveBeenCalled();
    p.receive({ ...ping, from: 3 }, 2); expect(c.broadcast).toHaveBeenCalledWith({ ...ping, from: 2 });
    p.receive(ping, 2); expect(c.broadcast).toHaveBeenCalledTimes(1);
    const ctx: any = { save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), arc: vi.fn() };
    p.draw(ctx, 100, 100); expect(ctx.fillText).toHaveBeenCalledOnce(); expect(ctx.arc).not.toHaveBeenCalled();
    p.update(6); p.draw(ctx, 100, 100); expect(ctx.fillText).toHaveBeenCalledOnce();
    p.receive({ ...ping, target: 8 }, 1); expect(c.broadcast).toHaveBeenCalledTimes(1);
  });
});

// The crew ring must not bypass the common Phase 8 visibility gate or invent edge arrows.
import * as markers from '../src/ui/MarkerProjection';
it('draws a crew ring only on a visible on-screen aircraft; hides cloud/behind/off-screen targets', () => {
  const a = {}, c: any = { phase: 'mission', mode: 'gunner', role: 'guest', epoch: 2, pingTarget: () => a };
  const g: any = { world: { events: { radio: vi.fn() } }, settings: { markers: true, hudDetail: 'full' }, engine: { camera: {} } };
  const p = new CrewPings(g, c);
  p.receive({ t: 'mark', run: 2, target: 7, from: 1, clock: 3, level: 1 });
  const alpha = vi.spyOn(markers, 'aircraftMarkerAlpha').mockReturnValue(0);
  const projection = vi.spyOn(markers, 'projectAircraft').mockReturnValue({ x: 0, y: 0, depth: 100, front: true, on: true });
  const ctx: any = { save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn() };
  p.draw(ctx, 100, 100); expect(ctx.arc).not.toHaveBeenCalled();
  alpha.mockReturnValue(1); projection.mockReturnValue({ x: 0, y: 0, depth: -100, front: false, on: false });
  p.draw(ctx, 100, 100); expect(ctx.arc).not.toHaveBeenCalled();
  projection.mockReturnValue({ x: 2, y: 0, depth: 100, front: true, on: false });
  p.draw(ctx, 100, 100); expect(ctx.arc).not.toHaveBeenCalled();
  projection.mockReturnValue({ x: 0, y: 0, depth: 100, front: true, on: true });
  p.draw(ctx, 100, 100); expect(ctx.arc).toHaveBeenCalledOnce();
  g.settings.markers = false; p.draw(ctx, 100, 100); expect(ctx.arc).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
