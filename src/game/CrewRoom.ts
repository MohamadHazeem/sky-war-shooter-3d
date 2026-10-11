import { isSecondTourId } from './SecondTour';
// Crew-room interludes (Phase 5 goal 30): after a successful story mission, before the campaign
// map, a short scene in the Nissen hut or at the club where the Sky Queen's crew talks the
// mission over. This file is the content and the selection logic only: pure data and maths with
// type-only imports, so it is unit-tested in Node and read by tools/voice/crewroom.mjs, which
// copies every recorded line into tools/voice/lines.json. The scene itself (the drawn hut, the
// portraits, subtitles, voices and ambience) is ui/CrewRoomScene.ts.
//
// Each vignette has opening and closing lines written for its mission (the briefing story,
// autumn 1943 to spring 1944, the 401st Bomb Group at Deenethorpe), and a block of lines picked
// from the mission's outcome in between: who was wounded (in the hospital, or patched up and
// back), how many bombers went down (an empty bunk when the losses were heavy), the named
// Luftwaffe Experten the crew met, the strategic state (Luftwaffe weaker or stronger) and the
// player's kills and accuracy. Mission 12 closes the tour with a longer epilogue.
//
// Recorded lines: every line without `dyn` has a clip per voice role of its speakers (`who` and
// `alt`); a line with `key` has one clip per value of VAR_VALUES[key] ({name}, {nick}, {ace},
// {n} in its text). `dyn` lines carry runtime numbers and are spoken by the browser's speech
// synthesis. A speaker who is not in the room (in the hospital, or away in the story) loses his
// line to the next present man in `alt`, or the line is dropped.
import type { ManId } from './CrewRoster';
import type { Fate } from './Nemesis';

export type Speaker = ManId;
export type Cue = 'gramophone';
export type Slot = 'wounds' | 'losses' | 'aces' | 'stats' | 'strategy' | 'rookies' | 'tour';
export type VarKey = 'name' | 'nick' | 'ace' | 'n';

export interface CrewRoomCtx {
  mission: string;
  role: 'gunner' | 'pilot';
  kills: number;
  shots: number;
  hits: number;
  lost: number;            // bombers lost from the formation
  total: number;           // bombers in the formation
  hospital: Speaker[];     // wounded this mission and out for the next one
  memorial?: Speaker[];   // permanent casualties; absent from every later scene
  patched: Speaker[];      // wounded this mission, fit again
  rookies: { rookie: string; for: Speaker }[];   // replacements who flew for a resting man
  aces: { last: string; fate: Fate; byPlayer: boolean }[];
  luftwaffe: number;       // strategic Luftwaffe strength after this mission (100 = the start)
  tour?: { kills: number; lost: number };       // the whole tour (finale)
}

export interface LineDef {
  id: string;
  who: Speaker;
  alt?: Speaker[];
  text: string;
  key?: VarKey;
  dyn?: boolean;
  self?: boolean;          // spoken by the man the line is about (wounds)
  if?: (c: CrewRoomCtx) => boolean;
  say?: string;            // how `say` should pronounce it (recorded lines)
  cue?: Cue;
}

export interface Vignette {
  id: string;              // mission id
  setting: 'hut' | 'club';
  place: string;           // caption, English (phrase tables translate it)
  time: string;
  weather: 'rain' | 'fog' | 'snow' | 'clear' | 'storm' | 'dusk';
  absent?: Speaker[];      // away in the story (Doyle in the hospital after Frankfurt)
  emptyBunk?: boolean;     // bunks emptied by the story, whatever today's losses
  noBunk?: boolean;        // no empty-bunk lines (the vignette already talks about it)
  skip?: Slot[];           // outcome lines this vignette leaves out
  gramophone?: boolean;    // the gramophone plays from the start (the club)
  finale?: boolean;
  order?: Slot[];
  open: LineDef[];
  close: LineDef[];
}

export interface SceneLine {
  id: string;
  who: Speaker;
  text: string;                               // English, {placeholders} filled by vars
  vars?: Record<string, string | number>;     // English values (what is spoken)
  show?: Record<string, string | number>;     // display values for the translation (else vars)
  dyn?: boolean;
  cue?: Cue;
}

export interface Scene { v: Vignette; lines: SceneLine[]; present: Speaker[]; emptyBunk: boolean; memorial: Speaker[] }

// ---------------- voices ----------------

