import { describe, expect, it, vi } from 'vitest';
import {
  ALL_HANDS, ASK_AT, CREW_BIAS, CREW_SEATS, DECIDE_TIME, LIMP_RADIO, LIMP_TEXT, PLAYER_WEIGHT, ROUTE, burnRate, crewVote, decide, distanceLeft, fuelMargin,
  limpingDue, neutralFor, options, shortLabel, startFuel, tally, utility, type LimpChoice, type LimpState, type LimpTrigger,
} from '../src/game/LimpingHomeRules';
import { applyOutcome, currentStory, defaultCampaign, opInfo, sanitize, startSecondTour } from '../src/game/CampaignState';
import { CAMPAIGN } from '../src/game/Missions';
import { DEEP_PENETRATION } from '../src/game/DeepPenetration';
import { hasPhrase } from '../src/i18n';
vi.hoisted(() => { vi.stubGlobal('window', {}); });

const hurt: LimpTrigger = { campaign: true, gunner: true, coop: false, alive: true, enginesOut: 0, initialEnginesOut: 0, integrity: 1, initialIntegrity: 1, leaking: false };
const leg = (p: Partial<LimpState> & { leaking: boolean; enginesOut: number }): LimpState => ({
  fuel: startFuel(p.leaking, p.enginesOut), wounded: 0, neutral: null, straggling: p.enginesOut >= 2, ...p,
});

describe('when the return leg becomes a decision', () => {
  it('a sound or lightly damaged ship just lands', () => {
    expect(limpingDue(hurt)).toBe(false);
    expect(limpingDue({ ...hurt, enginesOut: 1 })).toBe(false);
    expect(limpingDue({ ...hurt, integrity: 0.5 })).toBe(false);
  });
  it('an engine with a holed tank, two engines, or a wrecked airframe start the leg', () => {
    expect(limpingDue({ ...hurt, enginesOut: 1, leaking: true })).toBe(true);
    expect(limpingDue({ ...hurt, enginesOut: 2 })).toBe(true);
    expect(limpingDue({ ...hurt, integrity: 0.44 })).toBe(true);
  });
  it('the authored two-engine start of Last Light needs fresh damage', () => {
    const crippled = { ...hurt, enginesOut: 2, initialEnginesOut: 2, integrity: 0.7, initialIntegrity: 0.7 };
    expect(limpingDue(crippled)).toBe(false);
    expect(limpingDue({ ...crippled, leaking: true, enginesOut: 3 })).toBe(true);
    expect(limpingDue({ ...crippled, integrity: 0.46 })).toBe(false);
    expect(limpingDue({ ...crippled, integrity: 0.44 })).toBe(true);
  });
  it('never for pilots, co-op, side modes, a ship going down or one with every engine dead', () => {
    for (const patch of [{ gunner: false }, { coop: true }, { campaign: false }, { alive: false }, { enginesOut: 4 }])
      expect(limpingDue({ ...hurt, enginesOut: 2, leaking: true, ...patch })).toBe(false);
  });
});

describe('neutral countries', () => {
  it('north German targets reach Sweden, southern ones Switzerland, coastal ones neither', () => {
    expect(neutralFor('Port facilities, Bremen')).toBe('Sweden');
    expect(neutralFor('Escort — Kiel')).toBe('Sweden');
    expect(neutralFor('Aircraft plants, Oschersleben')).toBe('Sweden');
    expect(neutralFor('Messerschmitt works, Regensburg')).toBe('Switzerland');
    expect(neutralFor('Ball-bearing plants, Schweinfurt')).toBe('Switzerland');
    expect(neutralFor('Chemical works, Ludwigshafen')).toBe('Switzerland');
    expect(neutralFor('U-boat yards, Emden')).toBe(null);
    expect(neutralFor('Return leg — over the Channel')).toBe(null);
  });
  it('every deep-penetration target has a neutral option', () => {
    for (const m of DEEP_PENETRATION) expect(neutralFor(m.target), m.target).not.toBe(null);
  });
});

