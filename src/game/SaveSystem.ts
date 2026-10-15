// Save system 2.0 (Phase 11 goal 36). The player profile is every 'sws3d.*' localStorage entry;
// this module gives it a versioned schema with migrations, automatic local backups, a portable
// export file, conflict resolution for the cloud copy (newest wins, stats merged) and the damage
// check behind the recovery screen (ui/SaveRecoveryScreen.ts).
//
// Storage layout:
//   sws3d.save.meta   profile meta {schema, savedAt, hash} (synced with the profile)
//   swsdev.save       this device only: {syncedHash, mergeUntilRestart}
//   swsbak.index      the backup list; swsbak.<id> one backup envelope each, swsbak.undo the
//                     profile as it was before the last restore / import / repair / merge
// Backups and device state sit outside the 'sws3d.' prefix, so they never reach the cloud copy.
//
// Pure functions plus an injectable key-value store, so everything is unit-tested in Node.

import { migrateProgress } from './Missions';

export interface KV {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export type Profile = Record<string, string>;
export interface SaveMeta { schema: number; savedAt: number; hash: string }
export interface Envelope { format: typeof FORMAT; schema: number; savedAt: number; hash: string; keys: Profile }
export interface BackupSummary { missions: number; xp: number; unlocked: number }
export type BackupReason = 'launch' | 'mission' | 'update' | 'manual' | 'undo';
export interface BackupEntry { id: string; at: number; reason: BackupReason; hash: string; size: number; summary: BackupSummary }

export const SAVE_SCHEMA = 2;
export const FORMAT = 'sws3d-profile';
export const PREFIX = 'sws3d.';
export const META_KEY = 'sws3d.save.meta';
const CODE_KEY = 'sws3d.cloudCode';
const DEVICE_KEY = 'swsdev.save';
const BAK = 'swsbak.';
const INDEX_KEY = 'swsbak.index';
export const UNDO_ID = 'undo';
const MAX_IMPORT = 2_000_000;
const DAY = 86_400_000;

// Never part of a portable profile: the cloud code and per-device session tickets
const DEVICE_ONLY = new Set([CODE_KEY, META_KEY, 'sws3d.coopTicket', 'sws3d.analytics.dev']);
// Stores whose numbers only grow and whose lists only gain entries: on a cloud conflict they are
// merged (max / union) instead of taken from the newer side, so no device loses earned progress.
// Spendable currencies (the armory points) are deliberately not here.
export const STAT_KEYS = ['sws3d.progress.v1', 'sws3d.career.v1', 'sws3d.achievements.v1', 'sws3d.mastery.v1', 'sws3d.feats.v1', 'sws3d.museum.v1'];
// fields that keep the smaller value (first-seen times)
const MIN_FIELDS = new Set(['enlisted']);

export function browserKV(): KV | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

// ---------------- profile ----------------

export function readProfile(kv: KV): Profile {
  const out: Profile = {};
  try {
    for (let i = 0; i < kv.length; i++) {
      const k = kv.key(i);
      if (k && k.startsWith(PREFIX) && !DEVICE_ONLY.has(k)) out[k] = kv.getItem(k) ?? '';
    }
  } catch { /* storage unavailable */ }
  return out;
}

// FNV-1a over the sorted entries: a cheap content id to skip duplicate backups and detect changes
export function profileHash(p: Profile): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } h ^= 0xff; h = Math.imul(h, 0x01000193); };
  for (const k of Object.keys(p).sort()) { mix(k); mix(p[k]); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const parse = <T>(s: string | null | undefined): T | null => { try { return s ? JSON.parse(s) as T : null; } catch { return null; } };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function readMeta(kv: KV): SaveMeta {
  const m = parse<Partial<SaveMeta>>(kv.getItem(META_KEY));
  // no meta yet: a profile from before Save 2.0, schema 1
  return { schema: Number(m?.schema) || 1, savedAt: Number(m?.savedAt) || 0, hash: typeof m?.hash === 'string' ? m.hash : '' };
}

function writeMeta(kv: KV, m: SaveMeta) { try { kv.setItem(META_KEY, JSON.stringify(m)); } catch { /* full */ } }

// Stamp the profile: savedAt moves only when its content changed since the last stamp
export function touchMeta(kv: KV, now = Date.now()): SaveMeta {
  const m = readMeta(kv);
  const hash = profileHash(readProfile(kv));
  if (hash !== m.hash) { m.hash = hash; m.savedAt = now; writeMeta(kv, m); }
  return m;
}

// Values that cannot be read back: a JSON store cut short or overwritten by a bug
export function findDamage(p: Profile): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    const s = v.trim();
    if (s === 'undefined' || s === 'NaN' || s.startsWith('[object ')) { bad.push(k); continue; }
    if ((s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) && parse(s) === null && s !== 'null') bad.push(k);
    else if (/\.v\d+$/.test(k) && s === '') bad.push(k);
  }
  return bad.sort();
}

