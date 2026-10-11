import { beforeEach, expect, it, vi } from 'vitest';
import { stubStorage } from './helpers';
import { cacheSquadron, cachedSquadron } from '../src/net/SquadronProfile';
const mock = vi.hoisted(() => ({ docs: new Map<string, any>(), id: 0, fail: false }));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'pilot-a' } }) }));
vi.mock('firebase/firestore', () => {
  const getDoc = async (ref: any) => ({ exists: () => mock.docs.has(ref.path), data: () => mock.docs.get(ref.path) });
  const writer = () => {
    const pending: [string, any][] = [];
    return { get: getDoc, set: (ref: any, data: any) => { pending.push([ref.path, data]); }, commit: async () => {
      if (mock.fail) throw new Error('permission denied');
      for (const [path, data] of pending) mock.docs.set(path, data);
    } };
  };
  return {
    getFirestore: () => ({}), serverTimestamp: () => 123,
    doc: (db: any, ...parts: string[]) => { const path = parts.length ? parts.join('/') : `${db.path}/score-${++mock.id}`; return { path, id: path.split('/').at(-1) }; },
    collection: (_: unknown, path: string) => ({ path }), getDoc,
    writeBatch: writer,
    runTransaction: async (_: unknown, callback: any) => { const t = writer(); await callback(t); await t.commit(); },
  };
});
import { submitScore } from '../src/net/Leaderboard';
const entry = { name: 'Editable name', mode: 'survival-gunner', score: 1200, kills: 5, rounds: 1 };
const boardId = 'abc123'.repeat(5) + 'ab';
const bestPath = 'squadrons/ABC234/bests/pilot-a_survival-gunner';
beforeEach(() => { stubStorage(); mock.docs.clear(); mock.fail = false; mock.id = 0; });
function join() {
  mock.docs.set('squadrons/ABC234', { boardId });
  cacheSquadron({ callsign: 'Spoofed cache', code: 'XYZ234' });
  mock.docs.set('squadronProfiles/pilot-a', { callsign: 'Reilly', code: 'ABC234' });
}
it('submits global score, stamp and best with server-verified squadron and callsign', async () => {
  join(); expect(await submitScore(entry)).toBe(true);
  expect(mock.docs.get('scores/score-1')).toMatchObject({ squadron: boardId, name: 'Reilly', score: 1200, uid: 'pilot-a' });
  expect(mock.docs.get(bestPath)).toMatchObject({ name: 'Reilly', scoreId: 'score-1', score: 1200 });
  expect(mock.docs.get('limits/pilot-a')).toEqual({ last: 123 });
  expect(cachedSquadron()?.code).toBe('ABC234');
  expect(JSON.stringify(mock.docs.get('scores/score-1'))).not.toContain('ABC234');
});
it('keeps a higher best, replaces it only when a later score improves it', async () => {
  join(); await submitScore(entry);
  await submitScore({ ...entry, score: 600 });
  expect(mock.docs.get(bestPath).score).toBe(1200);
  await submitScore({ ...entry, score: 2400 });
  expect(mock.docs.get(bestPath)).toMatchObject({ score: 2400, scoreId: 'score-3' });
});
it('failed transaction does not leave a best without a submitted score', async () => {
  join(); mock.fail = true; const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await submitScore(entry)).toBe(false); expect(mock.docs.has(bestPath)).toBe(false); expect(mock.docs.has('scores/score-1')).toBe(false); warn.mockRestore();
});
it('preserves legacy global submissions when no squadron profile has been set', async () => {
  expect(await submitScore(entry)).toBe(true);
  expect(mock.docs.get('scores/score-1')).not.toHaveProperty('squadron');
  expect(mock.docs.get('scores/score-1').name).toBe('Editable name');
});
it('restored cache does not grant membership to a new anonymous identity', async () => {
  cacheSquadron({ callsign: 'Reilly', code: 'ABC234' });
  expect(await submitScore(entry)).toBe(true);
  expect(mock.docs.get('scores/score-1')).not.toHaveProperty('squadron');
  expect(cachedSquadron()?.code).toBe('');
});
it('custom battles never submit', async () => {
  expect(await submitScore({ ...entry, mode: '' })).toBe(false); expect(mock.docs.size).toBe(0);
});
