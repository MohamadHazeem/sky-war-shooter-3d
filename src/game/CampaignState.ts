// Dynamic campaign: the strategic layer over the twelve story missions (Missions.ts CAMPAIGN).
//
// State (persisted in localStorage 'sws3d.campaign.v2'):
//   Luftwaffe strength  50..150 %   falls as story missions and raids on airfields / factories /
//                                   oil succeed, recovers a little after failures. Scales the
//                                   enemy count in the air (±20 %) and their skill (±10 %).
//   Squadron strength   6..18 ships bombers lost come off the strength, replacements arrive with
//                                   every sortie (+2) and early after U-boat raids. Below 15 ships
//                                   the formation in later missions shrinks (down to two thirds).
//   Crew morale         10..100 %   wins, low losses and escorts raise it; failures and heavy
//                                   losses lower it. Merit from a campaign mission x0.9..x1.1.
//   Escort availability 0..100 %    a date-based baseline (long-range Mustangs from December 1943,
//                                   Big Week, spring 1944) plus what raids earn. At 50 % or more
//                                   P-51s join the gunner missions (sooner the higher it is).
//
// Story missions stay in order: story mission i is "current" once i are done; side raids
// (SideRaids.ts) are offered between story missions, one may be flown per gap. Only current
// operations change the state and get the modifiers; replays of finished missions fly as
// written. The state is reconciled against the old progress (unlocked index + medals), so an
// existing profile is migrated: its finished story missions are applied with average results.
//
// Everything here is pure data and maths plus guarded localStorage (unit-tested in Node).
// Game hooks: prepareCampaignMission (briefing / mission start), campaignMeritMult (debrief
// merit) and recordCampaignOutcome (debrief, via ui/CampaignMap.ts mountCampaignReport).
import { isSecondTourId, secondTourMission, secondTourKind, SECOND_TOUR_LENGTH, SECOND_TOUR_MEDAL } from './SecondTour';
import { CAMPAIGN, type Mission } from './Missions';
import { LIMP_TEXT } from './LimpingHomeRules';

const INTERN_NOTE = LIMP_TEXT.internNote, TOUR_ENDED = LIMP_TEXT.tourOver;
import { isRaidId, sideRaidById, sideRaidsFor, templateFor, type RaidKind, type SideRaid } from './SideRaids';

export const CAMPAIGN_KEY = 'sws3d.campaign.v2';
const PROGRESS_KEY = 'sws3d.progress.v1';

export const FULL_SQUADRON = 18;
export const FORMATION_FULL_AT = 15;     // ships on strength for a full-size formation
export const ESCORT_THRESHOLD = 50;
export const LW_MIN = 50, LW_MAX = 150;
export const SQ_MIN = 6;
export const MORALE_MIN = 10, MORALE_MAX = 100;
export const ESCORT_BONUS_MAX = 50;
export const REPLACEMENTS_PER_SORTIE = 2;

export type GaugeId = 'luftwaffe' | 'squadron' | 'morale' | 'escort';

export interface HistoryEntry { id: string; kind: 'story' | 'raid' | 'generated'; title: string; success: boolean; kills: number; lost: number; ditched?: boolean; interned?: boolean }

export interface ReportLine { gauge: GaugeId | 'merit' | 'note'; text: string; from?: number; to?: number }
export interface IntelReport { title: string; success: boolean; lines: ReportLine[]; effect: boolean }

export interface RaidRecord { gap: number; id: string; success: boolean }

export interface CampaignData {
  v: 2;
  secondTour?: { completed: number; score: number; medal: boolean };
  tour: number;          // 1 = the profile's first tour (kept in step with progress.unlocked)
  seed: number;          // side-raid generation
  luftwaffe: number;
  squadron: number;
  morale: number;
  escortBonus: number;
  storyDone: string[];   // story mission ids completed this tour, in order
  raids: RaidRecord[];   // side raids flown this tour (one per gap)
  history: HistoryEntry[];
  report: IntelReport | null;
  complete: boolean;
  interned?: 'Sweden' | 'Switzerland';   // limping home ended in a neutral country: the tour is over (LimpingHome.ts)
}

