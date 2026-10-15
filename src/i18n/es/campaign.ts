// Spanish for ar/campaign.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const CITY: Record<string, string> = {
  Hamm: 'Hamm', Münster: 'Münster', Osnabrück: 'Osnabrück', Hannover: 'Hannover', Rheine: 'Rheine', Twente: 'Twente',
  Oldenburg: 'Oldemburgo', Gelsenkirchen: 'Gelsenkirchen', Leuna: 'Leuna', Misburg: 'Misburg', Wilhelmshaven: 'Wilhelmshaven',
  Kiel: 'Kiel', Emden: 'Emden', Brunswick: 'Brunswick', Kassel: 'Kassel', Gotha: 'Gotha',
};
const TARGET: Record<string, string> = {
  'Marshalling yards': 'Estación de clasificación', 'Rail junction': 'Nudo ferroviario', 'Rail yards': 'Playa de vías',
  'Fighter airfield': 'Aeródromo de cazas', 'Fighter base': 'Base de cazas',
  'Synthetic oil plant': 'Planta de petróleo sintético', 'Synthetic fuel works': 'Fábrica de combustible sintético', 'Refinery': 'Refinería',
  'U-boat base': 'Base de U-Boote', 'U-boat yards': 'Astilleros de U-Boote',
  'Aircraft assembly plant': 'Planta de montaje de aviones', 'Fieseler works': 'Fábrica Fieseler', 'Gothaer Waggonfabrik': 'Gothaer Waggonfabrik',
};
// the same targets with their article, for use inside a sentence
const TARGET_MID: Record<string, string> = {
  'marshalling yards': 'la estación de clasificación', 'rail junction': 'el nudo ferroviario', 'rail yards': 'la playa de vías',
  'fighter airfield': 'el aeródromo de cazas', 'fighter base': 'la base de cazas',
  'synthetic oil plant': 'la planta de petróleo sintético', 'synthetic fuel works': 'la fábrica de combustible sintético', 'refinery': 'la refinería',
  'u-boat base': 'la base de U-Boote', 'u-boat yards': 'el astillero de U-Boote',
  'aircraft assembly plant': 'la planta de montaje de aviones', 'fieseler works': 'la fábrica Fieseler', 'gothaer waggonfabrik': 'la Gothaer Waggonfabrik',
};
const LABEL: Record<string, string> = {
  'Rail yards': 'Playas de vías', 'Airfields': 'Aeródromos', 'Oil': 'Petróleo', 'U-boat pens': 'Búnkeres de U-Boote', 'Aircraft factory': 'Fábrica de aviones',
};

const alt = (o: Record<string, string>) => Object.keys(o).map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
const C = `(${alt(CITY)})`;
const N = `(${alt(TARGET)})`;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const tN = (s: string, tr: (s: string) => string) => TARGET_MID[s.toLowerCase()] ?? tr(s);
const pl = (n: string | number, one: string, many: string) => `${n} ${+n === 1 ? one : many}`;

