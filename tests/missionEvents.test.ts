import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubStorage } from './helpers';
import { setLang, tx } from '../src/i18n';
import { hasPhrase } from '../src/i18n';
import { VOICE_LINES } from '../src/audio/voiceLines';
import {
  MISSION_EVENTS, EVENT_IDS, EV_FIRST, EV_GAP, EV_MAX, EV_EDGE, EV_BOMB_LEAD, EV_BOMB_CLEAR, CHUTE_LINES, eventDue, eventFits, pickEvent, eventLines, bombLeadIn,
  type EvGate, type EvContext, type EvAction,
} from '../src/game/MissionEventLib';
import { MissionEvents } from '../src/game/MissionEvents';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const linesD = JSON.parse(readFileSync(new URL('../tools/voice/lines.d/28-mission-events.json', import.meta.url), 'utf8')) as { id?: string; role?: string; text?: string; group?: string }[];
const manifest = JSON.parse(readFileSync(new URL('../public/audio/voice/manifest.json', import.meta.url), 'utf8')) as { clips: Record<string, { text: string }> };

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

const gate = (o: Partial<EvGate> = {}): EvGate => ({
  role: 'gunner', coop: false, scripted: false, boss: false, busy: false, phase: 'mid',
  missionT: 200, roundT: 60, roundLeft: 80, sinceLast: 1e9, gap: 60, count: 0, ...o,
});
const ctx = (o: Partial<EvContext> = {}): EvContext => ({
  phase: 'breather', near: 0, roundLeft: 90,
  have: { neighbour: true, lossOk: true, clearSky: true, box: true, aiGunner: true }, ...o,
});

describe('the event library (data)', () => {
  it('has 20+ events with unique ids, sorted beats inside their duration', () => {
    expect(MISSION_EVENTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVENT_IDS).size).toBe(EVENT_IDS.length);
    for (const e of MISSION_EVENTS) {
      expect(e.beats.length, e.id).toBeGreaterThan(0);
      expect(e.dur, e.id).toBeGreaterThan(0);
      expect(e.dur, e.id).toBeLessThanOrEqual(25);            // short
      expect(e.weight, e.id).toBeGreaterThan(0);
      expect(e.phases.length, e.id).toBeGreaterThan(0);
      let prev = -1;
      for (const b of e.beats) {
        expect(b.say || b.act, e.id).toBeTruthy();
        expect(b.at, e.id).toBeLessThan(e.dur);
        if (b.say) { expect(b.at, `${e.id} lines in order`).toBeGreaterThanOrEqual(prev); prev = b.at; }
      }
      // every event says something: readable without the banner
      expect(e.beats.some((b) => b.say) || e.beats.some((b) => b.act === 'countChutes'), e.id).toBe(true);
    }
  });

  it('covers the brief: near miss, explosion, chutes, jamming, oxygen fire, freezing gunner, salute, lost Mustang, cook-off, weather wall', () => {
    for (const id of ['nearMiss', 'friendlyExplodes', 'bailout', 'jamming', 'oxygenFire', 'gunnerFreezes', 'salute', 'lostMustang', 'cookOff', 'weatherWall']) expect(EVENT_IDS, id).toContain(id);
  });

  it('pairs every state change with its undo inside the event', () => {
    const pairs: [EvAction, EvAction][] = [['slide', 'slideBack'], ['jam', 'unjam'], ['freeze', 'unfreeze'], ['salute', 'peel'], ['join', 'release'], ['crosser', 'bail'], ['tighten', 'loosen']];
    for (const e of MISSION_EVENTS) for (const [on, off] of pairs) {
      const a = e.beats.find((b) => b.act === on), z = e.beats.find((b) => b.act === off);
      if (!a && !z) continue;
      expect(a && z, `${e.id}: ${on}/${off}`).toBeTruthy();
      expect(z!.at, `${e.id}: ${off} after ${on}`).toBeGreaterThan(a!.at);
    }
  });

  it('B-17 losses only in loss events, which need the loss budget', () => {
    for (const e of MISSION_EVENTS) {
      const loses = e.beats.some((b) => b.act === 'explode' || b.act === 'fall');
      expect(loses, e.id).toBe(e.tone === 'loss');
      if (loses) expect(e.needs, e.id).toContain('lossOk');
    }
  });
});

