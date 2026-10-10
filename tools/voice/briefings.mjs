#!/usr/bin/env node
// Copies every campaign briefing paragraph from src/game/Missions.ts into tools/voice/lines.json
// (role "briefing", id brief_<mission id>_<paragraph>), so the recorded briefings always read the
// text the briefing screen shows. Then render them with generate.py:
//
//   node --experimental-strip-types tools/voice/briefings.mjs && python3 tools/voice/generate.py
//
// The block is replaced and moved to the end of the "lines" array; other lines keep their order.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN } from '../../src/game/Missions.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, 'lines.json');
const MARK_GROUP = 'briefings (tools/voice/briefings.mjs)';

// How `say` should pronounce names and designations the briefings use (spoken text only;
// lines.json "spoken" substitutions apply on top of these)
const SAY = [
  [/Fw 190 A-8s/g, 'Focke-Wulf one-ninety A eights'], [/Fw 190s?/g, (s) => 'Focke-Wulf one-ninety' + (s.endsWith('s') ? 's' : '')],
  [/Bf 109/g, 'Messerschmitt one-oh-nine'], [/P-51D/g, 'P fifty-one D'], [/P-51s/g, 'P fifty-ones'], [/P-51/g, 'P fifty-one'],
  [/B-17G?/g, 'B seventeen'], [/I\.G\. Farben/g, 'I G Farben'], [/Jagdflieger/g, 'Yahkt-fleeger'], [/Sturmgruppe/g, 'Shtoorm-groopa'],
  [/Schweinfurt/g, 'Shvine-foort'], [/Ludwigshafen/g, 'Lood-vigs-hahfen'], [/Oschersleben/g, 'Oshers-layben'], [/Aachen/g, 'Ahken'],
  [/Regensburg/g, 'Ray-gens-boorg'], [/Kiel\b/g, 'Keel'],
];
const spoken = (t) => SAY.reduce((s, [rx, to]) => s.replace(rx, to), t);

const entries = [];
for (const m of CAMPAIGN) {
  m.briefing.forEach((text, i) => {
    const e = { id: `brief_${m.id}_${i + 1}`, role: 'briefing', text };
    const say = spoken(text);
    if (say !== text) e.say = say;
    entries.push(e);
  });
}

// Parse, drop the old briefing block (marker + role "briefing" lines) wherever it sits, append the fresh one
const data = JSON.parse(readFileSync(FILE, 'utf8'));
data.lines = data.lines.filter((l) => l.role !== 'briefing' && l.group !== MARK_GROUP);
data.lines.push({ group: MARK_GROUP }, ...entries);
writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
const words = entries.reduce((n, e) => n + e.text.split(/\s+/).length, 0);
console.log(`${entries.length} briefing paragraphs from ${CAMPAIGN.length} missions (${words} words) written to tools/voice/lines.json`);
