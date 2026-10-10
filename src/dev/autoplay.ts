import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import type { Mission } from '../game/Missions';
import type { StationId } from '../world/B17Layout';

// Development-only scripted player used for automated playtests in headless browsers
// (where requestAnimationFrame never fires). Usage from the console / Playwright:
//   sws.autoplay(sws.CAMPAIGN[0])            -> runs the mission to the debrief
//   sws.autoplay(sws.survivalMission('pilot'), 6000)
export function autoplay(engine: Engine, game: Game, mission: Mission, maxSteps = 6000): string {
  const w = game.world, gun = game.gunner, pilot = game.pilot;
  const inp = (game as any).input;
  const ids: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];
  game.startMission(mission);
  const log: string[] = [];
  let perks = 0;
  for (let k = 0; k < maxSteps; k++) {
    // between-wave perk cards: take the first one
    const card = document.querySelector<HTMLElement>('#perks.show .pcard');
    if (card) { card.click(); perks++; }
    const go = document.querySelector<HTMLElement>('#hangar.show [data-go]');
    if (go) go.click();
    inp.locked = true;
    inp.buttons = 0;
    if (mission.role === 'gunner') {
      const pb = w.playerBomber!;
      let best = null as THREE.Object3D | null, bd = 1000, tv = new THREE.Vector3(), tp0 = new THREE.Vector3();
      for (const f of w.fighters('axis')) {
        if (!f.alive) continue;
        const d = f.pos.distanceTo(pb.pos);
        if (d < bd) { bd = d; best = f.root; tv.copy(f.vel); tp0.copy(f.pos); }
      }
      if (best) {
        const tof = bd / 870;
        const tp = tp0.clone().add(tv.clone().sub(pb.vel).multiplyScalar(tof));
        tp.y += 0.5 * 9.81 * tof * tof;
        let chosen: { id: StationId; dy: number; pr: number } | null = null;
        for (const id of ids) {
          const def = (gun as any).states.get(id).def;
          const local = pb.worldToLocal(tp.clone()).sub(def.pivot);
          const yaw = Math.atan2(local.x, local.z), pitch = Math.asin(local.y / local.length());
          let dy = yaw - def.rest.yaw;
          while (dy > Math.PI) dy -= 2 * Math.PI;
          while (dy < -Math.PI) dy += 2 * Math.PI;
          if (dy >= def.yaw[0] && dy <= def.yaw[1] && pitch >= def.pitch[0] && pitch <= def.pitch[1]) {
            chosen = { id, dy, pr: pitch - def.rest.pitch };
            if (id === gun.station) break;
          }
        }
        if (chosen) {
          if (chosen.id !== gun.station && gun.transition <= 0 && k % 40 === 0) gun.requestStation(chosen.id);
          if (chosen.id === gun.station) {
            gun.state.tYaw = chosen.dy; gun.state.tPitch = chosen.pr;
            if (bd < 700 && !gun.state.overheated) inp.buttons = 1;
          }
        }
      }
      if (gun.state.ammo < 5 && gun.state.reload <= 0) inp.pressed.add('KeyR');
    } else {
      const f = w.playerFighter!;
      let target = null as THREE.Vector3 | null, tvel = new THREE.Vector3(), bd = 5000;
      for (const e of w.fighters('axis')) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(f.pos);
        if (d < bd) { bd = d; target = e.pos.clone(); tvel.copy(e.vel); }
      }
      if (target && f.alive) {
        const tof = bd / 880;
        const tp = target.add(tvel.sub(f.vel).multiplyScalar(tof));
        tp.y += 0.5 * 9.81 * tof * tof;
        const dir = tp.sub(f.pos).normalize();
        pilot.aimYaw = Math.atan2(dir.x, dir.z); pilot.aimPitch = Math.asin(dir.y);
        if (bd < 500 && f.forward().dot(dir) > 0.998) inp.buttons = 1;
      } else if (f.alive) {
        const c = w.formationCenter.clone().add(new THREE.Vector3(0, 300, 0)).sub(f.pos).normalize();
        pilot.aimYaw = Math.atan2(c.x, c.z); pilot.aimPitch = Math.asin(c.y);
      }
      pilot.throttleCmd = 1;
    }
    for (let i = 0; i < 3; i++) engine.frame(1 / 60, false);
    if (k % 600 === 0) log.push(`${w.time.toFixed(0)}s kills ${w.stats.kills} enemies ${w.activeEnemies().length} bombers ${w.bombers().filter((b) => b.alive).length} ${game.state}`);
    if (game.state === 'debrief') break;
  }
  const res = document.querySelector('#debrief .result')?.textContent ?? game.state;
  log.push(`RESULT: ${res} — perks ${perks}, kills ${w.stats.kills}, accuracy ${(w.stats.hits / Math.max(1, w.stats.shots) * 100).toFixed(0)}%, bombers lost ${w.stats.bombersLost}, t=${w.time.toFixed(0)}s`);
  return log.join('\n');
}
