import * as THREE from 'three';
import type { World } from '../world/World';
import type { Input } from '../core/Input';
import type { UI } from '../ui/UI';
import type { PilotController } from './PilotController';
import type { Wingman } from './Wingman';
import type { Mission } from './Missions';
import type { OpsResult } from './PilotOps';
import { Fighter, WRECK_FLOOR } from '../world/Aircraft';
import { segSphere } from '../world/Ballistics';
import { SeaWorld, SeaShip, ordnanceMat } from '../world/SeaWorld';
import { seaWave, canSkipBomb, type SeaWeapon } from '../world/SeaCombat';
import { LowFighterPilot, pullOutHeight } from './StrafeOps';
import { SEA_RADIO } from './SeaMission';
import { tx, CANVAS_MONO } from '../i18n';
import { sound } from '../audio/Sound';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FORWARD = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Vector3();
const TRACER: [number, number, number] = [12, 3.4, .8];
const ordnanceGeo = new THREE.CylinderGeometry(.22, .28, 2.2, 8).rotateX(Math.PI / 2);
interface Ordnance { mesh: THREE.Mesh; vel: THREE.Vector3; old: THREE.Vector3; life: number; kind: 'rocket' | 'bomb'; skips: number; fuse: number; trailT: number }

export class SeaOps {
  active = false;
  readonly sea = new SeaWorld();
  rockets = 8; bombs = 2; wave = 0;
  private pendingScore = 0;
  private cleared = 0;
  private cooldown = 0;
  private wing: Wingman | null = null;
  private controls: HTMLElement | null = null;
  private rocketQueued = false;
  private bombQueued = false;
  private res: OpsResult = { scripted: true, score: 0, incoming: null, roundOver: false };
  private ordnance: Ordnance[] = [];
  private hitShip: SeaShip | null = null;
  private hitPart = -1;
  private hitT = 2;
  private low = false;
  constructor(private world: World, private ui: UI, private input: Input | null, private lead: PilotController | null) {
    world.scene.add(this.sea.root);
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(ordnanceGeo, ordnanceMat); mesh.visible = false; this.sea.root.add(mesh);
      this.ordnance.push({ mesh, vel: new THREE.Vector3(), old: new THREE.Vector3(), life: 0, kind: 'rocket', skips: 0, fuse: -1, trailT: 0 });
    }
  }
  start(m: Mission, wing: Wingman) {
    this.stop();
    if (!m.naval || m.role !== 'pilot' || !this.world.playerFighter) return;
    const w = this.world, pf = w.playerFighter!;
    this.active = true; this.wing = wing; this.wave = 0; this.pendingScore = 0; this.cleared = 0;
    this.sea.root.position.set(pf.pos.x, 0, pf.pos.z + 1600); this.sea.root.visible = true;
    pf.pos.y = 190; pf.fm.vel.set(0, 0, 145); pf.vel.copy(pf.fm.vel);
    w.floorY = -1e9; WRECK_FLOOR.fighter = -1e9;
    if (this.lead) this.lead.groundAt = this.sea.groundAt;
    wing.lowLevel = { floorAt: (x, z, vel) => this.sea.groundAt(x, z) + 60 + pullOutHeight(vel), run: () => false, pick: () => false, busy: () => false };
    w.ballistics.ground = this.ballistic;
    this.controls = document.createElement('div');
    this.controls.style.cssText = 'position:fixed;bottom:105px;right:20px;z-index:6;display:flex;gap:8px';
    for (const kind of ['rocket', 'bomb'] as const) {
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = tx(kind === 'rocket' ? 'HVAR · R' : '500 lb · N');
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (!this.input?.active) return; if (kind === 'rocket') this.rocketQueued = true; else this.bombQueued = true; });
      this.controls.appendChild(b);
    }
    document.body.appendChild(this.controls);
    w.callout('sea_start', 'Control', SEA_RADIO.start, 0, 4);
  }
  stop() {
    if (this.active) {
      this.world.ballistics.ground = null; this.world.floorY = 250; WRECK_FLOOR.fighter = 3000;
      if (this.lead) this.lead.groundAt = null;
      if (this.wing) this.wing.lowLevel = null;
    }
    this.active = false; this.sea.root.visible = false; this.sea.clear();
    this.controls?.remove(); this.controls = null;
    this.rocketQueued = this.bombQueued = false;
    for (const o of this.ordnance) { o.life = 0; o.mesh.visible = false; }
  }
  /** Same entry point used by normal round changes and deterministic dev scene setup. */
  beginWave(wave: number) {
    this.wave = wave; this.sea.clear(); this.cleared = 0; this.rockets = 8; this.bombs = 2; this.cooldown = 0;
    for (const o of this.ordnance) { o.life = 0; o.mesh.visible = false; }
    const kinds = seaWave(wave); let ships = 0, shore = 0;
    for (const kind of kinds) {
      if (['battery', 'flak88', 'tower', 'radar', 'searchlight'].includes(kind)) this.sea.add(kind, 3340 + (shore % 2) * 160, -700 + shore++ * 280, -Math.PI / 2);
      else { this.sea.add(kind, (ships % 3 - 1) * 370, Math.floor(ships / 3) * 450, .45); ships++; }
    }
    const pf = this.world.playerFighter;
    if (pf) {
      // A fresh attack run after the hangar: avoids leaving a new fleet kilometres behind.
      pf.pos.set(this.sea.root.position.x, 190, this.sea.root.position.z - 1600); pf.root.quaternion.identity(); pf.fm.vel.set(0, 0, 145); pf.vel.copy(pf.fm.vel);
      for (const gun of pf.guns) gun.ammo = 700;
      const wing = this.wing?.plane;
      if (wing?.alive) { wing.pos.copy(pf.pos).add(_v.set(-45, 15, -45)); wing.fm.vel.copy(pf.fm.vel); wing.vel.copy(pf.vel); }
      this.world.formationCenter.copy(pf.pos).add(_v.set(0, 170, 1000));
    }
    if (wave >= 3) for (let i = 0; i < Math.min(3, 1 + Math.floor(wave / 5)); i++) {
      const f = this.world.spawnEnemy(_p.copy(this.sea.root.position).add(_v.set(1000 + i * 200, 550, 2000)), 'high', .9, false, false, i % 2 ? 'fw190' : 'bf109');
      const k = 2.5 / (f.model.scale.x || 1); f.model.scale.setScalar(2.5); for (const z of f.zones) { z.offset.multiplyScalar(k); z.radius *= k; } f.radius *= k; for (const gun of f.guns) gun.offset.multiplyScalar(k); f.structure *= .55; f.maxStructure *= .55;
      const pilot = new LowFighterPilot(f, Math.min(1.4, .8 + wave * .035), this.sea.groundAt, this.home);
      f.ai = pilot; this.world.setPilot(f, pilot);
    }
    this.ui.banner(tx('SEA STRIKE · WAVE {n}', { n: wave }), tx(wave % 5 === 0 ? 'Silence the guns, then strike the magazines' : 'Sink the fleet and silence the shore batteries'), 3500);
    if (wave % 5 === 0) this.world.callout('sea_boss', 'Control', SEA_RADIO.boss, 0, 4);
  }
  private home = () => this.sea.root.position;
  direct(dt: number, roundIdx: number): OpsResult {
    const r = this.res; r.score = 0; r.roundOver = false; r.fail = null;
    if (!this.active) return r;
    if (this.wave !== roundIdx + 1) this.beginWave(roundIdx + 1);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.input?.hit('KeyR') || this.rocketQueued) this.launch('rocket');
    if (this.input?.hit('KeyN') || this.bombQueued) this.launch('bomb');
    this.rocketQueued = this.bombQueued = false;
    this.sea.update(dt, this.low, this.world.playerFighter?.pos);
    this.updateOrdnance(dt);
    let live = false, radar = false;
    for (const s of this.sea.ships) { if (!s.combat.resolved) live = true; if (s.kind === 'radar' && s.combat.alive) radar = true; }
    for (const s of this.sea.ships) this.fight(s, dt, radar);
    for (const a of this.world.aircraft) {
      if (!(a instanceof Fighter) || !a.alive || a.remove) continue;
      if (a.pos.y <= this.sea.groundAt(a.pos.x, a.pos.z) + 2) {
        this.world.effects.explosion(a.pos, ZERO, .6);
        if (a.isPlayer) { a.alive = false; a.falling = false; r.fail = 'Your Mustang struck the sea or coastline.'; }
        else this.world.killAircraft(a, a.playerDamage > 0, 'ground');
      }
      if (a.team === 'axis' && a.alive) live = true;
    }
    if (!this.world.playerFighter?.alive && !r.fail) r.fail = 'Your Mustang was shot down over the sea.';
    this.cleared = live ? 0 : this.cleared + dt;
    r.roundOver = this.cleared > 2; r.score = this.pendingScore; this.pendingScore = 0;
    return r;
  }
  setQuality(low: boolean) { this.low = low; }
  /** Bombs/rockets are pooled and use the same collision path in play and tests/dev checks. */
  launch(kind: 'rocket' | 'bomb') {
    const pf = this.world.playerFighter;
    if (!this.active || !pf?.alive || this.cooldown > 0 || (kind === 'rocket' ? this.rockets : this.bombs) <= 0) return false;
    const o = this.ordnance.find(p => p.life <= 0); if (!o) return false;
    if (kind === 'rocket') this.rockets--; else this.bombs--;
    o.kind = kind; o.life = 14; o.skips = 0; o.fuse = -1; o.trailT = 0; o.mesh.visible = true;
    o.mesh.position.copy(pf.pos).sub(this.sea.root.position); o.mesh.position.y -= 2;
    o.mesh.quaternion.copy(pf.root.quaternion); o.mesh.scale.setScalar(kind === 'bomb' ? 1.5 : 1);
    pf.forward(_d); o.vel.copy(pf.vel); if (kind === 'rocket') o.vel.addScaledVector(_d, 580);
    this.cooldown = .3; sound.play('rocket', pf.pos, { gain: .7, ref: 120 }); return true;
  }
  private updateOrdnance(dt: number) {
    for (const o of this.ordnance) {
      if (o.life <= 0) continue;
      o.life -= dt; o.old.copy(o.mesh.position); o.vel.y -= 9.81 * dt; o.mesh.position.addScaledVector(o.vel, dt);
      _d.copy(o.vel).normalize(); o.mesh.quaternion.setFromUnitVectors(FORWARD, _d); // visual nose follows velocity
      const p = o.mesh.position;
      o.trailT -= dt;
      if (o.kind === 'rocket' && o.trailT <= 0) { o.trailT = .08; this.world.effects.trail(_p.copy(p).add(this.sea.root.position), ZERO, .25, true, .35); }
      if (o.fuse >= 0) o.fuse -= dt;
      this.trace(o.old, p, o.kind);
      const ground = this.sea.groundAt(p.x + this.sea.root.position.x, p.z + this.sea.root.position.z);
      let explode = this.hitShip !== null || (o.fuse < 0 && o.skips > 0) || o.life <= 0;
      if (p.y <= ground + .5 && !explode) {
        if (ground === 0 && o.kind === 'bomb' && canSkipBomb(o.vel.y, Math.hypot(o.vel.x, o.vel.z), o.skips)) {
          o.skips++; p.y = .8; o.vel.y = Math.max(9, -o.vel.y * .42); o.vel.multiplyScalar(.78); if (o.skips === 1) o.fuse = 3;
          this.sea.effects.splash(p, 1.5);
          this.world.effects.flak(_p.copy(p).add(this.sea.root.position));
        } else explode = true;
      }
      if (explode) {
        if (this.hitShip) p.lerpVectors(o.old, p, this.hitT);
        this.blast(p, o.kind); o.life = 0; o.mesh.visible = false;
      }
    }
  }
  private trace(a: THREE.Vector3, b: THREE.Vector3, weapon: SeaWeapon) {
    this.hitShip = null; this.hitPart = -1; this.hitT = 2;
    for (const s of this.sea.ships) {
      const c = s.combat; if (!c.alive || c.dive === 'submerged' && weapon !== 'bomb') continue;
      if (segSphere(a.x, a.y, a.z, b.x, b.y, b.z, s.root.position.x, s.root.position.y, s.root.position.z, c.spec.length * .6) < 0) continue;
      _q.copy(s.root.quaternion).invert(); _a.copy(a).sub(s.root.position).applyQuaternion(_q); _b.copy(b).sub(s.root.position).applyQuaternion(_q);
      for (let i = 0; i < c.parts.length; i++) {
        const part = c.parts[i]; if (part.hp <= 0 || part.kind === 'magazine' && !c.armourOpen) continue;
        // Hull volumes are shallow ellipsoids, not tall spheres that would swallow deck mounts.
        const flat = part.kind === 'hull' || part.kind === 'magazine';
        const ry = flat && !c.spec.shore ? Math.max(2.5, c.spec.beam * .21) : part.radius;
        const sy = part.radius / ry;
        const t = segSphere(_a.x, _a.y * sy, _a.z, _b.x, _b.y * sy, _b.z, part.x, part.y * sy, part.z, part.radius);
        if (t >= 0 && t < this.hitT) { this.hitT = t; this.hitShip = s; this.hitPart = i; }
      }
    }
  }
  private ballistic: NonNullable<World['ballistics']['ground']> = (ax, ay, az, bx, by, bz, axis, damage, player) => {
    if (!this.active) return false;
    const root = this.sea.root.position;
    // Dedicated endpoints: trace uses _a/_b to transform into each hull's frame.
    this.gunA.set(ax - root.x, ay - root.y, az - root.z); this.gunB.set(bx - root.x, by - root.y, bz - root.z);
    if (!axis) {
      this.trace(this.gunA, this.gunB, 'gun');
      if (this.hitShip) { if (this.damage(this.hitShip, this.hitPart, damage, 'gun', player) > 0 && player) this.world.stats.hits++; return true; }
    }
    const ground = this.sea.groundAt(bx, bz);
    if (by <= ground && ground === 0 && ay > 0 && this.world.playerFighter && _p.set(bx, 0, bz).distanceToSquared(this.world.playerFighter.pos) < 1200 * 1200) {
      const t = ay / (ay - by); _p.set(ax + (bx - ax) * t - root.x, 1, az + (bz - az) * t - root.z); this.sea.effects.splash(_p, .45);
    }
    return by <= ground;
  };
  private gunA = new THREE.Vector3(); private gunB = new THREE.Vector3();
  damage(ship: SeaShip, part: number, amount: number, weapon: SeaWeapon, player = true) {
    const c = ship.combat, p = c.parts[part]; if (!p) return 0;
    const surfaced = c.dive === 'surfaced', old = p.hp;
    const n = c.damage(part, amount, weapon);
    if (surfaced && c.dive === 'diving') this.world.callout('sea_dive', 'Control', SEA_RADIO.dive, 15, 3);
    if (n <= 0) return n;
    if (player) this.world.stats.damage += n;
    if (old > 0 && p.hp <= 0) this.world.effects.explosion(ship.partPosition(p, _p).add(this.sea.root.position), ZERO, .45);
    if (!c.alive && !ship.credited) {
      ship.credited = true;
      if (player) { this.pendingScore += c.spec.score; this.world.stats.kills++; }
      this.world.effects.warshipBlast(_p.copy(ship.root.position).add(this.sea.root.position), ZERO, Math.max(.5, c.spec.length / 180));
      if (ship.kind === 'radar') this.world.callout('sea_radar', 'Control', SEA_RADIO.radar, 0, 3);
    }
    return n;
  }
  blast(pos: THREE.Vector3, weapon: 'rocket' | 'bomb') {
    const radius = weapon === 'bomb' ? 75 : 24, power = weapon === 'bomb' ? 1150 : 620;
    for (const s of this.sea.ships) {
      if (!s.combat.alive) continue;
      let hullPart = -1, hullDist = Infinity;
      for (let i = 0; i < s.combat.parts.length; i++) {
        const p = s.combat.parts[i]; if (p.hp <= 0) continue;
        const dist = Math.max(0, s.partPosition(p, _p).distanceTo(pos) - p.radius);
        if (p.kind === 'hull' || p.kind === 'magazine') { if (dist < hullDist || p.kind === 'magazine' && dist < radius * .3) { hullPart = i; hullDist = dist; } }
        else if (dist < radius) this.damage(s, i, power * (1 - dist / radius), weapon);
      }
      if (hullPart >= 0 && hullDist < radius) this.damage(s, hullPart, power * (1 - hullDist / radius), weapon);
    }
    this.world.effects.warshipBlast(_p.copy(pos).add(this.sea.root.position), ZERO, weapon === 'bomb' ? 1.1 : .45);
    sound.play('explosion', _p, { gain: 1, ref: 300 });
  }
  private fight(s: SeaShip, dt: number, radar: boolean) {
    const c = s.combat, w = this.world, pf = w.playerFighter!;
    if (!pf?.alive || c.resolved) return;
    if (!c.alive) {
      s.effectT -= dt;
      if (s.effectT <= 0) { s.effectT = this.low ? .3 : .12; w.effects.trail(_p.copy(s.root.position).add(this.sea.root.position).setY(3), ZERO, 1, c.sinkTime < 22, c.spec.length / 40); }
      return;
    }
    if (c.dive === 'submerged') return;
    let turrets = 0;
    s.gunT -= dt; s.heavyT -= dt;
    const firing = s.gunT <= 0;
    if (firing) s.gunT = c.spec.flak >= 5 ? .55 : 1;
    for (let i = 0; i < c.parts.length; i++) {
      const p = c.parts[i]; if (p.hp <= 0 || p.kind !== 'turret' && p.kind !== 'flak') continue;
      if (p.kind === 'turret') turrets++;
      s.partPosition(p, _p).add(this.sea.root.position); _d.copy(pf.pos).sub(_p);
      const dist = _d.length();
      const mount = s.mounts[i]; if (mount) {
        const yaw = Math.atan2(Math.sin(Math.atan2(_d.x, _d.z) - s.heading), Math.cos(Math.atan2(_d.x, _d.z) - s.heading));
        mount.rotation.y = s.kind === 'battery' ? THREE.MathUtils.clamp(yaw, -.5, .5) : yaw;
        const barrels = s.barrels[i]; if (barrels) barrels.rotation.x = -THREE.MathUtils.clamp(Math.atan2(_d.y, Math.hypot(_d.x, _d.z)), -.08, s.kind === 'battery' ? .12 : p.kind === 'flak' ? 1.35 : .62);
      }
      if (!firing || dist > 2600 || dist < 10) continue;
      _v.copy(pf.pos).addScaledVector(pf.vel, dist / 780).sub(_p);
      const error = (radar ? 8 : 36) * w.enemyAimMult;
      _v.x += Math.sin(this.sea.time * 2.8 + i * 7 + s.index) * error; _v.y += Math.cos(this.sea.time * 3.1 + i * 11) * error;
      _v.normalize().multiplyScalar(780); _v.y += 4.905 * dist / 780;
      this.sea.fireGun(s, i);
      w.ballistics.fire(_p, _v, 'axis', 5 * Math.min(1.5, .85 + this.wave * .035), true, TRACER, null, true, false, 4);
    }
    if (turrets > 0 && (s.kind === 'battleship' || s.kind === 'battery')) {
      if (s.heavyT <= 0 && s.salvoT < 0) {
        s.heavyT = 16; s.salvoT = 3; s.salvo.copy(pf.pos).addScaledVector(pf.vel, 1.3).sub(this.sea.root.position);
        w.callout('sea_salvo', 'Control', SEA_RADIO.salvo, 10, 3);
      }
      if (s.salvoT >= 0) {
        s.salvoT -= dt;
        if (s.salvoT <= 0) {
          for (let i = 0; i < c.parts.length; i++) if (c.parts[i].kind === 'turret' && c.parts[i].hp > 0) this.sea.fireGun(s, i, true);
          for (let i = 0; i < turrets; i++) {
            _p.copy(s.salvo).add(this.sea.root.position); _p.x += (i - (turrets - 1) / 2) * 36; w.flakBurst(_p);
            // Visual shell-fall columns below the warned airburst, using the same sea-local origin.
            _p.sub(this.sea.root.position).setY(1); if (_p.x < 2820) this.sea.effects.splash(_p, 3);
          }
          s.salvoT = -1;
        }
      }
    } else s.salvoT = -1;
  }
  objective() {
    let left = 0; for (const s of this.sea.ships) if (!s.combat.resolved) left++;
    return tx('Sea wave {n} · {left} targets · HVAR {rockets}/8 · Bombs {bombs}/2', { n: this.wave, left, rockets: this.rockets, bombs: this.bombs });
  }
  drawOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, camera: THREE.Camera) {
    if (!this.active) return;
    if (this.controls) this.controls.style.display = this.input?.active ? 'flex' : 'none';
    ctx.save(); ctx.font = `12px ${CANVAS_MONO}`; ctx.textAlign = 'center';
    for (const s of this.sea.ships) {
      const c = s.combat; if (c.resolved) continue;
      if (s.salvoT >= 0) {
        _v.copy(s.salvo).add(this.sea.root.position).project(camera);
        const sx = (_v.x * .5 + .5) * W, sy = (-_v.y * .5 + .5) * H;
        ctx.fillStyle = '#ffb294'; ctx.fillText(tx('SALVO — BREAK AWAY'), W / 2, H * .3);
        ctx.strokeStyle = '#ff654f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 25 + s.salvoT * 12, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#ffb294'; ctx.fillText(tx('SALVO — BREAK AWAY'), sx, sy - 70);
      }
      _p.copy(s.root.position).add(this.sea.root.position); _p.y += c.spec.beam + 12; _p.project(camera);
      const behind = _p.z < -1 || _p.z > 1;
      if (behind || Math.abs(_p.x) > .94 || Math.abs(_p.y) > .8) {
        if (!c.alive) continue;
        const dx = _p.x * (behind ? -1 : 1), dy = -_p.y * (behind ? -1 : 1);
        const edge = Math.max(Math.abs(dx) / .88, Math.abs(dy) / .7, .001);
        const ex = W * (.5 + dx / edge * .5), ey = H * (.5 + dy / edge * .5);
        ctx.fillStyle = '#e7bf77'; ctx.fillText(tx(c.spec.label), ex, ey - 12);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(dy, dx));
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -4); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
        continue;
      }
      const x = (_p.x * .5 + .5) * W, y = (-_p.y * .5 + .5) * H;
      if (x < 30 || x > W - 30 || y < 30 || y > H - 100) continue;
      ctx.fillStyle = '#f0d292'; ctx.strokeStyle = '#e7bf77'; ctx.strokeRect(x - 7, y, 14, 14);
      ctx.fillText(tx(c.spec.label), x, y - 18);
      if (c.spec.length >= 75) { ctx.fillStyle = '#172124'; ctx.fillRect(x - 40, y - 11, 80, 4); ctx.fillStyle = '#e7bf77'; ctx.fillRect(x - 40, y - 11, 80 * c.hp / c.spec.hp, 4); }
      if (c.sink !== 'afloat' || c.dive !== 'surfaced') { ctx.fillStyle = '#a4d9ed'; ctx.fillText(tx(c.sink !== 'afloat' ? 'SINKING' : c.dive === 'diving' ? 'CRASH-DIVING' : 'SUBMERGED'), x, y + 30); }
      if (s.kind === 'battleship') { ctx.fillStyle = '#ffcc80'; ctx.fillText(tx(c.armourOpen ? 'MAGAZINES EXPOSED' : 'DESTROY TURRETS AND FLAK'), x, y + 30); }
      if (this.world.playerFighter && s.root.position.distanceTo(_v.copy(this.world.playerFighter.pos).sub(this.sea.root.position)) < 1400) {
        for (const p of c.parts) {
          if (p.hp <= 0 || p.kind === 'hull' || p.kind === 'magazine' && !c.armourOpen) continue;
          s.partPosition(p, _v).add(this.sea.root.position).project(camera); if (_v.z < -1 || _v.z > 1) continue;
          const px = (_v.x * .5 + .5) * W, py = (-_v.y * .5 + .5) * H;
          ctx.strokeStyle = p.kind === 'magazine' ? '#ff704e' : '#ffe2a4'; ctx.strokeRect(px - 5, py - 5, 10, 10);
        }
      }

    }
    const pf = this.world.playerFighter;
    if (pf && pf.pos.y - this.sea.groundAt(pf.pos.x, pf.pos.z) < pullOutHeight(pf.vel) + 25) { ctx.fillStyle = '#ff8e63'; ctx.fillText(tx('PULL UP'), W / 2, H * .65); }
    ctx.fillStyle = '#e5dfbe'; ctx.fillText(tx('R: HVAR rocket · N: 500 lb bomb · Low and level: skip bombing'), W / 2, H - 105);
    ctx.restore();
  }
}
