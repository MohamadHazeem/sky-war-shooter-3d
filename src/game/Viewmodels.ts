import * as THREE from 'three';
import { envRef } from '../render/EnvRef';
import { Atmos } from '../render/Atmosphere';
import { gunTextures, interiorTextures } from '../render/Textures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { addWaistProps } from './InteriorProps';
import { turretGlassDome } from './TurretGlass';

// Procedural first-person geometry for the B-17 gun positions: fuselage interior,
// Browning AN/M2 .50 cal with ring-and-post sight, ammunition belt, turret frames.
// Gun frame convention: origin at the mount pivot, +Z along the bore, +Y up, +X left.

const interiorMat = (side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.085, 0.082, 0.06), roughness: 0.88, metalness: 0.1, envMap: envRef.tex, envMapIntensity: 0.06, side });
const frameMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.025, 0.026, 0.022), roughness: 0.75, metalness: 0.3, envMap: envRef.tex, envMapIntensity: 0.04 });
const gunMetal = () => new THREE.MeshStandardMaterial({ map: gunTextures().map, roughnessMap: gunTextures().rough, normalMap: gunTextures().normal, normalScale: new THREE.Vector2(0.4, 0.4), color: new THREE.Color(1.1, 1.1, 1.1), roughness: 0.75, metalness: 0.6, envMap: envRef.tex, envMapIntensity: 0.18 });
const gunParkerized = () => new THREE.MeshStandardMaterial({ map: gunTextures().map, roughnessMap: gunTextures().rough, normalMap: gunTextures().normal, normalScale: new THREE.Vector2(0.5, 0.5), color: new THREE.Color(1.3, 1.3, 1.25), roughness: 0.95, metalness: 0.4, envMap: envRef.tex, envMapIntensity: 0.12 });
const brassMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.33, 0.13), roughness: 0.4, metalness: 0.9, envMap: envRef.tex, envMapIntensity: 0.45 });
const bulletMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.22, 0.08), roughness: 0.38, metalness: 0.9, envMap: envRef.tex, envMapIntensity: 0.7 });
const linkMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.7, 0.68, 0.6), roughness: 0.55, metalness: 0.5, envMap: envRef.tex, envMapIntensity: 0.5 });

