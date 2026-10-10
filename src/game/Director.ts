import * as THREE from 'three';
import type { Game } from './Game';
import { Mission, Round, roundDef, SpawnFrom, Wave } from './Missions';
import { STATIONS, STATION_ORDER, StationId } from '../world/B17Layout';
import { randomEnemyType, ENEMY_VARIANTS } from '../world/EnemyTypes';
import type { AttackType } from '../world/AI';
import type { Incoming } from '../ui/Radar';
import * as Chatter from './RadioChatter';
import { achievements } from './Achievements';

const R = () => Math.random() * 2 - 1;

// The battle director, ticked by Game.frame() while a mission is live (playing / ending).
// direct() runs one step: tutorial and co-op gates, field promotions, the P-51 scripted
// rounds, the round director (continuous engagement) or the classic wave list / survival
// waves, then flak, bombs away, the escort, crew chatter and the end conditions.
// It owns the spawning state (waves, groups, the next group shown on the radar) and the
// per-round "cleared" flags; rounds are opened and closed by MissionFlow (endRound /
// startNextRound). Order inside direct() matters: the boss director comes first and,
// while a boss battle runs, replaces the normal round director entirely.
export class Director {
  waveIdx = 0;
  waveTimer = 0;
  survivalWave = 0;
  survivalBreak = 0;
  perkWave = 0;        // last wave a perk was offered after
  spawnCd = 0;         // director: time to the next group
  groups = 0;
  roundClear = false;
  roundsComplete = false;
  escortsSpawned = false;
  bombsDropped = false;
  // radar: the next wave's arrival point is decided early so it can be shown
  incomingOff: THREE.Vector3 | null = null;  // relative to the formation centre
  incoming: Incoming | null = null;
  private seenTypes = new Set<string>();
  private chatterT = 0;

  constructor(private g: Game) {}

  // New mission (MissionFlow.startMission)
  reset() {
    this.waveIdx = 0;
    this.waveTimer = 0;
    this.survivalWave = 0;
    this.survivalBreak = 6;
    this.escortsSpawned = false;
    this.bombsDropped = false;
    this.incoming = null; this.incomingOff = null;
    this.perkWave = 0; this.spawnCd = 0; this.groups = 0;
    this.seenTypes.clear(); this.roundClear = false; this.roundsComplete = false;
  }

  // Next round of a round-based mission (MissionFlow.startNextRound)
  beginRound() {
    this.roundClear = false;
    this.groups = 0; this.spawnCd = 0;
  }

