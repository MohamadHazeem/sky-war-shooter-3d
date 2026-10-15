// German for ar/raid.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'NIGHT RAID': 'NACHTANGRIFF', RAID: 'ANGRIFF' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (NIGHT RAID|RAID) — (.+) · (\d+)\/(\d+) through$/, (m, tr) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])} · ${m[5]}/${m[6]} durch`],
  [/^ROUND (\d+) · (NIGHT RAID|RAID)$/, (m) => `RUNDE ${m[1]} · ${KIND[m[2]]}`],
  [/^(\d+) bombers? inbound, nearest ([\d.]+) km from the field$/, '$1 Bomber im Anflug, nächster $2 km vom Platz'],
  [/^Airfield untouched this round — \+(\d+)$/, 'Flugplatz in dieser Runde unversehrt — +$1'],
  [/^(.+) bombed the airfield — (\d+) of (\d+) allowed$/, (m, tr) => `${tr(m[1])} hat den Platz bombardiert — ${m[2]} von ${m[3]} erlaubt`],
  [/^(.+) jettisoned his bombs$/, (m, tr) => `${tr(m[1])} hat die Bomben notabgeworfen`],
  [/^Bomber down short of the field — \+(\d+)$/, 'Bomber vor dem Platz abgeschossen — +$1'],
  [/^Let no more than (\d+) bombers through in three rounds$/, 'Lass in drei Runden höchstens $1 Bomber durch'],
  [/^Wingman Blue Two: (.+) attack my target · (.+) cover me · (.+) protect the bombers · (.+) form up$/, 'Rottenflieger Blau Zwei: $1 greif mein Ziel an · $2 deck mich · $3 schütz die Bomber · $4 aufschließen'],
];