function perforatedTexture(): THREE.Texture {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#000';
  const cols = 6, rows = 14;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const x = (k + (r % 2) * 0.5 + 0.25) * (W / cols);
      const y = (r + 0.5) * (H / rows);
      g.beginPath(); g.ellipse(x, y, W / cols * 0.28, H / rows * 0.36, 0, 0, Math.PI * 2); g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface GunModel {
  group: THREE.Group;
  muzzles: THREE.Object3D[];
  recoil: THREE.Object3D[];   // parts that kick back when firing
  eye: THREE.Vector3;         // eye position in gun frame
  belt?: AmmoBelt;
  ejectPort: THREE.Object3D;
  sight: THREE.Object3D[];    // ring-sight parts, shown only when looking down the sight
}

export class AmmoBelt {
  readonly group = new THREE.Group();
  private curve: THREE.CatmullRomCurve3;
  private cases: THREE.InstancedMesh;
  private bullets: THREE.InstancedMesh;
  private links: THREE.InstancedMesh;
  private count: number;
  private pitch = 0.0254;
  private length: number;
  phase = 0;
  visibleRounds: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(points: THREE.Vector3[], private roundDir: THREE.Vector3) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.length = this.curve.getLength();
    this.count = Math.floor(this.length / this.pitch);
    this.visibleRounds = this.count;
    // .50 BMG: rimless bottlenecked case (99 mm) and a pointed ogive bullet
    const caseProfile: [number, number][] = [[0, 0], [0.0098, 0], [0.0102, 0.003], [0.0102, 0.07], [0.0094, 0.078], [0.0068, 0.082], [0.0066, 0.099], [0, 0.099]];
    const caseGeo = new THREE.LatheGeometry(caseProfile.map(([r, y]) => new THREE.Vector2(r, y)), 14).rotateX(Math.PI / 2).translate(0, 0, -0.07);
    const bulletProfile: [number, number][] = [[0, 0], [0.0064, 0], [0.0064, 0.018], [0.0055, 0.032], [0.0035, 0.045], [0.0008, 0.056], [0, 0.057]];
    const bulletGeo = new THREE.LatheGeometry(bulletProfile.map(([r, y]) => new THREE.Vector2(r, y)), 12).rotateX(Math.PI / 2).translate(0, 0, 0.029);
    // M2 link: a pressed-steel loop gripping the case
    const linkGeo = new THREE.TorusGeometry(0.0115, 0.0022, 6, 14).translate(0, 0, -0.03);
    this.cases = new THREE.InstancedMesh(caseGeo, brassMat(), this.count);
    this.bullets = new THREE.InstancedMesh(bulletGeo, bulletMat(), this.count);
    this.links = new THREE.InstancedMesh(linkGeo, linkMat(), this.count);
    // Tips: alternating armour-piercing (black), incendiary (blue), tracer (red)
    const tipCols = [new THREE.Color(0.55, 0.24, 0.09), new THREE.Color(0.06, 0.06, 0.06), new THREE.Color(0.55, 0.24, 0.09), new THREE.Color(0.6, 0.08, 0.05)];
    this.tipCols = tipCols;
    for (let i = 0; i < this.count; i++) this.bullets.setColorAt(i, tipCols[i % tipCols.length]);
    for (const m of [this.cases, this.bullets, this.links]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.update();
  }

  private feed = 0;
  private tipCols: THREE.Color[] = [];
  private shown = -1;

  // a fired round pulls the belt one link toward the gun; tick() eases it there
  advance(rounds: number) { this.feed += rounds; }

  tick(dt: number) {
    if (this.feed - this.phase > 6) this.phase = this.feed - 6; // long bursts: keep up
    this.phase += (this.feed - this.phase) * Math.min(1, dt * 28);
    if (Math.abs(this.phase - this.shown) < 0.004) return;
    this.shown = this.phase;
    this.update();
  }

  update() {
    const tan = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const x = new THREE.Vector3(), y = new THREE.Vector3();
    const z = this.roundDir;
    const frac = this.phase - Math.floor(this.phase);
    const shift = Math.floor(this.phase) % 4;
    if (this.tipCols.length) {
      for (let i = 0; i < this.count; i++) this.bullets.setColorAt(i, this.tipCols[(i + shift) % 4]);
      if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < this.count; i++) {
      const visible = i < this.visibleRounds;
      // rounds slide toward the feed tray (u = 0) as the phase grows
      const u = Math.min(1, Math.max(0, ((i + 1 - frac) * this.pitch) / this.length));
      this.curve.getPointAt(u, pos);
      this.curve.getTangentAt(u, tan);
      // basis: z = round axis (parallel to bore), x = along belt (projected), y = z cross x
      x.copy(tan).addScaledVector(z, -tan.dot(z)).normalize();
      y.crossVectors(z, x).normalize();
      this.m.makeBasis(x, y, z);
      this.q.setFromRotationMatrix(this.m);
      this.s.setScalar(visible ? 1 : 0);
      this.m.compose(pos, this.q, this.s);
      this.cases.setMatrixAt(i, this.m);
      this.bullets.setMatrixAt(i, this.m);
      this.links.setMatrixAt(i, this.m);
    }
    this.cases.instanceMatrix.needsUpdate = this.bullets.instanceMatrix.needsUpdate = this.links.instanceMatrix.needsUpdate = true;
  }
}

function lathe(points: [number, number][], segs = 24) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs).rotateX(Math.PI / 2);
}

