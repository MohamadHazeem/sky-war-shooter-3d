// Phase 11 goal 14: gamepad remapping and capture, stick swap / speed, aim-assist presets,
// colour-blind palettes, split motion / flash comfort, one-handed mouse and the Arabic texts.
// The gamepad runs against a fake navigator.getGamepads (Gamepad API mock), as in devices.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PadMap, PAD_ACTIONS, PAD_START, buildPadTable, defaultPadBindings, padMap, padButtonLabel } from '../src/core/PadMap';
import { GamepadInput, B, PAD_AIM_SPEED, type GamepadHost } from '../src/core/Gamepad';
import { Access, PALETTE, access, migrate } from '../src/core/Accessibility';
import { assistStrength, ASSIST_LEVELS } from '../src/core/AimAssist';
import { OneHandedMouse, WHEEL_STEP, MIDDLE_HOLD, type OneHandHost } from '../src/core/OneHanded';
import { setLang, tx } from '../src/i18n';
import type { Input } from '../src/core/Input';

function memStore(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

// ---------------- PadMap ----------------

describe('gamepad remapping table', () => {
  it('defaults are the identity and every action has its own button', () => {
    const t = buildPadTable(defaultPadBindings());
    expect(t.every((v, i) => v === i)).toBe(true);
    expect(new Set(PAD_ACTIONS.map((a) => a.def)).size).toBe(PAD_ACTIONS.length);
    expect(PAD_ACTIONS.some((a) => a.def === PAD_START || a.def === 8)).toBe(false);
  });

  it('binding a held button swaps the two actions and translates both ways', () => {
    const pm = new PadMap(memStore());
    expect(pm.bind('fire', B.RB)).toEqual({ ok: true, swapped: 'nextGun' });
    expect(pm.bindings.nextGun).toBe(B.RT);
    expect(pm.logical(B.RB)).toBe(B.RT);   // pressing RB fires
    expect(pm.logical(B.RT)).toBe(B.RB);   // RT now steps to the next gun
    expect(pm.label('fire')).toBe('RB');
    expect(pm.isDefault()).toBe(false);
  });

  it('Start and View stay fixed', () => {
    const pm = new PadMap(memStore());
    expect(pm.bind('reload', B.START).ok).toBe(false);
    expect(pm.bind('reload', B.BACK).ok).toBe(false);
    expect(pm.isDefault()).toBe(true);
  });

  it('persists, rejects a corrupt save, resets', () => {
    const store = memStore();
    new PadMap(store).bind('reload', B.A);
    const again = new PadMap(store);
    expect(again.bindings.reload).toBe(B.A);
    expect(again.bindings.mustangs).toBe(B.X);
    // two actions on one button: not a permutation, the defaults load instead
    const bad = memStore({ 'sws3d.pad.v1': JSON.stringify({ ...defaultPadBindings(), reload: B.RT }) });
    expect(new PadMap(bad).isDefault()).toBe(true);
    again.reset();
    expect(new PadMap(store).isDefault()).toBe(true);
  });

  it('labels the buttons', () => {
    expect(padButtonLabel(B.RT)).toBe('RT');
    expect(padButtonLabel(B.RIGHT)).toBe('✚→');
  });
});

// ---------------- GamepadInput with the accessibility options ----------------

function fakePad() {
  const pad = { id: 'Fake pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
  const press = (i: number, on: boolean) => { pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  return { pad, press };
}

function rig(host: Partial<GamepadHost> = {}) {
  const { pad, press } = fakePad();
  const log: string[] = [];
  const seats: number[] = [];
  let bits = 0;
  const inp = {
    mouseDX: 0, mouseDY: 0, analog: { roll: 0, yaw: 0, throttle: 0, throttleSet: null },
    tap: (c: string) => log.push(c),
    hold: (c: string, down: boolean) => log.push((down ? '+' : '-') + c),
    setVirtualButtons: (_s: string, b: number) => { bits = b; },
  } as unknown as Input;
  const gp = new GamepadInput(inp, { flying: () => true, role: () => 'gunner', cycleSeat: (d) => seats.push(d), togglePause: () => log.push('pause'), ...host });
  const step = (n = 1) => { for (let i = 0; i < n; i++) gp.update(1 / 60); };
  const tap = (i: number) => { press(i, true); step(); press(i, false); step(); };
  return { gp, pad, press, step, tap, log, seats, inp, bits: () => bits };
}

describe('gamepad: remapped buttons, capture, sticks', () => {
  beforeEach(() => { padMap.reset(); });
  afterEach(() => {
    padMap.reset();
    access.prefs.padSwap = false; access.prefs.padSens = 1;
    vi.unstubAllGlobals();
  });

  it('in flight the remapped button does the action; menus keep the standard layout', () => {
    padMap.bind('fire', B.RB);
    const r = rig();
    r.press(B.RB, true); r.step();
    expect(r.bits() & 1).toBe(1);           // RB fires
    r.press(B.RB, false); r.step();
    r.tap(B.RT);
    expect(r.seats).toEqual([1]);           // RT took RB's old job
    // menus: no translation (A / B / D-pad stay standard)
    const menu = rig({ flying: () => false });
    menu.press(B.RB, true); menu.step();
    expect(menu.bits()).toBe(0);
  });

  it('gunner D-pad right pings the target, also after a remap', () => {
    const r = rig();
    r.tap(B.RIGHT);
    expect(r.log).toContain('KeyU');
    padMap.bind('ping', B.Y);
    const s = rig();
    s.tap(B.Y);
    expect(s.log).toEqual(['KeyU']);        // Y now pings (and no longer takes the bombsight)
    s.tap(B.RIGHT);
    expect(s.log).toEqual(['KeyU', 'KeyN']); // the D-pad took the bombsight
  });

  it('capture: the next new button goes to the settings screen, Start cancels, nothing else fires', () => {
    const r = rig();
    const got: number[] = [];
    r.press(B.A, true); r.step();           // A still held from pressing the row: not taken
    padMap.startCapture('fire', (b) => got.push(b));
    r.step();
    expect(got).toEqual([]);
    r.press(B.LB, true); r.step();
    expect(got).toEqual([B.LB]);
    expect(padMap.capturing).toBe(null);
    expect(r.seats).toEqual([]);            // LB did not also change the gun position
    r.press(B.LB, false); r.step();
    padMap.startCapture('fire', (b) => got.push(b));
    r.press(B.START, true); r.step();
    expect(got).toEqual([B.LB, -1]);
    expect(r.log).not.toContain('pause');
  });

  it('left-handed sticks: the P-51 flies on the right stick and aims with the left', () => {
    access.prefs.padSwap = true;
    const r = rig({ role: () => 'pilot' });
    r.pad.axes = [1, 0, 0.8, 0];
    r.step();
    expect(r.inp.analog.roll).toBeGreaterThan(0.5);     // right stick X rolls
    expect(r.inp.mouseDX).toBeCloseTo(PAD_AIM_SPEED / 60, 3);   // left stick aims at full speed
  });

  it('aim speed scales with the setting, and the pad is marked as in use', () => {
    access.prefs.padSens = 2;
    const r = rig();
    expect(r.gp.inUse).toBe(false);
    r.pad.axes = [0, 0, 1, 0];
    r.step();
    expect(r.inp.mouseDX).toBeCloseTo(2 * PAD_AIM_SPEED / 60, 3);
    expect(r.gp.inUse).toBe(true);
  });
});

// ---------------- aim-assist presets ----------------

describe('aim-assist presets', () => {
  it('strength rises with the preset and the gamepad steps one up', () => {
    const plain = ASSIST_LEVELS.map((l) => assistStrength(l));
    expect(plain).toEqual([0, 0.5, 1, 1.5]);
    expect(assistStrength('low', true)).toBe(1);
    expect(assistStrength('high', true)).toBe(1.5);
    expect(assistStrength('strong', true)).toBe(1.5);
  });

  it('off stays off on a gamepad; an unknown saved value is the default (high)', () => {
    expect(assistStrength('off', true)).toBe(0);
    expect(assistStrength(undefined)).toBe(1);
    expect(assistStrength('bogus' as never)).toBe(1);
  });
});

// ---------------- accessibility preferences ----------------

describe('accessibility preferences', () => {
  it('older saves: one comfort switch becomes both, colour-blind on becomes red-green', () => {
    expect(migrate({ reduceMotion: true, colorBlind: true })).toMatchObject({ reduceMotion: true, reduceFlash: true, cbMode: 'redGreen', colorBlind: true });
    expect(migrate({ cbMode: 'nonsense' as never, subSize: 'XXL' as never })).toMatchObject({ cbMode: 'off', colorBlind: false, subSize: 'M' });
    const a = new Access(memStore({ 'sws3d.access.v1': JSON.stringify({ reduceMotion: true, colorBlind: true }) }));
    expect(a.prefs.reduceFlash).toBe(true);
    expect(a.palette).toBe(PALETTE.redGreen);
  });

  it('motion and flashes are separate switches', () => {
    const a = new Access(memStore());
    a.prefs.reduceMotion = false; a.prefs.reduceFlash = true;
    expect(a.shake).toBe(1);
    expect(a.hitStop).toBe(1);
    expect(a.flash).toBeLessThan(0.5);
    a.prefs.reduceMotion = true; a.prefs.reduceFlash = false;
    expect(a.shake).toBeLessThan(0.5);
    expect(a.flash).toBe(1);
  });

  it('every colour-blind mode has its own palette, keeps foes and friends apart and draws the cross', () => {
    const a = new Access(memStore());
    for (const mode of ['redGreen', 'blueYellow', 'contrast'] as const) {
      a.set('cbMode', mode);
      expect(a.prefs.colorBlind).toBe(true);
      expect(a.palette).toBe(PALETTE[mode]);
      expect(a.markerColor(true)).not.toBe(a.markerColor(false));
      expect(a.markerColor(true)).not.toBe(PALETTE.standard.enemy);
    }
    a.set('cbMode', 'off');
    expect(a.prefs.colorBlind).toBe(false);
    expect(a.palette).toBe(PALETTE.standard);
    // the old on/off switch still works
    a.set('colorBlind', true);
    expect(a.prefs.cbMode).toBe('redGreen');
  });
});

// ---------------- one-handed mouse ----------------

function mouseRig(host: Partial<OneHandHost> = {}) {
  const log: string[] = [];
  const seats: number[] = [];
  const m = new OneHandedMouse(
    { tap: (c: string) => log.push(c), hold: (c: string, d: boolean) => log.push((d ? '+' : '-') + c) },
    { enabled: () => true, flying: () => true, role: () => 'gunner', cycleSeat: (d) => seats.push(d), ...host },
  );
  return { m, log, seats };
}

describe('one-handed mouse', () => {
  it('wheel steps the gun position once per notch window, both ways', () => {
    const r = mouseRig();
    expect(r.m.wheel(1, 10)).toBe(true);
    expect(r.m.wheel(1, 10.05)).toBe(true);           // same flick: swallowed
    r.m.wheel(-1, 10 + WHEEL_STEP + 0.01);
    expect(r.seats).toEqual([1, -1]);
  });

  it('middle click reloads, a long middle press takes the bombsight', () => {
    const r = mouseRig();
    r.m.down(1, 0); r.m.up(1, 0.1);
    r.m.down(1, 1); r.m.up(1, 1 + MIDDLE_HOLD + 0.05);
    expect(r.log).toEqual(['KeyR', 'KeyN']);
  });

  it('middle button holds an emergency prompt key while one is showing', () => {
    const r = mouseRig({ promptKey: () => 'KeyX' });
    r.m.down(1, 0); r.m.up(1, 2);
    expect(r.log).toEqual(['+KeyX', '-KeyX']);
  });

  it('side buttons fire the role abilities', () => {
    const g = mouseRig();
    g.m.down(3, 0); g.m.down(4, 0);
    expect(g.log).toEqual(['KeyQ', 'KeyE']);
    const p = mouseRig({ role: () => 'pilot' });
    p.m.down(3, 0); p.m.down(4, 0);
    expect(p.log).toEqual(['KeyZ', 'KeyX']);
    expect(p.m.wheel(1, 0)).toBe(false);              // the P-51 keeps the wheel
  });

  it('does nothing when switched off or outside a mission', () => {
    for (const host of [{ enabled: () => false }, { flying: () => false }]) {
      const r = mouseRig(host);
      expect(r.m.wheel(1, 0)).toBe(false);
      expect(r.m.down(1, 0)).toBe(false);
      r.m.up(1, 1);
      r.m.down(3, 0);
      expect(r.log).toEqual([]);
      expect(r.seats).toEqual([]);
    }
  });
});

// ---------------- Arabic ----------------

const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };

describe('accessibility texts resolve to Arabic', () => {
  afterEach(() => { setLang('en'); });
  const arabic = /[؀-ۿ]/;

  it('every remappable gamepad action', () => {
    setLang('ar');
    for (const a of PAD_ACTIONS) expect(tx(a.label), a.label).toMatch(arabic);
  });

  it('every text of the settings panel', () => {
    setLang('ar');
    const src = readFileSync(new URL('../src/ui/AccessibilityPanel.ts', import.meta.url), 'utf8');
    const lits = [...src.matchAll(/(?:tx|opt)\((?:'[a-zA-Z]+', )?'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"))
      .filter((s) => /[a-z]{2}/.test(s) && !/^(true|false|auto|on|off|redGreen|blueYellow|contrast)$/.test(s));
    expect(lits.length).toBeGreaterThan(25);
    for (const s of lits) expect(tx(s), s).toMatch(arabic);
    expect(tx('Strong (accessibility)')).toMatch(arabic);
  });
});
