import { aircraftMarkerAlpha, projectAircraft, projectMarker } from '../ui/MarkerProjection';
import { recordMarker } from '../ui/MarkerAudit';
import * as THREE from 'three';
import type { World } from '../world/World';
import { makeGun, type Fighter } from '../world/Aircraft';
import { EnemyPilot, leadPoint, steerTo, type PilotOverride, type WorldView } from '../world/AI';
import { DogfightAI } from '../world/DogfightAI';
import type { EnemyType } from '../world/EnemyTypes';
import { Atmos } from '../render/Atmosphere';
import { lightConed, Searchlights } from '../render/Searchlights';
import { updateNightExhaust } from '../render/NightExhaust';
import type { UI } from '../ui/UI';
import type { Incoming } from '../ui/Radar';
import type { Mission } from './Missions';
import { registerMode, type ModeDef } from './Modes';
import { tx, isAr, CANVAS_MONO } from '../i18n';

// Role reversal: the P-51 defends an Allied airfield against a German raid (Phase 5 goal 11).
//  * "Defend the Field" (day): Ju 88s (and a Bf 110 or two) fly a straight course for the field
//    with Bf 109s flying high cover; the escorts drop on the Mustangs when they close.
//  * "Night Fighter": the same at night. The raiders show mainly by their exhaust flames and
//    by the ground searchlights that cone them; the K-14 sight is lit; Bf 110 night fighters
//    hunt the intruder from round 2. As each wave closes on the field its pathfinders drop
//    parachute flares over it (Flares.ts: they light the cloud tops and every aircraft below)
//    and green target markers burn on the ground; the AA guns fire up the searchlight cones,
//    their bursts glowing orange in the cloud.
// A bomber that reaches its release point bombs the field; if more than `allowThrough` get
// through over the three rounds the mission fails. Bombers that lose most of their structure
// jettison their load and turn for home. The heavies' rear gunners fire back (RearGunners, run
// by PilotOps for every pilot mission).
//
// PilotOps drives it: start(m) at mission start (active for the missions in RAIDS), direct()
// every frame (returns the round state like PilotOps' scripted rounds), objective() and
// drawOverlay(). Both missions are "Special operations" tabs on the Survival screen (Modes.ts).

export type RaidFrom = 'front' | 'left' | 'right';

export interface RaidGroup {
  at: number;                 // s into the round (afterClear: s after the earlier raiders are settled)
  afterClear?: boolean;
  bombers: EnemyType[];       // 'ju88' | 'bf110'
  escorts?: EnemyType[];      // fighters flying cover (they go for the Mustangs)
  from: RaidFrom;
  skill: number;
  radio?: [string, string];
}

export interface RaidRound { title: string; groups: RaidGroup[]; maxTime: number }

export interface RaidDef {
  night: boolean;
  allowThrough: number;       // bombers that may reach the field over the whole mission
  alt: number;                // m, the raid's height
  speed: number;              // m/s
  rounds: RaidRound[];
}

// Radio (tools/voice/lines.json: speakers "Control" and "Blue Two")
export const RAID_RADIO = {
  r1: ['Control', 'Control to Blue flight: raid inbound, Junkers with fighter cover. Get between them and the airfield!'],
  r2: ['Control', 'Control, second wave: bombers and Messerschmitts on the same heading. Hit the bombers first!'],
  r3: ['Control', 'Control: this is the main raid — everything they\'ve got. Don\'t let them through!'],
  n1: ['Control', 'Control to Blue flight: raiders crossing the coast in the dark. Look for their exhaust flames and the searchlights.'],
  n2: ['Control', 'Control: more of them coming in, with night fighters. The searchlights will find the bombers for you.'],
  n3: ['Control', 'Control: the main stream is inbound. Every one you get is one less over the field!'],
  through: ['Control', 'Bombs on the airfield! Stop the rest of them!'],
  jettison: ['Blue Two', 'He\'s dumped his bombs — he\'s turning for home!'],
  escorts: ['Blue Two', 'Messerschmitts coming down on us — they\'re covering the bombers!'],
  coned: ['Blue Two', 'Searchlights have one coned! Get him while he\'s lit!'],
  flares: ['Control', 'Control: pathfinder flares going down over the field! The bombers will aim on them — get under the flares and you\'ll see them.'],
} as const satisfies Record<string, readonly [string, string]>;

const R = RAID_RADIO;
export const RAIDS: Record<string, RaidDef> = {
  'raid-pilot': {
    night: false, allowThrough: 6, alt: 6500, speed: 98,   // was 92 (docs/BALANCE.md)
    rounds: [
      {
        title: 'Junkers inbound with fighter cover', maxTime: 210,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf109', 'bf109'], from: 'front', skill: 0.9, radio: [...R.r1] },
          { at: 6, afterClear: true, bombers: ['ju88', 'ju88', 'ju88'], from: 'left', skill: 0.95 },
        ],
      },
      {
        title: 'Second wave — bombers and Messerschmitts', maxTime: 220,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88', 'bf110'], escorts: ['bf109', 'bf109'], from: 'front', skill: 1.0, radio: [...R.r2] },
          { at: 6, afterClear: true, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf109', 'bf109'], from: 'right', skill: 1.0 },
        ],
      },
      {
        title: 'The main raid — everything they have', maxTime: 260,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88', 'ju88', 'bf110'], escorts: ['bf109', 'bf109'], from: 'front', skill: 1.05, radio: [...R.r3] },
          { at: 70, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf109'], from: 'left', skill: 1.1 },
          { at: 6, afterClear: true, bombers: ['ju88', 'ju88', 'ju88', 'ju88'], escorts: ['bf109', 'bf109'], from: 'right', skill: 1.1 },
        ],
      },
    ],
  },
  'night-pilot': {
    night: true, allowThrough: 4, alt: 6000, speed: 96,   // was 88 (docs/BALANCE.md: nobody lost the night)
    rounds: [
      {
        title: 'Raiders in the dark — find them by their exhausts', maxTime: 220,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88'], from: 'front', skill: 0.85, radio: [...R.n1] },
          { at: 30, bombers: ['ju88', 'ju88', 'ju88'], from: 'left', skill: 0.9 },
          { at: 6, afterClear: true, bombers: ['ju88', 'ju88'], from: 'right', skill: 0.9 },
        ],
      },
      {
        title: 'More raiders — and night fighters hunting you', maxTime: 230,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf110'], from: 'front', skill: 0.95, radio: [...R.n2] },
          { at: 40, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf110'], from: 'right', skill: 1.0 },
        ],
      },
      {
        title: 'The main bomber stream', maxTime: 260,
        groups: [
          { at: 4, bombers: ['ju88', 'ju88', 'ju88', 'ju88'], escorts: ['bf110'], from: 'front', skill: 1.0, radio: [...R.n3] },
          { at: 35, bombers: ['ju88', 'ju88', 'ju88'], from: 'left', skill: 1.05 },
          { at: 6, afterClear: true, bombers: ['ju88', 'ju88', 'ju88'], escorts: ['bf110'], from: 'front', skill: 1.05 },
        ],
      },
    ],
  },
};

