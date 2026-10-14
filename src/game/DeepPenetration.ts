import type { Mission } from './Missions';

// Historical retrospective, separate from the original tour's stable order and saves.
export const DEEP_PENETRATION: Mission[] = [
  {
    "id": "dp1",
    "number": 1,
    "title": "Regensburg Shuttle",
    "target": "Aircraft works, Regensburg",
    "date": "17 August 1943",
    "role": "gunner",
    "station": "waistL",
    "briefing": [
      "On 17 August 1943, the Eighth Air Force attacks Regensburg and Schweinfurt. Our force strikes the Messerschmitt works at Regensburg, then continues south across the Alps to North Africa. Fog has delayed the Schweinfurt force; the intended diversion is coming apart.",
      "The short-range escort cannot follow us deep into Germany. Expect Fw 190s and Bf 109s from both beams, with Bf 110s behind. Cover a damaged Fortress falling out of the box before we reach the assembly halls beside the Danube.",
      "This chapter revisits historical raids with our fictional crew and existing aircraft. Combat time and geography are compressed. After bombs away, hold the southern course: this sortie ends on the shuttle route, not back in England."
    ],
    "objectives": [
      "Defend the formation",
      "Fight through to the target",
      "Lose no more than 6 bombers"
    ],
    "success": "Bombs away at Regensburg. The formation turns south for North Africa.",
    "bombers": 12,
    "escorts": 0,
    "waves": [],
    "round": {
      "duration": 270,
      "start": 7,
      "min": 4,
      "max": 8,
      "skill": [
        0.9,
        1.12
      ],
      "rockets": 0.3
    },
    "rounds": 1,
    "duration": 270,
    "maxBombersLost": 6,
    "boss": false,
    "specials": false,
    "tactics": [
      "multiAxis"
    ],
    "signature": {
      "id": "straggler",
      "at": 65
    },
    "targetLook": 1,
    "bombsAway": 125,
    "flak": {
      "start": 100,
      "end": 155,
      "intensity": 1.1
    },
    "enemyTypes": [
      "fw190",
      "bf109",
      "bf110"
    ],
    "weather": {
      "sunEl": 38,
      "sunAz": 190,
      "low": 0.35,
      "high": 0.4,
      "preset": "clear",
      "mood": "clear"
    },
    "shuttle": true
  },
  {
    "id": "dp2",
    "number": 2,
    "title": "Schweinfurt: Black Thursday",
    "target": "Bearing factories, Schweinfurt",
    "date": "14 October 1943",
    "role": "gunner",
    "station": "ball",
    "briefing": [
      "On 14 October 1943, the Eighth returns to the ball-bearing factories at Schweinfurt. The August raid did not stop production for long. Once the escort turns back, the Fortresses must fight their way to the target and out again without fighter cover.",
      "Expect repeated single-engine attacks and rocket-carrying Bf 110s and Ju 88s. Watch the high fighters: they may drop bombs into the box. Switch to the top turret to interrupt them, then cover the low squadron through the bomb run.",
      "The long factory roofs and rail sidings mark the aiming area. A neighbouring ship will be hit in the bomb bay; keep clear of the wreckage and hold your station. The crew will remember the empty bunks after this one."
    ],
    "objectives": [
      "Defend the formation",
      "Fight through to the target",
      "Lose no more than 6 bombers"
    ],
    "success": "The bearing works are hit. Count the returning ships before calling it a victory.",
    "bombers": 12,
    "escorts": 0,
    "waves": [],
    "round": {
      "duration": 285,
      "start": 7,
      "min": 4,
      "max": 8,
      "skill": [
        0.9,
        1.12
      ],
      "rockets": 0.3
    },
    "rounds": 1,
    "duration": 285,
    "maxBombersLost": 6,
    "boss": false,
    "specials": false,
    "tactics": [
      "airBomb"
    ],
    "signature": {
      "id": "bombBay",
      "at": 65
    },
    "targetLook": 2,
    "bombsAway": 135,
    "flak": {
      "start": 110,
      "end": 165,
      "intensity": 1.5
    },
    "enemyTypes": [
      "fw190",
      "bf109",
      "bf110",
      "ju88"
    ],
    "weather": {
      "sunEl": 28,
      "sunAz": 200,
      "low": 0.5,
      "high": 0.4,
      "preset": "clear",
      "mood": "clear"
    },
    "shuttle": false
  },
  {
    "id": "dp3",
    "number": 3,
    "title": "Big Week: Leipzig",
    "target": "Aircraft assembly, Leipzig",
    "date": "20 February 1944",
    "role": "gunner",
    "station": "top",
    "briefing": [
      "Operation Argument opens on 20 February 1944. The Eighth strikes aircraft factories across Germany; our objective is the Leipzig aircraft industry. Assembly sheds and the nearby airfield stand out against the winter ground.",
      "Long-range escort now reaches deeper into Germany. Keep firing until the Mustangs arrive. Me 410 heavy fighters may stand off with cannon while the single-engine fighters close; the top turret must cover both threats.",
      "Two little friends will dive past the formation to clear a pursuer. Check your fire as they cross. Dawson has kept his promise to buy an escort pilot dinner; tonight he may finally get to pay the bill."
    ],
    "objectives": [
      "Defend the formation",
      "Fight through to the target",
      "Lose no more than 6 bombers"
    ],
    "success": "The Leipzig assembly halls are hit. This time the escort stays with us.",
    "bombers": 12,
    "escorts": 0,
    "waves": [],
    "round": {
      "duration": 300,
      "start": 7,
      "min": 4,
      "max": 8,
      "skill": [
        0.9,
        1.12
      ],
      "rockets": 0.15
    },
    "rounds": 1,
    "duration": 300,
    "maxBombersLost": 6,
    "boss": false,
    "specials": false,
    "tactics": [
      "hornisse"
    ],
    "signature": {
      "id": "littleFriends",
      "at": 65
    },
    "targetLook": 3,
    "bombsAway": 145,
    "flak": {
      "start": 120,
      "end": 175,
      "intensity": 1.25
    },
    "enemyTypes": [
      "fw190",
      "bf109",
      "bf110",
      "me410"
    ],
    "weather": {
      "sunEl": 19,
      "sunAz": 210,
      "low": 0.72,
      "high": 0.4,
      "preset": "snow",
      "mood": "clear"
    },
    "shuttle": false,
    "escortArrive": 70
  },
  {
    "id": "dp4",
    "number": 4,
    "title": "Berlin: The Long Road",
    "target": "Industrial rail district, Berlin",
    "date": "6 March 1944",
    "role": "gunner",
    "station": "waistR",
    "briefing": [
      "On 6 March 1944, a major American bomber force reaches Berlin. The earlier attempt on 4 March had been reduced by weather. Today the industrial districts and railway network lie at the end of a long, heavily defended route.",
      "Escort reliefs cover the stream, but the enemy can still converge from three and nine together. Pick one pair and break its approach. No jets are expected on this March raid; the danger is coordinated conventional fighters and heavy flak.",
      "A damaged fighter may tumble into the box. Stop it before it strikes a Fortress. Beyond the mist, follow the broad street grid and rail yards through the bomb run, then stay alert for attacks on the return leg."
    ],
    "objectives": [
      "Defend the formation",
      "Fight through to the target",
      "Lose no more than 6 bombers"
    ],
    "success": "Berlin is behind us. The crew brings home a route chart full of holes.",
    "bombers": 12,
    "escorts": 0,
    "waves": [],
    "round": {
      "duration": 315,
      "start": 7,
      "min": 4,
      "max": 8,
      "skill": [
        0.9,
        1.12
      ],
      "rockets": 0.15
    },
    "rounds": 1,
    "duration": 315,
    "maxBombersLost": 6,
    "boss": false,
    "specials": false,
    "tactics": [
      "multiAxis"
    ],
    "signature": {
      "id": "collision",
      "at": 65
    },
    "targetLook": 4,
    "bombsAway": 155,
    "flak": {
      "start": 130,
      "end": 185,
      "intensity": 1.6
    },
    "enemyTypes": [
      "fw190",
      "bf109",
      "bf110",
      "me410"
    ],
    "weather": {
      "sunEl": 22,
      "sunAz": 220,
      "low": 0.8,
      "high": 0.4,
      "preset": "fog",
      "mood": "overcast"
    },
    "shuttle": false,
    "escortArrive": 70
  },
  {
    "id": "dp5",
    "number": 5,
    "title": "Merseburg: The Oil War",
    "target": "Leuna synthetic oil works, Merseburg",
    "date": "2 November 1944",
    "role": "gunner",
    "station": "tail",
    "briefing": [
      "On 2 November 1944, the oil offensive returns to the Leuna synthetic fuel works near Merseburg. Fuel shortages are hurting German flying and training, but the refinery is still producing. Its tank farms and processing blocks are our aiming area.",
      "Merseburg is protected by concentrated heavy flak. Armoured Fw 190 formations and Bf 109s remain dangerous; late-war jets may make brief passes. Keep the tail guns ready, and switch forward when the armoured wedge assembles.",
      "A Fortress beside us will take a direct flak hit. There is no fighter to shoot at in that moment: stay steady and protect the survivors. The target is fuel production; the crew's measure of success is how many men come home."
    ],
    "objectives": [
      "Defend the formation",
      "Fight through to the target",
      "Lose no more than 6 bombers"
    ],
    "success": "The Leuna works burn below. The chapter ends with the crew counting survivors.",
    "bombers": 12,
    "escorts": 0,
    "waves": [],
    "round": {
      "duration": 330,
      "start": 7,
      "min": 4,
      "max": 8,
      "skill": [
        0.9,
        1.12
      ],
      "rockets": 0.15
    },
    "rounds": 1,
    "duration": 330,
    "maxBombersLost": 6,
    "boss": false,
    "specials": false,
    "tactics": [
      "sturm"
    ],
    "signature": {
      "id": "flakHit",
      "at": 65
    },
    "targetLook": 5,
    "bombsAway": 165,
    "flak": {
      "start": 140,
      "end": 195,
      "intensity": 2.2
    },
    "enemyTypes": [
      "fw190",
      "bf109",
      "me262"
    ],
    "weather": {
      "sunEl": 12,
      "sunAz": 230,
      "low": 0.88,
      "high": 0.4,
      "preset": "lightRain",
      "mood": "overcast"
    },
    "shuttle": false,
    "escortArrive": 70
  }
];

export const isChapterMission = (id: string) => DEEP_PENETRATION.some(m => m.id === id);

interface ChapterProgress { medals?: Record<string, string[]> }
interface TourEvidence { complete?: boolean; tour?: number; storyDone?: string[]; secondTour?: unknown }
/** Derive access from existing save evidence; never rewrite first/second-tour records. */
export function chapterUnlocked(p: ChapterProgress, d: TourEvidence = {}): boolean {
  return !!(p.medals?.m12?.includes('Air Medal') || d.complete || (d.tour ?? 1) > 1 || d.secondTour || d.storyDone?.includes('m12'));
}
export function chapterCompleted(p: ChapterProgress): number {
  const i = DEEP_PENETRATION.findIndex(m => !p.medals?.[m.id]?.includes('Air Medal'));
  return i < 0 ? DEEP_PENETRATION.length : i;
}
export function chapterCanFly(id: string, p: ChapterProgress, d: TourEvidence = {}): boolean {
  const i = DEEP_PENETRATION.findIndex(m => m.id === id);
  return chapterUnlocked(p, d) && i >= 0 && i <= chapterCompleted(p);
}
