import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { UI } from '../ui/UI';
import type { Game } from './Game';
import type { Mission } from './Missions';
import type { Fighter } from '../world/Aircraft';
import { dirFromYawPitch, inArc, STATIONS, StationId } from '../world/B17Layout';
import { tx } from '../i18n';

// "Gunnery School": a calm, scripted first flight that teaches the gunner's controls one
// at a time. Game's director skips missions flagged `tutorial`; this module spawns and
// flies everything instead. Nothing in the sky can hurt the player: the training targets
// carry no guns, the incoming damage scale is zero and the AI crews' rounds do nothing.

export const TUTORIAL: Mission = {
  id: 'tutorial', number: 0, tutorial: true,
  title: 'Gunnery School', target: 'Training flight', date: 'Training flight · over the Wash', role: 'gunner', station: 'waistL',
  briefing: ['A two-minute gunnery course over the Wash. Training targets only — nobody shoots back.'],
  objectives: ['Complete the gunnery course'],
  bombers: 6, waves: [], duration: 9999, maxBombersLost: 99, playerArmor: 0,
  weather: { sunEl: 48, sunAz: 210, low: 0.45, high: 0.25, contrails: true },
};

export const TUTORIAL_STEPS = ['aim', 'fire', 'lead', 'zoom', 'seat', 'radar', 'perks', 'fight'] as const;
export type TutorialStepId = typeof TUTORIAL_STEPS[number];

export interface TutorialHost {
  awardPerk(label: string): void;
  showCampaign(): void;
  onDone(): void;                 // tutorial completed (saved as done)
  markHint(id: string): void;     // a context hint the course has already taught
}

interface Step {
  id: TutorialStepId;
  title: string;
  text: () => string;
  radio: [string, string];
  enter: () => void;
  check: (dt: number) => boolean;
  timeout: number;                // s: the step moves on anyway (it can never get stuck)
}

// A training target flown on rails in the bomber's frame: a slow weave inside one gun
// position's field of fire, so it never leaves the window it was put in.
interface Drone {
  f: Fighter;
  station: StationId;
  dist: number;
  y0: number; p0: number;         // centre of the weave, relative to the station's rest direction (rad)
  ay: number; ap: number;         // weave amplitudes (rad)
  w: number;                      // weave rate (rad/s)
  t: number;
  bank: number;
  head: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();

const kbd = (k: string) => `<kbd>${k}</kbd>`;

export class Tutorial {
  active = false;
  stepIdx = -1;
  phase: 'intro' | 'step' | 'done' | 'finale' | 'over' = 'over';
  private t = 0;                  // time in the current phase
  private acc = 0;                // per-step accumulator (aim hold, zoom hold, ...)
  private drones: Drone[] = [];
  private fighters: Fighter[] = [];
  private tabs = 0;
  private seatTarget: StationId = 'waistR';
  private hits0 = 0;
  private card: HTMLElement | null = null;
  private steps: Step[];
  readonly log: string[] = [];

