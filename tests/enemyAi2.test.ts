import { describe, it, expect } from 'vitest';
import {
  ENVELOPES, envelope, energyHeight, zoomGain, energyPlan, envelopeThrottle,
  chooseApproach, approachScores, STATION_OF, type TargetState, type Attacker,
  updatePressure, evasionThreshold, reactionTime, pickEvasion,
  woundedChoice, limpThrottle, decisionQuality, acePersona, ACE_STYLE, SIGNATURES, SIGNATURE_IDS,
  wingSlot, staggerDelay, schwarmChance, mulberry32, WEAK_CALL, AI_CALLS, randomPersonality,
} from '../src/world/PilotMind';
import { ENEMY_VARIANTS, type EnemyType } from '../src/world/EnemyTypes';
import { FlightModel } from '../src/world/FlightModel';
import { steerTo } from '../src/world/AI';
import { TRAIT_IDS } from '../src/game/Nemesis';
import { VOICE_LINES } from '../src/audio/voiceLines';
import { PHRASES } from '../src/i18n/phrases';
import * as THREE from 'three';

const clean: TargetState = { straggler: false, engineOut: [0, 0], weak: {} };
const freq = (t: TargetState, a: Attacker, n = 4000, seed = 7) => {
  const rng = mulberry32(seed), out: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const p = chooseApproach(t, a, rng); out[p.approach] = (out[p.approach] ?? 0) + 1 / n; }
  return out;
};

describe('energy model: envelopes from the flight model', () => {
  it('orders the speeds sensibly for every enemy type', () => {
    for (const t of Object.keys(ENEMY_VARIANTS) as EnemyType[]) {
      const e = ENVELOPES[t];
      expect(e.vStall).toBeGreaterThan(30);
      expect(e.vStall).toBeLessThan(e.vCorner);
      expect(e.vCorner).toBeLessThan(e.vMax);
      expect(e.vMax).toBeLessThan(e.vDive);
    }
    // jets and rockets are much faster than the piston fighters; the heavies turn worse
    expect(ENVELOPES.me262.vMax).toBeGreaterThan(ENVELOPES.fw190.vMax * 1.25);
    expect(ENVELOPES.me163.vMax).toBeGreaterThan(ENVELOPES.me262.vMax);
    expect(ENVELOPES.ju88.vCorner).toBeLessThan(ENVELOPES.fw190.vCorner);
    expect(envelope('nonsense')).toBe(ENVELOPES.fw190);
  });

  it('matches the real flight model: a Fw 190 at full power levels out near vMax', () => {
    const e = ENVELOPES.fw190;
    const fm = new FlightModel(ENEMY_VARIANTS.fw190.params, new THREE.Vector3(0, 7600, 0), new THREE.Quaternion());
    fm.vel.set(0, 0, 150); fm.throttle = 1;
    const level = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 60 * 90; i++) { steerTo(fm, level); fm.throttle = 1; fm.step(1 / 60); }
    expect(fm.speed).toBeGreaterThan(e.vMax * 0.8);
    expect(fm.speed).toBeLessThan(e.vMax * 1.05);
  });

  it('energy height trades speed for height; a zoom gains what the speed is worth', () => {
    expect(energyHeight(7000, 0)).toBe(7000);
    expect(energyHeight(7000, 140)).toBeCloseTo(7000 + 140 * 140 / 19.62, 6);
    const e = ENVELOPES.fw190;
    expect(zoomGain(e, e.vCorner * 0.9)).toBe(0);
    expect(zoomGain(e, 220)).toBeGreaterThan(zoomGain(e, 180));
  });

  it('plans after a pass: extend when slow, zoom when fast and low, dive with height to spare', () => {
    const e = ENVELOPES.fw190, ref = { alt: 7600, speed: 75 };
    expect(energyPlan(e, { alt: 7600, speed: e.vCorner * 0.7 }, ref, 0.8, 'cunning')).toBe('extend');
    expect(energyPlan(e, { alt: 7650, speed: e.vCorner * 1.3 }, ref, 0.8, 'cunning')).toBe('zoom');
    expect(energyPlan(e, { alt: 8800, speed: e.vCorner }, ref, 0.8, 'cunning')).toBe('dive');
    expect(energyPlan(e, { alt: 8000, speed: e.vCorner }, ref, 0.8, 'aggressive')).toBe('reattack');
    expect(energyPlan(e, { alt: 7700, speed: e.vCorner }, ref, 0.8, 'cautious')).toBe('zoom');
  });

  it('rookies turn straight back in; aces never come back slow', () => {
    const e = ENVELOPES.bf109, ref = { alt: 7600, speed: 75 }, slow = { alt: 7600, speed: e.vCorner * 0.75 };
    expect(energyPlan(e, slow, ref, 0.2, 'aggressive')).toBe('reattack');
    for (const p of ['aggressive', 'cunning', 'cautious'] as const) expect(energyPlan(e, slow, ref, 0.9, p)).toBe('extend');
  });

  it('jets never turn with the bombers: extend, zoom or dive, never a slow re-attack', () => {
    const e = ENVELOPES.me262, ref = { alt: 7600, speed: 75 };
    for (let s = 60; s < 300; s += 20) for (const alt of [7000, 7600, 8500]) for (const q of [0.1, 0.5, 0.9]) {
      expect(energyPlan(e, { alt, speed: s }, ref, q, 'aggressive')).not.toBe('reattack');
    }
  });

  it('keeps every type inside its envelope: no power past the dive limit, full power when slow', () => {
    for (const t of Object.keys(ENVELOPES) as EnemyType[]) {
      const e = ENVELOPES[t];
      expect(envelopeThrottle(e, e.vDive * 0.95, 1)).toBeLessThanOrEqual(0.15);
      expect(envelopeThrottle(e, e.vDive * 0.88, 1)).toBeLessThanOrEqual(0.5);
      expect(envelopeThrottle(e, e.vStall * 1.1, 0.3)).toBe(1);
      expect(envelopeThrottle(e, e.vCorner, 0.7)).toBe(0.7);
    }
  });
});

