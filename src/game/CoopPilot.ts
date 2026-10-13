// Pilot-specific lifecycle; the existing CoopSession owns transport, world proxies and scores.
import * as THREE from 'three';
import type { Game } from './Game';
import type { Fighter } from '../world/Aircraft';
import { sampleTrack, advanceClock, type Sample } from '../net/Coop';
import { pilotInput, validPilotInput, pilotDamage, applyPilotDamage } from '../net/CoopPilot';
import { tx, CANVAS_MONO } from '../i18n';
const p = new THREE.Vector3(), v = new THREE.Vector3();
export class CoopPilot {
  remote: Fighter | null = null;
  hostId = -1;
  guestId = -1;
  life = 0;
  private seq = 0;
  private received = -1;
  private samples: Sample[] = [];
  private rt = -1;
  private age = 99;
  private wall = 0;
  private fire = false;
  private throttle = .85;
  private damage = '';
  private damageAcc = 0;
  private callT = 0;
  private down = false;
  constructor(private g: Game, private send: (m: object) => void, private origin: THREE.Vector3) {}
  start(host: boolean) {
    this.samples.length = 0; this.rt = -1; this.seq = 0; this.received = -1; this.life = 0; this.age = 99;
    this.damage = ''; this.damageAcc = 0; this.down = false; this.remote = null; this.callT = 0;
    const w = this.g.world, wing = this.g.pilotOps.wing;
    if (wing.plane) wing.plane.remove = true;
    wing.active = false;
    const own = w.playerFighter!;
    own.label = host ? 'Blue One' : 'Blue Two';
    if (host) { this.hostId = own.id; this.spawnRemote(); }
    else { own.pos.add(p.set(-90, 10, -70).applyQuaternion(own.quat)); this.hostId = this.guestId = -1; }
  }
  private spawnRemote() {
    const w = this.g.world, own = w.playerFighter!;
    const f = w.spawnEscort(p.copy(w.formationCenter).add(v.set(-30, 430, -670)), v.set(0, 0, 0));
    w.clearPilot(f); w.remoteFighter = f;
    for (const z of f.zones) { z.hp *= 1.7; z.maxHp *= 1.7; }
    f.kinematic = true; f.label = 'Blue Two';
    f.quat.copy(own.quat); f.fm.vel.copy(own.vel); f.vel.copy(own.vel);
    // Match the host's gun loadout without sharing mutable ammunition/cooldowns.
    f.guns.forEach((gun, i) => { const src = own.guns[i]; if (src) Object.assign(gun, { rate: src.rate, damage: src.damage, muzzleVel: src.muzzleVel, ammo: src.ammo, spread: src.spread }); });
    this.remote = f; this.guestId = f.id;
  }
  input(d: unknown) {
    if (!validPilotInput(d) || d[1] !== this.life || d[0] <= this.received || !this.remote?.alive) return false;
    this.received = d[0]; this.age = 0; this.wall = performance.now();
    this.fire = d[13] === 1; this.throttle = d[12];
    const t = d[0] / 30;
    const s: Sample = { t, p: new THREE.Vector3(d[2], d[3], d[4]), q: new THREE.Quaternion(d[5], d[6], d[7], d[8]).normalize(), f: 1, fr: 1 };
    if (!this.samples.length) this.samples.push({ ...s, t: t - 1 / 30, p: s.p.clone().addScaledVector(v.set(d[9], d[10], d[11]), -1 / 30) });
    this.samples.push(s); if (this.samples.length > 8) this.samples.shift();
    return true;
  }
  packet(fire: boolean) { return pilotInput(this.g.world.playerFighter!, this.origin, ++this.seq, this.life, fire); }
  beforeWorld(dt: number) {
    const f = this.remote; if (!f) return;
    this.age += dt;
    if (f.alive && this.samples.length) {
      const latest = this.samples[this.samples.length - 1].t;
      this.rt = advanceClock(this.rt, latest, dt, .067);
      sampleTrack(this.samples, this.rt, f.pos, f.quat, f.vel);
      f.pos.sub(this.origin); f.fm.vel.copy(f.vel); f.fm.throttle = this.throttle;
    }
    f.trigger = f.alive && this.fire && this.age < .75 && performance.now() - this.wall < 750 && this.g.state === 'playing';
  }
  hostTick(dt: number) {
    const f = this.remote; if (!f) return;
    this.damageAcc += dt;
    if (this.damageAcc >= .1) {
      this.damageAcc = 0;
      const d = pilotDamage(f, this.life), key = JSON.stringify(d);
      if (key !== this.damage) { this.damage = key; this.send({ t: 'pd', d }); }
    }
    this.notices(dt, f);
  }
  guestDamage(d: any) {
    const f = this.g.world.playerFighter;
    if (!f) return;
    const before = f.integrity;
    if (!applyPilotDamage(f, d, this.life)) return;
    if (f.integrity < before - .0001) { this.g.world.events.playerHit?.('engine', false); this.g.world.events.shake?.(.05); }
    if (!d.alive && f.alive) this.g.world.killAircraft(f, false, '');
  }
  guestWorld(dt: number) {
    const w = this.g.world, f = w.playerFighter;
    if (!f) return;
    f.update(dt); // local flight never waits for a network round trip
    if (f.alive) w.fireGuns(f, dt); // visuals only: puppet ballistics have no hit targets
  }
  notices(dt: number, partner: Fighter | null) {
    const own = this.g.world.playerFighter;
    if (!own) return;
    if (!own.alive && !this.down) { this.down = true; this.g.world.effects.parachute(own.pos, own.vel); this.g.ui.tip('You are down — spectating your partner until the next round', 5000); }
    this.callT -= dt;
    if (partner?.alive && own.alive && this.callT <= 0 && own.pos.distanceTo(partner.pos) > 1800) { this.callT = 25; this.g.ui.tip('Form up on your partner', 3500); }
  }
  reviveHost() {
    const w = this.g.world;
    if (!w.playerFighter?.alive) {
      const f = w.spawnPlayerFighter(p.copy(w.formationCenter).add(v.set(60, 420, -600)), w.formationForward);
      f.label = 'Blue One'; this.hostId = f.id; this.g.pilot.attach(f); this.g.applyLoadout(true); this.down = false;
    }
    if (this.remote?.alive) {
      for (const z of this.remote.zones) if (z.hp > 0) z.hp = Math.min(z.maxHp, z.hp + z.maxHp * .3);
      this.remote.guns.forEach((gun, i) => gun.ammo = w.playerFighter!.guns[i]?.ammo ?? 500); return; }
    this.life++; this.samples.length = 0; this.rt = -1; this.received = -1; this.age = 99;
    this.spawnRemote(); this.damage = '';
    this.send({ t: 'revive', life: this.life, id: this.guestId, d: pilotInput(this.remote!, this.origin, 0, this.life) });
  }
  reviveGuest(m: any) {
    if (!Number.isSafeInteger(m.life) || m.life <= this.life || !validPilotInput(m.d)) return;
    this.life = m.life; this.guestId = m.id; this.down = false;
    const w = this.g.world;
    if (w.playerFighter) w.playerFighter.remove = true;
    const f = w.spawnPlayerFighter(p.set(m.d[2], m.d[3], m.d[4]).sub(this.origin), w.formationForward);
    f.quat.set(m.d[5], m.d[6], m.d[7], m.d[8]); f.fm.vel.set(m.d[9], m.d[10], m.d[11]); f.vel.copy(f.fm.vel); f.label = 'Blue Two';
    this.g.pilot.attach(f); this.g.applyLoadout(true);
  }
  spectate(partner: Fighter | null) {
    if (this.g.world.playerFighter?.alive || !partner?.alive) return;
    const cam = this.g.engine.camera;
    cam.position.copy(partner.pos).add(p.set(0, 12, -45).applyQuaternion(partner.quat)); cam.lookAt(partner.pos);
  }
  fallback() {
    if (this.remote) { this.remote.trigger = false; this.remote.remove = true; }
    this.remote = null; this.g.world.remoteFighter = null;
    const wing = this.g.pilotOps.wing; wing.callsign = 'Blue Two'; wing.start(true);
  }
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, partner: Fighter | null) {
    if (!partner) return;
    const own = this.g.world.playerFighter;
    const distance = own ? Math.round(own.pos.distanceTo(partner.pos)) : 0;
    p.copy(partner.pos).project(this.g.engine.camera);
    const label = `${tx(partner.label)} · ${distance} ${tx('m')} · ${tx(partner.alive ? 'PARTNER' : 'DOWN')}`;
    ctx.save(); ctx.font = `600 13px ${CANVAS_MONO}`; ctx.textAlign = 'center';
    const half = ctx.measureText(label).width / 2 + 10;
    const x = THREE.MathUtils.clamp((p.x * .5 + .5) * W, half + 8, W - half - 8), y = THREE.MathUtils.clamp((-p.y * .5 + .5) * H, 70, H - 70);
    ctx.fillStyle = 'rgba(8,20,28,.8)'; ctx.fillRect(x - half, y - 33, half * 2, 24);
    ctx.fillStyle = '#a6edff'; ctx.fillText(label, x, y - 16);
    ctx.strokeStyle = '#8fdfef'; ctx.strokeRect(x - 6, y - 6, 12, 12); ctx.restore();
  }
}
