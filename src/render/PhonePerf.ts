// Phone performance mode (Phase 11 · 15): mobile GPUs share their power budget with the screen
// and throttle within minutes, so on a phone the presets render fewer pixels and fewer purely
// visual particles. It sits on top of the chosen preset (Low..Cinematic keep their meaning) and
// dynamic resolution still works under it. Pure logic; Engine.setPhoneProfile applies it,
// DeviceControls picks it from Settings → Touch & gamepad → Phone performance mode.
import type { DeviceInfo } from './QualityPick';

export type PhonePerfPref = 'auto' | 'on' | 'off';

export interface PhoneProfile {
  pixelCap: number;    // ceiling of the main render-target pixel budget
  particles: number;   // multiplier on the preset's visual particle budget
  label: 'phone' | 'phone-lite';
}

/** A phone: touch first and a small screen (tablets keep the desktop budgets). */
export const isPhone = (d: DeviceInfo) => d.touch && d.shortSide < 600;
/** Little memory or few cores: the leanest budget. */
const lean = (d: DeviceInfo) => (d.memoryGB !== undefined && d.memoryGB <= 4) || (d.cores !== undefined && d.cores <= 4);

// A 6.1" phone held sideways is ~844x390 CSS px at DPR 3: 0.75 Mpx is ~DPR 1.4, which still
// reads sharp at arm's length and costs about half of Medium's budget there.
export const PHONE_PIXELS = 0.75e6;
export const PHONE_LITE_PIXELS = 0.5e6;

export function phoneProfile(d: DeviceInfo, pref: PhonePerfPref): PhoneProfile | null {
  if (pref === 'off' || (pref === 'auto' && !isPhone(d))) return null;
  return lean(d)
    ? { pixelCap: PHONE_LITE_PIXELS, particles: 0.35, label: 'phone-lite' }
    : { pixelCap: PHONE_PIXELS, particles: 0.6, label: 'phone' };
}

/** The pixel budget a preset gets under a profile (null = no phone mode). */
export const cappedPixels = (presetPixels: number, p: PhoneProfile | null) => (p ? Math.min(presetPixels, p.pixelCap) : presetPixels);