const table: PhraseTable = {
  phrases: {
    // speakers
    'Blue Two': 'Blau Zwei',
    'Control': 'Leitstelle',

    // radio
    "Searchlights have one coned! Get him while he's lit!": 'Die Scheinwerfer haben einen erfasst! Hol ihn dir, solange er beleuchtet ist!',
    "Control: pathfinder flares going down over the field! The bombers will aim on them — get under the flares and you'll see them.": 'Leitstelle: Pfadfinder setzen Leuchtbomben über dem Platz! Die Bomber zielen darauf — flieg unter die Leuchtbomben, dann siehst du sie.',
    "Messerschmitts coming down on us — they're covering the bombers!": 'Messerschmitts stoßen auf uns herab — sie decken die Bomber!',
    "He's dumped his bombs — he's turning for home!": 'Er hat seine Bomben abgeworfen — er dreht nach Hause!',
    'Control to Blue flight: raiders crossing the coast in the dark. Look for their exhaust flames and the searchlights.': 'Leitstelle an Schwarm Blau: Angreifer überfliegen im Dunkeln die Küste. Achtet auf ihre Auspuffflammen und die Scheinwerfer.',
    'Control: more of them coming in, with night fighters. The searchlights will find the bombers for you.': 'Leitstelle: Weitere im Anflug, mit Nachtjägern. Die Scheinwerfer finden die Bomber für euch.',
    'Control: the main stream is inbound. Every one you get is one less over the field!': 'Leitstelle: Der Hauptstrom kommt. Jeder, den ihr erwischt, ist einer weniger über dem Platz!',
    'Control to Blue flight: raid inbound, Junkers with fighter cover. Get between them and the airfield!': 'Leitstelle an Schwarm Blau: Angriff im Anflug, Junkers mit Jagdschutz. Geht zwischen sie und den Flugplatz!',
    'Control, second wave: bombers and Messerschmitts on the same heading. Hit the bombers first!': 'Leitstelle, zweite Welle: Bomber und Messerschmitts auf demselben Kurs. Zuerst die Bomber!',
    "Control: this is the main raid — everything they've got. Don't let them through!": 'Leitstelle: Das ist der Hauptangriff — alles, was sie haben. Lasst sie nicht durch!',
    'Bombs on the airfield! Stop the rest of them!': 'Bomben auf dem Flugplatz! Haltet den Rest auf!',
    'Blue Two, engaging your target!': 'Blau Zwei, greife dein Ziel an!',
    'Blue Two, going to the bombers!': 'Blau Zwei, gehe auf die Bomber!',
    'Blue Two, covering your six!': 'Blau Zwei, decke dein Heck!',
    'Blue Two, forming up on your wing.': 'Blau Zwei, schließe an deiner Tragfläche auf.',
    "Blue Two, I'm hit! I'm going down!": 'Blau Zwei, ich bin getroffen! Ich gehe runter!',
    'Blue Two, replacement aircraft joining on your wing.': 'Blau Zwei, Ersatzmaschine schließt an deiner Tragfläche auf.',
    'Blue Two — no target in front of you, staying on your wing.': 'Blau Zwei — kein Ziel vor dir, bleibe an deiner Tragfläche.',
    'Blue Two, going after the bombers!': 'Blau Zwei, nehme mir die Bomber vor!',
    'Bandit on your tail — Blue Two is on him!': 'Feind an deinem Heck — Blau Zwei ist an ihm dran!',
    'Blue Two — splash one!': 'Blau Zwei — einer abgeschossen!',
    'Blue Two is down — a replacement joins next round': 'Blau Zwei ist abgeschossen — nächste Runde kommt Ersatz',

    // the same wingman lines as Blue Four (escort missions)
    'Blue Four': 'Blau Vier',
    "Blue Four, engaging your target!": 'Blau Vier, greife dein Ziel an!',
    "Blue Four, going to the bombers!": 'Blau Vier, gehe auf die Bomber!',
    "Blue Four, covering your six!": 'Blau Vier, decke dein Heck!',
    "Blue Four, forming up on your wing.": 'Blau Vier, schließe an deiner Tragfläche auf.',
    "Blue Four, replacement aircraft joining on your wing.": 'Blau Vier, Ersatzmaschine schließt an deiner Tragfläche auf.',
    "Blue Four — no target in front of you, staying on your wing.": 'Blau Vier — kein Ziel vor dir, bleibe an deiner Tragfläche.',
    "Blue Four, going after the bombers!": 'Blau Vier, nehme mir die Bomber vor!',
    "Bandit on your tail — Blue Four is on him!": 'Feind an deinem Heck — Blau Vier ist an ihm dran!',
    "Blue Four — splash one!": 'Blau Vier — einer abgeschossen!',
    "Blue Four is down — a replacement joins next round": 'Blau Vier ist abgeschossen — nächste Runde kommt Ersatz',
    "Blue Four, I'm hit! I'm going down!": 'Blau Vier, ich bin getroffen! Ich gehe runter!',

    // missions and modes
    'Defend the Field': 'Verteidige den Platz',
    'Night Fighter': 'Nachtjäger',
    'Advanced Landing Ground, Normandy': 'Feldflugplatz, Normandie',
    'Normandy, June 1944': 'Normandie, Juni 1944',
    'Airfields in southern England': 'Flugplätze in Südengland',
    'Operation Steinbock, February 1944': 'Unternehmen Steinbock, Februar 1944',
    'For once the boot is on the other foot. The Luftwaffe is coming for us: Junkers 88s with Messerschmitt cover, straight in at the advanced landing ground where your group is based.':
      'Diesmal ist es andersherum. Die Luftwaffe kommt zu uns: Junkers 88 mit Messerschmitt-Schutz, direkt auf den Feldflugplatz, auf dem deine Gruppe stationiert ist.',
    'They will fly a straight course for the field. Every bomber you bring down short of it is one stick of bombs that does not fall on our aircraft. If more than six of them get through, there will be no field to come home to.':
      'Sie fliegen geradewegs auf den Platz zu. Jeder Bomber, den du vorher runterholst, ist eine Bombenreihe weniger auf unseren Flugzeugen. Kommen mehr als sechs durch, gibt es keinen Platz mehr, zu dem wir heimkehren können.',
    'Take Blue Two with you. Keys one to four give him his orders: attack my target, cover me, go for the bombers, form up. Watch the rear gunners on the Junkers — come in from below.':
      'Nimm Blau Zwei mit. Die Tasten eins bis vier geben ihm Befehle: greif mein Ziel an, deck mich, geh auf die Bomber, aufschließen. Vorsicht vor den Heckschützen der Junkers — greif von unten an.',
    'The raid is broken. The field is still ours — the ground crews are already filling in the craters. Outstanding work, Blue Leader.':
      'Der Angriff ist zerschlagen. Der Platz gehört noch uns — das Bodenpersonal füllt schon die Krater auf. Hervorragende Arbeit, Blau Führer.',
    'The Baby Blitz. Every few nights the Junkers come back across the Channel in the dark, and tonight they are after the airfields.':
      'Der Baby Blitz. Alle paar Nächte kommen die Junkers im Dunkeln über den Kanal zurück, und heute Nacht haben sie es auf die Flugplätze abgesehen.',
    'You will not see them until you are close. Look for the exhaust flames — they show for miles — and watch the searchlights: when the beams cone a bomber, go for him while he is lit. Their pathfinders will mark the field with parachute flares, and anything flying under them is lit up, the bombers included. Your gunsight lamp is turned up for the night.':
      'Du siehst sie erst aus der Nähe. Achte auf die Auspuffflammen — sie sind kilometerweit sichtbar — und auf die Scheinwerfer: Erfassen die Strahlen einen Bomber, greif ihn an, solange er beleuchtet ist. Ihre Pfadfinder markieren den Platz mit Fallschirmleuchtbomben, und alles, was darunter fliegt, ist beleuchtet, die Bomber eingeschlossen. Deine Visierlampe ist für die Nacht hochgedreht.',
    'From the second wave they are sending Messerschmitt 110 night fighters ahead of the bombers. If more than four bombers get through to the field, we have lost the night.':
      'Ab der zweiten Welle schicken sie Messerschmitt-110-Nachtjäger vor den Bombern her. Kommen mehr als vier Bomber zum Platz durch, haben wir die Nacht verloren.',
    'Dawn over the field, and every runway still in use. The Junkers will think twice about coming back. Good hunting, Blue Leader.':
      'Morgengrauen über dem Platz, und jede Startbahn ist noch in Betrieb. Die Junkers werden es sich zweimal überlegen, wiederzukommen. Gute Jagd, Blau Führer.',
    'Special operation — role reversal. The Luftwaffe raids your airfield: Ju 88s on a straight course for the field, Bf 109s flying cover. Bring the bombers down before they reach it, with Blue Two on your wing. Three rounds; more than six through and the field is lost.':
      'Sondereinsatz — vertauschte Rollen. Die Luftwaffe greift deinen Flugplatz an: Ju 88 auf geradem Kurs zum Platz, Bf 109 als Jagdschutz. Hol die Bomber runter, bevor sie ihn erreichen, mit Blau Zwei an deiner Seite. Drei Runden; mehr als sechs durch und der Platz ist verloren.',
    'Special operation — night defence. Junkers raid the airfields in the dark: find them by their exhaust flames and the searchlight cones, under a lit gunsight. Bf 110 night fighters hunt you from the second wave. Three rounds; more than four through and the night is lost.':
      'Sondereinsatz — Nachtverteidigung. Junkers greifen im Dunkeln die Flugplätze an: Finde sie an ihren Auspuffflammen und den Scheinwerferkegeln, mit beleuchtetem Visier. Ab der zweiten Welle jagen dich Bf-110-Nachtjäger. Drei Runden; mehr als vier durch und die Nacht ist verloren.',
    'Shoot down the bombers before they reach the airfield': 'Schieß die Bomber ab, bevor sie den Flugplatz erreichen',
    'Command your wingman: 1 attack · 2 cover · 3 bombers · 4 form up': 'Befehle an den Rottenflieger: 1 Angriff · 2 Deckung · 3 Bomber · 4 aufschließen',
    'Junkers inbound with fighter cover': 'Junkers im Anflug mit Jagdschutz',
    'Second wave — bombers and Messerschmitts': 'Zweite Welle — Bomber und Messerschmitts',
    'The main raid — everything they have': 'Der Hauptangriff — alles, was sie haben',
    'Raiders in the dark — find them by their exhausts': 'Angreifer im Dunkeln — finde sie an ihren Auspuffflammen',
    'More raiders — and night fighters hunting you': 'Weitere Angreifer — und Nachtjäger jagen dich',
    'The main bomber stream': 'Der Hauptbomberstrom',
    'more raiders inbound': 'weitere Angreifer im Anflug',
    'Free look (hold): look around the fuselage': 'Freie Sicht (halten): im Rumpf umsehen',
    'Flak coming up — heavy guns below us. Hold steady.': 'Flak kommt hoch — schwere Geschütze unter uns. Ruhig bleiben.',
    'That one bounced right off the armour plate!': 'Der ist direkt an der Panzerplatte abgeprallt!',
    'Padlock the nearest bandit': 'Auf nächsten Feind aufschalten',
  },
  patterns,
};
export default table;
