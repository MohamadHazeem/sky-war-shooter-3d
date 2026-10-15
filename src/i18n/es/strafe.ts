// Spanish for ar/strafe.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { 'TRAIN BUSTING': 'CAZA DE TRENES', CONVOY: 'CONVOY', AIRFIELD: 'AERÓDROMO' };

const TARGETS = ['Locomotive', 'Goods wagon', 'Tank wagon', 'Flak wagon', 'Truck', 'Fuel truck', 'Flak half-track', 'Aircraft on the ground',
  'Fw 190 on the ground', 'Bf 109 on the ground', 'Ju 88 on the ground', 'Bf 110 on the ground', '20 mm flak', 'Flak tower'].join('|');

const patterns: Pattern[] = [
  [/^ROUND (\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD)$/, (m) => `RONDA ${m[1]} · ${KIND[m[2]]}`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — locomotive ([\d.]+) km from the tunnel$/, (m) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — locomotora a ${m[4]} km del túnel`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — train stopped · (-?\d+)\/(\d+) wagons destroyed$/, (m) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — tren detenido · ${m[4]}/${m[5]} vagones destruidos`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) vehicles destroyed$/, (m) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} vehículos destruidos`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) aircraft destroyed on the ground$/, (m) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${m[4]}/${m[5]} aviones destruidos en tierra`],
  [/^Objective complete — \+(\d+)$/, 'Objetivo cumplido — +$1'],
  [new RegExp(`^(${TARGETS}) destroyed — \\+(\\d+)$`), (m, tr) => `${tr(m[1])}: destruido — +${m[2]}`],
  [new RegExp(`^Blue Two got the (${TARGETS})$`), (m, tr) => `Azul dos ha alcanzado: ${tr(m[1])}`],
  [new RegExp(`^(${TARGETS}) reached the village$`), (m, tr) => `${tr(m[1])}: ha llegado al pueblo`],
];

