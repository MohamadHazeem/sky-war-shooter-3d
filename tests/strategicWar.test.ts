import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { CAMPAIGN } from '../src/game/Missions';
import { RAID_TEMPLATES } from '../src/game/SideRaids';
import {
  LAG, SITES, SECTORS, STRATEGIC_KEY, advanceTo, defaultStrategic, deliveries, industryFactors, industryType, industryTypeList,
  isNeutral, loadStrategic, rebuildStrategic, recordStrike, sanitizeStrategic, sectorOutput, siteById, strikesFor, weekOf,
  type StrategicData,
} from '../src/game/StrategicWar';
import {
  CAMPAIGN_KEY, applyModifiers, defaultCampaign, prepareCampaignMission, recordCampaignOutcome, saveCampaign, strategicModifiersFor, modifiersFor,
} from '../src/game/CampaignState';
import { hasPhrase, setLang } from '../src/i18n';
import { INDUSTRY_CHART, industryXY } from '../src/ui/StrategicPanel';

const byId = (id: string) => CAMPAIGN.find((m) => m.id === id)!;
const win = { success: true, bombersLost: 1, bombersTotal: 12 };
const op = (id: string) => { const m = byId(id); return { id, target: m.target, date: m.date }; };

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('war industry model', () => {
  it('is neutral until something is hit, however many weeks pass', () => {
    const d = defaultStrategic(5);
    advanceTo(d, 60);
    expect(d.week).toBe(60);
    const f = industryFactors(d);
    expect(isNeutral(f)).toBe(true);
    for (const s of SECTORS) expect(sectorOutput(d, s)).toBe(1);
  });

  it('dates map to weeks from the first operation', () => {
    expect(weekOf(CAMPAIGN[0].date)).toBe(0);
    expect(weekOf('14 October 1943')).toBe(2);
    expect(weekOf('11 April 1944')).toBeGreaterThan(weekOf('6 March 1944'));
    expect(weekOf('not a date')).toBe(0);
  });

  it('maps every operation to real target sites', () => {
    expect(strikesFor(byId('m8')).map((s) => s.site.id)).toEqual(['schweinfurt']);
    expect(strikesFor(byId('m11')).map((s) => s.site.id)).toEqual(['regensburg']);
    expect(strikesFor(byId('m1'))).toEqual([]);                    // U-boat yards: no industry
    expect(strikesFor({ id: 'raid-3-oil', target: 'Synthetic oil plant, Gelsenkirchen' })[0].site.id).toBe('gelsenkirchen');
    expect(strikesFor({ id: 'x', target: 'Industrial district, Bremen' })[0]).toMatchObject({ weight: 0.5 });
    // every raid template's rail, oil and factory target resolves to a site of the right sector
    const sector = { rail: 'rail', oil: 'oil', factory: 'aircraft' } as const;
    for (const t of RAID_TEMPLATES) {
      if (!(t.kind in sector)) continue;
      for (const g of t.targets) {
        const s = strikesFor({ id: 'raid', target: `${g.name}, ${g.city}` });
        expect(s.length, g.city).toBe(1);
        expect(s[0].site.sector, g.city).toBe(sector[t.kind as keyof typeof sector]);
        expect(s[0].weight, g.city).toBe(1);
      }
    }
    for (const m of CAMPAIGN) for (const s of strikesFor(m)) expect(siteById(s.site.id)).toBeTruthy();
  });

  it('damage reaches output only after the sector lag, then is repaired', () => {
    const d0 = defaultStrategic(9);
    const { data } = recordStrike(d0, op('m8'), win);           // Schweinfurt, bearings, lag 5
    const w = weekOf(byId('m8').date);
    expect(LAG.bearings).toBe(5);
    expect(data.sites.schweinfurt.dmg).toBe(0);                  // still in the pipeline
    expect(data.sites.schweinfurt.queue.length).toBe(1);
    const d = structuredClone(data) as StrategicData;
    advanceTo(d, w + LAG.bearings + 1);
    const hit = d.sites.schweinfurt.dmg;
    expect(hit).toBeGreaterThan(0.3);
    expect(d.sites.schweinfurt.queue.length).toBe(0);
    advanceTo(d, w + 30);
    expect(d.sites.schweinfurt.dmg).toBeLessThan(hit * 0.4);    // repaired over the months
    // rail is cut the same week
    const r = recordStrike(defaultStrategic(9), { id: 'raid-1-rail', target: 'Marshalling yards, Hamm', date: '1 October 1943' }, win).data;
    expect(r.sites.hamm.dmg).toBeGreaterThan(0);
  });

  it('what you hit shapes the Luftwaffe of later missions', () => {
    let d = defaultStrategic(3);
    const ids = ['m8', 'm4', 'm5', 'm11'];
    ids.forEach((id, i) => { d = recordStrike(d, op(id), win, i + 1 < ids.length ? byId(ids[i + 1]).date : '11 April 1944').data; });
    const f = industryFactors(d);
    expect(f.enemy).toBeLessThan(1);
    expect(f.enemy).toBeGreaterThanOrEqual(0.8);
    expect(f.bf109).toBeLessThan(f.fw190);                       // Messerschmitt plants hit, Focke-Wulf untouched
    expect(f.jets).toBeLessThan(1);                              // Regensburg: jet programme set back
    expect(deliveries(d)).toBeLessThan(1);
    // the mix: Bf 109s are swapped for Fw 190s about as often as their output is short
    let swapped = 0;
    for (let i = 0; i < 1000; i++) if (industryType('bf109', f, () => i / 1000) === 'fw190') swapped++;
    expect(swapped / 1000).toBeCloseTo(1 - f.bf109 / f.fw190, 1);
    expect(industryType('fw190', f, () => 0.99)).toBe('fw190');
    // destroyer works hit: fewer heavies; oil hit: fuel and skill
    let h = defaultStrategic(3);
    for (const t of ['Aircraft assembly plant, Brunswick', 'Gothaer Waggonfabrik, Gotha']) h = recordStrike(h, { id: t, target: t, date: '1 November 1943' }, win, '1 March 1944').data;
    const fh = industryFactors(h);
    expect(fh.heavy).toBeLessThan(0.9);
    expect(industryType('bf110', fh, () => 0.999)).not.toBe('bf110');
    expect(industryTypeList(['fw190', 'bf110', 'ju88'], { ...fh, heavy: 0.4 })).toEqual(['fw190']);
    let o = defaultStrategic(3);
    for (const t of ['Synthetic fuel works, Leuna', 'Synthetic oil plant, Gelsenkirchen']) o = recordStrike(o, { id: t, target: t, date: '1 November 1943' }, win, '1 December 1943').data;
    expect(industryFactors(o).skill).toBeLessThan(1);
  });

  it('a failed raid does far less than a successful one', () => {
    const s = recordStrike(defaultStrategic(2), op('m11'), win, '1 June 1944').data;
    const f = recordStrike(defaultStrategic(2), op('m11'), { ...win, success: false }, '1 June 1944').data;
    expect(industryFactors(f).bf109).toBeGreaterThan(industryFactors(s).bf109);
  });

  it('is deterministic and does not change its input', () => {
    const d0 = defaultStrategic(42);
    const snap = JSON.stringify(d0);
    const a = recordStrike(d0, op('m3'), win, byId('m10').date);
    const b = recordStrike(d0, op('m3'), win, byId('m10').date);
    expect(a).toEqual(b);
    expect(JSON.stringify(d0)).toBe(snap);
    // a different campaign seed spreads the bombs differently
    expect(recordStrike(defaultStrategic(43), op('m3'), win, byId('m10').date).data.sites.ludwigshafen.dmg).not.toBe(a.data.sites.ludwigshafen.dmg);
  });

  it('writes a newsreel with a headline, the sectors and a forecast', () => {
    const { reel } = recordStrike(defaultStrategic(1), op('m8'), win, byId('m3').date);
    expect(reel.headline.text).toBe('Ball-bearing works ablaze at {city}');
    expect(reel.headline.vars).toEqual({ city: 'Schweinfurt' });
    expect(reel.weeks).toBe(weekOf(byId('m3').date) - weekOf(byId('m8').date));
    expect(reel.sectors.map((s) => s.sector)).toEqual(SECTORS);
    expect(reel.sectors.find((s) => s.sector === 'bearings')!.after).toBeLessThan(100);
    expect(reel.forecast.length).toBeGreaterThan(0);
    const quiet = recordStrike(defaultStrategic(1), op('m1'), win, byId('m2').date).reel;
    expect(quiet.lines).toEqual([]);
    expect(quiet.headline.text).toMatch(/press on/);
  });

  it('forecasts the fighter mix without contradicting the type swap', () => {
    const texts = (r: { forecast: { text: string }[] }) => r.forecast.map((l) => l.text).join(' | ');
    // only the Focke-Wulf lines are short: 109s fill in
    const fw = recordStrike(defaultStrategic(3), { id: 'x1', target: 'Focke-Wulf works, Bremen', date: '1 May 1944' }, win, '19 June 1944').reel;
    expect(texts(fw)).toMatch(/Fewer Fw 190s expected.*more Bf 109s fill in/);
    expect(texts(fw)).not.toMatch(/Fewer Bf 109s/);
    // both single-engine types cut: one plain line, never "fewer 190s" and "fewer 109s" side by side
    const a = recordStrike(defaultStrategic(3), { id: 'x1', target: 'Focke-Wulf works, Bremen', date: '1 May 1944' }, win, '8 May 1944');
    const both = recordStrike(a.data, { id: 'x2', target: 'Erla aircraft works, Leipzig', date: '8 May 1944' }, win, '19 June 1944').reel;
    expect(texts(both)).toMatch(/Single-engine fighter deliveries down/);
    expect(texts(both)).not.toMatch(/Fewer Fw 190s|Fewer Bf 109s/);
  });

  it('saves, sanitizes and rebuilds from the operations log', () => {
    const d = recordStrike(defaultStrategic(11), op('m8'), win, byId('m3').date).data;
    const back = sanitizeStrategic(JSON.parse(JSON.stringify(d)))!;
    expect(back).toEqual(d);
    expect(sanitizeStrategic({ v: 2 })).toBeNull();
    expect(sanitizeStrategic({ v: 1, seed: 1, sites: { schweinfurt: { dmg: 7, queue: [['x', 1]] } } })!.sites.schweinfurt).toEqual({ dmg: 0.9, queue: [] });
    const history = [{ id: 'm1', success: true, lost: 0 }, { id: 'm2', success: true, lost: 1 }, { id: 'm8', success: true, lost: 1 }];
    const rebuilt = rebuildStrategic({ seed: 11, history });
    expect(rebuilt.log).toEqual(['m1', 'm2', 'm8']);
    expect(rebuilt.sites.schweinfurt.queue.length + (rebuilt.sites.schweinfurt.dmg > 0 ? 1 : 0)).toBeGreaterThan(0);
    // a foreign save (another campaign seed) is replaced by the rebuild
    localStorage.setItem(STRATEGIC_KEY, JSON.stringify(defaultStrategic(999)));
    expect(loadStrategic({ seed: 11, history }).log).toEqual(['m1', 'm2', 'm8']);
    expect(JSON.parse(localStorage.getItem(STRATEGIC_KEY)!).seed).toBe(11);
  });
});

