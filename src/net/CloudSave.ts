// Cloud save: every 'sws3d.*' localStorage entry (progress, armory, settings, achievements,
// crew …) is mirrored to Firestore under a long random transfer code. Entering that code on
// another device pulls the same profile down. The code is the secret, so it is long (20 chars).
//
// Save 2.0 (game/SaveSystem.ts): the document keeps its original shape ({data, updatedAt, v: 1},
// as the Firestore rules require, so older clients still read it); the profile meta inside the
// data ('sws3d.save.meta') carries the schema and the time the profile last changed. A push
// first reads the cloud copy: if another device changed it since this device last synced, the
// two are resolved (newest wins, growing stats merged) before anything is written.

import { fbConnect } from './Leaderboard';
import {
  browserKV, deviceState, makeBackup, migrateProfile, profileHash, readProfile, resolveConflict, setDeviceState,
  applyProfile, scheduleBackup, touchMeta, META_KEY, PREFIX, type BackupReason, type KV, type Profile,
} from '../game/SaveSystem';

const CODE_KEY = 'sws3d.cloudCode';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

export function cloudCode(): string {
  try {
    let c = localStorage.getItem(CODE_KEY);
    if (!c) { c = newCode(); localStorage.setItem(CODE_KEY, c); }
    return c;
  } catch { return ''; }
}

export const prettyCode = (c: string) => c.replace(/(.{5})(?=.)/g, '$1-');

// The cloud document's data: the profile plus its meta (old clients copy the meta key harmlessly)
function cloudData(kv: KV, p: Profile): string {
  return JSON.stringify({ ...p, [META_KEY]: kv.getItem(META_KEY) ?? '' });
}

interface Remote { profile: Profile; savedAt: number; schema: number }

// Read a cloud document into a profile (a pre-2.0 copy has no meta: its upload time stands in)
export function readRemote(raw: unknown, updatedAt = 0): Remote | null {
  let o: unknown;
  try { o = JSON.parse(String(raw)); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const map = o as Record<string, unknown>;
  let meta: { schema?: number; savedAt?: number } = {};
  try { meta = JSON.parse(String(map[META_KEY] ?? '{}')) ?? {}; } catch { /* old copy */ }
  const profile: Profile = {};
  for (const [k, v] of Object.entries(map)) if (k.startsWith(PREFIX) && k !== META_KEY && typeof v === 'string') profile[k] = v;
  const schema = Number(meta.schema) || 1;
  return { profile: migrateProfile(profile, schema), savedAt: Number(meta.savedAt) || updatedAt, schema };
}

export type SyncResult = 'pushed' | 'merged' | 'skipped' | 'error';
let lastPush = 0;
let onMerged: ((n: number) => void) | null = null;
// The UI listens: a merge brought progress from another device (it shows after a restart)
export function onCloudMerge(f: (n: number) => void) { onMerged = f; }

// Push the local profile (throttled; call at mission end and on settings changes). Resolves a
// conflict with the cloud copy first, so a push never throws away another device's progress.
export async function pushSave(force = false, backup: BackupReason = 'mission'): Promise<boolean> {
  return (await syncSave(force, backup)) !== 'error';
}

export async function syncSave(force = false, backup: BackupReason = 'mission'): Promise<SyncResult> {
  const now = Date.now();
  scheduleBackup(backup);   // local backup first: works offline too
  if (!force && now - lastPush < 15000) return 'skipped';
  lastPush = now;
  const kv = browserKV();
  if (!kv) return 'error';
  try {
    const { db, fs } = await fbConnect();
    const ref = fs.doc(db, 'saves', cloudCode());
    const snap = await fs.getDoc(ref);
    const meta = touchMeta(kv, Date.now());
    let local = readProfile(kv);
    let result: SyncResult = 'pushed';
    if (snap.exists()) {
      const d = snap.data();
      const remote = readRemote(d.data, d.updatedAt?.toMillis?.() ?? 0);
      const dev = deviceState(kv);
      const remoteHash = remote ? profileHash(remote.profile) : '';
      // another device wrote since we last synced (or a merge is still waiting for a restart,
      // while the running game may write its older in-memory stats back)
      if (remote && remoteHash !== meta.hash && (remoteHash !== dev.syncedHash || dev.mergeUntilRestart)) {
        const r = resolveConflict({ profile: local, savedAt: meta.savedAt }, remote);
        if (profileHash(r.profile) !== meta.hash) {
          makeBackup(kv, 'undo', Date.now(), true);
          applyProfile(kv, r.profile, r.savedAt);
          local = readProfile(kv);
          setDeviceState(kv, { mergeUntilRestart: true });
          result = 'merged';
          onMerged?.(r.merged.length);
        }
      }
    }
    const data = cloudData(kv, local);
    if (data.length > 900_000) return 'error';
    await fs.setDoc(ref, { data, updatedAt: fs.serverTimestamp(), v: 1 });
    setDeviceState(kv, { syncedHash: profileHash(local) });
    return result;
  } catch (err) {
    console.warn('Cloud save: push failed', err);
    return 'error';
  }
}

// Pull a profile by code and take it (the caller reloads the page). That profile is the base;
// this device's growing stats are merged in, and the profile replaced goes to the undo slot.
export async function pullSave(code: string): Promise<'ok' | 'notfound' | 'error'> {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 20) return 'notfound';
  const kv = browserKV();
  if (!kv) return 'error';
  try {
    const { db, fs } = await fbConnect();
    const snap = await fs.getDoc(fs.doc(db, 'saves', c));
    if (!snap.exists()) return 'notfound';
    const d = snap.data();
    const remote = readRemote(d.data, d.updatedAt?.toMillis?.() ?? 0);
    if (!remote) return 'error';
    const meta = touchMeta(kv, Date.now());
    const r = resolveConflict({ profile: readProfile(kv), savedAt: meta.savedAt }, remote, 'remote');
    makeBackup(kv, 'undo', Date.now(), true);
    applyProfile(kv, r.profile, r.savedAt || Date.now());
    localStorage.setItem(CODE_KEY, c);
    setDeviceState(kv, { syncedHash: profileHash(remote.profile), mergeUntilRestart: false });
    return 'ok';
  } catch (err) {
    console.warn('Cloud save: pull failed', err);
    return 'error';
  }
}
