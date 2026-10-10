import type { EnemyType } from '../world/EnemyTypes';

// Scripted rounds for the P-51 escort missions (data only; PilotOps.ts flies them).
// Each campaign pilot mission lists one PilotRound per round:
//   intercept  – attack groups heading for the bombers: catch them before they reach the box
//   sweep      – Jagd sweeps (often in leader/wingman pairs) hunting the Mustang: dogfight
//   straggler  – a Fortress is knocked out of formation and the wolves go for it: save it

export type PilotRoundKind = 'intercept' | 'sweep' | 'straggler';
export type PilotGroupGoal = 'bombers' | 'player' | 'straggler' | 'mixed';
export type PilotFrom = 'front' | 'rear' | 'left' | 'right' | 'high';

export interface PilotGroup {
  at: number;                 // s into the round (with afterClear: s after the sky is clear)
  afterClear?: boolean;       // wait until the earlier groups are down (or 60 s with <= 2 left, 110 s at most)
  types: EnemyType[];         // one entry per aircraft
  from: PilotFrom;
  goal: PilotGroupGoal;
  skill: number;
  rockets?: number;           // share carrying Wgr. 21 rockets
  pairs?: boolean;            // fly as leader + wingman pairs (goal 'player')
  radio?: [string, string];
}

export interface PilotRound {
  kind: PilotRoundKind;
  title: string;              // banner subtitle
  objective: string;          // HUD objective line
  groups: PilotGroup[];
  straggleAt?: number;        // straggler round: s into the round when a B-17 falls out
  holdFor?: number;           // ... and how long it must be kept alive after that
  maxTime: number;            // the round ends by this time whatever is left in the air
}

