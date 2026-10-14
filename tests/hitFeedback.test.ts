import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../src/game/InteriorFx', () => ({ frostTexture: () => new THREE.DataTexture() }));
import { GlassPane, sprayExposure } from '../src/game/GlassFx';
import { InteriorDamage } from '../src/game/InteriorDamage';
import { hitPanel } from '../src/world/DamagePanel';
import { setup, update, damageStage, impact } from '../src/world/DamageStages';
import type { Fighter, Bomber } from '../src/world/Aircraft';
import type { Effects } from '../src/world/Effects';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function effects() {
  return { smoke: { count: 0, spawn: vi.fn() }, glow: { count: 0, spawn: vi.fn() }, spawnDebris: vi.fn(), sparks: vi.fn() } as unknown as Effects;
}
function fighter() {
  const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
  model.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6), new THREE.MeshStandardMaterial()));
  const blade = new THREE.Mesh(), node = new THREE.Group(), disc = new THREE.Mesh();
  node.add(blade); model.add(node, disc);
  const zones = [{ name: 'engine', offset: V(0, 0, 1), hp: 100, maxHp: 100, radius: 1, engine: 0 }];
  return { root, model, pos: root.position, quat: root.quaternion, vel: V(), radius: 5, zones,
    props: [{ node, disc, blades: [blade], base: new THREE.Quaternion() }], propSpin: [0], engineDead: [false],
    alive: true, structureFrac: 1, lastPlayerHit: -99, localToWorld: (p: THREE.Vector3, out: THREE.Vector3) => root.localToWorld(out.copy(p)),
  } as unknown as Fighter;
}

describe('close pass spray', () => {
  it('catches a fast fly-through whose end position is outside the spray radius', () => {
    expect(sprayExposure(V(40, 2, 0), V(800, 0, 0), 0.1)).toBeCloseTo(0.9375);
  });
  it('rejects distant, stationary and future approaches', () => {
    expect(sprayExposure(V(0, 40, 0), V(800, 0, 0), .1)).toBe(0);
    expect(sprayExposure(V(1), V(), .1)).toBe(0);
    expect(sprayExposure(V(-40), V(800, 0, 0), .1)).toBe(0);
  });
});

describe('glass impact geometry', () => {
  it('anchors cracks to the projectile intersection and keeps them until reset', () => {
    const pane = new GlassPane(new THREE.PlaneGeometry(2, 2), { shape: 2 });
    const parent = new THREE.Group(); parent.position.set(12, 5, -8); parent.add(pane.mesh);
    parent.updateMatrixWorld(true);
    expect(pane.crackFromSegment(V(12.3, 5.2, -6), V(12.3, 5.2, -10), .14)).toBe(true);
    const p = pane.mat.uniforms.uCrackP.value[0];
    expect(p.x).toBeCloseTo(.3); expect(p.y).toBeCloseTo(.2); expect(p.z).toBeCloseTo(0); expect(p.w).toBe(.14);
    pane.apply(0); pane.mesh.visible = false; pane.apply(0);
    expect(pane.crackCount).toBe(1);
    for (let i = 0; i < 10; i++) pane.addCrack(V(), .065);
    expect(pane.crackCount).toBe(4);
    pane.oil = pane.spat = .4; pane.reset();
    expect(pane.crackCount).toBe(0); expect(pane.oil + pane.spat).toBe(0);
  });
  it('does not crack for a miss or a zero-length segment', () => {
    const pane = new GlassPane(new THREE.PlaneGeometry(2, 2), { shape: 2 });
    new THREE.Group().add(pane.mesh);
    expect(pane.crackFromSegment(V(3, 0, 2), V(3, 0, -2), .14)).toBe(false);
    expect(pane.crackFromSegment(V(), V(), .14)).toBe(false);
  });
});

