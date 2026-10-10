import type { Input } from '../core/Input';

// Keyboard aiming, an accessibility alternative to the mouse. Arrow keys or I/J/K/L give a
// -1..1 deflection per axis (x: left/right, y: up/down). Holding a key eases up to full
// speed, so a short tap stays precise while a held key still traverses quickly.
export const KEY_AIM_RATE = 0.9; // rad/s at full deflection

const smooth = (t: number) => t * t * (3 - 2 * t);

export class KeyAim {
  x = 0;
  y = 0;
  private hx = 0; // seconds the horizontal key has been held
  private hy = 0; // seconds the vertical key has been held

  update(input: Input, dt: number) {
    const ax = (input.down('ArrowRight') || input.down('KeyL') ? 1 : 0) - (input.down('ArrowLeft') || input.down('KeyJ') ? 1 : 0);
    const ay = (input.down('ArrowUp') || input.down('KeyI') ? 1 : 0) - (input.down('ArrowDown') || input.down('KeyK') ? 1 : 0);
    this.hx = ax ? this.hx + dt : 0;
    this.hy = ay ? this.hy + dt : 0;
    this.x = ax * (0.3 + 0.7 * smooth(Math.min(1, this.hx / 0.6)));
    this.y = ay * (0.3 + 0.7 * smooth(Math.min(1, this.hy / 0.6)));
  }
}
