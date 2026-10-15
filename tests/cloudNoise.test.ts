import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cloudCurl, createDetailNoise } from '../src/render/noise';

describe('cloud curl erosion volume', () => {
  it('is periodic across all three wrap seams and bounded for texture encoding', () => {
    for (let i = 0; i < 20; i++) {
      const p = [i * .137, i * -.231, i * .093];
      const a = cloudCurl(p[0], p[1], p[2]);
      for (const value of a) expect(Math.abs(value)).toBeLessThanOrEqual(1);
      for (let axis = 0; axis < 3; axis++) {
        const q = [...p]; q[axis] += 1;
        cloudCurl(q[0], q[1], q[2]).forEach((value, k) => expect(value).toBeCloseTo(a[k], 10));
      }
    }
  });
  it('has no divergent sources or sinks that inflate wisps under advection', () => {
    const p = [.13, .27, .49], h = .0001;
    let divergence = 0;
    for (let axis = 0; axis < 3; axis++) {
      const a = [...p], b = [...p]; a[axis] -= h; b[axis] += h;
      divergence += (cloudCurl(b[0], b[1], b[2])[axis] - cloudCurl(a[0], a[1], a[2])[axis]) / (2 * h);
    }
    expect(divergence).toBeCloseTo(0, 5);
    expect(Math.hypot(...cloudCurl(...p as [number, number, number]))).toBeGreaterThan(.1);
  });
  it('packs independent erosion and signed curl in one repeatable, mip-filterable RGBA volume', () => {
    const a = createDetailNoise(8), b = createDetailNoise(8);
    expect(a.format).toBe(THREE.RGBAFormat);
    expect(a.image.data).toEqual(b.image.data);
    expect(a.image.data!.length).toBe(8 ** 3 * 4);
    expect([a.wrapS, a.wrapT, a.wrapR]).toEqual(Array(3).fill(THREE.RepeatWrapping));
    const data = a.image.data!;
    for (let channel = 0; channel < 4; channel++) {
      const values = Array.from(data).filter((_, i) => i % 4 === channel);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(50);
    }
    for (let z = 0; z < 8; z++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const curl = cloudCurl(x / 8, y / 8, z / 8);
      curl.forEach((c, k) => expect(data[((z * 8 + y) * 8 + x) * 4 + k + 1] / 255 * 2 - 1).toBeCloseTo(c, 2));
    }
    a.dispose(); b.dispose();
  });
});
