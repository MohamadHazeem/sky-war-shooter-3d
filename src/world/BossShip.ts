import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Aircraft, HitZone } from './Aircraft';
import { tintModel } from './EnemyTypes';

/**
 * Luftkreuzer: a fictional German flying warship for the boss battle. The hull is the Ju 88
 * model drawn ~3x the size of a normal enemy, with procedural parts bolted on (extra engine
 * nacelles, gun turrets, a dorsal flak cannon, rocket pods, a belly fuel tank, an armoured
 * bridge and armour plating). Static parts are merged into one mesh per ship; each turret
 * is its own small mesh so it can swing onto its target.
 *
 * Damage model: every part is a hit zone with its own HP. The hull is covered by "core"
 * zones whose HP is reset every frame; whatever the bullets took off them is charged to the
 * ship's core pool, scaled by the armour (World.onHit stays untouched: we poll). The core
 * only takes full damage once enough parts are destroyed ("ARMOUR BREACHED").
 *
 * Model frame (unscaled Ju 88): +Z nose (3.65), tail -10.7, +X left wing (span +-10),
 * fuselage radius ~0.69 around y = 0, wing surface y ~ 0.05 + 0.065|x|, chord z ~ -2.4..0.6.
 */

export type PartKind = 'turret' | 'flak' | 'rockets' | 'engine' | 'fuel' | 'bridge';

export const PART_LABEL: Record<PartKind, string> = {
  turret: 'TURRET', flak: 'FLAK 88', rockets: 'ROCKETS', engine: 'ENGINE', fuel: 'FUEL', bridge: 'BRIDGE',
};

// Base part HP (scaled per battle by BossBattle's hpScale)
const PART_HP: Record<PartKind, number> = { turret: 450, flak: 700, rockets: 500, engine: 700, fuel: 600, bridge: 900 };
export const CORE_HP = 4600;
const CORE_BIG = 1e9;

export interface ShipPart {
  kind: PartKind;
  zone: HitZone;
  local: THREE.Vector3;      // part centre, model frame (unscaled)
  up: THREE.Vector3;         // outward mount normal (turret field of fire), model frame
  hp: number; maxHp: number;
  alive: boolean;
  hitT: number;              // seconds since the last hit (HUD flash)
  mesh: THREE.Object3D | null;  // moving mesh (turrets, flak gun)
  range: [number, number] | null; // vertex range in the static merged mesh
  disc: [number, number] | null;  // vertex range in the extra prop-disc mesh
  engine: number;            // 0/1 = the model's own props, 2+ = bolted-on nacelles, -1 = not an engine
  side: number;              // +1 left wing, -1 right wing, 0 centreline
  // weapon state, driven by BossBattle
  cd: number; burst: number; shots: number; acc: number;
  target: Aircraft | null; retarget: number;
  err: THREE.Vector3;        // current aim error (walks in during a burst)
  aim: THREE.Vector3;        // current barrel direction, model frame
  charge: number;            // 0..1 telegraph charge (glow, HUD)
}

export interface ShipDef { name: string; title: string; mult: number; flagship: boolean; tint: THREE.Color }

export const SHIP_DEFS: ShipDef[] = [
  { name: 'Walküre', title: 'Luftkreuzer', mult: 3.2, flagship: false, tint: new THREE.Color(0.58, 0.62, 0.66) },
  { name: 'Donnerkeil', title: 'Luftkreuzer', mult: 3.1, flagship: false, tint: new THREE.Color(0.66, 0.64, 0.58) },
  { name: 'Brunhilde', title: 'Luftkreuzer', mult: 3.15, flagship: false, tint: new THREE.Color(0.55, 0.6, 0.55) },
  { name: 'Götterdämmerung', title: 'Schlachtkreuzer', mult: 3.6, flagship: true, tint: new THREE.Color(0.42, 0.44, 0.48) },
];

// ---------- shared resources ----------
const C = (hex: number) => new THREE.Color(hex);
const COL = {
  steel: C(0x464b4e), plate: C(0x2c3034), rivet: C(0x1e2124), nacelle: C(0x4d5549), cowl: C(0x24272a),
  turret: C(0x3a3f3c), barrel: C(0x151515), tank: C(0x6f6236), stripe: C(0x8c1d15), bridge: C(0x3b413c),
  glass: C(0xc9b46a), pod: C(0x3f4436), tube: C(0x101010), char: C(0x0d0c0b), white: C(0xd8d8d0),
};

