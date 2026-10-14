import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import {
  CORE, NOSE, TAIL, WING_L, WING_L_TIP, WING_R, WING_R_TIP, PART_COUNT, classify, layoutFrom, kindSpec, subtree, HP_SHARE,
} from '../src/world/destruction/Parts';
import { Structure, planEnding, encodePlan, decodePlan, mulberry, EV_DETACH, EV_EXPLODE, EV_IGNITE, type Plan } from '../src/world/destruction/FailureModel';
import { Body } from '../src/world/destruction/Aero';
import { splitOf, sourceMeshes } from '../src/world/destruction/Split';
import { Destruction } from '../src/world/destruction/Destruction';
import type { Fighter } from '../src/world/Aircraft';
import type { World } from '../src/world/World';

const HP = [200, 150, 150, 150, 60, 150, 60];
const FUEL = kindSpec('fw190').fuel;
const plan = (): Plan => ({ ending: 'none', part: 0, bail: false });
const events = (s: Structure) => Array.from({ length: s.nEv }, (_, i) => [s.evKind[i], s.evPart[i]]);

describe('parts layout', () => {
  const L = layoutFrom(kindSpec('fw190').shares, { minX: -5.25, maxX: 5.25, minZ: -5, maxZ: 4 });
  it('cuts the airframe where a Fw 190 would come apart', () => {
    expect(classify(0, 0.5, -1.4, L)).toBe(CORE);        // cockpit
    expect(classify(0, 0, 3.6, L)).toBe(NOSE);           // cowling
    expect(classify(0.4, 1, -4.6, L)).toBe(TAIL);        // fin
    expect(classify(1.6, 0, -4.6, L)).toBe(TAIL);        // tailplane
    expect(classify(2.4, -0.3, 0, L)).toBe(WING_L);      // +X is the left wing
    expect(classify(-2.4, -0.3, 0, L)).toBe(WING_R);
    expect(classify(4.6, 0, -0.5, L)).toBe(WING_L_TIP);
    expect(classify(-4.6, 0, -0.5, L)).toBe(WING_R_TIP);
  });
  it('a wing takes its outer panel with it; the tail and tips hang alone', () => {
    expect(subtree(WING_L)).toBe((1 << WING_L) | (1 << WING_L_TIP));
    expect(subtree(TAIL)).toBe(1 << TAIL);
    expect(subtree(CORE)).toBe((1 << PART_COUNT) - 1);
    expect(HP_SHARE[WING_L_TIP]).toBeLessThan(HP_SHARE[WING_L]);
  });
});

