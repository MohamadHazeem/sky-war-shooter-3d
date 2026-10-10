import type { MidRound } from './MidRound';
import { Aircraft, Bomber, Fighter, HitZone } from '../world/Aircraft';
import { STATIONS, StationId } from '../world/B17Layout';
import { sound } from '../audio/Sound';
import type { Mark } from './Objectives';
import { tx } from '../i18n';

// Random in-flight events (scheduled by MidRound every 60–120 s): each one is announced on
// the radio, shows a prompt under the sight and asks for a quick interaction. All of them
// resolve on their own when ignored (the autoplay never presses these keys).
//   Engine fire      X  hold or mash the extinguisher, otherwise the fire spreads (gunner)
//   Jammed gun       R  tap fast or hold to clear (the jam stays with that gun position)
//   Oxygen failure   O  the picture greys and swims until the spare bottle is opened (10 s)
//   Straggler        —  a crippled B-17 falls out of formation and fighters swarm it
export const KEY_EXTINGUISH = 'KeyX';
export const KEY_CLEAR_JAM = 'KeyR';
export const KEY_OXYGEN = 'KeyO';

export type EventId = 'engineFire' | 'jammedGun' | 'oxygen' | 'straggler';

export abstract class RandomEvent {
  abstract readonly id: EventId;
  t = 0;              // s since it started (advanced by MidRound)
  limit = 15;         // MidRound calls timeout() when t reaches it
  state: 'active' | 'won' | 'lost' | 'timeout' | 'cancelled' = 'active';
  start(_c: MidRound) {}
  update(_dt: number, _c: MidRound) {}
  onKill(_v: Aircraft, _byPlayer: boolean, _c: MidRound) {}
  timeout(_c: MidRound) { if (this.state === 'active') this.state = 'timeout'; }
  cancel(_c: MidRound) { if (this.state === 'active') this.state = 'cancelled'; }
  end(_c: MidRound) {}
  tags(): Mark[] { return []; }
}

// Key handling shared by the mash-or-hold prompts: each press adds `tap`, holding fills at `hold`/s
function mashOrHold(c: MidRound, code: string, dt: number, tap: number, hold: number) {
  let f = 0;
  if (c.input.hit(code)) f += tap;
  if (c.input.down(code)) f += hold * dt;
  return f;
}

// ---------------------------------------------------------------- Engine fire
class EngineFire extends RandomEvent {
  readonly id = 'engineFire';
  private z!: HitZone;
  private next: HitZone | null = null;
  private wing: HitZone | null = null;
  private fill = 0;
  private spread = false;
  private saved = new Map<string, number | undefined>();
  constructor(private b: Bomber) { super(); this.limit = 16; }

  private get n() { return this.z.engine! + 1; }
  private ext(c: MidRound): Map<string, number> | null { return (c.world as any).extinguishers ?? null; }

  // World's own fire handling would fire the bottle by itself after 4.5 s: take the bottle
  // away while the player fights this one (restored in end())
  private takeBottle(c: MidRound, z: HitZone) {
    const ext = this.ext(c);
    if (!ext || this.saved.has(z.name)) return;
    this.saved.set(z.name, ext.get(z.name));
    ext.set(z.name, 0);
    // and skip World's "Fire in number N" call: this event announces it
    (c.world as any).lastCallout?.set('fire' + z.name, c.world.time);
  }

  start(c: MidRound) {
    const engines = this.b.zones.filter((z) => z.engine !== undefined && z.hp > 0 && !z.burning && !this.b.engineDead[z.engine]);
    this.z = engines[Math.floor(Math.random() * engines.length)];
    const pair = this.z.engine! ^ 1; // 0<->1 (left wing), 2<->3 (right wing)
    this.next = this.b.zones.find((z) => z.engine === pair && z.hp > 0 && !this.b.engineDead[pair]) ?? null;
    this.wing = this.b.zone(this.z.engine! < 2 ? 'wingL' : 'wingR') ?? null;
    this.takeBottle(c, this.z);
    this.z.burning = true;
    c.radio('fire', 'Top Turret', `Fire in number ${this.n}! Get the extinguisher on it before it reaches the tanks!`);
    sound.play('click', null, { gain: 0.6, rate: 0.5 });
  }

