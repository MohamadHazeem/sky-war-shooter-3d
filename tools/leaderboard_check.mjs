// Live check of the leaderboard security rules against the real Firestore project.
// node tools/leaderboard_check.mjs  — writes one test entry (mode survival-gunner, name "rules-test").
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, writeBatch, doc, collection, serverTimestamp, setDoc, getDocs, query, where, orderBy, limit, updateDoc } from 'firebase/firestore';
const app = initializeApp({ apiKey: 'AIzaSyCHO600Ran-9oLSXURKJTBtQTmmkn03VjE', authDomain: 'sky-war-shooter-3d.firebaseapp.com', projectId: 'sky-war-shooter-3d', appId: '1:354810040291:web:d18635589bae15c2e49ad6' });
const { user } = await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const entry = (o = {}) => ({ uid: user.uid, name: 'rules-test', mode: 'survival-gunner', score: 1200, kills: 5, rounds: 1, createdAt: serverTimestamp(), v: 1, ...o });
const submit = async (o) => { const b = writeBatch(db); b.set(doc(db, 'limits', user.uid), { last: serverTimestamp() }); const ref = doc(collection(db, 'scores')); b.set(ref, entry(o)); await b.commit(); return ref; };
const expect = async (label, fn, ok) => { try { await fn(); console.log((ok ? 'PASS ' : 'FAIL ') + label + ' (allowed)'); } catch (e) { console.log((ok ? 'FAIL ' : 'PASS ') + label + ' (denied: ' + e.code + ')'); } };
let ref;
await expect('valid entry', async () => { ref = await submit(); }, true);
await expect('second entry within 20 s (spam)', () => submit(), false);
await expect('entry without limits stamp', () => setDoc(doc(collection(db, 'scores')), entry()), false);
await expect('edit an existing entry', () => updateDoc(ref, { score: 999999 }), false);
await new Promise((r) => setTimeout(r, 21000));
await expect('implausible score (1M for 2 kills)', () => submit({ score: 1000000, kills: 2 }), false);
await new Promise((r) => setTimeout(r, 21000));
await expect('bad mode string', () => submit({ mode: 'hacked' }), false);
await expect('read top 10', async () => { const s = await getDocs(query(collection(db, 'scores'), where('mode', '==', 'survival-gunner'), orderBy('score', 'desc'), limit(10))); console.log('   rows:', s.size); }, true);
process.exit(0);
