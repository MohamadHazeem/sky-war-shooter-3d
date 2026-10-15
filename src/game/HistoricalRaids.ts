// Historical raid mode (Phase 11 goal 31): four famous Eighth Air Force raids flown with
// their real numbers, and an end screen that sets the player's result beside history.
//
// Pure data and maths plus guarded localStorage ('sws3d.raids.v1'), unit-tested in Node
// (tests/historicalRaids.test.ts). The screens live in ui/HistoricalRaidsScreen.ts; the game
// wiring is two hook lines in MissionFlow (no campaign record, the comparison on the debrief).
//
// - RAIDS: Schweinfurt-Regensburg (two forces), Black Thursday, Big Week, Berlin. Each has the
//   commonly cited figures (dispatched, lost, airmen lost, Luftwaffe fighters lost), the
//   escort of the day, the outcome and a short note written in our own words. Sources and the
//   places where they disagree: docs/phase11/historical-raids-sources.md.
// - raidMission: a force flown as a variant of the existing gunner mission for that day
//   (DeepPenetration.ts dp1-dp4, Missions.ts m5), re-dated and re-briefed with the real numbers;
//   the fighter pressure follows the raid's historical loss rate.
// - compareRaid: the player's group (12 ships) against history scaled to the same group, and a
//   verdict: better than history, as in history, worse, or the target missed.
import { CAMPAIGN, type Mission } from './Missions';
import { DEEP_PENETRATION } from './DeepPenetration';
import { baseOf } from './CampaignState';
import type { StationId } from '../world/B17Layout';

export const RAIDS_KEY = 'sws3d.raids.v1';
export const HIST_PREFIX = 'hist-';
export const isHistoricalId = (id: string) => /^hist-[a-z]+-\d$/.test(id);
export const histId = (raid: string, force: number) => `${HIST_PREFIX}${raid}-${force}`;
export function parseHistId(id: string): { raid: HistoricalRaid; force: number } | null {
  const m = /^hist-([a-z]+)-(\d)$/.exec(id);
  const raid = m ? raidById(m[1]) : null;
  if (!m || !raid) return null;
  const force = Number(m[2]);
  return force < raid.forces.length ? { raid, force } : null;
}

export type Escort = 'none' | 'partial' | 'full';

export interface RaidForce {
  label: string;           // "Regensburg force"
  target: string;          // "Messerschmitt works, Regensburg"
  base: string;            // the gunner mission it is flown on
  station: StationId;
  briefing: string[];      // own-words briefing with the day's numbers (translatable as written)
  success: string;
  enemyTypes?: Mission['enemyTypes'];   // types of the date (a 1944 base flown in 1943)
  noEscort?: boolean;      // the base's escort did not exist on this date
}

export interface HistoricalRaid {
  id: string;
  title: string;
  date: string;
  dispatched: number;      // heavy bombers dispatched (sorties, for Big Week)
  lost: number;            // heavy bombers lost (missing in action)
  writtenOff?: number;     // more wrecked on return, not counted in `lost`
  airmen: number;          // airmen killed, missing or captured (rounded, sources vary)
  fighters: number;        // Luftwaffe fighters lost (German records, rounded)
  claims?: number;         // what the bomber gunners claimed (escort pilots' claims left out)
  escort: Escort;
  outcome: string;         // what the raid achieved
  note: string;            // a short historical note, in our own words
  forces: RaidForce[];
}

const COMPRESSED = 'This is a historical raid with a fictional crew. Combat time and distances are compressed; the numbers are history.';

