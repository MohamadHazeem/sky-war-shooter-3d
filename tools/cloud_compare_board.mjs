// Review board from the saved, camera-matched production and worktree captures.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = 'docs/phase11/shots/03';
const shots = ['formation-chase', 'sunset', 'sun-gap', 'sun-gap-towers', 'cloud-shoulder', 'ball-europe', 'overcast-rain', 'cloud-flythrough'];
const read = async file => JSON.parse(await fs.readFile(`${root}/${file}`, 'utf8'));
const [live, after, detail] = await Promise.all([read('live/manifest.json'), read('after/manifest.json'), read('detail/metrics.json')]);
assert.ok(after.complete, 'Primary captures complete');
for (const shot of shots) {
  const left = live.shots.find(s => s.shot === shot);
  const right = after.shots.find(s => s.shot === shot) ?? detail.records.find(s => s.view === shot && s.mode === 'after');
  assert.ok(left?.poseMatch.matched, `${shot}: aircraft and guns match`);
  assert.deepEqual(left.camera, right.camera, `${shot}: matching camera`);
  assert.deepEqual(left.weather, right.weather, `${shot}: matching weather`);
}
const layers = [];
const label = text => Buffer.from(`<svg width="960" height="30"><rect width="960" height="30" fill="#141b25"/><text x="12" y="21" fill="white" font-size="15" font-family="sans-serif">${text}</text></svg>`);
for (const [i, shot] of shots.entries()) {
  const top = i * 300;
  layers.push({ input: label(`${shot} — LIVE (left) | branch (right)`), left: 0, top });
  const detail = shot.startsWith('sun-gap') || shot === 'cloud-shoulder';
  for (const [x, file] of [[0, `${root}/live/${shot}.jpg`], [480, `${root}/${detail ? `detail/${shot}-after` : `after/${shot}`}.jpg`]])
    layers.push({ input: await sharp(file).resize(480, 270).toBuffer(), left: x, top: top + 30 });
}
await sharp({ create: { width: 960, height: shots.length * 300, channels: 3, background: '#141b25' } })
  .composite(layers).jpeg({ quality: 80 }).toFile(`${root}/comparison.jpg`);
