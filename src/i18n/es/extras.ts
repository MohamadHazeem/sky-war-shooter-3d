// Spanish for ar/extras.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const MONTHS: Record<string, string> = {
  January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio',
  July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre',
};

const patterns: Pattern[] = [
  [/^([\d,]+) mph \(([\d,]+) km\/h\)$/, '$1 mph ($2 km/h)'],
  [/^([\d.]+) m × ([\d.]+) m$/, '$1 m × $2 m'],
  [/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m) => `${m[1]} de ${MONTHS[m[2]]} de ${m[3]}`],
];

const table: PhraseTable = {
  phrases: {
    // ---------- What's new ----------
    "What's new": 'Novedades',
    '401st Bomb Group · Operations bulletin': '401st Bomb Group · Boletín de operaciones',
    'Orders of the day · version {v}': 'Órdenes del día · versión {v}',
    'Understood': 'Entendido',
    'Try it': 'Probar',
    "This bulletin stays pinned up: title menu → What's new, or Settings.": 'Este boletín sigue a mano: menú principal → Novedades, o Ajustes.',
    'bulletin · version {v}': 'boletín · versión {v}',
    'WANTED': 'SE BUSCA',
    'WEEK': 'SEMANA',
    'BETA': 'BETA',
    'Choose the next target on a living 1943–44 map. Side raids on rail yards, airfields and oil hit the Luftwaffe where it hurts.':
      'Elige el siguiente objetivo en un mapa vivo de 1943–44. Las incursiones secundarias contra estaciones ferroviarias, aeródromos y petróleo golpean a la Luftwaffe donde más duele.',
    'Take-off and landing': 'Despegue y aterrizaje',
    'Dawn take-off from Deenethorpe and the landing afterwards: red flares and fire trucks if she comes home shot up. Skippable.':
      'Despegue al amanecer desde Deenethorpe y aterrizaje al volver: bengalas rojas y camiones de bomberos si regresa acribillada. Se puede saltar.',
    'Boss battle groups': 'Grupos de combate de jefes',
    'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.':
      'Un grupo de combate Luftkreuzer va a por la formación en la primera ronda. Destruye sus torretas, motores y antiaérea para abrir el blindaje y luego acribilla el casco.',
    'Luftkreuzer flying warships with turrets, flak and rocket pods. Shoot the parts away to breach the armour.':
      'Luftkreuzer: buques de guerra voladores con torretas, antiaérea y lanzacohetes. Destruye sus partes para abrir el blindaje.',
    'Living B-17 interior': 'Interior vivo del B-17',
    'The other waist gunner fights beside you, brass piles up, frost creeps over the glass. Hold C to look around.':
      'El otro ametrallador lateral combate a tu lado, los casquillos se amontonan, la escarcha cubre el cristal. Mantén C para mirar alrededor.',
    'P-51 special operations': 'Operaciones especiales del P-51',
    'Defend the Field against a Ju 88 raid, hunt bombers as a Night Fighter, or go Train Busting at treetop height.':
      'Defiende el aeródromo de un ataque de Ju 88, caza bombarderos como caza nocturno o ataca trenes a ras de los árboles.',
    'Wingman orders': 'Órdenes al punto',
    'Your wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up.':
      'Tu punto en cada misión de P-51: 1 ataca mi objetivo, 2 cúbreme, 3 protege a los bombarderos, 4 en formación.',
    'Experten nemesis aces': 'Ases némesis Experten',
    'Named Luftwaffe aces who remember you, carry scars and grudges, and climb the ranks if they get away.':
      'Ases de la Luftwaffe con nombre que te recuerdan, llevan cicatrices y rencores, y ascienden si escapan.',
    'Skill tree': 'Árbol de habilidades',
    'Spend points from promotions in three branches: Marksman, Gunnery Sergeant and Survivor.':
      'Gasta los puntos de ascenso en tres ramas: Tirador, Sargento artillero y Superviviente.',
    'Custom battle and weekly': 'Batalla personalizada y semanal',
    'Build your own battle: enemies, weather, time of day, a boss round. Or fly the weekly challenge for its ribbon.':
      'Crea tu batalla: enemigos, clima, hora del día, una ronda de jefe. O vuela el desafío semanal para ganar su cinta.',
    'Scrub the last 90 seconds of a mission, fly a free camera, save the best moments and screenshots.':
      'Recorre los últimos 90 segundos de una misión, maneja una cámara libre, guarda los mejores momentos y capturas.',
    'Co-op': 'Cooperativo',
    'Two gunners, one B-17: share a room code with a friend and man different guns online.':
      'Dos ametralladores, un B-17: comparte un código de sala con un amigo y ocupad puestos distintos en línea.',
    'Arabic': 'Árabe',
    'Every screen in Arabic, right to left. Switch the language in Settings.': 'Todas las pantallas en árabe, de derecha a izquierda. Cambia el idioma en Ajustes.',

    // ---------- gallery: screen ----------
    'recognition · quiz': 'identificación · test',
    'Aircraft recognition': 'Identificación de aviones',
    'Hangar 2 · Deenethorpe': 'Hangar 2 · Deenethorpe',
    'Gallery': 'Galería',
    'Recognition quiz': 'Test de identificación',
    'Drag to orbit · wheel or pinch to zoom · ← → change aircraft · gamepad: right stick, LT / RT, LB / RB':
      'Arrastra para girar · rueda o pellizco para ampliar · ← → cambiar de avión · mando: stick derecho, LT / RT, LB / RB',
    'Previous aircraft': 'Avión anterior',
    'Next aircraft': 'Avión siguiente',
    'Wheeling her out…': 'Sacándolo del hangar…',
    'Fictional · boss': 'Ficticio · jefe',
    'Allied · USAAF': 'Aliado · USAAF',
    'Luftwaffe': 'Luftwaffe',
    'On our side: hold your fire': 'De los nuestros: no dispares',
    'Warships downed by you:': 'Buques derribados por ti:',
    'Shot down by you:': 'Derribados por ti:',
    'Crew': 'Tripulación',
    'Armament': 'Armamento',
    'Top speed': 'Velocidad máxima',
    'First flight': 'Primer vuelo',
    'Span × length': 'Envergadura × longitud',
    "Gunner's note": 'Nota del ametrallador',
    'HANGAR 2 · KEEP CLEAR': 'HANGAR 2 · NO OBSTRUIR',
    // quiz
    'Round {i} / {n}': 'Ronda {i} / {n}',
    'Score {n}': 'Puntos {n}',
    'Identify the aircraft': 'Identifica el avión',
    'Correct: {name}': 'Correcto: {name}',
    'No: that was the {name}': 'No: era el {name}',
    'Results': 'Resultados',
    'Next': 'Siguiente',
    '{n} of {total} identified': '{n} de {total} identificados',
    'New best score!': '¡Nuevo récord!',
    'Best score: {n} / {total}': 'Récord: {n} / {total}',
    'Again': 'Otra vez',

    // ---------- gallery: spec cards ----------
    'Boeing B-17G Flying Fortress': 'Boeing B-17G Flying Fortress',
    'Heavy bomber · your aircraft': 'Bombardero pesado · tu avión',
    '13 × .50 cal M2 machine guns · up to 8,000 lb of bombs': '13 ametralladoras M2 calibre .50 · hasta 8000 lb de bombas',
    'Five gun positions you can man: switch seats to meet each attack where it comes from.': 'Cinco puestos de tiro que puedes ocupar: cambia de puesto para responder a cada ataque desde donde venga.',
    'North American P-51D Mustang': 'North American P-51D Mustang',
    'Long-range escort fighter': 'Caza de escolta de largo alcance',
    '6 × .50 cal M2 machine guns': '6 ametralladoras M2 calibre .50',
    'Friendly! Bubble canopy and a belly scoop: hold your fire when one dives past the bombers.': '¡Amigo! Cabina de burbuja y toma ventral: no dispares cuando pase en picado junto a los bombarderos.',
    'Focke-Wulf Fw 190 A-8': 'Focke-Wulf Fw 190 A-8',
    'Fighter · bomber destroyer': 'Caza · destructor de bombarderos',
    '2 × 13 mm MG 131 · 4 × 20 mm MG 151/20 cannon': '2 MG 131 de 13 mm · 4 cañones MG 151/20 de 20 mm',
    "Attacks head-on from twelve o'clock high in tight groups: meet him with the top turret and fire early.": 'Ataca de frente desde las doce en alto en grupos cerrados: recíbelo con la torreta superior y dispara pronto.',
    'Messerschmitt Bf 109 G-14': 'Messerschmitt Bf 109 G-14',
    'Fighter': 'Caza',
    '1 × 20 mm MG 151/20 cannon · 2 × 13 mm MG 131': '1 cañón MG 151/20 de 20 mm · 2 MG 131 de 13 mm',
    'Nimble but lightly built: a short, well-led burst brings him down. Watch for him diving on stragglers.': 'Ágil pero frágil: una ráfaga corta con buen adelanto lo derriba. Ojo con sus picados sobre los rezagados.',
    'Messerschmitt Bf 110 G': 'Messerschmitt Bf 110 G',
    'Zerstörer heavy fighter': 'Caza pesado Zerstörer',
    '2 × 20 mm cannon · 4 × 7.92 mm MG · twin rear MG 81Z · 21 cm rockets': '2 cañones de 20 mm · 4 MG de 7,92 mm · MG 81Z doble trasera · cohetes de 21 cm',
    'Hangs back out of range and lobs 21 cm rockets from a kilometre: break the wave up before it fires.': 'Se queda fuera de alcance y lanza cohetes de 21 cm desde un kilómetro: dispersa la oleada antes de que dispare.',
    'Junkers Ju 88 A-4': 'Junkers Ju 88 A-4',
    'Bomber · heavy fighter': 'Bombardero · caza pesado',
    '7.92 mm and 13 mm defensive guns · 1,400 kg of bombs internally': 'Armas defensivas de 7,92 y 13 mm · 1400 kg de bombas en bodega',
    'Slow and armoured: go for an engine, not the fuselage.': 'Lento y blindado: apunta a un motor, no al fuselaje.',
    'Messerschmitt Me 262 A-1a Schwalbe': 'Messerschmitt Me 262 A-1a Schwalbe',
    'Jet fighter': 'Caza a reacción',
    '4 × 30 mm MK 108 cannon': '4 cañones MK 108 de 30 mm',
    '18 April 1941 (first jet flight 18 July 1942)': '18 de abril de 1941 (primer vuelo a reacción 18 de julio de 1942)',
    'Too fast to track: lead him far ahead, and fire as he slows to line up his cannon.': 'Demasiado rápido para seguirlo: adelántate mucho y dispara cuando frene para alinear sus cañones.',
    'Messerschmitt Me 163 B Komet': 'Messerschmitt Me 163 B Komet',
    'Rocket interceptor': 'Interceptor cohete',
    '2 × 30 mm MK 108 cannon': '2 cañones MK 108 de 30 mm',
    'A few minutes of rocket fuel: one slashing pass, then he glides home. One good hit and he is done.': 'Unos minutos de combustible: una pasada fulminante y vuelve planeando. Un buen impacto y está acabado.',
    'Heinkel He 111 H': 'Heinkel He 111 H',
    'Medium bomber': 'Bombardero medio',
    'Up to 7 × 7.92 mm MG · 2,000 kg of bombs': 'Hasta 7 MG de 7,92 mm · 2000 kg de bombas',
    'Glazed nose, close formations, a gunner in every window: attack from below and go for the engines.': 'Morro acristalado, formaciones cerradas, un ametrallador en cada ventana: ataca desde abajo y apunta a los motores.',
    'Messerschmitt Me 410 A Hornisse': 'Messerschmitt Me 410 A Hornisse',
    'Heavy fighter · bomber destroyer': 'Caza pesado · destructor de bombarderos',
    '2 × 20 mm cannon · 2 × 7.92 mm MG · 2 × 13 mm remote barbettes · 50 mm BK 5 cannon (U4)': '2 cañones de 20 mm · 2 MG de 7,92 mm · 2 barbetas teledirigidas de 13 mm · cañón BK 5 de 50 mm (U4)',
    'The BK 5 cannon telegraphs: he lines up from two kilometres and holds steady. Kill him before he fires.': 'El cañón BK 5 lo delata: se alinea desde dos kilómetros y se mantiene firme. Derríbalo antes de que dispare.',
    'Shown on the Bf 110 airframe the game uses as a stand-in.': 'Mostrado sobre la célula del Bf 110 que el juego usa como sustituto.',
    'Dornier Do 335 A Pfeil': 'Dornier Do 335 A Pfeil',
    'Heavy fighter (push-pull)': 'Caza pesado (tractor-propulsor)',
    '1 × 30 mm MK 103 cannon · 2 × 20 mm MG 151/20': '1 cañón MK 103 de 30 mm · 2 MG 151/20 de 20 mm',
    'A propeller at each end: he dives from high astern as fast as a jet. Watch the tail and lead him hard.': 'Una hélice en cada extremo: pica desde arriba y atrás tan rápido como un reactor. Vigila la cola y adelántate mucho.',
    'Luftkreuzer (fictional)': 'Luftkreuzer (ficticio)',
    'Flying warship · boss battle group': 'Buque de guerra volador · grupo de combate de jefe',
    'Fictional': 'Ficticio',
    'Gun turrets · 8.8 cm dorsal flak · rocket pods': 'Torretas · antiaérea dorsal de 8,8 cm · lanzacohetes',
    'Never: invented for the game': 'Nunca: inventado para el juego',
    'About three times a Ju 88': 'Unas tres veces un Ju 88',
    'Shoot away turrets, engines and flak to breach the armour, then pour fire into the hull.': 'Destruye torretas, motores y antiaérea para abrir el blindaje y luego acribilla el casco.',
    'Fictional: no such aircraft was ever built.': 'Ficticio: nunca se construyó un avión así.',
  },
  patterns,
};
export default table;
