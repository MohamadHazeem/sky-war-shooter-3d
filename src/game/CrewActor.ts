import * as THREE from 'three';
import { interiorAssets, cloneSkinned } from './InteriorAssets';
import type { FigureLook } from './CrewFigure';

// A crewman of the B-17 interior 2.0: the skinned Blender man (tools/interior/build_crew.py)
// playing his clips (idle, fire, hit, down, help, sit, kneel) through an AnimationMixer, with
// a little procedural rig work on top where the game needs it: hands IK'd onto the spade grips
// of a gun that is laid on a fighter, a crouch under a high target (feet kept on the floor),
// the head laid along the gun. Same figure frame as CrewFigure: origin on the floor between the
// feet, +Z the way he faces, +Y up, +X his left.
// Per-frame work allocates nothing; looks (jacket colours) share one recoloured geometry each.

export type CrewClip = 'idle' | 'fire' | 'hit' | 'down' | 'help' | 'sit' | 'kneel';
const LOOPS: Record<CrewClip, boolean> = { idle: true, fire: true, hit: false, down: true, help: true, sit: true, kneel: true };

// Colours painted by the generator, which a look replaces (linear)
const KEY = {
  jacket: [0.2, 0.11, 0.055], fleece: [0.62, 0.55, 0.42], trousers: [0.17, 0.105, 0.06],
  helmet: [0.11, 0.065, 0.035], skin: [0.55, 0.36, 0.27],
} as const;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _mid = new THREE.Vector3(), _end = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const POLE_L = new THREE.Vector3(1, -0.8, -0.5), POLE_R = new THREE.Vector3(-1, -0.8, -0.5), POLE_KNEE = new THREE.Vector3(0, 0, 1);

// Recolour a geometry's painted regions for a look (exported for tests)
export function recolour(geo: THREE.BufferGeometry, look: FigureLook): THREE.BufferGeometry {
  const g = geo.clone();
  const src = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!src) return g;
  const col = src.clone();
  g.setAttribute('color', col);
  const skin = look.skin.clone().lerp(new THREE.Color(0.3, 0.27, 0.25), 0.25);   // cold, a little grey
  const map: [readonly number[], THREE.Color][] = [[KEY.jacket, look.jacket], [KEY.fleece, look.collar], [KEY.trousers, look.trousers], [KEY.helmet, look.helmet], [KEY.skin, skin]];
  for (let i = 0; i < col.count; i++) {
    const r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
    for (const [k, c] of map) {
      if (Math.abs(r - k[0]) < 0.012 && Math.abs(gg - k[1]) < 0.012 && Math.abs(b - k[2]) < 0.012) { col.setXYZ(i, c.r, c.g, c.b); break; }
    }
  }
  return g;
}

const lookCache = new Map<string, THREE.BufferGeometry>();
const lookKey = (l: FigureLook, part: string) => [part, l.jacket.getHexString(), l.collar.getHexString(), l.trousers.getHexString(), l.helmet.getHexString(), l.skin.getHexString()].join(':');

// Rotate a bone in world space by q (then refresh its world matrix and its children's)
function rotateWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_pq);
  bone.getWorldQuaternion(_bq);
  bone.quaternion.copy(_pq.invert().multiply(q).multiply(_bq));
  bone.updateMatrixWorld(true);
}
// Turn `bone` so that the point `from` (world, carried by the bone) moves toward `to`
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  bone.getWorldPosition(_p);
  _a.subVectors(from, _p).normalize();
  _b.subVectors(to, _p).normalize();
  if (_a.lengthSq() < 1e-8 || _b.lengthSq() < 1e-8) return;
  rotateWorld(bone, _rq.setFromUnitVectors(_a, _b));
}
// Two-bone IK in world space: elbow/knee bends toward pole
export function solveTwoBone(a: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  _d.subVectors(t, a);
  let d = _d.length();
  if (d < 1e-5) { _d.set(0, -1, 0); d = 1e-5; } else _d.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.002);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _c.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_c.lengthSq() < 1e-6) _c.set(0, -1, 0);
  _c.normalize();
  mid.copy(a).addScaledVector(_d, x).addScaledVector(_c, h);
  end.copy(a).addScaledVector(_d, d);
}