describe('attack selection: geometry per target weakness', () => {
  const ace: Attacker = { role: 'turner', personality: 'cunning', q: 0.95 };

  it('a good pilot goes for the sector a silent gun leaves open', () => {
    expect(freq({ ...clean, weak: { tail: 1 } }, ace).stern).toBeGreaterThan(0.8);
    expect(freq({ ...clean, weak: { waistL: 1 } }, ace).beamL).toBeGreaterThan(0.8);
    expect(freq({ ...clean, weak: { ball: 1 } }, ace).low).toBeGreaterThan(0.8);
    const pick = chooseApproach({ ...clean, weak: { waistR: 1 } }, ace, mulberry32(1));
    expect(pick.approach).toBe('beamR');
    expect(pick.reason).toBe('deadGun');
    expect(STATION_OF[pick.approach]).toBe('waistR');
  });

  it('attacks from the side of a dead engine and from astern on a straggler', () => {
    const left = approachScores({ ...clean, engineOut: [2, 0] }, ace);
    const s = (ap: string) => left.find((x) => x.approach === ap)!.score;
    expect(s('beamL')).toBeGreaterThan(s('beamR'));
    expect(left.find((x) => x.approach === 'beamL')!.reason).toBe('engine');
    const strag = approachScores({ ...clean, straggler: true }, { ...ace, personality: 'aggressive' });
    expect(strag.find((x) => x.approach === 'stern')!.score).toBeGreaterThan(approachScores(clean, { ...ace, personality: 'aggressive' }).find((x) => x.approach === 'stern')!.score);
  });

  it('types fly to their strengths: Fw 190s head-on, jets from astern / below, never head-on', () => {
    const fw = freq(clean, { role: 'turner', personality: 'aggressive', q: 0.95 });
    expect(fw.headon).toBeGreaterThan(0.5);
    const jet = freq(clean, { role: 'slasher', personality: 'cautious', q: 0.95 });
    expect((jet.stern ?? 0) + (jet.low ?? 0) + (jet.high ?? 0)).toBeGreaterThan(0.95);
    expect(jet.headon ?? 0).toBeLessThan(0.02);
  });

  it('difficulty scales decision quality: rookies rarely find the weak spot', () => {
    const weak: TargetState = { ...clean, weak: { tail: 1 } };
    const rookie = freq(weak, { ...ace, q: 0.2 }).stern;
    const vet = freq(weak, { ...ace, q: 0.55 }).stern;
    const expert = freq(weak, { ...ace, q: 0.95 }).stern;
    expect(rookie).toBeLessThan(vet);
    expect(vet).toBeLessThan(expert);
    expect(rookie).toBeLessThan(0.5);
  });

  it('is deterministic for a given seed', () => {
    const a = Array.from({ length: 50 }, (_, i) => chooseApproach(clean, { ...ace, q: 0.4 }, mulberry32(i)).approach);
    const b = Array.from({ length: 50 }, (_, i) => chooseApproach(clean, { ...ace, q: 0.4 }, mulberry32(i)).approach);
    expect(a).toEqual(b);
  });
});