describe('campaign hooks', () => {
  it('records the strike with the campaign and feeds the next operation', () => {
    const progress = { unlocked: 0, medals: {} as Record<string, string[]>, best: {} };
    // fly the tour up to Black Thursday
    let cur = CAMPAIGN[0];
    for (let i = 0; i < CAMPAIGN.length && cur.id !== 'm3'; i++) {
      prepareCampaignMission(cur, progress);
      progress.unlocked = i + 1;
      const res = recordCampaignOutcome(cur, { success: true, kills: 5, bombersLost: 1, bombersTotal: cur.bombers }, progress)!;
      expect(res.newsreel, cur.id).toBeTruthy();
      cur = CAMPAIGN[i + 1];
    }
    const saved = JSON.parse(localStorage.getItem(STRATEGIC_KEY)!) as StrategicData;
    expect(saved.log).toEqual(['m1', 'm2', 'm8', 'm9']);
    // a replay changes nothing and shows no newsreel
    const replay = recordCampaignOutcome(CAMPAIGN[0], { success: true, kills: 5, bombersLost: 0, bombersTotal: 9 }, progress)!;
    expect(replay.report.effect).toBe(false);
    expect(replay.newsreel).toBeNull();
    // Schweinfurt's bearings shortage has reached the fighter lines by Ludwigshafen
    const c = JSON.parse(localStorage.getItem(CAMPAIGN_KEY)!);
    const m3 = byId('m3');
    const plain = modifiersFor(c, m3)!, withIndustry = strategicModifiersFor(c, m3)!;
    expect(withIndustry.enemy).toBeLessThan(plain.enemy);
    prepareCampaignMission(m3, progress);
    const fighters = m3.round!.max;
    applyModifiers(m3, null);
    expect(fighters).toBeLessThanOrEqual(m3.round!.max);
  });

  it('a fresh campaign flies exactly as before', () => {
    const c = defaultCampaign(5);
    saveCampaign(c);
    expect(strategicModifiersFor(c, CAMPAIGN[0])).toEqual(modifiersFor(c, CAMPAIGN[0]));
  });
});