describe('Arabic and recorded voices', () => {
  it('every banner text and radio line has Arabic', () => {
    setLang('ar');
    const texts = ['IN FLIGHT', 'JAMMED', ...MISSION_EVENTS.flatMap((e) => [e.title, e.sub]), ...eventLines().map((l) => l[1])];
    for (const s of texts) {
      expect(hasPhrase(s), s).toBe(true);
      expect(tx(s), s).toMatch(/[؀-ۿ]/);
    }
    expect(tx('Chutes: {n}', { n: 3 })).toBe('المظلات: 3');
    for (const [sp] of eventLines()) expect(hasPhrase(sp), `speaker ${sp}`).toBe(true);
  });

  it('every radio line is in lines.d with a recorded clip and the right speaker', () => {
    const byText = new Map(linesD.filter((l) => l.text).map((l) => [l.text!, l]));
    for (const [sp, text] of eventLines()) {
      const l = byText.get(text);
      expect(l, text).toBeTruthy();
      expect(manifest.clips[l!.id!]?.text, `clip ${l!.id}`).toBe(text);
      expect(VOICE_LINES[l!.id! as keyof typeof VOICE_LINES]?.speakers, l!.id).toContain(sp);
    }
    expect(CHUTE_LINES.every((t) => byText.has(t))).toBe(true);
  });
});

describe('the director (pacing)', () => {
  it('starts only in a gunner mission, outside boss fights, the final wave and other moments', () => {
    expect(eventDue(gate())).toBe(true);
    expect(eventDue(gate({ role: 'pilot' }))).toBe(false);
    expect(eventDue(gate({ coop: true }))).toBe(false);
    expect(eventDue(gate({ scripted: true }))).toBe(false);
    expect(eventDue(gate({ boss: true }))).toBe(false);
    expect(eventDue(gate({ busy: true }))).toBe(false);
    for (const phase of ['final', 'over', 'wait']) expect(eventDue(gate({ phase })), phase).toBe(false);
    for (const phase of ['build', 'breather', 'mid', 'none']) expect(eventDue(gate({ phase })), phase).toBe(true);
  });

  it('keeps the mission start, round edges, the gap and the cap', () => {
    expect(eventDue(gate({ missionT: EV_FIRST - 1 }))).toBe(false);
    expect(eventDue(gate({ roundT: EV_EDGE - 1 }))).toBe(false);
    expect(eventDue(gate({ roundLeft: EV_EDGE - 1 }))).toBe(false);
    expect(eventDue(gate({ sinceLast: 59, gap: 60 }))).toBe(false);
    expect(eventDue(gate({ count: EV_MAX }))).toBe(false);
  });

  it('fits events to the sky: needs, round time left and how busy the fight is', () => {
    const salute = MISSION_EVENTS.find((e) => e.id === 'salute')!;
    const nearMiss = MISSION_EVENTS.find((e) => e.id === 'nearMiss')!;
    const yellow = MISSION_EVENTS.find((e) => e.id === 'yellowNoses')!;
    expect(eventFits(salute, ctx())).toBe(true);
    expect(eventFits(salute, ctx({ near: 3, phase: 'build' }))).toBe(false);   // calm: a quiet sky only
    expect(eventFits(salute, ctx({ phase: 'mid' }))).toBe(false);              // not in its phases
    expect(eventFits(nearMiss, ctx({ near: 6, phase: 'mid' }))).toBe(true);
    expect(eventFits(nearMiss, ctx({ near: 7, phase: 'mid' }))).toBe(false);
    expect(eventFits(nearMiss, ctx({ have: {} }))).toBe(false);                // no neighbour in view
    expect(eventFits(yellow, ctx({ phase: 'mid', near: 5 }))).toBe(false);     // never piles fighters on a busy sky
    expect(eventFits(nearMiss, ctx({ roundLeft: nearMiss.dur }))).toBe(false);
  });

  it('keeps clear of the bomb run: nothing runs into its lead-in (IP call, bombsight offer)', () => {
    const nearMiss = MISSION_EVENTS.find((e) => e.id === 'nearMiss')!;
    expect(bombLeadIn(10, undefined, false, false)).toBe(Infinity);          // no bomb run in this mission
    expect(bombLeadIn(10, 100, true, false)).toBe(Infinity);                 // bombs gone, run over
    expect(bombLeadIn(10, 100, true, true)).toBe(0);                         // the run itself (rally included)
    expect(bombLeadIn(10, 100, false, false)).toBe(100 - EV_BOMB_LEAD - 10);
    expect(bombLeadIn(80, 100, false, false)).toBe(0);                       // the lead-in is on
    expect(eventFits(nearMiss, ctx({ bombIn: nearMiss.dur + EV_BOMB_CLEAR }))).toBe(true);
    expect(eventFits(nearMiss, ctx({ bombIn: nearMiss.dur + EV_BOMB_CLEAR - 1 }))).toBe(false);
    expect(MISSION_EVENTS.filter((e) => eventFits(e, ctx({ bombIn: 0, phase: 'none' })))).toEqual([]);
  });

  it('picks by weight, never repeats in a mission and returns null when nothing fits', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const played: string[] = [];
    for (let i = 0; i < MISSION_EVENTS.length + 3; i++) {
      const e = pickEvent(ctx({ phase: 'none' }), played, rng);
      if (!e) break;
      expect(played).not.toContain(e.id);
      played.push(e.id);
    }
    expect(played.length).toBe(MISSION_EVENTS.length);
    expect(pickEvent(ctx({ phase: 'none' }), played, rng)).toBeNull();
    expect(pickEvent(ctx({ phase: 'mid', near: 20 }), [], rng)).toBeNull();
    // rng 0 takes the first fitting event, rng ~1 the last
    const fit = MISSION_EVENTS.filter((e) => eventFits(e, ctx({ phase: 'none' })));
    expect(pickEvent(ctx({ phase: 'none' }), [], () => 0)!.id).toBe(fit[0].id);
    expect(pickEvent(ctx({ phase: 'none' }), [], () => 0.999999)!.id).toBe(fit[fit.length - 1].id);
  });
});

