// Phase 9 goal 7 bug and balance sweep (docs/phase9/reports/07.md).
// Runs autoplay jobs through sws.qa (src/dev/qaSweep.ts) against a dev server, each from a clean
// profile (wiped save, reload), and appends one JSON line per run.
//
//   npx vite --port 5297 --strictPort &
//   PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs node tools/qa_sweep.mjs <set> [out.jsonl]
//   node tools/qa_sweep.mjs --report out.jsonl          # Markdown summary
//
// Sets: campaign (every gunner campaign mission + Deep Penetration, Veteran, human level),
// difficulty (the same at Recruit and Ace), survival (gunner Survival to round 11 per difficulty),
// highar (High quality + Arabic subset), ace (near-perfect bot on m1, Veteran vs Ace), smoke.
import fs from 'node:fs';

const PORT = process.env.QA_PORT ?? 5297;
const args = process.argv.slice(2);

if (args[0] === '--report') { report(args[1]); process.exit(0); }

const set = args[0] ?? 'smoke';
const out = args[1] ?? `docs/phase9/reports/07-sweep.jsonl`;
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'] });

// One context (warm HTTP cache: assets load once); every job wipes the game's saved state, writes
// its settings and reloads, so each run still starts from a clean profile.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
const p = await ctx.newPage();
let errors = [];
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`); });
await p.goto(`http://127.0.0.1:${PORT}/`);
async function page(opts) {
  await p.evaluate((o) => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k.startsWith('sws3d.') || k.startsWith('swsbal.')) localStorage.removeItem(k); }
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: o.quality, graphicsMode: 'manual', bookends: false, difficulty: o.diff ?? 'veteran' }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true, missions: 5 }));
    localStorage.setItem('sws3d.lang', o.lang);
  }, opts);
  await p.reload();
  await p.waitForFunction(() => window.sws?.qa, null, { timeout: 240000 });
  errors = [];
  return { p, errors: () => errors };
}

async function gunnerIds() {
  const { p } = await page({ quality: 'low', lang: 'en' });
  const ids = await p.evaluate(async () => {
    const { DEEP_PENETRATION } = await import('/src/game/DeepPenetration.ts');
    return [...sws.CAMPAIGN.filter((m) => m.role === 'gunner').map((m) => m.id), ...DEEP_PENETRATION.map((m) => m.id)];
  });
  return ids;
}

const jobs = [];
const add = (job, env = {}) => jobs.push({ job: { steps: 40000, ...job }, env: { quality: 'low', lang: 'en', ...env } });
if (set === 'smoke') add({ kind: 'campaign', id: 'm1', skill: 0 });
if (set === 'campaign' || set === 'difficulty') {
  const ids = await gunnerIds();
  for (const diff of set === 'campaign' ? ['veteran'] : ['recruit', 'ace']) for (const id of ids) add({ kind: 'campaign', id, skill: 0, diff, tag: set });
}
if (set === 'survival') for (const diff of ['recruit', 'veteran', 'ace']) add({ kind: 'survival', role: 'gunner', rounds: 11, skill: 0, diff, steps: 90000, tag: set });
if (set === 'highar') for (const id of ['m1', 'm12', 'dp2', 'dp5']) add({ kind: 'campaign', id, skill: 0, tag: set }, { quality: 'high', lang: 'ar' });
if (set === 'ace') for (const diff of ['veteran', 'ace', 'ace', 'ace']) add({ kind: 'campaign', id: 'm1', skill: 1, diff, tag: set });
if (process.env.QA_ONLY) jobs.splice(0, jobs.length, ...jobs.filter((j) => j.job.id === process.env.QA_ONLY || j.job.diff === process.env.QA_ONLY));

console.log(`${jobs.length} jobs → ${out}`);
for (const [i, { job, env }] of jobs.entries()) {
  const t0 = Date.now();
  let line;
  const { p, errors } = await page({ ...env, diff: job.diff });
  try {
    const r = await p.evaluate((j) => sws.qa(j), job);
    line = { ...r, env, errors: [...new Set(errors())].slice(0, 20), wallS: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    line = { job, env, crash: String(e).slice(0, 500), errors: [...new Set(errors())].slice(0, 20), wallS: Math.round((Date.now() - t0) / 1000) };
  }
  fs.appendFileSync(out, JSON.stringify(line) + '\n');
  const q = line.qa;
  console.log(`[${i + 1}/${jobs.length}] ${job.kind}:${job.id ?? job.role} ${job.diff ?? 'veteran'} ${env.quality}/${env.lang} skill ${job.skill} → ${line.crash ? 'CRASH' : line.result} t=${line.t}s kills ${line.kills} lost ${line.bombersLost} rounds ${line.rounds?.length} | hud ${q ? Object.keys(q.hud.issues).length : '-'} false-mk ${q?.markers.falseMarkers ?? '-'} p95 ${q?.frames.p95 ?? '-'} max ${q?.frames.max ?? '-'} prog ${q?.programs.join('→') ?? '-'} heap ${q?.heapMB.join('→') ?? '-'} stuck ${q?.stuck ?? '-'} dbl ${q?.losses.doubled ?? '-'} err ${line.errors.length} (${line.wallS}s)`);
}
await browser.close();

function report(file) {
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  console.log('| Scenario | Diff | Gfx/Lang | Result | Time | Rounds | Kills | B-17 lost | Acc | Min hp | Frames p95/max ms | Programs | Heap MB | HUD overlaps | False markers | Errors |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const j = r.job, q = r.qa;
    if (r.crash) { console.log(`| ${j.kind}:${j.id ?? j.role} | ${j.diff ?? 'veteran'} | ${r.env.quality}/${r.env.lang} | CRASH ${r.crash.slice(0, 80)} |`); continue; }
    const res = r.stopped ? `survived ${r.rounds.length} rounds` : r.success ? 'win' : r.timeout ? 'TIMEOUT' : `loss: ${(r.failCause ?? '').slice(0, 40)}`;
    const hud = Object.entries(q.hud.issues).map(([k, n]) => `${k} (${n}/${q.hud.samples})`).join('; ') || '0';
    const mk = q.markers.falseMarkers ? `${q.markers.falseMarkers}: ${Object.entries(q.markers.reasons).map(([k, n]) => `${k} ×${n}`).join(', ')}` : `0/${q.markers.checked}`;
    console.log(`| ${j.kind}:${j.id ?? j.role} @${j.skill} | ${j.diff ?? 'veteran'} | ${r.env.quality}/${r.env.lang} | ${res} | ${mmss(r.t)} | ${r.rounds.length} | ${r.kills} | ${r.bombersLost}${q.losses.doubled ? ` (${q.losses.doubled} doubled)` : ''} | ${r.accuracy} | ${r.minHp} | ${q.frames.p95}/${q.frames.max} | ${q.programs.join('→')} | ${q.heapMB.join('→')} | ${hud} | ${mk} | ${r.errors.length ? r.errors.slice(0, 2).join(' / ').slice(0, 120) : 0} |`);
  }
}
