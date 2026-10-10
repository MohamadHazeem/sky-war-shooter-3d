// SkillRuntime: wires the skill tree (Skills.ts) into a running game. Most nodes are plain
// loadout multipliers that Progression.loadout() already folds in (damage taken, heat, rate,
// spread, hit radius, aim assist, kill repairs). This file carries the rest:
//   - pushes the loadout's skill fields to the systems that own them: World (crew wound
//     chance, extinguishers), GunnerController (Iron Lungs) and Abilities (cooldowns,
//     durations, Overdrive kill extension);
//   - critical hits on cockpits and engines and Fortress, by chaining ballistics.onHit (the
//     same way CrewRoster taps it), and Deadeye by wrapping ballistics.fire;
//   - Damage Control in-flight patching, Second Wind and the Sweet Spot boss tuning per frame;
//   - the "Skills" entry on the title menu.
//
// Game.ts hooks (one line each):
//   constructor (after the ServiceRecord)  this.skills = new SkillRuntime(this, ui);
//   startMenu, after service.onTitle()      this.skills.onTitle();
//   startMission, at the end                this.skills.onMissionStart();
//   applyLoadout, after this.gunner...      this.skills.applyLoadout(l);
//   startNextRound, after applyLoadout      this.skills.onRoundStart();
//   frame, after abilities.update(dt)       this.skills.update(dt);
//   drawLeadPip                             const muzzle = this.loadout.leadVel || (pilot ? 880 : 870);
import * as THREE from 'three';
import type { Game } from './Game';
import type { UI } from '../ui/UI';
import type { Aircraft } from '../world/Aircraft';
import type { BossShip } from '../world/BossShip';
import type { Loadout } from './Upgrades';
import { SKILLS, interceptVelocity, skillDefaults, type SkillLoadout } from './Skills';
import { hideTip, showSkillTree } from '../ui/SkillTreeScreen';

const DEADEYE_CONE = THREE.MathUtils.degToRad(8);
const DEADEYE_RANGE = 1300;
const DEADEYE_TRACER: [number, number, number] = [14, 11, 5];
const REGEN_QUIET = 8;            // seconds without damage before Damage Control patches
const SECOND_WIND_AT = 0.25;      // a vital part (or the whole airframe) this low triggers Second Wind
const ROUND_PATCH = 0.3;          // Game's own between-round patch-up (Game.startNextRound)

// About to come apart: a part whose loss downs the aircraft (a P-51's engine too) is under 25%
export function inDanger(a: Aircraft, integ = a.integrity): boolean {
  if (integ < SECOND_WIND_AT) return true;
  const fighter = a.zones.length < 10;   // the P-51 / Fw 190 layout: a dead engine finishes it
  for (const z of a.zones) {
    if (!(z.critical || (fighter && z.engine !== undefined)) || z.hp <= 0) continue;
    if (z.hp < z.maxHp * SECOND_WIND_AT) return true;
  }
  return false;
}

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _sv = new THREE.Vector3();

export class SkillRuntime {
  private L: SkillLoadout = skillDefaults();
  private fortressUsed = false;
  private secondWindUsed = false;
  private quietT = 0;
  private lastInteg = 1;
  private lastPlayer: Aircraft | null = null;
  private playerRounds = 0;
  private tuned = new WeakSet<object>();

  constructor(private game: Game, private ui: UI) {
    this.tapBallistics();
  }

  // ---------------- hooks ----------------

  // Game.applyLoadout: the loadout's skill fields to the systems that use them
  applyLoadout(l: Loadout) {
    this.L = l;
    const g = this.game, w = g.world;
    w.crewWoundMult = l.crewWound;
    w.extinguishChance = l.extinguish;
    w.extinguisherBottles = l.bottles;
    g.gunner.noOverheat = l.ironLungs;
    g.abilities.setTuning({ cooldown: l.cooldownMult, duration: { mustangs: 1, overdrive: l.overdriveDur, focus: l.focusDur }, odKillExtend: l.ironLungs ? 1 : 0 });
  }

  // Game.startMission (end): once-per-mission and once-per-round effects are ready again
  onMissionStart() {
    hideTip();
    this.fortressUsed = false;
    this.secondWindUsed = false;
    this.quietT = 0;
    this.playerRounds = 0;
    this.lastPlayer = this.game.world.player;
    this.lastInteg = this.lastPlayer?.integrity ?? 1;
  }

  // Game.startNextRound (after its patch-up): Damage Control's extra repairs, Fortress re-armed
  onRoundStart() {
    this.fortressUsed = false;
    const extra = ROUND_PATCH * (this.L.repairMult - 1);
    const pl = this.game.world.player;
    if (extra > 0 && pl) for (const z of pl.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * extra);
    if (pl) this.lastInteg = pl.integrity;
  }

