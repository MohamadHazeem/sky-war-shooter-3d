// Keyboard + mouse with pointer lock. Mouse deltas accumulate between frames.
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  buttons = 0;
  private clicked = new Set<number>();
  locked = false;
  enabled = true;
  sensitivity = 1;
  invertY = false;
  onLockChange?: (locked: boolean) => void;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.locked) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.clicked.add(e.button);
    });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.buttons = 0; this.keys.clear(); }
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (!this.locked) {
      const p = this.el.requestPointerLock?.({ unadjustedMovement: true } as any) as any;
      if (p && p.catch) p.catch(() => this.el.requestPointerLock?.());
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code: string) { return this.enabled && this.keys.has(code); }
  hit(code: string) { return this.enabled && this.pressed.has(code); }
  mouse(button: number) { return this.enabled && this.locked && (this.buttons & (1 << button)) !== 0; }
  mouseHit(button: number) { return this.enabled && this.clicked.has(button); }

  // Call at end of frame
  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
