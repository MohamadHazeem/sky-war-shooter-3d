import type { PhraseTable, Pattern } from '../types';

// German for ar/specials.ts (same keys and patterns).

const FIRST = ['otto', 'wilhelm', 'ernst', 'kurt', 'johann'];
const LAST = ['kessler', 'brandauer', 'falkenrath', 'reinholt', 'steinbrecher'];
const R_RANK = '(Hauptmann|Major|Oberleutnant)';
const R_SHORT = '(Hptm\\.|Maj\\.|Oblt\\.)';
const R_FIRST = `(${FIRST.join('|')})`;
const R_LAST = `(${LAST.join('|')})`;
const re = (s: string, flags = 'i') => new RegExp(`^${s}$`, flags);
const SIDE: Record<string, string> = { RIGHT: 'RECHTS', LEFT: 'LINKS' };
const vic = (n: string) => `${n} ${+n === 1 ? 'LUFTSIEG' : 'LUFTSIEGE'}`;

const patterns: Pattern[] = [
  [re(`ACE SQUADRON · ${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `ASSE-STAFFEL · ${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST}`), (m) => `${m[1]} ${m[2]} ${m[3]}`],
  [re(`ACE · (\\d+) VICTORIES`), (m) => `ASS · ${vic(m[1])}`],
  [re(`${R_LAST}'s Staffel`), (m) => `Staffel ${m[1]}`],
  [re(`${R_SHORT} ${R_LAST} · (\\d+)`), '$1 $2 · $3'],
  [re(`${R_SHORT} ${R_LAST} got away`), '$1 $2 entkommen'],
  [re(`${R_SHORT} ${R_LAST} shot down`), '$1 $2 abgeschossen'],
  [re(`${R_SHORT} ${R_LAST}`), '$1 $2'],
  [re(R_LAST), '$1'],
  [re('(.+) \\(yellow nose\\)'), (m, tr) => `${tr(m[1])} (gelbe Nase)`],
  [re('\\+(\\d+) WINGMEN'), '+$1 ROTTENFLIEGER'],
  [re(`Yellow noses, twelve o'clock high! That's ${R_LAST}'s Staffel — (\\d+) kills!`),
    (m) => `Gelbe Nasen, zwölf Uhr hoch! Das ist die Staffel ${m[1]} — ${m[2]} Abschüsse!`],
  [re(`${R_LAST} is breaking off — the yellow noses are heading home\\.`), '$1 dreht ab — die gelben Nasen fliegen heim.'],
  [re(`You got ${R_LAST}! The whole group saw him go down!`), 'Du hast $1 erwischt! Die ganze Gruppe hat ihn runtergehen sehen!'],
  [re(`Somebody got ${R_LAST}! Scratch one Experte!`), 'Jemand hat $1 erwischt! Ein Experte weniger!'],
  [re(`Viermots ahead\\. ${R_LAST} here — the fat one in the middle is mine\\. Horrido!`), 'Viermots voraus. Hier $1 — der Dicke in der Mitte gehört mir. Horrido!'],
  [/^Achtung, Amis\. Number (\d+) is flying in that box\. Pauke, pauke!$/, 'Achtung, Amis. Nummer $1 fliegt in dieser Box. Pauke, Pauke!'],

  [/^(\d+) HEAVY FIGHTERS WITH ROCKETS$/, '$1 ZERSTÖRER MIT RAKETEN'],
  [/^(\d+) \/ (\d+) LEFT$/, 'NOCH $1 / $2'],
  [/^(\d+) LAUNCHERS?$/, '$1 WERFER'],

  [/^HEAD-ON ×(\d+)$/, 'FRONTAL ×$1'],
  [/^109s diving on (.+)! She's out of formation — they're going for her!$/, '109er stürzen sich auf $1! Sie ist aus der Formation — die gehen auf sie los!'],
  [/^(.+) hanging back out of range — he's got rocket tubes! He'll lob them in from a kilometre!$/,
    (m, tr) => `${tr(m[1])} bleibt außer Reichweite — der hat Raketenrohre! Der schießt aus einem Kilometer!`],
  [/^Zerstörers! Twin-engine destroyers forming up at (.+) — they're carrying rockets!$/,
    (m, tr) => `Zerstörer! Zweimotorige sammeln sich bei ${tr(m[1])} — die haben Raketen!`],
  [/^Zerstörer formation on the <b>(RIGHT|LEFT)<\/b> — <kbd>(\d)<\/kbd> (right|left) waist · break them up before they fire$/,
    (m) => `Zerstörer-Formation <b>${SIDE[m[1]]}</b> — <kbd>${m[2]}</kbd> Seitenschütze ${m[3] === 'right' ? 'rechts' : 'links'} · sprengen, bevor sie feuern`],
];

const table: PhraseTable = {
  phrases: {
    'SPECIAL EVENT': 'SONDEREREIGNIS',
    'Yellow noses — bring down the Staffelkapitän': 'Gelbe Nasen — schieß den Staffelkapitän ab',
    'The aces are coming head-on — <b>TOP TURRET</b> <kbd>3</kbd> · bring down the leader': 'Die Asse kommen frontal — <b>OBERER TURM</b> <kbd>3</kbd> · schieß den Anführer ab',
    'ALONE': 'ALLEIN',
    'ACE': 'ASS',
    'Ace down': 'Ass abgeschossen',
    'Zerstörer wave': 'Zerstörer-Welle',
    'Break up the formation before the salvos land': 'Sprenge die Formation, bevor die Salven einschlagen',
    'Zerstörer wave broken up': 'Zerstörer-Welle gesprengt',
    'Rocket barrage': 'Raketensperrfeuer',
    'Shoot down the launchers standing off at 1 km': 'Schieß die Werfer ab, die auf 1 km Abstand lauern',
    'SHOOT DOWN THE LAUNCHERS': 'SCHIESS DIE WERFER AB',
    'Launchers on <b>BOTH BEAMS</b> — <kbd>1</kbd> left · <kbd>2</kbd> right waist': 'Werfer auf <b>BEIDEN SEITEN</b> — <kbd>1</kbd> links · <kbd>2</kbd> rechts',
    'Rocket barrage broken up': 'Raketensperrfeuer zerschlagen',
    'LAUNCHER': 'WERFER',

    "That's the last of the destroyers! Nice work, boys.": 'Das war der letzte Zerstörer! Gute Arbeit, Jungs.',
    "Launchers are down! That's the end of the rockets.": 'Die Werfer sind unten! Schluss mit den Raketen.',
    "They're out of rockets — the heavies are heading home.": 'Keine Raketen mehr — die Schweren fliegen heim.',
    'Close up, Kinder. We go through them together — and nobody turns away before me.': 'Aufschließen, Kinder. Wir gehen gemeinsam durch — und keiner dreht vor mir ab.',
    'Indianer at the bombers? Let them come. Today I paint another bar on my rudder.': 'Indianer bei den Bombern? Sollen sie kommen. Heute male ich noch einen Balken aufs Seitenruder.',

    'PINCER': 'ZANGE',
    'KOMET': 'KOMET',
    'JET': 'DÜSE',
    'ROCKETS': 'RAKETEN',
    'ZERSTÖRER': 'ZERSTÖRER',
    'TOP COVER': 'HÖHENDECKUNG',
    'BARRAGE': 'SPERRFEUER',

    "They're forming up for a head-on pass! Twelve o'clock high — a whole line of them!": 'Die formieren sich für einen Frontalangriff! Zwölf Uhr hoch — eine ganze Reihe!',
    "Schwarm forming up dead ahead, twelve o'clock high! Head-on pass coming!": 'Schwarm formiert sich direkt voraus, zwölf Uhr hoch! Frontalangriff kommt!',
    "Head-on attack forming at <b>12 O'CLOCK HIGH</b> — take the <b>TOP TURRET</b> <kbd>3</kbd>": 'Frontalangriff auf <b>12 UHR HOCH</b> — nimm den <b>OBEREN TURM</b> <kbd>3</kbd>',
    "Two pairs splitting up — one each side! Three o'clock and nine o'clock, they're going to hit us together!": 'Zwei Rotten teilen sich — eine je Seite! Drei Uhr und neun Uhr, die greifen gleichzeitig an!',
    'Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right': 'Zange von <b>BEIDEN SEITEN</b> — wähl ein Seiten-MG: <kbd>1</kbd> links · <kbd>2</kbd> rechts',
    "Komet! Rocket fighter climbing up from six o'clock low — he's fast!": 'Komet! Raketenjäger steigt von sechs Uhr tief — der ist schnell!',
    "They're turning in — rockets!": 'Die drehen ein — Raketen!',
    'Here come the 109s — straight down out of the sun!': 'Da kommen die 109er — direkt aus der Sonne!',
    'Flak coming up — heavy guns below us. Hold steady.': 'Flak kommt hoch — schwere Geschütze unter uns. Ruhig bleiben.',
    "Me 163 climbing from <b>6 O'CLOCK LOW</b> — <b>BALL</b> <kbd>4</kbd> or <b>TAIL</b> <kbd>5</kbd>": 'Me 163 steigt von <b>6 UHR TIEF</b> — <b>KUGELTURM</b> <kbd>4</kbd> oder <b>HECK</b> <kbd>5</kbd>',
    "Jet coming up from six o'clock! Never seen anything that fast!": 'Düsenjäger von sechs Uhr! So was Schnelles hab ich noch nie gesehen!',
    "109s staying up high — top cover. They'll pounce on anybody who drops out of formation!": '109er bleiben oben — Höhendeckung. Die stürzen sich auf jeden, der aus der Formation fällt!',
  },
  patterns,
};
export default table;
