import * as THREE from 'three';

// Procedural parachute canopy texture: alternating white / cream gores (the radial
// panels of a WWII T-7 style chute), faint seams, and darker shading toward the rim.
// Generated once and cached; shared by every canopy.

const GORES = 16;          // even count so the u=0/1 wrap seam lands on matching colours
const W = 512, H = 256;    // u = around the canopy, v = pole (top) to rim (bottom)

let cached: THREE.CanvasTexture | null = null;

export function chuteTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) {
    // No 2D context (unlikely): a plain texture keeps the canopy visible.
    cached = new THREE.CanvasTexture(c);
    cached.colorSpace = THREE.SRGBColorSpace;
    return cached;
  }

  const gw = W / GORES;
  for (let i = 0; i < GORES; i++) {
    g.fillStyle = i % 2 === 0 ? '#f5f2e8' : '#e3d9bf';
    g.fillRect(i * gw, 0, gw + 1, H);
  }

  // Seams between gores: thin, slightly darker lines of cloth
  g.fillStyle = 'rgba(70, 60, 40, 0.28)';
  for (let i = 0; i < GORES; i++) g.fillRect(i * gw, 0, 1.5, H);

  // Slight fabric variation so the flat colour does not look like plastic
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(90,75,50,0.04)';
    g.fillRect(x, y, 3 + Math.random() * 6, 1);
  }

  // Rim shading: with flipY, canvas bottom maps to uv.y = 0, which is the canopy edge
  // on SphereGeometry (the pole is uv.y = 1)
  const rim = g.createLinearGradient(0, 0, 0, H);
  rim.addColorStop(0, 'rgba(255,255,255,0.10)');
  rim.addColorStop(0.55, 'rgba(0,0,0,0)');
  rim.addColorStop(0.85, 'rgba(60, 48, 30, 0.14)');
  rim.addColorStop(1, 'rgba(60, 48, 30, 0.38)');
  g.fillStyle = rim;
  g.fillRect(0, 0, W, H);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cached = t;
  return t;
}
