import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubStorage } from './helpers';
import { cachedSquadron, cacheSquadron, CODE_ALPHABET, normalizeSquadronCode, safeSquadronName, SQUADRON_ADJECTIVES, SQUADRON_NOUNS, squadronCode, validCallsign } from '../src/net/SquadronProfile';
import { hasPhrase } from '../src/i18n';
import phrases from '../src/i18n/ar/squadron';

const mock = vi.hoisted(() => ({ data: new Map<string, any>(), uid: 'pilot-a', fail: false }));
vi.mock('../src/net/Leaderboard', () => ({ fbConnect: async () => ({ db: {}, uid: mock.uid, fs: {
  doc: (_: unknown, ...path: string[]) => path.join('/'),
  serverTimestamp: () => 123,
  runTransaction: async (_: unknown, fn: any) => {
    const changes: (() => void)[] = [];
    const result = await fn({
      get: async (ref: string) => ({ exists: () => mock.data.has(ref), data: () => mock.data.get(ref) }),
      set: (ref: string, value: any) => changes.push(() => mock.data.set(ref, value)),
      update: (ref: string, value: any) => changes.push(() => mock.data.set(ref, { ...mock.data.get(ref), ...value })),
      delete: (ref: string) => changes.push(() => mock.data.delete(ref)),
    });
    if (mock.fail) throw new Error('offline');
    changes.forEach(c => c());
    return result;
  },
} }) }));
import { createSquadron, joinSquadron, leaveSquadron, registerCallsign } from '../src/net/Squadrons';

beforeEach(() => { stubStorage(); mock.data.clear(); mock.fail = false; mock.uid = 'pilot-a'; });
describe('squadron code and safe names', () => {
  it('generates six readable characters, including alphabet edges', () => {
    expect(squadronCode(new Uint8Array([0, 1, 31, 32, 33, 255]))).toBe('AB9AB9');
    for (let i = 0; i < 100; i++) {
      const code = squadronCode();
      expect(code).toHaveLength(6);
      expect([...code].every(c => CODE_ALPHABET.includes(c))).toBe(true);
      expect(normalizeSquadronCode(code)).toBe(code);
    }
  });
  it('accepts pasted lowercase, spaces and dashes, rejects ambiguous and malformed codes', () => {
    expect(normalizeSquadronCode(' ab-c2 34 ')).toBe('ABC234');
    for (const code of ['', 'ABC23', 'ABC2345', 'OBC234', 'IBC234', '0BC234', '1BC234', '<bad/>', 'ABC/23']) expect(normalizeSquadronCode(code)).toBeNull();
  });
  it('allows only approved name pairs, preventing punctuation/leet/profanity bypasses', () => {
    for (const a of SQUADRON_ADJECTIVES) for (const n of SQUADRON_NOUNS) expect(safeSquadronName(`${a} ${n}`)).toBe(true);
    for (const name of ['Silver', 'silver Falcons', 'Silver  Falcons', '<b>Silver Falcons</b>', 'Nazi Hawks', 'F.u.c.k Eagles', 'Silver Falcons\n']) expect(safeSquadronName(name)).toBe(false);
  });
  it('validates short English and Arabic callsigns without markup or common obfuscations', () => {
    for (const name of ['Reilly', 'صقر', "O'Neil", 'Pilot 2']) expect(validCallsign(name)).toBe(true);
    for (const name of ['', 'A', ' Reilly', 'Reilly ', 'a'.repeat(17), '<img>', 'f.u.c.k', 'sh1t', 'Ｎａｚｉ']) expect(validCallsign(name)).toBe(false);
  });
  it('mirrors profile safely and rejects malformed cached membership', () => {
    cacheSquadron({ callsign: 'Reilly', code: 'ABC234' });
    expect(cachedSquadron()).toEqual({ callsign: 'Reilly', code: 'ABC234' });
    localStorage.setItem('sws3d.squadron', '{broken'); expect(cachedSquadron()).toBeNull();
    localStorage.setItem('sws3d.squadron', JSON.stringify({ callsign: 2, code: 'ABC234' })); expect(cachedSquadron()).toBeNull();
    cacheSquadron(null); expect(localStorage.length).toBe(0);
  });
});
describe('membership transactions', () => {
  it('sets callsign once, preserving it across later registration attempts', async () => {
    await registerCallsign('Reilly'); await registerCallsign('Parker');
    expect(cachedSquadron()?.callsign).toBe('Reilly');
  });
  it('creates, joins with a second identity, leaves and rejoins with consistent counts', async () => {
    await registerCallsign('Reilly'); const p = await createSquadron('Silver Falcons');
    expect(mock.data.get(`squadrons/${p.code}`).memberCount).toBe(1);
    mock.uid = 'pilot-b'; await registerCallsign('Parker'); await joinSquadron(p.code);
    expect(mock.data.get(`squadrons/${p.code}`).memberCount).toBe(2);
    await leaveSquadron(); expect(cachedSquadron()?.code).toBe('');
    expect(mock.data.has(`squadrons/${p.code}/members/pilot-b`)).toBe(false);
    expect(mock.data.get(`squadrons/${p.code}`).memberCount).toBe(1);
    await joinSquadron(p.code); expect(cachedSquadron()?.callsign).toBe('Parker');
  });
  it('rejects missing/full squads, duplicate membership and unsafe names without cache changes', async () => {
    await expect(joinSquadron('ABC234')).rejects.toThrow('Set your callsign');
    await registerCallsign('Reilly');
    await expect(joinSquadron('ABC234')).rejects.toThrow('No squadron');
    mock.data.set('squadrons/ABC234', { name: 'Silver Falcons', memberCount: 64 });
    await expect(joinSquadron('ABC234')).rejects.toThrow('full');
    await expect(createSquadron('unsafe name')).rejects.toThrow('approved');
    const p = await createSquadron('Flying Owls');
    await expect(joinSquadron(p.code)).rejects.toThrow('Leave your current');
    expect(cachedSquadron()?.code).toBe(p.code);
  });
  it('does not cache failed writes or clear membership on a failed leave', async () => {
    await registerCallsign('Reilly'); mock.fail = true;
    await expect(createSquadron('Silver Falcons')).rejects.toThrow('offline');
    expect(cachedSquadron()?.code).toBe('');
    mock.fail = false; const p = await createSquadron('Silver Falcons'); mock.fail = true;
    await expect(leaveSquadron()).rejects.toThrow('offline'); expect(cachedSquadron()?.code).toBe(p.code);
  });
});
it('registers Arabic for all squadron phrases and safe-name words', () => {
  for (const [en, ar] of Object.entries(phrases.phrases)) { expect(hasPhrase(en)).toBe(true); expect(ar).toMatch(/[\u0600-\u06ff]/); }
});

it('covers every player-facing squadron literal in Arabic', async () => {
  const fsModule = 'node:fs';
  const { readFileSync } = await import(fsModule);
  for (const file of ['ui/SquadronScreen.ts', 'ui/LeaderboardPanel.ts', 'net/Squadrons.ts']) {
    const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8') as string;
    for (const match of source.matchAll(/(?:tx|SquadronError)\('([^']+)'/g)) expect(hasPhrase(match[1]), match[1]).toBe(true);
  }
});
