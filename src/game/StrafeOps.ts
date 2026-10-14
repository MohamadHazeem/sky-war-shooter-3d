import { recordMarker } from '../ui/MarkerAudit';
import { projectMarker, markerAtmosphereAlpha } from '../ui/MarkerProjection';
import * as THREE from 'three';
import type { World } from '../world/World';
import { Fighter, WRECK_FLOOR } from '../world/Aircraft';
import { EnemyPilot, leadPoint, steerTo, type WorldView } from '../world/AI';
import { Countryside, terrainHeight, RAIL, ROAD, VILLAGE, AIRFIELD, TUNNEL, type Path } from '../world/Countryside';
import { GroundTargets, type GroundTarget, type GroundKind, type Credit } from '../world/GroundTargets';
import type { ModelKind } from '../world/Models';
import { sound } from '../audio/Sound';
import { tx } from '../i18n';
import type { UI } from '../ui/UI';
import type { Incoming } from '../ui/Radar';
import type { Mission } from './Missions';
import type { PilotController } from './PilotController';
import type { Wingman, WingmanPilot } from './Wingman';
import { registerMode, type ModeDef } from './Modes';
import { achievements } from './Achievements';

// "Train Busting" — the P-51 goes down on the deck (Phase 5 goal 18). A Special operation on the
// Survival screen (P-51 only, leaderboard 'strafe-pilot'), flown at 50-600 m over the Normandy
// countryside (Countryside.ts) against ground targets (GroundTargets.ts):
//   Round 1  a supply train heading for a tunnel: stop the locomotive before it gets there
//            (the boiler bursts in a cloud of steam), then shoot up the wagons; a flak wagon
//            and two 20 mm positions by the line fire back.
//   Round 2  a truck convoy heading for the village, with a flak half-track; a wreck blocks the
//            road for the trucks behind it.
//   Round 3  the Luftwaffe airfield: aircraft parked in their dispersals, four 20 mm positions
//            and a quad-20 mm tower, and Fw 190s scrambling to catch the Mustangs low down.
// Danger comes mainly from the ground: the flak's tracer streams, and the ground itself (any
// aircraft that touches it is destroyed: "Your Mustang flew into the ground."; a PULL UP warning
// sounds when a dive is about to end in the dirt). Blue Two flies with the leader: order 1 sends
// him down on the target nearest your nose (else on a bandit in front, as usual), order 2 has him
// fly top cover.
//
// PilotOps drives it like RaidDefence: start(m), direct() every frame (score, radar, round over,
// fail), objective() for the HUD line and drawOverlay(). Low-level rules while it runs: World's
// fighter floor and the wreck floor are switched off (this class does the terrain collision), the
// chase camera stays above the ground (PilotController.groundAt) and the wingman flies to a
// terrain floor (Wingman.lowLevel).

// Radio (tools/voice/lines.json: speakers "Control" and "Blue Two")
export const STRAFE_RADIO = {
  r1: ['Control', 'Control to Blue flight: a supply train is heading east for the tunnel. Stop that locomotive before it gets there!'],
  r2: ['Control', 'Control: a truck convoy is on the road to the village. Shoot it up before it gets under cover!'],
  r3: ['Control', 'Control: the Luftwaffe field to the north-east. Strafe the aircraft on the ground — and watch the flak!'],
  loco: ['Blue Two', 'Got the loco! She\'s blown her boiler!'],
  escaped: ['Control', 'The train made it into the tunnel. Too late, Blue flight.'],
  flak: ['Blue Two', 'Light flak coming up! Stay low and keep jinking!'],
  bandits: ['Blue Two', 'Focke-Wulfs coming down on us! Watch your tail, Leader!'],
  wingGo: ['Blue Two', 'Blue Two, going down on your target!'],
  wingKill: ['Blue Two', 'Blue Two — got one on the ground!'],
  area: ['Control', 'Blue Leader, you are leaving the target area. Come back round.'],
} as const satisfies Record<string, readonly [string, string]>;

const START = { u: -1200, v: -3900, agl: 320 };   // the Mustang comes in from the south
const AREA_WARN = 9500;           // m from the map centre: "leaving the target area"
const OBJ_BONUS = 500;
const TRAIN_SPEED = 21;           // m/s
const CONVOY_SPEED = 12;
const CAR_GAP = 13.6;             // m between wagon centres
const TRUCK_GAP = 19;
const FW_SCALE = 2.5;             // the enemy fighters are normally drawn 6x: smaller at low level
const FW_STRUCTURE = 0.55;        // ... and their hit zones shrink with them (to ~40%): structure scaled to match (docs/BALANCE.md)
const FW_WAVES = [[60, 2], [150, 2]] as const;   // airfield round: s into the round, Fw 190s scrambling (was 45 s / 115 s)
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();
const _b3 = new THREE.Vector3();
const _c3 = new THREE.Vector3();
const _a = new THREE.Vector2();
const _b = new THREE.Vector2();
const R = () => Math.random() * 2 - 1;

type GroundAt = (x: number, z: number) => number;

// Height (m) lost pulling out of the present dive at ~g G (plus 0.6 s to react): the floor every
// low-level pilot (and the PULL UP warning) works to
export function pullOutHeight(vel: THREE.Vector3, g = 5): number {
  const v = vel.length();
  if (v < 1) return 0;
  const sink = Math.max(0, -vel.y);
  const c = Math.sqrt(Math.max(0, 1 - (sink / v) ** 2));
  return (v * v) / (9.81 * g) * (1 - c) + sink * 0.6;
}

// ---------- a strafing pass (Blue Two and the dev autopilot fly the same one) ----------

// Set up 1.4-2.4 km out at ~260 m, dive on the target firing from 800 m, pull out at 300 m or
// 35 m above the ground, climb away and come round again.
export class StrafeRun {
  phase: 'setup' | 'dive' | 'pull' = 'setup';
  t = 0;
  fire = false;
  readonly dir = new THREE.Vector3();
  constructor(private groundAt: GroundAt, private alt = 260) {}

  private turnIn = false;
  reset() { this.phase = 'setup'; this.t = 0; this.turnIn = false; }

