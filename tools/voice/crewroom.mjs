#!/usr/bin/env node
// Copies every recorded crew-room line from src/game/CrewRoom.ts (the interludes between story
// missions) into tools/voice/lines.json, so the clips always speak the text the scene shows.
// Then render them with generate.py:
//
//   node --experimental-strip-types tools/voice/crewroom.mjs && python3 tools/voice/generate.py
//
// The block (group "crew room (tools/voice/crewroom.mjs)") is replaced in place, just before the
// briefings group; other lines keep their order. Lines are left out of src/audio/voiceLines.ts
// (`noTable`): the scene finds them by text, game code never names them.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
// Node's type stripper needs extensions on the game modules' transitive imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier))
      return nextResolve(specifier + '.ts', context);
    throw error;
  }
}});
const { recordedLines, VAR_VALUES, SPEAKER_RATE } = await import('../../src/game/CrewRoom.ts');

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'lines.json');
const MARK_GROUP = 'crew room (tools/voice/crewroom.mjs)';
const BRIEF_GROUP = 'briefings (tools/voice/briefings.mjs)';

// How `say` should pronounce the place names and the Experten (spoken text only)
const SAY = [
  [/Schweinfurt/g, 'Shvine-foort'], [/Kiel\b/g, 'Keel'], [/Leipzig/g, 'Lipe-zig'], [/Regensburg/g, 'Ray-gens-boorg'],
  [/Brückner/g, 'Brook-ner'], [/Eckhardt/g, 'Eck-hart'], [/Gebhardt/g, 'Gep-hart'], [/Neumeyer/g, 'Noy-my-er'], [/Reuter/g, 'Roy-ter'],
  [/Sauer/g, 'Sour'], [/Pfeiffer/g, 'Fifer'], [/Thalberg/g, 'Tahl-berg'], [/Vossberg/g, 'Foss-berg'], [/Wendt/g, 'Vent'], [/Zeller/g, 'Tseller'],
  [/Winterfeld/g, 'Vinter-felt'], [/Riedel/g, 'Reedel'], [/Stahl/g, 'Shtahl'], [/Kaltenbach/g, 'Kalten-bahk'],
  [/armourers/g, 'armorers'], [/honour/g, 'honor'],
];
const spoken = (t) => SAY.reduce((s, [rx, to]) => s.replace(rx, to), t);

const entries = [];
for (const { def, roles } of recordedLines()) {
  const e = { id: def.id };
  if (roles.length === 1) e.role = roles[0]; else e.roles = roles;
  e.text = def.text;
  if (def.key) e.vars = { [def.key]: VAR_VALUES[def.key] };
  const say = spoken(def.say ?? def.text);
  if (say !== def.text) e.say = say;
  // one voice for both waist gunners: Price drawls, Walsh is quick (a single-role waist line only)
  if (roles.length === 1 && SPEAKER_RATE[def.who]) e.rate = SPEAKER_RATE[def.who];
  e.noTable = true;
  entries.push(e);
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
const previousAt = data.lines.findIndex(l => l.group === MARK_GROUP);
data.lines = data.lines.filter((l) => l.group !== MARK_GROUP && !(typeof l.id === 'string' && l.id.startsWith('cr_')));
let at = previousAt >= 0 ? previousAt : data.lines.findIndex((l) => l.group === BRIEF_GROUP);
if (at < 0) at = data.lines.length;
data.lines.splice(at, 0, { group: MARK_GROUP }, ...entries);
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
const clips = entries.reduce((n, e) => n + (e.vars ? Object.values(e.vars)[0].length : 1) * (e.roles ? e.roles.length : 1), 0);
console.log(`${entries.length} crew-room lines (${clips} clips) written to tools/voice/lines.json`);