export interface Outcome { success: boolean; kills: number; bombersLost: number; bombersTotal: number; score?: number; ditched?: boolean; interned?: 'Sweden' | 'Switzerland' }

export interface Modifiers {
  enemy: number;         // fighters in the air x
  skill: number;         // enemy skill x
  bombers: number;       // formation size
  escortArrive?: number; // P-51 arrival (gunner missions), s
  meritMult: number;
}

interface ProgressLike { unlocked: number; medals?: Record<string, string[]> }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function newSeed(rand = Math.random) { return 1 + Math.floor(rand() * 2147483646); }

export function defaultCampaign(seed = newSeed(), tour = 1): CampaignData {
  return {
    v: 2, tour, seed, luftwaffe: 100, squadron: FULL_SQUADRON, morale: 65, escortBonus: 0,
    storyDone: [], raids: [], history: [], report: null, complete: false,
  };
}

// ---------------- derived values ----------------

export const storyIndex = (id: string) => CAMPAIGN.findIndex((m) => m.id === id);
export const currentIndex = (d: CampaignData) => (d.secondTour ? d.secondTour.completed : d.complete ? -1 : Math.min(d.storyDone.length, CAMPAIGN.length - 1));
export const currentStory = (d: CampaignData): Mission | null => (d.interned ? null : d.secondTour ? secondTourMission(d.seed, d.secondTour.completed) : d.complete ? null : CAMPAIGN[currentIndex(d)] ?? null);
// side raids are offered in the gap before the current story mission (none before the first)
export const currentGap = (d: CampaignData) => (d.secondTour || d.complete ? -1 : d.storyDone.length);
export const raidInGap = (d: CampaignData, gap: number) => d.raids.find((r) => r.gap === gap) ?? null;
export function offeredRaids(d: CampaignData): SideRaid[] {
  const g = currentGap(d);
  return g > 0 ? sideRaidsFor(d.seed, g) : [];
}

const parseDate = (s: string) => Date.parse(s + ' UTC');
// The campaign's "today": the date of the next story mission (the last one when complete)
export function campaignDate(d: CampaignData): string {
  return (currentStory(d) ?? CAMPAIGN[CAMPAIGN.length - 1]).date;
}

// Escort baseline from the date: long-range Mustangs from mid-December 1943, Big Week, spring
export function escortBaseline(date: string): number {
  const t = parseDate(date);
  if (!Number.isFinite(t)) return 0;
  if (t < parseDate('13 December 1943')) return 10;
  if (t < parseDate('20 February 1944')) return 40;
  if (t < parseDate('6 March 1944')) return 70;
  return 90;
}
export const escortAvailability = (d: CampaignData, date = campaignDate(d)) => clamp(Math.round((d.secondTour ? Math.min(100, 90 + d.secondTour.completed * 0.4) : escortBaseline(date)) + d.escortBonus), 0, 100);
export const enemyMult = (lw: number) => clamp(1 + (lw - 100) / 250, 0.8, 1.2);
export const formationFactor = (sq: number) => clamp(sq / FORMATION_FULL_AT, 2 / 3, 1);
export const meritMult = (morale: number) => 0.9 + 0.2 * clamp(morale, 0, 100) / 100;

// Is this mission an operation the campaign state applies to right now?
export function isCurrentOp(d: CampaignData, m: Mission): boolean {
  if (d.complete) return false;
  if (isRaidId(m.id)) {
    const g = currentGap(d);
    return g > 0 && !raidInGap(d, g) && offeredRaids(d).some((r) => r.mission.id === m.id);
  }
  return currentStory(d)?.id === m.id;
}

