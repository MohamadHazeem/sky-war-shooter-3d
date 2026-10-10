// Touch device detection and the maths behind the touch controls (kept free of DOM so it
// can be unit tested). The on-screen controls themselves live in ui/TouchHud.ts.

/** Mouse pixels per finger pixel of aim drag (the controllers then apply their own sensitivity). */
export const TOUCH_AIM_GAIN = 2.3;
/** Mouse pixels per second at full stick deflection (same scale as the free-cursor edge push). */
export const STICK_RATE = 950;
export const STICK_DEADZONE = 0.08;

/** True on phones and tablets: a coarse primary pointer, or a touch-only browser. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (/[?&]touch=1\b/.test(location.search)) return true;
  if (/[?&]touch=0\b/.test(location.search)) return false;
  const points = navigator.maxTouchPoints ?? 0;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent);
  return points > 0 && (coarse || mobileUA);
}

/** Device in portrait (the game wants landscape). */
export function isPortrait(): boolean {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth * 1.05;
}

/**
 * Virtual stick: finger offset (px) from the stick centre -> -1..1 per axis.
 * Radial dead zone, then a soft curve so small corrections stay precise.
 */
export function stickValue(dx: number, dy: number, radius: number, dead = STICK_DEADZONE): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (radius <= 0 || len < 1e-6) return { x: 0, y: 0 };
  const m = Math.min(1, len / radius);
  if (m <= dead) return { x: 0, y: 0 };
  const t = (m - dead) / (1 - dead);
  const k = (t * (0.45 + 0.55 * t)) / len;   // between linear and quadratic
  return { x: dx * k, y: dy * k };
}

/** Drag delta (finger px) -> mouse-delta px. Wider screens get a slightly lower gain. */
export function dragToMouse(d: number, screenW: number): number {
  const scale = Math.min(1.25, Math.max(0.75, 812 / Math.max(320, screenW)));
  return d * TOUCH_AIM_GAIN * scale;
}
