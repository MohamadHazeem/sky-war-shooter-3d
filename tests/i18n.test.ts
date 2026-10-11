import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { stubStorage } from './helpers';
import { en } from '../src/i18n/en';
import { ar } from '../src/i18n/ar';
import { PHRASES, PATTERNS } from '../src/i18n/phrases';
import { t, tx, setLang, getLang, hasPhrase } from '../src/i18n';
import { CAMPAIGN } from '../src/game/Missions';
import { UPGRADES, WEAPONS, AIRCRAFT, PERKS } from '../src/game/Upgrades';
import { STATIONS } from '../src/world/B17Layout';
import { CREW } from '../src/world/Crew';
import { VOICE_LINES } from '../src/audio/voiceLines';
import { SKILLS, BRANCHES } from '../src/game/Skills';
import { RAID_TEMPLATES, sideRaidsFor, FIRST_GAP, LAST_GAP } from '../src/game/SideRaids';
import { applyOutcome, defaultCampaign, migrateFromProgress, opInfo, currentStory, offeredRaids, type CampaignData, type IntelReport } from '../src/game/CampaignState';
import { ALL_ENEMIES, MOODS, SEATS, SKILLS as BATTLE_SKILLS, buildCustomMission, configParts, sanitizeConfig, type CustomConfig } from '../src/game/CustomBattle';
import { weeklyMission, weeklyScenario, fmtWeekCountdown, WEEKLY_NOSE_NAME } from '../src/game/Weekly';
import { MODES } from '../src/game/Modes';
import { markLabel, MK_KILL, MK_MULTI, MK_BOSS, MK_ACE, MK_CLOSE, MK_NEAR } from '../src/game/Recorder';
import type { Mission } from '../src/game/Missions';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()).sort();
const arabic = /[؀-ۿ]/;

beforeEach(() => { stubStorage(); });
afterEach(() => { setLang('en'); });

describe('interface strings', () => {
  it('every key in en.ts exists in ar.ts, translated', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ar[k], k).toBeTypeOf('string');
      expect(ar[k].length, k).toBeGreaterThan(0);
    }
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('keeps placeholders and markup', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ar[k]), k).toEqual(placeholders(en[k]));
      expect(tags(ar[k]), k).toEqual(tags(en[k]));
    }
  });

  it('t() follows the language and fills variables', () => {
    expect(getLang()).toBe('en');
    expect(t('campaign.mission', { n: 3 })).toBe('MISSION 3');
    setLang('ar');
    expect(t('campaign.mission', { n: 3 })).toBe('المهمة 3');
    expect(localStorage.getItem('sws3d.lang')).toBe('ar');
  });
});

describe('phrase tables', () => {
  it('Arabic values keep placeholders, markup and the bomber-name token', () => {
    for (const [k, v] of Object.entries(PHRASES)) {
      expect(placeholders(v), k).toEqual(placeholders(k));
      expect(tags(v), k).toEqual(tags(k));
      if (k.includes('Sky Queen')) expect(v, k).toContain('Sky Queen');
    }
  });

  it('patterns are anchored', () => {
    for (const [re] of PATTERNS) expect(re.source.startsWith('^') && re.source.endsWith('$'), String(re)).toBe(true);
  });

  it('tx() is the identity in English and translates in Arabic', () => {
    expect(tx('Left Waist')).toBe('Left Waist');
    expect(tx('Wave {n}', { n: 2 })).toBe('Wave 2');
    setLang('ar');
    expect(tx('Left Waist')).toMatch(arabic);
    expect(tx('LEFT WAIST')).toBe(tx('Left Waist'));   // upper-cased display text
    expect(tx('no such line 123')).toBe('no such line 123');
  });

  it('covers every mission text', () => {
    for (const m of CAMPAIGN) {
      for (const s of [m.title, m.target, m.date, ...m.briefing, ...m.objectives, ...(m.success ? [m.success] : [])]) {
        expect(hasPhrase(s), `${m.id}: ${s}`).toBe(true);
      }
      for (const w of m.waves) if (w.radio) expect(hasPhrase(w.radio[1]), `${m.id} radio: ${w.radio[1]}`).toBe(true);
    }
  });

  it('covers the armory, hangar and field upgrades', () => {
    for (const u of UPGRADES) for (const s of [u.name, u.desc, u.per]) expect(hasPhrase(s), s).toBe(true);
    for (const d of [...WEAPONS, ...AIRCRAFT, ...PERKS]) for (const s of [d.name, d.desc]) expect(hasPhrase(s), s).toBe(true);
  });

  it('covers stations, crew and every recorded radio line', () => {
    for (const s of Object.values(STATIONS)) expect(hasPhrase(s.label), s.label).toBe(true);
    for (const c of CREW) expect(hasPhrase(c.label), c.label).toBe(true);
    for (const [id, l] of Object.entries(VOICE_LINES)) {
      expect(hasPhrase(l.text), `${id}: ${l.text}`).toBe(true);
      for (const sp of l.speakers) expect(hasPhrase(sp), `speaker ${sp}`).toBe(true);
    }
  });
});

