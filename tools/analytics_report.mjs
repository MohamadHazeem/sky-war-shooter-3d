// Summary of the anonymous gameplay stats (Firestore `analytics_events`, written by
// src/net/Analytics.ts). Clients cannot read the collection; this reads it with the Firebase
// CLI login on this machine (tools/firebase_token.mjs) through the Firestore REST API.
//
//   node tools/analytics_report.mjs                 # last 30 days, all events
//   node tools/analytics_report.mjs --days 7 --prod # only production builds (dev: false)
//   node tools/analytics_report.mjs --last 5        # also print the 5 newest events
//   node tools/analytics_report.mjs --json          # raw events as JSON
import { accessToken, fromFields, PROJECT } from './firebase_token.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const DAYS = Number(opt('--days', 30));
const MAX = Number(opt('--limit', 5000));
const LAST = Number(opt('--last', 0));

async function fetchEvents() {
  const token = await accessToken();
  const since = new Date(Date.now() - DAYS * 86400e3).toISOString();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`;
  const out = [];
  let cursor = null;
  while (out.length < MAX) {
    const structuredQuery = {
      from: [{ collectionId: 'analytics_events' }],
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: since } } },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: Math.min(500, MAX - out.length),
      ...(cursor ? { startAt: { values: [{ timestampValue: cursor }], before: false } } : {}),
    };
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery }) });
    if (!res.ok) throw new Error(`Firestore query failed: ${res.status} ${await res.text()}`);
    const rows = (await res.json()).filter((r) => r.document).map((r) => ({ id: r.document.name.split('/').pop(), ...fromFields(r.document.fields ?? {}) }));
    out.push(...rows);
    if (rows.length < structuredQuery.limit) break;
    cursor = rows[rows.length - 1].createdAt;
  }
  return out;
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(0)}%` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
function count(xs) { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
function table(rows, head) {
  const all = [head, ...rows].map((r) => r.map(String));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r, j) => '  ' + r.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ') + (j === 0 ? '\n  ' + w.map((x) => '-'.repeat(x)).join('  ') : '')).join('\n');
}
const section = (t) => console.log(`\n${t}\n${'='.repeat(t.length)}`);

let events = await fetchEvents();
if (flag('--prod')) events = events.filter((e) => !e.dev);
if (flag('--json')) { console.log(JSON.stringify(events, null, 2)); process.exit(0); }

console.log(`Sky War Shooter 3D — anonymous gameplay stats (${PROJECT}), last ${DAYS} days`);
console.log(`${events.length} mission summaries${flag('--prod') ? ' (production only)' : `, ${events.filter((e) => e.dev).length} from dev builds`}`);
if (!events.length) process.exit(0);
const first = events[events.length - 1].createdAt, last = events[0].createdAt;
console.log(`from ${first} to ${last}`);

section('Missions');
const byMission = new Map();
for (const e of events) { const k = `${e.mission} (${e.role})`; if (!byMission.has(k)) byMission.set(k, []); byMission.get(k).push(e); }
console.log(table([...byMission.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, es]) => {
  const fin = es.filter((e) => e.outcome !== 'aborted');
  return [k, es.length, pct(es.filter((e) => e.success).length, fin.length), pct(es.filter((e) => e.outcome === 'aborted').length, es.length),
    fmt(avg(es.map((e) => e.duration)) / 60), fmt(avg(es.map((e) => e.kills))), pct(avg(es.map((e) => e.accuracy)) * 100, 100), fmt(avg(es.map((e) => e.bombersLost))), fmt(avg(es.map((e) => e.deaths)) * 100, 0) + '%'];
}), ['mission', 'runs', 'success', 'aborted', 'avg min', 'kills', 'accuracy', 'B-17s lost', 'deaths']));
console.log('\n  success = of finished runs; survival "rounds" average: ' + fmt(avg(events.filter((e) => e.mode === 'survival').map((e) => e.rounds))));
console.log(table(count(events.map((e) => `${e.mode}/${e.role}`)).map(([k, n]) => [k, n, pct(n, events.length)]), ['mode/role', 'runs', 'share']));

