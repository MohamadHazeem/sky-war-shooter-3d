import menuArabic from '../src/i18n/ar/menu';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HANGAR_TABS, MAIN_ENTRIES, nextCampaignMission, shouldStartFirstFlight } from '../src/game/MenuModel';
import { CAMPAIGN } from '../src/game/Missions';
import { hasPhrase, setLang, tx } from '../src/i18n';
import type { Progress } from '../src/ui/UI';
import { stubStorage } from './helpers';
import { Onboarding } from '../src/game/Onboarding';
import { Tutorial } from '../src/game/Tutorial';

const fresh = (): Progress => ({ unlocked: 0, medals: {}, best: {}, survival: [] });
afterEach(() => { setLang('en'); vi.unstubAllGlobals(); });

describe('menu model', () => {
  it('has only three play choices and two links', () => {
    expect(MAIN_ENTRIES).toEqual(['campaign', 'survival', 'coop', 'hangar', 'settings']);
  });
  it('preserves every former entry in four bounded groups', () => {
    expect(HANGAR_TABS).toHaveLength(4);
    for (const tab of HANGAR_TABS) { expect(tab.entries.length).toBeLessThanOrEqual(6); expect(new Set(tab.entries.map(e => e[0])).size).toBe(tab.entries.length); }
    const routes = new Set(HANGAR_TABS.flatMap(t => t.entries.map(e => e[0])));
    for (const id of ['skills', 'crew', 'career', 'aircraft', 'armory', 'customize', 'trophies', 'leaderboards', 'daily', 'weekly', 'squadron', 'manual', 'whatsnew', 'theatre', 'campaign', 'custom', 'training']) expect(routes.has(id as never), id).toBe(true);
  });
  it('continues the actual campaign order, including story escorts, without unlocking anything', () => {
    const p = fresh();
    expect(nextCampaignMission(p).role).toBe('gunner');
    CAMPAIGN.forEach((m, i) => { p.unlocked = i; expect(nextCampaignMission(p)).toBe(m); expect(p.unlocked).toBe(i); });
    for (const unlocked of [-10, NaN, Infinity]) expect(nextCampaignMission({ unlocked })).toBe(CAMPAIGN[0]);
    expect(nextCampaignMission({ unlocked: 999 })).toBe(CAMPAIGN.at(-1));
    expect(nextCampaignMission({ unlocked: 1.9 })).toBe(CAMPAIGN[1]);
  });
  it('translates every menu label and description into Arabic', () => {
    setLang('ar');
    for (const text of Object.keys(menuArabic.phrases)) { expect(hasPhrase(text), text).toBe(true); expect(tx(text), text).toMatch(/[\u0600-\u06ff]/); }
    for (const t of HANGAR_TABS) for (const text of [t.label, ...t.entries.flatMap(e => [e[1], e[2]])]) {
      expect(hasPhrase(text), text).toBe(true); expect(tx(text), text).toMatch(/[\u0600-\u06ff]/);
    }
  });
});

describe('first flight', () => {
  it('starts only for a genuinely new player', () => {
    expect(shouldStartFirstFlight({}, fresh(), 0)).toBe(true);
    for (const saved of [{ tutorialDone: true }, { promptDismissed: true }]) expect(shouldStartFirstFlight(saved, fresh(), 0)).toBe(false);
    expect(shouldStartFirstFlight({}, fresh(), 1)).toBe(false);
    for (const update of [{ unlocked: 1 }, { best: { m1: 1 } }, { medals: { m1: [] } }, { survival: [{ name: 'test', score: 0, waves: 1, role: 'gunner', date: '' }] }]) expect(shouldStartFirstFlight({}, { ...fresh(), ...update }, 0)).toBe(false);
  });
  it('records the first launch before starting so returning or quitting cannot start it twice', () => {
    const storage = stubStorage();
    const startMission = vi.fn();
    const ob = Object.assign(Object.create(Onboarding.prototype), {
      saved: { tutorialDone: false, promptDismissed: false }, game: { startMission },
    }) as Onboarding;
    ob.startTutorial();
    expect(startMission.mock.calls[0][0]).toMatchObject({ id: 'tutorial', role: 'gunner', station: 'waistL' });
    expect(JSON.parse(storage.getItem('sws3d.onboarding.v1')!).promptDismissed).toBe(true);
    expect(shouldStartFirstFlight(JSON.parse(storage.getItem('sws3d.onboarding.v1')!), fresh(), 0)).toBe(false);
  });
  it('ends on the clean menu without opening the campaign map', () => {
    const startMenu = vi.fn(), showCampaign = vi.fn();
    const tutorial = Object.assign(Object.create(Tutorial.prototype), {
      active: true, phase: 'finale', t: 5, game: { startMenu, world: { playerBomber: {} } }, host: { showCampaign }, drones: [],
    }) as Tutorial;
    tutorial.update(.1);
    expect(startMenu).toHaveBeenCalledOnce(); expect(showCampaign).not.toHaveBeenCalled();
  });
});
