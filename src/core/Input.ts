// Keyboard + mouse. Pointer lock is requested for the best feel, but the game is fully
// playable without it (some browsers/embedded views refuse it): mouse deltas and buttons
// are read either way, and with a free cursor, holding it near a screen edge keeps
// turning in that direction.
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  private clicked = new Set<number>();
  locked = false;
  everLocked = false;
  enabled = true;
  active = false;            // true while a mission is being played (enables free-cursor aim)
  sensitivity = 1;
  invertY = false;
  cursorX = 0.5;             // normalised cursor position (free-cursor mode)
  cursorY = 0.5;
  private overCanvas = false;
  onLockChange?: (locked: boolean) => void;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.active) e.preventDefault();
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

  lock() {
    if (this.locked) return;
    try {
      const p = this.el.requestPointerLock?.({ unadjustedMovement: true } as any) as any;
      if (p && p.catch) p.catch(() => { try { (this.el.requestPointerLock?.() as any)?.catch?.(() => {}); } catch { /* refused */ } });
    } catch { /* pointer lock not available: free-cursor mode */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // Continuous turn rate (-1..1) when the free cursor rests near a screen edge
  edgePush(): { x: number; y: number } {
    if (this.locked || !this.active || !this.overCanvas) return { x: 0, y: 0 };
    const e = 0.07;
    const f = (v: number) => (v < e ? -(e - v) / e : v > 1 - e ? (v - (1 - e)) / e : 0);
    return { x: f(this.cursorX), y: f(this.cursorY) };
  }

  down(code: string) { return this.enabled && this.keys.has(code); }
  hit(code: string) { return this.enabled && this.pressed.has(code); }
  mouse(button: number) { return this.enabled && (this.locked || this.active) && (this.buttons & (1 << button)) !== 0; }
  mouseHit(button: number) { return this.enabled && this.clicked.has(button); }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
