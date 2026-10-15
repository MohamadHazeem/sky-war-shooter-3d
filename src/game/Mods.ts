// Mod support (Phase 11 goal 38): community content from JSON files. A mod pack can carry
// player missions (the Mission Editor's spec, or its share code), paint schemes (two colours
// and an optional tileable camouflage image), nose art (an image) and new names for the crew.
// The format is documented in docs/MODDING.md; public/mods/ has examples.
//
// Sandbox: a mod is data, never code. The file is read with JSON.parse only and checked against
// a fixed schema; every field is copied by name into a fresh object (unknown keys are reported and
// dropped, so nothing like __proto__ is ever merged). Text is Unicode-normalised, stripped of
// control and bidi-override characters and capped; the screens escape it again. Images must be
// embedded base64 PNG / JPEG / WebP data: URLs (no SVG, no web addresses, so a mod can't load
// anything from the network) under a size cap, and are decoded (dimension-checked) as plain
// bitmaps. Missions go through the Mission Editor's encoder and decoder, so they are exactly as
// constrained as a shared mission code: one progress id, never posted to the leaderboards.
// Installed packs live in localStorage (sws3d.mods.v1) and are validated again on every load.
// Pure logic apart from the storage helpers: tests/mods.test.ts.
import {
  BOMBERS, DEFAULT_SPEC, ESCORTS, FLAK, FROMS, LEGS, ROUTES, TARGETS, WAVE_COUNT, WAVES_MAX,
  cleanName as cleanMissionName, decodeMission, encodeMission, type EditorWave, type MissionSpec,
} from './MissionEditor';
import { ALL_ENEMIES, LIMITS, MOODS, SEATS, SKILLS } from './CustomBattle';

export const MOD_FORMAT = 'sws3d-mod';
export const MOD_VERSION = 1;
export const FILE_MAX = 1_000_000;            // bytes of JSON per mod file
export const STORE_MAX = 3_000_000;           // characters of all installed mods together
export const IMAGE_MAX = 300_000;             // characters of one image data: URL (~220 KB)
export const IMAGE_PX = 1024;                 // largest image side
export const PACKS_MAX = 12;
export const LIMIT = { missions: 12, paints: 8, noseArt: 12, name: 32, title: 40, author: 40, description: 240, bio: 160, crewName: 16, nick: 16 } as const;

// the ten crewmen of game/CrewRoster.ts (tests/mods.test.ts keeps the two lists in step)
export const CREW_IDS = ['brenner', 'doyle', 'stern', 'kessler', 'mendez', 'gallo', 'reilly', 'price', 'walsh', 'dawson'] as const;
export type CrewModId = typeof CREW_IDS[number];
export const FLAK_NAMES = ['none', 'light', 'heavy', 'deadly'] as const;

export interface ModMission { id: string; code: string; spec: MissionSpec }
export interface ModPaintDef { id: string; name: string; top: string; under: string; metal: boolean; scale: number; pattern?: string }
export interface ModNoseDef { id: string; name: string; image: string; showName: boolean }
export interface ModCrewName { first?: string; last?: string; nick?: string; bio?: string }

export interface ModPack {
  id: string;
  name: string;
  author: string;
  description: string;
  missions: ModMission[];
  paints: ModPaintDef[];
  noseArt: ModNoseDef[];
  crew: Partial<Record<CrewModId, ModCrewName>>;
}

// A problem found in a file: an English template (translated by tx) and its values
export interface ModIssue { key: string; vars?: Record<string, string | number> }
export type ModResult = { ok: true; pack: ModPack; warnings: ModIssue[] } | { ok: false; errors: ModIssue[]; warnings: ModIssue[] };

