// Browser integration with two REAL anonymous auth identities and a shared, in-memory
// Firestore fixture. No production writes. This is NOT a deployed Firestore rules test.
// Start Vite on 5260, then PLAYWRIGHT_MODULE=/installed/playwright/index.mjs node tools/squadron_browser_check.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true });
const store = new Map();
let time = Date.now();
const errors = [];
async function fixture(_, { op, ref, constraints, writes }) {
  if (op === 'get') return store.get(ref.path) ?? null;
  if (op === 'query') {
    let rows = [...store].filter(([p]) => p.startsWith(ref.path + '/') && p.split('/').length === ref.path.split('/').length + 1).map(([path, data]) => ({ path, data }));
    for (const c of constraints ?? []) {
      if (c.kind === 'where') rows = rows.filter(r => r.data[c.field] === c.value);
      if (c.kind === 'order') rows.sort((a, b) => (a.data[c.field] - b.data[c.field]) * (c.direction === 'desc' ? -1 : 1));
      if (c.kind === 'limit') rows = rows.slice(0, c.n);
    }
    return rows;
  }
  if (op === 'commit') {
    // Distinct simulated submission times, respecting the real 20-second score cooldown.
    time += 21001;
    for (const w of writes) {
      if (w.type === 'delete') store.delete(w.ref.path);
      else {
        const data = Object.fromEntries(Object.entries(w.data).map(([k, v]) => [k, v?.__timestamp ? time : v]));
        store.set(w.ref.path, w.type === 'update' ? { ...store.get(w.ref.path), ...data } : data);
      }
    }
  }
}
async function tab() {
  const context = await browser.newContext({ viewport: { width: 1200, height: 940 } });
  await context.exposeBinding('__squadronFixture', fixture);
  await context.addInitScript(() => {
    localStorage.setItem('sws3d.seenVersion', '1.0');
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    const ref = (db, ...parts) => { const path = parts.length ? parts.join('/') : `${db.path}/${crypto.randomUUID()}`; return { path, id: path.split('/').at(-1) }; };
    const snap = (ref, data) => ({ id: ref.id, ref, exists: () => data !== null, data: () => data ? { ...data, ...(data.createdAt ? { createdAt: { toMillis: () => data.createdAt } } : {}) } : undefined });
    const getDoc = async ref => snap(ref, await window.__squadronFixture({ op: 'get', ref }));
    const writer = () => {
      const writes = [];
      return { get: getDoc, set: (ref, data) => writes.push({ type: 'set', ref, data }), update: (ref, data) => writes.push({ type: 'update', ref, data }), delete: ref => writes.push({ type: 'delete', ref }), commit: () => window.__squadronFixture({ op: 'commit', writes }) };
    };
    window.__fixtureFs = {
      doc: ref, collection: ref, getDoc, serverTimestamp: () => ({ __timestamp: true }),
      query: (ref, ...constraints) => ({ ref, constraints }), where: (field, _, value) => ({ kind: 'where', field, value }), orderBy: (field, direction) => ({ kind: 'order', field, direction }), limit: n => ({ kind: 'limit', n }),
      getDocs: async q => ({ docs: (await window.__squadronFixture({ op: 'query', ref: q.ref ?? q, constraints: q.constraints })).map(r => snap(ref({}, r.path), r.data)) }),
      runTransaction: async (_, fn) => { const t = writer(); const result = await fn(t); await t.commit(); return result; },
      writeBatch: writer,
      setDoc: async (ref, data) => { const b = writer(); b.set(ref, data); await b.commit(); },
    };
  });
  await context.route('**/src/net/Leaderboard.ts*', async route => {
    const response = await route.fetch(), source = await response.text();
    const changed = source.replace(/return\s*\{\s*db: fs\.getFirestore\(app\),\s*uid: cred\.user\.uid,\s*fs\s*\};/, 'window.__fixtureUid = cred.user.uid; return { db: {}, uid: cred.user.uid, fs: window.__fixtureFs };');
    assert.notEqual(changed, source, 'Firebase connection seam found');
    await route.fulfill({ response, body: changed });
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5260/');
  await page.waitForFunction(() => window.sws?.game, { timeout: 120000 });
  await page.evaluate(() => { window.sws.game.settings.quality = 'low'; window.sws.game.applySettings(); window.sws.step(2, 1 / 60, true); });
  await page.locator('[data-a=squadron]').click();
  await page.locator('[data-register]').waitFor();
  // Screenshot evidence must visibly identify the fixture, independently of the report.
  await page.evaluate(() => { const label = document.createElement('div'); label.textContent = 'BROWSER FIXTURE · REAL ANONYMOUS AUTH · NO LIVE SQUADRON WRITES'; label.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#243329;color:#fff;text-align:center;font:10px monospace;padding:4px;pointer-events:none'; document.body.append(label); });
  return page;
}
const shot = async (page, name) => { await page.evaluate(() => window.sws.step(1, 1 / 60, true)); await page.screenshot({ path: `docs/phase6/shots/09/${name}.jpg`, type: 'jpeg', quality: 65 }); };
try {
  const a = await tab(), b = await tab();
  await a.locator('[name=callsign]').fill('Reilly'); await a.getByRole('button', { name: 'Set callsign', exact: true }).click();
  await a.locator('[data-create]').waitFor(); await shot(a, 'fixture-create');
  await a.locator('[data-create] button').click(); await a.locator('.sq-code').waitFor();
  const code = (await a.locator('.sq-code').innerText()).trim();
  await b.locator('[name=callsign]').fill('Parker'); await b.getByRole('button', { name: 'Set callsign', exact: true }).click();
  await b.locator('[name=code]').fill(code.toLowerCase()); await b.locator('[data-join] button').click();
  await b.locator('.sq-code').waitFor();
  const uidA = await a.evaluate(() => window.__fixtureUid), uidB = await b.evaluate(() => window.__fixtureUid);
  assert.notEqual(uidA, uidB, 'two independent anonymous Firebase users');
  assert.equal(store.get(`squadrons/${code}`).memberCount, 2);
  for (const [page, score] of [[a, 1200], [b, 2400]]) {
    assert.equal(await page.evaluate(async score => { const lb = await import('/src/net/Leaderboard.ts'); return lb.submitScore({ name: 'ignored', mode: 'survival-gunner', score, kills: 5, rounds: 1 }); }, score), true);
    assert.equal(await page.evaluate(async score => { const lb = await import('/src/net/Leaderboard.ts'), { weeklyMode } = await import('/src/game/Weekly.ts'); return lb.submitScore({ name: 'ignored', mode: weeklyMode('gunner'), score, kills: 5, rounds: 1 }); }, score + 600), true);
  }
  for (const [path, data] of store) if (path.startsWith('scores/')) assert.notEqual(data.squadron, code, 'join codes never appear on public scores');
  await a.evaluate(async () => { const { recordSquadronExperte } = await import('/src/net/Squadrons.ts'); await recordSquadronExperte(); });
  for (const page of [a, b]) {
    await page.locator('[data-refresh]').click();
    await page.locator('[data-bests] tr').first().waitFor();
    assert.equal(await page.locator('[data-bests] tr').count(), 2);
    assert.match(await page.locator('[data-bests] tr').first().innerText(), /Parker.*2400/s);
    assert.match(await page.locator('[data-week-gunner]').innerText(), /3000/);
  }
  await shot(a, 'fixture-two-pilots');
  await a.locator('.squadron-sheet').evaluate(e => e.scrollTop = e.scrollHeight);
  await shot(a, 'fixture-weekly-activity');
  // All leaderboard instances expose global and squadron scopes, including debrief submission.
  await a.evaluate(async () => {
    const { mountLeaderboard } = await import('/src/ui/LeaderboardPanel.ts');
    const host = document.querySelector('.squadron-sheet'); host.innerHTML = '';
    mountLeaderboard(host, 'survival-gunner', 'Survival', { name: '', mode: 'survival-gunner', score: 3600, kills: 8, rounds: 2 });
  });
  await a.locator('[data-scope=squadron]').click(); await a.locator('[data-rows] tr').first().waitFor();
  await a.locator('[data-lb]').click(); await a.waitForFunction(() => document.querySelector('[data-rows] tr')?.textContent?.includes('3600'));
  await shot(a, 'fixture-leaderboard-tab');
  // Use the real settings control, preserving the application's module identity under Vite HMR.
  await b.locator('#squadron [data-back]').click();
  await b.locator('[data-a=settings]').click();
  await b.locator('#settings [data-lang]').selectOption('ar');
  await b.locator('#settings [data-back]').click();
  await b.locator('[data-a=squadron]').click();
  await b.getByRole('heading', { name: 'السرب', exact: true }).waitFor();
  await b.setViewportSize({ width: 390, height: 844 });
  await b.evaluate(() => document.fonts.ready);
  await b.locator('[data-bests] tr').first().waitFor(); await shot(b, 'fixture-arabic-mobile');
  assert.equal(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no mobile document overflow');
  await b.locator('[data-leave]').click(); await b.locator('[data-join]').waitFor();
  assert.equal(store.get(`squadrons/${code}`).memberCount, 1);
  assert.equal(store.has(`squadrons/${code}/members/${uidB}`), false);
  // A departed member's historical best must not crowd out active members.
  assert.equal(await a.evaluate(async code => { const { squadronScores } = await import('/src/net/Squadrons.ts'); return (await squadronScores(code, 'survival-gunner')).length; }, code), 1);
  await b.locator('[name=code]').fill('ZZZZZZ'); await b.locator('[data-join] button').click();
  await b.waitForFunction(() => document.querySelector('.sq-status')?.textContent?.includes('لا يوجد'));
  await shot(b, 'fixture-invalid-code-arabic');
  assert.deepEqual(errors, []);
  console.log('PASS two anonymous users: create/join, shared bests, weekly standings, activity, leaderboard submission, Arabic/mobile, leave, bad code; no page errors. Fixture storage only.');
} finally { await browser.close(); }