describe('evasion triggers', () => {
  it('pressure builds with close rounds and hits, and fades within seconds', () => {
    let p = 0;
    for (let i = 0; i < 60; i++) p = updatePressure(p, 0.25 * 3, false, 1 / 60);
    expect(p).toBeGreaterThan(10);
    p = updatePressure(p, 0, true, 1 / 60);
    const peak = p;
    for (let i = 0; i < 180; i++) p = updatePressure(p, 0, false, 1 / 60);
    expect(p).toBeLessThan(peak * 0.06);
  });

  it('cautious pilots react to less fire than aggressive ones; better pilots read the tracers sooner', () => {
    expect(evasionThreshold('cautious', 0.5)).toBeLessThan(evasionThreshold('cunning', 0.5));
    expect(evasionThreshold('cunning', 0.5)).toBeLessThan(evasionThreshold('aggressive', 0.5));
    expect(evasionThreshold('cunning', 0.9)).toBeLessThan(evasionThreshold('cunning', 0.2));
    expect(reactionTime(0.9)).toBeLessThan(reactionTime(0.2));
  });

  it('picks jinks, breaks and split-S by personality, and never a split-S without room below', () => {
    const env = ENVELOPES.fw190, rng = mulberry32(3);
    const count = (personality: 'aggressive' | 'cunning' | 'cautious', q: number, alt = 7600) => {
      const c = { jink: 0, break: 0, splitS: 0 };
      for (let i = 0; i < 2000; i++) c[pickEvasion({ personality, q, alt, floor: 5600, speed: 160, env, dist: 500 }, rng)]++;
      return c;
    };
    const ag = count('aggressive', 0.8), ca = count('cautious', 0.8), ro = count('cunning', 0.2);
    expect(ag.jink).toBeGreaterThan(ag.break * 2);
    expect(ag.splitS).toBe(0);
    expect(ca.break + ca.splitS).toBeGreaterThan(ca.jink * 3);
    expect(ca.splitS).toBeGreaterThan(0);
    expect(ro.break).toBeGreaterThan(ro.jink);
    expect(count('cautious', 0.8, 6200).splitS).toBe(0);
  });
});

describe('wounded aircraft', () => {
  it('cautious pilots limp home early, aggressive ones press on for one more pass', () => {
    expect(woundedChoice(0.35, 1, 'cautious', false)).toBe('limp');
    expect(woundedChoice(0.35, 1, 'cunning', false)).toBe('fight');
    expect(woundedChoice(0.25, 1, 'cunning', false)).toBe('limp');
    expect(woundedChoice(0.18, 1, 'aggressive', false)).toBe('press');
    expect(woundedChoice(0.18, 1, 'aggressive', true)).toBe('limp');
    expect(woundedChoice(0.08, 1, 'aggressive', false)).toBe('limp');
    expect(woundedChoice(0.7, 0.15, 'cautious', false)).toBe('limp');
    expect(woundedChoice(0.7, 0.15, 'aggressive', false)).toBe('fight');
    expect(woundedChoice(0.7, 0.15, 'cunning', false)).toBe('fight');
    expect(limpThrottle(0)).toBeLessThan(limpThrottle(1));
  });
});

