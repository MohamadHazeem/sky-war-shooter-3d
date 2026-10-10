import { describe, it, expect, beforeEach } from 'vitest';
import {
  DAILY_COUNT, DAILY_TEMPLATES, DailyTracker, dailySeed, dayKey, hashString, msUntilReset, mulberry32, pickDailies, withRandom,
} from '../src/game/Dailies';
import { dailyMode } from '../src/net/Leaderboard';
import { stubStorage } from './helpers';

beforeEach(() => { stubStorage(); });

describe('seeded randomness', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(1234), b = mulberry32(1234), c = mulberry32(1235);
    const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const x of sa) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });

  it('hashString is stable and spreads nearby keys', () => {
    expect(hashString('20261010')).toBe(hashString('20261010'));
    expect(hashString('20261010')).not.toBe(hashString('20261011'));
    expect(hashString('')).toBe(0x811c9dc5);
  });

  it('withRandom swaps Math.random only inside the call, even on throw', () => {
    const orig = Math.random;
    const vals = withRandom(mulberry32(7), () => [Math.random(), Math.random()]);
    expect(vals).toEqual(Array.from({ length: 2 }, mulberry32(7)));
    expect(Math.random).toBe(orig);
    expect(() => withRandom(() => 0.5, () => { throw new Error('boom'); })).toThrow('boom');
    expect(Math.random).toBe(orig);
  });
});

describe('day key', () => {
  it('uses the UTC calendar day', () => {
    expect(dayKey(new Date('2026-10-10T00:00:00Z'))).toBe('20261010');
    expect(dayKey(new Date('2026-10-10T23:59:59.999Z'))).toBe('20261010');
    expect(dayKey(new Date('2026-10-11T00:00:00Z'))).toBe('20261011');
    expect(dayKey(new Date('2027-01-05T12:00:00Z'))).toBe('20270105');
  });

  it('matches the leaderboard daily mode suffix (Firestore rule: daily-<role>-<8 digits>)', () => {
    const d = new Date('2026-03-07T18:30:00Z');
    expect(dailyMode('gunner', d)).toBe(`daily-gunner-${dayKey(d)}`);
    expect(dailyMode('pilot', d)).toMatch(/^daily-(gunner|pilot)-[0-9]{8}$/);
  });

  it('counts down to the next UTC midnight', () => {
    expect(msUntilReset(new Date('2026-10-10T23:00:00Z'))).toBe(3600_000);
    expect(msUntilReset(new Date('2026-10-10T00:00:00Z'))).toBe(86_400_000);
  });
});

describe('daily orders', () => {
  it('everyone gets the same orders on the same day', () => {
    expect(pickDailies('20261010')).toEqual(pickDailies('20261010'));
  });

  it(`picks ${DAILY_COUNT} different kinds with goals from the templates`, () => {
    for (let i = 0; i < 60; i++) {
      const key = dayKey(new Date(Date.UTC(2026, 0, 1 + i)));
      const ds = pickDailies(key);
      expect(ds).toHaveLength(DAILY_COUNT);
      expect(new Set(ds.map((d) => d.kind)).size).toBe(DAILY_COUNT);
      for (const d of ds) {
        const t = DAILY_TEMPLATES.find((x) => x.kind === d.kind)!;
        expect(t.goals).toContain(d.goal);
        expect(d.merit).toBeGreaterThan(0);
        expect(d.id.startsWith(key)).toBe(true);
      }
    }
  });

  it('the orders change from day to day', () => {
    const days = Array.from({ length: 14 }, (_, i) => pickDailies(dayKey(new Date(Date.UTC(2026, 9, 1 + i)))).map((d) => d.kind).join());
    expect(new Set(days).size).toBeGreaterThan(7);
  });

  it('Daily Run seeds differ by role and day and are stable', () => {
    expect(dailySeed('20261010', 'gunner')).toBe(dailySeed('20261010', 'gunner'));
    expect(dailySeed('20261010', 'gunner')).not.toBe(dailySeed('20261010', 'pilot'));
    expect(dailySeed('20261010', 'gunner')).not.toBe(dailySeed('20261011', 'gunner'));
  });
});

describe('DailyTracker', () => {
  const at = (iso: string) => () => new Date(iso);

  it('completes an order once, fires the callbacks and persists', () => {
    const now = at('2026-10-10T10:00:00Z');
    const t = new DailyTracker(now);
    const [first] = t.list();
    const done: string[] = [];
    t.onComplete = (d) => done.push(d.id);
    t.record(first.kind, first.goal);
    t.record(first.kind, first.goal); // no double completion
    expect(done).toEqual([first.id]);
    expect(t.isDone(first)).toBe(true);
    expect(new DailyTracker(now).isDone(first)).toBe(true);
  });

  it("'best' kinds keep the best value, 'add' kinds accumulate", () => {
    const t = new DailyTracker(at('2026-10-10T10:00:00Z'));
    t.record('streak', 3); t.record('streak', 2);
    expect(t.value('streak')).toBe(3);
    t.record('kills', 2); t.record('kills', 5);
    expect(t.value('kills')).toBe(7);
  });

  it('a perfect day fires once all orders are done', () => {
    const t = new DailyTracker(at('2026-10-10T10:00:00Z'));
    let perfect = 0;
    t.onPerfect = () => perfect++;
    for (const d of t.list()) t.record(d.kind, d.goal);
    expect(t.doneCount()).toBe(DAILY_COUNT);
    expect(perfect).toBe(1);
  });

  it('resets on a new UTC day', () => {
    let now = new Date('2026-10-10T23:59:00Z');
    const t = new DailyTracker(() => now);
    t.record('kills', 10);
    expect(t.value('kills')).toBe(10);
    now = new Date('2026-10-11T00:01:00Z');
    expect(t.day).toBe('20261011');
    expect(t.value('kills')).toBe(0);
  });
});