const SPAWN_DIST = 8000;      // m from the field, horizontally
const RELEASE = 700;          // m short of the field the bombs go
const ESCORT_FIGHT = 30;      // s an escort dogfights before he goes back to covering his bombers
const RAIDER_STRUCTURE = 0.8;  // x the variant's structure (was 0.6: a human-level pilot let ~1 through of 6 allowed)
const SCORE_SHORT = 150;      // a bomber downed before it bombed
const SCORE_CLEAN = 250;      // a round with nothing through
const BEARING: Record<RaidFrom, number> = { front: 0, left: 0.65, right: -0.65 };
const UP = new THREE.Vector3(0, 1, 0);
const PF_RANGE = 4800;        // m to go: the pathfinders mark the field when a wave is this close
const PF_FLARES = 6;
const PF_AGAIN = 75;          // s before a later wave's pathfinders mark it again
const AA_CONED = 1.1;          // AA bursts per second around each coned raider
const SPOT_NEAR = 1200;       // m: night, an unlit raider shows on the HUD inside this (1000 tried in BALANCE.md "validation": no clear gain)
const SPOT_FLASH = 6;         // s a bandit stays marked after firing at / being hit by the Mustang
const AA_LOOSE = 0.3;         // ... and unaimed bursts per second around the stream
const MARKER: [number, number, number][] = [[1.2, 7.5, 1.6], [1.2, 7.5, 1.6], [8.5, 1.4, 0.8]];   // green, green, red
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

// Current (floating-origin) position of an absolute point
const local = (abs: THREE.Vector3, out: THREE.Vector3) => out.set(abs.x - Atmos.originOffset.x, abs.y, abs.z - Atmos.originOffset.z);

// ---------- the raiders ----------

// The fighter hit-zone layout only covers the middle of a twin: give the raider its engine
// nacelles (an engine shot out finishes him, as on any fighter) and the outer wing panels
// (hits there wear down the structure), and a broad-phase radius that reaches the tips.
export function fitRaiderZones(f: Fighter) {
  const k = f.model.scale.x;
  let span = 0;
  f.props.forEach((pr, i) => {
    const p = new THREE.Vector3();
    let o: THREE.Object3D | null = pr.node;
    const m = new THREE.Matrix4();
    while (o && o !== f.model) { o.updateMatrix(); m.premultiply(o.matrix); o = o.parent; }
    p.applyMatrix4(m);
    const hp = 150 * 2.2;
    f.zones.push({ name: `nacelle${i + 1}`, offset: new THREE.Vector3(p.x, p.y - 0.1, p.z - 0.9).multiplyScalar(k), radius: 1.15 * k, hp, maxHp: hp, engine: i });
    span = Math.max(span, Math.abs(p.x));
  });
  if (span < 1) return;
  for (const side of [1, -1]) {
    const hp = 260 * 2.2;
    f.zones.push({ name: side > 0 ? 'outerWingL' : 'outerWingR', offset: new THREE.Vector3(side * span * 2.05, -0.15, 0.2).multiplyScalar(k), radius: 2.3 * k, hp, maxHp: hp });
  }
  f.radius = Math.max(f.radius, (span * 2.05 + 2.3) * k);
}

export type RaidResult = 'released' | 'jettisoned' | null;

// A raid bomber: straight and level for its release point, a gentle weave when a fighter sits on
// his tail, bombs on the field, then home. Damaged badly, he jettisons and turns back.
export class RaidBomberPilot extends EnemyPilot {
  result: RaidResult = null;
  readonly course = new THREE.Vector3();   // inbound heading (horizontal unit)
  onRelease: ((p: RaidBomberPilot) => void) | null = null;
  onJettison: ((p: RaidBomberPilot) => void) | null = null;
  private weaveT = 0;
  private gunT = 0;

  constructor(me: Fighter, skill: number, readonly goalAbs: THREE.Vector3, readonly alt: number, readonly speed: number) {
    super(me, 'headon', skill);
    this.dogfightChance = 0;
  }

  get inbound() { return this.result === null; }

  // Horizontal distance left to the release point's line (m; <= 0 once past it)
  toGo(): number {
    const g = local(this.goalAbs, _p);
    return _d.copy(g).sub(this.me.pos).setY(0).dot(this.course);
  }

