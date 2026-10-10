import * as THREE from 'three';
import { envRef } from '../render/EnvRef';

// Procedural first-person geometry for the B-17 gun positions: fuselage interior,
// Browning AN/M2 .50 cal with ring-and-post sight, ammunition belt, turret frames.
// Gun frame convention: origin at the mount pivot, +Z along the bore, +Y up, +X left.

const interiorMat = (side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.062, 0.045), roughness: 0.88, metalness: 0.1, envMap: envRef.tex, envMapIntensity: 0.06, side });
const frameMat = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.025, 0.026, 0.022), roughness: 0.75, metalness: 0.3, envMap: envRef.tex, envMapIntensity: 0.04 });
const gunMetal = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.052, 0.05), roughness: 0.5, metalness: 0.6, envMap: envRef.tex, envMapIntensity: 0.18 });
const gunParkerized = () => new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.062, 0.056), roughness: 0.72, metalness: 0.4, envMap: envRef.tex, envMapIntensity: 0.12 });
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
    const caseGeo = new THREE.CylinderGeometry(0.0105, 0.0102, 0.099, 10).rotateX(Math.PI / 2).translate(0, 0, -0.02);
    const bulletGeo = new THREE.CylinderGeometry(0.0012, 0.0064, 0.05, 10).rotateX(Math.PI / 2).translate(0, 0, 0.054);
    const linkGeo = new THREE.BoxGeometry(0.03, 0.026, 0.05).translate(0, 0, -0.025);
    this.cases = new THREE.InstancedMesh(caseGeo, brassMat(), this.count);
    this.bullets = new THREE.InstancedMesh(bulletGeo, bulletMat(), this.count);
    this.links = new THREE.InstancedMesh(linkGeo, linkMat(), this.count);
    // Tips: alternating armour-piercing (black), incendiary (blue), tracer (red)
    const tipCols = [new THREE.Color(0.55, 0.24, 0.09), new THREE.Color(0.06, 0.06, 0.06), new THREE.Color(0.55, 0.24, 0.09), new THREE.Color(0.6, 0.08, 0.05)];
    for (let i = 0; i < this.count; i++) this.bullets.setColorAt(i, tipCols[i % tipCols.length]);
    for (const m of [this.cases, this.bullets, this.links]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.update();
  }

  advance(rounds: number) { this.phase = (this.phase + rounds) % 4; this.update(); }

  update() {
    const tan = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const x = new THREE.Vector3(), y = new THREE.Vector3();
    const z = this.roundDir;
    const frac = this.phase % 1;
    for (let i = 0; i < this.count; i++) {
      const visible = i < this.visibleRounds;
      const u = Math.min(1, Math.max(0, ((i + frac) * this.pitch) / this.length));
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
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.1, 0.56), park);
  recv.position.set(0, 0, -0.17);
  recoilGroup.add(recv);
  // Top cover with feed tray hump
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.016, 0.34), metal);
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
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.03), park);
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
  const trunnion = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.075, 0.1), park);
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
  return { group: g, muzzles: [muzzle], recoil: [recoilGroup], eye, belt, ejectPort: eject };
}

// Fuselage interior around the waist windows: an elliptical tube with real window
// openings (left forward, right aft as on the B-17G), ribs, stringers and floor.
export function buildWaistInterior(zCenter: number, leftZ: number, rightZ: number): THREE.Group {
  const g = new THREE.Group();
  const mat = interiorMat();
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
  const pos: number[] = [], idx: number[] = [];
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
    if (v === undefined) { v = pos.length / 3; pos.push(...P(tList[ti], zList[zi])); vid.set(k, v); }
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
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // normals should face inward for lighting
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1] - yC;
    const l = Math.hypot(px / a, py / b) || 1;
    nrm.setXYZ(i, -px / a / l, -py / b / l, 0);
  }
  const shell = new THREE.Mesh(geo, mat);
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
    const depth = 0.16;
    mk(depth, 0.06, winW + 0.12, xIn - side * 0.02, yLo - 0.03, zc);
    mk(depth, 0.06, winW + 0.12, xIn * Math.cos(0.25) - side * 0.04, yHi + 0.03, zc);
    mk(depth, yHi - yLo + 0.1, 0.07, xIn - side * 0.02, (yLo + yHi) / 2, zc - winW / 2 - 0.035);
    mk(depth * 1.4, yHi - yLo + 0.1, 0.09, xIn - side * 0.04, (yLo + yHi) / 2, zc + winW / 2 + 0.045);
    // wind deflector panel ahead of the window
    mk(0.03, yHi - yLo, 0.18, xIn + side * 0.06, (yLo + yHi) / 2, zc + winW / 2 + 0.12);
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
  // Bulkheads closing the ends
  for (const z of [z0, z1]) {
    const bh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat);
    bh.scale.set(a, b, 1);
    bh.position.set(0, yC, z);
    if (z === z1) bh.rotation.y = Math.PI; // face the inside of the tube
    g.add(bh);
  }
  return g;
}

// Turret (Sperry top / ball): ring frame, plexiglass struts, reflector sight
export function buildTurret(kind: 'top' | 'ball'): { group: THREE.Group; guns: GunModel[]; sight: THREE.Mesh } {
  const g = new THREE.Group();
  const fmat = frameMat();
  const guns: GunModel[] = [];
  for (const s of [1, -1]) {
    const m = buildM2({ ringSight: false, belt: false, beltSide: 1 });
    m.group.position.set(s * 0.26, -0.06, kind === 'ball' ? 0.1 : -0.05);
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
  const sightBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.16), new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.6, metalness: 0.5 }));
  sightBody.position.set(0, -0.06, 0.27);
  g.add(sightBody);
  // Dome struts
  const R = kind === 'ball' ? 0.62 : 0.68;
  for (let i = 0; i < 6; i++) {
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
  ring.position.y = -0.15;
  g.add(ring);
  if (kind === 'ball') {
    // armoured glass port frame
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 32), fmat);
    port.position.set(0, 0.0, 0.5);
    g.add(port);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== sight) { o.castShadow = true; o.receiveShadow = true; } });
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
  mk(0.06, 0.6, 0.06, 0.3, 0.12, 0.5, fmat);
  mk(0.06, 0.6, 0.06, -0.3, 0.12, 0.5, fmat);
  mk(0.66, 0.06, 0.06, 0, 0.44, 0.5, fmat);
  mk(0.66, 0.1, 0.08, 0, -0.18, 0.5, fmat);
  mk(0.03, 0.6, 0.03, 0, 0.12, 0.52, fmat);
  return g;
}