describe('personas, aces and difficulty', () => {
  it('maps the difficulty settings onto decision quality', () => {
    const r = decisionQuality(0.8, 0.88), v = decisionQuality(1, 1.1), a = decisionQuality(1.2, 1.32);
    expect(r).toBeLessThan(0.35);
    expect(v).toBeGreaterThan(0.45); expect(v).toBeLessThan(0.65);
    expect(a).toBeGreaterThan(0.75);
    expect(decisionQuality(1, 1.1, true)).toBeGreaterThan(v);
  });

  it('gives each Experte a fixed personality and signature from his trait and id', () => {
    for (const t of TRAIT_IDS) {
      expect(ACE_STYLE[t]).toBeTruthy();
      const p = acePersona(t, 'a17', 0.9);
      expect(p).toEqual(acePersona(t, 'a17', 0.9));
      expect(ACE_STYLE[t].signatures).toContain(p.signature);
      expect(p.ace).toBe(true);
    }
    const sigs = new Set(Array.from({ length: 40 }, (_, i) => acePersona('headon', 'a' + i, 1).signature));
    expect(sigs.size).toBe(2);
  });

  it('mixes personalities by type', () => {
    const rng = mulberry32(5);
    const n = { aggressive: 0, cunning: 0, cautious: 0 };
    for (let i = 0; i < 3000; i++) n[randomPersonality('fw190', rng)]++;
    expect(n.aggressive).toBeGreaterThan(n.cautious);
    const m = { aggressive: 0, cunning: 0, cautious: 0 };
    for (let i = 0; i < 3000; i++) m[randomPersonality('me262', rng)]++;
    expect(m.cautious).toBeGreaterThan(m.aggressive);
  });
});

describe('Schwarm coordination', () => {
  it('stacks wingmen behind and above, alternating sides, with tighter timing in better units', () => {
    const s1 = wingSlot(1, { x: 0, y: 0, z: 0 }), s2 = wingSlot(2, { x: 0, y: 0, z: 0 }), s3 = wingSlot(3, { x: 0, y: 0, z: 0 });
    expect(Math.sign(s1.x)).toBe(-Math.sign(s2.x));
    expect(s1.z).toBeLessThan(0); expect(s3.z).toBeLessThan(s1.z);
    expect(s2.y).toBeGreaterThan(s1.y);
    expect(staggerDelay(0, 0.5)).toBe(0);
    expect(staggerDelay(1, 0.9)).toBeLessThan(staggerDelay(1, 0.2));
    expect(staggerDelay(2, 0.5)).toBeCloseTo(2 * staggerDelay(1, 0.5), 9);
    expect(staggerDelay(1, 1)).toBeGreaterThanOrEqual(1.5);   // never a blur: the gunner sees each pass
    expect(schwarmChance(0.9)).toBeGreaterThan(schwarmChance(0.2));
  });
});

describe('crew calls', () => {
  const texts: string[] = [
    ...Object.values(WEAK_CALL), ...Object.values(AI_CALLS).map((c) => c[1]),
    ...SIGNATURE_IDS.flatMap((s) => [SIGNATURES[s].learn[1], SIGNATURES[s].know[1]]),
  ];
  it('every new call is recorded and has Arabic', () => {
    const recorded = new Set<string>(Object.values(VOICE_LINES).map((l) => l.text));
    for (const t of texts) {
      expect(recorded.has(t), t).toBe(true);
      expect(PHRASES[t], t).toBeTruthy();
    }
    for (const s of SIGNATURE_IDS) expect(PHRASES[SIGNATURES[s].label], s).toBeTruthy();
  });
});