let boltMatProto: THREE.MeshStandardMaterial | null = null;
function boltMat() {
  // one prototype; each ship clones it (same shader program) so its emissive can pulse
  boltMatProto ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.45 });
  return boltMatProto.clone();
}

let discTex: THREE.CanvasTexture | null = null;
function discTexture() {
  if (discTex) return discTex;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    let al = 0;
    if (r < 1 && r > 0.1) al = (0.06 + 0.12 * Math.pow(0.5 + 0.5 * Math.cos(a * 3), 6)) * (1 - Math.pow(r, 6)) * Math.min(1, (r - 0.1) * 8);
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 35; img.data[i + 3] = Math.min(255, al * 400);
  }
  g.putImageData(img, 0, 0);
  discTex = new THREE.CanvasTexture(c);
  discTex.colorSpace = THREE.SRGBColorSpace;
  return discTex;
}

// Turret meshes are shared geometry: +Y = mount normal, +Z = barrels
let turretGeo: THREE.BufferGeometry | null = null;
let flakGeo: THREE.BufferGeometry | null = null;

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _left = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Collects primitives (non-indexed, vertex-coloured) and remembers each part's vertex range
class Builder {
  geos: THREE.BufferGeometry[] = [];
  count = 0;
  add(g: THREE.BufferGeometry, col: THREE.Color, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): [number, number] {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ng.deleteAttribute(k);
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    ng.applyMatrix4(_m4);
    const n = ng.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.geos.push(ng);
    const r: [number, number] = [this.count, this.count + n];
    this.count += n;
    return r;
  }
  merge() { const g = mergeGeometries(this.geos, false)!; for (const x of this.geos) x.dispose(); this.geos = []; return g; }
}

const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).rotateX(Math.PI / 2); // along +Z, top = front
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const dome = (r: number) => new THREE.SphereGeometry(r, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
const ball = (r: number) => new THREE.SphereGeometry(r, 12, 8);

function buildTurretGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.42, 0.47, 0.16, 16), COL.turret, 0, 0.02, 0);
  b.add(dome(0.36), COL.turret, 0, 0.08, 0);
  b.add(box(0.5, 0.18, 0.22), COL.plate, 0, 0.2, 0.22);
  for (const x of [0.11, -0.11]) {
    b.add(cyl(0.042, 0.05, 1.15, 8), COL.barrel, x, 0.2, 0.78);
    b.add(cyl(0.06, 0.06, 0.12, 8), COL.barrel, x, 0.2, 1.33);
  }
  return b.merge();
}

function buildFlakGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.52, 0.6, 0.22, 18), COL.turret, 0, 0.02, 0);
  b.add(box(0.9, 0.46, 0.8), COL.plate, 0, 0.32, -0.05);       // gun shield house
  b.add(box(0.94, 0.06, 0.84), COL.rivet, 0, 0.56, -0.05);
  b.add(box(0.26, 0.26, 0.5), COL.steel, 0, 0.3, 0.45);        // breech/recoil block
  b.add(cyl(0.065, 0.075, 2.3, 10), COL.barrel, 0, 0.3, 1.6);   // long 8.8 cm barrel
  b.add(cyl(0.1, 0.1, 0.22, 10), COL.barrel, 0, 0.3, 2.72);     // muzzle brake
  return b.merge();
}

export class BossShip extends Aircraft {
  readonly boss = true;               // marks a boss target for generic code (kill handlers, markers)
  readonly def: ShipDef;
  readonly S: number;                // model scale
  parts: ShipPart[] = [];
  coreZones: HitZone[] = [];
  core = CORE_HP; coreMax = CORE_HP;
  armourMult = 0.1;                  // core damage multiplier until the armour is breached
  breached = false;
  breachNeed = 5;
  dying = false;
  // formation flying (formation frame: x left, y up, z forward, relative to the formation centre)
  off = new THREE.Vector3();
  relVel = new THREE.Vector3();
  station = new THREE.Vector3();
  maxRel = 18;
  accel = 7;
  cruise = 75;
  formation: { center: THREE.Vector3; forward: THREE.Vector3 } | null = null;
  listRoll = 0;                      // lean toward dead engines (rad)
  extraRoll = 0;                     // death roll / ram bank
  extraPitch = 0;
  private roll = 0;
  private phase = Math.random() * 100;
  // damage bookkeeping (read and cleared by BossBattle)
  readonly destroyed: ShipPart[] = [];
  hullHitT = 99;                     // seconds since the hull was last hit
  hullHitPlayer = false;
  coreHitAcc = 0;                    // core damage this frame (for HUD/feedback)
  readonly boltMesh: THREE.Mesh;
  readonly boltMat: THREE.MeshStandardMaterial;
  private discMesh: THREE.Mesh | null = null;
  private discMat: THREE.MeshBasicMaterial;
  private propAngle = 0;