  update(dt: number, w: WorldView) {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    me.gunAim = null;
    this.timer += dt;
    if (!me.alive) return;
    if (this.inbound && me.structureFrac < 0.35) {
      this.result = 'jettisoned';
      this.state = 'break';
      this.onJettison?.(this);
    }
    const g = local(this.goalAbs, _p);
    let dir: THREE.Vector3;
    if (this.inbound) {
      dir = _d.copy(g).sub(me.pos).setY(0);
      if (dir.lengthSq() < 1) dir.copy(this.course);
      dir.normalize();
      // a fighter in the rear hemisphere, close: weave (the rear gunner gets a better shot too)
      let threat = false;
      for (const a of w.fighters('allied')) {
        if (!a.alive) continue;
        const to = _t.copy(a.pos).sub(me.pos);
        const d = to.length();
        if (d < 700 && to.divideScalar(d).dot(me.forward(_f)) < 0.1) { threat = true; break; }
      }
      this.weaveT += dt * (threat ? 1 : -1);
      this.weaveT = THREE.MathUtils.clamp(this.weaveT, 0, 3);
      if (this.weaveT > 0) dir.applyAxisAngle(UP, Math.sin(this.timer * 1.15) * 0.3 * Math.min(1, this.weaveT) * Math.min(1.2, this.skill));
      if (this.toGo() <= RELEASE) {
        this.result = 'released';
        this.state = 'break';
        this.onRelease?.(this);
      }
    } else {
      // home: back the way he came, slowly climbing away; the turn is flown as a steady bank
      // (never aimed straight behind, which the instructor would fly as a loop)
      dir = _d.copy(this.course).negate();
      const fh = me.forward(_f).setY(0).normalize();
      const ang = fh.angleTo(dir);
      if (ang > 0.7) {
        const cross = fh.x * dir.z - fh.z * dir.x;
        dir.copy(fh).applyAxisAngle(UP, (cross > 0 ? -1 : 1) * 0.7);
      }
    }
    dir.y = THREE.MathUtils.clamp((this.alt - me.pos.y) * 0.004, -0.15, 0.15) + (this.inbound ? 0 : 0.04);
    steerTo(fm, dir, 0.75, this.inbound ? 0.45 : 0.6);
    const want = this.inbound ? this.speed : this.speed * 1.15;
    fm.throttle = THREE.MathUtils.clamp(0.5 + (want - fm.speed) * 0.05, 0.12, 1);
    // the nose gun: a burst when a fighter comes at him head-on
    this.gunT -= dt;
    const pf = w.playerFighter;
    if (pf?.alive && this.gunT <= 0) {
      const to = _t.copy(pf.pos).sub(me.pos);
      const d = to.length();
      if (d < 650 && to.divideScalar(d).dot(me.forward(_f)) > 0.9) {
        const aim = leadPoint(me.pos, me.vel, pf, 760, _r).add(_t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14 / this.skill * w.enemyAimMult));
        me.gunAim = aim.sub(me.pos).normalize().clone();
        me.trigger = true;
        if (Math.random() < dt * 0.8) this.gunT = 1.5;
      }
    }
  }
}

// High cover: an escort flies above and behind his bombers until an Allied fighter comes near,
// then goes for it (the player's Mustang in preference, in a BFM pair with his wingman)
class HighCover implements PilotOverride {
  engaged = false;
  constructor(readonly charges: Fighter[], private off: THREE.Vector3, private onEngage: (p: EnemyPilot, t: Fighter) => void) {}

  fly(p: EnemyPilot, _dt: number, w: WorldView): boolean {
    const me = p.me;
    const charge = this.charges.find((b) => b.alive && (b.ai as RaidBomberPilot | null)?.inbound !== false) ?? null;
    let threat: Fighter | null = null, td = Infinity;
    for (const a of w.fighters('allied')) {
      if (!a.alive) continue;
      // a fighter closing on him, or going for his bombers
      const d = Math.min(a.pos.distanceTo(me.pos) * 1.4, charge ? a.pos.distanceTo(charge.pos) : Infinity);
      if (d < 1500 && d < td) { td = d; threat = a; }
    }
    if (threat || !charge) {
      const pf = w.playerFighter;
      const t = pf?.alive && (!threat || pf.pos.distanceTo(me.pos) < threat.pos.distanceTo(me.pos) * 1.5) ? pf : threat;
      if (t) { this.engaged = true; this.onEngage(p, t); return false; }
    }
    if (!charge) return false;
    const fwd = charge.forward(_f).setY(0).normalize();
    const right = _r.crossVectors(fwd, UP).normalize();
    const pt = _p.copy(charge.pos).addScaledVector(fwd, this.off.z).addScaledVector(right, this.off.x).add(_t.set(0, this.off.y, 0));
    const v = _d.copy(charge.vel).addScaledVector(pt.sub(me.pos), 0.35);
    if (v.length() > 200) v.setLength(200);
    steerTo(me.fm, v, 0.9, 0.6);
    me.fm.throttle = THREE.MathUtils.clamp(0.5 + (v.length() - me.fm.speed) * 0.04, 0.2, 1);
    return true;
  }
}

interface Raider { f: Fighter; p: RaidBomberPilot; round: number; downed: boolean }

// ---------- the director ----------

export class RaidDefence {
  def: RaidDef | null = null;
  private mission: Mission | null = null;
  private anchorAbs = new THREE.Vector3();   // the field (ground), absolute
  private forward = new THREE.Vector3(0, 0, 1);
  private roundIdx = -1;
  private roundDone = false;
  private groupIdx = 0;
  private settledT = 0;          // s since every raider of the round so far was settled
  private pending = 0;
  private bannerDone = false;
  private lastT = 0;
  private raiders: Raider[] = [];
  private escorts = new Map<Fighter, { group: number; round: number; cover: HighCover; settledAt: number; engagedAt: number }>();
  private groupSeq = 0;
  private incomingAbs: THREE.Vector3 | null = null;
  private fires: { abs: THREE.Vector3; t: number }[] = [];
  private blasts: { abs: THREE.Vector3; at: number }[] = [];
  private roundThrough = 0;
  private escortsCalled = false;
  private pfAt = -999;            // world time of the last pathfinder drop
  private pfRound = -1;
  private markers: { abs: THREE.Vector3; col: [number, number, number] }[] = [];
  private aaAcc = 0;
  through = 0;
  shotDown = 0;                  // raid bombers down before they bombed (anyone's kill)
  jettisoned = 0;
  readonly lights: Searchlights<Fighter>;
  log: string[] = [];

  constructor(private world: World, private ui: UI) {
    this.lights = new Searchlights<Fighter>(world.scene, () => this.night && !!world.playerFighter);
  }

  get active() { return !!this.def; }
  get night() { return !!this.def?.night; }

