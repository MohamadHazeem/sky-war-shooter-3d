import type * as THREE from 'three';

// The sky environment map. Materials that need their own envMapIntensity (dark
// interiors, guns) must reference it explicitly: three.js ignores per-material
// intensity when lighting comes only from scene.environment.
export const envRef: { tex: THREE.Texture | null } = { tex: null };
