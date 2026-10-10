// Live check of the anonymous-stats security rules (firestore.rules, analytics_*) against the
// real Firestore project. node tools/analytics_rules_check.mjs — writes one valid test summary
// (mission "rules-test", dev: true, so tools/analytics_report.mjs --prod leaves it out).
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, writeBatch, doc, collection, serverTimestamp, setDoc, getDocs, getDoc, updateDoc, limit, query } from 'firebase/firestore';

const app = initializeApp({ apiKey: 'AIzaSyCHO600Ran-9oLSXURKJTBtQTmmkn03VjE', authDomain: 'sky-war-shooter-3d.firebaseapp.com', projectId: 'sky-war-shooter-3d', appId: '1:354810040291:web:d18635589bae15c2e49ad6' });
const { user } = await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const event = (o = {}) => ({
  v: 1, event: 'mission', createdAt: serverTimestamp(), mission: 'rules-test', mode: 'other', role: 'gunner', outcome: 'success', success: true,
  duration: 300, kills: 12, accuracy: 0.41, bombersLost: 1, rounds: 2, shots: 900, deaths: 0, score: 9000,
  seatSwitches: 3, seats: { waistL: 200, top: 100 }, abilities: { focus: 1 }, perks: 'hawkeye,ap',
  settings: { quality: 'high', aimAssist: 'high', difficulty: 'veteran', flightMode: 'mouseAim', language: 'en', touch: false, gamepad: false },
  device: { screen: 'desktop', touch: false, dpr: 2 }, fpsAvg: 60, fpsP10: 55, fpsBucket: '58+', dev: true, ...o,
});
const submit = async (o, stamp = true) => {
  const b = writeBatch(db);
  if (stamp) b.set(doc(db, 'analytics_limits', user.uid), { last: serverTimestamp() });
  const ref = doc(collection(db, 'analytics_events'));
  b.set(ref, event(o));
  await b.commit();
  return ref;
};
const expect = async (label, fn, ok) => { try { await fn(); console.log((ok ? 'PASS ' : 'FAIL ') + label + ' (allowed)'); } catch (e) { console.log((ok ? 'FAIL ' : 'PASS ') + label + ' (denied: ' + e.code + ')'); } };
const wait = () => new Promise((r) => setTimeout(r, 11000));
let ref;
await expect('valid mission summary', async () => { ref = await submit(); }, true);
await expect('second summary within 10 s (spam)', () => submit(), false);
await expect('summary without the rate-limit stamp', () => setDoc(doc(collection(db, 'analytics_events')), event()), false);
await expect('read a summary', () => getDoc(ref), false);
await expect('list summaries', () => getDocs(query(collection(db, 'analytics_events'), limit(1))), false);
await expect('edit a summary', () => updateDoc(ref, { kills: 999 }), false);
await wait();
await expect('personal data field (uid)', () => submit({ uid: user.uid }), false);
await wait();
await expect('free text in perks', () => submit({ perks: 'Hello, my name is Bob!' }), false);
await wait();
await expect('unknown seat key', () => submit({ seats: { cockpit: 5 } }), false);
await wait();
await expect('oversized kills', () => submit({ kills: 99999 }), false);
process.exit(0);
