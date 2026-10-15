import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubStorage } from './helpers';
import {
  momentSpeed, bestWindow, markWeight, pickVideoType, studioFileName, chaseOffset, coverCrop, studioLook,
  STUDIO_LOOKS, LOOK_LABEL, SLOWMO, CLIP_BEFORE, CLIP_AFTER, CLIP_MAX, VIDEO_TYPES,
} from '../src/game/ReplayStudio';
import { MK_KILL, MK_MULTI, MK_BOSS, MK_CLOSE } from '../src/game/Recorder';
import { SPEEDS, MODE_ORDER } from '../src/ui/TheatreScreen';
import { tx, setLang } from '../src/i18n';

const arabic = /[؀-ۿ]/;

describe('slow motion through moments', () => {
  const marks = new Float64Array([10, 30]);

  it('plays at the chosen speed away from moments', () => {
    expect(momentSpeed(0, marks, 2, 1)).toBe(1);
    expect(momentSpeed(20, marks, 2, 2)).toBe(2);
    expect(momentSpeed(5, marks, 0, 1)).toBe(1);   // no marks
  });

  it('is fully slow at and just after a moment', () => {
    expect(momentSpeed(10, marks, 2, 1)).toBeCloseTo(SLOWMO);
    expect(momentSpeed(11, marks, 2, 1)).toBeCloseTo(SLOWMO);
    expect(momentSpeed(9.5, marks, 2, 1)).toBeCloseTo(SLOWMO);
  });

  it('eases in and out smoothly and never speeds up a slow base', () => {
    let prev = momentSpeed(8, marks, 2, 1);
    for (let t = 8; t <= 10; t += 0.05) {
      const s = momentSpeed(t, marks, 2, 1);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    const mid = momentSpeed(8.9, marks, 2, 1);
    expect(mid).toBeGreaterThan(SLOWMO);
    expect(mid).toBeLessThan(1);
    expect(momentSpeed(10, marks, 2, 0.1)).toBe(0.1);
  });
});

describe('best moment window', () => {
  it('centres on the heaviest moment and stays inside the recording', () => {
    const marks = [
      { t: 20, type: MK_KILL, label: 'Kill' },
      { t: 60, type: MK_BOSS, label: 'Boss kill' },
    ];
    const w = bestWindow(marks, 0, 90, 5);
    expect(w.label).toBe('Boss kill');
    expect(w.start).toBe(60 - CLIP_BEFORE);
    expect(w.end).toBe(60 + CLIP_AFTER);
  });

  it('scores a cluster of kills over a lone one', () => {
    const marks = [
      { t: 10, type: MK_CLOSE, label: 'Close call' },
      { t: 40, type: MK_KILL, label: 'Kill' }, { t: 41, type: MK_KILL, label: 'Kill' },
      { t: 42, type: MK_MULTI, a: 3, label: 'Triple kill' },
    ];
    expect(markWeight(MK_MULTI, 3)).toBeGreaterThan(markWeight(MK_CLOSE));
    const w = bestWindow(marks, 0, 90, 0);
    expect(w.start).toBeGreaterThanOrEqual(36);
    expect(w.end).toBe(42 + CLIP_AFTER);
    expect(w.end - w.start).toBeLessThanOrEqual(CLIP_MAX);
  });

  it('extends over a running fight but never past CLIP_MAX', () => {
    const marks = [0, 3, 6, 9, 12, 15].map((t) => ({ t: 20 + t, type: MK_KILL, label: 'Kill' }));
    const w = bestWindow(marks, 0, 90, 0);
    expect(w.end - w.start).toBeLessThanOrEqual(CLIP_MAX + 1e-9);
    expect(w.end - w.start).toBeGreaterThan(CLIP_BEFORE + CLIP_AFTER);
  });

  it('clamps at the ends and falls back to the playhead', () => {
    const early = bestWindow([{ t: 1, type: MK_BOSS }], 0, 90, 0);
    expect(early.start).toBe(0);
    expect(early.end).toBe(CLIP_BEFORE + CLIP_AFTER);
    const late = bestWindow([{ t: 89, type: MK_BOSS }], 0, 90, 0);
    expect(late.end).toBe(90);
    expect(late.start).toBe(90 - CLIP_BEFORE - CLIP_AFTER);
    const none = bestWindow([], 0, 90, 50);
    expect(none).toMatchObject({ start: 46, end: 53, label: 'Moment', score: 0 });
    const short = bestWindow([], 0, 3, 1);
    expect(short.start).toBe(0);
    expect(short.end).toBe(3);
  });
});

describe('video clips', () => {
  it('prefers VP9 WebM, then VP8, and reports none', () => {
    expect(pickVideoType(() => true)).toBe(VIDEO_TYPES[0]);
    expect(pickVideoType((t) => t === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8');
    expect(pickVideoType(() => false)).toBe('');
    expect(pickVideoType(() => { throw new Error('x'); })).toBe('');
  });

  it('names files after the moment and the time', () => {
    const d = new Date(2026, 9, 15, 9, 5, 7);
    expect(studioFileName('clip', 'Triple kill Mission 3 · Baptism of Fire', 'webm', d))
      .toBe('sky-war-clip-triple-kill-mission-3-baptism-of-fire-20261015-090507.webm');
    expect(studioFileName('card', 'مهمة', 'png', d)).toBe('sky-war-card-20261015-090507.png');
  });
});

describe('chase camera and cards', () => {
  it('sits behind and above the subject, further back for a bomber', () => {
    const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3();
    chaseOffset(fwd, up, 5, out);
    expect(out.z).toBeLessThan(0);
    expect(out.y).toBeGreaterThan(0);
    const small = out.length();
    chaseOffset(fwd, up, 20, out);
    expect(out.length()).toBeGreaterThan(small);
  });

  it('cover-crops any frame to the card, centred', () => {
    const [sx, sy, sw, sh] = coverCrop(1920, 1080, 1200, 675);
    expect([sx, sy]).toEqual([0, 0]);
    expect(sw / sh).toBeCloseTo(1200 / 675);
    const tall = coverCrop(800, 1600, 1200, 675);
    expect(tall[0]).toBeCloseTo(0);
    expect(tall[2]).toBeCloseTo(800);
    expect(tall[1]).toBeCloseTo((1600 - 450) / 2);
    const wide = coverCrop(3000, 1000, 1200, 675);
    expect(wide[3]).toBeCloseTo(1000);
    expect(wide[0]).toBeCloseTo((3000 - 1000 * 1200 / 675) / 2);
  });

  it('film looks resolve to the Settings look on auto', () => {
    expect(studioLook('auto', 'kodachrome')).toBe('kodachrome');
    expect(studioLook('auto', undefined)).toBeUndefined();
    expect(studioLook('newsreel', 'film')).toBe('newsreel');
    expect(STUDIO_LOOKS[0]).toBe('auto');
  });

  it('the theatre offers 0.1x and the chase camera', () => {
    expect(SPEEDS[0]).toBe(0.1);
    expect(MODE_ORDER).toContain('chase');
    expect(new Set(MODE_ORDER).size).toBe(MODE_ORDER.length);
  });
});

describe('Arabic', () => {
  beforeEach(() => { stubStorage(); setLang('ar'); });
  afterEach(() => { setLang('en'); });

  it('covers every new theatre string', () => {
    const strings = [
      'Chase', 'Slow motion on moments', 'Share card', 'Record clip', 'Stop recording', 'REC',
      'The current view as a picture card with the mission, the moment and your kills',
      'Plays the best moment and saves it as a short WebM video', '1 kill in this replay',
      'Card shared', 'Card saved', 'Card saved · share text and link copied', 'Recording the best moment…',
      'Saving clip…', 'Clip saved (WebM video)', 'Could not record the clip', 'Video clips are not supported in this browser',
      'Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–5 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit',
      ...Object.values(LOOK_LABEL),
    ];
    for (const s of strings) expect(tx(s), s).toMatch(arabic);
    expect(tx('{n} kills in this replay', { n: 4 })).toMatch(/4/);
    expect(tx('{n} kills in this replay', { n: 4 })).toMatch(arabic);
  });
});
