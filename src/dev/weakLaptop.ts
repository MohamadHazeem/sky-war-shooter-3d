import type { Engine } from '../core/Engine';
import { frameStats } from '../render/QualityPick';

// Dev-only, import from the browser console. Freeze with sws.vqa.freeze() first.
// Fixed-camera feature ablations use render(); full game measurements use timedFrame().
// GPU readback deliberately includes submission + GPU cost, not just JS submission time.
export function weakLaptopSample(engine: Engine, simulate = false, frames = 72) {
  const gl = engine.renderer.getContext(), pixel = new Uint8Array(4);
  const sample = () => {
    if (simulate) return engine.timedFrame(1 / 60);
    const t = performance.now();
    engine.render(1 / 60);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return performance.now() - t;
  };
  for (let i = 0; i < 24; i++) sample();
  const times: number[] = [];
  for (let i = 0; i < frames; i++) times.push(sample());
  return { ...frameStats(times), width: engine.renderer.domElement.width,
    height: engine.renderer.domElement.height, programs: engine.renderer.info.programs?.length };
}
