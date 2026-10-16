import { describe, it, expect, vi, afterEach } from 'vitest';
import { SimpleMenu } from '../src/game/SimpleMenu';
import type { Game } from '../src/game/Game';
import type { HangarRoute } from '../src/game/MenuModel';
import { CAMPAIGN } from '../src/game/Missions';
import { stubStorage } from './helpers';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  stubStorage();
  const g = {
    progress: { unlocked: 2 }, prog: { skills: { available: () => 0 } },
    ui: { title: vi.fn(), hideAll: vi.fn(), hangar: vi.fn(), openSettings: vi.fn() },
    service: { career: { xp: 0 }, openCareer: vi.fn(), openDaily: vi.fn(), openTrophies: vi.fn() },
    skills: { open: vi.fn() }, coop: { openMenu: vi.fn() },
    onboarding: { startTutorial: vi.fn(), openTraining: vi.fn() }, extras: { openGallery: vi.fn(), openWhatsNew: vi.fn(), manual: { open: vi.fn() } },
    cine: { theatre: { openLibrary: vi.fn() } }, showCampaign: vi.fn(), showGunneryRange: vi.fn(), showBriefing: vi.fn(), startMenu: vi.fn(),
  };
  const menus = new SimpleMenu(g as unknown as Game);
  return { g, menus };
}
describe('menu routing', () => {
  it('routes Fly directly to the current briefing with Back to title', () => {
    const { g, menus } = fixture(); menus.title();
    const handlers = g.ui.title.mock.calls[0][0];
    expect(Object.keys(handlers)).toEqual(['campaign', 'survival', 'coop', 'hangar', 'settings', 'relang']);
    handlers.campaign();
    expect(g.showCampaign).not.toHaveBeenCalled();
    expect(g.showBriefing.mock.calls[0][0]).toBe(CAMPAIGN[2]);
    g.showBriefing.mock.calls[0][1](); expect(g.startMenu).toHaveBeenCalledOnce();
    handlers.coop(); expect(g.coop.openMenu).toHaveBeenCalledOnce();
    handlers.relang(); expect(g.startMenu).toHaveBeenCalledTimes(2);   // title language picker rebuilds the whole title
  });
  it('uses the shared simplified Settings entry from title and preserves the Hangar return callback', () => {
    const { g, menus } = fixture(); menus.title();
    g.ui.title.mock.calls[0][0].settings();
    expect(g.ui.hideAll).toHaveBeenCalledOnce();
    g.ui.openSettings.mock.calls[0][0]();
    expect(g.startMenu).toHaveBeenCalledOnce();
    const back = vi.fn();
    menus.open('settings', back);
    expect(g.ui.openSettings).toHaveBeenLastCalledWith(back);
    g.ui.openSettings.mock.calls[1][0]();
    expect(back).toHaveBeenCalledOnce();
  });
  it('passes the parent tab return callback to reused screens', () => {
    const { g, menus } = fixture(); const back = vi.fn();
    const cases: [HangarRoute, ReturnType<typeof vi.fn>][] = [
      ['skills', g.skills.open], ['career', g.service.openCareer], ['daily', g.service.openDaily], ['trophies', g.service.openTrophies],
      ['whatsnew', g.extras.openWhatsNew], ['theatre', g.cine.theatre.openLibrary], ['campaign', g.showCampaign], ['range', g.showGunneryRange],
    ];
    for (const [route, target] of cases) { menus.open(route, back); expect(target).toHaveBeenLastCalledWith(back); }
    menus.open('aircraft', back); expect(g.extras.openGallery).toHaveBeenCalledWith(undefined, back);
    menus.open('manual', back); expect(g.extras.manual.open).toHaveBeenCalledWith(undefined, back);
    for (const section of ['armory', 'customize'] as const) {
      menus.open(section, back); expect(g.ui.hangar).toHaveBeenLastCalledWith(g.prog, 'gunner', expect.objectContaining({ section, next: 'Back' }), back);
    }
    menus.open('training', back); expect(g.onboarding.openTraining).toHaveBeenCalledWith(back);
  });
});
