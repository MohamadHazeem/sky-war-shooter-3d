// Run Vite on 5313, then PLAYWRIGHT_MODULE=/installed/playwright/index.mjs node tools/voice/browser_check.mjs
// Uses installed Playwright only. No live account writes or application-code changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const shots = 'docs/phase6/shots/13';
await fs.mkdir(shots, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('sws3d.seenVersion', '1.0');
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', radio: true, analytics: false }));
  });
  await page.goto('http://127.0.0.1:5313/');
  await page.waitForFunction(() => window.sws?.step && window.sws?.assetsReady(), { timeout: 120000 });
  await page.evaluate(() => {
    window.sws.game.settings.quality = 'low';
    window.sws.game.applySettings();
    window.sws.step(2, 1 / 60, true);
  });
  const quality = JSON.parse(await fs.readFile('tools/voice/.cache/quality.json', 'utf8'));
  const samples = Object.entries(quality).filter(([, q]) => q.engine === 'chatterbox' && q.durationOK).map(([id]) => id);
  assert.equal(samples.length, 51);
  const result = await page.evaluate(async ids => {
    const manifest = await (await fetch('/audio/voice/manifest.json')).json();
    const ctx = new OfflineAudioContext(1, 1, 16000);
    const decoded = [];
    for (const id of ids) {
      const clip = manifest.clips[id];
      const response = await fetch('/audio/voice/' + clip.file);
      if (!response.ok) throw new Error(`missing ${id}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (buffer.numberOfChannels !== 1 || Math.abs(buffer.duration - clip.dur) > .15) throw new Error(`invalid ${id}`);
      decoded.push({ id, duration: buffer.duration, sampleRate: buffer.sampleRate });
    }
    const { sound } = await import('/src/audio/Sound.ts');
    const { voice } = await import('/src/audio/Voice.ts');
    sound.init();
    await sound.ctx.resume();
    await voice.load();
    window.sws.game.bookends.auto = true;
    window.sws.game.startMission(window.sws.CAMPAIGN[0]);
    window.sws.step(180, 1 / 60, true);
    await new Promise(resolve => setTimeout(resolve, 700));
    voice.stop();
    const radio = ids.find(id => manifest.clips[id].role === 'pilot');
    window.sws.game.world.callout('phase6_voice_test', 'Pilot', manifest.clips[radio].text, 0, 3);
    const queued = voice.playing?.item.ids.includes(radio) || voice.queue.some(item => item.ids.includes(radio));
    const duplicateRejected = !voice.say(radio, { priority: 3 });
    window.sws.step(3, 1 / 60, true);
    return { decoded, queued, duplicateRejected, radioText: manifest.clips[radio].text, manifestClips: Object.keys(manifest.clips).length, quality: window.sws.game.settings.quality };
  }, samples);
  assert.equal(result.queued, true);
  assert.equal(result.duplicateRejected, true);
  await page.waitForFunction(async () => (await import('/src/audio/Voice.ts')).voice.playing?.srcs.length > 0);
  await page.waitForFunction(text => document.getElementById('subs')?.textContent.includes(text), result.radioText);
  await page.evaluate(() => window.sws.step(2, 1 / 60, true));
  await page.screenshot({ path: `${shots}/radio-sample.jpg`, type: 'jpeg', quality: 65 });
  await page.evaluate(async () => {
    (await import('/src/audio/Voice.ts')).voice.stop();
    window.sws.game.startMenu();
    window.sws.game.showBriefing(window.sws.CAMPAIGN[0]);
    window.sws.step(2, 1 / 60, true);
  });
  if (await page.locator('.bx-play').getAttribute('aria-pressed') !== 'true') await page.locator('.bx-play').click();
  await page.waitForFunction(async () => !!(await import('/src/audio/BriefingVoice.ts')).briefingVoice.src);
  await page.locator('.bx-reading').waitFor();
  await page.screenshot({ path: `${shots}/briefing-sample.jpg`, type: 'jpeg', quality: 65 });
  await page.evaluate(async () => (await import('/src/audio/BriefingVoice.ts')).briefingVoice.stop());
  assert.deepEqual(errors, []);
  result.errors = errors;
  await fs.writeFile(`${shots}/browser-results.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ decoded: result.decoded.length, queued: result.queued, quality: result.quality, errors }));
} finally {
  await browser.close();
}
