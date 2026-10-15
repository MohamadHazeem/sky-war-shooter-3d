// Spanish for ar/raid.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'NIGHT RAID': 'INCURSIÓN NOCTURNA', RAID: 'INCURSIÓN' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (NIGHT RAID|RAID) — (.+) · (\d+)\/(\d+) through$/, (m, tr) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])} · ${m[5]}/${m[6]} han pasado`],
  [/^ROUND (\d+) · (NIGHT RAID|RAID)$/, (m) => `RONDA ${m[1]} · ${KIND[m[2]]}`],
  [/^(\d+) bombers? inbound, nearest ([\d.]+) km from the field$/, (m) => `${m[1]} ${+m[1] === 1 ? 'bombardero en camino' : 'bombarderos en camino'}, el más cercano a ${m[2]} km del aeródromo`],
  [/^Airfield untouched this round — \+(\d+)$/, 'Aeródromo intacto esta ronda — +$1'],
  [/^(.+) bombed the airfield — (\d+) of (\d+) allowed$/, (m, tr) => `${tr(m[1])} bombardeó el aeródromo — ${m[2]} de ${m[3]} permitidos`],
  [/^(.+) jettisoned his bombs$/, (m, tr) => `${tr(m[1])} soltó sus bombas`],
  [/^Bomber down short of the field — \+(\d+)$/, 'Bombardero derribado antes del aeródromo — +$1'],
  [/^Let no more than (\d+) bombers through in three rounds$/, 'No dejes pasar más de $1 bombarderos en tres rondas'],
  [/^Wingman Blue Two: (.+) attack my target · (.+) cover me · (.+) protect the bombers · (.+) form up$/, 'Punto Azul Dos: $1 ataca mi blanco · $2 cúbreme · $3 protege los bombarderos · $4 en formación'],
];

