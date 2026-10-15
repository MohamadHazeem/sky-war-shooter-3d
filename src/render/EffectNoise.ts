import * as THREE from 'three';

// Shared R8 value lattice: replace four sine hashes per noise lookup with one
// bilinear fetch. Built once before prewarm; no asset download or runtime compile.
let texture: THREE.DataTexture | undefined;
export function effectNoise(): THREE.DataTexture {
  if (texture) return texture;
  const size = 128, data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    data[y * size + x] = Math.round((h - Math.floor(h)) * 255);
  }
  texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export const EFFECT_NOISE_GLSL = /* glsl */ `
uniform sampler2D tValueNoise;
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return texture2D(tValueNoise, (i + f + 0.5) / 128.0).r;
}`;
