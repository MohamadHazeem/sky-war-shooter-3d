import type { Input } from './Input';

// Standard-mapping gamepad (Xbox / PlayStation layout), polled once per frame. It speaks
// the mouse's language so the controllers need no gamepad code: the aim stick adds to
// Input.mouseDX/DY, the triggers are virtual mouse buttons (RT = fire, LT = zoom) and the
// other buttons send ordinary key presses through Input.tap().
//
//   right stick   aim                          left stick (gunner)   aim too
//   RT            fire                         left stick (P-51)     X roll, Y throttle
//   LT            zoom / sight                 LB / RB               previous / next gun position
//   D-pad up      big map (Tab)                Start                 pause / resume
//   X             reload, or the event prompt  Y                     P-51 view (cockpit / chase)
//   View (tap)    controls card (H)            View + Y              photo mode (F)
//   View + X      P-51 flight mode (M: mouse aim / direct)
//   R3            gunner: free look while held (C); P-51: tap = padlock (T), hold = free look
//   A / B / L3    abilities: Mustangs / Overdrive / Focus (gunner Q E G, P-51 Z X G)
//   menus         D-pad / left stick move between buttons, A presses, B = Back (see menuNav);
//                 left / right adjust a focused slider (or step a drop-down), held = repeat
//   P-51 wingman  D-pad left = attack my target (1), right = cover me (2), down = protect the
//                 bombers (3), LB + D-pad up = form up (4) (D-pad up alone is still the map)
//   photo mode    left stick move, right stick look, LT / RT down / up, L3 fast, B or View + Y exit
//   replay        left stick moves the free camera / orbits, right stick looks (orbit: Y zooms),
//   theatre       LT / RT scrub, A play / pause, Y camera mode, LB / RB previous / next moment,
//                 D-pad left / right frame step, up / down speed (free camera: rise / sink),
//                 X next aircraft, L3 fast, View hide / show the interface, B exit

export interface GamepadHost {
  /** a mission is in play and the player has control */
  flying(): boolean;
  role(): 'gunner' | 'pilot' | null;
  /** step to the previous (-1) or next (+1) gun position */
  cycleSeat(dir: -1 | 1): void;
  /** Start: pause, or resume from the pause screen */
  togglePause(): void;
  /** the key the in-flight event prompt asks for ('KeyX'), if one is showing */
  promptKey?(): string | null;
  /** photo mode is active (the mission is frozen under a free camera) */
  photo?(): boolean;
  /** the replay theatre, while it is open */
  theatre?(): TheatrePad | null;
  onConnect?(name: string, connected: boolean): void;
}

/** Analog state handed to the replay theatre every frame (sticks after the dead-zone curve). */
export interface TheatreAxes { lx: number; ly: number; rx: number; ry: number; rise: number; scrub: number; fast: boolean }

/** What the gamepad drives in the replay theatre (implemented by game/Theatre.ts). */
export interface TheatrePad {
  readonly freeMode: boolean;
  togglePlay(): void;
  cycleMode(): void;
  jumpMark(dir: number): void;
  step(dir: number): void;
  cycleOrbit(dir?: number): void;
  speedStep(dir: number): void;
  toggleUi(): void;
  back(): void;
  padAxes(a: TheatreAxes, real: number): void;
}

export const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const FIRE = 1 << 0;   // same bit as the left mouse button
const ZOOM = 1 << 2;   // same bit as the right mouse button
export const PAD_DEADZONE = 0.15;
export const PAD_AIM_SPEED = 900; // mouse px per second at full deflection
/** P-51 right stick click: released sooner than this = padlock (T), held longer = free look (C) */
export const PAD_TAP = 0.25;
const REPEAT_DELAY = 0.38, REPEAT_EVERY = 0.11;   // menus: a held left / right repeats (sliders)
const PHOTO_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft'];

// Per-axis dead zone with a quadratic curve: small stick movements stay precise while
// full deflection still turns quickly.
export function padCurve(v: number, dead = PAD_DEADZONE) {
  const m = Math.abs(v);
  if (m < dead) return 0;
  const t = Math.min(1, (m - dead) / (1 - dead));
  return Math.sign(v) * t * t;
}

/** A gamepad is plugged in and has been seen by the page (the controls card then lists its buttons). */
export function padConnected(): boolean {
  try {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return true;
  } catch { /* not allowed here */ }
  return false;
}

