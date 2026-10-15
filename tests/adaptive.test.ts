import { describe, it, expect } from 'vitest';
import { Adaptive, ADAPTIVE_BANDS, ADAPTIVE_RANGE, ADAPTIVE_BASELINE, type AdaptiveBand, type AdaptiveRole } from '../src/game/Adaptive';
import { difficultyBalance, BASIC_SETTINGS } from '../src/ui/SettingsModel';
import { PHRASES } from '../src/i18n/phrases';

// A synthetic player: how well it shoots and answers, and how much it gets hurt. The fight
// reacts to the director (closed loop): more / sharper / more focused fighters hurt more and
// are fewer to shoot at when eased.
interface Bot { acc: number; react: number; dmg: number; kpm: number }
const BOTS: Record<'rookie' | 'human' | 'ace', Bot> = {
  rookie: { acc: 0.15, react: 7, dmg: 0.075, kpm: 2.5 },   // ~ the autoplay rookie (docs/phase11/reports/29.md)
  human: { ...ADAPTIVE_BASELINE.gunner },
  ace: { acc: 0.75, react: 2, dmg: 0.01, kpm: 9 },
};
const target = (x: number) => ({ team: 'axis', alive: true, playerDamage: 0, pos: { distanceTo: () => x } });

function fly(bot: Bot, secs: number, opts: { band?: AdaptiveBand; role?: AdaptiveRole; enabled?: boolean; heal?: boolean } = {}) {
  const a = new Adaptive();
  a.enabled = opts.enabled ?? true;
  a.reset(opts.band ?? 'veteran', opts.role ?? 'gunner', 0.75);
  let shots = 0, hits = 0, health = 1, killAcc = 0, dmgTaken = 0, t = 0, nextFoe = 0;
  const foes: ReturnType<typeof target>[] = [];
  const dt = 1 / 20;
  for (let i = 0; i < secs / dt; i++, t += dt) {
    const pressure = a.mult * a.skill * a.focus / a.aim;      // how hard the fight hits back
    shots += 12 * dt; hits += 12 * dt * bot.acc;
    const loss = bot.dmg / 60 * dt * pressure;
    dmgTaken += loss; health = Math.max(0, health - loss); if (opts.heal !== false && health < 0.62) health = 0.95;   // the crew patches her up (repairs never count back)
    killAcc += bot.kpm / 60 * dt * Math.min(1.2, a.mult); if (killAcc >= 1) { killAcc -= 1; a.onKill(t); }
    // a fighter enters gun range every 5 s; the bot answers it after its reaction time
    if (t >= nextFoe) { foes.push(target(500)); nextFoe += 5; }
    for (const f of foes) if (!(f as any).enter) (f as any).enter = t; else if (!f.playerDamage && t - (f as any).enter >= bot.react) f.playerDamage = 1;
    a.observe(t, foes, null, 900);
    a.update({ t, dt, health, shots: Math.floor(shots), hits: Math.floor(hits) });
  }
  return { a, dmgTaken, health };
}

