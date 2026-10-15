import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { Aircraft, Fighter } from '../world/Aircraft';
import { BossShip, SHIP_DEFS } from '../world/BossShip';
import { ENEMY_VARIANTS, tintModel, type EnemyType } from '../world/EnemyTypes';
import { dressEnemy } from '../world/EnemyDress';
import { FW190_PARAMS } from '../world/FlightModel';
import { hasModel, loadModels, type ModelKind } from '../world/Models';
import { disposeOwned } from '../render/Dispose';
import { tx } from '../i18n';
import { GalleryScreen, type GalleryControl } from '../ui/GalleryScreen';
import { achievements } from './Achievements';
import { quizFeats } from './Feats';
import { AIRCRAFT_SPECS, QUIZ_ROUNDS, quizChoices, quizSequence, saveQuiz, specById, type AircraftId } from './AircraftData';
import { ESCORT_TYPES, isEscortKind } from '../world/EscortTypes';
import { MUSEUM, factOpen, freshFacts, markKnown, type MuseumStats } from './Museum';
import { codexEntries, type CodexCtx } from './Codex';

// Aircraft recognition gallery (Phase 5 goal 28): a hangar where every aircraft in the game
// turns slowly under studio lights, with its spec card (AircraftData.ts), orbit / zoom by
// mouse, touch and gamepad, and a recognition quiz (a silhouette flashes against the sky,
// pick the type; the best score is kept).
//
// Like the replay theatre it takes over engine.onFrame while open, so the menu world is frozen;
// it draws its own small scene through engine.renderOverride → Engine.renderStudio (the same
// MSAA target and post stack as the world). No shader stalls: the studio copies the world's
// light counts (and its environment map), so every aircraft material keeps the program the
// world already compiled; the few studio-only materials (floor, backdrop, silhouette) are
// compiled in the background (Engine.compileStudio) before the first frame is shown, and each
// aircraft is compiled the same way before it is revealed.
// Models: the selected type is cloned from the model cache when picked (loading it first if
// the background preload has not got to it yet); the previous one is disposed. Everything
// the gallery made is freed on exit.

const FIT = 9;        // every aircraft is shown at the same size: half its span / length (m)
const HANG = 5.2;     // height of its centre above the hangar floor (m)
const FLASH = 1.8;    // quiz: seconds the silhouette shows
const SPIN = 0.2;     // turntable, rad/s
const FOV = 30;       // vertical field of view on screen (degrees)
const IDLE = 3;       // s without input before the turntable starts again

export interface GalleryHost {
  /** Career kills of this type; null for our own aircraft. */
  kills(id: AircraftId): number | null;
  /** The gallery closed (Back, or another screen took over). */
  onClose(): void;
  /** Museum: encounters, kills and missions (fact unlocks). */
  museum(): MuseumStats;
  /** Codex: medals held and operations flown. */
  codex(): CodexCtx;
}

interface Shown { id: AircraftId; a: Aircraft; holder: THREE.Group; dispose(): void }

type QuizPhase = 'load' | 'flash' | 'choose' | 'reveal' | 'done';

// Quiz views: camera yaw / pitch around the aircraft (+Z nose): from below like a ground
// observer, broadside, head-on, from above, rear three-quarter
const VIEWS: [number, number][] = [[0.4, -1.15], [Math.PI / 2, 0.05], [0, 0.06], [0.7, 1.05], [Math.PI - 0.6, 0.3], [-Math.PI / 2, -0.25]];