const table: PhraseTable = {
  phrases: {
    // radio
    'Control to Blue flight: a supply train is heading east for the tunnel. Stop that locomotive before it gets there!':
      'Control a escuadrilla Azul: un tren de suministros va hacia el este, hacia el túnel. ¡Detened esa locomotora antes de que llegue!',
    'Control: a truck convoy is on the road to the village. Shoot it up before it gets under cover!':
      'Control: un convoy de camiones va por la carretera al pueblo. ¡Ametralladlo antes de que se ponga a cubierto!',
    'Control: the Luftwaffe field to the north-east. Strafe the aircraft on the ground — and watch the flak!':
      'Control: el aeródromo de la Luftwaffe al noreste. Ametrallad los aviones en tierra — ¡y cuidado con la antiaérea!',
    "Got the loco! She's blown her boiler!": '¡Locomotora alcanzada! ¡Le ha reventado la caldera!',
    'The train made it into the tunnel. Too late, Blue flight.': 'El tren ha entrado en el túnel. Demasiado tarde, escuadrilla Azul.',
    'Light flak coming up! Stay low and keep jinking!': '¡Antiaérea ligera! ¡Manteneos bajos y seguid zigzagueando!',
    'Focke-Wulfs coming down on us! Watch your tail, Leader!': '¡Focke-Wulf cayendo sobre nosotros! ¡Cuidado con tu cola, Líder!',
    'Blue Two, going down on your target!': '¡Azul dos, bajando sobre tu objetivo!',
    'Blue Two — got one on the ground!': '¡Azul dos — he cazado uno en tierra!',
    'Blue Leader, you are leaving the target area. Come back round.': 'Líder Azul, estás saliendo de la zona del objetivo. Da la vuelta.',

    // banners and feed
    'Stop the supply train before it reaches the tunnel': 'Detén el tren de suministros antes de que llegue al túnel',
    'Shoot up the truck convoy before it reaches the village': 'Ametralla el convoy de camiones antes de que llegue al pueblo',
    'Strafe the Luftwaffe airfield': 'Ametralla el aeródromo de la Luftwaffe',
    'The train reached the tunnel': 'El tren ha llegado al túnel',
    'Your Mustang was brought down by flak.': 'La antiaérea ha derribado tu Mustang.',

    // ground targets
    'Locomotive': 'Locomotora',
    'Goods wagon': 'Vagón de mercancías',
    'Tank wagon': 'Vagón cisterna',
    'Flak wagon': 'Vagón antiaéreo',
    'Truck': 'Camión',
    'Fuel truck': 'Camión cisterna',
    'Flak half-track': 'Semioruga antiaéreo',
    'Aircraft on the ground': 'Avión en tierra',
    'Fw 190 on the ground': 'Fw 190 en tierra',
    'Bf 109 on the ground': 'Bf 109 en tierra',
    'Ju 88 on the ground': 'Ju 88 en tierra',
    'Bf 110 on the ground': 'Bf 110 en tierra',
    '20 mm flak': 'Antiaérea de 20 mm',
    'Flak tower': 'Torre antiaérea',

    // overlay
    'TRAIN': 'TREN',
    'CONVOY': 'CONVOY',
    'AIRFIELD': 'AERÓDROMO',
    'FLAK': 'FLAK',
    'LOCOMOTIVE': 'LOCOMOTORA',
    'PULL UP': 'SUBE EL MORRO',
    'FT AGL': 'FT S/T',

    // mission and mode
    'Train Busting': 'Caza de trenes',
    'Rail and road traffic, Normandy': 'Tráfico ferroviario y por carretera, Normandía',
    'Normandy, July 1944': 'Normandía, julio de 1944',
    'Today we go down on the deck. The Germans are moving supplies to the front by rail and road in daylight, and it is our job to stop them. Fly low and fast, and pick your targets.':
      'Hoy bajamos a ras de suelo. Los alemanes llevan suministros al frente por tren y carretera a plena luz del día, y nuestro trabajo es detenerlos. Vuela bajo y rápido, y elige tus objetivos.',
    'First a supply train heading east for a tunnel: stop the locomotive before it gets there, then work over the wagons. Then a truck convoy on the road into the village. Last, the Luftwaffe airfield to the north-east, with aircraft parked in the open.':
      'Primero un tren de suministros que va al este hacia un túnel: detén la locomotora antes de que llegue y luego ocúpate de los vagones. Después un convoy de camiones en la carretera al pueblo. Por último, el aeródromo de la Luftwaffe al noreste, con aviones aparcados al descubierto.',
    'Everything down there shoots back. The 20 mm flak hoses tracer at anything low — keep moving and do not make two passes from the same direction. Watch your height in the dive: the ground does not forgive. Blue Two goes down on your target when you press one.':
      'Todo lo que hay abajo devuelve el fuego. La antiaérea de 20 mm riega de trazadoras todo lo que vuela bajo — muévete sin parar y no hagas dos pasadas desde la misma dirección. Vigila la altura en el picado: el suelo no perdona. Azul dos baja sobre tu objetivo cuando pulsas uno.',
    'Stop the train before it reaches the tunnel': 'Detén el tren antes de que llegue al túnel',
    'Shoot up the truck convoy': 'Ametralla el convoy de camiones',
    'Strafe the aircraft on the airfield': 'Ametralla los aviones del aeródromo',
    'Command your wingman: 1 attack my target · 2 cover me': 'Órdenes a tu punto: 1 ataca mi objetivo · 2 cúbreme',
    'The rail line is blocked, the convoy is burning and the airfield will not be flying tomorrow. That was flying, Blue Leader.':
      'La vía férrea está cortada, el convoy arde y mañana no despegará nada de ese aeródromo. Eso es volar, Líder Azul.',
    'Special operation — ground attack. Down on the deck over Normandy: stop a supply train before it reaches the tunnel, shoot up a truck convoy and strafe a Luftwaffe airfield, through 20 mm flak and a few Fw 190s. Mind the ground — it does not forgive.':
      'Operación especial — ataque a tierra. A ras de suelo sobre Normandía: detén un tren de suministros antes del túnel, ametralla un convoy de camiones y un aeródromo de la Luftwaffe, entre antiaérea de 20 mm y algunos Fw 190. Cuidado con el suelo — no perdona.',
  },
  patterns,
};
export default table;
