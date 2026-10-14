import { Engine } from '../core/Engine';

/** Goal 01 extension seam. Capture/score tools never depend on a GL readback. */
export interface RigBackend {
  engine: Engine;
  backend: 'webgl2' | 'webgpu';
  deviceInfo?: { vendor: string; renderer: string };
  render(dt: number): void | Promise<void>;
  sync(): void | Promise<void>;
}
export async function createRigBackend(container: HTMLElement, requested: RigBackend['backend']): Promise<RigBackend> {
  if (requested === 'webgpu') {
    // Goal 01 supplies this module with the same scene/Engine API and GPU queue fence.
    const moduleUrl = '/src/dev/VisualRigWebGPU.ts';
    let mod: { createRigBackend: (container: HTMLElement) => Promise<RigBackend> };
    try { mod = await import(/* @vite-ignore */ moduleUrl); }
    catch { throw new Error('WebGPU rig adapter is not installed yet. Goal 01 must provide src/dev/VisualRigWebGPU.ts; use --backend webgl2 for this baseline.'); }
    const adapter = await mod.createRigBackend(container);
    if (adapter.backend !== requested) throw new Error('Requested WebGPU but adapter returned another backend');
    return adapter;
  }
  const engine = new Engine(container);
  const gl = engine.renderer.getContext(), pixel = new Uint8Array(4);
  // A blocking readback fences the browser's GPU process (the same method as Engine.timedFrame).
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const deviceInfo = { vendor: String(gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR)),
    renderer: String(gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) };
  return { engine, backend: 'webgl2', deviceInfo, render: dt => engine.render(dt),
    sync: () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel) };
}
