import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import {
  SCHEDULE, TOUR_LENGTH, EVENTS, DANGER_LABEL, POS_LABEL, POSITIONS, ZONE_LABEL, RANKS, SHIP_NAMES, REPAIR,
  applySortie, crewFactor, eventById, fatigueLabel, finale, isTourId, loadTour, manAt, manName, moraleLabel, newTour, parseTourId,
  resolveEvent, roughEngines, sanitizeTour, saveTour, standDown, startHealth, tourMission, tourId, escortFor,
  type SortieOutcome, type TourState,
} from '../src/game/Tour';
import { isBossRound, roundDef } from '../src/game/Missions';
import { ROOKIES } from '../src/game/CrewRoster';
import { isSecondTourId } from '../src/game/SecondTour';
import { HANGAR_TABS } from '../src/game/MenuModel';
import { hasPhrase, setLang, tx } from '../src/i18n';
import { lineText, trName, voiceText } from '../src/ui/TourScreen';
import { readFileSync } from 'node:fs';
import { rng } from '../src/game/SideRaids';

const arabic = /[؀-ۿ]/;
const ok = (o: Partial<SortieOutcome> = {}): SortieOutcome => ({ success: true, kills: 3, shipLost: false, wounded: [], serious: [], danger: 3, ...o });
const fly = (s: TourState, o: Partial<SortieOutcome> = {}, rand = rng(5)) => {
  if (s.event) s = resolveEvent(s, 0);
  return applySortie(s, ok(o), rand);
};

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('field orders', () => {
  it('has twenty-five stages in date order, one to three historical targets each, the finale last', () => {
    expect(SCHEDULE).toHaveLength(TOUR_LENGTH);
    let prev = -Infinity;
    SCHEDULE.forEach((st, i) => {
      const t = Date.parse(st.date + ' UTC');
      expect(t, st.date).toBeGreaterThan(prev); prev = t;
      expect(st.options.length).toBeGreaterThanOrEqual(1);
      expect(st.options.length).toBeLessThanOrEqual(3);
      for (const o of st.options) expect(!!o.finale, o.title).toBe(i === TOUR_LENGTH - 1);
    });
  });

  it('builds a valid gunner mission for every target, with escalating danger and the escort the date allows', () => {
    const s = newTour(3);
    const fighters: number[] = [];
    SCHEDULE.forEach((st, i) => st.options.forEach((o, j) => {
      const m = tourMission(s, i, j);
      expect(m.id).toBe(tourId(i, j));
      expect(isTourId(m.id) && !isSecondTourId(m.id)).toBe(true);
      expect(parseTourId(m.id)).toEqual({ stage: i, opt: j });
      expect(m).toMatchObject({ number: i + 1, role: 'gunner', station: o.station, date: st.date, title: o.title, playerDamaged: false, shuttle: false });
      expect(Number.isFinite(m.rounds) && m.rounds! >= 2).toBe(true);
      for (let r = 0; r < m.rounds!; r++) { const d = roundDef(m, r); expect(d.max).toBeGreaterThan(d.min); expect(d.duration).toBeGreaterThan(30); }
      expect(m.waves).toEqual([]);
      expect(isBossRound(m, m.rounds! - 1)).toBe(!!o.finale);
      expect(m.objectives[2]).toBe(`Lose no more than ${m.maxBombersLost} bombers`);
      if (escortFor(st.date) === 'none') expect(m.escortArrive).toBeUndefined(); else expect(m.escortArrive).toBeGreaterThan(0);
      fighters.push(m.round!.max * m.round!.skill[1]);
    }));
    const early = fighters.slice(0, 4).reduce((a, b) => a + b) / 4, late = fighters.slice(-4).reduce((a, b) => a + b) / 4;
    expect(late).toBeGreaterThan(early * 1.4);
    // the base missions are never touched
    expect(tourMission(s, 0, 0).round).not.toBe(tourMission(s, 0, 0).round);
  });

  it('a maximum effort raises the danger of the next mission only', () => {
    const s = { ...newTour(3), maxEffort: true };
    const plain = tourMission(newTour(3), 0, 0), hard = tourMission(s, 0, 0);
    expect(hard.round!.max).toBeGreaterThan(plain.round!.max);
    expect(hard.briefing.some((p) => p.startsWith('Maximum effort'))).toBe(true);
  });
});

