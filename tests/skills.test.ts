import { describe, it, expect, beforeEach } from 'vitest';
import {
  SKILLS, BRANCHES, SKILLS_KEY, TREE_COST, SkillBook, applySkills, careerXp, interceptVelocity, nextPointAt, respecCostFor,
  skillDefaults, skillPointsFor, type SkillId,
} from '../src/game/Skills';
import { RANKS } from '../src/game/Career';
import { Progression } from '../src/game/Upgrades';
import { stubStorage, type MemoryStorage } from './helpers';

let store: MemoryStorage;
beforeEach(() => { store = stubStorage(); });

const MAJOR = RANKS[RANKS.length - 1].xp;
const book = (...ids: SkillId[]) => { const b = new SkillBook(false); for (const id of ids) b.owned.add(id); return b; };

describe('tree shape', () => {
  it('has three branches of six nodes, each ending in one capstone', () => {
    expect(BRANCHES.map((b) => b.id)).toEqual(['marksman', 'gunnery', 'survivor']);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
    for (const b of BRANCHES) {
      const nodes = SKILLS.filter((s) => s.branch === b.id);
      expect(nodes.length).toBe(6);
      const caps = nodes.filter((s) => s.capstone);
      expect(caps.length).toBe(1);
      expect(caps[0].tier).toBe(3);
      // one root per branch, every prerequisite sits in the same branch one tier up
      expect(nodes.filter((s) => s.req.length === 0).length).toBe(1);
      for (const n of nodes) for (const r of n.req) {
        const p = SKILLS.find((s) => s.id === r)!;
        expect(p.branch).toBe(b.id);
        expect(p.tier).toBe(n.tier - 1);
      }
    }
    expect(TREE_COST).toBe(SKILLS.reduce((a, s) => a + s.cost, 0));
  });
});

describe('earning points', () => {
  it('gives two points per promotion', () => {
    expect(skillPointsFor(0)).toBe(0);
    expect(skillPointsFor(RANKS[1].xp - 1)).toBe(0);
    for (let i = 1; i < RANKS.length; i++) expect(skillPointsFor(RANKS[i].xp)).toBe(2 * i);
  });

  it('keeps paying one point per 3,000 XP after Major, forever', () => {
    expect(skillPointsFor(MAJOR)).toBe(10);
    expect(skillPointsFor(MAJOR + 2999)).toBe(10);
    expect(skillPointsFor(MAJOR + 3000)).toBe(11);
    expect(skillPointsFor(MAJOR + 30000)).toBe(20);
    expect(skillPointsFor(MAJOR + 3_000_000)).toBe(1010);
  });

  it('is robust to junk XP', () => {
    expect(skillPointsFor(-50)).toBe(0);
    expect(skillPointsFor(NaN)).toBe(0);
    expect(skillPointsFor(Infinity)).toBe(0);
  });

  it('knows when the next point arrives', () => {
    expect(nextPointAt(0)).toBe(RANKS[1].xp);
    expect(nextPointAt(RANKS[1].xp)).toBe(RANKS[2].xp);
    expect(nextPointAt(MAJOR)).toBe(MAJOR + 3000);
    expect(nextPointAt(MAJOR + 4000)).toBe(MAJOR + 6000);
    for (const x of [0, 1499, 1500, 30000, MAJOR, MAJOR + 7777]) {
      const n = nextPointAt(x);
      expect(skillPointsFor(n)).toBeGreaterThan(skillPointsFor(x));
      expect(skillPointsFor(n - 1)).toBe(skillPointsFor(x));
    }
  });

  it('reads career XP from the career save', () => {
    expect(careerXp()).toBe(0);
    store.setItem('sws3d.career.v1', JSON.stringify({ v: 1, xp: 12345 }));
    expect(careerXp()).toBe(12345);
    store.setItem('sws3d.career.v1', '{broken');
    expect(careerXp()).toBe(0);
  });
});

