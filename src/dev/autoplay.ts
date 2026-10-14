import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { CAMPAIGN, type Mission } from '../game/Missions';
import type { EnemyType } from '../world/EnemyTypes';
import type { StationId } from '../world/B17Layout';
import { DogfightAI } from '../world/DogfightAI';
import type { Fighter } from '../world/Aircraft';
import { StrafeRun, pullOutHeight } from '../game/StrafeOps';
import type { GroundTarget } from '../world/GroundTargets';
import { crewRoomScene } from '../ui/CrewRoomScene';
import { AI_STATS, resetAiStats } from '../world/PilotMind';

// Development-only scripted player used for automated playtests in headless browsers
// (where requestAnimationFrame never fires). Usage from the console / Playwright:
//   sws.autoplay(sws.CAMPAIGN[0])            -> runs the mission to the debrief
//   sws.autoplay(sws.survivalMission('pilot'), 6000)
//   sws.autoplay(sws.CAMPAIGN[0], 40000, { skill: 0 })   -> a human-level player (~35-45 % accuracy)
// Every run leaves structured numbers in `lastMetrics` for the balance harness
// (src/dev/balance.ts, docs/BALANCE.md).

export interface AutoplayOpts {
  // 1 = the near-perfect scripted bot (default); 0 = human-level: an aim error that wanders, a
  // misjudged lead per target, laggy tracking, a reaction delay after switching targets and
  // looser fire discipline (longer range, a held trigger). In between scales all of it.
  skill?: number;
  aimErr?: number;          // override of the human aim-error sigma (rad) at skill 0 (calibration)
  stopAfterRounds?: number; // endless modes: stop once this many rounds are complete
  onStep?: (k: number) => void; // after every step (3 frames): QA sampling (src/dev/qaSweep.ts)
}

export interface AutoplayMetrics {
  mission: string; role: 'gunner' | 'pilot'; skill: number; difficulty: number;
  result: string; success: boolean | null; failCause: string | null; stopped: boolean; timeout: boolean;
  t: number;                                   // mission time (s) at the end
  rounds: { idx: number; t: number; boss: boolean; kills: number; lost: number; complete: boolean }[];
  boss: { round: number; t: number | null; ships: { name: string; t: number | null; breach: number | null }[] }[];
  dmgTaken: number; hitsTaken: number; minHp: number; endHp: number; wounds: number;
  bombersLost: number; kills: number; kpm: number; accuracy: number; shots: number; hits: number; perks: number;
  extra: Record<string, unknown>;              // mode specifics: raid bombers through, strafe objectives and round ends
}
export let lastMetrics: AutoplayMetrics | null = null;

// Standard normal (Box-Muller)
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// Human-like aim (skill < 1), per role. Angles in radians; dt = one autoplay step (3 frames).
// Calibrated (docs/BALANCE.md) so skill 0 lands near 35-45 % accuracy on the guns of the B-17
// (the bot: 65-85 %) and ~0.6x the bot's accuracy in the P-51 (the bot: ~30-35 %).
export interface HumanAim { sigma: number; theta: number; lead: number; lag: number; react: number; hold: number; range: number; cone: number }
export const HUMAN: Record<'gunner' | 'pilot', HumanAim> = {
  // sigma: wandering aim error (Ornstein-Uhlenbeck, 1-sigma per axis); theta: its mean reversion
  // (1/s); lead: lead misjudged by up to +-x per target; lag: s, tracking time constant; react:
  // s after a new target before the trigger is pulled; hold: s the trigger stays down after the
  // shot is lost; range: x the bot's opening range; cone: P-51 firing cone loosened by (1 - dot)
  gunner: { sigma: 0.025, theta: 1.4, lead: 0.4, lag: 0.22, react: 0.45, hold: 0.35, range: 1.4, cone: 0 },
  pilot: { sigma: 0.006, theta: 1.4, lead: 0.12, lag: 0.1, react: 0.35, hold: 0.12, range: 1.15, cone: 0.002 },
};
class Aimer {
  ex = 0; ey = 0; leadK = 1; tgt: unknown = null; since = 99; hold = 0;
  private sy = NaN; private sp = NaN;
  private P: HumanAim;
  constructor(readonly skill: number, role: 'gunner' | 'pilot', sigma?: number) { this.P = { ...HUMAN[role], ...(sigma !== undefined ? { sigma } : {}) }; }
  get h() { return Math.max(0, Math.min(1, 1 - this.skill)); }
  // advance the error model; target = whatever is being aimed at
  step(dt: number, target: unknown) {
    const h = this.h;
    this.since += dt;
    if (target !== this.tgt) { this.tgt = target; this.since = 0; this.leadK = 1 + (Math.random() * 2 - 1) * this.P.lead * h; }
    if (h <= 0) return;
    const s = this.P.sigma * h, th = this.P.theta;
    this.ex += -th * this.ex * dt + s * Math.sqrt(2 * th * dt) * gauss();
    this.ey += -th * this.ey * dt + s * Math.sqrt(2 * th * dt) * gauss();
  }
  // a commanded (yaw, pitch) through the tracking lag and the aim error
  aim(yaw: number, pitch: number, dt: number): [number, number] {
    const h = this.h;
    if (h <= 0) return [yaw, pitch];
    if (Number.isNaN(this.sy) || (this.since === 0 && Math.abs(wrap(yaw - this.sy)) > 0.6)) { this.sy = yaw; this.sp = pitch; }
    const k = 1 - Math.exp(-dt / (this.P.lag * h));
    this.sy = wrap(this.sy + wrap(yaw - this.sy) * k); this.sp += (pitch - this.sp) * k;
    return [wrap(this.sy + this.ex), this.sp + this.ey];
  }
  // trigger discipline: the reaction delay after a new target, and the held trigger
  trigger(want: boolean, dt: number): boolean {
    const h = this.h;
    if (h <= 0) return want;
    if (want && this.since < this.P.react * h) return false;
    if (want) { this.hold = this.P.hold * h; return true; }
    this.hold -= dt;
    return this.hold > 0;
  }
  get cone() { return this.P.cone * this.h; }
  range(r: number) { return r * (1 + (this.P.range - 1) * this.h); }
}

