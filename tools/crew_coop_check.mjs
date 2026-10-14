// Vite on 5296; existing Playwright installation only. Real Firestore + WebRTC, no score posts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const shots = 'docs/phase9/shots/06'; fs.mkdirSync(shots, { recursive: true });
const errors = [], report = {}, pages = [];
const make = async name => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', gfxAuto: 'done', volume: 0, radio: false, music: false })));
  const page = await context.newPage(); pages.push(page); page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto('http://127.0.0.1:5296/'); await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 120000 });
  await page.evaluate(() => { sws.engine.renderer.setAnimationLoop(null); sws.game.input.lock = () => {}; sws.game.coop.screen.menu(); });
  await page.locator('[data-name]').fill(name);
  return page;
};
try {
  const host = await make('Reed'), guests = [await make('Walsh'), await make('Baker'), await make('أحمد')];
  const step = async (n = 1) => { for (let i = 0; i < n; i++) for (const p of pages) await p.evaluate(() => sws.step(3, 1 / 60)); };
  const shot = async (p, name) => { await p.evaluate(() => { sws.game.hud.updateHud(); sws.step(1, 1 / 60, true); }); await p.screenshot({ path: `${shots}/${name}.jpg`, type: 'jpeg', quality: 60 }); };
  await host.locator('[data-host]').click();
  await host.waitForFunction(() => sws.game.coop.code.length === 6, null, { timeout: 45000 });
  const code = await host.evaluate(() => sws.game.coop.code); console.log('Room created');
  const join = async p => { await p.locator('.joinrow input').fill(code); await p.locator('[data-join]').click(); await p.waitForFunction(() => sws.game.coop.connected && sws.game.coop.roster.length > 1, null, { timeout: 45000 }); };
  // Start with three players; the fourth joins the already-running mission.
  for (const p of guests.slice(0, 2)) await join(p);
  await host.waitForFunction(() => sws.game.coop.roster.length === 3);
  assert.equal(await host.locator('[data-crew]').count(), 4);
  assert(await host.locator('[data-start]').isDisabled());
  await guests[0].locator('#coop [data-s=tail]').click();
  await guests[0].waitForFunction(() => sws.game.coop.guestSeat === 'tail');
  for (const p of [host, ...guests.slice(0, 2)]) await p.locator('[data-ready]').click();
  await host.waitForFunction(() => sws.game.coop.partnerReady);
  await host.screenshot({ path: `${shots}/lobby.jpg`, type: 'jpeg', quality: 60 });
  await host.locator('[data-start]').click();
  for (const p of [host, ...guests.slice(0, 2)]) await p.waitForFunction(() => sws.game.state === 'playing');
  await step(10);
  await join(guests[2]); await guests[2].waitForFunction(() => sws.game.state === 'playing');
  await step(20);
  report.links = await host.evaluate(async () => Promise.all(sws.game.coop.peers.map(async p => {
    const stats = await p.link.pc.getStats(), ice = [];
    stats.forEach(s => { if (s.type === 'local-candidate') ice.push(s.candidateType); });
    return { id: p.id, seat: p.seat, name: p.name, status: p.link.status, connection: p.link.pc.connectionState, ice };
  })));
  assert.equal(report.links.length, 3); assert(report.links.every(p => p.connection === 'connected')); assert.equal(new Set(report.links.map(p => p.seat)).size, 3);
  report.lateJoin = await guests[2].evaluate(() => ({ phase: sws.game.coop.phase, run: sws.game.coop.run, snaps: sws.game.coop.stats.snapsRecv, proxies: sws.game.coop.proxies.size }));
  assert(report.lateJoin.snaps > 0 && report.lateJoin.proxies > 0);
  // Hold each guest gun and place one stationary target on each real muzzle's firing line.
  await host.evaluate(async () => {
    const { STATIONS, dirFromYawPitch } = await import('/src/world/B17Layout.ts');
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const g = sws.game, w = g.world, pb = w.playerBomber;
    g.mission.round.start = 999; g.mission.round.duration = 999; g.mission.flak = 0;
    w.bomberGunners = () => {};
    for (const a of w.aircraft) if (Array.isArray(a.guns)) a.guns.forEach(gun => gun.ammo = 0);
    window.qaTargets = [];
    for (const p of g.coop.peers) {
      const d = STATIONS[p.seat], dir = dirFromYawPitch(d.rest.yaw, d.rest.pitch, new Vector3()).applyQuaternion(pb.quat);
      const pos = pb.localToWorld(d.pivot.clone()).addScaledVector(dir, 210);
      const target = w.spawnEnemy(pos, 'beam', 1, false, false, 'bf109');
      w.clearPilot(target); target.kinematic = true; target.vel.copy(pb.vel); target.fm.vel.copy(pb.vel); target.guns.forEach(gun => gun.ammo = 0); target.structure = 12; target.maxStructure = 12;
      const update = target.update.bind(target);
      target.update = function(dt, time) {
        if (!this.alive) { update(dt, time); return; }
        this.root.position.copy(pb.localToWorld(d.pivot.clone())).addScaledVector(dirFromYawPitch(d.rest.yaw, d.rest.pitch, new Vector3()).applyQuaternion(pb.quat), 210);
        this.vel.copy(pb.vel);
      };
      qaTargets.push(target);
    }
  });
  for (const p of guests) await p.evaluate(() => { const g = sws.game; g.gunner.assist = 0; Object.assign(g.gunner.state, { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, vYaw: 0, vPitch: 0 }); g.coop.devFire = true; });
  for (let i = 0; i < 80; i++) { await step(); if (await host.evaluate(() => sws.game.coop.peers.every(p => p.score.kills > 0))) break; }
  for (const p of guests) await p.evaluate(() => sws.game.coop.devFire = false); await step(8);
  report.combat = await host.evaluate(() => ({ crew: sws.game.coop.crewKills, score: sws.game.score, guests: sws.game.coop.peers.map(p => ({ name: p.name, seat: p.seat, input: p.inp, ...p.score })), targets: qaTargets.map(t => ({ alive: t.alive, hp: t.structure, offset: t.pos.clone().sub(sws.game.world.playerBomber.pos).toArray() })) }));
  console.log('Combat', JSON.stringify(report.combat));
  assert(report.combat.guests.every(p => p.shots > 0 && p.kills > 0));
  report.shared = await Promise.all(pages.map(p => p.evaluate(() => ({ score: sws.game.score, kills: sws.game.coop.crewKills }))));
  for (const r of report.shared) { assert.equal(r.score, report.combat.score); assert.equal(r.kills, report.combat.crew); }
  // Target ping on a visible stationary fighter; U uses the real input path. Then verify
  // direction fallback and host-stamped sender on all four tabs through the reliable channel.
  await guests[0].evaluate(() => { sws.game.input.tap('KeyU'); sws.step(1, 1 / 60); }); await step(2);
  report.pings = await Promise.all(pages.map(p => p.evaluate(() => sws.game.coop.pings.current)));
  assert(report.pings.every(p => p && p.from === 1 && p.run === 1));
  await shot(host, 'host-hud'); await shot(guests[0], 'guest-ping');
  // A visible target marker, with the normal Full HUD projection/visibility rules.
  await host.evaluate(async () => {
    const { STATIONS, dirFromYawPitch } = await import('/src/world/B17Layout.ts');
    const { Vector3 } = await import('/node_modules/.vite/deps/three.js');
    const g = sws.game, w = g.world, pb = w.playerBomber, d = STATIONS.tail;
    g.setWeather({ sunEl: 25, sunAz: 220, low: 0, high: 0 });
    const target = w.spawnEnemy(pb.localToWorld(d.pivot.clone()).addScaledVector(dirFromYawPitch(d.rest.yaw, d.rest.pitch, new Vector3()).applyQuaternion(pb.quat), 210), 'beam', 1, false, false, 'bf109');
    w.clearPilot(target); target.kinematic = true; target.guns.forEach(gun => gun.ammo = 0);
    target.update = function() { this.root.position.copy(pb.localToWorld(d.pivot.clone())).addScaledVector(dirFromYawPitch(d.rest.yaw, d.rest.pitch, new Vector3()).applyQuaternion(pb.quat), 210); this.vel.copy(pb.vel); };
    window.qaPingId = target.id;
  });
  await guests[0].evaluate(() => { sws.game.settings.hudDetail = 'full'; sws.game.settings.markers = true; });
  await step(45);
  await guests[0].evaluate(() => { sws.step(1, 1 / 60, true); sws.game.input.tap('KeyU'); sws.step(1, 1 / 60); });
  await step(3);
  report.targetPing = await guests[0].evaluate(() => sws.game.coop.pings.current);
  assert.equal(report.targetPing.target, await host.evaluate(() => qaPingId));
  await shot(guests[0], 'target-ping');
  // Authoritative in-flight seat changes, including host transition reservations.
  await guests[2].evaluate(() => sws.game.gunner.requestStation('ball')); await step(24);
  assert.equal(await guests[2].evaluate(() => sws.game.gunner.station), 'ball');
  await host.evaluate(() => { sws.game.gunner.requestStation('waistR'); sws.game.gunner.requestStation('waistL'); });
  await step(24);
  report.seatChange = await host.evaluate(() => ({ host: sws.game.gunner.station, crew: sws.game.coop.roster, aiExcluded: [...sws.game.world.remoteStations] }));
  assert.equal(report.seatChange.host, 'waistR'); assert.equal(new Set(report.seatChange.crew.map(p => p.seat)).size, 4);
  // Twelve opponents, over ten simulation seconds.
  await host.evaluate(() => { const w = sws.game.world; for (let i = w.activeEnemies().length; i < 12; i++) w.spawnEnemy(w.formationCenter.clone().add({ x: 1800 + i * 40, y: 400, z: i * 150 }), 'beam', 1, false, false, 'bf109'); });
  const counters = () => host.evaluate(() => ({ t: sws.game.world.time, bytes: sws.game.coop.peers.map(p => p.link.bytesSent), snaps: sws.game.coop.stats.snapsSent, aircraft: sws.game.world.aircraft.length }));
  const before = await counters(); await step(200); const after = await counters();
  report.bandwidth = { aircraft: after.aircraft, seconds: after.t - before.t, snapshots: after.snaps - before.snaps, bytesPerSecond: after.bytes.map((b, i) => Math.round((b - before.bytes[i]) / (after.t - before.t))) };
  console.log('Bandwidth', report.bandwidth); assert(report.bandwidth.bytesPerSecond.every(n => n < 30000));
  // Drop one connection: the other links and score survive; the slot gets a fresh offer.
  const oldSeat = report.links[1].seat;
  await guests[1].evaluate(() => sws.game.coop.leave());
  await host.waitForFunction(() => sws.game.coop.roster.length === 3);
  report.leave = await host.evaluate(() => ({ seats: [...sws.game.world.remoteStations], phase: sws.game.coop.phase, crew: sws.game.coop.crewKills }));
  assert(!report.leave.seats.includes(oldSeat)); assert.equal(report.leave.phase, 'mission');
  await host.waitForFunction(() => sws.game.coop.peers.some(p => p.id === 2 && p.signal));
  await guests[1].evaluate(() => { sws.game.startMenu(); sws.game.coop.screen.menu(); });
  await guests[1].locator('[data-name]').fill('Baker'); await join(guests[1]); await guests[1].waitForFunction(() => sws.game.state === 'playing'); await step(8);
  assert.equal(await host.evaluate(() => sws.game.coop.roster.length), 4);
  report.rejoin = await guests[1].evaluate(() => ({ seat: sws.game.coop.guestSeat, score: sws.game.score, run: sws.game.coop.run }));
  // Authoritative finish and all four personal debriefs; no live leaderboard writes.
  await host.evaluate(() => { const g = sws.game; g.finish(true, 'The mission is over.'); });
  for (let i = 0; i < 160; i++) { await step(); if (await host.evaluate(() => sws.game.state === 'debrief')) break; }
  for (const p of guests) await p.waitForFunction(() => sws.game.state === 'debrief', null, { timeout: 10000 });
  report.results = await Promise.all(pages.map(p => p.evaluate(() => ({ role: sws.game.coop.role, result: sws.game.coop.result, points: sws.game.prog.points }))));
  for (const r of report.results) assert.equal(r.result.crew.score, report.results[0].result.crew.score);
  for (const p of guests) assert.equal(await p.locator('.lb-submit').count(), 0);
  assert.equal(await host.locator('.lb-submit input').inputValue(), 'Reed + Walsh + Baker + أحمد');
  await shot(host, 'host-debrief'); await shot(guests[2], 'guest-debrief');
  const points = await guests[2].evaluate(() => sws.game.prog.points);
  await guests[2].evaluate(() => sws.game.coop.onEvent(sws.game.coop.result)); assert.equal(await guests[2].evaluate(() => sws.game.prog.points), points);
  for (const p of pages) await p.locator('#debrief [data-a=retry]').click();
  for (const p of pages) await p.waitForFunction(() => sws.game.coop.phase === 'lobby');
  await host.screenshot({ path: `${shots}/lobby-four.jpg`, type: 'jpeg', quality: 60 });
  await guests[2].evaluate(() => sws.game.ui.settings(sws.game.settings, () => {}, () => {}));
  await guests[2].locator('[data-lang]').selectOption('ar');
  await guests[2].evaluate(() => sws.game.coop.renderLobby(sws.game.coop.lobbyStatus));
  assert((await guests[2].locator('#coop').innerText()).includes('جاهز'));

  await guests[2].screenshot({ path: `${shots}/lobby-ar.jpg`, type: 'jpeg', quality: 60 });
  for (const p of pages) await p.locator('[data-ready]').click();
  await host.waitForFunction(() => sws.game.coop.partnerReady); await host.locator('[data-start]').click();
  for (const p of pages) await p.waitForFunction(() => sws.game.coop.run === 2 && sws.game.state === 'playing');
  await step(4);
  await host.evaluate(() => sws.game.coop.leave());
  for (const p of guests) await p.waitForFunction(() => sws.game.coop.phase === 'idle');
  assert.deepEqual(errors, []); report.errors = errors;
  fs.writeFileSync(`${shots}/verification.json`, JSON.stringify(report, null, 2));
  console.log('PASS: four-tab crew, late join/rejoin, fire, ping, bandwidth, debrief, replay, cleanup');
} catch (e) {
  report.errors = errors; report.failure = String(e); fs.writeFileSync(`${shots}/verification-failed.json`, JSON.stringify(report, null, 2));
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `/tmp/crew-failed-${i}.jpg`, type: 'jpeg', quality: 60 }).catch(() => {});
  throw e;
} finally {
  for (const p of pages) await p.evaluate(() => sws.game.coop.leave()).catch(() => {});
  await new Promise(r => setTimeout(r, 1500)); await browser.close();
}
