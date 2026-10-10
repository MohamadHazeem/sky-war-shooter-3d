import * as THREE from 'three';
import { envRef } from '../render/EnvRef';

// Faint plexiglass dome for the Sperry (top) and ball turrets. It is kept almost
// invisible (opacity ~0.08) so it reads as enclosure without greying out the
// reticle or the barrels: depthWrite is off, so it never occludes what is behind it.

let scratchTex: THREE.CanvasTexture | null = null;

// Procedural wear pattern, built once and shared by both turrets. A seeded PRNG
// keeps the marks identical between sessions. Used as an alphaMap: the base
// green level gives the glass a faint body, the bright marks read as scratches.
function scratchTexture(): THREE.CanvasTexture {
  if (scratchTex) return scratchTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgb(180,180,180)';
  x.fillRect(0, 0, S, S);
  x.lineCap = 'round';
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Cleaning wear runs in a dominant direction, so marks are biased to one angle
  const dir = 0.7;
  for (let i = 0; i < 140; i++) {
    const px = rnd() * S, py = rnd() * S;
    const ang = dir + (rnd() - 0.5) * 0.8;
    const len = 12 + rnd() * 70;
    x.strokeStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.5).toFixed(3)})`;
    x.lineWidth = 0.4 + rnd() * 0.9;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
    x.stroke();
  }
  scratchTex = new THREE.CanvasTexture(c);
  return scratchTex;
}

// Hemisphere of glass over the turret ring: upper half for the top turret,
// lower half for the ball. Centred on the ring (y = -0.15, matching buildTurret).
export function turretGlassDome(kind: 'top' | 'ball', R: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, kind === 'top' ? 0 : Math.PI / 2, Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.9, 0.95, 1.0),
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.08,
    alphaMap: scratchTexture(),
    envMap: envRef.tex,
    envMapIntensity: 0.5,
    // The gunner's eye is always inside the sphere, so only the inner face is needed
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.position.y = -0.15;
  // Drawn after opaque guns, before the reflector sight (renderOrder 40)
  dome.renderOrder = 38;
  // castShadow stays false: glass should not darken the turret interior
  return dome;
}