  // target: scene position of its centre, tvel its velocity; axis (horizontal unit, optional): run
  // in across it (a train or a convoy is attacked from the side, so the wagons behind the
  // locomotive are not in the line of fire). Returns the direction to fly.
  step(me: Fighter, target: THREE.Vector3, tvel: THREE.Vector3, dt: number, axis?: THREE.Vector3): THREE.Vector3 {
    this.t += dt;
    this.fire = false;
    const gy = this.groundAt(me.pos.x, me.pos.z);
    const agl = me.pos.y - gy;
    const to = _d.copy(target).sub(me.pos);
    const dh = Math.hypot(to.x, to.z);
    const fwd = me.forward(_f);
    const fh = _w.set(fwd.x, 0, fwd.z).normalize();
    const dir = this.dir;
    const holdAlt = (y: number) => THREE.MathUtils.clamp((gy + y - me.pos.y) * 0.006, -0.25, 0.3);
    switch (this.phase) {
      case 'setup': {
        const toward = _v.set(to.x, 0, to.z).normalize();
        if (axis) {
          // set up 1.9 km out on our side of the target's axis, then turn in
          const side = (me.pos.x - target.x) * axis.x + (me.pos.z - target.z) * axis.z >= 0 ? 1 : -1;
          const sx = target.x + axis.x * side * 1900 - me.pos.x, sz = target.z + axis.z * side * 1900 - me.pos.z;
          if (!this.turnIn && Math.hypot(sx, sz) < 380) this.turnIn = true;
          if (this.turnIn && dh < 900) this.turnIn = false;          // overshot: go round again
          if (this.turnIn) dir.copy(toward); else dir.set(sx, 0, sz).normalize();
        } else if (dh < 1400) dir.copy(toward).negate(); else dir.copy(toward);
        // turn round as a level, banked turn: never ask for more than ~55 deg off the nose (a
        // point behind would be flown as a split-S, straight into the ground)
        const off = fh.angleTo(dir);
        if (off > 0.95) {
          const side = fh.x * dir.z - fh.z * dir.x > 0 ? -1 : 1;
          dir.copy(fh).applyAxisAngle(UP, side * 0.95);
        }
        dir.y = holdAlt(this.alt);
        if (dh > 1150 && dh < 2600 && fh.dot(toward) > 0.85 && (!axis || this.turnIn)) { this.phase = 'dive'; this.t = 0; this.turnIn = false; }
        if (this.t > 40) this.t = 0;
        break;
      }
      case 'dive': {
        const d = to.length();
        const tof = d / (880 + Math.max(0, me.vel.dot(to) / Math.max(1, d)));   // the rounds carry the Mustang's own speed
        const aim = _v.copy(target).addScaledVector(tvel, tof);
        aim.y += 0.5 * 9.81 * tof * tof;
        dir.copy(aim).sub(me.pos).normalize();
        // where the rounds actually go: the nose plus the aircraft's own velocity (the nose rides
        // above the flight path in the dive); fly so that line lands on the aim point
        const bdir = _b3.copy(fwd).multiplyScalar(880).add(me.vel).normalize();
        const err = bdir.angleTo(dir);
        this.fire = d < 850 && err < Math.max(0.014, 11 / d);   // within ~11 m of the aim point
        dir.addScaledVector(_c3.copy(dir).sub(bdir), 1.8).normalize();
        if (d < 300 || agl < 38 || this.t > 16 || (dh < 600 && fh.dot(_v.set(to.x, 0, to.z).normalize()) < 0)) { this.phase = 'pull'; this.t = 0; }
        break;
      }
      case 'pull':
        dir.copy(fh).addScaledVector(UP, agl < this.alt ? 0.55 : 0.05);
        if (this.t > 3.5) { this.phase = 'setup'; this.t = 0; }
        break;
    }
    // never into the ground: look 2.5 s ahead
    if (agl < pullOutHeight(me.vel, 3.5) + 35) dir.copy(fh).addScaledVector(UP, 1);
    return dir.normalize();
  }
}

// ---------- enemy fighters down low ----------

// A Fw 190 hunting the Mustangs on the deck: firing passes on its target, then extends and comes
// round again, never below ~60 m (the normal pilot climbs back above the cloud deck)
export class LowFighterPilot extends EnemyPilot {
  private mode: 'run' | 'extend' = 'run';
  private ext = new THREE.Vector3();
  private aimP = new THREE.Vector3();
  private err = new THREE.Vector3();

  constructor(me: Fighter, skill: number, private groundAt: GroundAt, private home: () => THREE.Vector3) {
    super(me, 'high', skill);
    this.dogfightChance = 0;
    this.state = 'dogfight';
  }

  update(dt: number, w: WorldView) {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    me.gunAim = null;
    this.timer += dt;
    if (!me.alive) return;
    // the leader's Mustang first, Blue Two when the leader is down
    const allied = w.fighters('allied').filter((f) => f.alive);
    if (!this.target || !this.target.alive) this.target = w.playerFighter?.alive ? w.playerFighter : allied[0] ?? null;
    const t = this.target;
    const gy = this.groundAt(me.pos.x, me.pos.z);
    const agl = me.pos.y - gy;
    let dir: THREE.Vector3;
    if (!t) {
      dir = _d.copy(this.home()).sub(me.pos).setY(0).normalize();
      dir.y = THREE.MathUtils.clamp((gy + 400 - me.pos.y) * 0.004, -0.2, 0.2);
      fm.throttle = 0.8;
    } else if (this.mode === 'run') {
      if (Math.floor(this.timer / 2.5) !== Math.floor((this.timer - dt) / 2.5)) this.err.set(R(), R(), R()).multiplyScalar((10 + Math.random() * 14) / this.skill * w.enemyAimMult);
      leadPoint(me.pos, me.vel, t, 760, this.aimP).add(this.err);
      dir = _d.copy(this.aimP).sub(me.pos);
      const dist = dir.length();
      dir.divideScalar(Math.max(1, dist));
      const errA = me.forward(_f).angleTo(dir);
      if (dist < 650 && errA < 0.05 * this.skill + 0.02) me.trigger = true;
      fm.throttle = 1;
      const behind = _v.copy(t.pos).sub(me.pos).dot(me.forward(_f)) < 0;
      if (dist < 170 || (behind && dist < 500) || this.timer > 22) {
        this.mode = 'extend'; this.timer = 0;
        this.ext.copy(me.forward(_f)).setY(0).normalize().applyAxisAngle(UP, (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5));
      }
    } else {
      dir = _d.copy(this.ext);
      dir.y = THREE.MathUtils.clamp((gy + 380 - me.pos.y) * 0.005, -0.2, 0.35);
      fm.throttle = 1;
      if (this.timer > 6 + Math.random() * 2 || t.pos.distanceTo(me.pos) > 1800) { this.mode = 'run'; this.timer = 0; }
    }
    // the ground: look 3 s ahead and pull up hard; and no higher than ~1.2 km
    if (agl < pullOutHeight(me.vel) + 65) dir = _d.copy(me.forward(_f)).setY(0).normalize().addScaledVector(UP, 1.1);
    else if (agl > 1200) dir.y = Math.min(dir.y, -0.15);
    steerTo(fm, dir, 1.25, 1);
  }
}