describe('fuel', () => {
  it('a leak and dead engines leave less in the tanks and burn it faster', () => {
    expect(startFuel(true, 1)).toBeLessThan(startFuel(false, 1));
    expect(startFuel(false, 2)).toBeLessThan(startFuel(false, 0));
    expect(burnRate('divert', 2, false)).toBeGreaterThan(burnRate('divert', 0, false));
    expect(burnRate('divert', 0, true)).toBeGreaterThan(burnRate('divert', 0, false));
  });
  it('two dead engines can still reach Woodbridge, but not the home field', () => {
    const s = leg({ enginesOut: 2, leaking: false });
    expect(fuelMargin('divert', s)).toBeGreaterThan(0);
    expect(fuelMargin('home', s)).toBeLessThan(0);
  });
  it('a holed tank on top of a dead engine cannot make England', () => {
    const s = leg({ enginesOut: 1, leaking: true });
    expect(fuelMargin('home', s)).toBeLessThan(0);
    expect(fuelMargin('divert', s)).toBeLessThan(0);
    expect(fuelMargin('neutral', s)).toBeGreaterThan(0);
    expect(fuelMargin('ditch', s)).toBeGreaterThan(0);
  });
  it('distance on the card counts down to zero', () => {
    expect(distanceLeft('divert', 0, null)).toBe(ROUTE.divert.km);
    expect(distanceLeft('divert', ROUTE.divert.time / 2, null)).toBe(ROUTE.divert.km / 2);
    expect(distanceLeft('neutral', 999, 'Sweden')).toBe(0);
  });
});