// recorded voice role (tools/voice/lines.json roles) for each crewman: his position's voice
export const VOICE_ROLE: Record<Speaker, string> = {
  brenner: 'pilot', doyle: 'copilot', stern: 'nav', kessler: 'bombardier', mendez: 'top',
  gallo: 'radio', reilly: 'ball', price: 'waist', walsh: 'waist', dawson: 'tail',
};
// the two waist gunners share a voice: Price drawls, Walsh is quick
export const SPEAKER_RATE: Partial<Record<Speaker, number>> = { price: 180, walsh: 206 };
export const ALL_MEN: Speaker[] = ['brenner', 'doyle', 'stern', 'kessler', 'mendez', 'gallo', 'reilly', 'price', 'walsh', 'dawson'];

// ---------------- recorded variables ----------------

// how the crew speaks of a man (third person) and to him (his nickname)
export const NAME_OF: Record<Speaker, string> = {
  brenner: 'the Skipper', doyle: 'Lieutenant Doyle', stern: 'Lieutenant Stern', kessler: 'Lieutenant Kessler', mendez: 'Mendez',
  gallo: 'Gallo', reilly: 'Reilly', price: 'Price', walsh: 'Walsh', dawson: 'Dawson',
};
export const NICK_OF: Record<Speaker, string> = {
  brenner: 'Skipper', doyle: 'Irish', stern: 'Prof', kessler: 'Deadeye', mendez: 'Wrench',
  gallo: 'Sparks', reilly: 'Shorty', price: 'Tex', walsh: 'Lucky', dawson: 'Hawkeye',
};
// Luftwaffe Experten surnames: the same list as Nemesis.SURNAMES (tests keep them in step)
export const ACE_SURNAMES = ['Brückner', 'Dorn', 'Eckhardt', 'Faber', 'Gebhardt', 'Hollmann', 'Kranz', 'Lindner', 'Neumeyer', 'Ostermann', 'Pfeiffer', 'Reuter',
  'Sauer', 'Thalberg', 'Vossberg', 'Wendt', 'Zeller', 'Kaltenbach', 'Riedel', 'Stahl', 'Winterfeld', 'Haller', 'Ritter', 'Engel'];
// heavy losses, spelled out: index = ships lost - 3
export const LOSS_WORDS = ['Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export const VAR_VALUES: Record<VarKey, string[]> = {
  name: ALL_MEN.map((m) => NAME_OF[m]),
  nick: ALL_MEN.map((m) => NICK_OF[m]),
  ace: ACE_SURNAMES,
  n: LOSS_WORDS,
};

// ---------------- conditions ----------------

export const isHeavy = (c: CrewRoomCtx) => c.lost >= 3 || (c.total > 0 && c.lost / c.total >= 0.25);
export const accuracy = (c: CrewRoomCtx) => (c.shots > 0 ? c.hits / c.shots : 0);
export const LW_WEAK = 92, LW_STRONG = 108;
export type LwTrend = 'weaker' | 'stronger' | 'even';
export const lwTrend = (lw: number): LwTrend => (lw <= LW_WEAK ? 'weaker' : lw >= LW_STRONG ? 'stronger' : 'even');

// ---------------- shared lines (the outcome block) ----------------

const L = (id: string, who: Speaker, text: string, o: Partial<LineDef> = {}): LineDef => ({ id, who, text, ...o });

