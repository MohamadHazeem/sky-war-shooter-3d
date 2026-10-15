import { fbConnect, type BoardRow } from './Leaderboard';
import { cacheSquadron, cachedSquadron, normalizeSquadronCode, safeSquadronName, squadronCode, validCallsign, type SquadronProfile } from './SquadronProfile';
import { visibleRows } from '../game/Seasons';

export interface Squadron { name: string; memberCount: number; boardId: string }
export interface SquadronMember { uid: string; callsign: string }
export interface SquadronActivity { name: string; kind: 'joined' | 'experte'; createdAt: number }
export class SquadronError extends Error {}

export async function squadronProfile(): Promise<SquadronProfile | null> {
  const { db, uid, fs } = await fbConnect();
  const snap = await fs.getDoc(fs.doc(db, 'squadronProfiles', uid));
  const p = snap.exists() ? snap.data() as SquadronProfile : null;
  // Keep an imported callsign as a form suggestion until the new identity registers.
  if (p) cacheSquadron(p);
  else if (cachedSquadron()) cacheSquadron({ callsign: cachedSquadron()!.callsign, code: '' });
  return p;
}
export async function registerCallsign(callsign: string): Promise<SquadronProfile> {
  if (!validCallsign(callsign)) throw new SquadronError('Use a clean callsign of 2–16 letters or numbers.');
  const { db, uid, fs } = await fbConnect();
  const ref = fs.doc(db, 'squadronProfiles', uid);
  const profile = await fs.runTransaction(db, async t => {
    const old = await t.get(ref);
    if (old.exists()) return old.data() as SquadronProfile;
    const p = { callsign, code: '' };
    t.set(ref, p);
    return p;
  });
  cacheSquadron(profile);
  return profile;
}

export async function joinSquadron(input: string, name?: string): Promise<SquadronProfile> {
  const code = normalizeSquadronCode(input);
  if (!code) throw new SquadronError('Enter a valid six-character squadron code.');
  if (name !== undefined && !safeSquadronName(name)) throw new SquadronError('Choose a squadron name from the approved words.');
  const { db, uid, fs } = await fbConnect();
  const profile = await fs.runTransaction(db, async t => {
    const profileRef = fs.doc(db, 'squadronProfiles', uid), squadRef = fs.doc(db, 'squadrons', code);
    const [p, s] = await Promise.all([t.get(profileRef), t.get(squadRef)]);
    if (!p.exists()) throw new SquadronError('Set your callsign first.');
    const old = p.data() as SquadronProfile;
    if (old.code) throw new SquadronError('Leave your current squadron first.');
    if (name !== undefined && s.exists()) throw new SquadronError('That code is already in use. Try again.');
    if (name === undefined && !s.exists()) throw new SquadronError('No squadron with that code.');
    if (s.exists() && s.data().memberCount >= 64) throw new SquadronError('This squadron is full (64 members).');
    if (name !== undefined) t.set(squadRef, { name, boardId: crypto.randomUUID().replace(/-/g, ''), memberCount: 1, createdAt: fs.serverTimestamp() });
    else t.update(squadRef, { memberCount: s.data()!.memberCount + 1 });
    t.set(fs.doc(db, 'squadrons', code, 'members', uid), { callsign: old.callsign, joinedAt: fs.serverTimestamp() });
    const next = { callsign: old.callsign, code };
    t.set(profileRef, next);
    t.set(fs.doc(db, 'squadrons', code, 'activity', uid), { name: old.callsign, kind: 'joined', createdAt: fs.serverTimestamp() });
    return next;
  });
  cacheSquadron(profile);
  return profile;
}
export async function createSquadron(name: string): Promise<SquadronProfile> {
  for (let attempt = 0; ; attempt++) {
    try { return await joinSquadron(squadronCode(), name); }
    catch (e) {
      if (!(e instanceof SquadronError) || e.message !== 'That code is already in use. Try again.' || attempt >= 3) throw e;
    }
  }
}
export async function leaveSquadron(): Promise<void> {
  const { db, uid, fs } = await fbConnect();
  const profile = await fs.runTransaction(db, async t => {
    const ref = fs.doc(db, 'squadronProfiles', uid), p = await t.get(ref);
    if (!p.exists()) return null;
    const old = p.data() as SquadronProfile;
    if (!old.code) return old;
    const squadRef = fs.doc(db, 'squadrons', old.code), s = await t.get(squadRef);
    t.delete(fs.doc(db, 'squadrons', old.code, 'members', uid));
    t.update(squadRef, { memberCount: s.data()!.memberCount - 1 });
    const next = { callsign: old.callsign, code: '' };
    t.set(ref, next);
    return next;
  });
  cacheSquadron(profile);
}
export async function squadronInfo(code: string): Promise<{ squadron: Squadron; members: SquadronMember[]; activity: SquadronActivity[] }> {
  const { db, fs } = await fbConnect();
  const [s, m, a] = await Promise.all([
    fs.getDoc(fs.doc(db, 'squadrons', code)),
    fs.getDocs(fs.query(fs.collection(db, 'squadrons', code, 'members'), fs.limit(64))),
    fs.getDocs(fs.query(fs.collection(db, 'squadrons', code, 'activity'), fs.orderBy('createdAt', 'desc'), fs.limit(20))),
  ]);
  return { squadron: s.data() as Squadron, members: m.docs.map(d => ({ uid: d.id, callsign: d.data().callsign })),
    activity: a.docs.map(d => ({ name: d.data().name, kind: d.data().kind, createdAt: d.data().createdAt?.toMillis() ?? 0 })) };
}
export async function squadronScores(code: string, mode: string): Promise<BoardRow[]> {
  const { db, uid, fs } = await fbConnect();
  // Read exactly the active members' bests: former members cannot crowd out the top 64.
  const members = await fs.getDocs(fs.query(fs.collection(db, 'squadrons', code, 'members'), fs.limit(64)));
  const bests = await Promise.all(members.docs.map(m => fs.getDoc(fs.doc(db, 'squadrons', code, 'bests', `${m.id}_${mode}`))));
  return visibleRows(bests.filter(d => d.exists()).map(d => ({ ...d.data(), mine: d.data()!.uid === uid }) as BoardRow))
    .sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));
}
export async function recordSquadronExperte(): Promise<void> {
  if (!cachedSquadron()?.code) return;
  try {
    const { db, uid, fs } = await fbConnect(), p = await squadronProfile();
    if (!p?.code) return;
    // One latest event per member, bounded storage and server-enforced 20 s cooldown.
    await fs.setDoc(fs.doc(db, 'squadrons', p.code, 'activity', uid), { name: p.callsign, kind: 'experte', createdAt: fs.serverTimestamp() });
  } catch (e) { console.warn('Squadron: activity unavailable', e); }
}
