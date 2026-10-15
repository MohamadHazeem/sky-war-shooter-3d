// German for ar/pilot.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { INTERCEPT: 'ABFANGEN', SWEEP: 'JAGDVORSTOSS', STRAGGLER: 'NACHZÜGLER' };
const SIDE: Record<string, string> = { left: 'nach links', right: 'nach rechts' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (INTERCEPT|SWEEP|STRAGGLER) — (.+)$/, (m, tr) => `Runde ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])}`],
  [/^ROUND (\d+) · (INTERCEPT|SWEEP|STRAGGLER)$/, (m) => `RUNDE ${m[1]} · ${KIND[m[2]]}`],
  [/^cover "(.+)" \((\d+)%\) · (\d+)s$/, 'decke „$1“ ($2 %) · $3 s'],
  [/^cover "(.+)" \((\d+)%\) · clear her six$/, 'decke „$1“ ($2 %) · halte ihr Heck frei'],
  [/^(\d+) bandits?, (\d+) on the bombers$/, '$1 Feindjäger, $2 an den Bombern'],
  [/^(\d+) bandits?$/, '$1 Feindjäger'],
  [/^(\d+) bombers protected — \+(\d+)$/, '$1 Bomber geschützt — +$2'],
  [/^Straggler defended — \+(\d+)$/, 'Nachzügler verteidigt — +$1'],
  [/^Bomber saved — \+(\d+)$/, 'Bomber gerettet — +$1'],
  [/^Intercepted — \+(\d+)$/, 'Abgefangen — +$1'],
  [/^Straggler "(.+)" lost$/, 'Nachzügler „$1“ verloren'],
  [/^Cover "(.+)" — she's falling out of formation$/, 'Deck „$1“ — sie fällt aus der Formation'],
  [/^"(.+)" is heading home · \+(\d+)$/, '„$1“ fliegt nach Hause · +$2'],
  [/^Careful, Blue two — that (.+) has a rear gunner\. Come at him from below!$/, (m, tr) => `Vorsicht, Blau zwei — die ${tr(m[1])} hat einen Heckschützen. Greif sie von unten an!`],
  [/^He's seen you — he's breaking (left|right)! Stay with him!$/, (m) => `Er hat dich gesehen — er kurvt ${SIDE[m[1]]} weg! Bleib dran!`],
  [/^The (.+) is diving away — let him go or run him down!$/, (m, tr) => `Die ${tr(m[1])} stürzt weg — lass sie ziehen oder hol sie ein!`],
  [/^Little friends, this is (.+)\. We've lost two engines and can't keep up — can you cover us\?$/, 'Kleine Freunde, hier „$1“. Zwei Motoren ausgefallen, wir kommen nicht mit — könnt ihr uns decken?'],
];

