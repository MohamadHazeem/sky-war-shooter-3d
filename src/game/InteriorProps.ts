import * as THREE from 'three';
import { envRef } from '../render/EnvRef';

// Waist-compartment clutter for the B-17 interior: oxygen regulators with coiled hoses,
// a first-aid kit, a fire extinguisher, an interphone jack box and stencilled ammunition
// cans. Dark, low-envMap materials so they read with buildWaistInterior's shell. Kept
// small (a few thousand triangles in total) since it is built once per mission.

// Cabin cross-section. Must match the shell in buildWaistInterior (half width, half height, centre).
const A = 1.08, B = 1.12, YC = 0.15;
const FLOOR_Y = YC - B * 0.78 + 0.015;   // top surface of the walkway planks

// Point on the inner skin at height yRel (relative to YC) for side s (+1 left, -1 right),
// with the inward normal so flat props can lie against the curved wall.
interface Wall { x: number; y: number; nx: number; ny: number }
function wallAt(s: 1 | -1, yRel: number): Wall {
  const k = Math.min(0.96, Math.abs(yRel) / B);
  const x = s * A * Math.sqrt(1 - k * k);
  const nx = -x / (A * A), ny = -yRel / (B * B);
  const l = Math.hypot(nx, ny);
  return { x, y: YC + yRel, nx: nx / l, ny: ny / l };
}

// Moves an object off the skin by `gap` along the inward normal. With `tilt`, local +X
// (the box depth) points into the cabin and local +Y lies along the wall.
function place(o: THREE.Object3D, w: Wall, z: number, gap: number, tilt: boolean) {
  o.position.set(w.x + w.nx * gap, w.y + w.ny * gap, z);
  o.rotation.set(0, 0, tilt ? Math.atan2(w.ny, w.nx) : 0);
}

// Hanging coil of hose: a helix of `turns` loops over height `len`, swept as a tube.
function coilGeometry(radius: number, len: number, turns: number, wire: number): THREE.TubeGeometry {
  const segs = Math.round(turns * 12);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, ang = u * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(ang) * radius, (u - 0.5) * len, Math.sin(ang) * radius));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, wire, 5, false);
}

// Stencilled ammunition-can side: olive drab with pale block letters, built once.
let stencilTex: THREE.CanvasTexture | null = null;
function stencilTexture(): THREE.CanvasTexture {
  if (stencilTex) return stencilTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b4029';
  g.fillRect(0, 0, 256, 192);
  g.globalAlpha = 0.82;   // worn stencil paint
  g.strokeStyle = '#c8bb8a';
  g.lineWidth = 5;
  g.strokeRect(12, 12, 232, 168);
  g.fillStyle = '#c8bb8a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const line = (t: string, y: number, px: number) => {
    let size = px;
    g.font = `bold ${size}px Arial, Helvetica, sans-serif`;
    while (g.measureText(t).width > 210 && size > 12) { size--; g.font = `bold ${size}px Arial, Helvetica, sans-serif`; }
    g.fillText(t, 128, y);
  };
  line('AMMUNITION', 56, 30);
  line('CAL .50 BALL', 102, 40);
  line('M2 - 100 RDS', 146, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  stencilTex = t;
  return t;
}

