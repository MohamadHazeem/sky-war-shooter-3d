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
//   X             reload                       Y                     P-51 view (cockpit / chase)
//   Back / View   controls card (H)

export interface GamepadHost {
  /** a mission is in play and the player has control */
  flying(): boolean;
  role(): 'gunner' | 'pilot' | null;
  /** step to the previous (-1) or next (+1) gun position */
  cycleSeat(dir: -1 | 1): void;
  /** Start: pause, or resume from the pause screen */
  togglePause(): void;
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
    if (!this.host.flying()) { this.release(); return; }

    const inp = this.input;
    const role = this.host.role();
    if (edge(B.UP)) inp.tap('Tab');
    if (edge(B.BACK)) inp.tap('KeyH');
    if (role === 'gunner') {
      if (edge(B.LB)) this.host.cycleSeat(-1);
      if (edge(B.RB)) this.host.cycleSeat(1);
      if (edge(B.X)) inp.tap('KeyR');
    } else if (role === 'pilot') {
      if (edge(B.Y)) inp.tap('KeyV');
    }

    // Aim: right stick; the gunner can also use the left one when the right is at rest
    const ax = pad.axes;
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
  }

  private findPad(): Gamepad | null {
    let pads: (Gamepad | null)[] = [];
    try { pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []; } catch { return null; }
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
}