export function summarize(p: Profile): BackupSummary {
  const c = parse<Record<string, unknown>>(p['sws3d.career.v1']);
  const g = parse<Record<string, unknown>>(p['sws3d.progress.v1']);
  return { missions: Number(c?.missions) || 0, xp: Number(c?.xp) || 0, unlocked: Number(g?.unlocked) || 0 };
}

// Replace the stored profile with p (device-only keys stay)
export function applyProfile(kv: KV, p: Profile, savedAt: number, schema = SAVE_SCHEMA) {
  for (const k of Object.keys(readProfile(kv))) kv.removeItem(k);
  for (const [k, v] of Object.entries(p)) if (k.startsWith(PREFIX) && !DEVICE_ONLY.has(k)) kv.setItem(k, v);
  writeMeta(kv, { schema, savedAt, hash: profileHash(readProfile(kv)) });
}

// ---------------- migrations ----------------

// MIGRATIONS[n] moves a profile from schema n to n + 1. Add a step (and bump SAVE_SCHEMA) whenever
// a store changes shape; a step must accept any older value and never throw.
export const MIGRATIONS: Record<number, (p: Profile) => Profile> = {
  // 1 → 2: the first versioned profile. Drop device-only keys an old cloud copy or file may carry
  // and move a campaign saved in the original seven-mission order to the new order.
  1: (p) => {
    const out: Profile = {};
    for (const [k, v] of Object.entries(p)) if (k.startsWith(PREFIX) && !DEVICE_ONLY.has(k)) out[k] = v;
    const g = parse<{ unlocked: number; layout?: number }>(out['sws3d.progress.v1']);
    if (isObj(g)) out['sws3d.progress.v1'] = JSON.stringify(migrateProgress(g));
    return out;
  },
};

export function migrateProfile(p: Profile, from: number, to = SAVE_SCHEMA): Profile {
  let out = { ...p };
  for (let s = Math.max(1, from); s < to; s++) {
    const step = MIGRATIONS[s];
    if (step) { try { out = step(out); } catch { /* keep the profile as it is */ } }
  }
  return out;
}

// Boot: bring the stored profile up to the current schema (a backup of the old one is kept first)
export function migrateStored(kv: KV, now = Date.now()): { from: number; to: number } | null {
  const m = readMeta(kv);
  if (m.schema >= SAVE_SCHEMA) return null;
  const before = readProfile(kv);
  if (Object.keys(before).length) makeBackup(kv, 'update', now, true);
  applyProfile(kv, migrateProfile(before, m.schema), m.savedAt || now);
  return { from: m.schema, to: SAVE_SCHEMA };
}

// ---------------- export / import ----------------

export function makeEnvelope(p: Profile, savedAt: number, schema = SAVE_SCHEMA): Envelope {
  return { format: FORMAT, schema, savedAt, hash: profileHash(p), keys: p };
}

export function exportProfile(kv: KV, now = Date.now()): string {
  const m = touchMeta(kv, now);
  return JSON.stringify(makeEnvelope(readProfile(kv), m.savedAt || now), null, 1);
}

export type ImportResult = { ok: true; profile: Profile; savedAt: number; from: number } | { ok: false; error: 'invalid' | 'newer' | 'empty' };

// Accepts a Save 2.0 file or the bare key map of a pre-2.0 cloud copy; migrates it to SAVE_SCHEMA
export function parseImport(text: string): ImportResult {
  if (!text || text.length > MAX_IMPORT) return { ok: false, error: 'invalid' };
  const o = parse<unknown>(text);
  if (!isObj(o)) return { ok: false, error: 'invalid' };
  let keys: unknown = o; let schema = 1; let savedAt = 0;
  if (o.format !== undefined) {
    if (o.format !== FORMAT || !isObj(o.keys)) return { ok: false, error: 'invalid' };
    keys = o.keys; schema = Math.floor(Number(o.schema)) || 1; savedAt = Number(o.savedAt) || 0;
  }
  if (schema > SAVE_SCHEMA) return { ok: false, error: 'newer' };
  const p: Profile = {};
  for (const [k, v] of Object.entries(keys as Record<string, unknown>)) {
    if (!k.startsWith(PREFIX)) continue;
    if (typeof v !== 'string') return { ok: false, error: 'invalid' };
    p[k] = v;
  }
  if (!Object.keys(p).length) return { ok: false, error: 'empty' };
  return { ok: true, profile: migrateProfile(p, schema), savedAt, from: schema };
}

