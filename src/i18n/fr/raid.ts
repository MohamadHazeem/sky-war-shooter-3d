// French for ar/raid.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'NIGHT RAID': 'RAID DE NUIT', RAID: 'RAID' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (NIGHT RAID|RAID) — (.+) · (\d+)\/(\d+) through$/, (m, tr) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])} · ${m[5]}/${m[6]} passés`],
  [/^ROUND (\d+) · (NIGHT RAID|RAID)$/, (m) => `MANCHE ${m[1]} · ${KIND[m[2]]}`],
  [/^(\d+) bombers? inbound, nearest ([\d.]+) km from the field$/, (m) => `${m[1]} ${+m[1] <= 1 ? 'bombardier en approche' : 'bombardiers en approche'}, le plus proche à ${m[2]} km du terrain`],
  [/^Airfield untouched this round — \+(\d+)$/, 'Terrain intact cette manche — +$1'],
  [/^(.+) bombed the airfield — (\d+) of (\d+) allowed$/, (m, tr) => `${tr(m[1])} a bombardé le terrain — ${m[2]} sur ${m[3]} tolérés`],
  [/^(.+) jettisoned his bombs$/, (m, tr) => `${tr(m[1])} a largué ses bombes`],
  [/^Bomber down short of the field — \+(\d+)$/, 'Bombardier abattu avant le terrain — +$1'],
  [/^Let no more than (\d+) bombers through in three rounds$/, 'Ne laissez pas passer plus de $1 bombardiers en trois manches'],
  [/^Wingman Blue Two: (.+) attack my target · (.+) cover me · (.+) protect the bombers · (.+) form up$/, 'Ailier Bleu Deux : $1 attaque ma cible · $2 couvre-moi · $3 protège les bombardiers · $4 en formation'],
];

