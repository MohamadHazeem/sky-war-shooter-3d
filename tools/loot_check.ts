// Logic check for loot crates, weapon mods and saved-data compatibility (no browser needed):
//   npx esbuild tools/loot_check.ts --bundle --platform=node --format=esm --outfile=/tmp/loot_check.mjs && node /tmp/loot_check.mjs
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
// an old save, from before crates existed
store['sws3d.armory.v1'] = JSON.stringify({ points: 1234, levels: { firepower: 2, belts: 1 }, unlocked: ['stinger'], weapon: { gunner: 'stinger', pilot: 'p6x50' }, aircraft: { gunner: 'b17g', pilot: 'p51d' } });

const { Progression } = await import('../src/game/Upgrades');
const Loot = await import('../src/game/Loot');
const C = await import('../src/game/Customize');

const assert = (c: unknown, m: string) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const p = new Progression();
assert(p.points === 1234 && p.levels.firepower === 2 && p.levels.velocity === 1, 'old save loads');
assert(p.bomber.name === 'Sky Queen' && p.bomber.paint === 'olive' && Object.keys(p.mods).length === 0, 'new fields default');
assert(C.bomberName() === 'Sky Queen', 'default bomber name');
const base = p.loadout();
p.unlocked.add('mod:polished'); p.mods.stinger = 'polished';
const l = p.loadout();
assert(Math.abs(l.rate / base.rate - 1.05) < 1e-9, 'mod folds into loadout (+5% rate)');
p.bomber.name = 'Flak Magnet'; p.save();
const p2 = new Progression();
assert(p2.mods.stinger === 'polished' && p2.bomber.name === 'Flak Magnet', 'mods + bomber persist');
assert(C.withName('The Sky Queen was shot down.') === 'The Flak Magnet was shot down.', 'withName');
assert(C.cleanName('  <b>Hi</b>   there ') === 'bHi/b there', 'cleanName strips tags');

assert(Loot.crateGrade({ kills: 1, merit: 300, round: 1 }) === 'common', 'grade common');
assert(Loot.crateGrade({ kills: 5, merit: 900, round: 1 }) === 'rare', 'grade rare');
assert(Loot.crateGrade({ kills: 8, merit: 1500, round: 1 }) === 'epic', 'grade epic');
assert(Loot.crateGrade({ kills: 12, merit: 3000, round: 1 }) === 'legendary', 'grade legendary');

// roll lots of crates: everything eventually unlocks, then duplicates pay merit
const counts: Record<string, number> = {};
const q = new Progression();
q.perks = [];
for (let i = 0; i < 400; i++) {
  const it = Loot.rollCrate(q, (['common', 'rare', 'epic', 'legendary'] as const)[i % 4]);
  counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  if (!it.title || !it.desc) { assert(false, 'item has text ' + JSON.stringify(it)); break; }
}
console.log(counts);
const have = C.COLLECTABLES.filter((c) => C.owns(q, c.key)).length;
assert(have === C.COLLECTABLES.length, `all collectables found after 400 crates (${have}/${C.COLLECTABLES.length})`);
assert(!q.perks.includes('repair'), 'no Field Repairs from crates');
Loot.queueCrate(q, { kills: 3, merit: 100, round: 2 });
const pend = Loot.takePendingCrate();
assert(pend && pend.round === 2 && Loot.takePendingCrate() === null, 'pending crate handed over once');