export const POOL = {
  // wounds: in the hospital
  hosp1: L('cr_hosp_{i}', 'gallo', 'Doc says {name} will be in the hospital a week or two. I\'ll take him his mail.', { alt: ['mendez'], key: 'name' }),
  hosp2: L('cr_hosp2_{i}', 'stern', '{name} is in the next bed over. He asked us to keep his place by the stove.', { alt: ['kessler'], key: 'name' }),
  hospOne: L('cr_hosp_visit', 'brenner', 'We\'ll go over and see him in the morning.', { alt: ['doyle'] }),
  hospTwo: L('cr_hosp_visit2', 'brenner', 'We\'ll go over and see them both in the morning.', { alt: ['doyle'] }),
  // wounds: patched up and back
  patchQ: L('cr_patch_q_{i}', 'brenner', 'How are you holding up, {nick}?', { alt: ['doyle'], key: 'nick' }),
  patchA: L('cr_patch_a', 'brenner', 'Doc put a few stitches in it. I\'ll be flying the next one.', { self: true, alt: ['doyle', 'stern', 'kessler', 'mendez', 'gallo', 'reilly', 'price', 'dawson'] }),
  // losses
  lost0: L('cr_lost_0', 'stern', 'Every ship in the group came home today. I counted them twice.', { alt: ['brenner', 'kessler'] }),
  lost1: L('cr_lost_1', 'stern', 'One ship didn\'t come back today. Ten men.', { alt: ['brenner', 'kessler'] }),
  lost2: L('cr_lost_2', 'stern', 'Two ships went down today. Twenty men.', { alt: ['brenner', 'kessler'] }),
  lostN: L('cr_lost_n_{i}', 'stern', '{n} ships didn\'t come back today. I wrote down every name I knew.', { alt: ['brenner', 'kessler'], key: 'n' }),
  lostMany: L('cr_lost_many', 'stern', '{n} ships didn\'t come back today. I wrote down every name I knew.', { alt: ['brenner', 'kessler'], dyn: true }),
  bunk: L('cr_bunk', 'walsh', 'They came for the bunks across the aisle an hour ago. Folded the blankets. Took the photographs down.', { alt: ['price', 'dawson'] }),
  bunkReply: L('cr_bunk_reply', 'mendez', 'Nobody sleeps in those bunks tonight. Leave them be.', { alt: ['brenner'] }),
  // the named Experten
  aceDown: L('cr_ace_down_{i}', 'dawson', '{ace} won\'t be back. I watched him go down.', { key: 'ace' }),
  aceAway: L('cr_ace_away_{i}', 'dawson', '{ace} got away from us again. He\'ll be back.', { key: 'ace' }),
  aceYours: L('cr_ace_yours', 'brenner', 'That was your shooting. Don\'t go looking for a parade. There was a man in that cockpit, too.', { alt: ['doyle'] }),
  // strategic picture
  lwWeak: L('cr_lw_weak', 'kessler', 'Intelligence says the Luftwaffe is running short of pilots. You can see it. The new ones break off early.', { alt: ['stern'] }),
  lwStrong: L('cr_lw_strong', 'gallo', 'Intelligence says they\'re stronger than they were a month ago. More of them every time we go.', { alt: ['kessler'] }),
  lwStrongReply: L('cr_lw_strong_reply', 'brenner', 'Then we fly a tighter formation.', { alt: ['doyle'] }),
  lwEven: L('cr_lw_even', 'stern', 'Intelligence calls it even. They lose fighters, they build more. So do we.', { alt: ['kessler'] }),
  // the player's day: gunner
  gun0: L('cr_gun_0', 'price', 'Didn\'t get one today? Don\'t let it eat at you. Every burst you fired kept one of them off us.', { alt: ['walsh'] }),
  gun1: L('cr_gun_1', 'price', 'You got one today. Some fellows fly ten missions and never see one fall.', { alt: ['walsh'] }),
  gun3: L('cr_gun_3', 'walsh', 'The low squadron saw you knock them down, one after another. They\'re asking who was on that gun.', { alt: ['price'] }),
  gun5: L('cr_gun_5', 'gallo', 'Five or more in one day. They\'re putting your name in for the Cross, and I\'m telling everybody I know you.', { alt: ['reilly'] }),
  gunCount: L('cr_gun_count', 'stern', 'I checked the claims board. {kills} confirmed, and you hit with {acc} percent of your rounds.', { dyn: true, alt: ['kessler', 'brenner'] }),
  accHigh: L('cr_acc_high', 'price', 'You shoot like a man who\'s paying for his own shells.', { alt: ['walsh'] }),
  accLow: L('cr_acc_low', 'mendez', 'The armourers say you nearly burned out a barrel. Short bursts. Let the gun cool between them.', { alt: ['reilly'] }),
  // the player's day: the Mustang pilot at the club
  fly0: L('cr_fly_0', 'dawson', 'You didn\'t get one? Doesn\'t matter. Every time one of them saw you coming, he broke off.', { alt: ['reilly'] }),
  fly1: L('cr_fly_1', 'dawson', 'I watched you from the tail. You came down on them like a hawk on a chicken run.', { alt: ['reilly'] }),
  fly5: L('cr_fly_5', 'gallo', 'Five or more, the way Dawson tells it. Somebody paint a row of crosses under that canopy.', { alt: ['reilly'] }),
  flyCount: L('cr_fly_count', 'stern', 'By my count you got {kills} of them, and every one was heading for a bomber.', { dyn: true, alt: ['kessler', 'brenner'] }),
  // replacements
  rookie: L('cr_rookie', 'brenner', '{rookie} flew in {who}\'s place today. Not bad for a first mission.', { dyn: true, alt: ['doyle', 'stern'] }),
  // the finale: the tour in numbers
  tour: L('cr_tour', 'stern', 'Over the whole tour, we claimed {kills} fighters. The group lost {lost} Fortresses. I\'ll remember the second number longer.', { dyn: true, alt: ['kessler', 'brenner'] }),
} satisfies Record<string, LineDef>;

