import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { STATION_ORDER, STATIONS, StationId } from '../world/B17Layout';

// Development-only: plays Gunnery School through scripted input, the way a player would —
// mouse aim (the gun's target angles), short bursts on the left button, the right button
// to zoom, the number keys to change seats and real Tab key events for the map.
//   sws.tutorialAutoplay()            -> step log, ends on the clean title screen
//   sws.tutorialAutoplay({ fromTitle: true })  uses the first flight, or Hangar → More → Training
export function tutorialAutoplay(engine: Engine, game: Game, opts: { fromTitle?: boolean; maxSteps?: number } = {}): string {
  const w = game.world, gun = game.gunner, tut = game.onboarding.tutorial;
  const inp = (game as any).input;
  const log: string[] = [];
  if (opts.fromTitle) {
    if (!tut.active) {
      document.querySelector<HTMLElement>('#title [data-a="hangar"]')?.click();
      document.querySelector<HTMLElement>('#hangarHub [data-tab="more"]')?.click();
      const go = document.querySelector<HTMLElement>('#hangarHub [data-route="training"]');
      if (!go) return 'training route unavailable';
      go.click();
    }
  } else game.onboarding.startTutorial();
  let burst = 0, lastStep = '', tabs = 0, tabT = 0;
  const maxSteps = opts.maxSteps ?? 4000;
  for (let k = 0; k < maxSteps; k++) {
    const step = tut.stepId ?? tut.phase;
    if (step !== lastStep) { log.push(`${w.time.toFixed(1)}s ${step}`); lastStep = step; tabs = 0; tabT = 0; }
    inp.locked = true;
    inp.buttons = 0;
    const pb = w.playerBomber!;
    // nearest live fighter: lead it like a player following the ◇ indicator
    let best: THREE.Vector3 | null = null, bd = 1600;
    let tv = new THREE.Vector3();
    for (const f of w.fighters('axis')) {
      if (!f.alive) continue;
      const d = f.pos.distanceTo(pb.pos);
      if (d < bd) { bd = d; best = f.pos.clone(); tv.copy(f.vel); }
    }
    if (best && step !== 'radar' && step !== 'perks') {
      const lead = step !== 'aim';                     // the aim step points straight at it
      const tof = bd / 870;
      const tp = lead ? best.clone().add(tv.clone().sub(pb.vel).multiplyScalar(tof)) : best.clone();
      if (lead) tp.y += 0.5 * 9.81 * tof * tof;
      let chosen: { id: StationId; dy: number; pr: number } | null = null;
      for (const id of STATION_ORDER) {
        const def = STATIONS[id];
        const local = pb.worldToLocal(tp.clone()).sub(def.pivot);
        const yaw = Math.atan2(local.x, local.z), pitch = Math.asin(local.y / local.length());
        let dy = yaw - def.rest.yaw;
        while (dy > Math.PI) dy -= 2 * Math.PI;
        while (dy < -Math.PI) dy += 2 * Math.PI;
        if (dy >= def.yaw[0] && dy <= def.yaw[1] && pitch >= def.pitch[0] && pitch <= def.pitch[1]) {
          // stay put if this gun can reach it, else take the first lit badge (as the card says)
          if (!chosen || id === gun.station) chosen = { id, dy, pr: pitch - def.rest.pitch };
          if (id === gun.station) break;
        }
      }
      if (chosen) {
        // seat badge lit: press the station's number key (only ever once a second)
        if (chosen.id !== gun.station && gun.transition <= 0 && k % 20 === 0) inp.pressed.add('Digit' + STATIONS[chosen.id].key);
        if (chosen.id === gun.station) {
          // ease the sight across like a hand on the mouse
          const s = gun.state;
          s.tYaw += (chosen.dy - s.tYaw) * 0.25; s.tPitch += (chosen.pr - s.tPitch) * 0.25;
          const on = Math.abs(chosen.dy - s.yaw) < 0.03 && Math.abs(chosen.pr - s.pitch) < 0.03;
          // short bursts: 0.5 s on, 0.3 s off
          burst = (burst + 3 / 60) % 0.8;
          if (step !== 'aim' && step !== 'zoom' && on && bd < 1100 && !s.overheated && burst < 0.5) inp.buttons |= 1;
        }
      }
    }
    if (step === 'zoom') inp.buttons |= 4;            // right button
    if (step === 'radar') {
      tabT += 3 / 60;
      if ((tabs === 0 && tabT > 1.5) || (tabs === 1 && tabT > 3.5)) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', key: 'Tab' }));
        tabs++;
      }
    }
    for (let i = 0; i < 3; i++) engine.frame(1 / 60, false);
    if (tut.phase === 'over' && game.state === 'menu') break;
  }
  const camp = document.querySelector('#title.show') ? 'title screen shown' : `state ${game.state}`;
  log.push(`END ${w.time.toFixed(1)}s · ${camp} · tutorialDone=${game.onboarding.tutorialDone} · steps: ${tut.log.join(', ')}`);
  return log.join('\n');
}