// Browning AN/M2 .50 caliber, flexible mount version with spade grips.
export function buildM2(opts: { ringSight: boolean; belt: boolean; beltSide: 1 | -1 }): GunModel {
  const g = new THREE.Group();
  const metal = gunMetal(), park = gunParkerized();
  const recoilGroup = new THREE.Group();
  g.add(recoilGroup);
  // Receiver body
  const recv = new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.1, 0.56, 3, 0.008), park);
  recv.position.set(0, 0, -0.17);
  recoilGroup.add(recv);
  // side-plate rivets and the trigger-block seam
  const rivetGeo = new THREE.SphereGeometry(0.0035, 6, 4);
  for (const sx of [1, -1]) for (let i = 0; i < 7; i++) {
    for (const yy of [0.03, -0.03]) {
      const r = new THREE.Mesh(rivetGeo, metal);
      r.position.set(sx * 0.0535, yy, -0.4 + i * 0.075);
      recoilGroup.add(r);
    }
  }
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 8).rotateZ(Math.PI / 2), metal);
  hinge.position.set(0, 0.064, 0.07);
  recoilGroup.add(hinge);
  // Top cover with feed tray hump
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.016, 0.34, 2, 0.005), metal);
  cover.position.set(0, 0.058, -0.1);
  recoilGroup.add(cover);
  const coverLatch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.05), metal);
  coverLatch.position.set(0, 0.07, -0.24);
  recoilGroup.add(coverLatch);
  // Side plates rivets / charging handle
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), metal);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.075, 0.0, -0.3);
  recoilGroup.add(handle);
  const handleKnob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), metal);
  handleKnob.position.set(-0.12, 0.0, -0.3);
  recoilGroup.add(handleKnob);
  // Backplate + spade grips
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.11, 0.03, 2, 0.006), park);
  back.position.set(0, 0, -0.465);
  recoilGroup.add(back);
  for (const s of [1, -1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.6 }));
    grip.position.set(s * 0.085, -0.02, -0.52);
    grip.rotation.x = 0.25;
    recoilGroup.add(grip);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.07), park);
    arm.position.set(s * 0.07, -0.02, -0.49);
    recoilGroup.add(arm);
  }
  // Barrel support / trunnion block
  const trunnion = new THREE.Mesh(new RoundedBoxGeometry(0.095, 0.075, 0.1, 2, 0.007), park);
  trunnion.position.set(0, -0.01, 0.13);
  recoilGroup.add(trunnion);
  // Perforated cooling jacket with the barrel visible inside
  const jacketTex = perforatedTexture();
  jacketTex.repeat.set(1, 2);
  const jacket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.55, 20, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.8, alphaMap: jacketTex, alphaTest: 0.5, side: THREE.DoubleSide, envMap: envRef.tex, envMapIntensity: 0.5 }),
  );
  jacket.position.set(0, 0, 0.485);
  recoilGroup.add(jacket);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 1.0, 14).rotateX(Math.PI / 2), metal);
  barrel.position.set(0, 0, 0.66);
  recoilGroup.add(barrel);
  // Muzzle booster / flash hider
  const booster = new THREE.Mesh(lathe([[0, 0], [0.024, 0], [0.026, 0.02], [0.03, 0.09], [0.022, 0.1], [0.0, 0.1]]), metal);
  booster.position.set(0, 0, 1.15);
  recoilGroup.add(booster);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, 1.26);
  recoilGroup.add(muzzle);

  const eye = new THREE.Vector3(0, 0.122, -0.46);
  const sight: THREE.Object3D[] = [];
  if (opts.ringSight) {
    // Ring-and-post: ring at the jacket rear, post (bead) near the muzzle, both on the eye line
    const ringZ = 0.05;
    const ringY = eye.y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.0022, 8, 64), metal);
    ring.position.set(0, ringY, ringZ);
    recoilGroup.add(ring);
    const wireV = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.132, 0.0016), metal);
    wireV.position.copy(ring.position);
    recoilGroup.add(wireV);
    const wireH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.0014, 0.0014), metal);
    wireH.position.set(0, ringY, ringZ);
    recoilGroup.add(wireH);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.006, ringY - 0.066 - 0.02, 0.008), metal);
    stem.position.set(0, (ringY - 0.066 + 0.02) / 2, ringZ);
    recoilGroup.add(stem);
    sight.push(ring, wireV, wireH, stem);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.004, ringY - 0.02, 0.006), metal);
    post.position.set(0, ringY / 2 + 0.005, 1.06);
    recoilGroup.add(post);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8), metal);
    bead.position.set(0, ringY, 1.06);
    recoilGroup.add(bead);
  }
  // Feed tray and belt
  let belt: AmmoBelt | undefined;
  if (opts.belt) {
    const s = opts.beltSide;
    const pts = [
      new THREE.Vector3(0.0, 0.035, -0.02),
      new THREE.Vector3(s * 0.12, 0.03, -0.02),
      new THREE.Vector3(s * 0.26, -0.02, -0.06),
      new THREE.Vector3(s * 0.36, -0.2, -0.12),
      new THREE.Vector3(s * 0.38, -0.45, -0.18),
      new THREE.Vector3(s * 0.33, -0.75, -0.22),
      new THREE.Vector3(s * 0.28, -1.05, -0.24),
    ];
    belt = new AmmoBelt(pts, new THREE.Vector3(0, 0, 1));
    g.add(belt.group);
    const chuteGuide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.11), park);
    chuteGuide.position.set(s * 0.09, 0.03, -0.02);
    g.add(chuteGuide);
  }
  const eject = new THREE.Object3D();
  eject.position.set(0, -0.08, -0.08);
  recoilGroup.add(eject);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, muzzles: [muzzle], recoil: [recoilGroup], eye, belt, ejectPort: eject, sight };
}

