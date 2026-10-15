// Phase 11 goal 10 shots: campaign map, War industry card, industry map (desktop + phone) and the
// newsreel, all from ONE game state (story ops 1–11 flown, all successes, 2 of 12 bombers lost each).
// Vite must be running: node tools/strategic_shots.mjs [port=5310]
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const port = process.argv[2] ?? '5310', out = 'docs/phase11/shots/10';
const browser = await chromium.launch({ headless: true });
const report = {};
try {
  for (const lang of ['en', 'ar']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((lang) => {
      if (sessionStorage.getItem('sw-shots')) return;
      sessionStorage.setItem('sw-shots', '1');
      localStorage.clear();
      localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'low', bookends: false, analytics: false }));
      localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
      localStorage.setItem('sws3d.lang', lang);
    }, lang);
    await page.goto(`http://127.0.0.1:${port}`);
    await page.waitForFunction(() => window.sws?.game, null, { timeout: 180000 });
    const state = await page.evaluate(async () => {
      const { recordCampaignOutcome, loadCampaign, campaignIndustry, defaultCampaign, saveCampaign } = await import('/src/game/CampaignState.ts');
      saveCampaign(defaultCampaign(1943)); // fixed seed: EN and AR shots show the same bomb patterns
      const { loadStrategic } = await import('/src/game/StrategicWar.ts');
      const g = sws.game; sws.engine.loopOverride = () => {}; g.input.lock = () => {};
      const progress = g.progress;
      let reel = null;
      for (let i = 0; i <= 10; i++) {
        progress.unlocked = i + 1; // Game moves unlocked on before the debrief records the result
        reel = recordCampaignOutcome(sws.CAMPAIGN[i], { success: true, kills: 8, bombersLost: 2, bombersTotal: 12 }, progress).newsreel;
      }
      g.saveProgress();
      window.__reel = reel;
      const c = loadCampaign(progress), d = loadStrategic(c);
      return { done: c.storyDone.length, sectors: d.sectors ?? null, factors: campaignIndustry(c), headline: reel?.headline, lines: reel?.lines?.length };
    });
    report[lang] = state;
    await page.evaluate(() => sws.game.showCampaign());
    await page.waitForSelector('.sw-card');
    await page.waitForTimeout(800); // bar transitions
    const cardPct = await page.$$eval('.sw-card .sw-sec b', (b) => b.map((x) => x.textContent));
    await page.screenshot({ path: `${out}/map-${lang}.jpg`, type: 'jpeg', quality: 70 });
    await page.locator('.sw-card').screenshot({ path: `${out}/card-${lang}.jpg`, type: 'jpeg', quality: 80 });
    await page.locator('[data-sw-map]').click();
    await page.waitForTimeout(800);
    const mapPct = await page.$$eval('.sw-map .sw-sec b', (b) => b.map((x) => x.textContent));
    assert.deepEqual(mapPct, cardPct, 'card and overlay show the same state');
    report[lang].pct = cardPct;
    await page.screenshot({ path: `${out}/industry-map-${lang}.jpg`, type: 'jpeg', quality: 75 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => {
      const card = document.querySelector('.sw-map .cm-card').getBoundingClientRect();
      const btn = document.querySelector('[data-sw-back]').getBoundingClientRect();
      const body = document.querySelector('.sw-map .sw-body');
      const hit = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
      return { card: [card.top, card.bottom], btn: [btn.top, btn.bottom], bodyScroll: body.scrollHeight - body.clientHeight,
        bgAlpha: getComputedStyle(document.querySelector('.sw-map .cm-card')).backgroundColor, backOnTop: !!hit?.closest('[data-sw-back]'),
        focused: document.activeElement?.hasAttribute('data-sw-back') };
    });
    assert.ok(phone.btn[0] >= phone.card[0] && phone.btn[1] <= phone.card[1] && phone.btn[1] <= 844, `Back inside the dialog on phone: ${JSON.stringify(phone)}`);
    assert.ok(phone.backOnTop, 'Back is not covered');
    report[lang].phone = phone;
    await page.screenshot({ path: `${out}/industry-map-phone-${lang}.jpg`, type: 'jpeg', quality: 75 });
    // the newsreel card of the last operation (Big Week), mounted as the debrief does
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(async () => {
      document.querySelector('.sw-map')?.remove();
      const { mountNewsreel } = await import('/src/ui/StrategicPanel.ts');
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:40px auto auto 40px;width:640px;z-index:99;background:#0d0d0a;padding:0';
      host.id = 'sw-reel-host';
      document.body.appendChild(host);
      mountNewsreel(host, window.__reel);
    });
    await page.waitForTimeout(2600); // headline flicker
    report[lang].reel = await page.locator('.sw-reel').innerText();
    await page.locator('.sw-reel').screenshot({ path: `${out}/newsreel-${lang}.jpg`, type: 'jpeg', quality: 80 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