// Commonly cited figures (Freeman, The Mighty Eighth War Diary; Middlebrook; Caldwell & Muller;
// the USAAF statistical digest). Where sources differ we use the most quoted round figure.
export const RAIDS: HistoricalRaid[] = [
  {
    id: 'sr', title: 'Schweinfurt-Regensburg', date: '17 August 1943',
    dispatched: 376, lost: 60, airmen: 550, fighters: 27, claims: 288, escort: 'none',
    outcome: 'Both targets were hit hard. The Messerschmitt plant at Regensburg lost weeks of output, and Schweinfurt\'s bearing production fell by about a third for a time. One Fortress in six did not come back.',
    note: 'Two forces were meant to split the German defences: the Regensburg force would fly on to North Africa and the Schweinfurt force would follow close behind. Fog in England held the second force back for hours, so the fighters could meet each force in turn.',
    forces: [
      {
        label: 'Regensburg force', target: 'Messerschmitt works, Regensburg', base: 'dp1', station: 'waistL',
        briefing: [
          '17 August 1943. The Eighth Air Force sends 376 Fortresses against Regensburg and Schweinfurt. Our 146 ships of the Regensburg force go first, bomb the Messerschmitt works and fly on across the Alps to North Africa.',
          'The Thunderbolts turn back at the German border. From there it is a long way without escort, and every fighter group in the west will be up.',
          'History: 24 of the Regensburg force did not reach Africa, and 60 Fortresses were lost that day in all. Bring your group home in better shape than that.',
          COMPRESSED,
        ],
        success: 'Bombs away at Regensburg. The group turns south for the Alps and North Africa.',
      },
      {
        label: 'Schweinfurt force', target: 'Ball-bearing plants, Schweinfurt', base: 'm5', station: 'tail',
        briefing: [
          '17 August 1943. Fog has held the Schweinfurt force on the ground for more than three hours. Our 230 Fortresses take off at last, and the German fighters that met the Regensburg force have landed, refuelled and are waiting.',
          'The target is the ball-bearing plants at Schweinfurt. The escort turns back at the border. You are on the tail gun: they will come from astern as well as head-on.',
          'History: the Schweinfurt force lost 36 of its 230 ships, and 60 Fortresses were lost that day in all. Bring your group home in better shape than that.',
          COMPRESSED,
        ],
        success: 'Bombs on the bearing plants at Schweinfurt. Now the long way home.',
        enemyTypes: ['fw190', 'bf109', 'bf110'], noEscort: true,
      },
    ],
  },
  {
    id: 'bt', title: 'Black Thursday', date: '14 October 1943',
    dispatched: 291, lost: 60, writtenOff: 17, airmen: 600, fighters: 38, claims: 186, escort: 'none',
    outcome: 'The bearing plants were badly damaged, but Germany dispersed production and drew on its stocks. The losses were too high to repeat: deep raids beyond escort range stopped until the long-range fighters came.',
    note: 'The second raid on Schweinfurt met rocket-firing twin-engine fighters for the first time in large numbers. Sixty Fortresses went down and seventeen more were wrecked on return, about a quarter of the force.',
    forces: [
      {
        label: 'The bomber stream', target: 'Bearing factories, Schweinfurt', base: 'dp2', station: 'ball',
        briefing: [
          '14 October 1943. The Eighth returns to Schweinfurt with 291 Fortresses. The August raid slowed the bearing plants but did not stop them.',
          'The Thunderbolts leave us near Aachen. After that there is no escort: single-engine fighters head-on, and twin-engine fighters firing rockets from astern.',
          'History: 60 Fortresses were shot down and 17 more were wrecked on return. Bring your group home in better shape than that.',
          COMPRESSED,
        ],
        success: 'The bearing works are hit. Count the returning ships before calling it a victory.',
      },
    ],
  },
  {
    id: 'bw', title: 'Big Week', date: '20 February 1944',
    dispatched: 3800, lost: 226, airmen: 2600, fighters: 262, escort: 'partial',
    outcome: 'The aircraft factories were hit hard, but German production recovered by moving into dispersed sites. The real result was in the air: the Luftwaffe lost fighters and experienced pilots it could not replace.',
    note: 'Operation Argument was six days of attacks on the German aircraft industry, flown from England and Italy. Long-range escorts now went most of the way, and the fighters that rose to stop the bombers were drawn into a battle of attrition.',
    forces: [
      {
        label: 'Leipzig, day one', target: 'Aircraft assembly, Leipzig', base: 'dp3', station: 'top',
        briefing: [
          '20 February 1944, the first day of Big Week. Over the next six days the Eighth and Fifteenth Air Forces fly some 3,800 bomber sorties against the factories that build the German fighters.',
          'Our target is the aircraft assembly plants at Leipzig. Escort fighters will reach the target area this time. Hold on until they arrive.',
          'History: 226 bombers were lost over the whole week, about six in every hundred. Bring your group home in better shape than that.',
          COMPRESSED,
        ],
        success: 'The Leipzig assembly halls are hit. This time the escort stays with us.',
      },
    ],
  },
  {
    id: 'bn', title: 'Berlin', date: '6 March 1944',
    dispatched: 730, lost: 69, airmen: 700, fighters: 66, claims: 97, escort: 'full',
    outcome: 'Clouds scattered the bombing and the main targets were barely touched. But the Luftwaffe had come up to defend its capital and lost heavily; two days later the Eighth was back over Berlin.',
    note: 'The first full-scale American daylight attack on Berlin cost the Eighth its heaviest loss of a single day: 69 heavy bombers and 11 escort fighters. The Mustangs flew with the bombers all the way to the capital.',
    forces: [
      {
        label: 'The bomber stream', target: 'Industrial rail district, Berlin', base: 'dp4', station: 'waistR',
        briefing: [
          '6 March 1944. The Eighth sends 730 heavy bombers to Berlin in daylight, with more than 800 escort fighters. It is the first full-scale American attack on the capital.',
          'The Mustangs will be with us all the way, but the bomber stream is long and the fighters will find the gaps. Keep the formation tight.',
          'History: 69 bombers did not come home, the heaviest loss of any single day. Bring your group home in better shape than that.',
          COMPRESSED,
        ],
        success: 'Bombs away over Berlin. Now hold the formation for the long run home.',
      },
    ],
  },
];

