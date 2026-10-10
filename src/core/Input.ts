import { keyMap, keyValue } from './KeyMap';

// Keyboard + mouse, plus the hooks that touch controls and gamepads feed into.
// Pointer lock is requested for the best feel, but the game is fully playable without it
// (some browsers/embedded views refuse it, and touch devices never use it): mouse deltas
// and buttons are read either way, and with a free cursor, holding it near a screen edge
// keeps turning in that direction.
//
// Other devices speak the mouse's language so the controllers need no device code:
//   aim         add to mouseDX / mouseDY
//   fire, zoom  setVirtualButtons(source, bits): bit 0 = fire (LMB), bit 2 = zoom (RMB)
//   keys        tap(code) sends a one-shot key press through the normal keydown path
//   pilot       analog roll / yaw / throttle (PilotController reads these)
//
// Key remapping (KeyMap): physical keys are translated to the action's default code in a
// capture-phase listener, before Game, Onboarding or this class see the event.

const MARK = new WeakSet<Event>();   // synthetic events that already carry a logical code
const FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
const ZOOM_KEY = 'KeyB';             // logical zoom key (B: Z is the pilot's Mustang call) (remappable): acts as the right button

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  private clicked = new Set<number>();
  private vbits = new Map<string, number>();  // virtual buttons per source (touch, gamepad)
  private vmask = 0;
  locked = false;
  everLocked = false;
  enabled = true;
  active = false;            // true while a mission is being played (enables free-cursor aim)
  sensitivity = 1;
  invertY = false;
  cursorX = 0.5;             // normalised cursor position (free-cursor mode)
  cursorY = 0.5;
  touchMode = false;         // touch controls in use: no pointer lock, no edge push
  // Analog pilot inputs (-1..1) from a gamepad or the touch stick; 0 = not in use.
  // throttleSet is a one-shot absolute throttle (0..1.1) that the pilot consumes.
  readonly analog = { roll: 0, yaw: 0, throttle: 0, throttleSet: null as number | null };
  private overCanvas = false;
  onLockChange?: (locked: boolean) => void;

  constructor(private el: HTMLElement) {
    // Remapping: runs first (capture phase on window) and re-sends the event with the
    // action's code. The original is stopped so nobody sees the physical key.
    const remap = (e: KeyboardEvent) => {
      if (MARK.has(e) || keyMap.capturing || FIELD.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const code = keyMap.translate(e.code, this.active && this.enabled);
      if (code === e.code) return;
      e.stopImmediatePropagation();
      if (this.active) e.preventDefault();
      if (code) this.dispatch(e.type as 'keydown' | 'keyup', code, e.repeat, e.target ?? window);
    };
    window.addEventListener('keydown', remap, true);
    window.addEventListener('keyup', remap, true);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.active) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    window.addEventListener('mousemove', (e) => {
      this.cursorX = e.clientX / window.innerWidth;
      this.cursorY = e.clientY / window.innerHeight;
      if (!this.locked && !(this.active && this.overCanvas)) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mouseenter', () => { this.overCanvas = true; });
    el.addEventListener('mouseleave', () => { this.overCanvas = false; this.buttons = 0; });
    el.addEventListener('mousedown', (e) => {
      this.overCanvas = true;
      this.buttons |= 1 << e.button;
      this.clicked.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.locked || this.active) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this.everLocked = true;
      if (!this.locked) { this.buttons = 0; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  private dispatch(type: 'keydown' | 'keyup', code: string, repeat = false, target: EventTarget = window) {
    const ev = new KeyboardEvent(type, { code, key: keyValue(code), repeat, bubbles: true, cancelable: true });
    MARK.add(ev);
    target.dispatchEvent(ev);
  }

  /** One key press (down + up) of a logical code, seen by every key listener in the game. */
  tap(code: string) {
    this.dispatch('keydown', code);
    this.dispatch('keyup', code);
  }

  /** Fire / zoom from another device: bits as mouse buttons (1 = fire, 4 = zoom). */
  setVirtualButtons(source: string, bits: number) {
    const prev = this.vbits.get(source) ?? 0;
    if (prev === bits) return;
    for (let b = 0; b < 3; b++) if ((bits & (1 << b)) && !(prev & (1 << b))) this.clicked.add(b);
    this.vbits.set(source, bits);
    let m = 0;
    for (const v of this.vbits.values()) m |= v;
    this.vmask = m;
  }

  lock() {
    if (this.locked || this.touchMode) return;
    try {
      const p = this.el.requestPointerLock?.({ unadjustedMovement: true } as any) as any;
      if (p && p.catch) p.catch(() => { try { (this.el.requestPointerLock?.() as any)?.catch?.(() => {}); } catch { /* refused */ } });
    } catch { /* pointer lock not available: free-cursor mode */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Continuous turn rate (-1..1) when the free cursor rests near a screen edge
  edgePush(): { x: number; y: number } {
    if (this.locked || !this.active || !this.overCanvas || this.touchMode) return { x: 0, y: 0 };
    const e = 0.07;
    const f = (v: number) => (v < e ? -(e - v) / e : v > 1 - e ? (v - (1 - e)) / e : 0);
    return { x: f(this.cursorX), y: f(this.cursorY) };
  }

  down(code: string) { return this.enabled && this.keys.has(code); }
  hit(code: string) { return this.enabled && this.pressed.has(code); }
  mouse(button: number) {
    if (!this.enabled || !(this.locked || this.active)) return false;
    return ((this.buttons | this.vmask) & (1 << button)) !== 0 || (button === 2 && this.keys.has(ZOOM_KEY));
  }
  mouseHit(button: number) { return this.enabled && (this.clicked.has(button) || (button === 2 && this.pressed.has(ZOOM_KEY))); }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