// ---------------- screens added after the first translation pass ----------------

// Latin that stays in Arabic text: aircraft and unit designations, keys, file types, the bomber's name
const KEEP = /B-17G?|P-51D?|Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335|Sky Queen|TM 1-SK|SK-1944|FM 1-[MGS]|PNG|WASD|Q\/E|Shift|Tab|Esc|\bH\b/g;
// The Arabic for an English text: translated, and with no English words left in it
function arabicFor(s: string): string {
  const out = tx(s);
  expect(out, s).toMatch(arabic);
  expect(out.replace(/<[^>]+>/g, '').replace(KEEP, ''), `untranslated words in: ${s}\n→ ${out}`).not.toMatch(/[A-Za-z]{2,}/);
  return out;
}
const missionTexts = (m: Mission) => [m.title, m.target, m.date, ...m.briefing, ...m.objectives, ...(m.success ? [m.success] : []),
  ...m.waves.flatMap((w) => (w.radio ? [w.radio[1]] : []))];

describe('new screens resolve to Arabic', () => {
  beforeEach(() => { setLang('ar'); });

  it('skill tree: every branch, node name and description', () => {
    for (const b of BRANCHES) { arabicFor(b.name); arabicFor(b.motto); }
    for (const s of SKILLS) { arabicFor(s.name); arabicFor(s.desc); }
    for (const n of [1, 2, 3]) arabicFor(`${n} pt${n === 1 ? '' : 's'}`);
    arabicFor('The crew patched her up · +40% integrity');
  });

  it('side raids: every template text, target and generated mission', () => {
    for (const tpl of RAID_TEMPLATES) {
      arabicFor(tpl.label); arabicFor(tpl.verb); arabicFor(tpl.objective);
      expect(tx(tpl.verb).split(': ')[1], tpl.verb).toMatch(arabic);   // the briefing line shows the effect half
      for (const t of tpl.targets) {
        for (const s of [...tpl.brief(t), tpl.success(t), t.city, t.name, t.city.toUpperCase()]) arabicFor(s);
      }
    }
    // every raid the generator offers over many campaigns: both roles, all gaps
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      for (let g = FIRST_GAP; g <= LAST_GAP(); g++) {
        for (const r of sideRaidsFor(seed, g)) {
          for (const s of [...missionTexts(r.mission), r.mission.target.replace(/^Escort — /, '')]) {
            if (seen.has(s)) continue;
            seen.add(s);
            arabicFor(s);
          }
        }
      }
    }
    expect(seen.size).toBeGreaterThan(60);
  });

  it('campaign: intelligence report lines over a whole tour, wins, losses and raids', () => {
    const reports: IntelReport[] = [];
    let d: CampaignData = defaultCampaign(7);
    let i = 0;
    while (!d.complete && i < 60) {
      const raid = offeredRaids(d)[i % 3];
      if (raid && i % 2) {
        const res = applyOutcome(d, opInfo(d, raid.mission)!, { success: i % 4 === 1, kills: 4, bombersLost: i % 5, bombersTotal: 12 });
        d = res.data; reports.push(res.report);
      }
      const m = currentStory(d)!;
      const res = applyOutcome(d, opInfo(d, m)!, { success: i % 6 !== 5, kills: 6, bombersLost: (i * 3) % 7, bombersTotal: m.bombers });
      d = res.data; reports.push(res.report);
      i++;
    }
    reports.push(applyOutcome(d, opInfo(d, CAMPAIGN[0])!, { success: true, kills: 1, bombersLost: 0, bombersTotal: 9 }).report);   // a replay
    for (const n of [1, 3]) reports.push(migrateFromProgress({ unlocked: n }).report!);
    const lines = new Set<string>();
    for (const r of reports) { lines.add(r.title); for (const l of r.lines) lines.add(l.text); }
    for (const s of lines) arabicFor(s);
    for (const s of ['Raid bonus: +300 merit.', 'Mustangs join the gunner missions at 50%.']) arabicFor(s);
    expect(lines.size).toBeGreaterThan(40);
  });

  it('custom battle: every option, summary piece and the built mission', () => {
    const cfgs: Partial<CustomConfig>[] = [];
    for (const station of SEATS) for (const mood of MOODS) cfgs.push({ role: 'gunner', station, mood, sunEl: 5 + cfgs.length * 3 });
    for (const skill of BATTLE_SKILLS) cfgs.push({ role: 'pilot', skill, rounds: 0, boss: true, bossRound: 2 });
    for (const t of ALL_ENEMIES) cfgs.push({ enemies: [t], rounds: 1, boss: true, flak: true, escorts: false, specials: false });
    cfgs.push({ enemies: [...ALL_ENEMIES] }, { enemies: ['bf110', 'ju88', 'me163'] });
    for (const c of cfgs) {
      const m = buildCustomMission(c);
      for (const s of [...missionTexts(m), ...configParts(sanitizeConfig(c))]) arabicFor(s);
    }
  });

  it('weekly challenge: a year of scenarios, their missions and rewards', () => {
    for (let w = 1; w <= 53; w++) {
      const key = `2026${String(w).padStart(2, '0')}`;
      const s = weeklyScenario(key);
      arabicFor(s.headline); arabicFor(`Operation ${s.operation}`); arabicFor(s.target);
      for (const role of ['gunner', 'pilot'] as const) for (const t of missionTexts(weeklyMission(role, key))) arabicFor(t);
    }
    for (const ms of [3 * 86400000 + 4 * 3600000 + 60000, 5 * 3600000]) arabicFor(fmtWeekCountdown(ms));
    arabicFor('Weekly Challenge — week 41');
    arabicFor(`+2000 merit · weekly ribbon · ${WEEKLY_NOSE_NAME} nose art unlocked (hangar)`);
    arabicFor('WEEK 41 · B-17 GUNNER · TOP 10');
  });

  it('survival screen tabs and the theatre', () => {
    for (const d of MODES) { arabicFor(d.title); arabicFor(d.blurb); }
    for (const [k, a] of [[MK_KILL, 0], [MK_MULTI, 2], [MK_MULTI, 3], [MK_MULTI, 5], [MK_BOSS, 0], [MK_ACE, 0], [MK_CLOSE, 0], [MK_NEAR, 0]]) {
      arabicFor(markLabel(k, a));
      arabicFor(`${markLabel(k, a)} · Mission 3 · Flak Alley`);
    }
    for (const s of ['Mission 2 · Twelve O\'Clock High', 'You · B-17', 'Saved 2880×1800 PNG', 'Moment saved (2/5)', '5/5 saved: delete one first',
      '5/5 saved: delete one from Theatre in the title menu first']) arabicFor(s);
  });

  it('English is unchanged', () => {
    setLang('en');
    expect(tx('Formation {n} ships', { n: '9/12' })).toBe('Formation 9/12 ships');
    expect(tx(SKILLS[0].desc)).toBe(SKILLS[0].desc);
    expect(tx('{n} pts'.replace('{n}', '2'))).toBe('2 pts');
  });
});

