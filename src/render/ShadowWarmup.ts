import * as T from 'three';

// Retain this exact no-map/no-tint/no-clip depth variant after warm-up debris is
// retired. A later untextured torn sheet must not compile it during combat.
let depthBatch: T.BatchedMesh | undefined;
export function warmBatchedShadow(renderer: T.WebGLRenderer, lighting: T.Scene, camera: T.Camera, target: T.WebGLRenderTarget) {
  if (!depthBatch) {
    const geometry = new T.BoxGeometry(1, 1, 1);
    depthBatch = new T.BatchedMesh(1, geometry.attributes.position.count, geometry.index!.count,
      new T.MeshDepthMaterial({ side: T.DoubleSide }));
    depthBatch.addInstance(depthBatch.addGeometry(geometry)); geometry.dispose();
  }
  const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.enabled, clipping = renderer.clippingPlanes;
  try {
    renderer.setRenderTarget(target); renderer.shadowMap.enabled = true; renderer.clippingPlanes = [];
    // Bypass scene material auditing: Three's internal shadow material uses its
    // ordinary cache key. Compile against the real mission's light counts.
    renderer.compile(depthBatch, camera, lighting);
  } finally {
    renderer.clippingPlanes = clipping; renderer.shadowMap.enabled = shadows; renderer.setRenderTarget(previous);
  }
}
