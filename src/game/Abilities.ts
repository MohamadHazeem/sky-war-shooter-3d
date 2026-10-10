import type { Engine } from '../core/Engine';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Gun } from '../world/Aircraft';
import { AbilityBar, AbilitySlotView } from '../ui/AbilityBar';
import { playAbilityCue, playAbilityDenied, playAbilityReady } from '../audio/AbilitySounds';
import { spawnSweep, SweepPilot, SWEEP_TIME } from './MustangSweep';

const MUSTANG_INBOUND = 4; // seconds of dive before the sweep proper

// Active abilities the player triggers, each on its own cooldown. Cooldowns run down with
// mission time, and every confirmed kill knocks a few more seconds off.
//   Mustangs  (gunner Q / pilot Z): a flight of P-51s dives in and sweeps the bandits around
//             the player for SWEEP_TIME seconds, then climbs out.               cooldown 90 s
//   Overdrive (gunner E / pilot X): 8 s of no barrel heat and +35% rate of fire, white-hot
//             tracers and a glowing barrel.                                      cooldown 45 s
//   Focus     (G, both roles): 3 s (real time) of bullet-time with a blue-grey tint; the gun
//             sight stays responsive in real time.                               cooldown 40 s
// Keys avoid the existing bindings: 1-5 seats, R reload, Space fire, I/J/K/L + arrows key aim,
// Tab map, H help, P/Esc pause, F photo mode, and in the P-51 W/S/A/D/Q/E, V, M, C.
//
// Game hooks: new Abilities(...) in the constructor, reset(role) in startMission and
// update(dt) in frame() just after the kill slow-motion block (so Focus can override the
// time scale and Overdrive can raise the gunner's rateBoost after Game sets it).
// Skill tree (Skills.ts / SkillRuntime.ts): setTuning() scales cooldowns and durations; with
// odKillExtend each kill during Overdrive adds that many seconds to it (Iron Lungs).

export type AbilityId = 'mustangs' | 'overdrive' | 'focus';
type Role = 'gunner' | 'pilot';

export interface AbilityTuning { cooldown: number; duration: Record<AbilityId, number>; odKillExtend: number }
export const neutralTuning = (): AbilityTuning => ({ cooldown: 1, duration: { mustangs: 1, overdrive: 1, focus: 1 }, odKillExtend: 0 });

interface Def { id: AbilityId; name: string; cooldown: number; duration: number; killCharge: number; startCd: number; keys: Record<Role, [string, string]> }

const DEFS: readonly Def[] = [
  { id: 'mustangs', name: 'Mustangs', cooldown: 90, duration: SWEEP_TIME + MUSTANG_INBOUND, killCharge: 5, startCd: 30, keys: { gunner: ['KeyQ', 'Q'], pilot: ['KeyZ', 'Z'] } },
  { id: 'overdrive', name: 'Overdrive', cooldown: 45, duration: 8, killCharge: 4, startCd: 0, keys: { gunner: ['KeyE', 'E'], pilot: ['KeyX', 'X'] } },
  { id: 'focus', name: 'Focus', cooldown: 40, duration: 3, killCharge: 4, startCd: 0, keys: { gunner: ['KeyG', 'G'], pilot: ['KeyG', 'G'] } },
];

const MUSTANG_COUNT = 4;
const OVERDRIVE_RATE = 1.35;
const FOCUS_SCALE = 0.3;      // engine time scale during Focus
const FOCUS_EASE_IN = 0.2;    // real seconds to slow down / speed back up
const FOCUS_EASE_OUT = 0.3;
const OD_TRACER: [number, number, number] = [14, 5.5, 1.6];

// Radio lines on use (no recorded clip: interphone click + subtitle)
const LINES: Record<AbilityId, Record<Role, [string, string]>> = {
  mustangs: { gunner: ['Radio', 'Little friends coming in!'], pilot: ['Lead', 'Little friends coming in! Red flight, sweep the bombers!'] },
  overdrive: { gunner: ['Pilot', 'Pour it on, gunner! Give \'em everything!'], pilot: ['Lead', 'Give \'em everything you\'ve got, Blue two!'] },
  focus: { gunner: ['Navigator', 'Steady... take your time. Lead him.'], pilot: ['Lead', 'Steady, Blue two... line him up.'] },
};

interface Slot { def: Def; cd: number; active: number; view: AbilitySlotView }

// P-51 guns boosted by Overdrive: restored on the way out unless a loadout change rebuilt them
interface GunBoost { gun: Gun; rate: number; boosted: number; every: number; color: [number, number, number] }

