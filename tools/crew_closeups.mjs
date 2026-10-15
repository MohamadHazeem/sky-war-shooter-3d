// Crew close-ups (Phase 11 goal 05): fixed 0.5-3 m views of the B-17 crewmen, built on the visual
// rig's frozen `waist-interior` fixture (same seed, weather and steps), so before / after are
// comparable. Start Vite first, then:
//   node tools/crew_closeups.mjs --out docs/phase11/shots/05/after [--url http://127.0.0.1:5325] [--quality high]
// Views (cameras placed relative to the man's bones in the bomber frame):
//   crew-face      0.6 m, head and shoulders, from the player's side (he glances across, Crew 2.0)
//   crew-body      1.7 m, the man at the right waist gun from the player's side
//   crew-fire      1.3 m, firing at an Fw 190 crossing his window (recoil, aim tracking)
//   crew-point     1.7 m, calling a Bf 109 closing on the player's side (Crew 2.0: he points at it)
//   crew-flinch    0.6 m, a cannon shell through the skin beside him (Crew 2.0: he ducks, eyes shut)
//   crew-down      1.9 m, the same man wounded on the walkway, a crewman kneeling by him
//   crew-radio     0.7 m, the radio operator at his sets
// Uses the Playwright bundled headless shell only (never the Chrome app). Writes JPEGs + a contact sheet.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { smallJpeg } from './visual_rig.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('out', 'docs/phase11/shots/05/after'));
const base = arg('url', 'http://127.0.0.1:5325');
const quality = arg('quality', 'high');
const only = arg('shots', '');
const VIEWS = ['crew-face', 'crew-body', 'crew-fire', 'crew-point', 'crew-flinch', 'crew-down', 'crew-radio'].filter(v => !only || only.split(',').includes(v));

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(path.isAbsolute(c) ? pathToFileURL(c).href : c)); break; } catch { /* next */ }
}
if (!chromium) throw new Error('No Playwright installation found (set PLAYWRIGHT_MODULE)');
await fs.mkdir(out, { recursive: true });
// the bundled headless shell (whichever revision is installed), never the Chrome app
let executablePath = process.env.PLAYWRIGHT_EXECUTABLE;
if (!executablePath) {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = (await fs.readdir(cache).catch(() => [])).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const exe = path.join(cache, d, `chrome-headless-shell-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'chrome-headless-shell');
    if (await fs.access(exe).then(() => true, () => false)) { executablePath = exe; break; }
  }
}
const browser = await chromium.launch({ headless: true, executablePath, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : []), '--enable-gpu'] });

// In-page: place the camera for one view (after any staging steps), returns a description
async function stage(page, view) {
  return page.evaluate(async (view) => {
    const { engine, game } = window.visualRig;
    const V3 = engine.camera.position.constructor, THREE = { Vector3: V3 };
    const w = game.world, gun = game.gunner, living = gun.living, cam = engine.camera;
    const dt = 1 / 60;
    const step = (n) => { for (let i = 0; i < n; i++) { w.time += dt; engine.time += dt; w.update(dt); gun.update(dt); } };
    const s = living.st;
    const b = w.playerBomber;
    // face and body views: from the player's side (his eye after a few frames at the gun); the
    // other gunner glances across at him where the build has that behaviour (Crew 2.0)
    if (view === 'crew-face' || view === 'crew-body') { if ('glanceT' in s) s.glanceT = -0.05; step(45); }
    if (view.startsWith('crew-point') || view === 'crew-flinch') step(45);
    const eye = cam.getWorldPosition(new THREE.Vector3());
    if (view.startsWith('crew-point')) {
      // a Bf 109 closing from high on the player's (left) side, 450 m out
      const rel = new THREE.Vector3(380, 120, 200);
      const f = w.spawnEnemy(b.localToWorld(rel.clone()), 'beam', 1, false, false, 'bf109');
      if ('callT' in s) { s.threat = f; s.callT = 3; s.callCool = 10; }
      for (let i = 0; i < 50; i++) {
        w.time += dt; engine.time += dt; w.update(dt);
        f.pos.copy(b.localToWorld(rel.clone().multiplyScalar(1 - i * 0.002))); f.root.position.copy(f.pos); f.vel.copy(b.vel);
        gun.update(dt);
      }
    }
    if (view === 'crew-flinch') {
      // a cannon shell through the skin half a metre from his head
      const near = b.root.worldToLocal(s.man.bone.head.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(-0.35, 0.25, 0.45));
      game.gunner.fuselageHit(near, new THREE.Vector3(1, -0.2, 0));
      step(7);
    }
    if (view === 'crew-fire') {
      // an Fw 190 crossing 160 m off the right waist window, the AI gunner on it
      const p = b.localToWorld(new THREE.Vector3(-160, 25, -30));
      const f = w.spawnEnemy(p, 'beam', 1, false, false, 'fw190');
      f.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1).applyQuaternion(b.quat));
      const g = w.crewGunner(s.id);
      for (let i = 0; i < 36; i++) {
        w.time += dt; engine.time += dt; w.update(dt);
        f.pos.copy(b.localToWorld(new THREE.Vector3(-160, 25, -30 + i * 0.4))); f.root.position.copy(f.pos);
        if (g) { g.target = f; g.burst = 0.5; }
        gun.update(dt);
      }
    }
    if (view === 'crew-down') { w.crew.wound(s.crew); step(420); }
    const man = view === 'crew-radio' ? living.radioActor : (view === 'crew-down' ? s.down : s.man);
    if (!man) return { error: 'no crewman for ' + view };
    man.root.updateMatrixWorld(true);
    // bomber frame (+X left wing, +Y up, +Z nose) relative to his bones: the views follow the man
    const loc = (o) => b.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const H = loc(man.bone.head), Hp = loc(man.bone.hips), hl = loc(man.bone.handL), hr = loc(man.bone.handR);
    // the face centre: the eyelid bone (Crew 2.0) or 11 cm up the head bone (older builds)
    const E = man.bone.lids ? loc(man.bone.lids) : b.root.worldToLocal(man.bone.head.localToWorld(new THREE.Vector3(0, 0.11, 0)));
    const Q = (base, x, y, z) => b.root.localToWorld(new THREE.Vector3(base.x + x, base.y + y, base.z + z));
    const toEye = b.root.worldToLocal(eye.clone()).sub(E).normalize();
    // the way he stands facing (bomber frame); the face view sits between that and the player's eye
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(man.root.getWorldQuaternion(b.quat.clone())).applyQuaternion(b.quat.clone().invert());
    const fv = toEye.clone().multiplyScalar(0.55).add(fwd.clone().multiplyScalar(0.45)).normalize();
    let from, at, fov = 50;
    if (view === 'crew-face') { from = Q(E, fv.x * 0.6, fv.y * 0.6 + 0.04, fv.z * 0.6); at = Q(E, 0, -0.035, 0); fov = 40; }
    if (view === 'crew-flinch') { from = Q(E, -0.27, -0.12, 0.55); at = Q(E, 0, -0.14, 0); fov = 46; }
    if (view === 'crew-body') { from = Q(E, toEye.x * 1.7, toEye.y * 1.7 + 0.3, toEye.z * 1.7); at = Q(E, 0, -0.5, 0); fov = 58; }
    if (view === 'crew-point') { from = Q(E, 0.3, 0.12, 0.85); at = Q(E, 0.05, -0.25, 0); fov = 60; }
    if (view === 'crew-hands') { const m = hl.clone().add(hr).multiplyScalar(0.5); from = Q(m, -0.15, 0.5, 0.3); at = Q(m, 0, 0, 0); fov = 50; }
    if (view === 'crew-fire') { from = Q(H, 0.35, 0.3, 1.0); at = Q(H, -0.3, -0.3, 0); fov = 55; }
    if (view === 'crew-down') { from = Q(E, -0.35, 0.8, 0.45); at = Q(E, 0, 0, 0.15); fov = 55; }
    if (view === 'crew-radio') { from = Q(E, 0.3, 0.2, -0.5); at = Q(E, 0, -0.12, 0); fov = 52; }
    cam.position.copy(from); cam.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(b.quat)); cam.lookAt(at); cam.fov = fov;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    engine.post.resetHistory(); engine.clouds.resetHistory();
    for (let i = 0; i < 24; i++) engine.frame(0, false);
    return { view, clip: man.clip, distance: from.distanceTo(at), E: E.toArray().map(x => +x.toFixed(2)), from: b.root.worldToLocal(from.clone()).toArray().map(x => +x.toFixed(2)), eye: b.root.worldToLocal(eye.clone()).toArray().map(x => +x.toFixed(2)) };
  }, view);
}

const shots = [];
for (const view of VIEWS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const target = new URL('/tools/visual-rig.html', base);
  for (const [k, v] of Object.entries({ shot: 'waist-interior', backend: 'webgl2', quality, seed: '19431008' })) target.searchParams.set(k, v);
  await page.goto(target.href);
  await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout: 240000 });
  const fail = await page.evaluate(() => window.visualRig.error);
  if (fail) throw new Error(fail);
  const info = await stage(page, view);
  if (info.error) { console.log(info.error); await context.close(); continue; }
  const data = await page.evaluate(() => window.visualRig.png());
  const png = Buffer.from(data.split(',')[1], 'base64');
  await fs.writeFile(path.join(out, `${view}.jpg`), await smallJpeg(png, 1280));
  console.log(view, JSON.stringify(info), errors.length ? errors : '');
  shots.push(view);
  await context.close();
}
await browser.close();
// contact sheet, 3 across
const tw = 640, th = 360, cols = 3;
const tiles = await Promise.all(shots.map(async (id, i) => {
  const img = await sharp(path.join(out, `${id}.jpg`)).resize(tw, th - 24).extend({ bottom: 24, background: '#171b20' }).png().toBuffer();
  const label = Buffer.from(`<svg width="${tw}" height="${th}"><text x="10" y="${th - 7}" fill="white" font-size="15" font-family="sans-serif">${id}</text></svg>`);
  return { input: await sharp(img).composite([{ input: label }]).png().toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th };
}));
const sheet = await sharp({ create: { width: cols * tw, height: Math.ceil(shots.length / cols) * th, channels: 3, background: '#171b20' } }).composite(tiles).png().toBuffer();
await fs.writeFile(path.join(out, 'contact-sheet.jpg'), await smallJpeg(sheet, 1920));
console.log('wrote', out);
