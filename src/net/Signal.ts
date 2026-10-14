// WebRTC signalling for online co-op, over Firestore (rules: firestore.rules, match /coop_rooms).
//
//   coop_rooms/{CODE}            { host, offer, createdAt, expiresAt, v }  + { guest, answer } once joined
//   coop_rooms/{CODE}/hostIce/*  host ICE candidates   { c, mid, idx, expiresAt }
//   coop_rooms/{CODE}/guestIce/* guest ICE candidates  (same shape)
//
// The host creates the room under a fresh 6-character code and trickles its candidates; the
// guest reads the offer, writes its answer (claiming the one guest slot) and trickles its own.
// Rooms are readable/writable for 2 hours only (rules). Pilot rooms close after connection;
// B-17 rooms retain three adjacent-code documents for late join, replacing a departed slot.
// The host deletes all three rooms and their candidates on leave. `expiresAt` is there for a Firestore TTL policy to purge
// abandoned rooms (TTL needs billing on the project, so it is not configured yet).
import { fbConnect } from './Leaderboard';

// No 0/O, 1/I: codes are read out loud and typed by hand
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 6;
export const ROOM_TTL_MS = 2 * 3600 * 1000;

export function makeCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return s;
}

// User-typed code -> canonical code, or null (forgives case, spaces and dashes)
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export interface Signalling {
  code: string;
  // stop listening (both sides); the host also deletes the room and its candidates
  close(): Promise<void>;
}

type Fs = typeof import('firebase/firestore');

function candidateDoc(c: RTCIceCandidate, fs: Fs) {
  return {
    c: c.candidate.slice(0, 1000), mid: (c.sdpMid ?? '').slice(0, 32), idx: c.sdpMLineIndex ?? 0,
    expiresAt: fs.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
  };
}

function toCandidate(d: any): RTCIceCandidateInit | null {
  if (!d || typeof d.c !== 'string' || !d.c) return null;
  return { candidate: d.c, sdpMid: d.mid || null, sdpMLineIndex: typeof d.idx === 'number' ? d.idx : 0 };
}

// Host: create the room (retrying on a code clash) and wait for the answer in the background.
export async function hostSignal(pc: RTCPeerConnection, onError: (e: unknown) => void, fixedCode?: string): Promise<Signalling> {
  const { db, uid, fs } = await fbConnect();
  const unsubs: (() => void)[] = [];
  let code = '';
  let ready = false;
  const early: RTCIceCandidate[] = [];
  const put = (c: RTCIceCandidate) => { fs.addDoc(fs.collection(db, 'coop_rooms', code, 'hostIce'), candidateDoc(c, fs)).catch((e) => console.warn('Co-op: ICE write failed', e)); };
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate || !e.candidate.candidate) return;
    if (ready) put(e.candidate); else early.push(e.candidate);
  });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  for (let attempt = 0; ; attempt++) {
    code = fixedCode ?? makeCode();
    try {
      // an existing code makes this an update, which the rules refuse: try another code
      await fs.setDoc(fs.doc(db, 'coop_rooms', code), {
        host: uid, offer: { type: 'offer', sdp: offer.sdp ?? '' },
        createdAt: fs.serverTimestamp(), expiresAt: fs.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS), v: 1,
      });
      break;
    } catch (e) {
      if (fixedCode || attempt >= 3) throw e;
    }
  }
  ready = true;
  early.splice(0).forEach(put);
  const room = fs.doc(db, 'coop_rooms', code);
  let answered = false;
  unsubs.push(fs.onSnapshot(room, async (snap) => {
    const d = snap.data() as any;
    if (answered || !d?.answer?.sdp) return;
    answered = true;
    try {
      await pc.setRemoteDescription({ type: 'answer', sdp: d.answer.sdp });
      unsubs.push(fs.onSnapshot(fs.collection(db, 'coop_rooms', code, 'guestIce'), (qs) => {
        for (const ch of qs.docChanges()) {
          const c = ch.type === 'added' ? toCandidate(ch.doc.data()) : null;
          if (c) pc.addIceCandidate(c).catch((e) => console.warn('Co-op: bad guest candidate', e));
        }
      }, onError));
    } catch (e) { onError(e); }
  }, onError));
  let closed = false;
  return {
    code,
    async close() {
      if (closed) return;
      closed = true;
      unsubs.splice(0).forEach((u) => u());
      // best effort: candidates first (their rules look the room up), then the room
      try {
        for (const sub of ['hostIce', 'guestIce']) {
          const qs = await fs.getDocs(fs.collection(db, 'coop_rooms', code, sub));
          await Promise.all(qs.docs.map((d) => fs.deleteDoc(d.ref)));
        }
        await fs.deleteDoc(room);
      } catch (e) { console.warn('Co-op: room cleanup failed (the room expires in 2 h)', e); }
    },
  };
}

export class RoomError extends Error {
  constructor(message: string, readonly host?: string) { super(message); }
}

// Guest: read the offer, answer it and trade candidates.
export async function joinSignal(pc: RTCPeerConnection, code: string, onError: (e: unknown) => void, expectedHost?: string): Promise<Signalling> {
  const { db, uid, fs } = await fbConnect();
  const room = fs.doc(db, 'coop_rooms', code);
  let snap;
  try { snap = await fs.getDoc(room); } catch { throw new RoomError('That room has expired or does not exist.'); }
  const d = snap.data() as any;
  if (!snap.exists() || !d?.offer?.sdp) throw new RoomError('No game with that code. Check it and try again.');
  if (expectedHost && d.host !== expectedHost) throw new RoomError('No game with that code. Check it and try again.');
  if (d.guest) throw new RoomError('That crew slot is occupied.', d.host);
  const unsubs: (() => void)[] = [];
  let ready = false;
  const early: RTCIceCandidate[] = [];
  const put = (c: RTCIceCandidate) => { fs.addDoc(fs.collection(db, 'coop_rooms', code, 'guestIce'), candidateDoc(c, fs)).catch((e) => console.warn('Co-op: ICE write failed', e)); };
  pc.addEventListener('icecandidate', (e) => {
    if (!e.candidate || !e.candidate.candidate) return;
    if (ready) put(e.candidate); else early.push(e.candidate);
  });
  await pc.setRemoteDescription({ type: 'offer', sdp: d.offer.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  try {
    await fs.updateDoc(room, { guest: uid, answer: { type: 'answer', sdp: answer.sdp ?? '' } });
  } catch {
    throw new RoomError('Could not join that game (it may have just been taken or expired).', d.host);
  }
  ready = true;
  early.splice(0).forEach(put);
  unsubs.push(fs.onSnapshot(fs.collection(db, 'coop_rooms', code, 'hostIce'), (qs) => {
    for (const ch of qs.docChanges()) {
      const c = ch.type === 'added' ? toCandidate(ch.doc.data()) : null;
      if (c) pc.addIceCandidate(c).catch((e) => console.warn('Co-op: bad host candidate', e));
    }
  }, onError));
  let closed = false;
  return {
    code,
    async close() { if (closed) return; closed = true; unsubs.splice(0).forEach((u) => u()); },
  };
}
