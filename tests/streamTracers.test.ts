import { it, expect } from 'vitest';
import * as T from 'three';
import { StreamTracers } from '../src/render/StreamTracers';
it('caps exchanges, advances streaks, rebases with the stream and expires without entities', () => {
  const t = new StreamTracers(4), c = new T.PerspectiveCamera(55), m = new T.Matrix4();
  for (let i=0;i<8;i++) t.emit(0,0,0,1000,0,0,1,true);
  t.update(1.2,m,c,1080);
  const g = t.renderer.mesh.geometry as T.InstancedBufferGeometry;
  expect(g.instanceCount).toBe(4);
  expect(g.getAttribute('iB').getX(0)).toBeCloseTo(210);
  expect(g.getAttribute('iA').getX(0)).toBeLessThan(g.getAttribute('iB').getX(0));
  m.makeTranslation(-10000,0,0); t.update(1.2,m,c,1080);
  expect(g.getAttribute('iB').getX(0)).toBeCloseTo(-9790);
  t.update(1.6,m,c,1080); expect(g.instanceCount).toBe(0);
  t.emit(0,0,0,1000,0,0,2,false); t.clear(); t.update(2.1,m,c,1080); expect(g.instanceCount).toBe(0);
});