describe('the crew vote', () => {
  it('a straggler can no longer go home with the box; neutral only where one is in reach', () => {
    expect(options(leg({ enginesOut: 1, leaking: true }))).toEqual(['home', 'divert', 'ditch']);
    expect(options(leg({ enginesOut: 2, leaking: false, neutral: 'Sweden' }))).toEqual(['divert', 'neutral', 'ditch']);
  });
  it('with fuel for Woodbridge most of the crew takes her there, but not as one man', () => {
    const s = leg({ enginesOut: 2, leaking: false, neutral: 'Sweden' });
    const t = tally(s);
    expect(t.votes.divert).toBeGreaterThanOrEqual(7);
    expect(t.seat.Engineer).not.toBe('divert');   // he reads the gauges and wants more fuel to spare
    expect(decide(s, null)).toBe('divert');
    // one gunner cannot drag a crew that can make England into internment
    expect(decide(s, 'neutral')).toBe('divert');
  });
  it('two engines out from Bremen splits the crew: never 9–0, and the gunner decides', () => {
    for (const leaking of [false, true]) {
      const s = leg({ enginesOut: 2, leaking, neutral: 'Sweden' });
      const v = Object.values(tally(s).votes);
      expect(Math.max(...v), `leaking ${leaking}`).toBeLessThan(CREW_SEATS.length);
    }
    // the holed-tank case: England is out of reach, the crew is torn between Sweden and the sea
    const s = leg({ enginesOut: 2, leaking: true, neutral: 'Sweden' });
    const t = tally(s);
    expect(t.votes.neutral).toBeGreaterThanOrEqual(3);
    expect(t.votes.ditch).toBeGreaterThanOrEqual(3);
    expect(decide(s, 'neutral')).toBe('neutral');
    expect(decide(s, 'ditch')).toBe('ditch');
    // silence never ends the tour
    expect(decide(s, null)).not.toBe('neutral');
  });
  it('every man shows his personality somewhere', () => {
    const seen = new Map<string, Set<string>>();
    for (const neutral of ['Sweden', null] as const) for (const eo of [1, 2, 3]) for (const leaking of [false, true]) for (const wounded of [0, 2]) {
      const s = leg({ enginesOut: eo, leaking, neutral, wounded, straggling: true });
      const t = tally(s);
      for (const seat of CREW_SEATS) { if (!seen.has(seat)) seen.set(seat, new Set()); seen.get(seat)!.add(t.seat[seat]); }
    }
    for (const seat of CREW_SEATS) expect(seen.get(seat)!.size, seat).toBeGreaterThanOrEqual(2);
    // the leans are the size of the fuel terms, not a rounding error
    for (const seat of CREW_SEATS) if (seat !== 'Navigator') expect(Math.max(...Object.values(CREW_BIAS[seat].lean).map(Math.abs)), seat).toBeGreaterThanOrEqual(0.08);
    const s = leg({ enginesOut: 2, leaking: true, neutral: 'Sweden' });
    expect(utility('neutral', s, 'Tail')).toBeGreaterThan(utility('neutral', s, 'Pilot') + 0.2);
  });
  it('internment needs the gunner and a clear majority; it is never the silent default', () => {
    for (let f = 0.05; f < 0.4; f += 0.01) for (const eo of [1, 2, 3]) {
      const s = leg({ enginesOut: eo, leaking: true, neutral: 'Switzerland', fuel: f });
      expect(decide(s, null), `fuel ${f} engines ${eo}`).not.toBe('neutral');
      const t = tally(s);
      if (decide(s, 'neutral') === 'neutral') expect((t.votes.neutral + PLAYER_WEIGHT) * 2).toBeGreaterThan(ALL_HANDS);
      for (const c of ['divert', 'ditch'] as const) expect(decide(s, c)).not.toBe('neutral');
    }
  });
  it('short of England the crew ditches unless the gunner votes for the neutral field', () => {
    const deep = leg({ enginesOut: 1, leaking: true, neutral: 'Switzerland' });
    expect(decide(deep, null)).toBe('ditch');
    expect(decide(deep, 'neutral')).toBe('neutral');
    const coastal = leg({ enginesOut: 1, leaking: true });
    expect(decide(coastal, null)).toBe('ditch');
  });
  it('the card names short choices', () => {
    expect(shortLabel('divert', null)).toBe(LIMP_TEXT.shortDivert);
    expect(shortLabel('neutral', 'Sweden')).toBe(LIMP_TEXT.shortSweden);
    expect(shortLabel('neutral', 'Switzerland')).toBe(LIMP_TEXT.shortSwitzerland);
  });
  it('a split crew follows the gunner; the pilot breaks a tie', () => {
    let split: LimpState | null = null;
    for (let f = 0.1; f < 0.4 && !split; f += 0.002) {
      const s = leg({ enginesOut: 1, leaking: true, neutral: 'Sweden', fuel: f });
      const v = Object.values(tally(s).votes).sort((a, b) => b - a);
      if (v[1] > 0 && v[0] - v[1] < PLAYER_WEIGHT) split = s;
    }
    expect(split, 'some fuel state splits the crew').not.toBe(null);
    const t = tally(split!), opts = options(split!);
    const ranked = opts.filter((c) => t.votes[c] > 0).sort((a, b) => t.votes[b] - t.votes[a]);
    expect(decide(split!, ranked[1])).toBe(ranked[1]);
    expect(decide(split!, ranked[0])).toBe(ranked[0]);
    // an invalid vote is ignored
    expect(decide(split!, 'home' as LimpChoice)).toBe(decide(split!, null));
  });
  it('wounded aboard make the sea less attractive', () => {
    const s = leg({ enginesOut: 1, leaking: true });
    expect(crewVote({ ...s, wounded: 3 }, 'Radio')).toBe('ditch');   // still the only way, but...
    const fit = tally(s), bad = tally({ ...s, wounded: 4, fuel: s.fuel });
    expect(bad.votes.ditch).toBeLessThanOrEqual(fit.votes.ditch);
  });
  it('asks after the crew has talked and leaves enough time to vote', () => {
    expect(ASK_AT).toBeGreaterThanOrEqual(4);
    expect(DECIDE_TIME).toBeGreaterThanOrEqual(10);
  });
});

