// "What's new" bulletin (ui/WhatsNewScreen.ts): the cards for the big new features, each with
// a "Try it" target, and the once-per-version rule. Pure logic apart from the storage helpers:
// unit-tested (tests/extras.test.ts). Shown text is English, translated through tx()
// (i18n/ar/extras.ts).

/** Bump when there is a new bulletin: everybody sees it once more on the next title screen. */
export const WHATS_NEW_VERSION = '1.0';
export const SEEN_KEY = 'sws3d.seenVersion';

export type TryTarget =
  | 'campaign' | 'takeoff' | 'boss' | 'interior' | 'specials' | 'wingman'
  | 'nemesis' | 'skills' | 'custom' | 'theatre' | 'coop' | 'arabic';

export interface NewsCard {
  id: TryTarget;
  title: string;
  text: string;
  tag?: string;      // small stamp (BETA)
}

export const NEWS: NewsCard[] = [
  { id: 'campaign', title: 'Campaign map', text: 'Choose the next target on a living 1943–44 map. Side raids on rail yards, airfields and oil hit the Luftwaffe where it hurts.' },
  { id: 'takeoff', title: 'Take-off and landing', text: 'Dawn take-off from Deenethorpe and the landing afterwards: red flares and fire trucks if she comes home shot up. Skippable.' },
  { id: 'boss', title: 'Boss battle groups', text: 'Luftkreuzer flying warships with turrets, flak and rocket pods. Shoot the parts away to breach the armour.' },
  { id: 'interior', title: 'Living B-17 interior', text: 'The other waist gunner fights beside you, brass piles up, frost creeps over the glass. Hold C to look around.' },
  { id: 'specials', title: 'P-51 special operations', text: 'Defend the Field against a Ju 88 raid, hunt bombers as a Night Fighter, or go Train Busting at treetop height.' },
  { id: 'wingman', title: 'Wingman orders', text: 'Your wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up.' },
  { id: 'nemesis', title: 'Experten nemesis aces', text: 'Named Luftwaffe aces who remember you, carry scars and grudges, and climb the ranks if they get away.' },
  { id: 'skills', title: 'Skill tree', text: 'Spend points from promotions in three branches: Marksman, Gunnery Sergeant and Survivor.' },
  { id: 'custom', title: 'Custom battle and weekly', text: 'Build your own battle: enemies, weather, time of day, a boss round. Or fly the weekly challenge for its ribbon.' },
  { id: 'theatre', title: 'Replay theatre', text: 'Scrub the last 90 seconds of a mission, fly a free camera, save the best moments and screenshots.' },
  { id: 'coop', title: 'Co-op', text: 'Two gunners, one B-17: share a room code with a friend and man different guns online.', tag: 'BETA' },
  { id: 'arabic', title: 'Arabic', text: 'Every screen in Arabic, right to left. Switch the language in Settings.' },
];

/**
 * The bulletin opens by itself on a title screen when this version has not been seen yet,
 * except while the first-launch training prompt is up (a brand-new player sees it once the
 * prompt has been answered, so the two never stack).
 */
export function shouldShow(seen: string | null, promptUp: boolean, version = WHATS_NEW_VERSION): boolean {
  return seen !== version && !promptUp;
}

export function loadSeen(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return WHATS_NEW_VERSION; }   // no storage: never nag
}

export function markSeen(version = WHATS_NEW_VERSION) {
  try { localStorage.setItem(SEEN_KEY, version); } catch { /* storage unavailable */ }
}