describe('prerequisites and buying', () => {
  it('starts with only the three roots unlocked', () => {
    const b = new SkillBook();
    const xp = RANKS[2].xp; // 4 points
    const open = SKILLS.filter((s) => b.state(s.id, xp) === 'available').map((s) => s.id);
    expect(open.sort()).toEqual(['discipline', 'plating', 'sight']);
    expect(b.state('steady', xp)).toBe('locked');
    expect(b.state('deadeye', xp)).toBe('locked');
  });

  it('needs points: no XP, no skills', () => {
    const b = new SkillBook();
    expect(b.state('sight', 0)).toBe('short');
    expect(b.buy('sight', 0)).toBe(false);
    expect(b.owned.size).toBe(0);
  });

  it('unlocks children once the parent is owned and spends the cost', () => {
    const b = new SkillBook();
    const xp = RANKS[3].xp; // 6 points
    expect(b.buy('steady', xp)).toBe(false);          // parent missing
    expect(b.buy('sight', xp)).toBe(true);
    expect(b.buy('sight', xp)).toBe(false);           // already owned
    expect(b.state('steady', xp)).toBe('available');
    expect(b.state('eagle', xp)).toBe('locked');
    expect(b.buy('steady', xp)).toBe(true);
    expect(b.buy('eagle', xp)).toBe(true);            // costs 2
    expect(b.spent()).toBe(4);
    expect(b.available(xp)).toBe(2);
    expect(b.state('deadeye', xp)).toBe('short');     // unlocked, but costs 3
    expect(b.buy('deadeye', xp)).toBe(false);
    expect(b.buy('deadeye', RANKS[4].xp)).toBe(true); // 8 points: 4 spent + 3
  });

  it('capstones need any one of their two parents', () => {
    const b = book('plating', 'damageCtl');
    expect(b.prereqMet('fortress')).toBe(false);
    b.owned.add('fireDrill');
    expect(b.prereqMet('fortress')).toBe(true);
    const c = book('plating', 'vests', 'secondWind');
    expect(c.prereqMet('fortress')).toBe(true);
  });

  it('persists under sws3d.skills.v1 and prunes broken saves', () => {
    const b = new SkillBook();
    const xp = MAJOR;
    b.buy('discipline', xp); b.buy('odDrill', xp);
    const saved = JSON.parse(store.getItem(SKILLS_KEY)!);
    expect(saved.owned.sort()).toEqual(['discipline', 'odDrill']);
    expect([...new SkillBook().owned].sort()).toEqual(['discipline', 'odDrill']);
    // unknown ids are dropped, orphans (parent missing) are pruned down the chain
    store.setItem(SKILLS_KEY, JSON.stringify({ v: 1, owned: ['bogus', 'steady', 'eagle', 'deadeye', 'plating'] }));
    expect([...new SkillBook().owned]).toEqual(['plating']);
    store.setItem(SKILLS_KEY, 'not json');
    expect(new SkillBook().owned.size).toBe(0);
  });
});

describe('respec', () => {
  it('costs merit, refunds every point and is saved', () => {
    const p = new Progression();
    const xp = RANKS[3].xp;
    p.skills.buy('plating', xp); p.skills.buy('vests', xp); p.skills.buy('secondWind', xp);
    expect(p.skills.spent()).toBe(4);
    const cost = p.skills.respecCost();
    expect(cost).toBe(respecCostFor(4));
    expect(cost).toBe(650);
    p.points = cost - 1;
    expect(p.skills.respec(p)).toBe(false);
    expect(p.skills.spent()).toBe(4);
    p.points = cost + 100;
    expect(p.skills.respec(p)).toBe(true);
    expect(p.points).toBe(100);
    expect(p.skills.spent()).toBe(0);
    expect(p.skills.available(xp)).toBe(6);
    expect(p.skills.respecs).toBe(1);
    // both the merit and the empty book survive a reload
    const q = new Progression();
    expect(q.points).toBe(100);
    expect(q.skills.owned.size).toBe(0);
  });

  it('is free of charge (and refused) with nothing to refund', () => {
    const p = new Progression();
    p.points = 5000;
    expect(p.skills.respecCost()).toBe(0);
    expect(p.skills.respec(p)).toBe(false);
    expect(p.points).toBe(5000);
  });
});