// ---------------- the twelve vignettes ----------------

const V = (id: string, v: Omit<Vignette, 'id' | 'open' | 'close'>, open: [Speaker, string, Partial<LineDef>?][], close: [Speaker, string, Partial<LineDef>?][]): Vignette => {
  let n = 0;
  const mk = ([who, text, o]: [Speaker, string, Partial<LineDef>?]) => L(`cr_${id}_${++n}`, who, text, o);
  return { id, ...v, open: open.map(mk), close: close.map(mk) };
};

export const VIGNETTES: Vignette[] = [
  V('m1', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'rain' }, [
    ['gallo', 'Well, that\'s one. First thing tomorrow I\'m painting a bomb under the window.'],
    ['mendez', 'I counted forty-one holes in her. Forty-one, and not one of them in us.'],
    ['stern', 'Emden on the first try. I said I would.'],
    ['reilly', 'Told you. Nobody can find me down in that ball.'],
    ['doyle', 'Nobody wants to, Shorty.'],
  ], [
    ['walsh', 'My hands didn\'t stop shaking till we crossed the English coast. Is that normal?'],
    ['brenner', 'It\'s normal. Mine haven\'t stopped yet.', { alt: ['doyle'] }],
    ['brenner', 'Get some sleep, all of you. One down. Twenty-four to go.', { alt: ['doyle'] }],
  ]),
  V('m2', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'fog' }, [
    ['kessler', 'They came straight at the nose. All I could see was the propeller hub and the guns winking at me.'],
    ['mendez', 'That top turret earned its keep today. Twin fifties, and somebody who knew what to do with them.'],
    ['gallo', 'Lieutenant, you\'ve been humming the same four bars since we landed.'],
    ['doyle', 'It helps. Don\'t ask me why. It helps.'],
  ], [
    ['stern', 'Two down. I\'m keeping the tally in the back of my navigation log.'],
    ['reilly', 'Fog\'s coming in. Maybe they\'ll stand us down tomorrow.'],
    ['brenner', 'Maybe. Sleep while you can.', { alt: ['doyle'] }],
  ]),
  V('m8', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'rain', emptyBunk: true, noBunk: true, skip: ['strategy'] }, [
    ['walsh', 'They came for the Lucky Lady\'s things an hour ago. Folded the blankets. Took the photographs off the wall.', { alt: ['price'] }],
    ['price', 'Their tail gunner owed me two dollars. I\'d give anything for him to walk in here and not pay it.'],
    ['stern', 'Sixty Fortresses. Six hundred men. I keep doing the arithmetic, and it keeps coming out the same.'],
    ['reilly', 'From the ball I could see the chutes. I tried to count them. I couldn\'t keep up.'],
    ['mendez', 'I lit a candle for them in the chapel. I didn\'t know what else to do.'],
  ], [
    ['walsh', 'Still got the rabbit\'s foot. I don\'t know if that makes me lucky, or them not.'],
    ['brenner', 'We came home. Tomorrow we\'ll think about why. Tonight, try to sleep.', { alt: ['doyle'] }],
  ]),
  V('m9', { setting: 'club', place: 'Deenethorpe · The Club', time: 'Night', weather: 'snow', gramophone: true }, [
    ['dawson', 'There he is. The Mustang that stayed with us all the way to Kiel. Sit down, sir. Dinner\'s on me.', { say: 'There he is. The Mustang that stayed with us all the way to Keel. Sit down, sir. Dinner\'s on me.' }],
    ['gallo', 'For a month, Hawkeye. You said a month. The whole ship heard you on the interphone.'],
    ['dawson', 'I know what I said. Worth every penny.'],
    ['brenner', 'We couldn\'t see our own wingtips in that front. When the Germans came through the gaps, you were already there.', { alt: ['doyle'] }],
    ['stern', 'The first time anyone\'s gone all the way with us. It changes the arithmetic.'],
  ], [
    ['doyle', 'To the little friends.'],
    ['kessler', 'To the little friends. May they never run short of fuel.'],
    ['dawson', 'Same time tomorrow, sir? I\'ll bring my wallet.'],
  ]),
  V('m3', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'snow' }, [
    ['kessler', 'Two hundred guns down there, and I still put the bombs right on the aiming point. I\'ve never seen flak like it.'],
    ['doyle', 'Merry Christmas, Ray. Five days late.'],
    ['mendez', 'Every gun had its Saint Christopher today, and every one of us came home. I\'m not saying it\'s the medals. I\'m not saying it isn\'t.'],
    ['reilly', 'On Christmas Eve I kept thinking about the Lucky Lady\'s boys. They\'d have liked the snow.'],
  ], [
    ['stern', 'Tomorrow is the last day of the year. Nineteen forty-four, gentlemen.'],
    ['walsh', 'Next Christmas at home. Everybody say it.'],
    ['brenner', 'Next Christmas at home.', { alt: ['doyle'] }],
  ]),
  V('m10', { setting: 'hut', place: 'RAF Manston · Transit hut', time: 'Night', weather: 'fog', absent: ['doyle'] }, [
    ['gallo', 'I kissed that runway, and I\'d do it again. The RAF boys think I\'ve gone flak happy.'],
    ['brenner', 'They took Frank to the hospital. The surgeon says he\'ll keep the leg.', { alt: ['stern'] }],
    ['brenner', 'I told you. I wasn\'t putting an old lady in the Channel on her thirteenth.'],
    ['dawson', 'When the Spitfires showed up off the coast, I could have cried. Maybe I did.'],
  ], [
    ['kessler', 'Somebody write to Frank tonight. Tell him the old lady made it.'],
    ['gallo', 'I\'ll write it. I\'ll make it long. He hates long letters.'],
    ['brenner', 'Lights out. We fly home in the morning.', { alt: ['stern'] }],
  ]),
  V('m4', { setting: 'club', place: 'Deenethorpe · The Club', time: 'Night', weather: 'clear', absent: ['doyle'], gramophone: true }, [
    ['dawson', 'Leipzig and back, and not one of them got through to us. I said there was a steak in it, didn\'t I?'],
    ['gallo', 'He\'s been saving his coupons for a week. Don\'t ask him where he found a steak in England.'],
    ['kessler', 'Big Week, they\'re calling it. The whole Eighth went out today, all of us after the aircraft factories.'],
    ['brenner', 'When that Fortress fell out of formation, I thought she was finished. Then you came down on the wolves.', { alt: ['stern'] }],
    ['stern', 'Frank wrote from the hospital. He says the nurses are lovely and the food is a crime.'],
  ], [
    ['mendez', 'There\'s a rumour we\'re going back to Schweinfurt. Nobody say it out loud.', { say: 'There\'s a rumour we\'re going back to Shvine-foort. Nobody say it out loud.' }],
    ['dawson', 'Eat your steak, sir. You earned it.'],
  ]),
  V('m5', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'clear' }, [
    ['doyle', 'Schweinfurt. There, I said it. Somebody had to.', { say: 'Shvine-foort. There, I said it. Somebody had to.' }],
    ['dawson', 'A hundred yards. I could see the rounds sparking off their windscreens, and they still didn\'t break.'],
    ['doyle', 'I\'ve got my piece of Frankfurt on my key ring. It came up through the floor and found my leg. I\'m keeping it.'],
    ['mendez', 'Sixty ships stayed behind the last time. Today we brought ours home. That\'s enough for me.'],
  ], [
    ['stern', 'Nineteen missions. Six to go. I don\'t like saying the number out loud either.'],
    ['kessler', 'Same socks tomorrow. Don\'t anybody say a word.'],
    ['brenner', 'Long day tomorrow. Lights out in ten minutes.', { alt: ['doyle'] }],
  ]),
  V('m11', { setting: 'club', place: 'Deenethorpe · The Club', time: 'Evening', weather: 'dusk', gramophone: true }, [
    ['kessler', 'Right on the aiming point. I\'ve seen the photographs. The assembly hall is gone.'],
    ['gallo', 'He\'s shown everybody the photographs. Twice. He showed the barman.'],
    ['kessler', 'I waited nineteen missions for that target. I\'m entitled.'],
    ['mendez', 'Four minutes straight and level through that flak. I said it in September and I\'ll say it now. I do not like flak.'],
    ['doyle', 'Noted, Sergeant.'],
  ], [
    ['brenner', 'Every Messerschmitt they don\'t build is one that won\'t be waiting for the next crew. Remember that.', { alt: ['doyle'] }],
    ['price', 'Buy the man a drink. Even if he is insufferable.'],
    ['kessler', 'I\'ll take it.'],
  ]),
  V('m6', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Night', weather: 'rain' }, [
    ['mendez', 'Two engines, all the way across Holland. I listened to every cylinder the whole way home.'],
    ['brenner', 'Twenty-two missions, and she carried us home again.', { alt: ['doyle'] }],
    ['walsh', 'When the Mustangs came over the horizon, Price started laughing and couldn\'t stop.'],
    ['price', 'Wasn\'t laughing. Something in my eye.'],
    ['stern', 'The ground crew has been out there since we landed. In the rain, with lamps. They say she\'ll be ready by Wednesday.'],
  ], [
    ['doyle', 'Somebody take those boys a thermos of coffee. They\'ve earned it more than we have.'],
    ['dawson', 'I\'ll go. I owe them.'],
    ['brenner', 'We all do.', { alt: ['doyle'] }],
  ]),
  V('m7', { setting: 'club', place: 'Deenethorpe · The Club', time: 'Night', weather: 'clear', gramophone: true }, [
    ['doyle', 'Berlin. We went to Berlin and back, and the Mustangs never left us.'],
    ['dawson', 'I saw a Fortress with a crown on her nose get a lot of extra cover today. Somebody told you, didn\'t they?'],
    ['gallo', 'I painted that crown. I\'m taking the credit for the whole escort.'],
    ['kessler', 'They say the Luftwaffe lost more today than it can replace. You could feel it. They didn\'t press like they used to.'],
    ['brenner', 'The ground crew put her back together in two days. She flew today with every man who wouldn\'t leave her.', { alt: ['stern'] }],
  ], [
    ['stern', 'I\'ve stopped pretending I don\'t count the missions. We\'re close now.'],
    ['doyle', 'To the little friends. Again.'],
    ['dawson', 'And put it on my tab.'],
  ]),
  V('m12', { setting: 'hut', place: 'Deenethorpe · Hut 14', time: 'Evening', weather: 'dusk', finale: true, order: ['wounds', 'losses', 'aces', 'tour', 'stats'] }, [
    ['gallo', 'I rubbed out the pencil. It\'s in paint now. Twenty-five bombs under the window.'],
    ['doyle', 'In paint. Now it counts.'],
    ['mendez', 'I went out to her after we landed and put my hand on number three engine. Still warm. I said thank you.'],
    ['reilly', 'I\'m going to miss the ball. Don\'t tell anybody I said that.'],
    ['kessler', 'I\'m burning these socks. Out behind the hut, a proper funeral.'],
    ['stern', 'Twenty-five missions. I\'ve worked it out a dozen ways, and it never adds up to why we came home and the others didn\'t.'],
  ], [
    ['brenner', 'I want to say something about the Lucky Lady\'s boys. And the new crews who never finished their first week.', { alt: ['doyle'] }],
    ['brenner', 'We knew some of their names. Not all of them. We carry them home anyway.', { alt: ['doyle'] }],
    ['walsh', 'Twenty-five missions and never a scratch. I think about that more than I should.'],
    ['dawson', 'First thing, I\'m going to stand in the middle of the cornfield and look at the sky. Just look at it.'],
    ['price', 'The ranch will still be there. Cattle don\'t know there was a war.'],
    ['gallo', 'Brooklyn. My mother\'s going to cook for three days, and I\'m going to let her.'],
    ['doyle', 'Boston. I\'m singing at my sister\'s wedding, and this time I\'ll know all the words.'],
    ['stern', 'Philadelphia. A classroom full of kids who think arithmetic is boring. God bless every one of them.'],
    ['mendez', 'San Antonio. I\'m going to fix my father\'s truck, and nobody is going to shoot at me while I do it.'],
    ['kessler', 'I\'m going to sleep for a week. Then I\'ll think about it.'],
    ['brenner', 'Kansas. Low and slow over the wheat, and nobody shooting.'],
    ['brenner', 'It was an honour to fly with every one of you. Thank you.', { alt: ['doyle'] }],
    ['gallo', 'Somebody wind up the gramophone.', { cue: 'gramophone', alt: ['reilly'] }],
    ['brenner', 'Twenty-five. Let\'s go home.', { alt: ['doyle', 'stern'] }],
  ]),
];

