import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN } from '../game/Missions';
import { applyWeather, ROUND_WEATHER } from '../render/Weather';
import { Atmos } from '../render/Atmosphere';
import { STATIONS, type StationId } from '../world/B17Layout';
import { applyPaint } from '../render/Paint';

// Development-only: fixed camera setups for the before/after screenshot gallery
// (tools/gallery/README.md). Math.random is seeded while a setup runs, so the formation
// wobble, names and cloud drift come out the same on every run.
//   await sws.gallery.capture('after')      -> every setup, saved through tools/gallery/save-server.mjs
//   sws.gallery.setup('waist'); sws.shot()  -> one setup, then look at it
export type ShotName = 'waist' | 'top' | 'fw190' | 'formation' | 'dusk' | 'distant'
  | 'sunedge' | 'sunlow' | 'cloudsea' | 'engine' | 'p51';
export const SHOTS: ShotName[] = ['waist', 'top', 'fw190', 'formation', 'dusk'];
// 'distant' (the living sky through a long lens) has nothing to show before it existed
export const SHOTS_AFTER: ShotName[] = [...SHOTS, 'distant'];
// Close-ups for the aircraft surface detail (render/SurfaceDetail.ts): before = detail off
// (swsSurf.level(0)), after = the High level. sws.gallery.captureSurface('surface/after')
export type SurfaceShot = 'wing' | 'neighbour' | 'fw190close' | 'p51wing' | 'paint-olive' | 'paint-silver' | 'paint-desert' | 'paint-invasion' | 'formation';
export const SURFACE_SHOTS: SurfaceShot[] = ['wing', 'neighbour', 'fw190close', 'p51wing', 'paint-olive', 'paint-silver', 'paint-desert', 'paint-invasion', 'formation'];
// Cloud and heat-haze pass (tools/gallery/clouds-haze): cloud edges against the sun, cloud
// shadows on the cloud sea, the haze behind a B-17 engine and the P-51's exhaust stubs
export const SHOTS_CLOUDS: ShotName[] = ['waist', 'sunedge', 'sunlow', 'cloudsea', 'engine', 'fw190', 'p51'];

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

  // A point on the upper layer's base, near the camera, where the sun ray is half blocked
  // next to open sky: the edge of a cloud (from the cloud shadow map)
  function findSunEdge(): THREE.Vector2 | null {
    const m = engine.clouds.readShadowMap(engine.renderer, engine.camera, engine.time);
    const { data, res, cx, cz, size } = m;
    let best: THREE.Vector2 | null = null, bestD = Infinity;
    for (let y = 4; y < res - 4; y++) for (let x = 4; x < res - 4; x++) {
      const v = data[y * res + x];
      if (v < 0.3 || v > 0.6) continue;
      let open = false;
      for (let k = 2; k <= 4 && !open; k++) open = data[y * res + x + k] > 0.95 || data[y * res + x - k] > 0.95 || data[(y + k) * res + x] > 0.95 || data[(y - k) * res + x] > 0.95;
      if (!open) continue;
      const d = (x - res / 2) ** 2 + (y - res / 2) ** 2;
      if (d < bestD) { bestD = d; best = new THREE.Vector2(cx + ((x + 0.5) / res - 0.5) * size, cz + ((y + 0.5) / res - 0.5) * size); }
    }
    return best;
  }

  function setup(name: ShotName) {
    const rnd = Math.random;
    Math.random = mulberry(1943);
    try {
      const mission = name === 'p51' ? CAMPAIGN[3] : CAMPAIGN[0];
      game.startMission(mission);
      (engine as any).livingSky?.reset();   // same distant boxes / dogfights on every run
      // applied directly every time (Game skips re-applying a mission's weather it thinks is current)
      applyWeather(engine, name === 'dusk' ? ROUND_WEATHER[3] : name === 'sunlow' ? ROUND_WEATHER[1] : mission.weather!);
      w.contrails.enabled = true;
      engine.post.resetHistory();
      // 6 s of flight so contrails stream out and the formation settles
      for (let i = 0; i < 360; i++) { clearEnemies(); engine.frame(1 / 60, false); }
      if (name === 'p51') {
        // the P-51 cockpit, head turned to the right along the nose: exhaust stubs and their haze
        const pilot = game.pilot as any;
        pilot.view = 'cockpit';
        pilot.applyViewVisibility?.();
        for (let i = 0; i < 30; i++) { clearEnemies(); engine.frame(1 / 60, false); }
        const cam = engine.camera;
        cam.rotateY(-0.22);
        cam.rotateX(-0.14);
        cam.updateMatrixWorld();
        engine.post.resetHistory();
        return;
      }
      const pb = w.playerBomber!;
      const bombers = w.bombers().filter((b) => b !== pb);
      const station: StationId = name === 'top' || name === 'engine' ? 'top' : 'waistR';
      (gun as any).setStation(station, true);
      if (name === 'engine') {
        // top turret looking out over the right wing: the inboard and outboard engines
        aimAt('top', pb.localToWorld(new THREE.Vector3(-7, -1.4, -2)));
      } else if (name === 'top') {
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
      if (name === 'sunedge' || name === 'sunlow' || name === 'cloudsea') {
        gun.detach();
        const c = w.formationCenter;
        const cam = engine.camera;
        cam.position.copy(c).add(new THREE.Vector3(0, 40, 0));
        const sun = (Atmos.sunDir as THREE.Vector3).clone();
        if (name === 'cloudsea') {
          // across the sun, looking down onto the cumulus sea: the high layer's shadows
          const side = new THREE.Vector3(-sun.z, 0, sun.x).normalize();
          cam.lookAt(cam.position.clone().add(side.multiplyScalar(1000)).add(new THREE.Vector3(0, -620, 0)));
        } else {
          // into the sun, with the edge of an upper-layer cloud in front of it: move the
          // camera so that its sun ray crosses a half-shadowed texel of the cloud shadow map
          // (temporal tiers; the Low path has no map and keeps the formation position)
          const edge = findSunEdge();
          if (edge) {
            const k = (Atmos.highBase - cam.position.y) / sun.y;
            cam.position.x = edge.x - sun.x * k;
            cam.position.z = edge.y - sun.z * k;
          }
          const look = sun.clone();
          look.y -= 0.06;
          cam.lookAt(cam.position.clone().add(look.multiplyScalar(1000)));
        }
        cam.fov = 62;
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
    // several frames on the same camera: temporal passes (cloud accumulation) settle
    for (let i = 0; i < 24; i++) engine.render(1 / 60);
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

  async function capture(set: string, names: ShotName[] = SHOTS, port = 5219) {
    const out: string[] = [];
    for (const n of names) {
      setup(n);
      out.push(await save(`${set}/${n}.png`, png(), port));
    }
    return out;
  }

  // Camera placed in an aircraft's frame (metres, +Z nose, +X left wing), gun view detached
  function place(obj: THREE.Object3D, from: THREE.Vector3Tuple, at: THREE.Vector3Tuple, fov: number) {
    gun.detach();
    const cam = engine.camera;
    cam.position.copy(obj.localToWorld(new THREE.Vector3(...from)));
    cam.up.set(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
    cam.lookAt(obj.localToWorld(new THREE.Vector3(...at)));
    cam.fov = fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  function surface(name: SurfaceShot) {
    if (name === 'p51wing') {
      // the Mustang's cockpit, looking out and down at the left wing
      const rnd = Math.random;
      Math.random = mulberry(1944);
      try {
        game.startMission(CAMPAIGN.find((m) => m.role === 'pilot')!);
        applyWeather(engine, CAMPAIGN[0].weather!);   // the clear first-mission sky
        for (let i = 0; i < 120; i++) { clearEnemies(); engine.frame(1 / 60, false); }
        const pilot = game.pilot as any;
        pilot.view = 'cockpit'; pilot.applyViewVisibility();
        for (let i = 0; i < 3; i++) { clearEnemies(); engine.frame(1 / 60, false); }
        const cam = engine.camera;
        cam.rotateY(1.2); cam.rotateX(-0.3);
        cam.updateMatrixWorld();
        engine.post.resetHistory();
      } finally { Math.random = rnd; }
      return;
    }
    setup(name === 'neighbour' ? 'waist' : name === 'formation' ? 'formation' : 'fw190');
    if (name === 'formation') return;
    const pb = w.playerBomber!;
    if (name === 'neighbour') {
      // a long lens from the right waist window onto the neighbour's wing and engines
      const cam = engine.camera;
      const nb = w.bombers().filter((b) => b !== pb).sort((a, b) => a.pos.distanceTo(cam.position) - b.pos.distanceTo(cam.position))[0];
      cam.lookAt(nb.root.localToWorld(new THREE.Vector3(-4.5, 0, 0.5)));
      cam.fov = 13;
      cam.updateProjectionMatrix();
    } else if (name === 'fw190close') {
      // the Fw 190 from the setup, brought in to ~60 m
      const cam = engine.camera;
      const f = w.aircraft.find((a) => a.team === 'axis' && !a.remove);
      if (f) {
        const fwd = cam.getWorldDirection(new THREE.Vector3());
        f.root.position.copy(cam.position).addScaledVector(fwd, 60);
        f.root.updateMatrixWorld(true);
      }
    } else if (name === 'wing') {
      place(pb.root, [9, 3.5, 4], [4, -0.3, 0], 50);
    } else {
      // the player's B-17 from outside, front quarter, in each paint scheme
      applyPaint(pb.model, name.slice(6));
      place(pb.root, [9, 5, 16], [0, 0, 0], 50);
    }
    engine.post.resetHistory();
  }

  async function captureSurface(set: string, names: SurfaceShot[] = SURFACE_SHOTS, port = 5219) {
    const out: string[] = [];
    for (const n of names) {
      surface(n);
      out.push(await save(`${set}/${n}.png`, png(), port));
    }
    return out;
  }

  return { setup, png, save, capture, surface, captureSurface, SHOTS, SHOTS_AFTER, SURFACE_SHOTS };
  return { setup, png, save, capture, SHOTS, SHOTS_AFTER, SHOTS_CLOUDS };
}