export function modifiersFor(d: CampaignData, m: Mission, base: Pick<Mission, 'bombers' | 'role' | 'escortArrive' | 'playerDamaged' | 'duration'> = m): Modifiers | null {
  if (!isCurrentOp(d, m)) return null;
  const enemy = enemyMult(d.luftwaffe);
  const out: Modifiers = {
    enemy, skill: 1 + (enemy - 1) * 0.5,
    bombers: Math.max(4, Math.round(base.bombers * formationFactor(d.squadron))),
    meritMult: meritMult(d.morale),
  };
  const esc = escortAvailability(d);
  if (base.role === 'gunner' && esc >= ESCORT_THRESHOLD) {
    const k = (esc - ESCORT_THRESHOLD) / (100 - ESCORT_THRESHOLD); // 0..1
    if (base.escortArrive) out.escortArrive = Math.round(base.escortArrive * (1 - 0.2 * k));
    else if (!base.playerDamaged && Number.isFinite(base.duration)) out.escortArrive = Math.round(base.duration * (0.7 - 0.25 * k));
  }
  return out;
}

// ---------------- mission modifiers (in place, idempotent) ----------------

interface Snapshot {
  bombers: number; maxBombersLost?: number; objectives: string[]; escortArrive?: number;
  round?: Mission['round']; waves: Mission['waves'];
}
const BASE = new WeakMap<Mission, Snapshot>();

function snapshot(m: Mission): Snapshot {
  let s = BASE.get(m);
  if (!s) {
    s = {
      bombers: m.bombers, maxBombersLost: m.maxBombersLost, objectives: [...m.objectives], escortArrive: m.escortArrive,
      round: m.round ? { ...m.round, skill: [...m.round.skill] as [number, number] } : undefined,
      waves: m.waves.map((w) => ({ ...w })),
    };
    BASE.set(m, s);
  }
  return s;
}

export function baseOf(m: Mission): Snapshot { return snapshot(m); }

// Restore the mission's written values, then apply `mods` (null = fly it as written)
export function applyModifiers(m: Mission, mods: Modifiers | null): Mission {
  const b = snapshot(m);
  m.bombers = b.bombers;
  m.maxBombersLost = b.maxBombersLost;
  m.objectives = [...b.objectives];
  m.escortArrive = b.escortArrive;
  m.round = b.round ? { ...b.round, skill: [...b.round.skill] as [number, number] } : undefined;
  m.waves = b.waves.map((w) => ({ ...w }));
  if (!mods) return m;
  m.bombers = mods.bombers;
  if (b.maxBombersLost !== undefined && b.maxBombersLost < 99 && mods.bombers !== b.bombers) {
    m.maxBombersLost = Math.max(1, Math.round(b.maxBombersLost * mods.bombers / b.bombers));
    m.objectives = m.objectives.map((o) => o.replace(/Lose no more than \d+ bombers/, `Lose no more than ${m.maxBombersLost} bombers`));
  }
  if (m.round) {
    const r = m.round;
    r.min = Math.max(1, Math.round(r.min * mods.enemy));
    r.max = Math.max(r.min + 1, Math.round(r.max * mods.enemy));
    r.skill = [+(r.skill[0] * mods.skill).toFixed(3), +(r.skill[1] * mods.skill).toFixed(3)];
  }
  for (const w of m.waves) { w.count = Math.max(1, Math.round(w.count * mods.enemy)); w.skill = +(w.skill * mods.skill).toFixed(3); }
  if (mods.escortArrive !== undefined) m.escortArrive = mods.escortArrive;
  return m;
}

// ---------------- transitions ----------------

const STORY_LW: Record<string, number> = { m8: -4, m4: -5, m11: -7, m7: -7, m12: -5 };
const STORY_ESCORT: Record<string, number> = { m9: 8 };
const LW_REASON: Record<RaidKind, string> = {
  rail: 'With the rail yards cut, fuel and spares are not reaching the fighter fields.',
  airfield: 'Fighters were caught on the ground and the field is out of action.',
  oil: 'Fuel is short: training flights are grounded and fewer fighters can be put up.',
  uboat: '',
  factory: 'A month of fighter production has gone up in smoke.',
};