  // Continuous engagement: keep the sky full. Groups of 2-4 arrive whenever fewer fighters
  // are in the air than the round's ramping target; the next group shows on the radar.
  private director(dt: number, m: Mission, r: Round, enemies: number) {
    const g = this.g;
    const w = g.world, t = w.time - g.roundT0;
    if (g.boss.director(dt, m, g.roundIdx)) { this.updateIncoming(null, null); if (g.boss.cleared && !this.roundClear && g.state === 'playing') { this.roundClear = true; g.flow.endRound(m); } return; }
    const pace = g.pacing.director(dt, m, r, t, enemies, g.roundIdx), ramp = pace.ramp;
    // adaptive difficulty: ease off when the player is struggling, push when dominating
    g.adaptive.update(w.time, dt, w.player ? w.player.integrity : 1);
    const target = Math.max(1, Math.round((r.min + (r.max - r.min) * ramp) * pace.scale * g.adaptive.mult));
    // round over: stop sending fighters; once the sky is clear (or 30 s on) the round ends
    if (t >= r.duration || pace.done) {
      this.updateIncoming(null, null);
      if (!this.roundClear && (pace.done || t >= r.duration + pace.grace) && g.state === 'playing') { this.roundClear = true; g.flow.endRound(m); }
      return;
    }
    if (t < r.start || pace.hold) { this.updateIncoming(null, null); return; }
    this.spawnCd -= dt;
    const want = target - enemies;
    if (want <= 0) { this.updateIncoming(null, null); return; }
    const sides: SpawnFrom[] = ['front', 'rear', 'left', 'right', 'high'];
    const n = Math.min(want, 2 + Math.floor(Math.random() * 3));
    // gunner: every other group goes for a gun position the player is not manning
    let station: string | undefined;
    if (g.mission?.role === 'gunner' && this.groups > 0 && Math.random() < 0.55) {
      const others = STATION_ORDER.filter((s) => s !== g.gunner.station);
      station = others[Math.floor(Math.random() * others.length)];
    }
    const next: Wave = {
      at: 0, count: Math.max(1, n), station,
      from: this.groups % 3 === 2 ? sides[Math.floor(Math.random() * sides.length)] : (g.mission?.role === 'gunner' ? 'mixed' : sides[this.groups % sides.length]),
      skill: THREE.MathUtils.lerp(r.skill[0], r.skill[1], ramp) * g.adaptive.skill, rockets: r.rockets ?? 0,
    };
    // the first group comes straight away, later ones after a short gap (shown on the radar)
    if (this.groups === 0) this.spawnCd = Math.min(this.spawnCd, r.start - t + 0.01);
    this.updateIncoming(Math.max(0, this.spawnCd), next);
    if (this.spawnCd > 0) return;
    this.spawnWave(next);
    g.specials.onGroup(next); // tactics layer: group tactic / per-type behaviour for the new group
    if (this.groups === 0 && m.waves[0]?.radio) w.callout('round', m.waves[0].radio[0], m.waves[0].radio[1], 0, 3);
    else if (next.station) {
      Chatter.onThreatAt(next.station as StationId);
      g.ui.tip(`Fighters attacking the ${STATIONS[next.station as StationId].label.toUpperCase()} — press <kbd>${STATIONS[next.station as StationId].key}</kbd>`, 2800);
    } else if (w.player) {
      const p = g.world.fighters('axis').filter((f) => f.alive).pop();
      if (p) w.callout('grp' + (this.groups % 4), Math.random() < 0.5 ? 'Tail' : 'Navigator', `${n > 2 ? 'More bandits' : 'Bandits'}, ${w.clockPosition(w.player, p.pos)}!`, 6, 2);
    }
    this.groups++;
    this.spawnCd = (THREE.MathUtils.lerp(7, 3.5, ramp) + Math.random() * 3) * pace.gap;
  }