export class GamepadInput {
  private prev = new Set<number>();
  private usingRoll = false;
  private looking = false;   // free look held (KeyC)
  private rsT = -1;          // P-51: seconds the right stick has been held in (-1 = not held)
  private backChord = false; // View was used as a modifier (or held in from a menu): no H on release
  private menuStick = 0;     // left stick's last menu direction (-1, 0, 1)
  private menuH = 0;         // held left / right menu direction and its repeat timer
  private menuHT = 0;
  private promptHeld: string | null = null;   // event-prompt key held with X
  private photoHeld = new Set<string>();      // photo mode: movement keys held from the sticks
  connected = false;

  constructor(private input: Input, private host: GamepadHost) {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', (e) => { this.connected = true; host.onConnect?.((e as GamepadEvent).gamepad.id, true); });
    window.addEventListener('gamepaddisconnected', (e) => { this.connected = !!this.findPad(); host.onConnect?.((e as GamepadEvent).gamepad.id, false); });
  }

  /** dt in real seconds (not slowed by hit-stop or slow motion) */
  update(dt: number) {
    const pad = this.findPad();
    if (!pad) { this.release(); this.prev.clear(); return; }
    const b = pad.buttons;
    const held = (i: number, thr = 0.5) => !!b[i]?.pressed || (b[i]?.value ?? 0) > thr;
    const now = new Set<number>();
    for (let i = 0; i < b.length; i++) if (held(i, i === B.LT || i === B.RT ? 0.35 : 0.5)) now.add(i);
    const prev = this.prev;
    const edge = (i: number) => now.has(i) && !prev.has(i);
    const released = (i: number) => !now.has(i) && prev.has(i);
    this.prev = now;
    const ax = pad.axes;
    const inp = this.input;

    // replay theatre: the pad drives the playback and the cameras (not the menu focus)
    const th = this.host.theatre?.() ?? null;
    if (th) {
      this.release();
      if (edge(B.A)) th.togglePlay();
      if (edge(B.Y)) th.cycleMode();
      if (edge(B.LB)) th.jumpMark(-1);
      if (edge(B.RB)) th.jumpMark(1);
      if (edge(B.LEFT)) th.step(-1);
      if (edge(B.RIGHT)) th.step(1);
      if (edge(B.X)) th.cycleOrbit(1);
      if (edge(B.BACK)) th.toggleUi();
      if (edge(B.B)) th.back();
      const free = th.freeMode;
      if (!free && edge(B.UP)) th.speedStep(1);
      if (!free && edge(B.DOWN)) th.speedStep(-1);
      // analog triggers report a value (and pressed past a threshold): scrub speed follows the value
      const trig = (i: number) => { const v = b[i]?.value ?? 0; return v > 0 ? v : b[i]?.pressed ? 1 : 0; };
      th.padAxes({
        lx: padCurve(ax[0] ?? 0), ly: padCurve(ax[1] ?? 0), rx: padCurve(ax[2] ?? 0), ry: padCurve(ax[3] ?? 0),
        rise: free ? (now.has(B.UP) ? 1 : 0) - (now.has(B.DOWN) ? 1 : 0) : 0,
        scrub: padCurve(trig(B.RT), 0.06) - padCurve(trig(B.LT), 0.06),
        fast: now.has(B.LS),
      }, dt);
      return;
    }

    // Start works everywhere (also resumes from the pause screen)
    if (edge(B.START)) this.host.togglePause();

    // photo mode: a free camera on the sticks (it reads the same keys and mouse as on a keyboard)
    if (this.host.photo?.()) {
      this.release(true);
      const lx = padCurve(ax[0] ?? 0), ly = padCurve(ax[1] ?? 0);
      this.photoKeys({
        KeyW: ly < -0.1, KeyS: ly > 0.1, KeyA: lx < -0.1, KeyD: lx > 0.1,
        KeyQ: now.has(B.LT), KeyE: now.has(B.RT), ShiftLeft: now.has(B.LS),
      });
      inp.mouseDX += padCurve(ax[2] ?? 0) * PAD_AIM_SPEED * dt;
      inp.mouseDY += padCurve(ax[3] ?? 0) * PAD_AIM_SPEED * dt;
      if (released(B.BACK)) this.backChord = false;
      if (edge(B.B) || (now.has(B.BACK) && edge(B.Y))) {
        this.photoKeys({});
        this.backChord = now.has(B.BACK);
        inp.tap('KeyF');
      }
      return;
    }
    if (this.photoHeld.size) this.photoKeys({});

    if (!this.host.flying()) {
      this.release();
      // menus: D-pad / left stick move between buttons, A presses, B goes back;
      // left / right adjust a focused slider (held: repeats)
      const sy = Math.abs(ax[1] ?? 0) > 0.6 ? Math.sign(ax[1]) : 0;
      const stickEdge = sy !== this.menuStick ? sy : 0;
      this.menuStick = sy;
      const hx = now.has(B.LEFT) || (ax[0] ?? 0) < -0.6 ? -1 : now.has(B.RIGHT) || (ax[0] ?? 0) > 0.6 ? 1 : 0;
      let h = 0;
      if (hx !== this.menuH) { this.menuH = hx; this.menuHT = REPEAT_DELAY; h = hx; }
      else if (hx) { this.menuHT -= dt; if (this.menuHT <= 0) { this.menuHT = REPEAT_EVERY; h = hx; } }
      const dir = edge(B.UP) || stickEdge < 0 ? -1 : edge(B.DOWN) || stickEdge > 0 ? 1 : 0;
      if (dir || h || edge(B.A) || edge(B.B)) menuNav(dir, edge(B.A), edge(B.B), inp, h);
      // View closes the controls card again (the card pauses the game while it is open)
      if (edge(B.BACK) && typeof document !== 'undefined' && document.querySelector('#controlsCard.show')) inp.tap('KeyH');
      this.backChord = now.has(B.BACK);   // a View held into the mission does not open the card on release
      return;
    }

    const role = this.host.role();
    // View is a modifier: View + Y = photo mode, View + X = P-51 flight mode; a plain tap
    // (released without a chord) opens the controls card
    const back = now.has(B.BACK);
    if (back && edge(B.Y)) { this.backChord = true; inp.tap('KeyF'); }
    if (back && edge(B.X) && role === 'pilot') { this.backChord = true; inp.tap('KeyM'); }
    if (released(B.BACK)) { if (!this.backChord) inp.tap('KeyH'); this.backChord = false; }
    // right stick click: the gunner holds it for free look; in the P-51 a tap padlocks the
    // nearest bandit (T) and a longer hold is free look
    if (role === 'pilot') {
      if (now.has(B.RS)) {
        this.rsT = this.rsT < 0 ? 0 : this.rsT + dt;
        if (this.rsT >= PAD_TAP && !this.looking) { this.looking = true; inp.hold('KeyC', true); }
      } else if (this.rsT >= 0) {
        if (this.looking) { this.looking = false; inp.hold('KeyC', false); }
        else inp.tap('KeyT');
        this.rsT = -1;
      }
    } else {
      this.rsT = -1;
      if (now.has(B.RS) !== this.looking) { this.looking = now.has(B.RS); inp.hold('KeyC', this.looking); }
    }
    const wingUp = role === 'pilot' && now.has(B.LB);
    if (edge(B.UP)) inp.tap(wingUp ? 'Digit4' : 'Tab');
    // X answers an in-flight event prompt (engine fire, jam, oxygen: held like the key), else reloads
    const prompt = edge(B.X) && !back ? this.host.promptKey?.() ?? null : null;
    if (prompt) { this.promptHeld = prompt; inp.hold(prompt, true); }
    else if (this.promptHeld && !now.has(B.X)) { inp.hold(this.promptHeld, false); this.promptHeld = null; }
    // abilities: A = Mustangs, B = Overdrive, L3 = Focus (keys from Abilities.ts)
    if (role) {
      const keys = role === 'gunner' ? ['KeyQ', 'KeyE', 'KeyG'] : ['KeyZ', 'KeyX', 'KeyG'];
      if (edge(B.A)) inp.tap(keys[0]);
      if (edge(B.B)) inp.tap(keys[1]);
      if (edge(B.LS)) inp.tap(keys[2]);
    }
    if (role === 'gunner') {
      if (edge(B.LB)) this.host.cycleSeat(-1);
      if (edge(B.RB)) this.host.cycleSeat(1);
      if (edge(B.X) && !prompt && !back) inp.tap('KeyR');
    } else if (role === 'pilot') {
      if (edge(B.Y) && !back) inp.tap('KeyV');
      // wingman commands (Wingman.ts listens for the number keys in the P-51)
      if (edge(B.LEFT)) inp.tap('Digit1');
      if (edge(B.RIGHT)) inp.tap('Digit2');
      if (edge(B.DOWN)) inp.tap('Digit3');
    }

    // Aim: right stick; the gunner can also use the left one when the right is at rest
    let sx = padCurve(ax[2] ?? 0), sy = padCurve(ax[3] ?? 0);
    if (role === 'gunner' && sx === 0 && sy === 0) { sx = padCurve(ax[0] ?? 0); sy = padCurve(ax[1] ?? 0); }
    inp.mouseDX += sx * PAD_AIM_SPEED * dt;
    inp.mouseDY += sy * PAD_AIM_SPEED * dt;

    // P-51: left stick X rolls, Y is the throttle lever (push up = more power)
    if (role === 'pilot') {
      const roll = padCurve(ax[0] ?? 0), thr = -padCurve(ax[1] ?? 0);
      inp.analog.roll = roll;
      inp.analog.throttle = thr;
      this.usingRoll = true;
    } else if (this.usingRoll) this.clearAnalog();

    let bits = 0;
    if (now.has(B.RT)) bits |= FIRE;
    if (now.has(B.LT)) bits |= ZOOM;
    inp.setVirtualButtons('pad', bits);
  }

