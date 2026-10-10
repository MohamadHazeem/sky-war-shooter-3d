import { describe, expect, it } from 'vitest';
import { buildTranslation, defaultBindings, KeyMap, keyLabel } from '../src/core/KeyMap';
import { dragToMouse, stickValue } from '../src/core/Touch';
import { padCurve } from '../src/core/Gamepad';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe('KeyMap', () => {
  it('defaults translate nothing', () => {
    expect(buildTranslation(defaultBindings()).size).toBe(0);
    const km = new KeyMap(memStore());
    expect(km.translate('KeyR', true)).toBe('KeyR');
    expect(km.isDefault()).toBe(true);
  });

  it('a rebound key sends the action code and the old key goes quiet in play', () => {
    const km = new KeyMap(memStore());
    expect(km.bind('reload', 'KeyT')).toEqual({ ok: true, swapped: undefined });
    expect(km.translate('KeyT', true)).toBe('KeyR');
    expect(km.translate('KeyR', true)).toBe('');
    // outside a mission the old key keeps its native meaning
    expect(km.translate('KeyR', false)).toBe('KeyR');
    expect(km.label('reload')).toBe('T');
  });

  it('binding a key held by another action swaps them', () => {
    const km = new KeyMap(memStore());
    const r = km.bind('map', 'KeyP');
    expect(r).toEqual({ ok: true, swapped: 'pause' });
    expect(km.bindings.pause).toBe('Tab');
    expect(km.translate('KeyP', true)).toBe('Tab');
    expect(km.translate('Tab', true)).toBe('KeyP');
  });

  it('refuses reserved keys and persists, then resets', () => {
    const store = memStore();
    const km = new KeyMap(store);
    expect(km.bind('fire', 'KeyW').ok).toBe(false);
    km.bind('fire', 'KeyG');
    const again = new KeyMap(store);
    expect(again.bindings.fire).toBe('KeyG');
    again.reset();
    expect(new KeyMap(store).bindings.fire).toBe('Space');
  });

  it('labels keys', () => {
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Space')).toBe('Space');
  });
});

describe('touch and gamepad maths', () => {
  it('stick: dead zone, clamped to the radius, monotonic', () => {
    expect(stickValue(2, 0, 60)).toEqual({ x: 0, y: 0 });
    const full = stickValue(200, 0, 60);
    expect(full.x).toBeCloseTo(1, 5);
    const half = stickValue(30, 0, 60).x, most = stickValue(50, 0, 60).x;
    expect(half).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(half);
    expect(stickValue(0, -60, 60).y).toBeCloseTo(-1, 5);
  });

  it('drag gain scales with the screen', () => {
    expect(dragToMouse(10, 812)).toBeCloseTo(23, 5);
    expect(dragToMouse(10, 2400)).toBeLessThan(dragToMouse(10, 812));
  });

  it('pad curve has a dead zone and keeps the sign', () => {
    expect(padCurve(0.1)).toBe(0);
    expect(padCurve(1)).toBeCloseTo(1, 5);
    expect(padCurve(-1)).toBeCloseTo(-1, 5);
    expect(padCurve(0.5)).toBeLessThan(0.5);
  });
});
