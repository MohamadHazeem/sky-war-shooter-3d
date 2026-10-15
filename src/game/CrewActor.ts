import * as THREE from 'three';
import { interiorAssets, cloneSkinned } from './InteriorAssets';
import type { FigureLook } from './CrewFigure';

// A crewman of the B-17 interior (Crew 2.0): the skinned Blender man (tools/interior/build_crew.py)
// playing his clips (idle, fire, hit, down, help, sit, kneel) through an AnimationMixer, with
// procedural layers on top where the game needs them:
//  - gun work: hands IK'd onto the spade grips of a gun laid on a fighter, a crouch under a high
//    target (feet kept on the floor), the head laid along the gun
//  - recoil absorption: each round's kick runs through a damped spring into his shoulders and head
//  - flinch: a near miss makes him duck, hunch and screw his eyes shut, turned from the blast
//  - pointing: the left hand leaves the grip and points (index finger out) at a threat he calls
//  - aim tracking / looking: head and chest turn toward a point (a fighter, the man he calls to)
//  - eyes that blink; the wounded man's eyes half closed and the odd spasm of pain
// Same figure frame as CrewFigure: origin on the floor between the feet, +Z the way he faces, +Y
// up, +X his left. Per-frame work allocates nothing; looks (jacket colours) share one recoloured
// geometry each.

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
const _e = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(), _f = new THREE.Vector3(), _sk = new THREE.Color();
const POLE_L = new THREE.Vector3(1, -0.8, -0.5), POLE_R = new THREE.Vector3(-1, -0.8, -0.5), POLE_KNEE = new THREE.Vector3(0, 0, 1);
const POLE_POINT = new THREE.Vector3(0.6, -1, 0);
const COLD_SKIN = new THREE.Color(0.4, 0.34, 0.32);

// Recolour a geometry's painted regions for a look (exported for tests). The generator writes the
// painted key in RGB and a shade (baked occlusion x wear) in alpha; InteriorAssets keeps both in
// geometry.userData (crewKeys / crewShade). The skin surface is tinted as a whole (it carries
// colour variation: cold cheeks, darker sockets), the clothing keys are swapped exactly.
export function recolour(geo: THREE.BufferGeometry, look: FigureLook, material = ''): THREE.BufferGeometry {
  const g = geo.clone();
  const src = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!src) return g;
  const keys = geo.userData.crewKeys as Float32Array | undefined, shade = geo.userData.crewShade as Float32Array | undefined;
  const n = src.count, out = new Float32Array(n * 3);
  const skin = _sk.copy(look.skin).lerp(COLD_SKIN, 0.55);   // cold, pale and a little grey
  const tr = skin.r / KEY.skin[0], tg = skin.g / KEY.skin[1], tb = skin.b / KEY.skin[2];
  const map: [readonly number[], THREE.Color][] = [[KEY.jacket, look.jacket], [KEY.fleece, look.collar], [KEY.trousers, look.trousers], [KEY.helmet, look.helmet], [KEY.skin, skin]];
  for (let i = 0; i < n; i++) {
    let r = keys ? keys[i * 3] : src.getX(i), gg = keys ? keys[i * 3 + 1] : src.getY(i), b = keys ? keys[i * 3 + 2] : src.getZ(i);
    const s = shade ? shade[i] : 1;
    if (material === 'crewSkin') { r *= tr; gg *= tg; b *= tb; }
    else for (const [k, c] of map) {
      if (Math.abs(r - k[0]) < 0.012 && Math.abs(gg - k[1]) < 0.012 && Math.abs(b - k[2]) < 0.012) { r = c.r; gg = c.g; b = c.b; break; }
    }
    out[i * 3] = r * s; out[i * 3 + 1] = gg * s; out[i * 3 + 2] = b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

const lookCache = new Map<string, THREE.BufferGeometry>();
const lookKey = (l: FigureLook, part: string) => [part, l.jacket.getHexString(), l.collar.getHexString(), l.trousers.getHexString(), l.helmet.getHexString(), l.skin.getHexString()].join(':');
const matName = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material[0] : m.material).name;

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