describe('failure model', () => {
  it('books hits by location: an outer panel shot through comes off alone and is not fatal', () => {
    const s = new Structure(HP, FUEL, 1);
    let ev: number[][] = [];
    for (let i = 0; i < 7; i++) { s.hit(WING_L_TIP, 10, false); ev = ev.concat(events(s)); }
    expect(s.attached(WING_L_TIP)).toBe(false);
    expect(s.attached(WING_L)).toBe(true);
    expect(ev).toContainEqual([EV_DETACH, WING_L_TIP]);
    expect(s.doomed()).toBe(false);
    // rounds where the panel was hit nothing
    expect(s.hit(WING_L_TIP, 10, false)).toBe(0);
  });

  it('a wing shot through at the root takes the panel and dooms the aircraft', () => {
    const s = new Structure(HP, FUEL, 2);
    for (let i = 0; i < 16 && s.attached(WING_R); i++) s.hit(WING_R, 10, false);
    expect(s.attached(WING_R)).toBe(false);
    expect(s.attached(WING_R_TIP)).toBe(false);
    expect(s.doomed()).toBe(true);
    expect(s.bits() & 0x7f).toBe(subtree(WING_R));
  });

  it('is deterministic for a seed (co-op guests replay it from bits)', () => {
    const run = (seed: number) => {
      const s = new Structure(HP, FUEL, seed), log: number[][] = [];
      for (let i = 0; i < 60; i++) { s.hit(i % 3 ? CORE : WING_L, 4, i % 5 === 0); log.push(...events(s)); s.tick(0.1); log.push(...events(s)); }
      return { log, bits: s.bits(), hp: Array.from(s.hp) };
    };
    expect(run(7)).toEqual(run(7));
  });

  it('a fuel fire grows, spreads to the neighbours and cooks the tank off', () => {
    const s = new Structure(HP, FUEL, 3);
    s.ignite(CORE, true);
    expect(events(s)).toEqual([[EV_IGNITE, CORE]]);
    let spread = false, boom = -1;
    for (let t = 0; t < 60 && boom < 0; t += 0.1) {
      s.tick(0.1);
      for (const [k, p] of events(s)) { if (k === EV_IGNITE && p !== CORE) spread = true; if (k === EV_EXPLODE) boom = t; }
    }
    expect(s.fire[CORE]).toBeGreaterThan(0.5);
    expect(spread).toBe(true);
    expect(boom).toBeGreaterThan(1.5);
    expect(boom).toBeLessThan(60);
    expect(s.exploded && s.doomed()).toBe(true);
    expect(s.playerFire).toBe(true);
  });

  it('a burning wing burns through and comes off', () => {
    const s = new Structure(HP, kindSpec('p51d').fuel, 4);
    s.ignite(WING_L);
    let gone = false;
    for (let t = 0; t < 120 && !gone && !s.exploded; t += 0.1) { s.tick(0.1); gone = !s.attached(WING_L); }
    expect(gone || s.exploded).toBe(true);
  });

  it('carries the part state in bits and back', () => {
    const s = new Structure(HP, FUEL, 5);
    s.detach(TAIL); s.ignite(WING_R); s.nEv = 0;
    const g = new Structure(HP, FUEL, 99);
    g.applyBits(s.bits());
    expect(g.attached(TAIL)).toBe(false);
    expect(g.fire[WING_R]).toBeGreaterThan(0);
    expect(g.bits()).toBe(s.bits());
  });

  it('plans the ending from where the damage is', () => {
    const s = new Structure(HP, FUEL, 6);
    expect(planEnding(s, 'wingL', 0.9, 0.9, plan())).toMatchObject({ ending: 'wing', part: WING_L });
    for (let i = 0; i < 5; i++) s.hit(WING_R_TIP, 10, false);
    expect(planEnding(s, 'wingR', 0.9, 0.9, plan())).toMatchObject({ ending: 'wing', part: WING_R_TIP });
    expect(planEnding(new Structure(HP, FUEL, 6), 'tail', 0.9, 0.1, plan())).toMatchObject({ ending: 'tail', part: TAIL, bail: true });
    expect(planEnding(new Structure(HP, FUEL, 6), 'fuel', 0.9, 0.9, plan()).ending).toBe('explode');
    expect(planEnding(new Structure(HP, FUEL, 6), 'engine', 0.9, 0.9, plan()).ending).toBe('none');
    const p = { ending: 'tail', part: TAIL, bail: true } as Plan;
    expect(decodePlan(encodePlan(p), plan())).toEqual(p);
  });

  it('the seeded generator is uniform enough', () => {
    const r = mulberry(11);
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += r();
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });
});

// A Fw 190-like plate model in real units
function hulk(parts: number[]) {
  const b = new Body();
  const plates: Record<number, [number, number, number, number, number, number]> = {
    [CORE]: [0, 0, -0.5, 2.5, 3, 1.2], [NOSE]: [0, 0, 2.6, 1, 1.4, 1.3], [TAIL]: [0, 0.3, -4.4, 1.6, 2.6, 0.4],
    [WING_L]: [1.9, -0.3, 0, 0.2, 5.5, 0.4], [WING_L_TIP]: [4.2, -0.2, -0.4, 0.1, 2.5, 0.2],
    [WING_R]: [-1.9, -0.3, 0, 0.2, 5.5, 0.4], [WING_R_TIP]: [-4.2, -0.2, -0.4, 0.1, 2.5, 0.2],
  };
  const mass = [1300, 1300, 340, 430, 130, 430, 130];
  let M = 0; const com = new THREE.Vector3();
  for (const p of parts) { M += mass[p]; com.addScaledVector(new THREE.Vector3(plates[p][0], plates[p][1], plates[p][2]), mass[p]); }
  com.divideScalar(M);
  let ix = 0, iy = 0, iz = 0;
  for (const p of parts) {
    const [x, y, z, ax, ay, az] = plates[p], dx = x - com.x, dy = y - com.y, dz = z - com.z;
    ix += mass[p] * (dy * dy + dz * dz + 0.5); iy += mass[p] * (dx * dx + dz * dz + 0.5); iz += mass[p] * (dx * dx + dy * dy + 0.5);
    b.plates.push({ c: new THREE.Vector3(dx, dy, dz), ax, ay, az, chord: 1.8, inc: p >= WING_L ? 0.07 : 0 });
  }
  b.nPlates = b.plates.length; b.mass = M; b.inertia.set(ix, iy, iz);
  b.vel.set(0, 0, 150);
  return b;
}