  private spawnPos(from: SpawnFrom): THREE.Vector3 {
    const c = this.g.world.formationCenter;
    const f = this.g.world.formationForward;
    const left = new THREE.Vector3(0, 1, 0).cross(f).normalize();
    const pick = from === 'mixed' ? (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[Math.floor(Math.random() * 5)] : from;
    const p = c.clone();
    switch (pick) {
      case 'front': p.addScaledVector(f, 5200).addScaledVector(left, R() * 1200).y += 500 + Math.random() * 500; break;
      case 'rear': p.addScaledVector(f, -3300).addScaledVector(left, R() * 900).y += 200 + Math.random() * 400; break;
      case 'left': p.addScaledVector(left, 3600).addScaledVector(f, 600 + R() * 1200).y += Math.random() * 500 - 100; break;
      case 'right': p.addScaledVector(left, -3600).addScaledVector(f, 600 + R() * 1200).y += Math.random() * 500 - 100; break;
      case 'high': p.addScaledVector(f, R() * 2000).addScaledVector(left, R() * 2000).y += 2000 + Math.random() * 500; break;
    }
    return p;
  }

  // Where the next wave will appear, relative to the formation centre. Gunner missions:
  // out where the player's gun is pointing, so the fighters are seen forming up and coming in.
  private predictWave(w: Wave): THREE.Vector3 {
    const world = this.g.world;
    const arc = this.g.mission?.role === 'gunner' ? (w.station ? world.stationArc(w.station) : world.playerArc()) : null;
    const base = arc ? world.playerBomber!.pos.clone().addScaledVector(arc, 1700).add(new THREE.Vector3(R() * 300, 250 + Math.random() * 300, R() * 300)) : this.spawnPos(w.from === 'mixed' ? 'front' : w.from);
    return base.sub(world.formationCenter);
  }

  // Track the next wave for the radar: fix its arrival point once it is < 25 s out
  private updateIncoming(eta: number | null, w: Wave | null, count = w?.count ?? 0) {
    if (eta === null || !w || eta > 25) { this.incoming = null; if (eta === null) this.incomingOff = null; return; }
    if (!this.incomingOff) this.incomingOff = this.predictWave(w);
    this.incoming = { pos: this.g.world.formationCenter.clone().add(this.incomingOff), eta, count };
  }

  spawnWave(w: Wave) {
    const g = this.g, world = g.world;
    const arc = g.mission?.role === 'gunner' ? (w.station ? world.stationArc(w.station) : world.playerArc()) : null;
    const base = world.formationCenter.clone().add(this.incomingOff ?? this.predictWave(w));
    this.incomingOff = null; this.incoming = null;
    for (let i = 0; i < w.count; i++) {
      const fromArc = arc && (i < Math.ceil(w.count * 0.75));
      const p = fromArc || w.from !== 'mixed' ? base.clone().add(new THREE.Vector3(R() * 150 + i * 45, R() * 60, R() * 150)) : this.spawnPos('mixed');
      let attack: AttackType | undefined = w.attack;
      if (!attack) attack = (['headon', 'stern', 'beam', 'high'] as AttackType[])[Math.floor(Math.random() * 4)];
      const tier = g.roundIdx + (g.mission && g.mission.number > 0 ? Math.floor((g.mission.number - 1) / 2) : 0);
      const type = g.modes.enemyType(g.mission, tier) ?? randomEnemyType(tier);
      const f = world.spawnEnemy(p, attack, w.skill, true, Math.random() < (w.rockets ?? 0), type);
      g.modes.onSpawn(f);
      // first sighting of a new type: the crew calls out what it is
      if (!this.seenTypes.has(type) && type !== 'fw190') {
        this.seenTypes.add(type);
        const v = ENEMY_VARIANTS[type];
        world.callout('type' + type, 'Navigator', `${v.label}s coming in — ${v.blurb}!`, 1, 3);
      }
      if (fromArc && w.station) world.assignStation(f, w.station);
    }
    if (w.radio) world.callout('wave' + this.waveIdx, w.radio[0], w.radio[1], 0, 3);
  }

  direct(dt: number) {
    const g = this.g;
    if (g.coop.blocksDirector) return; // co-op guest: the host runs the battle
    const m = g.mission!;
    const w = g.world;
    const t = w.time;
    const enemies = w.activeEnemies().length;
    if (g.onboarding.direct(dt, m)) return;
    // field promotion: every 5 kills, once the kill's slow-motion beat has played
    if (g.killsSincePerk >= 6 && t - g.worldEvents.lastKillAt > 1.2 && g.state === 'playing' && w.player?.alive) {
      g.killsSincePerk = 0;
      g.awardPerk('6 KILLS · FIELD UPGRADE');
    }
    const ops = g.pilotOps.direct(dt, g.roundIdx, t - g.roundT0); // P-51 missions (PilotOps.ts)
    g.score += ops.score;
    if (ops.fail && !g.endResult) { g.flow.finish(false, ops.fail); return; } // raid missions: too many bombers through (RaidDefence.ts)
    if (ops.scripted) {
      this.incoming = ops.incoming; this.incomingOff = null;
      if (ops.roundOver && !this.roundClear && g.state === 'playing') { this.roundClear = true; g.flow.endRound(m); }
    } else if (m.round) {
      this.director(dt, m, roundDef(m, g.roundIdx), enemies);
    } else if (m.waves.length) {
      this.waveTimer += dt;
      const next = m.waves[this.waveIdx];
      // field promotion: every 5 kills, once the kill's slow-motion beat has played
      if (g.killsSincePerk >= 5 && t - g.worldEvents.lastKillAt > 1.2 && g.state === 'playing' && w.player?.alive) {
        g.killsSincePerk = 0;
        g.awardPerk('5 KILLS · FIELD PROMOTION');
        return;
      }
      // a wave wiped out with more to come: pick a perk (the next wave waits)
      if (next && enemies === 0 && this.waveIdx > 0 && this.perkWave < this.waveIdx && this.waveTimer > 2.5 && g.state === 'playing' && w.player?.alive) {
        this.perkWave = this.waveIdx; g.killsSincePerk = 0;
        g.awardPerk(`WAVE ${this.waveIdx} CLEARED`);
        return;
      }
      if (next) {
        const ready = next.afterClear ? (enemies === 0 && this.waveTimer > 6) || this.waveTimer > 75 : t >= next.at;
        this.updateIncoming(next.afterClear ? (enemies === 0 ? Math.max(0, 6 - this.waveTimer) : 75 - this.waveTimer) : next.at - t, next);
        if (ready) {
          this.spawnWave(next); this.waveIdx++; this.waveTimer = 0;
          // between waves the gunners restock and the Mustang's guns are topped up
          if (this.waveIdx > 1) {
            g.gunner.resetAmmo();
            if (w.playerFighter) { g.applyLoadout(true); g.ui.tip('Guns topped up', 1800); }
          }
        }
      }
    } else if (m.duration === Infinity) {
      // Survival: endless escalating waves
      this.waveTimer += dt;
      if (enemies === 0 || this.waveTimer > 90) {
        if (enemies === 0 && this.survivalWave > 0 && this.perkWave < this.survivalWave && g.state === 'playing' && w.player?.alive) {
          this.perkWave = this.survivalWave;
          g.awardPerk(`WAVE ${this.survivalWave} SURVIVED`);
          return;
        }
        this.survivalBreak -= dt;
        const nextN = Math.min(14, 2 + Math.floor((this.survivalWave + 1) * 1.4));
        const nextFrom: SpawnFrom = (this.survivalWave + 1) % 3 === 0 ? 'mixed' : (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[(this.survivalWave + 1) % 5];
        this.updateIncoming(Math.max(0, this.survivalBreak), { at: 0, count: nextN, from: nextFrom, skill: 1 });
        if (this.survivalBreak <= 0) {
          this.survivalWave++;
          achievements.onSurvivalWave(this.survivalWave);
          const n = Math.min(14, 2 + Math.floor(this.survivalWave * 1.4));
          const skill = Math.min(1.5, 0.75 + this.survivalWave * 0.06);
          const from: SpawnFrom = this.survivalWave % 3 === 0 ? 'mixed' : (['front', 'rear', 'left', 'right', 'high'] as SpawnFrom[])[this.survivalWave % 5];
          this.spawnWave({ at: 0, count: n, from, skill, rockets: this.survivalWave >= 3 ? 0.3 : 0 });
          g.ui.banner('INCOMING', `Wave ${this.survivalWave}`, 2500);
          this.survivalBreak = 8;
          this.waveTimer = 0;
          if (this.survivalWave > 1) {
            g.score += 150;
            // patch up the guns between waves
            g.gunner.resetAmmo();
            if (w.playerFighter) w.playerFighter.guns.forEach((gun) => (gun.ammo = Math.min(350, gun.ammo + 150)));
          }
        }
      } else if (this.incoming) {
        this.incoming = null; this.incomingOff = null;
      }
    }
    // Flak
    if (m.flak) {
      const inFlak = t >= m.flak.start && t <= m.flak.end;
      w.flakIntensity = inFlak ? m.flak.intensity : 0;
      if (inFlak && t - dt < m.flak.start) w.callout('flak', 'Navigator', 'Flak ahead. Initial point in two minutes — here it comes.', 0, 3);
    }
    if (m.bombsAway && !this.bombsDropped && t >= m.bombsAway) {
      this.bombsDropped = true;
      g.dropBombs();
      w.callout('bombs', 'Bombardier', 'Bombs away! Let\'s get out of here!', 0, 3);
      g.score += 200;
    }
    if (m.escortArrive && !this.escortsSpawned && t >= m.escortArrive) {
      this.escortsSpawned = true;
      for (let i = 0; i < 4; i++) w.spawnEscort(w.formationCenter.clone().add(new THREE.Vector3(R() * 400, 600, -1500 - i * 80)), new THREE.Vector3((i - 1.5) * 200, 300, 0));
      w.callout('escort', 'Radio', 'Little friends at six o\'clock high! The Mustangs are here!', 0, 3);
    }

    // Crew intercom during lulls in the fighting
    this.chatterT += dt;
    if (enemies === 0 && this.chatterT > 32 && t > 12) {
      this.chatterT = Math.random() * 8;
      const gunner: [string, string][] = [
        ['Pilot', 'Pilot to crew, oxygen check. Sound off.'],
        ['Tail', 'Tail gunner, oxygen okay.'],
        ['Navigator', 'Navigator to pilot: on course, two-seven minutes to the IP.'],
        ['Ball Turret', 'Ball turret. Nothing below but cloud. Guns are clear.'],
        ['Radio', 'Radio to pilot: group says keep it tight, fighters reported ahead.'],
        ['Top Turret', 'Engineer to pilot: number three\'s running a little hot. Watching it.'],
        ['Bombardier', 'Bombardier here. Keep your eyes open, they like to come out of the sun.'],
        ['Pilot', 'Stay off the interphone unless you see fighters. Keep scanning.'],
      ];
      const pilot: [string, string][] = [
        ['Lead', 'Blue flight, check your fuel. Weave over the big friends.'],
        ['Big Friend', 'Little friends, little friends, thanks for the company.'],
        ['Lead', 'Keep your heads on a swivel. They\'ll come out of the sun.'],
        ['Blue Three', 'Blue Three, engine temps okay. Holding high cover.'],
      ];
      const lines = m.role === 'gunner' ? gunner : pilot;
      const [who, text] = lines[Math.floor(Math.random() * lines.length)];
      w.callout('chatter', who, text, 25, 1);
    }

    // ---- End conditions ----
    if (g.endResult) return;
    const pl = w.player;
    if (pl && !pl.alive) {
      const cause = w.lastKillCause;
      const why = cause === 'cockpit' ? 'Both pilots were hit and the Sky Queen fell out of control.'
        : cause === 'tail' ? 'The tail was shot away.'
        : cause.startsWith('wing') ? 'A wing was shot off.'
        : cause === 'all engines' ? 'All four engines were knocked out.'
        : 'The Sky Queen was shot down.';
      g.flow.finish(false, m.role === 'gunner' ? `${why} The crew bailed out over enemy territory.` : pl.pos.y < 300 ? 'Your Mustang flew into the ground.' : 'Your Mustang was shot down.', m.role === 'gunner');
      return;
    }
    if (m.role === 'gunner' && w.crewWounded >= 4) {
      g.flow.finish(false, 'You were seriously wounded and could no longer man your gun.');
      return;
    }
    if (m.maxBombersLost !== undefined && w.stats.bombersLost > m.maxBombersLost) {
      g.flow.finish(false, `Too many bombers lost — ${w.stats.bombersLost} Fortresses went down.`);
      return;
    }
    const roundDone = m.round ? this.roundsComplete : false;
    if (roundDone || (!m.round && m.waves.length && this.waveIdx >= m.waves.length && enemies === 0 && t >= Math.min(m.duration, (m.flak?.end ?? 0) + 5))) {
      if (!m.bombsAway || this.bombsDropped) {
        if (!m.escortArrive || this.escortsSpawned) g.flow.finish(true, m.success ?? (m.role === 'gunner' ? 'The formation fought its way through. Good shooting, gunner.' : 'The bombers made it through. Outstanding work, Blue Leader.'));
      }
    }
  }
}
