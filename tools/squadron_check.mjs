// Live rules regression; DOES NOT deploy. Run after rules/indexes have been deployed separately:
// node tools/squadron_check.mjs
// Optional local emulators: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
// Creates isolated test data and removes it in finally using the existing Firebase CLI login.
// No rules are relaxed for cleanup. Any unexpected result or cleanup failure exits 1.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator, deleteUser } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const cache = resolve(homedir(), '.npm/_npx');
const lib = process.env.FIREBASE_TOOLS_LIB ?? (existsSync(cache) ? readdirSync(cache).map(p => resolve(cache, p, 'node_modules/firebase-tools/lib')).find(p => existsSync(resolve(p, 'auth.js'))) : undefined);
if (!lib && !process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Set FIREBASE_TOOLS_LIB to an installed Firebase CLI lib directory for test cleanup.');
let admin;
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const cli = name => require(resolve(lib, name)), options = { project: 'sky-war-shooter-3d' };
  cli('auth').setActiveAccount(options, cli('auth').getGlobalDefaultAccount());
  await cli('requireAuth').requireAuth(options);
  admin = new (cli('apiv2').Client)({ urlPrefix: cli('api').firestoreOrigin(), apiVersion: 'v1' });
}
const documents = 'projects/sky-war-shooter-3d/databases/(default)/documents';
const paths = new Set();
async function cleanup() {
  const writes = [...paths].map(p => ({ delete: `${documents}/${p}` }));
  if (admin) {
    await admin.post(`/${documents}:commit`, { writes });
    for (const p of paths) {
      try { await admin.get(`/${documents}/${p}`); throw new Error(`Test document remains: ${p}`); }
      catch (e) { if (e.status !== 404) throw e; }
    }
  } else {
    const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/${documents}`;
    const r = await fetch(`${base}:commit`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) });
    if (!r.ok) throw new Error(`Cleanup failed: ${r.status}`);
  }
  console.log(`CLEAN ${paths.size} test document paths removed`);
}
const config = { apiKey: 'AIzaSyCHO600Ran-9oLSXURKJTBtQTmmkn03VjE', projectId: 'sky-war-shooter-3d', appId: '1:354810040291:web:d18635589bae15c2e49ad6' };
const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const boardId = randomUUID().replace(/-/g, '');
fs.setLogLevel('silent'); // Expected permission denials are reported by check().
const clients = [];
const weekly = 'weekly-gunner-202641'; // Fixed valid ISO week keeps the regression reproducible.
let passed = 0;
async function check(label, action, allowed = true) {
  try { await action(); if (!allowed) throw new Error('unexpectedly allowed'); }
  catch (e) { if (allowed || e.code !== 'permission-denied') throw new Error(`${label}: ${e.code ?? e.message}`); }
  console.log(`PASS ${label}`); passed++;
}
async function client(name) {
  const app = initializeApp(config, name), auth = getAuth(app), db = fs.getFirestore(app);
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  if (process.env.FIRESTORE_EMULATOR_HOST) { const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'); fs.connectFirestoreEmulator(db, host, +port); }
  const { user } = await signInAnonymously(auth);
  paths.add(`squadronProfiles/${user.uid}`); paths.add(`limits/${user.uid}`);
  const c = { app, db, user, uid: user.uid, name, ref: (...p) => fs.doc(db, ...p) }; clients.push(c); return c;
}
const profile = c => c.ref('squadronProfiles', c.uid);
const squad = c => c.ref('squadrons', code);
const member = c => c.ref('squadrons', code, 'members', c.uid);
async function join(c, create = false, changes = {}) {
  await fs.runTransaction(c.db, async t => {
    const s = await t.get(squad(c));
    if (create) t.set(squad(c), { name: 'Silver Falcons', boardId, createdAt: fs.serverTimestamp(), memberCount: 1, ...changes });
    else t.update(squad(c), { memberCount: s.data().memberCount + 1 });
    t.update(profile(c), { code });
    t.set(member(c), { callsign: c.name, joinedAt: fs.serverTimestamp() });
    t.set(c.ref('squadrons', code, 'activity', c.uid), { name: c.name, kind: 'joined', createdAt: fs.serverTimestamp() });
  });
}
async function leave(c) {
  await fs.runTransaction(c.db, async t => {
    const p = await t.get(profile(c)); if (!p.exists() || !p.data().code) return;
    const s = await t.get(squad(c));
    t.update(profile(c), { code: '' }); t.delete(member(c)); t.update(squad(c), { memberCount: s.data().memberCount - 1 });
  });
}
async function submit(c, changes = {}, best = true) {
  const ref = fs.doc(fs.collection(c.db, 'scores'));
  const data = { uid: c.uid, name: c.name, mode: 'survival-gunner', squadron: boardId, score: 1200, kills: 5, rounds: 1, createdAt: fs.serverTimestamp(), v: 1, ...changes };
  const b = fs.writeBatch(c.db); b.set(c.ref('limits', c.uid), { last: fs.serverTimestamp() }); b.set(ref, data);
  if (best) b.set(c.ref('squadrons', code, 'bests', `${c.uid}_${data.mode}`), { ...data, scoreId: ref.id });
  paths.add(ref.path); paths.add(`squadrons/${code}/bests/${c.uid}_${data.mode}`);
  await b.commit(); return ref;
}
try {
  const a = await client('Rules Pilot A'), b = await client('Rules Pilot B');
  if ((await fs.getDoc(squad(a))).exists()) throw new Error('Random squadron code collision; rerun.');
  paths.add(`squadrons/${code}`);
  for (const c of clients) for (const p of [`squadronProfiles/${c.uid}`, `limits/${c.uid}`, `squadrons/${code}/members/${c.uid}`, `squadrons/${code}/activity/${c.uid}`]) paths.add(p);
  console.log(`Test squadron ${code}; users ${clients.map(c => c.uid).join(', ')}`);
  await check('register immutable callsigns', () => Promise.all(clients.map(c => fs.setDoc(profile(c), { callsign: c.name, code: '' }))));
  await check('reject callsign change', () => fs.updateDoc(profile(a), { callsign: 'Renamed' }), false);
  await check('reject extra profile fields', () => fs.updateDoc(profile(a), { admin: true }), false);
  await check('reject squadron creation without atomic membership', () => fs.setDoc(squad(a), { name: 'Silver Falcons', boardId, createdAt: fs.serverTimestamp(), memberCount: 1 }), false);
  await check('reject client timestamp in atomic create', () => join(a, true, { createdAt: fs.Timestamp.fromMillis(0) }), false);
  await check('reject string member count in atomic create', () => join(a, true, { memberCount: '1' }), false);
  await check('reject invitation code as public board id', () => join(a, true, { boardId: code }), false);
  await check('create squadron with atomic membership/count', () => join(a, true));
  await check('outsider cannot read private roster', () => fs.getDocs(fs.collection(b.db, 'squadrons', code, 'members')), false);
  await check('outsider cannot read activity', () => fs.getDocs(fs.collection(b.db, 'squadrons', code, 'activity')), false);
  await check('outsider cannot list squads', () => fs.getDocs(fs.collection(b.db, 'squadrons')), false);
  await check('outsider cannot forge squadron score', () => submit(b), false);
  await check('join second anonymous user', () => join(b));
  await check('reject activity spam after join', () => fs.setDoc(b.ref('squadrons', code, 'activity', b.uid), { name: b.name, kind: 'experte', createdAt: fs.serverTimestamp() }), false);

  await check('atomic count is two', async () => { if ((await fs.getDoc(squad(a))).data().memberCount !== 2) throw new Error('wrong member count'); });
  await check('members see both pilots', async () => { const s = await fs.getDocs(fs.collection(a.db, 'squadrons', code, 'members')); if (s.size !== 2) throw new Error('expected two members'); });
  await check('members read ordered join activity', async () => {
    const s = await fs.getDocs(fs.query(fs.collection(a.db, 'squadrons', code, 'activity'), fs.orderBy('createdAt', 'desc'), fs.limit(20)));
    if (s.size !== 2 || s.docs.some(d => d.data().kind !== 'joined' || !(d.data().createdAt instanceof fs.Timestamp))) throw new Error('wrong join activity');
  });
  await check('reject forged member count', () => fs.updateDoc(squad(a), { memberCount: 10 }), false);
  await check('reject unsafe squadron rename', () => fs.updateDoc(squad(a), { name: 'unsafe' }), false);
  await check('reject deleting another member', () => fs.deleteDoc(b.ref('squadrons', code, 'members', a.uid)), false);
  await check('reject non-atomic leave', () => fs.deleteDoc(member(b)), false);
  await check('reject impersonated score name', () => submit(a, { name: b.name }), false);
  await check('reject invalid mode', () => submit(a, { mode: 'invalid' }), false);
  await check('reject implausible score', () => submit(a, { score: 5000000 }), false);
  await check('submit A score and linked best atomically', () => submit(a));
  await check('submit B score and linked best atomically', () => submit(b, { score: 2400 }));
  await check('reject rate-limit bypass', () => submit(a, { score: 1300 }), false);
  await check('read ordered squadron index', async () => {
    const s = await fs.getDocs(fs.query(fs.collection(a.db, 'squadrons', code, 'bests'), fs.where('mode', '==', 'survival-gunner'), fs.orderBy('score', 'desc'), fs.limit(64)));
    if (s.size !== 2 || s.docs[0].data().uid !== b.uid) throw new Error('wrong standings');
  });
  await check('read public squadron score index', async () => {
    const s = await fs.getDocs(fs.query(fs.collection(a.db, 'scores'), fs.where('squadron', '==', boardId), fs.where('mode', '==', 'survival-gunner'), fs.orderBy('score', 'desc'), fs.limit(10)));
    if (s.size !== 2 || s.docs[0].data().uid !== b.uid) throw new Error('wrong public standings');
  });
  await check('reject arbitrary personal best', () => fs.updateDoc(a.ref('squadrons', code, 'bests', `${a.uid}_survival-gunner`), { score: 5000, createdAt: fs.serverTimestamp() }), false);
  console.log('Waiting 21 seconds for the real score/activity cooldowns');
  await delay(21000);
  await check('submit A weekly score', () => submit(a, { mode: weekly, score: 1800 }));
  await check('submit B weekly score', () => submit(b, { mode: weekly, score: 3000 }));
  await check('read weekly bests as the client does', async () => {
    const roster = await fs.getDocs(fs.query(fs.collection(a.db, 'squadrons', code, 'members'), fs.limit(64)));
    const rows = await Promise.all(roster.docs.map(d => fs.getDoc(a.ref('squadrons', code, 'bests', `${d.id}_${weekly}`))));
    if (rows.length !== 2 || rows.some(d => !d.exists()) || rows.reduce((n, d) => n + d.data().score, 0) !== 4800) throw new Error('wrong weekly standings');
  });
  await check('record Experte activity after cooldown', () => fs.setDoc(a.ref('squadrons', code, 'activity', a.uid), { name: a.name, kind: 'experte', createdAt: fs.serverTimestamp() }));
  await check('second pilot reads Experte activity', async () => {
    const rows = await fs.getDocs(fs.query(fs.collection(b.db, 'squadrons', code, 'activity'), fs.orderBy('createdAt', 'desc'), fs.limit(20)));
    if (rows.docs[0].data().kind !== 'experte' || rows.docs[0].data().name !== a.name) throw new Error('wrong activity');
  });
  await check('reject repeated Experte activity', () => fs.setDoc(a.ref('squadrons', code, 'activity', a.uid), { name: a.name, kind: 'experte', createdAt: fs.serverTimestamp() }), false);
  await check('atomic leave', () => leave(b));
  await check('former member loses board access', () => fs.getDocs(fs.collection(b.db, 'squadrons', code, 'bests')), false);
  await check('former member cannot submit squadron score', () => submit(b), false);
  await check('atomic count after leave is one', async () => { if ((await fs.getDoc(squad(a))).data().memberCount !== 1) throw new Error('wrong member count'); });
  await check('rejoin preserves callsign', () => join(b));
  console.log('Waiting 21 seconds for the real co-op score cooldown');
  await delay(21000);
  await check('submit coop-gunner squadron score', () => submit(a, { mode: 'coop-gunner' }));
  await check('preserve 43-character global co-op crew name', async () => {
    const ref = fs.doc(fs.collection(b.db, 'scores')); paths.add(ref.path);
    const batch = fs.writeBatch(b.db);
    batch.set(b.ref('limits', b.uid), { last: fs.serverTimestamp() });
    batch.set(ref, { uid: b.uid, name: 'A'.repeat(20) + ' + ' + 'B'.repeat(20), mode: 'coop-gunner', score: 1200, kills: 5, rounds: 1, createdAt: fs.serverTimestamp(), v: 1 });
    await batch.commit();
  });
  await check('both pilots leave atomically', async () => { await leave(b); await leave(a); });
  await check('empty squadron count is zero', async () => { if ((await fs.getDoc(squad(a))).data().memberCount !== 0) throw new Error('wrong final count'); });
} catch (e) { console.error(`FAIL ${e.message}`); process.exitCode = 1; }
finally {
  for (const c of clients) {
    try { await leave(c); } catch (e) { console.error(`Cleanup unavailable: ${e.code ?? e.message}`); process.exitCode = 1; }
    await fs.terminate(c.db);
    try { await deleteUser(c.user); } catch (e) { console.error(`FAIL auth cleanup: ${e.message}`); process.exitCode = 1; }
    await deleteApp(c.app);
  }
  try { await cleanup(); } catch (e) { console.error(`FAIL cleanup: ${e.message}`); process.exitCode = 1; }
  console.log(`${passed} checks passed`);
}