const issue = (key: string, vars?: ModIssue['vars']): ModIssue => ({ key, vars });
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------------- text ----------------
// Control characters, bidi embeddings / overrides / isolates and the HTML-special < > are removed
const UNSAFE = /[\p{Cc}​-‏‪-‮⁠-⁯﻿<>]/gu;
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const s = raw.normalize('NFC').replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, max).join('').trim();
}
// crew names: letters, marks, spaces, apostrophes, dots and dashes
export function cleanPersonName(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const s = raw.normalize('NFC').replace(/[^\p{L}\p{M} '’.\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, max).join('').trim();
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// Approximate decoded byte length of a base64 data: URL
export const dataBytes = (url: string) => Math.floor((url.length - url.indexOf(',') - 1) * 0.75);

// ---------------- the checker ----------------
class Checker {
  errors: ModIssue[] = [];
  warnings: ModIssue[] = [];
  err(key: string, vars?: ModIssue['vars']) { this.errors.push(issue(key, vars)); }
  warn(key: string, vars?: ModIssue['vars']) { this.warnings.push(issue(key, vars)); }

  unknownKeys(o: Record<string, unknown>, known: readonly string[], path: string) {
    for (const k of Object.keys(o)) if (!known.includes(k)) this.warn('{path}: unknown field "{field}" ignored.', { path: path || 'mod', field: cleanText(k, 24) });
  }

  text(o: Record<string, unknown>, k: string, path: string, max: number, required: boolean): string {
    if (!has(o, k) || o[k] === undefined) { if (required) this.err('{path}: missing text.', { path: join(path, k) }); return ''; }
    if (typeof o[k] !== 'string') { this.err('{path}: must be text.', { path: join(path, k) }); return ''; }
    const s = cleanText(o[k], Infinity);
    if ([...s].length > max) this.err('{path}: too long (at most {n} characters).', { path: join(path, k), n: max });
    else if (required && !s) this.err('{path}: missing text.', { path: join(path, k) });
    return [...s].slice(0, max).join('');
  }

  id(o: Record<string, unknown>, path: string, seen: Set<string>): string {
    const v = o.id;
    if (typeof v !== 'string' || !ID_RE.test(v)) { this.err('{path}: id must be 2-24 lowercase letters, digits or dashes.', { path: join(path, 'id') }); return ''; }
    if (seen.has(v)) { this.err('{path}: id "{id}" is used twice.', { path: join(path, 'id'), id: v }); return ''; }
    seen.add(v);
    return v;
  }

  list(o: Record<string, unknown>, k: string, path: string, max: number): unknown[] {
    if (!has(o, k) || o[k] === undefined) return [];
    const v = o[k];
    if (!Array.isArray(v)) { this.err('{path}: must be a list.', { path: join(path, k) }); return []; }
    if (v.length > max) { this.err('{path}: too many entries (at most {n}).', { path: join(path, k), n: max }); return []; }
    return v;
  }

  oneOf<T>(o: Record<string, unknown>, k: string, path: string, list: readonly T[], def: T): T {
    if (!has(o, k) || o[k] === undefined) return def;
    if (list.includes(o[k] as T)) return o[k] as T;
    this.err('{path}: must be one of: {list}.', { path: join(path, k), list: list.join(', ') });
    return def;
  }

  int(o: Record<string, unknown>, k: string, path: string, lo: number, hi: number, def: number): number {
    if (!has(o, k) || o[k] === undefined) return def;
    const v = o[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi) return v;
    this.err('{path}: must be a whole number from {min} to {max}.', { path: join(path, k), min: lo, max: hi });
    return def;
  }

  bool(o: Record<string, unknown>, k: string, path: string, def: boolean): boolean {
    if (!has(o, k) || o[k] === undefined) return def;
    if (typeof o[k] === 'boolean') return o[k] as boolean;
    this.err('{path}: must be true or false.', { path: join(path, k) });
    return def;
  }

  color(o: Record<string, unknown>, k: string, path: string, def: string): string {
    if (!has(o, k) || o[k] === undefined) return def;
    const v = o[k];
    if (typeof v === 'string' && COLOR_RE.test(v)) return v.toLowerCase();
    this.err('{path}: colour must look like #5a5a2a.', { path: join(path, k) });
    return def;
  }

  image(o: Record<string, unknown>, k: string, path: string, required: boolean): string | undefined {
    if (!has(o, k) || o[k] === undefined) { if (required) this.err('{path}: missing image.', { path: join(path, k) }); return undefined; }
    const v = o[k];
    if (typeof v !== 'string' || !DATA_RE.test(v)) { this.err('{path}: image must be an embedded PNG, JPEG or WebP (a data:image/…;base64 URL).', { path: join(path, k) }); return undefined; }
    if (v.length > IMAGE_MAX) { this.err('{path}: image is too large (at most {kb} KB).', { path: join(path, k), kb: Math.floor(IMAGE_MAX * 0.75 / 1000) }); return undefined; }
    return v;
  }
}

const join = (path: string, k: string | number) => (typeof k === 'number' ? `${path}[${k}]` : path ? `${path}.${k}` : k);

function checkWave(c: Checker, raw: unknown, path: string): EditorWave | null {
  if (!isObj(raw)) { c.err('{path}: must be an object.', { path }); return null; }
  c.unknownKeys(raw, ['leg', 'from', 'count', 'types'], path);
  const leg = c.oneOf(raw, 'leg', path, LEGS, 'in');
  const from = c.oneOf(raw, 'from', path, FROMS, 'mixed');
  const count = c.int(raw, 'count', path, WAVE_COUNT[0], WAVE_COUNT[1], 4);
  const typesRaw = c.list(raw, 'types', path, ALL_ENEMIES.length);
  const types = [...new Set(typesRaw)].filter((t, i) => {
    if (ALL_ENEMIES.includes(t as never)) return true;
    c.err('{path}: must be one of: {list}.', { path: join(join(path, 'types'), i), list: ALL_ENEMIES.join(', ') });
    return false;
  }) as EditorWave['types'];
  if (!types.length && !typesRaw.length) types.push('fw190');
  return { leg, from, count, types };
}

function checkMission(c: Checker, raw: unknown, path: string, seen: Set<string>): ModMission | null {
  if (!isObj(raw)) { c.err('{path}: must be an object.', { path }); return null; }
  const before = c.errors.length;
  const id = c.id(raw, path, seen);
  let spec: MissionSpec;
  if (has(raw, 'code')) {
    c.unknownKeys(raw, ['id', 'code', 'name'], path);
    const d = decodeMission(raw.code);
    if (!d.ok) { c.err('{path}: mission code not valid.', { path: join(path, 'code') }); return null; }
    spec = d.spec;
    if (has(raw, 'name')) spec = { ...spec, name: cleanMissionName(c.text(raw, 'name', path, 24, false)) };
  } else {
    c.unknownKeys(raw, ['id', 'name', 'target', 'route', 'weather', 'sunElevation', 'seat', 'bombers', 'skill', 'escorts', 'flak', 'waves'], path);
    const d = DEFAULT_SPEC;
    let target = d.target;
    if (has(raw, 'target')) {
      const t = raw.target;
      if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < TARGETS.length) target = t;
      else if (typeof t === 'string' && (TARGETS as readonly string[]).includes(t)) target = TARGETS.indexOf(t as typeof TARGETS[number]);
      else c.err('{path}: must be one of: {list}.', { path: join(path, 'target'), list: TARGETS.join(' | ') });
    }
    let flak = d.flak;
    if (has(raw, 'flak')) {
      const f = raw.flak;
      if (typeof f === 'string' && FLAK_NAMES.includes(f as never)) flak = FLAK_NAMES.indexOf(f as never);
      else if (typeof f === 'number' && Number.isInteger(f) && f >= 0 && f < FLAK.length) flak = f;
      else c.err('{path}: must be one of: {list}.', { path: join(path, 'flak'), list: FLAK_NAMES.join(', ') });
    }
    const wavesRaw = c.list(raw, 'waves', path, WAVES_MAX);
    if (has(raw, 'waves') && Array.isArray(raw.waves) && !raw.waves.length) c.err('{path}: needs at least one wave.', { path: join(path, 'waves') });
    const waves = wavesRaw.map((w, i) => checkWave(c, w, join(join(path, 'waves'), i))).filter((w): w is EditorWave => !!w);
    spec = {
      name: cleanMissionName(c.text(raw, 'name', path, 24, false)),
      target, flak,
      route: c.oneOf(raw, 'route', path, ROUTES, d.route),
      mood: c.oneOf(raw, 'weather', path, MOODS, d.mood),
      sunEl: c.int(raw, 'sunElevation', path, LIMITS.sunEl[0], LIMITS.sunEl[1], d.sunEl),
      station: c.oneOf(raw, 'seat', path, SEATS, d.station),
      bombers: c.oneOf(raw, 'bombers', path, BOMBERS, d.bombers),
      skill: c.oneOf(raw, 'skill', path, SKILLS, d.skill),
      escorts: c.oneOf(raw, 'escorts', path, ESCORTS, d.escorts),
      waves: has(raw, 'waves') ? waves : d.waves.map((w) => ({ ...w, types: w.types.slice() })),
    };
  }
  if (c.errors.length > before) return null;
  // the share code is the canonical form: decoding it again guarantees an editor-valid mission
  const code = encodeMission(spec);
  const back = decodeMission(code);
  if (!back.ok) { c.err('{path}: mission code not valid.', { path }); return null; }
  return { id, code: back.code, spec: back.spec };
}

function checkPaint(c: Checker, raw: unknown, path: string, seen: Set<string>): ModPaintDef | null {
  if (!isObj(raw)) { c.err('{path}: must be an object.', { path }); return null; }
  const before = c.errors.length;
  c.unknownKeys(raw, ['id', 'name', 'top', 'under', 'metal', 'scale', 'pattern'], path);
  const id = c.id(raw, path, seen);
  const name = c.text(raw, 'name', path, LIMIT.name, true);
  const top = c.color(raw, 'top', path, '#5a5a2a');
  const under = c.color(raw, 'under', path, '#a9adb3');
  if (!has(raw, 'top') && !has(raw, 'pattern')) c.err('{path}: a paint scheme needs a "top" colour or a "pattern" image.', { path });
  const metal = c.bool(raw, 'metal', path, false);
  let scale = 1;
  if (has(raw, 'scale')) {
    const s = raw.scale;
    if (typeof s === 'number' && Number.isFinite(s) && s >= 0.25 && s <= 8) scale = Math.round(s * 100) / 100;
    else c.err('{path}: must be a number from {min} to {max}.', { path: join(path, 'scale'), min: 0.25, max: 8 });
  }
  const pattern = c.image(raw, 'pattern', path, false);
  if (c.errors.length > before) return null;
  return { id, name, top, under, metal, scale, ...(pattern ? { pattern } : {}) };
}

function checkNose(c: Checker, raw: unknown, path: string, seen: Set<string>): ModNoseDef | null {
  if (!isObj(raw)) { c.err('{path}: must be an object.', { path }); return null; }
  const before = c.errors.length;
  c.unknownKeys(raw, ['id', 'name', 'image', 'showName'], path);
  const id = c.id(raw, path, seen);
  const name = c.text(raw, 'name', path, LIMIT.name, true);
  const image = c.image(raw, 'image', path, true);
  const showName = c.bool(raw, 'showName', path, true);
  if (c.errors.length > before || !image) return null;
  return { id, name, image, showName };
}

function checkCrew(c: Checker, raw: unknown, path: string): ModPack['crew'] {
  const out: ModPack['crew'] = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) { c.err('{path}: must be an object.', { path }); return out; }
  for (const k of Object.keys(raw)) {
    const p = join(path, k);
    if (!(CREW_IDS as readonly string[]).includes(k)) { c.err('{path}: unknown crewman (use one of: {list}).', { path: p, list: CREW_IDS.join(', ') }); continue; }
    const v = raw[k];
    if (!isObj(v)) { c.err('{path}: must be an object.', { path: p }); continue; }
    c.unknownKeys(v, ['first', 'last', 'nick', 'bio'], p);
    const e: ModCrewName = {};
    for (const [f, max] of [['first', LIMIT.crewName], ['last', LIMIT.crewName], ['nick', LIMIT.nick]] as const) {
      if (!has(v, f)) continue;
      if (typeof v[f] !== 'string') { c.err('{path}: must be text.', { path: join(p, f) }); continue; }
      const s = cleanPersonName(v[f], Infinity);
      if (!s) c.err('{path}: missing text.', { path: join(p, f) });
      else if ([...s].length > max) c.err('{path}: too long (at most {n} characters).', { path: join(p, f), n: max });
      else e[f] = s;
    }
    if (has(v, 'bio')) { const b = c.text(v, 'bio', p, LIMIT.bio, false); if (b) e.bio = b; }
    if (Object.keys(e).length) out[k as CrewModId] = e;
  }
  return out;
}

// Validate a parsed mod (any JSON value) into a clean pack
export function validateMod(raw: unknown): ModResult {
  const c = new Checker();
  const fail = (): ModResult => ({ ok: false, errors: c.errors, warnings: c.warnings });
  if (!isObj(raw) || raw.format !== MOD_FORMAT) { c.err('Not a Sky War mod: the file needs "format": "sws3d-mod".'); return fail(); }
  const v = raw.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) { c.err('{path}: must be a whole number from {min} to {max}.', { path: 'version', min: 1, max: MOD_VERSION }); return fail(); }
  if (v > MOD_VERSION) { c.err('This mod needs a newer version of the game (mod format {v}).', { v }); return fail(); }
  c.unknownKeys(raw, ['format', 'version', 'id', 'name', 'author', 'description', 'missions', 'paints', 'noseArt', 'crew'], '');
  const id = c.id(raw, '', new Set());
  const name = c.text(raw, 'name', '', LIMIT.title, true);
  const author = c.text(raw, 'author', '', LIMIT.author, false);
  const description = c.text(raw, 'description', '', LIMIT.description, false);
  const seenM = new Set<string>(), seenP = new Set<string>(), seenN = new Set<string>();
  const missions = c.list(raw, 'missions', '', LIMIT.missions).map((m, i) => checkMission(c, m, join('missions', i), seenM)).filter((m): m is ModMission => !!m);
  const paints = c.list(raw, 'paints', '', LIMIT.paints).map((m, i) => checkPaint(c, m, join('paints', i), seenP)).filter((m): m is ModPaintDef => !!m);
  const noseArt = c.list(raw, 'noseArt', '', LIMIT.noseArt).map((m, i) => checkNose(c, m, join('noseArt', i), seenN)).filter((m): m is ModNoseDef => !!m);
  const crew = checkCrew(c, raw.crew, 'crew');
  if (c.errors.length) return fail();
  if (!missions.length && !paints.length && !noseArt.length && !Object.keys(crew).length) { c.err('This mod has no missions, paint schemes, nose art or crew names.'); return fail(); }
  return { ok: true, pack: { id, name, author, description, missions, paints, noseArt, crew }, warnings: c.warnings };
}

