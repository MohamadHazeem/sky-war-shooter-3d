import * as THREE from 'three';
import type { Bomber } from './Aircraft';
import type { Effects } from './Effects';
import { sound } from '../audio/Sound';

// Death drama for a shot-down B-17: over the next few seconds the stricken bomber
// throws secondary blasts off its wing and engines while one wing burns hard.
// Sequences are ticked from World.update so they freeze with the game and cancel
// when the bomber is removed or the world is reset.

const DURATION = 6;          // s, the whole sequence
const FIRE_INTERVAL = 0.1;   // s between extra flame bursts on the burning wing

interface Anchor { x: number; y: number; z: number }

interface Sequence {
  a: Bomber;
  fx: Effects;
  blast: (pos: THREE.Vector3, scale: number) => void;
  side: 1 | -1;                // +1 left wing, -1 right wing (model x sign)
  wingZone: string;
  blasts: { t: number; anchor: Anchor; side: 1 | -1 }[];
  age: number;
  fireAcc: number;
}

const active: Sequence[] = [];
const _p = new THREE.Vector3();
const _loc = new THREE.Vector3();

// Blast points in the bomber's model frame, one side at a time (x > 0 is the left wing)
const ANCHORS: Anchor[] = [
  { x: 6.5, y: -0.15, z: 2.0 },   // outer engine
  { x: 3.0, y: -0.5, z: 2.5 },    // inner engine
  { x: 6.0, y: 0.0, z: 0.2 },     // wing root
  { x: 11.6, y: 0.3, z: -0.9 },   // wingtip
];

const R = () => Math.random() * 2 - 1;

// Schedule 2-3 secondary blasts and set one wing alight. Called from World.killAircraft
// after the bomber has been marked dead. `blast` lets the caller shake the camera.
export function startBomberDeath(a: Bomber, fx: Effects, blast: (pos: THREE.Vector3, scale: number) => void) {
  const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const wingZone = side > 0 ? 'wingL' : 'wingR';
  const wing = a.zone(wingZone);
  if (wing) wing.burning = true;

  const n = 2 + Math.floor(Math.random() * 2);
  const blasts: Sequence['blasts'] = [];
  for (let i = 0; i < n; i++) {
    // spread across the window, with jitter so they never sound metronomic
    const t = (DURATION * (i + 1)) / (n + 1) * (0.75 + Math.random() * 0.5);
    // mostly on the burning wing, sometimes on the other one
    const s: 1 | -1 = Math.random() < 0.75 ? side : (-side as 1 | -1);
    const anchor = ANCHORS[Math.floor(Math.random() * ANCHORS.length)];
    blasts.push({ t: Math.min(DURATION - 0.2, t), anchor, side: s });
  }
  blasts.sort((x, y) => x.t - y.t);

  active.push({ a, fx, blast, side, wingZone, blasts, age: 0, fireAcc: 0 });
}

// Advance every active sequence. Call once per frame from World.update.
export function updateBomberDeath(dt: number) {
  for (let i = active.length - 1; i >= 0; i--) {
    const s = active[i];
    // the bomber was removed (fell out of play or the world was reset): drop the sequence
    if (s.a.remove || !s.a.root.parent) { active.splice(i, 1); continue; }
    const prev = s.age;
    s.age += dt;

    // fierce wing fire: extra flame bursts from the burning wing, on top of the zone trail
    s.fireAcc += dt;
    if (s.fireAcc >= FIRE_INTERVAL && s.age < DURATION) {
      s.fireAcc = 0;
      const z = s.a.zone(s.wingZone);
      if (z) {
        _p.set(z.offset.x + R() * 2.5, z.offset.y + 0.3, z.offset.z + R() * 0.8);
        s.a.localToWorld(_p, _p);
        s.fx.trail(_p, s.a.vel, 1, true, 2.2);
      }
    }

    // secondary blasts whose time has come since the last frame
    for (const b of s.blasts) {
      if (b.t < prev || b.t > s.age) continue;
      const pos = new THREE.Vector3();
      // model-frame anchor, mirrored onto the chosen side, jittered a little
      _loc.set(b.anchor.x * b.side + R() * 0.6, b.anchor.y + R() * 0.3, b.anchor.z + R() * 0.6);
      s.a.localToWorld(_loc, pos);
      const k = 0.45 + Math.random() * 0.4;
      s.fx.explosion(pos, s.a.vel, k);
      s.fx.sparks(pos, s.a.vel, true);
      sound.play('explosion', pos, { gain: 1.1, ref: 120, reverb: 0.6 });
      s.blast(pos, k);
    }

    if (s.age >= DURATION) { active.splice(i, 1); }
  }
}

// Drop all pending sequences (world reset).
export function clearBomberDeath() {
  active.length = 0;
}
