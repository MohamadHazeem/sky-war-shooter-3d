// German for ar/strafe.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'TRAIN BUSTING': 'ZUGJAGD', CONVOY: 'KONVOI', AIRFIELD: 'FLUGPLATZ' };

const TARGETS = ['Locomotive', 'Goods wagon', 'Tank wagon', 'Flak wagon', 'Truck', 'Fuel truck', 'Flak half-track', 'Aircraft on the ground',
  'Fw 190 on the ground', 'Bf 109 on the ground', 'Ju 88 on the ground', 'Bf 110 on the ground', '20 mm flak', 'Flak tower'].join('|');

const patterns: Pattern[] = [
  [/^ROUND (\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD)$/, (m) => `RUNDE ${m[1]} · ${KIND[m[2]]}`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — locomotive ([\d.]+) km from the tunnel$/, (m) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — Lok ${m[4]} km vor dem Tunnel`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — train stopped · (-?\d+)\/(\d+) wagons destroyed$/, (m) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — Zug gestoppt · ${m[4]}/${m[5]} Waggons zerstört`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) vehicles destroyed$/, (m) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} Fahrzeuge zerstört`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) aircraft destroyed on the ground$/, (m) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} Flugzeuge am Boden zerstört`],
  [/^Objective complete — \+(\d+)$/, 'Ziel erfüllt — +$1'],
  [new RegExp(`^(${TARGETS}) destroyed — \\+(\\d+)$`), (m, tr) => `${tr(m[1])} zerstört — +${m[2]}`],
  [new RegExp(`^Blue Two got the (${TARGETS})$`), (m, tr) => `Blau zwei hat getroffen: ${tr(m[1])}`],
  [new RegExp(`^(${TARGETS}) reached the village$`), (m, tr) => `${tr(m[1])} hat das Dorf erreicht`],
];

