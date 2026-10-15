// Phase 11 · 33 crew intercom, end to end: three headless Chromium tabs (host + two guests, the
// second in Arabic at phone size) over real Firestore signalling and WebRTC, with Chromium's fake
// microphone (a periodic beep). Checks that a guest's voice reaches the host and is relayed to the
// other guest (inbound RTP bytes on the right slot + signal at the radio filter's output), that the
// host's voice reaches both guests, that the talking indicator names the speaker, that mute
// silences playback, and that leaving frees the microphone.
// Usage: npx vite --port 5333 --strictPort & node tools/intercom_check.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const PORT = process.env.PORT ?? 5333;
const browser = await chromium.launch({ headless: true, executablePath: process.env.HEADLESS_SHELL || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const shots = 'docs/phase11/shots/33'; fs.mkdirSync(shots, { recursive: true });
const errors = [], report = {}, pages = [];
const make = async (name, lang = 'en', viewport = { width: 1200, height: 800 }) => {
  const context = await browser.newContext({ viewport, permissions: ['microphone'], hasTouch: viewport.height < 600 });
  await context.addInitScript(([l]) => { localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', gfxAuto: 'done', volume: 0, radio: false, music: false })); localStorage.setItem('sws3d.lang', l); }, [lang]);
  const page = await context.newPage(); pages.push(page); page.on('pageerror', e => errors.push(name + ': ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/`); await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 120000 });
  await page.evaluate(async () => {
    sws.engine.renderer.setAnimationLoop(null); sws.game.input.lock = () => {}; sws.game.coop.screen.menu();
    const { sound } = await import('/src/audio/Sound.ts'); sound.init(); window.qaSound = sound;
  });
  await page.locator('[data-name]').fill(name);
  return page;
};
// inbound audio bytes per slot of every link (host: per guest link; guest: its host link)
const inbound = p => p.evaluate(async () => {
  const c = sws.game.coop, links = c.voiceLinks(), out = {};
  for (const l of links) {
    const ts = l.pc.getTransceivers().filter(t => t.receiver.track.kind === 'audio');
    out[l.id] = await Promise.all(ts.map(async t => { let b = 0; (await t.receiver.getStats()).forEach(s => { if (s.type === 'inbound-rtp') b += s.bytesReceived; }); return b; }));
  }
  return out;
});
// peak level at the crew-voice bus (after the radio filter) over ~1.5 s of wall time
const busPeak = p => p.evaluate(async () => {
  const ctx = qaSound.ctx, bus = qaSound.voiceBus();
  window.qaAn ??= (() => { const a = ctx.createAnalyser(); a.fftSize = 2048; bus.connect(a); return a; })();
  const buf = new Float32Array(2048); let peak = 0;
  for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 50)); qaAn.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); }
  return peak;
});
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  const host = await make('Reed'), g1 = await make('Walsh'), g2 = await make('أحمد', 'ar', { width: 844, height: 390 });
  const step = async (n = 1) => { for (let i = 0; i < n; i++) for (const p of pages) await p.evaluate(() => sws.step(3, 1 / 60)); };
  // wait for a talk state, stepping frames meanwhile (the intercom's once-a-second catch-up runs in the frame loop)
  const until = async (p, fn, arg, ms = 60000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await p.evaluate(fn, arg)) return; await step(4); await wait(100); }
    throw new Error('timed out waiting for ' + fn.toString());
  };
  await host.locator('[data-host]').click();
  await host.waitForFunction(() => sws.game.coop.code.length === 6, null, { timeout: 45000 });
  const code = await host.evaluate(() => sws.game.coop.code);
  for (const p of [g1, g2]) {
    await p.locator('.joinrow input').fill(code); await p.locator('[data-join]').click();
    await p.waitForFunction(() => sws.game.coop.connected && sws.game.coop.roster.length > 1, null, { timeout: 120000 });
  }
  await host.waitForFunction(() => sws.game.coop.roster.length === 3);
  await step(2);
  report.sdp = await host.evaluate(() => sws.game.coop.peers.filter(p => p.link.status === 'open').map(p => ({ id: p.id, audio: (p.link.pc.remoteDescription.sdp.match(/m=audio/g) || []).length, opus: /opus\/48000/i.test(p.link.pc.remoteDescription.sdp), dirs: p.link.pc.getTransceivers().map(t => t.currentDirection) })));
  console.log('SDP', JSON.stringify(report.sdp));
  assert(report.sdp.every(s => s.audio === 4 && s.opus && s.dirs[0] === 'sendrecv'));
  assert.equal(await host.locator('#coop [data-ic-row]').count(), 2);

  report.idlePeak = await busPeak(g2);   // nobody talking: the crew-voice bus is quiet
  console.log('idle peak', report.idlePeak);
  assert(report.idlePeak < 0.002);
  // ---- lobby: Walsh holds the talk button ----
  let W = await g1.evaluate(() => sws.game.coop.localId);
  const before = { host: await inbound(host), g2: await inbound(g2) };
  await g1.locator('#coop [data-ic-talk]').dispatchEvent('pointerdown', { pointerId: 1 });
  await until(g1, () => sws.game.coop.intercom.net.local);
  await until(host, id => sws.game.coop.intercom.net.isTalking(id), W);
  await until(g2, id => sws.game.coop.intercom.net.isTalking(id), W);
  await step(1);
  report.lobbyPeak = { host: await busPeak(host), g2: await busPeak(g2) };
  const during = { host: await inbound(host), g2: await inbound(g2) };
  const G2 = await g2.evaluate(() => sws.game.coop.localId), silent = [1, 2, 3].find(x => x !== W && x !== G2);
  report.walshTalk = { walshId: W, hostFromWalsh: during.host[W][0] - before.host[W][0], g2SlotWalsh: during.g2[0][W] - before.g2[0][W], g2SilentSlot: during.g2[0][silent] - before.g2[0][silent] };
  console.log('Walsh talking', JSON.stringify(report.walshTalk), JSON.stringify(report.lobbyPeak));
  assert(report.walshTalk.hostFromWalsh > 2000, 'host receives the guest voice');
  assert(report.walshTalk.g2SlotWalsh > 2000, 'the other guest receives the relayed voice on Walsh\'s slot');
  assert(report.walshTalk.g2SilentSlot < 500, 'nothing on a silent slot');
  assert(report.lobbyPeak.host > 0.01 && report.lobbyPeak.g2 > 0.01, 'radio-filtered voice reaches the crew-voice bus');
  await host.evaluate(() => sws.step(1, 1 / 60));
  await host.screenshot({ path: `${shots}/lobby-host-walsh-talking.jpg`, type: 'jpeg', quality: 70 });
  await g2.evaluate(() => document.querySelector('#coop [data-intercom]').scrollIntoView({ block: 'center' }));
  await g2.screenshot({ path: `${shots}/lobby-guest-ar-phone.jpg`, type: 'jpeg', quality: 70 });
  // mute Walsh on the Arabic guest: the bus goes silent while he keeps talking
  await g2.locator(`#coop [data-ic-mute="${W}"]`).click();
  await wait(600);   // past the 0.25 s release tail
  report.mutedPeak = await busPeak(g2);
  console.log('muted peak', report.mutedPeak);
  assert(report.mutedPeak < 0.002, 'mute silences that crewman');
  await g2.locator(`#coop [data-ic-mute="${W}"]`).click();
  await g1.locator('#coop [data-ic-talk]').dispatchEvent('pointerup', { pointerId: 1 });
  await until(host, id => !sws.game.coop.intercom.net.isTalking(id), W);
  await until(g2, id => !sws.game.coop.intercom.net.isTalking(id), W);

  // ---- leaving frees the microphone (and lightens the machine for the mission) ----
  await g1.evaluate(() => sws.game.coop.leave());
  report.micAfterLeave = await g1.evaluate(() => ({ mic: sws.game.coop.intercom.mic, stream: sws.game.coop.intercom.stream, phase: sws.game.coop.phase }));
  assert.equal(report.micAfterLeave.mic, 'off'); assert.equal(report.micAfterLeave.stream, null);
  pages.splice(pages.indexOf(g1), 1); await g1.close();
  await host.waitForFunction(() => sws.game.coop.roster.length === 2, null, { timeout: 30000 });

  // ---- mission: the host talks with the remappable key (Y), the Arabic phone guest with the touch button ----
  for (const p of [host, g2]) await p.locator('#coop [data-ready]').click();
  await host.waitForFunction(() => sws.game.coop.partnerReady);
  await host.evaluate(() => setTimeout(() => document.querySelector('[data-start]').click(), 0));
  for (const p of [host, g2]) await p.waitForFunction(() => sws.game.state === 'playing', null, { timeout: 120000 });
  await step(20);
  const G = await g2.evaluate(() => sws.game.coop.localId);
  const b2 = { host: await inbound(host), g2: await inbound(g2) };
  await host.keyboard.down('KeyY');
  await until(g2, () => sws.game.coop.intercom.net.isTalking(0));
  await g2.locator('#icTalk').dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch' });   // both talking at once
  await until(host, id => sws.game.coop.intercom.net.isTalking(id), G);
  await wait(1200); await step(2);
  const d2 = { host: await inbound(host), g2: await inbound(g2) };
  report.missionTalk = { guestId: G, guestHearsHost: d2.g2[0][0] - b2.g2[0][0], hostHearsGuest: d2.host[G][0] - b2.host[G][0] };
  report.missionPeak = { host: await busPeak(host), g2: await busPeak(g2) };
  console.log('Mission, both talking', JSON.stringify(report.missionTalk), JSON.stringify(report.missionPeak));
  assert(report.missionTalk.guestHearsHost > 2000 && report.missionTalk.hostHearsGuest > 2000);
  assert(report.missionPeak.host > 0.01 && report.missionPeak.g2 > 0.01);
  report.who = { g2: await g2.evaluate(() => [...document.querySelectorAll('#icWho span')].map(s => s.textContent)), host: await host.evaluate(() => [...document.querySelectorAll('#icWho span')].map(s => s.textContent)) };
  console.log('Indicators', JSON.stringify(report.who));
  assert.deepEqual(report.who.g2, ['أنت', 'Reed']); assert.deepEqual(report.who.host, ['You', 'أحمد']);
  for (const p of [g2, host]) await p.evaluate(() => { sws.game.hud.updateHud(); sws.step(1, 1 / 60, true); });
  await g2.screenshot({ path: `${shots}/mission-guest-ar-phone-talking.jpg`, type: 'jpeg', quality: 70 });
  await host.screenshot({ path: `${shots}/mission-host-talking.jpg`, type: 'jpeg', quality: 70 });
  await host.keyboard.up('KeyY');
  await g2.locator('#icTalk').dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch' });
  await until(g2, () => !sws.game.coop.intercom.net.talkers.size);
  await until(host, () => !sws.game.coop.intercom.net.talkers.size);
  await step(2);
  report.whoAfter = await g2.evaluate(() => document.querySelector('#icWho').classList.contains('show'));
  assert.equal(report.whoAfter, false);
  assert.deepEqual(errors, []); report.errors = errors;
  fs.writeFileSync(`${shots}/verification.json`, JSON.stringify(report, null, 2));
  console.log('PASS: crew intercom (3-way relay, filter, mute, key + touch button in mission, indicator, cleanup)');
} catch (e) {
  report.errors = errors; report.failure = String(e); fs.writeFileSync(`${shots}/verification-failed.json`, JSON.stringify(report, null, 2));
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${shots}/failed-${i}.jpg`, type: 'jpeg', quality: 60 }).catch(() => {});
  throw e;
} finally {
  for (const p of pages) await p.evaluate(() => sws.game.coop.leave()).catch(() => {});
  await wait(1500); await browser.close();
}
