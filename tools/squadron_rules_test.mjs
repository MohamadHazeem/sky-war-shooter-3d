// Evaluate the local rules with Firebase's rules test API (no deployment and no data writes).
// FIREBASE_TOOLS_LIB=/path/to/firebase-tools/lib node tools/squadron_rules_test.mjs
// Uses the CLI's existing login. Document lookups are explicit before/after fixtures.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const lib = process.env.FIREBASE_TOOLS_LIB;
if (!lib) throw new Error('Set FIREBASE_TOOLS_LIB to an existing firebase-tools/lib directory.');
const cli = name => require(resolve(lib, name));
const options = { project: 'sky-war-shooter-3d' };
cli('auth').setActiveAccount(options, cli('auth').getGlobalDefaultAccount());
await cli('requireAuth').requireAuth(options);
const client = new (cli('apiv2').Client)({ urlPrefix: cli('api').rulesOrigin(), apiVersion: 'v1' });
const root = '/databases/(default)/documents/', now = '2026-10-11T08:00:00Z';
const profilePath = 'squadronProfiles/pilot-a', squadPath = 'squadrons/ABC234', memberPath = `${squadPath}/members/pilot-a`;
const profile = { callsign: 'Reilly', code: '' }, joinedProfile = { ...profile, code: 'ABC234' };
const boardId = 'abc123'.repeat(5) + 'ab';
const squad = { boardId, name: 'Silver Falcons', memberCount: 1, createdAt: now }, member = { callsign: 'Reilly', joinedAt: now };
const joined = { [profilePath]: joinedProfile, [squadPath]: squad, [memberPath]: member };
const created = { [profilePath]: profile };
const score = { uid: 'pilot-a', name: 'Reilly', mode: 'survival-gunner', squadron: boardId, score: 1200, kills: 5, rounds: 1, createdAt: now, v: 1 };
const scoreAfter = { ...joined, 'scores/score-a': score, 'limits/pilot-a': { last: now } };
const bestPath = `${squadPath}/bests/pilot-a_survival-gunner`, best = { ...score, scoreId: 'score-a' };
const cases = [];
function test(label, path, method, data, before = {}, after = before, allow = true, uid = 'pilot-a') {
  const functionMocks = [];
  for (const [fn, docs] of [['get', before], ['exists', before], ['getAfter', after], ['existsAfter', after]]) {
    for (const [p, d] of Object.entries(docs)) functionMocks.push({ function: fn, args: [{ exact_value: root + p }], result: { value: fn.startsWith('exists') ? true : { data: d } } });
    functionMocks.push({ function: fn, args: [{ any_value: {} }], result: { value: fn.startsWith('exists') ? false : null } });
  }
  cases.push({ label, value: { expectation: allow ? 'ALLOW' : 'DENY', request: { auth: uid ? { uid } : null, path: root + path, method, time: now, ...(data === undefined ? {} : { resource: { data } }) }, resource: before[path] ? { data: before[path] } : null, functionMocks } });
}
test('callsign registration', profilePath, 'create', profile);
test('Arabic callsign', profilePath, 'create', { ...profile, callsign: 'صقر' });
test('short callsign denied', profilePath, 'create', { ...profile, callsign: 'R' }, {}, {}, false);
test('oversized callsign denied', profilePath, 'create', { ...profile, callsign: 'x'.repeat(17) }, {}, {}, false);
test('markup callsign denied', profilePath, 'create', { ...profile, callsign: '<script>' }, {}, {}, false);
test('extra profile field denied', profilePath, 'create', { ...profile, admin: true }, {}, {}, false);
test('registration cannot claim squad', profilePath, 'create', joinedProfile, {}, {}, false);
test('callsign immutable', profilePath, 'update', { ...profile, callsign: 'Parker' }, created, created, false);
test('private profile denied to outsider', profilePath, 'get', undefined, created, created, false, 'pilot-b');
test('anonymous unauthenticated denied', profilePath, 'create', profile, {}, {}, false, null);
for (const [path, data] of [[squadPath, squad], [memberPath, member], [profilePath, joinedProfile]]) test('create transaction: ' + path, path, path === profilePath ? 'update' : 'create', data, created, joined);
test('create requires member', squadPath, 'create', squad, created, created, false);
test('unsafe squadron name denied', squadPath, 'create', { ...squad, name: 'unsafe' }, created, joined, false);
test('bad code denied', 'squadrons/ABO123', 'create', squad, created, joined, false);
test('join code cannot be used as public squadron ID', squadPath, 'create', { ...squad, boardId: 'ABC234' }, created, joined, false);
test('extra squad field denied', squadPath, 'create', { ...squad, owner: 'pilot-a' }, created, joined, false);
test('code lookup allowed', squadPath, 'get', undefined, joined, joined, true, 'pilot-b');
test('squad directory denied', 'squadrons', 'list', undefined, joined, joined, false);
test('member roster read', memberPath, 'get', undefined, joined);
test('outsider roster denied', memberPath, 'get', undefined, joined, joined, false, 'pilot-b');
const beforeJoin = { ...created, [squadPath]: { ...squad, memberCount: 1 } };
const afterJoin = { ...joined, [squadPath]: { ...squad, memberCount: 2 } };
for (const [path, data] of [[squadPath, afterJoin[squadPath]], [memberPath, member], [profilePath, joinedProfile]]) test('join transaction: ' + path, path, path === memberPath ? 'create' : 'update', data, beforeJoin, afterJoin);
test('forged count denied', squadPath, 'update', { ...squad, memberCount: 30 }, joined, joined, false);
test('full squad denied', squadPath, 'update', { ...squad, memberCount: 65 }, { ...beforeJoin, [squadPath]: { ...squad, memberCount: 64 } }, { ...joined, [squadPath]: { ...squad, memberCount: 65 } }, false);
test('rename denied', squadPath, 'update', { ...squad, name: 'Golden Eagles' }, joined, joined, false);
test('impersonated membership denied', memberPath, 'create', { ...member, callsign: 'Parker' }, created, joined, false);
test('member edit denied', memberPath, 'update', { ...member, callsign: 'Parker' }, joined, joined, false);
const left = { [profilePath]: profile, [squadPath]: { ...squad, memberCount: 0 } };
for (const [path, data, method] of [[squadPath, left[squadPath], 'update'], [memberPath, undefined, 'delete'], [profilePath, profile, 'update']]) test('leave transaction: ' + path, path, method, data, joined, left);
test('non-atomic leave denied', memberPath, 'delete', undefined, joined, joined, false);
test('cannot delete other member', memberPath, 'delete', undefined, joined, left, false, 'pilot-b');
test('valid squad score', 'scores/score-a', 'create', score, joined, scoreAfter);
test('legacy global score unchanged', 'scores/score-a', 'create', Object.fromEntries(Object.entries(score).filter(([k]) => k !== 'squadron')), joined, scoreAfter);
test('forged squad score denied', 'scores/score-a', 'create', score, created, scoreAfter, false, 'pilot-b');
test('wrong squad denied', 'scores/score-a', 'create', { ...score, squadron: 'f'.repeat(32) }, joined, scoreAfter, false);
test('score name impersonation denied', 'scores/score-a', 'create', { ...score, name: 'Parker' }, joined, scoreAfter, false);
test('score without limit stamp denied', 'scores/score-a', 'create', score, joined, joined, false);
test('implausible score denied', 'scores/score-a', 'create', { ...score, score: 5000000 }, joined, scoreAfter, false);
test('bad mode denied', 'scores/score-a', 'create', { ...score, mode: 'anything' }, joined, scoreAfter, false);
test('score update still denied', 'scores/score-a', 'update', { ...score, score: 2400 }, scoreAfter, scoreAfter, false);
test('linked best allowed', bestPath, 'create', best, joined, scoreAfter);
test('best without score denied', bestPath, 'create', best, joined, joined, false);
test('best inflated over source denied', bestPath, 'create', { ...best, score: 5000 }, joined, scoreAfter, false);
test('lower best denied', bestPath, 'update', best, { ...joined, [bestPath]: { ...best, score: 2400 } }, scoreAfter, false);
test('outsider best read denied', bestPath, 'get', undefined, joined, joined, false, 'pilot-b');
test('join activity allowed', `${squadPath}/activity/pilot-a`, 'create', { name: 'Reilly', kind: 'joined', createdAt: now }, created, joined);
test('experte activity allowed', `${squadPath}/activity/pilot-a`, 'create', { name: 'Reilly', kind: 'experte', createdAt: now }, joined);
test('activity kind injection denied', `${squadPath}/activity/pilot-a`, 'create', { name: 'Reilly', kind: '<script>', createdAt: now }, joined, joined, false);
test('activity name spoof denied', `${squadPath}/activity/pilot-a`, 'create', { name: 'Parker', kind: 'experte', createdAt: now }, joined, joined, false);
let passed = 0;
for (let start = 0; start < cases.length; start += 20) {
  const chunk = cases.slice(start, start + 20);
  const { body } = await client.post('/projects/sky-war-shooter-3d:test', { source: { files: [{ name: 'firestore.rules', content: readFileSync('firestore.rules', 'utf8') }] }, testSuite: { testCases: chunk.map(c => c.value) } }, { skipLog: { body: true } });
  if (body.issues?.length) { console.error(body.issues); process.exitCode = 1; }
  for (const [i, c] of chunk.entries()) {
    const result = body.testResults?.[i];
    if (result?.state === 'SUCCESS') { console.log('PASS ' + c.label); passed++; }
    else { console.error('FAIL ' + c.label, JSON.stringify(result)); process.exitCode = 1; }
  }
}
console.log(`${passed}/${cases.length} rules cases passed (fixture lookups; no deployment)`);