export const raidById = (id: string) => RAIDS.find((r) => r.id === id) ?? null;
/** Share of the dispatched force shot down (0..1). Wrecks on return are shown apart. */
export const lossRate = (r: Pick<HistoricalRaid, 'dispatched' | 'lost'>) => (r.dispatched > 0 ? r.lost / r.dispatched : 0);
export const ESCORT_LABEL: Record<Escort, string> = { none: 'No escort past the border', partial: 'Escort for most of the way', full: 'Mustangs all the way' };

const BASES: Record<string, Mission> = Object.fromEntries([...CAMPAIGN, ...DEEP_PENETRATION].map((m) => [m.id, m]));

/** How hard the Luftwaffe presses: the raid's real loss rate mapped onto the base fighters. */
export function pressure(r: HistoricalRaid): number {
  return +Math.min(1.12, Math.max(0.82, 0.75 + 1.5 * lossRate(r))).toFixed(3);
}

/** A raid's force flown as a variant of its base gunner mission, re-dated and re-briefed. */
export function raidMission(raidId: string, forceIdx = 0): Mission {
  const r = raidById(raidId) ?? RAIDS[0];
  const fi = Math.max(0, Math.min(r.forces.length - 1, Math.floor(forceIdx) || 0));
  const f = r.forces[fi];
  const src = BASES[f.base];
  const pristine = baseOf(src);   // campaign modifiers never leak into a historical raid
  const m: Mission = structuredClone({ ...src, bombers: pristine.bombers, maxBombersLost: pristine.maxBombersLost, objectives: pristine.objectives, escortArrive: pristine.escortArrive, round: pristine.round, waves: pristine.waves });
  const k = pressure(r);
  if (m.round) {
    const rd = m.round;
    m.round = { ...rd, min: Math.max(2, Math.round(rd.min * k)), max: Math.max(3, Math.round(rd.max * k)), skill: [+(rd.skill[0] * (0.94 + 0.06 * k)).toFixed(3), +(rd.skill[1] * (0.94 + 0.06 * k)).toFixed(3)] };
  } else {
    m.waves = m.waves.map((w) => ({ ...w, count: Math.max(1, Math.round(w.count * k)) }));
  }
  const maxLost = Math.max(4, pristine.maxBombersLost ?? 6);
  Object.assign(m, {
    id: histId(r.id, fi), number: 0, title: r.title, target: f.target, date: r.date,
    role: 'gunner', station: f.station, playerDamaged: false, bombers: 12, maxBombersLost: maxLost,
    briefing: [...f.briefing], success: f.success,
    objectives: ['Defend the formation', 'Fight through to the target', `Lose no more than ${maxLost} bombers`],
    ...(f.enemyTypes ? { enemyTypes: [...f.enemyTypes], boss: false, specials: false, rounds: 1 } : {}),
    ...(f.noEscort ? { escortArrive: undefined } : {}),
  } satisfies Partial<Mission>);
  return m;
}

// ---------------- the comparison ----------------

export type ShipFate = 'home' | 'ditched' | 'lost' | 'interned';
export type Verdict = 'better' | 'even' | 'worse' | 'failed';

export interface RaidResult {
  success: boolean;        // bombs on target and the mission completed
  bombersLost: number;     // of the player's group (the player's own ship included)
  bombersTotal: number;
  kills: number;
  fate: ShipFate;
}

export interface RaidComparison {
  raid: HistoricalRaid;
  verdict: Verdict;
  yourRate: number;        // 0..1
  histRate: number;        // 0..1
  histInGroup: number;     // history's losses scaled to the player's group, one decimal
  histFightersInGroup: number;   // Luftwaffe fighters lost, scaled to the player's group
  result: RaidResult;
}

