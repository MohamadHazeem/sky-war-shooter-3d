// Mission editor (Phase 11 goal 27): a player builds a B-17 gunner mission (target, route length,
// weather, time of day, seat, formation, enemy skill, escorts, flak density and up to eight enemy
// waves with their types) and shares it as a compact code / link. Shared missions are played,
// rated and replayed from a local library.
//
// Sandboxing: a share code is untrusted input. decodeMission() reads a fixed bit layout with a
// version and a checksum; every field is an index into a fixed list or a number in a fixed range,
// anything else (wrong version, bad checksum, out-of-range index, trailing bytes, an oversized code)
// is rejected outright. The name is the only free text: Unicode-normalised, reduced to letters,
// digits, spaces and a little punctuation (nothing HTML-special) and capped. buildUserMission()
// turns a validated spec into an ordinary wave Mission; it never posts to the online leaderboards
// (the mode's board is '') and every user mission shares one progress id, so codes cannot touch
// campaign progress. Pure logic apart from the storage helpers: unit-tested (tests/missionEditor.test.ts).
import type { Mission, SpawnFrom, Wave } from './Missions';
import type { AttackType } from '../world/AI';
import type { EnemyType } from '../world/EnemyTypes';
import type { StationId } from '../world/B17Layout';
import { ALL_ENEMIES, LIMITS, MOODS, SEATS, SKILLS, SKILL_DEF, customWeather, type Mood, type Skill } from './CustomBattle';

export const TARGETS = [
  'U-boat pens, Wilhelmshaven', 'Docks, Bremen', 'Ball-bearing plants, Schweinfurt', 'Aircraft works, Regensburg',
  'Oil refinery, Merseburg', 'Rail yards, Hamm', 'Chemical works, Ludwigshafen', 'Tank factory, Kassel',
  'Airfield, Rheine', 'Government quarter, Berlin',
] as const;
export const ROUTES = ['short', 'medium', 'long'] as const;
export type Route = typeof ROUTES[number];
export const ROUTE_SECONDS: Record<Route, number> = { short: 180, medium: 270, long: 360 };
export const ROUTE_LABEL: Record<Route, string> = { short: 'Short route', medium: 'Medium route', long: 'Long route' };
export const ESCORTS = ['none', 'early', 'late'] as const;
export type Escort = typeof ESCORTS[number];
export const ESCORT_LABEL: Record<Escort, string> = { none: 'No escort', early: 'Escort from the start', late: 'Escort after the target' };
export const FLAK = [0, 0.8, 1.3, 1.8] as const;               // intensity over the target per density level
export const FLAK_LABEL = ['No flak', 'Light flak', 'Heavy flak', 'Deadly flak'] as const;
export const FROMS: SpawnFrom[] = ['front', 'rear', 'left', 'right', 'high', 'mixed'];
export const FROM_LABEL: Record<SpawnFrom, string> = { front: '12 o\'clock', rear: '6 o\'clock', left: '9 o\'clock', right: '3 o\'clock', high: 'From above', mixed: 'All around' };
export const LEGS = ['in', 'target', 'home'] as const;
export type Leg = typeof LEGS[number];
export const LEG_LABEL: Record<Leg, string> = { in: 'Way in', target: 'Over the target', home: 'Way home' };
export const BOMBERS = [6, 9, 12, 15, 18] as const;
export const NAME_MAX = 24;
export const WAVES_MAX = 8;
export const WAVE_COUNT: readonly [number, number] = [1, 12];
export const CODE_MAX = 160;                                     // characters; a full 8-wave mission with a long Arabic name is ~110

export interface EditorWave {
  leg: Leg;
  from: SpawnFrom;
  count: number;          // fighters in the group (1-12)
  types: EnemyType[];     // at least one
}

export interface MissionSpec {
  name: string;
  target: number;         // index into TARGETS
  route: Route;
  mood: Mood;
  sunEl: number;          // LIMITS.sunEl
  station: StationId;
  bombers: number;        // one of BOMBERS
  skill: Skill;
  escorts: Escort;
  flak: number;           // 0-3 (FLAK)
  waves: EditorWave[];    // 1-8
}

export const DEFAULT_SPEC: MissionSpec = {
  name: '', target: 0, route: 'medium', mood: 'clear', sunEl: 40, station: 'waistL', bombers: 12, skill: 'veteran', escorts: 'late', flak: 2,
  waves: [
    { leg: 'in', from: 'front', count: 4, types: ['fw190'] },
    { leg: 'in', from: 'left', count: 4, types: ['fw190', 'bf109'] },
    { leg: 'target', from: 'rear', count: 5, types: ['bf110', 'me410'] },
    { leg: 'home', from: 'mixed', count: 6, types: ['fw190', 'bf109'] },
  ],
};

