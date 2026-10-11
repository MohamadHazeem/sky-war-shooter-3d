// Live rules regression; DOES NOT deploy. Run after rules/indexes have been deployed separately:
// node tools/squadron_check.mjs
// Optional local emulators: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
// Creates two anonymous users and a test squadron. Scores and immutable profiles remain;
// both users leave in finally. Any unexpected denial, network error or allowed attack exits 1.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import * as fs from 'firebase/firestore';
import { randomInt, randomUUID } from 'node:crypto';
const config = { apiKey: 'AIzaSyCHO600Ran-9oLSXURKJTBtQTmmkn03VjE', projectId: 'sky-war-shooter-3d', appId: '1:354810040291:web:d18635589bae15c2e49ad6' };
const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
const boardId = randomUUID().replace(/-/g, '');
const clients = [];
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
  const c = { app, db, uid: user.uid, name, ref: (...p) => fs.doc(db, ...p) }; clients.push(c); return c;
}
const profile = c => c.ref('squadronProfiles', c.uid);
const squad = c => c.ref('squadrons', code);
const member = c => c.ref('squadrons', code, 'members', c.uid);
async function join(c, create = false) {
  await fs.runTransaction(c.db, async t => {
    const s = await t.get(squad(c));
    if (create) t.set(squad(c), { name: 'Silver Falcons', boardId, createdAt: fs.serverTimestamp(), memberCount: 1 });
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
  await b.commit(); return ref;
}
try {
  const a = await client('Rules Pilot A'), b = await client('Rules Pilot B');
  await check('register immutable callsigns', () => Promise.all(clients.map(c => fs.setDoc(profile(c), { callsign: c.name, code: '' }))));
  await check('reject callsign change', () => fs.updateDoc(profile(a), { callsign: 'Renamed' }), false);
  await check('reject extra profile fields', () => fs.updateDoc(profile(a), { admin: true }), false);
  await check('reject squadron creation without atomic membership', () => fs.setDoc(squad(a), { name: 'Silver Falcons', boardId, createdAt: fs.serverTimestamp(), memberCount: 1 }), false);
  await check('create squadron with atomic membership/count', () => join(a, true));
  await check('outsider cannot read private roster', () => fs.getDocs(fs.collection(b.db, 'squadrons', code, 'members')), false);
  await check('outsider cannot list squads', () => fs.getDocs(fs.collection(b.db, 'squadrons')), false);
  await check('outsider cannot forge squadron score', () => submit(b), false);
  await check('join second anonymous user', () => join(b));
  await check('members see both pilots', async () => { const s = await fs.getDocs(fs.collection(a.db, 'squadrons', code, 'members')); if (s.size !== 2) throw new Error('expected two members'); });
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
  await check('reject arbitrary personal best', () => fs.updateDoc(a.ref('squadrons', code, 'bests', `${a.uid}_survival-gunner`), { score: 5000, createdAt: fs.serverTimestamp() }), false);
  await check('reject activity spam after join', () => fs.setDoc(a.ref('squadrons', code, 'activity', a.uid), { name: a.name, kind: 'experte', createdAt: fs.serverTimestamp() }), false);
  await check('atomic leave', () => leave(b));
  await check('former member loses board access', () => fs.getDocs(fs.collection(b.db, 'squadrons', code, 'bests')), false);
  await check('former member cannot submit squadron score', () => submit(b), false);
  await check('rejoin preserves callsign', () => join(b));
} catch (e) { console.error(`FAIL ${e.message}`); process.exitCode = 1; }
finally {
  for (const c of clients) {
    try { await leave(c); } catch (e) { console.error(`Cleanup unavailable: ${e.code ?? e.message}`); }
    await fs.terminate(c.db); await deleteApp(c.app);
  }
  console.log(`${passed} checks passed`);
}
