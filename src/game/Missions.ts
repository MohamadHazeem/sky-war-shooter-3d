import type { AttackType } from '../world/AI';
import type { StationId } from '../world/B17Layout';
import type { Weather } from '../render/Weather';
import type { EnemyType } from '../world/EnemyTypes';

export type SpawnFrom = 'front' | 'rear' | 'left' | 'right' | 'high' | 'mixed';

export interface Wave {
  at: number;                 // mission time (s) when the wave appears (or after previous cleared if afterClear)
  afterClear?: boolean;
  count: number;
  attack?: AttackType;
  from: SpawnFrom;
  skill: number;
  rockets?: number;           // fraction of the wave carrying Wgr. 21 rockets
  radio?: [string, string];
  station?: string;           // gunner missions: the gun position this group goes for (unset = the player's)
}

export interface Mission {
  id: string;
  number: number;
  title: string;
  target: string;
  date: string;
  role: 'gunner' | 'pilot';
  station?: StationId;
  briefing: string[];
  objectives: string[];
  bombers: number;
  escorts?: number;
  escortArrive?: number;      // time when friendly fighters arrive (gunner missions)
  waves: Wave[];
  flak?: { start: number; end: number; intensity: number };
  bombsAway?: number;
  duration: number;           // minimum mission time before it can complete
  maxBombersLost?: number;
  playerDamaged?: boolean;    // start with two engines out (straggler)
  success?: string;           // debrief line on success
  playerArmor?: number;       // incoming damage scale on the player's aircraft
  weather?: Weather;
  sun?: { el: number; az: number };
  coverage?: number;
  round?: Round;              // continuous engagement (replaces the wave list when set)
  rounds?: number;            // the round is split into this many rounds, a hangar break between them (Infinity = survival)
  tutorial?: boolean;         // Gunnery School: Game's director skips it, Tutorial.ts drives the spawns
  // ---- scenario switches (custom battles and the weekly challenge; unset = the normal rules) ----
  enemyTypes?: EnemyType[];   // only these enemy types are sent (ModeRunner.enemyType)
  flatRounds?: boolean;       // every round uses round's own numbers (round.duration is per round), see roundDef
  boss?: { first: number; every?: number } | false;  // battle-group rounds, 0-based (every: repeat interval); false = none (BossBattle.isBossRound)
  specials?: boolean;         // false: no special events (SpecialEvents)
  roundFlak?: number;         // a flak barrage through the middle of every normal round at this intensity (ModeRunner.tick)
}

// A round of continuous combat: fighters keep coming in groups, the number in the air
// climbing from `min` to `max` over the first 60% of the round; then the survivors are cleared.
export interface Round {
  duration: number;           // s of spawning
  start: number;              // s before the first group
  min: number; max: number;   // fighters in the air at once
  skill: [number, number];    // skill at the start / at full ramp
  rockets?: number;           // share carrying Wgr. 21 rockets
}

