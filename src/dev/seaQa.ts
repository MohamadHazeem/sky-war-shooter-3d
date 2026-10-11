import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { seaMission } from '../game/SeaMission';
import type { SeaKind } from '../world/SeaCombat';
import { applyWeather, ROUND_WEATHER } from '../render/Weather';

/** Dev-only surface-strike fixtures. Freeze with sws.vqa.freeze(), then drive sws.step(). */
export function seaQa(engine: Engine, game: Game) {
  function start(wave = 1, mood = 'clear', rounds = Infinity) {
    game.startMission(seaMission(rounds));
    game.roundIdx = wave - 1;
    game.pilotOps.sea.beginWave(wave);
    const weather = ROUND_WEATHER.find(w => w.mood === mood) ?? { sunEl: 26, sunAz: 140, low: .4, high: .2, mood: 'night' as const };
    applyWeather(engine, weather);
    game.input.unlock();
    return state();
  }
  function state() {
    const ops = game.pilotOps.sea;
    return { active: ops.active, wave: ops.wave, rockets: ops.rockets, bombs: ops.bombs,
      ships: ops.sea.ships.map(s => ({ kind: s.kind, hp: s.combat.hp, sink: s.combat.sink, dive: s.combat.dive, depth: s.combat.depth, armourOpen: s.combat.armourOpen })),
      state: game.state, score: game.score, kills: game.world.stats.kills };
  }
  function view(kind: SeaKind, distance = 1) {
    const ops = game.pilotOps.sea, s = ops.sea.ships.find(s => s.kind === kind);
    if (!s) throw new Error(`No ${kind} in wave ${ops.wave}`);
    const target = s.root.position.clone().add(ops.sea.root.position);
    const size = Math.max(80, s.combat.spec.length);
    engine.camera.position.copy(target).add(new THREE.Vector3(size * 1.05 * distance * (s.combat.spec.shore ? -1 : 1), size * .65 * distance + 20, -size * 1.15 * distance));
    engine.camera.lookAt(target.clone().add(new THREE.Vector3(0, 5, 0))); engine.camera.updateMatrixWorld(true);
    ops.sea.update(0, game.settings.quality === 'low', engine.camera.position);
    for (let i = 0; i < 12; i++) engine.render(1 / 60);
    game.ui.ctx.clearRect(0, 0, engine.width, engine.height);
    ops.drawOverlay(game.ui.ctx, engine.width, engine.height, engine.camera);
    return state();
  }
  return { start, state, view, mission: seaMission };
}
