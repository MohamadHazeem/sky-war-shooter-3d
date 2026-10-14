import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { survivalMission } from '../game/Missions';
import { STATIONS, type StationId } from '../world/B17Layout';
import type { Fighter } from '../world/Aircraft';
import type { CrewId } from '../world/Crew';
import type { EnemyPilot } from '../world/AI';
import type { Personality, Signature } from '../world/PilotMind';

// Enemy AI 2.0 sequences from the gunner's seats (Phase 10 goal 11). Dev only. Each scenario
// starts a quiet gunner mission (the director is held), spawns the fighters for one behaviour,
// tracks the lead fighter with the player's gun and saves a JPEG every `every` seconds through
// tools/gallery/save-server.mjs (POST /save?file=...). Hidden tabs: everything is stepped here.
//
//   const qa = (await import('/src/dev/aiQa.ts')).aiQa(sws.engine, sws.game)
//   await qa.run('rotte', { port: 5319, dir: 'ai11' })   -> { files, log, radio }
//
// Scenarios: rotte (a pair, staggered, at the waist), evade (the gun hammers a cautious pilot:
// break / split-S), zoom / splitS / corkscrew (an ace's signature move, from the seat that has
// the counter), limp (a damaged fighter heading home), weak (the tail gunner is wounded: the
// fighter comes through the tail's sector, the crew calls it).

type Scenario = 'rotte' | 'evade' | 'zoom' | 'splitS' | 'corkscrew' | 'limp' | 'weak';
interface Opts { port?: number; dir?: string; every?: number; seconds?: number; save?: boolean }

const _v = new THREE.Vector3();

