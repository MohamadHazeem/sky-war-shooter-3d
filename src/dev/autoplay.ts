import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, type Mission } from '../game/Missions';
import type { EnemyType } from '../world/EnemyTypes';
import type { StationId } from '../world/B17Layout';
import { DogfightAI } from '../world/DogfightAI';
import type { Fighter } from '../world/Aircraft';

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
  let chase: Fighter | null = null;
  let taken = 0;
  const prevHit = w.events.playerHitFrom;
  w.events.playerHitFrom = (e) => { if (e.target === w.playerFighter) taken++; prevHit?.(e); };
  const modes: Record<string, number> = {};
  let fired = 0;
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
      // boss battle: with no fighter close, work on the warships' weak points (or breached hulls)
      let boss = false;
      if (!best && game.boss.active) {
        bd = 1400;
        for (const t of game.boss.targets()) {
          const d = t.pos.distanceTo(pb.pos);
          if (d < bd) { bd = d; best = pb.root; boss = true; tv.copy(t.vel); tp0.copy(t.pos); }
        }
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
            if (bd < (boss ? 1300 : 700) && !gun.state.overheated) inp.buttons = 1;
          }
        }
      }
      if (gun.state.ammo < 5 && gun.state.reload <= 0) inp.pressed.add('KeyR');
    } else {
      const f = w.playerFighter!;
      let target = null as THREE.Vector3 | null, tvel = new THREE.Vector3(), bd = 5000;
      // stick with the bandit being chased unless another is much closer; bomber attackers first
      let pick: Fighter | null = null, ps = Infinity;
      for (const e of w.fighters('axis')) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(f.pos);
        // bomber attackers first; raid missions: the bombers heading for the field
        const onBombers = w.enemyPilot(e)?.state === 'attack' ? 0.7 : (e.ai as { inbound?: boolean } | null)?.inbound ? 0.35 : 1;
        const sc = d * onBombers * (e === chase ? 0.6 : 1);
        if (sc < ps) { ps = sc; pick = e; }
      }
      chase = pick;
      if (pick) { bd = pick.pos.distanceTo(f.pos); target = pick.pos.clone(); tvel.copy(pick.vel); }
      let boss = false;
      if (game.boss.active && bd > 400) {
        for (const t of game.boss.targets()) {
          const d = t.pos.distanceTo(f.pos);
          if (d < bd || !boss) { bd = d; target = t.pos.clone(); tvel.copy(t.vel); boss = true; }
        }
      }
      if (target && f.alive && boss && bd < 320) {
        // break off before flying into the warship, then come round again
        pilot.aimYaw += 0.02; pilot.aimPitch = 0.45;
      } else if (target && f.alive) {
        const tof = bd / 880;
        const tp = target.add(tvel.sub(f.vel).multiplyScalar(tof));
        tp.y += 0.5 * 9.81 * tof * tof;
        const dir = tp.sub(f.pos).normalize();
        pilot.aimYaw = Math.atan2(dir.x, dir.z); pilot.aimPitch = Math.asin(dir.y);
        // heavies are big targets (40+ m span at ENEMY_SCALE): a wider firing cone
        const heavy = pick && (pick.enemyType === 'ju88' || pick.enemyType === 'bf110');
        if (bd < (boss ? 1000 : 500) && f.forward().dot(dir) > (boss ? 0.993 : heavy ? 0.992 : 0.998)) inp.buttons = 1;
      } else if (f.alive) {
        const c = w.formationCenter.clone().add(new THREE.Vector3(0, 300, 0)).sub(f.pos).normalize();
        pilot.aimYaw = Math.atan2(c.x, c.z); pilot.aimPitch = Math.asin(c.y);
      }
      // don't overrun a slow raid bomber: ease off sitting close behind him
      pilot.throttleCmd = chase && (chase.ai as { inbound?: boolean } | null)?.inbound && bd < 350 && chase.forward().dot(f.forward()) > 0.7 ? 0.45 : 1;
      // exercise the views: padlock on and off, cockpit / chase
      if (k % 700 === 200 || k % 700 === 500) inp.pressed.add('KeyT');
      if (k % 1500 === 750) inp.pressed.add('KeyV');
      for (const e of w.fighters('axis')) { const b = e.alive && DogfightAI.of(e); if (b) modes[b.mode] = (modes[b.mode] ?? 0) + 1; if (e.alive && e.trigger && DogfightAI.of(e)) fired++; }
    }
    for (let i = 0; i < 3; i++) engine.frame(1 / 60, false);
    if (k % 600 === 0) log.push(`${w.time.toFixed(0)}s kills ${w.stats.kills} enemies ${w.activeEnemies().length} bombers ${w.bombers().filter((b) => b.alive).length} ${game.state}`
      + (game.boss.active ? ` BOSS ${game.boss.ships.map((s) => s.deathT >= 0 ? 'X' : `${(s.ship.core / s.ship.coreMax * 100).toFixed(0)}%/${(s.ship.partsFrac * 100).toFixed(0)}%`).join(' ')}` : '')
      + (w.playerFighter ? ` hp ${(w.playerFighter.integrity * 100).toFixed(0)}% score ${(game as any).score} | ${document.getElementById('hObjective')?.textContent ?? ''}` : ''));
    if (game.state === 'debrief') break;
  }
  const res = game.state === 'debrief' ? document.querySelector('#debrief .result')?.textContent ?? game.state : `TIMEOUT (${game.state})`;
  w.events.playerHitFrom = prevHit;
  if (mission.role === 'pilot') log.push(`BFM modes (samples): ${JSON.stringify(modes)} · BFM firing samples ${fired} · hits taken ${taken}`);
  log.push(`RESULT: ${res} — perks ${perks}, kills ${w.stats.kills}, accuracy ${(w.stats.hits / Math.max(1, w.stats.shots) * 100).toFixed(0)}%, bombers lost ${w.stats.bombersLost}, t=${w.time.toFixed(0)}s`);
  return log.join('\n');
}

