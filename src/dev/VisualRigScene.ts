import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, type Mission } from '../game/Missions';
import { Atmos } from '../render/Atmosphere';
import { applyWeather } from '../render/Weather';
import { lightConed, Searchlights } from '../render/Searchlights';
import { RIG_DT, RIG_STEPS, RIG_WEATHER, type RigShot } from './VisualRigConfig';

/** Staged fixtures use the production world, controllers, assets and effects. */
export function setupRigShot(engine: Engine, game: Game, shot: RigShot, step: () => void) {
  const pilot = shot.id === 'p51-cockpit';
  const weather = { ...RIG_WEATHER[shot.weather] };
  const mission: Mission = { ...CAMPAIGN[0], id: 'visual-rig', number: 0, role: pilot ? 'pilot' : 'gunner',
    station: shot.station ?? 'waistL', bombers: 18, waves: [], round: undefined, duration: 10000,
    bombsAway: shot.id === 'bomb-run' ? 3 : undefined, flak: undefined, escorts: 0, escortArrive: undefined,
    specials: false, midRound: false, boss: false, weather };
  game.startMission(mission);
  const w = game.world, cam = engine.camera, gun = game.gunner;
  game.input.active = true;
  if (shot.station === 'waistL' || shot.id === 'headon-fw190-zoom') game.input.setVirtualButtons('visual-rig', 4);
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
  const damaged = shot.id === 'damaged-neighbour' ? w.bombers().find(b => b !== w.playerBomber)!
    : shot.id === 'night-formation' ? nearestNeighbour(w.bombers(), w.playerBomber!) : null;
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
  if (/^(waist-(fw190|bf109)|tail-bf109|headon-fw190)/.test(shot.id)) {
    const tail = shot.id.startsWith('tail');
    const headon = shot.id.startsWith('headon');
    const close = shot.id.endsWith('-close');
    const broadside = shot.id.includes('broadside');
    if (headon) {
      const s = gun.state;
      s.yaw = s.tYaw = 0; s.pitch = s.tPitch = .06; s.vPitch = s.vYaw = 0;
      gun.update(0);
    }
    // Frozen inspection passes: no combat or post-spawn simulation can change effects/poses.
    w.effects.clear(); w.ballistics.clear();
    const direction = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const planes = headon ? (shot.id.endsWith('-zoom') ? [[65, 0]] : [[65, 0], [130, -100], [130, 100]]) : [[close ? 65 : tail ? 180 : 150, 0]];
    const enemies = planes.map(([range, offset]) => {
      const pos = cam.position.clone().addScaledVector(direction, range).addScaledVector(right, offset);
      const type = tail || shot.id.includes('bf109') ? 'bf109' : 'fw190';
      const f = w.spawnEnemy(pos, 'beam', 1, false, false, type);
      const flight = headon ? cam.position.clone().sub(pos).normalize()
        : broadside ? new THREE.Vector3(0, 0, 1).applyQuaternion(b.quat)
        : close && !tail ? new THREE.Vector3(-.45, -.08, .9).applyQuaternion(b.quat).normalize()
        : tail ? new THREE.Vector3(.15, -.65, 1).applyQuaternion(b.quat).normalize()
        : new THREE.Vector3(-1, -.08, .3).applyQuaternion(b.quat).normalize();
      f.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), flight);
      if (headon) {
        // A shortest-arc +Z rotation can turn an approaching fighter upside down.
        f.root.up.set(0, 1, 0).applyQuaternion(b.quat);
        f.root.lookAt(cam.position);
      }
      f.root.rotateZ(headon ? .08 : broadside ? -.12 : tail ? .4 : -.45);
      // Initialize the production flying prop presentation without advancing the
      // fixture. Otherwise newly spawned planes keep parked blades across the
      // cowl/fan, despite the frozen scene depicting an airborne pass.
      f.propSpin.fill(.7);
      f.updateProps(0);
      f.root.updateMatrixWorld(true);
      return { type: f.kind, range: f.pos.distanceTo(cam.position), position: f.pos.toArray(), quaternion: f.quat.toArray(), diving: tail,
        propellerPhases: [...f.propSpin],
        propellersSpinning: f.props.every(p => p.disc.visible && p.blades.every(b => !b.visible)) };
    });
    facts.enemy = enemies[0]; facts.enemies = enemies;
    facts.effectsCleared = true;
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
  if (shot.id === 'night-formation' && damaged) {
    // Toward the moon from behind the burning neighbour: silhouettes against the moonlit sky,
    // the fire lighting the box, searchlights and fires on the ground below.
    const moon = new THREE.Vector3(Atmos.sunDir.x, 0, Atmos.sunDir.z).normalize();
    const side = new THREE.Vector3().crossVectors(moon, new THREE.Vector3(0, 1, 0)).normalize();
    look(damaged.pos.clone().addScaledVector(moon, -150).addScaledVector(side, 55).add(new THREE.Vector3(0, -6, 0)),
      damaged.pos.clone().addScaledVector(moon, 300).add(new THREE.Vector3(0, 50, 0)), 62);
    const lights = new Searchlights(engine.scene);
    lights.setup(Array.from({ length: 7 }, (_, i) => damaged.pos.clone().addScaledVector(moon, 900 + (i % 3) * 700)
      .addScaledVector(side, (i - 3) * 700).setY(0)), moon.clone().negate());
    // the beams sweep for six seconds and the crews cone what they catch
    const raiders = w.bombers();
    lights.lock(damaged);
    for (let i = 0; i < 60; i++) lights.update(.1, raiders);
    facts.conedBombers = lights.coned.size;
    facts.searchlights = lights.count;
    facts.burningEngines = damaged.zones.filter(z => z.burning).map(z => z.name);
  }
  let coneLights: Searchlights | null = null;
  if (shot.id === 'night-clouds') {
    // From just under the box, looking ahead and down at the cloud deck: the barrage bursting in
    // the cloud tops lights them, and the searchlights cone the bomber ahead, lighting his belly.
    const fwd = w.formationForward.clone().setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const lead = nearestNeighbour(w.bombers(), b);
    look(lead.pos.clone().addScaledVector(fwd, -230).addScaledVector(side, 60).add(new THREE.Vector3(0, -45, 0)),
      lead.pos.clone().addScaledVector(fwd, 260).add(new THREE.Vector3(0, -110, 0)), 66);
    coneLights = new Searchlights(engine.scene);
    coneLights.setup(Array.from({ length: 6 }, (_, i) => lead.pos.clone().addScaledVector(fwd, 900 + (i % 3) * 600)
      .addScaledVector(side, (i - 2.5) * 600).setY(0)), fwd.clone().negate());
    coneLights.lock(lead);
    for (let i = 0; i < 60; i++) coneLights.update(.1, w.bombers());
    facts.searchlights = coneLights.count;
    facts.conedBombers = coneLights.coned.size;
  }
  if (shot.id === 'sunset-rim') {
    // The player's B-17 against the low sun: rim light on the airframe, contrails catching it.
    const sun = new THREE.Vector3(Atmos.sunDir.x, 0, Atmos.sunDir.z).normalize();
    const side = new THREE.Vector3().crossVectors(sun, new THREE.Vector3(0, 1, 0)).normalize();
    look(b.pos.clone().addScaledVector(sun, -42).addScaledVector(side, -16).add(new THREE.Vector3(0, -3, 0)),
      b.pos.clone().addScaledVector(sun, 30).addScaledVector(side, 6).add(new THREE.Vector3(0, 4, 0)), 50);
  }
  if (shot.id === 'explosion-close') look(local([10, 8, 45]), local([10, 8, 140]), 55);
  // effects-only updates below age the burning neighbour's flames: keep its fire emitting
  const burn = (dt: number) => { if (shot.id === 'night-formation' && damaged) (w as unknown as { damageEffects(a: unknown, dt: number): void }).damageEffects(damaged, dt); };
  if (['explosion-close', 'flak-barrage', 'night-flak', 'night-formation', 'night-clouds'].includes(shot.id)) {
    const forward = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    w.effects.vol.camPos.copy(cam.position); w.effects.vol.hasCam = true;
    if (shot.id === 'explosion-close') {
      w.effects.explosion(cam.position.clone().addScaledVector(forward, 95), new THREE.Vector3(10, 0, 0), 1.5, 'heavy');
      facts.effectAge = .4;
    } else if (shot.id === 'night-clouds') {
      // bursts in and just above the cloud tops ahead, the last ones still burning
      const flat = forward.clone().setY(0).normalize();
      for (let i = 0; i < 14; i++) {
        const depth = 2800 + Math.random() * 3500;
        const pos = cam.position.clone().addScaledVector(flat, depth).addScaledVector(right, (Math.random() - .5) * depth * .8);
        pos.y = Atmos.lowTop - 1000 + Math.random() * 1000;
        w.effects.flak(pos);
        w.effects.update(.08);
      }
      facts.flakBursts = 14; facts.effectAge = 14 * .08 + .4;
    } else if (shot.id === 'night-formation') {
      // a sparse barrage beyond the box, some of it still burning
      for (let i = 0; i < 12; i++) {
        const depth = 500 + Math.random() * 900;
        const pos = cam.position.clone().addScaledVector(forward, depth)
          .addScaledVector(right, (Math.random() - .5) * depth * .9).addScaledVector(up, (Math.random() - .3) * depth * .35);
        w.effects.flak(pos);
        burn(.06);
        w.effects.update(.06);
      }
      facts.flakBursts = 12; facts.effectAge = 12 * .06 + .4;
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
    for (let i = 0; i < 24; i++) { burn(RIG_DT); w.effects.update(RIG_DT); }
    if (coneLights) lightConed(coneLights, w.effects);
  }
  // Precipitation is camera-relative, so update once after placing the final camera.
  engine.precipitation.update(0, engine.time, engine.quality);
  facts.formationCount = w.bombers().length;
  facts.pilotView = pilot ? game.pilot.view : null;
  facts.aimDownSight = shot.station === 'waistL' || shot.id === 'headon-fw190-zoom' ? gun.ads : null;
  let shafts = 0;
  engine.scene.traverse(o => { if (o.name === 'sunShaft' && o.visible) shafts++; });
  facts.visibleSunShafts = shafts;
  return facts;
}

function nearestNeighbour<T extends { pos: THREE.Vector3 }>(all: T[], player: T): T {
  let best = all.find(b => b !== player)!, d = Infinity;
  for (const b of all) if (b !== player && b.pos.distanceTo(player.pos) < d) { d = b.pos.distanceTo(player.pos); best = b; }
  return best;
}