// ------------------------------------------------------------------ the runtime, on a stub world
function fighter(p: THREE.Vector3) {
  const root = new THREE.Object3D();
  root.position.copy(p);
  return { root, model: new THREE.Object3D(), guns: [], vel: new THREE.Vector3(), fm: { vel: new THREE.Vector3(), throttle: 0 }, alive: true, remove: false, trigger: false,
    get pos() { return root.position; }, localToWorld: (v: THREE.Vector3) => v.add(root.position) };
}

function rig() {
  const said: string[] = [];
  const frozen = new Set<string>();
  const v = () => new THREE.Vector3();
  const player = { pos: v(), vel: new THREE.Vector3(0, 0, 75), alive: true };
  const world: any = {
    time: 0, player, playerBomber: { slot: v(), vel: new THREE.Vector3(0, 0, 75), localToWorld: (p: THREE.Vector3) => p }, playerStation: { id: 'tail' }, remoteStations: new Set(), crew: { wounded: new Set() },
    frozenStations: frozen, formationForward: new THREE.Vector3(0, 0, 1), formationCenter: v(), stats: { scriptedLost: 0 },
    callout: (_k: string, sp: string, text: string) => said.push(`${sp}: ${text}`),
    playerArc: () => null, playerGunPos: () => null, activeEnemies: () => [], evade() {}, buffet() {},
    events: { shake() {} }, holdRadio() {}, pilots: new Map(), lastCallout: new Map(), destruction: { forceDeath() {} },
    spawnEnemy: (p: THREE.Vector3) => fighter(p), spawnEscort: (p: THREE.Vector3) => fighter(p), clearPilot() {}, killAircraft(f: any) { f.alive = false; },
    effects: { flashLight() {}, sparks() {}, trail() {}, spawnDebris() {}, flak() {}, glow: { spawn() {} } },
  };
  const game: any = { setWeather() {}, state: 'playing', mission: { round: null }, coop: { role: null }, pacing: { phase: 'mid' }, feel: { blastFlash() {} }, weatherNow: { k: 0, lightning: 0 } };
  const c: any = {
    world, game, role: 'gunner', roundT: 60, roundLeft: 90,
    setPieces: { stage: () => null }, aliveBombers: () => [], bomberInView: () => null, markedAircraft: () => [], unpin() {}, spawnAttackers: () => [], dramaCam: () => true,
  };
  const banner = { shown: '', sub: '', show(_k: string, t: string, s: string) { this.shown = t; this.sub = s; }, setSub(s: string) { this.sub = s; }, hide() { this.shown = ''; } };
  const ev = new MissionEvents(c, banner);
  const run = (secs: number, otherBusy = false) => { for (let t = 0; t < secs; t += 0.1) { world.time += 0.1; ev.update(0.1, false, otherBusy); } };
  return { ev, world, said, frozen, banner, run, game };
}