export interface OpInfo { id: string; kind: 'story' | 'raid' | 'generated'; title: string; target: string; raidKind?: RaidKind; gap?: number }

export function opInfo(d: CampaignData, m: Mission): OpInfo | null {
  if (isSecondTourId(m.id)) {
    const kind = secondTourKind(d.seed, m.number - 1);
    return { id: m.id, kind: 'generated', title: m.title, target: m.target, raidKind: kind === 'city' ? undefined : kind };
  }
  if (isRaidId(m.id)) {
    const r = sideRaidById(d.seed, m.id);
    return r ? { id: m.id, kind: 'raid', title: m.title, target: m.target, raidKind: r.template.kind, gap: r.gap } : null;
  }
  return storyIndex(m.id) >= 0 ? { id: m.id, kind: 'story', title: m.title, target: m.target } : null;
}

const pct = (n: number) => `${Math.round(n)}%`;
// 'Chemical works, Ludwigshafen' -> 'Ludwigshafen'; 'Return leg — over the Channel' -> 'the Channel'
const placeName = (target: string) => (target.replace(/^(Escort|Return leg) — /, '').split(',').pop() ?? target).trim().replace(/^over /, '');

/**
 * Apply one mission's result to the state. Returns the new state and the intelligence report.
 * Operations that are not current (replays, a raid already flown in this gap) leave the state
 * unchanged and say so.
 */