  update(dt: number, c: MidRound) {
    if (!this.b.alive) { this.state = 'cancelled'; return; }
    if (!this.z.burning) { this.state = 'won'; return; }   // put out some other way
    const before = this.fill;
    this.fill += mashOrHold(c, KEY_EXTINGUISH, dt, 0.12, 0.7);
    if (Math.floor(this.fill * 6) > Math.floor(before * 6)) sound.play('click', null, { gain: 0.35, rate: 1.6 });
    // after 7 s it gets into the wing and the next engine
    if (this.t > 7 && !this.spread) {
      this.spread = true;
      if (this.next) { this.takeBottle(c, this.next); this.next.burning = true; }
      c.radio('firespread', 'Pilot', this.next ? `It's spreading to number ${this.next.engine! + 1}! Get it out!` : 'It\'s into the wing! Put it out!');
    }
    // the fire eats the engine and the wing spar (never far enough to bring the ship down by itself)
    const k = this.spread ? 9 : 3;
    if (this.wing) this.wing.hp = Math.max(Math.min(this.wing.hp, this.wing.maxHp * 0.45), this.wing.hp - dt * k);
    this.z.hp = Math.max(1, this.z.hp - dt * (this.spread ? 7 : 3));
    if (this.fill >= 1) {
      this.putOut(c);
      this.state = 'won';
      c.reward(this.spread ? 40 : 70, 'Engine fire out');
      c.radio('fireout', 'Pilot', `Fire's out on number ${this.n}. Good work back there.`);
      return;
    }
    c.hud.showPrompt({
      kicker: `${tx('ENGINE FIRE · NUMBER {n}', { n: this.n })}${this.spread ? ' · ' + tx('SPREADING') : ''}`,
      action: tx('<kbd>X</kbd> HOLD OR MASH — EXTINGUISHER'),
      hint: this.spread ? tx('The wing is burning') : tx('Put it out before it spreads'),
      fill: this.fill, timeFrac: 1 - this.t / this.limit, danger: this.spread || this.t > 5, code: KEY_EXTINGUISH,
    });
  }

  private putOut(c: MidRound) {
    const timers: Map<string, number> | undefined = (c.world as any).fireTimers;
    for (const z of [this.z, this.next]) {
      if (!z) continue;
      if (z === this.z || this.spread) z.burning = false;
      timers?.delete(z.name);
    }
  }

  // ignored: the engineer gets it out with the hand extinguisher, but the engine is finished
  timeout(c: MidRound) {
    if (this.state !== 'active') return;
    this.putOut(c);
    this.state = 'timeout';
    if (this.b.alive && this.b.enginesOut < 2 && !this.b.engineDead[this.z.engine!]) {
      this.z.hp = 0; (this.z as any).destroyed = true; this.b.engineDead[this.z.engine!] = true;
      c.radio('firecrew', 'Pilot', `Engineer got it out — but number ${this.n}'s finished. Feathering it.`);
    } else c.radio('firecrew', 'Pilot', `Engineer got the fire out on number ${this.n}.`);
  }

  cancel(c: MidRound) { if (this.state === 'active') { this.putOut(c); this.state = 'cancelled'; } }

  end(c: MidRound) {
    const ext = this.ext(c);
    if (ext) for (const [k, v] of this.saved) { if (v === undefined) ext.delete(k); else ext.set(k, v); }
    this.saved.clear();
  }
}

// ---------------------------------------------------------------- Jammed gun
class JammedGun extends RandomEvent {
  readonly id = 'jammedGun';
  private station: StationId | null = null;
  private fill = 0;
  constructor() { super(); this.limit = 14; }

  start(c: MidRound) {
    if (c.role === 'gunner') {
      this.station = c.game.gunner.station;
      c.game.gunner.jammed = true;
      c.radio('jam', 'Pilot', `Gunner, your ${STATIONS[this.station].label.toLowerCase()} gun's gone quiet — is it jammed? Clear it!`);
    } else {
      c.radio('jam', 'Lead', 'Blue Leader, your guns have quit on you — recharge them!');
    }
    sound.play('click', null, { gain: 0.8, rate: 0.6 });
  }

