export const AA_LEADERBOARD = 'survival-aa';
import { cachedSquadron } from './SquadronProfile';
// Online leaderboard on Firebase (Firestore + anonymous auth). The SDK is loaded on demand
// so the game's first load stays small. The web config below is public by design: access is
// controlled by firestore.rules (validated, rate-limited, append-only entries).

const CONFIG = {
  apiKey: 'AIzaSyCHO600Ran-9oLSXURKJTBtQTmmkn03VjE',
  authDomain: 'sky-war-shooter-3d.firebaseapp.com',
  projectId: 'sky-war-shooter-3d',
  storageBucket: 'sky-war-shooter-3d.firebasestorage.app',
  messagingSenderId: '354810040291',
  appId: '1:354810040291:web:d18635589bae15c2e49ad6',
};

export interface ScoreEntry {
  name: string;
  mode: string;      // 'survival-gunner' | 'survival-pilot' | 'campaign-m1' … | 'daily-gunner-20261011' | 'weekly-gunner-202641'
  score: number;
  kills: number;
  rounds: number;
}

export interface BoardRow extends ScoreEntry { uid: string; mine: boolean }

const NAME_KEY = 'sws3d.pilotName';

export function savedName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
export function saveName(n: string) {
  try { localStorage.setItem(NAME_KEY, cleanName(n)); } catch { /* */ }
}
export function cleanName(n: string) {
  return n.replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 20) || 'Gunner';
}

// Keep both full callsigns, within the co-op-only 43-character rules limit.
export function crewName(host: string, guest: string) { return `${cleanName(host)} + ${cleanName(guest)}`; }
export function cleanScoreName(name: string, mode: string) {
  if (mode !== 'coop-gunner' && mode !== 'coop-pilot') return cleanName(name);
  const [host = '', guest = ''] = name.split(' + ');
  return crewName(host, guest);
}

type Fb = {
  db: import('firebase/firestore').Firestore;
  uid: string;
  fs: typeof import('firebase/firestore');
};
let ready: Promise<Fb> | null = null;

async function connect(): Promise<Fb> {
  const [{ initializeApp }, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(CONFIG);
  const a = auth.getAuth(app);
  const cred = a.currentUser ? { user: a.currentUser } : await auth.signInAnonymously(a);
  return { db: fs.getFirestore(app), uid: cred.user.uid, fs };
}

// shared with CloudSave
export function fbConnect(): Promise<Fb> { return fb(); }

function fb(): Promise<Fb> {
  if (!ready) ready = connect().catch((e) => { ready = null; throw e; });
  return ready;
}

// One entry per call. The rules require the per-player 'limits' document to be stamped in the
// same batch, which enforces at most one submission every 20 s per player.
export async function submitScore(e: ScoreEntry): Promise<boolean> {
  if (!e.mode) return false;   // a mode that never posts (custom battles)
  try {
    const { db, uid, fs } = await fb();
    const cached = cachedSquadron();
    if (cached && !e.mode.startsWith('coop-')) {
      const { squadronProfile } = await import('./Squadrons');
      const profile = await squadronProfile();
      if (profile) e = { ...e, name: profile.callsign };
      if (profile?.code) {
        const scoreRef = fs.doc(fs.collection(db, 'scores'));
        const bestRef = fs.doc(db, 'squadrons', profile.code, 'bests', `${uid}_${e.mode}`);
        await fs.runTransaction(db, async t => {
          const [best, squad] = await Promise.all([t.get(bestRef), t.get(fs.doc(db, 'squadrons', profile.code))]);
          const data = {
            uid, name: profile.callsign, mode: e.mode, squadron: squad.data()!.boardId,
            score: Math.max(0, Math.round(e.score)), kills: Math.max(0, Math.round(e.kills)), rounds: Math.max(0, Math.round(e.rounds)),
            createdAt: fs.serverTimestamp(), v: 1,
          };
          t.set(fs.doc(db, 'limits', uid), { last: fs.serverTimestamp() });
          t.set(scoreRef, data);
          if (!best.exists() || data.score > best.data().score) t.set(bestRef, { ...data, scoreId: scoreRef.id });
        });
        return true;
      }
    }
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(db, 'limits', uid), { last: fs.serverTimestamp() });
    batch.set(fs.doc(fs.collection(db, 'scores')), {
      uid, name: cleanScoreName(e.name, e.mode), mode: e.mode,
      score: Math.max(0, Math.round(e.score)), kills: Math.max(0, Math.round(e.kills)), rounds: Math.max(0, Math.round(e.rounds)),
      createdAt: fs.serverTimestamp(), v: 1,
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.warn('Leaderboard: submit failed', err);
    return false;
  }
}

export async function topScores(mode: string, n = 10): Promise<BoardRow[]> {
  try {
    const { db, uid, fs } = await fb();
    const q = fs.query(fs.collection(db, 'scores'), fs.where('mode', '==', mode), fs.orderBy('score', 'desc'), fs.limit(n));
    const snap = await fs.getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data() as any;
      return { name: String(x.name), mode: String(x.mode), score: Number(x.score), kills: Number(x.kills), rounds: Number(x.rounds), uid: String(x.uid), mine: x.uid === uid };
    });
  } catch (err) {
    console.warn('Leaderboard: read failed', err);
    return [];
  }
}

export function dailyMode(role: 'gunner' | 'pilot', d = new Date()) {
  const s = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `daily-${role}-${s}`;
}