  constructor(def: ShipDef, scale: number, hpScale: number) {
    super('ju88', 'axis', 1.5);
    this.def = def;
    this.S = scale;
    this.label = def.name;
    tintModel(this.model, def.tint);
    this.model.scale.setScalar(scale);
    this.boltMat = boltMat();
    this.discMat = new THREE.MeshBasicMaterial({ map: discTexture().clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.discMat.map!.center.set(0.5, 0.5);
    this.discMat.map!.needsUpdate = true;
    turretGeo ??= buildTurretGeo();
    flakGeo ??= buildFlakGeo();

    const b = new Builder();
    const discs = new Builder();
    const P = (kind: PartKind, local: THREE.Vector3, zoneOff: THREE.Vector3, r: number, up = UP, extra: Partial<ShipPart> = {}) => {
      const hp = PART_HP[kind] * hpScale * (def.flagship ? 1.25 : 1);
      const zone: HitZone = { name: `${kind}${this.parts.length}`, offset: zoneOff.clone().multiplyScalar(scale), radius: r * scale, hp, maxHp: hp };
      this.zones.push(zone);
      const p: ShipPart = {
        kind, zone, local: local.clone(), up: up.clone().normalize(), hp, maxHp: hp, alive: true, hitT: 99, mesh: null, range: null, disc: null,
        engine: -1, side: Math.sign(local.x), cd: 1 + Math.random() * 3, burst: 0, shots: 0, acc: 0, target: null, retarget: 0,
        err: new THREE.Vector3(), aim: up.clone().normalize(), charge: 0, ...extra,
      };
      this.parts.push(p);
      return p;
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- armour plating (static, not a weak point) ---
    for (const s of [1, -1]) {
      b.add(box(0.06, 0.78, 6.6), COL.plate, s * 0.7, 0.02, -2.9);
      for (const z of [-5.8, -4.3, -2.8, -1.3, 0.2]) b.add(box(0.08, 0.8, 0.07), COL.rivet, s * 0.72, 0.02, z);
      b.add(box(0.05, 0.5, 2.0), COL.plate, s * 0.55, -0.1, -7.2, 0, s * 0.06, 0);
      b.add(box(1.7, 0.06, 1.6), COL.plate, s * 1.5, 0.2, -0.9, 0, 0, s * -0.06);   // wing-root plates
      b.add(box(0.06, 0.12, 9.5), COL.white, s * 0.69, 0.47, -3.0);                   // pale band along the hull
    }
    b.add(box(1.1, 0.06, 2.4), COL.plate, 0, -0.71, -0.3);                          // belly armour

    // --- engines: the model's two plus bolted-on outer nacelles ---
    const engines: [number, number, number][] = [[2.78, -0.34, 2.93], [-2.76, -0.34, 2.93], [6.0, 0.3, 2.35], [-6.0, 0.3, 2.35]];
    if (def.flagship) engines.push([8.6, 0.46, 2.0], [-8.6, 0.46, 2.0]);
    engines.forEach(([x, y, z], i) => {
      const part = P('engine', V(x, y, z - 1.2), V(x, y + 0.05, z - 0.9), 0.62, UP, { engine: i });
      if (i < 2) return; // the model has its own nacelles and props
      const r0 = b.count;
      b.add(cyl(0.43, 0.3, 3.4, 14), COL.nacelle, x, y, z - 1.8);
      b.add(cyl(0.46, 0.44, 0.42, 14), COL.cowl, x, y, z - 0.15);
      b.add(new THREE.ConeGeometry(0.18, 0.5, 10).rotateX(Math.PI / 2), COL.cowl, x, y, z + 0.25);
      for (const s of [1, -1]) b.add(box(0.06, 0.1, 0.9), COL.rivet, x + s * 0.4, y, z - 0.9);
      part.range = [r0, b.count];
      const d0 = discs.count;
      discs.add(new THREE.CircleGeometry(i >= 4 ? 1.2 : 1.45, 32), COL.white, x, y, z + 0.08);
      part.disc = [d0, discs.count];
    });

    // --- gun turrets (moving meshes) ---
    const turret = (pos: THREE.Vector3, up: THREE.Vector3, kind: 'turret' | 'flak' = 'turret') => {
      const zoneOff = pos.clone().addScaledVector(up, kind === 'flak' ? 0.35 : 0.25);
      const part = P(kind, pos, zoneOff, kind === 'flak' ? 0.62 : 0.5, up);
      const m = new THREE.Mesh(kind === 'flak' ? flakGeo! : turretGeo!, this.boltMat);
      m.position.copy(pos);
      m.castShadow = false;
      this.model.add(m);
      part.mesh = m;
      // base ring welded to the hull
      b.add(new THREE.CylinderGeometry(kind === 'flak' ? 0.64 : 0.5, kind === 'flak' ? 0.7 : 0.55, 0.14, 16), COL.rivet, pos.x - up.x * 0.04, pos.y - up.y * 0.04, pos.z - up.z * 0.04,
        up.z !== 0 ? Math.sign(up.z) * Math.PI / 2 : up.y < 0 ? Math.PI : 0);
      this.aimTurret(part, part.aim, 1);
      return part;
    };
    turret(V(0, 0.69, -0.55), V(0, 1, 0));
    turret(V(0, -0.69, -1.9), V(0, -1, 0));
    // tail stinger: a ball turret on a boom past the rudder
    b.add(cyl(0.16, 0.24, 1.2, 10), COL.steel, 0, 0.1, -10.15);
    turret(V(0, 0.1, -10.75), V(0, 0, -1));
    turret(V(0, 0.68, -4.4), V(0, 1, 0), 'flak');
    if (def.flagship) {
      turret(V(0, 0.64, -6.4), V(0, 1, 0));
      turret(V(4.3, 0.4, -1.0), V(0, 1, 0));
      turret(V(-4.3, 0.4, -1.0), V(0, 1, 0));
    }

    // --- armoured bridge on the spine ---
    {
      const r0 = b.count;
      b.add(box(0.95, 0.5, 1.5), COL.bridge, 0, 0.92, -2.35);
      b.add(box(1.0, 0.07, 1.56), COL.rivet, 0, 1.18, -2.35);
      b.add(box(0.97, 0.08, 0.06), COL.glass, 0, 1.02, -1.6);         // vision slits
      for (const s of [1, -1]) b.add(box(0.06, 0.08, 0.9), COL.glass, s * 0.485, 1.02, -2.1);
      b.add(cyl(0.025, 0.025, 1.6, 6).rotateX(-Math.PI / 2), COL.barrel, 0, 1.95, -2.7); // mast (vertical)
      b.add(box(0.9, 0.04, 0.04), COL.barrel, 0, 2.5, -2.7);
      const part = P('bridge', V(0, 0.92, -2.35), V(0, 1.0, -2.3), 0.62);
      part.range = [r0, b.count];
    }
    // --- belly fuel tank ---
    {
      const r0 = b.count;
      b.add(cyl(0.4, 0.4, 2.8, 16), COL.tank, 0, -1.05, -4.7);
      b.add(ball(0.4), COL.tank, 0, -1.05, -3.3);
      b.add(ball(0.4), COL.tank, 0, -1.05, -6.1);
      for (const z of [-4.0, -5.4]) b.add(cyl(0.415, 0.415, 0.18, 16), COL.stripe, 0, -1.05, z);
      for (const z of [-3.6, -5.8]) b.add(box(0.14, 0.42, 0.14), COL.rivet, 0, -0.78, z);
      const part = P('fuel', V(0, -1.05, -4.7), V(0, -1.2, -4.7), 0.7, V(0, -1, 0));
      part.range = [r0, b.count];
    }
    // --- rocket pods under the wings ---
    for (const s of [1, -1]) {
      const x = s * 3.95, r0 = b.count;
      b.add(box(0.56, 0.4, 1.8), COL.pod, x, -0.08, -0.55);
      b.add(box(0.08, 0.2, 0.9), COL.rivet, x, 0.18, -0.6);
      for (let i = 0; i < 6; i++) b.add(cyl(0.085, 0.085, 0.08, 8), COL.tube, x + ((i % 3) - 1) * 0.17, -0.08 + (i < 3 ? 0.1 : -0.1), 0.36);
      const part = P('rockets', V(x, -0.08, -0.2), V(x, -0.22, -0.4), 0.55, V(0, -1, 0));
      part.range = [r0, b.count];
    }

    this.boltMesh = new THREE.Mesh(b.merge(), this.boltMat);
    this.boltMesh.castShadow = true;
    this.boltMesh.receiveShadow = true;
    this.model.add(this.boltMesh);
    if (discs.count) {
      this.discMesh = new THREE.Mesh(discs.merge(), this.discMat);
      this.discMesh.userData.disc = true;
      this.discMesh.renderOrder = 5;
      this.model.add(this.discMesh);
    }

    // --- armoured hull: core zones covering fuselage, wings and tail ---
    const H = (x: number, y: number, z: number, r: number) => {
      const zone: HitZone = { name: 'hull', offset: new THREE.Vector3(x, y, z).multiplyScalar(scale), radius: r * scale, hp: CORE_BIG, maxHp: CORE_BIG };
      this.zones.push(zone); this.coreZones.push(zone);
    };
    for (const z of [3.0, 1.7, 0.4, -0.9, -2.2, -3.5, -4.8, -6.1, -7.4]) H(0, 0, z, 0.82);
    H(0, 0.1, -8.6, 0.6); H(0, 1.5, -9.6, 0.8); H(0, 0.4, -10.2, 0.5);
    for (const s of [1, -1]) {
      for (const x of [1.7, 3.2, 4.7, 6.0, 7.4]) H(s * x, 0.05 + 0.065 * x, -0.9, 1.3);
      H(s * 8.8, 0.62, -1.1, 0.95);
      for (const x of [1.4, 2.8]) H(s * x, 0.35, -8.9, 0.75);
    }
    this.coreMax = this.core = CORE_HP * hpScale * (def.flagship ? 1.4 : 1);
    this.breachNeed = Math.ceil(this.parts.length * 0.4);
    let rad = 0;
    for (const z of this.zones) rad = Math.max(rad, z.offset.length() + z.radius);
    this.radius = rad;
  }

  // ---- health ----
  get partsFrac() { let h = 0, m = 0; for (const p of this.parts) { h += Math.max(0, p.hp); m += p.maxHp; } return m ? h / m : 0; }
  get health() { return this.dying ? 0 : 0.5 * this.partsFrac + 0.5 * Math.max(0, this.core) / this.coreMax; }
  get partsLost() { let n = 0; for (const p of this.parts) if (!p.alive) n++; return n; }
  aliveParts(kind: PartKind) { let n = 0; for (const p of this.parts) if (p.alive && p.kind === kind) n++; return n; }
  part(kind: PartKind): ShipPart | null { for (const p of this.parts) if (p.alive && p.kind === kind) return p; return null; }

  // World position of a part (out = scratch vector)
  partPos(p: ShipPart, out: THREE.Vector3) { return this.localToWorld(_v.copy(p.zone.offset), out); }

  // Charge whatever the bullets took off the zones this frame (World.onHit subtracts zone hp).
  // partMult: extra multiplier per part (e.g. a charging gun takes extra damage).
  sync(dt: number, partMult: (p: ShipPart) => number) {
    this.hullHitT += dt;
    this.coreHitAcc = 0;
    for (const z of this.coreZones) {
      const d = CORE_BIG - z.hp;
      if (d > 0) {
        z.hp = CORE_BIG;
        (z as any).destroyed = false;
        if (!this.dying) { this.core -= d * this.armourMult; this.coreHitAcc += d; }
        this.hullHitT = 0;
      }
    }
    for (const p of this.parts) {
      p.hitT += dt;
      if (!p.alive) continue;
      const d = p.hp - p.zone.hp;
      if (d <= 0) continue;
      p.hitT = 0;
      p.hp -= d * partMult(p);
      p.zone.hp = Math.max(0.001, p.hp);
      if (p.hp <= 0 && !this.dying) this.destroyPart(p);
    }
  }

  destroyPart(p: ShipPart) {
    if (!p.alive) return;
    p.alive = false; p.hp = 0; p.charge = 0; p.zone.hp = 0;
    p.zone.radius = 0.001;                  // bullets now pass to the hull behind it
    if (p.mesh) p.mesh.visible = false;
    if (p.range) this.recolour(p.range, COL.char, p.kind === 'fuel' || p.kind === 'rockets' || p.kind === 'bridge');
    if (p.engine >= 0) {
      if (p.engine < this.engineDead.length) this.engineDead[p.engine] = true;
      p.zone.burning = true;
      if (p.disc && this.discMesh) this.collapse(this.discMesh.geometry, p.disc);
    }
    this.destroyed.push(p);
    // a burst of core damage from the internal explosion
    this.core -= this.coreMax * (p.kind === 'fuel' ? 0.12 : 0.03);
    if (!this.breached && this.partsLost >= this.breachNeed) this.breach();
  }

  breach() {
    this.breached = true;
    this.armourMult = 1;
  }

  private recolour(r: [number, number], col: THREE.Color, collapse: boolean) {
    const g = this.boltMesh.geometry;
    const c = g.attributes.color as THREE.BufferAttribute;
    for (let i = r[0]; i < r[1]; i++) c.setXYZ(i, col.r, col.g, col.b);
    c.needsUpdate = true;
    if (collapse) this.collapse(g, r, 0.35);
  }

  // Shrink a vertex range toward its centre (blown-off parts leave a charred stub)
  private collapse(g: THREE.BufferGeometry, r: [number, number], keep = 0) {
    const pa = g.attributes.position as THREE.BufferAttribute;
    _p.set(0, 0, 0);
    for (let i = r[0]; i < r[1]; i++) _p.x += pa.getX(i), _p.y += pa.getY(i), _p.z += pa.getZ(i);
    _p.divideScalar(Math.max(1, r[1] - r[0]));
    for (let i = r[0]; i < r[1]; i++) pa.setXYZ(i, _p.x + (pa.getX(i) - _p.x) * keep, _p.y + (pa.getY(i) - _p.y) * keep * 0.6, _p.z + (pa.getZ(i) - _p.z) * keep);
    pa.needsUpdate = true;
  }

  // Swing a turret mesh toward a model-frame direction (k = 0..1 smoothing)
  aimTurret(p: ShipPart, dirLocal: THREE.Vector3, k: number) {
    p.aim.lerp(dirLocal, k).normalize();
    if (!p.mesh) return;
    // basis: +Z barrels on the aim, +Y as close to the mount normal as possible
    _z.copy(p.aim);
    _x.crossVectors(p.up, _z);
    if (_x.lengthSq() < 1e-4) _x.set(1, 0, 0);
    _x.normalize();
    _y.crossVectors(_z, _x);
    _m4.makeBasis(_x, _y, _z);
    p.mesh.quaternion.setFromRotationMatrix(_m4);
  }

  // Barrel tip of a turret in world space
  muzzle(p: ShipPart, out: THREE.Vector3) {
    out.copy(p.aim).multiplyScalar(p.kind === 'flak' ? 2.8 : 1.35).add(p.local);
    return this.root.localToWorld(out.multiplyScalar(this.S));
  }

  // ---- flight: hold a station off the formation centre; set by BossBattle ----
  update(dt: number) {
    const fm = this.formation;
    if (!fm || dt <= 0) return;
    // steer the relative velocity toward the station (limited speed and acceleration)
    _v.copy(this.station).sub(this.off);
    const dist = _v.length();
    const want = Math.min(this.maxRel, dist * 0.12);
    if (dist > 1e-3) _v.multiplyScalar(want / dist); else _v.set(0, 0, 0);
    _v.sub(this.relVel);
    const dv = _v.length(), maxDv = this.accel * dt;
    if (dv > maxDv) _v.multiplyScalar(maxDv / dv);
    this.relVel.add(_v);
    const latAcc = _v.x / dt;
    this.off.addScaledVector(this.relVel, dt);
    // world placement
    _left.crossVectors(UP, fm.forward).normalize();
    this.root.position.copy(fm.center).addScaledVector(_left, this.off.x).addScaledVector(UP, this.off.y).addScaledVector(fm.forward, this.off.z);
    this.vel.copy(fm.forward).multiplyScalar(this.cruise).addScaledVector(_left, this.relVel.x).addScaledVector(UP, this.relVel.y).addScaledVector(fm.forward, this.relVel.z);
    // attitude: nose on the flight path, slow bank into lateral drift, list toward dead engines, a heavy sway
    const t = this.time += dt;
    const yaw = Math.atan2(this.vel.x, this.vel.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(this.vel.y / Math.max(1, this.vel.length()), -1, 1)) + this.extraPitch;
    const rollT = -latAcc * 0.035 - this.relVel.x * 0.004 + this.listRoll + this.extraRoll + Math.sin(t * 0.37 + this.phase) * 0.025;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 0.8);
    this.root.quaternion.setFromEuler(_e.set(-pitch, yaw, this.roll, 'YXZ'));
    // props: the model's two via Aircraft, the bolted-on ones spin their disc texture
    this.updateProps(dt, 0.75);
    this.propAngle += dt * 9;
    this.discMat.map!.rotation = this.propAngle;
  }
  private time = 0;

  // ---- breaking in two ----
  // Two clipped copies of the whole ship (hull and bolt-ons) cut across the fuselage behind
  // the wing. Returns the piece roots (placed at the ship) with their clip planes in the
  // model frame; the caller updates the world planes from model.matrixWorld each frame.
  breakApart(cut = -3.1): { root: THREE.Group; model: THREE.Object3D; local: THREE.Plane; world: THREE.Plane; mats: THREE.Material[] }[] {
    this.root.updateMatrixWorld(true);
    const out = [];
    for (const s of [1, -1]) {
      const local = new THREE.Plane(new THREE.Vector3(0, 0, s), -s * cut);
      const world = local.clone();
      const root = new THREE.Group();
      root.position.copy(this.root.position);
      root.quaternion.copy(this.root.quaternion);
      const model = this.model.clone(true);
      const mats: THREE.Material[] = [];
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.userData.disc || m.geometry?.type === 'CircleGeometry') { m.visible = false; return; }
        const src = Array.isArray(m.material) ? m.material : [m.material];
        const cl = src.map((mm) => {
          const c = mm.clone();
          c.clippingPlanes = [world];
          c.clipShadows = true;
          c.side = THREE.DoubleSide;
          mats.push(c);
          return c;
        });
        m.material = Array.isArray(m.material) ? cl : cl[0];
      });
      root.add(model);
      out.push({ root, model, local, world, mats });
    }
    return out;
  }

  dispose() {
    this.boltMesh.geometry.dispose();
    this.boltMat.dispose();
    this.discMesh?.geometry.dispose();
    this.discMat.map?.dispose();
    this.discMat.dispose();
  }
}

// Compile the boss's shader variants (vertex-coloured bolt-ons, clipped wreck halves, prop
// discs, rockets) during World.prewarm, so the first battle group doesn't stall.
// Returns a cleanup function to call after the warm-up render.
export function prewarmBoss(scene: THREE.Scene, camPos: THREE.Vector3, fwd: THREE.Vector3): () => void {
  const objs: THREE.Object3D[] = [];
  const ship = new BossShip(SHIP_DEFS[3], 4, 1);
  ship.root.position.copy(camPos).addScaledVector(fwd, 220);
  ship.root.updateMatrixWorld(true);
  objs.push(ship.root);
  for (const p of ship.breakApart()) { p.root.position.addScaledVector(fwd, 40); objs.push(p.root); }
  objs.push(new THREE.Mesh(BOSS_ROCKET_GEO, BOSS_ROCKET_MAT));
  objs[objs.length - 1].position.copy(camPos).addScaledVector(fwd, 60);
  for (const o of objs) scene.add(o);
  return () => {
    for (const o of objs) scene.remove(o);
    ship.dispose();
  };
}

export const BOSS_ROCKET_GEO = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 8).rotateX(Math.PI / 2);
export const BOSS_ROCKET_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3c33, roughness: 0.6, metalness: 0.4 });