export const vignetteFor = (missionId: string): Vignette | null => isSecondTourId(missionId) ? { ...VIGNETTES[0], id: missionId, open: [], close: [], absent: [], skip: [], finale: false } : VIGNETTES.find((v) => v.id === missionId) ?? null;

// Every line that has (or can have) a recorded clip, with the voice roles it is recorded in
export function recordedLines(): { def: LineDef; roles: string[] }[] {
  const defs = [...VIGNETTES.flatMap((v) => [...v.open, ...v.close]), ...Object.values(POOL)];
  return defs.filter((d) => !d.dyn).map((def) => ({ def, roles: [...new Set([def.who, ...(def.alt ?? [])].map((s) => VOICE_ROLE[s]))] }));
}

// Every English text the scene can show (templates included): the phrase tables cover these
export function allTexts(): string[] {
  const out = new Set<string>();
  for (const v of VIGNETTES) { out.add(v.place); out.add(v.time); for (const d of [...v.open, ...v.close]) out.add(d.text); }
  for (const d of Object.values(POOL)) out.add(d.text);
  return [...out];
}

// ---------------- selection ----------------

export const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
/** The English a line speaks (its clip's text, or what the speech synthesis reads). */
export const spokenText = (l: SceneLine) => fill(l.text, l.vars);