describe('the sortie', () => {
  it('credits a successful mission, carries part of the damage and patches the skin', () => {
    const s0 = newTour(9);
    const { state: s, report } = applySortie(s0, ok({ zones: { engine2: 0.2, fuselageMid: 0.5, wingL: 0.9 } }), rng(1));
    expect(s.done).toBe(1); expect(s.sorties).toBe(1);
    expect(s.ship.wear.engine2).toBeCloseTo(0.8 * (1 - REPAIR) + 0.15, 3);
    expect(s.ship.wear.fuselageMid).toBeCloseTo(0.5 * (1 - REPAIR), 3);
    expect(roughEngines(s.ship)).toEqual([2]);
    expect(s.ship.patches).toBeGreaterThan(0);
    expect(s.ship.missions).toBe(1);
    expect(report.result).toBe('credited');
    expect(report.voice).toBe('tour_count_1');
    expect(s.crew.every((m) => m.missions === 1)).toBe(true);
    // the next mission starts with the carried wear, never below the flyable floor
    expect(startHealth('engine2', s.ship.wear.engine2)).toBeCloseTo(1 - s.ship.wear.engine2, 5);
    expect(startHealth('wingL', 0.9)).toBeCloseTo(0.6, 5);
  });

  it('flies a failed mission again and replaces a lost ship', () => {
    const fail = applySortie(newTour(2), ok({ success: false }), rng(1)).state;
    expect(fail.done).toBe(0); expect(fail.sorties).toBe(1); expect(fail.report!.voice).toBe('tour_failed');
    const lost = applySortie(newTour(2), ok({ success: false, shipLost: true, escaped: POSITIONS.filter((p) => p !== 'tail') }), rng(2)).state;
    expect(lost.done).toBe(0);
    expect(lost.lostShips).toEqual(['Sky Queen']);
    expect(SHIP_NAMES).toContain(lost.ship.name);
    expect(lost.ship.patches).toBe(0);
    // the tail gunner did not get out: remembered, and his replacement is the roster's rookie there
    expect(lost.gone.map((m) => m.key)).toEqual(['dawson']);
    expect(manAt(lost, 'tail').last).toBe(ROOKIES.tail.last);
    expect(manAt(lost, 'tail').joined).toBe(0);
    const ditched = applySortie(newTour(2), ok({ shipLost: true, ditched: true }), rng(2)).state;
    expect(ditched.done).toBe(1); expect(ditched.gone).toEqual([]); expect(ditched.lostShips).toHaveLength(1);
  });

  it('wounds: Purple Heart, hospital, death of wounds and a second replacement with a new name', () => {
    const always = () => 0, never = () => 0.99;
    let s = applySortie(newTour(4), ok({ wounded: ['waistL'], serious: ['waistL'] }), () => 0.5).state;
    const price = manAt(s, 'waistL');
    expect(price.medals['Purple Heart']).toBe(1);
    expect(price).toMatchObject({ status: 'wounded', out: 3 });
    s = applySortie(newTour(4), ok({ wounded: ['waistL'], serious: ['waistL'] }), never).state;
    expect(s.gone[0]).toMatchObject({ key: 'price', status: 'home' });
    s = applySortie(newTour(4), ok({ wounded: ['waistL'], serious: ['waistL'] }), always).state;
    expect(s.gone[0]).toMatchObject({ key: 'price', status: 'kia' });
    expect(manAt(s, 'waistL').last).toBe(ROOKIES.waistL.last);
    s = applySortie(s, ok({ wounded: ['waistL'], serious: ['waistL'] }), always).state;
    const second = manAt(s, 'waistL');
    expect(second.last).not.toBe(ROOKIES.waistL.last);
    expect(second.joined).toBe(2);
    // a lightly wounded man misses one mission, then flies again
    s = applySortie(newTour(4), ok({ wounded: ['ball'] }), never).state;
    expect(manAt(s, 'ball')).toMatchObject({ status: 'wounded', out: 1 });
    s = fly(s).state;
    expect(manAt(s, 'ball').status).toBe('fit');
    expect(manAt(s, 'ball').missions).toBe(1);   // sat one out
  });

  it('promotes, decorates and finishes the tour at twenty-five', () => {
    let s = newTour(11);
    const voices: string[] = [];
    for (let i = 0; i < TOUR_LENGTH; i++) { const r = fly(s, {}, rng(i + 1)); s = r.state; voices.push(r.report.voice!); }
    expect(s.complete).toBe(true); expect(s.done).toBe(TOUR_LENGTH);
    expect(voices[11]).toBe('tour_half'); expect(voices[23]).toBe('tour_last'); expect(voices[24]).toBe('tour_home');
    expect(s.player.medals).toMatchObject({ 'Air Medal': 1, 'Oak Leaf Cluster': 3, 'Distinguished Flying Cross': 1 });
    const mendez = s.crew.find((m) => m.key === 'mendez')!;
    expect(manName(mendez)).toBe('T/Sgt. Mendez');
    expect(manName(s.crew.find((m) => m.key === 'brenner')!)).toBe('Maj. Brenner');
    expect(manName(s.crew.find((m) => m.key === 'doyle')!)).toBe('Capt. Doyle');
    expect(s.crew.every((m) => m.status === 'done')).toBe(true);
    const f = finale(s);
    expect(f.home).toHaveLength(10); expect(f.fallen).toEqual([]);
    expect(s.event).toBeNull();
    // nothing more is booked on a finished tour
    expect(applySortie(s, ok()).state.done).toBe(TOUR_LENGTH);
  });

  it('sends the crew to the flak house at the halfway mark', () => {
    let s = newTour(6);
    for (let i = 0; i < 12; i++) s = fly(s, {}, rng(100 + i)).state;
    expect(s.event).toBe('flakhouse');
    const before = s.fatigue;
    s = resolveEvent(s, 0);
    expect(s.fatigue).toBe(Math.max(0, before - 40));
    expect(s.seen).toContain('flakhouse');
  });
});

