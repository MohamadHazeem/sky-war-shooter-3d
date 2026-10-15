import type { PhraseTable, Pattern } from '../types';

// Spanish for ar/battle.ts (same keys and patterns).

// Weekly.ts OPERATIONS: code names stay as they are
const OPS = [
  'Thunderclap', 'Argument', 'Pointblank', 'Clarion', 'Frantic', 'Gomorrah', 'Tidal Wave', 'Hydra', 'Crossbow', 'Chattanooga',
  'Jericho', 'Varsity', 'Cobra', 'Grubworm', 'Aphrodite', 'Juggler', 'Starkey', 'Carpetbagger', 'Cadillac', 'Lucky Strike',
  'Iron Cross', 'Long Reach', 'Hailstorm', 'Black Ribbon', 'Steel Rain', 'Nightjar', 'Overcast', 'High Card',
];
const OP = `(${OPS.join('|')})`;
const ENEMY = '(?:Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)';
const SEAT = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';
const TOD = '(?:dawn|morning sun|noon|dusk)';
const MOOD: Record<string, string> = {
  Clear: 'Despejado', Overcast: 'Cubierto', Storm: 'Tormenta', 'Red dusk': 'Crepúsculo rojo', 'Light rain': 'Lluvia ligera',
  'Heavy rain': 'Lluvia intensa', Snow: 'Nieve', 'Fog / low cloud': 'Niebla / nubes bajas', Thunderstorm: 'Tormenta eléctrica',
  overcast: 'cubierto', storm: 'tormenta',
};
const mood = (s: string, tr: (s: string) => string) => MOOD[s] ?? tr(s);

const rounds = (n: string | number) => `${n} ${+n === 1 ? 'ronda' : 'rondas'}`;

const HEAD = new RegExp(`^Operation ${OP} — (\\d+) rounds, (.+?), ((?:(?:overcast|storm), )?${TOD})(?:, boss in round (\\d+))?$`);
function headline(m: RegExpMatchArray, tr: (s: string) => string): string {
  const w = m[4].split(', ').map((s) => mood(s, tr)).join(', ');
  return `Operación ${m[1]} — ${rounds(m[2])}, ${tr(m[3])}, ${w}${m[5] ? `, grupo de combate en la ronda ${m[5]}` : ''}`;
}