/** Losses within this margin of history (about half a ship in twelve) count as "as in history". */
export const EVEN_MARGIN = 0.04;

export function compareRaid(raidId: string, res: RaidResult): RaidComparison {
  const raid = raidById(raidId) ?? RAIDS[0];
  const total = Math.max(1, Math.floor(res.bombersTotal) || 1);
  const lost = Math.max(0, Math.min(total, Math.floor(res.bombersLost) || 0));
  const result = { ...res, bombersLost: lost, bombersTotal: total };
  const yourRate = lost / total, histRate = lossRate(raid);
  const verdict: Verdict = !res.success ? 'failed' : yourRate < histRate - EVEN_MARGIN ? 'better' : yourRate > histRate + EVEN_MARGIN ? 'worse' : 'even';
  return {
    raid, verdict, yourRate, histRate, result,
    histInGroup: Math.round(histRate * total * 10) / 10,
    histFightersInGroup: Math.round((raid.fighters / Math.max(1, raid.dispatched)) * total * 10) / 10,
  };
}

export const VERDICT_TITLE: Record<Verdict, string> = {
  better: 'Better than history', even: 'As in history', worse: 'Worse than history', failed: 'The target was not hit',
};
export const VERDICT_TEXT: Record<Verdict, string> = {
  better: 'Your group came home with fewer losses than the real raid. The men who flew it that day would have given a lot for that.',
  even: 'Your group paid about what the real raid paid. That is how close to the edge these missions were.',
  worse: 'Your group lost more than the real raid did. Tighten the formation and call the fighters early, and fly it again.',
  failed: 'The raid did not reach its goal this time. The real crews had to go back again and again; so can you.',
};
export const FATE_LABEL: Record<ShipFate, string> = { home: 'Came home', ditched: 'Ditched in the sea', lost: 'Shot down', interned: 'Interned' };

/** Percent with one decimal below 10 %, whole above it ("5.9%", "16%"). */
export const pct = (v: number) => { const p = v * 100; return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`; };

// ---------------- the record ----------------

export interface RaidRecord { flown: number; best: { verdict: Verdict; lost: number; total: number; kills: number } | null }
export type RaidRecords = Record<string, RaidRecord>;

const VERDICT_RANK: Record<Verdict, number> = { failed: 0, worse: 1, even: 2, better: 3 };
const isBetter = (a: RaidComparison, b: RaidRecord['best']) =>
  !b || VERDICT_RANK[a.verdict] > VERDICT_RANK[b.verdict]
  || (VERDICT_RANK[a.verdict] === VERDICT_RANK[b.verdict] && (a.result.bombersLost / a.result.bombersTotal < b.lost / b.total
    || (a.result.bombersLost / a.result.bombersTotal === b.lost / b.total && a.result.kills > b.kills)));

export function recordRaid(recs: RaidRecords, c: RaidComparison): { records: RaidRecords; newBest: boolean } {
  const prev = recs[c.raid.id] ?? { flown: 0, best: null };
  const newBest = isBetter(c, prev.best);
  const best = newBest ? { verdict: c.verdict, lost: c.result.bombersLost, total: c.result.bombersTotal, kills: c.result.kills } : prev.best;
  return { records: { ...recs, [c.raid.id]: { flown: prev.flown + 1, best } }, newBest };
}

export function sanitizeRecords(raw: unknown): RaidRecords {
  const out: RaidRecords = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const r of RAIDS) {
    const v = (raw as Record<string, any>)[r.id];
    if (!v || typeof v !== 'object') continue;
    const flown = Number.isFinite(v.flown) ? Math.max(0, Math.floor(v.flown)) : 0;
    const b = v.best;
    const best = b && typeof b === 'object' && b.verdict in VERDICT_RANK && Number.isFinite(b.lost) && Number.isFinite(b.total) && b.total > 0
      ? { verdict: b.verdict as Verdict, lost: Math.max(0, Math.min(b.total, Math.floor(b.lost))), total: Math.floor(b.total), kills: Number.isFinite(b.kills) ? Math.max(0, Math.floor(b.kills)) : 0 }
      : null;
    out[r.id] = { flown, best };
  }
  return out;
}

export function loadRecords(): RaidRecords {
  try { return sanitizeRecords(JSON.parse(localStorage.getItem(RAIDS_KEY) ?? 'null')); } catch { return {}; }
}
export function saveRecords(r: RaidRecords) {
  try { localStorage.setItem(RAIDS_KEY, JSON.stringify(r)); } catch { /* private mode: the record is a convenience */ }
}