describe('internment ends the tour', () => {
  it('records the internment, closes the tour and refuses a second tour', () => {
    const d = defaultCampaign(7), op = opInfo(d, CAMPAIGN[1])!;
    const d1 = { ...d, storyDone: ['m1'] };
    const res = applyOutcome(d1, opInfo(d1, CAMPAIGN[1])!, { success: true, kills: 2, bombersLost: 2, bombersTotal: 12, interned: 'Sweden' });
    expect(op).toBeTruthy();
    expect(res.data.complete).toBe(true);
    expect(res.data.interned).toBe('Sweden');
    expect(res.data.history.at(-1)).toMatchObject({ interned: true, success: true });
    expect(res.report.lines.some((l) => l.text === LIMP_TEXT.internNote)).toBe(true);
    expect(res.report.lines.some((l) => l.text === LIMP_TEXT.tourOver)).toBe(true);
    expect(currentStory(res.data)).toBe(null);
    expect(startSecondTour(res.data)).toBe(res.data);
    const back = sanitize(JSON.parse(JSON.stringify(res.data)))!;
    expect(back.interned).toBe('Sweden');
    expect(back.complete).toBe(true);
    expect(back.history.at(-1)!.interned).toBe(true);
  });
  it('a normal outcome leaves the tour open', () => {
    const d = defaultCampaign(7);
    const res = applyOutcome(d, opInfo(d, CAMPAIGN[0])!, { success: true, kills: 0, bombersLost: 0, bombersTotal: 12 });
    expect(res.data.interned).toBeUndefined();
    expect(res.data.complete).toBe(false);
  });
});

describe('Arabic', () => {
  it('every card text, outcome, crew seat and radio line has Arabic', () => {
    for (const s of Object.values(LIMP_TEXT)) expect(hasPhrase(s), s).toBe(true);
    for (const [who, line] of Object.values(LIMP_RADIO)) { expect(hasPhrase(who), who).toBe(true); expect(hasPhrase(line), line).toBe(true); }
    for (const seat of CREW_SEATS) expect(hasPhrase(seat), seat).toBe(true);
  });
});