  // Game.frame, after abilities.update
  update(dt: number) {
    const g = this.game, w = g.world;
    if (!g.mission || g.state !== 'playing' || dt <= 0) return;
    const pl = w.player;
    if (pl !== this.lastPlayer) { this.lastPlayer = pl; this.lastInteg = pl?.integrity ?? 1; this.quietT = 0; }
    if (pl?.alive) {
      const integ = pl.integrity;
      this.quietT = integ < this.lastInteg - 1e-6 ? 0 : this.quietT + dt;
      // Second Wind: one big patch-up when the aircraft is about to come apart
      if (this.L.secondWind > 0 && !this.secondWindUsed && inDanger(pl, integ)) {
        this.secondWindUsed = true;
        this.patch(pl, this.L.secondWind);
        this.ui.banner('SECOND WIND', `The crew patched her up · +${Math.round(this.L.secondWind * 100)}% integrity`, 2600);
        w.callout('sk_wind', g.mission.role === 'gunner' ? 'Engineer' : 'Lead', g.mission.role === 'gunner' ? 'Patched the worst of it, skipper! She\'ll hold!' : 'You\'re streaming smoke but still flying, Blue two. Stay in it!', 0, 3);
      }
      // Damage Control: steady in-flight patching once the shooting stops
      if (this.L.regen > 0 && this.quietT > REGEN_QUIET) this.patch(pl, this.L.regen * dt);
      this.lastInteg = pl.integrity;
    }
    if (this.L.bossBreach) this.tuneBosses();
  }

  // Game.startMenu, after the ServiceRecord entries: "Skills" on the title menu
  onTitle() {
    const menu = document.querySelector<HTMLElement>('#title .menu');
    if (!menu) return;
    menu.querySelector('[data-a="skills"]')?.remove();
    const book = this.game.prog.skills;
    const n = book.available(this.xp());
    const b = document.createElement('button');
    b.dataset.a = 'skills';
    b.innerHTML = `Skills <small>${n ? `${n} point${n > 1 ? 's' : ''} to spend` : `${book.owned.size}/${SKILLS.length} qualified`}</small>${n ? '<i class="svc-dot" aria-label="skill points waiting"></i>' : ''}`;
    b.addEventListener('click', () => this.open());
    const armory = menu.querySelector('[data-a="armory"]');
    menu.insertBefore(b, armory ? armory.nextSibling : null);
  }

  open() {
    showSkillTree({ prog: this.game.prog, xp: () => this.xp(), back: () => this.game.startMenu() });
  }

  private xp() { return this.game.service?.career.xp ?? 0; }

  // ---------------- internals ----------------

  private patch(a: Aircraft, frac: number) {
    for (const z of a.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * frac);
  }

  // Sweet Spot: bigger weak points, one part fewer to breach, double hull chip damage
  private tuneBosses() {
    for (const a of this.game.world.aircraft) {
      if (!(a as Partial<BossShip>).boss || this.tuned.has(a) || !a.alive) continue;
      this.tuned.add(a);
      const s = a as BossShip;
      for (const p of s.parts) if (p.alive) p.zone.radius *= 1.3;
      s.breachNeed = Math.max(1, s.breachNeed - 1);
      if (!s.breached) s.armourMult = Math.min(1, s.armourMult * 2);
    }
  }

  private tapBallistics() {
    const w = this.game.world, b = w.ballistics;
    // crits and Fortress run before World.onHit (and before anyone else chained later)
    const prevHit = b.onHit;
    b.onHit = (e) => {
      const L = this.L;
      if (e.playerShot && L.critMult !== 1 && e.target.team === 'axis' && /^(cockpit|engine)/.test(e.zone.name)) e.damage *= L.critMult;
      if (L.fortress && !this.fortressUsed && e.cannon && !e.playerShot && e.target === w.player && this.game.state === 'playing') {
        this.fortressUsed = true;
        w.effects.sparks(e.point, e.target.vel, true);
        w.callout('sk_fortress', this.game.mission?.role === 'pilot' ? 'Lead' : 'Pilot', 'That one bounced right off the armour plate!', 0, 2);
        this.ui.tip('FORTRESS — heavy hit glanced off', 1800);
        return;
      }
      prevHit?.(e);
    };
    // Deadeye: every Nth player round is laid onto the bandit nearest the aim
    const fire = b.fire.bind(b);
    b.fire = (pos, vel, team, damage, tracer, color, owner, cannon = false, player = false, ttl?) => {
      if (player && this.L.deadeye > 0 && owner && ++this.playerRounds % this.L.deadeye === 0) {
        const v = this.deadeye(pos, vel, owner);
        if (v) return fire(pos, v, team, damage, true, DEADEYE_TRACER, owner, cannon, player, ttl);
      }
      return fire(pos, vel, team, damage, tracer, color, owner, cannon, player, ttl);
    };
  }

  private deadeye(pos: THREE.Vector3, vel: THREE.Vector3, owner: Aircraft): THREE.Vector3 | null {
    const sv = _sv.copy(owner.vel);
    const dir = _d.copy(vel).sub(sv);
    const muzzle = dir.length();
    if (muzzle < 1) return null;
    dir.divideScalar(muzzle);
    let best: Aircraft | null = null, bestAng = DEADEYE_CONE;
    for (const a of this.game.world.aircraft) {
      if (a.team !== 'axis' || !a.alive || a.remove) continue;
      const d = a.pos.distanceTo(pos);
      if (d > DEADEYE_RANGE) continue;
      const t = d / muzzle;
      _p.copy(a.vel).sub(sv).multiplyScalar(t).add(a.pos).sub(pos);
      const ang = _p.angleTo(dir);
      if (ang < bestAng) { bestAng = ang; best = a; }
    }
    if (!best) return null;
    const v = interceptVelocity(pos, sv, muzzle, best.pos, best.vel);
    return v ? new THREE.Vector3(v.x, v.y, v.z) : null;
  }
}
