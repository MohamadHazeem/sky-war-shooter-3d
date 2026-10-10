import { describe, expect, it, vi } from 'vitest';
import { stubStorage } from './helpers';
import { dntEnabled, fpsBucket, modeOf, screenBucket, setStatsOptIn, statsAllowed, statsOptIn } from '../src/net/Analytics';
import { resultText, shareTextFor } from '../src/game/Share';

describe('share texts', () => {
  it('reads like the debrief line', () => {
    expect(resultText({ title: 'Black Thursday', kills: 34, score: 9000, success: true, survival: false, role: 'gunner' }))
      .toBe("I downed 34 fighters in 'Black Thursday' — Sky War Shooter 3D");
    expect(resultText({ title: 'Flak Alley', kills: 1, score: 100, success: false, survival: false, role: 'gunner' }))
      .toBe("I downed 1 fighter in 'Flak Alley' before going down — Sky War Shooter 3D");
    expect(resultText({ title: 'Survival — Gunner', kills: 12, score: 12345, success: false, survival: true, waves: 4, role: 'gunner' }))
      .toContain('held out for 4 rounds');
    expect(shareTextFor({ mission: 'Baptism of Fire', score: 1500, kills: 3 })).toBe("3 kills, 1,500 points in 'Baptism of Fire' — Sky War Shooter 3D");
  });
});

describe('anonymous stats', () => {
  it('buckets screens and frame rates coarsely', () => {
    expect(screenBucket(390, 844)).toBe('phone');
    expect(screenBucket(1024, 768)).toBe('tablet');
    expect(screenBucket(1440, 900)).toBe('laptop');
    expect(screenBucket(1920, 1080)).toBe('desktop');
    expect(screenBucket(3840, 2160)).toBe('large');
    expect([12, 25, 40, 50, 60, 144].map(fpsBucket)).toEqual(['<20', '20-30', '30-45', '45-58', '58+', '58+']);
  });

  it('derives the mode from the mission', () => {
    expect(modeOf({ id: 'm8', role: 'gunner', duration: 300 }, null)).toBe('campaign');
    expect(modeOf({ id: 'survival-pilot', role: 'pilot', duration: Infinity }, 'survival-pilot')).toBe('survival');
    expect(modeOf({ id: 'survival-gunner', role: 'gunner', duration: Infinity }, 'acehunt-gunner')).toBe('acehunt');
    expect(modeOf({ id: 'daily', role: 'gunner', duration: 300 }, 'daily-gunner-20261010')).toBe('daily');
    expect(modeOf({ id: 'school', role: 'gunner', duration: 300, tutorial: true }, null)).toBe('tutorial');
  });

  it('is on by default, off by toggle or Do-Not-Track', () => {
    stubStorage();
    vi.stubGlobal('navigator', { doNotTrack: null });
    expect(statsOptIn()).toBe(true);
    expect(statsAllowed()).toBe(false);                 // dev build (vitest): opt-in only
    localStorage.setItem('sws3d.analytics.dev', '1');
    expect(statsAllowed()).toBe(true);
    setStatsOptIn(false);
    expect(statsAllowed()).toBe(false);
    setStatsOptIn(true);
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    expect(dntEnabled()).toBe(true);
    expect(statsAllowed()).toBe(false);
    vi.stubGlobal('navigator', { globalPrivacyControl: true });
    expect(statsAllowed()).toBe(false);
  });
});
