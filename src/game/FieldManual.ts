// Field Manual content (Phase 5 extra goal 36): the chapters of the in-game handbook
// (ui/FieldManualScreen.ts draws them). Pure data, in English; shown through tx() (Arabic in
// i18n/ar/manual.ts, coverage in tests/manual.test.ts).
// Facts are taken from the code (cited per chapter) — keep them in step when values change.
// Texts may use {fire} {zoom} {reload} {map} {pause} {help} {seats} {wing1}..{wing4}: the keys
// currently bound in Settings > Key bindings, so a remap shows here too.

export type ChapterId = 'gunnery' | 'crew' | 'p51' | 'abilities' | 'enemies' | 'campaign' | 'modes' | 'controls' | 'settings';
export type DiagramId = 'lead' | 'heat' | 'stations' | 'mouseAim' | 'energy' | 'skills' | 'boss' | 'wingman' | 'bk5';
export type LinkId = 'gallery' | 'skills' | 'campaign';

export interface Section {
  h: string;
  items?: string[];
  rows?: [string, string][];   // [name, text]
  diagram?: DiagramId;
  caption?: string;
  link?: { id: LinkId; label: string };
}

export interface Chapter { id: ChapterId; title: string; lead: string; sections: Section[] }

export const CHAPTERS: Chapter[] = [
  // GunnerController.ts (heat, seats, zoom, free look), GameHud.ts (lead ◇), B17Layout.ts (arcs)
  {
    id: 'gunnery', title: 'Gunnery basics',
    lead: 'A fighter closing at 300 mph is only in your sights for a moment. Lead him, fire short bursts, and let the barrel breathe.',
    sections: [
      {
        h: 'Leading the target', diagram: 'lead', caption: 'Fire at the yellow lead diamond, not at the aircraft.',
        items: [
          'Your rounds take time to get there: aim where the fighter <b>will be</b>.',
          'The yellow ◇ marks the lead point of the enemy closest to your line of fire (within about 1,300 m).',
          'Aim assist (Settings) pulls the sight gently onto that point; turn it off for pure gunnery.',
        ],
      },
      {
        h: 'Bursts and heat', diagram: 'heat', caption: 'Short bursts stay cool; a long burst seizes the barrel.',
        items: [
          'Every round heats the barrel; it cools by itself between bursts.',
          'At full heat the gun stops: <b>BARREL OVERHEATED</b>. It fires again once it has cooled below about half.',
          'Faster-firing guns (Stinger, rate upgrades, Berserker) heat up quicker. Overdrive (chapter 4) fires with no heat at all.',
        ],
      },
      {
        h: 'Reload and jams',
        items: [
          'Ammunition is not rationed: the belts never run dry.',
          '{reload} is the key you need when a gun <b>jams</b>: tap it fast or hold it to clear the gun (chapter 2).',
        ],
      },
      {
        h: 'Zoom',
        items: [
          'Hold the right button or {zoom} to look down the ring sight: a narrower view and finer aim (55 % mouse speed).',
          'At the waist the ring sight appears once your eye is down on it.',
        ],
      },
      {
        h: 'Gun positions', diagram: 'stations', caption: 'The five positions you can man, with their keys.',
        items: [
          '{seats}: Left Waist, Right Waist, Top Turret, Ball Turret, Tail Gun. Changing seats takes about a second.',
          'Waist guns swing about 52° each way; the top and ball turrets turn all the way round; the tail covers about 32° each way.',
          'A lit seat badge (bottom-left) means fighters are in another gun\'s arc: change seats to meet them.',
        ],
      },
      {
        h: 'Free look',
        items: [
          'Hold <kbd>C</kbd> to turn your head while the gun stays put: look round the fuselage, check the other guns, then let go.',
          '{map} opens the big radar map: it shows where the next group will come from.',
        ],
      },
    ],
  },
  // World.ts (wounds, dressing), RandomEvents.ts (fire, jam, oxygen, straggler), Director.ts / BailOutCinematic.ts
  {
    id: 'crew', title: 'B-17 crew and damage',
    lead: 'The Sky Queen keeps flying on three engines, a fire and a frozen oxygen line, if the crew act fast. Watch for the prompts and press the key shown.',
    sections: [
      {
        h: 'Wounds',
        items: [
          'Hits close to your gun can wound you. Each wound drains colour from the view; the HUD shows <b>Gunner wounded (n/4)</b>.',
          'A fourth wound ends the mission: you can no longer man the gun.',
          'Flak Suits (skill tree) cut the chance of a wound by 40 %.',
        ],
      },
      {
        h: 'Field dressing',
        items: [
          'No key needed: after about 85 s with no new wound (65 s in a boss battle) a crewmate patches you up and one wound heals.',
        ],
      },
      {
        h: 'Emergencies',
        rows: [
          ['Engine fire · X', 'Hold <kbd>X</kbd> or hammer it within 16 s. After 7 s the fire spreads to the next engine. Ignore it and the engineer saves the aircraft but the engine is lost.'],
          ['Oxygen · O', 'Press <kbd>O</kbd> once within 10 s to open the spare bottle; the view greys and swims until you do. Quick hands (within 4 s) earn more merit.'],
          ['Gun jam', 'Tap {reload} fast or hold it within 14 s. Only that gun is jammed: the other seats still fire.'],
          ['Straggler', 'A damaged B-17 drops out of formation: hold out 35 s or shoot down every fighter on her.'],
        ],
      },
      {
        h: 'Bail-out',
        items: [
          'Only when the Sky Queen is shot down: <b>BAIL OUT! BAIL OUT!</b> and a short cinematic (Space, Enter or Esc skips it). There is no bail-out key.',
          'Bombers lost count against the mission: keep fighters off the formation, not just off yourself.',
        ],
      },
    ],
  },
  // PilotController.ts, FlightModel.ts, Wingman.ts, StrafeOps.ts (PULL UP)
  {
    id: 'p51', title: 'P-51 flying',
    lead: 'The Mustang flies where you look. Keep your speed, pick your fights, and use your wingman.',
    sections: [
      {
        h: 'Mouse aim', diagram: 'mouseAim', caption: 'Put the aim circle where you want to go; the nose follows.',
        items: [
          'Move the mouse to place the aim circle; the instructor flies the aircraft there and keeps it out of a stall.',
          '<kbd>M</kbd> switches to direct stick: you fly the controls yourself and you can stall.',
          '<kbd>W</kbd> / <kbd>S</kbd> throttle, <kbd>Q</kbd> / <kbd>E</kbd> roll, <kbd>A</kbd> / <kbd>D</kbd> rudder. Fire with the left button or {fire}.',
          'Put the K-14 gunsight pipper ahead of the bandit, then fire.',
        ],
      },
      {
        h: 'Padlock and views',
        items: [
          '<kbd>T</kbd> padlocks the bandit nearest the centre of view (within 3.5 km): your view stays on him. Press <kbd>T</kbd> again to let go.',
          '<kbd>V</kbd> switches between the cockpit and the chase view. Hold <kbd>C</kbd> to look around.',
        ],
      },
      {
        h: 'Energy', diagram: 'energy', caption: 'Height is stored speed: dive to catch, climb to escape.',
        items: [
          'Keep your speed up and stay near the bombers: a slow, turning Mustang is a target.',
          'Above about 6 G the view starts to black out; ease off the turn.',
          'A bandit on your six: turn hard, don\'t fly straight.',
          'At treetop height (Train Busting) <b>PULL UP</b> sounds when the ground is coming too fast.',
        ],
      },
      {
        h: 'Wingman orders', diagram: 'wingman', caption: 'Blue Two answers four orders.',
        rows: [
          ['Attack my target', '{wing1}: he goes for your padlocked bandit, or the nearest one ahead of you.'],
          ['Cover me', '{wing2}: he goes for whoever is on your six.'],
          ['Protect the bombers', '{wing3}: he goes for fighters attacking the Fortresses.'],
          ['Form up', '{wing4}: he comes back to your right wing.'],
        ],
        items: ['If he is shot down, a replacement joins next round.'],
      },
    ],
  },
  // Abilities.ts, Skills.ts
  {
    id: 'abilities', title: 'Abilities and skill tree',
    lead: 'Three abilities ride with you on every mission; the skill tree makes you better at the job you like.',
    sections: [
      {
        h: 'Abilities',
        rows: [
          ['Mustangs · Q / Z', 'Four P-51s dive in and sweep the enemies near you. 90 s cooldown (30 s at the start of a mission).'],
          ['Overdrive · E / X', '8 s of no barrel heat and 35 % faster fire. 45 s cooldown.'],
          ['Focus · G', '3 s of slow time (30 % speed) while your sight stays quick. 40 s cooldown.'],
        ],
        items: [
          'Gunner keys first, pilot keys second. Every kill takes seconds off the cooldowns.',
        ],
      },
      {
        h: 'Skill tree', diagram: 'skills', caption: 'Three branches, each crowned by a capstone.',
        items: [
          'Points come from promotions (2 each), then 1 per 3,000 XP after Major.',
          '<b>Marksman</b>: sight and accuracy; capstone Deadeye (every 10th round is a sure hit).',
          '<b>Gunnery Sergeant</b>: heat, rate of fire and cooldowns; capstone Iron Lungs (the gun never seizes).',
          '<b>Survivor</b>: armour, wounds and fires; capstone Fortress (the first heavy cannon hit each round is ignored).',
          'Respec costs merit: 250 plus 100 per point refunded.',
        ],
        link: { id: 'skills', label: 'Open the skill tree' },
      },
    ],
  },
  // world/Tactics.ts + EnemyTypes.ts (behaviour), AircraftData.ts (gallery tips), BossBattle.ts / BossShip.ts
  {
    id: 'enemies', title: 'Enemies',
    lead: 'Know them by shape and by habit. One line each: what he does, and how to beat him.',
    sections: [
      {
        h: 'Aircraft recognition',
        rows: [
          ['Fw 190', 'Often flies the company front: forms up far ahead and high, attacks head-on all at once, then dives through. Use the top turret and fire early.'],
          ['Bf 109', 'Light and quick to roll. Pairs may fly top cover high above and dive on any bomber that drops out. A short, well-led burst; keep the formation tight.'],
          ['Bf 110', 'Twin-engine heavy fighter. Often stands off about 1,500 m out and fires 21 cm rockets. Break it up before it fires.'],
          ['Ju 88', 'The toughest twin: it also stands off with rockets before closing in. Aim at an engine.'],
          ['Me 262', 'Jet: a full-power slashing pass from far behind, then climbs away and comes again; never dogfights. Lead him far ahead, fire as he slows to line up.'],
          ['Me 163', 'Rocket fighter: climbs in from below and behind, makes one pass, then glides away for good. Ball and tail guns; one good hit kills it.'],
          ['He 111', 'Bombers in formation on a straight, level course, gunners firing back. Attack from below and go for the engines.'],
          ['Me 410', 'Hangs back with a 50 mm BK 5 cannon, then lines up for a long, steady run. Kill him while he lines up (see below).'],
          ['Do 335', 'Dives in from high behind, slashes through and dives away. Watch the tail and lead him hard.'],
        ],
        link: { id: 'gallery', label: 'Open the aircraft gallery' },
      },
      {
        h: 'The Me 410 telegraph', diagram: 'bk5', caption: 'A long, steady run: the 50 mm is coming.',
        items: [
          'The radio calls the line-up and a <b>BIG GUN</b> marker appears on the radar.',
          'He needs at least 3.8 s of steady aim before the first of two shells: put every gun on him in that window.',
          'After three runs he closes in like any heavy fighter.',
        ],
      },
      {
        h: 'Luftkreuzer battle group', diagram: 'boss', caption: 'Shoot the parts away, then pour fire into the hull.',
        items: [
          'Three or four giant flying warships led by a flagship. Until the armour is breached the hull takes only a tenth of your damage.',
          'Shoot the bracketed weak points: turrets, engines, flak, rocket pods, fuel tank, bridge. Destroy 40 % of them (5 on a normal ship) and the armour is breached.',
          'The breach is permanent: pour fire into the hull. The fuel tank takes the biggest bite out of the hull.',
          'An alarm warns of a heavy attack: destroying the flak gun, both rocket pods or the bridge stops it for good.',
          'Each engine lost makes the ship sink and drop back. Below half health a ship is ENRAGED and calls in escorts.',
        ],
      },
    ],
  },
  // CampaignState.ts (gauges, reports), SideRaids.ts, Nemesis.ts / NemesisRuntime.ts
  {
    id: 'campaign', title: 'Campaign map and strategy',
    lead: 'Twelve story missions from Emden to Berlin, flown on a living map of 1943–44. What you bomb between them changes the war you fly.',
    sections: [
      {
        h: 'Strategy gauges',
        rows: [
          ['Luftwaffe strength', '50–150 %. When it is high, more fighters come up and they fly better. Successful missions and raids push it down.'],
          ['Squadron', '6–18 B-17s. One is lost for every bomber shot down; two replacements arrive per sortie. Below 15 your formation shrinks.'],
          ['Morale', '10–100 %. Scales your merit (×0.9–1.1). Success raises it; failure and heavy losses lower it.'],
          ['Escort', '0–100 %, rising with the calendar and with raids. At 50 % or more P-51s join your gunner missions, sooner the higher it is.'],
        ],
        link: { id: 'campaign', label: 'Open the campaign map' },
      },
      {
        h: 'Side raids',
        items: ['Between story missions 2–3 raids are offered; you can fly one per gap. An intelligence report after each operation lists what changed and why.'],
        rows: [
          ['Rail yards', 'Luftwaffe −3, morale +3.'],
          ['Airfields', 'Luftwaffe −8, escort +12.'],
          ['Oil', 'Luftwaffe −6, morale +2.'],
          ['U-boat pens', 'Early replacement bombers, morale +4.'],
          ['Aircraft factory', 'Luftwaffe −7, escort +6.'],
        ],
      },
      {
        h: 'Experten',
        items: [
          'Eight named aces, each with a style: head-on, out of the sun, straggler hunter, jet ace, Me 410 big gun and more.',
          'An ace breaks off when badly hit. If he escapes he gains a scar and a grudge, comes back sharper and looks for you.',
          'Only your own kill collects his bounty; the most wanted ace pays double. Dossiers: Career → Experten.',
        ],
      },
    ],
  },
  // Modes.ts, Dailies.ts, Weekly.ts, CustomBattle.ts, RaidDefence.ts, StrafeOps.ts, CoopSession.ts / net/Signal.ts
  {
    id: 'modes', title: 'Modes',
    lead: 'Everything beyond the campaign. Ace Hunt, Time Attack, Weekly, Custom Battle and the special operations are tabs on the Survival screen.',
    sections: [
      {
        h: 'Score modes',
        rows: [
          ['Survival', 'Endless rounds, each bigger than the last, as a B-17 gunner or P-51 pilot; lost bombers are not replaced. A hangar between rounds and a boss group every third round.'],
          ['Ace Hunt', 'Elite enemies only: 3 rounds of 5 minutes, 1,000 points per ace.'],
          ['Time Attack', '3 minutes; every kill scores 100 × your combo.'],
          ['Daily', 'Three daily orders and the Daily Run, the same for everyone each day (UTC). Title menu → Daily Orders.'],
          ['Weekly', 'A new scenario every Monday (00:00 UTC), the same for every crew, with its own leaderboard; the first completion pays a ribbon and nose art.'],
          ['Custom Battle', 'Build your own: role, seat, enemies, numbers, skill, weather, time of day, boss round. No leaderboard.'],
        ],
      },
      {
        h: 'Special operations (P-51)',
        rows: [
          ['Defend the Field', 'Role reversal: stop a Ju 88 raid with Bf 109 cover over your own airfield. 3 rounds; more than 6 bombers through and you lose.'],
          ['Night Fighter', 'Find raiders by their exhaust flames and the searchlights; only coned or close ones are marked. Bf 110 night fighters hunt you from wave 2; more than 4 through and you lose.'],
          ['Train Busting', 'Treetop strafing over Normandy: stop the train before the tunnel, then a convoy, then an airfield, with 20 mm flak firing back.'],
        ],
      },
      {
        h: 'Co-op (beta)',
        items: [
          'Two players crew one B-17 in Survival, each on a different gun. The host shares a 6-character room code; rooms expire after 2 hours.',
          'Title menu → Co-op (beta).',
          'Watch: enter a crew\'s code and press Watch to follow the battle without a gun, from any gun position (1–5) or the cinematic camera (C). Settings → Spectator delay holds the picture back; Streamer mode hides codes and callsigns and makes the HUD bigger.',
        ],
      },
    ],
  },
  // ui/ControlsCard.ts rows (generated: remaps, gamepad and touch layouts)
  {
    id: 'controls', title: 'Controls reference',
    lead: 'The same tables as the controls card ({help} in a mission), for every device. Remapped keys show as you set them.',
    sections: [
      {
        h: 'Always available',
        items: [
          'Esc or {pause} pauses; {help} or <kbd>F1</kbd> shows the controls card; <kbd>F</kbd> is photo mode.',
          'Remap the main keys in Settings → Key bindings (Reset keys to defaults undoes it). Gamepad buttons are fixed.',
          'A connected gamepad also drives every menu: the D-pad moves, A presses, B goes back.',
        ],
      },
    ],
  },
  // UI.settings(), AutoGraphics.ts, AccessibilityPanel.ts
  {
    id: 'settings', title: 'Settings tips',
    lead: 'A steady frame rate shoots better than pretty clouds. Set it up once and forget it.',
    sections: [
      {
        h: 'Quality presets',
        rows: [
          ['Low', 'No shadows, haze or ambient occlusion; the lightest clouds. For weak laptops and phones.'],
          ['Medium', 'Shadows, haze and 2× anti-aliasing.'],
          ['High', 'Adds ambient occlusion, 4× anti-aliasing and full particles.'],
          ['Ultra', 'The sharpest shadows, the most cloud detail and extra particles.'],
        ],
        items: [
          '<b>Detect best settings</b> runs a two-second silent test of the title scene and picks the preset; any input cancels it. The game runs it on first launch, and a preset you pick yourself always wins.',
          'Turn on the FPS counter to see what a change costs.',
        ],
      },
      {
        h: 'Aiming help',
        items: [
          'Aim assist (Off / Low / High), the lead indicator (Off / Recruit only / Always) and target markers are all in Settings.',
          'Mouse sensitivity, field of view (50–80°), invert Y and the P-51 flight controls (mouse aim or direct) are there too.',
        ],
      },
      {
        h: 'Accessibility',
        items: [
          'Colour-blind friendly markers: blue friends, orange foes, and enemies also get a cross.',
          'Subtitle size and background; radio voices can be set to subtitles only.',
          'Reduce screen shake and flashes.',
          'Touch controls (Automatic / Always on / Off) and touch aim sensitivity.',
          'The kill cam, the take-off and landing scenes and the crew-room scenes can each be switched off.',
        ],
      },
    ],
  },
];

/** The chapter for the role being played (the pause menu's "Manual" button). */
export function chapterForRole(role: 'gunner' | 'pilot'): ChapterId {
  return role === 'pilot' ? 'p51' : 'gunnery';
}

/** Every English text in the manual (tests: each one has Arabic). */
export function manualTexts(): string[] {
  const out: string[] = [];
  for (const c of CHAPTERS) {
    out.push(c.title, c.lead);
    for (const s of c.sections) {
      out.push(s.h);
      if (s.caption) out.push(s.caption);
      if (s.link) out.push(s.link.label);
      for (const i of s.items ?? []) out.push(i);
      for (const [k, v] of s.rows ?? []) out.push(k, v);
    }
  }
  return out;
}
