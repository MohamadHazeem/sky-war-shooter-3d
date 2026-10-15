// Strategic air war: German war industry under the campaign (CampaignState.ts) and its second
// tour. A map of real 1943-45 targets in four sectors (aircraft factories, ball bearings, oil,
// rail), each with a weekly production value. Raids damage a site; the damage reaches the
// production lines after a sector's real lag (finished airframes and bearing stocks bridge the
// gap, a refinery stops at once, a rail yard is cut the same day) and is repaired week by week.
//
// The week-by-week simulation turns the four sectors into what the bombers meet in the air:
//   fighters   deliveries of new fighters (aircraft sites x bearings x rail), smoothed: the
//              enemy count of later missions (x0.80..1)
//   pilots     fuel (oil x rail) for training, slower still: enemy skill (x0.90..1)
//   types      Fw 190 / Bf 109 / twin-engine destroyer output: the fighter mix of later missions
//              (hit the Focke-Wulf plants and more 109s come up; hit Brunswick and Gotha and fewer
//              Bf 110s and Ju 88s); the jet programme (Regensburg) and rocket fuel gate Me 262s
//              and Me 163s.
// With nothing hit every factor is exactly 1, so the campaign plays as before until you bomb.
//
// Pure data and maths, deterministic (a seeded generator for the bomb-pattern spread), saved in
// localStorage 'sws3d.strategic.v1' bound to the campaign seed. A missing or foreign save is
// rebuilt from the campaign's operations log. Game hooks (one line each):
//   CampaignState.recordCampaignOutcome -> recordStrategicStrike (newsreel on the debrief)
//   CampaignState.prepareCampaignMission -> industryFactors / industryAdjust
//   ui/StrategicPanel.ts: the industry card on the campaign map and the newsreel card.
import { CAMPAIGN } from './Missions';
import { rng, sideRaidById } from './SideRaids';
import { isSecondTourId, secondTourMission } from './SecondTour';
import type { EnemyType } from '../world/EnemyTypes';

export const STRATEGIC_KEY = 'sws3d.strategic.v1';

export type Sector = 'aircraft' | 'bearings' | 'oil' | 'rail';
export type Product = 'fw190' | 'bf109' | 'heavy';
export const SECTORS: Sector[] = ['aircraft', 'bearings', 'oil', 'rail'];

export interface Site {
  id: string;
  name: string;         // works name (player text, translated)
  city: string;         // matched against Mission.target
  sector: Sector;
  output: number;       // weekly production value (share of the sector)
  product?: Product;    // aircraft sites: what comes off the line
  jets?: boolean;       // part of the Me 262 programme
  lat: number; lon: number;
}