// Replace the local profile with an imported one (the current profile goes to the undo slot)
export function importProfile(kv: KV, text: string, now = Date.now()): ImportResult {
  const r = parseImport(text);
  if (!r.ok) return r;
  makeBackup(kv, 'undo', now, true);
  applyProfile(kv, r.profile, now);
  return r;
}

// ---------------- backups ----------------

export function listBackups(kv: KV): BackupEntry[] {
  const list = parse<BackupEntry[]>(kv.getItem(INDEX_KEY));
  return Array.isArray(list) ? list.filter((b) => b && typeof b.id === 'string' && Number.isFinite(b.at)).sort((a, b) => b.at - a.at) : [];
}

// Which backups to keep: the four newest, plus the newest one older than a day and the newest
// older than a week, so a bad streak of sessions cannot rotate out every good copy.
export function keepBackups(list: BackupEntry[], now: number, newest = 4): BackupEntry[] {
  const regular = list.filter((b) => b.id !== UNDO_ID).sort((a, b) => b.at - a.at);
  const keep = new Set(regular.slice(0, newest));
  const day = regular.find((b) => now - b.at >= DAY);
  const week = regular.find((b) => now - b.at >= 7 * DAY);
  if (day) keep.add(day);
  if (week) keep.add(week);
  return [...list.filter((b) => b.id === UNDO_ID), ...regular.filter((b) => keep.has(b))];
}

function writeIndex(kv: KV, list: BackupEntry[]) { kv.setItem(INDEX_KEY, JSON.stringify(list)); }