// Read a mod file's text
export function parseMod(text: string): ModResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, errors: [issue('The file is empty.')], warnings: [] };
  if (text.length > FILE_MAX) return { ok: false, errors: [issue('The file is too large (at most {kb} KB).', { kb: FILE_MAX / 1000 })], warnings: [] };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, errors: [issue('This is not valid JSON. Check for a missing comma or quote.')], warnings: [] }; }
  return validateMod(raw);
}

// What a pack holds, for its card: counts per kind
export function packCounts(p: ModPack) {
  return { missions: p.missions.length, paints: p.paints.length, noseArt: p.noseArt.length, crew: Object.keys(p.crew).length };
}

// The cosmetic id of a mod item ('mod.<pack>.<item>')
export const modItemId = (pack: string, item: string) => `mod.${pack}.${item}`;

// A pack back to its file form (for the template / export)
export function packToJson(p: ModPack) {
  return {
    format: MOD_FORMAT, version: MOD_VERSION, id: p.id, name: p.name, ...(p.author ? { author: p.author } : {}), ...(p.description ? { description: p.description } : {}),
    missions: p.missions.map((m) => ({ id: m.id, code: m.code, ...(m.spec.name ? { name: m.spec.name } : {}) })),
    paints: p.paints, noseArt: p.noseArt, crew: p.crew,
  };
}

