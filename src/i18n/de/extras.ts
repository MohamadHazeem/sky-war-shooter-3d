// German for ar/extras.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MONTHS: Record<string, string> = {
  January: 'Januar', February: 'Februar', March: 'März', April: 'April', May: 'Mai', June: 'Juni',
  July: 'Juli', August: 'August', September: 'September', October: 'Oktober', November: 'November', December: 'Dezember',
};

const patterns: Pattern[] = [
  [/^([\d,]+) mph \(([\d,]+) km\/h\)$/, '$1 mph ($2 km/h)'],
  [/^([\d.]+) m × ([\d.]+) m$/, '$1 m × $2 m'],
  [/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m) => `${m[1]}. ${MONTHS[m[2]]} ${m[3]}`],
];

const table: PhraseTable = {
  phrases: {
    // ---------- What's new ----------
    "What's new": 'Neuigkeiten',
    '401st Bomb Group · Operations bulletin': '401st Bomb Group · Einsatzbulletin',
    'Orders of the day · version {v}': 'Tagesbefehl · Version {v}',
    'Understood': 'Verstanden',
    'Try it': 'Ausprobieren',
    "This bulletin stays pinned up: title menu → What's new, or Settings.": 'Dieses Bulletin bleibt angeschlagen: Hauptmenü → Neuigkeiten, oder Einstellungen.',
    'bulletin · version {v}': 'Bulletin · Version {v}',
    'WANTED': 'GESUCHT',
    'WEEK': 'WOCHE',
    'BETA': 'BETA',
    'Choose the next target on a living 1943–44 map. Side raids on rail yards, airfields and oil hit the Luftwaffe where it hurts.':
      'Wähle das nächste Ziel auf einer lebendigen Karte von 1943–44. Nebenangriffe auf Rangierbahnhöfe, Flugplätze und Öl treffen die Luftwaffe dort, wo es wehtut.',
    'Take-off and landing': 'Start und Landung',
    'Dawn take-off from Deenethorpe and the landing afterwards: red flares and fire trucks if she comes home shot up. Skippable.':
      'Start im Morgengrauen in Deenethorpe und danach die Landung: rote Leuchtkugeln und Löschfahrzeuge, wenn sie zerschossen heimkommt. Überspringbar.',
    'Boss battle groups': 'Boss-Kampfgruppen',
    'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.':
      'Eine Luftkreuzer-Kampfgruppe greift die Formation in der ersten Runde an. Schieß Türme, Motoren und Flak weg, um die Panzerung zu durchbrechen, und deck dann den Rumpf mit Feuer ein.',
    'Luftkreuzer flying warships with turrets, flak and rocket pods. Shoot the parts away to breach the armour.':
      'Luftkreuzer: fliegende Kriegsschiffe mit Türmen, Flak und Raketenbehältern. Schieß die Teile weg, um die Panzerung zu durchbrechen.',
    'Living B-17 interior': 'Lebendiges B-17-Inneres',
    'The other waist gunner fights beside you, brass piles up, frost creeps over the glass. Hold C to look around.':
      'Der andere Seitenschütze kämpft neben dir, Hülsen türmen sich, Frost kriecht übers Glas. Halte C, um dich umzusehen.',
    'P-51 special operations': 'P-51-Sondereinsätze',
    'Defend the Field against a Ju 88 raid, hunt bombers as a Night Fighter, or go Train Busting at treetop height.':
      'Verteidige den Flugplatz gegen einen Ju-88-Angriff, jage Bomber als Nachtjäger oder geh in Baumwipfelhöhe auf Zugjagd.',
    'Wingman orders': 'Befehle an den Rottenflieger',
    'Your wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up.':
      'Dein Rottenflieger in jedem P-51-Einsatz: 1 greif mein Ziel an, 2 gib mir Deckung, 3 schütze die Bomber, 4 Formation.',
    'Experten nemesis aces': 'Experten als Erzfeinde',
    'Named Luftwaffe aces who remember you, carry scars and grudges, and climb the ranks if they get away.':
      'Luftwaffen-Asse mit Namen, die sich an dich erinnern, Narben und Groll tragen und befördert werden, wenn sie entkommen.',
    'Skill tree': 'Fähigkeitenbaum',
    'Spend points from promotions in three branches: Marksman, Gunnery Sergeant and Survivor.':
      'Setze Beförderungspunkte in drei Zweigen ein: Scharfschütze, Feuerleit-Sergeant und Überlebender.',
    'Custom battle and weekly': 'Eigene Schlacht und Wochenaufgabe',
    'Build your own battle: enemies, weather, time of day, a boss round. Or fly the weekly challenge for its ribbon.':
      'Bau deine eigene Schlacht: Gegner, Wetter, Tageszeit, eine Bossrunde. Oder flieg die Wochenherausforderung für ihr Band.',
    'Scrub the last 90 seconds of a mission, fly a free camera, save the best moments and screenshots.':
      'Spule durch die letzten 90 Sekunden eines Einsatzes, steuere eine freie Kamera, speichere die besten Momente und Screenshots.',
    'Co-op': 'Koop',
    'Two gunners, one B-17: share a room code with a friend and man different guns online.':
      'Zwei Schützen, eine B-17: Teile einen Raumcode mit einem Freund und besetzt online verschiedene Waffenstände.',
    'Arabic': 'Arabisch',
    'Every screen in Arabic, right to left. Switch the language in Settings.': 'Alle Bildschirme auf Arabisch, von rechts nach links. Sprache in den Einstellungen wechseln.',

    // ---------- gallery: screen ----------
    'recognition · quiz': 'Erkennung · Quiz',
    'Aircraft recognition': 'Flugzeugerkennung',
    'Hangar 2 · Deenethorpe': 'Hangar 2 · Deenethorpe',
    'Gallery': 'Galerie',
    'Recognition quiz': 'Erkennungsquiz',
    'Drag to orbit · wheel or pinch to zoom · ← → change aircraft · gamepad: right stick, LT / RT, LB / RB':
      'Ziehen zum Drehen · Mausrad oder Zwei-Finger-Geste zum Zoomen · ← → Flugzeug wechseln · Gamepad: rechter Stick, LT / RT, LB / RB',
    'Previous aircraft': 'Vorheriges Flugzeug',
    'Next aircraft': 'Nächstes Flugzeug',
    'Wheeling her out…': 'Wird herausgerollt…',
    'Fictional · boss': 'Fiktiv · Boss',
    'Allied · USAAF': 'Alliiert · USAAF',
    'Luftwaffe': 'Luftwaffe',
    'On our side: hold your fire': 'Auf unserer Seite: nicht schießen',
    'Warships downed by you:': 'Von dir abgeschossene Kriegsschiffe:',
    'Shot down by you:': 'Von dir abgeschossen:',
    'Crew': 'Besatzung',
    'Armament': 'Bewaffnung',
    'Top speed': 'Höchstgeschwindigkeit',
    'First flight': 'Erstflug',
    'Span × length': 'Spannweite × Länge',
    "Gunner's note": 'Notiz des Schützen',
    'HANGAR 2 · KEEP CLEAR': 'HANGAR 2 · FREIHALTEN',
    // quiz
    'Round {i} / {n}': 'Runde {i} / {n}',
    'Score {n}': 'Punkte {n}',
    'Identify the aircraft': 'Erkenne das Flugzeug',
    'Correct: {name}': 'Richtig: {name}',
    'No: that was the {name}': 'Nein: Das war die {name}',
    'Results': 'Ergebnis',
    'Next': 'Weiter',
    '{n} of {total} identified': '{n} von {total} erkannt',
    'New best score!': 'Neuer Rekord!',
    'Best score: {n} / {total}': 'Rekord: {n} / {total}',
    'Again': 'Nochmal',

    // ---------- gallery: spec cards ----------
    'Boeing B-17G Flying Fortress': 'Boeing B-17G Flying Fortress',
    'Heavy bomber · your aircraft': 'Schwerer Bomber · dein Flugzeug',
    '13 × .50 cal M2 machine guns · up to 8,000 lb of bombs': '13 × M2-MG Kaliber .50 · bis zu 8.000 lb Bomben',
    'Five gun positions you can man: switch seats to meet each attack where it comes from.': 'Fünf Waffenstände, die du besetzen kannst: Wechsle den Stand, um jedem Angriff dort zu begegnen, woher er kommt.',
    'North American P-51D Mustang': 'North American P-51D Mustang',
    'Long-range escort fighter': 'Langstrecken-Begleitjäger',
    '6 × .50 cal M2 machine guns': '6 × M2-MG Kaliber .50',
    'Friendly! Bubble canopy and a belly scoop: hold your fire when one dives past the bombers.': 'Freund! Tropfenhaube und Bauchkühler: nicht schießen, wenn eine an den Bombern vorbeistößt.',
    'Focke-Wulf Fw 190 A-8': 'Focke-Wulf Fw 190 A-8',
    'Fighter · bomber destroyer': 'Jäger · Bomberzerstörer',
    '2 × 13 mm MG 131 · 4 × 20 mm MG 151/20 cannon': '2 × 13-mm-MG 131 · 4 × 20-mm-Kanone MG 151/20',
    "Attacks head-on from twelve o'clock high in tight groups: meet him with the top turret and fire early.": 'Greift frontal von zwölf Uhr hoch in engen Gruppen an: Empfang ihn mit dem oberen Turm und feuere früh.',
    'Messerschmitt Bf 109 G-14': 'Messerschmitt Bf 109 G-14',
    'Fighter': 'Jäger',
    '1 × 20 mm MG 151/20 cannon · 2 × 13 mm MG 131': '1 × 20-mm-Kanone MG 151/20 · 2 × 13-mm-MG 131',
    'Nimble but lightly built: a short, well-led burst brings him down. Watch for him diving on stragglers.': 'Wendig, aber leicht gebaut: Ein kurzer, gut vorgehaltener Feuerstoß holt ihn runter. Achte auf seine Sturzangriffe auf Nachzügler.',
    'Messerschmitt Bf 110 G': 'Messerschmitt Bf 110 G',
    'Zerstörer heavy fighter': 'Schwerer Jäger (Zerstörer)',
    '2 × 20 mm cannon · 4 × 7.92 mm MG · twin rear MG 81Z · 21 cm rockets': '2 × 20-mm-Kanone · 4 × 7,92-mm-MG · Zwillings-MG 81Z hinten · 21-cm-Raketen',
    'Hangs back out of range and lobs 21 cm rockets from a kilometre: break the wave up before it fires.': 'Hält sich außer Reichweite und feuert 21-cm-Raketen aus einem Kilometer: Sprenge die Welle, bevor sie feuert.',
    'Junkers Ju 88 A-4': 'Junkers Ju 88 A-4',
    'Bomber · heavy fighter': 'Bomber · schwerer Jäger',
    '7.92 mm and 13 mm defensive guns · 1,400 kg of bombs internally': 'Abwehrwaffen 7,92 mm und 13 mm · 1.400 kg Bomben intern',
    'Slow and armoured: go for an engine, not the fuselage.': 'Langsam und gepanzert: Ziel auf einen Motor, nicht auf den Rumpf.',
    'Messerschmitt Me 262 A-1a Schwalbe': 'Messerschmitt Me 262 A-1a Schwalbe',
    'Jet fighter': 'Strahljäger',
    '4 × 30 mm MK 108 cannon': '4 × 30-mm-Kanone MK 108',
    '18 April 1941 (first jet flight 18 July 1942)': '18. April 1941 (erster Strahlflug 18. Juli 1942)',
    'Too fast to track: lead him far ahead, and fire as he slows to line up his cannon.': 'Zu schnell zum Verfolgen: Halte weit vor und feuere, wenn er langsamer wird, um seine Kanonen auszurichten.',
    'Messerschmitt Me 163 B Komet': 'Messerschmitt Me 163 B Komet',
    'Rocket interceptor': 'Raketenabfangjäger',
    '2 × 30 mm MK 108 cannon': '2 × 30-mm-Kanone MK 108',
    'A few minutes of rocket fuel: one slashing pass, then he glides home. One good hit and he is done.': 'Raketentreibstoff für wenige Minuten: ein rasanter Anflug, dann gleitet er heim. Ein guter Treffer, und er ist erledigt.',
    'Heinkel He 111 H': 'Heinkel He 111 H',
    'Medium bomber': 'Mittlerer Bomber',
    'Up to 7 × 7.92 mm MG · 2,000 kg of bombs': 'Bis zu 7 × 7,92-mm-MG · 2.000 kg Bomben',
    'Glazed nose, close formations, a gunner in every window: attack from below and go for the engines.': 'Verglaste Kanzel, enge Formationen, ein Schütze in jedem Fenster: Greif von unten an und ziel auf die Motoren.',
    'Messerschmitt Me 410 A Hornisse': 'Messerschmitt Me 410 A Hornisse',
    'Heavy fighter · bomber destroyer': 'Schwerer Jäger · Bomberzerstörer',
    '2 × 20 mm cannon · 2 × 7.92 mm MG · 2 × 13 mm remote barbettes · 50 mm BK 5 cannon (U4)': '2 × 20-mm-Kanone · 2 × 7,92-mm-MG · 2 × 13-mm-Seitenlafetten (ferngesteuert) · 50-mm-Kanone BK 5 (U4)',
    'The BK 5 cannon telegraphs: he lines up from two kilometres and holds steady. Kill him before he fires.': 'Die BK 5 verrät ihn: Er richtet sich aus zwei Kilometern aus und hält ruhig. Hol ihn runter, bevor er feuert.',
    'Shown on the Bf 110 airframe the game uses as a stand-in.': 'Gezeigt auf der Bf-110-Zelle, die das Spiel als Ersatz verwendet.',
    'Dornier Do 335 A Pfeil': 'Dornier Do 335 A Pfeil',
    'Heavy fighter (push-pull)': 'Schwerer Jäger (Zug-Druck)',
    '1 × 30 mm MK 103 cannon · 2 × 20 mm MG 151/20': '1 × 30-mm-Kanone MK 103 · 2 × 20-mm-MG 151/20',
    'A propeller at each end: he dives from high astern as fast as a jet. Watch the tail and lead him hard.': 'Ein Propeller an jedem Ende: Er stößt von hinten oben so schnell wie ein Strahljäger herab. Beobachte das Heck und halte kräftig vor.',
    'Luftkreuzer (fictional)': 'Luftkreuzer (fiktiv)',
    'Flying warship · boss battle group': 'Fliegendes Kriegsschiff · Boss-Kampfgruppe',
    'Fictional': 'Fiktiv',
    'Gun turrets · 8.8 cm dorsal flak · rocket pods': 'Geschütztürme · 8,8-cm-Rückenflak · Raketenbehälter',
    'Never: invented for the game': 'Nie: für das Spiel erfunden',
    'About three times a Ju 88': 'Etwa dreimal eine Ju 88',
    'Shoot away turrets, engines and flak to breach the armour, then pour fire into the hull.': 'Schieß Türme, Motoren und Flak weg, um die Panzerung zu durchbrechen, und deck dann den Rumpf mit Feuer ein.',
    'Fictional: no such aircraft was ever built.': 'Fiktiv: Ein solches Flugzeug wurde nie gebaut.',
  },
  patterns,
};
export default table;
