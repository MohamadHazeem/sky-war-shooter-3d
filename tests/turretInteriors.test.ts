import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../src/audio/Sound', () => ({ sound: { brass: vi.fn() } }));
import { Brass, PILE_CAP } from '../src/game/Brass';
import { buildBallDetails, buildTailDetails, disposeStationDetails, TAIL_FLOOR, TAIL_HALF_WIDTH, FREE_LOOK_YAW, FREE_LOOK_UP } from '../src/game/TurretInteriors';
import { TurretDrive } from '../src/audio/TurretDrive';

const pos = new THREE.Vector3(), vel = new THREE.Vector3(), matrix = new THREE.Matrix4();
function settle(brass: Brass) { for (let i = 0; i < 200; i++) brass.update(1 / 60); }

describe('ball and tail interiors', () => {
  it('keeps static detail merged and the central aim rays clear', () => {
    for (const [kind, build, eyeY, eyeZ] of [['ball', buildBallDetails, 0.05, -0.05], ['tail', buildTailDetails, 0.242, -0.2]] as const) {
      const g = build(); g.updateMatrixWorld(true);
      expect(g.children).toHaveLength(2);
      for (const child of g.children) {
        const m = child as THREE.Mesh;
        expect(m.geometry.getAttribute('color').count).toBe(m.geometry.getAttribute('position').count);
        expect(Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      }
      // An unobstructed central 10-degree cone, including the ADS axis.
      for (const x of [-0.08, 0, 0.08]) for (const y of [-0.08, 0, 0.08]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0, eyeY, eyeZ), new THREE.Vector3(x, y, 1).normalize(), 0, 2);
        expect(ray.intersectObject(g, true), kind).toHaveLength(0);
      }
      disposeStationDetails(g);
    }
  });
  it('closes the tail floor all the way to the window sill', () => {
    const g = buildTailDetails(); g.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0, 0.242, -0.2);
    const towardSill = new THREE.Vector3(0, TAIL_FLOOR, 0.42).sub(eye).normalize();
    expect(new THREE.Raycaster(eye, towardSill, 0, 1).intersectObject(g, true).length).toBeGreaterThan(0);
    disposeStationDetails(g);
  });
  it('allows looking back down the tail and up through the ball hatch', () => {
    expect(FREE_LOOK_YAW.tail).toBeGreaterThan(Math.PI * 0.9);
    expect(FREE_LOOK_UP).toBeGreaterThan(1.4);
  });
});

describe('station brass', () => {
  it('drops ball casings below the old imaginary floor and never makes a pile', () => {
    const br = new Brass(-10, 10);
    br.eject(pos.set(0, -1.5, -4.65), vel.set(0, -2, 0), false);
    br.update(0.05); br.flying.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeLessThan(-1.5);
    settle(br); expect(br.flying.count).toBe(0); expect(br.pileCount).toBe(0); br.dispose();
  });
  it('collects tail brass around the knees on the tail floor, with a bounded pool', () => {
    const br = new Brass(-1.3, 0.4, TAIL_FLOOR, TAIL_HALF_WIDTH, false);
    for (let burst = 0; burst < 12; burst++) {
      for (let i = 0; i < 96; i++) br.eject(pos.set(i % 3 === 0 ? TAIL_HALF_WIDTH : i % 2 ? 0.18 : -0.18, -0.12, -0.08), vel.set(0, -1.4, 0), true);
      settle(br);
    }
    expect(br.pileCount).toBe(PILE_CAP); expect(br.flying.count).toBe(0);
    for (let i = 0; i < br.pile.count; i++) {
      br.pile.getMatrixAt(i, matrix);
      expect(Math.abs(matrix.elements[12])).toBeLessThan(TAIL_HALF_WIDTH);
      expect(matrix.elements[13]).toBeGreaterThan(TAIL_FLOOR);
      expect(matrix.elements[13]).toBeLessThan(TAIL_FLOOR + 0.10);
    }
    const g = new THREE.Group(); g.add(br.pile, br.flying); br.dispose(); expect(g.children).toHaveLength(0);
  });
  it('preserves the existing waist walkway height', () => {
    const br = new Brass(-9, -5);
    br.eject(pos.set(0, 0.2, -7.44), vel.set(0, -2, 0), true); settle(br);
    expect(br.pileCount).toBe(1); br.pile.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(0.15 - 1.12 * 0.78 + 0.015 + 0.0105, 5); br.dispose();
  });
});

it('prebuilds the hydraulic motor, bounds speed and silences it at rest', () => {
  const frequency = { value: 0, setTargetAtTime: vi.fn() }, gain = { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() };
  const oscillator = { type: '', frequency, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
  const level = { gain, connect: vi.fn(), disconnect: vi.fn() };
  oscillator.connect.mockReturnValue(level);
  const context = { currentTime: 1, createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => level) };
  const hum = new TurretDrive(context as unknown as AudioContext, {} as AudioNode);
  hum.update(100); expect(gain.setTargetAtTime).toHaveBeenCalledWith(0.022, 1, 0.06);
  hum.update(0); expect(gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, 0.06);
  hum.update(NaN); expect(frequency.setTargetAtTime).toHaveBeenLastCalledWith(115, 1, 0.08);
  expect(context.createOscillator).toHaveBeenCalledTimes(1);
  hum.dispose(); expect(oscillator.stop).toHaveBeenCalledOnce();
});
