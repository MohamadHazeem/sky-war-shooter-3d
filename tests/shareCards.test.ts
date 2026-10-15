import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOG_MAX, STATS_KEY, accuracyCeiling, accuracySeries, cleanEntry, percentTicks, killsByType, loadLog, recordSortie, summarize, survivalSeries, type SortieEntry,
} from '../src/game/StatsLog';
import { MARKS_MAX, MEDALS_MAX, cardFileName, cardText, medalList, missionCard, tourCard } from '../src/game/ShareCardModel';
import { stubStorage } from './helpers';

const sortie = (o: Partial<SortieEntry> = {}): Omit<SortieEntry, 't'> & { t?: number } => ({
  id: 'm1', title: 'Black Thursday', role: 'gunner', success: true, survived: true, kills: 3, shots: 100, hits: 20, score: 1500, medals: [], types: { fw190: 3 }, ...o,
});

describe('stats logbook', () => {
  beforeEach(() => { stubStorage(); });

  it('records sorties in order and keeps only the newest LOG_MAX', () => {
    for (let i = 0; i < LOG_MAX + 15; i++) recordSortie(sortie({ t: 1000 + i, kills: i }));
    const log = loadLog();
    expect(log).toHaveLength(LOG_MAX);
    expect(log[0].kills).toBe(15);
    expect(log[log.length - 1].kills).toBe(LOG_MAX + 14);
  });

  it('cleans junk entries and corrupt storage', () => {
    expect(cleanEntry(null)).toBeNull();
    expect(cleanEntry({ id: 'x' })).toBeNull();
    const e = cleanEntry({ t: 5, id: 'x', kills: -4, shots: 10, hits: 99, role: 'bogus', medals: ['Air Medal', 3], types: { fw190: 2, bf109: 'x' } })!;
    expect(e.kills).toBe(0);
    expect(e.hits).toBe(10);          // never more hits than shots
    expect(e.role).toBe('gunner');
    expect(e.medals).toEqual(['Air Medal']);
    expect(e.types).toEqual({ fw190: 2 });
    stubStorage({ [STATS_KEY]: '{not json' });
    expect(loadLog()).toEqual([]);
  });

  it('charts accuracy per sortie with a rolling average weighted by rounds', () => {
    const log = [
      sortie({ shots: 100, hits: 10 }), sortie({ shots: 0, hits: 0 }), sortie({ shots: 300, hits: 90 }),
    ].map((e, i) => cleanEntry({ ...e, t: i })!);
    const { each, avg } = accuracySeries(log, 5);
    expect(each.map((p) => p.v)).toEqual([0.1, 0.3]);          // the sortie without a shot is skipped
    expect(avg[1].v).toBeCloseTo(100 / 400, 6);                // 10+90 hits over 400 rounds
    expect(accuracyCeiling([0.12, 0.27])).toBe(0.3);
    expect(accuracyCeiling([0.42])).toBe(0.5);
    expect(accuracyCeiling([0.81])).toBe(1);
    expect(accuracyCeiling([0.55])).toBe(0.6);
    expect(accuracyCeiling([1])).toBe(1);
    expect(percentTicks(0.3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(percentTicks(0.6)).toEqual([0, 0.2, 0.4, 0.6]);
  });

  it('charts the rolling survival rate and summarises by role', () => {
    const log = [true, false, true, true].map((s, i) => cleanEntry({ ...sortie({ survived: s, role: i === 1 ? 'pilot' : 'gunner' }), t: i })!);
    const s = survivalSeries(log, 2);
    expect(s.map((p) => p.v)).toEqual([1, 0.5, 0.5, 1]);
    const all = summarize(log);
    expect(all.sorties).toBe(4);
    expect(all.survivalRate).toBe(0.75);
    expect(summarize(log, 'pilot').survivalRate).toBe(0);
    expect(summarize(log, 'gunner').survivalRate).toBe(1);
    expect(summarize([]).best).toBeNull();
  });

  it('sorts kills by type, keeping known types with zero', () => {
    const rows = killsByType({ bf109: 4, me262: 9, he111: 1 }, ['fw190', 'bf109', 'me262']);
    expect(rows.map((r) => r.type)).toEqual(['me262', 'bf109', 'he111', 'fw190']);
    expect(rows[3].kills).toBe(0);
  });
});

describe('share card model', () => {
  const base = {
    title: 'Black Thursday', date: '14 October 1943', role: 'gunner' as const, success: true, kills: 7, accuracy: 0.234, rounds: 400,
    score: 12345, bombersLost: 2, bombersTotal: 12, medals: ['Purple Heart', 'Air Medal', 'Distinguished Flying Cross', 'Weekly thing'], ship: 'Sky Queen', nose: 'script',
  };

  it('builds the mission card: stamp, four numbers, marks, ribbons first, nose art', () => {
    const c = missionCard(base);
    expect(c.stamp).toEqual({ text: 'MISSION COMPLETE', good: true });
    expect(c.tiles.map((t) => t.value)).toEqual(['7', '23%', '10/12', '12,345']);
    expect(c.marks).toBe(7);
    expect(c.medals[c.medals.length - 1].name).toBe('Weekly thing');   // no ribbon: listed last
    expect(c.medals.every((m, i) => i === c.medals.length - 1 || m.ribbon)).toBe(true);
    expect(c.nose).toEqual({ id: 'script', name: 'Sky Queen' });
    expect(c.caption.vars).toEqual({ ship: 'Sky Queen', date: '14 October 1943' });
  });

  it('handles losses, pilots, survival and huge numbers', () => {
    const lost = missionCard({ ...base, success: false, kills: 55, rounds: 0, role: 'pilot' });
    expect(lost.stamp.good).toBe(false);
    expect(lost.nose).toBeNull();
    expect(lost.tiles[1].value).toBe('—');
    expect(lost.marks).toBe(MARKS_MAX);
    expect(lost.extraMarks).toBe(55 - MARKS_MAX);
    const surv = missionCard({ ...base, survival: true, waves: 9 });
    expect(surv.tiles[2]).toEqual({ label: 'ROUNDS SURVIVED', value: '9' });
    expect(cardText(lost).key).toMatch(/^Went down/);
    expect(cardText(missionCard(base)).vars).toEqual({ title: 'Black Thursday', kills: '7' });
  });

  it('caps and counts medals', () => {
    const many = medalList(['Air Medal', 'Air Medal', 'Silver Star', 'Purple Heart', 'Giant Killer', 'Ace in a Day', 'Experten Killer', 'X']);
    expect(many.list).toHaveLength(MEDALS_MAX);
    expect(many.list[0]).toMatchObject({ name: 'Air Medal', count: 2 });
    expect(many.more).toBe(2);   // seven different medals, five shown
    expect(medalList({ 'Air Medal': 3, Junk: 0 }).list).toEqual([expect.objectContaining({ name: 'Air Medal', count: 3 })]);
  });

  it('builds the tour card with the crew on the print', () => {
    const c = tourCard({
      sorties: 28, kills: 31, ships: ['Sky Queen', 'Lady Luck'], patches: 40,
      home: Array.from({ length: 12 }, (_, i) => ({ name: `Sgt. Man${i}`, pos: 'Tail Gun' })), fallen: 2, wounded: 1, medals: { 'Air Medal': 25 }, nose: 'pinup',
    });
    expect(c.kind).toBe('tour');
    expect(c.crew).toHaveLength(10);
    expect(c.tiles.map((t) => t.value)).toEqual(['28', '31', '2', '12/15']);
    expect(c.nose).toEqual({ id: 'pinup', name: 'Lady Luck' });
    expect(cardFileName(c, new Date('2026-10-15T10:00:00Z'))).toBe('sky-war-shooter-3d-tour-going-home-2026-10-15.png');
  });
});

describe('stats page', () => {
  it('shows empty states without a logbook and three charts with one', async () => {
    stubStorage();
    const { statsHtml, chartWidths } = await import('../src/ui/StatsScreen');
    const { emptyCareer } = await import('../src/game/Career');
    const empty = statsHtml(emptyCareer(), []);
    expect(empty).toContain('Fly a sortie and fire your guns to start this chart.');
    expect(empty.match(/<svg/g)).toHaveLength(1);             // kills by type is always drawn
    const log = [0, 1, 2].map((i) => cleanEntry({ ...sortie({ shots: 100, hits: 10 + i * 10, survived: i !== 1 }), t: i })!);
    const html = statsHtml({ ...emptyCareer(), kills: 9, killsByType: { fw190: 6, me262: 3 } }, log);
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain('st-line surv');
    expect(html).toContain('67%');                              // came home from two of three
    expect(chartWidths(390)).toEqual({ wide: 318, half: 318 });
    expect(chartWidths(1280).half).toBeLessThan(chartWidths(1280).wide);
  });
});
