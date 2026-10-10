import * as THREE from 'three';
import { EscortPilot, leadPoint, steerTo, WorldView } from '../world/AI';
import { Aircraft, Fighter } from '../world/Aircraft';
import type { World } from '../world/World';

// "Call the Mustangs": a flight of P-51s dives in from high above, sweeps the fighters around
// the player's aircraft for a while, then climbs away and is removed. Each one is an ordinary
// allied fighter flown by an EscortPilot (World.spawnEscort already cuts escort gun damage, so
// they break up attacks without stealing every kill); this subclass only decides *which*
// bandits it goes after (the ones near the player) and adds the dive-in and climb-out legs.

export const SWEEP_TIME = 20;    // seconds over the player before climbing out
const SWEEP_RADIUS = 2600;       // only bandits this close to the player are engaged
const RETARGET = 1.2;            // seconds between target re-picks
const FIRE_RANGE = 650;          // a little looser than the stock escort (500 m, 2 deg) so the
const FIRE_COS = Math.cos(0.06); // sweep visibly breaks up attacks; its rounds still hit for 30%

const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _lead = new THREE.Vector3();

type Phase = 'inbound' | 'sweep' | 'egress';

export class SweepPilot extends EscortPilot {
  phase: Phase = 'inbound';
  private phaseT = 0;
  private retarget = 0;
  private climbSide: number;

  constructor(me: Fighter, private world: World, private anchor: () => Aircraft | null, private sweepTime = SWEEP_TIME) {
    super(me, new THREE.Vector3(0, 250, 0));
    this.climbSide = Math.random() < 0.5 ? -1 : 1;
  }

  // Where the flight is protecting: the player's aircraft (bomber or Mustang), else the box
  private anchorPos(w: WorldView): THREE.Vector3 {
    const a = this.anchor();
    return a && a.alive ? a.pos : w.formationCenter;
  }

  // Nearest live bandit to the anchor, within the sweep radius. Loops the world's aircraft
  // directly (World.fighters() builds a new array every call).
  private pickNearAnchor(at: THREE.Vector3): Fighter | null {
    let best: Fighter | null = null, bd = SWEEP_RADIUS * SWEEP_RADIUS;
    for (const a of this.world.aircraft) {
      if (a.team !== 'axis' || !a.alive || a.remove || !(a instanceof Fighter)) continue;
      const d = a.pos.distanceToSquared(at);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  egress() { if (this.phase !== 'egress') { this.phase = 'egress'; this.phaseT = 0; this.target = null; } }

  update(dt: number, w: WorldView) {
    const me = this.me, fm = me.fm;
    me.trigger = false;
    if (!me.alive) return;
    this.phaseT += dt;
    const at = this.anchorPos(w);
    switch (this.phase) {
      case 'inbound': {
        // diving in on the player: aim a little above him, full power
        const tgt = this.pickNearAnchor(at);
        const toAnchor = _d.copy(at).sub(me.pos);
        const dist = toAnchor.length();
        if ((tgt && tgt.pos.distanceTo(me.pos) < 1400) || dist < 800 || this.phaseT > 10) {
          this.phase = 'sweep'; this.phaseT = 0; this.retarget = 0;
          break;
        }
        toAnchor.y += 120;
        steerTo(fm, toAnchor, 1.1, 1);
        fm.throttle = 1;
        break;
      }
      case 'sweep': {
        if (this.phaseT >= this.sweepTime) { this.egress(); break; }
        this.retarget -= dt;
        if (this.retarget <= 0 || !this.target || !this.target.alive) {
          this.retarget = RETARGET;
          this.target = this.pickNearAnchor(at);
        }
        if (this.target) {
          // EscortPilot flies the lead pursuit and fires; timer = 0 keeps it on our target
          this.timer = 0;
          super.update(dt, w);
          const t = this.target;
          if (!me.trigger && t && t.pos.distanceToSquared(me.pos) < FIRE_RANGE * FIRE_RANGE) {
            leadPoint(me.pos, me.vel, t, 880, _lead).sub(me.pos).normalize();
            if (me.forward(_t).dot(_lead) > FIRE_COS) me.trigger = true;
          }
        } else {
          // nothing near the player: weave above him until something shows up
          const s = Math.sin(this.phaseT * 0.5 + me.id);
          _t.copy(at).addScaledVector(w.formationForward, 500).add(_side.set(s * 300, 260, 0));
          const dir = _d.copy(_t).sub(me.pos);
          steerTo(fm, dir, 0.9, 0.7);
          fm.throttle = 0.85;
        }
        break;
      }
      case 'egress': {
        // pull up and away, rocking off to one side; removed once well clear
        _side.crossVectors(w.formationForward, _up).multiplyScalar(this.climbSide * 0.5);
        const dir = _d.copy(w.formationForward).add(_side).addScaledVector(_up, 0.7);
        steerTo(fm, dir, 1, 0.8);
        fm.throttle = 1;
        if (this.phaseT > 12 || (this.phaseT > 4 && me.pos.distanceTo(at) > 3200)) me.remove = true;
        break;
      }
    }
    // never follow a bandit down into the cloud deck
    if (me.pos.y < 4800) steerTo(fm, _d.copy(me.forward(_t)).setY(0).normalize().add(_t.set(0, 0.8, 0)), 1.2, 1);
  }
}

// Spawn the flight: count P-51s strung out high above and behind the anchor, nosed down at it
export function spawnSweep(world: World, anchor: () => Aircraft | null, count: number, sweepTime = SWEEP_TIME): SweepPilot[] {
  const a = anchor();
  const center = a && a.alive ? a.pos : world.formationCenter;
  const fwd = world.formationForward;
  const right = _side.crossVectors(fwd, _up).normalize();
  const out: SweepPilot[] = [];
  for (let i = 0; i < count; i++) {
    const lat = (i - (count - 1) / 2) * 90;
    const pos = center.clone().addScaledVector(fwd, -1300 - i * 60).addScaledVector(right, lat);
    pos.y += 1500 + i * 30;
    const f = world.spawnEscort(pos, new THREE.Vector3(0, 250, 0));
    // nose down onto the anchor, already fast from the dive
    const dir = _d.copy(center).sub(pos).normalize();
    f.root.quaternion.setFromUnitVectors(_t.set(0, 0, 1), dir);
    f.fm.vel.copy(dir).multiplyScalar(190);
    f.vel.copy(f.fm.vel);
    f.label = 'P-51D';
    // the called-in sweep hits harder than the regular escort (still 70% of a full P-51)
    for (const g of f.guns) g.damage *= 2.3;
    const p = new SweepPilot(f, world, anchor, sweepTime);
    world.setPilot(f, p);
    out.push(p);
  }
  return out;
}