export class Abilities {
  private bar = new AbilityBar();
  private slots: Slot[] = DEFS.map((def) => ({ def, cd: 0, active: 0, view: { id: def.id, name: def.name, key: def.keys.gunner[1], cd: 0, cdLeft: 0, active: 0, ready: true } }));
  private role: Role = 'gunner';
  private lastKills = 0;
  private lastScale = 1;        // engine.timeScale the current frame's dt was scaled by
  private focusT = 0;           // real seconds into Focus (-1 = off)
  private focusOn = false;
  private flight: SweepPilot[] = [];
  private boosts: GunBoost[] = [];
  private tipShown = false;
  private missionT = 0;
  private tuning: AbilityTuning = neutralTuning();

  constructor(private engine: Engine, private input: Input, private ui: UI, private game: Game) {}

  // New mission: keys for the role, cooldowns reset, all effects off
  reset(role: Role) {
    this.role = role;
    this.endFocus();
    this.endOverdrive();
    this.flight.length = 0;
    this.lastKills = 0;
    this.lastScale = this.engine.timeScale;
    this.tipShown = false;
    this.missionT = 0;
    for (const s of this.slots) {
      s.cd = s.def.startCd * this.tuning.cooldown; s.active = 0;
      s.view.key = s.def.keys[role][1];
      s.view.ready = s.cd <= 0;
    }
    this.bar.build(this.slots.map((s) => s.view));
    this.bar.show(true);
  }

  get(id: AbilityId) { return this.slots.find((s) => s.def.id === id)!; }

  // Skill tree: cooldown and duration multipliers (applied from the next trigger / reset)
  setTuning(t: AbilityTuning) { this.tuning = t; }
  cooldownOf(s: Slot) { return s.def.cooldown * this.tuning.cooldown; }
  durationOf(s: Slot) { return s.def.id === 'mustangs' ? s.def.duration : s.def.duration * this.tuning.duration[s.def.id]; }

  // Trigger an ability (keys, or the dev console: sws.game.abilities.trigger('focus')).
  // force skips the cooldown check (testing).
  trigger(id: AbilityId, force = false): boolean {
    const s = this.get(id);
    const g = this.game, w = g.world;
    if (g.state !== 'playing' || g.photo.active || !w.player?.alive) return false;
    if (!force && (s.cd > 0 || s.active > 0)) { this.bar.deny(id); playAbilityDenied(); return false; }
    s.cd = this.cooldownOf(s);
    s.active = this.durationOf(s);
    s.view.ready = false;
    if (id === 'mustangs') this.callMustangs();
    else if (id === 'overdrive') this.startOverdrive();
    else this.startFocus();
    playAbilityCue(id);
    const [who, text] = LINES[id][this.role];
    w.callout('ab_' + id, who, text, 0, 2);
    return true;
  }

