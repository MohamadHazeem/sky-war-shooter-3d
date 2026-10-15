import type { PhraseTable } from '../types';

// German for ar/tour.ts (same keys and patterns).

const WHAT: Record<string, string> = {
  'U-boat yards': "U-Boot-Werften", 'Fighter airfield': "Jägerflugplatz", 'Propeller works': "Propellerwerk", 'Marshalling yards': "Rangierbahnhof",
  'Port facilities': "Hafenanlagen", 'Focke-Wulf plant': "Focke-Wulf-Werk", 'Arado aircraft works': "Arado-Flugzeugwerke", 'Rail yards': "Bahnanlagen",
  'Ball-bearing plants': "Kugellagerwerke", 'Port area': "Hafengebiet", 'Synthetic oil plant': "Hydrierwerk", 'Ball-bearing works': "Kugellagerwerk",
  'Industrial area': "Industriegebiet", 'Naval yards': "Marinewerften", 'Chemical works': "Chemiewerk", 'Fighter assembly plant': "Jäger-Montagewerk",
  'Junkers works': "Junkers-Werke", 'Aircraft works': "Flugzeugwerk", 'Aircraft assembly': "Flugzeugmontage", 'Messerschmitt works': "Messerschmitt-Werke",
  'Heinkel works': "Heinkel-Werke", 'Bearing works': "Lagerwerk", 'Industrial rail district': "Industrie- und Bahnviertel", 'Dornier works': "Dornier-Werke",
};
const CITY: Record<string, string> = {
  Emden: 'Emden', Woensdrecht: 'Woensdrecht', Frankfurt: 'Frankfurt', 'Saarbrücken': 'Saarbrücken', Bremen: 'Bremen', Vegesack: 'Vegesack', Marienburg: 'Marienburg',
  Anklam: 'Anklam', 'Münster': 'Münster', Schweinfurt: 'Schweinfurt', Wilhelmshaven: 'Wilhelmshaven', Gelsenkirchen: 'Gelsenkirchen', Paris: 'Paris', Solingen: 'Solingen',
  Kiel: 'Kiel', 'Osnabrück': 'Osnabrück', Ludwigshafen: 'Ludwigshafen', Oschersleben: 'Oschersleben', Halberstadt: 'Halberstadt', Brunswick: 'Braunschweig',
  Leipzig: 'Leipzig', Aschersleben: 'Aschersleben', Bernburg: 'Bernburg', Gotha: 'Gotha', Rostock: 'Rostock', Regensburg: 'Regensburg', Augsburg: 'Augsburg',
  Stuttgart: 'Stuttgart', Berlin: 'Berlin', Oranienburg: 'Oranienburg', Sorau: 'Sorau', Stettin: 'Stettin', Friedrichshafen: 'Friedrichshafen',
};
const NAMES: Record<string, string> = {
  Brenner: 'Brenner', Doyle: 'Doyle', Stern: 'Stern', Kessler: 'Kessler', Mendez: 'Mendez', Gallo: 'Gallo', Reilly: 'Reilly', Price: 'Price', Walsh: 'Walsh', Dawson: 'Dawson',
  Morrow: 'Morrow', Carver: 'Carver', Pruitt: 'Pruitt', Ortega: 'Ortega', Kowalski: 'Kowalski', Hughes: 'Hughes', Baker: 'Baker', Russo: 'Russo', Novak: 'Novak', Fisher: 'Fisher',
  Whitfield: 'Whitfield', Delgado: 'Delgado', Brennan: 'Brennan', Lindqvist: 'Lindqvist', Harlan: 'Harlan', Mercer: 'Mercer',
  Jablonski: 'Jablonski', Moreno: 'Moreno', "O'Neill": "O'Neill", Petrakis: 'Petrakis', Sullivan: 'Sullivan', Carter: 'Carter', Henderson: 'Henderson', Vance: 'Vance', Kowalczyk: 'Kowalczyk', Abbott: 'Abbott',
};
const RANK: Record<string, string> = { 'Sgt.': 'Uffz.', 'S/Sgt.': 'Fw.', 'T/Sgt.': 'Ofw.', 'Lt.': 'Lt.', 'Capt.': 'Hptm.', 'Maj.': 'Maj.' };
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
const name = (s: string, tr: (s: string) => string) => { const i = s.indexOf(' '); return i < 0 ? tr(s) : `${tr(s.slice(0, i))} ${tr(s.slice(i + 1))}`; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whatRx = Object.keys(WHAT).map(esc).join('|');

const table: PhraseTable = {
  phrases: {
    ...WHAT, ...CITY, ...NAMES, ...RANK,
    // menu and entry points
    'The Tour': "Die Tour",
    'THE TOUR': "DIE TOUR",
    'Twenty-five missions, one ship, one crew': "Fünfundzwanzig Einsätze, eine Maschine, eine Besatzung",
    'The Tour · 25 missions': "Die Tour · 25 Einsätze",
    'THE TOUR · 25 MISSIONS': "DIE TOUR · 25 EINSÄTZE",
    'A tour of duty': "Eine Einsatztour",
    'Twenty-five missions, one Fortress, one crew. Damage stays with the ship until the ground crew patches it, wounded men miss missions, and the men you lose are replaced by rookies.':
      "Fünfundzwanzig Einsätze, eine Fortress, eine Besatzung. Schäden bleiben an der Maschine, bis das Bodenpersonal sie flickt, Verwundete fallen für Einsätze aus, und gefallene Männer werden durch Neulinge ersetzt.",
    'Pick each target from the field orders as the air war moves from Emden to Berlin. Watch morale and fatigue, and bring them home after mission twenty-five.':
      "Wähle jedes Ziel aus den Einsatzbefehlen, während der Luftkrieg von Emden nach Berlin vorrückt. Achte auf Moral und Erschöpfung und bring die Männer nach dem fünfundzwanzigsten Einsatz nach Hause.",
    'Begin the tour': "Tour beginnen",
    'Back': "Zurück",
    // the board
    'Mission {n} of 25': "Einsatz {n} von 25",
    '{n} sorties flown': "{n} Feindflüge",
    '{n} of 25 missions credited': "{n} von 25 Einsätzen angerechnet",
    'Field orders · {date}': "Einsatzbefehle · {date}",
    'Choose the target': "Wähle das Ziel",
    'Mustang escort': "Mustang-Begleitschutz",
    'Escort to the border': "Begleitschutz bis zur Grenze",
    'No escort': "Kein Begleitschutz",
    'Last mission': "Letzter Einsatz",
    'Maximum effort: danger +1, merit ×1.5.': "Höchsteinsatz: Gefahr +1, Verdienst ×1.5.",
    'Fly this mission': "Diesen Einsatz fliegen",
    'Stand down a day': "Einen Tag Pause",
    'The crew has had its rest. The next sortie is waiting.': "Die Besatzung hat sich ausgeruht. Der nächste Feindflug wartet.",
    'A stand-down lowers fatigue and lets the wounded heal, once between missions.': "Ein Ruhetag senkt die Erschöpfung und lässt Verwundete heilen, einmal zwischen zwei Einsätzen.",
    'Latest': "Neuigkeiten",
    'Abandon the tour': "Tour abbrechen",
    'Press again to abandon the tour': "Erneut drücken, um die Tour abzubrechen",
    'Between missions': "Zwischen den Einsätzen",
    'Milk run': "Spazierflug",
    'Light opposition': "Geringe Abwehr",
    'Defended': "Verteidigt",
    'Heavily defended': "Stark verteidigt",
    'Deep penetration': "Tiefer Vorstoß",
    'Tour log ({n} sorties)': "Tour-Logbuch ({n} Feindflüge)",
    'Mission {n}': "Einsatz {n}",
    'Credited': "Angerechnet",
    'Ship lost': "Maschine verloren",
    'Not credited': "Nicht angerechnet",
    '{n} kills': "{n} Abschüsse",
    // the ship
    'The ship': "Die Maschine",
    'Damage carried by the ship': "Schäden an der Maschine",
    'Missions flown': "Geflogene Einsätze",
    'Repair patches': "Reparaturflicken",
    'Condition': "Zustand",
    'Engine {e} rough': "Motor {e} läuft unruhig",
    'Ships lost: {names}': "Verlorene Maschinen: {names}",
    'Nose': "Bug", 'Cockpit': "Cockpit", 'Forward fuselage': "Vorderer Rumpf", 'Waist section': "Rumpfmitte", 'Rear fuselage': "Hinterer Rumpf", 'Tail': "Heck",
    'Engine 1': "Motor 1", 'Engine 2': "Motor 2", 'Engine 3': "Motor 3", 'Engine 4': "Motor 4",
    'Left wing': "Linke Tragfläche", 'Left wingtip': "Linke Flächenspitze", 'Right wing': "Rechte Tragfläche", 'Right wingtip': "Rechte Flächenspitze",
    // the crew
    'The crew': "Die Besatzung",
    'Morale': "Moral",
    'Fatigue': "Erschöpfung",
    'In good heart': "Zuversichtlich", 'Holding steady': "Stabil", 'Shaken': "Erschüttert", 'Breaking': "Am Zerbrechen",
    'Fresh': "Frisch", 'Tired': "Müde", 'Worn out': "Ausgelaugt", 'Flak-happy': "Kriegsneurose",
    'Crew gunnery {n}% of a veteran crew.': "Schießleistung der Besatzung: {n}% einer Veteranenbesatzung.",
    'Wounded · out {n}': "Verwundet · fällt {n} aus",
    'New man': "Neuer Mann",
    '{n} missions': "{n} Einsätze",
    'Pilot': "Pilot", 'Co-Pilot': "Kopilot", 'Navigator': "Navigator", 'Bombardier': "Bombenschütze", 'Radio Room': "Funkraum",
    'Top Turret': "Rückenturm", 'Ball Turret': "Kugelturm", 'Left Waist': "Seitenschütze links", 'Right Waist': "Seitenschütze rechts", 'Tail Gun': "Heckschütze",
    'Air Medal': "Air Medal", 'Oak Leaf Cluster': "Eichenlaub", 'Distinguished Flying Cross': "Distinguished Flying Cross", 'Purple Heart': "Purple Heart",
    'Interphone': "Bordsprechanlage",
    // the report
    'The Tour · {n} of 25 missions credited': "Die Tour · {n} von 25 Einsätzen angerechnet",
    'Back to the tour': "Zurück zur Tour",
    'Mission {n} of 25 credited.': "Einsatz {n} von 25 angerechnet.",
    'The {ship} went down in the sea. Air-Sea Rescue picked up the crew. The sortie is not credited.': "Die {ship} ist ins Meer gestürzt. Die Seenotrettung hat die Besatzung aufgefischt. Der Feindflug wird nicht angerechnet.",
    'The {ship} ditched in the sea on the way home. Air-Sea Rescue picked up the crew.': "Die {ship} musste auf dem Rückflug notwassern. Die Seenotrettung hat die Besatzung aufgefischt.",
    'The {ship} was shot down. The sortie is not credited.': "Die {ship} wurde abgeschossen. Der Feindflug wird nicht angerechnet.",
    'The sortie is not credited. Mission {n} will be flown again.': "Der Feindflug wird nicht angerechnet. Einsatz {n} wird wiederholt.",
    '{who} died of his wounds.': "{who} ist seinen Verwundungen erlegen.",
    '{who} is badly wounded and is going home. Purple Heart.': "{who} ist schwer verwundet und geht nach Hause. Purple Heart.",
    '{who} is seriously wounded: hospital for {n} missions. Purple Heart.': "{who} ist ernsthaft verwundet: Lazarett für {n} Einsätze. Purple Heart.",
    '{who} was nicked by a splinter and stays on flying status. Purple Heart.': "{who} wurde von einem Splitter gestreift und bleibt flugtauglich. Purple Heart.",
    '{who} is wounded and misses the next mission. Purple Heart.': "{who} ist verwundet und fällt für den nächsten Einsatz aus. Purple Heart.",
    '{who} did not get out of the {ship}.': "{who} ist nicht aus der {ship} herausgekommen.",
    '{who} is missing. Nobody saw a parachute.': "{who} wird vermisst. Niemand hat einen Fallschirm gesehen.",
    'The rest of the crew bailed out over the coast and is back at the base.': "Der Rest der Besatzung ist über der Küste ausgestiegen und wieder auf dem Stützpunkt.",
    'A replacement Fortress is assigned to the crew: the {ship}.': "Die Besatzung erhält eine Ersatz-Fortress: die {ship}.",
    'The ground crew put {n} new patches on the {ship}. She carries {total} now.': "Das Bodenpersonal hat {n} neue Flicken auf die {ship} gesetzt. Jetzt trägt sie {total}.",
    'The {ship} came home without a scratch.': "Die {ship} kam ohne einen Kratzer nach Hause.",
    'Number {e} engine is still running rough.': "Motor Nummer {e} läuft immer noch unruhig.",
    '{who} is promoted to {rank}.': "{who} wird zum {rank} befördert.",
    '{medal}: {who}': "{medal}: {who}",
    'You are awarded the {medal}.': "Du erhältst: {medal}.",
    '{who} joins the crew at the {post}.': "{who} kommt zur Besatzung, Position: {post}.",
    'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.': "Moral der Besatzung {a}% → {b}%. Erschöpfung {c}% → {d}%.",
    'The crew is stood down for a day. Fatigue {a}% → {b}%.': "Die Besatzung hat einen Tag frei. Erschöpfung {a}% → {b}%.",
    'Maximum effort: +{n} merit.': "Höchsteinsatz: +{n} Verdienst.",
    'Stand-down': "Ruhetag",
    // the mission
    'Bring her home': "Bring sie nach Hause",
    'Going Home': "Heimkehr",
    'Mission twenty-five. When this one is over, the crew goes home.': "Einsatz fünfundzwanzig. Wenn dieser vorbei ist, geht die Besatzung nach Hause.",
    'Intelligence expects light opposition: a few single-engine fighters near the coast. A milk run, if there is such a thing.':
      "Die Aufklärung erwartet geringe Abwehr: ein paar einmotorige Jäger nahe der Küste. Ein Spazierflug, falls es so etwas gibt.",
    'Expect fighters on the way in and out, and flak over the target. Keep the formation tight.':
      "Rechnet mit Jägern auf Hin- und Rückflug und mit Flak über dem Ziel. Haltet die Formation dicht.",
    'The target is well defended. Fighters will be waiting at the border, and the flak over the target is heavy.':
      "Das Ziel ist gut verteidigt. Jäger warten an der Grenze, und die Flak über dem Ziel ist schwer.",
    'This is a heavily defended target. Expect repeated attacks by single- and twin-engine fighters, with rockets from astern.':
      "Dies ist ein stark verteidigtes Ziel. Rechnet mit wiederholten Angriffen ein- und zweimotoriger Jäger, mit Raketen von hinten.",
    'Deep penetration. Every fighter group in the Reich will be up, in relays, from the coast to the target and back. Some of us will not come home.':
      "Tiefer Vorstoß. Jede Jagdgruppe des Reichs wird in der Luft sein, in Staffeln, von der Küste bis zum Ziel und zurück. Einige von uns kommen nicht nach Hause.",
    'There is no escort beyond the Dutch coast. From there on the formation is its own escort.':
      "Hinter der holländischen Küste gibt es keinen Begleitschutz. Ab dort ist die Formation ihr eigener Schutz.",
    'Thunderbolts will take us as far as the German border. After that we are on our own until they meet us on the way home.':
      "Thunderbolts begleiten uns bis zur deutschen Grenze. Danach sind wir auf uns allein gestellt, bis sie uns auf dem Rückweg abholen.",
    'Mustangs will be with us all the way to the target. Hold out until the little friends arrive.':
      "Mustangs bleiben bis zum Ziel bei uns. Haltet durch, bis die kleinen Freunde da sind.",
    'One new man is flying with the crew. Keep an eye on them.': "Ein neuer Mann fliegt mit der Besatzung. Behaltet ihn im Auge.",
    'Maximum effort: every ship that can fly goes today.': "Höchsteinsatz: Jede flugfähige Maschine startet heute.",
    'Twenty-five. Wheels down at Deenethorpe, and the crew climbs out for the last time. Tour complete.':
      "Fünfundzwanzig. Räder auf dem Boden in Deenethorpe, und die Besatzung steigt zum letzten Mal aus. Tour abgeschlossen.",
    // the finale
    'Twenty-five missions. The crew climbs out of the {ship} for the last time.': "Fünfundzwanzig Einsätze. Die Besatzung steigt zum letzten Mal aus der {ship}.",
    'Lucky Bastard Club': "Lucky Bastard Club",
    'This certifies that the bearer has completed a combat tour of twenty-five missions over enemy territory with the 401st Bomb Squadron.':
      "Hiermit wird bescheinigt, dass der Inhaber eine Kampftour von fünfundzwanzig Einsätzen über Feindgebiet mit der 401st Bomb Squadron abgeschlossen hat.",
    'Sorties flown': "Geflogene Feindflüge",
    'Confirmed kills': "Bestätigte Abschüsse",
    'Fortresses': "Fortresses",
    'Medals': "Auszeichnungen",
    'Going home with you': "Gehen mit dir nach Hause",
    'Sent home wounded': "Verwundet heimgeschickt",
    'Remembered': "Unvergessen",
    'Begin a new tour': "Neue Tour beginnen",
    'Main menu': "Hauptmenü",
    // events
    'Flak house': "Erholungsheim",
    'Halfway. The flight surgeon sends the crew to a rest home in the country for a week: real beds, real eggs and no interphone.':
      "Halbzeit. Der Fliegerarzt schickt die Besatzung für eine Woche in ein Erholungsheim auf dem Land: echte Betten, echte Eier und keine Bordsprechanlage.",
    'Pack your bags': "Taschen packen",
    'A week of sleep. The crew comes back rested.': "Eine Woche Schlaf. Die Besatzung kommt erholt zurück.",
    'Mail call': "Postausgabe",
    'Letters and parcels from home reach the hut. Nobody says much for an hour.': "Briefe und Päckchen von zu Hause erreichen die Baracke. Eine Stunde lang sagt kaum jemand etwas.",
    'Read your letters': "Briefe lesen",
    'The hut is quiet and warm. Morale rises.': "Die Baracke ist still und warm. Die Moral steigt.",
    'A new engine': "Ein neuer Motor",
    'The crew chief has found a factory-fresh Wright Cyclone and wants to hang it on the {ship}.': "Der Chefmechaniker hat einen fabrikneuen Wright Cyclone aufgetrieben und will ihn an die {ship} hängen.",
    'Hang the new engine': "Neuen Motor einbauen",
    'The tired engine is replaced. She runs like a watch.': "Der müde Motor ist ersetzt. Sie läuft wie ein Uhrwerk.",
    'Forty-eight hour pass': "Achtundvierzig Stunden Urlaub",
    'The crew has a pass to London. The ground crew could use extra hands on the {ship}.': "Die Besatzung hat Ausgang nach London. Das Bodenpersonal könnte an der {ship} zusätzliche Hände gebrauchen.",
    'Go to London': "Nach London fahren",
    'Two days in London. The crew comes back tired but happy.': "Zwei Tage London. Die Besatzung kommt müde, aber glücklich zurück.",
    'Stay and help the ground crew': "Bleiben und dem Bodenpersonal helfen",
    'Extra hands on the line. The {ship} is in better shape.': "Zusätzliche Hände auf dem Vorfeld. Die {ship} ist in besserem Zustand.",
    'Empty bunks': "Leere Pritschen",
    'The crew in the next hut did not come back yesterday. Their bunks were stripped this morning.': "Die Besatzung aus der Nachbarbaracke ist gestern nicht zurückgekommen. Heute Morgen wurden ihre Pritschen abgezogen.",
    'Carry on': "Weitermachen",
    'Nobody talks much at breakfast.': "Beim Frühstück redet kaum jemand.",
    'Maximum effort': "Höchsteinsatz",
    'Group orders a maximum effort: every ship that can fly goes next. The crew chief wants the {ship} on the ground for repairs.':
      "Die Group befiehlt einen Höchsteinsatz: Jede flugfähige Maschine fliegt den nächsten Einsatz. Der Chefmechaniker will die {ship} zur Reparatur am Boden behalten.",
    'Volunteer the {ship}': "Die {ship} melden",
    'The {ship} is on the board. The danger is higher, and so is the merit.': "Die {ship} steht auf der Einsatztafel. Die Gefahr ist höher, der Verdienst auch.",
    'Ground her for repairs': "Zur Reparatur am Boden lassen",
    'The ground crew works through the night.': "Das Bodenpersonal arbeitet die ganze Nacht durch.",
    'Lucky charm': "Glücksbringer",
    "Sergeant Walsh has lost the rabbit's foot he keeps in his flak vest. He swears he will not fly without it.": "Sergeant Walsh hat die Hasenpfote aus seiner Splitterweste verloren. Er schwört, ohne sie nicht zu fliegen.",
    'Search the dispersal': "Den Abstellplatz absuchen",
    'Found it under his bunk. Walsh grins all the way to the briefing.': "Unter seiner Pritsche gefunden. Walsh grinst bis zur Einsatzbesprechung.",
    'Tell him luck is for the Luftwaffe': "Ihm sagen, Glück ist was für die Luftwaffe",
    'Walsh flies without it. He does not say a word all day.': "Walsh fliegt ohne sie. Den ganzen Tag sagt er kein Wort.",
    'Fogbound': "Im Nebel festgesetzt",
    'Fog sits on the field for three days. Nobody flies, and everybody sleeps.': "Drei Tage liegt Nebel auf dem Platz. Niemand fliegt, alle schlafen.",
    'Sleep': "Schlafen",
    'Three quiet days.': "Drei ruhige Tage.",
    'Dance in the hangar': "Tanz im Hangar",
    'A band from the States plays in the big hangar tonight.': "Heute Abend spielt eine Band aus den Staaten im großen Hangar.",
    'Go dancing': "Tanzen gehen",
    'The crew dances until the band packs up.': "Die Besatzung tanzt, bis die Band einpackt.",
    'Green replacements': "Grüne Ersatzleute",
    'The new men have never fired at a moving target. You could take them up for gunnery practice over the Wash.': "Die Neuen haben noch nie auf ein bewegtes Ziel geschossen. Du könntest sie zu Schießübungen über dem Wash mitnehmen.",
    'Fly a practice flight': "Übungsflug machen",
    'The new men can lead a target now.': "Die Neuen können jetzt richtig vorhalten.",
    'Let them rest': "Sie ausruhen lassen",
    'They will learn over Germany.': "Sie lernen es über Deutschland.",
    'The general visits': "Der General kommt",
    'A general is visiting the group. The {ship} must shine.': "Ein General besucht die Group. Die {ship} muss glänzen.",
    'Polish her': "Auf Hochglanz bringen",
    'The general shakes every hand. The crew stands a little taller.': "Der General schüttelt jede Hand. Die Besatzung steht ein wenig aufrechter.",
    'Hide in the hangar': "Im Hangar verstecken",
    'Nobody notices you were missing.': "Niemand bemerkt, dass ihr gefehlt habt.",
    'Letters home': "Briefe nach Hause",
    'The skipper sits up late writing to the families of the men the crew has lost.': "Der Kommandant sitzt bis spät und schreibt an die Familien der Männer, die die Besatzung verloren hat.",
    'Help him write': "Ihm beim Schreiben helfen",
    'It is the hardest thing the crew has done. They will fly the next one for them.': "Es ist das Schwerste, was die Besatzung je getan hat. Den nächsten Einsatz fliegen sie für sie.",
    "Armorers' work": "Arbeit der Waffenwarte",
    'The armorers have new barrels and fresh belts for every gun aboard the {ship}.': "Die Waffenwarte haben neue Läufe und frische Gurte für jedes MG an Bord der {ship}.",
    'Test fire over the sea': "Probeschießen über dem Meer",
    'Every gun runs clean.': "Jedes MG schießt einwandfrei.",
    // titles of the field orders
    'First Light over Emden': "Morgengrauen über Emden", 'The Dutch Airfields': "Die holländischen Flugplätze", 'Frankfurt Morning': "Morgen über Frankfurt",
    'Saar Rail Yards': "Saar-Bahnanlagen", 'Bremen Docks': "Bremer Docks", 'The Baltic Run': "Der Ostsee-Flug", 'Sunday at Münster': "Sonntag in Münster",
    'Black Thursday': "Schwarzer Donnerstag", 'Through the Undercast': "Durch die Wolkendecke", 'Münster Again': "Wieder Münster", 'Bremen in the Clouds': "Bremen in den Wolken",
    'Paris Ball-Bearings': "Pariser Kugellager", 'Kiel with the Mustangs': "Kiel mit den Mustangs", 'Bremen Port Area': "Bremer Hafengebiet", 'Christmas Week': "Weihnachtswoche",
    'Flak Alley': "Flak-Gasse", 'Frankfurt by Radar': "Frankfurt per Radar", 'Frankfurt Rail Yards': "Frankfurter Bahnanlagen", 'Big Week: Leipzig': "Big Week: Leipzig",
    'Big Week: Brunswick': "Big Week: Braunschweig", 'Schweinfurt Again': "Wieder Schweinfurt", 'Big B': "Big B", 'Erkner': "Erkner",
    'Berlin by Daylight': "Berlin bei Tageslicht",
  },
  patterns: [
    [new RegExp(`^(${whatRx}), (.+)$`), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
    [/^Mission (\d+) of your tour\. The group is going to (.+) today, and the target is the (.+)\.$/, (m, tr) => `Einsatz ${m[1]} deiner Tour. Die Group fliegt heute nach ${tr(m[2])}, Ziel: ${tr(m[3])}.`],
    [/^The target is the (.+) at (.+), a long way south\. The Luftwaffe knows the bombers are coming, and a battle group will meet us over the target\.$/,
      (m, tr) => `Ziel: ${tr(m[1])} in ${tr(m[2])}, weit im Süden. Die Luftwaffe weiß, dass die Bomber kommen, und ein Gefechtsverband erwartet uns über dem Ziel.`],
    [/^The (.+) carries (\d+) repair patches from earlier missions\.$/, (m) => `Die ${m[1]} trägt ${m[2]} Reparaturflicken von früheren Einsätzen.`],
    [/^The (.+) is fresh from the depot\. Treat her well\.$/, (m) => `Die ${m[1]} kommt frisch aus dem Depot. Behandelt sie gut.`],
    [/^Number (\d) engine is running rough\. The crew chief says she will hold\.$/, (m) => `Motor Nummer ${m[1]} läuft unruhig. Der Chefmechaniker sagt, er hält.`],
    [/^(.+) is in hospital\. A spare man from the pool flies in his place\.$/, (m, tr) => `${name(m[1], tr)} liegt im Lazarett. Ein Ersatzmann aus der Reserve fliegt für ihn.`],
    [/^(\d+) new men are flying with the crew\. Keep an eye on them\.$/, (m) => `${m[1]} neue Männer fliegen mit der Besatzung. Behaltet sie im Auge.`],
    [/^You are on the (.+) today\. Use every position, one through five\.$/, (m, tr) => `Deine Position heute: ${tr(m[1])}. Nutze alle Positionen, eins bis fünf.`],
    [/^Bombs on the (.+) at (.+)\. Mission (\d+) is in the books\.$/, (m, tr) => `Bomben auf ${tr(m[1])} in ${tr(m[2])}. Einsatz ${m[3]} ist verbucht.`],
    [/^(Sgt\.|S\/Sgt\.|T\/Sgt\.|Lt\.|Capt\.|Maj\.) ([A-Z][A-Za-z']+)$/, (m, tr) => `${RANK[m[1]]} ${tr(m[2])}`],
    // recorded interphone lines (tools/voice/lines.json, group "Phase 11 the tour")
    [/^Pilot to crew: that's number ([a-z-]+) in the books\.$/, (m) => `Pilot an Besatzung: Nummer ${NUM_WORDS.indexOf(m[1]) + 1} ist verbucht.`],
  ],
};
table.phrases["Halfway, boys. Twelve down and thirteen to go."] = "Halbzeit, Jungs. Zwölf geschafft, dreizehn noch.";
table.phrases["One more, crew. One more and we all go home."] = "Noch einer, Leute. Noch einer, und wir gehen alle nach Hause.";
table.phrases["That's twenty-five. Crew, we're going home."] = "Das ist der fünfundzwanzigste. Besatzung, wir fliegen nach Hause.";
table.phrases["They won't count that one. We go again."] = "Den zählen sie nicht. Wir fliegen noch mal.";
table.phrases["We lost the ship. They'll find us another one."] = "Wir haben die Maschine verloren. Sie finden uns eine andere.";
table.phrases['Mail call! Letters from home for everybody.'] = "Post! Briefe von zu Hause für alle.";
table.phrases['A week at the flak house. Real beds and real eggs.'] = "Eine Woche im Erholungsheim. Echte Betten und echte Eier.";
table.phrases['Maximum effort tomorrow. Get some sleep.'] = "Morgen Höchsteinsatz. Schlaft ein bisschen.";
table.phrases["Fog on the field. Nobody's flying today."] = "Nebel auf dem Platz. Heute fliegt keiner.";

export default table;