describe('loadout effects', () => {
  it('a fresh book leaves the loadout neutral and the old save format untouched', () => {
    store.setItem('sws3d.armory.v1', JSON.stringify({ points: 700, levels: { firepower: 2 }, unlocked: ['m2'] }));
    const p = new Progression();
    const l = p.loadout();
    expect(l).toMatchObject({ ...skillDefaults(), rate: 1, heat: 1, armor: 1, hitScale: 1, spread: 1, assist: 1 });
    expect(l.damage).toBeCloseTo(1.24, 6);
    p.save();
    const saved = JSON.parse(store.getItem('sws3d.armory.v1')!);
    expect(Object.keys(saved).sort()).toEqual(['aircraft', 'bomber', 'levels', 'mods', 'points', 'unlocked', 'weapon']);
  });

  it('folds every branch into Progression.loadout()', () => {
    const p = new Progression();
    for (const s of SKILLS) p.skills.owned.add(s.id);
    const l = p.loadout();
    expect(l.leadVel).toBeCloseTo(870, 6);             // M2, no velocity upgrades
    expect(l.hitScale).toBeCloseTo(1.06 * 1.12, 6);
    expect(l.assist).toBeCloseTo(1.3, 6);
    expect(l.critMult).toBeCloseTo(1.3, 6);
    expect(l.spread).toBeCloseTo(0.8, 6);
    expect(l.bossBreach).toBe(true);
    expect(l.deadeye).toBe(10);
    expect(l.heat).toBeCloseTo(0.85, 6);
    expect(l.rate).toBeCloseTo(1.08, 6);
    expect(l.overdriveDur).toBeCloseTo(1.4, 6);
    expect(l.cooldownMult).toBeCloseTo(0.8, 6);
    expect(l.focusDur).toBeCloseTo(1.5, 6);
    expect(l.ironLungs).toBe(true);
    expect(l.armor).toBeCloseTo(0.9, 6);
    expect(l.crewWound).toBeCloseTo(0.6, 6);
    expect(l.repairMult).toBeCloseTo(1.5, 6);
    expect(l.regen).toBeGreaterThan(0);
    expect(l.secondWind).toBeCloseTo(0.4, 6);
    expect(l.extinguish).toBeCloseTo(0.95, 6);
    expect(l.bottles).toBe(2);
    expect(l.fortress).toBe(true);
  });

  it('stacks with upgrades, perks and the weapon', () => {
    const p = new Progression();
    p.levels.velocity = 5; p.levels.armor = 2; p.levels.cooling = 1;
    p.perks = ['hotloads', 'medic'];
    p.skills.owned.add('sight'); p.skills.owned.add('plating'); p.skills.owned.add('discipline'); p.skills.owned.add('damageCtl');
    const l = p.loadout();
    expect(l.leadVel).toBeCloseTo(870 * 1.3 * 1.12, 4);  // the pip follows the real muzzle velocity
    expect(l.armor).toBeCloseTo((1 - 0.16) * 0.9, 6);
    expect(l.heat).toBeCloseTo(0.88 * 0.85, 6);
    expect(l.killRepair).toBeCloseTo(0.05 * 1.5, 6);
    p.role = 'pilot';
    expect(p.loadout().leadVel).toBeCloseTo(880 * 1.3 * 1.12, 4);
  });

  it('applySkills only touches what is owned', () => {
    const base = new Progression().loadout();
    const l = applySkills({ ...base }, new Set<SkillId>(['buffer']));
    expect(l.rate).toBeCloseTo(base.rate * 1.08, 6);
    expect({ ...l, rate: base.rate }).toEqual(base);
  });
});

describe('Deadeye intercept', () => {
  // The Ballistics integrator (gravity, then drag, then move) at 60 fps; like Ballistics, each
  // frame's step is tested as a segment in the target's frame. Returns the closest pass.
  function fly(pos: number[], vel: number[], tpos: number[], tvel: number[], dt = 1 / 60) {
    const p = [...pos], v = [...vel], t = [...tpos];
    let best = Infinity;
    for (let i = 0; i < 2.6 / dt; i++) {
      const r0 = [p[0] - t[0], p[1] - t[1], p[2] - t[2]];
      v[1] -= 9.81 * dt;
      const k = Math.exp(-0.12 * dt);
      v[0] *= k; v[1] *= k; v[2] *= k;
      for (let j = 0; j < 3; j++) { p[j] += v[j] * dt; t[j] += tvel[j] * dt; }
      const d = [p[0] - t[0] - r0[0], p[1] - t[1] - r0[1], p[2] - t[2] - r0[2]];
      const u = Math.max(0, Math.min(1, -(r0[0] * d[0] + r0[1] * d[1] + r0[2] * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2])));
      best = Math.min(best, Math.hypot(r0[0] + d[0] * u, r0[1] + d[1] * u, r0[2] + d[2] * u));
    }
    return best;
  }

  it('puts the round on a crossing fighter at combat range', () => {
    const cases = [
      { pos: [0, 0, 0], svel: [0, 0, 120], tpos: [300, 80, 500], tvel: [-140, 10, 60] },
      { pos: [0, 4000, 0], svel: [0, 0, 120], tpos: [-200, 4100, -900], tvel: [60, -30, 220] },
      { pos: [10, 3000, 10], svel: [150, 0, 0], tpos: [1100, 3000, 300], tvel: [-180, 0, 40] },
    ];
    for (const c of cases) {
      const v = interceptVelocity({ x: c.pos[0], y: c.pos[1], z: c.pos[2] }, { x: c.svel[0], y: c.svel[1], z: c.svel[2] }, 870,
        { x: c.tpos[0], y: c.tpos[1], z: c.tpos[2] }, { x: c.tvel[0], y: c.tvel[1], z: c.tvel[2] })!;
      expect(v).not.toBeNull();
      // still a real round: muzzle speed relative to the gun
      expect(Math.hypot(v.x - c.svel[0], v.y - c.svel[1], v.z - c.svel[2])).toBeCloseTo(870, 0);
      // fighters' hit zones are metres wide: the round passes within one of the aim point
      expect(fly(c.pos, [v.x, v.y, v.z], c.tpos, c.tvel)).toBeLessThan(1.5);
    }
  });

  it('gives up out of range', () => {
    expect(interceptVelocity({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 870, { x: 0, y: 0, z: 6000 }, { x: 0, y: 0, z: 200 })).toBeNull();
  });
});