// Damped spring toward 0 (critically-ish damped): returns nothing, updates s = [x, v]
function spring(s: Float32Array, dt: number, k: number, c: number) {
  const h = Math.min(dt, 1 / 30);
  s[1] += (-k * s[0] - c * s[1]) * h;
  s[0] += s[1] * h;
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
  private helmet: THREE.SkinnedMesh[] = [];
  private wantVest: boolean;
  clip: CrewClip | null = null;
  private len = { upper: 0.29, fore: 0.27, thigh: 0.43, shin: 0.42 };
  private poleW = new THREE.Vector3();
  private footL = new THREE.Vector3(); private footR = new THREE.Vector3();
  // procedural layers
  private recoil = new Float32Array(2);          // spring: shoulders driven back by each round
  private flinchT = 9; private flinchK = 0; private flinchSide = 0;
  private blinkT = 0; private blinkNext = 2 + Math.random() * 3;
  private faceLocal = new THREE.Vector3(0, 0, 1);   // the face's forward in the head bone's frame
  private lidRest = new THREE.Quaternion();
  private indexRest: Record<'indexL' | 'indexR', THREE.Quaternion> = { indexL: new THREE.Quaternion(), indexR: new THREE.Quaternion() };
  private lookAt = new THREE.Vector3(); private lookW = 0; private lookGoal = 0;
  private pointAt = new THREE.Vector3(); private pointW = 0; private pointGoal = 0;
  private time = Math.random() * 10;
  private gunFrame = false;

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
      else if (name.includes('crewSteelHelmet')) this.helmet.push(m);
      else this.body.push(m);
    });
    for (const o of drop) o.removeFromParent();
    // recoloured geometry per look (shared by every man in that look)
    for (const m of [...this.body, ...this.lod, ...this.vest, ...this.helmet]) {
      const k = lookKey(look, m.geometry.uuid);
      let g = lookCache.get(k);
      if (!g) { g = recolour(m.geometry, look, matName(m)); lookCache.set(k, g); }
      m.geometry = g;
    }
    this.wantVest = opts.vest ?? look.vest;
    this.setFar(!!opts.far);
    // bone lengths and rest frames from the bind pose
    this.model.updateMatrixWorld(true);
    const L = (a: string, b: string) => this.b(a).getWorldPosition(_a).distanceTo(this.b(b).getWorldPosition(_b));
    if (this.bone.upperarmL && this.bone.forearmL && this.bone.handL) this.len.upper = L('upperarmL', 'forearmL'), this.len.fore = L('forearmL', 'handL');
    if (this.bone.thighL && this.bone.shinL && this.bone.footL) this.len.thigh = L('thighL', 'shinL'), this.len.shin = L('shinL', 'footL');
    if (this.bone.head) this.faceLocal.set(0, 0, 1).applyQuaternion(this.model.getWorldQuaternion(_q)).applyQuaternion(this.bone.head.getWorldQuaternion(_bq).invert()).normalize();
    if (this.bone.lids) this.lidRest.copy(this.bone.lids.quaternion);
    if (this.bone.indexL) this.indexRest.indexL.copy(this.bone.indexL.quaternion);
    if (this.bone.indexR) this.indexRest.indexR.copy(this.bone.indexR.quaternion);
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

  // the low-detail body (and no vest or steel helmet) for a man seen from metres away
  setFar(far: boolean) {
    const lod = far && this.lod.length > 0;
    for (const m of this.body) m.visible = !lod;
    for (const m of this.lod) m.visible = lod;
    for (const m of this.vest) m.visible = !lod && this.wantVest;
    for (const m of this.helmet) m.visible = this.wantVest;
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

  // ---- procedural layer inputs (any time before update) ----
  /** One round fired: the kick goes into his shoulders. */
  kick(k = 1) { this.recoil[1] += 2.6 * k; }
  /** A near miss (world point of the blast / impact; strength 0..1): he ducks away from it. */
  flinch(from: THREE.Vector3 | null, strength = 1) {
    if (this.flinchT < 0.25 && strength <= this.flinchK) return;
    this.flinchT = 0;
    this.flinchK = THREE.MathUtils.clamp(strength, 0.2, 1);
    this.flinchSide = 0;
    if (from) {
      this.root.worldToLocal(_a.copy(from));
      this.flinchSide = Math.sign(_a.x) || 1;      // + = the blast on his left: he turns his head to the right
    }
  }
  /** Turn head (and a little of the chest) toward a world point; weight 0 lets the clip lead. */
  look(target: THREE.Vector3 | null, weight = 1) {
    if (target) this.lookAt.copy(target);
    this.lookGoal = target ? weight : 0;
  }
  /** Point the left arm and index finger at a world point (0 = hands back on the work). */
  point(target: THREE.Vector3 | null, weight = 1) {
    if (target) this.pointAt.copy(target);
    this.pointGoal = target ? weight : 0;
  }
  get pointing() { return this.pointW > 0.5; }

  /** Advance the clip and the procedural layers. With gun = true, gunPose() follows this frame. */
  update(dt: number, gun = false) {
    this.time += dt;
    this.mixer.update(dt);
    spring(this.recoil, dt, 260, 22);
    this.flinchT += dt;
    this.lookW += (this.lookGoal - this.lookW) * Math.min(1, dt * 6);
    this.pointW += (this.pointGoal - this.pointW) * Math.min(1, dt * 5);
    this.root.updateMatrixWorld(true);
    this.gunFrame = gun;
    if (!gun) this.post(dt);
    else this.postDt = dt;
  }
  private postDt = 0;

  // flinch envelope: a fast duck (0.12 s), held, then recovering (0.9 s)
  private get flinchE() {
    const t = this.flinchT;
    if (t > 1.1) return 0;
    return this.flinchK * (t < 0.12 ? t / 0.12 : 1 - THREE.MathUtils.smoothstep(t, 0.3, 1.1));
  }

  // After update(): crouch (m, hips down, feet kept planted), lean (rad, forward), hands onto
  // grips (figure frame) and the head pitched (rad, + = chin down) along the gun
  gunPose(handL: THREE.Vector3, handR: THREE.Vector3, crouch: number, lean: number, headPitch: number) {
    const hips = this.b('hips'), spine = this.b('spine'), head = this.b('head'), chest = this.b('chest');
    if (!hips) return;
    const fl = this.flinchE, rec = this.recoil[0];
    crouch += 0.07 * fl; lean += 0.22 * fl - 0.05 * rec; headPitch += 0.45 * fl - 0.06 * rec;
    // feet before the crouch
    this.b('footL')?.getWorldPosition(this.footL);
    this.b('footR')?.getWorldPosition(this.footR);
    hips.position.z -= 0.012 * rec;              // the recoil rocks him back on his heels
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
    } else hips.updateMatrixWorld(true);
    this.root.getWorldQuaternion(_q);
    _ax.set(1, 0, 0).applyQuaternion(_q);      // his left: bending about it tips him forward
    if (spine && lean !== 0) rotateWorld(spine, _rq.setFromAxisAngle(_ax, lean));
    if (chest && fl > 0) {
      // hunched: shoulders up and round, the chest turned from the blast
      _up.set(0, 1, 0).applyQuaternion(_q);
      rotateWorld(chest, _rq.setFromAxisAngle(_up, -0.18 * fl * this.flinchSide));
    }
    if (head && headPitch !== 0) rotateWorld(head, _rq.setFromAxisAngle(_ax, headPitch));
    this.twist();
    for (const [up, fo, ha, target, poleDir] of [['upperarmL', 'forearmL', 'handL', handL, POLE_L], ['upperarmR', 'forearmR', 'handR', handR, POLE_R]] as const) {
      const U = this.b(up), F = this.b(fo), H = this.b(ha);
      if (!U || !F || !H) continue;
      U.getWorldPosition(_t);
      this.root.localToWorld(_end.copy(target));
      // the hand bone starts at the wrist: hold the fist (5-6 cm on) round the grip
      _c.subVectors(_end, _t).normalize();
      _d.copy(_end).addScaledVector(_c, -0.055);
      let pole: THREE.Vector3 = this.poleW.copy(poleDir).applyQuaternion(_q);
      if (up === 'upperarmL' && this.pointW > 0.01) {
        // pointing: the arm swings from the grip to straight out toward the threat
        _f.subVectors(this.pointAt, _t).normalize();
        _a.copy(_t).addScaledVector(_f, this.len.upper + this.len.fore - 0.02);
        _d.lerp(_a, THREE.MathUtils.smoothstep(this.pointW, 0, 1));
        pole = this.poleW.copy(POLE_POINT).applyQuaternion(_q);
      }
      solveTwoBone(_t, _d, this.len.upper, this.len.fore, pole, _mid, _end);
      aim(U, F.getWorldPosition(_c), _mid);
      aim(F, H.getWorldPosition(_c), _end);
      if (up === 'upperarmL' && this.pointW > 0.01) {
        // the hand carries on along the forearm (flat, the finger out)
        H.getWorldPosition(_a);
        _b.subVectors(_end, _mid).normalize();
        _c.copy(_a).addScaledVector(_b, 0.1);
        const tip = this.b('indexL');
        if (tip) aim(H, tip.getWorldPosition(_e), _c);
      }
    }
    if (this.gunFrame) this.post(this.postDt);
  }

  // The chest turns toward the look / point target about his vertical only (a twist at the waist),
  // a share of the yaw: on the gun before the arms are IK'd (the hands stay on the grips)
  private twist() {
    const head = this.b('head'), chest = this.b('chest');
    const w = Math.max(this.lookW, this.pointW);
    if (!head || !chest || w < 0.01) return;
    head.getWorldPosition(_p);
    _a.copy(this.faceLocal).applyQuaternion(head.getWorldQuaternion(_bq)).normalize();
    _b.subVectors(this.pointW > this.lookW ? this.pointAt : this.lookAt, _p).normalize();
    _up.set(0, 1, 0).applyQuaternion(this.root.getWorldQuaternion(_q));
    const ya = Math.atan2(_f.copy(_a).cross(_b).dot(_up), _a.dot(_b) - _a.dot(_up) * _b.dot(_up));
    rotateWorld(chest, _q.setFromAxisAngle(_up, ya * w * (this.pointW > this.lookW ? 0.5 : 0.35)));
  }

  // Head look, blinking, index fingers and (off the gun) the flinch: after the clip and any gunPose
  private post(dt: number) {
    const head = this.b('head'), chest = this.b('chest');
    const fl = this.flinchE;
    if (!this.gunFrame && fl > 0 && chest && head) {
      this.root.getWorldQuaternion(_q);
      _ax.set(1, 0, 0).applyQuaternion(_q);
      rotateWorld(chest, _rq.setFromAxisAngle(_ax, 0.25 * fl));
      rotateWorld(head, _rq.setFromAxisAngle(_ax, 0.35 * fl));
    }
    if (!this.gunFrame) this.twist();
    // look: the face's forward turned toward the point, clamped like a neck
    const w = Math.max(this.lookW, this.pointW);
    if (head && w > 0.01) {
      head.getWorldPosition(_p);
      _a.copy(this.faceLocal).applyQuaternion(head.getWorldQuaternion(_bq)).normalize();
      _b.subVectors(this.pointW > this.lookW ? this.pointAt : this.lookAt, _p).normalize();
      const ang = _a.angleTo(_b), max = 1.45;
      if (ang > 1e-3) {
        _rq.setFromUnitVectors(_a, _b);
        const k = w * Math.min(1, max / ang);
        rotateWorld(head, _q.identity().slerp(_rq, Math.min(1, k)));
      }
    }
    // a little turn of the head away from the blast
    if (head && fl > 0 && this.flinchSide !== 0) {
      _up.set(0, 1, 0).applyQuaternion(this.root.getWorldQuaternion(_q));
      rotateWorld(head, _rq.setFromAxisAngle(_up, -0.45 * fl * this.flinchSide));
    }
    // eyelids: blinks every few seconds, shut tight in a flinch, heavy when wounded
    const lids = this.b('lids');
    if (lids) {
      this.blinkT += dt;
      if (this.blinkT > this.blinkNext) { this.blinkT = 0; this.blinkNext = (this.clip === 'down' ? 1.5 : 2.2) + Math.random() * 4; }
      const bl = this.blinkT < 0.16 ? Math.sin(this.blinkT / 0.16 * Math.PI) : 0;
      const hurt = this.clip === 'down' || this.clip === 'hit' ? 0.55 + 0.15 * Math.sin(this.time * 0.7) : 0;
      const shut = Math.min(1, Math.max(bl, hurt, fl * 1.4));
      lids.quaternion.copy(this.lidRest);
      if (shut > 0) lids.quaternion.multiply(_rq.setFromAxisAngle(_ax.set(1, 0, 0), -0.72 * shut));
      lids.updateMatrixWorld(true);
    }
    // index fingers: curled round the grips by the clips; the pointing finger straightens
    const ix = this.b('indexL');
    if (ix && this.pointW > 0.01) { ix.quaternion.slerp(this.indexRest.indexL, this.pointW); ix.updateMatrixWorld(true); }
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
  const parts: THREE.Mesh[] = [];
  a.crew.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh) parts.push(m); });
  if (!parts.length) return null;
  // the node carries meshopt's dequantisation (scale / offset): keep it on inner meshes
  a.crew.scene.updateMatrixWorld(true);
  const m = new THREE.Group();
  for (const s of parts) {
    const k = lookKey(look, 'fp' + s.geometry.uuid);
    let g = lookCache.get(k);
    if (!g) { g = recolour(s.geometry, look, matName(s)); lookCache.set(k, g); }
    const inner = new THREE.Mesh(g, s.material);
    inner.matrixAutoUpdate = false;
    inner.matrix.copy(s.matrixWorld);
    inner.castShadow = true; inner.receiveShadow = true;
    m.add(inner);
  }
  m.name = 'playerArm';
  if (mirror) m.scale.x = -1;
  return m;
}