section('Gun positions (gunner missions)');
const gun = events.filter((e) => e.role === 'gunner');
const seatTotals = {};
for (const e of gun) for (const [k, v] of Object.entries(e.seats ?? {})) seatTotals[k] = (seatTotals[k] ?? 0) + v;
const seatSum = Object.values(seatTotals).reduce((a, b) => a + b, 0);
console.log(table(Object.entries(seatTotals).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, fmt(v / 60), pct(v, seatSum), pct(gun.filter((e) => e.seats?.[k]).length, gun.length)]), ['seat', 'minutes', 'time share', 'used in runs']));
console.log(`  seat switches per mission: avg ${fmt(avg(gun.map((e) => e.seatSwitches)))}, max ${Math.max(0, ...gun.map((e) => e.seatSwitches))}`);

section('Abilities and perks');
const ab = {};
for (const e of events) for (const [k, v] of Object.entries(e.abilities ?? {})) ab[k] = (ab[k] ?? 0) + v;
console.log(table(['focus', 'overdrive', 'mustangs'].map((k) => [k, ab[k] ?? 0, fmt((ab[k] ?? 0) / events.length, 2), pct(events.filter((e) => e.abilities?.[k]).length, events.length)]), ['ability', 'uses', 'per mission', 'used in runs']));
const perks = count(events.flatMap((e) => (e.perks ? e.perks.split(',').filter(Boolean) : [])));
console.log(`  perks awarded: ${perks.reduce((a, [, n]) => a + n, 0)} (${fmt(perks.reduce((a, [, n]) => a + n, 0) / events.length)} per mission)`);
if (perks.length) console.log('  most common: ' + perks.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', '));

section('Performance');
console.log(`  average fps ${fmt(avg(events.map((e) => e.fpsAvg)))}, average 10th-percentile fps ${fmt(avg(events.map((e) => e.fpsP10)))}`);
console.log(table(['<20', '20-30', '30-45', '45-58', '58+'].map((b) => [b, events.filter((e) => e.fpsBucket === b).length, pct(events.filter((e) => e.fpsBucket === b).length, events.length)]), ['fps bucket', 'runs', 'share']));
const q = ['low', 'medium', 'high'].map((k) => [k, events.filter((e) => e.settings?.quality === k)]);
console.log(table(q.map(([k, es]) => [k, es.length, fmt(avg(es.map((e) => e.fpsAvg)))]), ['quality', 'runs', 'avg fps']));
const scr = count(events.map((e) => e.device?.screen ?? '?'));
console.log(table(scr.map(([k, n]) => [k, n, pct(n, events.length), fmt(avg(events.filter((e) => e.device?.screen === k).map((e) => e.fpsAvg)))]), ['screen', 'runs', 'share', 'avg fps']));

section('Settings and devices');
const share = (f) => pct(events.filter(f).length, events.length);
console.log(`  touch controls ${share((e) => e.settings?.touch)}, gamepad connected ${share((e) => e.settings?.gamepad)}, touch-capable device ${share((e) => e.device?.touch)}`);
for (const k of ['aimAssist', 'difficulty', 'flightMode', 'language']) console.log(`  ${k}: ` + count(events.map((e) => e.settings?.[k] ?? '?')).map(([v, n]) => `${v} ${pct(n, events.length)}`).join(', '));

if (LAST > 0) {
  section(`Newest ${LAST} events`);
  for (const e of events.slice(0, LAST)) console.log(`  ${e.createdAt}  ${e.mission} ${e.role} ${e.outcome} ${e.duration}s kills ${e.kills} acc ${e.accuracy} seats ${JSON.stringify(e.seats)} abilities ${JSON.stringify(e.abilities)} perks "${e.perks}" fps ${e.fpsAvg}/${e.fpsP10} ${e.settings?.quality} ${e.device?.screen}${e.dev ? ' [dev]' : ''}`);
}