const patterns: Pattern[] = [
  // ---------------- SideRaids.ts: generated raid missions ----------------
  [new RegExp(`^Strike on ${C}$`), (m, tr) => `Ataque sobre ${tr(m[1])}`],
  [new RegExp(`^(${alt(LABEL)}) — ${C}$`), (m, tr) => `${LABEL[m[1]]} — ${tr(m[2])}`],
  [new RegExp(`^Escort — ${N}, ${C}$`, 'i'), (m, tr) => `Escolta — ${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^${N}, ${C}$`, 'i'), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
  [new RegExp(`^A short one today\\. The ${N} at ${C} move every train between the Ruhr and the north German ports: fighters, fuel and flak shells all pass through them\\.$`, 'i'),
    (m, tr) => `Hoy una corta. Por ${tN(m[1], tr)} de ${tr(m[2])} pasa cada tren entre el Ruhr y los puertos del norte de Alemania: cazas, combustible y proyectiles antiaéreos.`],
  [new RegExp(`^The yards at ${C} are a tangle of twisted rail\\. Nothing will move through them for a week\\.$`),
    (m, tr) => `Las vías de ${tr(m[1])} son un amasijo de raíles retorcidos. Nada pasará por allí en una semana.`],
  [new RegExp(`^The Jagdgruppe at ${C} has been hitting our formations over the coast for a month\\. Today we hit it at home: runways, hangars and dispersal pens\\.$`),
    (m, tr) => `La Jagdgruppe de ${tr(m[1])} lleva un mes golpeando nuestras formaciones sobre la costa. Hoy la golpeamos en casa: pistas, hangares y refugios de dispersión.`],
  [new RegExp(`^${C} is cratered from end to end\\. The Jagdgruppe there will be flying from somewhere else for a while\\.$`),
    (m, tr) => `${tr(m[1])} está lleno de cráteres de punta a punta. La Jagdgruppe tendrá que despegar desde otro sitio durante un tiempo.`],
  [new RegExp(`^The target is the ${N} at ${C}\\. Germany has almost no natural oil: every drop of fuel for her fighters is cooked out of coal in plants like this one\\.$`, 'i'),
    (m, tr) => `El objetivo: ${tN(m[1], tr)} de ${tr(m[2])}. Alemania casi no tiene petróleo natural: cada gota de combustible de sus cazas se saca del carbón en plantas como esta.`],
  [new RegExp(`^Black smoke over ${C} is climbing past twenty thousand feet\\. The Luftwaffe will be counting its fuel by the litre\\.$`),
    (m, tr) => `El humo negro sobre ${tr(m[1])} sube por encima de los veinte mil pies. La Luftwaffe tendrá que contar su combustible litro a litro.`],
  [new RegExp(`^The Navy has asked for this one\\. The ${N} at ${C} turns out the boats that hunt our convoys in the Atlantic, and those convoys carry our new aircraft and crews\\.$`, 'i'),
    (m, tr) => `Esta la ha pedido la Marina. De ${tN(m[1], tr)} de ${tr(m[2])} salen los submarinos que cazan nuestros convoyes en el Atlántico, y esos convoyes traen nuestros nuevos aviones y tripulaciones.`.replace('De el ', 'Del ')],
  [new RegExp(`^The slipways at ${C} took a pounding\\. The next convoy will have a quieter crossing, and the group will see the benefit\\.$`),
    (m, tr) => `Las gradas de ${tr(m[1])} han recibido una paliza. El próximo convoy cruzará más tranquilo, y el grupo lo notará.`],
  [new RegExp(`^The ${N} at ${C} builds fighters, and every one it finishes will be shooting at us within a month\\. This is a deep one, and it will be defended like Berlin\\.$`, 'i'),
    (m, tr) => `${cap(tN(m[1], tr))} de ${tr(m[2])} fabrica cazas, y cada uno que termina nos estará disparando en un mes. Es una misión profunda, y la defenderán como a Berlín.`],
  [new RegExp(`^The assembly halls at ${C} are burning\\. That is a month of fighters the Luftwaffe will never get\\.$`),
    (m, tr) => `Las naves de montaje de ${tr(m[1])} están ardiendo. Es un mes de cazas que la Luftwaffe nunca tendrá.`],
  [new RegExp(`^Bandits climbing out of ${C}! Blue flight, go get them\\.$`), (m, tr) => `¡Bandidos subiendo desde ${tr(m[1])}! Escuadrilla azul, a por ellos.`],
  [new RegExp(`^Fighters coming up from ${C}\\. Here they come!$`), (m, tr) => `Cazas subiendo desde ${tr(m[1])}. ¡Ahí vienen!`],

  // ---------------- CampaignState.ts: intelligence report (saved in English) ----------------
  [/^Mission (complete|failed) · (.+)$/, (m, tr) => `${m[1] === 'complete' ? 'Misión cumplida' : 'Misión fallida'} · ${tr(m[2])}`],
  [/^Luftwaffe strength (up|down|holds) (?:at (\d+)%|(\d+)% → (\d+)%)\. (.+)$/, (m, tr) => {
    const head = m[1] === 'holds' ? `La fuerza de la Luftwaffe se mantiene en ${m[2]}%.` : `La fuerza de la Luftwaffe ${m[1] === 'up' ? 'sube' : 'baja'}: ${m[3]}% → ${m[4]}%.`;
    return `${head} ${tr(m[5])}`;
  }],
  [/^Losses over (.+) are thinning the Jagdgruppen\.$/, (m, tr) => `Las pérdidas sobre ${tr(m[1])} están diezmando a las Jagdgruppen.`],
  [/^Squadron (\d+) → (\d+) ships\. (?:(\d+) Fortress(?:es)? lost|No Fortresses lost); (\d+) replacement crews arrived(?:, (\d+) of them early thanks to the convoys)?\.(?: The next formation will be (\d+)% of full size\.)?$/, (m) => {
    let s = `Escuadrón: ${m[1]} → ${pl(m[2], 'avión', 'aviones')}. `;
    s += m[3] ? `${pl(m[3], 'Fortaleza perdida', 'Fortalezas perdidas')}; ` : 'Ninguna Fortaleza perdida; ';
    s += `${+m[4] === 1 ? 'llegó 1 tripulación de reemplazo' : `llegaron ${m[4]} tripulaciones de reemplazo`}${m[5] ? `, ${m[5]} de ellas antes gracias a los convoyes` : ''}.`;
    if (m[6]) s += ` La próxima formación estará al ${m[6]}% de su tamaño completo.`;
    return s;
  }],
  [/^Crew morale (?:steady at (\d+)%|(\d+)% → (\d+)%)\. (.+?)(?: Merit x([\d.]+)\.)?$/, (m, tr) => {
    const head = m[1] ? `Moral de las tripulaciones estable en ${m[1]}%.` : `Moral de las tripulaciones: ${m[2]}% → ${m[3]}%.`;
    return `${head} ${tr(m[4])}${m[5] ? ` Mérito x${m[5]}.` : ''}`;
  }],
  [/^Escort availability (\d+)% → (\d+)%\.(?: (.+))?$/, (m, tr) => `Disponibilidad de escolta: ${m[1]}% → ${m[2]}%.${m[3] ? ` ${tr(m[3])}` : ''}`],
  [/^Mustangs join the gunner missions at (\d+)%\.$/, 'Los Mustang se unen a las misiones de ametrallador al $1%.'],
  [/^Next operation: Mission (\d+), (.+) \((.+)\)\. Enemy fighters x([\d.]+)\.$/, (m, tr) => `Próxima operación: misión ${m[1]}, «${tr(m[2])}» (${tr(m[3])}). Cazas enemigos x${m[4]}.`],
  // tour summary log: "6 kills · 2 lost"
  [/^(\d+) kills$/, (m) => pl(m[1], 'derribo', 'derribos')],
  [/^(\d+) lost$/, (m) => pl(m[1], 'Fortaleza perdida', 'Fortalezas perdidas')],
  [/^Raid bonus: \+(\d+) merit\.$/, 'Bonificación de incursión: +$1 de mérito.'],
  [/^Your (\d+) completed missions? (?:have|has) been entered in the group's records\. The strategic picture below reflects them\.$/,
    (m) => (+m[1] === 1
      ? 'Tu misión completada se ha anotado en los registros del grupo. La situación estratégica de abajo la refleja.'
      : `Tus ${m[1]} misiones completadas se han anotado en los registros del grupo. La situación estratégica de abajo las refleja.`)],
];