  // photo mode movement keys, held while the sticks / triggers ask for them
  private photoKeys(want: Partial<Record<string, boolean>>) {
    for (const k of PHOTO_KEYS) {
      const on = !!want[k];
      if (on === this.photoHeld.has(k)) continue;
      if (on) this.photoHeld.add(k); else this.photoHeld.delete(k);
      this.input.hold(k, on);
    }
  }

  private clearAnalog() {
    this.input.analog.roll = 0;
    this.input.analog.throttle = 0;
    this.usingRoll = false;
  }

  private release(keepPhoto = false) {
    this.input.setVirtualButtons('pad', 0);
    if (this.usingRoll) this.clearAnalog();
    if (this.looking) { this.looking = false; this.input.hold('KeyC', false); }
    this.rsT = -1;
    if (this.promptHeld) { this.input.hold(this.promptHeld, false); this.promptHeld = null; }
    if (!keepPhoto && this.photoHeld.size) this.photoKeys({});
  }

  private findPad(): Gamepad | null {
    let pads: (Gamepad | null)[] = [];
    try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; } catch { return null; }
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
}

// ---------------- menus ----------------
// No menu screen knows about the gamepad: the D-pad moves the browser focus between the
// visible buttons of the screen on top (in reading order), A clicks the focused one and B
// presses that screen's Back / Exit button, or sends Esc when it has none.