// Historically plausible sites and relative outputs (1943-44). The bearings plants at
// Schweinfurt made about half of Germany's bearings; Leuna and Pölitz were the largest
// synthetic fuel works; Hamm was the busiest marshalling yard in the Reich.
export const SITES: Site[] = [
  { id: 'regensburg', name: 'Messerschmitt works', city: 'Regensburg', sector: 'aircraft', output: 30, product: 'bf109', jets: true, lat: 49.01, lon: 12.06 },
  { id: 'leipzig', name: 'Erla aircraft works', city: 'Leipzig', sector: 'aircraft', output: 24, product: 'bf109', lat: 51.34, lon: 12.37 },
  { id: 'oschersleben', name: 'AGO aircraft plant', city: 'Oschersleben', sector: 'aircraft', output: 24, product: 'fw190', lat: 52.03, lon: 11.23 },
  { id: 'bremen', name: 'Focke-Wulf works', city: 'Bremen', sector: 'aircraft', output: 18, product: 'fw190', lat: 53.05, lon: 8.8 },
  { id: 'kassel', name: 'Fieseler works', city: 'Kassel', sector: 'aircraft', output: 20, product: 'fw190', lat: 51.31, lon: 9.48 },
  { id: 'brunswick', name: 'MIAG aircraft works', city: 'Brunswick', sector: 'aircraft', output: 12, product: 'heavy', lat: 52.27, lon: 10.52 },
  { id: 'gotha', name: 'Gothaer Waggonfabrik', city: 'Gotha', sector: 'aircraft', output: 10, product: 'heavy', lat: 50.95, lon: 10.7 },
  { id: 'schweinfurt', name: 'Ball-bearing plants', city: 'Schweinfurt', sector: 'bearings', output: 50, lat: 50.05, lon: 10.23 },
  { id: 'erkner', name: 'VKF bearing works', city: 'Erkner', sector: 'bearings', output: 20, lat: 52.42, lon: 13.75 },
  { id: 'cannstatt', name: 'Bearing works', city: 'Stuttgart', sector: 'bearings', output: 15, lat: 48.8, lon: 9.22 },
  { id: 'leuna', name: 'Synthetic fuel works', city: 'Leuna', sector: 'oil', output: 30, lat: 51.32, lon: 12.0 },
  { id: 'politz', name: 'Hydrogenation plant', city: 'Pölitz', sector: 'oil', output: 25, lat: 53.6, lon: 14.6 },
  { id: 'gelsenkirchen', name: 'Synthetic oil plant', city: 'Gelsenkirchen', sector: 'oil', output: 20, lat: 51.52, lon: 7.1 },
  { id: 'ludwigshafen', name: 'Chemical works', city: 'Ludwigshafen', sector: 'oil', output: 15, lat: 49.48, lon: 8.44 },
  { id: 'misburg', name: 'Refinery', city: 'Misburg', sector: 'oil', output: 10, lat: 52.4, lon: 9.85 },
  { id: 'hamm', name: 'Marshalling yards', city: 'Hamm', sector: 'rail', output: 30, lat: 51.68, lon: 7.82 },
  { id: 'munster', name: 'Rail junction', city: 'Münster', sector: 'rail', output: 15, lat: 51.96, lon: 7.63 },
  { id: 'osnabruck', name: 'Marshalling yards', city: 'Osnabrück', sector: 'rail', output: 15, lat: 52.27, lon: 8.05 },
  { id: 'hannover', name: 'Rail yards', city: 'Hannover', sector: 'rail', output: 20, lat: 52.37, lon: 9.73 },
  { id: 'berlin', name: 'Industrial rail district', city: 'Berlin', sector: 'rail', output: 30, lat: 52.52, lon: 13.4 },
  { id: 'frankfurt', name: 'Rail yards', city: 'Frankfurt', sector: 'rail', output: 20, lat: 50.11, lon: 8.68 },
];
export const siteById = (id: string) => SITES.find((s) => s.id === id);

// Weeks between a hit and its effect on output, and the share of the damage repaired each week
export const LAG: Record<Sector, number> = { aircraft: 3, bearings: 5, oil: 1, rail: 0 };
export const REPAIR: Record<Sector, number> = { aircraft: 0.07, bearings: 0.06, oil: 0.12, rail: 0.3 };
export const MAX_DAMAGE = 0.9;
const SMOOTH_FIGHTERS = 0.3, SMOOTH_PILOTS = 0.15;
export const JET_SETBACK = 6;           // weeks per full-weight hit on a jet site
const JET_CATCH_UP = 0.2;               // weeks of setback recovered per week

// The story operations' strikes (escorts and return legs carry their raid's target; Emden and
// Kiel were naval targets). Raids and second-tour operations are matched by their target text.
export const STORY_STRIKES: Record<string, [string, number][]> = {
  m1: [], m9: [], m10: [],
  m2: [['bremen', 0.35]],
  m8: [['schweinfurt', 1]],
  m3: [['ludwigshafen', 1]],
  m4: [['leipzig', 1]],
  m5: [['schweinfurt', 1]],
  m11: [['regensburg', 1]],
  m6: [['berlin', 0.5]],
  m7: [['erkner', 1]],
  m12: [['oschersleben', 1]],
};

const KEYWORDS: [Sector, RegExp][] = [
  ['oil', /oil|fuel|refinery|hydrogenation|chemical/i],
  ['bearings', /bearing/i],
  ['rail', /rail|yards|junction|marshalling/i],
  ['aircraft', /aircraft|fieseler|gothaer|messerschmitt|focke|assembly/i],
];

/** The industrial sites a mission strikes, with the weight of the attack on each. */
export function strikesFor(m: { id: string; target: string }): { site: Site; weight: number }[] {
  const table = STORY_STRIKES[m.id];
  if (table) return table.map(([id, weight]) => ({ site: siteById(id)!, weight }));
  const inCity = SITES.filter((s) => m.target.includes(s.city));
  if (!inCity.length) return [];
  const sector = KEYWORDS.find(([, re]) => re.test(m.target))?.[0];
  const exact = inCity.find((s) => s.sector === sector);
  if (exact) return [{ site: exact, weight: 1 }];
  // an industrial district: the city's main works, half weight
  return [{ site: inCity[0], weight: 0.5 }];
}

// ---------------- state ----------------