const patterns: Pattern[] = [
  [new RegExp(`^B-17 ${SEAT}$`), (m, tr) => `B-17, ${tr(m[1])}`],
  [new RegExp(`^(${ENEMY})s only$`), 'solo $1'],
  [new RegExp(`^(${ENEMY}(?:, ${ENEMY})+)$`), (m) => m[1]],
  [/^(\d+)–(\d+) at once$/, '$1–$2 a la vez'],
  [/^endless (\d+:\d\d) rounds$/, 'rondas sin fin de $1'],
  [/^(\d+) × (\d+:\d\d)$/, (m) => `${rounds(m[1])} × ${m[2]}`],
  [new RegExp(`^(Clear|Overcast|Storm|Red dusk|Light rain|Heavy rain|Snow|Fog / low cloud|Thunderstorm), (${TOD})$`), (m, tr) => `${mood(m[1], tr)}, ${tr(m[2])}`],
  [/^battle group every (\d+) rounds$/, 'grupo de combate cada $1 rondas'],
  [/^battle group in round (\d+)$/, 'grupo de combate en la ronda $1'],
  [/^(\d+) rounds?$/, (m) => rounds(m[1])],
  [/^(Endless rounds|\d+ rounds?) · (.+)$/, (m, tr) => `${m[1] === 'Endless rounds' ? 'Rondas sin fin' : tr(m[1])} · ${tr(m[2])}`],
  [/^A battle of your own making: (.+)\.$/, (m, tr) => `Una batalla a tu medida: ${m[1].split(' · ').map(tr).join(' · ')}.`],
  [/^Survive (\d+) rounds?$/, (m) => `Sobrevive ${rounds(m[1])}`],

  [new RegExp(`^Operation ${OP}$`), 'Operación $1'],
  [new RegExp(HEAD.source), headline],
  [new RegExp(`^Week (\\d+): (${HEAD.source.slice(1, -1)})$`), (m, tr) => `Semana ${m[1]}: ${tr(m[2])}`],
  [/^Weekly Challenge · Week (\d+), (\d{4})$/, 'Desafío semanal · Semana $1, $2'],
  [/^This week's challenge, the same for every crew: (.+)\.$/, (m, tr) => `El desafío de esta semana, igual para todas las tripulaciones: ${tr(m[1])}.`],
  [/^The enemy schedule is fixed for the week\. Fly all (\d+) rounds to complete it: the first completion each week pays (\d+) merit and a weekly ribbon, and earns the (.+) nose art, found nowhere else\.$/,
    (m, tr) => `El plan enemigo es fijo toda la semana. Vuela las ${m[1]} rondas para completarlo: la primera vez cada semana da ${m[2]} de mérito y una cinta semanal, además del arte de morro «${tr(m[3])}», que no se consigue en ningún otro sitio.`],
  [/^Survive all (\d+) rounds$/, 'Sobrevive las $1 rondas'],
  [/^Destroy the battle group in round (\d+)$/, 'Destruye el grupo de combate en la ronda $1'],
  [new RegExp(`^Operation ${OP} complete\\. The weekly ribbon is yours\\.$`), 'Operación $1 completada. La cinta semanal es tuya.'],
  [/^(\d+)d (\d+)h (\d+)m$/, '$1 d $2 h $3 min'],
  [/^(\d+)h (\d+)m$/, '$1 h $2 min'],
  [/^Weekly Challenge — week (\d+)$/, 'Desafío semanal — semana $1'],
  [/^\+(\d+) merit · weekly ribbon(?: · (.+) nose art unlocked \(hangar\))?$/,
    (m, tr) => `+${m[1]} de mérito · cinta semanal${m[2] ? ` · arte de morro «${tr(m[2])}» desbloqueado (hangar)` : ''}`],
  [/^WEEK (\d+) · (B-17 GUNNER|P-51 ESCORT) · TOP 10$/, (m) => `SEMANA ${m[1]} · ${m[2] === 'B-17 GUNNER' ? 'ARTILLERO B-17' : 'ESCOLTA P-51'} · TOP 10`],
];

const table: PhraseTable = {
  phrases: {
    'Custom Battle': 'Batalla personalizada',
    'Weekly': 'Semanal',
    'Set up your own battle: seat, enemy types, numbers, skill, rounds, weather and time of day, battle group, special events, flak and escorts. Custom battles are not posted to the online leaderboards.':
      'Prepara tu propia batalla: puesto, tipos enemigos, número, habilidad, rondas, clima y hora del día, grupo de combate, eventos especiales, antiaérea y escolta. Las batallas personalizadas no se publican en las clasificaciones en línea.',
    'A new scenario every Monday, the same for every crew, with its own leaderboard and a weekly-only reward.':
      'Un escenario nuevo cada lunes, igual para todas las tripulaciones, con su propia clasificación y una recompensa exclusiva de la semana.',

    'Recruit': 'Recluta',
    'Veteran': 'Veterano',
    'Ace': 'As',
    'Insane': 'Demencial',
    'Storm': 'Tormenta',
    'Red dusk': 'Crepúsculo rojo',
    'dawn': 'alba',
    'morning sun': 'sol de la mañana',
    'noon': 'mediodía',
    'dusk': 'anochecer',
    'every type': 'todos los tipos',
    'special events': 'eventos especiales',
    'flak': 'antiaérea',
    'escorts': 'escolta',
    'storm front later': 'frente de tormenta después',
    'clearing later': 'despejará después',
    'Custom Battle — Gunner': 'Batalla personalizada — Artillero',
    'Custom Battle — Escort': 'Batalla personalizada — Escolta',
    'Custom battle': 'Batalla personalizada',
    'Custom battles are not posted to the online leaderboards.': 'Las batallas personalizadas no se publican en las clasificaciones en línea.',
    'Battle won. Every round flown, and the formation still holds.': 'Batalla ganada. Todas las rondas voladas y la formación sigue firme.',

    'SURVIVAL · YOUR RULES': 'SUPERVIVENCIA · TUS REGLAS',
    'Role': 'Rol',
    'Gunner seat': 'Puesto de tiro',
    'Enemy types': 'Tipos enemigos',
    'Fighters at once': 'Cazas a la vez',
    'min': 'mín',
    'max': 'máx',
    'Enemy skill': 'Habilidad enemiga',
    'Round length': 'Duración de ronda',
    'Rounds': 'Rondas',
    'Endless': 'Sin fin',
    'until you are shot down': 'hasta que te derriben',
    'Weather': 'Clima',
    'Time of day': 'Hora del día',
    'Sun elevation: dawn to noon': 'Altura del sol: del alba al mediodía',
    'dawn / dusk': 'alba / anochecer',
    'morning': 'mañana',
    'Battle group': 'Grupo de combate',
    'Boss round': 'Ronda del jefe',
    'giant flying warships': 'buques de guerra voladores gigantes',
    'Extras': 'Extras',
    'Special events': 'Eventos especiales',
    'aces, Zerstörer, rockets': 'ases, Zerstörer, cohetes',
    'mid-round barrage': 'andanada a mitad de ronda',
    'Escorts': 'Escolta',
    'Mustangs on your side': 'Mustangs de tu lado',
    'Weather front': 'Frente meteorológico',
    'the sky turns mid-battle': 'el cielo cambia en plena batalla',
    'Custom battles are not posted to the online leaderboards. Your last set-up is kept.': 'Las batallas personalizadas no se publican en las clasificaciones en línea. Se guarda tu última configuración.',
    'Defaults': 'Predeterminado',
    'Start': 'Empezar',
    '{n} of {total}': '{n} de {total}',
    '{min}–{max}': '{min}–{max}',
    'off': 'desactivado',
    'round {n}, then every {n}': 'ronda {n}, luego cada {n}',
    'round {n}': 'ronda {n}',
    'Last set-up': 'Última configuración',
    'Set up battle': 'Configurar batalla',
    'Fly last set-up': 'Volar última configuración',

    'The Jet Staffel': 'La Staffel de reactores',
    'Wonder weapons': 'Armas milagrosas',
    'The Zerstörergeschwader': 'El Zerstörergeschwader',
    'The Sturmgruppe': 'La Sturmgruppe',
    'A Gustav swarm': 'Un enjambre de Gustav',
    'The day fighters': 'Los cazas diurnos',
    'Everything the Luftwaffe has': 'Todo lo que tiene la Luftwaffe',
    'A mixed Jagdverband': 'Un Jagdverband mixto',
    "Post a score on this week's board": 'Registra una puntuación en la tabla de esta semana',
    'Lightning Shield': 'Escudo relámpago',
    'Weekly Challenge reward': 'Recompensa del desafío semanal',
    'NEXT SCENARIO IN': 'PRÓXIMO ESCENARIO EN',
    'WEEKLY CHALLENGE · WEEK {w}, {y}': 'DESAFÍO SEMANAL · SEMANA {w}, {y}',
    '{r} rounds of {len} · {min}–{max} fighters at once · {skill} skill': '{r} rondas de {len} · {min}–{max} cazas a la vez · habilidad {skill}',
    ' · battle group in round {n}': ' · grupo de combate en la ronda {n}',
    'no special events': 'sin eventos especiales',
    'no flak': 'sin antiaérea',
    'no escorts': 'sin escolta',
    'Gunners fly the {seat} · the enemy schedule is the same for every crew all week': 'Los artilleros van en {seat} · el plan enemigo es igual para todos toda la semana',
    '✔ Completed this week · 1 weekly ribbon': '✔ Completado esta semana · 1 cinta semanal',
    '✔ Completed this week · {n} weekly ribbons': '✔ Completado esta semana · {n} cintas semanales',
    'Reward for completing it: +{n} merit, a weekly ribbon': 'Recompensa al completarlo: +{n} de mérito, una cinta semanal',
    ' and the <b>{name}</b> nose art (weekly-only)': ' y el arte de morro <b>{name}</b> (exclusivo semanal)',
    'WEEKLY CHALLENGE': 'DESAFÍO SEMANAL',
    'ends in': 'termina en',
    ...Object.fromEntries(OPS.map((k) => [`Operation ${k}`, `Operación ${k}`])),
  },
  patterns,
};
export default table;