describe('Arabic', () => {
  it('covers every new player text', () => {
    const texts = new Set<string>(['War industry', 'Industry map', 'Newsreel', 'Aircraft factories', 'Ball bearings', 'Oil', 'Rail',
      'Untouched: German industry is at full output', 'From industry: fighters x{a} · skill x{b}', 'No German works hit yet.',
      'Dark wedge: damage. Dashed ring: damage still on its way to the production lines.', 'Fighter deliveries {a} · pilot training {b} · jets {c}',
      'The air war this week · {date}', 'The air war · {n} weeks from {date}', 'GERMAN WAR INDUSTRY · 1943–45', 'Frontier, 1937',
      'BALTIC SEA', 'NORTH SEA', 'FRANCE', 'HOLLAND', 'GERMANY', 'Rhine', 'Main', 'Neckar', 'Danube', 'Elbe', 'Saale', 'Weser', 'Ems', 'Oder',
      'Single-engine fighter deliveries down: fewer Fw 190s and Bf 109s alike',
      'Fewer Fw 190s expected: the Focke-Wulf lines are short, more Bf 109s fill in',
      'Fewer Bf 109s expected: Messerschmitt deliveries are down, more Fw 190s fill in']);
    for (const s of SITES) { texts.add(s.name); texts.add(s.city); }
    // every newsreel line the model can write
    let d = defaultStrategic(8);
    const ops = [...CAMPAIGN.map((m) => ({ id: m.id, target: m.target, date: m.date })), { id: 'r', target: 'Marshalling yards, Hamm', date: '1 May 1944' },
      { id: 'o', target: 'Synthetic fuel works, Leuna', date: '8 May 1944' }, { id: 'b', target: 'Gothaer Waggonfabrik, Gotha', date: '15 May 1944' }];
    for (const [i, o] of ops.entries()) {
      const res = recordStrike(d, o, { ...win, success: i % 4 !== 3 }, '1 June 1945');
      d = res.data;
      for (const l of [res.reel.headline, ...res.reel.lines, ...res.reel.forecast]) {
        texts.add(l.text);
        for (const v of Object.values(l.vars ?? {})) if (typeof v === 'string') texts.add(v);
      }
    }
    for (const t of texts) expect(hasPhrase(t), t).toBe(true);
  });
});

describe('industry map', () => {
  it('frames every site inside the chart, clear of the frame', () => {
    const { W, H } = INDUSTRY_CHART;
    for (const s of SITES) {
      const [x, y] = industryXY(s);
      expect(x, s.id).toBeGreaterThan(24);
      expect(x, s.id).toBeLessThan(W - 24);
      expect(y, s.id).toBeGreaterThan(24);
      expect(y, s.id).toBeLessThan(H - 24);
    }
  });

  it('keeps every marker apart (no two sites drawn on top of each other)', () => {
    for (const a of SITES) for (const b of SITES) {
      if (a.id >= b.id) continue;
      const [ax, ay] = industryXY(a), [bx, by] = industryXY(b);
      const ra = 4 + Math.sqrt(a.output) * 1.2, rb = 4 + Math.sqrt(b.output) * 1.2;
      expect(Math.hypot(ax - bx, ay - by), `${a.id}/${b.id}`).toBeGreaterThan(ra + rb);
    }
  });
});
