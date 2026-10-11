import crewRoles from './ar/crewRoles';
import secondTour from './ar/secondTour';
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
import coop from './ar/coop';
import hud from './ar/hud';
import specials from './ar/specials';
import nemesis from './ar/nemesis';
import strafe from './ar/strafe';
import bookends from './ar/bookends';
import extras from './ar/extras';
import setpieces from './ar/setpieces';
import crewroom from './ar/crewroom';
import manual from './ar/manual';

// manual first: its generic words (Low, Close, Zoom...) never override another screen's wording
const TABLES: PhraseTable[] = [secondTour, manual, missions, radio, game, loadout, career, combat, misc, pilot, raid, campaign, skills, battle, theatre, aircraft, coop, hud, specials, nemesis, strafe, bookends, extras, setpieces, crewroom, crewRoles];

export const PHRASES: Record<string, string> = Object.assign({}, ...TABLES.map((t) => t.phrases));
export const PATTERNS: Pattern[] = TABLES.flatMap((t) => t.patterns ?? []);
