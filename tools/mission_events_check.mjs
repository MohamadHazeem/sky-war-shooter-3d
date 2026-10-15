// Phase 11 goal 28: browser check + screenshots of the dynamic in-mission events.
//   npx vite --port 5428 --strictPort &   then
//   PLAYWRIGHT_MODULE=/abs/playwright/index.mjs node tools/mission_events_check.mjs [events...]
// Playwright's bundled headless shell only (no channel: 'chrome'). Starts a gunner campaign mission,
// plays each event with sws.missionEvent(id), drives frames with sws.step, saves a JPEG at the event's
// key moment to docs/phase11/shots/28/ and fails on page errors, shader compiles during an event or
// anything an event leaves behind. 'pacing' runs the director on its own for a few minutes of
// mission time and reports what it started (and that nothing overlapped).
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const URL = process.env.SWS_URL ?? 'http://127.0.0.1:5428';
const OUT = 'docs/phase11/shots/28';
await fs.mkdir(OUT, { recursive: true });

// event id -> [seconds into the event for the shot, station]
const SHOTS = {
  nearMiss: [2.0, 'waistL'], friendlyExplodes: [3.1, 'waistL'], bailout: [8.5, 'waistL', -0.08], jamming: [3, 'waistL'],
  oxygenFire: [1.6, 'waistL'], gunnerFreezes: [2, 'waistL'], salute: [9.6, 'waistL'], lostMustang: [8.5, 'waistL'],
  cookOff: [2.2, 'waistL'], weatherWall: [9, 'top', 0.05], flakWalk: [3.95, 'waistL'], runawayProp: [3, 'waistL'],
  redFlares: [1.9, 'waistL'], enemyBailout: [4.6, 'waistL'], yellowNoses: [6, 'top'], sunBandits: [5, 'top'],
  chaff: [3, 'waistL'], oxygenCheck: [5, 'waistL'], tightenUp: [7, 'waistL'], strayTracers: [0.7, 'waistL'],
  escortHome: [3.5, 'waistL'], brassRain: [2, 'waistL'],
};
const args = process.argv.slice(2);
const pick = args.filter((a) => SHOTS[a]);
const only = pick.length || args.length ? pick : Object.keys(SHOTS);
const extras = args.length ? args.filter((a) => !SHOTS[a]) : ['full', 'ar', 'phone', 'pacing'];

function quiet() {
  // the shots stage events one by one: the director's waves, set pieces, objectives and random events wait
  const g = sws.game, mr = g.midRound;
  for (const f of g.world.fighters('axis')) f.remove = true;
  g.pacing.hushUntil = 1e9;
  mr.setPieces.stop(); mr.setPieces.count = 99;
  mr.eventCd = 1e9; mr.objSlots = [];
  if (mr.event) { mr.event.cancel(mr); mr.finishEvent(mr.event); }
  if (mr.objective) { mr.objective.cancel(mr); mr.finishObjective(mr.objective, true); }
  mr.events.check = 1e9;   // and the event director itself (only sws.missionEvent starts one)
}

const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
const results = [], errors = [];
async function open(lang, viewport, hudDetail = 'standard') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route(/https:\/\/(?!(?:fonts\.googleapis\.com|fonts\.gstatic\.com)\/).*(googleapis|firebaseio|firestore|identitytoolkit|securetoken).*/, (r) => r.abort());
  await context.addInitScript(({ lang, hudDetail }) => {
    localStorage.setItem('sws3d.lang', lang);
    localStorage.setItem('sws3d.settings.v2', JSON.stringify({ quality: 'medium', bookends: false, combatDirector: 'off', hudDetail }));
    localStorage.setItem('sws3d.onboarding.v1', JSON.stringify({ promptDismissed: true }));
    let seed = 28; Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  }, { lang, hudDetail });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(URL);
  await page.waitForFunction(() => window.sws?.assetsReady(), null, { timeout: 180000 });
  await page.evaluate(() => { sws.engine.loopOverride = () => {}; sws.game.input.lock = () => {}; });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function startMission(page) {
  await page.evaluate(`window.__quiet = ${quiet.toString()}`);
  await page.evaluate(() => {
    const g = sws.game;
    g.bookends.auto = true;
    g.startMission(sws.CAMPAIGN[0]);
    sws.step(60 * 12, 1 / 60);
    g.ui.fade(false);
    g.midRound.events.reset();
    window.__quiet();
  });
  // MissionFlow's start-of-mission pilot line runs on a 2.5 s real-time timer: let it play out
  // before the event, so the subtitle in the shot is the event's own
  await page.waitForTimeout(3200);
  await page.evaluate(() => { sws.step(30, 1 / 60, false); window.__quiet(); });
}
// One event, played to its key moment in the gun's view and photographed with its own radio line on
// screen. Subtitles appear on a real-time timer (WorldEvents: the interphone click comes first), so
// the frames are driven in chunks with a real pause after each of the event's lines.
async function play(page, id, at, station, name = id, pitch = null) {
  const r = await page.evaluate(({ id, station, pitch }) => {
    const g = sws.game;
    if (g.state !== 'playing') return { id, error: `state ${g.state}` };
    if (g.gunner.station !== station) { g.gunner.requestStation(station); sws.step(70, 1 / 60, false); }
    const st = g.gunner.states.get(station);
    if (pitch !== null && st) { st.pitch = st.tPitch = pitch; st.yaw = st.tYaw = 0; }
    window.__quiet();
    window.__programs = g.engine.renderer.info.programs.length;
    return { id, started: sws.missionEvent(id) };
  }, { id, station, pitch });
  if (r.error) { results.push(r); console.log(JSON.stringify(r)); return; }
  await page.waitForTimeout(380);   // lines spoken on the event's first frame
  // event time runs negative while a B-17 slides into view first
  for (let guard = 0; guard < 400; guard++) {
    const s = await page.evaluate(({ at }) => {
      const g = sws.game, ev = g.midRound.events, said = ev.said;
      for (let i = 0; i < 60 * 40 && ev.active && ev.t < at && ev.said === said; i++) sws.step(1, 1 / 60, false);
      return { done: !ev.active || ev.t >= at, spoke: ev.said !== said };
    }, { at });
    if (s.spoke) await page.waitForTimeout(380);   // the line's subtitle
    if (s.done) break;
  }
  await page.evaluate(() => sws.step(1, 1 / 60, true));
  await page.waitForTimeout(450);   // banner transition
  Object.assign(r, await page.evaluate(() => {
    const g = sws.game;
    sws.step(1, 1 / 60, true);
    const offer = document.getElementById('bombardier-offer');
    return {
      state: JSON.parse(sws.missionEvent('?')),
      programs: g.engine.renderer.info.programs.length - window.__programs,
      banner: document.querySelector('#evBanner.show')?.innerText.replace(/\n/g, ' · ') ?? null,
      subtitle: document.querySelector('#subs')?.innerText.replace(/\n/g, ' ') ?? '',
      bombRun: !!(g.bombRun.active || (offer && !offer.hidden) || document.body.classList.contains('bomb-run-active')),
      time: +g.world.time.toFixed(1), bombsAway: g.mission?.bombsAway ?? null,
    };
  }));
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 70 });
  // run it out: it must clean up after itself
  r.after = await page.evaluate(({ id }) => {
    const g = sws.game, w = g.world;
    for (let i = 0; i < 26; i++) { window.__quiet(); sws.step(60, 1 / 60, false); }
    const ev = g.midRound.events;
    return { active: ev.active?.id ?? null, jammed: ev.jammed, frozen: [...w.frozenStations], log: ev.log.filter((l) => l.includes(id)) };
  }, { id });
  results.push(r);
  console.log(JSON.stringify(r));
}