// ---------- the director ----------

interface Mover { path: Path; s: number; speed: number; want: number; t: GroundTarget[]; offs: number[]; dir: 1 | -1; end: number; escaped: number; gone: boolean }

let shared: { cs: Countryside; gt: GroundTargets; world: World } | null = null;

export class StrafeOps {
  active = false;
  cs: Countryside | null = null;
  gt: GroundTargets | null = null;
  private roundIdx = -1;
  private roundDone = false;
  private bannerDone = false;
  private lastT = 0;
  private train: Mover | null = null;
  private convoy: Mover | null = null;
  private fws: Fighter[] = [];
  private fwWaves: { at: number; n: number; done: boolean }[] = [];
  private roundScore = 0;
  private overT = -1;
  private crashed = false;
  private failSent = false;
  private warn = 0;              // PULL UP: 0..1 (time to impact under the threshold)
  private beepT = 0;
  private flakCalled = false;
  private areaCalled = -99;
  private washT = 0;
  readonly objectives = [false, false, false];
  readonly destroyed: Record<string, number> = {};
  wingTarget: GroundTarget | null = null;
  private wingRun: StrafeRun | null = null;
  log: string[] = [];
  private wing: Wingman | null = null;

  constructor(private world: World, private ui: UI, private lead: PilotController | null = null) {}

  private note(s: string) { this.log.push(`${this.world.time.toFixed(0)}s ${s}`); if (this.log.length > 150) this.log.shift(); }

  // Ground height under a scene point (0 when no countryside)
  groundAt: GroundAt = (x, z) => (this.cs ? this.cs.groundY(x, z) : 0);

  start(m: Mission, wing: Wingman | null) {
    const w = this.world;
    this.active = m.role === 'pilot' && m.id === 'strafe-pilot' && !!w.playerFighter;
    this.roundIdx = -1;
    this.train = this.convoy = null;
    this.fws = []; this.fwWaves = [];
    this.crashed = this.failSent = false;
    this.warn = 0; this.flakCalled = false; this.areaCalled = -99;
    this.objectives.fill(false);
    for (const k in this.destroyed) delete this.destroyed[k];
    this.wingTarget = null;
    this.log = [];
    this.wing = wing;
    if (!this.active) { this.deactivate(); return; }
    // the countryside is built once per session and kept (it costs ~0.1-0.3 s to build)
    if (!shared || shared.world !== w) {
      const q = (w as unknown as { engine?: { quality?: 'low' | 'medium' | 'high' | 'ultra' } }).engine?.quality ?? 'high';
      const cs = new Countryside(q);
      shared = { cs, gt: new GroundTargets(w, cs), world: w };
    }
    this.cs = shared.cs; this.gt = shared.gt;
    const cs = this.cs, gt = this.gt;
    gt.clear();
    gt.skill = 0.85 + 0.15 * w.difficulty;
    // lay the map under the Mustang: it starts south of the railway, heading north, low
    const pf = w.playerFighter!;
    cs.group.position.set(pf.pos.x - START.u, 0, pf.pos.z - START.v);
    cs.group.rotation.set(0, 0, 0);
    pf.pos.y = terrainHeight(START.u, START.v) + START.agl;
    pf.fm.vel.set(0, 0, 150); pf.vel.copy(pf.fm.vel);
    cs.show(w.scene, true);
    gt.attach(true);
    gt.onDestroyed = (t, by) => this.onDestroyed(t, by);
    cs.onFrame = () => { if (this.active && w.playerFighter !== pf) queueMicrotask(() => { if (w.playerFighter !== pf) this.deactivate(); }); };
    w.floorY = -1e9;
    WRECK_FLOOR.fighter = -1e9;
    // no escort-mission radio down here: Game's opening "form up on the bombers" call and the
    // idle chatter about the big friends are held off (World.callout keys 'start', 'chatter')
    const calls = (w as unknown as { lastCallout?: Map<string, number> }).lastCallout;
    calls?.set('start', 1e9).set('chatter', 1e9);
    w.formationCenter.set(pf.pos.x, 350, pf.pos.z + 3000);
    w.formationForward.set(0, 0, 1);
    if (this.lead) this.lead.groundAt = this.groundAt;
    if (wing) {
      wing.lowLevel = {
        floorAt: (x, z, vel) => this.groundAt(x, z) + 45 + pullOutHeight(vel),
        run: (p, dt) => this.wingFly(p, dt),
        pick: () => this.wingPick(),
        busy: () => !!this.wingTarget?.alive,
      };
    }
    this.note('start');
  }

  // Back to the normal rules (another mission, or the menu: the Mustang is gone)
  private deactivate() {
    const w = this.world;
    this.active = false;
    if (this.cs) { this.cs.show(w.scene, false); this.cs.onFrame = null; }
    if (this.gt) { this.gt.attach(false); this.gt.clear(); }
    w.floorY = 250;
    WRECK_FLOOR.fighter = 3000;
    if (this.lead) this.lead.groundAt = null;
    if (this.wing) this.wing.lowLevel = null;
  }