const table: PhraseTable = {
  phrases: {
    // speakers
    'Blue Two': 'Azul Dos',
    'Control': 'Control',

    // radio
    "Searchlights have one coned! Get him while he's lit!": '¡Los reflectores han atrapado a uno! ¡A por él mientras está iluminado!',
    "Control: pathfinder flares going down over the field! The bombers will aim on them — get under the flares and you'll see them.": 'Control: ¡bengalas de los guías cayendo sobre el aeródromo! Los bombarderos apuntarán a ellas — métete bajo las bengalas y los verás.',
    "Messerschmitts coming down on us — they're covering the bombers!": '¡Messerschmitt cayendo sobre nosotros — cubren a los bombarderos!',
    "He's dumped his bombs — he's turning for home!": '¡Ha soltado las bombas — vuelve a casa!',
    'Control to Blue flight: raiders crossing the coast in the dark. Look for their exhaust flames and the searchlights.': 'Control a escuadrilla Azul: incursores cruzando la costa a oscuras. Buscad las llamas de los escapes y los reflectores.',
    'Control: more of them coming in, with night fighters. The searchlights will find the bombers for you.': 'Control: llegan más, con cazas nocturnos. Los reflectores os encontrarán los bombarderos.',
    'Control: the main stream is inbound. Every one you get is one less over the field!': 'Control: llega la corriente principal. ¡Cada uno que derribéis es uno menos sobre el aeródromo!',
    'Control to Blue flight: raid inbound, Junkers with fighter cover. Get between them and the airfield!': 'Control a escuadrilla Azul: incursión en camino, Junkers con cobertura de cazas. ¡Poneos entre ellos y el aeródromo!',
    'Control, second wave: bombers and Messerschmitts on the same heading. Hit the bombers first!': 'Control, segunda oleada: bombarderos y Messerschmitt con el mismo rumbo. ¡Primero los bombarderos!',
    "Control: this is the main raid — everything they've got. Don't let them through!": 'Control: esta es la incursión principal — todo lo que tienen. ¡No los dejéis pasar!',
    'Bombs on the airfield! Stop the rest of them!': '¡Bombas en el aeródromo! ¡Detened al resto!',
    'Blue Two, engaging your target!': '¡Azul Dos, atacando tu blanco!',
    'Blue Two, going to the bombers!': '¡Azul Dos, voy a por los bombarderos!',
    'Blue Two, covering your six!': '¡Azul Dos, te cubro la cola!',
    'Blue Two, forming up on your wing.': 'Azul Dos, me coloco en tu ala.',
    "Blue Two, I'm hit! I'm going down!": '¡Azul Dos, me han dado! ¡Caigo!',
    'Blue Two, replacement aircraft joining on your wing.': 'Azul Dos, avión de reemplazo uniéndose a tu ala.',
    'Blue Two — no target in front of you, staying on your wing.': 'Azul Dos — no hay blanco delante, sigo en tu ala.',
    'Blue Two, going after the bombers!': '¡Azul Dos, voy tras los bombarderos!',
    'Bandit on your tail — Blue Two is on him!': '¡Bandido en tu cola — Azul Dos va a por él!',
    'Blue Two — splash one!': '¡Azul Dos — uno abajo!',
    'Blue Two is down — a replacement joins next round': 'Azul Dos ha caído — un reemplazo se une en la próxima ronda',

    // the same wingman lines as Blue Four (escort missions)
    'Blue Four': 'Azul Cuatro',
    "Blue Four, engaging your target!": '¡Azul Cuatro, atacando tu blanco!',
    "Blue Four, going to the bombers!": '¡Azul Cuatro, voy a por los bombarderos!',
    "Blue Four, covering your six!": '¡Azul Cuatro, te cubro la cola!',
    "Blue Four, forming up on your wing.": 'Azul Cuatro, me coloco en tu ala.',
    "Blue Four, replacement aircraft joining on your wing.": 'Azul Cuatro, avión de reemplazo uniéndose a tu ala.',
    "Blue Four — no target in front of you, staying on your wing.": 'Azul Cuatro — no hay blanco delante, sigo en tu ala.',
    "Blue Four, going after the bombers!": '¡Azul Cuatro, voy tras los bombarderos!',
    "Bandit on your tail — Blue Four is on him!": '¡Bandido en tu cola — Azul Cuatro va a por él!',
    "Blue Four — splash one!": '¡Azul Cuatro — uno abajo!',
    "Blue Four is down — a replacement joins next round": 'Azul Cuatro ha caído — un reemplazo se une en la próxima ronda',
    "Blue Four, I'm hit! I'm going down!": '¡Azul Cuatro, me han dado! ¡Caigo!',

    // missions and modes
    'Defend the Field': 'Defiende el aeródromo',
    'Night Fighter': 'Caza nocturno',
    'Advanced Landing Ground, Normandy': 'Aeródromo avanzado, Normandía',
    'Normandy, June 1944': 'Normandía, junio de 1944',
    'Airfields in southern England': 'Aeródromos del sur de Inglaterra',
    'Operation Steinbock, February 1944': 'Operación Steinbock, febrero de 1944',
    'For once the boot is on the other foot. The Luftwaffe is coming for us: Junkers 88s with Messerschmitt cover, straight in at the advanced landing ground where your group is based.':
      'Por una vez se invierten los papeles. La Luftwaffe viene a por nosotros: Junkers 88 con cobertura de Messerschmitt, directos al aeródromo avanzado donde está tu grupo.',
    'They will fly a straight course for the field. Every bomber you bring down short of it is one stick of bombs that does not fall on our aircraft. If more than six of them get through, there will be no field to come home to.':
      'Volarán en línea recta hacia el aeródromo. Cada bombardero que derribes antes es una ristra de bombas que no cae sobre nuestros aviones. Si pasan más de seis, no quedará aeródromo al que volver.',
    'Take Blue Two with you. Keys one to four give him his orders: attack my target, cover me, go for the bombers, form up. Watch the rear gunners on the Junkers — come in from below.':
      'Llévate a Azul Dos. Las teclas uno a cuatro le dan órdenes: ataca mi blanco, cúbreme, a por los bombarderos, en formación. Cuidado con los ametralladores de cola de los Junkers — entra desde abajo.',
    'The raid is broken. The field is still ours — the ground crews are already filling in the craters. Outstanding work, Blue Leader.':
      'La incursión ha fracasado. El aeródromo sigue siendo nuestro — el personal de tierra ya está rellenando los cráteres. Trabajo excelente, Líder Azul.',
    'The Baby Blitz. Every few nights the Junkers come back across the Channel in the dark, and tonight they are after the airfields.':
      'El Baby Blitz. Cada pocas noches, los Junkers vuelven a cruzar el Canal a oscuras, y esta noche van a por los aeródromos.',
    'You will not see them until you are close. Look for the exhaust flames — they show for miles — and watch the searchlights: when the beams cone a bomber, go for him while he is lit. Their pathfinders will mark the field with parachute flares, and anything flying under them is lit up, the bombers included. Your gunsight lamp is turned up for the night.':
      'No los verás hasta estar cerca. Busca las llamas de los escapes — se ven a kilómetros — y vigila los reflectores: cuando los haces atrapen a un bombardero, ve a por él mientras está iluminado. Sus guías marcarán el aeródromo con bengalas en paracaídas, y todo lo que vuele debajo queda iluminado, bombarderos incluidos. La lámpara de tu mira está subida para la noche.',
    'From the second wave they are sending Messerschmitt 110 night fighters ahead of the bombers. If more than four bombers get through to the field, we have lost the night.':
      'Desde la segunda oleada envían cazas nocturnos Messerschmitt 110 por delante de los bombarderos. Si más de cuatro bombarderos llegan al aeródromo, habremos perdido la noche.',
    'Dawn over the field, and every runway still in use. The Junkers will think twice about coming back. Good hunting, Blue Leader.':
      'Amanece sobre el aeródromo y todas las pistas siguen operativas. Los Junkers se lo pensarán dos veces antes de volver. Buena caza, Líder Azul.',
    'Special operation — role reversal. The Luftwaffe raids your airfield: Ju 88s on a straight course for the field, Bf 109s flying cover. Bring the bombers down before they reach it, with Blue Two on your wing. Three rounds; more than six through and the field is lost.':
      'Operación especial — papeles invertidos. La Luftwaffe ataca tu aeródromo: Ju 88 en línea recta hacia él, con Bf 109 de cobertura. Derriba los bombarderos antes de que lleguen, con Azul Dos en tu ala. Tres rondas; si pasan más de seis, el aeródromo está perdido.',
    'Special operation — night defence. Junkers raid the airfields in the dark: find them by their exhaust flames and the searchlight cones, under a lit gunsight. Bf 110 night fighters hunt you from the second wave. Three rounds; more than four through and the night is lost.':
      'Operación especial — defensa nocturna. Los Junkers atacan los aeródromos a oscuras: encuéntralos por las llamas de sus escapes y los conos de los reflectores, con la mira iluminada. Desde la segunda oleada te cazan cazas nocturnos Bf 110. Tres rondas; si pasan más de cuatro, la noche está perdida.',
    'Shoot down the bombers before they reach the airfield': 'Derriba los bombarderos antes de que lleguen al aeródromo',
    'Command your wingman: 1 attack · 2 cover · 3 bombers · 4 form up': 'Da órdenes a tu punto: 1 ataque · 2 cobertura · 3 bombarderos · 4 formación',
    'Junkers inbound with fighter cover': 'Junkers en camino con cobertura de cazas',
    'Second wave — bombers and Messerschmitts': 'Segunda oleada — bombarderos y Messerschmitt',
    'The main raid — everything they have': 'La incursión principal — todo lo que tienen',
    'Raiders in the dark — find them by their exhausts': 'Incursores a oscuras — encuéntralos por sus escapes',
    'More raiders — and night fighters hunting you': 'Más incursores — y cazas nocturnos tras de ti',
    'The main bomber stream': 'La corriente principal de bombarderos',
    'more raiders inbound': 'más incursores en camino',
    'Free look (hold): look around the fuselage': 'Vista libre (mantener): mira por el fuselaje',
    'Flak coming up — heavy guns below us. Hold steady.': 'Sube la flak — cañones pesados debajo. Aguantad firmes.',
    'That one bounced right off the armour plate!': '¡Esa ha rebotado en la placa de blindaje!',
    'Padlock the nearest bandit': 'Fijar la vista en el bandido más cercano',
  },
  patterns,
};
export default table;