describe('wreck flight physics', () => {
  it('the hulk that lost its left wing rolls toward the stump (the right wing still lifts)', () => {
    const b = hulk([CORE, NOSE, TAIL, WING_R, WING_R_TIP]);
    for (let i = 0; i < 30; i++) b.step(1 / 60);
    expect(b.w.z).toBeLessThan(-0.5);   // -z roll lifts the -X (right) wing
  });

  it('without its tail the hulk pitches nose-down', () => {
    const b = hulk([CORE, NOSE, WING_L, WING_L_TIP, WING_R, WING_R_TIP]);
    for (let i = 0; i < 30; i++) b.step(1 / 60);
    expect(b.w.x).toBeGreaterThan(0.15);  // +x pitch drops the +Z nose
  });

  it('a loose wing panel brakes hard, flutters and falls at a bounded speed', () => {
    const b = new Body();
    b.plates.push({ c: new THREE.Vector3(), ax: 0.3, ay: 4, az: 0.5, chord: 1.6, inc: 0 }); b.nPlates = 1;
    b.mass = 280; b.inertia.set(120, 220, 110);
    b.vel.set(0, 0, 150); b.quat.setFromEuler(new THREE.Euler(0.15, 0, 0.4));
    let maxW = 0;
    for (let i = 0; i < 60 * 20; i++) { b.step(1 / 60); maxW = Math.max(maxW, b.w.length()); }
    expect(Number.isFinite(b.pos.x + b.vel.y + b.quat.w)).toBe(true);
    expect(b.vel.length()).toBeLessThan(80);   // terminal: far below the 150 m/s it left at
    expect(b.vel.y).toBeLessThan(-5);          // and falling
    expect(maxW).toBeGreaterThan(0.5);         // it tumbles / flutters
  });

  it('stays finite with no plates (an engine falling like a stone)', () => {
    const b = new Body(); b.mass = 900; b.vel.set(0, 0, 120);
    for (let i = 0; i < 600; i++) b.step(1 / 60);
    expect(b.vel.y).toBeLessThan(-80);
  });
});

// A flat model like the placeholder Fw 190 (Models.ts): fuselage, wing, tailplane, fin
function model() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial();
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.6, 7.8, 6, 12), 0, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(10.5, 0.2, 1.8, 24, 1, 2), 0, 0, 0.6);
  add(new THREE.BoxGeometry(3.7, 0.15, 1.6, 6, 1, 2), 0, 0, -4.05);
  add(new THREE.BoxGeometry(0.15, 1.6, 2.2), 0, 0.8, -3.8);
  return g;
}

describe('mesh split', () => {
  it('splits one hero LOD, excluding attached props, without duplicating hidden skins', () => {
    const g = new THREE.Group(), part = new THREE.Group(); part.name = 'part_wingL'; g.add(part);
    const lod = new THREE.LOD(); part.add(lod);
    for(let i=0;i<3;i++) lod.addLevel(new THREE.Mesh(new THREE.BoxGeometry(2,0.2,1)),i*100);
    const prop = new THREE.Mesh(new THREE.BoxGeometry()); prop.name = 'prop_1'; part.add(prop);
    expect(sourceMeshes(g)).toHaveLength(1);
    const split = splitOf('test_lod_hero', g);
    expect(split.parts[WING_L].tris).toBe(12);
    expect(split.parts.reduce((n,p)=>n+p.tris,0)).toBe(12);
  });

  it('gives every triangle to exactly one part, sharing the vertex buffers', () => {
    const m = model();
    const s = splitOf('test_plain', m);
    const srcTris = m.children.reduce((n, c) => n + ((c as THREE.Mesh).geometry.index!.count / 3), 0);
    let tris = 0;
    for (const p of s.parts) for (const sub of p.subs) tris += sub.geo.index!.count / 3;
    expect(tris).toBe(srcTris);
    expect(s.parts[WING_L].tris).toBeGreaterThan(0);
    expect(s.parts[WING_L_TIP].tris).toBeGreaterThan(0);
    expect(s.parts[TAIL].tris).toBeGreaterThan(0);
    const sub = s.parts[WING_L].subs[0];
    expect(sub.geo.getAttribute('position')).toBe((m.children[sub.src] as THREE.Mesh).geometry.getAttribute('position'));
    expect(sub.inner.index!.count).toBe(sub.geo.index!.count);
    // the wing's centre of mass is out on the left (+X), its joint at the root
    expect(s.parts[WING_L].com.x).toBeGreaterThan(1);
    expect(s.parts[WING_L].joint.x).toBeCloseTo(s.layout.rootX);
    // shards cover their part
    const core = s.parts[CORE];
    expect(core.shards.length).toBeGreaterThan(1);
    expect(core.shards.reduce((n, c) => n + c.tris, 0)).toBe(core.tris);
  });

  it('uses named parts on a hero model (part_<name> nodes, joint_ and fuel_ markers)', () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    for (const [name, x] of [['core', 0], ['wingL', 3], ['wingR', -3]] as const) {
      const n = new THREE.Group(); n.name = `part_${name}`; n.position.x = x;
      n.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 1.5), mat)); g.add(n);
    }
    const j = new THREE.Object3D(); j.name = 'joint_wingL'; j.position.set(1.1, 0.05, 0.1); g.add(j);
    const s = splitOf('test_hero', g);
    expect(s.hero).toBe(true);
    expect(s.parts[WING_L].tris).toBe(12);
    expect(s.parts[WING_L].joint.toArray()).toEqual([1.1, 0.05, 0.1]);
    expect(s.classify(3, 0, 0)).toBe(WING_L);
    expect(s.classify(-3.2, 0, 0)).toBe(WING_R);
  });
});

