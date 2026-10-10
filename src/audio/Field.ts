import type * as THREE from 'three';
import { sound, type LoopEmitter } from './Sound';
import { bellLevel, scrapeMix } from './Acoustics';

// Airfield sounds of the take-off / landing scenes (Bookends.ts), on top of the synthesised buffers
// of SynthField.ts: touchdown (both main wheels chirping, the oleos thumping), the belly landing
// (impact, then a grinding slide with sparks and rumble faded by speed), the Very pistol (pop, then
// the flare's hiss riding up with it), and the crash crews' bells moving with their vehicles.
// Every call is a no-op without sound (no AudioContext) or before the buffers are built: emitters
// are created lazily and retried on later frames, so the scenes never depend on audio.
// Audio detail Reduced (DetailCaps.fieldLayers false): no gear thump, the slide is the grind alone,
// only the fire tender and the first ambulance ring.

export type CrewVehicle = 'fire' | 'crash' | 'ambulance';
export interface FlareLike { p: THREE.Vector3; v: THREE.Vector3; life: number }

const live = (e: LoopEmitter | null | undefined, make: () => LoopEmitter | null) => (e?.alive ? e : make());

export class FieldSounds {
  private grind: LoopEmitter | null = null;
  private sparks: LoopEmitter | null = null;
  private rumble: LoopEmitter | null = null;
  private slid = false;      // the slide has come to rest: no more scrape this scene
  private hiss = new Map<object, LoopEmitter | null>();
  private bells = new Map<object, { em: LoopEmitter | null; still: number; idx: number; kind: CrewVehicle; done: boolean }>();
  private seen = new Set<object>();

  /** Build the buffers (lazy, idle slices); call early (briefing) so the take-off has its engines. */
  prepare() { sound.prepareField(); }

  /** Wheels (or belly) on the runway. hard: the rough landing's heavier arrival (and its bounce). */
  touchdown(pos: THREE.Vector3, belly: boolean, hard = false) {
    const layers = sound.detailCaps.fieldLayers;
    if (belly) {
      sound.play('bellyImpact', pos, { gain: 0.95 });
      if (layers) sound.play('gearThump', pos, { gain: 0.9, rate: 0.7 });
      return;
    }
    if (sound.fieldBuffer('tyreChirp')) sound.play('tyreChirp', pos, { gain: hard ? 1.15 : 0.85, rate: hard ? 0.94 : 1 });
    else sound.play('hitHeavy', pos, { gain: 0.5, rate: 0.7 });   // not built yet: the old stand-in
    if (layers) sound.play('gearThump', pos, { gain: hard ? 1.1 : 0.65 });
  }

  /** Belly slide, every frame while she is on her belly (speed in m/s; fades out and ends at rest). */
  scrape(pos: THREE.Vector3, vel: THREE.Vector3, speed: number) {
    if (this.slid) return;
    const m = scrapeMix(speed);
    if (m.grind + m.sparks + m.rumble < 0.004) { this.slid = true; this.stopScrape(0.8); return; }
    const opts = { ref: 45, reverb: 0.5 };
    this.grind = live(this.grind, () => sound.emitter('scrapeGrind', opts));
    this.grind?.update(pos, vel, 0.85 * m.grind, m.rate, m.lp);
    if (!sound.detailCaps.fieldLayers) { this.sparks?.stop(0.3); this.rumble?.stop(0.3); this.sparks = this.rumble = null; return; }
    this.sparks = live(this.sparks, () => sound.emitter('scrapeSparks', { ref: 30, reverb: 0.4 }));
    this.sparks?.update(pos, vel, 0.55 * m.sparks, 0.9 + 0.2 * m.rate);
    this.rumble = live(this.rumble, () => sound.emitter('scrapeRumble', { ref: 60, reverb: 0.6 }));
    this.rumble?.update(pos, vel, 0.75 * m.rumble, 0.85 + 0.2 * m.rate);
  }

  private stopScrape(fade: number) {
    for (const e of [this.grind, this.sparks, this.rumble]) e?.stop(fade);
    this.grind = this.sparks = this.rumble = null;
  }

  /** A Very pistol fired from the cockpit roof. */
  flarePop(pos: THREE.Vector3) { sound.play('flarePop', pos, { gain: 1.3 }); }

  /** The live flares (every frame): each one's hiss rides up with it and fades as it burns out. */
  flares(list: readonly FlareLike[]) {
    this.seen.clear();
    for (const f of list) {
      this.seen.add(f);
      let e = this.hiss.get(f);
      // a hiss starts only while the flare is young (a buffer that arrives late stays out)
      if (!e && f.life > 3.4) e = sound.emitter('flareHiss', { ref: 22, reverb: 0.5 });
      this.hiss.set(f, e ?? null);
      e?.update(f.p, f.v, 1.1 * Math.min(1, Math.max(0, f.life / 1.2)));
    }
    for (const [k, e] of this.hiss) if (!this.seen.has(k)) { e?.stop(0.25); this.hiss.delete(k); }
  }

  /** A crash-crew vehicle racing out (every frame): its bell moves with it (Doppler included). */
  vehicle(key: object, kind: CrewVehicle, pos: THREE.Vector3, vel: THREE.Vector3, speed: number, dt: number) {
    let b = this.bells.get(key);
    if (!b) {
      const idx = [...this.bells.values()].filter((x) => x.kind === kind).length;
      b = { em: null, still: 0, idx, kind, done: false };
      this.bells.set(key, b);
    }
    // Reduced: the fire tender's bell and one ambulance only
    if (!sound.detailCaps.fieldLayers && (kind === 'crash' || b.idx > 0)) { b.em?.stop(0.3); b.em = null; return; }
    b.still = speed > 1.5 ? 0 : b.still + dt;
    const lvl = bellLevel(speed, b.still);
    if (lvl <= 0.001) { if (b.em) { b.em.stop(0.4); b.em = null; } b.done = speed <= 4; return; }
    if (b.done && speed <= 4) return;
    b.done = false;
    const amb = kind === 'ambulance';
    b.em = live(b.em, () => sound.emitter(amb ? 'ambulanceBell' : 'fireBell', { ref: amb ? 16 : 22, reverb: 0.45, variant: kind === 'crash' ? 1 : amb ? b!.idx : 0 }));
    b.em?.update(pos, vel, (amb ? 0.7 : 1) * lvl);
  }

  /** End of a scene (or skip): everything fades out. */
  stopAll(fade = 0.3) {
    this.stopScrape(fade);
    for (const e of this.hiss.values()) e?.stop(fade);
    for (const b of this.bells.values()) b.em?.stop(fade);
    this.hiss.clear(); this.bells.clear();
    this.slid = false;
  }
}
