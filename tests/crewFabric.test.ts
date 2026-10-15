import { it, expect } from 'vitest';
import { fabricPixels, crewFabric, type FabricKind } from '../src/render/CrewFabric';

const KINDS: FabricKind[] = ['leather', 'fleece', 'canvas', 'skin', 'cloth'];
it('keeps normalized relief, bounded roughness and a distinct response per surface', () => {
  const mean = (r: Uint8Array) => { let s = 0; for (let i = 0; i < r.length; i += 4) s += r[i]; return s / (r.length / 4) / 255; };
  const rough: Record<string, number> = {};
  for (const kind of KINDS) {
    const p = fabricPixels(kind, 64);
    expect(p).toEqual(fabricPixels(kind, 64));
    for (let i = 0; i < p.normal.length; i += 4) {
      const n = [p.normal[i], p.normal[i + 1], p.normal[i + 2]].map(x => x / 255 * 2 - 1);
      // Each decoded component has at most 1/255 rounding error.
      expect(Math.abs(Math.hypot(...n) - 1)).toBeLessThan(Math.sqrt(3) / 255);
      expect(n[2]).toBeGreaterThan(0.35);
      expect(p.rough[i + 1]).toBeGreaterThan(100);
    }
    rough[kind] = mean(p.rough);
  }
  // hide is smoother than canvas, sheepskin the roughest, skin in between
  expect(rough.leather).toBeLessThan(rough.canvas);
  expect(rough.fleece).toBeGreaterThan(rough.canvas);
  expect(rough.skin).toBeLessThan(rough.canvas);
  // the legacy boolean form still maps to leather / cloth
  expect(fabricPixels(true, 32)).toEqual(fabricPixels('leather', 32));
  expect(crewFabric('fleece')).toBe(crewFabric('fleece'));
  expect(crewFabric(true)).toBe(crewFabric('leather'));
});
