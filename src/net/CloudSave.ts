// Cloud save: every 'sws3d.*' localStorage entry (progress, armory, settings, achievements,
// crew …) is mirrored to Firestore under a long random transfer code. Entering that code on
// another device pulls the same profile down. The code is the secret, so it is long (20 chars).

import { fbConnect } from './Leaderboard';

const CODE_KEY = 'sws3d.cloudCode';
const PREFIX = 'sws3d.';
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

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX) && k !== CODE_KEY) out[k] = localStorage.getItem(k) ?? '';
    }
  } catch { /* storage unavailable */ }
  return out;
}

let lastPush = 0;

// Push the local profile (throttled; call at mission end and on settings changes)
export async function pushSave(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastPush < 15000) return false;
  lastPush = now;
  try {
    const { db, fs } = await fbConnect();
    const data = JSON.stringify(snapshot());
    if (data.length > 900_000) return false;
    await fs.setDoc(fs.doc(db, 'saves', cloudCode()), { data, updatedAt: fs.serverTimestamp(), v: 1 });
    return true;
  } catch (err) {
    console.warn('Cloud save: push failed', err);
    return false;
  }
}

// Pull a profile by code and replace the local one (the caller reloads the page)
export async function pullSave(code: string): Promise<'ok' | 'notfound' | 'error'> {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 20) return 'notfound';
  try {
    const { db, fs } = await fbConnect();
    const snap = await fs.getDoc(fs.doc(db, 'saves', c));
    if (!snap.exists()) return 'notfound';
    const data = JSON.parse(String(snap.data().data)) as Record<string, string>;
    for (const k of Object.keys(snapshot())) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(data)) if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
    localStorage.setItem(CODE_KEY, c);
    return 'ok';
  } catch (err) {
    console.warn('Cloud save: pull failed', err);
    return 'error';
  }
}