describe('adaptive difficulty director', () => {
  it('off: every knob stays exactly 1 whatever the player does', () => {
    for (const b of Object.values(BOTS)) {
      const { a } = fly(b, 300, { enabled: false });
      expect([a.mult, a.skill, a.aim, a.focus]).toEqual([1, 1, 1, 1]);
      expect(a.summary()).toBe('off');
    }
  });

  it('balance: a struggling bot is eased, a human-level bot left alone, a dominating bot pressed', () => {
    const rookie = fly(BOTS.rookie, 480).a, human = fly(BOTS.human, 480).a, ace = fly(BOTS.ace, 480).a;
    expect(rookie.mult).toBeLessThan(0.9); expect(rookie.aim).toBeGreaterThan(1.12); expect(rookie.focus).toBeLessThan(0.9); expect(rookie.skill).toBeLessThan(0.95);
    expect(Math.abs(human.mult - 1)).toBeLessThan(0.05); expect(Math.abs(human.aim - 1)).toBeLessThan(0.06);
    expect(ace.mult).toBeGreaterThan(1.1); expect(ace.skill).toBeGreaterThan(1.04); expect(ace.aim).toBeLessThan(0.97);
    expect(ace.focus).toBe(1);   // never more attackers on the player than the mission sets
    expect([rookie.summary(), human.summary(), ace.summary()]).toEqual(['eased', 'steady', 'pushed']);
    // measures land near the bots' real numbers
    expect(rookie.acc).toBeCloseTo(BOTS.rookie.acc, 1); expect(ace.react).toBeCloseTo(BOTS.ace.react, 0); expect(rookie.react).toBeCloseTo(BOTS.rookie.react, 0);
  });

  it('balance: easing lowers the damage a struggling bot takes; pressing raises the challenge for a strong one', () => {
    const on = fly(BOTS.rookie, 600), off = fly(BOTS.rookie, 600, { enabled: false });
    expect(on.dmgTaken).toBeLessThan(off.dmgTaken * 0.75);
    const aceOn = fly(BOTS.ace, 600), aceOff = fly(BOTS.ace, 600, { enabled: false });
    expect(aceOn.dmgTaken).toBeGreaterThan(aceOff.dmgTaken * 1.15);
  });

  it('works for the P-51 role against its own baseline', () => {
    const pilotHuman = fly({ ...ADAPTIVE_BASELINE.pilot }, 480, { role: 'pilot' }).a;
    expect(Math.abs(pilotHuman.mult - 1)).toBeLessThan(0.05);
    // a gunner-level accuracy in the P-51 is strong
    expect(fly({ ...ADAPTIVE_BASELINE.pilot, acc: 0.45 }, 480, { role: 'pilot' }).a.mult).toBeGreaterThan(1.02);
  });

  it('stays inside the chosen difficulty band (never reaches the neighbouring difficulty)', () => {
    const skillMin = (b: AdaptiveBand) => 1 - ADAPTIVE_RANGE.skill.ease * ADAPTIVE_BANDS[b].ease;
    const skillMax = (b: AdaptiveBand) => 1 + ADAPTIVE_RANGE.skill.push * ADAPTIVE_BANDS[b].push;
    const enemy = (b: AdaptiveBand) => difficultyBalance(b).enemy;
    const mid = (x: AdaptiveBand, y: AdaptiveBand) => (enemy(x) + enemy(y)) / 2;
    expect(enemy('recruit') * skillMax('recruit')).toBeLessThan(mid('recruit', 'veteran'));
    expect(enemy('veteran') * skillMin('veteran')).toBeGreaterThan(mid('recruit', 'veteran'));
    expect(enemy('veteran') * skillMax('veteran')).toBeLessThan(mid('veteran', 'ace'));
    expect(enemy('ace') * skillMin('ace')).toBeGreaterThan(mid('veteran', 'ace'));
    // and the simulated extremes respect it
    for (const band of ['recruit', 'veteran', 'ace'] as AdaptiveBand[]) {
      const hi = fly(BOTS.ace, 900, { band }).a, lo = fly(BOTS.rookie, 900, { band }).a;
      expect(hi.skill).toBeLessThanOrEqual(skillMax(band) + 1e-9); expect(lo.skill).toBeGreaterThanOrEqual(skillMin(band) - 1e-9);
      expect(hi.mult).toBeLessThanOrEqual(1 + ADAPTIVE_RANGE.mult.push * ADAPTIVE_BANDS[band].push + 1e-9);
      expect(lo.mult).toBeGreaterThanOrEqual(1 - ADAPTIVE_RANGE.mult.ease * ADAPTIVE_BANDS[band].ease - 1e-9);
    }
    // Recruit leans on easing, Ace on pressing
    expect(fly(BOTS.ace, 600, { band: 'recruit' }).a.mult).toBeLessThan(fly(BOTS.ace, 600, { band: 'ace' }).a.mult);
    expect(fly(BOTS.rookie, 600, { band: 'ace' }).a.mult).toBeGreaterThan(fly(BOTS.rookie, 600, { band: 'recruit' }).a.mult);
  });

  it('never punishing: no push in the first minute, slow to push, quick to ease', () => {
    const early = fly(BOTS.ace, 55).a;
    expect(early.mult).toBe(1); expect(early.skill).toBe(1); expect(early.aim).toBe(1);
    const eased = fly(BOTS.rookie, 30).a;
    expect(eased.mult).toBeLessThan(0.95);    // easing starts at once
    // time to cover half the swing: easing well under pushing
    const half = (bot: Bot, pass: (a: Adaptive) => boolean) => { for (let s = 10; s < 600; s += 10) if (pass(fly(bot, s).a)) return s; return 600; };
    const easeHalf = half(BOTS.rookie, (a) => a.mult < 1 - ADAPTIVE_RANGE.mult.ease * 0.8 * 0.5);
    const pushHalf = half(BOTS.ace, (a) => a.mult > 1 + ADAPTIVE_RANGE.mult.push * 0.8 * 0.5);
    expect(easeHalf * 2.5).toBeLessThan(pushHalf);
  });

  it('a crisis cancels any push at once and eases hard', () => {
    const { a } = fly(BOTS.ace, 400);
    expect(a.mult).toBeGreaterThan(1.05);
    a.update({ t: 400.05, dt: 0.05, health: 0.3, shots: 1e5, hits: 1e5 });
    expect(a.mult).toBeLessThanOrEqual(1); expect(a.skill).toBeLessThanOrEqual(1); expect(a.aim).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 400; i++) a.update({ t: 400.1 + i * 0.05, dt: 0.05, health: 0.3, shots: 1e5 + i * 20, hits: 1e5 + i * 20 });
    expect(a.mult).toBeLessThan(0.9); expect(a.perf).toBeLessThan(-0.4);
  });

  it('reaction tracker: range entry to first hit; unanswered fighters and allies are dropped', () => {
    const a = new Adaptive(); a.reset('veteran', 'gunner');
    const near = target(400), far = target(5000), ally = { ...target(300), team: 'allied' }, ignored = target(300);
    const all = [near, far, ally, ignored];
    for (let t = 0; t < 40; t += 0.05) {
      if (t >= 3 && !near.playerDamage) near.playerDamage = 5;
      a.observe(t, all, null, 900);
    }
    expect(a.react).toBeCloseTo(3, 0);      // only the one answered fighter counted
    expect((a as any).reactN).toBe(1);
  });

  it('reset restores the baselines and the mission summary', () => {
    const { a } = fly(BOTS.rookie, 300);
    a.reset('ace', 'pilot', 0.2);
    expect([a.mult, a.skill, a.aim, a.focus, a.baseFocus]).toEqual([1, 1, 1, 1, 0.2]);
    expect(a.acc).toBe(ADAPTIVE_BASELINE.pilot.acc); expect(a.summary()).toBe('steady');
  });

  it('is a basic setting with Arabic text', () => {
    expect(BASIC_SETTINGS).toContain('adaptive');
    for (const s of ['Adaptive difficulty', 'Eases or presses the enemy to match how you fly, within your difficulty. Never lowers your score.', 'Eased off', 'Steady', 'Pressed harder'])
      expect(PHRASES[s], s).toMatch(/[؀-ۿ]/);
  });
});