const table: PhraseTable = {
  phrases: {
    // m4 / m7 briefings and objectives
    'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. First the Focke-Wulfs and Zerstörers will go for the bombers — intercept them before they reach the box. Then expect a fighter sweep of 109s hunting the escort, flying in pairs: watch for the wingman. And if a Fortress falls out of formation, the wolves will go for her. Do not let them.':
      'Du fliegst eine P-51D Mustang als Nahbegleitschutz für eine Box aus zwölf Fortresses. Zuerst gehen die Focke-Wulfs und Zerstörer auf die Bomber los — fang sie ab, bevor sie die Box erreichen. Dann folgt ein Jagdvorstoß von 109ern, die paarweise Jagd auf den Begleitschutz machen: Achte auf den Rottenflieger. Und fällt eine Fortress aus der Formation, stürzen sich die Wölfe auf sie. Lass das nicht zu.',
    'Mouse aim flies the aircraft toward where you look. W and S for throttle, V for cockpit or chase view, T padlocks the nearest bandit. Your six fifties are harmonised at two hundred and fifty metres — get in close.':
      'Mit Mauszielen fliegt die Maschine dorthin, wohin du schaust. W und S für den Schub, V für Cockpit- oder Verfolgeransicht, T schaltet auf den nächsten Feindjäger auf. Deine sechs .50er sind auf zweihundertfünfzig Meter justiert — geh nah ran.',
    'Intercept the attackers before they reach the bombers': 'Fang die Angreifer ab, bevor sie die Bomber erreichen',
    'Win the dogfight against the fighter sweep': 'Gewinne den Luftkampf gegen den Jagdvorstoß',
    'Save the straggler': 'Rette den Nachzügler',
    'You lead the escort for our box. Rocket-armed Zerstörers will try to break up the formation, then the 109s and the new jets will come for the escort. The Me 262 is faster than anything we have — do not chase it, turn inside it and catch it when it comes back round. Bf 110s carry a rear gunner: come at them from below.':
      'Du führst den Begleitschutz unserer Box. Zerstörer mit Raketen werden versuchen, die Formation zu sprengen, dann kommen die 109er und die neuen Düsenjäger für den Begleitschutz. Die Me 262 ist schneller als alles, was wir haben — jag sie nicht, kurv innen und erwisch sie, wenn sie zurückkommt. Bf 110 haben einen Heckschützen: Greif sie von unten an.',
    'Over the target a crippled Fortress will need you. Pick your targets, protect the bombers, and keep your speed up.':
      'Über dem Ziel wird eine angeschossene Fortress dich brauchen. Wähl deine Ziele, schütz die Bomber und halte deine Geschwindigkeit.',
    'Break up the Zerstörer attacks': 'Sprenge die Zerstörer-Angriffe',
    'Survive the sweep of 109s and jets': 'Überstehe den Vorstoß der 109er und Düsenjäger',
    'Save the straggler over Berlin': 'Rette den Nachzügler über Berlin',

    // PilotRounds titles and objectives
    'Intercept — head them off before they reach the box': 'Abfangen — schneide ihnen den Weg zur Box ab',
    'Fighter sweep — the 109s are hunting the escort': 'Jagdvorstoß — die 109er jagen den Begleitschutz',
    'Save the straggler — a Fortress is falling out': 'Rette den Nachzügler — eine Fortress fällt zurück',
    'Intercept — break up the Zerstörer attack': 'Abfangen — sprenge den Zerstörer-Angriff',
    'Fighter sweep — 109s and jets over Berlin': 'Jagdvorstoß — 109er und Düsenjäger über Berlin',
    'Save the straggler — a crippled Fortress over Berlin': 'Rette den Nachzügler — angeschossene Fortress über Berlin',
    'Dogfight the sweep — keep them off the bombers': 'Bekämpfe den Vorstoß — halte sie von den Bombern fern',
    'Cover the straggler': 'Decke den Nachzügler',
    'Break up the attacks before they reach the bombers': 'Sprenge die Angriffe, bevor sie die Bomber erreichen',
    'Win the dogfight — keep them off the bombers': 'Gewinne den Luftkampf — halte sie von den Bombern fern',
    'more bandits inbound': 'weitere Feindjäger im Anflug',
    'sky clear': 'Himmel frei',
    'STRAGGLER': 'NACHZÜGLER',
    'STRAGGLER SAVED': 'NACHZÜGLER GERETTET',

    // pilot radio
    "He's reversing — scissors! Throttle back, make him fly out in front!": 'Er kehrt um — Schere! Gas weg, lass ihn vorbeischießen!',
    "Jet's running — don't chase him, catch him when he turns back!": 'Der Düsenjäger haut ab — jag ihn nicht, erwisch ihn, wenn er umkehrt!',
    "Head-on! Hold your fire till he's close, then break high!": 'Frontal! Feuer halten, bis er nah ist, dann steil nach oben weg!',
    'Watch it, Blue two — his wingman is sliding in behind you!': 'Pass auf, Blau zwei — sein Rottenflieger schiebt sich hinter dich!',
    "He's spiralling down — don't follow him into the deck!": 'Er trudelt runter — folg ihm nicht bis zum Boden!',
    "Focke-Wulf's zooming up for another pass. Keep your speed!": 'Die Focke-Wulf zieht hoch für den nächsten Anflug. Halt deine Fahrt!',
    'Thanks, little friend — he was all over us!': 'Danke, kleiner Freund — der hing uns im Nacken!',
    "We owe you one, little friend. We're going to make it!": 'Wir schulden dir was, kleiner Freund. Wir schaffen es!',
    'Bandits twelve o\'clock low, climbing for the bombers. Get between them and the big friends!': 'Feindjäger zwölf Uhr tief, steigen zu den Bombern. Geh zwischen sie und die großen Freunde!',
    "Little friends, twin-engine bandits closing at our six — they've got rockets!": 'Kleine Freunde, zweimotorige Feinde nähern sich von sechs Uhr — die haben Raketen!',
    "Another gaggle, nine o'clock level. Some of them are coming for us!": 'Noch ein Haufen, neun Uhr gleiche Höhe. Einige kommen auf uns zu!',
    'Heads up — 109s high at six, coming down on us! Break and engage!': 'Achtung — 109er hoch auf sechs Uhr, stoßen auf uns herab! Abkurven und angreifen!',
    "Bandits on the bombers, twelve o'clock! Little friends, where are you?": 'Feindjäger an den Bombern, zwölf Uhr! Kleine Freunde, wo seid ihr?',
    "Focke-Wulfs diving out of the sun — don't try to out-climb them!": 'Focke-Wulfs stoßen aus der Sonne — versuch nicht, sie im Steigflug abzuhängen!',
    'Bandits going for the cripple! Blue two, get back there and cover her!': 'Die Feinde gehen auf die Angeschossene los! Blau zwei, zurück und deck sie!',
    "More of them coming in on our tail — we can't take another pass!": 'Noch mehr am Heck — einen weiteren Anflug halten wir nicht aus!',
    "One last pass at the box, twelve o'clock. Let's finish this!": 'Ein letzter Anflug auf die Box, zwölf Uhr. Bringen wir es zu Ende!',
    "Big gaggle at twelve o'clock — drop tanks and go! Hit them before they reach the box!": 'Großer Haufen auf zwölf Uhr — Zusatztanks ab und los! Erwisch sie vor der Box!',
    "Zerstörers at six o'clock, with rockets! Get them off us!": 'Zerstörer auf sechs Uhr, mit Raketen! Schafft sie uns vom Hals!',
    "Jets! Twelve o'clock high, fast movers — go for them when they slow down!": 'Düsenjäger! Zwölf Uhr hoch, sehr schnell — greift sie an, wenn sie langsamer werden!',
    "Messerschmitts, high at five o'clock! Here they come — break!": 'Messerschmitts, hoch auf fünf Uhr! Da kommen sie — abkurven!',
    "Jets coming through! You won't out-run them — turn inside them!": 'Düsenjäger im Anflug! Davonfliegen kannst du nicht — kurv innen!',
    "Fighters on the bombers, twelve o'clock level!": 'Jäger an den Bombern, zwölf Uhr gleiche Höhe!',
    "They're sending another Gruppe down on us. Stay together!": 'Sie schicken noch eine Gruppe auf uns los. Bleibt zusammen!',
    "They're on the straggler! Blue two, cover her, I'll take the box!": 'Sie sind am Nachzügler! Blau zwei, deck sie, ich übernehme die Box!',
    'Jet coming up our tail! Somebody get him off us!': 'Düsenjäger kommt von hinten! Schafft ihn uns vom Hals!',
    "Last push — they're throwing everything at the box!": 'Letzter Ansturm — sie werfen alles auf die Box!',

    // field dressing, special events, pacing
    "Hold still — I've patched you up. Back on that gun.": 'Halt still — ich hab dich verbunden. Zurück ans MG.',
    "The yellow noses are breaking off — they've lost their leader!": 'Die Gelbnasen drehen ab — sie haben ihren Anführer verloren!',
    "Rocket barrage! Heavies standing off at a kilometre — they'll keep lobbing rockets into the box until we knock them down!": 'Raketensperrfeuer! Schwere Maschinen auf einen Kilometer Abstand — sie schießen Raketen in die Box, bis wir sie runterholen!',
    "Launchers are down! That's the end of the rockets.": 'Die Raketenträger sind unten! Schluss mit den Raketen.',
    "They're out of rockets — the heavies are heading home.": 'Keine Raketen mehr — die Schweren drehen ab nach Hause.',
    "That's the last of the destroyers! Nice work, boys.": 'Das war der letzte Zerstörer! Gute Arbeit, Jungs.',
    "That one's an ace — kill markings all down the tail. Watch him!": 'Das ist ein Ass — Abschussbalken überall am Leitwerk. Pass auf ihn auf!',
    "That's the lot of them! They're breaking off!": 'Das waren alle! Sie drehen ab!',
    // share / privacy (Share.ts, Analytics.ts)
    'Share screenshot': 'Screenshot teilen',
    'Share result': 'Ergebnis teilen',
    'Could not capture the screen': 'Bildschirm konnte nicht aufgenommen werden',
    'Screenshot saved · share text and link copied': 'Screenshot gespeichert · Text und Link kopiert',
    'Screenshot saved': 'Screenshot gespeichert',
    'Result and link copied — paste it anywhere': 'Ergebnis und Link kopiert — überall einfügbar',
    'PRIVACY': 'DATENSCHUTZ',
    'Share anonymous gameplay stats': 'Anonyme Spielstatistiken teilen',
    'Your browser asks sites not to track you (Do Not Track), so no stats are sent.': 'Dein Browser bittet Websites, dich nicht zu verfolgen (Do Not Track), daher werden keine Statistiken gesendet.',
    'One anonymous summary per mission (mission, result, kills, accuracy, gun positions used, settings, screen size and frame rate) helps balance the game. No name, account or personal data is sent.': 'Eine anonyme Zusammenfassung pro Mission (Mission, Ergebnis, Abschüsse, Trefferquote, genutzte Waffenstände, Einstellungen, Bildschirmgröße und Bildrate) hilft beim Balancing. Es werden kein Name, kein Konto und keine persönlichen Daten gesendet.',
  },
  patterns,
};
export default table;