export function addWaistProps(group: THREE.Group, zc: number): void {
  const env = envRef.tex;
  const std = (color: number, roughness: number, metalness: number, envMapIntensity: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, envMap: env, envMapIntensity });
  const grey = std(0x23261f, 0.6, 0.45, 0.12);      // regulator / jack housings
  const brass = std(0x6b5a2a, 0.4, 0.8, 0.25);      // gauges and jacks
  const red = std(0x6e1a14, 0.45, 0.2, 0.1);        // extinguisher body
  const black = std(0x101010, 0.6, 0.1, 0.04);      // extinguisher head, hose
  const rubber = std(0x161513, 0.8, 0.0, 0.03);
  const olive = std(0x2e3324, 0.7, 0.2, 0.06);      // first-aid kit, can ends
  const crossRed = std(0x7d1d16, 0.6, 0.1, 0.05);
  const stencilMat = new THREE.MeshStandardMaterial({ map: stencilTexture(), roughness: 0.7, metalness: 0.3, envMap: env, envMapIntensity: 0.1 });

  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], shadow = true) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow; o.receiveShadow = true;
    return o;
  };

  // Oxygen regulator on the wall: housing with two gauges and a coiled hose hanging from its outlet
  const regulator = (s: 1 | -1, dz: number, yRel: number) => {
    const w = wallAt(s, yRel);
    const z = zc + dz;
    const body = mesh(new THREE.BoxGeometry(0.07, 0.2, 0.16), grey);
    place(body, w, z, 0.036, true);
    group.add(body);
    for (const gz of [-0.035, 0.035]) {
      const gauge = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 12), brass, false);
      gauge.rotation.z = Math.PI / 2;
      gauge.position.set(0.039, 0.04, gz);
      body.add(gauge);
    }
    const len = 0.22;
    const coil = mesh(coilGeometry(0.026, len, 6, 0.006), rubber, false);
    coil.position.set(w.x + w.nx * 0.05, w.y - 0.11 - len / 2, z);
    group.add(coil);
  };
  regulator(1, 1.2, 0.12);
  regulator(-1, -1.75, 0.12);   // clear of the (aft) right window
  regulator(1, -1.9, 0.12);

  // Fire extinguisher on a strap bracket, standing against the right wall
  {
    const w = wallAt(-1, -0.2);
    const z = zc - 2.6;
    const bracket = mesh(new THREE.BoxGeometry(0.03, 0.28, 0.08), grey);
    place(bracket, w, z, 0.015, true);
    group.add(bracket);
    const body = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.42, 14), red);
    place(body, w, z, 0.085, false);
    group.add(body);
    const head = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.07, 10), black, false);
    head.position.y = 0.245;
    body.add(head);
  }

  // Interphone jack box with two jacks, right wall
  {
    const w = wallAt(-1, 0.3);
    const box = mesh(new THREE.BoxGeometry(0.035, 0.1, 0.09), grey);
    place(box, w, zc + 1.4, 0.0175, true);
    group.add(box);
    for (const yy of [0.022, -0.022]) {
      const jack = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 10), brass, false);
      jack.rotation.z = Math.PI / 2;
      jack.position.set(0.0275, yy, 0);
      box.add(jack);
    }
  }

  // First-aid kit on the left wall with a red cross on its front face
  {
    const kit = mesh(new THREE.BoxGeometry(0.07, 0.2, 0.26), olive);
    place(kit, wallAt(1, 0.02), zc + 2.5, 0.035, true);
    group.add(kit);
    const armV = mesh(new THREE.BoxGeometry(0.004, 0.13, 0.05), crossRed, false);
    const armH = mesh(new THREE.BoxGeometry(0.004, 0.05, 0.13), crossRed, false);
    armV.position.set(0.037, 0, 0);
    armH.position.set(0.037, 0, 0);
    kit.add(armV, armH);
  }

  // Stencilled ammunition cans on the walkway, one stacked on another
  const canMats = [stencilMat, stencilMat, olive, olive, stencilMat, stencilMat];
  const canGeo = new THREE.BoxGeometry(0.26, 0.19, 0.2);
  const cans: [x: number, dz: number, yaw: number, level: number][] = [
    [-0.27, 0.95, 0.12, 0],
    [0.2, 1.5, -0.08, 0],
    [0.21, 1.5, 0.3, 1],
  ];
  for (const [x, dz, yaw, level] of cans) {
    const can = mesh(canGeo, canMats);
    can.position.set(x, FLOOR_Y + 0.095 + level * 0.19, zc + dz);
    can.rotation.y = yaw;
    group.add(can);
  }
}