  // ---------- rounds ----------
  private beginRound(i: number) {
    this.roundIdx = i;
    this.roundDone = false;
    this.bannerDone = false;
    this.lastT = 0;
    this.overT = -1;
    this.roundScore = 0;
    this.flakCalled = false;
    this.wingTarget = null;
    const gt = this.gt!;
    // the last round's movers stop where they are
    if (this.train) this.train.speed = this.train.want = 0;
    if (this.convoy) this.convoy.speed = this.convoy.want = 0;
    if (i === 0) this.setupTrain();
    else if (i === 1) this.setupConvoy();
    else this.setupAirfield();
    this.note(`round ${i + 1}: ${gt.list.filter((t) => t.alive && t.set === this.roundSet()).length} targets`);
  }

  roundSet() { return ['train', 'convoy', 'airfield'][Math.min(2, Math.max(0, this.roundIdx))]; }

  private flakAt(u: number, v: number, set: string, tower = false) {
    return this.gt!.add(tower ? 'flaktower' : 'flak', u, v, 0, set);
  }

  private setupTrain() {
    const gt = this.gt!;
    const end = RAIL.nearest(TUNNEL.u, TUNNEL.v);
    const s0 = RAIL.nearest(VILLAGE.u - 250, VILLAGE.v + 600);
    const kinds: GroundKind[] = ['loco', 'boxcar', 'boxcar', 'tanker', 'boxcar', 'flakcar', 'boxcar', 'tanker', 'boxcar', 'boxcar'];
    const offs: number[] = [];
    const t = kinds.map((k, i) => { const o = i === 0 ? 0 : 19 + (i - 1) * CAR_GAP; offs.push(o); return gt.add(k, 0, 0, 0, 'train'); });
    this.train = { path: RAIL, s: s0, speed: TRAIN_SPEED, want: TRAIN_SPEED, t, offs, dir: 1, end: end - 30, escaped: 0, gone: false };
    this.moveAlong(this.train, 0);
    // flak by the line ahead of the train, and near the tunnel
    for (const [u, side] of [[2300, 1], [4300, -1], [6200, 1]] as const) {
      const s = RAIL.nearest(u, 1700);
      RAIL.at(s, _a, _b);
      this.flakAt(_a.x - _b.y * 110 * side, _a.y + _b.x * 110 * side, 'train');
    }
  }

  private setupConvoy() {
    const gt = this.gt!;
    const s0 = ROAD.nearest(2700, 3350);
    const end = ROAD.nearest(VILLAGE.u + 120, VILLAGE.v + 160);
    const kinds: GroundKind[] = ['truck', 'truck', 'fueltruck', 'truck', 'halftrack', 'truck', 'fueltruck', 'truck', 'truck'];
    const offs: number[] = [];
    const t = kinds.map((k, i) => { offs.push(i * TRUCK_GAP); return gt.add(k, 0, 0, 0, 'convoy'); });
    this.convoy = { path: ROAD, s: s0, speed: CONVOY_SPEED, want: CONVOY_SPEED, t, offs, dir: -1, end, escaped: 0, gone: false };
    this.moveAlong(this.convoy, 0);
    // flak on the edge of the village, covering the road in
    for (const [du, dv] of [[420, 520], [160, 700]] as const) this.flakAt(VILLAGE.u + du, VILLAGE.v + dv, 'convoy');
  }

  private setupAirfield() {
    const gt = this.gt!;
    const c = Math.cos(AIRFIELD.ang), s = Math.sin(AIRFIELD.ang);
    const at = (a: number, b: number) => [AIRFIELD.u + a * c - b * s, AIRFIELD.v + a * s + b * c] as const;
    // eight parked aircraft (was ten: the airfield round ran to its time limit, docs/BALANCE.md)
    const types: ModelKind[] = ['fw190', 'fw190', 'bf109', 'fw190', 'ju88', 'bf109', 'fw190', 'ju88'];
    types.forEach((m, i) => {
      const side = i % 2 ? 1 : -1;
      const a = -600 + Math.floor(i / 2) * 260 + (side > 0 ? 90 : 0);
      const b = side * (AIRFIELD.wid / 2 - 60);
      const [u, v] = at(a, b);
      // parked facing the field, a little askew
      gt.add('plane', u, v, -AIRFIELD.ang + Math.PI / 2 * -side + Math.PI / 2 + R() * 0.25, 'airfield', m);
    });
    for (const [a, b] of [[-820, -420], [820, -420], [-820, 420], [820, 420]] as const) { const [u, v] = at(a, b); this.flakAt(u, v, 'airfield'); }
    { const [u, v] = at(150, AIRFIELD.wid / 2 + 90); this.flakAt(u, v, 'airfield', true); }
    this.fwWaves = FW_WAVES.map(([at, n]) => ({ at, n, done: false }));
  }

  // Train / convoy: advance along the path; a wreck stops everything behind it
  private moveAlong(m: Mover, dt: number) {
    const gt = this.gt!;
    // the head brakes when its own lead vehicle is knocked out
    const headDead = !m.t[0].alive;
    m.want = headDead ? 0 : m.want;
    m.speed += THREE.MathUtils.clamp(m.want - m.speed, -4 * dt, 1.5 * dt);
    m.s += m.speed * dt * m.dir;
    let blocked = false;
    m.t.forEach((t, i) => {
      if (t.speed === -1) return;               // already gone (escaped)
      if (i > 0 && !m.t[i - 1].alive && m.t[i - 1].speed !== -1) blocked = true;
      // the train is one piece; road vehicles behind a wreck stop where they are
      let s = m.s - m.offs[i] * m.dir;
      if (m.path !== RAIL && (blocked || !t.alive)) s = (t as any).ps ?? s;
      (t as any).ps = s;
      m.path.at(s, _a, _b);
      t.speed = m.path === RAIL ? m.speed : (blocked || !t.alive ? 0 : m.speed);
      const heading = Math.atan2(_b.x * m.dir, _b.y * m.dir);
      gt.place(t, _a.x, _a.y, heading);
    });
  }

