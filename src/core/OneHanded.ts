// One-handed mouse mode (Settings > Accessibility): the whole gunner station plays from a
// mouse alone. Left button fires and right button zooms as always; on top of that:
//   wheel           previous / next gun position (one step per notch, debounced)
//   middle click    reload (held: answers an emergency prompt, like the gamepad's X)
//   middle held     (half a second, no prompt showing) take / leave the bombsight
//   back button     ability: call the Mustangs     forward button   ability: Overdrive
// In the P-51 the wheel does nothing (the pilot keeps the keyboard's throttle). Like the
// gamepad it speaks the keyboard's language through Input.tap(), so no controller changes.

import type { Input } from './Input';

export interface OneHandHost {
  enabled(): boolean;
  /** a mission is in play and the player has control */
  flying(): boolean;
  role(): 'gunner' | 'pilot' | null;
  cycleSeat(dir: -1 | 1): void;
  /** the key the in-flight event prompt asks for ('KeyX'), if one is showing */
  promptKey?(): string | null;
}

/** Seconds between two gun-position steps from the wheel (a free-spinning wheel sends dozens). */
export const WHEEL_STEP = 0.28;
/** Middle button held at least this long (seconds) = bombsight instead of reload. */
export const MIDDLE_HOLD = 0.5;

type Tapper = Pick<Input, 'tap' | 'hold'>;

export class OneHandedMouse {
  private wheelT = -1;   // time of the last wheel step
  private middleT = -1;  // when the middle button went down (-1 = not held by this mode)
  private promptHeld: string | null = null;

  constructor(private input: Tapper, private host: OneHandHost) {}

  private on() { return this.host.enabled() && this.host.flying(); }

  /** A mouse button went down; true = the mode used it (the caller stops the browser default). */
  down(button: number, now: number): boolean {
    if (!this.on()) return false;
    const role = this.host.role();
    if (button === 1) {
      // an emergency prompt is held like its key; otherwise reload / bombsight on release
      const prompt = this.host.promptKey?.() ?? null;
      if (prompt) { this.promptHeld = prompt; this.input.hold(prompt, true); }
      else this.middleT = now;
      return true;
    }
    if (button === 3 || button === 4) {
      if (!role) return false;
      const keys = role === 'gunner' ? ['KeyQ', 'KeyE'] : ['KeyZ', 'KeyX'];
      this.input.tap(keys[button === 3 ? 0 : 1]);
      return true;
    }
    return false;
  }

  up(button: number, now: number): boolean {
    if (button === 1 && this.promptHeld) { this.input.hold(this.promptHeld, false); this.promptHeld = null; return true; }
    if (button === 1 && this.middleT >= 0) {
      const held = now - this.middleT;
      this.middleT = -1;
      if (!this.on()) return false;
      this.input.tap(held >= MIDDLE_HOLD && this.host.role() === 'gunner' ? 'KeyN' : 'KeyR');
      return true;
    }
    return this.on() && (button === 3 || button === 4);
  }

  /** Wheel: deltaY sign; now in seconds. True = used (the page should not scroll). */
  wheel(dy: number, now: number): boolean {
    if (!this.on() || this.host.role() !== 'gunner' || !dy) return false;
    if (this.wheelT >= 0 && now - this.wheelT < WHEEL_STEP) return true;
    this.wheelT = now;
    this.host.cycleSeat(dy > 0 ? 1 : -1);
    return true;
  }

  /** Window listeners (browser only). Side buttons would otherwise navigate back / forward. */
  attach(target: Window = window) {
    const t = () => performance.now() / 1000;
    target.addEventListener('mousedown', (e) => { if (this.down(e.button, t())) e.preventDefault(); }, true);
    target.addEventListener('mouseup', (e) => { if (this.up(e.button, t())) e.preventDefault(); }, true);
    target.addEventListener('auxclick', (e) => { if (this.on() && e.button !== 2) e.preventDefault(); }, true);
    target.addEventListener('wheel', (e) => { if (this.wheel(Math.sign(e.deltaY), t())) e.preventDefault(); }, { passive: false, capture: true });
    target.addEventListener('blur', () => { this.middleT = -1; if (this.promptHeld) { this.input.hold(this.promptHeld, false); this.promptHeld = null; } });
  }
}