try {
  if (only.length) {
    const { context, page } = await open('en', { width: 1280, height: 720 });
    for (const id of only) {
      const [at, station, pitch = null] = SHOTS[id];
      // a fresh mission for every event: each is shot well clear of the bomb run's lead-in
      await startMission(page);
      await play(page, id, at, station, id, pitch);
    }
    await context.close();
  }
  // extra views (each on a fresh mission): HUD detail Full shows the event banner and the station
  // bar (Standard keeps to the radio subtitles, Phase 8), Arabic, a phone
  const views = [
    ['full', 'en', { width: 1280, height: 720 }, 'full', [['salute', 'salute-full'], ['bailout', 'bailout-full'], ['gunnerFreezes', 'gunnerFreezes-full']]],
    ['ar', 'ar', { width: 1280, height: 720 }, 'full', [['salute', 'salute-ar'], ['jamming', 'jamming-ar']]],
    ['phone', 'en', { width: 844, height: 390 }, 'full', [['bailout', 'bailout-phone']]],
  ];
  for (const [key, lang, viewport, hud, list] of views) {
    if (!extras.includes(key)) continue;
    const { context, page } = await open(lang, viewport, hud);
    for (const [id, name] of list) {
      const [at, station, pitch = null] = SHOTS[id];
      await startMission(page);
      await play(page, id, at, station, name, pitch);
    }
    await context.close();
  }
  if (extras.includes('pacing')) {
    // the director on its own: full gunner campaign missions under the autoplay bot (sws.autoplay)
    const { context, page } = await open('en', { width: 960, height: 540 });
    await page.waitForFunction(() => typeof window.sws?.autoplay === 'function', null, { timeout: 60000 });
    for (const n of [1, 2, 4]) {   // the 2nd, 3rd and 5th gunner missions of the campaign
      const p = await page.evaluate((n) => {
        const g = sws.game, mr = g.midRound, ev = mr.events;
        const overlaps = [];
        let samples = 0;
        const upd = ev.update.bind(ev);
        ev.update = (dt, boss, busy) => {
          upd(dt, boss, busy);
          samples++;
          const on = [ev.active && `event28:${ev.active.id}`, mr.event && `random:${mr.event.id}`, mr.setPieces.active && `setPiece:${mr.setPieces.active.id}`].filter(Boolean);
          if (on.length > 1 && overlaps.length < 20) overlaps.push(`${g.world.time.toFixed(0)}s ${on.join('+')}`);
        };
        const m = sws.CAMPAIGN.filter((c) => (c.role ?? 'gunner') === 'gunner' && !c.tutorial)[n];
        let summary = '';
        try { summary = sws.autoplay(m, 9000).split('\n').slice(-2).join(' | '); } finally { ev.update = upd; }
        return { mission: m.title, time: +g.world.time.toFixed(0), result: g.endResult, summary, samples, events: ev.log.slice(), midRound: mr.log.slice(), setPieces: mr.setPieces.log.slice(), overlaps };
      }, n);
      results.push({ id: `pacing-${n}`, ...p });
      console.log(JSON.stringify(p));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 1));
}
const bad = results.filter((r) => r.error || r.bombRun || (r.programs ?? 0) > 0 || r.after?.active || r.after?.jammed || r.after?.frozen?.length || (r.overlaps?.length ?? 0) > 0);
console.log(`errors: ${errors.length}, problems: ${bad.length}`);
if (errors.length || bad.length) { console.error(errors, bad.map((b) => b.id)); process.exit(1); }
