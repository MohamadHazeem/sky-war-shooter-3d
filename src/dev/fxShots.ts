import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN } from '../game/Missions';
import { applyWeather, type Weather } from '../render/Weather';
import { Atmos } from '../render/Atmosphere';

// Development-only: fixed captures for Effects 2.0 (docs/phase10/06-effects.md), same camera,
// seed and timing before and after. Nothing imports it; from the dev server's console:
//   const s = await import('/src/dev/fxShots.ts'); const fx = s.install();
//   await fx.capture('after')                 // every shot, saved by tools/fx/shot-server.mjs
//   fx.setup('flak'); sws.shot()              // one shot, then look at it
// Shots: explosion (0.3 s), explosionLate (1.6 s), flak (a barrage at every age), burning
// (a neighbour B-17 with a burning engine), sunset (contrails toward a low sun), tracers.
export type FxShot = 'explosion' | 'explosionLate' | 'flak' | 'burning' | 'sunset' | 'tracers';
export const FX_SHOTS: FxShot[] = ['explosion', 'explosionLate', 'flak', 'burning', 'sunset', 'tracers'];

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUNSET: Weather = { sunEl: 5, sunAz: 245, low: 0.45, high: 0.3, contrails: true, mood: 'dusk' };

export function fxShots(engine: Engine, game: Game) {
  const w = game.world;
  const clearEnemies = () => { for (const a of w.aircraft) if (a.team === 'axis') a.remove = true; };
  const fly = (n: number) => { for (let i = 0; i < n; i++) { clearEnemies(); engine.frame(1 / 60, false); } };
  // effects only, the world held still (as the fx stage does)
  const fxStep = (n: number) => { for (let i = 0; i < n; i++) { w.effects.update(1 / 60); engine.time += 1 / 60; } };

  function start(weather?: Weather, seconds = 4) {
    game.startMission(CAMPAIGN[0]);
    (engine as any).livingSky?.reset();
    applyWeather(engine, weather ?? CAMPAIGN[0].weather!);
    w.contrails.enabled = true;
    fly(seconds * 60);
    game.gunner.detach();
  }

  function look(from: THREE.Vector3, at: THREE.Vector3, fov = 55) {
    const cam = engine.camera;
    cam.position.copy(from);
    cam.up.set(0, 1, 0);
    cam.lookAt(at);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  function setup(name: FxShot) {
    const rnd = Math.random;
    Math.random = mulberry(1944);
    try {
      const pb = () => w.playerBomber!;
      if (name === 'explosion' || name === 'explosionLate') {
        start();
        const from = pb().localToWorld(new THREE.Vector3(-4, 1.2, -2));
        const at = pb().localToWorld(new THREE.Vector3(-110, 6, 35));
        look(from, at, 55);
        engine.paused = true;
        w.effects.explosion(at, pb().vel.clone().multiplyScalar(0), 1.5, 'fighter');
        fxStep(name === 'explosion' ? 18 : 96);
      } else if (name === 'flak') {
        start();
        const c = w.formationCenter.clone();
        const from = c.clone().add(new THREE.Vector3(0, 25, 0));
        const fwd = w.formationForward.clone();
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const at = from.clone().addScaledVector(fwd, 1000).addScaledVector(right, 300).add(new THREE.Vector3(0, 120, 0));
        look(from, at, 50);
        engine.paused = true;
        // a barrage fired over 9 s: puffs of every age, 250 m .. 2 km out
        const dir = at.clone().sub(from).normalize();
        const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
        for (let i = 0; i < 54; i++) {
          const d = 250 + Math.random() * 1750;
          const p = from.clone().addScaledVector(dir, d).addScaledVector(side, (Math.random() - 0.5) * d * 0.9).add(new THREE.Vector3(0, (Math.random() - 0.4) * d * 0.35, 0));
          w.effects.flak(p);
          fxStep(10);
        }
      } else if (name === 'burning') {
        start(undefined, 2);
        const me = pb();
        const nb = w.bombers().filter((b) => b !== me).sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos))[0];
        const z = nb.zone('engine2')!;
        z.burning = true; z.hp = z.maxHp * 0.25;
        const z2 = nb.zone('engine1');
        if (z2) z2.hp = z2.maxHp * 0.5;   // the outboard one smoking white-grey
        // keep it alive and in its slot while the trail streams out
        for (let i = 0; i < 300; i++) {
          clearEnemies();
          z.hp = Math.max(z.hp, z.maxHp * 0.25);
          (nb as any).structure = Math.max((nb as any).structure ?? 1, 1);
          engine.frame(1 / 60, false);
        }
        game.gunner.detach();
        const from = me.localToWorld(new THREE.Vector3(-1.6, 1.0, -3));
        const at = nb.localToWorld(new THREE.Vector3(2, 0, -14));
        look(from, at, 38);
      } else if (name === 'sunset') {
        start(SUNSET, 16);
        const c = w.formationCenter.clone();
        const fwd = w.formationForward.clone();
        const sun = (Atmos.sunDir as THREE.Vector3).clone();
        // off the box's down-sun side, looking across the contrails toward the low sun
        const sh = new THREE.Vector3(sun.x, 0, sun.z).normalize();
        const from = c.clone().addScaledVector(sh, -340).addScaledVector(fwd, -60).add(new THREE.Vector3(0, 45, 0));
        look(from, c.clone().addScaledVector(fwd, -320).add(new THREE.Vector3(0, -10, 0)), 62);
      } else if (name === 'tracers') {
        start();
        const me = pb();
        const from = me.localToWorld(new THREE.Vector3(-2.5, 1.6, -4));
        const at = me.localToWorld(new THREE.Vector3(-220, 25, 80));
        look(from, at, 55);
        // three guns off to the left firing across the view (as the player's own: full brightness)
        engine.paused = true;
        const fwd = at.clone().sub(from).normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const v = new THREE.Vector3();
        for (let k = 0; k < 24; k++) {
          for (const off of [0, 1, 2]) {
            const muzzle = from.clone().addScaledVector(fwd, 45 + off * 35).addScaledVector(right, -45).add(new THREE.Vector3(0, -6 + off * 5, 0));
            const aim = from.clone().addScaledVector(fwd, 110 + off * 40).addScaledVector(right, 70).add(new THREE.Vector3(0, 4, 0));
            v.copy(aim).sub(muzzle).normalize().multiplyScalar(850).add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10));
            w.ballistics.fire(muzzle, v, 'allied', 1, k % 2 === 0, [10, 8, 3.5], me, false, true);
          }
          w.ballistics.update(1 / 60, w.aircraft);
          fxStep(1);
        }
        w.ballistics.update(1 / 60, w.aircraft);
        w.ballistics.renderTracers(engine.camera, engine.renderer.domElement.height);
      }
      engine.post.resetHistory();
    } finally {
      Math.random = rnd;
    }
  }

  function jpeg(width = 1280): string {
    engine.post.resetHistory();
    for (let i = 0; i < 24; i++) engine.render(1 / 60);
    const src = engine.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round(width * src.height / src.width);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92);
  }

  async function save(file: string, dataUrl: string, port = 5316) {
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: dataUrl });
    return r.text();
  }

  async function capture(set: string, names: FxShot[] = FX_SHOTS, port = 5316) {
    const out: string[] = [];
    for (const n of names) {
      setup(n);
      out.push(await save(`${set}/${n}.jpg`, jpeg(), port));
      engine.paused = false;
    }
    return out;
  }

  return { setup, capture, jpeg, save, fxStep };
}

export function install() {
  const sws = (window as any).sws;
  sws.fxShots = fxShots(sws.engine, sws.game);
  return sws.fxShots;
}