  // ---------- per frame ----------
  direct(dt: number, roundIdx: number, roundT: number): { score: number; incoming: Incoming | null; roundOver: boolean; fail: string | null } {
    const res = { score: 0, incoming: null as Incoming | null, roundOver: false, fail: null as string | null };
    if (!this.active || !this.cs || !this.gt) return res;
    const w = this.world, gt = this.gt, cs = this.cs;
    gt.refresh();
    if (roundIdx !== this.roundIdx) this.beginRound(roundIdx);
    if (roundT < this.lastT) this.overT = -1;
    this.lastT = roundT;
    const pf = w.playerFighter;
    gt.wingman = this.wing?.plane ?? null;
    const cam = (w as unknown as { engine?: { camera: THREE.Camera } }).engine?.camera;
    if (cam) cs.update(cam);
    // keep World's reference point on the action (radar, spawns, clean-up range)
    const ctr = this.areaCenter(_v);
    w.formationCenter.set(ctr.x, 350, ctr.z);
    this.collide();
    this.lowFx(dt);
    gt.update(dt);
    this.wreckFws();
    if (this.train) this.moveTrain(dt);
    if (this.convoy) this.moveConvoy(dt);
    res.score += this.roundScore; this.roundScore = 0;
    // player lost
    if (pf && !pf.alive && !this.failSent) {
      this.failSent = true;
      res.fail = this.crashed ? 'Your Mustang flew into the ground.' : pf.lastAttacker ? 'Your Mustang was shot down.' : 'Your Mustang was brought down by flak.';
      return res;
    }
    if (!this.bannerDone && roundT > (roundIdx === 0 ? 4.2 : 0.4)) {
      this.bannerDone = true;
      this.ui.banner(`ROUND ${roundIdx + 1} · ${['TRAIN BUSTING', 'CONVOY', 'AIRFIELD'][Math.min(2, roundIdx)]}`, this.roundTitle(), 3200);
      const r = [STRAFE_RADIO.r1, STRAFE_RADIO.r2, STRAFE_RADIO.r3][Math.min(2, roundIdx)];
      w.callout('strafe_r' + roundIdx, r[0], r[1], 0, 3);
    }
    // flak warning the first time a gun opens up on the flight
    if (!this.flakCalled && gt.list.some((t) => t.alive && t.gun?.firing && t.gun.target && t.pos.distanceTo(t.gun.target.pos) < 1800)) {
      this.flakCalled = true;
      w.callout('strafe_flak', STRAFE_RADIO.flak[0], STRAFE_RADIO.flak[1], 30, 2);
    }
    // leaving the area
    if (pf?.alive) {
      cs.toMap(pf.pos, _a);
      if (Math.max(Math.abs(_a.x), Math.abs(_a.y)) > AREA_WARN && w.time - this.areaCalled > 25) {
        this.areaCalled = w.time;
        w.callout('strafe_area', STRAFE_RADIO.area[0], STRAFE_RADIO.area[1], 25, 2);
      }
    }
    if (this.roundIdx === 2) res.incoming = this.fighters(roundT);
    if (this.roundDone) return res;
    const over = this.roundOver(roundT);
    if (over) {
      this.roundDone = true;
      const i = Math.min(2, this.roundIdx);
      if (this.objectiveMet(i)) {
        this.objectives[i] = true;
        res.score += OBJ_BONUS;
        this.ui.feed(`Objective complete — +${OBJ_BONUS}`, 'mine');
      }
      res.roundOver = true;
      this.note(`round ${i + 1} over (${over}): objective ${this.objectives[i] ? 'met' : 'missed'}`);
    }
    return res;
  }

  private roundTitle() {
    return ['Stop the supply train before it reaches the tunnel', 'Shoot up the truck convoy before it reaches the village', 'Strafe the Luftwaffe airfield'][Math.min(2, this.roundIdx)];
  }

  private areaCenter(out: THREE.Vector3): THREE.Vector3 {
    const cs = this.cs!;
    if (this.roundIdx <= 0 && this.train) return out.copy(this.train.t[0].pos);
    if (this.roundIdx === 1 && this.convoy) return out.copy(this.convoy.t[0].pos);
    return cs.toLocal(AIRFIELD.u, AIRFIELD.v, out);
  }

  private moveTrain(dt: number) {
    const m = this.train!;
    if (m.gone) return;
    this.moveAlong(m, dt);
    if (m.t[0].alive && m.s >= m.end) {
      // into the tunnel: the train is gone
      m.gone = true;
      for (const t of m.t) if (t.alive) { t.alive = false; t.speed = -1; this.gt!.place(t, TUNNEL.u + 2000, TUNNEL.v + 2000, 0); m.escaped++; }
      this.hideGone(m);
      this.world.callout('strafe_escaped', STRAFE_RADIO.escaped[0], STRAFE_RADIO.escaped[1], 0, 3);
      this.ui.feed('The train reached the tunnel', 'loss');
      this.note('train escaped');
    }
  }

  private moveConvoy(dt: number) {
    const m = this.convoy!;
    if (m.gone) return;
    this.moveAlong(m, dt);
    // a vehicle that reaches the village gets away among the houses
    m.t.forEach((t, i) => {
      if (!t.alive || t.speed === -1 || t.speed === 0) return;
      const s = (t as unknown as { ps: number }).ps ?? m.s - m.offs[i] * m.dir;
      if (s <= m.end) {
        t.alive = false; t.speed = -1; m.escaped++;
        this.gt!.place(t, VILLAGE.u + 3000, VILLAGE.v - 3000, 0);
        this.ui.feed(`${t.label} reached the village`, 'loss');
      }
    });
    this.hideGone(m);
  }

