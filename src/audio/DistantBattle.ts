import * as THREE from 'three';
import { sound } from './Sound';

// Distant battle ambience: while a mission is on, far-off M2 bursts and muffled blasts
// from other parts of the bomber stream reach the player at irregular intervals.
// Audio only (nothing is spawned), so it costs no gameplay or GPU time. Sources sit
// 3-8 km away at about the formation's altitude; Sound.play() adds the distance lowpass,
// the reverb send and the speed-of-sound delay, so the fire arrives late and dulled.

const MIN_DIST = 3000;
const MAX_DIST = 8000;
const MIN_GAP = 4;   // seconds between events
const MAX_GAP = 12;
const MAX_QUEUE = 16;

interface Shot {
  t: number;                         // seconds until it is played
  name: 'm2far' | 'explosion';
  off: THREE.Vector3;                // offset from the listener, so floating-origin shifts stay correct
  gain: number;
  rate: number;
  reverb: number;
}

export class DistantBattle {
  private timer = 2 + Math.random() * 2;
  private queue: Shot[] = [];
  private listener = new THREE.Vector3();
  private at = new THREE.Vector3();

  // Call when a mission starts so the first distant fire follows shortly after takeoff
  reset() {
    this.timer = 2 + Math.random() * 2;
    this.queue.length = 0;
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
        sound.play(s.name, this.at.copy(s.off).add(L), { gain: s.gain, rate: s.rate, reverb: s.reverb, ref: 400 });
      }
    }
    if (!active) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
    if (this.queue.length >= MAX_QUEUE) return;
    const L = cam.getWorldPosition(this.listener);
    const off = this.direction(L);
    if (Math.random() < 0.65) {
      // a short volley of 2-4 bursts from one gun, 0.12-0.32 s apart
      const n = 2 + Math.floor(Math.random() * 3);
      let t = 0;
      for (let i = 0; i < n && this.queue.length < MAX_QUEUE; i++) {
        this.queue.push({ t, name: 'm2far', off: off.clone(), gain: 0.5 * (0.8 + Math.random() * 0.4), rate: 0.95 + Math.random() * 0.1, reverb: 0.6 });
        t += 0.12 + Math.random() * 0.2;
      }
    } else {
      // muffled, slightly pitched-down blast from far off
      this.queue.push({ t: 0, name: 'explosion', off, gain: 1.2, rate: 0.7 + Math.random() * 0.1, reverb: 0.7 });
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