export const PILOT_ROUNDS: Record<string, PilotRound[]> = {
  // Mission 4 — Little Friends (Leipzig)
  m4: [
    {
      kind: 'intercept', title: 'Intercept — head them off before they reach the box', objective: 'Intercept the attackers before they reach the bombers', maxTime: 170,
      groups: [
        { at: 7, types: ['fw190', 'fw190', 'fw190', 'fw190'], from: 'front', goal: 'bombers', skill: 0.9, radio: ['Lead', 'Bandits twelve o\'clock low, climbing for the bombers. Get between them and the big friends!'] },
        { at: 4, afterClear: true, types: ['bf110', 'bf110', 'fw190'], from: 'rear', goal: 'bombers', skill: 0.95, rockets: 0.6, radio: ['Big Friend', 'Little friends, twin-engine bandits closing at our six — they\'ve got rockets!'] },
        { at: 4, afterClear: true, types: ['fw190', 'fw190', 'fw190', 'bf109', 'bf109'], from: 'left', goal: 'mixed', skill: 1.0, radio: ['Lead', 'Another gaggle, nine o\'clock level. Some of them are coming for us!'] },
      ],
    },
    {
      kind: 'sweep', title: 'Fighter sweep — the 109s are hunting the escort', objective: 'Dogfight the sweep — keep them off the bombers', maxTime: 170,
      groups: [
        { at: 5, types: ['bf109', 'bf109', 'bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 0.95, radio: ['Lead', 'Heads up — 109s high at six, coming down on us! Break and engage!'] },
        { at: 45, types: ['fw190', 'fw190'], from: 'front', goal: 'bombers', skill: 1.0, radio: ['Big Friend', 'Bandits on the bombers, twelve o\'clock! Little friends, where are you?'] },
        { at: 4, afterClear: true, types: ['fw190', 'fw190', 'bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 1.05, radio: ['Lead', 'Focke-Wulfs diving out of the sun — don\'t try to out-climb them!'] },
      ],
    },
    {
      kind: 'straggler', title: 'Save the straggler — a Fortress is falling out', objective: 'Cover the straggler', maxTime: 200, straggleAt: 18, holdFor: 70,
      groups: [
        { at: 6, types: ['fw190', 'fw190', 'fw190'], from: 'front', goal: 'bombers', skill: 1.0 },
        { at: 22, types: ['fw190', 'fw190', 'bf110'], from: 'rear', goal: 'straggler', skill: 1.0, radio: ['Lead', 'Bandits going for the cripple! Blue two, get back there and cover her!'] },
        { at: 48, types: ['bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 1.05 },
        { at: 66, types: ['bf109', 'fw190', 'fw190'], from: 'rear', goal: 'straggler', skill: 1.1, radio: ['Big Friend', 'More of them coming in on our tail — we can\'t take another pass!'] },
        { at: 5, afterClear: true, types: ['fw190', 'fw190', 'fw190', 'fw190', 'bf110'], from: 'front', goal: 'bombers', skill: 1.1, radio: ['Lead', 'One last pass at the box, twelve o\'clock. Let\'s finish this!'] },
      ],
    },
  ],
  // Mission 7 — Big Week (Berlin)
  m7: [
    {
      kind: 'intercept', title: 'Intercept — break up the Zerstörer attack', objective: 'Break up the attacks before they reach the bombers', maxTime: 190,
      groups: [
        { at: 6, types: ['fw190', 'fw190', 'fw190', 'fw190', 'fw190'], from: 'front', goal: 'bombers', skill: 1.05, rockets: 0.3, radio: ['Lead', 'Big gaggle at twelve o\'clock — drop tanks and go! Hit them before they reach the box!'] },
        { at: 4, afterClear: true, types: ['bf110', 'bf110', 'bf110', 'fw190', 'fw190'], from: 'rear', goal: 'bombers', skill: 1.1, rockets: 0.6, radio: ['Big Friend', 'Zerstörers at six o\'clock, with rockets! Get them off us!'] },
        { at: 4, afterClear: true, types: ['me262', 'me262', 'fw190', 'fw190', 'fw190'], from: 'front', goal: 'mixed', skill: 1.1, radio: ['Lead', 'Jets! Twelve o\'clock high, fast movers — go for them when they slow down!'] },
      ],
    },
    {
      kind: 'sweep', title: 'Fighter sweep — 109s and jets over Berlin', objective: 'Win the dogfight — keep them off the bombers', maxTime: 190,
      groups: [
        { at: 5, types: ['bf109', 'bf109', 'bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 1.1, radio: ['Lead', 'Messerschmitts, high at five o\'clock! Here they come — break!'] },
        { at: 28, types: ['me262', 'me262'], from: 'high', goal: 'player', skill: 1.15, radio: ['Lead', 'Jets coming through! You won\'t out-run them — turn inside them!'] },
        { at: 48, types: ['fw190', 'fw190', 'fw190'], from: 'front', goal: 'bombers', skill: 1.1, radio: ['Big Friend', 'Fighters on the bombers, twelve o\'clock level!'] },
        { at: 4, afterClear: true, types: ['fw190', 'fw190', 'bf109', 'bf109', 'bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 1.2, radio: ['Lead', 'They\'re sending another Gruppe down on us. Stay together!'] },
      ],
    },
    {
      kind: 'straggler', title: 'Save the straggler — a crippled Fortress over Berlin', objective: 'Cover the straggler', maxTime: 220, straggleAt: 16, holdFor: 80,
      groups: [
        { at: 6, types: ['fw190', 'fw190', 'fw190', 'bf110'], from: 'front', goal: 'bombers', skill: 1.15 },
        { at: 20, types: ['fw190', 'fw190', 'bf110', 'bf110'], from: 'rear', goal: 'straggler', skill: 1.15, rockets: 0.5, radio: ['Lead', 'They\'re on the straggler! Blue two, cover her, I\'ll take the box!'] },
        { at: 44, types: ['bf109', 'bf109'], from: 'high', goal: 'player', pairs: true, skill: 1.2 },
        { at: 64, types: ['me262', 'fw190', 'fw190'], from: 'rear', goal: 'straggler', skill: 1.2, radio: ['Big Friend', 'Jet coming up our tail! Somebody get him off us!'] },
        { at: 5, afterClear: true, types: ['fw190', 'fw190', 'fw190', 'fw190', 'me262', 'bf110'], from: 'front', goal: 'bombers', skill: 1.25, radio: ['Lead', 'Last push — they\'re throwing everything at the box!'] },
      ],
    },
  ],
};