  // Escaped vehicles: out of sight (scaled to nothing)
  private hideGone(m: Mover) {
    for (const t of m.t) {
      if (t.speed !== -1) continue;
      const mesh = (this.gt as any).meshes.get(t.kind) as THREE.InstancedMesh | undefined;
      if (mesh && t.inst >= 0) { mesh.setMatrixAt(t.inst, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.instanceMatrix.needsUpdate = true; }
      if (t.gun) t.gun.rig.visible = false;
    }
  }

  private roundOver(roundT: number): string | null {
    const set = this.roundSet();
    const left = this.gt!.list.filter((t) => t.set === set && t.alive && t.kind !== 'flak' && t.kind !== 'flaktower');
    const maxT = [330, 320, 360][Math.min(2, this.roundIdx)];
    if (roundT > maxT) return 'time';
    if (this.roundIdx === 0) {
      const tr = this.train!;
      if (tr.gone) return 'escaped';
      if (!tr.t[0].alive) {
        if (this.overT < 0) this.overT = roundT;
        if (!left.length || roundT - this.overT > 40) return 'train stopped';
      }
      return null;
    }
    if (this.roundIdx === 1) return left.length ? null : 'convoy done';
    const fwUp = this.fws.some((f) => f.alive && !f.remove) || this.fwWaves.some((x) => !x.done);
    if (!left.length && !fwUp) return 'airfield done';
    if (!left.length && roundT > 200) return 'airfield done';
    return null;
  }

  private objectiveMet(i: number): boolean {
    const list = this.gt!.list.filter((t) => t.set === ['train', 'convoy', 'airfield'][i] && t.kind !== 'flak' && t.kind !== 'flaktower');
    const dead = list.filter((t) => !t.alive && t.speed !== -1).length;
    if (i === 0) return !list[0]?.alive && list[0]?.speed !== -1;
    if (i === 1) return dead >= 6;
    return dead >= 6;
  }

  // Fw 190s scramble against the Mustangs over the airfield (round 3)
  private fighters(roundT: number): Incoming | null {
    const w = this.world, cs = this.cs!;
    let inc: Incoming | null = null;
    for (const wave of this.fwWaves) {
      if (wave.done) continue;
      const from = cs.toLocal(AIRFIELD.u + 4200, AIRFIELD.v + 3000, new THREE.Vector3(), 650);
      if (roundT >= wave.at) {
        wave.done = true;
        for (let i = 0; i < wave.n; i++) {
          const p = from.clone().add(new THREE.Vector3(i * 90, i * 30, -i * 60));
          const f = w.spawnEnemy(p, 'high', 1, false, false, 'fw190');
          const k = FW_SCALE / (f.model.scale.x || 1);
          f.model.scale.setScalar(FW_SCALE);
          for (const z of f.zones) { z.offset.multiplyScalar(k); z.radius *= k; }
          for (const g of f.guns) g.offset.multiplyScalar(k);
          f.radius *= k;
          f.structure *= FW_STRUCTURE; f.maxStructure *= FW_STRUCTURE;
          const pilot = new LowFighterPilot(f, (0.9 + this.roundIdx * 0.05) * w.difficulty, this.groundAt, () => cs.toLocal(AIRFIELD.u, AIRFIELD.v, new THREE.Vector3()));
          f.ai = pilot;
          w.setPilot(f, pilot);
          const dir = cs.toLocal(AIRFIELD.u, AIRFIELD.v, new THREE.Vector3()).sub(p).setY(0).normalize();
          f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          f.fm.vel.copy(dir).multiplyScalar(170); f.vel.copy(f.fm.vel);
          this.fws.push(f);
        }
        w.callout('strafe_bandits', STRAFE_RADIO.bandits[0], STRAFE_RADIO.bandits[1], 0, 3);
        this.note(`${wave.n} Fw 190s scramble`);
      } else if (wave.at - roundT < 25 && !inc) {
        inc = { pos: from, eta: wave.at - roundT, count: wave.n };
      }
    }
    return inc;
  }

  // Shot-down fighters that reach the ground blow up there
  private wreckFws() {
    this.fws = this.fws.filter((f) => !f.remove);
  }

  // Terrain collision for every aircraft (World's own floor is off down here)
  private collide() {
    const w = this.world;
    for (const a of w.aircraft) {
      if (!(a instanceof Fighter) || a.remove) continue;
      if (!a.alive && !a.falling) continue;
      const gy = this.groundAt(a.pos.x, a.pos.z);
      const clear = a.isPlayer ? 0.9 : a.team === 'axis' ? 2.5 : 1.2;
      if (a.pos.y > gy + clear) continue;
      const at = new THREE.Vector3(a.pos.x, gy + 1, a.pos.z);
      w.effects.explosion(at, new THREE.Vector3(), a.isPlayer || a.team === 'allied' ? 0.7 : 0.9);
      for (let i = 0; i < 14; i++) w.effects.smoke.spawn({ pos: at, vel: _w.set(R() * 14 + a.vel.x * 0.15, 6 + Math.random() * 12, R() * 14 + a.vel.z * 0.15), life: 2.5 + Math.random() * 2, size0: 3, size1: 14, color0: [0.42, 0.36, 0.27], alpha0: 0.8, alpha1: 0, drag: 1.5, rise: 0.3, lit: true });
      sound.play('explosion', at, { gain: 1.4, ref: 200, reverb: 0.7 });
      if (a.isPlayer) {
        if (a.alive) this.crashed = true;
        a.alive = false; a.falling = false;
        a.fm.vel.set(0, 0, 0); a.vel.set(0, 0, 0);
        a.pos.y = gy + 1;
        a.model.visible = false;
        this.note('player hit the ground');
      } else {
        if (a.alive) w.killAircraft(a, a.playerDamage > 0, 'ground');
        a.remove = true;
        this.note(`${a.label} hit the ground (${a.alive ? 'flying' : 'shot down'}, vy ${a.vel.y.toFixed(0)}, ${a === this.wing?.plane ? this.wing.pilot?.cmd ?? '' : this.world.enemyPilot(a)?.state ?? ''}${a === this.wing?.plane ? ' run ' + (this.wingTarget ? this.wingRun?.phase : '-') : ''})`);
      }
    }
  }

  // Low-level feel: ground rush buffet and prop wash, and the PULL UP warning
  private lowFx(dt: number) {
    const w = this.world, pf = w.playerFighter;
    this.warn = 0;
    if (!pf?.alive) return;
    const gy = this.groundAt(pf.pos.x, pf.pos.z);
    const agl = pf.pos.y - gy;
    const vy = pf.vel.y;
    const speed = pf.vel.length();
    // time to impact along the flight path (the slope of the ground ahead included)
    const ahead = this.groundAt(pf.pos.x + pf.vel.x * 2, pf.pos.z + pf.vel.z * 2);
    const sink = -vy + (ahead - gy) / 2;
    const tti = sink > 1 ? agl / sink : Infinity;
    // the pull-out needs more height than is left (with a margin), or impact within ~3 s
    const need = pullOutHeight(_w.copy(pf.vel).setY(-sink), 4.5) * 1.4 + 15;
    if (sink > 4 && (agl < need || tti < 3)) this.warn = THREE.MathUtils.clamp(Math.max(1 - (agl - need * 0.6) / need, (3 - tti) / 2), 0.3, 1);
    if (this.warn > 0) {
      this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = this.warn > 0.7 ? 0.22 : 0.4; beep(this.warn > 0.7 ? 1150 : 900); }
    } else this.beepT = 0;
    // buffet close to the ground at speed
    const low = THREE.MathUtils.clamp(1 - agl / 70, 0, 1) * THREE.MathUtils.clamp((speed - 90) / 80, 0, 1);
    if (low > 0) w.events.shake?.(dt * 1.6 * low);
    // prop wash: dust whipped up off the fields under a Mustang at a few metres
    this.washT -= dt;
    if (agl < 28 && this.washT <= 0) {
      this.washT = 0.05;
      const p = _v.set(pf.pos.x - pf.vel.x * 0.15 + R() * 4, gy + 0.6, pf.pos.z - pf.vel.z * 0.15 + R() * 4);
      w.effects.smoke.spawn({ pos: p, vel: _w.set(pf.vel.x * 0.15 + R() * 3, 2 + Math.random() * 2, pf.vel.z * 0.15 + R() * 3), life: 1.6, size0: 2, size1: 9 * (1 - agl / 28) + 3, color0: [0.5, 0.46, 0.36], alpha0: 0.4 * (1 - agl / 30), alpha1: 0, drag: 1.4, rise: 0.4, lit: true });
    }
  }