// A minimal world and enemy for the runtime
function rig(kind = 'fw190', team = 'axis') {
  const scene = new THREE.Scene();
  const effects = {
    smoke: { count: 0, spawn: vi.fn() }, glow: { count: 0, spawn: vi.fn() },
    trail: vi.fn(), explosion: vi.fn(), sparks: vi.fn(), spawnDebris: vi.fn(), parachute: vi.fn(() => true),
  };
  const killAircraft = vi.fn();
  const world = { scene, effects, listener: new THREE.Vector3(0, ALT, -300), killAircraft, aircraft: [] as any[], playerIncendiary: 0, events: {}, debrisHit: vi.fn(), time: 0, player: null } as unknown as World;
  const root = new THREE.Group(), mdl = model();
  root.position.y = ALT;
  mdl.scale.setScalar(6);
  root.add(mdl); scene.add(root);
  const zone = (name: string, x: number, y: number, z: number, r: number, hp: number) => ({ name, offset: new THREE.Vector3(x, y, z).multiplyScalar(6), radius: r * 6, hp, maxHp: hp });
  const zones = [zone('engine', 0, 0, 1.15, 0.9, 290), zone('cockpit', 0, 0.6, -1.3, 0.6, 210), zone('fuselage', 0, 0.1, -3.4, 0.75, 370), zone('tail', 0, 0.55, -5.75, 1.05, 260),
    zone('wingL', 2.6, -0.3, -0.25, 1.45, 330), zone('wingR', -2.6, -0.3, -0.25, 1.45, 330)];
  const f = {
    id: 42, kind, team, enemyType: 'fw190', root, model: mdl, pos: root.position, quat: root.quaternion, vel: new THREE.Vector3(0, 0, 140),
    zones, alive: true, falling: false, remove: false, spin: new THREE.Vector3(), rollTrim: 0, playerDamage: 0, damageTaken: 0, structure: 460, maxStructure: 460,
    pilotKilled: false, bailedOut: false, radius: 42,
    zone: (n: string) => zones.find((z) => z.name === n),
    worldToLocal: (p: THREE.Vector3, out: THREE.Vector3) => out.copy(p).sub(root.position).applyQuaternion(root.quaternion.clone().invert()),
    localToWorld: (p: THREE.Vector3, out = new THREE.Vector3()) => out.copy(p).applyQuaternion(root.quaternion).add(root.position),
    up: (out: THREE.Vector3) => out.set(0, 1, 0).applyQuaternion(root.quaternion),
  } as unknown as Fighter;
  scene.updateMatrixWorld(true);
  const d = new Destruction(world);
  return { d, f, world, effects, killAircraft, scene };
}
const ALT = 7600;
const hitAt = (d: Destruction, f: Fighter, x: number, y: number, z: number, dmg = 30) =>
  d.onHit(f, { target: f, zone: f.zones[0], point: new THREE.Vector3(x, y, z).multiplyScalar(6).add(f.pos), damage: dmg, cannon: false, shooter: null, bulletVel: new THREE.Vector3(), playerShot: true });