// ---------------- co-op and the canvas HUD ----------------

// node:fs without @types/node (the project's tsconfig only has the browser types)
const FS = 'node:fs';
const { readFileSync } = (await import(FS)) as { readFileSync(p: URL, enc: 'utf8'): string };
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
// the quoted English literals on the lines that show text (single words like 'left', 'loss',
// 'paused' are states, not text)
function shownLiterals(path: string, calls: RegExp, templates = false): string[] {
  const out = new Set<string>();
  for (const line of source(path).split('\n')) {
    if (!calls.test(line) || /console\./.test(line)) continue;
    for (const m of (templates ? line : line.replace(/`[^`]*`/g, '')).matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      const s = m[1].replace(/\\'/g, "'");
      if (/[A-Za-z]/.test(s) && !/^[a-z_-]+$/.test(s)) out.add(s);
    }
  }
  return [...out];
}

describe('co-op and canvas HUD resolve to Arabic', () => {
  beforeEach(() => { setLang('ar'); });

  it('co-op: every status, error, disconnect and in-mission message', () => {
    const session = shownLiterals('game/CoopSession.ts', /screen\.(menu|busy|toast|waiting)\(|renderLobby\('|ui\.(tip|feed|banner)\(|const msg =|endWhy = String|why: typeof|title: '/);
    const signal = shownLiterals('net/Signal.ts', /new RoomError\(/);
    expect(session.length).toBeGreaterThan(20);
    expect(signal.length).toBe(4);
    for (const s of [...session, ...signal]) {
      if (s.includes('{name}')) {
        const translated = tx(s, { name: 'ولش', target: tx('Fw 190') });
        expect(translated).toMatch(arabic);
        expect(translated.replace(KEEP, '')).not.toMatch(/[A-Za-z]{2,}/);
      } else arabicFor(s);
    }
    // runtime-built lines
    expect(arabicFor('Joining 7K2P9Q…')).toContain('7K2P9Q');
    for (const s of ['Mission over — The mission is over.', 'Mission over — Too many bombers lost — 6 Fortresses went down.',
      'PARTNER is on the LEFT WAIST', 'PARTNER is on the TAIL GUN', 'Fw 190 destroyed — partner', 'Bf 109 destroyed — partner', 'Double kill — partner']) arabicFor(s);
  });

  it('co-op: every screen text (title entry, menu, stand-by, lobby, tag, tooltip)', () => {
    const screen = shownLiterals('ui/CoopScreen.ts', /tx\(/, true);
    expect(screen.length).toBeGreaterThanOrEqual(25);
    for (const s of screen) if (!s.includes('{')) arabicFor(s); else expect(tx(s, { ms: 84 }).replace(/\d+/, '')).not.toMatch(/[A-Za-z]{2,}/);
    // no English left between tags in the markup (template lines, with every ${…} removed)
    const left: string[] = [];
    for (let line of source('ui/CoopScreen.ts').split('\n')) {
      if (!/<(div|button|p|h2|small)\b/.test(line)) continue;
      for (let prev = ''; prev !== line;) { prev = line; line = line.replace(/\$\{[^{}]*\}/g, ''); }
      left.push(...(line.match(/>[^<>]*[A-Za-z]{2,}[^<>]*</g) ?? []));
    }
    expect(left).toEqual([]);
    expect(tx('Connection: {ms} ms round trip', { ms: 84 })).toContain('84');
    for (const s of ['Left Waist', 'Right Waist', 'Top Turret', 'Ball Turret', 'Tail Gun']) arabicFor(s);
  });

  it('wingman panel: orders, DOWN, kills and the key list', async () => {
    const { WING_LABEL } = await import('../src/game/Wingman');
    for (const s of Object.values(WING_LABEL)) arabicFor(s);
    arabicFor('DOWN');
    arabicFor('1 ATK  2 COVER  3 BOMBERS  4 FORM');
    for (const n of [0, 1, 2, 3, 11]) {
      arabicFor(`80%  ·  ${n} kill${n === 1 ? '' : 's'}`);
      arabicFor(`replacement next round · ${n} kills`);
    }
    expect(tx('100%  ·  2 kills')).toBe('100%  ·  إسقاطان');
  });

  it('raid, escort and pilot canvas labels', () => {
    for (const s of ['AIRFIELD 4.2 km', 'CONED · 1.8 km TO FIELD', '12.0 km TO FIELD', 'UNDER ATTACK', 'UNDER ATTACK ×3',
      'STRAGGLER 42%', 'STRAGGLER 42% — UNDER ATTACK', 'IN RANGE 240m', '640m', 'LOCK 380m +45mph', 'LOCK 380m -12mph', 'LOCK 1200m',
      'NO TARGET', 'SPLASHED']) arabicFor(s);
    // every padlock note: the bandit's manoeuvre labels in DogfightAI
    const labels = source('world/DogfightAI.ts').match(/const LABELS[^}]*}/)![0];
    const notes = [...labels.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(notes.length).toBe(10);
    for (const s of notes) arabicFor(s);
  });

  it('settings key list and touch buttons: every remappable action and reserved key', async () => {
    const { ACTIONS, RESERVED } = await import('../src/core/KeyMap');
    for (const a of ACTIONS) arabicFor(a.label);
    for (const r of new Set(Object.values(RESERVED))) arabicFor(r);
    for (const s of ['ATK', 'COVER', 'BOMB', 'FORM']) arabicFor(s);
    expect(tx('Wingman: {order}', { order: tx('COVER') })).toBe('الجناح المرافق: تغطية');
    arabicFor('<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase');
  });

  it('controls card (keyboard, touch and gamepad) and the theatre phone layout', () => {
    // every literal the card passes to tx() (key caps like 'RT' / 'View' are printed on the pad: kept)
    const card = shownLiterals('ui/ControlsCard.ts', /tx\(/).filter((s) => !s.includes('{') && /[a-z]{3}/.test(s) && /\s/.test(s));
    expect(card.length).toBeGreaterThan(24);
    for (const s of card) arabicFor(s);
    for (const s of ['Mouse', 'Drag', 'Reload', 'Fire', 'Roll', 'Rudder', 'Zoom', 'Pause', 'CONTROLS', 'GAMEPAD', 'Right stick', 'Left stick', 'Previous / next gun position', 'Reload, or answer an emergency prompt',
      'Roll (left / right) and throttle (up / down)', 'Tap: padlock the nearest bandit · hold: free look']) arabicFor(s);
    const theatre = shownLiterals('ui/TheatreScreen.ts', /tx\(/, true).filter((s) => !s.includes('{') && s.length > 1);
    for (const s of ['TAP HERE TO SHOW THE INTERFACE', 'Move the free camera', 'Camera up', 'Camera down',
      'Drag to orbit or look around · pinch with two fingers to zoom · Free camera: the move pad bottom left, ▲ ▼ up / down']) {
      expect(theatre, s).toContain(s);
      arabicFor(s);
    }
  });

  it('special events: every ace, banner, panel, tag, feed and radio line', () => {
    const src = source('game/SpecialEvents.ts');
    const aces = [...src.matchAll(/\{ rank: '(\w+)', short: '([\w.]+)', name: '([\w ]+)', last: '(\w+)', victories: (\d+) \}/g)]
      .map((m) => ({ rank: m[1], short: m[2], name: m[3], last: m[4], victories: +m[5] }));
    expect(aces.length).toBe(5);
    for (const a of aces) {
      for (const s of [`ACE SQUADRON · ${a.rank.toUpperCase()} ${a.name.toUpperCase()} · ${a.victories} VICTORIES`, `${a.last}'s Staffel`,
        `ACE · ${a.victories} VICTORIES`, `${a.rank} ${a.name}`, `${a.short} ${a.last} got away`, `${a.short} ${a.last} shot down`,
        `${a.short} ${a.last} shot down — +450 merit`, `${a.rank.toUpperCase()} ${a.name.toUpperCase()} · ${a.victories} VICTORIES`,
        `${a.short.toUpperCase()} ${a.last.toUpperCase()} · ${a.victories}`, `${a.short} ${a.last}`, a.last,
        `Yellow noses, twelve o'clock high! That's ${a.last}'s Staffel — ${a.victories} kills!`,
        `${a.last} is breaking off — the yellow noses are heading home.`, `You got ${a.last}! The whole group saw him go down!`,
        `Somebody got ${a.last}! Scratch one Experte!`, `Viermots ahead. ${a.last} here — the fat one in the middle is mine. Horrido!`,
        `Achtung, Amis. Number ${a.victories + 1} is flying in that box. Pauke, pauke!`]) arabicFor(s);
    }
    // the fixed texts of the three events (panel, banners, tips, tags, rewards, radio)
    const fixed = shownLiterals('game/SpecialEvents.ts', /ui\.(tip|banner|feed)\(|callout\(|view: PanelView|t\.label = |reward\(|cueAt\(|barText = /);
    expect(fixed.length).toBeGreaterThan(15);
    for (const s of fixed) if (!s.endsWith('×')) arabicFor(s);
    for (const n of [0, 1, 2, 3, 5]) { arabicFor(`+${n} WINGMEN`); arabicFor(`${n} LAUNCHER${n === 1 ? '' : 'S'}`); arabicFor(`${n} HEAVY FIGHTERS WITH ROCKETS`); arabicFor(`${n} / 6 LEFT`); }
    for (const s of ['Fw 190 (yellow nose)', 'Zerstörer wave broken up — +135 merit']) arabicFor(s);
  });

  it('enemy tactics: radar cues, gunner hints and radio calls', () => {
    const fixed = shownLiterals('world/Tactics.ts', /\.call\(|hint\?\.\(|cueAt\(/);
    expect(fixed.length).toBeGreaterThan(15);
    for (const s of fixed) if (!s.endsWith('×') && /\s/.test(s)) arabicFor(s);   // skip call ids like 'bk5down'
    for (const s of ['HEAD-ON ×6', 'Bf 110 hanging back out of range — he\'s got rocket tubes! He\'ll lob them in from a kilometre!',
      'Zerstörers! Twin-engine destroyers forming up at four o\'clock level — they\'re carrying rockets!',
      'Zerstörer formation on the <b>RIGHT</b> — <kbd>2</kbd> right waist · break them up before they fire',
      'Zerstörer formation on the <b>LEFT</b> — <kbd>1</kbd> left waist · break them up before they fire',
      '109s diving on Sky Queen! She\'s out of formation — they\'re going for her!', 'Flak coming up — heavy guns below us. Hold steady.']) arabicFor(s);
  });

  it('English is unchanged', () => {
    setLang('en');
    for (const s of ['LOCK 380m +45mph', 'IN RANGE 240m', 'AIRFIELD 4.2 km', '80%  ·  1 kill', 'PARTNER is on the TAIL GUN', 'Joining 7K2P9Q…', 'Co-op (beta)',
      'ACE · 52 VICTORIES', 'HPTM. KESSLER · 52', 'Kessler', '3 LAUNCHERS', 'PINCER'])
      expect(tx(s)).toBe(s);
    expect(tx('Connection: {ms} ms round trip', { ms: 84 })).toBe('Connection: 84 ms round trip');
  });
});