  // ---------- scoring ----------
  private onDestroyed(t: GroundTarget, by: Credit) {
    const w = this.world;
    this.destroyed[t.kind] = (this.destroyed[t.kind] ?? 0) + 1;
    this.note(`${t.label} destroyed (${by})`);
    if (by === 'player') {
      this.roundScore += t.score;
      w.stats.kills++;
      this.ui.feed(`${t.label} destroyed — +${t.score}`, 'mine');
      w.events.hitMarker?.(true);
    } else if (by === 'wing') {
      this.ui.feed(`Blue Two got the ${t.label}`, 'mine');
      w.callout('strafe_wingkill', STRAFE_RADIO.wingKill[0], STRAFE_RADIO.wingKill[1], 15, 2);
    }
    if (t.kind === 'loco') w.callout('strafe_loco', STRAFE_RADIO.loco[0], STRAFE_RADIO.loco[1], 0, 3);
    if (t.kind === 'loco' && by === 'player') achievements.unlock('trainBuster'); // achievement hook (FeatWatch.ts)
    if (this.wingTarget === t) this.wingTarget = null;
  }

  // ---------- Blue Two ----------

  // Order 1 with no bandit in front: the live target nearest the leader's nose (within 40 deg / 3 km)
  private wingPick(): boolean {
    const pf = this.world.playerFighter, gt = this.gt;
    if (!pf || !gt) return false;
    const fwd = pf.forward(_f);
    let best: GroundTarget | null = null, bs = Infinity;
    for (const t of gt.list) {
      if (!t.alive) continue;
      const to = _d.copy(t.pos).sub(pf.pos);
      const d = to.length();
      if (d > 3200) continue;
      const ang = THREE.MathUtils.radToDeg(to.divideScalar(d).angleTo(fwd));
      if (ang > 40) continue;
      const s = ang + d / 100 + (t.set === this.roundSet() ? 0 : 25);
      if (s < bs) { bs = s; best = t; }
    }
    this.wingTarget = best;
    this.wingRun ??= new StrafeRun(this.groundAt, 240);
    this.wingRun.reset();
    if (best) this.note(`Blue Two ordered onto ${best.label}`);
    return !!best;
  }

  // Blue Two's strafing passes (true: flown this frame)
  private wingFly(p: WingmanPilot, dt: number): boolean {
    const t = this.wingTarget;
    if (p.cmd !== 'attack' || !t?.alive || !this.wingRun) return false;
    const me = p.me;
    const tp = _w.copy(t.pos).add(_v.set(0, 2, 0));
    const tv = _d.set(Math.sin(t.heading) * t.speed, 0, Math.cos(t.heading) * t.speed);
    const dir = this.wingRun.step(me, tp.clone(), tv.clone(), dt, t.speed > 0 || t.set === 'train' || t.set === 'convoy' ? new THREE.Vector3(Math.cos(t.heading), 0, -Math.sin(t.heading)) : undefined);
    steerTo(me.fm, dir, 1.2, 1);
    me.fm.throttle = 1;
    me.trigger = this.wingRun.fire;
    return true;
  }