export interface SiteState { dmg: number; queue: [number, number][] }   // queue: [week it bites, amount]
export interface ReelLine { text: string; vars?: Record<string, string | number>; tone?: 'good' | 'bad' }
export interface SectorChange { sector: Sector; before: number; after: number }
export interface Newsreel {
  date: string;            // date of the operation (campaign date string)
  weeks: number;           // weeks covered until the next operation
  headline: ReelLine;
  lines: ReelLine[];
  sectors: SectorChange[];
  forecast: ReelLine[];
  enemy: number; skill: number;
}

export interface StrategicData {
  v: 1;
  seed: number;
  week: number;            // weeks since EPOCH
  sites: Record<string, SiteState>;
  fighters: number;        // fighter strength against an unbombed Reich, 0..1
  pilots: number;          // pilot training (fuel), 0..1
  types: Record<Product, number>;
  jetDelay: number;        // weeks the jet programme has been set back
  strikes: number;
  log: string[];           // operation ids recorded (bounded): replays are never counted twice
  reel: Newsreel | null;
}

const DAY = 86400000;
export const EPOCH = Date.UTC(1943, 8, 27);   // the first operation, Emden
export const weekOf = (date: string) => {
  const t = Date.parse(date + ' UTC');
  return Number.isFinite(t) ? Math.max(0, Math.floor((t - EPOCH) / (7 * DAY))) : 0;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function defaultStrategic(seed: number): StrategicData {
  const sites: Record<string, SiteState> = {};
  for (const s of SITES) sites[s.id] = { dmg: 0, queue: [] };
  return { v: 1, seed, week: 0, sites, fighters: 1, pilots: 1, types: { fw190: 1, bf109: 1, heavy: 1 }, jetDelay: 0, strikes: 0, log: [], reel: null };
}

function clone(d: StrategicData): StrategicData {
  const sites: Record<string, SiteState> = {};
  for (const [k, s] of Object.entries(d.sites)) sites[k] = { dmg: s.dmg, queue: s.queue.map((q) => [q[0], q[1]] as [number, number]) };
  return { ...d, sites, types: { ...d.types }, log: [...d.log] };
}

// ---------------- production ----------------

/** Output of a sector right now, 0..1 of its undamaged value (optionally one product). */
export function sectorOutput(d: StrategicData, sector: Sector, product?: Product): number {
  let have = 0, full = 0;
  for (const s of SITES) {
    if (s.sector !== sector || (product && s.product !== product)) continue;
    full += s.output;
    have += s.output * (1 - (d.sites[s.id]?.dmg ?? 0));
  }
  return full ? have / full : 1;
}

/** Deliveries of one product this week: its factories, held back by bearings and rail. */
export function deliveries(d: StrategicData, product?: Product): number {
  const bearings = sectorOutput(d, 'bearings'), rail = sectorOutput(d, 'rail');
  return sectorOutput(d, 'aircraft', product) * (0.7 + 0.3 * bearings) * (0.8 + 0.2 * rail);
}
export const fuelSupply = (d: StrategicData) => sectorOutput(d, 'oil') * (0.85 + 0.15 * sectorOutput(d, 'rail'));

/** One week of war: queued damage reaches the lines, repairs go on, deliveries feed the front. */
export function tickWeek(d: StrategicData): void {
  const w = d.week;
  for (const s of SITES) {
    const st = d.sites[s.id] ?? (d.sites[s.id] = { dmg: 0, queue: [] });
    if (st.dmg > 0) st.dmg = st.dmg * (1 - REPAIR[s.sector]);
    if (st.dmg < 0.005) st.dmg = 0;
    if (st.queue.length) {
      const due = st.queue.filter((q) => q[0] <= w);
      for (const [, a] of due) st.dmg = Math.min(MAX_DAMAGE, st.dmg + a * (1 - st.dmg));
      st.queue = st.queue.filter((q) => q[0] > w);
    }
    st.dmg = r4(st.dmg);
  }
  d.fighters = r4(d.fighters + (deliveries(d) - d.fighters) * SMOOTH_FIGHTERS);
  for (const p of ['fw190', 'bf109', 'heavy'] as Product[]) d.types[p] = r4(d.types[p] + (deliveries(d, p) - d.types[p]) * SMOOTH_FIGHTERS);
  d.pilots = r4(d.pilots + (fuelSupply(d) - d.pilots) * SMOOTH_PILOTS);
  d.jetDelay = r4(Math.max(0, d.jetDelay - JET_CATCH_UP));
  d.week = w + 1;
}

/** Advance the clock to `week` (never backwards; bounded). */
export function advanceTo(d: StrategicData, week: number): number {
  let n = 0;
  while (d.week < week && n < 520) { tickWeek(d); n++; }
  return n;
}

// ---------------- what the bombers meet ----------------

export interface IndustryFactors {
  enemy: number;           // fighters in the air x
  skill: number;           // enemy skill x
  fw190: number; bf109: number; heavy: number;
  jets: number;            // 0..1 share of the usual Me 262 / Me 163 sorties
  rocketFuel: number;      // 0..1 (Me 163 fuel came from the chemical works)
}

export function industryFactors(d: StrategicData): IndustryFactors {
  return {
    enemy: r4(clamp(0.4 + 0.6 * d.fighters, 0.8, 1)),
    skill: r4(clamp(0.88 + 0.12 * d.pilots, 0.9, 1)),
    fw190: d.types.fw190, bf109: d.types.bf109, heavy: d.types.heavy,
    jets: r4(1 / (1 + d.jetDelay / JET_SETBACK)),
    rocketFuel: r4(sectorOutput(d, 'oil')),
  };
}
export const isNeutral = (f: IndustryFactors) => f.enemy === 1 && f.skill === 1 && f.fw190 === 1 && f.bf109 === 1 && f.heavy === 1 && f.jets === 1 && f.rocketFuel === 1;

const HEAVY: EnemyType[] = ['bf110', 'ju88', 'me410'];

/**
 * The enemy type that actually comes up, given the type the normal mix picked. Types whose
 * factories were hit are swapped (with the probability of the shortfall) for the single-engine
 * type still in better supply. Pure; `rnd` is Math.random in play.
 */
export function industryType(t: EnemyType, f: IndustryFactors, rnd: () => number): EnemyType {
  const best: EnemyType = f.bf109 > f.fw190 ? 'bf109' : 'fw190';
  const top = Math.max(f.fw190, f.bf109, 1e-6);
  let keep = 1;
  if (t === 'fw190') keep = f.fw190 / top;
  else if (t === 'bf109') keep = f.bf109 / top;
  else if (HEAVY.includes(t)) keep = f.heavy;
  else if (t === 'me262') keep = f.jets;
  else if (t === 'me163') keep = f.jets * f.rocketFuel;
  return keep >= 1 || rnd() < keep ? t : t === 'fw190' ? 'bf109' : t === 'bf109' ? 'fw190' : best;
}

/** Second-tour operations name their types: a type in short supply leaves the list. */
export function industryTypeList(types: readonly EnemyType[], f: IndustryFactors): EnemyType[] {
  const out = types.filter((t) => (HEAVY.includes(t) ? f.heavy >= 0.6 : t === 'me262' ? f.jets >= 0.5 : t === 'me163' ? f.jets * f.rocketFuel >= 0.5 : true));
  return out.length ? out : ['fw190'];
}

// ---------------- strikes and the newsreel ----------------

export interface StrikeOutcome { success: boolean; bombersLost: number; bombersTotal: number }

const sectorSnapshot = (d: StrategicData): Record<Sector, number> =>
  ({ aircraft: sectorOutput(d, 'aircraft'), bearings: sectorOutput(d, 'bearings'), oil: sectorOutput(d, 'oil'), rail: sectorOutput(d, 'rail') });

const HEADLINES: Record<Sector, [string, string]> = {
  aircraft: ['Fighter factory hit at {city}', 'Bombs scattered near the aircraft works at {city}'],
  bearings: ['Ball-bearing works ablaze at {city}', 'Bearing plants at {city} escape lightly'],
  oil: ['Oil plant burns at {city}', 'Smoke screen saves the fuel works at {city}'],
  rail: ['Rail yards wrecked at {city}', 'Trains still running through {city}'],
};

const pct = (n: number) => Math.round(n * 100);

/**
 * Record one operation: advance the clock to its date, drop its bombs on the sites it strikes
 * (queued behind the sector's lag), then run the weeks until the next operation and write the
 * newsreel. Returns the new state (the input is not changed).
 */
export function recordStrike(d0: StrategicData, op: { id: string; target: string; date: string }, o: StrikeOutcome, nextDate?: string): { data: StrategicData; reel: Newsreel } {
  const d = clone(d0);
  advanceTo(d, weekOf(op.date));
  const before = sectorSnapshot(d), f0 = industryFactors(d);
  const strikes = strikesFor(op);
  const r = rng((Math.imul(d.seed, 2654435761) ^ Math.imul(d.week + 1, 40503) ^ d.strikes) >>> 0);
  const accuracy = 1 - 0.6 * clamp(o.bombersTotal ? o.bombersLost / o.bombersTotal : 0, 0, 1);
  const hits: { site: Site; amount: number }[] = [];
  for (const { site, weight } of strikes) {
    const amount = r4((o.success ? 0.5 : 0.12) * weight * accuracy * (0.85 + 0.3 * r()));
    d.sites[site.id].queue.push([d.week + LAG[site.sector], amount]);
    if (d.sites[site.id].queue.length > 8) d.sites[site.id].queue.shift();
    if (site.jets) d.jetDelay = r4(d.jetDelay + JET_SETBACK * weight * (o.success ? 1 : 0.2));
    hits.push({ site, amount });
  }
  d.strikes++;
  d.log.push(op.id);
  if (d.log.length > 120) d.log.splice(0, d.log.length - 120);
  const start = d.week;
  const target = Math.max(start + 1, nextDate ? weekOf(nextDate) : start + 1);
  const weeks = advanceTo(d, target);
  const after = sectorSnapshot(d), f1 = industryFactors(d);

  // headline: the heaviest hit, or the week's general news
  const main = hits.slice().sort((a, b) => b.amount - a.amount)[0];
  const headline: ReelLine = main
    ? { text: HEADLINES[main.site.sector][o.success ? 0 : 1], vars: { city: main.site.city }, tone: o.success ? 'good' : 'bad' }
    : { text: o.success ? 'The bombers press on: no factory on the target list this week' : 'A hard week for the bombers', tone: o.success ? undefined : 'bad' };

  const lines: ReelLine[] = [];
  for (const h of hits) {
    const lag = LAG[h.site.sector];
    lines.push({
      text: lag ? '{works}, {city}: about {n}% of output lost, felt in {w} weeks' : '{works}, {city}: about {n}% of traffic stopped at once',
      vars: { works: h.site.name, city: h.site.city, n: Math.max(1, pct(h.amount)), w: lag }, tone: o.success ? 'good' : undefined,
    });
  }
  const sectors: SectorChange[] = SECTORS.map((s) => ({ sector: s, before: pct(before[s]), after: pct(after[s]) }));

  // forecast: what the next missions will feel
  const forecast: ReelLine[] = [];
  const pending = SITES.filter((s) => d.sites[s.id].queue.length);
  if (pending.length) {
    const soonest = Math.min(...pending.flatMap((s) => d.sites[s.id].queue.map((q) => q[0])));
    forecast.push({ text: 'Damage still working through the factories: shortages bite in about {w} weeks', vars: { w: Math.max(1, soonest - d.week + 1) } });
  }
  // One short type is replaced by the other (industryType), so "fewer 190s" means "more 109s":
  // when both fall, only the total of single-engine fighters drops and the line says just that.
  const fwDown = f1.fw190 < f0.fw190 - 0.03, bfDown = f1.bf109 < f0.bf109 - 0.03;
  if (fwDown && bfDown) forecast.push({ text: 'Single-engine fighter deliveries down: fewer Fw 190s and Bf 109s alike', tone: 'good' });
  else if (fwDown) forecast.push({ text: 'Fewer Fw 190s expected: the Focke-Wulf lines are short, more Bf 109s fill in', tone: 'good' });
  else if (bfDown) forecast.push({ text: 'Fewer Bf 109s expected: Messerschmitt deliveries are down, more Fw 190s fill in', tone: 'good' });
  if (f1.heavy < f0.heavy - 0.03) forecast.push({ text: 'Fewer twin-engine destroyers: Bf 110 and Ju 88 output is down', tone: 'good' });
  if (f1.jets < f0.jets - 0.02) forecast.push({ text: 'The jet programme is set back about {w} weeks', vars: { w: Math.round(d.jetDelay) }, tone: 'good' });
  if (f1.skill < f0.skill - 0.003) forecast.push({ text: 'Fuel is short: green pilots in the German cockpits', tone: 'good' });
  if (f1.enemy > f0.enemy + 0.003) forecast.push({ text: 'Repairs are ahead of the bombing: German output is recovering', tone: 'bad' });
  if (!forecast.length) forecast.push({ text: 'German production holds steady this week', tone: 'bad' });

  const reel: Newsreel = { date: op.date, weeks, headline, lines, sectors, forecast, enemy: f1.enemy, skill: f1.skill };
  d.reel = reel;
  return { data: d, reel };
}

// ---------------- campaign binding, rebuild and storage ----------------

export interface CampaignLike {
  seed: number;
  history: { id: string; success: boolean; lost: number }[];
}

/** Target and date of a campaign operation id (story, side raid or second-tour operation). */
export function opTarget(seed: number, id: string): { id: string; target: string; date: string } | null {
  const story = CAMPAIGN.find((m) => m.id === id);
  if (story) return { id, target: story.target, date: story.date };
  const raid = sideRaidById(seed, id);
  if (raid) return { id, target: raid.mission.target, date: raid.mission.date };
  if (isSecondTourId(id)) {
    const index = Number(id.split('-')[2]);
    if (Number.isFinite(index)) { const m = secondTourMission(seed, index); return { id, target: m.target, date: m.date }; }
  }
  return null;
}

/** The industrial picture implied by a campaign's operations log (a missing or foreign save). */
export function rebuildStrategic(c: CampaignLike): StrategicData {
  let d = defaultStrategic(c.seed);
  for (const h of c.history) {
    const op = opTarget(c.seed, h.id);
    if (!op) continue;
    d = recordStrike(d, op, { success: h.success, bombersLost: h.lost, bombersTotal: 12 }).data;
  }
  d.reel = null;
  return d;
}

export function sanitizeStrategic(raw: unknown): StrategicData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  if (o.v !== 1 || !Number.isFinite(o.seed)) return null;
  const num = (v: unknown, a: number, b: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : def);
  const d = defaultStrategic(o.seed);
  d.week = Math.floor(num(o.week, 0, 5200, 0));
  for (const s of SITES) {
    const st = o.sites?.[s.id];
    if (!st) continue;
    d.sites[s.id] = {
      dmg: num(st.dmg, 0, MAX_DAMAGE, 0),
      queue: (Array.isArray(st.queue) ? st.queue : []).filter((q: any) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]))
        .slice(-8).map((q: number[]) => [Math.floor(q[0]), clamp(q[1], 0, 1)] as [number, number]),
    };
  }
  d.fighters = num(o.fighters, 0, 1, 1);
  d.pilots = num(o.pilots, 0, 1, 1);
  for (const p of ['fw190', 'bf109', 'heavy'] as Product[]) d.types[p] = num(o.types?.[p], 0, 1, 1);
  d.jetDelay = num(o.jetDelay, 0, 520, 0);
  d.strikes = Math.floor(num(o.strikes, 0, 1e6, 0));
  d.log = (Array.isArray(o.log) ? o.log : []).filter((x: unknown) => typeof x === 'string').slice(-120);
  const r = o.reel;
  d.reel = r && typeof r === 'object' && r.headline && Array.isArray(r.lines) && Array.isArray(r.sectors) && Array.isArray(r.forecast) ? r as Newsreel : null;
  return d;
}