// Openings in the waist bulkheads (LivingInterior builds the rooms behind them)
export const WAIST_DOOR_W = 0.5, WAIST_DOOR_TOP = 0.62;
export const TUNNEL_A = 0.6, TUNNEL_B = 0.64, TUNNEL_Y = 0.06;

// Fuselage interior around the waist windows: an elliptical tube with real window
// openings (left forward, right aft as on the B-17G), ribs, stringers and floor.
export function buildWaistInterior(zCenter: number, leftZ: number, rightZ: number): THREE.Group {
  const g = new THREE.Group();
  const tex = interiorTextures();
  const mat = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normal, roughnessMap: tex.rough, normalScale: new THREE.Vector2(0.8, 0.8),
    color: new THREE.Color(1.55, 1.5, 1.4), roughness: 0.9, metalness: 0.15, envMap: envRef.tex, envMapIntensity: 0.06,
  });
  const fmat = frameMat();
  const a = 1.08, b = 1.12;       // half width / half height of the fuselage section
  const yC = 0.15;
  const z0 = zCenter - 3.2, z1 = zCenter + 3.2;
  const winH: [number, number] = [-0.06, 0.55];   // y range of window (relative to yC)
  const winW = 0.8;
  // window angular extent on each side, by y
  const thetaOf = (y: number) => Math.asin(THREE.MathUtils.clamp(y / b, -1, 1));
  const tA = thetaOf(winH[0]), tB = thetaOf(winH[1]);
  // grid lines in theta and z that include window edges (exact openings)
  const thetas = new Set<number>();
  const N = 120;
  for (let i = 0; i <= N; i++) thetas.add(-Math.PI + (i / N) * Math.PI * 2);
  // left window centred on theta=0 (x>0), right on theta=PI
  [tA, tB, Math.PI - tA, Math.PI - tB].forEach((t) => thetas.add(t > Math.PI ? t - Math.PI * 2 : t));
  const tList = [...thetas].sort((p, q) => p - q);
  const zs = new Set<number>();
  const NZ = 64;
  for (let i = 0; i <= NZ; i++) zs.add(z0 + (i / NZ) * (z1 - z0));
  [leftZ - winW / 2, leftZ + winW / 2, rightZ - winW / 2, rightZ + winW / 2].forEach((z) => zs.add(z));
  const zList = [...zs].sort((p, q) => p - q);
  const pos: number[] = [], idx: number[] = [], uvs: number[] = [];
  const TILE = 1.7; // metres per texture repeat
  const P = (t: number, z: number) => [Math.cos(t) * a, yC + Math.sin(t) * b, z];
  const inWindow = (t: number, z: number) => {
    const isLeft = t > tA - 1e-6 && t < tB + 1e-6;
    let tt = t; if (tt < 0) tt += Math.PI * 2;
    const isRight = tt > Math.PI - tB - 1e-6 && tt < Math.PI - tA + 1e-6;
    if (isLeft && Math.abs(z - leftZ) < winW / 2 + 1e-6) return true;
    if (isRight && Math.abs(z - rightZ) < winW / 2 + 1e-6) return true;
    return false;
  };
  const vid = new Map<string, number>();
  const V = (ti: number, zi: number) => {
    const k = ti + ',' + zi;
    let v = vid.get(k);
    if (v === undefined) {
      v = pos.length / 3; pos.push(...P(tList[ti], zList[zi])); vid.set(k, v);
      uvs.push(((tList[ti] + Math.PI) * (a + b) * 0.5) / TILE, (zList[zi] - z0) / TILE);
    }
    return v;
  };
  for (let ti = 0; ti < tList.length - 1; ti++)
    for (let zi = 0; zi < zList.length - 1; zi++) {
      const tm = (tList[ti] + tList[ti + 1]) / 2, zm = (zList[zi] + zList[zi + 1]) / 2;
      if (inWindow(tm, zm)) continue;
      // floor region is handled by a separate plank floor
      const a0 = V(ti, zi), a1 = V(ti + 1, zi), a2 = V(ti, zi + 1), a3 = V(ti + 1, zi + 1);
      idx.push(a0, a2, a1, a1, a2, a3);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // normals should face inward for lighting
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1] - yC;
    const l = Math.hypot(px / a, py / b) || 1;
    nrm.setXYZ(i, -px / a / l, -py / b / l, 0);
  }
  geo.computeTangents?.();
  const shell = new THREE.Mesh(geo, mat);
  shell.name = 'waistShell';
  shell.castShadow = true; shell.receiveShadow = true;
  g.add(shell);
  // Ribs (formers) every 0.5 m, broken at the windows
  const ribZs: number[] = [];
  for (let z = z0 + 0.25; z < z1; z += 0.48) ribZs.push(z);
  for (const z of ribZs) {
    const nearL = Math.abs(z - leftZ) < winW / 2 + 0.02, nearR = Math.abs(z - rightZ) < winW / 2 + 0.02;
    const pts: THREE.Vector3[][] = [];
    let cur: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const t = -Math.PI + (i / 96) * Math.PI * 2;
      const blocked = (nearL && t > tA && t < tB) || (nearR && ((t + Math.PI * 2) % (Math.PI * 2)) > Math.PI - tB && ((t + Math.PI * 2) % (Math.PI * 2)) < Math.PI - tA);
      if (blocked) { if (cur.length > 1) pts.push(cur); cur = []; continue; }
      cur.push(new THREE.Vector3(Math.cos(t) * (a - 0.045), yC + Math.sin(t) * (b - 0.045), z));
    }
    if (cur.length > 1) pts.push(cur);
    for (const seg of pts) {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), seg.length, 0.035, 4), fmat);
      tube.castShadow = true; tube.receiveShadow = true;
      g.add(tube);
    }
  }
  // Window frames (thick sills with depth) for both windows
  const frame = (side: 1 | -1, zc: number) => {
    const tM = side === 1 ? (tA + tB) / 2 : Math.PI - (tA + tB) / 2;
    const xIn = Math.cos(tM) * a;
    const yLo = yC + winH[0], yHi = yC + winH[1];
    const mk = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fmat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    // Thin pressed-metal window surround (sits just inside the skin)
    const depth = 0.05;
    const xf = xIn - side * 0.015;
    mk(depth, 0.035, winW + 0.07, xf, yLo - 0.017, zc);
    mk(depth, 0.035, winW + 0.07, xf - side * 0.02, yHi + 0.017, zc);
    mk(depth, yHi - yLo + 0.07, 0.035, xf, (yLo + yHi) / 2, zc - winW / 2 - 0.017);
    mk(depth, yHi - yLo + 0.07, 0.035, xf, (yLo + yHi) / 2, zc + winW / 2 + 0.017);
  };
  frame(1, leftZ);
  frame(-1, rightZ);

  // Floor walkway
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.9, envMap: envRef.tex, envMapIntensity: 0.1 }));
  floor.position.set(0, yC - b * 0.78, zCenter);
  floor.receiveShadow = true;
  g.add(floor);
  // Ammunition boxes under each window
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x3b3d2a, roughness: 0.75, metalness: 0.2, envMap: envRef.tex, envMapIntensity: 0.15 });
  for (const [side, zc] of [[1, leftZ], [-1, rightZ]] as [number, number][]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.5), boxMat);
    box.position.set(side * 0.62, yC - b * 0.78 + 0.22, zc - 0.25);
    box.castShadow = true; box.receiveShadow = true;
    g.add(box);
  }
  // Oxygen bottles, cables and stringers for clutter
  const yel = new THREE.MeshStandardMaterial({ color: 0x8a7a2a, roughness: 0.5, metalness: 0.3, envMap: envRef.tex, envMapIntensity: 0.2 });
  for (let i = 0; i < 3; i++) {
    const bottle = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 4, 10), yel);
    bottle.rotation.x = Math.PI / 2;
    bottle.position.set(-0.75, yC + 0.75, zCenter - 1.6 + i * 0.25);
    bottle.castShadow = true;
    g.add(bottle);
  }
  for (const t of [0.95, 1.35, 1.8, 2.2, -0.6, -2.6]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, z1 - z0), fmat);
    s.position.set(Math.cos(t) * (a - 0.03), yC + Math.sin(t) * (b - 0.03), zCenter);
    g.add(s);
  }
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, yC + b - 0.1, z0), new THREE.Vector3(0.35, yC + b - 0.14, zCenter), new THREE.Vector3(0.28, yC + b - 0.1, z1),
  ]), 20, 0.012, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  g.add(cable);
  // Bulkheads closing the ends: the forward one has the open door to the radio room, the aft
  // one the opening into the tail tunnel (both furnished by LivingInterior)
  const floorTop = yC - b * 0.78 + 0.015;
  for (const z of [z0, z1]) {
    const shape = new THREE.Shape().absellipse(0, 0, a, b, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    if (z === z1) {
      const dw = WAIST_DOOR_W / 2, y0 = floorTop - yC, y1 = WAIST_DOOR_TOP - yC, r = 0.12;
      hole.moveTo(-dw, y0); hole.lineTo(dw, y0); hole.lineTo(dw, y1 - r);
      hole.quadraticCurveTo(dw, y1, dw - r, y1); hole.lineTo(-dw + r, y1);
      hole.quadraticCurveTo(-dw, y1, -dw, y1 - r); hole.lineTo(-dw, y0);
    } else hole.absellipse(0, TUNNEL_Y - yC, TUNNEL_A, TUNNEL_B, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    const bh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), mat);
    bh.position.set(0, yC, z);
    if (z === z1) bh.rotation.y = Math.PI; // face the inside of the tube
    bh.receiveShadow = true;
    g.add(bh);
    // door frame / tunnel coaming
    if (z === z1) {
      const dw = WAIST_DOOR_W / 2;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, WAIST_DOOR_TOP - floorTop, 0.06), fmat);
        post.position.set(sx * (dw + 0.02), (WAIST_DOOR_TOP + floorTop) / 2, z - 0.02);
        g.add(post);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(WAIST_DOOR_W + 0.08, 0.05, 0.06), fmat);
      lintel.position.set(0, WAIST_DOOR_TOP + 0.02, z - 0.02);
      g.add(lintel);
    } else {
      const coaming = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 5, 32), fmat);
      coaming.scale.set(TUNNEL_A + 0.02, TUNNEL_B + 0.02, 1);
      coaming.position.set(0, TUNNEL_Y, z + 0.02);
      g.add(coaming);
    }
  }
  addWaistProps(g, zCenter);
  return g;
}

