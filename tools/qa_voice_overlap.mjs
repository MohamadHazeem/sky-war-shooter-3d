// Phase 9 goal 7: real-time voice overlap check (docs/phase9/reports/07.md). Plays a gunner
// mission in real time (requestAnimationFrame running, audio unlocked) from the briefing, with the
// live Voice / BriefingVoice singletons wrapped to log each line's playback interval, then reports
// any two lines that sound at once. Usage:
//   PLAYWRIGHT_MODULE=/abs/playwright/index.mjs node tools/qa_voice_overlap.mjs [missionIndex] [seconds]
const PORT = process.env.QA_PORT ?? 5297;
const idx = +(process.argv[2] ?? 0), secs = +(process.argv[3] ?? 120);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route(/https:\/\/.*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
await ctx.addInitScript(() => {
  localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', graphicsMode: 'manual', bookends: false }));
  localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true, tutorialDone: true, missions: 5 }));
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.sws?.qa, null, { timeout: 240000 });
await page.mouse.click(640, 700);   // a gesture: audio context starts
await page.evaluate(async () => {
  // the app's own module instances (Vite adds a version query to each import)
  const url = (p) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(p)) ?? p;
  const { voice } = await import(url('/src/audio/Voice.ts'));
  const { briefingVoice } = await import(url('/src/audio/BriefingVoice.ts'));
  const log = (window.__voiceLog = []);
  const vPlay = voice.play.bind(voice);
  voice.play = (ctx, item) => { const r = vPlay(ctx, item); const p = voice.playing; if (p) log.push({ src: 'radio', ids: item.ids.join('+'), t0: ctx.currentTime, p }); return r; };
  const bPlay = briefingVoice.playBuf.bind(briefingVoice);
  briefingVoice.playBuf = (ctx, bus, buf, run) => { log.push({ src: 'briefing', t0: ctx.currentTime, t1: ctx.currentTime + buf.duration, ctx }); return bPlay(ctx, bus, buf, run); };
  const bStop = briefingVoice.stop.bind(briefingVoice);   // cut short: the line ends now, not at its length
  briefingVoice.stop = () => { for (const l of log) if (l.src === 'briefing' && l.t1 > l.ctx.currentTime) l.t1 = l.ctx.currentTime; return bStop(); };
  const vFinish = voice.finish.bind(voice);
  voice.finish = (p) => { const e = log.find((l) => l.p === p && l.t1 === undefined); if (e) e.t1 = p.ctx.currentTime; return vFinish(p); };
});
// briefing first (the officer starts reading), then Go after a few seconds: the mission's radio
await page.evaluate((i) => sws.game.showBriefing(sws.CAMPAIGN[i]), idx);
await page.waitForTimeout(6000);
await page.evaluate(() => document.querySelector('#briefing [data-go]').click());
await page.waitForTimeout(secs * 1000);
const res = await page.evaluate(() => {
  const L = window.__voiceLog.map((l) => ({ src: l.src, ids: l.ids, t0: +l.t0.toFixed(2), t1: l.t1 === undefined ? null : +l.t1.toFixed(2) }));
  const over = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], a1 = a.t1 ?? Infinity, b1 = b.t1 ?? Infinity;
    if (Math.min(a1, b1) - Math.max(a.t0, b.t0) > 0.05) over.push([a, b]);
  }
  return { lines: L.length, radio: L.filter((l) => l.src === 'radio').length, briefing: L.filter((l) => l.src === 'briefing').length, overlaps: over, state: sws.game.state };
});
console.log(JSON.stringify({ mission: idx, seconds: secs, ...res, errors }, null, 1));
await browser.close();