  start(m: Mission) {
    this.def = m.role === 'pilot' ? RAIDS[m.id] ?? null : null;
    this.mission = this.def ? m : null;
    this.lights.clear();
    this.raiders = [];
    this.escorts.clear();
    this.fires = []; this.blasts = [];
    this.markers = []; this.pfAt = -999; this.pfRound = -1; this.aaAcc = 0;
    this.through = this.shotDown = this.jettisoned = 0;
    this.roundIdx = -1;
    this.log = [];
    this.flash = new WeakMap();
    const night = !!this.def?.night;
    this.world.spotted = night ? (a) => this.spotted(a as Fighter) : () => true;
    if (!this.def) return;
    const w = this.world;
    // the field lies under the formation point the Mustang starts at; the raid comes from ahead
    this.anchorAbs.set(w.formationCenter.x + Atmos.originOffset.x, 0, w.formationCenter.z + Atmos.originOffset.z);
    this.forward.copy(w.formationForward).setY(0).normalize();
    if (this.def.night) {
      const sites: THREE.Vector3[] = [];
      const c = local(this.anchorAbs, new THREE.Vector3());
      const right = new THREE.Vector3().crossVectors(this.forward, UP).normalize();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
        const r = 1300 + Math.random() * 2400;
        sites.push(c.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)));
      }
      // a belt of lights under the approach
      for (let i = 0; i < 6; i++) sites.push(c.clone().addScaledVector(this.forward, 2500 + i * 650).addScaledVector(right, (i % 2 ? 1 : -1) * (600 + Math.random() * 1600)));
      this.lights.setup(sites, this.forward);
    }
  }

  // Live raid bombers still heading for the field (the wingman's "bombers" order, searchlights)
  inbound(): Fighter[] { return this.raiders.filter((r) => r.f.alive && r.p.inbound).map((r) => r.f); }
  isRaider(f: Fighter) { return this.raiders.some((r) => r.f === f); }

  private note(s: string) { this.log.push(`${this.world.time.toFixed(0)}s ${s}`); if (this.log.length > 120) this.log.shift(); }

  direct(dt: number, roundIdx: number, roundT: number, playerCredit: (f: Fighter) => boolean): { score: number; incoming: Incoming | null; roundOver: boolean; fail: string | null } {
    const res = { score: 0, incoming: null as Incoming | null, roundOver: false, fail: null as string | null };
    const def = this.def, w = this.world;
    if (!def) return res;
    // the "formation" is the field: hold World's reference point over it (spawns, radar, clean-up)
    const fy = w.formationCenter.y;
    local(this.anchorAbs, w.formationCenter).y = fy;
    if (roundIdx !== this.roundIdx) this.beginRound(roundIdx);
    const r = def.rounds[Math.min(roundIdx, def.rounds.length - 1)];
    if (!this.bannerDone && roundT > (roundIdx === 0 ? 4.2 : 0.4)) {
      this.bannerDone = true;
      this.ui.banner(`ROUND ${roundIdx + 1} · ${def.night ? 'NIGHT RAID' : 'RAID'}`, r.title, 3200);
    }
    if (roundT < this.lastT) this.settledT = 0;
    this.lastT = roundT;
    res.score += this.watchRaiders(playerCredit);
    if (this.night) this.nightFx(dt);
    this.groundFx(dt);
    this.escortsHome();
    if (this.through > def.allowThrough) {
      res.fail = def.night
        ? `${this.through} bombers found the field in the dark. The airfield is burning.`
        : `${this.through} bombers got through and wrecked the airfield.`;
      return res;
    }
    if (this.roundDone) return res;

    const inboundNow = this.raiders.some((x) => x.round === roundIdx && x.f.alive && x.p.inbound);
    this.settledT = inboundNow ? 0 : this.settledT + dt;
    const g = r.groups[this.groupIdx];
    if (g) {
      const since = g.afterClear ? this.settledT : roundT;
      const eta = g.afterClear ? (inboundNow ? null : Math.max(0, g.at - this.settledT)) : Math.max(0, g.at - roundT);
      this.pending += dt;
      const forced = g.afterClear && this.pending > 120;
      if ((eta !== null && since >= g.at) || forced) {
        this.spawnGroup(g, roundIdx);
        this.groupIdx++;
        this.pending = 0;
        this.settledT = 0;
      } else if (eta !== null && eta < 25) {
        if (!this.incomingAbs) { this.incomingAbs = this.spawnPos(g.from, 0); this.incomingAbs.x += Atmos.originOffset.x; this.incomingAbs.z += Atmos.originOffset.z; }
        res.incoming = { pos: local(this.incomingAbs, new THREE.Vector3()), eta, count: g.bombers.length + (g.escorts?.length ?? 0) };
      }
    }
    // round over: every group flown, every raider settled and the escorts gone (or out of time)
    const allSpawned = this.groupIdx >= r.groups.length;
    const escortsUp = [...this.escorts.keys()].some((f) => f.alive && w.activeEnemies().includes(f));
    if ((allSpawned && !inboundNow && !escortsUp && this.settledT > 1.5) || roundT > r.maxTime) {
      if (this.roundThrough === 0) {
        res.score += SCORE_CLEAN;
        this.ui.feed(`Airfield untouched this round — +${SCORE_CLEAN}`, 'mine');
      }
      res.roundOver = true;
      this.roundDone = true;
      this.note(`round ${roundIdx + 1} over: through ${this.through}, down ${this.shotDown}, jettisoned ${this.jettisoned}`);
    }
    return res;
  }

  private beginRound(i: number) {
    this.roundIdx = i;
    this.roundDone = false;
    this.groupIdx = 0;
    this.settledT = 0;
    this.pending = 0;
    this.bannerDone = false;
    this.lastT = 0;
    this.incomingAbs = null;
    this.roundThrough = 0;
    this.escortsCalled = false;
  }

  // Where a group appears: SPAWN_DIST out from the field on its bearing (current coordinates)
  private spawnPos(from: RaidFrom, spread: number): THREE.Vector3 {
    const c = local(this.anchorAbs, new THREE.Vector3());
    const dir = this.forward.clone().applyAxisAngle(UP, BEARING[from] + spread);
    return c.addScaledVector(dir, SPAWN_DIST).setY(this.def!.alt);
  }

  private spawnGroup(g: RaidGroup, round: number) {
    const w = this.world, def = this.def!;
    const base = this.incomingAbs ? local(this.incomingAbs, new THREE.Vector3()).setY(def.alt) : this.spawnPos(g.from, (Math.random() - 0.5) * 0.25);
    this.incomingAbs = null;
    const field = local(this.anchorAbs, new THREE.Vector3());
    const course = field.clone().sub(base).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(course, UP).normalize();
    const bombers: Fighter[] = [];
    // a loose vic (echelons for bigger groups), each ship with its own aiming point on the field
    g.bombers.forEach((type, i) => {
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      const back = Math.ceil(i / 2) * 110;
      const pos = base.clone().addScaledVector(right, side * 130).addScaledVector(course, -back).add(new THREE.Vector3(0, (Math.random() - 0.5) * 40 - Math.ceil(i / 2) * 15, 0));
      const f = w.spawnEnemy(pos, 'headon', g.skill, false, false, type);
      const k = f.model.scale.x;
      // one flexible nose MG instead of the fighter battery
      // a raider is a bomber, not an Ace Hunt heavy: lighter than the Zerstörer-hunting Ju 88
      f.structure = f.maxStructure = f.maxStructure * RAIDER_STRUCTURE;
      fitRaiderZones(f);
      f.guns = [makeGun({ offset: new THREE.Vector3(0, -0.2 * k, 6.2 * k), rate: 10, muzzleVel: 760, damage: 4, spread: 0.012, tracerEvery: 2, tracerColor: [10, 8, 3.5] })];
      const goal = field.clone().addScaledVector(right, side * 140).addScaledVector(course, -back * 0.3);
      goal.x += Atmos.originOffset.x; goal.z += Atmos.originOffset.z; goal.y = 0;
      const p = new RaidBomberPilot(f, g.skill * w.difficulty, goal, def.alt + pos.y - base.y, def.speed);
      p.course.copy(course);
      p.onRelease = (bp) => this.onRelease(bp);
      p.onJettison = (bp) => this.onJettison(bp);
      f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), course);
      f.fm.vel.copy(course).multiplyScalar(def.speed);
      f.vel.copy(f.fm.vel);
      f.ai = p;
      w.setPilot(f, p);
      this.raiders.push({ f, p, round, downed: false });
      bombers.push(f);
    });
    // escorts: high cover above and behind the bombers, in pairs
    const gid = this.groupSeq++;
    let lead: DogfightAI | null = null;
    (g.escorts ?? []).forEach((type, i) => {
      const side = i % 2 ? 1 : -1;
      const off = new THREE.Vector3(side * (220 + 120 * Math.floor(i / 2)), 450 + 60 * i, -250 - 80 * i);
      const pos = base.clone().addScaledVector(right, off.x).addScaledVector(course, off.z).add(new THREE.Vector3(0, off.y, 0));
      const f = w.spawnEnemy(pos, 'high', g.skill, false, false, type);
      f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), course);
      f.fm.vel.copy(course).multiplyScalar(def.speed + 10);
      f.vel.copy(f.fm.vel);
      const p = w.enemyPilot(f);
      if (!p) return;
      p.dogfightChance = 1;   // after a fight they come back for the Mustangs, never idle
      const cover = new HighCover(bombers, off, (pp, t) => this.engage(pp, t, f));
      p.override = cover;
      p.state = 'approach';
      this.escorts.set(f, { group: gid, round, cover, settledAt: Infinity, engagedAt: Infinity });
      // pair them for the BFM: the second of each pair flies cover on the first
      const bfm = new DogfightAI(f, p.skill);
      p.bfm = bfm;
      if (lead) { DogfightAI.pair(lead, bfm); lead = null; } else lead = bfm;
    });
    if (g.radio) w.callout('raid' + round + '_' + this.groupIdx, g.radio[0], g.radio[1], 0, 3);
    this.note(`spawn ${g.bombers.join('/')} + ${(g.escorts ?? []).join('/') || 'no escort'} from ${g.from}`);
  }

  // An escort turns on an Allied fighter
  private engage(p: EnemyPilot, t: Fighter, f: Fighter) {
    p.override = null;
    const e = this.escorts.get(f);
    if (e) e.engagedAt = this.world.time;
    p.target = t; p.state = 'dogfight'; p.timer = 0;
    if (t !== this.world.playerFighter) { p.bfm?.end(); p.bfm = null; }
    if (!this.escortsCalled && this.world.playerFighter?.alive) {
      this.escortsCalled = true;
      const [who, text] = RAID_RADIO.escorts;
      this.world.callout('raid_escorts', who, text, 30, 2);
    }
    this.note(`escort ${f.label} engages ${t.label || 'P-51'}`);
  }

  private onRelease(p: RaidBomberPilot) {
    const w = this.world;
    this.through++;
    this.roundThrough++;
    this.note(`${p.me.label} bombed the field (${this.through}/${this.def!.allowThrough} allowed)`);
    const [who, text] = RAID_RADIO.through;
    w.callout('raid_through', who, text, 14, 3);
    this.ui.feed(`${p.me.label} bombed the airfield — ${this.through} of ${this.def!.allowThrough} allowed`, 'loss');
    // a stick of bombs walking across the field, then fires
    const g = p.goalAbs;
    for (let i = 0; i < 5; i++) {
      const abs = new THREE.Vector3(g.x + p.course.x * (i - 2) * 160 + (Math.random() - 0.5) * 120, 20, g.z + p.course.z * (i - 2) * 160 + (Math.random() - 0.5) * 120);
      this.blasts.push({ abs, at: w.time + 18 + i * 0.35 }); // the bombs take a while to fall 6 km
      if (i % 2 === 0) this.fires.push({ abs: abs.clone(), t: 0 });
    }
  }

  private onJettison(p: RaidBomberPilot) {
    this.jettisoned++;
    this.note(`${p.me.label} jettisoned`);
    if (p.me.lastAttacker === this.world.playerFighter || p.me.lastAttacker?.label === 'Blue Two') {
      const [who, text] = RAID_RADIO.jettison;
      this.world.callout('raid_jett', who, text, 25, 2);
    }
    this.ui.feed(`${p.me.label} jettisoned his bombs`, 'mine');
  }

  // Bombers down before the field: score (player's share) and the tally
  private watchRaiders(credit: (f: Fighter) => boolean): number {
    let pts = 0;
    for (const r of this.raiders) {
      if (r.downed || r.f.alive) continue;
      r.downed = true;
      if (r.p.result !== null) continue; // he had already bombed or turned back
      this.shotDown++;
      if (credit(r.f)) {
        pts += SCORE_SHORT;
        this.ui.feed(`Bomber down short of the field — +${SCORE_SHORT}`, 'mine');
      }
    }
    this.raiders = this.raiders.filter((r) => !r.f.remove);
    return pts;
  }

  // Escorts go home 15 s after the last of their own bombers was settled (down, bombed, jettisoned)
  private escortsHome() {
    const w = this.world;
    for (const [f, e] of this.escorts) {
      if (!f.alive || f.remove) { this.escorts.delete(f); continue; }
      if (e.cover.charges.some((b) => b.alive && (b.ai as RaidBomberPilot | null)?.inbound)) {
        e.settledAt = Infinity;
        // after half a minute of fighting, with nobody on his tail, he goes back to his bombers
        const p = w.enemyPilot(f);
        if (p && (p.state === 'dogfight' || p.state === 'evade') && e.engagedAt === Infinity) e.engagedAt = w.time; // jumped (EnemyPilot)
        if (p && !p.override && p.state !== 'withdraw' && w.time - e.engagedAt > ESCORT_FIGHT
          && !w.fighters('allied').some((a) => a.alive && a.pos.distanceTo(f.pos) < 900)) {
          p.bfm?.end(); p.bfm = null;
          p.target = null; p.state = 'approach'; p.timer = 0;
          p.override = e.cover;
          e.engagedAt = Infinity;
          this.note(`escort ${f.label} rejoins his bombers`);
        }
        continue;
      }
      if (e.settledAt === Infinity) e.settledAt = w.time;
      if (w.time - e.settledAt < 15) continue;
      const p = w.enemyPilot(f);
      if (!p || p.state === 'withdraw') continue;
      p.bfm?.end(); p.bfm = null; p.override = null;
      p.state = 'withdraw'; p.timer = 0;
      p.breakDir.copy(f.pos).sub(local(this.anchorAbs, _p)).setY(0).normalize().setY(0.05).normalize();
      this.note(`escort ${f.label} heads home`);
    }
  }

  // Night: which enemies the player can make out (HUD brackets, radar, padlock, lead pip and the
  // autoplay bot all ask World.spotted). A raider held in the searchlights, anything within
  // SPOT_NEAR, anything whose guns flashed at the Mustang or that the Mustang hit in the last
  // SPOT_FLASH s. The rest is dark: exhaust flames in the 3D view, nothing on the HUD.
  private flash = new WeakMap<Fighter, number>();
  spotted(f: Fighter): boolean {
    const w = this.world, pf = w.playerFighter;
    if (!this.night || f.team !== 'axis') return true;
    if (this.lights.coned.has(f)) return true;
    if (pf && f.pos.distanceTo(pf.pos) < SPOT_NEAR) return true;
    if (w.time - f.lastPlayerHit < SPOT_FLASH) return true;
    return w.time - (this.flash.get(f) ?? -99) < SPOT_FLASH;
  }

  // Searchlights, coned raiders lit up, exhaust flames
  private coneCall = -99;
  private nightFx(dt: number) {
    const w = this.world;
    const inbound = this.inbound();
    this.lights.update(dt, inbound);
    lightConed(this.lights, w.effects);   // the beams light the raider's belly
    for (const f of this.lights.coned) {
      // the raider caught in the beams: a silvery sheen around him
      w.effects.glow.spawn({ pos: f.pos, vel: f.vel, life: 0.07, size0: 26 * f.model.scale.x / 4.5, size1: 30 * f.model.scale.x / 4.5, color0: [1.4, 1.5, 1.8], alpha0: 0.22, alpha1: 0, frame: 1 });
      if (w.time - this.coneCall > 35 && w.playerFighter?.alive && f.pos.distanceTo(w.playerFighter.pos) < 5000) {
        this.coneCall = w.time;
        const [who, text] = RAID_RADIO.coned;
        w.callout('raid_coned', who, text, 30, 2);
      }
    }
    // muzzle flashes aimed at the Mustang give a bandit away
    const pf = w.playerFighter;
    if (pf) for (const f of w.fighters('axis')) if (f.alive && f.trigger && w.enemyPilot(f)?.target === pf) this.flash.set(f, w.time);
    const flames = w.fighters('axis').concat(w.fighters('allied').filter((a) => !a.isPlayer));
    updateNightExhaust(flames, w.effects.glow, 1);
    this.pathfinders(inbound);
    this.antiAircraft(dt, inbound);
  }

  // A wave closing on the field: its pathfinders mark it with parachute flares and ground markers
  private pathfinders(inbound: Fighter[]) {
    const w = this.world, def = this.def!;
    if (w.time - this.pfAt < PF_AGAIN || w.effects.flares.burning > 2) return;
    let lead: RaidBomberPilot | null = null;
    for (const r of this.raiders) if (r.f.alive && r.p.inbound && r.p.toGo() < PF_RANGE && (!lead || r.p.toGo() < lead.toGo())) lead = r.p;
    if (!lead || !inbound.length) return;
    this.pfAt = w.time;
    const field = local(this.anchorAbs, _p);
    const course = lead.course;
    const right = _r.crossVectors(course, UP).normalize();
    // a loose cluster over the field, a little upwind of the aiming point
    for (let i = 0; i < PF_FLARES; i++) {
      const a = (i / PF_FLARES) * Math.PI * 2 + Math.random() * 0.6;
      const rr = 180 + Math.random() * 520;
      _t.copy(field).addScaledVector(course, -250 + Math.cos(a) * rr).addScaledVector(right, Math.sin(a) * rr);
      _t.y = def.alt - 250 + Math.random() * 220;   // just under the stream, over the cloud tops
      w.effects.flares.drop(_t, _d.copy(course).multiplyScalar(def.speed));
    }
    if (!this.markers.length) {
      // target markers burning on the field: two green, one red, for the main force to bomb on
      for (let i = 0; i < MARKER.length; i++) {
        const abs = new THREE.Vector3(this.anchorAbs.x + (Math.random() - 0.5) * 380, 10, this.anchorAbs.z + (Math.random() - 0.5) * 380);
        this.markers.push({ abs, col: MARKER[i] });
      }
    }
    if (this.pfRound !== this.roundIdx) {
      this.pfRound = this.roundIdx;
      const [who, text] = RAID_RADIO.flares;
      w.callout('raid_flares', who, text, 20, 3);
    }
    this.note(`pathfinder flares over the field (${PF_FLARES})`);
  }

  // The guns round the field fire up the searchlight cones (and, less aimed, into the stream):
  // heavy bursts with no fragments (gameplay is the fighters' job), glowing orange in the cloud
  private antiAircraft(dt: number, inbound: Fighter[]) {
    const w = this.world, pf = w.playerFighter;
    const coned = Math.min(3, this.lights.coned.size);
    this.aaAcc += dt * (coned * AA_CONED + (inbound.length ? AA_LOOSE : 0));
    let guard = 4;
    while (this.aaAcc >= 1 && guard-- > 0) {
      this.aaAcc -= 1;
      let target: Fighter | null = null, k = 0;
      const pickConed = coned > 0 && Math.random() < (coned * AA_CONED) / (coned * AA_CONED + AA_LOOSE);
      if (pickConed) {
        const n = Math.floor(Math.random() * this.lights.coned.size);
        for (const f of this.lights.coned) { if (k++ === n) { target = f; break; } }
      } else if (inbound.length) target = inbound[Math.floor(Math.random() * inbound.length)];
      if (!target) continue;
      const spread = pickConed ? 90 + Math.random() * 200 : 250 + Math.random() * 450;
      _t.set(Math.random() - 0.5, (Math.random() - 0.45) * 0.6, Math.random() - 0.5).normalize().multiplyScalar(spread).add(target.pos);
      _t.addScaledVector(target.vel, 0.4 + Math.random() * 0.8);   // the gunners lead him, not always enough
      if (pf && _t.distanceTo(pf.pos) < 180) continue;               // never in the player's face
      w.flakBurst(_t);
    }
    if (this.aaAcc > 2) this.aaAcc = 2;
  }

  // Bomb bursts on the field and the fires they leave
  private fxTick = 0;
  private groundFx(_dt: number) {
    const w = this.world;
    this.fxTick++;
    for (const b of this.blasts) {
      if (w.time < b.at) continue;
      b.at = Infinity;
      const p = local(b.abs, new THREE.Vector3());
      w.effects.glow.spawn({ pos: p, vel: new THREE.Vector3(), life: 0.5, size0: 90, size1: 260, color0: [16, 8, 2.5], alpha0: 1, alpha1: 0, frame: 1 });
      w.effects.explosion(p, new THREE.Vector3(), 3);
    }
    this.blasts = this.blasts.filter((b) => b.at !== Infinity);
    if (this.fxTick % 3) return;
    for (const m of this.markers) {
      const p = local(m.abs, _p);
      p.x += (Math.random() - 0.5) * 12; p.z += (Math.random() - 0.5) * 12; p.y = 8 + Math.random() * 10;
      w.effects.glow.spawn({ pos: p, vel: _t.set(0, 3, 0), life: 0.4 + Math.random() * 0.2, size0: 34, size1: 46, color0: m.col, alpha0: 0.95, alpha1: 0, frame: 1 });
    }
    for (const f of this.fires) {
      f.t += 3 / 60;
      const p = local(f.abs, _p);
      p.x += (Math.random() - 0.5) * 40; p.z += (Math.random() - 0.5) * 40; p.y = 15 + Math.random() * 20;
      w.effects.glow.spawn({ pos: p, vel: _t.set(0, 6, 0), life: 0.5 + Math.random() * 0.4, size0: 45, size1: 70, color0: [9, 3.5, 0.8], color1: [2, 0.4, 0.05], alpha0: 0.9, alpha1: 0, frame: 2, rotVel: 0.5 });
    }
  }

  objective(roundIdx: number, rounds: number): string | null {
    const def = this.def;
    if (!def) return null;
    const head = `Round ${roundIdx + 1}/${rounds} · ${def.night ? 'NIGHT RAID' : 'RAID'}`;
    const inb = this.raiders.filter((r) => r.f.alive && r.p.inbound);
    const tally = `${this.through}/${def.allowThrough} through`;
    if (!inb.length) {
      const r = def.rounds[Math.min(roundIdx, def.rounds.length - 1)];
      return `${head} — ${this.groupIdx < r.groups.length ? 'more raiders inbound' : 'sky clear'} · ${tally}`;
    }
    const near = Math.min(...inb.map((r) => Math.max(0, r.p.toGo())));
    return `${head} — ${inb.length} bomber${inb.length === 1 ? '' : 's'} inbound, nearest ${(near / 1000).toFixed(1)} km from the field · ${tally}`;
  }

  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, cam: THREE.Camera) {
    const def = this.def, w = this.world;
    if (!def) return;
    const pf = w.playerFighter;
    ctx.save();
    ctx.font = isAr() ? `600 12px ${CANVAS_MONO}` : '600 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
    // the field
    const fp = projectMarker(local(this.anchorAbs, _p), cam);
    if (fp.front) {
      const x = THREE.MathUtils.clamp((fp.x * 0.5 + 0.5) * W, 40, W - 40), y = THREE.MathUtils.clamp((-fp.y * 0.5 + 0.5) * H, 40, H - 40);
      ctx.strokeStyle = 'rgba(140,210,255,0.85)'; ctx.fillStyle = 'rgba(140,210,255,0.9)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 9, y); ctx.lineTo(x, y + 9); ctx.lineTo(x - 9, y); ctx.closePath(); ctx.stroke();
      const dist = pf ? Math.hypot(pf.pos.x - (this.anchorAbs.x - Atmos.originOffset.x), pf.pos.z - (this.anchorAbs.z - Atmos.originOffset.z)) : 0;
      ctx.fillText(tx(`AIRFIELD ${(dist / 1000).toFixed(1)} km`), x, y + 22);
    }
    // the raiders: day, always; night, only when coned or close
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 170);
    for (const r of this.raiders) {
      if (!r.p.inbound || aircraftMarkerAlpha(r.f, w, cam) <= 0) continue;
      const coned = this.lights.coned.has(r.f);
      if (def.night && !this.spotted(r.f)) continue;
      const s = projectAircraft(r.f, cam);
      if (!s.on) continue;
      const x = (s.x * 0.5 + 0.5) * W, y = (-s.y * 0.5 + 0.5) * H;
      recordMarker('raid-raider', r.f, 'world', x, y);
      ctx.globalAlpha = aircraftMarkerAlpha(r.f, w, cam);
      const near = r.p.toGo() < 2000;
      ctx.fillStyle = near ? `rgba(255,80,60,${pulse})` : coned ? 'rgba(220,235,255,0.95)' : 'rgba(255,170,90,0.9)';
      ctx.beginPath(); ctx.moveTo(x, y - 26); ctx.lineTo(x + 6, y - 36); ctx.lineTo(x - 6, y - 36); ctx.closePath(); ctx.fill();
      ctx.fillText(tx(`${coned ? 'CONED · ' : ''}${(Math.max(0, r.p.toGo()) / 1000).toFixed(1)} km TO FIELD`), x, y - 42);
    }
    ctx.restore();
  }
}