const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
  return Math.max(lo, Math.min(hi, n));
};
const oneOf = <T>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);

// Free text -> safe display text: letters (any script), marks, digits, spaces and - . , ! ? # ( ) :
// No HTML-special or control / bidi-override characters survive; capped at NAME_MAX characters.
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.normalize('NFC').replace(/[^\p{L}\p{M}\p{N} \-.,!?#():]/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, NAME_MAX).join('').trim();
}

export function sanitizeWave(raw: unknown): EditorWave {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const types = Array.isArray(o.types) ? ALL_ENEMIES.filter((t) => (o.types as unknown[]).includes(t)) : [];
  return {
    leg: oneOf(o.leg, LEGS, 'in'),
    from: oneOf(o.from, FROMS, 'mixed'),
    count: clampInt(o.count, WAVE_COUNT[0], WAVE_COUNT[1], 4),
    types: types.length ? types : ['fw190'],
  };
}

// Any stored / typed value -> a valid spec (missing or bad fields take the defaults)
export function sanitizeSpec(raw: unknown): MissionSpec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SPEC;
  const waves = Array.isArray(o.waves) ? o.waves.slice(0, WAVES_MAX).map(sanitizeWave) : d.waves.map((w) => ({ ...w, types: w.types.slice() }));
  return {
    name: cleanName(o.name),
    target: clampInt(o.target, 0, TARGETS.length - 1, d.target),
    route: oneOf(o.route, ROUTES, d.route),
    mood: oneOf(o.mood, MOODS, d.mood),
    sunEl: clampInt(o.sunEl, LIMITS.sunEl[0], LIMITS.sunEl[1], d.sunEl),
    station: oneOf(o.station, SEATS, d.station),
    bombers: oneOf(o.bombers, BOMBERS, d.bombers),
    skill: oneOf(o.skill, SKILLS, d.skill),
    escorts: oneOf(o.escorts, ESCORTS, d.escorts),
    flak: clampInt(o.flak, 0, FLAK.length - 1, d.flak),
    waves: waves.length ? waves : [sanitizeWave(null)],
  };
}

export const totalFighters = (s: MissionSpec) => s.waves.reduce((a, w) => a + w.count, 0);

// ---------------- the share code ----------------
// Bit layout (version 1), big-endian bit order, then a 16-bit checksum of the payload bytes:
//   version 4 · target 4 · route 2 · mood 4 · sunEl 7 · station 3 · bombers 3 · skill 2 · escorts 2 · flak 2
//   waves-1 3 · per wave: leg 2 · from 3 · count-1 4 · types 10 (bit i = ALL_ENEMIES[i])
//   name byte length 6 · the name's UTF-8 bytes
export const CODE_VERSION = 1;

class BitWriter {
  private bytes: number[] = [];
  private acc = 0;
  private n = 0;
  put(v: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((v >>> i) & 1);
      if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; }
    }
  }
  done(): number[] {
    if (this.n) { this.bytes.push(this.acc << (8 - this.n)); this.acc = 0; this.n = 0; }
    return this.bytes;
  }
}

class BitReader {
  private pos = 0;
  constructor(private bytes: Uint8Array) {}
  get left() { return this.bytes.length * 8 - this.pos; }
  get(bits: number): number {
    if (bits > this.left) throw new Error('short');
    let v = 0;
    for (let i = 0; i < bits; i++, this.pos++) v = (v << 1) | ((this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
    return v;
  }
  align() { this.pos = Math.ceil(this.pos / 8) * 8; }
  bytesFrom(n: number): Uint8Array {
    if (this.pos & 7 || n * 8 > this.left) throw new Error('short');
    const out = this.bytes.slice(this.pos >> 3, (this.pos >> 3) + n);
    this.pos += n * 8;
    return out;
  }
}

export function checksum(bytes: ArrayLike<number>): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
  return ((h >>> 16) ^ h) & 0xffff;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function toB64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const k = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < k; j++) s += B64[(n >> (18 - 6 * j)) & 63];
  }
  return s;
}
function fromB64(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? B64.indexOf(chunk[j]) : 0);
    const k = chunk.length - 1;   // bytes in this chunk
    for (let j = 0; j < k; j++) out.push((n >> (16 - 8 * j)) & 255);
  }
  return Uint8Array.from(out);
}

