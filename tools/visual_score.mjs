import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { imageMetrics, parseArgs } from './visual_metrics.mjs';

export const PILLARS = ['Aircraft', 'Lighting', 'Clouds / sky', 'Ground', 'Effects', 'Interior / crew', 'Camera / post', 'Scale', 'Destruction', 'Performance'];
const rel = (from, to) => path.relative(path.dirname(from), to).split(path.sep).map(encodeURIComponent).join('/');
export async function scoreCaptures(dir, out) {
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.complete === false) throw new Error('Capture run is incomplete; rerun the rig before scoring');
  if (!manifest.shots?.length) throw new Error('Manifest contains no captures');
  const rows = [];
  for (const shot of manifest.shots) {
    if (!/^[a-z0-9-]+$/.test(shot.shot)) throw new Error('Invalid shot filename');
    // Prefer the lossless source. Committed JPEG-only sets remain independently scoreable.
    let source = path.join(dir, `${shot.shot}.png`), sourceKind = 'PNG';
    try { await fs.access(source); } catch { source = path.join(dir, `${shot.shot}.jpg`); sourceKind = 'JPEG (lossy preview)'; }
    const { data, info } = await sharp(source).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    rows.push({ ...shot, metrics: imageMetrics(data, info.width, info.height), metricsSource: sourceKind, metricsSize: [info.width, info.height] });
  }
  const fmt = (n, digits = 3) => Number(n).toFixed(digits);
  const imageLink = s => `[${s.shot}](${rel(out, path.join(dir, `${s.shot}.jpg`))})`;
  const text = [
    '# Phase 10 visual scorecard', '',
    `Capture rig v${manifest.version}; seed ${manifest.seed}; requested ${manifest.backend}; preset ${manifest.quality}.`,
    `Browser: ${manifest.browser}. Source revision: \`${manifest.revision}\` (dirty at capture: ${manifest.dirty}).`,
    `[Contact sheet](${rel(out, path.join(dir, 'contact-sheet.jpg'))}) · [Capture metadata](${rel(out, path.join(dir, 'manifest.json'))}) · [Metric data](${rel(out, path.join(dir, 'metrics.json'))})`, '',
    `Score relevant cells from 0–10 against [the reference board](${rel(out, fileURLToPath(new URL('../docs/phase10/reference.md', import.meta.url)))}). \`__/10\` is unscored; \`—\` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.`, '',
    '| Shot | ' + PILLARS.map((p, i) => `${i + 1} ${p}`).join(' | ') + ' |',
    '|---|' + PILLARS.map(() => '---').join('|') + '|',
    ...rows.map(s => `| ${imageLink(s)} | ${PILLARS.map((_, i) => s.pillars.includes(i + 1) ? '__/10' : '—').join(' | ')} |`), '',
    '## Objective measurements', '',
    'Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.', '',
    'Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.', '',
    '| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |',
    '|---|---|---:|---:|---:|---:|---:|---|',
    ...rows.map(s => `| ${imageLink(s)} | ${s.metricsSource} ${s.metricsSize.join('×')} | ${fmt(s.metrics.luminanceMean)} | ${fmt(s.metrics.contrastRms)} | ${fmt(s.metrics.colourfulness, 2)} | ${fmt(s.metrics.sharpness, 6)} | ${fmt(s.metrics.edgeAliasingEstimate)} | ${[s.frameMs.mean, s.frameMs.p50, s.frameMs.p95].map(n => fmt(n, 2)).join(' / ')} |`), '',
    '| Shot | Luminance histogram (%) | Black / white clipped (%) |', '|---|---|---|',
    ...rows.map(s => `| ${imageLink(s)} | ${s.metrics.histogram.map(v => fmt(v * 100, 1)).join(', ')} | ${fmt(s.metrics.blackFraction * 100, 2)} / ${fmt(s.metrics.whiteFraction * 100, 2)} |`), '',
  ].join('\n');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(path.join(dir, 'metrics.json'), JSON.stringify(rows.map(({ shot, metrics, metricsSource, metricsSize, frameMs }) => ({ shot, metrics, metricsSource, metricsSize, frameMs })), null, 2) + '\n');
  await fs.writeFile(out, text);
  return rows;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2), { in: 'docs/phase10/shots/baseline', out: 'docs/phase10/scorecard.md' });
  await scoreCaptures(args.in, args.out);
  console.log(`Wrote ${args.out}`);
}