// Turret (Sperry top / ball): ring frame, plexiglass struts, reflector sight
export function buildTurret(kind: 'top' | 'ball'): { group: THREE.Group; guns: GunModel[]; sight: THREE.Mesh } {
  const g = new THREE.Group();
  const fmat = frameMat();
  const guns: GunModel[] = [];
  // a single gun, centred below the eye line (the player prefers one barrel to the twin mount)
  {
    const m = buildM2({ ringSight: false, belt: true, beltSide: 1 });
    m.group.position.set(0, kind === 'ball' ? -0.22 : -0.19, kind === 'ball' ? 0.1 : -0.05);
    g.add(m.group);
    guns.push(m);
  }
  // Reflector sight: glass with an illuminated reticle
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(255,140,40,1)'; x.lineWidth = 3;
  x.beginPath(); x.arc(128, 128, 90, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(255,140,40,1)';
  x.beginPath(); x.arc(128, 128, 5, 0, Math.PI * 2); x.fill();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.fillRect(128 + dx * 100 - 2 + (dx ? 0 : 0), 128 + dy * 100 - 2, dx ? 20 * dx : 4, dy ? 20 * dy : 4); }
  const tex = new THREE.CanvasTexture(c);
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(3, 1.6, 0.6),
  }));
  sight.position.set(0, 0.03, 0.32);
  sight.rotation.y = Math.PI;
  sight.renderOrder = 40;
  g.add(sight);
  const sightBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.12), new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.6, metalness: 0.5 }));
  sightBody.position.set(0, -0.085, 0.27);
  sightBody.visible = false; // sat right under the aim point; the reticle floats on its own
  // Dome struts: left out of the view (they cut the sky into panels); the faint glass stays
  const R = kind === 'ball' ? 0.62 : 0.68;
  for (let i = 0; i < 0; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const el = (k / 12) * Math.PI * 0.5;
      pts.push(new THREE.Vector3(Math.sin(a) * Math.cos(el) * R, (kind === 'ball' ? 1 : 1) * Math.sin(el) * R * (kind === 'ball' ? -1 : 1) - 0.15, Math.cos(a) * Math.cos(el) * R));
    }
    const strut = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 4), fmat);
    g.add(strut);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 6, 48), fmat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.32; // dropped below the eye line so it no longer crosses the view
  g.add(ring);
  if (kind === 'ball') {
    // armoured glass port frame
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.014, 8, 48), fmat);
    port.position.set(0, 0.0, 0.55);
    g.add(port);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== sight) { o.castShadow = true; o.receiveShadow = true; } });
  // Faint plexiglass dome added after the shadow pass so it stays shadow-free
  g.add(turretGlassDome(kind, R));
  return { group: g, guns, sight };
}

