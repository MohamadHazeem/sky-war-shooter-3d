import strategic from './ar/strategic';
import escorts from './ar/escorts';
import mastery from './ar/mastery';
import touchGunner from './ar/touchGunner';
import crewDecisions from './ar/crewDecisions';
import coopLobbies from './ar/coopLobbies';
import spatialAudio from './ar/spatialAudio';
import score from './ar/score';
import crewStories from './ar/crewStories';
import seasons from './ar/seasons';
import limpingHome from './ar/limpingHome';
import renderer from './ar/renderer';
import formation from './ar/formation';
import bombRun from './ar/bombRun';
import deepPenetration from './ar/deepPenetration';
import b17Damage from './ar/b17Damage';
import gunnerSurvival from './ar/gunnerSurvival';
import luftwaffe from './ar/luftwaffe';
import enemyAi from './ar/enemyAi';
import soundscape from './ar/soundscape';
import cleanHud from './ar/cleanHud';
import menu from './ar/menu';
import weather from './ar/weather';
import aa from './ar/aa';
import crewRoles from './ar/crewRoles';
import squadron from './ar/squadron';
import secondTour from './ar/secondTour';
import cinema from './ar/cinema';
import replayStudio from './ar/replayStudio';
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
import bombardier from './ar/bombardier';
import manual from './ar/manual';
import ditching from './ar/ditching';
import sea from './ar/sea';

// manual first: its generic words (Low, Close, Zoom...) never override another screen's wording
const TABLES: PhraseTable[] = [limpingHome, strategic, escorts, replayStudio, mastery, touchGunner, crewDecisions, coopLobbies, spatialAudio, score, crewStories, seasons, renderer, cinema, b17Damage, deepPenetration, bombRun, formation, soundscape, luftwaffe, enemyAi, gunnerSurvival, cleanHud, menu, weather, aa, sea, ditching, squadron, secondTour, manual, missions, radio, game, loadout, career, combat, misc, pilot, raid, campaign, skills, battle, theatre, aircraft, coop, hud, specials, nemesis, strafe, bookends, extras, setpieces, crewroom, crewRoles, bombardier];

// Any ./ar/*.ts table not listed above is picked up automatically and goes FIRST (lowest
// precedence), like a newly prepended table: a new goal only adds its file, no edit here.
export function withDiscovered(explicit: PhraseTable[], modules: Record<string, { default?: unknown }>): PhraseTable[] {
  const known = new Set<unknown>(explicit);
  const found = Object.keys(modules).sort().map((k) => modules[k].default)
    .filter((t): t is PhraseTable => !!t && typeof t === 'object' && 'phrases' in t && !known.has(t));
  return [...found, ...explicit];
}

export const ALL_TABLES = withDiscovered(TABLES, import.meta.glob<{ default?: unknown }>('./ar/*.ts', { eager: true }));
export const PHRASES: Record<string, string> = Object.assign({}, ...ALL_TABLES.map((t) => t.phrases));
export const PATTERNS: Pattern[] = ALL_TABLES.flatMap((t) => t.patterns ?? []);