export function applyOutcome(d0: CampaignData, op: OpInfo, o: Outcome): { data: CampaignData; report: IntelReport } {
  const d: CampaignData = { ...d0, storyDone: [...d0.storyDone], raids: [...d0.raids], history: [...d0.history] };
  const title = `${o.success ? 'Mission complete' : 'Mission failed'} · ${op.title}`;
  const current = op.kind !== 'raid' ? currentStory(d0)?.id === op.id : (op.gap === currentGap(d0) && !raidInGap(d0, op.gap!));
  if (d0.complete || !current) {
    const report: IntelReport = { title, success: o.success, effect: false, lines: [{ gauge: 'note', text: 'A replay of a finished operation. The strategic picture is unchanged.' }] };
    return { data: d0, report };
  }
  const lines: ReportLine[] = [];
  const before = { lw: d.luftwaffe, sq: d.squadron, mo: d.morale, esc: escortAvailability(d0) };
  const lost = Math.max(0, Math.round(o.bombersLost || 0));
  const tpl = op.raidKind ? templateFor(op.raidKind) : null;

  // Luftwaffe
  let lwReason = '';
  if (o.success) {
    if (op.kind === 'story' || (op.kind === 'generated' && !tpl)) { d.luftwaffe += STORY_LW[op.id] ?? -3; lwReason = `Losses over ${placeName(op.target)} are thinning the Jagdgruppen.`; }
    else if (tpl && tpl.effects.luftwaffe) { d.luftwaffe += tpl.effects.luftwaffe; lwReason = LW_REASON[tpl.kind]; }
  } else {
    d.luftwaffe += op.kind === 'story' ? 3 : 2;
    lwReason = 'The Jagdgruppen are claiming a victory, and their confidence and strength recover.';
  }
  d.luftwaffe = clamp(Math.round(d.luftwaffe), LW_MIN, LW_MAX);

  // Squadron: losses come off the strength, replacements arrive with every sortie
  const extra = o.success && tpl ? tpl.effects.squadron : 0;
  const repl = REPLACEMENTS_PER_SORTIE + extra;
  d.squadron = clamp(Math.round(d.squadron - lost + repl), SQ_MIN, FULL_SQUADRON);

  // Morale
  let mo = o.success ? (op.kind === 'story' ? 5 : 3) : (op.kind === 'story' ? -8 : -6);
  if (o.success && tpl) mo += tpl.effects.morale;
  if (lost > 2) mo -= (lost - 2) * 1.5;
  if (o.success && lost === 0) mo += 3;
  if (before.esc >= ESCORT_THRESHOLD) mo += 1;
  d.morale = clamp(Math.round(d.morale + mo), MORALE_MIN, MORALE_MAX);

  // Escort
  if (o.success) d.escortBonus = clamp(d.escortBonus + (tpl ? tpl.effects.escort : STORY_ESCORT[op.id] ?? 0), 0, ESCORT_BONUS_MAX);

  // Generated operations advance only on success; retries and replays cannot double-book score.
  if (op.kind === 'generated' && d.secondTour && o.success) {
    const completed = d.secondTour.completed + 1;
    d.secondTour = { completed, score: d.secondTour.score + Math.max(0, Math.round(o.score ?? 0)), medal: completed >= SECOND_TOUR_LENGTH };
    if (completed === SECOND_TOUR_LENGTH) lines.push({ gauge: 'note', text: SECOND_TOUR_MEDAL });
  }

  // Progress
  d.history.push({ id: op.id, kind: op.kind, title: op.title, success: o.success, kills: Math.max(0, Math.round(o.kills || 0)), lost, ...(o.ditched ? { ditched: true } : {}), ...(o.interned ? { interned: true } : {}) });
  if (d.history.length > 80) d.history.splice(0, d.history.length - 80);
  if (op.kind === 'raid') d.raids.push({ gap: op.gap!, id: op.id, success: o.success });
  if (op.kind === 'story' && o.success) {
    d.storyDone.push(op.id);
    if (d.storyDone.length >= CAMPAIGN.length) d.complete = true;
  }
  // interned in Sweden or Switzerland: the crew sits out the war, so this tour ends here
  if (o.interned) { d.interned = o.interned; d.complete = true; }

  // Report
  if (o.ditched) lines.push({ gauge: 'note', text: 'Ditched · bomber lost · crew rescued' });
  if (o.interned) lines.push({ gauge: 'note', text: INTERN_NOTE });
  const after = { lw: d.luftwaffe, sq: d.squadron, mo: d.morale, esc: escortAvailability(d) };
  const dir = (a: number, b: number, up: string, down: string, same: string) => (b > a ? up : b < a ? down : same);
  lines.push({ gauge: 'luftwaffe', from: before.lw, to: after.lw, text: `Luftwaffe strength ${dir(before.lw, after.lw, 'up', 'down', 'holds')} ${before.lw === after.lw ? `at ${pct(after.lw)}` : `${pct(before.lw)} → ${pct(after.lw)}`}. ${lwReason || 'This target did not touch the fighter arm.'}` });
  const rText = extra ? `${repl} replacement crews arrived, ${extra} of them early thanks to the convoys` : `${repl} replacement crews arrived`;
  lines.push({ gauge: 'squadron', from: before.sq, to: after.sq, text: `Squadron ${before.sq} → ${after.sq} ships. ${lost ? `${lost} Fortress${lost > 1 ? 'es' : ''} lost; ` : 'No Fortresses lost; '}${rText}.${after.sq < FORMATION_FULL_AT ? ` The next formation will be ${Math.round(formationFactor(after.sq) * 100)}% of full size.` : ''}` });
  const moText = after.mo > before.mo ? (o.success ? 'The crews are cheered by the result.' : 'The crews are holding up.') : after.mo < before.mo ? (lost > 2 ? 'Empty bunks in the huts weigh on the crews.' : 'A bad day; the crews are subdued.') : 'Steady.';
  lines.push({ gauge: 'morale', from: before.mo, to: after.mo, text: `Crew morale ${before.mo === after.mo ? `steady at ${pct(after.mo)}` : `${pct(before.mo)} → ${pct(after.mo)}`}. ${moText}${after.mo !== before.mo ? ` Merit x${meritMult(after.mo).toFixed(2)}.` : ''}` });
  if (before.esc < ESCORT_THRESHOLD && after.esc >= ESCORT_THRESHOLD) lines.push({ gauge: 'escort', from: before.esc, to: after.esc, text: `Escort availability ${pct(before.esc)} → ${pct(after.esc)}. Fighter Command confirms: P-51 Mustangs will now join the bombers on gunner missions.` });
  else if (after.esc !== before.esc) lines.push({ gauge: 'escort', from: before.esc, to: after.esc, text: `Escort availability ${pct(before.esc)} → ${pct(after.esc)}.${after.esc >= ESCORT_THRESHOLD ? ' The Mustangs will reach us sooner.' : ` Mustangs join the gunner missions at ${ESCORT_THRESHOLD}%.`}` });
  const next = currentStory(d);
  if (d.interned) lines.push({ gauge: 'note', text: TOUR_ENDED });
  else if (d.complete) lines.push({ gauge: 'note', text: 'The tour is complete. The campaign summary is ready.' });
  else if (next) lines.push({ gauge: 'note', text: `Next operation: Mission ${next.number}, ${next.title} (${next.date}). Enemy fighters x${enemyMult(d.luftwaffe).toFixed(2)}.` });
  const report: IntelReport = { title, success: o.success, effect: true, lines };
  d.report = report;
  return { data: d, report };
}