  // ---------- HUD ----------
  objective(roundIdx: number, rounds: number): string | null {
    if (!this.active || !this.gt) return null;
    const head = `Round ${roundIdx + 1}/${rounds} · ${['TRAIN BUSTING', 'CONVOY', 'AIRFIELD'][Math.min(2, roundIdx)]}`;
    const set = this.roundSet();
    const list = this.gt.list.filter((t) => t.set === set && t.kind !== 'flak' && t.kind !== 'flaktower');
    const dead = list.filter((t) => !t.alive && t.speed !== -1).length;
    if (roundIdx === 0 && this.train) {
      const loco = this.train.t[0];
      if (loco.alive) return `${head} — locomotive ${((this.train.end - this.train.s) / 1000).toFixed(1)} km from the tunnel`;
      return `${head} — train stopped · ${dead - 1}/${list.length - 1} wagons destroyed`;
    }
    if (roundIdx === 1) return `${head} — ${dead}/${list.length} vehicles destroyed`;
    return `${head} — ${dead}/${list.length} aircraft destroyed on the ground`;
  }

  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.Camera) {
    if (!this.active || !this.gt) return;
    const w = this.world, pf = w.playerFighter;
    ctx.save();
    ctx.font = '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    const set = this.roundSet();
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 170);
    // the round's area: a diamond clamped to the screen edge, with its range
    const area = this.areaCenter(_v);
    const ap = projectMarker(area, cam);
    const behind = !ap.front;
    let x = (ap.x * 0.5 + 0.5) * W, y = (-ap.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - 40; }
    x = THREE.MathUtils.clamp(x, 40, W - 40); y = THREE.MathUtils.clamp(y, 50, H - 50);
    const dist = pf ? Math.hypot(pf.pos.x - area.x, pf.pos.z - area.z) : 0;
    if (dist > 900 || behind) {
      ctx.strokeStyle = 'rgba(255,190,90,0.9)'; ctx.fillStyle = 'rgba(255,200,110,0.95)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 9, y); ctx.closePath(); ctx.stroke();
      ctx.fillText(`${tx(['TRAIN', 'CONVOY', 'AIRFIELD'][Math.min(2, Math.max(0, this.roundIdx))])} ${(dist / 1000).toFixed(1)} km`, x, y + 22);
    }
    // targets of this round within 3.5 km; flak positions that are firing
    for (const t of this.gt.list) {
      if (!t.alive) continue;
      const d = pf ? t.pos.distanceTo(pf.pos) : 0;
      const flak = !!t.gun;
      if (t.set !== set && !(flak && t.gun!.firing)) continue;
      if (d > (flak ? 2600 : 3500) || (!flak && d < 220)) continue;
      _d.copy(t.pos).add(_w.set(0, 4, 0));
      const s = projectMarker(_d, cam);
      if (!s.on || markerAtmosphereAlpha(_d, cam, 3500) <= 0) continue;
      const sx = (s.x * 0.5 + 0.5) * W, sy = (-s.y * 0.5 + 0.5) * H;
      recordMarker('ground-target', null, 'world', sx, sy, _d, t.model ?? this.gt.root, 3500, t.id, t);
      if (flak) {
        ctx.fillStyle = t.gun!.firing ? `rgba(255,90,60,${pulse})` : 'rgba(255,120,90,0.55)';
        ctx.fillRect(sx - 3, sy - 16, 6, 6);
        if (t.gun!.firing && d < 2000) ctx.fillText(tx('FLAK'), sx, sy - 22);
        continue;
      }
      const key = t.kind === 'loco' || (this.wingTarget === t);
      ctx.fillStyle = key ? `rgba(255,220,120,${0.7 + 0.3 * pulse})` : 'rgba(255,200,110,0.8)';
      ctx.beginPath(); ctx.moveTo(sx, sy - 10); ctx.lineTo(sx + 5, sy - 18); ctx.lineTo(sx - 5, sy - 18); ctx.closePath(); ctx.fill();
      if (t.kind === 'loco') ctx.fillText(tx('LOCOMOTIVE'), sx, sy - 24);
      if (this.wingTarget === t) ctx.fillText('2', sx + 12, sy - 12);
    }
    // PULL UP
    if (this.warn > 0) {
      ctx.font = '700 28px "IBM Plex Mono", monospace';
      ctx.fillStyle = `rgba(255,70,50,${0.55 + 0.45 * Math.sin(performance.now() / 70)})`;
      ctx.fillText(tx('PULL UP'), W / 2, H * 0.36);
    }
    // altitude above the ground, next to the sight, when low
    if (pf?.alive) {
      const agl = pf.pos.y - this.groundAt(pf.pos.x, pf.pos.z);
      if (agl < 150) {
        ctx.font = '600 12px "IBM Plex Mono", monospace';
        ctx.fillStyle = agl < 40 ? `rgba(255,120,90,${pulse})` : 'rgba(233,226,207,0.85)';
        ctx.fillText(`${Math.round(agl * 3.281)} ${tx('FT AGL')}`, W / 2, H * 0.36 + 26);
      }
    }
    ctx.restore();
  }
}

// A short warning tone on the effects bus
let beepCtx: AudioContext | null = null;
function beep(freq: number) {
  const ctx = sound.ctx, bus = sound.sfxBus();
  if (!ctx || !bus) return;
  beepCtx = ctx;
  const o = beepCtx.createOscillator(), g = beepCtx.createGain();
  o.type = 'square'; o.frequency.value = freq;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.setValueAtTime(0.07, t + 0.11); g.gain.linearRampToValueAtTime(0, t + 0.13);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + 0.15);
}

// ---------- mission + Special operations tab ----------

export function strafeMission(): Mission {
  return {
    id: 'strafe-pilot', number: 0, title: 'Train Busting', target: 'Rail and road traffic, Normandy', date: 'Normandy, July 1944', role: 'pilot',
    briefing: [
      'Today we go down on the deck. The Germans are moving supplies to the front by rail and road in daylight, and it is our job to stop them. Fly low and fast, and pick your targets.',
      'First a supply train heading east for a tunnel: stop the locomotive before it gets there, then work over the wagons. Then a truck convoy on the road into the village. Last, the Luftwaffe airfield to the north-east, with aircraft parked in the open.',
      'Everything down there shoots back. The 20 mm flak hoses tracer at anything low — keep moving and do not make two passes from the same direction. Watch your height in the dive: the ground does not forgive. Blue Two goes down on your target when you press one.',
    ],
    objectives: ['Stop the train before it reaches the tunnel', 'Shoot up the truck convoy', 'Strafe the aircraft on the airfield', 'Command your wingman: 1 attack my target · 2 cover me'],
    bombers: 0, escorts: 0, waves: [], weather: { sunEl: 44, sunAz: 215, low: 0.32, high: 0.25, contrails: false, mood: 'clear', front: { at: 75, to: 'overcast', preset: 'lightRain', duration: 40 } },
    round: { duration: 360, start: 4, min: 0, max: 0, skill: [1, 1] }, rounds: 3, duration: 360,
    specials: false, boss: false, midRound: false,
    success: 'The rail line is blocked, the convoy is burning and the airfield will not be flying tomorrow. That was flying, Blue Leader.',
  };
}

export const STRAFE_MODE: ModeDef = {
  id: 'strafe', title: 'Train Busting', roles: ['pilot'],
  blurb: 'Special operation — ground attack. Down on the deck over Normandy: stop a supply train before it reaches the tunnel, shoot up a truck convoy and strafe a Luftwaffe airfield, through 20 mm flak and a few Fw 190s. Mind the ground — it does not forgive.',
  mission: () => strafeMission(),
  matches: (m) => m.id === 'strafe-pilot',
  board: (role) => `strafe-${role}`,
};

registerMode(STRAFE_MODE);
