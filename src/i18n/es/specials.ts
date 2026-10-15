import type { PhraseTable, Pattern } from '../types';

// Spanish for ar/specials.ts (same keys and patterns).

const FIRST = ['otto', 'wilhelm', 'ernst', 'kurt', 'johann'];
const LAST = ['kessler', 'brandauer', 'falkenrath', 'reinholt', 'steinbrecher'];
const R_RANK = '(Hauptmann|Major|Oberleutnant)';
const R_SHORT = '(Hptm\\.|Maj\\.|Oblt\\.)';
const R_FIRST = `(${FIRST.join('|')})`;
const R_LAST = `(${LAST.join('|')})`;
const re = (s: string, flags = 'i') => new RegExp(`^${s}$`, flags);
const SIDE: Record<string, string> = { RIGHT: 'DERECHA', LEFT: 'IZQUIERDA' };
const vic = (n: string) => `${n} ${+n === 1 ? 'VICTORIA' : 'VICTORIAS'}`;

const patterns: Pattern[] = [
  [re(`ACE SQUADRON · ${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `ESCUADRILLA DE ASES · ${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `${m[1]} ${m[2]} ${m[3]} · ${vic(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST}`), (m) => `${m[1]} ${m[2]} ${m[3]}`],
  [re(`ACE · (\\d+) VICTORIES`), (m) => `AS · ${vic(m[1])}`],
  [re(`${R_LAST}'s Staffel`), (m) => `Staffel de ${m[1]}`],
  [re(`${R_SHORT} ${R_LAST} · (\\d+)`), '$1 $2 · $3'],
  [re(`${R_SHORT} ${R_LAST} got away`), '$1 $2 escapó'],
  [re(`${R_SHORT} ${R_LAST} shot down`), '$1 $2 derribado'],
  [re(`${R_SHORT} ${R_LAST}`), '$1 $2'],
  [re(R_LAST), '$1'],
  [re('(.+) \\(yellow nose\\)'), (m, tr) => `${tr(m[1])} (morro amarillo)`],
  [re('\\+(\\d+) WINGMEN'), (m) => `+${m[1]} ${+m[1] === 1 ? 'PUNTO' : 'PUNTOS'}`],
  [re(`Yellow noses, twelve o'clock high! That's ${R_LAST}'s Staffel — (\\d+) kills!`),
    (m) => `¡Morros amarillos, a las doce altas! Es la Staffel de ${m[1]} — ¡${m[2]} derribos!`],
  [re(`${R_LAST} is breaking off — the yellow noses are heading home\\.`), '$1 se retira — los morros amarillos vuelven a casa.'],
  [re(`You got ${R_LAST}! The whole group saw him go down!`), '¡Has derribado a $1! ¡Todo el grupo lo vio caer!'],
  [re(`Somebody got ${R_LAST}! Scratch one Experte!`), '¡Alguien derribó a $1! ¡Un Experte menos!'],
  [re(`Viermots ahead\\. ${R_LAST} here — the fat one in the middle is mine\\. Horrido!`), 'Viermots al frente. Aquí $1 — el gordo del centro es mío. ¡Horrido!'],
  [/^Achtung, Amis\. Number (\d+) is flying in that box\. Pauke, pauke!$/, 'Achtung, Amis. El número $1 vuela en esa formación. ¡Pauke, Pauke!'],

  [/^(\d+) HEAVY FIGHTERS WITH ROCKETS$/, (m) => `${m[1]} ${+m[1] === 1 ? 'CAZA PESADO' : 'CAZAS PESADOS'} CON COHETES`],
  [/^(\d+) \/ (\d+) LEFT$/, 'QUEDAN $1 / $2'],
  [/^(\d+) LAUNCHERS?$/, (m) => `${m[1]} ${+m[1] === 1 ? 'LANZADOR' : 'LANZADORES'}`],

  [/^HEAD-ON ×(\d+)$/, 'DE FRENTE ×$1'],
  [/^109s diving on (.+)! She's out of formation — they're going for her!$/, '¡Los 109 se lanzan sobre $1! Está fuera de formación — ¡van a por él!'],
  [/^(.+) hanging back out of range — he's got rocket tubes! He'll lob them in from a kilometre!$/,
    (m, tr) => `${tr(m[1])} se queda fuera de alcance — ¡lleva tubos lanzacohetes! ¡Los disparará desde un kilómetro!`],
  [/^Zerstörers! Twin-engine destroyers forming up at (.+) — they're carrying rockets!$/,
    (m, tr) => `¡Zerstörer! Bimotores formando a ${tr(m[1])} — ¡llevan cohetes!`],
  [/^Zerstörer formation on the <b>(RIGHT|LEFT)<\/b> — <kbd>(\d)<\/kbd> (right|left) waist · break them up before they fire$/,
    (m) => `Formación de Zerstörer a la <b>${SIDE[m[1]]}</b> — <kbd>${m[2]}</kbd> lateral ${m[3] === 'right' ? 'derecho' : 'izquierdo'} · dispérsalos antes de que disparen`],
];

const table: PhraseTable = {
  phrases: {
    'SPECIAL EVENT': 'EVENTO ESPECIAL',
    'Yellow noses — bring down the Staffelkapitän': 'Morros amarillos — derriba al Staffelkapitän',
    'The aces are coming head-on — <b>TOP TURRET</b> <kbd>3</kbd> · bring down the leader': 'Los ases vienen de frente — <b>TORRETA SUPERIOR</b> <kbd>3</kbd> · derriba al jefe',
    'ALONE': 'SOLO',
    'ACE': 'AS',
    'Ace down': 'As derribado',
    'Zerstörer wave': 'Oleada de Zerstörer',
    'Break up the formation before the salvos land': 'Rompe la formación antes de que lleguen las salvas',
    'Zerstörer wave broken up': 'Oleada de Zerstörer dispersada',
    'Rocket barrage': 'Andanada de cohetes',
    'Shoot down the launchers standing off at 1 km': 'Derriba los lanzadores que esperan a 1 km',
    'SHOOT DOWN THE LAUNCHERS': 'DERRIBA LOS LANZADORES',
    'Launchers on <b>BOTH BEAMS</b> — <kbd>1</kbd> left · <kbd>2</kbd> right waist': 'Lanzadores en <b>AMBOS COSTADOS</b> — <kbd>1</kbd> lateral izquierdo · <kbd>2</kbd> lateral derecho',
    'Rocket barrage broken up': 'Andanada de cohetes desbaratada',
    'LAUNCHER': 'LANZADOR',

    "That's the last of the destroyers! Nice work, boys.": '¡Ese era el último Zerstörer! Buen trabajo, chicos.',
    "Launchers are down! That's the end of the rockets.": '¡Lanzadores derribados! Se acabaron los cohetes.',
    "They're out of rockets — the heavies are heading home.": 'Se han quedado sin cohetes — los pesados vuelven a casa.',
    'Close up, Kinder. We go through them together — and nobody turns away before me.': 'Cerrad filas, Kinder. Los atravesamos juntos — y nadie se aparta antes que yo.',
    'Indianer at the bombers? Let them come. Today I paint another bar on my rudder.': '¿Indianer junto a los bombarderos? Que vengan. Hoy pinto otra barra en mi timón.',

    'PINCER': 'PINZA',
    'KOMET': 'KOMET',
    'JET': 'REACTOR',
    'ROCKETS': 'COHETES',
    'ZERSTÖRER': 'ZERSTÖRER',
    'TOP COVER': 'COBERTURA ALTA',
    'BARRAGE': 'ANDANADA',

    "They're forming up for a head-on pass! Twelve o'clock high — a whole line of them!": '¡Se forman para una pasada de frente! A las doce altas — ¡toda una línea!',
    "Schwarm forming up dead ahead, twelve o'clock high! Head-on pass coming!": '¡Schwarm formando justo al frente, a las doce altas! ¡Viene una pasada de frente!',
    "Head-on attack forming at <b>12 O'CLOCK HIGH</b> — take the <b>TOP TURRET</b> <kbd>3</kbd>": 'Ataque de frente a las <b>12 ALTAS</b> — toma la <b>TORRETA SUPERIOR</b> <kbd>3</kbd>',
    "Two pairs splitting up — one each side! Three o'clock and nine o'clock, they're going to hit us together!": '¡Dos parejas se separan — una por lado! A las tres y a las nueve, ¡van a atacarnos a la vez!',
    'Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right': 'Pinza por <b>AMBOS COSTADOS</b> — elige un lateral: <kbd>1</kbd> izquierdo · <kbd>2</kbd> derecho',
    "Komet! Rocket fighter climbing up from six o'clock low — he's fast!": '¡Komet! Caza cohete subiendo desde las seis bajas — ¡es rápido!',
    "They're turning in — rockets!": '¡Viran hacia nosotros — cohetes!',
    'Here come the 109s — straight down out of the sun!': '¡Ahí vienen los 109 — en picado desde el sol!',
    'Flak coming up — heavy guns below us. Hold steady.': 'Sube la antiaérea — cañones pesados debajo. Aguantad firmes.',
    "Me 163 climbing from <b>6 O'CLOCK LOW</b> — <b>BALL</b> <kbd>4</kbd> or <b>TAIL</b> <kbd>5</kbd>": 'Me 163 subiendo desde las <b>6 BAJAS</b> — <b>VENTRAL</b> <kbd>4</kbd> o <b>COLA</b> <kbd>5</kbd>',
    "Jet coming up from six o'clock! Never seen anything that fast!": '¡Reactor subiendo desde las seis! ¡Nunca vi nada tan rápido!',
    "109s staying up high — top cover. They'll pounce on anybody who drops out of formation!": 'Los 109 se quedan arriba — cobertura alta. ¡Caerán sobre cualquiera que salga de la formación!',
  },
  patterns,
};
export default table;