export function autoplay(engine: Engine, game: Game, mission: Mission, maxSteps = 6000, opts: AutoplayOpts = {}): string {
  const w = game.world, gun = game.gunner, pilot = game.pilot;
  const inp = (game as any).input;
  const ids: StationId[] = ['waistL', 'waistR', 'top', 'ball', 'tail'];
  game.bookends.auto = true;   // no take-off / landing scenes in automated runs
  crewRoomScene.auto = true;   // nor crew-room scenes
  game.startMission(mission);
  resetAiStats();   // enemy AI decisions this run (extra.ai)
  const log: string[] = [];
  let perks = 0;
  let chase: Fighter | null = null, commitT = 0, switches = 0;
  const pt = { near: 0, mid: 0, far: 0, none: 0, fire: 0 };   // pilot bot: s with the chased bandit < 600 m / < 1500 m / beyond, none; s on the trigger
  const COMMIT = 8;   // s the pilot bot stays on a bandit before it may switch
  let taken = 0, dmg = 0, hitsOnMe = 0;
  const prevHit = w.events.playerHitFrom;
  w.events.playerHitFrom = (e) => { if (e.target === w.playerFighter) taken++; if (e.target === w.player) { dmg += e.damage; hitsOnMe++; } prevHit?.(e); };
  const skill = opts.skill ?? 1, aimer = new Aimer(skill, mission.role, opts.aimErr), DT = 3 / 60;
  // metrics: rounds, battle-group kill times, damage
  const g = game as any;
  const rounds: AutoplayMetrics['rounds'] = [];
  const bosses: AutoplayMetrics['boss'] = [];
  let rIdx = g.roundIdx ?? 0, rT0 = w.time, rK0 = 0, rL0 = 0, rBoss = false, minHp = 1, wounds = 0, stopped = false;
  let bossRec: AutoplayMetrics['boss'][number] | null = null, bossT0 = 0;
  const modes: Record<string, number> = {};
  let fired = 0;
  // ground attack (Train Busting): strafing passes on the round's targets
  let run: StrafeRun | null = null, gtgt: GroundTarget | null = null, passes = 0, lastPhase = '';
  const trace: string[] = [];
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
      // a telegraphed heavy attack (the weapon glows, the crew calls it) comes first, fighters or not
      if (game.boss.active) {
        let cd = 1400;
        for (const s of game.boss.ships) {
          if (s.deathT >= 0) continue;
          for (const p of s.ship.parts) {
            if (!p.alive || p.charge <= 0) continue;
            const pp = s.ship.partPos(p, new THREE.Vector3()), d = pp.distanceTo(pb.pos);
            if (d < cd) { cd = d; bd = d; best = pb.root; boss = true; tv.copy(s.ship.vel); tp0.copy(pp); }
          }
        }
      }
      aimer.step(DT, boss ? 'boss' : best);
      if (best) {
        const tof = bd / 870 * aimer.leadK;
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
          if (chosen.id !== gun.station && gun.transition <= 0 && k % (skill < 1 ? 80 : 40) === 0) gun.requestStation(chosen.id);
          if (chosen.id === gun.station) {
            [gun.state.tYaw, gun.state.tPitch] = aimer.aim(chosen.dy, chosen.pr, DT);
            if (aimer.trigger(bd < aimer.range(boss ? 1300 : 700), DT) && !gun.state.overheated) inp.buttons = 1;
          }
        }
      }
      if (gun.state.ammo < 5 && gun.state.reload <= 0) inp.pressed.add('KeyR');
    } else if (game.pilotOps.strafe.active) {
      const so = game.pilotOps.strafe, f = w.playerFighter!;
      run ??= new StrafeRun(so.groundAt, 250);
      // a bandit close in front or on us: fight it (above the ground); else the round's targets
      let bandit: Fighter | null = null, bdist = run.phase === 'dive' ? 350 : 750;
      for (const e of w.fighters('axis')) { if (!e.alive) continue; const d = e.pos.distanceTo(f.pos); if (d < bdist && e.pos.clone().sub(f.pos).normalize().dot(f.forward()) > 0.5) { bdist = d; bandit = e; } }
      aimer.step(DT, bandit ?? gtgt);
      if (bandit && f.alive) {
        const tof = bdist / 880 * aimer.leadK;
        const tp = bandit.pos.clone().add(bandit.vel.clone().sub(f.vel).multiplyScalar(tof));
        tp.y += 0.5 * 9.81 * tof * tof;
        const dir = tp.sub(f.pos).normalize();
        const agl = f.pos.y - so.groundAt(f.pos.x, f.pos.z);
        if (agl < pullOutHeight(f.vel, 3.5) + 90) dir.copy(f.forward()).setY(0).normalize().setY(0.8).normalize();
        [pilot.aimYaw, pilot.aimPitch] = aimer.aim(Math.atan2(dir.x, dir.z), Math.asin(dir.y), DT);
        if (aimer.trigger(bdist < aimer.range(550) && f.forward().dot(dir) > 0.996 - aimer.cone, DT)) inp.buttons = 1;
        run.reset();
      } else if (f.alive && so.gt) {
        const set = so.roundSet();
        if (!gtgt?.alive || gtgt.set !== set) {
          const cand = so.gt.list.filter((t) => t.alive && t.set === set && !t.gun);
          const pool = cand.length ? cand : so.gt.list.filter((t) => t.alive && t.set === set);
          pool.sort((a, b) => (a.kind === 'loco' ? -1e6 : 0) + a.pos.distanceTo(f.pos) - ((b.kind === 'loco' ? -1e6 : 0) + b.pos.distanceTo(f.pos)));
          gtgt = pool[0] ?? null;
          run.reset();
        }
        if (gtgt) {
          const tp = gtgt.pos.clone().add(new THREE.Vector3(0, 2, 0));
          const tv = new THREE.Vector3(Math.sin(gtgt.heading) * gtgt.speed, 0, Math.cos(gtgt.heading) * gtgt.speed);
          const axis = gtgt.set === 'train' || gtgt.set === 'convoy' ? new THREE.Vector3(Math.cos(gtgt.heading), 0, -Math.sin(gtgt.heading)) : undefined;
          const dir = run.step(f, tp, tv, 3 / 60, axis).clone();
          if (run.phase === 'dive' && lastPhase !== 'dive') passes++;
          lastPhase = run.phase;
          // human: the aim error only while lined up on the pass (the dive and pull-out stay safe)
          const ay = Math.atan2(dir.x, dir.z), ap = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
          if (run.fire && skill < 1) { pilot.aimYaw = wrap(ay + aimer.ex * 0.5); pilot.aimPitch = ap + aimer.ey * 0.5; }
          else { pilot.aimYaw = ay; pilot.aimPitch = ap; }
          if (aimer.trigger(run.fire, DT)) inp.buttons = 1;
        } else {
          const c = w.formationCenter.clone().sub(f.pos).setY(0).normalize();
          c.y = THREE.MathUtils.clamp((so.groundAt(f.pos.x, f.pos.z) + 300 - f.pos.y) * 0.005, -0.2, 0.3);
          c.normalize();
          pilot.aimYaw = Math.atan2(c.x, c.z); pilot.aimPitch = Math.asin(c.y);
        }
      }
      if (f.alive) { trace.push(`${w.time.toFixed(1)} ${bandit ? 'air ' + bdist.toFixed(0) : (gtgt?.kind ?? '-') + ' ' + run.phase} agl ${(f.pos.y - so.groundAt(f.pos.x, f.pos.z)).toFixed(0)} vy ${f.vel.y.toFixed(0)} aimP ${pilot.aimPitch.toFixed(2)} up ${f.up().y.toFixed(2)}`); if (trace.length > 12) trace.shift(); }
      pilot.throttleCmd = 1;
      // order Blue Two onto our target now and then
      if (k % 400 === 120) game.pilotOps.wing.command('attack');
    } else {
      const f = w.playerFighter!;
      let target = null as THREE.Vector3 | null, tvel = new THREE.Vector3(), bd = 5000;
      // Target choice with commitment (hysteresis): bomber attackers first (raids: the bombers
      // heading for the field), damaged bandits preferred (finish him off); once on a bandit, stay
      // on him for COMMIT s, and after that switch only to one at well under half his score. The
      // old rule (the chased one x0.6) flipped between bandits every few seconds as they turned and
      // extended, spreading the hits over many of them (docs/BALANCE.md, P-51 kills).
      // Night: only the raiders the player can see (World.spotted: coned, close, firing at him).
      const score = (e: Fighter) => {
        const onBombers = w.enemyPilot(e)?.state === 'attack' ? 0.7 : (e.ai as { inbound?: boolean } | null)?.inbound ? 0.35 : 1;
        return e.pos.distanceTo(f.pos) * onBombers * (0.55 + 0.45 * e.structureFrac);
      };
      let pick: Fighter | null = null, ps = Infinity;
      for (const e of w.fighters('axis')) {
        if (!e.alive || !w.spotted(e)) continue;
        const sc = score(e);
        if (sc < ps) { ps = sc; pick = e; }
      }
      const keep = chase && chase.alive && !chase.remove && w.spotted(chase) && chase.pos.distanceTo(f.pos) < 3000;
      commitT += DT;
      if (keep && pick !== chase && (commitT < COMMIT || ps > score(chase!) * 0.45)) pick = chase;
      if (pick !== chase) { if (chase && pick) switches++; chase = pick; commitT = 0; }
      if (pick) { bd = pick.pos.distanceTo(f.pos); target = pick.pos.clone(); tvel.copy(pick.vel); }
      let boss = false;
      if (game.boss.active && bd > 400) {
        for (const t of game.boss.targets()) {
          const d = t.pos.distanceTo(f.pos);
          if (d < bd || !boss) { bd = d; target = t.pos.clone(); tvel.copy(t.vel); boss = true; }
        }
      }
      aimer.step(DT, boss ? 'boss' : pick);
      if (target && f.alive && boss && bd < 320) {
        // break off before flying into the warship, then come round again
        pilot.aimYaw += 0.02; pilot.aimPitch = 0.45;
      } else if (target && f.alive) {
        const tof = bd / 880 * aimer.leadK;
        const tp = target.add(tvel.sub(f.vel).multiplyScalar(tof));
        tp.y += 0.5 * 9.81 * tof * tof;
        const dir = tp.sub(f.pos).normalize();
        [pilot.aimYaw, pilot.aimPitch] = aimer.aim(Math.atan2(dir.x, dir.z), Math.asin(dir.y), DT);
        // heavies are big targets (40+ m span at ENEMY_SCALE): a wider firing cone
        const heavy = pick && (pick.enemyType === 'ju88' || pick.enemyType === 'bf110');
        // a human judges "on target" by where he means the nose to go (his error included)
        const cone = (boss ? 0.993 : heavy ? 0.992 : 0.998) - aimer.cone;
        const aimDir = skill < 1 ? new THREE.Vector3(Math.sin(pilot.aimYaw) * Math.cos(pilot.aimPitch), Math.sin(pilot.aimPitch), Math.cos(pilot.aimYaw) * Math.cos(pilot.aimPitch)) : dir;
        if (aimer.trigger(bd < aimer.range(boss ? 1000 : 500) && f.forward().dot(aimDir) > cone, DT)) inp.buttons = 1;
      } else if (f.alive) {
        // nothing in sight: back to the box (night raid: out along the approach, under the searchlight belt)
        const out = game.pilotOps.raid.night ? 3500 : 0;
        const c = w.formationCenter.clone().addScaledVector(w.formationForward, out).add(new THREE.Vector3(0, 300, 0)).sub(f.pos).normalize();
        pilot.aimYaw = Math.atan2(c.x, c.z); pilot.aimPitch = Math.asin(c.y);
      }
      if (f.alive) { if (!target) pt.none += DT; else if (bd < 600) pt.near += DT; else if (bd < 1500) pt.mid += DT; else pt.far += DT; if (inp.buttons) pt.fire += DT; }
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
    // ---- metrics ----
    const ri = g.roundIdx ?? 0;
    if (ri !== rIdx) { rounds.push({ idx: rIdx, t: w.time - rT0, boss: rBoss, kills: w.stats.kills - rK0, lost: w.stats.bombersLost - rL0, complete: true }); rIdx = ri; rT0 = w.time; rK0 = w.stats.kills; rL0 = w.stats.bombersLost; rBoss = false; }
    if (game.boss.active) {
      rBoss = true;
      if (!bossRec) { bossRec = { round: ri, t: null, ships: game.boss.ships.map((x) => ({ name: x.ship.def.name, t: null as number | null, breach: null as number | null })) }; bosses.push(bossRec); bossT0 = w.time; }
      const rec = bossRec;
      game.boss.ships.forEach((x, i) => { const r = rec.ships[i]; if (r && r.breach === null && x.ship.breached) r.breach = Math.round(w.time - bossT0); if (r && r.t === null && x.deathT >= 0) r.t = Math.round(w.time - bossT0); });
      if (rec.t === null && game.boss.alive === 0) rec.t = Math.round(w.time - bossT0);
    } else if (bossRec) bossRec = null;
    if (w.player) minHp = Math.min(minHp, w.player.integrity);
    wounds = Math.max(wounds, w.crewWounded);
    opts.onStep?.(k);
    if (opts.stopAfterRounds && ri >= opts.stopAfterRounds) { stopped = true; break; }
    if (game.state === 'debrief') break;
  }
  const res = game.state === 'debrief' ? document.querySelector('#debrief .result')?.textContent ?? game.state : stopped ? `STOPPED after ${opts.stopAfterRounds} rounds` : `TIMEOUT (${game.state})`;
  w.events.playerHitFrom = prevHit;
  const end = g.endResult as { success: boolean; reason: string } | null;
  if (!stopped) rounds.push({ idx: rIdx, t: w.time - rT0, boss: rBoss, kills: w.stats.kills - rK0, lost: w.stats.bombersLost - rL0, complete: game.state === 'debrief' && !!end?.success });
  lastMetrics = {
    mission: mission.id, role: mission.role, skill, difficulty: w.difficulty,
    result: res, success: game.state === 'debrief' && end ? end.success : null, failCause: end && !end.success ? end.reason : null,
    stopped, timeout: game.state !== 'debrief' && !stopped, t: Math.round(w.time),
    rounds: rounds.map((r) => ({ ...r, t: Math.round(r.t) })), boss: bosses,
    dmgTaken: Math.round(dmg), hitsTaken: hitsOnMe, minHp: +minHp.toFixed(2), endHp: +(w.player?.integrity ?? 0).toFixed(2), wounds,
    bombersLost: w.stats.bombersLost, kills: w.stats.kills, kpm: +(w.stats.kills / Math.max(1, w.time / 60)).toFixed(2),
    accuracy: +(w.stats.hits / Math.max(1, w.stats.shots)).toFixed(3), shots: w.stats.shots, hits: w.stats.hits, perks,
    extra: mission.role === 'pilot' && !game.pilotOps.raid.active && !game.pilotOps.strafe.active && !passes ? { switches, ...Object.fromEntries(Object.entries(pt).map(([k, v]) => [k, Math.round(v)])) }
      : game.pilotOps.raid.active ? { switches, ...Object.fromEntries(Object.entries(pt).map(([k, v]) => [k, Math.round(v)])), through: game.pilotOps.raid.through, allow: game.pilotOps.raid.def?.allowThrough, down: game.pilotOps.raid.shotDown, jettisoned: game.pilotOps.raid.jettisoned }
      : game.pilotOps.strafe.active || passes ? { objectives: game.pilotOps.strafe.objectives.slice(), passes, ends: game.pilotOps.strafe.log.filter((l) => l.includes('over') || l.includes('scramble')) } : {},
  };
  lastMetrics.extra.ai = { ...AI_STATS };
  log.push(`enemy AI: ${JSON.stringify(AI_STATS)}`);
  if (trace.length && !w.playerFighter?.alive) log.push('last frames: ' + trace.join(' / '));
  if (game.pilotOps.strafe.active || passes) log.push(`strafe: passes ${passes} · destroyed ${JSON.stringify(game.pilotOps.strafe.destroyed)} · objectives ${game.pilotOps.strafe.objectives.join('/')} · ${game.pilotOps.strafe.log.slice(-12).join(' | ')}`);
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
  g.director.direct = () => {};   // own property over Director.direct: no waves, rounds or end conditions
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
  delete g.director.direct;       // back to Director.prototype.direct
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