const table: PhraseTable = {
  phrases: {
    ...CITY,
    ...TARGET,
    ...LABEL,
    'the Netherlands': 'los Países Bajos',
    'the Channel': 'el canal de la Mancha',

    // ---------------- SideRaids.ts: raid template texts ----------------
    'Snarls German supply: Luftwaffe −3, morale +3': 'Entorpece el suministro alemán: Luftwaffe −3, moral +3',
    'Catches fighters on the ground: Luftwaffe −8, escort +12': 'Sorprende a los cazas en tierra: Luftwaffe −8, escolta +12',
    'Starves the fighters of fuel: Luftwaffe −6, morale +2': 'Deja a los cazas sin combustible: Luftwaffe −6, moral +2',
    'Convoys get through: +3 replacement ships, morale +4': 'Los convoyes pasan: +3 aviones de reemplazo, moral +4',
    'Cuts fighter production: Luftwaffe −7, escort +6': 'Recorta la producción de cazas: Luftwaffe −7, escolta +6',
    'The defences are light, and Group calls it a chance to blood the new crews. Do not believe the words "milk run". The day fighters based nearby will come up to meet us.':
      'Las defensas son ligeras, y el Grupo lo ve como una ocasión para foguear a las tripulaciones nuevas. No os creáis lo de "paseo". Los cazas diurnos de la zona subirán a recibirnos.',
    'Every fighter we catch on the ground is one that will not be waiting for us over Germany, and with the coastal fields out of action the Mustangs can push further inland. Expect the whole Gruppe to scramble the moment we cross the coast.':
      'Cada caza que pillemos en tierra es uno menos esperándonos sobre Alemania, y sin los aeródromos costeros los Mustang podrán adentrarse más. Contad con que toda la Gruppe despegue en cuanto crucemos la costa.',
    'No fuel means no training flights, and no training means green pilots. The Germans know it, so the plant is ringed with heavy flak, and twin-engine destroyers will be up with rockets. Keep them off the formation through the bomb run.':
      'Sin combustible no hay vuelos de instrucción, y sin instrucción hay pilotos novatos. Los alemanes lo saben, así que la planta está rodeada de antiaérea pesada, y subirán cazas pesados bimotores con cohetes. Mantenedlos lejos de la formación durante toda la pasada de bombardeo.',
    'Every convoy that gets through brings replacements to the group sooner. The route runs low over the North Sea; expect fighters from the coastal fields and Ju 88s from the Frisian Islands.':
      'Cada convoy que pasa trae antes los reemplazos al grupo. La ruta va baja sobre el mar del Norte; esperad cazas de los aeródromos costeros y Ju 88 de las islas Frisias.',
    'The Sturmgruppen and the rocket-carrying destroyers will be up in force. Hold the formation tight and keep firing; the bombardiers need a steady run of four minutes over the aiming point.':
      'Las Sturmgruppen y los cazas pesados con cohetes saldrán en masa. Mantened la formación cerrada y seguid disparando; los bombarderos necesitan cuatro minutos de pasada estable sobre el punto de mira.',
    'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.':
      'Vuelas en escolta cercana con un P-51D. Quédate con los bombarderos hasta que dejen el objetivo; después puedes bajar a cazar.',
    'This is an optional operation. Group will not hold it against any crew that stands down, but what we hit today changes what is waiting for us on the next big one.':
      'Es una operación opcional. El Grupo no se lo tendrá en cuenta a ninguna tripulación que se quede en tierra, pero lo que golpeemos hoy cambia lo que nos espera en la próxima gran operación.',
    'Bomb the rail yards': 'Bombardea la playa de vías',
    'Wreck the airfield': 'Destroza el aeródromo',
    'Bomb the oil plant through the flak': 'Bombardea la planta de petróleo entre la antiaérea',
    'Hit the U-boat slipways': 'Golpea las gradas de los U-Boote',
    'Destroy the aircraft factory': 'Destruye la fábrica de aviones',
    'Protect the bombers over the airfield': 'Protege a los bombarderos sobre el aeródromo',

    // ---------------- CampaignState.ts: report reasons and notes ----------------
    'With the rail yards cut, fuel and spares are not reaching the fighter fields.': 'Con la playa de vías cortada, el combustible y los repuestos no llegan a los aeródromos de cazas.',
    'Fighters were caught on the ground and the field is out of action.': 'Los cazas fueron sorprendidos en tierra y el aeródromo está fuera de servicio.',
    'Fuel is short: training flights are grounded and fewer fighters can be put up.': 'Falta combustible: los vuelos de instrucción están suspendidos y pueden despegar menos cazas.',
    'A month of fighter production has gone up in smoke.': 'Un mes de producción de cazas se ha esfumado.',
    'The Jagdgruppen are claiming a victory, and their confidence and strength recover.': 'Las Jagdgruppen se atribuyen una victoria y recuperan confianza y fuerza.',
    'This target did not touch the fighter arm.': 'Este objetivo no afectó a la caza alemana.',
    'The crews are cheered by the result.': 'El resultado anima a las tripulaciones.',
    'The crews are holding up.': 'Las tripulaciones aguantan.',
    'Empty bunks in the huts weigh on the crews.': 'Las literas vacías en los barracones pesan sobre las tripulaciones.',
    'A bad day; the crews are subdued.': 'Un mal día; las tripulaciones están abatidas.',
    'Steady.': 'Estable.',
    'Fighter Command confirms: P-51 Mustangs will now join the bombers on gunner missions.': 'El Fighter Command lo confirma: los P-51 Mustang acompañarán ya a los bombarderos en las misiones de ametrallador.',
    'The Mustangs will reach us sooner.': 'Los Mustang nos alcanzarán antes.',
    'The tour is complete. The campaign summary is ready.': 'El turno de servicio ha terminado. El resumen de la campaña está listo.',
    'A replay of a finished operation. The strategic picture is unchanged.': 'Repetición de una operación terminada. La situación estratégica no cambia.',
    'Campaign records transferred': 'Registros de campaña transferidos',

    // ---------------- CampaignMap.ts: chart ----------------
    '{n}°N': '{n}° N',
    '{n}°W': '{n}° O',
    '{n}°E': '{n}° E',
    'N (compass)': 'N',
    'LUFTWAFFE DAY FIGHTERS · {n}%': 'CAZAS DIURNOS DE LA LUFTWAFFE · {n}%',
    'ESCORT RADIUS · {n}%': 'RADIO DE ESCOLTA · {n}%',
    'Mission {n}: {title}': 'Misión {n}: {title}',
    '{place} · NEXT': '{place} · SIGUIENTE',
    'DEENETHORPE · 401ST BG': 'DEENETHORPE · 401.º BG',
    'Next story operation': 'Próxima operación de la historia',
    'Flown · ○ to come': 'Volada · ○ pendiente',
    'Side raid on offer': 'Incursión secundaria disponible',
    'Escort radius / raid route': 'Radio de escolta / ruta de la incursión',
    'Campaign map: England, the North Sea and Germany': 'Mapa de campaña: Inglaterra, el mar del Norte y Alemania',
    'NORTH SEA & NORTHWEST EUROPE · 1943–44': 'MAR DEL NORTE Y NOROESTE DE EUROPA · 1943–44',

    // ---------------- CampaignMap.ts: gauges and intelligence ----------------
    'Strategic situation': 'Situación estratégica',
    'Luftwaffe strength': 'Fuerza de la Luftwaffe',
    'Squadron strength': 'Fuerza del escuadrón',
    'Crew morale': 'Moral de las tripulaciones',
    'Escort availability': 'Disponibilidad de escolta',
    'Enemy fighters x{a} · skill x{b}': 'Cazas enemigos x{a} · pericia x{b}',
    'Full-size formations': 'Formaciones completas',
    'Formations at {n}% — replacements arriving': 'Formaciones al {n}% — llegan reemplazos',
    'Merit x{n}': 'Mérito x{n}',
    'P-51s join the gunner missions': 'Los P-51 se unen a las misiones de ametrallador',
    'P-51s join gunner missions at {n}%': 'Los P-51 se unen a las misiones de ametrallador al {n}%',
    'Intelligence report': 'Informe de inteligencia',
    'No operations flown yet. Group expects heavy fighter opposition over the German coast.': 'Aún no se ha volado ninguna operación. El Grupo espera una fuerte oposición de cazas sobre la costa alemana.',

    // ---------------- CampaignMap.ts: operation cards ----------------
    'P-51D escort': 'Escolta de P-51D',
    'Low sun': 'Sol bajo',
    'Formation {n} ships': 'Formación de {n} aviones',
    'Fighters x{n}': 'Cazas x{n}',
    'P-51s at {t}': 'P-51 a las {t}',
    'MISSION {n} OF {total}': 'MISIÓN {n} DE {total}',
    'Brief the crew': 'Informar a la tripulación',
    'Tour complete': 'Turno completado',
    'Twenty-five missions': 'Veinticinco misiones',
    "The Sky Queen's crew is going home.": 'La tripulación del Sky Queen vuelve a casa.',
    'Campaign summary': 'Resumen de la campaña',
    'Begin a new tour': 'Empezar un nuevo turno',
    'Confirm: new tour (medals and Armory kept)': 'Confirmar: nuevo turno (se conservan medallas y Armería)',
    'Raid flown — target destroyed': 'Incursión volada — objetivo destruido',
    'Raid flown — target missed': 'Incursión volada — objetivo fallado',
    'The window has passed': 'La ocasión ha pasado',
    'Fly this raid': 'Volar esta incursión',
    '{fx} · +{n} merit': '{fx} · +{n} de mérito',
    'The tour is over. Side raids are closed.': 'El turno ha terminado. Las incursiones secundarias están cerradas.',
    'Side raids open after your first mission. Fly Mission 1 to begin the tour.': 'Las incursiones secundarias se abren tras tu primera misión. Vuela la misión 1 para empezar el turno.',
    'One raid per lull between operations.': 'Una incursión por cada pausa entre operaciones.',
    'Optional: fly one raid before Mission {n}, or go straight on. What you hit changes the odds on the next big one.':
      'Opcional: vuela una incursión antes de la misión {n}, o sigue directamente. Lo que golpees cambia las probabilidades de la próxima gran operación.',
    '1 medal': '1 medalla',
    '{n} medals': '{n} medallas',
    '401ST BOMB SQUADRON · OPERATIONS ROOM': '401.º ESCUADRÓN DE BOMBARDEO · SALA DE OPERACIONES',
    ' · TOUR {n}': ' · TURNO {n}',
    'Campaign': 'Campaña',
    'Campaign date': 'Fecha de campaña',
    '{done}/{total} operations': '{done}/{total} operaciones',
    '1 side raid': '1 incursión secundaria',
    '{n} side raids': '{n} incursiones secundarias',
    'Next operation': 'Próxima operación',
    'Tour of duty': 'Turno de servicio',
    'Side raids': 'Incursiones secundarias',
    '· before Mission {n}': '· antes de la misión {n}',
    'Tour timeline': 'Cronología del turno',

    // ---------------- CampaignMap.ts: tour summary ----------------
    'The German day-fighter arm is a shadow of the force that met you over Emden. You helped break it.': 'La caza diurna alemana es una sombra de la fuerza que te recibió sobre Emden. Ayudaste a quebrarla.',
    'The Luftwaffe is still flying, but it is bleeding pilots it cannot replace. The air war has turned.': 'La Luftwaffe aún vuela, pero se desangra perdiendo pilotos que no puede reemplazar. La guerra aérea ha cambiado de signo.',
    'The Luftwaffe is battered but unbroken. The crews who follow you will still have a fight on their hands.': 'La Luftwaffe está maltrecha pero no rota. Las tripulaciones que te sigan aún tendrán que pelear.',
    'Your {n} successful side raids kept the pressure on between the big operations.': 'Tus {n} incursiones secundarias con éxito mantuvieron la presión entre las grandes operaciones.',
    '1 side raid hit home between the big operations.': '1 incursión secundaria dio en el blanco entre las grandes operaciones.',
    '{n} side raids hit home between the big operations.': '{n} incursiones secundarias dieron en el blanco entre las grandes operaciones.',
    'You flew the story operations alone, without side raids.': 'Volaste solo las operaciones de la historia, sin incursiones secundarias.',
    'The crews finish the tour in fine spirits.': 'Las tripulaciones terminan el turno con la moral alta.',
    'The crews are tired, but proud.': 'Las tripulaciones están cansadas, pero orgullosas.',
    'The crews are worn to the bone. Too many empty bunks.': 'Las tripulaciones están agotadas. Demasiadas literas vacías.',
    '401ST BOMB SQUADRON · TOUR OF DUTY': '401.º ESCUADRÓN DE BOMBARDEO · TURNO DE SERVICIO',
    'Tour in progress': 'Turno en curso',
    'Story operations': 'Operaciones de la historia',
    'Sorties flown': 'Salidas voladas',
    'Confirmed kills': 'Derribos confirmados',
    'Fortresses lost': 'Fortalezas perdidas',
    'Medals on record': 'Medallas registradas',
    'Squadron': 'Escuadrón',
    'Escort': 'Escolta',
    'Operations log': 'Registro de operaciones',
    'No sorties recorded.': 'No hay salidas registradas.',
    'Campaign map': 'Mapa de campaña',
    'Main menu': 'Menú principal',

    // ---------------- CampaignMap.ts: briefing sheet ----------------
    'SIDE RAID · OPTIONAL OPERATION': 'INCURSIÓN SECUNDARIA · OPERACIÓN OPCIONAL',
    'Campaign: Luftwaffe {n}%': 'Campaña: Luftwaffe {n}%',
    'Morale {n}% · merit x{m}': 'Moral {n}% · mérito x{m}',
    'On success: {fx} · +{n} merit': 'Si tiene éxito: {fx} · +{n} de mérito',
  },
  patterns,
};
export default table;