export function saveStrategic(d: StrategicData) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STRATEGIC_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}

function readSaved(): StrategicData | null {
  try { return typeof localStorage === 'undefined' ? null : sanitizeStrategic(JSON.parse(localStorage.getItem(STRATEGIC_KEY) ?? 'null')); } catch { return null; }
}

/** The saved state for this campaign (seed), else one rebuilt from its operations log. */
export function loadStrategic(c: CampaignLike): StrategicData {
  const saved = readSaved();
  // operations entered elsewhere (catch-up of an older profile) are missing: rebuild
  if (saved && saved.seed === c.seed && c.history.every((h) => saved.log.includes(h.id) || !opTarget(c.seed, h.id))) return saved;
  const d = rebuildStrategic(c);
  saveStrategic(d);
  return d;
}

/**
 * CampaignState.recordCampaignOutcome: the operation was current and changed the campaign.
 * `c` is the campaign after the result (its history already holds this operation).
 */
export function recordStrategicStrike(c: CampaignLike, op: { id: string; target: string; date: string }, o: StrikeOutcome, nextDate?: string): Newsreel | null {
  const prior = { seed: c.seed, history: c.history.slice(0, -1) };
  const d0 = loadStrategic(prior);
  const { data, reel } = recordStrike(d0, op, o, nextDate);
  saveStrategic(data);
  return reel;
}

// The current operation's factors, for the spawn-time enemy-mix hook (set at mission start)
let active: { id: string; f: IndustryFactors } | null = null;
export function setActiveIndustry(id: string | null, f?: IndustryFactors) { active = id && f && !isNeutral(f) ? { id, f } : null; }
export function activeIndustry(id: string): IndustryFactors | null { return active && active.id === id ? active.f : null; }