// ---------------- migration / reconcile ----------------

// Story missions the old progress counts as done: the unlocked index, plus the last one when
// its Air Medal is on record (the index cannot go past the last mission)
export function expectedDone(p: ProgressLike | null | undefined): number {
  if (!p) return 0;
  const last = CAMPAIGN.length - 1;
  const u = clamp(Math.floor(num(p.unlocked, 0)), 0, last);
  return u + (u >= last && p.medals?.[CAMPAIGN[last].id]?.includes('Air Medal') ? 1 : 0);
}

// Finish story missions [done, upTo) with average results (no report)
function catchUp(d: CampaignData, upTo: number): CampaignData {
  let cur = d;
  while (!cur.complete && cur.storyDone.length < upTo) {
    const m = CAMPAIGN[cur.storyDone.length];
    cur = applyOutcome(cur, { id: m.id, kind: 'story', title: m.title, target: m.target }, { success: true, kills: 6, bombersLost: 2, bombersTotal: m.bombers }).data;
  }
  return { ...cur, report: d.report };
}

export function migrateFromProgress(p: ProgressLike | null | undefined, seed = newSeed()): CampaignData {
  const done = expectedDone(p);
  const d = catchUp(defaultCampaign(seed), done);
  if (done > 0) {
    d.report = {
      title: 'Campaign records transferred', success: true, effect: false,
      lines: [{ gauge: 'note', text: `Your ${done} completed mission${done > 1 ? 's have' : ' has'} been entered in the group's records. The strategic picture below reflects them.` }],
    };
  }
  return d;
}

// Bring the state in step with the old progress (tour 1 only): missions finished elsewhere
// (another device, an older save) are caught up; a progress that went backwards rebuilds it.
export function reconcile(d: CampaignData, p: ProgressLike | null | undefined, upTo?: number): CampaignData {
  if (d.secondTour || d.tour !== 1 || !p) return d;
  const exp = expectedDone(p);
  if (d.storyDone.length > exp) return migrateFromProgress(p, d.seed);
  const target = upTo === undefined ? exp : Math.min(exp, upTo);
  return d.storyDone.length < target ? catchUp(d, target) : d;
}

