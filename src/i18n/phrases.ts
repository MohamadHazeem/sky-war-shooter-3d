// Arabic phrase tables, keyed by the exact English text shown by the game.
// One file per area under ./ar/ so they can be maintained independently.
import type { PhraseTable, Pattern } from './types';
import missions from './ar/missions';
import radio from './ar/radio';
import game from './ar/game';
import loadout from './ar/loadout';
import career from './ar/career';
import combat from './ar/combat';
import misc from './ar/misc';
import pilot from './ar/pilot';
import raid from './ar/raid';
import campaign from './ar/campaign';
import skills from './ar/skills';
import battle from './ar/battle';
import theatre from './ar/theatre';
import aircraft from './ar/aircraft';
import nemesis from './ar/nemesis';

const TABLES: PhraseTable[] = [missions, radio, game, loadout, career, combat, misc, pilot, raid, campaign, skills, battle, theatre, aircraft, nemesis];

export const PHRASES: Record<string, string> = Object.assign({}, ...TABLES.map((t) => t.phrases));
export const PATTERNS: Pattern[] = TABLES.flatMap((t) => t.patterns ?? []);
