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
import aircraft from './ar/aircraft';

const TABLES: PhraseTable[] = [missions, radio, game, loadout, career, combat, misc, pilot, aircraft];

export const PHRASES: Record<string, string> = Object.assign({}, ...TABLES.map((t) => t.phrases));
export const PATTERNS: Pattern[] = TABLES.flatMap((t) => t.patterns ?? []);