describe('the leg in the game (LimpingHome)', () => {
  async function rig(patch: { enginesOut?: number; leaking?: boolean; mission?: number } = {}) {
    const { LimpingHome } = await import('../src/game/LimpingHome');
    const pressed = new Set<string>();
    const b = { alive: true, remove: false, enginesOut: patch.enginesOut ?? 2, integrity: 0.8, straggling: false };
    const g: any = {
      mission: CAMPAIGN[patch.mission ?? 1], endResult: null, state: 'playing', aa: { active: false }, coop: { role: null },
      world: { playerBomber: b, bomberDamage: { fuelLeaking: patch.leaking ?? false }, crewWounded: 0, callout: vi.fn(), stats: { bombersLost: 0 } },
      ui: { banner: vi.fn(), tip: vi.fn() }, input: { hit: (k: string) => pressed.has(k) },
      midRound: { spawnAttackers: vi.fn(() => [{}, {}]), unpin: vi.fn() },
    };
    const lh = new LimpingHome(g);
    g.limping = lh;
    g.flow = { finish: vi.fn((success: boolean, reason: string) => { if (!lh.intercept(success, reason)) g.endResult = { success, reason }; }) };
    const run = (s: number) => { for (let t = 0; t < s && !g.endResult; t += 0.1) lh.frame(0.1); };
    return { lh, g, b, pressed, run };
  }
  it('holds the success ending, lets the crew decide on its own, and lands at Woodbridge', async () => {
    const { lh, g, b, run } = await rig();
    g.flow.finish(true, 'Bombs on target.');
    expect(lh.active).toBe(true);
    expect(g.endResult).toBe(null);
    expect(b.straggling).toBe(true);           // two engines out: she falls behind the box
    g.flow.finish(true, 'Bombs on target.');   // the director keeps declaring victory: still held
    expect(g.endResult).toBe(null);
    run(ASK_AT + DECIDE_TIME + 0.5);
    expect(lh.choice).toBe('divert');
    run(ROUTE.divert.time + 1);
    expect(g.endResult).toEqual({ success: true, reason: LIMP_TEXT.divertReason });
    expect(lh.diverted).toBe(true);
    expect(g.midRound.spawnAttackers).toHaveBeenCalled();   // fighters hunt the straggler
    expect(lh.active).toBe(false);
  });
  it("the gunner's vote swings a split crew (Bremen, two engines out, a holed tank)", async () => {
    const { lh, g, pressed, run } = await rig({ enginesOut: 2, leaking: true });
    g.flow.finish(true, 'Bombs on target.');
    run(ASK_AT + 0.2);
    const opts = options(lh.state);
    expect(opts).toEqual(['divert', 'neutral', 'ditch']);
    expect(decide(lh.state, null, opts)).toBe('ditch');   // silent: the crew's best non-tour-ending choice
    pressed.add(['Digit7', 'Digit8', 'Digit9', 'Digit0'][opts.indexOf('neutral')]);
    run(0.1); pressed.clear();
    expect(lh.vote).toBe('neutral');
    run(2);
    expect(lh.choice).toBe('neutral');
  });
  it('internment in Sweden loses the bomber and ends the mission there', async () => {
    const { lh, g, pressed, run } = await rig({ enginesOut: 2, leaking: true });
    g.flow.finish(true, 'Bombs on target.');
    run(ASK_AT + 0.2);
    pressed.add('Digit8'); run(0.1); pressed.clear();
    run(2);
    expect(lh.choice).toBe('neutral');
    run(ROUTE.neutral.time + 1);
    expect(lh.interned).toBe('Sweden');
    expect(g.world.stats.bombersLost).toBe(1);
    expect(g.endResult).toEqual({ success: true, reason: LIMP_TEXT.internSweden });
  });
  it('left to themselves, the same crew ditches and the tour goes on', async () => {
    const { lh, g, run } = await rig({ enginesOut: 2, leaking: true });
    g.flow.finish(true, 'Bombs on target.');
    run(ASK_AT + DECIDE_TIME + 0.5);
    expect(lh.choice).toBe('ditch');
    expect(lh.interned).toBe(null);
  });
  it('running the tanks dry on the way to Woodbridge forces a ditching', async () => {
    const { lh, g, run } = await rig();
    g.flow.finish(true, 'Bombs on target.');
    run(ASK_AT + DECIDE_TIME + 0.5);
    expect(lh.choice).toBe('divert');
    lh.state.fuel = 0.003;
    run(1);
    expect(lh.choice).toBe('ditch');
    run(4);
    expect(lh.ditch).toBe(true);
    expect(g.endResult.success).toBe(true);
  });
  it('with no fuel for England and no neutral country the crew ditches for Air-Sea Rescue', async () => {
    const { lh, g, run } = await rig({ enginesOut: 1, leaking: true, mission: 0 });
    g.flow.finish(true, 'Bombs on target.');
    run(ASK_AT + DECIDE_TIME + 0.5);
    expect(lh.choice).toBe('ditch');   // Emden: no neutral country, no fuel for England
    run(ROUTE.ditch.time + 1);
    expect(lh.ditch).toBe(true);
    expect(lh.owns).toBe(true);
    expect(g.endResult.success).toBe(true);
  });
  it('a failure ending (shot down) is never held', async () => {
    const { lh, g } = await rig();
    g.flow.finish(true, 'Bombs on target.');
    g.flow.finish(false, 'Shot down.');
    expect(g.endResult).toEqual({ success: false, reason: 'Shot down.' });
    expect(lh.active).toBe(false);
  });
  it('a sound ship lands as before', async () => {
    const { lh, g } = await rig({ enginesOut: 0 });
    g.flow.finish(true, 'Bombs on target.');
    expect(lh.active).toBe(false);
    expect(g.endResult.success).toBe(true);
  });
});