export class AircraftGallery implements GalleryControl {
  active = false;
  private screen = new GalleryScreen();
  private scene: THREE.Scene | null = null;
  private cam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 1200);
  private pivot = new THREE.Group();     // turntable (aircraft centre, HANG above the floor)
  private floor: THREE.Mesh | null = null;
  private backdrop: THREE.Mesh | null = null;
  private hangarTex: THREE.Texture | null = null;
  private skyTex: THREE.Texture | null = null;
  private silMat = new THREE.MeshBasicMaterial({ color: 0x15140f });
  private owned: { dispose(): void }[] = [];
  private lights: THREE.Light[] = [];
  private shown: Shown | null = null;
  private current: AircraftId = 'b17';
  private loadSeq = 0;
  private ready = false;            // studio programs compiled: draw it
  // camera
  private yaw = 0.75; private pitch = 0.12; private zoom = 1;
  private yawV = 0; private pitchV = 0;
  private idleT = 0;
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private layoutDirty = true;
  private fingers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private padPrev = new Set<number>();
  // restore state
  private savedFrame: ((dt: number, time: number) => void) | undefined;
  private post: Record<string, number> = {};
  private touchAction = '';
  private lastT = 0;
  // quiz
  private quiz: { seq: AircraftId[]; i: number; score: number; phase: QuizPhase; t: number; choices: AircraftId[]; view: [number, number] } | null = null;
  private silSaved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  constructor(private engine: Engine, private host: GalleryHost) {}

  // ---------------- open / close ----------------

  open(start: AircraftId = this.current) {
    if (this.active) return;
    const e = this.engine;
    this.active = true;
    this.ready = false;
    this.current = start;
    this.quiz = null;
    this.zoom = 1; this.yaw = 0.75; this.pitch = 0.12; this.idleT = 0;
    this.buildStudio();
    this.screen.show(AIRCRAFT_SPECS, this);
    this.stats = this.host.museum();
    this.refreshFresh();
    this.screen.setCurrent(specById(start), this.host.kills(start), this.museumView(start));
    this.screen.setLoading(true);
    // take over the frame loop (the menu world freezes) and keep the post settings to restore
    this.savedFrame = e.onFrame;
    e.onFrame = this.onFrame;
    const p = e.post;
    this.post = { exposure: p.exposure, motionBlur: p.motionBlur, damageFlash: p.damageFlash, desat: p.desat, flash: p.flash, zoomPulse: p.zoomPulse,
      dofStrength: p.dofStrength, flareStrength: p.flareStrength, shafts: p.shafts };
    p.exposure = 1; p.motionBlur = 0; p.damageFlash = 0; p.desat = 0; p.flash = 0; p.zoomPulse = 0; p.dofStrength = 0; p.flareStrength = 0; p.shafts = 0;
    p.resetHistory();
    const cv = e.renderer.domElement;
    cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('pointercancel', this.onUp);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('keydown', this.onKey);
    addEventListener('resize', this.onResize);
    this.touchAction = cv.style.touchAction;
    cv.style.touchAction = 'none';
    this.lastT = performance.now();
    // studio-only programs (floor, backdrop, silhouette) compile in the background first
    e.compileStudio(this.scene!, this.cam).catch(() => {}).then(() => {
      if (!this.active) return;
      this.ready = true;
      e.renderOverride = (dt) => { if (this.scene) e.renderStudio(this.scene, this.cam, dt); };
      this.select(start, true);
    });
  }

  close() {
    if (!this.active) return;
    const e = this.engine;
    this.active = false;
    this.loadSeq++;
    const cv = e.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    removeEventListener('pointercancel', this.onUp);
    cv.removeEventListener('wheel', this.onWheel);
    removeEventListener('keydown', this.onKey);
    removeEventListener('resize', this.onResize);
    cv.style.touchAction = this.touchAction;
    cv.style.cursor = '';
    this.fingers.clear();
    e.renderOverride = undefined;
    e.onFrame = this.savedFrame;
    const p = e.post as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(this.post)) p[k] = v;
    e.post.resetHistory();
    this.silhouette(false);
    this.disposeShown();
    for (const l of this.lights) l.dispose();
    this.lights.length = 0;
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.scene?.clear();
    this.scene = null;
    this.floor = this.backdrop = null;
    this.quiz = null;
    this.screen.close();
    this.host.onClose();
  }

  // ---------------- studio ----------------

  private buildStudio() {
    const scene = new THREE.Scene();
    const world = this.engine.scene;
    scene.environment = world.environment;
    scene.environmentIntensity = world.environmentIntensity;
    // Mirror the world's light set (types, counts, shadow casters): the light counts are part
    // of every lit material's program, so matching them reuses the world's compiled programs.
    const n = { dir: 0, dirShadow: 0, point: 0, pointShadow: 0, spot: 0, spotShadow: 0, hemi: 0 };
    world.traverseVisible((o) => {
      const l = o as THREE.Light;
      if (!l.isLight) return;
      if ((l as THREE.DirectionalLight).isDirectionalLight) { n.dir++; if (l.castShadow) n.dirShadow++; }
      else if ((l as THREE.PointLight).isPointLight) { n.point++; if (l.castShadow) n.pointShadow++; }
      else if ((l as THREE.SpotLight).isSpotLight) { n.spot++; if (l.castShadow) n.spotShadow++; }
      else if ((l as THREE.HemisphereLight).isHemisphereLight) n.hemi++;
    });
    const target = new THREE.Object3D();
    target.position.set(0, HANG, 0);
    scene.add(target);
    // directional: the warm key light (casting the shadow on the floor), then any others off
    for (let i = 0; i < n.dir; i++) {
      const d = new THREE.DirectionalLight(0xfff0d8, i === 0 ? 3.0 : 0);
      d.position.set(14, 30, 18);
      d.target = target;
      if (i < n.dirShadow) {
        d.castShadow = true;
        d.shadow.mapSize.set(2048, 2048);
        const sc = d.shadow.camera;
        sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 4; sc.far = 90;
        d.shadow.bias = -0.0004;
        d.shadow.normalBias = 0.03;
      }
      scene.add(d);
      this.lights.push(d);
    }
    // points: cool fill, rim from behind, a warm work lamp high overhead; the rest off.
    // Physical falloff (intensity = illuminance x distance²): the fill and rim stand beyond
    // the edge of the floor disc and the lamp high up, so the floor gets no hot spots.
    const P: [number, number, number, number, number][] = [
      [0xbcd2ff, -62, 26, 40, 1.1], [0xfff2dc, 8, 40, -66, 2.4], [0xffc98a, 0, 46, 4, 0.45],
    ];
    for (let i = 0; i < n.point; i++) {
      const def = P[i];
      const pos = def ? new THREE.Vector3(def[1], def[2], def[3]) : new THREE.Vector3(0, -50, 0);
      const l = new THREE.PointLight(def ? def[0] : 0xffffff, def ? def[4] * pos.distanceToSquared(target.position) : 0, 0, 2);
      l.position.copy(pos);
      l.castShadow = i < n.pointShadow;
      scene.add(l);
      this.lights.push(l);
    }
    for (let i = 0; i < n.spot; i++) {
      const s = new THREE.SpotLight(0xffffff, 0);
      s.castShadow = i < n.spotShadow;
      scene.add(s);
      this.lights.push(s);
    }
    for (let i = 0; i < n.hemi; i++) {
      const h = new THREE.HemisphereLight(0xc8d0d8, 0x4a3e2c, i === 0 ? 0.75 : 0);
      scene.add(h);
      this.lights.push(h);
    }
    // backdrop (hangar walls and roof, or the sky in the quiz) and the floor
    this.hangarTex = canvasTex(hangarCanvas());
    this.skyTex = canvasTex(skyCanvas());
    const bGeo = new THREE.SphereGeometry(260, 48, 24);
    const bMat = new THREE.MeshBasicMaterial({ map: this.hangarTex, side: THREE.BackSide, depthWrite: false });
    this.backdrop = new THREE.Mesh(bGeo, bMat);
    this.backdrop.renderOrder = -1;
    scene.add(this.backdrop);
    const fTex = canvasTex(floorCanvas());
    fTex.anisotropy = 8;
    const fGeo = new THREE.CircleGeometry(70, 72).rotateX(-Math.PI / 2);
    const fMat = new THREE.MeshStandardMaterial({ map: fTex, roughness: 0.9, metalness: 0 });
    this.floor = new THREE.Mesh(fGeo, fMat);
    this.floor.receiveShadow = true;
    scene.add(this.floor);
    // the silhouette material compiles with the rest (a speck under the floor)
    const speck = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), this.silMat);
    speck.position.set(0, -2, 0);
    scene.add(speck);
    this.owned.push(this.hangarTex, this.skyTex, bGeo, bMat, fTex, fGeo, fMat, speck.geometry, this.silMat);
    this.pivot.position.set(0, HANG, 0);
    this.pivot.rotation.set(0, 0, 0);
    scene.add(this.pivot);
    this.scene = scene;
    this.layoutDirty = true;
  }

  // ---------------- aircraft ----------------

  private makeAircraft(id: AircraftId): { a: Aircraft; dispose(): void } {
    if (id === 'boss') {
      const s = new BossShip(SHIP_DEFS[3], 1, 1);
      return { a: s, dispose: () => { disposeOwned(s.root); s.dispose(); } };
    }
    let f: Fighter;
    if (id === 'b17') f = new Fighter(id, 'allied', FW190_PARAMS, 1.77);
    else if (isEscortKind(id)) f = new Fighter(id, 'allied', ESCORT_TYPES[id].params, ESCORT_TYPES[id].propRadius);
    else {
      // fitted with the same per-type hit layout as World.spawnEnemy
      const type = id as EnemyType, v = ENEMY_VARIANTS[type];
      const own = hasModel(v.model as ModelKind);
      f = new Fighter((own ? v.model : 'fw190') as ModelKind, 'axis', v.params, own ? v.propRadius : 1.65);
      if (v.tint && !own) tintModel(f.model, v.tint);
      dressEnemy(f, type, own);
    }
    return { a: f, dispose: () => disposeOwned(f.root) };
  }

  /** Show one aircraft (gallery) */
  select(id: AircraftId, force = false) {
    if (!this.active || (id === this.current && this.shown?.id === id && !force)) return;
    if (this.quiz) return;
    this.current = id;
    this.screen.setCurrent(specById(id), this.host.kills(id), this.museumView(id));
    this.layoutDirty = true;
    void this.show(id);
  }

  step(dir: number) {
    const i = AIRCRAFT_SPECS.findIndex((s) => s.id === this.current);
    const n = AIRCRAFT_SPECS.length;
    this.select(AIRCRAFT_SPECS[(i + dir + n) % n].id);
  }

  private async show(id: AircraftId, onReady?: () => void) {
    const seq = ++this.loadSeq;
    const spec = specById(id);
    const slow = setTimeout(() => { if (seq === this.loadSeq) this.screen.setLoading(true); }, 120);
    if (!hasModel(spec.model)) await loadModels([spec.model]);
    if (seq !== this.loadSeq || !this.active || !this.scene) { clearTimeout(slow); return; }
    const made = this.makeAircraft(id);
    const holder = new THREE.Group();
    holder.add(made.a.root);
    // same size for every type, centred on the turntable
    made.a.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(made.a.root);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const k = FIT / Math.max(0.5, Math.max(size.x, size.z) / 2);
    holder.scale.setScalar(k);
    holder.position.copy(centre).multiplyScalar(-k);
    holder.visible = false;
    this.pivot.add(holder);
    // its programs are the world's (see the header); compile anything new off the main thread
    await this.engine.compileStudio(this.scene, this.cam).catch(() => {});
    clearTimeout(slow);
    if (seq !== this.loadSeq || !this.active) { holder.removeFromParent(); made.dispose(); return; }
    this.silhouette(false);
    this.disposeShown();
    holder.visible = true;
    this.shown = { id, a: made.a, holder, dispose: made.dispose };
    this.screen.setLoading(false);
    this.layoutDirty = true;
    onReady?.();
  }

  private disposeShown() {
    const s = this.shown;
    if (!s) return;
    s.holder.removeFromParent();
    s.dispose();
    this.shown = null;
  }

  // ---------------- quiz ----------------

  startQuiz() {
    if (!this.active || !this.ready) return;
    this.screen.setCodex(false);
    this.quiz = { seq: quizSequence(), i: -1, score: 0, phase: 'load', t: 0, choices: [], view: VIEWS[0] };
    this.screen.setQuiz(true);
    this.setStage(true);
    this.layoutDirty = true;
    this.nextRound();
  }

  stopQuiz() {
    this.closeCodex();
    if (!this.quiz) return;
    this.quiz = null;
    this.loadSeq++;
    this.silhouette(false);
    this.pivot.visible = true;
    this.screen.setQuiz(false);
    this.setStage(false);
    this.yaw = 0.75; this.pitch = 0.12; this.zoom = 1;
    this.layoutDirty = true;
    this.select(this.current, true);
  }

  nextRound() {
    const q = this.quiz;
    if (!q || !(q.phase === 'reveal' || (q.phase === 'load' && q.i < 0))) return;
    q.i++;
    if (q.i >= q.seq.length) {
      q.phase = 'done';
      const { rec, best } = saveQuiz(q.score);
      for (const id of quizFeats(q.score, QUIZ_ROUNDS)) achievements.unlock(id); // achievement hook (Feats.ts)
      this.screen.quizDone(q.score, QUIZ_ROUNDS, rec.best, best);
      return;
    }
    q.phase = 'load';
    const id = q.seq[q.i];
    q.choices = quizChoices(id);
    q.view = VIEWS[Math.floor(Math.random() * VIEWS.length)];
    this.pivot.visible = false;
    void this.show(id, () => {
      if (this.quiz !== q) return;
      this.silhouette(true);
      this.pivot.rotation.y = 0;
      this.yaw = q.view[0] + (Math.random() - 0.5) * 0.5;
      this.pitch = q.view[1];
      this.zoom = 1;
      this.yawV = this.pitchV = 0;
      this.pivot.visible = true;
      q.phase = 'flash';
      q.t = 0;
      this.screen.quizRound(q.i, QUIZ_ROUNDS, q.score, q.choices);
      this.layoutDirty = true;
    });
  }

  answer(id: AircraftId) {
    const q = this.quiz;
    if (!q || (q.phase !== 'flash' && q.phase !== 'choose')) return;
    const right = q.seq[q.i];
    if (id === right) q.score++;
    q.phase = 'reveal';
    this.silhouette(false);
    this.pivot.visible = true;
    this.idleT = 0;
    this.screen.quizAnswered(id, right, q.score, q.i === q.seq.length - 1);
  }

  /** Quiz stage: the sky instead of the hangar, no floor (views from below). */
  private setStage(sky: boolean) {
    if (this.backdrop) (this.backdrop.material as THREE.MeshBasicMaterial).map = sky ? this.skyTex : this.hangarTex;
    if (this.floor) this.floor.visible = !sky;
  }

  /** Black silhouette: every mesh of the shown aircraft on one flat material. */
  private silhouette(on: boolean) {
    if (on && this.shown) {
      this.shown.holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || this.silSaved.has(m)) return;
        this.silSaved.set(m, m.material);
        m.material = this.silMat;
      });
    } else if (!on) {
      for (const [m, mat] of this.silSaved) m.material = mat;
      this.silSaved.clear();
    }
  }

  back() { this.close(); }

  // ---------------- museum and codex ----------------

  private stats: MuseumStats | null = null;

  private museumView(id: AircraftId) {
    const s = this.stats;
    if (!s) return null;
    const entry = MUSEUM[id];
    return { entry, open: entry.facts.map((f) => factOpen(f.rule, id, s)) };
  }

  private refreshFresh() {
    if (this.stats) this.screen.setFresh(Object.keys(freshFacts(this.stats)) as AircraftId[]);
  }

  factsSeen(id: AircraftId) {
    if (!this.stats) return;
    markKnown(id, this.stats);
    this.refreshFresh();
  }

  openCodex() {
    if (!this.active) return;
    if (this.quiz) this.stopQuiz();
    this.screen.setCodex(true, codexEntries(), this.host.codex());
    this.layoutDirty = true;
  }

  private closeCodex() {
    this.screen.setCodex(false);
    this.layoutDirty = true;
  }

  // ---------------- frame ----------------

  private onFrame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    // another screen took over (UI.show hides every other layer): shut the hangar down
    if (!this.screen.open) { this.close(); return; }
    this.pad(dt);
    const q = this.quiz;
    if (q?.phase === 'flash') {
      q.t += dt;
      if (q.t > FLASH) { q.phase = 'choose'; this.pivot.visible = false; }
    }
    // turntable when nobody is steering (not while a silhouette is up)
    this.idleT += dt;
    const still = q && (q.phase === 'flash' || q.phase === 'choose' || q.phase === 'load');
    if (!still && this.idleT > IDLE && !this.fingers.size) this.pivot.rotation.y += SPIN * dt * Math.min(1, (this.idleT - IDLE) / 1.5);
    // orbit inertia
    if (!this.fingers.size) {
      this.yaw += this.yawV * dt; this.pitch += this.pitchV * dt;
      const damp = Math.exp(-dt * 5);
      this.yawV *= damp; this.pitchV *= damp;
    }
    this.shown?.a.updateProps(dt, 0.2);   // props ticking over (blades visible)
    this.placeCamera();
  };

  private placeCamera() {
    const cam = this.cam, e = this.engine;
    const W = e.width, H = e.height;
    if (this.layoutDirty) { this.insets = this.screen.insets(); this.layoutDirty = false; }
    // centre the aircraft in the space the panels leave free (shifted lens centre)
    const ins = this.insets;
    const free = Math.max(160, W - ins.left - ins.right), freeH = Math.max(120, H - ins.top - ins.bottom);
    const dx = (ins.left + (W - ins.right)) / 2 - W / 2, dy = (ins.top + (H - ins.bottom)) / 2 - H / 2;
    const fullW = W + 2 * Math.abs(dx), fullH = H + 2 * Math.abs(dy);
    cam.aspect = fullW / fullH;
    // the vertical field of view covers fullH: scale it so the visible screen keeps the base FOV
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * fullH / H));
    cam.setViewOffset(fullW, fullH, dx > 0 ? 0 : 2 * Math.abs(dx), dy > 0 ? 0 : 2 * Math.abs(dy), W, H);
    // distance that fits the aircraft in the free area, times the zoom
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const tanH = tanV * (free / H);
    // (the quiz views from above / below show the whole length upright: fit it vertically too)
    const tall = this.quiz && Math.abs(this.pitch) > 0.6 ? 1.0 : 0.56;
    const base = Math.max((FIT * 1.04) / tanH, (FIT * tall) / (tanV * freeH / H)) + FIT * 0.3;
    const dist = base * this.zoom;
    // in the hangar the camera stays above the floor; the quiz sky has no floor
    const minPitch = this.quiz ? -1.3 : Math.asin(THREE.MathUtils.clamp((0.8 - HANG) / dist, -1, 1));
    this.pitch = THREE.MathUtils.clamp(this.pitch, minPitch, 1.3);
    const cp = Math.cos(this.pitch);
    cam.position.set(Math.sin(this.yaw) * cp * dist, HANG + Math.sin(this.pitch) * dist, Math.cos(this.yaw) * cp * dist);
    cam.lookAt(0, HANG, 0);
    cam.updateProjectionMatrix();
  }

  // ---------------- input ----------------

  private poke() { this.idleT = 0; }

  private onDown = (ev: PointerEvent) => {
    if (!this.active) return;
    this.fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (this.fingers.size === 2) this.pinch = this.pinchDist();
    this.engine.renderer.domElement.style.cursor = 'grabbing';
    this.yawV = this.pitchV = 0;
    this.poke();
  };

  private onMove = (ev: PointerEvent) => {
    const f = this.fingers.get(ev.pointerId);
    if (!f) return;
    const dx = ev.clientX - f.x, dy = ev.clientY - f.y;
    f.x = ev.clientX; f.y = ev.clientY;
    if (this.fingers.size >= 2) {
      const d = this.pinchDist();
      if (this.pinch > 0 && d > 0) this.setZoom(this.zoom * (this.pinch / d));
      this.pinch = d;
    } else if (!this.quizLocked()) {
      const k = 0.0065;
      this.yaw -= dx * k; this.pitch += dy * k;
      this.yawV = -dx * k * 30; this.pitchV = dy * k * 30;
    }
    this.poke();
  };

  private onUp = (ev: PointerEvent) => {
    if (!this.fingers.delete(ev.pointerId)) return;
    if (this.fingers.size < 2) this.pinch = 0;
    if (!this.fingers.size) this.engine.renderer.domElement.style.cursor = '';
  };

  private onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    this.setZoom(this.zoom * Math.exp(ev.deltaY * 0.0012));
    this.poke();
  };

  private onKey = (ev: KeyboardEvent) => {
    if (!this.screen.open || ev.repeat && ev.code.startsWith('Digit')) return;
    const q = this.quiz;
    if (q) {
      const n = /^Digit([1-4])$/.exec(ev.code);
      if (n && q.choices[+n[1] - 1]) { ev.preventDefault(); this.answer(q.choices[+n[1] - 1]); }
      return;
    }
    if (this.screen.codexPanel && this.screen.root?.classList.contains('codex')) return;   // the codex reads with the menu focus
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
      // the list reads from the right in Arabic: the arrows follow it
      const rtl = document.documentElement.dir === 'rtl';
      ev.preventDefault();
      this.step((ev.code === 'ArrowRight') !== rtl ? 1 : -1);
    } else if (ev.code === 'Equal' || ev.code === 'NumpadAdd') this.setZoom(this.zoom / 1.15);
    else if (ev.code === 'Minus' || ev.code === 'NumpadSubtract') this.setZoom(this.zoom * 1.15);
  };

  private onResize = () => { this.layoutDirty = true; };

  private pinchDist() {
    const p = [...this.fingers.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }

  private setZoom(z: number) { this.zoom = THREE.MathUtils.clamp(z, 0.45, 1.9); }

  /** While a silhouette is up the view is fixed (no peeking from another angle). */
  private quizLocked() { const q = this.quiz; return !!q && (q.phase === 'flash' || q.phase === 'choose' || q.phase === 'load'); }

  // Gamepad: right stick orbits, LT / RT zoom, LB / RB previous / next aircraft (the menu
  // focus keeps the D-pad, left stick, A and B: core/Gamepad.ts)
  private pad(dt: number) {
    let pads: (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { return; }
    const p = pads.find((x) => x && x.connected);
    if (!p) { this.padPrev.clear(); return; }
    const dz = (v: number | undefined) => { const a = v ?? 0; return Math.abs(a) < 0.15 ? 0 : Math.sign(a) * (Math.abs(a) - 0.15) / 0.85; };
    const rx = dz(p.axes[2]), ry = dz(p.axes[3]);
    const val = (i: number) => p.buttons[i]?.value ?? (p.buttons[i]?.pressed ? 1 : 0);
    if (!this.quizLocked() && (rx || ry)) { this.yaw -= rx * 2.2 * dt; this.pitch -= ry * 1.5 * dt; this.yawV = this.pitchV = 0; this.poke(); }
    const zt = val(6) - val(7);
    if (Math.abs(zt) > 0.05) { this.setZoom(this.zoom * Math.exp(zt * 1.3 * dt)); this.poke(); }
    const now = new Set<number>();
    for (const i of [4, 5]) if (p.buttons[i]?.pressed) now.add(i);
    if (!this.quiz && !this.screen.root?.classList.contains('codex')) {
      if (now.has(4) && !this.padPrev.has(4)) this.step(-1);
      if (now.has(5) && !this.padPrev.has(5)) this.step(1);
    }
    this.padPrev = now;
  }

  /** Dev / tests: show a card section. */
  section(sec: 'specs' | 'history' | 'crew' | 'facts') { this.screen.setSection(sec); }

  /** Dev / tests: the current state. */
  get state() {
    return { active: this.active, ready: this.ready, current: this.current, shown: this.shown?.id ?? null, section: this.screen.cardSection, codex: this.screen.root?.classList.contains('codex') ? this.screen.codexPanel?.state ?? null : null, quiz: this.quiz ? { i: this.quiz.i, phase: this.quiz.phase, score: this.quiz.score, answer: this.quiz.seq[this.quiz.i] } : null };
  }
}

// ---------------- procedural textures ----------------

function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Equirectangular hangar interior: a dark arched roof with trusses and lamps, corrugated
// walls, and the big doors open on one side onto a hazy airfield (the light source the key
// light pretends to be). The lower half sits under the floor disc: it fades to the floor's edge.
function hangarCanvas(): HTMLCanvasElement {
  const W = 2048, H = 1024, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(7);
  const eq = H / 2;
  let gr = g.createLinearGradient(0, 0, 0, eq);
  gr.addColorStop(0, '#0b0a08'); gr.addColorStop(0.55, '#1b1813'); gr.addColorStop(0.82, '#2e2920'); gr.addColorStop(1, '#3b3428');
  g.fillStyle = gr; g.fillRect(0, 0, W, eq);
  // corrugated wall band
  for (let x = 0; x < W; x += 6) { g.fillStyle = `rgba(0,0,0,${0.08 + 0.06 * Math.sin(x * 0.9)})`; g.fillRect(x, eq * 0.74, 3, eq * 0.26); }
  // roof trusses: ribs meeting at the top, a lattice between them
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 7;
  for (let x = 0; x < W; x += 128) { g.beginPath(); g.moveTo(x, eq * 0.76); g.lineTo(x, 0); g.stroke(); }
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.4)';
  for (let x = 0; x < W; x += 128) for (let y = 40; y < eq * 0.7; y += 70) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 128, y + 70); g.moveTo(x + 128, y); g.lineTo(x, y + 70); g.stroke(); }
  g.lineWidth = 5; for (const y of [eq * 0.2, eq * 0.45, eq * 0.7]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // lamps: warm pools hanging from the roof
  for (let i = 0; i < 16; i++) {
    const x = (i + 0.5) * (W / 16), y = eq * (0.42 + 0.06 * (i % 2));
    const lg = g.createRadialGradient(x, y, 0, x, y, 46);
    lg.addColorStop(0, 'rgba(255,214,150,.95)'); lg.addColorStop(0.15, 'rgba(255,190,110,.5)'); lg.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = lg; g.fillRect(x - 46, y - 46, 92, 92);
  }
  // the open doors: hazy daylight, a strip of airfield and a parked B-17 shape far off
  const dx0 = W * 0.36, dx1 = W * 0.64, dy0 = eq * 0.5;
  gr = g.createLinearGradient(0, dy0, 0, eq);
  gr.addColorStop(0, '#aeb9bd'); gr.addColorStop(0.75, '#d6d9cf'); gr.addColorStop(1, '#8b8f74');
  g.fillStyle = gr; g.fillRect(dx0, dy0, dx1 - dx0, eq - dy0);
  g.fillStyle = '#6f7556'; g.fillRect(dx0, eq - 22, dx1 - dx0, 22);
  g.fillStyle = 'rgba(40,40,32,.75)';
  g.beginPath(); g.ellipse(W * 0.55, eq - 30, 70, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(W * 0.55 - 6, eq - 40, 12, 14);
  g.fillStyle = '#2a2620';
  g.fillRect(dx0 - 30, dy0 - 18, dx1 - dx0 + 60, 18);   // door header
  for (const x of [dx0 - 30, dx1]) g.fillRect(x, dy0, 30, eq - dy0);   // door posts
  // grime
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.08 * r()})`; g.fillRect(r() * W, eq * (0.5 + 0.5 * r()), 2 + 6 * r(), 1 + 3 * r()); }
  // under the floor: fade to the floor's dark edge
  gr = g.createLinearGradient(0, eq, 0, H);
  gr.addColorStop(0, '#16130f'); gr.addColorStop(1, '#0a0907');
  g.fillStyle = gr; g.fillRect(0, eq, W, H - eq);
  return c;
}

// Quiz sky: a pale, hazy high-altitude sky (the silhouette reads black against it), cloud tops below
function skyCanvas(): HTMLCanvasElement {
  const W = 1024, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#5f84a8'); gr.addColorStop(0.42, '#a9bfcf'); gr.addColorStop(0.5, '#dfe5e6'); gr.addColorStop(0.62, '#cfd5d6'); gr.addColorStop(1, '#b7bec2');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = H * (0.52 + 0.4 * r()), rx = 30 + 90 * r(), ry = 6 + 14 * r();
    const cg = g.createRadialGradient(x, y, 0, x, y, rx);
    cg.addColorStop(0, 'rgba(250,250,248,.55)'); cg.addColorStop(1, 'rgba(250,250,248,0)');
    g.fillStyle = cg;
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
    g.restore();
  }
  return c;
}

// Concrete hangar floor (the disc, 140 m across): slabs, oil stains, tyre marks, a painted
// display circle and a stencil, darkening to the edge where it meets the backdrop
function floorCanvas(): HTMLCanvasElement {
  const S = 2048, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const r = rng(11);
  g.fillStyle = '#46423b'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { const v = Math.floor(80 + 60 * r()); g.fillStyle = `rgba(${v - 20},${v - 24},${v - 30},.2)`; g.fillRect(r() * S, r() * S, 1 + 3 * r(), 1 + 3 * r()); }
  // slab joints every ~6 m (2048 px = 140 m)
  g.strokeStyle = 'rgba(24,22,18,.4)'; g.lineWidth = 2;
  const step = S / 23;
  for (let p = step / 2; p < S; p += step) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  // oil and tyre marks
  for (let i = 0; i < 60; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.5, y = S / 2 + (r() - 0.5) * S * 0.5, rad = 10 + 50 * r();
    const og = g.createRadialGradient(x, y, 0, x, y, rad);
    og.addColorStop(0, 'rgba(25,22,18,.35)'); og.addColorStop(1, 'rgba(25,22,18,0)');
    g.fillStyle = og; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(20,18,15,.18)'; g.lineWidth = 14;
  for (let i = 0; i < 6; i++) { g.beginPath(); const x = S * (0.3 + 0.4 * r()); g.moveTo(x, S * 0.1); g.bezierCurveTo(x + 200 * (r() - 0.5), S * 0.4, x + 300 * (r() - 0.5), S * 0.6, x + 200 * (r() - 0.5), S * 0.9); g.stroke(); }
  // painted display circle and stencil
  g.strokeStyle = 'rgba(214,176,58,.85)'; g.lineWidth = 16;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, S * 0.185, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(214,176,58,.8)'; g.font = 'bold 54px "IBM Plex Mono", monospace'; g.textAlign = 'center';
  g.fillText(tx('HANGAR 2 · KEEP CLEAR'), S / 2, S / 2 + S * 0.235);
  // fade to the dark edge
  const vg = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  vg.addColorStop(0, 'rgba(10,9,7,0)'); vg.addColorStop(0.45, 'rgba(10,9,7,.5)'); vg.addColorStop(0.85, 'rgba(10,9,7,.95)'); vg.addColorStop(1, 'rgba(10,9,7,1)');
  g.fillStyle = vg; g.fillRect(0, 0, S, S);
  return c;
}