describe('between missions', () => {
  it('a stand-down rests the crew once per gap', () => {
    let s = fly(newTour(1)).state;
    s = { ...s, fatigue: 50 };
    const r = standDown(s);
    expect(r.fatigue).toBe(30); expect(r.rested).toBe(true);
    expect(standDown(r)).toBe(r);
    expect(fly(r).state.rested).toBe(false);
  });

  it('events apply their effects and clear', () => {
    const base: TourState = { ...newTour(1), ship: { ...newTour(1).ship, wear: { engine3: 0.4, wingL: 0.3 } } };
    const eng = resolveEvent({ ...base, event: 'engine' }, 0);
    expect(eng.ship.wear.engine3).toBeUndefined(); expect(eng.ship.wear.wingL).toBe(0.3); expect(eng.event).toBeNull();
    const help = resolveEvent({ ...base, event: 'pass' }, 1);
    expect(help.ship.wear.wingL).toBeCloseTo(0.12, 3);
    const max = resolveEvent({ ...base, event: 'maxeffort' }, 0);
    expect(max.maxEffort).toBe(true);
    expect(resolveEvent(base, 0)).toBe(base);   // nothing pending
    for (const e of EVENTS) expect(e.choices.length).toBeGreaterThan(0);
  });

  it('crew effectiveness follows morale, fatigue and experience', () => {
    const s = newTour(1);
    expect(crewFactor({ ...s, morale: 90 })).toBeGreaterThan(crewFactor({ ...s, morale: 30 }));
    expect(crewFactor({ ...s, fatigue: 95 })).toBeLessThan(crewFactor({ ...s, fatigue: 20 }));
    expect(crewFactor({ ...s, fatigue: 20 })).toBe(crewFactor({ ...s, fatigue: 50 }));
    const rookies = { ...s, crew: s.crew.map((m) => ({ ...m, joined: 3, key: 'r' + m.pos })) };
    expect(crewFactor(rookies)).toBeLessThan(crewFactor(s));
    const f = crewFactor({ ...s, morale: 5, fatigue: 100, crew: rookies.crew });
    expect(f).toBeGreaterThan(0.5); expect(crewFactor({ ...s, morale: 100 })).toBeLessThan(1.15);
  });
});

