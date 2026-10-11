import { weatherNow } from '../src/render/WeatherState';
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Ballistics, segSphere, type HitEvent } from '../src/world/Ballistics';
import type { Aircraft } from '../src/world/Aircraft';

const DT = 1 / 60;
const RED: [number, number, number] = [1, 0, 0];

// Just enough of an Aircraft for Ballistics.update: position, orientation, velocity, hit zones.
function target(pos: THREE.Vector3, team: 'allied' | 'axis' = 'axis', zoneR = 3): Aircraft {
  const root = new THREE.Object3D();
  root.position.copy(pos);
  return {
    root, team, remove: false, radius: 7, vel: new THREE.Vector3(),
    zones: [{ name: 'fuselage', offset: new THREE.Vector3(), radius: zoneR, hp: 100, maxHp: 100 }],
  } as unknown as Aircraft;
}

describe('segSphere', () => {
  it('returns the entry fraction for a head-on hit', () => {
    // segment 0 -> 100 along x, sphere r=5 at x=50: enters at x=45
    expect(segSphere(0, 0, 0, 100, 0, 0, 50, 0, 0, 5)).toBeCloseTo(0.45, 10);
  });

  it('misses beside, before and behind the segment', () => {
    expect(segSphere(0, 0, 0, 100, 0, 0, 50, 6, 0, 5)).toBe(-1);   // passes 6 m off a 5 m sphere
    expect(segSphere(0, 0, 0, 100, 0, 0, 120, 0, 0, 5)).toBe(-1);  // sphere beyond the end
    expect(segSphere(0, 0, 0, 100, 0, 0, -20, 0, 0, 5)).toBe(-1);  // sphere behind the start
  });

  it('grazing hits and starts inside the sphere', () => {
    expect(segSphere(0, 0, 0, 100, 0, 0, 50, 4.99, 0, 5)).toBeGreaterThan(0);
    expect(segSphere(0, 0, 0, 100, 0, 0, 1, 0, 0, 5)).toBe(0);
  });

  it('a zero-length segment outside the sphere misses', () => {
    expect(segSphere(10, 10, 10, 10, 10, 10, 0, 0, 0, 5)).toBe(-1);
  });
});

describe('Ballistics', () => {
  let b: Ballistics;
  let hits: HitEvent[];
  beforeEach(() => {
    weatherNow.windX = weatherNow.windZ = 0; // isolate the gravity / collision fixtures from crosswind
    b = new Ballistics(64);
    hits = [];
    b.onHit = (e) => hits.push(e);
  });
  const state = () => b as unknown as { px: Float32Array; py: Float32Array; pz: Float32Array; vy: Float32Array };

  it('drops under gravity and slows with drag', () => {
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 500), 'allied', 10, false, RED, null);
    for (let i = 0; i < 60; i++) b.update(DT, []);
    const s = state();
    // free fall for 1 s: ~4.9 m (slightly less with drag, slightly more with the discrete step)
    expect(s.py[0]).toBeLessThan(-4.6);
    expect(s.py[0]).toBeGreaterThan(-5.1);
    expect(s.vy[0]).toBeCloseTo(-9.81 * (1 - Math.exp(-0.12)) / 0.12, 1); // terminal-ish fall speed with drag
    // drag: 500 * (1 - e^-0.12) / 0.12 ~= 471 m
    expect(s.pz[0]).toBeGreaterThan(465);
    expect(s.pz[0]).toBeLessThan(480);
    expect(s.px[0]).toBe(0);
  });

  it('expires rounds after their time to live', () => {
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'allied', 10, false, RED, null, false, false, 0.5);
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'allied', 10, false, RED, null);
    for (let i = 0; i < 40; i++) b.update(DT, []);
    expect(b.n).toBe(1);
    for (let i = 0; i < 200; i++) b.update(DT, []);
    expect(b.n).toBe(0);
  });

  it('keeps fresh tracer tails ahead of the muzzle, including after pool compaction', () => {
    const camera = new THREE.PerspectiveCamera();
    b.fire(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, 880), 'allied', 1, true, RED, null, false, true, 0.001);
    b.fire(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, 880), 'allied', 1, true, RED, null, false, true);
    b.update(DT, []);
    expect(b.n).toBe(1);
    b.renderTracers(camera, 800);
    const geo = b.tracers.mesh.geometry;
    const tail = geo.getAttribute('iA'), head = geo.getAttribute('iB');
    expect(tail.getZ(0)).toBeCloseTo(3, 4);
    expect(head.getZ(0)).toBeGreaterThan(tail.getZ(0));
    for (let i = 0; i < 10; i++) b.update(DT, []);
    b.renderTracers(camera, 800);
    expect(tail.getZ(0)).toBeGreaterThan(3);
  });

  it('caps the pool at max', () => {
    for (let i = 0; i < 100; i++) b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'allied', 1, false, RED, null);
    expect(b.n).toBe(64);
  });

  it('hits an enemy on the line of fire and reports the zone and shooter', () => {
    const ac = target(new THREE.Vector3(0, 0, 200));
    const me = target(new THREE.Vector3(0, 0, 0), 'allied');
    b.fire(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, 800), 'allied', 12, true, RED, me, true, true);
    for (let i = 0; i < 30 && hits.length === 0; i++) b.update(DT, [me, ac]);
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ target: ac, damage: 12, cannon: true, shooter: me, playerShot: true });
    expect(hits[0].zone.name).toBe('fuselage');
    expect(hits[0].point.z).toBeGreaterThan(196);
    expect(hits[0].point.z).toBeLessThan(200);
    expect(b.n).toBe(0); // the round is consumed
  });

  it('ignores friendly aircraft and removed wrecks', () => {
    const friend = target(new THREE.Vector3(0, 0, 100), 'allied');
    const wreck = target(new THREE.Vector3(0, 0, 150));
    (wreck as { remove: boolean }).remove = true;
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'allied', 12, false, RED, null);
    for (let i = 0; i < 30; i++) b.update(DT, [friend, wreck]);
    expect(hits.length).toBe(0);
  });

  it('playerHitScale widens only the player\'s rounds', () => {
    const shoot = (player: boolean) => {
      hits.length = 0;
      b.clear();
      const ac = target(new THREE.Vector3(4, 0, 200));
      b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'allied', 1, false, RED, null, false, player);
      for (let i = 0; i < 30; i++) b.update(DT, [ac]);
      return hits.length;
    };
    expect(shoot(true)).toBe(0); // 4 m off a 3 m zone
    b.playerHitScale = 1.5;      // zone counts as 4.5 m for the player
    expect(shoot(true)).toBe(1);
    expect(shoot(false)).toBe(0);
  });

  it('reports enemy rounds cracking past the listener', () => {
    const near: THREE.Vector3[] = [];
    b.onNearMiss = (p) => near.push(p.clone());
    b.listener.set(3, 0, 100);
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, 800), 'axis', 1, false, RED, null);
    b.fire(new THREE.Vector3(), new THREE.Vector3(0, 0, -800), 'allied', 1, false, RED, null);
    for (let i = 0; i < 20; i++) b.update(DT, []);
    expect(near.length).toBeGreaterThan(0);
  });
});