// ---------- missions + Special operations tabs ----------

const RAID_OBJECTIVES = (def: RaidDef) => [
  'Shoot down the bombers before they reach the airfield',
  `Let no more than ${def.allowThrough} bombers through in three rounds`,
  'Command your wingman: 1 attack · 2 cover · 3 bombers · 4 form up',
];

export function raidMission(): Mission {
  const def = RAIDS['raid-pilot'];
  return {
    id: 'raid-pilot', number: 0, title: 'Defend the Field', target: 'Advanced Landing Ground, Normandy', date: 'Normandy, June 1944', role: 'pilot',
    briefing: [
      'For once the boot is on the other foot. The Luftwaffe is coming for us: Junkers 88s with Messerschmitt cover, straight in at the advanced landing ground where your group is based.',
      'They will fly a straight course for the field. Every bomber you bring down short of it is one stick of bombs that does not fall on our aircraft. If more than six of them get through, there will be no field to come home to.',
      'Take Blue Two with you. Keys one to four give him his orders: attack my target, cover me, go for the bombers, form up. Watch the rear gunners on the Junkers — come in from below.',
    ],
    objectives: RAID_OBJECTIVES(def),
    bombers: 0, escorts: 0, waves: [], weather: { preset: 'lightRain', sunEl: 38, sunAz: 200, low: 0.35, high: 0.35, contrails: true, mood: 'clear' },
    round: { duration: 540, start: 4, min: 2, max: 6, skill: [0.9, 1.1] }, rounds: 3, duration: 540,
    success: 'The raid is broken. The field is still ours — the ground crews are already filling in the craters. Outstanding work, Blue Leader.',
  };
}