const OVERLAYS = ['#theatreLib', '#theatre', '#crate', '#perks.show', '#hangar.show', '#controlsCard.show'];
const FOCUSABLE = 'button:not([disabled]), [role="button"][tabindex], a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled])';
const BACK = ['[data-back]', '[data-a="exit"]', '[data-a="back"]', '[data-a="resume"]'];   // resume: the pause screen

function shown(e: Element) {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
}

function menuRoot(): HTMLElement | null {
  for (const s of OVERLAYS) {
    const e = document.querySelector<HTMLElement>(s);
    if (e && shown(e)) return e;
  }
  const layers = Array.from(document.querySelectorAll<HTMLElement>('.layer.show')).filter((l) => l.id !== 'hud' && l.id !== 'loading');
  return layers[layers.length - 1] ?? null;
}

function press(e: Element) {
  if (e instanceof HTMLElement) e.click();
  else e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));   // SVG map markers
}

// Left / right on a focused slider moves it one step (a drop-down steps its option), firing
// the same input / change events as the mouse does. False when the element takes no step.
function adjust(el: Element | null, h: number): boolean {
  if (el instanceof HTMLInputElement && el.type === 'range' && !el.disabled) {
    // a right-to-left slider grows to the left
    const sign = getComputedStyle(el).direction === 'rtl' ? -h : h;
    const before = el.value;
    if (sign > 0) el.stepUp(); else el.stepDown();
    if (el.value !== before) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  if (el instanceof HTMLSelectElement && !el.disabled) {
    const i = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + h));
    if (i !== el.selectedIndex) {
      el.selectedIndex = i;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  return false;
}

/** dir: up / down focus step; h: left / right (adjusts a focused slider, else steps the focus too) */
export function menuNav(dir: number, a: boolean, b: boolean, input: Input, h = 0) {
  if (typeof document === 'undefined') return;
  const root = menuRoot();
  if (!root) return;
  if (h && !dir && !a && !b) {
    if (root.contains(document.activeElement) && adjust(document.activeElement, h)) return;
    dir = h;
  }
  if (b) {
    for (const s of BACK) {
      const btn = root.querySelector(s);
      if (btn && shown(btn)) { press(btn); return; }
    }
    input.tap('Escape');
    return;
  }
  const rtl = document.documentElement.dir === 'rtl';
  const items = Array.from(root.querySelectorAll<HTMLElement | SVGElement>(FOCUSABLE)).filter(shown)
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .sort((p, q) => (Math.abs(p.r.top - q.r.top) > 12 ? p.r.top - q.r.top : rtl ? q.r.left - p.r.left : p.r.left - q.r.left))
    .map((x) => x.e);
  if (!items.length) return;
  const cur = items.indexOf(document.activeElement as HTMLElement);
  if (a) {
    if (cur >= 0) press(items[cur]);
    else items[0].focus();
    return;
  }
  const next = items[cur < 0 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length];
  next.focus({ preventScroll: true });
  next.scrollIntoView?.({ block: 'nearest' });
}