// The "Download template" file of the Mods screen: one of each kind (tests check it is valid)
export function modTemplate() {
  return {
    format: MOD_FORMAT, version: MOD_VERSION, id: 'my-first-mod', name: 'My first mod', author: 'Your name',
    description: 'A short line about what this mod adds.',
    missions: [{ id: 'dawn-strike', name: 'Dawn Strike', target: 'Docks, Bremen', route: 'short', weather: 'clear', sunElevation: 12, seat: 'tail',
      bombers: 12, skill: 'veteran', escorts: 'late', flak: 'heavy',
      waves: [{ leg: 'in', from: 'front', count: 4, types: ['fw190'] }, { leg: 'target', from: 'rear', count: 6, types: ['bf109', 'me410'] }, { leg: 'home', from: 'mixed', count: 5, types: ['fw190'] }] }],
    paints: [{ id: 'sky-blue', name: 'Sky Blue', top: '#5f7f9a', under: '#c8d2da' }],
    noseArt: [],
    crew: { dawson: { first: 'Sam', nick: 'Eagle Eye' } },
  };
}

// ---------------- installed mods ----------------
export interface InstalledMod { pack: ModPack; enabled: boolean; at: number; source: string }   // source: file name or 'example'

const KEY = 'sws3d.mods.v1';

