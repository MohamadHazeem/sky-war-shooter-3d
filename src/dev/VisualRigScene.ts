import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, type Mission } from '../game/Missions';
import { Atmos } from '../render/Atmosphere';
import { applyWeather } from '../render/Weather';
import { Searchlights } from '../render/Searchlights';
import { RIG_DT, RIG_STEPS, RIG_WEATHER, RIG_SEED, seededRandom, type RigShot } from './VisualRigConfig';

/** Staged fixtures use the production world, controllers, assets and effects. */
export function setupRigShot(engine: Engine, game: Game, shot: RigShot, step: () => void, seed = RIG_SEED) {
  const pilot = shot.id === 'p51-cockpit';
  const weather = { ...RIG_WEATHER[shot.weather] };
  const mission: Mission = { ...CAMPAIGN[0], id: 'visual-rig', number: 0, role: pilot ? 'pilot' : 'gunner',
    station: shot.station ?? 'waistL', bombers: 18, waves: [], round: undefined, duration: 10000,
    bombsAway: shot.id === 'bomb-run' ? 3 : undefined, flak: undefined, escorts: 0, escortArrive: undefined,
    specials: false, midRound: false, boss: false, weather };
  game.startMission(mission);
  const w = game.world, cam = engine.camera, gun = game.gunner;
  game.input.active = true;
  if (shot.station === 'waistL') game.input.setVirtualButtons('visual-rig', 4);
  if (pilot) {
    game.pilot.view = 'cockpit';
    (game.pilot as unknown as { applyViewVisibility(): void }).applyViewVisibility();
  }
  applyWeather(engine, weather);
  Atmos.windOffset.set(0, 0, 0); Atmos.originOffset.set(0, 0, 0);
  engine.time = 0; w.time = 0;
  engine.livingSky.reset();
  // Keep production simulation/render updates, but no combat director, progression or camera shake.
  engine.onFrame = dt => {
    w.update(dt);
    game.target.update(dt, mission);
    if (pilot) game.pilot.update(dt); else gun.update(dt);
    game.input.endFrame();
  };
  const damaged = shot.id === 'damaged-neighbour' ? w.bombers().find(b => b !== w.playerBomber)! : null;
  // Added art objects must not perturb the simulation random stream.
  Math.random = seededRandom(seed ^ 0x51a7);
  for (let i = 0; i < RIG_STEPS; i++) {
    if (damaged && i === 180) {
      for (const name of ['engine1', 'engine2']) {
        const z = damaged.zone(name)!; z.hp = z.maxHp * .08; z.burning = true;
        damaged.engineDead[z.engine!] = true;
      }
    }
    step();
  }
  const b = w.playerBomber!;
  const local = (p: THREE.Vector3Tuple) => b.localToWorld(new THREE.Vector3(...p));
  function look(from: THREE.Vector3, at: THREE.Vector3, fov = 55, exterior = true) {
    if (exterior) gun.detach();
    cam.position.copy(from); cam.up.set(0, 1, 0); cam.lookAt(at); cam.fov = fov;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  const facts: Record<string, unknown> = { weather, subject: shot.id };
  if (shot.id === 'ball-europe') {
    const s = gun.state;
    s.yaw = s.tYaw = 0; s.pitch = s.tPitch = -.65; s.vPitch = s.vYaw = 0;
    gun.update(0);
  }
  if (shot.id === 'top-formation') {
    const s = gun.state;
    s.yaw = s.tYaw = -.3; s.pitch = s.tPitch = .12; s.vPitch = s.vYaw = 0;
    gun.update(0);
  }
  if (shot.id === 'turret-glass') {
    const s = gun.state;
    s.yaw = s.tYaw = -.65; s.pitch = s.tPitch = .12; s.vPitch = s.vYaw = 0;
    gun.update(0);
    const neighbour = w.bombers().find(ship => ship !== b)!;
    // Place a real neighbour in the dome's reflected field, behind the gunner.
    const pane = gun.glassFx.paneForDev('top')!.mesh;
    pane.updateWorldMatrix(true, false);
    const ray = new THREE.Raycaster(); ray.layers.enableAll(); ray.setFromCamera(new THREE.Vector2(.48, .28), cam);
    const hit = ray.intersectObject(pane)[0];
    const normal = pane.worldToLocal(hit.point.clone()).normalize().transformDirection(pane.matrixWorld);
    neighbour.pos.copy(hit.point).addScaledVector(ray.ray.direction.clone().reflect(normal), 95);
    facts.reflectionPoint = [.48, .28];
    facts.neighbourPosition = neighbour.pos.toArray();
    neighbour.root.updateMatrixWorld(true);
    facts.neighbourRange = neighbour.pos.distanceTo(cam.position);
  }
  if (shot.id === 'close-shadow') {
    const neighbour = w.bombers().find(ship => ship !== b)!;
    look(neighbour.localToWorld(new THREE.Vector3(24, -3, 22)), neighbour.pos, 42);
    facts.neighbourRange = neighbour.pos.distanceTo(cam.position);
  }
  if (shot.id === 'formation-glints') {
    const neighbour = w.bombers().find(ship => ship !== b)!;
    // Above the wing on the specular half-vector, looking toward the sun.
    const from = neighbour.pos.clone().addScaledVector(Atmos.sunDir, -38);
    from.y = neighbour.pos.y + 17;
    look(from, neighbour.pos, 52);
    facts.neighbourRange = neighbour.pos.distanceTo(cam.position);
  }
  if (shot.id === 'waist-fw190'  || shot.id === 'tail-bf109') {
    const tail = shot.id === 'tail-bf109';
    const direction = cam.getWorldDirection(new THREE.Vector3());
    // Exact eye-to-aircraft-origin distance, in world metres (no off-axis displacement).
    const pos = cam.position.clone().addScaledVector(direction, tail ? 180 : 150);
    const f = w.spawnEnemy(pos, 'beam', 1, false, false, tail ? 'bf109' : 'fw190');
    const flight = tail ? new THREE.Vector3(.15, -.65, 1).applyQuaternion(b.quat).normalize()
      : new THREE.Vector3(-1, -.08, .3).applyQuaternion(b.quat).normalize();
    f.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flight);
    f.root.rotateZ(tail ? .4 : -.45); f.root.updateMatrixWorld(true);
    facts.enemy = { type: f.kind, range: f.pos.distanceTo(cam.position), position: f.pos.toArray(), quaternion: f.quat.toArray(), diving: tail };
  }
  if (shot.id === 'b17-beauty') look(local([19, 8, 24]), local([0, 0, 0]), 45);
  if (['formation-chase', 'sunset', 'flak-barrage'].includes(shot.id)) {
    const box = w.bombers();
    const center = box.reduce((v, b) => v.add(b.pos), new THREE.Vector3()).divideScalar(box.length);
    look(center.clone().add(new THREE.Vector3(-350, 150, -480)), center, 58);
  }
  if (shot.id === 'cloud-flythrough') {
    look(new THREE.Vector3(180, Atmos.lowBase + 1000, 400), new THREE.Vector3(500, Atmos.lowBase + 1100, 1400));
  }
  if (shot.id === 'waist-interior') {
    const z = gun.state.def.pivot.z;
    look(local([.1, .45, z + 1.7]), local([-1, .35, z - .8]), 74, false);
  }
  if (shot.id === 'damaged-neighbour' && damaged) {
    look(damaged.localToWorld(new THREE.Vector3(35, 12, -42)), damaged.pos, 52);
    facts.burningEngines = damaged.zones.filter(z => z.burning).map(z => z.name);
  }
  if (shot.id === 'bomb-run') {
    const aim = game.target.aimPoint;
    look(local([24, -5, 105]), local([0, -90, -45]), 70);
    facts.bombs = game.target.mesh.count;
    facts.target = aim.toArray();
  }
  if (shot.id === 'p51-cockpit') {
    // View visibility was set before stepping; turn slightly toward the instrument panel.
    cam.rotateX(-.10); cam.rotateY(.06); cam.updateMatrixWorld(true);
  }
  if (shot.id === 'night-flak') {
    look(new THREE.Vector3(-800, 3200, -2200), new THREE.Vector3(0, 5200, 2000), 65);
    const lights = new Searchlights(engine.scene);
    lights.setup(Array.from({ length: 8 }, (_, i) => new THREE.Vector3((i - 4) * 550, 0, 2000 + (i % 3) * 500)), new THREE.Vector3(0, 0, -1));
    lights.update(6, []);
    facts.searchlights = lights.count;
  }
  if (shot.id === 'explosion-close') look(local([10, 8, 45]), local([10, 8, 140]), 55);
  if (['explosion-close', 'flak-barrage', 'night-flak'].includes(shot.id)) {
    const forward = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    w.effects.vol.camPos.copy(cam.position); w.effects.vol.hasCam = true;
    if (shot.id === 'explosion-close') {
      w.effects.explosion(cam.position.clone().addScaledVector(forward, 95), new THREE.Vector3(10, 0, 0), 1.5, 'heavy');
      facts.effectAge = .4;
    } else {
      for (let i = 0; i < 28; i++) {
        const depth = 280 + Math.random() * 650;
        const pos = cam.position.clone().addScaledVector(forward, depth)
          .addScaledVector(right, (Math.random() - .5) * depth * .85).addScaledVector(up, (Math.random() - .5) * depth * .45);
        w.effects.flak(pos);
        w.effects.update(.035);
      }
      facts.flakBursts = 28; facts.effectAge = 28 * .035 + .4;
    }
    for (let i = 0; i < 24; i++) w.effects.update(RIG_DT);
  }
  // Precipitation is camera-relative, so update once after placing the final camera.
  engine.precipitation.update(0, engine.time, engine.quality);
  facts.formationCount = w.bombers().length;
  facts.formationPose = w.bombers().map(ship => ({ position: ship.pos.toArray(), quaternion: ship.quat.toArray() }));
  facts.pilotView = pilot ? game.pilot.view : null;
  facts.aimDownSight = shot.station === 'waistL' ? gun.ads : null;
  let shafts = 0;
  engine.scene.traverse(o => { if (o.name === 'sunShaft' && o.visible) shafts++; });
  facts.visibleSunShafts = shafts;
  return facts;
}
