import { describe, it, expect } from 'vitest';
import { CAMPAIGN, migrateProgress, CAMPAIGN_LAYOUT } from '../src/game/Missions';
import { briefingMapSvg } from '../src/ui/BriefingMap';

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { existsSync, readFileSync, statSync } = (await import(FS)) as {
  existsSync(p: URL): boolean; readFileSync(p: URL, enc: 'utf8'): string; statSync(p: URL): { size: number };
};
const VOICE = new URL('../public/audio/voice/', import.meta.url);
const join = (dir: URL, file: string) => new URL(file, dir);
const NEW = ['m8', 'm9', 'm10', 'm11', 'm12'];
const byId = (id: string) => CAMPAIGN.find((m) => m.id === id)!;

describe('story campaign', () => {
  it('runs twelve missions in date order, from autumn 1943 to spring 1944', () => {
    expect(CAMPAIGN.map((m) => m.id)).toEqual(['m1', 'm2', 'm8', 'm9', 'm3', 'm10', 'm4', 'm5', 'm11', 'm6', 'm7', 'm12']);
    const dates = CAMPAIGN.map((m) => Date.parse(m.date));
    for (const d of dates) expect(Number.isNaN(d)).toBe(false);
    for (let i = 1; i < dates.length; i++) expect(dates[i]).toBeGreaterThan(dates[i - 1]);
    expect(CAMPAIGN[0].date).toMatch(/1943$/);
    expect(CAMPAIGN[CAMPAIGN.length - 1].id).toBe('m12');
  });

  it('gives every new mission the full set: weather mood, round, objectives, success line, a 3-4 paragraph briefing', () => {
    for (const id of NEW) {
      const m = byId(id);
      expect(m.weather?.mood, id).toBeTruthy();
      expect(m.round, id).toBeDefined();
      expect(m.objectives.length, id).toBeGreaterThanOrEqual(3);
      expect(m.success, id).toBeTruthy();
      expect(m.briefing.length, id).toBeGreaterThanOrEqual(3);
      expect(m.briefing.length, id).toBeLessThanOrEqual(4);
    }
  });

  it('mixes the roles and objectives the story calls for', () => {
    const fresh = NEW.map(byId);
    const pilots = fresh.filter((m) => m.role === 'pilot').length;
    expect(pilots).toBeGreaterThanOrEqual(1);
    expect(pilots).toBeLessThanOrEqual(2);
    // a weather front's mood counts: m9 flies into its storm (Weather.ts fronts)
    const moods = new Set(fresh.flatMap((m) => [m.weather!.mood, m.weather!.front?.to]));
    for (const mood of ['clear', 'overcast', 'storm', 'dusk'] as const) expect(moods.has(mood), mood).toBe(true);
    expect(byId('m9').weather!.front).toMatchObject({ to: 'storm' });           // clear air, into the front...
    expect(byId('m9').weather!.mood).toBe('clear');
    expect(byId('m9').weather!.front!.at).toBeLessThan(byId('m9').duration);
    expect(byId('m3').weather!.front).toMatchObject({ to: 'clear' });           // ...and the overcast breaking up over Ludwigshafen
    expect(byId('m3').weather!.front!.at + (byId('m3').weather!.front!.duration ?? 45)).toBeLessThanOrEqual(byId('m3').bombsAway!);
    expect(byId('m10').playerDamaged).toBe(true);                         // crippled over the Channel
    expect(byId('m10').escortArrive).toBeLessThan(byId('m10').duration);
    expect(byId('m11').flak!.intensity).toBeGreaterThanOrEqual(1.6);       // the heavy flak run...
    expect(byId('m11').bombsAway).toBeGreaterThan(byId('m11').flak!.start); // ...with bombs away inside it
    expect(byId('m11').bombsAway).toBeLessThan(byId('m11').flak!.end);
    expect(byId('m8').round!.min).toBeGreaterThanOrEqual(Math.max(...CAMPAIGN.filter((m) => !NEW.includes(m.id)).map((m) => m.round!.min))); // the mass attack
    const finale = byId('m12');
    expect(finale.round!.max).toBe(Math.max(...CAMPAIGN.map((m) => m.round!.max)));
    expect(finale.rounds).toBe(4);
  });

  it('carries the crew story through the original missions too', () => {
    for (const m of CAMPAIGN) expect(m.briefing.some((p) => p.includes('Sky Queen')), m.id).toBe(true);
  });

  it('draws a route chart for every mission', () => {
    for (const m of CAMPAIGN) expect(briefingMapSvg(m), m.id).toContain('<svg');
  });
});

describe('recorded briefings', () => {
  const man = JSON.parse(readFileSync(join(VOICE, 'manifest.json'), 'utf8')) as { clips: Record<string, { file: string; text: string; role: string }> };

  it('has a clip for every briefing paragraph, reading the text on the sheet', () => {
    for (const m of CAMPAIGN) {
      m.briefing.forEach((text, i) => {
        const c = man.clips[`brief_${m.id}_${i + 1}`];
        expect(c, `brief_${m.id}_${i + 1} (run tools/voice/briefings.mjs + generate.py)`).toBeDefined();
        expect(c.role).toBe('briefing');
        expect(c.text).toBe(text);
        expect(existsSync(join(VOICE, c.file))).toBe(true);
      });
    }
  });

  it('keeps the briefing audio under 2 MB', () => {
    const bytes = Object.entries(man.clips).filter(([id]) => id.startsWith('brief_')).reduce((s, [, c]) => s + statSync(join(VOICE, c.file)).size, 0);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});

describe('saved progress from the seven-mission campaign', () => {
  const ids = CAMPAIGN.map((m) => m.id);
  it('moves the unlocked index to the same mission in the new order', () => {
    expect(migrateProgress({ unlocked: 0 }).unlocked).toBe(0);
    expect(migrateProgress({ unlocked: 2 }).unlocked).toBe(ids.indexOf('m3'));
    expect(migrateProgress({ unlocked: 3 }).unlocked).toBe(ids.indexOf('m4'));
    expect(migrateProgress({ unlocked: 6 }).unlocked).toBe(ids.indexOf('m7'));
    expect(migrateProgress({ unlocked: 6, medals: { m7: ['Air Medal'] } }).unlocked).toBe(ids.indexOf('m12'));
  });

  it('runs once', () => {
    const p = migrateProgress<{ unlocked: number; layout?: number }>({ unlocked: 3 });
    expect(p.layout).toBe(CAMPAIGN_LAYOUT);
    expect(migrateProgress({ ...p }).unlocked).toBe(p.unlocked);
    expect(migrateProgress({ unlocked: 3, layout: CAMPAIGN_LAYOUT }).unlocked).toBe(3);
  });
});
