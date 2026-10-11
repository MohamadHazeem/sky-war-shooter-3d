// The in-game side of the Phase 5 achievements (rules and store: Feats.ts; definitions:
// Achievements.ts). It attaches itself without touching the frame loop or the mission flow:
//   - achievements.watch(): the begin / end of every mission (MissionFlow already calls
//     achievements.beginMission / endMission), where the end-of-mission rules are judged;
//   - world.events.kill, chained like ServiceRecord does: Blue Two's ordered kill, coned
//     raiders at night, an Me 410 shot down while lining up its BK 5;
//   - an engine updatable: free look time and whether a weather front's storm arrived.
// The few one-off moments elsewhere call achievements.unlock() or a method here directly:
// StrafeOps (the locomotive), SetPieces (the Fw 190 shot before the collision), Bookends
// (belly landing), AircraftGallery (quiz), Theatre (saved moment), SkillTreeScreen (branch).
import type { Game } from './Game';
import type { Mission } from './Missions';
import { Fighter } from '../world/Aircraft';
import { weatherNow } from '../render/WeatherState';
import { achievements } from './Achievements';
import { weeklyKeyOf } from './Weekly';
import {
  BRANCH_SIZE, FREE_LOOK_S, RAID_KINDS, SEARCHLIGHT_KILLS, endFeats, fullestBranch, raidKindOf, recordRaid, trainWrecked,
} from './Feats';

export class FeatWatch {
  private m: Mission | null = null;
  private coned = 0;
  private lookT = 0;
  private stormSeen = false;
  private belly = false;

  constructor(private g: Game) {
    achievements.watch({ begin: (m) => this.begin(m), end: (ok) => this.end(ok) });
    const ev = g.world.events;
    const prevKill = ev.kill;
    ev.kill = (victim, byPlayer, cause) => {
      prevKill?.(victim, byPlayer, cause);
      this.onKill(victim, byPlayer);
    };
    g.engine.add({ update: (dt) => this.update(dt) });
    this.checkSkills(g.prog.skills.owned);
  }

  // Skill tree: a whole branch bought (SkillTreeScreen after a purchase, and at start-up)
  checkSkills(owned: Iterable<string>) {
    if (fullestBranch(owned) >= BRANCH_SIZE) achievements.unlock('specialist');
  }

  // Bookends.startLanding: the gear would not come down
  onBellyLanding() { this.belly = true; }

  private begin(m: Mission) {
    this.m = m;
    this.coned = 0; this.lookT = 0; this.stormSeen = false; this.belly = false;
    const coop = this.g.coop;
    if (coop.role && coop.phase === 'mission') achievements.unlock('fullCrew');
  }

  private end(success: boolean) {
    const m = this.m, g = this.g;
    this.m = null;
    if (!m) return;
    const ops = g.pilotOps;
    const ids = endFeats({
      id: m.id, success,
      raidThrough: ops.raid.active ? ops.raid.through : null,
      stormSeen: this.stormSeen,
      belly: this.belly,
      trainWrecked: m.id === 'strafe-pilot' && trainWrecked(ops.strafe.destroyed),
      weekly: !!weeklyKeyOf(m),
      custom: m.id.startsWith('custom-'),
    });
    for (const id of ids) achievements.unlock(id);
    const kind = raidKindOf(m.id);
    if (kind) {
      achievements.unlock('raider');
      if (recordRaid(kind) >= RAID_KINDS.length) achievements.unlock('strategist');
    }
  }

  private onKill(victim: unknown, byPlayer: boolean) {
    if (!this.m || !(victim instanceof Fighter) || victim.team !== 'axis') return;
    const g = this.g, ops = g.pilotOps;
    if (byPlayer) {
      if (victim.enemyType === 'me410' && g.specials.tactics.liningUp(victim)) achievements.unlock('bigGunSpotter');
      if (ops.raid.night && ops.raid.lights.coned.has(victim) && ++this.coned >= SEARCHLIGHT_KILLS) achievements.unlock('searchlightHunter');
      return;
    }
    // Blue Two: the bandit he was ordered onto, and his rounds the last to hit it
    const wp = ops.wing.pilot;
    if (ops.wing.active && wp && wp.cmd === 'attack' && wp.ordered === victim && victim.lastAttacker === ops.wing.plane) achievements.unlock('teamwork');
  }

  private update(dt: number) {
    const g = this.g;
    if (!this.m || g.state !== 'playing' || g.mission !== this.m) return;
    // the front's storm has arrived once the sky is more than half way turned (Weather.ts)
    if (weatherNow.mood === 'storm' && this.m.weather?.front?.to === 'storm') this.stormSeen = true;
    const looking = this.m.role === 'gunner' ? g.gunner.look > 0.8 : g.pilot.freeLook;
    if (looking && dt > 0 && dt < 0.25) {
      this.lookT += dt;
      if (this.lookT >= FREE_LOOK_S) achievements.unlock('roomWithView');
    }
  }
}