export const CAMPAIGN: Mission[] = [
  {
    id: 'm1', weather: { sunEl: 50, sunAz: 205, low: 0.72, high: 0.55 }, success: "Emden's U-boat pens took a beating. Good shooting, gunner — you'll make a veteran yet.", number: 1, title: 'Baptism of Fire', target: 'U-boat yards, Emden', date: '27 September 1943', role: 'gunner', station: 'waistL',
    briefing: [
      'Gentlemen, this is your first one. The group puts up eighteen ships against the U-boat yards at Emden. Bombing altitude twenty-five thousand feet.',
      'You are left waist gunner aboard the Sky Queen, number two ship in the lead element. Expect single-engine fighters over the Frisian coast. They will come in fast and they will come in close.',
      'Lead your target. A fighter crossing at three hundred miles an hour needs a lot of lead — watch your tracers and walk them in. Short bursts. Keep that barrel cool.',
    ],
    objectives: ['Defend the formation', 'Survive the mission', 'Lose no more than 3 bombers'],
    bombers: 9, waves: [
      { at: 7, count: 3, from: 'left', attack: 'beam', skill: 0.75, radio: ['Navigator', 'Fighters coming up from the coast, nine o\'clock low. Stay sharp.'] },
      { at: 0, afterClear: true, count: 3, from: 'front', attack: 'headon', skill: 0.8, radio: ['Pilot', 'More of them up ahead. Twelve o\'clock — here they come.'] },
      { at: 0, afterClear: true, count: 3, from: 'left', attack: 'beam', skill: 0.85, radio: ['Waist', 'More coming in on the left! Watch your nine!'] },
      { at: 0, afterClear: true, count: 4, from: 'mixed', skill: 0.85 },
      { at: 0, afterClear: true, count: 4, from: 'left', skill: 0.9, radio: ['Navigator', 'Last bunch before the target. Make them count!'] },
    ],
    duration: 120, maxBombersLost: 3,
  },
  {
    id: 'm2', weather: { sunEl: 34, sunAz: 165, low: 0.82, high: 0.35 }, success: "The head-on attacks broke against a wall of fifty-calibre fire. Bremen's docks are burning.", number: 2, title: 'Twelve O\'Clock High', target: 'Port facilities, Bremen', date: '8 October 1943', role: 'gunner', station: 'top',
    briefing: [
      'The Luftwaffe has learned that the nose of a Fortress is its weak spot. Their fighters are making head-on passes at closing speeds of six hundred miles an hour.',
      'You are flying the top turret today. Twin fifties, three hundred and sixty degrees of traverse. When they come in from twelve o\'clock high you are the man who has to stop them.',
      'Bremen is heavily defended. Expect repeated attacks before and after the target.',
    ],
    objectives: ['Break up the head-on attacks', 'Survive the mission', 'Lose no more than 4 bombers'],
    bombers: 12, waves: [
      { at: 7, count: 4, from: 'front', attack: 'headon', skill: 0.9, radio: ['Bombardier', 'Bandits! Twelve o\'clock high, a whole Staffel of them!'] },
      { at: 0, afterClear: true, count: 5, from: 'front', attack: 'headon', skill: 0.95 },
      { at: 0, afterClear: true, count: 4, from: 'high', attack: 'high', skill: 1.0, radio: ['Tail', 'Fighters up high, coming out of the sun!'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.0 },
    ],
    duration: 180, maxBombersLost: 4,
  },
  {
    id: 'm3', weather: { sunEl: 15, sunAz: 205, low: 0.56, high: 0.4 }, success: "Bombs on target through the worst flak of the war. The chemical works at Ludwigshafen are in flames.", number: 3, title: 'Flak Alley', target: 'Chemical works, Ludwigshafen', date: '30 December 1943', role: 'gunner', station: 'waistR',
    briefing: [
      'The I.G. Farben works at Ludwigshafen is ringed by more than two hundred heavy flak guns. There is nothing you can do about flak but pray — and keep the fighters off us.',
      'You are right waist gunner. Fighters will hit us on the way in, then pull off when we reach the flak belt. Once bombs are away, they will be back for the cripples.',
      'Stay at your gun through the bomb run. Do not get out of position.',
    ],
    objectives: ['Fight through to the target', 'Survive the flak belt over the target', 'Defend the formation on the way home'],
    bombers: 12, waves: [
      { at: 7, count: 4, from: 'right', attack: 'beam', skill: 0.95, radio: ['Ball Turret', 'Fighters, three o\'clock level! Coming in from the right!'] },
      { at: 0, afterClear: true, count: 4, from: 'rear', attack: 'stern', skill: 1.0, rockets: 0.5 },
      { at: 150, count: 6, from: 'mixed', skill: 1.05, radio: ['Pilot', 'We\'re through the flak. Here come the fighters again — watch the cripples.'] },
      { at: 0, afterClear: true, count: 5, from: 'mixed', skill: 1.1 },
    ],
    flak: { start: 75, end: 140, intensity: 1.6 }, bombsAway: 112, duration: 200, maxBombersLost: 5,
  },
  {
    id: 'm4', weather: { sunEl: 30, sunAz: 150, low: 0.75, high: 0.6 }, success: "The Big Friends made it to Leipzig and back. Outstanding work, Blue Leader.", number: 4, title: 'Little Friends', target: 'Escort — Leipzig', date: '20 February 1944', role: 'pilot',
    briefing: [
      'Big Week. The whole Eighth Air Force is going after the German aircraft industry, and this time the bombers will not go alone.',
      'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. Your job is to break up the fighter attacks before they reach the bombers. Do not chase the enemy all over Germany — stay with the big friends.',
      'Mouse aim flies the aircraft toward where you look. W and S for throttle. Your six fifties are harmonised at three hundred yards.',
    ],
    objectives: ['Protect the bombers', 'Destroy the attacking fighters', 'Lose no more than 4 bombers'],
    bombers: 12, escorts: 3, waves: [
      { at: 9, count: 4, from: 'front', attack: 'headon', skill: 1.0, radio: ['Lead', 'Bandits twelve o\'clock low, climbing for the bombers. Let\'s go get them.'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.0 },
      { at: 0, afterClear: true, count: 7, from: 'rear', attack: 'stern', skill: 1.05, radio: ['Big Friend', 'Little friends, little friends, we have bandits at our six o\'clock!'] },
    ],
    duration: 150, maxBombersLost: 4,
  },
  {
    id: 'm5', weather: { sunEl: 26, sunAz: 190, low: 0.66, high: 0.45 }, success: "The Sturmgruppe paid for every pass. The tail gun held, and so did the formation.", number: 5, title: 'Sturmgruppe', target: 'Ball-bearing plants, Schweinfurt', date: '24 February 1944', role: 'gunner', station: 'tail',
    briefing: [
      'Intelligence reports a new kind of German unit: the Sturmgruppe. Heavily armoured Fw 190 A-8s that close to point-blank range from astern, in line abreast, and do not break off.',
      'You are the tail gunner. They will be coming straight at you. Open fire early and keep firing — armour glass in their windscreens will stop a lot of what you throw at them.',
    ],
    objectives: ['Stop the Sturmgruppe attack from astern', 'Survive the mission', 'Lose no more than 5 bombers'], playerArmor: 0.45,
    bombers: 12, waves: [
      { at: 7, count: 3, from: 'rear', attack: 'stern', skill: 1.0, radio: ['Navigator', 'Fighters assembling behind us, six o\'clock level. Lots of them.'] },
      { at: 0, afterClear: true, count: 6, from: 'rear', attack: 'stern', skill: 1.1, rockets: 0.5, radio: ['Pilot', 'Here comes the whole gaggle! Tail, they\'re all yours!'] },
      { at: 0, afterClear: true, count: 5, from: 'mixed', skill: 1.1 },
      { at: 0, afterClear: true, count: 6, from: 'rear', attack: 'stern', skill: 1.15, radio: ['Tail', 'Another Staffel forming up astern!'] },
    ],
    duration: 160, maxBombersLost: 5,
  },
  {
    id: 'm6', weather: { sunEl: 11, sunAz: 250, low: 0.7, high: 0.5 }, success: "The Mustangs drove them off. The Sky Queen limps home across the North Sea on two engines.", number: 6, title: 'The Long Way Home', target: 'Return leg — over the Netherlands', date: '6 March 1944', role: 'gunner', station: 'waistL',
    briefing: [
      'Flak over Berlin knocked out two of our engines. We cannot hold formation and the group is pulling away from us. A lone Fortress is exactly what the Jagdflieger are looking for.',
      'Every gun aboard is manned. Switch positions as they come in — one through five. P-51s are on the way to pick us up, but we have to hold out until they get here.',
    ],
    objectives: ['Keep the Sky Queen in the air', 'Hold out until the escort arrives'],
    bombers: 6, playerDamaged: true, escortArrive: 150, waves: [
      { at: 6, count: 2, from: 'rear', attack: 'stern', skill: 1.0, radio: ['Tail', 'Two fighters closing from six o\'clock. They\'ve spotted us.'] },
      { at: 45, count: 3, from: 'mixed', skill: 1.05 },
      { at: 90, count: 4, from: 'mixed', skill: 1.1, radio: ['Radio', 'Escort reports sixty seconds out. Hang on!'] },
      { at: 125, count: 4, from: 'mixed', skill: 1.15 },
    ],
    duration: 170, maxBombersLost: 99,
  },
  {
    id: 'm7', weather: { sunEl: 38, sunAz: 170, low: 0.6, high: 0.62 }, success: "Berlin has been hit, and the Luftwaffe lost more than it can replace. The air war has turned.", number: 7, title: 'Big Week', target: 'Escort — Berlin', date: '8 March 1944', role: 'pilot',
    briefing: [
      'This is the big one. The Luftwaffe is throwing everything it has left at the bomber stream over Berlin.',
      'You lead the escort for our box. There will be more fighters than you can count — pick your targets, protect the bombers, and keep your speed up. Ammunition is limited: six hundred seconds of combat will not last six hundred seconds.',
    ],
    objectives: ['Protect the bombers', 'Destroy as many attackers as possible', 'Lose no more than 6 bombers'],
    bombers: 12, escorts: 5, waves: [
      { at: 8, count: 6, from: 'front', attack: 'headon', skill: 1.1, radio: ['Lead', 'Here they come. Big gaggle at twelve o\'clock — drop tanks and go!'] },
      { at: 0, afterClear: true, count: 8, from: 'rear', attack: 'stern', skill: 1.15, rockets: 0.4 },
      { at: 0, afterClear: true, count: 8, from: 'high', attack: 'high', skill: 1.2 },
      { at: 0, afterClear: true, count: 10, from: 'mixed', skill: 1.25, radio: ['Big Friend', 'More bandits! They\'re everywhere!'] },
    ],
    flak: { start: 100, end: 135, intensity: 1.0 }, bombsAway: 120, duration: 200, maxBombersLost: 6,
  },
];

// ---------------- Story arc: the Sky Queen's tour, autumn 1943 -> spring 1944 ----------------
// Five more missions, slotted into the campaign in date order after the mission named in
// `after`. Ids stay stable for saved progress; numbers follow the campaign order.
const STORY_MISSIONS: (Mission & { after: string })[] = [
  {
    after: 'm2', id: 'm8', number: 0, title: 'Black Thursday', target: 'Ball-bearing plants, Schweinfurt', date: '14 October 1943', role: 'gunner', station: 'ball',
    weather: { sunEl: 30, sunAz: 190, low: 0.5, high: 0.3, contrails: true, mood: 'clear' },
    success: 'Schweinfurt was hit hard, and so were we. Sixty Fortresses did not come home tonight. The Sky Queen did.',
    briefing: [
      'Gentlemen, the target is Schweinfurt. Half the ball bearings in Germany come out of five factories in one small town. Flatten them, and every tank, U-boat and fighter in the Reich will feel it. The Eighth is putting up nearly three hundred Fortresses, and the Luftwaffe knows we are coming.',
      'The escort turns back at Aachen. After that we are on our own for two hundred miles, and intelligence expects every fighter group in western Germany to be waiting: single-engine fighters head-on, twin-engine destroyers firing rockets from astern. They will hit us in relays, land, refuel and come up again.',
      'You are in the ball turret today. Keep it turning, keep calling them out, and watch the bellies of the low squadron. Nobody else can see what is coming up from below.',
      'This is the Sky Queen\'s third mission. Lieutenant Doyle wants it on the record that he volunteered for a milk run and nobody offered him one. Fly tight. Today a tight formation is the only escort you will have.',
    ],
    objectives: ['Survive the mass attack', 'Break up the rocket attacks from astern', 'Lose no more than 5 bombers'],
    bombers: 12, waves: [
      { at: 7, count: 6, from: 'mixed', skill: 1.0, radio: ['Pilot', 'Here they come. Looks like the whole Luftwaffe is up today!'] },
      { at: 0, afterClear: true, count: 6, from: 'rear', attack: 'stern', skill: 1.05, rockets: 0.6 },
      { at: 0, afterClear: true, count: 8, from: 'mixed', skill: 1.1 },
    ],
    bombsAway: 150, duration: 270, maxBombersLost: 5,
  },
  {
    after: 'm8', id: 'm9', number: 0, title: 'Into the Front', target: 'Escort — Kiel', date: '13 December 1943', role: 'pilot',
    weather: { sunEl: 18, sunAz: 195, low: 0.97, high: 0.98, contrails: false, mood: 'storm' },
    success: 'The Mustangs went all the way to Kiel and back. Somewhere in the Sky Queen, Sergeant Dawson owes a fighter pilot a month of dinners.',
    briefing: [
      'Until now the bombers have gone into Germany alone the moment the escort ran short of fuel. As of today that changes. The Mustang can reach Kiel and come home again, and you are going all the way with them.',
      'The weather is the worst we have flown in. A front lies across the North Sea from the Frisian Islands to Denmark: towering cloud, icing above eight thousand feet and lightning in the tops. Stay on your leader\'s wing in the murk. The German fighters will come at the bombers through the gaps.',
      'The bomber crews are watching you today. The Sky Queen\'s tail gunner, Sergeant Dawson, has seen too many friends go down after the escort turned for home. He says that if a Mustang sticks with them all the way to Kiel, he will buy its pilot dinner for a month.',
      'Mouse aim flies the aeroplane where you look. Keep your speed up, do not chase them into the cloud, and stay with the big friends.',
    ],
    objectives: ['Escort the bombers through the storm front', 'Break up the attacks on the bombers', 'Lose no more than 4 bombers'],
    bombers: 12, escorts: 3, waves: [
      { at: 9, count: 4, from: 'front', attack: 'headon', skill: 1.0, radio: ['Lead', 'Bandits climbing out of the murk, twelve o\'clock low. Blue flight, stay with me!'] },
      { at: 0, afterClear: true, count: 6, from: 'mixed', skill: 1.05 },
    ],
    duration: 240, maxBombersLost: 4,
  },
  {
    after: 'm3', id: 'm10', number: 0, title: 'Last Light', target: 'Return leg — over the Channel', date: '29 January 1944', role: 'gunner', station: 'waistR',
    weather: { sunEl: 4, sunAz: 245, low: 0.6, high: 0.4, contrails: true, mood: 'dusk' },
    success: 'Wheels down at Manston in the last of the light. The Sky Queen came home from her thirteenth, and Sergeant Gallo kissed the runway.',
    briefing: [
      'Frankfurt is burning behind us, and so is the Sky Queen. Flak over the target knocked out two engines and put Lieutenant Doyle on the floor of the cockpit with a piece of steel in his leg. The group could not wait for us. We are alone, low on fuel, and the sun is going down.',
      'Lieutenant Stern has plotted the shortest line home: across Belgium and out over the Channel past Dunkirk. Every fighter field in Flanders sits under that line. Sergeant Gallo is calling Air-Sea Rescue every five minutes, and the crew has thrown out everything that is not bolted down, except the guns.',
      'The Germans love a straggler at dusk. They will come out of the dark side of the sky, low over the water where you cannot see them against the sea. Watch the east, and use every gun position, one through five.',
      'Fighter Command has promised an escort off the coast. Hold out until it gets here. Captain Brenner says this is the Sky Queen\'s thirteenth mission, and he is not putting an old lady in the Channel on her thirteenth.',
    ],
    objectives: ['Keep the Sky Queen in the air', 'Hold out until the escort arrives', 'Reach the English coast before dark'],
    bombers: 6, playerDamaged: true, escortArrive: 170, waves: [
      { at: 6, count: 2, from: 'rear', attack: 'stern', skill: 1.0, radio: ['Tail', 'Fighters low on the water, six o\'clock. They followed us out.'] },
      { at: 45, count: 3, from: 'mixed', skill: 1.05 },
      { at: 100, count: 4, from: 'mixed', skill: 1.1 },
    ],
    duration: 240, maxBombersLost: 99,
  },
  {
    after: 'm5', id: 'm11', number: 0, title: 'Bomb Run', target: 'Messerschmitt works, Regensburg', date: '25 February 1944', role: 'gunner', station: 'top',
    weather: { sunEl: 32, sunAz: 175, low: 0.45, high: 0.3, contrails: true, mood: 'clear' },
    success: 'Bombs away, right on the aiming point. The photographs show the Messerschmitt works in ruins. Lieutenant Kessler is insufferable.',
    briefing: [
      'This is the last day of Big Week, and the target is the one the group paid for so dearly in August: the Messerschmitt works at Regensburg. Every Bf 109 that has come at you this week was built under that roof. Today we take the roof off.',
      'The plant is ringed by heavy guns, and they will fire a box barrage straight up the bomb run. From the initial point to bombs away is four minutes of straight and level flying. No evasive action. The Sky Queen holds her place in the formation and takes it.',
      'Lieutenant Kessler has waited nineteen missions for a target like this. He spent the night with the target photographs and says he could find the assembly hall in his sleep. Your job is to keep the fighters off him until he does. You have the top turret, and they will come for the lead ships from above.',
      'Sergeant Mendez has asked me to remind everyone that he does not like flak, and that he has been saying so since September. Noted, Sergeant. Bombs away is what this whole war is about. Make it count.',
    ],
    objectives: ['Fight through to the initial point', 'Hold formation through the flak on the bomb run', 'Put the bombs on the Messerschmitt works'],
    bombers: 12, waves: [
      { at: 7, count: 4, from: 'high', attack: 'high', skill: 1.05, radio: ['Bombardier', 'Bandits up high, going for the lead ships. Keep them off me till we\'re on the bomb run!'] },
      { at: 0, afterClear: true, count: 5, from: 'front', attack: 'headon', skill: 1.1 },
      { at: 170, count: 6, from: 'mixed', skill: 1.15 },
    ],
    flak: { start: 80, end: 165, intensity: 1.8 }, bombsAway: 145, duration: 270, maxBombersLost: 5,
  },
  {
    after: 'm7', id: 'm12', number: 0, title: 'Maximum Effort', target: 'Aircraft plants, Oschersleben', date: '11 April 1944', role: 'gunner', station: 'waistL',
    weather: { sunEl: 40, sunAz: 185, low: 0.9, high: 0.92, contrails: false, mood: 'overcast' },
    success: 'Twenty-five. The Sky Queen touches down at Deenethorpe and her crew climbs out for the last time. The skies over Europe belong to the Allies now. Tour complete.',
    briefing: [
      'Gentlemen, this is a maximum effort. Big Week broke the back of the German fighter arm; today we finish the job. More than nine hundred heavy bombers are going after the aircraft plants at Oschersleben, Bernburg and Stettin, and the Luftwaffe will throw everything it has left at us.',
      'There are Mustangs all the way to the target now, so the Germans hit the bomber stream before the escort can join. Expect a heavy attack on the way in, flak over the target, and a last fight before the little friends arrive. Hold on until they get there.',
      'For the Sky Queen this is mission twenty-five. When she lands, her crew goes home. Lieutenant Doyle is back in the right-hand seat with a new limp and the same old jokes, and Sergeant Gallo has already painted the twenty-fifth bomb under the cockpit window. In pencil, he says, so it does not count as bad luck.',
      'You are back on the left waist gun, where you started at Emden. Think of the crews who are not here today: the Lucky Lady over Schweinfurt, and the new boys who never finished their first week. Fly this one for them. Then come home, all of you.',
    ],
    objectives: ['Survive the attack on the way in', 'Bomb the aircraft plants through the flak', 'Hold out until the Mustangs arrive', 'Bring the Sky Queen home'],
    bombers: 12, escortArrive: 230, waves: [
      { at: 8, count: 6, from: 'front', attack: 'headon', skill: 1.1, radio: ['Pilot', 'Pilot to crew, one more time. Fighters, twelve o\'clock high, a lot of them!'] },
      { at: 0, afterClear: true, count: 8, from: 'mixed', skill: 1.2, rockets: 0.4 },
      { at: 0, afterClear: true, count: 10, from: 'mixed', skill: 1.25 },
    ],
    flak: { start: 150, end: 200, intensity: 1.4 }, bombsAway: 185, duration: 320, maxBombersLost: 6, rounds: 4,
  },
];

// A story paragraph for each of the original seven missions carries the crew's tour through them
const STORY: Record<string, string> = {
  m1: 'A word about your ship. The Sky Queen is brand new, and so is her crew. Captain Brenner flies her, Lieutenant Stern has promised to find Emden on the first try, and Sergeant Gallo has already painted a crown under the pilot\'s window. Twenty-five missions and you go home. This is number one.',
  m2: 'The Sky Queen came back from Emden with forty-one holes in her and not a scratch on her crew. Sergeant Reilly says the ball turret is the safest seat in the house, because the Germans cannot find him down there. Lieutenant Doyle says nobody else can either. Mission two. Keep it off the interphone once we cross the coast.',
  m3: 'Since Schweinfurt the bunks across the aisle have changed names twice. The Lucky Lady never came back from that one, and her crew had been with the Sky Queen since training. Sergeant Mendez has blessed every gun aboard with a Saint Christopher medal. Lieutenant Kessler wants only one thing for Christmas: the aiming point.',
  m4: 'Some of you met the Sky Queen\'s crew in the pub at Oundle after Kiel. Their tail gunner, Sergeant Dawson, is still paying for dinners for the Mustang pilots who went all the way with them. He says there is a steak in it for anyone who sees them home from Leipzig.',
  m5: 'The Sky Queen is one of the senior ships in the group now, with eighteen missions behind her. Lieutenant Doyle is back from hospital with a piece of Frankfurt flak on his key ring, and nobody aboard will say the word Schweinfurt out loud. The last time we went there, sixty Fortresses stayed behind. Not today.',
  m6: 'Sergeant Gallo is calling every station that will listen. Lieutenant Stern has us on a heading for the coast, and Captain Brenner has told the crew that the Sky Queen did not carry them through twenty-one missions to let them down now. Hold on.',
  m7: 'The Sky Queen made it home on two engines two days ago. The ground crew worked on her all night, and she is flying today with the men who would not leave her. When you see a Fortress with a crown painted under the cockpit, give her a little extra cover. She has three missions to go.',
};
for (const m of CAMPAIGN) if (STORY[m.id] && !m.briefing.includes(STORY[m.id])) m.briefing.push(STORY[m.id]);

for (const { after, ...m } of STORY_MISSIONS) {
  if (CAMPAIGN.some((c) => c.id === m.id)) continue;
  const i = CAMPAIGN.findIndex((c) => c.id === after);
  CAMPAIGN.splice(i < 0 ? CAMPAIGN.length : i + 1, 0, m);
}
CAMPAIGN.forEach((m, i) => (m.number = i + 1));

// Saved progress keeps the unlocked campaign index. A profile saved with the original
// seven-mission order is moved to the same mission in the new order, once (`layout` marks it).
export const CAMPAIGN_LAYOUT = 2;
const LEGACY_ORDER = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
export function migrateProgress<P extends { unlocked: number; medals?: Record<string, string[]>; layout?: number }>(p: P, ids = CAMPAIGN.map((m) => m.id)): P {
  if ((p.layout ?? 1) >= CAMPAIGN_LAYOUT) return p;
  const old = LEGACY_ORDER[Math.max(0, Math.min(LEGACY_ORDER.length - 1, Math.floor(p.unlocked || 0)))];
  let u = Math.max(0, ids.indexOf(old));
  // the old last mission was completed: the mission after it opens too
  if (old === 'm7' && p.medals?.m7?.includes('Air Medal')) u = Math.min(ids.length - 1, u + 1);
  p.unlocked = Math.max(p.unlocked || 0, u);
  p.layout = CAMPAIGN_LAYOUT;
  return p;
}
// Runs before Game reads the profile (Game imports this module). A profile that does not exist
// yet is created in the new order, so it is only marked.
try {
  if (typeof localStorage !== 'undefined') {
    const KEY = 'sws3d.progress.v1';
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    if (!p) localStorage.setItem(KEY, JSON.stringify({ unlocked: 0, medals: {}, best: {}, survival: [], layout: CAMPAIGN_LAYOUT }));
    else if (typeof p === 'object' && (p.layout ?? 1) < CAMPAIGN_LAYOUT) localStorage.setItem(KEY, JSON.stringify(migrateProgress(p)));
  }
} catch { /* storage unavailable */ }

// Rounds of 3-5 minutes; the flak and bombing times sit inside them
const ROUNDS: Record<string, Round> = {
  m1: { duration: 180, start: 7, min: 4, max: 7, skill: [0.8, 1.0] },
  m2: { duration: 210, start: 6, min: 5, max: 9, skill: [0.9, 1.1] },
  m3: { duration: 240, start: 6, min: 5, max: 9, skill: [0.95, 1.15], rockets: 0.15 },
  m4: { duration: 240, start: 8, min: 6, max: 11, skill: [0.95, 1.15] },
  m5: { duration: 270, start: 6, min: 6, max: 12, skill: [1.0, 1.25], rockets: 0.35 },
  m6: { duration: 240, start: 6, min: 5, max: 10, skill: [1.0, 1.2] },
  m7: { duration: 300, start: 8, min: 7, max: 14, skill: [1.05, 1.3], rockets: 0.3 },
  // story-arc missions
  m8: { duration: 270, start: 6, min: 8, max: 14, skill: [0.95, 1.2], rockets: 0.45 },   // Black Thursday: the mass attack
  m9: { duration: 240, start: 8, min: 6, max: 11, skill: [0.95, 1.15] },                  // P-51 through the storm front
  m10: { duration: 240, start: 6, min: 4, max: 9, skill: [1.0, 1.2] },                    // crippled, alone over the Channel
  m11: { duration: 270, start: 6, min: 5, max: 11, skill: [1.0, 1.25], rockets: 0.2 },    // flak on the bomb run
  m12: { duration: 320, start: 8, min: 8, max: 15, skill: [1.1, 1.35], rockets: 0.35 },   // the finale, four rounds
};
for (const m of CAMPAIGN) {
  const r = ROUNDS[m.id];
  if (!r) continue;
  m.round = r;
  m.duration = r.duration;
  m.rounds = m.rounds ?? (m.number <= 2 ? 2 : 3);
  if (m.maxBombersLost !== undefined && m.maxBombersLost < 99) {
    m.maxBombersLost += 3; // more fighters, more losses allowed
    // keep the objective text in step with the real limit
    m.objectives = m.objectives.map((o) => o.replace(/Lose no more than \d+ bombers/, `Lose no more than ${m.maxBombersLost} bombers`));
  }
}

export function survivalMission(role: 'gunner' | 'pilot'): Mission {
  return {
    round: { duration: Infinity, start: 6, min: 3, max: 16, skill: [0.8, 1.5], rockets: 0.25 },
    rounds: Infinity,
    id: 'survival-' + role, number: 0, title: role === 'gunner' ? 'Survival — Gunner' : 'Survival — Escort', target: 'Endless waves', date: 'Somewhere over the Reich', role,
    station: 'waistL', briefing: ['Endless waves of fighters, growing stronger every time. How long can you hold out?'],
    objectives: ['Survive as many waves as possible'], bombers: 12, escorts: role === 'pilot' ? 2 : 0, waves: [], duration: Infinity, maxBombersLost: 99,
  };
}

// Round i (0-based) of a mission: campaign missions split their engagement into rounds that
// get harder one after another; survival rounds escalate without end.
export function roundDef(m: Mission, i: number): Round {
  const base = m.round!;
  const n = m.rounds ?? 1;
  if (m.flatRounds) {
    // custom battles: each round flies the configured numbers; later rounds get slightly sharper
    const k = Number.isFinite(n) ? (n > 1 ? i / (n - 1) : 0) : Math.min(1, i / 8);
    const grow = 0.12 * k;
    return {
      duration: base.duration, start: i === 0 ? base.start : 4, min: base.min, max: base.max,
      skill: [base.skill[0] + grow, base.skill[1] + grow], rockets: base.rockets ?? 0,
    };
  }
  if (!Number.isFinite(n)) {
    return {
      duration: 100, start: 5, min: Math.min(14, 3 + i), max: Math.min(20, 5 + 2 * i),
      skill: [Math.min(1.5, 0.8 + 0.06 * i), Math.min(1.65, 0.9 + 0.07 * i)], rockets: i >= 2 ? Math.min(0.4, 0.1 * i) : 0,
    };
  }
  const f0 = i / n, f1 = (i + 1) / n;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return {
    duration: Math.round(base.duration / n), start: i === 0 ? base.start : 4,
    min: Math.round(lerp(base.min, base.max, f0 * 0.8)), max: Math.round(lerp(base.min, base.max, f1)),
    skill: [lerp(base.skill[0], base.skill[1], f0), lerp(base.skill[0], base.skill[1], f1)],
    rockets: base.rockets && i > 0 ? base.rockets : 0,
  };
}

// Battle-group (boss) rounds, BossBattle.ts.
// Survival: every 3rd round (index 2, 5, 8 ...). Campaign: the final round of missions 5 and 7.
// A mission can name its own battle-group rounds with `boss` (custom battles, weekly challenge).
export function isBossRound(m: Mission, roundIdx: number): boolean {
  if (!m.round) return false;
  if (m.boss === false) return false;
  if (m.boss) {
    const { first, every } = m.boss;
    return roundIdx === first || (!!every && every > 0 && roundIdx > first && (roundIdx - first) % every === 0);
  }
  const n = m.rounds ?? 1;
  if (!Number.isFinite(n)) return roundIdx % 3 === 2;
  return ['m5', 'm7', 'm12'].includes(m.id) && roundIdx === n - 1; // Sturmgruppe, Big Week and the campaign finale
}