describe('MissionEvents runtime', () => {
  it('plays an event beat by beat, then frees the director after a short quiet', () => {
    const r = rig();
    expect(r.ev.dev('oxygenCheck')).toBe('event oxygenCheck started');
    expect(r.ev.busy).toBe(true);
    expect(r.banner.shown).toBe('Oxygen check');
    r.run(16);
    expect(r.said).toEqual(MISSION_EVENTS.find((e) => e.id === 'oxygenCheck')!.beats.map((b) => `${b.say![0]}: ${b.say![1]}`));
    expect(r.ev.active).toBeNull();
    expect(r.ev.busy).toBe(true);     // the quiet after it
    r.run(9);
    expect(r.ev.busy).toBe(false);
  });

  it('puts back what it changed: jamming and a frozen gun', () => {
    const r = rig();
    r.ev.dev('jamming');
    r.run(1);
    expect(r.ev.jammed).toBe(true);
    r.run(17);
    expect(r.ev.jammed).toBe(false);
    r.ev.dev('gunnerFreezes');
    r.run(1);
    expect([...r.frozen]).toEqual(['waistL']);
    r.ev.stop();                       // mission ended mid-event
    expect(r.frozen.size).toBe(0);
    expect(r.ev.active).toBeNull();
  });

  it('starts on its own when due, one at a time and never while another system is busy', () => {
    const random = Math.random;
    try {
      for (let s = 1; s <= 40; s++) {   // seeded picks: every event that fits a quiet sky gets played
        let seed = s * 7919;
        Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        const r = rig();
        r.world.time = 100;
        r.run(5, true);
        expect(r.ev.active).toBeNull();
        r.run(2);
        expect(r.ev.active).not.toBeNull();
        const first = r.ev.active!.id;
        r.run(r.ev.active!.dur + 1);
        expect(r.ev.active).toBeNull();
        expect(r.ev.log.filter((l) => l.includes('start')).length, first).toBe(1);
        expect(r.ev.log[0]).toContain(first);
        expect(r.ev.jammed).toBe(false);
        expect(r.frozen.size).toBe(0);
      }
    } finally { Math.random = random; }
  });

  it('stops a running event when the bomb run\'s lead-in begins, putting everything back', () => {
    const r = rig();
    r.game.mission.bombsAway = 140;
    r.game.director = { bombsDropped: false };
    r.world.time = 100;
    r.ev.dev('gunnerFreezes');
    r.run(1);
    expect(r.frozen.size).toBe(1);
    r.run(11);                         // past bombsAway - 30: the lead-in has the stage
    expect(r.ev.active).toBeNull();
    expect(r.frozen.size).toBe(0);
    expect(r.ev.log.at(-1)).toContain('stopped');
  });

  it('a neighbour event is not available without a B-17 in view', () => {
    const r = rig();
    expect(r.ev.dev('nearMiss')).toMatch(/not available/);
    expect(r.ev.active).toBeNull();
  });
});