  update(dt: number) {
    const g = this.game, eng = this.engine;
    const realDt = dt / Math.max(0.05, this.lastScale);
    const live = !!g.mission && (g.state === 'playing' || g.state === 'ending' || g.state === 'paused');
    if (!live) {
      if (this.focusOn) this.endFocus();
      this.endOverdrive();
      this.bar.show(false);
      this.lastScale = eng.timeScale;
      return;
    }
    this.bar.show(true);
    this.missionT += dt;

    // kills recharge every ability a little
    const kills = g.world.stats.kills;
    if (kills > this.lastKills) {
      const n = kills - this.lastKills;
      for (const s of this.slots) if (s.cd > 0) s.cd = Math.max(0, s.cd - s.def.killCharge * n);
      const od = this.slots[1];
      if (this.tuning.odKillExtend > 0 && od.active > 0) od.active = Math.min(this.durationOf(od), od.active + this.tuning.odKillExtend * n);
    }
    this.lastKills = kills;

    // keys
    if (g.state === 'playing' && !g.photo.active) {
      for (const s of this.slots) if (this.input.hit(s.def.keys[this.role][0])) this.trigger(s.def.id);
    }

    // timers (Focus runs on real time; the rest on mission time)
    for (const s of this.slots) {
      if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
      if (s.active > 0) {
        s.active = Math.max(0, s.active - (s.def.id === 'focus' ? realDt : dt));
        if (s.active === 0) this.expire(s.def.id);
      }
      const ready = s.cd <= 0 && s.active <= 0;
      if (ready && !s.view.ready && g.state === 'playing') playAbilityReady();
      s.view.ready = ready;
      s.view.cd = s.active > 0 ? 1 : Math.min(1, s.cd / this.cooldownOf(s));
      s.view.cdLeft = s.cd;
      s.view.active = Math.min(1, s.active / this.durationOf(s));
    }

    // Mustang sweep: the slot drains with the sweep; the flight is forgotten once it has left
    const ms = this.slots[0];
    if (this.flight.length) {
      for (let i = this.flight.length - 1; i >= 0; i--) { const f = this.flight[i].me; if (f.remove || !f.alive) this.flight.splice(i, 1); }
      if (ms.active > 0 && !this.flight.length) ms.active = 0;
    }

    // Overdrive: on top of whatever Game set this frame (Berserker perk)
    const od = this.slots[1].active > 0;
    if (od) g.gunner.rateBoost *= OVERDRIVE_RATE;
    g.gunner.overdrive = od ? Math.min(1, this.slots[1].active / 0.5) : 0;
    this.bar.setOverdrive(od && this.role === 'gunner');

    // Focus: ease the time scale down and back up; the sight keeps real-time response
    if (this.focusOn) {
      this.focusT += realDt;
      const dur = this.durationOf(this.slots[2]);
      const k = Math.min(1, this.focusT / FOCUS_EASE_IN, (dur - this.focusT) / FOCUS_EASE_OUT);
      if (k <= 0 || this.focusT >= dur) this.endFocus();
      else {
        eng.timeScale = 1 + (FOCUS_SCALE - 1) * k;
        g.gunner.aimTimeScale = 1 / Math.max(0.05, this.lastScale); // this frame's dt was scaled by lastScale
        this.bar.setTint(k);
      }
    }

    if (!this.tipShown && this.missionT > 18 && g.state === 'playing') {
      this.tipShown = true;
      const k = (i: number) => `<kbd>${this.slots[i].view.key}</kbd>`;
      this.ui.tip(`Abilities: ${k(0)} call the Mustangs · ${k(1)} Overdrive · ${k(2)} Focus`, 5000);
    }

    this.bar.update(this.views);
    this.lastScale = eng.timeScale;
  }

  private views: AbilitySlotView[] = this.slots.map((s) => s.view);

  private expire(id: AbilityId) {
    if (id === 'mustangs') {
      for (const p of this.flight) p.egress();
    } else if (id === 'overdrive') this.endOverdrive();
    else this.endFocus();
  }

  // ---- Mustangs ----
  private callMustangs() {
    const w = this.game.world;
    const role = this.role;
    const anchor = () => (role === 'gunner' ? w.playerBomber : w.playerFighter) ?? w.player;
    // the pilots sweep until the ability runs out (expire() sends them home)
    this.flight.push(...spawnSweep(w, anchor, MUSTANG_COUNT, Infinity));
  }

  // ---- Overdrive ----
  private startOverdrive() {
    const g = this.game;
    if (this.role === 'gunner') {
      g.gunner.heatFree = true;
      g.gunner.coolBarrel(); g.gunner.coolBarrel(); g.gunner.coolBarrel(); // vent the barrel
    } else {
      this.endOverdrive();
      const f = g.world.playerFighter;
      if (f) for (const gun of f.guns) {
        const b: GunBoost = { gun, rate: gun.rate, boosted: gun.rate * OVERDRIVE_RATE, every: gun.tracerEvery, color: gun.tracerColor };
        gun.rate = b.boosted; gun.tracerEvery = 2; gun.tracerColor = OD_TRACER;
        this.boosts.push(b);
      }
    }
  }

  private endOverdrive() {
    const g = this.game;
    g.gunner.heatFree = false;
    g.gunner.overdrive = 0;
    for (const b of this.boosts) {
      // a loadout refresh mid-Overdrive already rebuilt the gun: leave it alone
      if (b.gun.rate !== b.boosted) continue;
      b.gun.rate = b.rate; b.gun.tracerEvery = b.every; b.gun.tracerColor = b.color;
    }
    this.boosts.length = 0;
    this.bar.setOverdrive(false);
  }

  // ---- Focus ----
  private startFocus() {
    this.focusOn = true;
    this.focusT = 0;
  }

  private endFocus() {
    if (this.focusOn) this.engine.timeScale = 1; // a kill slow-mo still running re-applies itself next frame
    this.focusOn = false;
    this.focusT = 0;
    this.game.gunner.aimTimeScale = 1;
    this.bar.setTint(0);
  }
}
