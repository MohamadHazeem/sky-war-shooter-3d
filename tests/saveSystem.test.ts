import { describe, expect, it } from 'vitest';
import {
  applyProfile, bootSaves, deviceState, exportProfile, findDamage, importProfile, keepBackups, listBackups, makeBackup,
  mergeStats, migrateProfile, parseImport, profileHash, readBackup, readMeta, readProfile, repairDamage, resolveConflict,
  restoreBackup, SAVE_SCHEMA, setDeviceState, touchMeta, UNDO_ID, type BackupEntry, type KV,
} from '../src/game/SaveSystem';
import { readRemote } from '../src/net/CloudSave';

// In-memory localStorage; `quota` makes setItem throw past a total size, like a full browser store
function store(init: Record<string, string> = {}, quota = Infinity): KV & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  const size = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      const old = map.get(k);
      map.set(k, v);
      if (size() > quota) { if (old === undefined) map.delete(k); else map.set(k, old); throw new Error('QuotaExceededError'); }
    },
    removeItem: (k) => { map.delete(k); },
  };
}

const career = (o: Record<string, unknown> = {}) => JSON.stringify({ v: 1, serial: '31 234 567', enlisted: 1000, xp: 500, missions: 4, kills: 20, killsByType: { bf109: 12, fw190: 8 }, campaignWins: ['m1', 'm2'], medals: { 'Air Medal': 2 }, ...o });
const progress = (o: Record<string, unknown> = {}) => JSON.stringify({ unlocked: 3, medals: { m1: ['Air Medal'] }, best: { m1: 900 }, survival: [], layout: 2, ...o });
const base = () => ({
  'sws3d.progress.v1': progress(), 'sws3d.career.v1': career(), 'sws3d.settings.v2': '{"volume":0.8}',
  'sws3d.lang': 'en', 'sws3d.cloudCode': 'ABCDEFGHJKLMNPQRSTUV', 'unrelated.key': 'x',
});
const DAY = 86_400_000;

describe('profile', () => {
  it('reads only the portable sws3d.* keys', () => {
    const p = readProfile(store(base()));
    expect(Object.keys(p).sort()).toEqual(['sws3d.career.v1', 'sws3d.lang', 'sws3d.progress.v1', 'sws3d.settings.v2']);
  });

  it('hash ignores key order and sees any change', () => {
    const a = { 'sws3d.a': '1', 'sws3d.b': '2' };
    expect(profileHash(a)).toBe(profileHash({ 'sws3d.b': '2', 'sws3d.a': '1' }));
    expect(profileHash(a)).not.toBe(profileHash({ 'sws3d.a': '1', 'sws3d.b': '3' }));
    expect(profileHash({ 'sws3d.ab': 'c' })).not.toBe(profileHash({ 'sws3d.a': 'bc' }));
  });

  it('savedAt moves only when the content changes', () => {
    const kv = store(base());
    expect(touchMeta(kv, 100).savedAt).toBe(100);
    expect(touchMeta(kv, 200).savedAt).toBe(100);
    kv.setItem('sws3d.lang', 'ar');
    expect(touchMeta(kv, 300).savedAt).toBe(300);
  });

  it('finds damaged stores', () => {
    expect(findDamage({
      'sws3d.ok.v1': '{"a":1}', 'sws3d.cut.v1': '{"unlocked":3,', 'sws3d.bug': '[object Object]', 'sws3d.un': 'undefined',
      'sws3d.empty.v1': '', 'sws3d.lang': 'ar', 'sws3d.null.v1': 'null', 'sws3d.list': '[1,2',
    })).toEqual(['sws3d.bug', 'sws3d.cut.v1', 'sws3d.empty.v1', 'sws3d.list', 'sws3d.un']);
  });
});

describe('migrations', () => {
  it('moves a pre-2.0 profile to the current schema with a backup first', () => {
    const kv = store({ ...base(), 'sws3d.progress.v1': JSON.stringify({ unlocked: 2, medals: {}, best: {} }), 'sws3d.coopTicket': 't' });
    expect(readMeta(kv).schema).toBe(1);
    const r = bootSaves(kv, 5000);
    expect(r.migrated).toEqual({ from: 1, to: SAVE_SCHEMA });
    expect(readMeta(kv).schema).toBe(SAVE_SCHEMA);
    // old seven-mission order: index 2 (m3) moved to m3's place in the new order, marked layout 2
    expect(JSON.parse(kv.getItem('sws3d.progress.v1')!).layout).toBe(2);
    // the device-only ticket and the cloud code stay on the device
    expect(kv.getItem('sws3d.coopTicket')).toBe('t');
    expect(kv.getItem('sws3d.cloudCode')).toBe('ABCDEFGHJKLMNPQRSTUV');
    expect(listBackups(kv).some((b) => b.reason === 'update')).toBe(true);
    // second boot: nothing to migrate
    expect(bootSaves(kv, 6000).migrated).toBeNull();
  });

  it('drops device-only keys from a carried profile and survives junk', () => {
    const p = migrateProfile({ 'sws3d.cloudCode': 'X', 'sws3d.lang': 'de', 'sws3d.progress.v1': 'not json' }, 1);
    expect(p).toEqual({ 'sws3d.lang': 'de', 'sws3d.progress.v1': 'not json' });
  });
});

