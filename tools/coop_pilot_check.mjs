// Existing Playwright install only. Run Vite on 5274 first; no live scores are submitted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase7/shots/04'; fs.mkdirSync(shots, { recursive: true });
const errors = [], report = {};
const make = async name => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', gfxAuto: 'done', volume: 0, radio: false, music: false })));
  const page = await context.newPage(); page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto('http://127.0.0.1:5274/'); await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.renderer.setAnimationLoop(null); sws.game.input.lock = () => {}; sws.game.coop.screen.menu(); });
  return page;
};
try {
  const host = await make('host'), guest = await make('guest'), pages = [host, guest];
  const step = async (n = 1) => { for (let i = 0; i < n; i++) { await host.evaluate(() => sws.step(3, 1 / 60)); await guest.evaluate(() => sws.step(3, 1 / 60)); } };
  const shot = async (page, name) => { await page.evaluate(() => { sws.game.hud.updateHud(); sws.step(1, 1 / 60, true); }); await page.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 65 }); };
  await host.locator('[data-mode]').selectOption('pilot'); await host.locator('[data-host]').click();
  await host.waitForFunction(() => sws.game.coop.code.length === 6, null, { timeout: 45000 });
  const code = await host.evaluate(() => sws.game.coop.code); console.log('Room', code);
  await guest.locator('.joinrow input').fill(code); await guest.locator('[data-join]').click();
  await Promise.all(pages.map(p => p.waitForFunction(() => sws.game.coop.connected, null, { timeout: 45000 })));
  assert.equal(await guest.locator('[data-mode]').inputValue(), 'pilot'); assert(await guest.locator('[data-mode]').isDisabled());
  await guest.screenshot({ path: `${shots}/lobby.jpg`, type: 'jpeg', quality: 65 });
  await host.locator('[data-start]').click(); await Promise.all(pages.map(p => p.waitForFunction(() => sws.game.state === 'playing')));
  await step(20);
  report.connection = await host.evaluate(async () => { const c = sws.game.coop, stats = await c.link.pc.getStats(); const candidates = []; stats.forEach(s => { if (s.type === 'local-candidate') candidates.push(s.candidateType); }); return { state: c.link.pc.connectionState, channels: [c.link.state.label, c.link.events.label], ice: candidates }; });
  // Verify motion ownership: a stale host position for the guest cannot move its local aircraft.
  report.localFlight = await guest.evaluate(() => { const g = sws.game, f = g.world.playerFighter, p = f.pos.clone(); g.coop.applyTracks(); const correction = p.distanceTo(f.pos); sws.step(1, 1 / 60); return { correction, localMovement: p.distanceTo(f.pos), knownOwn: g.coop.proxies.get(g.coop.pilots.guestId) === f }; });
  assert.equal(report.localFlight.correction, 0); assert(report.localFlight.localMovement > 1); assert(report.localFlight.knownOwn);
  // A stationary target on the guest's actual firing line. The real six guns and swept ballistic
  // collision resolve the kill on the host; no synthetic hit event is used for this assertion.
  await host.evaluate(() => { const g = sws.game, w = g.world, f = g.coop.pilots.remote; g.mission.round.start = 999; g.mission.round.duration = 999;
    const target = w.spawnEnemy(f.pos.clone().addScaledVector(f.forward(), 260), 'beam', 1, false, false, 'bf109');
    w.clearPilot(target); target.kinematic = true; target.fm.vel.set(0, 0, 0); target.vel.set(0, 0, 0); target.guns.forEach(gun => gun.ammo = 0); target.structure = 12; target.maxStructure = 12; window.qaTarget = target;
  });
  await guest.evaluate(() => sws.game.coop.devFire = true);
  for (let i = 0; i < 50; i++) { await step(); if (await host.evaluate(() => sws.game.coop.stats.guestKills > 0)) break; }
  await guest.evaluate(() => sws.game.coop.devFire = false); await step(8);
  report.combat = await host.evaluate(() => ({ ...sws.game.coop.stats, score: sws.game.score, kills: sws.game.world.stats.kills, targetAlive: qaTarget.alive, targetHP: qaTarget.structure }));
  console.log('Combat', report.combat); assert(report.combat.guestRounds >= 6); assert(report.combat.guestKills >= 1); assert.equal(report.combat.kills, 0);
  const shared = await guest.evaluate(() => ({ score: sws.game.score, kills: sws.game.world.stats.kills, crew: sws.game.coop.crewKills })); assert.equal(shared.score, report.combat.score); assert.equal(shared.kills, report.combat.guestKills);
  assert((await host.locator('body').innerText()).includes('Blue Two destroyed'));
  await host.waitForTimeout(4500);
  await shot(host, 'host-score'); await shot(guest, 'guest-score');
  // Rebase only the guest, then keep flying: received absolute tracks must still align.
  await guest.evaluate(() => { const w = sws.game.world, off = w.formationCenter.clone().set(1200, 0, 1800); sws.engine.rebase(off); w.rebase(off); sws.game.hud.rebase(off); });
  // Measure application payload bytes over ten simulated seconds with 12 active opponents.
  await host.evaluate(() => { const g = sws.game; g.mission.round.start = 0; g.mission.round.min = 12; g.mission.round.max = 12; const w = g.world; for (let i = w.activeEnemies().length; i < 12; i++) w.spawnEnemy(w.formationCenter.clone().add({ x: (i % 2 ? 1 : -1) * (1800 + i * 40), y: 450, z: i * 150 }), 'beam', 1, false, false, i % 2 ? 'bf109' : 'fw190'); });
  const counters = async () => Promise.all(pages.map(p => p.evaluate(() => ({ bytes: sws.game.coop.link.bytesSent, snaps: sws.game.coop.stats.snapsSent, inputs: sws.game.coop.stats.inputsSent, t: sws.game.world.time }))));
  report.aircraft = await host.evaluate(() => ({ total: sws.game.world.aircraft.length, enemies: sws.game.world.activeEnemies().length }));
  const before = await counters(); await step(200); const after = await counters();
  report.bandwidth = after.map((a, i) => ({ role: i ? 'guest' : 'host', bytesPerSimSecond: Math.round((a.bytes - before[i].bytes) / (a.t - before[i].t)), snapshots: a.snaps - before[i].snaps, inputs: a.inputs - before[i].inputs }));
  console.log('Bandwidth', report.bandwidth); for (const r of report.bandwidth) assert(r.bytesPerSimSecond < 30000);
  // Damage, fire and down status travel on the reliable event channel. Spectate, then respawn.
  await host.evaluate(() => { const f = sws.game.coop.pilots.remote; f.zones[0].hp = f.zones[0].maxHp * .25; f.zones[0].burning = true; }); await step(5);
  report.damage = await guest.evaluate(() => ({ engine: sws.game.world.playerFighter.zones[0].hp / sws.game.world.playerFighter.zones[0].maxHp, fire: sws.game.world.playerFighter.zones[0].burning }));
  assert(report.damage.engine <= .25); assert(report.damage.fire);
  await host.evaluate(() => sws.game.world.killAircraft(sws.game.coop.pilots.remote, false)); await step(6);
  assert.equal(await guest.evaluate(() => sws.game.world.playerFighter.alive), false); assert.equal(await host.evaluate(() => sws.game.state), 'playing');
  await shot(guest, 'guest-spectate');
  await host.evaluate(() => sws.game.flow.endRound(sws.game.mission)); await step(8);
  assert(await guest.evaluate(() => sws.game.world.playerFighter.alive)); assert.equal(await guest.evaluate(() => sws.game.coop.pilots.life), 1);
  // Host also survives a downed-aircraft interval while the guest continues flying.
  await host.evaluate(() => sws.game.world.killAircraft(sws.game.world.playerFighter, false)); await step(5);
  assert.equal(await host.evaluate(() => sws.game.state), 'playing');
  await host.evaluate(() => sws.game.flow.endRound(sws.game.mission)); await step(8);
  assert(await host.evaluate(() => sws.game.world.playerFighter.alive));
  for (const p of pages) { await p.evaluate(() => sws.game.pause()); assert.equal(await p.evaluate(() => sws.game.state), 'playing'); }
  // Finish via the real round director, then both personal debriefs and one host submit form.
  await host.evaluate(() => { const g = sws.game; g.director.roundsComplete = true; g.mission.bombsAway = undefined; g.mission.escortArrive = undefined; });
  for (let i = 0; i < 150; i++) { await step(); if (await host.evaluate(() => sws.game.state === 'debrief')) break; }
  await guest.waitForFunction(() => sws.game.state === 'debrief', null, { timeout: 10000 });
  report.result = await host.evaluate(() => sws.game.coop.result); assert.equal(report.result.guest.kills, report.combat.guestKills); assert.equal(report.result.host.kills, 0);
  assert.equal(await guest.evaluate(() => sws.game.score), report.result.crew.score); assert.equal(await guest.locator('.lb-submit').count(), 0); assert.equal(await host.locator('.lb-submit input').inputValue(), 'Blue One + Blue Two');
  await shot(host, 'host-debrief'); await shot(guest, 'guest-debrief');
  await host.locator('#debrief [data-a=retry]').click(); await guest.locator('#debrief [data-a=retry]').click(); await host.waitForFunction(() => sws.game.coop.partnerReady);
  await guest.evaluate(() => sws.game.ui.settings(sws.game.settings, () => {}, () => {}));
  await guest.locator('[data-lang]').selectOption('ar');
  await guest.evaluate(() => sws.game.coop.renderLobby(sws.game.coop.lobbyStatus));
  assert(/[\u0600-\u06ff]/.test(await guest.locator('#coop').innerText()));
  await guest.screenshot({ path: `${shots}/lobby-ar.jpg`, type: 'jpeg', quality: 65 });
  await host.locator('[data-scenario]').selectOption('m4'); await host.locator('[data-start]').click(); await guest.waitForFunction(() => sws.game.coop.run === 2 && sws.game.state === 'playing'); await step(15);
  report.campaign = await guest.evaluate(() => ({ mission: sws.game.mission.id, role: sws.game.mission.role, partner: sws.game.coop.partnerPlane?.label })); assert.equal(report.campaign.mission, 'm4');
  await guest.evaluate(() => sws.game.coop.leave()); await host.waitForFunction(() => !sws.game.coop.connected);
  report.fallback = await host.evaluate(() => ({ state: sws.game.state, ai: sws.game.pilotOps.wing.active, alive: sws.game.pilotOps.wing.alive, remote: sws.game.world.remoteFighter })); assert(report.fallback.ai && report.fallback.alive); assert.equal(report.fallback.state, 'playing');
  await shot(host, 'disconnect-ai');
  // Independent fresh real WebRTC connection: host leave must return guest cleanly to menu.
  await host.evaluate(() => { sws.game.startMenu(); sws.game.coop.screen.menu(); }); await guest.evaluate(() => { sws.game.startMenu(); sws.game.coop.screen.menu(); });
  await host.locator('[data-mode]').selectOption('pilot'); await host.locator('[data-scenario]').selectOption('custom'); await host.locator('[data-host]').click(); await host.waitForFunction(() => sws.game.coop.code.length === 6, null, { timeout: 45000 });
  await guest.locator('.joinrow input').fill(await host.evaluate(() => sws.game.coop.code)); await guest.locator('[data-join]').click(); await host.waitForFunction(() => sws.game.coop.connected, null, { timeout: 45000 }); await host.locator('[data-start]').click(); await guest.waitForFunction(() => sws.game.state === 'playing'); await step(10);
  report.custom = await guest.evaluate(() => ({ id: sws.game.mission.id, role: sws.game.mission.role, round: sws.game.mission.round })); assert.equal(report.custom.role, 'pilot');
  await host.evaluate(() => sws.game.coop.leave()); await guest.waitForFunction(() => sws.game.coop.phase === 'idle');
  report.hostLeft = await guest.evaluate(() => ({ state: sws.game.state, notice: document.querySelector('#coopToast').textContent })); assert.equal(report.hostLeft.state, 'menu');
  await guest.screenshot({ path: `${shots}/host-left-ar.jpg`, type: 'jpeg', quality: 65 });
  // Existing B-17 mode still connects and fires from the remote gunner's station.
  for (const p of pages) await p.evaluate(() => { sws.game.startMenu(); sws.game.coop.screen.menu(); });
  await host.locator('[data-host]').click(); await host.waitForFunction(() => sws.game.coop.code.length === 6, null, { timeout: 45000 });
  await guest.locator('.joinrow input').fill(await host.evaluate(() => sws.game.coop.code)); await guest.locator('[data-join]').click(); await host.waitForFunction(() => sws.game.coop.connected, null, { timeout: 45000 });
  await host.locator('[data-start]').click(); await guest.waitForFunction(() => sws.game.state === 'playing');
  await guest.evaluate(() => sws.game.coop.devFire = true); await step(12);
  report.gunner = await host.evaluate(() => ({ mode: sws.game.coop.mode, role: sws.game.mission.role, rounds: sws.game.coop.stats.guestRounds, seats: sws.game.world.remoteStations.size }));
  assert.equal(report.gunner.mode, 'gunner'); assert.equal(report.gunner.role, 'gunner'); assert.equal(report.gunner.seats, 1); assert(report.gunner.rounds > 0);
  assert.deepEqual(errors, []); report.errors = errors; fs.writeFileSync(`${shots}/verification.json`, JSON.stringify(report, null, 2) + '\n'); console.log('PASS', JSON.stringify(report));
} finally { await browser.close(); }
