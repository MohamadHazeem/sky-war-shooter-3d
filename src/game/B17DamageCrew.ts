import * as THREE from 'three';
import type { Game } from './Game';
import type { HitZone } from '../world/Aircraft';
import type { ParticleOpts } from '../render/Particles';
import { crewRoster, type ManId } from './CrewRoster';
import { CREW, STATION_CREW, type CrewId } from '../world/Crew';
import { STATIONS, type StationId } from '../world/B17Layout';
import { B17DamageRules, DAMAGE_RADIO, DAMAGE_TEXT, escapeManifest, type CrewTask, type EscapeEntry } from './B17DamageRules';
import { tx } from '../i18n';
import { keyLabel } from '../core/KeyMap';

const FLAME: [number, number, number] = [6, 1.8, .25];
const SMOKE: [number, number, number] = [.08, .075, .065];
const SPRAY: [number, number, number] = [.85, .85, .8];
const POSTS: readonly CrewId[] = ['waistL', 'waistR', 'tail', 'ball', 'engineer'];
/** Game integration; rules stay renderer-free. Effects use the existing warmed pools. */
export class B17DamageCrew {
  readonly rules = new B17DamageRules();
  escape: EscapeEntry[] = [];
  task: CrewTask = 'idle';
  taskTime = 0;
  private aidTarget: CrewId | null = null;
  private aboard: { name: string; id: CrewId; man: ManId | null }[] = [];
  private engines: (HitZone | undefined)[] = [];
  private tick = 0;
  private hudTime = 0;
  private message = '';
  private engineMessage = '';
  private p = new THREE.Vector3();
  private v = new THREE.Vector3();
  private o: ParticleOpts = { pos: this.p, vel: this.v, life: .6, size0: .2, size1: .7, color0: FLAME };
  constructor(private g: Game) {}
  reset() {
    this.rules.reset(this.g.settings.difficulty ?? 'veteran');
    this.escape = []; this.task = 'idle'; this.taskTime = this.tick = this.hudTime = 0;
    this.aidTarget = null; this.message = this.engineMessage = '';
    this.aboard = CREW.map(c => ({ name: c.name, id: c.id, man: crewRoster.occupant(c.id) }));
    const b = this.g.world.playerBomber;
    this.engines = [1, 2, 3, 4].map(i => b?.zone('engine' + i));
    if (b && this.g.mission?.role === 'gunner') { b.damageControl = this.rules; for (let i = 0; i < 4; i++) this.rules.feathered[i] = b.engineDead[i]; }
  }
  hit(zone: string, heavy: boolean) {
    if (this.g.state !== 'playing' || this.g.mission?.role !== 'gunner' || this.g.mission.tutorial || this.g.aa.active) return;
    if (this.g.midRound.event || this.g.midRound.setPieces.busy) return;
    if (this.rules.hit(zone, heavy)) this.say(this.rules.fire ?? (zone.startsWith('engine') ? 'runaway' : 'controls'));
  }
  private say(key: keyof typeof DAMAGE_RADIO) {
    const line = DAMAGE_RADIO[key]; this.g.world.callout('damage_' + key, line[0], line[1], 12, 2);
  }
  update(dt: number) {
    const g = this.g, b = g.world.playerBomber, r = this.rules;
    if (g.state !== 'playing' || g.mission?.role !== 'gunner' || !b?.alive || g.aa.active) return;
    const station = g.gunner.station;
    // The radio operator is the spare hand. A wounded helper cannot fight a fire or move ammunition.
    const helper = !g.world.crew.wounded.has('radio') && crewRoster.occupant('radio') !== null;
    if (this.task === 'aid' && this.aidTarget && !g.world.crew.wounded.has(this.aidTarget)) { this.task = 'idle'; this.aidTarget = null; }
    let want: CrewTask = r.fire && helper ? 'fire' : 'idle';
    if (want === 'idle' && helper) {
      for (const post of POSTS) if (g.world.crew.wounded.has(post)) { want = 'aid'; this.aidTarget = post; break; }
      if (want === 'idle' && g.gunner.state.supply > 0) want = 'ammo';
    }
    if (want !== this.task) { this.task = want; this.taskTime = 0; if (want === 'aid' || want === 'ammo') this.say(want); }
    if (this.task !== 'idle') this.taskTime += dt;
    const travel = r.tuning.crew * (this.task === 'aid' ? crewRoster.effects().dressing : crewRoster.effects().fireDelay);
    const arrived = this.taskTime >= travel;
    const wasFire = r.fire;
    const held = g.input.down('KeyX') && g.gunner.transition <= 0 && !g.bombardier.active;
    if (r.update(dt, station, held, this.task === 'fire' && arrived)) this.say('fireOut');
    if (r.fire) {
      // The crew can recover an ignored fire, but a wounded helper leaves it to the player.
      const zone = b.zone(r.fire === 'bombBay' ? 'fuselageMid' : 'fuselageAft');
      if (zone && r.fireAge > 6) { zone.hp = Math.max(0, zone.hp - dt * r.tuning.burn); if (!zone.hp) g.world.killAircraft(b, false, 'fire'); }
    }
    if (this.task === 'aid' && arrived && this.aidTarget) {
      if (crewRoster.relieve(this.aidTarget, 'radio')) {
        g.world.crew.heal(this.aidTarget);
        g.gunner.living.refreshCrew();
        g.world.crewWounded = Math.max(0, g.world.crewWounded - 1);
      }
      this.task = 'idle'; this.aidTarget = null;
    }
    // Engine governor failure feeds a fire until feathering cuts the engine and fuel.
    let selected = -1;
    for (let i = 0; i < 4; i++) {
      const z = this.engines[i];
      if (!z) continue;
      if (b.engineDead[i] && !r.runaway[i] && !r.feathered[i]) {
        r.engineAge[i] += dt;
        if (r.engineAge[i] >= r.tuning.crew && !g.world.crew.wounded.has('engineer')) this.feather(i);
      }
      if (r.runaway[i]) {
        if (r.engineAge[i] >= 5) z.burning = true;
        if (selected < 0) selected = i;
        if (r.engineAge[i] >= r.tuning.crew && !g.world.crew.wounded.has('engineer')) this.feather(i);
      } else if (!r.feathered[i] && (z.burning || b.engineDead[i]) && selected < 0) selected = i;
    }
    if (!wasFire && selected >= 0 && station === 'top' && held) {
      r.featherFill += dt / r.tuning.hold;
      if (r.featherFill >= 1) this.feather(selected);
    } else r.featherFill = 0;
    const target = this.task === 'fire' ? (r.fire === 'bombBay' ? -4.6 : -6.1)
      : this.task === 'aid' ? STATIONS[this.aidTarget === 'engineer' ? 'top' : this.aidTarget as StationId]?.pivot.z ?? -7.4
      : STATIONS[station].pivot.z;
    g.gunner.living.assist(this.task, target, Math.min(1, this.taskTime / Math.max(1, travel * .65)), dt, crewRoster.occupant('radio') !== null);
    this.tick += dt;
    if (this.tick >= (g.settings.quality === 'low' ? .12 : .06)) {
      this.tick = 0;
      if (r.fire) this.emitFire(r.fire === 'bombBay' ? -4.6 : -6.1, held && r.reachable(station) || this.task === 'fire' && arrived);
    }
    this.hudTime -= dt;
    if (this.hudTime <= 0) { this.hudTime = .1; this.refreshText(selected); }
  }
  feather(i: number) {
    const b = this.g.world.playerBomber; if (!b) return;
    this.rules.feather(i); b.engineDead[i] = true;
    const z = this.engines[i]; if (z) { z.burning = false; z.hp = 0; }
    if (b.enginesOut >= 2) b.straggling = true;
  }
  private emitFire(z: number, spraying: boolean) {
    const b = this.g.world.playerBomber!, fx = this.g.world.effects, o = this.o;
    b.localToWorld(this.p.set(.3, -.55, z), this.p); this.v.copy(b.vel); this.v.y += .4;
    o.color0 = FLAME; o.size0 = .35; o.size1 = .12; o.life = .45; o.alpha0 = .8; o.alpha1 = 0; o.frame = 2; o.rise = 1; o.drag = 0; o.lit = false;
    if (fx.glow.count < 4300) fx.glow.spawn(o);
    fx.flashLight(this.p, 3, .15, 0xff9c52);
    o.color0 = SMOKE; o.size0 = .3; o.size1 = .85; o.life = 1; o.alpha0 = .5; o.frame = 0; o.lit = true;
    if (fx.smoke.count < 8200) fx.smoke.spawn(o);
    if (spraying) {
      this.p.y += .35; o.color0 = SPRAY; o.alpha0 = .65; o.size0 = .16; o.size1 = .6; o.life = .45; o.rise = -.4;
      if (fx.smoke.count < 8200) fx.smoke.spawn(o);
    }
  }
  private refreshText(engine: number) {
    const r = this.rules, key = keyLabel('KeyX');
    this.message = r.fire ? tx(DAMAGE_TEXT[r.fire]) + ' · ' + tx(r.fire === 'bombBay' ? DAMAGE_TEXT.top : DAMAGE_TEXT.waist, { key })
      : this.task !== 'idle' ? tx(DAMAGE_TEXT[this.task]) : r.controls > 0 ? tx(DAMAGE_TEXT.controls) : '';
    this.engineMessage = '';
    for (let i = 0; i < 4; i++) {
      const z = this.engines[i];
      if (r.runaway[i] || z?.burning || r.feathered[i]) this.engineMessage += (this.engineMessage ? '  |  ' : '') + tx(r.runaway[i] ? DAMAGE_TEXT.runaway : z?.burning ? DAMAGE_TEXT.burning : DAMAGE_TEXT.feathered, { n: i + 1 });
    }
    if (!r.fire && engine >= 0) this.message = tx(DAMAGE_TEXT.feather, { key, n: engine + 1 });
  }
  draw(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.g.state !== 'playing') return;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillStyle = '#ffce92'; ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    ctx.fillText(this.message, width / 2, height * .62, width - 24);
    ctx.fillText(this.engineMessage, width / 2, height * .62 - 20, width - 24);
    const fill = Math.max(this.rules.fill, this.rules.featherFill);
    if (fill > 0) { ctx.fillStyle = '#eee1b8'; ctx.fillRect(width / 2 - 80, height * .62 + 9, 160 * Math.min(1, fill), 4); }
    ctx.restore();
  }
  abandon() {
    if (this.escape.length) return;
    const g = this.g, player = STATION_CREW[g.gunner.station];
    const playerName = CREW.find(c => c.id === player)?.name;
    this.escape = escapeManifest(this.aboard.map(m => ({ name: m.name, wounded: m.man ? crewRoster.wounded.has(m.man) : g.world.crew.wounded.has(m.id), player: m.name === playerName })), g.world.playerBomber?.pos.y ?? 0);
    crewRoster.escapeRecorded = true;
  }
}