export function nightMission(): Mission {
  const def = RAIDS['night-pilot'];
  return {
    id: 'night-pilot', number: 0, title: 'Night Fighter', target: 'Airfields in southern England', date: 'Operation Steinbock, February 1944', role: 'pilot',
    briefing: [
      'The Baby Blitz. Every few nights the Junkers come back across the Channel in the dark, and tonight they are after the airfields.',
      'You will not see them until you are close. Look for the exhaust flames — they show for miles — and watch the searchlights: when the beams cone a bomber, go for him while he is lit. Their pathfinders will mark the field with parachute flares, and anything flying under them is lit up, the bombers included. Your gunsight lamp is turned up for the night.',
      'From the second wave they are sending Messerschmitt 110 night fighters ahead of the bombers. If more than four bombers get through to the field, we have lost the night.',
    ],
    objectives: RAID_OBJECTIVES(def),
    bombers: 0, escorts: 0, waves: [], weather: { sunEl: 26, sunAz: 140, low: 0.55, high: 0.22, contrails: false, mood: 'night' },   // scattered cloud for the flares and flak to light
    round: { duration: 540, start: 4, min: 2, max: 6, skill: [0.85, 1.05] }, rounds: 3, duration: 540,
    success: 'Dawn over the field, and every runway still in use. The Junkers will think twice about coming back. Good hunting, Blue Leader.',
  };
}

export const RAID_MODE: ModeDef = {
  id: 'raid', title: 'Defend the Field', roles: ['pilot'],
  blurb: 'Special operation — role reversal. The Luftwaffe raids your airfield: Ju 88s on a straight course for the field, Bf 109s flying cover. Bring the bombers down before they reach it, with Blue Two on your wing. Three rounds; more than six through and the field is lost.',
  mission: () => raidMission(),
  matches: (m) => m.id === 'raid-pilot',
  board: (role) => `raid-${role}`,
};

export const NIGHT_MODE: ModeDef = {
  id: 'night', title: 'Night Fighter', roles: ['pilot'],
  blurb: 'Special operation — night defence. Junkers raid the airfields in the dark: find them by their exhaust flames and the searchlight cones, under a lit gunsight. Bf 110 night fighters hunt you from the second wave. Three rounds; more than four through and the night is lost.',
  mission: () => nightMission(),
  matches: (m) => m.id === 'night-pilot',
  board: (role) => `night-${role}`,
};

registerMode(RAID_MODE);
registerMode(NIGHT_MODE);