// One-on-one dogfight test bench for the P-51 (dev console: swsDuel('bf109', 'ahead', 90, true)).
// The player's Mustang either flies straight / weaves (attack = false) or is flown by the same
// scripted gunnery as autoplay (attack = true); the bandit starts 'ahead' (player on its six),
// 'behind' (on the player's six) or head-on. Escorts and the round director are switched off.
export function duel(engine: Engine, game: Game, type: string, start: 'ahead' | 'behind' | 'headon', secs = 60, attack = false, weave = false, skill = 1) {
  const g = game as any, w = game.world;
  g.startMission(CAMPAIGN.find((m) => m.id === 'm4'));
  game.pilotOps.start({ role: 'pilot', id: 'duel' } as Mission); // passive: rear gunners and calls, no scripted rounds
  const director = g.director; g.director = () => {};
  const pf = w.playerFighter!;
  for (const a of w.fighters('allied')) if (a !== pf) a.remove = true;
  game.pilot.assist = attack ? 1 : 0;
  const inp = g.input;
  const fwd = pf.forward().clone();
  const pos = pf.pos.clone().addScaledVector(fwd, start === 'ahead' ? 650 : start === 'behind' ? -1200 : 1500).add(new THREE.Vector3(0, start === 'ahead' ? 0 : 100, 0));
  const f = w.spawnEnemy(pos, 'headon', skill, false, false, type as EnemyType);
  const p = w.enemyPilot(f)!; p.target = pf; p.state = 'dogfight';
  if (start !== 'headon') { f.root.quaternion.copy(pf.quat); f.fm.vel.copy(fwd).multiplyScalar(190); }
  pf.fm.vel.copy(fwd).multiplyScalar(185);
  let hits = 0;
  const prev = w.events.playerHitFrom;
  w.events.playerHitFrom = (ev) => { if (ev.shooter === f) hits++; prev?.(ev); };
  const modes: Record<string, number> = {};
  let fire = 0, minD = 1e9, killT: number | null = null;
  const h0 = w.stats.hits, t0 = w.time;
  for (let k = 0; k < secs * 20; k++) {
    inp.locked = true; inp.buttons = 0; engine.paused = false;
    if (attack && f.alive) {
      const d = f.pos.distanceTo(pf.pos), tof = d / 880;
      const tp = f.pos.clone().add(f.vel.clone().sub(pf.vel).multiplyScalar(tof)); tp.y += 0.5 * 9.81 * tof * tof;
      const dir = tp.sub(pf.pos).normalize();
      game.pilot.aimYaw = Math.atan2(dir.x, dir.z); game.pilot.aimPitch = Math.asin(dir.y);
      if (d < 500 && pf.forward().dot(dir) > 0.998) inp.buttons = 1;
    } else {
      game.pilot.aimYaw = Math.atan2(fwd.x, fwd.z) + (weave ? Math.sin((w.time - t0) * 0.25) * 1.2 : 0); game.pilot.aimPitch = 0.02;
    }
    game.pilot.throttleCmd = 1;
    for (let i = 0; i < 3; i++) engine.frame(1 / 60, false);
    const b = p.bfm; if (b) modes[b.mode] = (modes[b.mode] ?? 0) + 1;
    if (f.trigger) fire++;
    minD = Math.min(minD, f.pos.distanceTo(pf.pos));
    if (!f.alive) { killT = Math.round(w.time - t0); break; }
    if (!pf.alive) break;
  }
  w.events.playerHitFrom = prev;
  g.director = director;
  return { type, start, attack, hitsOnPlayer: hits, enemyFiring: fire, minD: Math.round(minD), playerHp: Math.round(pf.integrity * 100), playerAlive: pf.alive, killT, playerHits: w.stats.hits - h0, state: p.state, modes };
}
// Freeze-frame for screenshots of the P-51 views: m4 started, a bandit placed `dist` m ahead
// (offset sideways by `side`), the guns optionally firing, then the game held (state 'paused'
// without the pause menu, so the overlay keeps drawing). (dev console: swsShot('chase'))
(globalThis as any).swsShot = (view: 'cockpit' | 'chase', o: { type?: string; fire?: boolean; dist?: number; side?: number; steps?: number; pre?: number; padlock?: boolean; turn?: number } = {}) => {
  const engine: Engine = (window as any).sws.engine, game: Game = (window as any).sws.game;
  const g = game as any, w = game.world;
  g.state = 'playing';
  game.startMission(CAMPAIGN.find((m) => m.id === 'm4')!);
  g.input.locked = true;
  game.pilot.view = view; (game.pilot as any).applyViewVisibility();
  for (let i = 0; i < 60 * (o.pre ?? 6); i++) engine.frame(1 / 60, false);
  for (const a of w.fighters('axis')) a.remove = true;
  const pf = w.playerFighter!, fwd = pf.forward();
  const f = w.spawnEnemy(pf.pos.clone().addScaledVector(fwd, o.dist ?? 300).add(new THREE.Vector3(o.side ?? 8, 6, 0)), 'headon', 1, false, false, (o.type ?? 'fw190') as EnemyType);
  f.root.quaternion.copy(pf.quat); f.fm.vel.copy(pf.fm.vel);
  w.enemyPilot(f)!.state = 'withdraw';
  if (o.padlock) { game.pilot.padlock = f; }
  if (o.turn) game.pilot.aimYaw += o.turn;
  const steps = o.steps ?? 30;
  for (let i = 0; i < steps; i++) { g.input.buttons = o.fire ? 1 : 0; engine.frame(1 / 60, i === steps - 1); }
  g.state = 'paused';
  return 'ok';
};
(globalThis as any).swsDuel =(type: string, start: 'ahead' | 'behind' | 'headon', secs?: number, attack?: boolean, weave?: boolean, skill?: number) =>
  duel((window as any).sws.engine, (window as any).sws.game, type, start, secs, attack, weave, skill);
