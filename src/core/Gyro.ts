// Gyro aim for phones and tablets (Phase 11 · 15): turning the device turns the gun, on top of
// the drag aim. Rate based (devicemotion rotationRate, deg/s) so there is no drift to recentre
// and no compass jumps; the maths is DOM-free so it can be unit tested. ui/TouchHud.ts owns the
// listener and the GYRO button; Settings → Touch & gamepad holds the switch and the sensitivity.

/** Mouse pixels per degree of device rotation: the gunner turns 0.0018 rad per pixel, so 1:1. */
export const GYRO_PX_PER_DEG = (Math.PI / 180) / 0.0018;
/** Rotation slower than this (deg/s) is hand tremor: ignored so a resting sight stays still. */
export const GYRO_DEADZONE = 1.2;
/** Faster than this (deg/s) is the phone being put down or flipped: ignored. */
export const GYRO_MAX_RATE = 720;

export interface RotationRate { alpha: number | null; beta: number | null; gamma: number | null }

/**
 * Device rotation rate (deg/s, device axes: beta about x, gamma about y, alpha about z) and the
 * screen orientation angle (0, 90, 180, 270 / -90) -> mouse-delta pixels for `dt` seconds.
 * Turning right / tilting the top away from you moves the sight right / up, like a camera.
 * `out` is filled and returned (no allocation per frame).
 */
export function gyroToMouse(r: RotationRate, screenAngle: number, dt: number, sens = 1, out = { x: 0, y: 0 }): { x: number; y: number } {
  const bx = r.beta ?? 0, gy = r.gamma ?? 0;
  out.x = out.y = 0;
  if (!Number.isFinite(bx) || !Number.isFinite(gy) || dt <= 0) return out;
  const th = (screenAngle * Math.PI) / 180;
  const s = Math.sin(th), c = Math.cos(th);
  // screen axes in device coordinates: right = (cos, -sin), up = (sin, cos)
  const yawRight = -(bx * s + gy * c);
  const pitchUp = bx * c - gy * s;
  const k = GYRO_PX_PER_DEG * sens * dt;
  out.x = shape(yawRight) * k;
  out.y = shape(-pitchUp) * k;
  return out;
}

// Dead zone with a soft knee (no jump at the edge) and a ceiling for violent motion
function shape(rate: number): number {
  const a = Math.abs(rate);
  if (a <= GYRO_DEADZONE || a > GYRO_MAX_RATE) return 0;
  return Math.sign(rate) * (a - GYRO_DEADZONE);
}

/** The screen orientation angle the browser reports (Screen Orientation API, then the old window.orientation). */
export function screenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const a = (typeof screen !== 'undefined' ? (screen.orientation as ScreenOrientation | undefined)?.angle : undefined)
    ?? (window as { orientation?: number }).orientation;
  return typeof a === 'number' && Number.isFinite(a) ? a : 0;
}

export type GyroAccess = 'granted' | 'denied' | 'unsupported';

/** Motion sensors present at all (iOS asks permission first: see requestGyro). */
export function gyroSupported(): boolean {
  return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
}

/** iOS 13+: ask for motion access (must run inside a tap). Elsewhere it is simply there. */
export async function requestGyro(): Promise<GyroAccess> {
  if (!gyroSupported()) return 'unsupported';
  const DME = (window as unknown as { DeviceMotionEvent: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
  if (typeof DME.requestPermission !== 'function') return 'granted';
  try { return (await DME.requestPermission()) === 'granted' ? 'granted' : 'denied'; } catch { return 'denied'; }
}