describe('persistent interior damage', () => {
  it('reuses a bounded mesh pool across sustained hits and clears at mission end', () => {
    const damage = new InteriorDamage();
    const children = [...damage.group.children];
    for (let i = 0; i < 80; i++) damage.hit(V(1, .2, -6), V(1), true);
    expect(damage.group.children).toEqual(children);
    expect(children.filter(c => c.visible)).toHaveLength(12);
    damage.reset(); expect(children.every(c => !c.visible)).toBe(true);
  });
  it('grows frost only at altitude and respects hidden/Low emitter budgets', () => {
    const damage = new InteriorDamage(), fx = effects();
    const b = { pos: V(0, 4000, 0), vel: V(0, 0, 100), quat: new THREE.Quaternion() } as Bomber;
    damage.hit(V(1), V(1), true);
    damage.update(3, b, fx, 1, true, false);
    expect(fx.smoke.spawn).not.toHaveBeenCalled();
    const frost = damage.group.children[0].children[4]; expect(frost.visible).toBe(true);
    damage.update(.1, b, fx, 1, true, true); expect(fx.smoke.spawn).not.toHaveBeenCalled();
    damage.update(.15, b, fx, 1, true, true); expect(fx.smoke.spawn).toHaveBeenCalled();
    b.pos.y = 500; damage.update(.3, b, fx, 1, true, false); expect(frost.visible).toBe(false);
  });
});

describe('enemy close-up damage', () => {
  it('crosses skipped stages once, reuses patches, and stops a seized prop', () => {
    const f = fighter(), fx = effects(); setup(f);
    const children = f.model.children.length;
    Object.defineProperty(f, 'structureFrac', { value: .2 }); f.zones[0].hp = 0; f.engineDead[0] = true;
    update(f, 1, 1, fx, V(0, 0, 150));
    expect(damageStage(f)).toBe(4);
    const calls = (fx.spawnDebris as ReturnType<typeof vi.fn>).mock.calls.length;
    for (let i = 0; i < 20; i++) update(f, .5, 2 + i, fx, V(0, 0, 150));
    expect(f.model.children.length).toBe(children);
    expect((fx.spawnDebris as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(f.props[0].disc.visible).toBe(false); expect(f.props[0].blades[0].visible).toBe(true);
    const q = f.props[0].node.quaternion.clone(); update(f, 1, 30, fx, V(0, 0, 150));
    expect(q.angleTo(f.props[0].node.quaternion)).toBeLessThan(.001);
  });
  it('flashes on the skin rather than the collision sphere and skips distant impacts', () => {
    const f = fighter(), fx = effects(); setup(f);
    let point = V();
    vi.mocked(fx.glow.spawn).mockImplementation(o => { point.copy(o.pos); });
    const event = { target: f, zone: f.zones[0], point: V(0, 0, 5), bulletVel: V(0, 0, -800), damage: 4, cannon: false, shooter: null, playerShot: true };
    impact(f, event, fx, V(0, 0, 150)); expect(point.z).toBeCloseTo(3);
    vi.mocked(fx.glow.spawn).mockClear(); impact(f, event, fx, V(0, 0, 3000));
    expect(fx.glow.spawn).not.toHaveBeenCalled();
  });
});


describe('allocation-free panel projection', () => {
  it('handles indexed normalized GLTF geometry and transformed aircraft', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Int16Array([-32767,-32767,0, 32767,-32767,0, 0,32767,0]), 3, true));
    geo.setIndex([0,1,2]); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.position.set(12, 30, -10); mesh.scale.set(4, 2, 3); mesh.rotation.y = .7;
    mesh.updateMatrixWorld(true);
    const normal = V(0,0,1).transformDirection(mesh.matrixWorld);
    const ray = new THREE.Ray(mesh.position.clone().addScaledVector(normal, 10), normal.clone().negate());
    const point = V(), outNormal = V();
    expect(hitPanel([mesh], ray, 20, point, outNormal)).toBe(true);
    expect(point.distanceTo(mesh.position)).toBeLessThan(1e-6);
    expect(outNormal.dot(normal)).toBeCloseTo(1);
    expect(hitPanel([mesh], ray, 5, point)).toBe(false);
  });
  it('chooses the closest panel without replacing caller-owned output vectors', () => {
    const near = new THREE.Mesh(new THREE.PlaneGeometry(2,2));
    const far = near.clone(); far.position.z = -2; far.updateMatrixWorld(); near.updateMatrixWorld();
    const point = V(99,99,99);
    expect(hitPanel([far,near], new THREE.Ray(V(0,0,3),V(0,0,-1)),10,point)).toBe(true);
    expect(point.z).toBeCloseTo(0);
    near.visible = false;
    expect(hitPanel([far,near], new THREE.Ray(V(0,0,3),V(0,0,-1)),10,point)).toBe(true);
    expect(point.z).toBeCloseTo(-2);
  });
});
