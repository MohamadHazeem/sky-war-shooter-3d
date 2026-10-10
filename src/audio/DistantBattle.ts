import * as THREE from 'three';
import { sound } from './Sound';

// Distant battle ambience: while a mission is on, the rest of the air battle is heard far
// off at irregular intervals. Audio only (nothing is spawned), so it costs no gameplay or
// GPU time. Sources sit 3-8 km away at about the formation's altitude; Sound.play() adds the
// distance lowpass, the reverb send and the speed-of-sound delay, so it arrives late and dull.
// A weighted mix of events, never the same kind three times running:
//   volley   a gunner's short M2 bursts from another box of bombers
//   cannon   a fighter's 20 mm bursts
//   blast    a muffled, pitched-down explosion
//   flak     a barrage: several crumps spread over a couple of seconds
//   rumble   bombs falling on a target far below: overlapping rolling booms
//   drone    an unseen formation or fighter group droning past (engine loop, swelling in and out)
//   dive     a shot-down aircraft's falling whine, sometimes ending in a far explosion
// The busier the score's mood (Music.mood), the closer together the events.

const MIN_DIST = 3000;
const MAX_DIST = 8000;
const GAP: Record<string, [number, number]> = { calm: [7, 15], tension: [5, 12], combat: [3.5, 9], climax: [3, 7] };
const MAX_QUEUE = 24;

type Kind = 'volley' | 'cannon' | 'blast' | 'flak' | 'rumble' | 'drone' | 'dive';
const WEIGHTS: [Kind, number][] = [['volley', 0.3], ['cannon', 0.12], ['blast', 0.16], ['flak', 0.14], ['rumble', 0.08], ['drone', 0.12], ['dive', 0.08]];

interface Shot {
  t: number;                         // seconds until it is played
  name: 'm2far' | 'explosion' | 'explosionFar' | 'flak' | 'cannon' | 'drone' | 'dive';
  off: THREE.Vector3;                // offset from the listener, so floating-origin shifts stay correct
  gain: number;
  rate: number;
  reverb: number;
  radial?: boolean;
  seconds?: number;
}

export class DistantBattle {
  private timer = 2 + Math.random() * 2;
  private queue: Shot[] = [];
  private listener = new THREE.Vector3();
  private at = new THREE.Vector3();
  private drift = new THREE.Vector3();
  private recent: Kind[] = [];

  // Call when a mission starts so the first distant fire follows shortly after takeoff
  reset() {
    this.timer = 2 + Math.random() * 2;
    this.queue.length = 0;
    this.recent.length = 0;
  }

  // Queued shots always drain; new events are only scheduled while a mission is playing
  update(dt: number, cam: THREE.Camera, active: boolean) {
    if (this.queue.length) {
      const L = cam.getWorldPosition(this.listener);
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const s = this.queue[i];
        s.t -= dt;
        if (s.t > 0) continue;
        this.queue.splice(i, 1);
        const p = this.at.copy(s.off).add(L);
        if (s.name === 'drone') {
          // drift sideways across the listener's sky
          this.drift.set(-s.off.z, 0, s.off.x).setLength(1200 + Math.random() * 1500);
          sound.distantDrone(p, this.drift, s.seconds ?? 10, !!s.radial, s.gain);
        } else if (s.name === 'dive') sound.distantWhine(p, s.gain);
        else sound.play(s.name, p, { gain: s.gain, rate: s.rate, reverb: s.reverb, ref: 400 });
      }
    }
    if (!active) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const [g0, g1] = GAP[sound.music.mood] ?? GAP.tension;
    this.timer = g0 + Math.random() * (g1 - g0);
    if (this.queue.length >= MAX_QUEUE - 6) return;
    const L = cam.getWorldPosition(this.listener);
    this.event(this.pickKind(), this.direction(L));
  }

  private pickKind(): Kind {
    const banned = this.recent.length >= 2 && this.recent[0] === this.recent[1] ? this.recent[0] : null;
    const pool = WEIGHTS.filter(([k]) => k !== banned);
    let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
    let kind = pool[0][0];
    for (const [k, w] of pool) { if ((r -= w) <= 0) { kind = k; break; } }
    this.recent.unshift(kind); this.recent.length = Math.min(this.recent.length, 2);
    return kind;
  }

  private push(s: Omit<Shot, 'off'>, off: THREE.Vector3) {
    if (this.queue.length < MAX_QUEUE) this.queue.push({ ...s, off: off.clone() });
  }

  private event(kind: Kind, off: THREE.Vector3) {
    const R = Math.random;
    switch (kind) {
      case 'volley': { // 2-4 bursts from one gun, 0.12-0.32 s apart
        const n = 2 + Math.floor(R() * 3);
        for (let i = 0, t = 0; i < n; i++, t += 0.12 + R() * 0.2) this.push({ t, name: 'm2far', gain: 0.5 * (0.8 + R() * 0.4), rate: 0.95 + R() * 0.1, reverb: 0.6 }, off);
        break;
      }
      case 'cannon': { // a fighter's 20 mm: slower, deeper thuds
        const n = 3 + Math.floor(R() * 3);
        for (let i = 0, t = 0; i < n; i++, t += 0.14 + R() * 0.06) this.push({ t, name: 'cannon', gain: 0.45, rate: 0.85 + R() * 0.1, reverb: 0.7 }, off);
        break;
      }
      case 'blast':
        this.push({ t: 0, name: 'explosion', gain: 1.2, rate: 0.7 + R() * 0.1, reverb: 0.7 }, off);
        break;
      case 'flak': { // a barrage around one point of the sky
        const n = 3 + Math.floor(R() * 4);
        for (let i = 0, t = 0; i < n; i++, t += 0.25 + R() * 0.55) {
          const o = off.clone().add(new THREE.Vector3((R() - 0.5) * 900, (R() - 0.5) * 300, (R() - 0.5) * 900));
          this.push({ t, name: 'flak', gain: 0.8 + R() * 0.4, rate: 0.8 + R() * 0.15, reverb: 0.75 }, o);
        }
        break;
      }
      case 'rumble': { // bombs on a target far below: low, overlapping, slow
        const low = off.clone().setY(-Math.max(2000, this.listener.y - 200));
        const n = 2 + Math.floor(R() * 3);
        for (let i = 0, t = 0; i < n; i++, t += 0.35 + R() * 0.6) this.push({ t, name: 'explosionFar', gain: 1.1, rate: 0.5 + R() * 0.15, reverb: 0.9 }, low);
        break;
      }
      case 'drone':
        this.push({ t: 0, name: 'drone', gain: 0.7 + R() * 0.4, rate: 1, reverb: 0.6, radial: R() < 0.55, seconds: 9 + R() * 8 }, off);
        break;
      case 'dive':
        this.push({ t: 0, name: 'dive', gain: 0.5 + R() * 0.3, rate: 1, reverb: 0.8 }, off);
        if (R() < 0.6) this.push({ t: 3.4 + R() * 0.4, name: 'explosionFar', gain: 0.9, rate: 0.6 + R() * 0.15, reverb: 0.85 }, off.clone().setY(off.y - 900));
        break;
    }
  }

  // Random bearing, 3-8 km out, within a few hundred metres of the listener's altitude
  private direction(L: THREE.Vector3): THREE.Vector3 {
    const a = Math.random() * Math.PI * 2;
    const d = MIN_DIST + Math.random() * (MAX_DIST - MIN_DIST);
    const y = Math.max(1500, L.y + (Math.random() * 2 - 1) * 700) - L.y;
    return new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d);
  }
}