export function sanitize(raw: unknown): CampaignData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  if (o.v !== 2) return null;
  const ids = CAMPAIGN.map((m) => m.id);
  const d = defaultCampaign(Math.floor(num(o.seed, newSeed())) || 1, Math.max(1, Math.floor(num(o.tour, 1))));
  d.luftwaffe = clamp(num(o.luftwaffe, d.luftwaffe), LW_MIN, LW_MAX);
  d.squadron = clamp(Math.round(num(o.squadron, d.squadron)), SQ_MIN, FULL_SQUADRON);
  d.morale = clamp(num(o.morale, d.morale), MORALE_MIN, MORALE_MAX);
  d.escortBonus = clamp(num(o.escortBonus, 0), 0, ESCORT_BONUS_MAX);
  // story missions must be a prefix of the campaign order
  const done: string[] = Array.isArray(o.storyDone) ? o.storyDone : [];
  let n = 0;
  while (n < done.length && n < ids.length && done[n] === ids[n]) n++;
  d.storyDone = ids.slice(0, n);
  d.complete = n >= ids.length;
  if (o.secondTour && typeof o.secondTour === 'object' && !Array.isArray(o.secondTour)) {
    const completed = clamp(Math.floor(num(o.secondTour.completed, 0)), 0, Number.MAX_SAFE_INTEGER - SECOND_TOUR_LENGTH);
    d.secondTour = { completed, score: Math.max(0, num(o.secondTour.score, 0)), medal: completed >= SECOND_TOUR_LENGTH };
    d.tour = Math.max(2, d.tour);
    d.complete = false;
  }
  d.raids = (Array.isArray(o.raids) ? o.raids : []).filter((r: any) => r && typeof r.id === 'string' && isRaidId(r.id) && Number.isFinite(r.gap))
    .map((r: any) => ({ gap: Math.floor(r.gap), id: r.id, success: !!r.success }));
  d.history = (Array.isArray(o.history) ? o.history : []).filter((h: any) => h && typeof h.id === 'string').slice(-80)
    .map((h: any) => ({ id: h.id, kind: h.kind === 'generated' ? 'generated' : h.kind === 'raid' ? 'raid' : 'story', title: String(h.title ?? h.id), success: !!h.success, kills: Math.max(0, num(h.kills, 0)), lost: Math.max(0, num(h.lost, 0)), ...(h.ditched === true ? { ditched: true } : {}), ...(h.interned === true ? { interned: true } : {}) }));
  if (o.interned === 'Sweden' || o.interned === 'Switzerland') { d.interned = o.interned; d.complete = true; }
  const r = o.report;
  d.report = r && typeof r === 'object' && Array.isArray(r.lines) ? { title: String(r.title ?? ''), success: !!r.success, effect: !!r.effect, lines: r.lines.filter((l: any) => l && typeof l.text === 'string').map((l: any) => ({ gauge: l.gauge, text: l.text, from: l.from, to: l.to })) } : null;
  return d;
}

// ---------------- storage ----------------

