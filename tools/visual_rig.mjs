import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { parseArgs } from './visual_metrics.mjs';
import { scoreCaptures } from './visual_score.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalog = JSON.parse(await fs.readFile(new URL('./visual-shots.json', import.meta.url), 'utf8'));
export async function smallJpeg(source, width = 960) {
  for (let quality = 82; quality >= 34; quality -= 8) {
    const buffer = await sharp(source).resize({ width, withoutEnlargement: true }).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= 250000) return buffer;
  }
  throw new Error('JPEG exceeds 250 KB budget');
}
export function referenceCamera(reference, metadata) {
  assert.ok(reference.complete, 'Camera reference must be complete');
  const shot = reference.shots.find(s => s.shot === metadata.shot);
  assert.ok(shot, 'Camera reference must contain the shot');
  for (const key of ['version', 'seed', 'backend', 'quality', 'weather', 'viewport', 'renderSize', 'steps'])
    assert.deepEqual(shot[key], metadata[key], `Camera reference: matching ${key}`);
  return shot.camera;
}
export async function captureRig(argv) {
  const args = parseArgs(argv, { out: 'docs/phase10/shots/baseline', url: 'http://127.0.0.1:5300', backend: 'webgl2', quality: 'high', seed: '19431008', shots: '', 'camera-from': '', 'verify-repeat': false, help: false }, ['verify-repeat', 'help']);
  if (args.help) {
    console.log('node tools/visual_rig.mjs --out docs/phase10/shots/<goal>/after [--url http://127.0.0.1:5300] [--backend webgl2|webgpu] [--quality low|medium|high|ultra|cinematic] [--seed uint32] [--shots id,id] [--camera-from baseline/manifest.json] [--verify-repeat]\nStart Vite separately. Uses installed Playwright/Chrome; PLAYWRIGHT_MODULE can name an existing module path. No dependency downloads. Each shot uses a new isolated page. PNGs are ignored by git; commit JPEGs and metadata only.');
    return;
  }
  if (!['webgl2', 'webgpu'].includes(args.backend) || !['low', 'medium', 'high', 'ultra', 'cinematic'].includes(args.quality)) throw new Error('Invalid backend or quality');
  if (!/^\d+$/.test(args.seed) || Number(args.seed) > 0xffffffff) throw new Error('Seed must be a uint32');
  const ids = args.shots ? args.shots.split(',') : catalog.map(s => s.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !catalog.some(s => s.id === id))) throw new Error('Unknown or duplicate shot ID');
  const url = new URL(args.url);
  const out = path.resolve(args.out);
  const cameraReference = args['camera-from'] ? JSON.parse(await fs.readFile(args['camera-from'], 'utf8')) : null;
  await fs.mkdir(out, { recursive: true });
  const specifier = process.env.PLAYWRIGHT_MODULE;
  let chromium;
  const candidates = specifier ? [specifier] : ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')];
  for (const candidate of candidates) {
    try { ({ chromium } = await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate)); break; } catch { /* try the next existing installation */ }
  }
  if (!chromium) throw new Error('Use an existing Playwright installation: set PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs. No packages were installed.');
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
  const manifest = { version: 1, complete: false, seed: Number(args.seed), backend: args.backend, quality: args.quality, cameraReference: args['camera-from'] || null,
    browser: browser.version(), platform: `${process.platform}/${process.arch}`,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(), shots: [] };
  async function capture(id) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const errors = [];
    // Offline fixtures: asset requests stay on the selected local server.
    await context.route('**/*', route => new URL(route.request().url()).origin === url.origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('response', r => { if (new URL(r.url()).origin === url.origin && r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    page.on('requestfailed', r => { if (new URL(r.url()).origin === url.origin) errors.push(`Request failed: ${r.url()}`); });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL|shader|WebGPU/i.test(m.text())) errors.push(m.text()); });
    try {
      const target = new URL('/tools/visual-rig.html', url);
      for (const [key, value] of Object.entries({ shot: id, backend: args.backend, quality: args.quality, seed: args.seed })) target.searchParams.set(key, value);
      await page.goto(target.href);
      await page.waitForFunction(() => window.visualRig?.ready || window.visualRig?.error, null, { timeout: 180000 });
      const failure = await page.evaluate(() => window.visualRig.error);
      if (failure) throw new Error(failure);
      let metadata = await page.evaluate(() => window.visualRig.metadata);
      if (cameraReference) {
        await page.evaluate(pose => window.visualRig.lockCamera(pose), referenceCamera(cameraReference, metadata));
        metadata = await page.evaluate(() => window.visualRig.metadata);
      }
      if (metadata.backendActual !== args.backend) throw new Error('Renderer mismatch');
      assert.ok(Math.abs(metadata.time - 6) < 1e-8 && Math.abs(metadata.worldTime - 6) < 1e-8, 'Frozen six-second fixture');
      assert.equal(metadata.formationCount, 18);
      if (id === 'waist-fw190') assert.ok(Math.abs(metadata.enemy.range - 150) < 1e-6 && metadata.aimDownSight > .99);
      if (id === 'tail-bf109') assert.equal(metadata.enemy.diving, true);
      if (id === 'p51-cockpit') assert.equal(metadata.pilotView, 'cockpit');
      if (id === 'bomb-run') assert.ok(metadata.bombs > 0);
      if (id === 'damaged-neighbour') assert.equal(metadata.burningEngines.length, 2);
      if (id === 'night-flak') assert.ok(metadata.searchlights === 8 && metadata.flakBursts === 28);
      if (id === 'waist-interior' && args.quality !== 'low') assert.ok(metadata.visibleSunShafts > 0);
      const data = await page.evaluate(() => window.visualRig.png());
      const png = await sharp(Buffer.from(data.split(',')[1], 'base64')).resize(1920, 1080).png().toBuffer();
      const raw = await sharp(png).removeAlpha().raw().toBuffer();
      const frameMs = await page.evaluate(() => window.visualRig.benchmark());
      if (errors.length) throw new Error(errors.join('\n'));
      return { png, metadata: { ...metadata, frameMs, pixelHash: createHash('sha256').update(raw).digest('hex'), errors } };
    } finally { await context.close(); }
  }
  // Invalidate any prior run before replacing images; a failed capture cannot be scored as complete.
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  try {
    for (const id of ids) {
      const { png, metadata } = await capture(id);
      if (args['verify-repeat']) {
        const repeat = await capture(id);
        metadata.repeatIdentical = repeat.metadata.pixelHash === metadata.pixelHash;
        if (!metadata.repeatIdentical) throw new Error(`Non-deterministic pixels: ${id} (${metadata.pixelHash} / ${repeat.metadata.pixelHash})`);
      }
      await fs.writeFile(path.join(out, `${id}.png`), png);
      await fs.writeFile(path.join(out, `${id}.jpg`), await smallJpeg(png));
      manifest.shots.push(metadata);
      await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      console.log(`${id}: ${metadata.renderSize.join('x')} ${metadata.frameMs.mean.toFixed(1)} ms${metadata.repeatIdentical ? ' repeat identical' : ''}`);
    }
    const tileW = 384, tileH = 240, cols = 4;
    const tiles = await Promise.all(ids.map(async (id, i) => {
      const image = await sharp(path.join(out, `${id}.jpg`)).resize(tileW, 216).extend({ bottom: 24, background: '#171b20' }).png().toBuffer();
      const label = Buffer.from(`<svg width="${tileW}" height="${tileH}"><text x="10" y="232" fill="white" font-size="15" font-family="sans-serif">${id}</text></svg>`);
      return { input: await sharp(image).composite([{ input: label }]).png().toBuffer(), left: (i % cols) * tileW, top: Math.floor(i / cols) * tileH };
    }));
    const sheet = await sharp({ create: { width: cols * tileW, height: Math.ceil(ids.length / cols) * tileH, channels: 3, background: '#171b20' } }).composite(tiles).png().toBuffer();
    await fs.writeFile(path.join(out, 'contact-sheet.png'), sheet);
    await fs.writeFile(path.join(out, 'contact-sheet.jpg'), await smallJpeg(sheet, 1536));
    manifest.complete = true;
    await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await scoreCaptures(out, path.join(out, 'scorecard.md'));
  } finally { await browser.close(); }
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await captureRig(process.argv.slice(2));