const DEFAULT_ORDER: Slot[] = ['wounds', 'losses', 'aces', 'stats', 'strategy', 'rookies'];
export const DYN_CAP = 6, DYN_CAP_FINALE = 9;

/** Who is in the room: everyone but the men in the hospital and the ones the story sends away. */
export function presentMen(v: Vignette, c: CrewRoomCtx): Speaker[] {
  return ALL_MEN.filter((m) => !c.hospital.includes(m) && !(c.memorial ?? []).includes(m) && !(v.absent ?? []).includes(m));
}

function speakerFor(d: LineDef, here: ReadonlySet<Speaker>): Speaker | null {
  for (const s of [d.who, ...(d.alt ?? [])]) if (here.has(s)) return s;
  return null;
}

interface Pick { slot: Slot; prio: number; lines: SceneLine[] }

/**
 * The scene for a mission: the vignette's lines for the men in the room, with the outcome block
 * between the opening and the closing. Null when the mission has no vignette.
 */
export function buildScene(missionId: string, c: CrewRoomCtx): Scene | null {
  const v = vignetteFor(missionId);
  if (!v) return null;
  const present = presentMen(v, c);
  const here = new Set(present);
  const say = (d: LineDef, o: { who?: Speaker; vars?: Record<string, string | number>; show?: Record<string, string | number> } = {}): SceneLine | null => {
    const who = o.who ?? speakerFor(d, here);
    if (!who || !here.has(who)) return null;
    return { id: d.id, who, text: d.text, vars: o.vars, show: o.show, dyn: d.dyn, cue: d.cue };
  };
  const scripted = (d: LineDef) => (d.if && !d.if(c) ? null : say(d));
  const picks: Pick[] = [];
  const add = (slot: Slot, prio: number, ...ls: (SceneLine | null)[]) => {
    const lines = ls.filter((l): l is SceneLine => !!l);
    if (lines.length && !(v.skip ?? []).includes(slot)) picks.push({ slot, prio, lines });
  };

  // wounds: the men in the hospital (the story's absentees are already talked about)
  const hosp = c.hospital.filter((m) => !(v.absent ?? []).includes(m));
  if (hosp.length) {
    const first = say(POOL.hosp1, { vars: { name: NAME_OF[hosp[0]] } });
    const second = hosp[1] ? say(POOL.hosp2, { vars: { name: NAME_OF[hosp[1]] } }) : null;
    add('wounds', 10, first, second, say(second ? POOL.hospTwo : POOL.hospOne));
  }
  // wounds: one man patched up and back with the crew
  const pm = c.patched.find((m) => here.has(m));
  if (pm) {
    const askWho = speakerFor({ ...POOL.patchQ }, new Set(present.filter((m) => m !== pm)));
    const q = askWho ? say(POOL.patchQ, { who: askWho, vars: { nick: NICK_OF[pm] } }) : null;
    if (q) add('wounds', 7, q, say(POOL.patchA, { who: pm }));
  }

  // losses (the empty bunk when they were heavy)
  const heavy = isHeavy(c);
  const lost = Math.max(0, Math.round(c.lost));
  const lossLine = lost === 0 ? say(POOL.lost0) : lost === 1 ? say(POOL.lost1) : lost === 2 ? say(POOL.lost2)
    : lost - 3 < LOSS_WORDS.length ? say(POOL.lostN, { vars: { n: LOSS_WORDS[lost - 3] }, show: { n: lost } })
    : say(POOL.lostMany, { vars: { n: lost } });
  if (heavy && !v.noBunk) add('losses', 9, lossLine, say(POOL.bunk), say(POOL.bunkReply));
  else add('losses', heavy ? 9 : 6, lossLine);

  // the Experten: the first one met (shot down first), and a word when the player got him
  const aces = [...c.aces].sort((a, b) => +(b.fate === 'down' || b.fate === 'bailed') - +(a.fate === 'down' || a.fate === 'bailed'));
  const ace = aces.find((a) => ACE_SURNAMES.includes(a.last)) ?? aces[0];
  if (ace) {
    const down = ace.fate === 'down' || ace.fate === 'bailed';
    const d = down ? POOL.aceDown : POOL.aceAway;
    const line = say(ACE_SURNAMES.includes(ace.last) ? d : { ...d, dyn: true }, { vars: { ace: ace.last } });
    add('aces', 8, line);
    if (line && down && ace.byPlayer) add('aces', 4, say(POOL.aceYours));
  }

  // the player's day
  if (c.role === 'gunner') {
    const k = c.kills;
    const tier = k <= 0 ? POOL.gun0 : k <= 2 ? POOL.gun1 : k <= 4 ? POOL.gun3 : POOL.gun5;
    add('stats', 6, say(tier));
    if (k > 0 && c.shots > 0) add('stats', 5, say(POOL.gunCount, { vars: { kills: k, acc: Math.round(accuracy(c) * 100) } }));
    const acc = accuracy(c);
    if (c.shots >= 60 && acc >= 0.32) add('stats', 3, say(POOL.accHigh));
    else if (c.shots >= 120 && acc < 0.1) add('stats', 3, say(POOL.accLow));
  } else {
    const k = c.kills;
    add('stats', 6, say(k <= 0 ? POOL.fly0 : k <= 4 ? POOL.fly1 : POOL.fly5));
    if (k > 0) add('stats', 5, say(POOL.flyCount, { vars: { kills: k } }));
  }

  // the strategic picture
  const tr = lwTrend(c.luftwaffe);
  if (tr === 'weaker') add('strategy', 4, say(POOL.lwWeak));
  else if (tr === 'stronger') add('strategy', 4, say(POOL.lwStrong), say(POOL.lwStrongReply));
  else add('strategy', 2, say(POOL.lwEven));

  // a replacement who flew today
  const rk = c.rookies.find((r) => here.has(r.for));
  if (rk) add('rookies', 1, say(POOL.rookie, { vars: { rookie: rk.rookie, who: lastName(rk.for) } }));

  // the finale: the whole tour
  if (v.finale && c.tour) add('tour', 9, say(POOL.tour, { vars: { kills: c.tour.kills, lost: c.tour.lost } }));

  // keep the block short: drop the least important picks until it fits
  const cap = isSecondTourId(missionId) ? 3 : v.finale ? DYN_CAP_FINALE : DYN_CAP;
  const kept = [...picks];
  const count = () => kept.reduce((n, p) => n + p.lines.length, 0);
  while (count() > cap && kept.length > 1) {
    let w = 0;
    for (let i = 1; i < kept.length; i++) if (kept[i].prio < kept[w].prio) w = i;
    kept.splice(w, 1);
  }
  const order = v.order ?? DEFAULT_ORDER;
  const slotRank = (s: Slot) => { const i = order.indexOf(s); return i < 0 ? order.length + DEFAULT_ORDER.indexOf(s) : i; };
  // stable: picks keep their order inside a slot
  const block = kept.map((p, i) => ({ p, i })).sort((a, b) => slotRank(a.p.slot) - slotRank(b.p.slot) || a.i - b.i).flatMap((x) => x.p.lines);

  const lines = [
    ...v.open.map(scripted),
    ...block,
    ...v.close.map(scripted),
  ].filter((l): l is SceneLine => !!l);
  // the room: everyone who speaks, then the rest of the men present (up to eight portraits)
  const speakers = [...new Set(lines.map((l) => l.who))];
  const cast = [...speakers, ...present.filter((m) => !speakers.includes(m))].slice(0, Math.max(8, speakers.length));
  return { v, lines, present: cast, emptyBunk: !!v.emptyBunk || heavy || !!c.memorial?.length, memorial: c.memorial ?? [] };
}

const LAST: Record<Speaker, string> = {
  brenner: 'Brenner', doyle: 'Doyle', stern: 'Stern', kessler: 'Kessler', mendez: 'Mendez',
  gallo: 'Gallo', reilly: 'Reilly', price: 'Price', walsh: 'Walsh', dawson: 'Dawson',
};
export const lastName = (m: Speaker) => LAST[m];
