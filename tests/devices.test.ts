import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTranslation, defaultBindings, KeyMap, keyLabel } from '../src/core/KeyMap';
import { dragToMouse, stickValue } from '../src/core/Touch';
import { padCurve, GamepadInput, B, PAD_TAP, type GamepadHost, type TheatreAxes, type TheatrePad } from '../src/core/Gamepad';
import type { Input } from '../src/core/Input';

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

// ---------------- gamepad bindings (a fake navigator.getGamepads, as in the browser QA) ----------------

function fakePad() {
  const pad = { id: 'Fake pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  const press = (i: number, on: boolean, value = on ? 1 : 0) => { pad.buttons[i] = { pressed: on, value }; };
  return { pad, press };
}

function fakeInput() {
  const log: string[] = [];
  const inp = {
    mouseDX: 0, mouseDY: 0, analog: { roll: 0, yaw: 0, throttle: 0, throttleSet: null },
    tap: (c: string) => log.push(c),
    hold: (c: string, down: boolean) => log.push((down ? '+' : '-') + c),
    setVirtualButtons: () => {},
  };
  return { inp: inp as unknown as Input, log };
}

function rig(host: Partial<GamepadHost>) {
  const { pad, press } = fakePad();
  const { inp, log } = fakeInput();
  const gp = new GamepadInput(inp, { flying: () => true, role: () => 'pilot', cycleSeat: () => {}, togglePause: () => {}, ...host });
  const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) gp.update(dt); };
  const tap = (i: number) => { press(i, true); step(); press(i, false); step(); };
  return { pad, press, log, step, tap, inp };
}

describe('gamepad bindings', () => {
  it('Y opens the gunner bombsight while pilot Y keeps the cockpit view', () => {
    const gunner = rig({ role: () => 'gunner' }); gunner.tap(B.Y); expect(gunner.log).toContain('KeyN');
    const pilot = rig({ role: () => 'pilot' }); pilot.tap(B.Y); expect(pilot.log).toContain('KeyV');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('View: a tap opens the controls card, View + Y photo mode, View + X the P-51 flight mode', () => {
    const r = rig({});
    r.tap(B.BACK);
    expect(r.log).toEqual(['KeyH']);
    r.log.length = 0;
    r.press(B.BACK, true); r.step(); r.tap(B.Y); r.tap(B.X); r.press(B.BACK, false); r.step();
    expect(r.log).toEqual(['KeyF', 'KeyM']);   // no H, no cockpit view (Y), no reload / prompt (X)
  });

  it('P-51 right stick click: a tap padlocks, a hold is free look', () => {
    const r = rig({});
    r.tap(B.RS);
    expect(r.log).toEqual(['KeyT']);
    r.log.length = 0;
    r.press(B.RS, true); r.step(Math.ceil(PAD_TAP * 60) + 4);
    expect(r.log).toEqual(['+KeyC']);
    r.press(B.RS, false); r.step();
    expect(r.log).toEqual(['+KeyC', '-KeyC']);
  });

  it('gunner right stick click is still free look straight away', () => {
    const r = rig({ role: () => 'gunner' });
    r.press(B.RS, true); r.step();
    expect(r.log).toEqual(['+KeyC']);
    r.press(B.RS, false); r.step();
    expect(r.log).toEqual(['+KeyC', '-KeyC']);
  });

  it('photo mode: sticks hold the movement keys, B leaves', () => {
    const r = rig({ flying: () => false, photo: () => true });
    r.pad.axes = [0, -1, 1, 0];
    r.step();
    expect(r.log).toEqual(['+KeyW']);
    expect(r.inp.mouseDX).toBeGreaterThan(0);
    r.pad.axes = [0, 0, 0, 0];
    r.tap(B.B);
    expect(r.log).toEqual(['+KeyW', '-KeyW', 'KeyF']);
  });

  it('replay theatre: buttons, scrub and sticks', () => {
    const calls: string[] = [];
    let axes: TheatreAxes | null = null;
    let free = false;
    const th: TheatrePad = {
      get freeMode() { return free; },
      togglePlay: () => calls.push('play'), cycleMode: () => calls.push('mode'), jumpMark: (d) => calls.push(`mark${d}`),
      step: (d) => calls.push(`step${d}`), cycleOrbit: () => calls.push('orbit'), speedStep: (d) => calls.push(`speed${d}`),
      toggleUi: () => calls.push('ui'), back: () => calls.push('back'), padAxes: (a) => { axes = a; },
    };
    const r = rig({ flying: () => false, theatre: () => th });
    for (const b of [B.A, B.Y, B.LB, B.RB, B.LEFT, B.RIGHT, B.X, B.UP, B.DOWN, B.BACK, B.B]) r.tap(b);
    expect(calls).toEqual(['play', 'mode', 'mark-1', 'mark1', 'step-1', 'step1', 'orbit', 'speed1', 'speed-1', 'ui', 'back']);
    expect(r.log).toEqual([]);   // nothing reaches the keyboard path
    r.press(B.RT, true, 1); r.pad.axes = [0, -1, 0.5, 0]; r.step();
    expect(axes!.scrub).toBeCloseTo(1, 5);
    expect(axes!.ly).toBeCloseTo(-1, 5);
    expect(axes!.rx).toBeGreaterThan(0);
    r.press(B.RT, false); r.press(B.LT, true, 0.4); r.step();
    expect(axes!.scrub).toBeLessThan(0);
    expect(axes!.scrub).toBeGreaterThan(-0.5);   // analog: a half-pulled trigger scrubs slower
    // free camera: the D-pad's up / down rise and sink instead of changing the speed
    free = true; calls.length = 0;
    r.press(B.LT, false); r.press(B.UP, true); r.step();
    expect(axes!.rise).toBe(1);
    expect(calls).toEqual([]);
  });
});