function readJson(key: string): unknown {
  try { return typeof localStorage === 'undefined' ? null : JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

export function saveCampaign(d: CampaignData) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}

/** The saved campaign, or one migrated from the progress (argument, else the saved profile). */
export function loadCampaign(progress?: ProgressLike | null, opts: { reconcileUpTo?: number; noReconcile?: boolean } = {}): CampaignData {
  const p = progress ?? (readJson(PROGRESS_KEY) as ProgressLike | null);
  const saved = sanitize(readJson(CAMPAIGN_KEY));
  let d = saved ?? migrateFromProgress(p);
  if (!opts.noReconcile) d = reconcile(d, p, opts.reconcileUpTo);
  if (!saved || d !== saved) saveCampaign(d);
  return d;
}

export function startNewTour(prev: CampaignData): CampaignData {
  const d = defaultCampaign(newSeed(), prev.tour + 1);
  saveCampaign(d);
  return d;
}

/** Carry the strategic situation forward; Experten live in their own save and are untouched. */
export function startSecondTour(prev: CampaignData): CampaignData {
  if (!prev.complete || prev.secondTour || prev.interned) return prev;
  const d: CampaignData = { ...prev, tour: prev.tour + 1, complete: false, history: [], raids: [], report: null,
    secondTour: { completed: 0, score: 0, medal: false } };
  saveCampaign(d);
  return d;
}

/** A bounded map window, even after thousands of operations. */
export function campaignOperations(d: CampaignData): Mission[] {
  if (!d.secondTour) return CAMPAIGN;
  const start = Math.max(0, d.secondTour.completed - 12);
  return Array.from({ length: SECOND_TOUR_LENGTH }, (_, i) => secondTourMission(d.seed, start + i));
}

export function secondTourMedal(m: Mission, success: boolean): string[] {
  if (!success || !isSecondTourId(m.id)) return [];
  const d = loadCampaign(null, { noReconcile: true });
  return d.secondTour?.completed === SECOND_TOUR_LENGTH - 1 && isCurrentOp(d, m) ? [SECOND_TOUR_MEDAL] : [];
}

// ---------------- Game hooks ----------------

function isCampaignMission(m: Mission) { return storyIndex(m.id) >= 0 || isRaidId(m.id) || isSecondTourId(m.id); }

/** Briefing / mission start: apply the strategic modifiers to a current operation (in place). */
export function prepareCampaignMission(m: Mission, progress?: ProgressLike | null): Mission {
  if (!isCampaignMission(m)) return m;
  const d = loadCampaign(progress);
  return applyModifiers(m, modifiersFor(d, m, { ...baseOf(m), role: m.role, playerDamaged: m.playerDamaged, duration: m.duration }));
}

/** Debrief merit multiplier from crew morale (1 for anything but a current operation). */
export function campaignMeritMult(m: Mission, progress?: ProgressLike | null): number {
  if (!isCampaignMission(m)) return 1;
  const d = loadCampaign(progress, { noReconcile: true });
  return isCurrentOp(d, m) ? meritMult(d.morale) : 1;
}

export interface RecordResult { data: CampaignData; report: IntelReport; reward: number; op: OpInfo }

/**
 * Debrief: record the result. Game has already moved progress.unlocked on, so the state is only
 * caught up to this mission before the real result is applied. Returns null for non-campaign
 * missions. `reward` is the side raid's merit (paid by the caller).
 */
export function recordCampaignOutcome(m: Mission, o: Outcome, progress?: ProgressLike | null): RecordResult | null {
  if (!isCampaignMission(m)) return null;
  const i = storyIndex(m.id);
  let d = loadCampaign(progress, { reconcileUpTo: i >= 0 ? i : undefined, noReconcile: i < 0 });
  const op = opInfo(d, m);
  if (!op) return null;
  const res = applyOutcome(d, op, o);
  const reward = res.report.effect && o.success && op.kind === 'raid' && op.raidKind ? templateFor(op.raidKind).reward : 0;
  if (reward) res.report.lines.splice(-1, 0, { gauge: 'merit', text: `Raid bonus: +${reward} merit.` });
  d = reconcile(res.data, progress ?? (readJson(PROGRESS_KEY) as ProgressLike | null));
  d.report = res.report.effect ? res.report : d.report;
  saveCampaign(d);
  // back to the mission as written (the modifiers are applied again at the next start)
  applyModifiers(m, null);
  return { data: d, report: res.report, reward, op };
}

export interface CampaignTotals { sorties: number; wins: number; raids: number; raidWins: number; kills: number; lost: number }
export function totals(d: CampaignData): CampaignTotals {
  const t: CampaignTotals = { sorties: 0, wins: 0, raids: 0, raidWins: 0, kills: 0, lost: 0 };
  for (const h of d.history) {
    t.sorties++; if (h.success) t.wins++;
    if (h.kind === 'raid') { t.raids++; if (h.success) t.raidWins++; }
    t.kills += h.kills; t.lost += h.lost;
  }
  return t;
}