describe('export / import', () => {
  it('round-trips the whole profile', () => {
    const a = store(base());
    const file = exportProfile(a, 1234);
    const b = store({ 'sws3d.lang': 'fr', 'sws3d.junk.v1': '{}' });
    const r = importProfile(b, file, 9999);
    expect(r.ok).toBe(true);
    expect(readProfile(b)).toEqual(readProfile(a));
    expect(readMeta(b).savedAt).toBe(9999);
    // the replaced profile is kept in the undo slot
    expect(readBackup(b, UNDO_ID)!.keys).toEqual({ 'sws3d.lang': 'fr', 'sws3d.junk.v1': '{}' });
  });

  it('accepts a bare pre-2.0 key map and rejects bad or newer files', () => {
    expect(parseImport(JSON.stringify({ 'sws3d.lang': 'ar' })).ok).toBe(true);
    expect(parseImport('nope')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImport('{"format":"other","keys":{}}')).toEqual({ ok: false, error: 'invalid' });
    expect(parseImport(JSON.stringify({ format: 'sws3d-profile', schema: SAVE_SCHEMA + 1, keys: { 'sws3d.a': '1' } }))).toEqual({ ok: false, error: 'newer' });
    expect(parseImport(JSON.stringify({ 'sws3d.a': 5 }))).toEqual({ ok: false, error: 'invalid' });
    expect(parseImport('{"other":"1"}')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('backups', () => {
  it('skips unchanged and damaged profiles', () => {
    const kv = store(base());
    expect(makeBackup(kv, 'launch', 1000)).not.toBeNull();
    expect(makeBackup(kv, 'launch', 2000)).toBeNull();
    kv.setItem('sws3d.career.v1', '{"xp":');
    expect(makeBackup(kv, 'mission', 3000)).toBeNull();
    expect(listBackups(kv)).toHaveLength(1);
  });

  it('keeps the newest four plus a day-old and a week-old copy', () => {
    const now = 30 * DAY;
    const e = (id: string, at: number): BackupEntry => ({ id, at, reason: 'launch', hash: id, size: 1, summary: { missions: 0, xp: 0, unlocked: 0 } });
    const list = [e('a', now), e('b', now - 1), e('c', now - 2), e('d', now - 3), e('e', now - 4), e('f', now - 2 * DAY), e('g', now - 3 * DAY), e('h', now - 8 * DAY), e('i', now - 9 * DAY), e(UNDO_ID, now)];
    expect(keepBackups(list, now).map((b) => b.id)).toEqual([UNDO_ID, 'a', 'b', 'c', 'd', 'f', 'h']);
  });

  it('rotates stored copies and deletes the dropped ones', () => {
    const kv = store(base());
    for (let i = 0; i < 9; i++) { kv.setItem('sws3d.lang', `l${i}`); makeBackup(kv, 'mission', 1000 + i); }
    expect(listBackups(kv)).toHaveLength(4);
    const files = [...kv.map.keys()].filter((k) => k.startsWith('swsbak.') && k !== 'swsbak.index');
    expect(files).toHaveLength(4);
    expect(readBackup(kv, listBackups(kv)[0].id)!.keys['sws3d.lang']).toBe('l8');
  });

  it('drops old copies when storage is full', () => {
    const kv = store(base(), 3500);
    for (let i = 0; i < 6; i++) { kv.setItem('sws3d.lang', `lang-${i}`); makeBackup(kv, 'mission', 1000 + i); }
    const list = listBackups(kv);
    expect(list.length).toBeGreaterThan(0);
    expect(readBackup(kv, list[0].id)!.keys['sws3d.lang']).toBe('lang-5');
  });

  it('restores a backup and can undo the restore', () => {
    const kv = store(base());
    const b = makeBackup(kv, 'launch', 1000)!;
    expect(b.summary).toEqual({ missions: 4, xp: 500, unlocked: 3 });
    kv.setItem('sws3d.career.v1', career({ xp: 1 }));
    kv.setItem('sws3d.extra', 'new');
    expect(restoreBackup(kv, b.id, 2000)).toBe(true);
    expect(JSON.parse(kv.getItem('sws3d.career.v1')!).xp).toBe(500);
    expect(kv.getItem('sws3d.extra')).toBeNull();
    expect(kv.getItem('sws3d.cloudCode')).toBe('ABCDEFGHJKLMNPQRSTUV');
    expect(restoreBackup(kv, UNDO_ID, 3000)).toBe(true);
    expect(kv.getItem('sws3d.extra')).toBe('new');
    expect(restoreBackup(kv, 'missing', 4000)).toBe(false);
  });

  it('repair resets only the damaged stores', () => {
    const kv = store({ ...base(), 'sws3d.career.v1': '{"xp":12' });
    expect(bootSaves(kv, 1000).damaged).toEqual(['sws3d.career.v1']);
    expect(repairDamage(kv, 2000)).toEqual(['sws3d.career.v1']);
    expect(kv.getItem('sws3d.career.v1')).toBeNull();
    expect(kv.getItem('sws3d.progress.v1')).toBe(progress());
    expect(readBackup(kv, UNDO_ID)!.keys['sws3d.career.v1']).toBe('{"xp":12');
    expect(bootSaves(kv, 3000).damaged).toEqual([]);
  });
});

describe('cloud conflicts', () => {
  it('merges growing stats', () => {
    expect(mergeStats({ xp: 5, kills: { a: 1 }, list: ['x'], enlisted: 900, serial: 'A' }, { xp: 9, kills: { a: 3, b: 2 }, list: ['y', 'x'], enlisted: 500, serial: 'B', extra: true }))
      .toEqual({ xp: 9, kills: { a: 3, b: 2 }, list: ['x', 'y'], enlisted: 500, serial: 'A', extra: true });
  });

  it('newest wins, older device stats are merged in', () => {
    const local = { profile: { 'sws3d.settings.v2': '{"volume":0.2}', 'sws3d.career.v1': career({ xp: 900, missions: 7 }), 'sws3d.progress.v1': progress({ unlocked: 5 }) }, savedAt: 100 };
    const remote = { profile: { 'sws3d.settings.v2': '{"volume":0.9}', 'sws3d.career.v1': career({ xp: 700, missions: 6, kills: 40, campaignWins: ['m3'] }), 'sws3d.progress.v1': progress({ unlocked: 2, best: { m2: 50 } }) }, savedAt: 200 };
    const r = resolveConflict(local, remote);
    expect(r.winner).toBe('remote');
    expect(r.savedAt).toBe(200);
    expect(r.profile['sws3d.settings.v2']).toBe('{"volume":0.9}');
    const c = JSON.parse(r.profile['sws3d.career.v1']);
    expect([c.xp, c.missions, c.kills]).toEqual([900, 7, 40]);
    expect(c.campaignWins.sort()).toEqual(['m1', 'm2', 'm3']);
    const g = JSON.parse(r.profile['sws3d.progress.v1']);
    expect(g.unlocked).toBe(5);
    expect(g.best).toEqual({ m1: 900, m2: 50 });
    expect(r.merged).toEqual(['sws3d.progress.v1', 'sws3d.career.v1']);
    // forcing the base (loading another device's code) keeps that side's settings
    expect(resolveConflict({ ...local, savedAt: 999 }, remote, 'remote').profile['sws3d.settings.v2']).toBe('{"volume":0.9}');
  });

  it('a damaged store on one side never overwrites a good one', () => {
    const r = resolveConflict({ profile: { 'sws3d.career.v1': '{"xp":' }, savedAt: 300 }, { profile: { 'sws3d.career.v1': career() }, savedAt: 100 });
    expect(r.profile['sws3d.career.v1']).toBe(career());
  });

  it('reads old and new cloud copies', () => {
    const old = readRemote(JSON.stringify({ 'sws3d.lang': 'ar', 'sws3d.cloudCode': 'X' }), 777)!;
    expect(old).toEqual({ profile: { 'sws3d.lang': 'ar' }, savedAt: 777, schema: 1 });
    const now = readRemote(JSON.stringify({ 'sws3d.lang': 'es', 'sws3d.save.meta': JSON.stringify({ schema: 2, savedAt: 55, hash: 'h' }) }), 777)!;
    expect(now).toEqual({ profile: { 'sws3d.lang': 'es' }, savedAt: 55, schema: 2 });
    expect(readRemote('broken')).toBeNull();
  });

  it('device state stays off the profile', () => {
    const kv = store(base());
    setDeviceState(kv, { syncedHash: 'abc', mergeUntilRestart: true });
    expect(deviceState(kv)).toEqual({ syncedHash: 'abc', mergeUntilRestart: true });
    expect(Object.keys(readProfile(kv)).some((k) => k.includes('swsdev'))).toBe(false);
    bootSaves(kv, 10);
    expect(deviceState(kv).mergeUntilRestart).toBe(false);
    applyProfile(kv, { 'sws3d.lang': 'de' }, 50);
    expect(deviceState(kv).syncedHash).toBe('abc');
  });
});
