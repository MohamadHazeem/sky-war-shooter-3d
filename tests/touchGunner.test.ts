import { describe, expect, it } from 'vitest';
import { gyroToMouse, GYRO_DEADZONE, GYRO_MAX_RATE, GYRO_PX_PER_DEG } from '../src/core/Gyro';
import { cappedPixels, isPhone, phoneProfile, PHONE_LITE_PIXELS, PHONE_PIXELS } from '../src/render/PhonePerf';
import { freshMemory, installOffer, INSTALL_MAX_DISMISSALS, INSTALL_SNOOZE_MS, isIosSafari, readMemory, type InstallEnv } from '../src/core/Install';
import { QUALITY } from '../src/core/Engine';
import { PHRASES } from '../src/i18n/phrases';
import touchGunner from '../src/i18n/ar/touchGunner';

const rate = (beta: number, gamma: number) => ({ alpha: 0, beta, gamma });

describe('gyro aim', () => {
  it('turning right in landscape (top of the phone to the left) moves the sight right', () => {
    // screen angle 90: the device's +x axis points up the screen; turning right spins it negatively
    const m = gyroToMouse(rate(-30, 0), 90, 1);
    expect(m.x).toBeGreaterThan(0);
    expect(m.y).toBeCloseTo(0);
  });

  it('the other landscape (angle 270 / -90) mirrors the axes', () => {
    const a = gyroToMouse(rate(30, 0), 270, 1);
    const b = gyroToMouse(rate(30, 0), -90, 1);
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeCloseTo(a.x);
  });

  it('tilting the top edge back looks up (mouse up = negative y)', () => {
    // landscape 90: screen-right is the device's -y axis; pitching up turns about it positively
    const m = gyroToMouse(rate(0, -20), 90, 1);
    expect(m.y).toBeLessThan(0);
    expect(m.x).toBeCloseTo(0);
  });

  it('is 1:1 — a degree of phone is a degree of gun (gunner: 0.0018 rad per pixel)', () => {
    const m = gyroToMouse(rate(0, -(10 + GYRO_DEADZONE)), 0, 1);   // portrait: yaw about the device y axis
    expect(m.x).toBeCloseTo(10 * GYRO_PX_PER_DEG);
    expect(m.x * 0.0018).toBeCloseTo((10 * Math.PI) / 180);
  });

  it('ignores tremor, violent flips and junk, and scales with sensitivity and time', () => {
    expect(gyroToMouse(rate(GYRO_DEADZONE * 0.9, 0), 90, 1).x).toBe(0);
    expect(gyroToMouse(rate(GYRO_MAX_RATE + 10, 0), 90, 1).x).toBe(0);
    expect(gyroToMouse({ alpha: null, beta: null, gamma: null }, 90, 1)).toEqual({ x: 0, y: 0 });
    expect(gyroToMouse(rate(NaN, 5), 90, 1)).toEqual({ x: 0, y: 0 });
    expect(gyroToMouse(rate(-30, 0), 90, 0).x).toBe(0);
    const one = gyroToMouse(rate(-30, 0), 90, 1 / 60).x;
    expect(gyroToMouse(rate(-30, 0), 90, 1 / 30, 2).x).toBeCloseTo(one * 4);
  });

  it('fills the given object instead of allocating', () => {
    const out = { x: 9, y: 9 };
    expect(gyroToMouse(rate(-30, 0), 90, 1 / 60, 1, out)).toBe(out);
  });
});