  constructor(private game: Game, private engine: Engine, private ui: UI, private host: TutorialHost) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && !e.repeat && this.active && this.game.state === 'playing') this.tabs++;
    });
    this.steps = this.buildSteps();
  }

  get stepId(): TutorialStepId | null { return this.phase === 'step' || this.phase === 'done' ? this.steps[this.stepIdx]?.id ?? null : null; }

  // ---------------- lifecycle ----------------
  start() {
    this.stop();
    this.active = true;
    this.stepIdx = -1;
    this.phase = 'intro';
    this.t = 0;
    this.log.length = 0;
    this.card = document.createElement('div');
    this.card.id = 'tutCard';
    document.body.appendChild(this.card);
    this.render('', tx('Gunnery School'), tx('A calm two-minute course. Nothing up here shoots back — take your time.'));
    requestAnimationFrame(() => this.card?.classList.add('show'));
  }

  stop() {
    this.active = false;
    this.phase = 'over';
    this.card?.remove();
    this.card = null;
    this.drones = [];
    this.fighters = [];
  }

  // Called from Game.direct() while the tutorial mission runs (replaces the director)
  update(dt: number) {
    if (!this.active) return;
    const w = this.game.world;
    // harmless sky, re-asserted every frame (perks and loadout changes rewrite these)
    w.playerDamageScale = 0;
    w.aiGunnerFactor = 0;
    w.flakIntensity = 0;
    w.playerFocus = 1;
    if (this.card) this.card.classList.toggle('show', this.game.state === 'playing');
    this.t += dt;
    switch (this.phase) {
      case 'intro':
        if (this.t > 4) this.next();
        break;
      case 'step': {
        const s = this.steps[this.stepIdx];
        if (s.check(dt) || this.t > s.timeout) {
          this.log.push(`${s.id} ${this.t.toFixed(1)}s${this.t > s.timeout ? ' (timeout)' : ''}`);
          this.phase = 'done'; this.t = 0;
          this.render(tx('STEP {n} / {m}', { n: this.stepIdx + 1, m: this.steps.length }), tx(s.title), `<span class="ok">✓ ${tx('Done')}</span>`, true);
          if (s.id === 'perks') this.host.markHint('perk');
          if (s.id === 'seat') this.host.markHint('seat');
        } else this.refresh();
        break;
      }
      case 'done':
        if (this.t > 1.4) this.next();
        break;
      case 'finale':
        if (this.t > 4.5) {
          this.phase = 'over';
          this.active = false;
          this.game.startMenu();
          this.host.showCampaign();
        }
        break;
    }
  }

  private next() {
    // leftovers from the last step leave quietly
    for (const d of this.drones) if (d.f.alive) d.f.remove = true;
    this.drones = [];
    this.stepIdx++;
    if (this.stepIdx >= this.steps.length) { this.finish(); return; }
    const s = this.steps[this.stepIdx];
    this.phase = 'step'; this.t = 0; this.acc = 0;
    s.enter();
    this.game.world.callout('tut' + s.id, s.radio[0], s.radio[1], 0, 3);
    this.refresh();
  }

  private finish() {
    this.phase = 'finale'; this.t = 0;
    this.log.push('complete');
    this.host.onDone();
    this.render(tx('GUNNERY SCHOOL'), tx('Course complete'), tx('You\'re ready, gunner! Off to the campaign…'), true);
    this.ui.banner('GUNNERY SCHOOL COMPLETE', 'You\'re ready, gunner!', 4200);
    this.game.world.callout('tutdone', 'Pilot', 'You\'re ready, gunner! Welcome to the crew of the Sky Queen.', 0, 3);
  }

  private refresh() {
    const s = this.steps[this.stepIdx];
    if (s) this.render(tx('STEP {n} / {m}', { n: this.stepIdx + 1, m: this.steps.length }), tx(s.title), s.text());
  }

  private lastHtml = '';
  private render(kicker: string, title: string, body: string, done = false) {
    if (!this.card) return;
    const dots = this.steps.map((_, i) => `<i class="${i < this.stepIdx || (done && i === this.stepIdx) ? 'on' : i === this.stepIdx ? 'cur' : ''}"></i>`).join('');
    const html = `<div class="k">${tx('GUNNERY SCHOOL')}${kicker ? ' · ' + kicker : ''}</div><div class="t">${title}</div><div class="b">${body}</div><div class="dots">${dots}</div>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    this.card.innerHTML = html;
    this.card.classList.toggle('done', done);
  }

  // ---------------- steps ----------------
  private buildSteps(): Step[] {
    const g = this.game;
    const alive = () => this.drones.some((d) => d.f.alive);
    return [
      {
        id: 'aim', title: 'Aim', timeout: 45,
        text: () => tx('Move the {mouse} to swing the gun onto the target drone — the <b class="red">red brackets</b>.', { mouse: kbd(tx('mouse')) }),
        radio: ['Pilot', 'This is a training flight, gunner. Nobody shoots back today. See that target drone? Put your sight on it.'],
        enter: () => this.spawnDrone(g.gunner.station, { dist: 620, y0: 0.42, p0: 0.12, ay: 0.05, ap: 0.03, w: 0.25 }),
        check: (dt) => {
          const d = this.drones[0];
          if (!d || !d.f.alive) return true;
          const cam = this.engine.camera.position;
          const ang = g.gunner.aimDirection(_v).angleTo(_v2.copy(d.f.pos).sub(cam));
          if (ang < 0.07) this.acc += dt;
          return this.acc > 0.7;
        },
      },
      {
        id: 'fire', title: 'Fire short bursts', timeout: 60,
        text: () => tx('{lmb} fires. Use <b>short bursts</b> — half a second, then let go — and walk the tracers onto the drone.', { lmb: kbd(tx('Left button')) })
          + (g.gunner.state.overheated ? `<div class="warn">${tx('Barrel too hot! Wait for the heat bar to cool.')}</div>` : '')
          + `<div class="st">${tx('Hits: {n}', { n: g.world.stats.hits - this.hits0 })}</div>`,
        radio: ['Top Turret', 'Short bursts! Watch your tracers and walk them in.'],
        enter: () => {
          this.hits0 = g.world.stats.hits;
          this.spawnDrone(g.gunner.station, { dist: 560, y0: 0.1, p0: 0.08, ay: 0.1, ap: 0.04, w: 0.22 });
        },
        check: () => !alive(),
      },
      {
        id: 'lead', title: 'Lead the target', timeout: 75,
        text: () => tx('This one crosses fast. Aim at the yellow <b class="gold">◇ lead indicator</b> ahead of it, not at the plane itself. Aim assist pulls the sight onto it when you get close.'),
        radio: ['Navigator', 'Lead him! Aim where he\'s going to be, not where he is.'],
        enter: () => this.spawnDrone(g.gunner.station, { dist: 600, y0: 0, p0: 0.06, ay: 0.62, ap: 0.03, w: 0.2 }),
        check: () => !alive(),
      },
      {
        id: 'zoom', title: 'Look down the sight', timeout: 40,
        text: () => tx('Hold the {rmb} to bring your eye down to the ring sight: a closer, steadier view for long shots.', { rmb: kbd(tx('right button')) })
          + `<div class="bar"><div style="width:${Math.round(Math.min(1, this.acc / 1.2) * 100)}%"></div></div>`,
        radio: ['Pilot', 'Use the ring sight for the long ones. Hold the right button.'],
        enter: () => this.spawnDrone(g.gunner.station, { dist: 1000, y0: -0.15, p0: 0.1, ay: 0.08, ap: 0.03, w: 0.2 }),
        check: (dt) => {
          if (g.gunner.ads > 0.8) this.acc += dt;
          return this.acc > 1.2;
        },
      },
      {
        id: 'seat', title: 'Change gun position', timeout: 75,
        text: () => {
          const st = STATIONS[this.seatTarget];
          const there = this.drones[0] && this.inStationArc(g.gunner.station, this.drones[0].f.pos);
          return there
            ? tx('You\'re on the {st}. Now shoot it down!', { st: tx(st.label).toUpperCase() })
            : tx('A fighter is in the <b>{st}</b> arc — its seat badge lit up bottom-left. Press {key} to move there.', { st: tx(st.label).toUpperCase(), key: kbd(st.key) });
        },
        radio: ['Tail', 'Fighter on the other side! Somebody get on that gun!'],
        enter: () => {
          this.seatTarget = this.pickSeatTarget();
          this.spawnDrone(this.seatTarget, { dist: 650, y0: 0.05, p0: -0.02, ay: 0.18, ap: 0.03, w: 0.2 });
        },
        check: () => !alive(),
      },
      {
        id: 'radar', title: 'Radar and map', timeout: 25,
        text: () => this.tabs === 0
          ? tx('The <b>radar</b> bottom-left plots everything around the ship — <b class="red">red</b> are bandits. Press {tab} to open the big map.', { tab: kbd('Tab') })
          : tx('The big map shows where the next group will come from, with a countdown. Press {tab} again to close it.', { tab: kbd('Tab') }),
        radio: ['Navigator', 'Navigator here. Watch the radar plot — and Tab gives you the big picture.'],
        enter: () => { this.tabs = 0; },
        check: () => this.tabs >= 2 || (this.tabs >= 1 && this.t > 8),
      },
      {
        id: 'perks', title: 'Field upgrades', timeout: 10,
        text: () => tx('Every few kills earns a <b>field upgrade</b>. It\'s applied straight away — read the card at the top of the screen. Nothing to press.'),
        radio: ['Pilot', 'Nice shooting. The ground crew fitted you something extra.'],
        enter: () => this.host.awardPerk('TRAINING · FIELD UPGRADE'),
        check: () => this.t > 5,
      },
      {
        id: 'fight', title: 'Final exercise', timeout: 110,
        text: () => {
          const n = this.fighters.filter((f) => f.alive).length;
          return tx('Three fighters are coming through your arc. Use everything: lead, short bursts, and change seats when a badge lights up.') + `<div class="st">${tx('{n} left', { n })}</div>`;
        },
        radio: ['Pilot', 'Here they come — three bandits. Show me what you\'ve learned!'],
        enter: () => this.spawnFight(3),
        // done when all three are down (or the last ones have turned for home)
        check: () => this.fighters.length > 0 && !g.world.activeEnemies().some((f) => this.fighters.includes(f)),
      },
    ];
  }

  // ---------------- training targets ----------------
  private inStationArc(id: StationId, pos: THREE.Vector3) {
    const b = this.game.world.playerBomber;
    if (!b) return false;
    const st = STATIONS[id];
    return inArc(st, b.worldToLocal(pos, _v).sub(st.pivot));
  }

  // A gun position other than the current one whose drone the current gun can't reach
  private pickSeatTarget(): StationId {
    const cur = this.game.gunner.station;
    const b = this.game.world.playerBomber!;
    for (const id of ['waistR', 'waistL', 'tail', 'top'] as StationId[]) {
      if (id === cur) continue;
      const st = STATIONS[id];
      const local = dirFromYawPitch(st.rest.yaw + 0.05, st.rest.pitch - 0.02).multiplyScalar(650).add(st.pivot);
      if (!this.inStationArc(cur, b.localToWorld(local))) return id;
    }
    return cur === 'waistR' ? 'waistL' : 'waistR';
  }

  private spawnDrone(station: StationId, o: { dist: number; y0: number; p0: number; ay: number; ap: number; w: number }) {
    const w = this.game.world;
    const st = STATIONS[station];
    // keep the whole weave inside the station's limits
    const ylim = (st.yaw[1] - st.yaw[0]) >= Math.PI * 1.99 ? Infinity : Math.min(-st.yaw[0], st.yaw[1]) - 0.08;
    const y0 = THREE.MathUtils.clamp(o.y0, -ylim + o.ay, ylim - o.ay);
    const d: Drone = { f: null as unknown as Fighter, station, dist: o.dist, y0, p0: o.p0, ay: o.ay, ap: o.ap, w: o.w, t: 0, bank: 0, head: NaN };
    const pos = this.dronePos(d, new THREE.Vector3());
    const f = w.spawnEnemy(pos, 'beam', 0.5, false, false, 'fw190');
    harmless(f, 0.35);
    (w as any).pilots?.delete?.(f);   // flown on rails below, not by the AI
    d.f = f;
    const orig = f.update.bind(f);
    (f as any).update = (dt: number, time: number) => {
      if (!f.alive) { orig(dt); return; }
      this.flyDrone(d, dt);
      f.updateProps(dt, 0.9);
      void time;
    };
    this.flyDrone(d, 0);
    this.drones.push(d);
    return d;
  }

  private dronePos(d: Drone, out: THREE.Vector3) {
    const b = this.game.world.playerBomber!;
    const st = STATIONS[d.station];
    const yaw = st.rest.yaw + d.y0 + d.ay * Math.sin(d.w * d.t);
    const pitch = st.rest.pitch + d.p0 + d.ap * Math.sin(2 * d.w * d.t + 1);
    const local = dirFromYawPitch(yaw, pitch, out).multiplyScalar(d.dist).add(st.pivot);
    return b.localToWorld(local, out);
  }

  private flyDrone(d: Drone, dt: number) {
    const f = d.f;
    const b = this.game.world.playerBomber;
    if (!b) return;
    d.t += dt;
    const p = this.dronePos(d, _v);
    if (dt > 0) {
      const vel = _v2.copy(p).sub(f.pos).divideScalar(dt);
      f.vel.lerp(vel, Math.min(1, dt * 8));
    } else f.vel.copy(b.vel);
    f.fm.vel.copy(f.vel);
    f.root.position.copy(p);
    // nose along the flight path, banking into the weave
    const head = Math.atan2(f.vel.x, f.vel.z);
    if (dt > 0 && Number.isFinite(d.head)) {
      let dh = head - d.head;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      d.bank += (THREE.MathUtils.clamp(-dh / dt * 2.5, -0.9, 0.9) - d.bank) * Math.min(1, dt * 3);
    }
    d.head = head;
    if (f.vel.lengthSq() > 1) {
      _m.lookAt(f.vel, ZERO, _up);
      f.root.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_z, d.bank));
    }
  }

  // The final exercise: real AI fighters, but slow, gunless and fragile, sent in through
  // the player's current field of fire.
  private spawnFight(n: number) {
    const w = this.game.world;
    const b = w.playerBomber!;
    const arc = w.playerArc() ?? b.forward(new THREE.Vector3());
    const base = b.pos.clone().addScaledVector(arc, 1500).add(new THREE.Vector3(0, 220, 0));
    this.fighters = [];
    for (let i = 0; i < n; i++) {
      const p = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 300 + i * 60, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 300));
      const f = w.spawnEnemy(p, 'beam', 0.45, false, false, 'fw190');
      harmless(f, 0.5);
      f.fm.p = { ...f.fm.p, power: f.fm.p.power * 0.8 };
      this.fighters.push(f);
    }
  }
}

// No guns, no rockets, a thinner skin: a training target
function harmless(f: Fighter, toughness: number) {
  f.guns = [];
  f.rockets = 0;
  f.fireRockets = false;
  f.structure = f.maxStructure = f.maxStructure * toughness;
  for (const z of f.zones) { z.maxHp *= toughness; z.hp = z.maxHp; }
}