// Stored data back to installed mods: every pack is validated again (tampered ones are dropped)
export function sanitizeInstalled(raw: unknown): InstalledMod[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: InstalledMod[] = [];
  for (const r of list) {
    if (!isObj(r)) continue;
    const v = validateMod(r.pack ? packToJson(r.pack as ModPack) : null);
    if (!v.ok || out.some((x) => x.pack.id === v.pack.id)) continue;
    out.push({ pack: v.pack, enabled: r.enabled === true, at: typeof r.at === 'number' && Number.isFinite(r.at) ? r.at : 0, source: cleanText(r.source, 60) });
    if (out.length >= PACKS_MAX) break;
  }
  return out;
}

export function loadInstalled(): InstalledMod[] {
  try { return sanitizeInstalled(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { return []; }
}

// false when storage is full / unavailable
export function saveInstalled(list: InstalledMod[]): boolean {
  try {
    const s = JSON.stringify(list.slice(0, PACKS_MAX));
    if (s.length > STORE_MAX) return false;
    localStorage.setItem(KEY, s);
    return true;
  } catch { return false; }
}

export type InstallResult = { ok: true; replaced: boolean; list: InstalledMod[] } | { ok: false; error: ModIssue };

// Add a validated pack (a pack with the same id is replaced, keeping its on/off state)
export function installPack(list: InstalledMod[], pack: ModPack, source: string, now = Date.now()): InstallResult {
  const old = list.find((x) => x.pack.id === pack.id);
  if (!old && list.length >= PACKS_MAX) return { ok: false, error: issue('You can install at most {n} mods. Remove one first.', { n: PACKS_MAX }) };
  const entry: InstalledMod = { pack, enabled: old ? old.enabled : true, at: now, source: cleanText(source, 60) };
  const next = old ? list.map((x) => (x === old ? entry : x)) : [...list, entry];
  if (JSON.stringify(next).length > STORE_MAX) return { ok: false, error: issue('Not enough room for this mod. Remove a mod with large images first.') };
  return { ok: true, replaced: !!old, list: next };
}
