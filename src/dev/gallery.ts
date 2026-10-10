import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN } from '../game/Missions';
import { applyWeather, ROUND_WEATHER } from '../render/Weather';
import { STATIONS, type StationId } from '../world/B17Layout';

// Development-only: fixed camera setups for the before/after screenshot gallery
// (tools/gallery/README.md). Math.random is seeded while a setup runs, so the formation
// wobble, names and cloud drift come out the same on every run.
//   await sws.gallery.capture('after')      -> every setup, saved through tools/gallery/save-server.mjs
//   sws.gallery.setup('waist'); sws.shot()  -> one setup, then look at it
export type ShotName = 'waist' | 'top' | 'fw190' | 'formation' | 'dusk' | 'distant';
export const SHOTS: ShotName[] = ['waist', 'top', 'fw190', 'formation', 'dusk'];
// 'distant' (the living sky through a long lens) has nothing to show before it existed
export const SHOTS_AFTER: ShotName[] = [...SHOTS, 'distant'];

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gallery(engine: Engine, game: Game) {
  const w = game.world;
  const gun = game.gunner;

  const clearEnemies = () => { for (const a of w.aircraft) if (a.team === 'axis') a.remove = true; };

  // Aim the current gun at a world point (offset in gun yaw/pitch, radians)
  function aimAt(id: StationId, p: THREE.Vector3, dYaw = 0, dPitch = 0) {
    const pb = w.playerBomber!;
    const def = STATIONS[id];
    const local = pb.worldToLocal(p.clone()).sub(def.pivot);
    let yaw = Math.atan2(local.x, local.z) - def.rest.yaw + dYaw;
    while (yaw > Math.PI) yaw -= 2 * Math.PI;
    while (yaw < -Math.PI) yaw += 2 * Math.PI;
    const pitch = Math.asin(local.y / local.length()) - def.rest.pitch + dPitch;
    const s = (gun as any).states.get(id);
    s.yaw = s.tYaw = THREE.MathUtils.clamp(yaw, def.yaw[0], def.yaw[1]);
    s.pitch = s.tPitch = THREE.MathUtils.clamp(pitch, def.pitch[0], def.pitch[1]);
    s.vYaw = s.vPitch = 0;
  }

  function setup(name: ShotName) {
    const rnd = Math.random;
    Math.random = mulberry(1943);
    try {
      game.startMission(CAMPAIGN[0]);
      (engine as any).livingSky?.reset();   // same distant boxes / dogfights on every run
      // applied directly every time (Game skips re-applying a mission's weather it thinks is current)
      applyWeather(engine, name === 'dusk' ? ROUND_WEATHER[3] : CAMPAIGN[0].weather!);
      w.contrails.enabled = true;
      engine.post.resetHistory();
      // 6 s of flight so contrails stream out and the formation settles
      for (let i = 0; i < 360; i++) { clearEnemies(); engine.frame(1 / 60, false); }
      const pb = w.playerBomber!;
      const bombers = w.bombers().filter((b) => b !== pb);
      const station: StationId = name === 'top' ? 'top' : 'waistR';
      (gun as any).setStation(station, true);
      if (name === 'top') {
        aimAt('top', pb.localToWorld(new THREE.Vector3(0, 60, 400)));
      } else {
        // the nearest neighbour on the right (level with us), a little off the sight, like the film
        const ok = bombers.filter((b) => { const l = pb.worldToLocal(b.pos.clone()); return l.x < -20 && Math.abs(l.y) < 40; })
          .sort((a, b) => a.pos.distanceTo(pb.pos) - b.pos.distanceTo(pb.pos));
        const tgt = ok[0] ?? bombers[0];
        aimAt('waistR', tgt.pos, 0.2, -0.07);
      }
      for (let i = 0; i < 3; i++) { clearEnemies(); engine.frame(1 / 60, false); }
      if (name === 'fw190') {
        // an Fw 190 crossing the waist window ~120 m out, banked toward us
        const cam = engine.camera;
        const fwd = cam.getWorldDirection(new THREE.Vector3());
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
        const pos = cam.position.clone().addScaledVector(fwd, 130).addScaledVector(right, -14).add(new THREE.Vector3(0, -6, 0));
        const f = w.spawnEnemy(pos, 'beam', 1, false, false, 'fw190');
        const dir = right.clone().multiplyScalar(-1).addScaledVector(fwd, -0.35).normalize();
        f.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        f.root.rotateZ(-0.55);
        f.root.updateMatrixWorld(true);
      }
      if (name === 'formation') {
        gun.detach();
        const c = w.formationCenter;
        const cam = engine.camera;
        cam.position.copy(c).add(new THREE.Vector3(-330, 45, 170));
        cam.lookAt(c.clone().add(new THREE.Vector3(0, -40, -150)));
        cam.fov = 50;
        cam.updateProjectionMatrix();
      }
      if (name === 'distant') {
        // 20 s more (flak barrage builds up, a dogfight turns), then a long lens from our box
        // toward the box on the right and its flak field
        for (let i = 0; i < 1200; i++) { clearEnemies(); engine.frame(1 / 60, false); }
        gun.detach();
        const c = w.formationCenter;
        const cam = engine.camera;
        cam.position.copy(c).add(new THREE.Vector3(0, 30, 0));
        cam.lookAt(c.clone().add(new THREE.Vector3(-4600, -300, 1500)));
        cam.fov = 32;
        cam.updateProjectionMatrix();
      }
      engine.post.resetHistory();
    } finally {
      Math.random = rnd;
    }
  }

  // Downscaled PNG of the current frame (the gallery is committed: keep it a sane size)
  function png(width = 1200): string {
    engine.post.resetHistory();
    engine.render(1 / 60);
    const src = engine.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round(width * src.height / src.width);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  async function save(file: string, dataUrl: string, port = 5219) {
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: dataUrl });
    return r.text();
  }

  async function capture(set: string, names: ShotName[] = SHOTS) {
    const out: string[] = [];
    for (const n of names) {
      setup(n);
      out.push(await save(`${set}/${n}.png`, png()));
    }
    return out;
  }

  return { setup, png, save, capture, SHOTS, SHOTS_AFTER };
}
