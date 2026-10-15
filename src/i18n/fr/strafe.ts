// French for ar/strafe.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'TRAIN BUSTING': 'CHASSE AUX TRAINS', CONVOY: 'CONVOI', AIRFIELD: 'AÉRODROME' };

const TARGETS = ['Locomotive', 'Goods wagon', 'Tank wagon', 'Flak wagon', 'Truck', 'Fuel truck', 'Flak half-track', 'Aircraft on the ground',
  'Fw 190 on the ground', 'Bf 109 on the ground', 'Ju 88 on the ground', 'Bf 110 on the ground', '20 mm flak', 'Flak tower'].join('|');

const patterns: Pattern[] = [
  [/^ROUND (\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD)$/, (m) => `MANCHE ${m[1]} · ${KIND[m[2]]}`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — locomotive ([\d.]+) km from the tunnel$/, (m) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — locomotive à ${m[4]} km du tunnel`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — train stopped · (-?\d+)\/(\d+) wagons destroyed$/, (m) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — train arrêté · ${m[4]}/${m[5]} wagons détruits`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) vehicles destroyed$/, (m) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} véhicules détruits`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) aircraft destroyed on the ground$/, (m) => `Manche ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} avions détruits au sol`],
  [/^Objective complete — \+(\d+)$/, 'Objectif atteint — +$1'],
  [new RegExp(`^(${TARGETS}) destroyed — \\+(\\d+)$`), (m, tr) => `${tr(m[1])} : détruit — +${m[2]}`],
  [new RegExp(`^Blue Two got the (${TARGETS})$`), (m, tr) => `Bleu deux a eu la cible : ${tr(m[1])}`],
  [new RegExp(`^(${TARGETS}) reached the village$`), (m, tr) => `${tr(m[1])} : a atteint le village`],
];

const table: PhraseTable = {
  phrases: {
    // radio
    'Control to Blue flight: a supply train is heading east for the tunnel. Stop that locomotive before it gets there!':
      "Contrôle à patrouille Bleue : un train de ravitaillement file vers l'est, vers le tunnel. Arrêtez cette locomotive avant qu'elle y arrive !",
    'Control: a truck convoy is on the road to the village. Shoot it up before it gets under cover!':
      "Contrôle : un convoi de camions roule vers le village. Mitraillez-le avant qu'il se mette à couvert !",
    'Control: the Luftwaffe field to the north-east. Strafe the aircraft on the ground — and watch the flak!':
      'Contrôle : le terrain de la Luftwaffe au nord-est. Mitraillez les avions au sol — et attention à la flak !',
    "Got the loco! She's blown her boiler!": 'Locomotive touchée ! Sa chaudière a sauté !',
    'The train made it into the tunnel. Too late, Blue flight.': 'Le train est entré dans le tunnel. Trop tard, patrouille Bleue.',
    'Light flak coming up! Stay low and keep jinking!': 'Flak légère ! Restez bas et continuez à zigzaguer !',
    'Focke-Wulfs coming down on us! Watch your tail, Leader!': 'Des Focke-Wulf piquent sur nous ! Surveillez vos arrières, Leader !',
    'Blue Two, going down on your target!': 'Bleu deux, je plonge sur votre cible !',
    'Blue Two — got one on the ground!': "Bleu deux — j'en ai eu un au sol !",
    'Blue Leader, you are leaving the target area. Come back round.': 'Bleu Leader, vous quittez la zone cible. Faites demi-tour.',

    // banners and feed
    'Stop the supply train before it reaches the tunnel': "Arrêtez le train de ravitaillement avant qu'il n'atteigne le tunnel",
    'Shoot up the truck convoy before it reaches the village': "Mitraillez le convoi de camions avant qu'il n'atteigne le village",
    'Strafe the Luftwaffe airfield': "Mitraillez l'aérodrome de la Luftwaffe",
    'The train reached the tunnel': 'Le train a atteint le tunnel',
    'Your Mustang was brought down by flak.': 'Votre Mustang a été abattu par la flak.',

    // ground targets
    'Locomotive': 'Locomotive',
    'Goods wagon': 'Wagon de marchandises',
    'Tank wagon': 'Wagon-citerne',
    'Flak wagon': 'Wagon de flak',
    'Truck': 'Camion',
    'Fuel truck': 'Camion-citerne',
    'Flak half-track': 'Half-track de flak',
    'Aircraft on the ground': 'Avion au sol',
    'Fw 190 on the ground': 'Fw 190 au sol',
    'Bf 109 on the ground': 'Bf 109 au sol',
    'Ju 88 on the ground': 'Ju 88 au sol',
    'Bf 110 on the ground': 'Bf 110 au sol',
    '20 mm flak': 'Flak de 20 mm',
    'Flak tower': 'Tour de flak',

    // overlay
    'TRAIN': 'TRAIN',
    'CONVOY': 'CONVOI',
    'AIRFIELD': 'AÉRODROME',
    'FLAK': 'FLAK',
    'LOCOMOTIVE': 'LOCOMOTIVE',
    'PULL UP': 'REDRESSEZ',
    'FT AGL': 'FT SOL',

    // mission and mode
    'Train Busting': 'Chasse aux trains',
    'Rail and road traffic, Normandy': 'Trafic ferroviaire et routier, Normandie',
    'Normandy, July 1944': 'Normandie, juillet 1944',
    'Today we go down on the deck. The Germans are moving supplies to the front by rail and road in daylight, and it is our job to stop them. Fly low and fast, and pick your targets.':
      "Aujourd'hui, on vole au ras du sol. Les Allemands acheminent du ravitaillement vers le front par rail et par route en plein jour, et notre travail est de les arrêter. Volez bas et vite, et choisissez vos cibles.",
    'First a supply train heading east for a tunnel: stop the locomotive before it gets there, then work over the wagons. Then a truck convoy on the road into the village. Last, the Luftwaffe airfield to the north-east, with aircraft parked in the open.':
      "D'abord un train de ravitaillement qui file vers un tunnel à l'est : arrêtez la locomotive avant qu'elle y arrive, puis occupez-vous des wagons. Ensuite un convoi de camions sur la route du village. Enfin, l'aérodrome de la Luftwaffe au nord-est, avec ses avions garés à découvert.",
    'Everything down there shoots back. The 20 mm flak hoses tracer at anything low — keep moving and do not make two passes from the same direction. Watch your height in the dive: the ground does not forgive. Blue Two goes down on your target when you press one.':
      "Tout ce qui est en bas riposte. La flak de 20 mm arrose de traçantes tout ce qui vole bas — restez en mouvement et ne passez jamais deux fois par la même direction. Surveillez votre altitude en piqué : le sol ne pardonne pas. Bleu deux plonge sur votre cible quand vous appuyez sur un.",
    'Stop the train before it reaches the tunnel': "Arrêtez le train avant qu'il n'atteigne le tunnel",
    'Shoot up the truck convoy': 'Mitraillez le convoi de camions',
    'Strafe the aircraft on the airfield': "Mitraillez les avions sur l'aérodrome",
    'Command your wingman: 1 attack my target · 2 cover me': 'Ordres à votre ailier : 1 attaque ma cible · 2 couvre-moi',
    'The rail line is blocked, the convoy is burning and the airfield will not be flying tomorrow. That was flying, Blue Leader.':
      "La voie ferrée est coupée, le convoi brûle et l'aérodrome ne fera rien décoller demain. Ça, c'était du pilotage, Bleu Leader.",
    'Special operation — ground attack. Down on the deck over Normandy: stop a supply train before it reaches the tunnel, shoot up a truck convoy and strafe a Luftwaffe airfield, through 20 mm flak and a few Fw 190s. Mind the ground — it does not forgive.':
      "Opération spéciale — attaque au sol. Au ras du sol au-dessus de la Normandie : arrêtez un train de ravitaillement avant le tunnel, mitraillez un convoi de camions et un aérodrome de la Luftwaffe, sous la flak de 20 mm et face à quelques Fw 190. Attention au sol — il ne pardonne pas.",
  },
  patterns,
};
export default table;