const typeMask = (types: readonly EnemyType[]) => ALL_ENEMIES.reduce((m, t, i) => (types.includes(t) ? m | (1 << i) : m), 0);

export function encodeMission(raw: MissionSpec): string {
  const s = sanitizeSpec(raw);
  const w = new BitWriter();
  w.put(CODE_VERSION, 4);
  w.put(s.target, 4); w.put(ROUTES.indexOf(s.route), 2); w.put(MOODS.indexOf(s.mood), 4); w.put(s.sunEl, 7);
  w.put(SEATS.indexOf(s.station), 3); w.put(BOMBERS.indexOf(s.bombers as typeof BOMBERS[number]), 3); w.put(SKILLS.indexOf(s.skill), 2);
  w.put(ESCORTS.indexOf(s.escorts), 2); w.put(s.flak, 2);
  w.put(s.waves.length - 1, 3);
  for (const v of s.waves) { w.put(LEGS.indexOf(v.leg), 2); w.put(FROMS.indexOf(v.from), 3); w.put(v.count - 1, 4); w.put(typeMask(v.types), 10); }
  let name = new TextEncoder().encode(s.name);
  // a name of many multi-byte characters: drop characters until it fits 63 bytes
  for (let chars = [...s.name]; name.length > 63; chars = chars.slice(0, -1)) name = new TextEncoder().encode(chars.slice(0, -1).join('').trim());
  w.put(name.length, 6);
  const bytes = w.done();
  bytes.push(...name);
  const sum = checksum(bytes);
  bytes.push(sum >> 8, sum & 255);
  return toB64(bytes);
}

export type DecodeResult = { ok: true; spec: MissionSpec; code: string } | { ok: false; error: DecodeError };
export type DecodeError = 'empty' | 'format' | 'checksum' | 'version' | 'invalid';
export const DECODE_ERROR_TEXT: Record<DecodeError, string> = {
  empty: 'Paste a mission code or link first.',
  format: 'That is not a mission code.',
  checksum: 'This mission code is damaged — a character is missing or wrong.',
  version: 'This mission was made with a newer version of the game.',
  invalid: 'This mission code holds values the game does not allow.',
};

export const SHARE_PARAM = 'mission';

