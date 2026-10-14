import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { survivalMission } from '../game/Missions';
import { update, damageStage, impact } from '../world/DamageStages';
import { update as updateLook } from '../world/DamageLook';
import type { EnemyType } from '../world/EnemyTypes';
import { STATIONS } from '../world/B17Layout';

// Frozen, reproducible views for Phase 8/06. Deliberately dev-only; leaves the live
// simulation stopped. Resume with sws.engine.start() or start another mission.
export function hitFeedbackQa(engine: Engine, game: Game) {
  function prepare(station: 'waistL' | 'top' = 'waistL') {
    engine.renderer.setAnimationLoop(null);
    game.bookends.auto = true;
    game.startMission({ ...survivalMission('gunner'), station, weather: { sunEl: 30, sunAz: 140, low: .25, high: .1 } });
    for (let i = 0; i < 20; i++) engine.frame(1 / 60, false);
    game.world.effects.clear();
    return game.world.playerBomber!;
  }
  function settle() {
    engine.post.resetHistory();
    for (let i = 0; i < 8; i++) engine.render(1 / 60);
  }
  function enemy(range = 150, stage = 2, type: EnemyType = 'fw190') {
    prepare();
    const world = game.world, cam = engine.camera;
    const pos = cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(range).add(cam.position);
    const f = world.spawnEnemy(pos, 'beam', 1, false, false, type);
    // Quartering view exposes the struck cowling, cockpit and wing skin.
    f.quat.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.08, 1.05, .12)));
    f.vel.set(45, 0, -65); f.fm.vel.copy(f.vel);
    stage = THREE.MathUtils.clamp(Math.round(stage), 0, 4);
    const frac = [1, .8, .6, .4, .2][stage];
    f.structure = f.maxStructure * frac;
    for (const z of f.zones) z.hp = z.maxHp * frac;
    f.pos.addScaledVector(f.vel, -1.8);
    for (let i = 0; i < 108; i++) {
      f.pos.addScaledVector(f.vel, 1 / 60);
      update(f, 1 / 60, world.time + i / 60, world.effects, cam.position);
      updateLook(f, world.time); world.effects.update(1 / 60);
    }
    f.root.updateMatrixWorld(true);
    settle();
    return { type, range: +f.pos.distanceTo(cam.position).toFixed(2), stage: damageStage(f), programs: engine.renderer.info.programs?.length };
  }
  function strike(range = 150) {
    enemy(range, 1);
    const f = game.world.fighters('axis')[0];
    const zone = f.zone('engine')!;
    const point = f.localToWorld(zone.offset, new THREE.Vector3());
    impact(f, { target: f, zone, point, bulletVel: point.clone().sub(engine.camera.position).normalize().multiplyScalar(800), damage: 4, cannon: false, shooter: game.world.playerBomber, playerShot: true }, game.world.effects, engine.camera.position);
    game.world.effects.update(.01);
    settle();
  }
  function interior() {
    const b = prepare();
    game.gunner.cold = 1;
    game.world.bomberDamage.lastHeavy = true;
    const z = STATIONS.waistL.pivot.z;
    for (const offset of [-.65, .65]) game.gunner.fuselageHit(new THREE.Vector3(1, .65, z + offset), new THREE.Vector3(-1, -.1, 0));
    for (let i = 0; i < 240; i++) {
      game.gunner.interiorDamage.update(1 / 60, b, game.world.effects, 1, engine.quality === 'low', true);
      game.world.effects.update(1 / 60);
    }
    // Turn the head slightly inward to see the torn skin beside the waist window.
    const eye = b.localToWorld(new THREE.Vector3(.05, .45, z - .05), new THREE.Vector3());
    const at = b.localToWorld(new THREE.Vector3(1.05, .3, z + .65), new THREE.Vector3());
    engine.camera.position.copy(eye); engine.camera.lookAt(at); engine.camera.updateMatrixWorld();
    settle();
    return { patches: game.gunner.interiorDamage.group.children.filter(c => c.visible).length, altitude: b.pos.y };
  }
  function glass(heavy = true) {
    const b = prepare('top');
    const pane = game.gunner.glassFx.paneForDev('top')!;
    const eye = engine.camera.position;
    const toward = new THREE.Vector3(.42, .28, .5).unproject(engine.camera);
    const direction = toward.sub(eye).normalize();
    const point = eye.clone().addScaledVector(direction, .5);
    game.world.ballistics.onHit?.({ target: b, zone: b.zone('fuselageFwd')!, point,
      bulletVel: b.vel.clone().addScaledVector(direction, -800), damage: 2, cannon: heavy, shooter: null, playerShot: false });
    game.world.effects.update(.25);
    // A real damaged enemy passes the turret, exercising the swept spray hook.
    const f = game.world.spawnEnemy(eye.clone().add(new THREE.Vector3(8, 4, 0)), 'beam', 1, false);
    f.structure = f.maxStructure * .4;
    f.vel.copy(b.vel).add(new THREE.Vector3(150, 0, 0));
    game.gunner.glassFx.update(.1, 'top', 0, .6);
    f.remove = true; f.root.visible = false;
    settle();
    return { cracks: pane.crackCount, oil: pane.oil, spray: pane.spat, visible: pane.mesh.visible };
  }
  return { enemy, strike, interior, glass };
}