const table: PhraseTable = {
  phrases: {
    // speakers
    'Blue Two': 'Bleu Deux',
    'Control': 'Contrôle',

    // radio
    "Searchlights have one coned! Get him while he's lit!": 'Les projecteurs en tiennent un ! Descendez-le tant qu’il est éclairé !',
    "Control: pathfinder flares going down over the field! The bombers will aim on them — get under the flares and you'll see them.": 'Contrôle : fusées des éclaireurs au-dessus du terrain ! Les bombardiers vont viser dessus — passez sous les fusées et vous les verrez.',
    "Messerschmitts coming down on us — they're covering the bombers!": 'Des Messerschmitt plongent sur nous — ils couvrent les bombardiers !',
    "He's dumped his bombs — he's turning for home!": 'Il a largué ses bombes — il fait demi-tour !',
    'Control to Blue flight: raiders crossing the coast in the dark. Look for their exhaust flames and the searchlights.': 'Contrôle à patrouille Bleue : raiders franchissant la côte dans le noir. Cherchez les flammes d’échappement et les projecteurs.',
    'Control: more of them coming in, with night fighters. The searchlights will find the bombers for you.': 'Contrôle : d’autres arrivent, avec des chasseurs de nuit. Les projecteurs vous trouveront les bombardiers.',
    'Control: the main stream is inbound. Every one you get is one less over the field!': 'Contrôle : le flot principal approche. Chaque avion abattu, c’est un de moins sur le terrain !',
    'Control to Blue flight: raid inbound, Junkers with fighter cover. Get between them and the airfield!': 'Contrôle à patrouille Bleue : raid en approche, des Junkers sous couverture de chasse. Interposez-vous entre eux et le terrain !',
    'Control, second wave: bombers and Messerschmitts on the same heading. Hit the bombers first!': 'Contrôle, deuxième vague : bombardiers et Messerschmitt au même cap. Frappez d’abord les bombardiers !',
    "Control: this is the main raid — everything they've got. Don't let them through!": 'Contrôle : voici le raid principal — tout ce qu’ils ont. Ne les laissez pas passer !',
    'Bombs on the airfield! Stop the rest of them!': 'Bombes sur le terrain ! Arrêtez les autres !',
    'Blue Two, engaging your target!': 'Bleu Deux, j’engage votre cible !',
    'Blue Two, going to the bombers!': 'Bleu Deux, je vais sur les bombardiers !',
    'Blue Two, covering your six!': 'Bleu Deux, je couvre vos six heures !',
    'Blue Two, forming up on your wing.': 'Bleu Deux, je reprends place sur votre aile.',
    "Blue Two, I'm hit! I'm going down!": 'Bleu Deux, je suis touché ! Je descends !',
    'Blue Two, replacement aircraft joining on your wing.': 'Bleu Deux, appareil de remplacement sur votre aile.',
    'Blue Two — no target in front of you, staying on your wing.': 'Bleu Deux — aucune cible devant vous, je reste sur votre aile.',
    'Blue Two, going after the bombers!': 'Bleu Deux, je prends les bombardiers en chasse !',
    'Bandit on your tail — Blue Two is on him!': 'Bandit dans vos six — Bleu Deux est sur lui !',
    'Blue Two — splash one!': 'Bleu Deux — un de descendu !',
    'Blue Two is down — a replacement joins next round': 'Bleu Deux est abattu — un remplaçant arrive à la prochaine manche',

    // the same wingman lines as Blue Four (escort missions)
    'Blue Four': 'Bleu Quatre',
    "Blue Four, engaging your target!": 'Bleu Quatre, j’engage votre cible !',
    "Blue Four, going to the bombers!": 'Bleu Quatre, je vais sur les bombardiers !',
    "Blue Four, covering your six!": 'Bleu Quatre, je couvre vos six heures !',
    "Blue Four, forming up on your wing.": 'Bleu Quatre, je reprends place sur votre aile.',
    "Blue Four, replacement aircraft joining on your wing.": 'Bleu Quatre, appareil de remplacement sur votre aile.',
    "Blue Four — no target in front of you, staying on your wing.": 'Bleu Quatre — aucune cible devant vous, je reste sur votre aile.',
    "Blue Four, going after the bombers!": 'Bleu Quatre, je prends les bombardiers en chasse !',
    "Bandit on your tail — Blue Four is on him!": 'Bandit dans vos six — Bleu Quatre est sur lui !',
    "Blue Four — splash one!": 'Bleu Quatre — un de descendu !',
    "Blue Four is down — a replacement joins next round": 'Bleu Quatre est abattu — un remplaçant arrive à la prochaine manche',
    "Blue Four, I'm hit! I'm going down!": 'Bleu Quatre, je suis touché ! Je descends !',

    // missions and modes
    'Defend the Field': 'Défendre le terrain',
    'Night Fighter': 'Chasseur de nuit',
    'Advanced Landing Ground, Normandy': 'Terrain d’atterrissage avancé, Normandie',
    'Normandy, June 1944': 'Normandie, juin 1944',
    'Airfields in southern England': 'Aérodromes du sud de l’Angleterre',
    'Operation Steinbock, February 1944': 'Opération Steinbock, février 1944',
    'For once the boot is on the other foot. The Luftwaffe is coming for us: Junkers 88s with Messerschmitt cover, straight in at the advanced landing ground where your group is based.':
      'Pour une fois, les rôles sont inversés. La Luftwaffe vient pour nous : des Junkers 88 sous couverture de Messerschmitt, droit sur le terrain avancé où votre groupe est basé.',
    'They will fly a straight course for the field. Every bomber you bring down short of it is one stick of bombs that does not fall on our aircraft. If more than six of them get through, there will be no field to come home to.':
      'Ils voleront en ligne droite vers le terrain. Chaque bombardier abattu avant est un chapelet de bombes qui ne tombe pas sur nos avions. Si plus de six passent, il n’y aura plus de terrain où rentrer.',
    'Take Blue Two with you. Keys one to four give him his orders: attack my target, cover me, go for the bombers, form up. Watch the rear gunners on the Junkers — come in from below.':
      'Emmenez Bleu Deux. Les touches un à quatre lui donnent ses ordres : attaque ma cible, couvre-moi, va sur les bombardiers, en formation. Méfiez-vous des mitrailleurs arrière des Junkers — attaquez par en dessous.',
    'The raid is broken. The field is still ours — the ground crews are already filling in the craters. Outstanding work, Blue Leader.':
      'Le raid est brisé. Le terrain est toujours à nous — les mécaniciens rebouchent déjà les cratères. Travail remarquable, Bleu Leader.',
    'The Baby Blitz. Every few nights the Junkers come back across the Channel in the dark, and tonight they are after the airfields.':
      'Le Baby Blitz. Toutes les quelques nuits, les Junkers retraversent la Manche dans le noir, et ce soir ils visent les aérodromes.',
    'You will not see them until you are close. Look for the exhaust flames — they show for miles — and watch the searchlights: when the beams cone a bomber, go for him while he is lit. Their pathfinders will mark the field with parachute flares, and anything flying under them is lit up, the bombers included. Your gunsight lamp is turned up for the night.':
      'Vous ne les verrez qu’une fois tout près. Cherchez les flammes d’échappement — visibles à des kilomètres — et surveillez les projecteurs : quand les faisceaux saisissent un bombardier, foncez tant qu’il est éclairé. Leurs éclaireurs marqueront le terrain de fusées parachutes, et tout ce qui vole dessous est éclairé, bombardiers compris. La lampe de votre viseur est montée pour la nuit.',
    'From the second wave they are sending Messerschmitt 110 night fighters ahead of the bombers. If more than four bombers get through to the field, we have lost the night.':
      'Dès la deuxième vague, ils envoient des chasseurs de nuit Messerschmitt 110 devant les bombardiers. Si plus de quatre bombardiers atteignent le terrain, la nuit est perdue.',
    'Dawn over the field, and every runway still in use. The Junkers will think twice about coming back. Good hunting, Blue Leader.':
      'L’aube sur le terrain, et toutes les pistes encore en service. Les Junkers y réfléchiront à deux fois avant de revenir. Bonne chasse, Bleu Leader.',
    'Special operation — role reversal. The Luftwaffe raids your airfield: Ju 88s on a straight course for the field, Bf 109s flying cover. Bring the bombers down before they reach it, with Blue Two on your wing. Three rounds; more than six through and the field is lost.':
      'Opération spéciale — rôles inversés. La Luftwaffe attaque votre terrain : des Ju 88 en ligne droite vers le terrain, des Bf 109 en couverture. Abattez les bombardiers avant qu’ils n’arrivent, avec Bleu Deux sur votre aile. Trois manches ; plus de six passés et le terrain est perdu.',
    'Special operation — night defence. Junkers raid the airfields in the dark: find them by their exhaust flames and the searchlight cones, under a lit gunsight. Bf 110 night fighters hunt you from the second wave. Three rounds; more than four through and the night is lost.':
      'Opération spéciale — défense de nuit. Des Junkers attaquent les aérodromes dans le noir : repérez-les à leurs flammes d’échappement et aux cônes des projecteurs, viseur éclairé. Des chasseurs de nuit Bf 110 vous traquent dès la deuxième vague. Trois manches ; plus de quatre passés et la nuit est perdue.',
    'Shoot down the bombers before they reach the airfield': 'Abattez les bombardiers avant qu’ils n’atteignent le terrain',
    'Command your wingman: 1 attack · 2 cover · 3 bombers · 4 form up': 'Commandez votre ailier : 1 attaque · 2 couverture · 3 bombardiers · 4 formation',
    'Junkers inbound with fighter cover': 'Junkers en approche sous couverture de chasse',
    'Second wave — bombers and Messerschmitts': 'Deuxième vague — bombardiers et Messerschmitt',
    'The main raid — everything they have': 'Le raid principal — tout ce qu’ils ont',
    'Raiders in the dark — find them by their exhausts': 'Raiders dans le noir — repérez leurs échappements',
    'More raiders — and night fighters hunting you': 'D’autres raiders — et des chasseurs de nuit à vos trousses',
    'The main bomber stream': 'Le flot principal de bombardiers',
    'more raiders inbound': 'd’autres raiders en approche',
    'Free look (hold): look around the fuselage': 'Vue libre (maintenir) : regardez autour du fuselage',
    'Flak coming up — heavy guns below us. Hold steady.': 'La flak monte — des pièces lourdes sous nous. Tenez bon.',
    'That one bounced right off the armour plate!': 'Celle-là a ricoché sur le blindage !',
    'Padlock the nearest bandit': 'Verrouiller le bandit le plus proche',
  },
  patterns,
};
export default table;