export class CrewActor {
  readonly root = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = {} as Record<CrewClip, THREE.AnimationAction>;
  private bone: Record<string, THREE.Bone> = {};
  private body: THREE.SkinnedMesh[] = [];
  private lod: THREE.SkinnedMesh[] = [];
  private vest: THREE.SkinnedMesh[] = [];
  private wantVest: boolean;
  clip: CrewClip | null = null;
  private len = { upper: 0.29, fore: 0.27, thigh: 0.43, shin: 0.42 };
  private poleW = new THREE.Vector3();
  private footL = new THREE.Vector3(); private footR = new THREE.Vector3();

  static available() { return !!interiorAssets(); }

  constructor(look: FigureLook, opts: { vest?: boolean; far?: boolean } = {}) {
    const a = interiorAssets()!;
    this.model = cloneSkinned(a.crew.scene);
    this.root.add(this.model);
    this.root.name = 'crewActor';
    const drop: THREE.Object3D[] = [];
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bone[o.name] = o as THREE.Bone;
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      const name = m.name + '|' + (m.parent?.name ?? '');
      if (!m.isSkinnedMesh) { drop.push(o); return; }      // fpArm: the player's own (playerArm)
      if (name.includes('crewBodyLod')) this.lod.push(m);
      else if (name.includes('crewFlakVest')) this.vest.push(m);
      else this.body.push(m);
    });
    for (const o of drop) o.removeFromParent();
    // recoloured geometry per look (shared by every man in that look)
    for (const m of [...this.body, ...this.lod]) {
      const k = lookKey(look, m.geometry.uuid);
      let g = lookCache.get(k);
      if (!g) { g = recolour(m.geometry, look); lookCache.set(k, g); }
      m.geometry = g;
    }
    this.wantVest = opts.vest ?? look.vest;
    this.setFar(!!opts.far);
    // bone lengths from the rest pose
    this.model.updateMatrixWorld(true);
    const L = (a: string, b: string) => this.b(a).getWorldPosition(_a).distanceTo(this.b(b).getWorldPosition(_b));
    if (this.bone.upperarmL && this.bone.forearmL && this.bone.handL) this.len.upper = L('upperarmL', 'forearmL'), this.len.fore = L('forearmL', 'handL');
    if (this.bone.thighL && this.bone.shinL && this.bone.footL) this.len.thigh = L('thighL', 'shinL'), this.len.shin = L('shinL', 'footL');
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const c of a.crew.animations) {
      const name = c.name as CrewClip;
      if (!(name in LOOPS)) continue;
      const act = this.mixer.clipAction(c);
      if (!LOOPS[name]) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
      this.actions[name] = act;
    }
  }

  private b(n: string) { return this.bone[n]; }

  // the low-detail body (and no vest) for a man seen from metres away
  setFar(far: boolean) {
    const lod = far && this.lod.length > 0;
    for (const m of this.body) m.visible = !lod;
    for (const m of this.lod) m.visible = lod;
    for (const m of this.vest) m.visible = !lod && this.wantVest;
  }

  // Cross-fade to a clip; `at` starts it part-way (desynchronises men in the same clip)
  play(c: CrewClip, fade = 0.3, at = 0) {
    if (this.clip === c) return;
    const next = this.actions[c];
    if (!next) return;
    next.reset();
    next.time = at * next.getClip().duration;
    next.play();
    const prev = this.clip ? this.actions[this.clip] : null;
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.clip = c;
  }

  get clipDone() { const a = this.clip ? this.actions[this.clip] : null; return !!a && !LOOPS[this.clip!] && a.time >= a.getClip().duration - 1e-3; }

  update(dt: number) {
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);
  }

  // After update(): crouch (m, hips down, feet kept planted), lean (rad, forward), hands onto
  // grips (figure frame) and the head pitched (rad, + = chin down) along the gun
  gunPose(handL: THREE.Vector3, handR: THREE.Vector3, crouch: number, lean: number, headPitch: number) {
    const hips = this.b('hips'), spine = this.b('spine'), head = this.b('head');
    if (!hips) return;
    // feet before the crouch
    this.b('footL')?.getWorldPosition(this.footL);
    this.b('footR')?.getWorldPosition(this.footR);
    if (crouch > 0) {
      hips.position.y -= crouch;
      hips.updateMatrixWorld(true);
      for (const [th, sh, ft, foot] of [['thighL', 'shinL', 'footL', this.footL], ['thighR', 'shinR', 'footR', this.footR]] as const) {
        const T = this.b(th), S = this.b(sh), F = this.b(ft);
        if (!T || !S || !F) continue;
        T.getWorldPosition(_t);
        this.poleW.copy(POLE_KNEE).applyQuaternion(this.root.getWorldQuaternion(_q));
        solveTwoBone(_t, foot, this.len.thigh, this.len.shin, this.poleW, _mid, _end);
        aim(T, S.getWorldPosition(_c), _mid);
        aim(S, F.getWorldPosition(_c), _end);
      }
    }
    this.root.getWorldQuaternion(_q);
    _ax.set(1, 0, 0).applyQuaternion(_q);      // his left: bending about it tips him forward
    if (spine && lean !== 0) rotateWorld(spine, _rq.setFromAxisAngle(_ax, lean));
    if (head && headPitch !== 0) rotateWorld(head, _rq.setFromAxisAngle(_ax, headPitch));
    for (const [up, fo, ha, target, pole] of [['upperarmL', 'forearmL', 'handL', handL, POLE_L], ['upperarmR', 'forearmR', 'handR', handR, POLE_R]] as const) {
      const U = this.b(up), F = this.b(fo), H = this.b(ha);
      if (!U || !F || !H) continue;
      U.getWorldPosition(_t);
      this.root.localToWorld(_end.copy(target));
      // the hand bone starts at the wrist: hold the fist (5-6 cm on) round the grip
      _c.subVectors(_end, _t).normalize();
      _d.copy(_end).addScaledVector(_c, -0.055);
      this.poleW.copy(pole).applyQuaternion(_q);
      solveTwoBone(_t, _d, this.len.upper, this.len.fore, this.poleW, _mid, _end);
      aim(U, F.getWorldPosition(_c), _mid);
      aim(F, H.getWorldPosition(_c), _end);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.removeFromParent();
    this.root.clear();
  }
}

// The player's own forearms and gloved fists on the grips (the static 'fpArm' mesh of crew.glb)
export function playerArm(look: FigureLook, mirror: boolean): THREE.Object3D | null {
  const a = interiorAssets();
  if (!a) return null;
  let src: THREE.Mesh | null = null;
  a.crew.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) src = m; });
  if (!src) return null;
  const s = src as THREE.Mesh;
  const k = lookKey(look, 'fp' + s.geometry.uuid);
  let g = lookCache.get(k);
  if (!g) { g = recolour(s.geometry, look); lookCache.set(k, g); }
  // the node carries meshopt's dequantisation (scale / offset): keep it on an inner mesh
  a.crew.scene.updateMatrixWorld(true);
  const inner = new THREE.Mesh(g, s.material);
  inner.matrixAutoUpdate = false;
  inner.matrix.copy(s.matrixWorld);
  inner.castShadow = true; inner.receiveShadow = true;
  const m = new THREE.Group();
  m.add(inner);
  m.name = 'playerArm';
  if (mirror) m.scale.x = -1;
  return m;
}
