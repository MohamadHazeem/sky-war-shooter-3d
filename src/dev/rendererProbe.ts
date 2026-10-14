// Development-only migration experiment, imported explicitly by tools/renderer_check.mjs.
export async function probe() {
  const T = await import('three/webgpu');
  const { color, positionWorld } = await import('three/tsl');
  const results = [];
  for (const forceWebGL of [false, true]) {
    const r = new T.WebGPURenderer({ forceWebGL });
    await r.init(); r.setSize(1920, 1080);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(60, 16 / 9, .1, 100);
    camera.position.z = 20;
    scene.add(new T.HemisphereLight(0xffffff, 0x555577, 2));
    const mat = new T.MeshStandardNodeMaterial({ roughness: .6, metalness: .1 });
    mat.colorNode = color(0x839374).mul(positionWorld.y.mul(.01).add(1));
    const geo = new T.BoxGeometry();
    for (let i = 0; i < 200; i++) { const m = new T.Mesh(geo, mat); m.position.set(i % 20 - 10, Math.floor(i / 20) - 5, 0); scene.add(m); }
    await r.compileAsync(scene, camera);
    const backend = r.backend as unknown as { device?: GPUDevice; gl?: WebGL2RenderingContext; isWebGPUBackend?: boolean };
    const sync = async () => { if (backend.device) await backend.device.queue.onSubmittedWorkDone(); else backend.gl?.finish(); };
    for (let i = 0; i < 8; i++) { r.render(scene, camera); await sync(); }
    const times = [];
    for (let i = 0; i < 30; i++) { const t = performance.now(); r.render(scene, camera); await sync(); times.push(performance.now() - t); }
    times.sort((a, b) => a - b);
    // Legacy ShaderMaterial is the crucial compatibility boundary, not standard PBR.
    const legacy = new T.ShaderMaterial({ vertexShader: 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'void main(){gl_FragColor=vec4(1.,0.,0.,1.);}' });
    const old = scene.children[1] as InstanceType<typeof T.Mesh>; old.material = legacy;
    let legacyError = '';
    try { await r.compileAsync(scene, camera); r.render(scene, camera); await sync(); } catch (e) { legacyError = String(e); }
    results.push({ requested: forceWebGL ? 'WebGL2' : 'WebGPU', backend: backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2', p50: times[15], p90: times[27], legacyError });
    r.dispose(); geo.dispose(); mat.dispose(); legacy.dispose();
  }
  return results;
}