// Copy the current profile into a backup slot. Skipped when nothing changed since the newest
// backup, and (unless forced) when the profile is damaged, so a broken state never pushes the
// good copies out. 'undo' writes the single undo slot instead of the rotation.
export function makeBackup(kv: KV, reason: BackupReason, now = Date.now(), force = false): BackupEntry | null {
  const p = readProfile(kv);
  if (!Object.keys(p).length) return null;
  if (!force && findDamage(p).length) return null;
  const hash = profileHash(p);
  let list = listBackups(kv);
  const undo = reason === 'undo';
  if (!undo && !force && list.find((b) => b.id !== UNDO_ID)?.hash === hash) return null;
  const id = undo ? UNDO_ID : `${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const data = JSON.stringify(makeEnvelope(p, readMeta(kv).savedAt || now));
  const entry: BackupEntry = { id, at: now, reason, hash, size: data.length, summary: summarize(p) };
  list = keepBackups([entry, ...list.filter((b) => b.id !== id)], now);
  // storage full: drop the oldest copies until it fits (at least the new one)
  for (;;) {
    try {
      kv.setItem(BAK + id, data);
      writeIndex(kv, list);
      break;
    } catch {
      const victim = [...list].reverse().find((b) => b.id !== id);
      if (!victim) { try { kv.removeItem(BAK + id); } catch { /* */ } return null; }
      list = list.filter((b) => b !== victim);
      try { kv.removeItem(BAK + victim.id); } catch { /* */ }
    }
  }
  const live = new Set(list.map((b) => BAK + b.id));
  for (let i = kv.length - 1; i >= 0; i--) {
    const k = kv.key(i);
    if (k && k.startsWith(BAK) && k !== INDEX_KEY && !live.has(k)) kv.removeItem(k);
  }
  return entry;
}

export function readBackup(kv: KV, id: string): Envelope | null {
  const e = parse<Envelope>(kv.getItem(BAK + id));
  return e && isObj(e.keys) ? e : null;
}

// Put a backup back (the profile being replaced goes to the undo slot, so a restore can be undone)
export function restoreBackup(kv: KV, id: string, now = Date.now()): boolean {
  const e = readBackup(kv, id);
  if (!e) return false;
  const keys = migrateProfile(e.keys, e.schema || 1);
  makeBackup(kv, 'undo', now, true);
  applyProfile(kv, keys, now);
  return true;
}

// Repair: reset only the damaged stores (each game system rebuilds its defaults on the next start)
export function repairDamage(kv: KV, now = Date.now()): string[] {
  const bad = findDamage(readProfile(kv));
  if (!bad.length) return bad;
  makeBackup(kv, 'undo', now, true);
  for (const k of bad) kv.removeItem(k);
  touchMeta(kv, now);
  return bad;
}

// ---------------- cloud conflicts ----------------

// Merge two values of a growing store: numbers keep the larger, lists of plain values are joined,
// objects merge per field; anything else comes from `base` (the newer side).
export function mergeStats(base: unknown, other: unknown, field = ''): unknown {
  if (typeof base === 'number' && typeof other === 'number') {
    if (!Number.isFinite(other)) return base;
    if (!Number.isFinite(base)) return other;
    return MIN_FIELDS.has(field) && base > 0 && other > 0 ? Math.min(base, other) : Math.max(base, other);
  }
  if (Array.isArray(base) && Array.isArray(other)) {
    const plain = (a: unknown[]) => a.every((x) => x === null || typeof x !== 'object');
    if (!plain(base) || !plain(other)) return base.length >= other.length ? base : other;
    const out = [...base];
    for (const x of other) if (!out.includes(x)) out.push(x);
    return out;
  }
  if (isObj(base) && isObj(other)) {
    const out: Record<string, unknown> = { ...other, ...base };
    for (const k of Object.keys(base)) if (k in other) out[k] = mergeStats(base[k], other[k], k);
    return out;
  }
  return base === undefined ? other : base;
}

export interface Side { profile: Profile; savedAt: number }
export interface Resolution { profile: Profile; winner: 'local' | 'remote'; merged: string[]; savedAt: number }

// Newest wins: the newer profile is taken whole (settings, loadout, campaign state …), then the
// growing stores of the older one are merged in so no device loses earned stats.
// `prefer` forces the base side (loading another device's code takes that profile as the base).
export function resolveConflict(local: Side, remote: Side, prefer?: 'local' | 'remote'): Resolution {
  const winner = prefer ?? (remote.savedAt > local.savedAt ? 'remote' : 'local');
  const [base, other] = winner === 'remote' ? [remote, local] : [local, remote];
  const profile: Profile = { ...base.profile };
  const merged: string[] = [];
  for (const k of STAT_KEYS) {
    const a = base.profile[k]; const b = other.profile[k];
    if (b === undefined) continue;
    if (a === undefined) { profile[k] = b; merged.push(k); continue; }
    const pa = parse<unknown>(a); const pb = parse<unknown>(b);
    if (pa === null) { if (pb !== null) { profile[k] = b; merged.push(k); } continue; }
    if (pb === null) continue;
    const m = JSON.stringify(mergeStats(pa, pb));
    if (m !== a) { profile[k] = m; merged.push(k); }
  }
  return { profile, winner, merged, savedAt: Math.max(local.savedAt, remote.savedAt) };
}

// ---------------- device state ----------------

export interface DeviceState { syncedHash: string; mergeUntilRestart: boolean }

export function deviceState(kv: KV): DeviceState {
  const d = parse<Partial<DeviceState>>(kv.getItem(DEVICE_KEY));
  return { syncedHash: typeof d?.syncedHash === 'string' ? d.syncedHash : '', mergeUntilRestart: !!d?.mergeUntilRestart };
}

export function setDeviceState(kv: KV, d: Partial<DeviceState>) {
  try { kv.setItem(DEVICE_KEY, JSON.stringify({ ...deviceState(kv), ...d })); } catch { /* full */ }
}

// ---------------- boot ----------------

export interface BootReport { migrated: { from: number; to: number } | null; damaged: string[]; backup: BackupEntry | null }

// Called once before the game reads its stores: migrate, check for damage, back up a healthy profile
export function bootSaves(kv: KV, now = Date.now()): BootReport {
  let migrated: BootReport['migrated'] = null;
  try { migrated = migrateStored(kv, now); } catch { /* keep going: the recovery screen can still help */ }
  setDeviceState(kv, { mergeUntilRestart: false });
  const damaged = findDamage(readProfile(kv));
  let backup: BackupEntry | null = null;
  if (!damaged.length) {
    touchMeta(kv, now);
    try { backup = makeBackup(kv, 'launch', now); } catch { /* storage full */ }
  }
  return { migrated, damaged, backup };
}

// A backup shortly after the stores settle (mission end: the cloud push calls this, so it works
// offline too); repeated calls within the delay make one backup
let pending: ReturnType<typeof setTimeout> | undefined;
export function scheduleBackup(reason: BackupReason = 'mission', delay = 2500) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    const kv = browserKV();
    if (!kv) return;
    try { touchMeta(kv); makeBackup(kv, reason); } catch { /* storage full */ }
  }, delay);
}