// A typed code, or a pasted link carrying ?mission=CODE (or #mission=CODE) -> the bare code
export function extractCode(input: string): string {
  const s = input.trim();
  const m = s.match(/[?#&]mission=([A-Za-z0-9_-]+)/);
  return m ? m[1] : s;
}

export function decodeMission(input: unknown): DecodeResult {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'empty' };
  const code = extractCode(input);
  if (code.length > CODE_MAX) return { ok: false, error: 'format' };
  const bytes = fromB64(code);
  if (!bytes || bytes.length < 8) return { ok: false, error: 'format' };
  const body = bytes.slice(0, -2);
  if (checksum(body) !== ((bytes[bytes.length - 2] << 8) | bytes[bytes.length - 1])) return { ok: false, error: 'checksum' };
  try {
    const r = new BitReader(body);
    if (r.get(4) !== CODE_VERSION) return { ok: false, error: 'version' };
    const idx = <T>(list: readonly T[], bits: number): T => {
      const i = r.get(bits);
      if (i >= list.length) throw new RangeError('index');
      return list[i];
    };
    const target = r.get(4);
    if (target >= TARGETS.length) throw new RangeError('target');
    const route = idx(ROUTES, 2), mood = idx(MOODS, 4);
    const sunEl = r.get(7);
    if (sunEl < LIMITS.sunEl[0] || sunEl > LIMITS.sunEl[1]) throw new RangeError('sun');
    const station = idx(SEATS, 3), bombers = idx(BOMBERS, 3), skill = idx(SKILLS, 2), escorts = idx(ESCORTS, 2);
    const flak = r.get(2);
    const n = r.get(3) + 1;
    const waves: EditorWave[] = [];
    for (let i = 0; i < n; i++) {
      const leg = idx(LEGS, 2), from = idx(FROMS, 3), count = r.get(4) + 1, mask = r.get(10);
      if (count > WAVE_COUNT[1] || !mask) throw new RangeError('wave');
      waves.push({ leg, from, count, types: ALL_ENEMIES.filter((_, b) => mask & (1 << b)) });
    }
    const len = r.get(6);
    r.align();
    const nameBytes = r.bytesFrom(len);
    if (r.left !== 0) throw new RangeError('trailing');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    if (cleanName(name) !== name) throw new RangeError('name');
    const spec: MissionSpec = { name, target, route, mood, sunEl, station, bombers, skill, escorts, flak, waves };
    return { ok: true, spec, code: encodeMission(spec) };
  } catch {
    return { ok: false, error: 'invalid' };
  }
}

export function shareLink(href: string, code: string): string {
  const u = new URL(href);
  u.search = ''; u.hash = '';
  u.searchParams.set(SHARE_PARAM, code);
  return u.toString();
}

// The code a page URL carries (?mission=CODE or #mission=CODE), or null
export function linkCode(href: string): string | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  return u.searchParams.get(SHARE_PARAM) ?? new URLSearchParams(u.hash.replace(/^#/, '')).get(SHARE_PARAM);
}

// The same URL without the mission (so a reload does not open it again)
export function withoutLinkCode(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(SHARE_PARAM);
  if (new URLSearchParams(u.hash.replace(/^#/, '')).has(SHARE_PARAM)) u.hash = '';
  return u.toString();
}

// ---------------- spec -> Mission ----------------
export const USER_MISSION_ID = 'user-mission';
const ATTACK: Record<SpawnFrom, AttackType | undefined> = { front: 'headon', rear: 'stern', left: 'beam', right: 'beam', high: 'high', mixed: undefined };
const ENEMY_NAME: Record<EnemyType, string> = { fw190: 'Fw 190', bf109: 'Bf 109', bf110: 'Bf 110', ju88: 'Ju 88', ju88g: 'Ju 88 G', me262: 'Me 262', me163: 'Me 163', me410: 'Me 410', do335: 'Do 335', he111: 'He 111' };
export const enemyName = (t: EnemyType) => ENEMY_NAME[t];

// Mission timings for a route: bombs away at 55 %, flak over the target around it
export function routeTimes(route: Route) {
  const duration = ROUTE_SECONDS[route];
  const bombsAway = Math.round(duration * 0.55);
  return { duration, bombsAway, flakStart: bombsAway - 35, flakEnd: bombsAway + 20 };
}

// When the first group of each leg arrives; later groups of the same leg come once it is cleared
export function legStart(leg: Leg, route: Route): number {
  const t = routeTimes(route);
  return leg === 'in' ? 8 : leg === 'target' ? t.bombsAway - 45 : t.bombsAway + 30;
}

export function orderedWaves(s: MissionSpec): EditorWave[] {
  return LEGS.flatMap((leg) => s.waves.filter((w) => w.leg === leg));
}

// The mission a code was built from (the debrief rates and records it); missions are never mutated
const CODES = new WeakMap<Mission, string>();
export const userMissionCode = (m: Mission | null | undefined) => (m ? CODES.get(m) ?? null : null);

export function missionTitle(s: MissionSpec): string {
  return s.name || `Strike on ${TARGETS[s.target].split(', ')[1]}`;
}

export function buildUserMission(raw: MissionSpec): Mission {
  const s = sanitizeSpec(raw);
  const t = routeTimes(s.route);
  const sk = SKILL_DEF[s.skill];
  const list = orderedWaves(s);
  const seen = new Set<Leg>();
  const waves: Wave[] = list.map((v, i) => {
    const first = !seen.has(v.leg);
    seen.add(v.leg);
    const k = list.length > 1 ? i / (list.length - 1) : 0;
    return {
      at: first ? legStart(v.leg, s.route) : 0, afterClear: first ? undefined : true,
      count: v.count, from: v.from, attack: ATTACK[v.from],
      skill: +(sk.skill[0] + (sk.skill[1] - sk.skill[0]) * k).toFixed(2), rockets: sk.rockets,
      types: v.types.slice(),
    };
  });
  const target = TARGETS[s.target];
  const flak = FLAK[s.flak];
  const m: Mission = {
    id: USER_MISSION_ID, number: 0,
    title: missionTitle(s), target, date: 'Player mission',
    role: 'gunner', station: s.station,
    briefing: [
      `A mission built by a gunner: ${s.bombers} Fortresses against ${target}, a ${ROUTE_LABEL[s.route].toLowerCase()}.`,
      `${list.length === 1 ? 'One fighter group' : `${list.length} fighter groups`} expected, ${totalFighters(s)} fighters in all, ${SKILL_DEF[s.skill].label.toLowerCase()} pilots.`,
      `${FLAK_LABEL[s.flak]} over the target.`,
      s.escorts === 'none' ? 'No escort today.' : s.escorts === 'early' ? 'Mustangs fly with us from the start.' : 'Mustangs meet us after the target.',
      'Player missions are not posted to the online leaderboards.',
    ],
    objectives: ['Defend the formation', 'Bomb the target', `Lose no more than ${Math.max(1, Math.round(s.bombers * 0.4))} bombers`],
    bombers: s.bombers,
    escortArrive: s.escorts === 'early' ? 20 : s.escorts === 'late' ? t.bombsAway + 15 : undefined,
    waves,
    flak: flak ? { start: t.flakStart, end: t.flakEnd, intensity: flak } : undefined,
    bombsAway: t.bombsAway,
    duration: t.duration,
    maxBombersLost: Math.max(1, Math.round(s.bombers * 0.4)),
    playerArmor: 0.6 * sk.armor,
    weather: customWeather(s.mood, s.sunEl),
    specials: false, midRound: false,
    success: `Bombs on ${target}. The mission you built is flown.`,
  };
  CODES.set(m, encodeMission(s));
  return m;
}

// One line for the library and the summary
export function describeSpec(s: MissionSpec): string[] {
  return [TARGETS[s.target], ROUTE_LABEL[s.route], `${s.waves.length} enemy group${s.waves.length > 1 ? 's' : ''} · ${totalFighters(s)} fighter${totalFighters(s) > 1 ? 's' : ''}`, SKILL_DEF[s.skill].label,
    FLAK_LABEL[s.flak], ESCORT_LABEL[s.escorts]];
}

// ---------------- the library: my missions and shared ones, with plays and ratings ----------------
export interface LibraryEntry {
  code: string;
  mine: boolean;          // built here (else opened from a shared code)
  plays: number;
  wins: number;
  best: number;           // best score
  rating: number;         // 0 = not rated, 1-5 stars
  at: number;             // last touched (ms)
}

const LIB_KEY = 'sws3d.missionEditor.v1';
export const LIBRARY_MAX = 40;

const cleanEntry = (raw: unknown): LibraryEntry | null => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = decodeMission(o.code);
  if (!d.ok) return null;
  return {
    code: d.code, mine: o.mine === true,
    plays: clampInt(o.plays, 0, 1e6, 0), wins: clampInt(o.wins, 0, 1e6, 0), best: clampInt(o.best, 0, 1e9, 0),
    rating: clampInt(o.rating, 0, 5, 0), at: clampInt(o.at, 0, 1e15, 0),
  };
};

export function sanitizeLibrary(raw: unknown): LibraryEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: LibraryEntry[] = [];
  for (const r of list) {
    const e = cleanEntry(r);
    if (e && !out.some((x) => x.code === e.code)) out.push(e);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, LIBRARY_MAX);
}

export function loadLibrary(): LibraryEntry[] {
  try { return sanitizeLibrary(JSON.parse(localStorage.getItem(LIB_KEY) ?? '[]')); } catch { return []; }
}
function saveLibrary(list: LibraryEntry[]) {
  try { localStorage.setItem(LIB_KEY, JSON.stringify(sanitizeLibrary(list))); } catch { /* storage unavailable */ }
}

// Add (or touch) a mission; returns the stored entry
export function addToLibrary(code: string, mine: boolean, now = Date.now()): LibraryEntry | null {
  const d = decodeMission(code);
  if (!d.ok) return null;
  const list = loadLibrary();
  let e = list.find((x) => x.code === d.code);
  if (!e) { e = { code: d.code, mine, plays: 0, wins: 0, best: 0, rating: 0, at: now }; list.push(e); }
  e.mine ||= mine;
  e.at = now;
  saveLibrary(list);
  return e;
}

export function removeFromLibrary(code: string) {
  saveLibrary(loadLibrary().filter((x) => x.code !== code));
}

export function rateMission(code: string, stars: number) {
  const list = loadLibrary();
  const e = list.find((x) => x.code === code);
  if (!e) return;
  e.rating = clampInt(stars, 0, 5, 0);
  saveLibrary(list);
}

export function recordPlay(code: string, success: boolean, score: number, now = Date.now()): LibraryEntry | null {
  const added = addToLibrary(code, false, now);
  if (!added) return null;
  const list = loadLibrary();
  const e = list.find((x) => x.code === added.code)!;
  e.plays++;
  if (success) e.wins++;
  e.best = Math.max(e.best, clampInt(score, 0, 1e9, 0));
  saveLibrary(list);
  return e;
}

// The mission being edited (kept between visits)
const DRAFT_KEY = 'sws3d.missionEditor.draft.v1';
export function loadDraft(): MissionSpec {
  try { return sanitizeSpec(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')); } catch { return sanitizeSpec(null); }
}
export function saveDraft(s: MissionSpec) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(sanitizeSpec(s))); } catch { /* storage unavailable */ }
}