const table: PhraseTable = {
  phrases: {
    // radio
    'Control to Blue flight: a supply train is heading east for the tunnel. Stop that locomotive before it gets there!':
      'Leitstelle an Blau-Schwarm: Ein Nachschubzug fährt nach Osten zum Tunnel. Stoppt die Lok, bevor sie ihn erreicht!',
    'Control: a truck convoy is on the road to the village. Shoot it up before it gets under cover!':
      'Leitstelle: Ein Lkw-Konvoi ist auf der Straße zum Dorf. Zerschießt ihn, bevor er in Deckung geht!',
    'Control: the Luftwaffe field to the north-east. Strafe the aircraft on the ground — and watch the flak!':
      'Leitstelle: der Luftwaffen-Platz im Nordosten. Beschießt die Flugzeuge am Boden — und achtet auf die Flak!',
    "Got the loco! She's blown her boiler!": 'Lok getroffen! Der Kessel ist geplatzt!',
    'The train made it into the tunnel. Too late, Blue flight.': 'Der Zug ist im Tunnel. Zu spät, Blau-Schwarm.',
    'Light flak coming up! Stay low and keep jinking!': 'Leichte Flak! Bleibt tief und kurvt weiter!',
    'Focke-Wulfs coming down on us! Watch your tail, Leader!': 'Focke-Wulfs stürzen auf uns herab! Pass auf dein Heck auf, Leader!',
    'Blue Two, going down on your target!': 'Blau zwei, gehe auf dein Ziel runter!',
    'Blue Two — got one on the ground!': 'Blau zwei — einen am Boden erwischt!',
    'Blue Leader, you are leaving the target area. Come back round.': 'Blau Leader, du verlässt das Zielgebiet. Dreh um.',

    // banners and feed
    'Stop the supply train before it reaches the tunnel': 'Stoppe den Nachschubzug, bevor er den Tunnel erreicht',
    'Shoot up the truck convoy before it reaches the village': 'Zerschieß den Lkw-Konvoi, bevor er das Dorf erreicht',
    'Strafe the Luftwaffe airfield': 'Beschieß den Luftwaffen-Flugplatz',
    'The train reached the tunnel': 'Der Zug hat den Tunnel erreicht',
    'Your Mustang was brought down by flak.': 'Deine Mustang wurde von der Flak abgeschossen.',

    // ground targets
    'Locomotive': 'Lokomotive',
    'Goods wagon': 'Güterwagen',
    'Tank wagon': 'Kesselwagen',
    'Flak wagon': 'Flakwagen',
    'Truck': 'Lkw',
    'Fuel truck': 'Tanklaster',
    'Flak half-track': 'Flak-Halbkettenfahrzeug',
    'Aircraft on the ground': 'Flugzeug am Boden',
    'Fw 190 on the ground': 'Fw 190 am Boden',
    'Bf 109 on the ground': 'Bf 109 am Boden',
    'Ju 88 on the ground': 'Ju 88 am Boden',
    'Bf 110 on the ground': 'Bf 110 am Boden',
    '20 mm flak': '2-cm-Flak',
    'Flak tower': 'Flakturm',

    // overlay
    'TRAIN': 'ZUG',
    'CONVOY': 'KONVOI',
    'AIRFIELD': 'FLUGPLATZ',
    'FLAK': 'FLAK',
    'LOCOMOTIVE': 'LOK',
    'PULL UP': 'HOCHZIEHEN',
    'FT AGL': 'FT ÜG',

    // mission and mode
    'Train Busting': 'Zugjagd',
    'Rail and road traffic, Normandy': 'Schienen- und Straßenverkehr, Normandie',
    'Normandy, July 1944': 'Normandie, Juli 1944',
    'Today we go down on the deck. The Germans are moving supplies to the front by rail and road in daylight, and it is our job to stop them. Fly low and fast, and pick your targets.':
      'Heute geht es runter in den Tiefflug. Die Deutschen bringen am helllichten Tag Nachschub per Bahn und Straße an die Front, und wir sollen sie aufhalten. Flieg tief und schnell und such dir deine Ziele aus.',
    'First a supply train heading east for a tunnel: stop the locomotive before it gets there, then work over the wagons. Then a truck convoy on the road into the village. Last, the Luftwaffe airfield to the north-east, with aircraft parked in the open.':
      'Zuerst ein Nachschubzug auf dem Weg nach Osten zu einem Tunnel: Stoppe die Lok, bevor sie ihn erreicht, dann nimm dir die Waggons vor. Dann ein Lkw-Konvoi auf der Straße ins Dorf. Zuletzt der Luftwaffen-Flugplatz im Nordosten mit Flugzeugen im Freien.',
    'Everything down there shoots back. The 20 mm flak hoses tracer at anything low — keep moving and do not make two passes from the same direction. Watch your height in the dive: the ground does not forgive. Blue Two goes down on your target when you press one.':
      'Da unten schießt alles zurück. Die 2-cm-Flak spritzt Leuchtspur auf alles, was tief fliegt — bleib in Bewegung und flieg nie zweimal aus derselben Richtung an. Achte im Sturzflug auf deine Höhe: Der Boden verzeiht nichts. Blau zwei greift dein Ziel an, wenn du Eins drückst.',
    'Stop the train before it reaches the tunnel': 'Stoppe den Zug, bevor er den Tunnel erreicht',
    'Shoot up the truck convoy': 'Zerschieß den Lkw-Konvoi',
    'Strafe the aircraft on the airfield': 'Beschieß die Flugzeuge auf dem Flugplatz',
    'Command your wingman: 1 attack my target · 2 cover me': 'Befehle an deinen Rottenflieger: 1 greif mein Ziel an · 2 gib mir Deckung',
    'The rail line is blocked, the convoy is burning and the airfield will not be flying tomorrow. That was flying, Blue Leader.':
      'Die Bahnlinie ist blockiert, der Konvoi brennt und vom Flugplatz startet morgen nichts. Das war Fliegen, Blau Leader.',
    'Special operation — ground attack. Down on the deck over Normandy: stop a supply train before it reaches the tunnel, shoot up a truck convoy and strafe a Luftwaffe airfield, through 20 mm flak and a few Fw 190s. Mind the ground — it does not forgive.':
      'Sondereinsatz — Bodenangriff. Im Tiefflug über der Normandie: Stoppe einen Nachschubzug vor dem Tunnel, zerschieß einen Lkw-Konvoi und beschieß einen Luftwaffen-Flugplatz, durch 2-cm-Flak und ein paar Fw 190. Pass auf den Boden auf — er verzeiht nichts.',
  },
  patterns,
};
export default table;