export function aiQa(engine: Engine, game: Game) {
  const g = game as any;

  function start(station: StationId) {
    game.bookends.auto = true;
    game.startMission({ ...survivalMission('gunner'), station, weather: { sunEl: 34, sunAz: 150, low: 0.3, high: 0.15 } });
    for (let i = 0; i < 30; i++) engine.frame(1 / 60, false);
    // hold the director: only our fighters fly
    g.director.direct = () => {};
    for (const f of game.world.fighters('axis')) f.remove = true;
    for (let i = 0; i < 4; i++) engine.frame(1 / 60, false);
  }

  // put a spawned fighter out in a station's arc, heading for the bomber
  function spawnIn(station: StationId, range: number, type = 'fw190', yawOff = 0, up = 0.15): Fighter {
    const w = game.world, pb = w.playerBomber!;
    const arc = w.stationArc(station)!.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawOff);
    arc.y += up; arc.normalize();
    const pos = pb.pos.clone().addScaledVector(arc, range);
    const f = g.specials.tactics.spawn(type, 1, 1.3)[0] as Fighter;
    // toughened for the record: the sequence has to last long enough to see the behaviour
    f.maxStructure *= 10; f.structure = f.maxStructure;
    for (const z of f.zones) { z.maxHp *= 10; z.hp = z.maxHp; }
    g.specials.tactics.place(f, pos, pb.pos.clone().sub(pos).setY(0).normalize(), 175);
    return f;
  }

  const pilotOf = (f: Fighter) => game.world.enemyPilot(f)!;
  function persona(p: EnemyPilot, personality: Personality, q: number, signature: Signature | null = null, ace = false) {
    p.setPersona({ personality, signature, ace, q, known: false });
  }

  // aim the player's gun at a fighter (the gun's own limits apply)
  function track(f: Fighter | null) {
    const gun = g.gunner, pb = game.world.playerBomber!;
    if (!f || !f.alive) return;
    const def = STATIONS[gun.station as StationId];
    const local = pb.worldToLocal(_v.copy(f.pos)).sub(def.pivot);
    let dy = Math.atan2(local.x, local.z) - def.rest.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    gun.state.tYaw = THREE.MathUtils.clamp(dy, def.yaw[0], def.yaw[1]);
    gun.state.tPitch = THREE.MathUtils.clamp(Math.asin(local.y / local.length()) - def.rest.pitch, def.pitch[0], def.pitch[1]);
  }

  async function save(file: string, port: number) {
    const url = engine.renderer.domElement.toDataURL('image/jpeg', 0.85);
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: url });
    return r.text();
  }

  async function run(name: Scenario, o: Opts = {}) {
    const port = o.port ?? 5319, dir = o.dir ?? 'ai11', every = o.every ?? 1, seconds = o.seconds ?? 14;
    const w = game.world;
    const radio: string[] = [];
    let lead: Fighter, follow: Fighter | null = null;
    let fire = (_t: number) => false;
    const station: StationId = name === 'zoom' ? 'top' : name === 'splitS' ? 'ball' : name === 'weak' ? 'tail' : name === 'limp' ? 'waistR' : 'waistL';
    start(station === 'tail' ? 'waistL' : station);
    const prevRadio = w.events.radio;
    w.events.radio = (s, t, p) => { radio.push(`${w.time.toFixed(1)}s ${s}: ${t}`); prevRadio?.(s, t, p); };
    switch (name) {
      case 'rotte': {
        lead = spawnIn('waistL', 1500, 'fw190', -0.1);
        follow = spawnIn('waistL', 1650, 'bf109', 0.05, 0.2);
        const L = pilotOf(lead), W = pilotOf(follow);
        persona(L, 'cunning', 0.8); persona(W, 'cunning', 0.8);
        W.wing = { leader: L, i: 1, delay: 2.2 };
        break;
      }
      case 'evade': {
        lead = spawnIn('waistL', 1300);
        persona(pilotOf(lead), 'cautious', 0.9);
        fire = () => true;   // the player's gun keeps firing at him: tracers close -> he breaks
        break;
      }
      case 'zoom': case 'splitS': case 'corkscrew': {
        // the split-S comes out of a waist attack and goes down past the ball turret
        const st: StationId = name === 'zoom' ? 'top' : 'waistL';
        lead = spawnIn(st, 1400, 'fw190', 0, 0.1);
        const p = pilotOf(lead);
        persona(p, name === 'zoom' ? 'cunning' : 'aggressive', 0.9, name, true);
        p.rng = () => 0.1;   // always fly the signature move for the record
        p.station = st;
        break;
      }
      case 'limp': {
        lead = spawnIn('waistR', 900, 'fw190', 0.2);
        persona(pilotOf(lead), 'cautious', 0.6);
        lead.structure = lead.maxStructure * 0.36;
        for (const z of lead.zones) if (z.engine !== undefined) z.hp = z.maxHp * 0.15;
        break;
      }
      case 'weak': {
        w.crew.wound('tail' as CrewId);
        lead = spawnIn('waistL', 2600, 'fw190', 1.2, 0.2);
        const p = pilotOf(lead);
        persona(p, 'cunning', 0.95);
        p.rng = () => 0.5;
        p.target = null;   // he picks his target and run now: the player's ship
        w.playerFocus = 1;
        break;
      }
    }
    const files: string[] = [];
    const log: string[] = [];
    const dt = 1 / 60;
    let next = 0.5;
    const t0 = w.time;
    if (name === 'weak') {
      // the crew calls the weak sector; the gunner moves to the tail
      for (let i = 0; i < 90; i++) engine.frame(dt, false);
      g.gunner.requestStation('tail');
    }
    for (let i = 0; i < seconds * 60; i++) {
      const t = w.time - t0;
      const tgt = lead!.alive ? lead! : follow;
      track(tgt);
      g.input.buttons = fire(t) && tgt?.alive ? 1 : 0;
      g.input.locked = true;
      const shot = t >= next;
      engine.frame(dt, shot);
      if (Math.round(t * 60) % 15 === 0) {
        const p = w.enemyPilot(lead!);
        log.push(`${t.toFixed(1)}s ${lead!.alive ? `${p?.state}${p?.recover ? '/' + p.recover : ''}${p?.evasion ? '/' + p.evasion : ''} st=${p?.station ?? '-'} d=${lead!.pos.distanceTo(w.playerBomber!.pos).toFixed(0)} v=${lead!.fm.speed.toFixed(0)} y=${(lead!.pos.y - w.playerBomber!.pos.y).toFixed(0)} p=${p?.pressure.toFixed(1)}` : 'down'}${follow ? ` | wing ${w.enemyPilot(follow)?.state} d=${follow.pos.distanceTo(w.playerBomber!.pos).toFixed(0)}` : ''}`);
      }
      if (shot) {
        next += every;
        const file = `${dir}/${name}-${t.toFixed(1).replace('.', '_')}.jpg`;
        if (o.save !== false) { await save(file, port); files.push(file); }
      }
    }
    g.input.buttons = 0;
    w.events.radio = prevRadio;
    return { files, log, radio };
  }

  return { run, start, track };
}
