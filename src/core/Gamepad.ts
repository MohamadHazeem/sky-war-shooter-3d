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
//   Back / View   controls card (H)            R3 (hold)             free look (C)
//   A / B / L3    abilities: Mustangs / Overdrive / Focus (gunner Q E G, P-51 Z X G)
//   menus         D-pad / left stick move between buttons, A presses, B = Back (see menuNav)
//   P-51 wingman  D-pad left = attack my target (1), right = cover me (2), down = protect the
//                 bombers (3), LB + D-pad up = form up (4) (D-pad up alone is still the map)

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
  onConnect?(name: string, connected: boolean): void;
}

export const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
const FIRE = 1 << 0;   // same bit as the left mouse button
const ZOOM = 1 << 2;   // same bit as the right mouse button
export const PAD_DEADZONE = 0.15;
export const PAD_AIM_SPEED = 900; // mouse px per second at full deflection

// Per-axis dead zone with a quadratic curve: small stick movements stay precise while
// full deflection still turns quickly.
export function padCurve(v: number, dead = PAD_DEADZONE) {
  const m = Math.abs(v);
  if (m < dead) return 0;
  const t = Math.min(1, (m - dead) / (1 - dead));
  return Math.sign(v) * t * t;
}

export class GamepadInput {
  private prev = new Set<number>();
  private usingRoll = false;
  private looking = false;   // right stick held in: free look (KeyC held)
  private menuStick = 0;     // left stick's last menu direction (-1, 0, 1)
  private promptHeld: string | null = null;   // event-prompt key held with X
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
    this.prev = now;

    // Start works everywhere (also resumes from the pause screen)
    if (edge(B.START)) this.host.togglePause();
    const ax = pad.axes;
    if (!this.host.flying()) {
      this.release();
      // menus: D-pad / left stick move between buttons, A presses, B goes back
      const sy = Math.abs(ax[1] ?? 0) > 0.6 ? Math.sign(ax[1]) : 0;
      const stickEdge = sy !== this.menuStick ? sy : 0;
      this.menuStick = sy;
      const dir = edge(B.UP) || edge(B.LEFT) || stickEdge < 0 ? -1 : edge(B.DOWN) || edge(B.RIGHT) || stickEdge > 0 ? 1 : 0;
      if (dir || edge(B.A) || edge(B.B)) menuNav(dir, edge(B.A), edge(B.B), this.input);
      return;
    }

    const inp = this.input;
    const role = this.host.role();
    // free look: hold the right stick in (C on the keyboard); the right stick then turns the head
    if (now.has(B.RS) !== this.looking) { this.looking = now.has(B.RS); inp.hold('KeyC', this.looking); }
    const wingUp = role === 'pilot' && now.has(B.LB);
    if (edge(B.UP)) inp.tap(wingUp ? 'Digit4' : 'Tab');
    if (edge(B.BACK)) inp.tap('KeyH');
    // X answers an in-flight event prompt (engine fire, jam, oxygen: held like the key), else reloads
    const prompt = edge(B.X) ? this.host.promptKey?.() ?? null : null;
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
      if (edge(B.X) && !prompt) inp.tap('KeyR');
    } else if (role === 'pilot') {
      if (edge(B.Y)) inp.tap('KeyV');
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

  private clearAnalog() {
    this.input.analog.roll = 0;
    this.input.analog.throttle = 0;
    this.usingRoll = false;
  }

  private release() {
    this.input.setVirtualButtons('pad', 0);
    if (this.usingRoll) this.clearAnalog();
    if (this.looking) { this.looking = false; this.input.hold('KeyC', false); }
    if (this.promptHeld) { this.input.hold(this.promptHeld, false); this.promptHeld = null; }
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

export function menuNav(dir: number, a: boolean, b: boolean, input: Input) {
  if (typeof document === 'undefined') return;
  const root = menuRoot();
  if (!root) return;
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