  // P-51: hold every gun's cooldown up so the next frame's World.fireGuns can't fire
  private blockFighterGuns(c: MidRound) {
    const f = c.world.playerFighter;
    if (f) for (const g of f.guns) g.cooldown = Math.max(g.cooldown, 0.25);
  }

  update(dt: number, c: MidRound) {
    const gunner = c.role === 'gunner' ? c.game.gunner : null;
    const here = gunner ? gunner.station === this.station : true;
    if (gunner) gunner.jammed = here; else this.blockFighterGuns(c);
    if (here) {
      const before = this.fill;
      this.fill += mashOrHold(c, KEY_CLEAR_JAM, dt, 0.18, 0.65);
      if (Math.floor(this.fill * 5) > Math.floor(before * 5)) sound.play('click', null, { gain: 0.55, rate: 1.25 });
      // dry trigger: a dead click instead of a burst
      if (c.input.mouseHit(0) || c.input.hit('Space')) sound.play('click', null, { gain: 0.6 });
    }
    if (this.fill >= 1) {
      this.clear(c);
      this.state = 'won';
      c.reward(40, 'Gun cleared');
      c.ui.tip('Gun cleared — back in action', 1600);
      return;
    }
    const label = this.station ? tx(STATIONS[this.station].label).toUpperCase() : tx('GUNS');
    c.hud.showPrompt({
      kicker: tx('{gun} JAMMED', { gun: label }),
      action: tx('<kbd>R</kbd> TAP FAST OR HOLD — CLEAR THE JAM'),
      hint: here ? tx('Work the charging handle') : tx('Your other guns still fire — or go back with {key}', { key: STATIONS[this.station!].key }),
      fill: this.fill, timeFrac: 1 - this.t / this.limit, code: here ? KEY_CLEAR_JAM : undefined,
    });
  }

  private clear(c: MidRound) { c.game.gunner.jammed = false; }

  timeout(c: MidRound) {
    if (this.state !== 'active') return;
    this.clear(c);
    this.state = 'timeout';
    c.ui.tip(c.role === 'gunner' ? 'The radio operator cleared the jam for you' : 'Guns recharged', 2400);
  }
  cancel(c: MidRound) { this.clear(c); super.cancel(c); }
  end(c: MidRound) { this.clear(c); }
}

// ---------------------------------------------------------------- Oxygen failure
class OxygenFailure extends RandomEvent {
  readonly id = 'oxygen';
  private k = 0;          // hypoxia 0..1
  private fixed = false;  // recovering
  private byPlayer = false;
  constructor() { super(); this.limit = 10; }

  start(c: MidRound) {
    if (c.role === 'gunner') c.radio('oxy', 'Pilot', 'Oxygen check! Gunner, you\'re not answering — check your mask hose!');
    else c.radio('oxy', 'Lead', 'Blue Leader, you\'re wandering all over the sky. Check your oxygen!');
  }

  update(dt: number, c: MidRound) {
    if (this.fixed) {
      this.k = Math.max(0, this.k - dt / 1.2);
      if (this.k <= 0) this.state = this.byPlayer ? 'won' : 'timeout';
      c.hud.hidePrompt();
    } else {
      this.k = Math.min(1, this.t / 8.5);
      if (c.input.hit(KEY_OXYGEN)) {
        this.fixed = this.byPlayer = true;
        c.reward(this.t < 4 ? 40 : 25, 'Oxygen restored');
        c.ui.tip('Spare bottle on — breathe easy', 1600);
      } else {
        c.hud.showPrompt({
          kicker: tx('OXYGEN FAILURE'),
          action: tx('<kbd>O</kbd> OPEN THE SPARE BOTTLE'),
          hint: tx('You are blacking out'),
          fill: 1 - this.k, timeFrac: 1 - this.t / this.limit, danger: this.k > 0.55, code: KEY_OXYGEN,
        });
      }
    }
    c.hud.setHypoxia(this.k);
    // the picture drains of colour through the PostFX (on top of any wounded-crew grey)
    const post = c.engine.post;
    post.desat = Math.max(post.desat, this.k * 0.9);
  }