describe('phone performance mode', () => {
  const phone = { touch: true, shortSide: 390, reducedData: false, cores: 8, memoryGB: 6 };
  const tablet = { ...phone, shortSide: 820 };
  const desktop = { touch: false, shortSide: 1080, reducedData: false, cores: 12, memoryGB: 16 };

  it('automatic: phones only', () => {
    expect(isPhone(phone)).toBe(true);
    expect(phoneProfile(phone, 'auto')?.pixelCap).toBe(PHONE_PIXELS);
    expect(phoneProfile(tablet, 'auto')).toBeNull();
    expect(phoneProfile(desktop, 'auto')).toBeNull();
  });

  it('on / off override the device class; small-memory phones get the leanest budget', () => {
    expect(phoneProfile(desktop, 'on')).not.toBeNull();
    expect(phoneProfile(phone, 'off')).toBeNull();
    const lite = phoneProfile({ ...phone, memoryGB: 3 }, 'auto')!;
    expect(lite.pixelCap).toBe(PHONE_LITE_PIXELS);
    expect(lite.particles).toBeLessThan(phoneProfile(phone, 'auto')!.particles);
  });

  it('caps the preset pixel budgets but never raises Low', () => {
    const p = phoneProfile(phone, 'on');
    expect(cappedPixels(QUALITY.medium.pixels, p)).toBe(PHONE_PIXELS);
    expect(cappedPixels(QUALITY.low.pixels, p)).toBe(Math.min(QUALITY.low.pixels, PHONE_PIXELS));
    expect(cappedPixels(QUALITY.high.pixels, null)).toBe(QUALITY.high.pixels);
    // a 844x390 phone at DPR 3 renders well under its native 3 Mpx
    expect(Math.sqrt(PHONE_PIXELS / (844 * 390))).toBeLessThan(1.6);
  });
});

describe('install offer', () => {
  const android: InstallEnv = { standalone: false, canPrompt: true, ios: false, touch: true };
  const iphone: InstallEnv = { standalone: false, canPrompt: false, ios: true, touch: true };
  const flown = { ...freshMemory(), sorties: 1 };
  const now = 1_800_000_000_000;

  it('waits for the first sortie, then offers the right flow', () => {
    expect(installOffer(android, freshMemory(), now)).toBeNull();
    expect(installOffer(android, flown, now)).toBe('prompt');
    expect(installOffer(iphone, flown, now)).toBe('ios');
    expect(installOffer({ ...android, canPrompt: false }, flown, now)).toBeNull();
  });

  it('never in the installed app, after installing, or on a desktop', () => {
    expect(installOffer({ ...android, standalone: true }, flown, now)).toBeNull();
    expect(installOffer(android, { ...flown, installed: true }, now)).toBeNull();
    expect(installOffer({ ...android, touch: false }, flown, now)).toBeNull();
  });

  it('"Not now" snoozes for a few days, three refusals end it', () => {
    const snoozed = { ...flown, dismissals: 1, dismissedAt: now - 1000 };
    expect(installOffer(android, snoozed, now)).toBeNull();
    expect(installOffer(android, snoozed, now + INSTALL_SNOOZE_MS)).toBe('prompt');
    expect(installOffer(android, { ...flown, dismissals: INSTALL_MAX_DISMISSALS, dismissedAt: 1 }, now)).toBeNull();
  });

  it('recognises iPhone / iPad Safari only', () => {
    const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const iosChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
    expect(isIosSafari(iosSafari, 5)).toBe(true);
    expect(isIosSafari(iosChrome, 5)).toBe(false);
    expect(isIosSafari(ipad, 5)).toBe(true);
    expect(isIosSafari(ipad, 0)).toBe(false);   // a real Mac
    expect(isIosSafari(android, 5)).toBe(false);
  });

  it('reads saved memory defensively', () => {
    expect(readMemory(null)).toEqual(freshMemory());
    expect(readMemory('{not json')).toEqual(freshMemory());
    expect(readMemory('{"sorties":2,"dismissals":-1,"dismissedAt":"x","installed":true}')).toEqual({ sorties: 2, dismissals: 0, dismissedAt: 0, installed: true });
  });
});

describe('Arabic for the touch gunner', () => {
  it('every new string is translated and registered', () => {
    for (const [en, ar] of Object.entries(touchGunner.phrases)) {
      expect(ar, en).toMatch(/[؀-ۿ]/);
      expect(PHRASES[en], en).toBeDefined();
    }
  });
  it('the install card uses the Arabic game name of the title screen', () => {
    expect(touchGunner.phrases['Install Sky War']).toBe('ثبّت حرب السماء');
    expect(touchGunner.phrases['Install Sky War']).not.toMatch(/[A-Za-z]/);
  });
});