describe('destruction runtime', () => {
  it.each(['p51d', 'b17'])('uses physical Allied %s hulks and frees their pieces on reset', kind => {
    const {d, f} = rig(kind, 'allied');
    f.alive = false; f.falling = true;
    d.separate(f, WING_R, false);
    expect(d.counts()).toMatchObject({pieces:1, hulks:1});
    expect(f.falling).toBe(false); // no second gravity/position integration by Aircraft.update
    const before = f.quat.clone();
    for (let i=0;i<60;i++) d.update(1/60);
    expect(before.angleTo(f.quat)).toBeGreaterThan(0.2);
    expect(Number.isFinite(f.pos.y)).toBe(true);
    const off = new THREE.Vector3(10000,0,10000), body = d.hulkBody(f)!;
    const old = body.pos.clone(); d.rebase(off);
    expect(body.pos.distanceTo(old.sub(off))).toBeLessThan(1e-6);
    d.clear(); expect(d.counts()).toMatchObject({pieces:0,hulks:0,tracked:0});
  });
  it('books Allied fighter hits by structural location', () => {
    const {d,f} = rig('p51d','allied');
    for(let i=0;i<6;i++) hitAt(d,f,4.6,0,0.6);
    expect(d.structure(f)!.attached(WING_L_TIP)).toBe(false);
    expect(f.alive).toBe(true);
  });

  // the runtime rolls eject impulses and spins with Math.random: seed it so a lifting panel can't balloon by chance
  beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(mulberry(9)); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('rounds on the wingtip shoot it off as a piece of the real mesh; the fighter flies on rolling', () => {
    const { d, f, killAircraft } = rig();
    for (let i = 0; i < 6; i++) hitAt(d, f, 4.6, 0, 0.6);
    expect(d.structure(f)!.attached(WING_L_TIP)).toBe(false);
    expect(killAircraft).not.toHaveBeenCalled();
    expect(d.counts().pieces).toBe(1);
    expect(f.rollTrim).toBeLessThan(0);
    expect(d.stats.separations).toBe(1);
    // the piece falls behind and down with its own physics
    const piece = (d as any).pieces[0];
    const y0 = piece.body.pos.y, z0 = piece.body.pos.z;
    for (let i = 0; i < 120; i++) d.update(1 / 60);
    expect(piece.body.pos.y).toBeLessThan(y0);
    expect(piece.body.vel.z).toBeLessThan(140);
    expect(piece.body.pos.z).toBeGreaterThan(z0);
  });

  it('a wing shot off at the root kills it; separate() leaves a hulk that rolls toward the stump', () => {
    const { d, f, killAircraft } = rig();
    killAircraft.mockImplementation(() => { (f as any).alive = false; (f as any).falling = true; d.separate(f, WING_L, false); });
    for (let i = 0; i < 12 && f.alive; i++) hitAt(d, f, 2.2, 0, 0.6, 40);
    expect(killAircraft).toHaveBeenCalledWith(f, true, 'wingL');
    expect(d.counts().hulks).toBe(1);
    expect(d.counts().pieces).toBe(1);     // the wing with its panel, one piece
    const q0 = f.quat.clone();
    for (let i = 0; i < 60; i++) d.update(1 / 60);
    expect(f.quat.angleTo(q0)).toBeGreaterThan(0.2);
    const roll = new THREE.Euler().setFromQuaternion(f.quat, 'ZXY').z;
    expect(roll).toBeLessThan(0);           // -X (right, still lifting) side up
  });

  it('an explosion shatters the seat of the fire and throws the other parts off whole', () => {
    const { d, f } = rig();
    d.explode(f);
    const { pieces } = d.counts();
    const core = d.structure(f)!;
    expect(core.exploded).toBe(true);
    expect(f.remove).toBe(true);
    expect(d.stats.shards).toBeGreaterThan(1);
    expect(pieces).toBe(d.stats.shards + 4);   // shards of the core + nose, tail, both wings (tips ride on them)
    for (let i = 0; i < 30; i++) d.update(1 / 60);
    // the pieces fly apart
    const ps = (d as any).pieces.filter((p: any) => p.active);
    const spread = Math.max(...ps.map((p: any) => p.body.pos.distanceTo(f.pos)));
    expect(spread).toBeGreaterThan(20);
  });

  it('the death code round-trips for co-op guests', () => {
    const { d, f } = rig();
    d.record(f, 2, WING_R, true);
    const g = rig();
    g.d.forceDeath(g.f, d.deathCode(f));
    expect(g.d.forcedDeath(g.f)).toEqual({ kind: 2, part: WING_R, bail: true });
  });
});