  // 10 s without O: a crewman plugs the gunner into a walk-around bottle; it clears over a second
  timeout(c: MidRound) {
    if (this.fixed) { this.k = 0; c.hud.setHypoxia(0); this.state = this.byPlayer ? 'won' : 'timeout'; return; }
    this.fixed = true;
    this.limit = this.t + 2;
    c.ui.tip(c.role === 'gunner' ? 'The waist gunner plugged you into a walk-around bottle' : 'Emergency oxygen on', 2400);
  }
  cancel(c: MidRound) { this.k = 0; c.hud.setHypoxia(0); super.cancel(c); }
  end(c: MidRound) { c.hud.setHypoxia(0); }
}

// ---------------------------------------------------------------- Straggler calling for help
class Straggler extends RandomEvent {
  readonly id = 'straggler';
  private attackers: Fighter[] = [];
  private downed = 0;
  constructor(private b: Bomber) { super(); this.limit = 35; }

  start(c: MidRound) {
    const b = this.b;
    // two engines gone: she drops back and down out of the box (World moves straggling ships)
    const healthy = b.zones.filter((z) => z.engine !== undefined && z.hp > 0 && !b.engineDead[z.engine]);
    for (const z of healthy.sort(() => Math.random() - 0.5).slice(0, Math.max(0, 2 - b.enginesOut))) {
      z.hp = 0; (z as any).destroyed = true; b.engineDead[z.engine!] = true;
    }
    b.straggling = true;
    this.attackers = c.spawnAttackers(b, 3 + Math.min(2, c.round), { from: 'any', dist: 2000 });
    c.radio('straggler', b.name, `${b.name} to anybody — two engines out, we're falling behind and they're all over us! We need cover!`);
  }

  update(_dt: number, c: MidRound) {
    if (!this.b.alive) { this.state = 'lost'; return; }
    const left = this.attackers.filter((f) => f.alive && !f.remove).length;
    // every attacker on her shot down: she's safe early
    if (left === 0 && this.t > 4) { this.save(c); return; }
    c.hud.showPrompt({
      kicker: tx('STRAGGLER · {name}', { name: this.b.name.toUpperCase() }),
      action: tx('COVER HER — DOWN THE FIGHTERS ON HER'),
      hint: tx(left === 1 ? '{n} fighter on her · hold {s} s' : '{n} fighters on her · hold {s} s', { n: left, s: Math.max(0, Math.ceil(this.limit - this.t)) }),
      fill: this.t / this.limit, timeFrac: 1 - this.t / this.limit, danger: this.b.integrity < 0.55,
    });
  }

  onKill(v: Aircraft, byPlayer: boolean) {
    if (byPlayer && this.attackers.includes(v as Fighter)) this.downed++;
  }

  private save(c: MidRound) {
    this.state = 'won';
    this.b.straggling = false;   // she holds where she is, under the box's guns
    c.reward(120 + 25 * this.downed, tx('{name} protected', { name: this.b.name }));
    c.radio('stragok', this.b.name, `${this.b.name} here — thanks for the cover. We'll make it home.`);
  }

  timeout(c: MidRound) {
    if (this.state !== 'active') return;
    if (this.b.alive) this.save(c); else this.state = 'lost';
  }
  end(c: MidRound) { c.unpin(this.attackers); }
  tags(): Mark[] { return this.b.alive ? [{ a: this.b, label: this.b.name.toUpperCase() }] : []; }
}

export interface EventDef { eligible(c: MidRound): boolean; create(c: MidRound): RandomEvent }

export const EVENTS: Record<EventId, EventDef> = {
  engineFire: {
    eligible: (c) => {
      const b = c.world.playerBomber;
      return c.role === 'gunner' && !!b?.alive && b.enginesOut < 2 && b.zones.some((z) => z.engine !== undefined && z.hp > 0 && !z.burning && !b.engineDead[z.engine]);
    },
    create: (c) => new EngineFire(c.world.playerBomber!),
  },
  jammedGun: {
    eligible: (c) => (c.role === 'gunner' ? !!c.world.playerBomber?.alive : !!c.world.playerFighter?.alive),
    create: () => new JammedGun(),
  },
  oxygen: { eligible: () => true, create: () => new OxygenFailure() },
  straggler: {
    eligible: (c) => c.roundLeft >= 30 && c.aliveBombers().filter((b) => !b.straggling).length >= 3,
    create: (c) => new Straggler(c.nearbyBomber()!),
  },
};
