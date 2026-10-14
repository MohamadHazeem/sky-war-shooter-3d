import { describe, it, expect } from 'vitest';
import { hudDetail, hudVisibility, abilityVisible, controlsHintVisible } from '../src/ui/HudDetail';
import { ToastQueue } from '../src/ui/ToastQueue';
import { findHudOverlaps } from '../src/ui/HudOverlap';
import { difficultyBalance, graphicsChoice, selectGraphics, BASIC_SETTINGS } from '../src/ui/SettingsModel';
import type { Settings } from '../src/ui/UI';
import { PHRASES } from '../src/i18n/phrases';

describe('HUD detail', () => {
  it('migrates missing/invalid saves to Standard', () => {
    expect(hudDetail()).toBe('standard'); expect(hudDetail('invalid')).toBe('standard');
    expect(hudVisibility().status).toBe(true); expect(hudVisibility().radar).toBe(false);
  });
  it('minimal suppresses every optional component for both flight roles', () => {
    expect(Object.values(hudVisibility('minimal')).every(v => !v)).toBe(true);
    expect(Object.values(hudVisibility('full')).every(Boolean)).toBe(true);
    expect(abilityVisible('minimal', true)).toBe(false);
    expect(abilityVisible('standard', false)).toBe(false);
    expect(abilityVisible('standard', true)).toBe(true);
    expect(abilityVisible('full', false)).toBe(true);
  });
  it('controls reminder is limited to the first two missions', () => {
    expect([0,1,2,3,100].map(controlsHintVisible)).toEqual([false,true,true,false,false]);
  });
});
describe('notification queue', () => {
  it('serializes bursts with at most 2.5 seconds visible per toast', () => {
    const q = new ToastQueue<string>(); q.push('a'); q.push('b');
    expect(q.update(0,false)).toBe('a'); expect(q.update(2.49,false)).toBe('a');
    expect(q.update(.02,false)).toBe(null); expect(q.update(.16,false)).toBe('b');
    expect(q.update(2.5,false)).toBe(null); expect(q.busy).toBe(false);
  });
  it('defers during heavy fire/minimal, including a toast already on screen', () => {
    const q = new ToastQueue<string>(); q.push('a'); q.push('b');
    expect(q.update(10,true)).toBe(null); expect(q.update(0,false)).toBe('a');
    q.update(1,false); expect(q.update(30,true)).toBe(null); expect(q.remaining).toBe(1.5);
    expect(q.update(0,false)).toBe('a'); expect(q.update(1.5,false)).toBe(null);
    expect(q.update(.2,false)).toBe('b');
  });
});
describe('layout checker', () => {
  const a = {id:'gun',left:10,top:10,right:60,bottom:40};
  it('accepts adjacent boxes and reports intersecting boxes and viewport escape', () => {
    expect(findHudOverlaps([a,{id:'radio',left:10,top:0,right:60,bottom:10}],1280,720)).toEqual([]);
    expect(findHudOverlaps([a,{id:'radio',left:20,top:20,right:80,bottom:50}],1280,720)).toEqual(['gun overlaps radio']);
    expect(findHudOverlaps([{...a,left:-2}],844,390)).toEqual(['gun: outside viewport']);
  });
});
describe('settings mapping', () => {
  it('preserves the existing difficulty balance knobs', () => {
    expect(difficultyBalance('recruit')).toEqual({enemy:.8,damage:.7,allies:1.2});
    expect(difficultyBalance('veteran')).toEqual({enemy:1,damage:1,allies:1});
    expect(difficultyBalance('ace')).toEqual({enemy:1.2,damage:1.3,allies:1});
  });
  it('Auto retains the measured quality; manual cancels pending detection', () => {
    const s = {quality:'ultra',gfxAuto:'pending',fov:72} as Settings;
    expect(graphicsChoice(s)).toBe('auto'); selectGraphics(s,'auto'); expect(s.quality).toBe('ultra');
    selectGraphics(s,'low'); expect(s.quality).toBe('low'); expect(s.gfxAuto).toBeUndefined();
    expect(s.graphicsMode).toBe('manual'); expect(s.fov).toBe(72);
    expect(BASIC_SETTINGS).toContain('voiceVolume'); expect(BASIC_SETTINGS).not.toContain('fov');
  });
  it('translates new controls and concise hints', () => {
    for(const s of ['Score {score} · Round {round}','HUD detail','Minimal','Standard','Full','Graphics','Auto','Advanced','Voice volume','Fire short bursts; watch the heat bar below.','Press 1–5 to change gun position.','Field upgrades last for this mission.','Heavy fighters: aim for the engines.','Boss ahead: keep steady bursts on target.']) expect(PHRASES[s],s).toMatch(/[\u0600-\u06ff]/);
  });
});