describe('storage', () => {
  it('round-trips and rejects garbage', () => {
    let s = newTour(77);
    for (let i = 0; i < 6; i++) s = fly(s, { wounded: ['radio'], serious: i === 2 ? ['radio'] : [] }, rng(i)).state;
    saveTour(s);
    expect(loadTour()).toEqual(s);
    expect(sanitizeTour(null)).toBeNull();
    expect(sanitizeTour({ v: 2 })).toBeNull();
    const bad = sanitizeTour({ v: 1, done: 99, morale: 'x', crew: 'nope', ship: { wear: { engine1: 9 } }, event: 'bogus' })!;
    expect(bad.done).toBe(TOUR_LENGTH); expect(bad.complete).toBe(true);
    expect(bad.crew).toHaveLength(10); expect(bad.ship.wear.engine1).toBe(0.6); expect(bad.event).toBeNull();
    saveTour(null); expect(loadTour()).toBeNull();
  });
});

describe('Arabic', () => {
  it('translates every text of the tour: orders, briefings, reports, events and labels', () => {
    // a state that triggers every briefing paragraph
    let s = newTour(5);
    s = applySortie(s, ok({ wounded: ['ball'], zones: { engine1: 0.1 } }), () => 0.99).state;
    s = applySortie(s, ok({ shipLost: true, escaped: [] }), () => 0.1).state;
    s = { ...s, maxEffort: true, event: null };
    const texts = new Set<string>();
    SCHEDULE.forEach((st, i) => st.options.forEach((o, j) => {
      const m = tourMission({ ...s, done: i }, i, j);
      [m.title, m.target, m.date, m.success!, ...m.briefing, ...m.objectives, o.what, o.city].forEach((t) => texts.add(t));
    }));
    for (const e of EVENTS) [e.title, e.text, ...e.choices.flatMap((c) => [c.label, c.result])].forEach((t) => texts.add(t));
    [...Object.values(DANGER_LABEL), ...Object.values(POS_LABEL), ...Object.values(ZONE_LABEL), ...RANKS.enlisted, ...RANKS.officer].forEach((t) => texts.add(t));
    for (const v of [10, 40, 60, 90]) { texts.add(moraleLabel(v)); texts.add(fatigueLabel(v)); }
    setLang('ar');
    for (const t of texts) { expect(hasPhrase(t), t).toBe(true); expect(tx(t), t).toMatch(arabic); }
    // report lines with their names and medals, from a rough tour
    let r = newTour(8);
    const lines = [];
    for (let i = 0; i < 25; i++) {
      const res = fly(r, { wounded: i % 3 ? ['tail', 'nav'] : [], serious: i % 6 === 1 ? ['tail'] : [], shipLost: i === 7, escaped: ['pilot'], success: i !== 4 }, rng(i));
      r = res.state; lines.push(...res.report.lines);
      if (r.complete) break;
    }
    lines.push(...standDown({ ...r, rested: false, complete: false }).report!.lines);
    for (const e of EVENTS) lines.push(...resolveEvent({ ...r, complete: false, event: e.id }, 0).report!.lines);
    for (const l of lines) {
      expect(hasPhrase(l.text), l.text).toBe(true);
      const out = lineText(l);
      expect(out, l.text).toMatch(arabic);
      expect(out, l.text).not.toMatch(/\{\w+\}/);
    }
    for (const m of [...r.crew, ...r.gone]) expect(trName(manName(m)), manName(m)).not.toMatch(/(Sgt|Lt|Capt|Maj)\./);
    expect(eventById('nope')).toBeNull();
  });

  it('every interphone line the tour plays is recorded and subtitled in Arabic', () => {
    const clips = JSON.parse(readFileSync('public/audio/voice/manifest.json', 'utf8')).clips as Record<string, { text: string }>;
    const ids = new Set(['tour_failed', 'tour_lost', 'tour_home', 'tour_half', 'tour_last', ...EVENTS.flatMap((e) => (e.voice ? [e.voice] : []))]);
    for (let n = 1; n < TOUR_LENGTH; n++) if (n !== 12 && n !== 24) ids.add(`tour_count_${n}`);
    setLang('ar');
    for (const id of ids) {
      const text = voiceText(id)!;
      expect(clips[id]?.text, id).toBe(text);
      expect(hasPhrase(text), text).toBe(true);
      expect(tx(text), text).toMatch(arabic);
    }
  });

  it('puts the Tour first in the Hangar crew tab', () => {
    expect(HANGAR_TABS[0].entries[0][0]).toBe('tour');
  });
});
