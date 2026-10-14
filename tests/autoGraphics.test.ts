import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from '../src/core/Engine';
import type { Game } from '../src/game/Game';
import { AutoGraphics } from '../src/game/AutoGraphics';

vi.mock('../src/core/Touch', () => ({ isTouchDevice: () => false }));
vi.mock('../src/core/Preload', () => ({ isMissionReady: () => true }));
vi.mock('../src/game/Share', () => ({ toast: vi.fn() }));
vi.mock('../src/i18n', () => ({ t: (s: string) => s }));

beforeEach(() => {
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn() });
  vi.stubGlobal('screen', { width: 1440, height: 900 });
  vi.stubGlobal('navigator', {});
});
afterEach(() => vi.restoreAllMocks());

function bench(full: number, reduced: number) {
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const engine = {
    quality: 'high', renderScale: 0.65, refreshHz: 60,
    resetDynamicResolution(scale: number) { this.renderScale = scale; },
    resize: vi.fn(), setQuality(q: string) { this.quality = q; },
    timedFrame: vi.fn(() => { const ms = engine.renderScale === 1 ? full : reduced; clock += ms; return ms; }),
  };
  const game = {
    state: 'menu', settings: { quality: 'high' }, ui: {},
    applySettings: vi.fn(() => { engine.quality = game.settings.quality; }),
  };
  return { engine, game, auto: new AutoGraphics(engine as unknown as Engine, game as unknown as Game) };
}

describe('graphics benchmark recovery phase', () => {
  it('measures DRS recovery before dropping and starts at the proven scale', async () => {
    const { auto, engine } = bench(24, 13);
    const result = await auto.run({ sync: true });
    expect(result?.quality).toBe('high');
    expect(result?.recovered?.p50).toBe(13);
    expect(result?.scale).toBe(0.8);
    expect(engine.renderScale).toBe(0.8);
  });

  it('drops CPU-bound work and gathers enough samples even on very slow hardware', async () => {
    const { auto } = bench(200, 190);
    const result = await auto.run({ sync: true });
    expect(result?.quality).toBe('low');
    expect(result?.start.n).toBe(12);
    expect(result?.recovered?.n).toBe(12);
    expect(result?.scale).toBe(1);
  });

  it('an abort during recovery restores the previous preset and resolution without saving', async () => {
    const { auto, engine, game } = bench(24, 13);
    const timed = engine.timedFrame.getMockImplementation()!;
    engine.timedFrame.mockImplementation(() => {
      if (engine.renderScale === 0.8) auto.abort();
      return timed();
    });
    expect(await auto.run({ sync: true })).toBeNull();
    expect(engine.quality).toBe('high');
    expect(engine.renderScale).toBe(0.65);
    expect(game.applySettings).not.toHaveBeenCalled();
    expect(auto.running).toBe(false);
  });
});
