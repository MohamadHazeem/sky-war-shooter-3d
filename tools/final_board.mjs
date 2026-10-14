import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { smallJpeg } from './visual_rig.mjs';

export function matchingCaptures(before, after) {
  assert.ok(before.complete && after.complete, 'Both capture runs must be complete');
  assert.equal(before.quality, after.quality, 'Matching quality');
  assert.equal(before.shots.length, 16, 'Full 16-shot board');
  assert.equal(after.shots.length, 16, 'Full 16-shot board');
  for (let i = 0; i < 16; i++) {
    const a = before.shots[i], b = after.shots[i];
    for (const key of ['shot', 'version', 'seed', 'camera', 'weather', 'viewport', 'renderSize', 'steps']) {
      assert.deepEqual(a[key], b[key], `${a.shot}: matching ${key}`);
    }
    assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
  }
}
export async function finalBoard(root = 'docs/phase10/shots/13') {
  const read = async dir => JSON.parse(await fs.readFile(path.join(root, dir, 'manifest.json'), 'utf8'));
  let ids;
  for (const tier of ['high', 'cinematic']) {
    const before = await read(`before-${tier}`), after = await read(`after-${tier}`);
    matchingCaptures(before, after);
    ids = after.shots.map(s => s.shot);
    for (let page = 0; page < 4; page++) {
      const tiles = [];
      for (let row = 0; row < 4; row++) {
        const id = ids[page * 4 + row];
        for (let col = 0; col < 2; col++) {
          const stage = col ? 'after' : 'before';
          const label = Buffer.from(`<svg width="640" height="384"><text x="12" y="378" fill="white" font-size="16" font-family="sans-serif">${id} · ${tier} · ${stage}</text></svg>`);
          const jpg = await sharp(path.join(root, `${stage}-${tier}`, `${id}.jpg`)).resize(640, 360).extend({ bottom: 24, background: '#171b20' }).composite([{ input: label }]).png().toBuffer();
          tiles.push({ input: jpg, left: col * 640, top: row * 384 });
        }
      }
      const sheet = await sharp({ create: { width: 1280, height: 1536, channels: 3, background: '#171b20' } }).composite(tiles).png().toBuffer();
      await fs.writeFile(path.join(root, `comparison-${tier}-${page + 1}.jpg`), await smallJpeg(sheet, 1280));
    }
  }
  const rows = ids.map(id => `<tr><th>${id}</th>${['../baseline', 'before-high', 'after-high', 'before-cinematic', 'after-cinematic'].map(dir => `<td><a href="${dir}/${id}.jpg"><img loading="lazy" src="${dir}/${id}.jpg" alt="${dir} ${id}"></a></td>`).join('')}</tr>`).join('\n');
  await fs.writeFile(path.join(root, 'board.html'), `<!doctype html><meta charset="utf-8"><title>Phase 10 final visual board</title><style>body{background:#171b20;color:#eee;font:14px system-ui;margin:24px}table{border-collapse:collapse;table-layout:fixed;width:100%}th,td{padding:5px;border:1px solid #454b52}img{width:100%}a{color:#cce4ff}th:first-child{width:130px}</style><h1>Phase 10 final visual board</h1><p>All 16 fixed shots. Click images for larger previews. <a href="../../reports/13.md">Scores and limitations</a>.</p><p>The original Phase 10 baseline uses fixture v1 and an older renderer. Goal 13 before/after pairs use fixture v2, matching camera, seed, weather and native size; v2 explicitly loads optional art and binds the stream. Baseline-to-final comparisons show cumulative work and are not isolated goal-13 experiments.</p><table><thead><tr><th>Shot</th><th>Phase 10 baseline (High, v1)</th><th>Goal 13 before (High)</th><th>Final High</th><th>Goal 13 before (Cinematic)</th><th>Final Cinematic</th></tr></thead><tbody>${rows}</tbody></table>`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await finalBoard(process.argv[2]);