// Tail gunner's position: cramped compartment with a framed window aft
export function buildTailInterior(): THREE.Group {
  const g = new THREE.Group();
  const fmat = frameMat();
  const mat = interiorMat();
  // A box-ish cocoon around the gunner, with a window opening facing +Z (gun frame forward)
  const mk = (w: number, h: number, d: number, x: number, y: number, z: number, m = mat) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
  };
  mk(0.08, 0.9, 1.4, 0.48, 0.05, -0.2);
  mk(0.08, 0.9, 1.4, -0.48, 0.05, -0.2);
  mk(1.0, 0.08, 1.4, 0, 0.5, -0.2);
  mk(1.0, 0.08, 1.4, 0, -0.4, -0.2);
  // window frame (forward)
  mk(0.035, 0.62, 0.04, 0.34, 0.14, 0.5, fmat);
  mk(0.035, 0.62, 0.04, -0.34, 0.14, 0.5, fmat);
  mk(0.72, 0.035, 0.04, 0, 0.46, 0.5, fmat);
  mk(0.72, 0.05, 0.05, 0, -0.17, 0.5, fmat);

  // Armour plate bolted to the sill below the window, with a rivet row top and bottom
  const armour = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.07, 0.075, 0.06), roughness: 0.45, metalness: 0.6, envMap: envRef.tex, envMapIntensity: 0.15 });
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.24, 0.03, 2, 0.008), armour);
  plate.position.set(0, -0.27, 0.53);
  plate.castShadow = true; plate.receiveShadow = true;
  g.add(plate);
  const rivetGeo = new THREE.SphereGeometry(0.007, 6, 4);
  for (const yy of [-0.2, -0.35]) for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(rivetGeo, fmat);
    r.position.set(-0.3 + i * 0.12, yy, 0.547);
    g.add(r);
  }

  // Ammunition feed: sheet-metal troughs running back from each gun to an ammo can
  // beside the seat. Gun pivots sit at x = +/-0.15 and the receiver ends at z = -0.45.
  const feedMat = linkMat();
  const canMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.11, 0.06), roughness: 0.7, metalness: 0.35 });
  const mkSolid = (d: [number, number, number], x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), m);
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; g.add(b);
  };
  // U-shaped trough: two side walls and a floor, built along x or z
  const trough = (x: number, y: number, z: number, len: number, axis: 'x' | 'z') => {
    const w = 0.035, h = 0.03, t = 0.004;
    const off = (w - t) / 2;
    const sideDims: [number, number, number] = axis === 'z' ? [t, h, len] : [len, h, t];
    const floorDims: [number, number, number] = axis === 'z' ? [w, t, len] : [len, t, w];
    const ox = axis === 'z' ? off : 0, oz = axis === 'z' ? 0 : off;
    mkSolid(sideDims, x - ox, y, z - oz, feedMat);
    mkSolid(sideDims, x + ox, y, z + oz, feedMat);
    mkSolid(floorDims, x, y - (h - t) / 2, z, feedMat);
  };
  for (const s of [1, -1]) {
    trough(s * 0.15, -0.085, -0.26, 0.4, 'z');        // runs back under the gun
    trough(s * 0.24, -0.085, -0.46, 0.18, 'x');       // turns outward at the back
    mkSolid([0.1, 0.2, 0.26], s * 0.36, -0.2, -0.5, canMat); // ammo can
  }

  // Padded seat back and cushion: the gunner's back rests on the front face at z = -0.56
  const padMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.1, 0.06), roughness: 0.85, metalness: 0.0 });
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.44, 0.12, 4, 0.05), padMat);
  back.position.set(0, -0.08, -0.62);
  back.castShadow = true; back.receiveShadow = true;
  g.add(back);
  const buttonGeo = new THREE.SphereGeometry(0.008, 6, 4);
  const buttonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.04, 0.025, 0.015), roughness: 0.6 });
  for (const bx of [-0.13, 0, 0.13]) for (const by of [-0.22, -0.08, 0.06]) {
    const btn = new THREE.Mesh(buttonGeo, buttonMat);
    btn.position.set(bx, by, -0.553);
    g.add(btn);
  }
  const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.06, 0.34, 3, 0.02), padMat);
  cushion.position.set(0, -0.33, -0.42);
  cushion.castShadow = true; cushion.receiveShadow = true;
  g.add(cushion);

  // Thin perspex pane filling the window opening (about x +/-0.32, y -0.145..0.44).
  // Transparent materials are routed to the post-cloud pass automatically.
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.5875, 0.006), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.55, 0.65, 0.7), transparent: true, opacity: 0.08, roughness: 0.06, metalness: 0,
    envMap: envRef.tex, envMapIntensity: 0.6, depthWrite: false,
  }));
  pane.position.set(0, 0.14875, 0.5);
  g.add(pane);
  // Faint reflection streaks on the inner face, additive so they only brighten
  const rc = document.createElement('canvas');
  rc.width = rc.height = 256;
  const rg = rc.getContext('2d')!;
  const band = (x: number, w: number, a: number) => {
    const grd = rg.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    rg.fillStyle = grd;
    rg.beginPath();
    rg.moveTo(x, 256); rg.lineTo(x + w * 0.5, 0); rg.lineTo(x + w, 256); rg.closePath();
    rg.fill();
  };
  band(40, 70, 0.55);
  band(150, 36, 0.3);
  const reflTex = new THREE.CanvasTexture(rc);
  reflTex.colorSpace = THREE.SRGBColorSpace;
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.5875), new THREE.MeshBasicMaterial({
    map: reflTex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  refl.position.set(0, 0.14875, 0.496);
  // the streaks reflect the sky's light: unlit white they stood as two bright cones in the
  // window at night (the sky there is ~1/50 of the day's)
  refl.onBeforeRender = () => {
    const h = Atmos.horizon, c = (refl.material as THREE.MeshBasicMaterial).color;
    c.setRGB(Math.min(1, h.r / 0.6), Math.min(1, h.g / 0.6), Math.min(1, h.b / 0.6));
  };
  g.add(refl);
  return g;
}
