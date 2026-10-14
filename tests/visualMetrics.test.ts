import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
// @ts-expect-error Node CLI module is exercised directly at runtime.
import { imageMetrics, parseArgs } from '../tools/visual_metrics.mjs';
// @ts-expect-error Node CLI module is exercised directly at runtime.
import { scoreCaptures } from '../tools/visual_score.mjs';
// @ts-expect-error Node CLI module is exercised directly at runtime.
import { smallJpeg } from '../tools/visual_rig.mjs';

const raster = (w: number, h: number, fn: (x: number, y: number) => number[]) => Uint8Array.from(Array.from({ length: w * h }, (_, i) => fn(i % w, Math.floor(i / w))).flat());
describe('visual score measurements', () => {
  it('returns zero contrast, colour and edges for a uniform neutral frame', () => {
    const m = imageMetrics(raster(8, 8, () => [128,128,128]), 8, 8);
    expect(m.luminanceMean).toBeCloseTo(128 / 255);
    expect(m.histogram[8]).toBe(1);
    expect(m.histogram.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1);
    expect(m.contrastRms).toBeCloseTo(0);
    expect(m.colourfulness).toBe(0);
    expect(m.sharpness).toBe(0);
    expect(m.edgeAliasingEstimate).toBe(0);
  });
  it('distinguishes alternating pixels from a single clean edge', () => {
    const checker = imageMetrics(raster(16, 16, (x, y) => Array(3).fill((x + y) % 2 ? 255 : 0)), 16, 16);
    const edge = imageMetrics(raster(16, 16, x => Array(3).fill(x < 8 ? 0 : 255)), 16, 16);
    expect(checker.contrastRms).toBeCloseTo(.5);
    expect(checker.edgeAliasingEstimate).toBe(1);
    expect(edge.edgeAliasingEstimate).toBe(0);
    expect(checker.sharpness).toBeGreaterThan(edge.sharpness);
    expect(checker.histogram[0]).toBe(.5);
    expect(checker.histogram[15]).toBe(.5);
  });
  it('detects chroma and clipping without dividing by zero', () => {
    expect(imageMetrics(raster(4, 4, () => [255,0,0]), 4, 4).colourfulness).toBeGreaterThan(80);
    expect(imageMetrics(raster(4, 4, () => [0,0,0]), 4, 4).blackFraction).toBe(1);
    expect(imageMetrics(raster(4, 4, () => [255,255,255]), 4, 4).whiteFraction).toBe(1);
    expect(() => imageMetrics(new Uint8Array(4), 2, 2)).toThrow();
  });
  it('rejects misspelled CLI flags and missing values', () => {
    expect(parseArgs(['--out', 'a', '--verify'], { out: 'b', verify: false }, ['verify'])).toEqual({ out: 'a', verify: true });
    expect(() => parseArgs(['--out'], { out: 'b' })).toThrow();
    expect(() => parseArgs(['--oops'], { out: 'b' })).toThrow();
  });
  it('generates score slots, relative links, metrics and a JPEG-only fallback', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sws-visual-score-'));
    try {
      const png = await sharp(raster(16, 16, (x, y) => [x * 16, y * 16, 128]), { raw: { width: 16, height: 16, channels: 3 } }).png().toBuffer();
      await fs.writeFile(path.join(dir, 'sample.png'), png);
      const jpg = await smallJpeg(png);
      expect(jpg.length).toBeLessThanOrEqual(250000);
      await fs.writeFile(path.join(dir, 'sample.jpg'), jpg);
      await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, shots: [{ shot: 'sample', pillars: [1,10], frameMs: { mean: 10, p50: 9, p95: 12 } }] }));
      const out = path.join(dir, 'review', 'score.md');
      let result = await scoreCaptures(dir, out);
      expect(result[0].metricsSource).toBe('PNG');
      const markdown = await fs.readFile(out, 'utf8');
      expect(markdown).toContain('[sample](../sample.jpg)');
      expect(markdown).toContain('__/10 | —');
      expect(markdown).toContain('10.00 / 9.00 / 12.00');
      await fs.unlink(path.join(dir, 'sample.png'));
      result = await scoreCaptures(dir, out);
      expect(result[0].metricsSource).toBe('JPEG (lossy preview)');
      expect(result[0].metrics.histogram.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1);
      await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ complete: false, shots: [] }));
      await expect(scoreCaptures(dir, out)).rejects.toThrow('incomplete');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});
