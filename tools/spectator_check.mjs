// Phase 11 goal 34: spectator + streamer mode, end to end. Real Firestore signalling + WebRTC between
// three headless tabs (host, a crew gunner, a spectator); no score posts.
//   npx vite --port 5334 --strictPort &
//   PLAYWRIGHT_MODULE=/abs/playwright/index.mjs node tools/spectator_check.mjs
// Playwright's bundled headless shell only (never channel: 'chrome'). Shots: docs/phase11/shots/34/.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const PORT = process.env.PORT ?? 5334;
// PW_SHELL: an already-downloaded Playwright headless shell when the module's own build is missing
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_SHELL || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase11/shots/34'; fs.mkdirSync(shots, { recursive: true });
const errors = [], report = {}, pages = [];
const make = async (name, w = 1280, h = 720) => {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  await context.addInitScript(() => localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'medium', gfxAuto: 'done', volume: 0, radio: false, music: false, bookends: false })));
  const page = await context.newPage(); pages.push(page);
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 420000 });
  // warm-up: one throwaway solo mission compiles the mission's shaders, so the co-op start does not stall the
  // links past their 10 s timeout under SwiftShader
  await page.evaluate(() => { engine.renderer.setAnimationLoop(null); game.input.lock = () => {}; game.startMission(sws.survivalMission('gunner')); sws.step(20, 1 / 60, true); game.startMenu(); sws.step(2); game.coop.screen.menu(); });
  await page.locator('[data-name]').fill(name);
  return page;
};
const step = async (n = 1) => { for (let i = 0; i < n; i++) for (const p of pages) await p.evaluate(() => sws.step(3, 1 / 60)); };
const shot = async (p, name) => { await p.evaluate(() => { game.hud.updateHud(); sws.step(1, 1 / 60, true); }); await p.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 62 }); console.log('shot', name); };
try {
  const host = await make('Reed'), gunner = await make('Walsh'), spec = await make('Viewer');
  // --- lobby: host, a gunner on the tail, a spectator ---
  await host.locator('[data-pub]').uncheck();   // a private test game: never in the public list
  await host.locator('[data-host]').click();
  await host.waitForFunction(() => game.coop.code.length === 6, null, { timeout: 60000 });
  const code = await host.evaluate(() => game.coop.code); console.log('room', code);
  await host.waitForFunction(() => game.coop.peers.filter(p => p.spec && p.signal).length === 2, null, { timeout: 60000 });
  await gunner.locator('.joinrow input').fill(code); await gunner.locator('[data-join]').click();
  await gunner.waitForFunction(() => game.coop.connected && game.coop.roster.length > 1, null, { timeout: 60000 });
  await gunner.locator('#coop [data-s=tail]').click(); await gunner.waitForFunction(() => game.coop.guestSeat === 'tail');
  await spec.screenshot({ path: `${shots}/menu-watch.jpg`, type: 'jpeg', quality: 62 });
  await spec.locator('.joinrow input').fill(code); await spec.locator('[data-watch]').click();
  await spec.waitForFunction(() => game.coop.connected && game.coop.watching && game.coop.roster.length === 2, null, { timeout: 60000 });
  await host.waitForFunction(() => game.coop.watchers === 1);
  report.lobby = await host.evaluate(() => ({ roster: game.coop.roster.map(p => [p.id, p.seat]), watchers: game.coop.watchers, peers: game.coop.peers.map(p => [p.id, p.spec, p.link.status]) }));
  assert.deepEqual(report.lobby.roster, [[0, 'waistL'], [1, 'tail']]);
  for (const p of [host, gunner]) await p.locator('[data-ready]').click();
  await host.waitForFunction(() => game.coop.partnerReady);
  await gunner.waitForFunction(() => game.coop.watchers === 1);
  await host.screenshot({ path: `${shots}/lobby-host.jpg`, type: 'jpeg', quality: 62 });
  await spec.screenshot({ path: `${shots}/lobby-spectator.jpg`, type: 'jpeg', quality: 62 });
  // --- the round ---
  const seats = async (tag) => console.log(tag, JSON.stringify({ host: await host.evaluate(() => game.coop.peers.map(p => [p.id, p.spec, p.seat])), gunner: await gunner.evaluate(() => [game.coop.guestSeat, game.gunner.station]) }));
  await seats('before start');
  await host.evaluate(() => setTimeout(() => document.querySelector('[data-start]').click(), 0));   // the mission build is long under SwiftShader
  for (const p of pages) await p.waitForFunction(() => game.state === 'playing', null, { timeout: 240000 });
  await seats('after start');
  await step(30);
  await seats('after 30');
  // under SwiftShader the first mission build can stall the host past the 10 s link timeout: the crew and the
  // spectator then rejoin by themselves (Rejoin.ts). Wait for that, and put the gunner back on the tail.
  for (let i = 0; i < 200; i++) {
    if (await host.evaluate(() => game.coop.roster.length === 2 && game.coop.watchers === 1)) break;
    await step(); await new Promise(r => setTimeout(r, 200));
  }
  report.rejoined = await host.evaluate(() => game.coop.peers.map(p => [p.id, p.spec, p.seat, p.link.status]));
  for (let i = 0; i < 60 && (await gunner.evaluate(() => game.gunner.station)) !== 'tail'; i++) { await gunner.evaluate(() => game.gunner.requestStation('tail')); await step(); }
  await spec.waitForFunction(() => game.state === 'playing' && game.coop.spectator.active, null, { timeout: 120000 });
  await step(10);
  await seats('settled');
  report.start = await spec.evaluate(() => ({ active: game.coop.spectator.active, view: game.coop.spectator.view, station: game.gunner.station, snaps: game.coop.stats.snapsRecv, inputs: game.coop.stats.inputsSent }));
  console.log('start', report.start);
  assert(report.start.active); assert(report.start.snaps > 0);
  // fighters around the box (host-authoritative), the tail gunner swings its gun and fires
  await host.evaluate(() => {
    const w = game.world, pb = w.playerBomber, fc = w.formationCenter;
    game.mission.round.start = 999; game.mission.round.duration = 999; game.mission.flak = 0;
    for (let i = 0; i < 6; i++) w.spawnEnemy(fc.clone().add({ x: (i % 2 ? -1 : 1) * (500 + i * 120), y: 120 + i * 40, z: -700 - i * 150 }), i % 2 ? 'beam' : 'tail', 1, false, false, i % 3 ? 'bf109' : 'fw190');
    void pb;
  });
  await gunner.evaluate(() => { const g = game.gunner; g.assist = 0; Object.assign(g.state, { tYaw: 0.35, tPitch: 0.12 }); game.coop.devFire = true; });
  // the spectator picks the tail with its key
  await spec.keyboard.press('Digit5');
  for (let i = 0; i < 40; i++) { await gunner.evaluate(() => Object.assign(game.gunner.state, { tYaw: 0.35, tPitch: 0.12 })); await step(); }
  report.tail = {
    gunner: await gunner.evaluate(() => { const s = game.gunner.state, d = game.gunner.def; return [d.rest.yaw + s.yaw, d.rest.pitch + s.pitch]; }),
    spectator: await spec.evaluate(() => { const s = game.gunner.state, d = game.gunner.def; return { station: game.gunner.station, aim: [d.rest.yaw + s.yaw, d.rest.pitch + s.pitch], fire: game.coop.crewFire, inputs: game.coop.stats.inputsSent }; }),
  };
  console.log('tail', JSON.stringify(report.tail));
  assert.equal(report.tail.spectator.station, 'tail');
  assert(Math.abs(report.tail.spectator.aim[0] - report.tail.gunner[0]) < 0.08 && Math.abs(report.tail.spectator.aim[1] - report.tail.gunner[1]) < 0.08, 'spectator follows the tail gunner aim');
  assert.equal(report.tail.spectator.inputs, 0, 'a spectator never sends gun input');
  await shot(spec, 'spec-tail');
  await gunner.evaluate(() => { game.coop.devFire = false; });
  // the host's own gun (waist): first person, following the host's aim
  await host.evaluate(() => Object.assign(game.gunner.state, { tYaw: -0.3, tPitch: 0.15 }));
  await spec.keyboard.press('Digit1'); await step(30);
  report.waist = { host: await host.evaluate(() => { const s = game.gunner.state, d = game.gunner.def; return [d.rest.yaw + s.yaw, d.rest.pitch + s.pitch]; }), spectator: await spec.evaluate(() => { const s = game.gunner.state, d = game.gunner.def; return [game.gunner.station, d.rest.yaw + s.yaw, d.rest.pitch + s.pitch]; }) };
  console.log('waist', JSON.stringify(report.waist));
  assert.equal(report.waist.spectator[0], 'waistL');
  assert(Math.abs(report.waist.spectator[1] - report.waist.host[0]) < 0.08);
  await shot(spec, 'spec-waist');
  // an AI crewman's gun (top turret)
  await spec.keyboard.press('Digit3'); await step(25); await shot(spec, 'spec-top-ai');
  // the cinematic camera: the calm shots in turn, then the fight
  await host.evaluate(() => { for (const a of game.world.aircraft) if (a.team === 'axis') { a.alive = false; a.remove = true; } });
  await step(12);
  await spec.keyboard.press('KeyC');
  report.cine = [];
  for (const k of ['chase', 'wing', 'below', 'nose']) {
    await spec.evaluate((k) => { const s = game.coop.spectator; s.shot = k; s.shotT = 2; s.subject = null; s.calmIdx = ['chase', 'wing', 'below', 'nose'].indexOf(k); }, k);
    await step(8);
    const r = await spec.evaluate(() => ({ shot: game.coop.spectator.shot, view: game.coop.spectator.view, cam: engine.camera.position.distanceTo(game.world.playerBomber.pos) }));
    report.cine.push(r);
    await shot(spec, `spec-cine-${k}`);
  }
  console.log('cine', JSON.stringify(report.cine));
  assert(report.cine.every(r => r.view === 'cine' && r.cam > 14));
  await host.evaluate(() => { const w = game.world, pb = w.playerBomber; for (let i = 0; i < 3; i++) w.spawnEnemy(pb.pos.clone().add({ x: 400 + i * 90, y: 60 + i * 30, z: -500 - i * 80 }), 'tail', 1, false, false, 'fw190'); });
  await step(14);
  await spec.evaluate(() => { const s = game.coop.spectator; s.shot = 'chase'; s.shotT = 3; });
  await step(4);
  report.action = await spec.evaluate(() => ({ shot: game.coop.spectator.shot, subject: !!game.coop.spectator.subject }));
  console.log('action', report.action);
  assert.equal(report.action.shot, 'action');
  await step(10); await shot(spec, 'spec-cine-action');
  // streamer mode on the spectator: big HUD, crew names hidden
  await spec.evaluate(() => { game.settings.streamer = true; game.applySettings(); });
  await spec.keyboard.press('Digit5'); await step(20);
  report.streamer = await spec.evaluate(() => ({ bar: document.querySelector('#specHud .views')?.textContent, body: document.body.className }));
  assert(!report.streamer.bar.includes('Walsh') && report.streamer.bar.includes('Gunner 2'));
  await shot(spec, 'spec-streamer');
  // Arabic overlay
  await spec.evaluate(async () => { const { setLang } = await import('/src/i18n/index.ts'); setLang('ar'); });
  await step(12); await shot(spec, 'spec-ar');
  await spec.evaluate(async () => { const { setLang } = await import('/src/i18n/index.ts'); setLang('en'); game.settings.streamer = false; game.applySettings(); });
  // phone width spectator bar
  await spec.setViewportSize({ width: 390, height: 844 }); await step(6); await shot(spec, 'spec-phone');
  await spec.setViewportSize({ width: 1280, height: 720 });
  // --- broadcast delay: the spectator's picture falls behind the host's battle ---
  // (frames are stepped slowly here, so compare against the host's clock when the delay went on)
  const hostT0 = await host.evaluate(() => game.world.time);
  await spec.evaluate(() => { game.settings.spectatorDelay = 5; });
  const t0 = Date.now();
  while (Date.now() - t0 < 3500) await step(2);
  report.delay = {
    hostT0, held: await spec.evaluate(() => game.coop.held.length),
    host: await host.evaluate(() => game.world.time), specLatest: await spec.evaluate(() => game.coop.latestTm),
  };
  console.log('delay', report.delay);
  assert(report.delay.held > 0, 'messages are held back');
  assert(report.delay.host > hostT0 + 0.2 && report.delay.specLatest <= hostT0 + 0.15, 'nothing newer than the moment the delay went on has been shown');
  await shot(spec, 'spec-delay');
  while (Date.now() - t0 < 40000 && (await spec.evaluate(() => game.coop.latestTm)) <= hostT0 + 0.2) await step(1);
  report.delay.releasedAfterMs = Date.now() - t0;
  report.delay.releasedLatest = await spec.evaluate(() => game.coop.latestTm);
  console.log('delay released', report.delay.releasedLatest, report.delay.releasedAfterMs);
  assert(report.delay.releasedLatest > hostT0 + 0.2 && report.delay.releasedAfterMs >= 5000, 'held snapshots come out after the delay');
  // --- streamer mode on the host lobby later (masked code), then the debrief ---
  await host.evaluate(() => game.finish(true, 'The mission is over.'));
  for (let i = 0; i < 200; i++) { await step(); if (await host.evaluate(() => game.state === 'debrief')) break; }
  await gunner.waitForFunction(() => game.state === 'debrief', null, { timeout: 20000 });
  const pts0 = await spec.evaluate(() => game.prog.points);
  for (let i = 0; i < 60 && !(await spec.evaluate(() => game.state === 'debrief')); i++) { await step(); await new Promise(r => setTimeout(r, 150)); }
  report.debrief = await spec.evaluate(() => ({ state: game.state, active: game.coop.spectator.active, merit: game.coop.result?.guest?.merit, points: game.prog.points }));
  console.log('debrief', report.debrief);
  assert.equal(report.debrief.state, 'debrief'); assert.equal(report.debrief.active, false); assert.equal(report.debrief.points, pts0);
  await shot(spec, 'spec-debrief');
  for (const p of pages) await p.locator('#debrief [data-a=retry]').click().catch(() => {});
  await host.waitForFunction(() => game.coop.phase === 'lobby', null, { timeout: 10000 });
  await host.evaluate(() => { game.settings.streamer = true; game.applySettings(); game.coop.renderLobby(game.coop.lobbyStatus); });
  report.mask = await host.evaluate(() => ({ code: document.querySelector('#coop .code')?.textContent, crew: document.querySelector('#coop .crew-roster')?.textContent }));
  console.log('mask', report.mask);
  assert(!report.mask.code.includes(code) && report.mask.code.includes('••••••'));
  assert(!report.mask.crew.includes('Walsh') && !report.mask.crew.includes('Reed'));
  await host.screenshot({ path: `${shots}/lobby-streamer.jpg`, type: 'jpeg', quality: 62 });
  await host.evaluate(() => { game.settings.streamer = false; game.applySettings(); game.coop.leave(); });
  for (const p of [gunner, spec]) await p.waitForFunction(() => game.coop.phase === 'idle', null, { timeout: 20000 });
  assert.deepEqual(errors, []); report.errors = errors;
  fs.writeFileSync(`${shots}/verification.json`, JSON.stringify(report, null, 2));
  console.log('PASS: spectator lobby, gun views, cinematic shots, streamer mode, delay, debrief, cleanup');
} catch (e) {
  report.errors = errors; report.failure = String(e?.stack ?? e); fs.writeFileSync(`${shots}/verification-failed.json`, JSON.stringify(report, null, 2));
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${shots}/failed-${i}.jpg`, type: 'jpeg', quality: 50 }).catch(() => {});
  console.error(e); process.exitCode = 1;
} finally {
  for (const p of pages) await p.evaluate(() => game.coop.leave()).catch(() => {});
  await new Promise(r => setTimeout(r, 1500)); await browser.close();
}
