import type { PhraseTable } from '../types';

// Spanish for ar/tour.ts (same keys and patterns).

const WHAT: Record<string, string> = {
  'U-boat yards': "Astilleros de U-Boote", 'Fighter airfield': "Aeródromo de cazas", 'Propeller works': "Fábrica de hélices", 'Marshalling yards': "Estación de clasificación",
  'Port facilities': "Instalaciones portuarias", 'Focke-Wulf plant': "Planta Focke-Wulf", 'Arado aircraft works': "Fábrica de aviones Arado", 'Rail yards': "Playas de vías",
  'Ball-bearing plants': "Fábricas de rodamientos", 'Port area': "Zona portuaria", 'Synthetic oil plant': "Planta de combustible sintético", 'Ball-bearing works': "Fábrica de rodamientos",
  'Industrial area': "Zona industrial", 'Naval yards': "Astilleros navales", 'Chemical works': "Planta química", 'Fighter assembly plant': "Planta de montaje de cazas",
  'Junkers works': "Fábrica Junkers", 'Aircraft works': "Fábrica de aviones", 'Aircraft assembly': "Montaje de aviones", 'Messerschmitt works': "Fábrica Messerschmitt",
  'Heinkel works': "Fábrica Heinkel", 'Bearing works': "Fábrica de cojinetes", 'Industrial rail district': "Distrito ferroviario industrial", 'Dornier works': "Fábrica Dornier",
};
const CITY: Record<string, string> = {
  Emden: 'Emden', Woensdrecht: 'Woensdrecht', Frankfurt: 'Fráncfort', 'Saarbrücken': 'Saarbrücken', Bremen: 'Bremen', Vegesack: 'Vegesack', Marienburg: 'Marienburg',
  Anklam: 'Anklam', 'Münster': 'Münster', Schweinfurt: 'Schweinfurt', Wilhelmshaven: 'Wilhelmshaven', Gelsenkirchen: 'Gelsenkirchen', Paris: 'París', Solingen: 'Solingen',
  Kiel: 'Kiel', 'Osnabrück': 'Osnabrück', Ludwigshafen: 'Ludwigshafen', Oschersleben: 'Oschersleben', Halberstadt: 'Halberstadt', Brunswick: 'Brunswick',
  Leipzig: 'Leipzig', Aschersleben: 'Aschersleben', Bernburg: 'Bernburg', Gotha: 'Gotha', Rostock: 'Rostock', Regensburg: 'Ratisbona', Augsburg: 'Augsburgo',
  Stuttgart: 'Stuttgart', Berlin: 'Berlín', Oranienburg: 'Oranienburg', Sorau: 'Sorau', Stettin: 'Stettin', Friedrichshafen: 'Friedrichshafen',
};
const NAMES: Record<string, string> = {
  Brenner: 'Brenner', Doyle: 'Doyle', Stern: 'Stern', Kessler: 'Kessler', Mendez: 'Mendez', Gallo: 'Gallo', Reilly: 'Reilly', Price: 'Price', Walsh: 'Walsh', Dawson: 'Dawson',
  Morrow: 'Morrow', Carver: 'Carver', Pruitt: 'Pruitt', Ortega: 'Ortega', Kowalski: 'Kowalski', Hughes: 'Hughes', Baker: 'Baker', Russo: 'Russo', Novak: 'Novak', Fisher: 'Fisher',
  Whitfield: 'Whitfield', Delgado: 'Delgado', Brennan: 'Brennan', Lindqvist: 'Lindqvist', Harlan: 'Harlan', Mercer: 'Mercer',
  Jablonski: 'Jablonski', Moreno: 'Moreno', "O'Neill": "O'Neill", Petrakis: 'Petrakis', Sullivan: 'Sullivan', Carter: 'Carter', Henderson: 'Henderson', Vance: 'Vance', Kowalczyk: 'Kowalczyk', Abbott: 'Abbott',
};
const RANK: Record<string, string> = { 'Sgt.': 'Sgto.', 'S/Sgt.': 'Sgto. 1.º', 'T/Sgt.': 'Sgto. téc.', 'Lt.': 'Tte.', 'Capt.': 'Cap.', 'Maj.': 'Cmte.' };
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
const name = (s: string, tr: (s: string) => string) => { const i = s.indexOf(' '); return i < 0 ? tr(s) : `${tr(s.slice(0, i))} ${tr(s.slice(i + 1))}`; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whatRx = Object.keys(WHAT).map(esc).join('|');

const table: PhraseTable = {
  phrases: {
    ...WHAT, ...CITY, ...NAMES, ...RANK,
    // menu and entry points
    'The Tour': "El Turno de servicio",
    'THE TOUR': "EL TURNO DE SERVICIO",
    'Twenty-five missions, one ship, one crew': "Veinticinco misiones, un avión, una tripulación",
    'The Tour · 25 missions': "El Turno · 25 misiones",
    'THE TOUR · 25 MISSIONS': "EL TURNO · 25 MISIONES",
    'A tour of duty': "Un turno de servicio",
    'Twenty-five missions, one Fortress, one crew. Damage stays with the ship until the ground crew patches it, wounded men miss missions, and the men you lose are replaced by rookies.':
      "Veinticinco misiones, una Fortaleza, una tripulación. Los daños se quedan en el avión hasta que el personal de tierra los parchea, los heridos se pierden misiones y los hombres caídos son sustituidos por novatos.",
    'Pick each target from the field orders as the air war moves from Emden to Berlin. Watch morale and fatigue, and bring them home after mission twenty-five.':
      "Elige cada objetivo de las órdenes de campaña mientras la guerra aérea avanza de Emden a Berlín. Vigila la moral y el cansancio, y llévalos a casa tras la misión veinticinco.",
    'Begin the tour': "Empezar el turno",
    'Back': "Volver",
    // the board
    'Mission {n} of 25': "Misión {n} de 25",
    '{n} sorties flown': "{n} salidas realizadas",
    '{n} of 25 missions credited': "{n} de 25 misiones acreditadas",
    'Field orders · {date}': "Órdenes de campaña · {date}",
    'Choose the target': "Elige el objetivo",
    'Mustang escort': "Escolta de Mustang",
    'Escort to the border': "Escolta hasta la frontera",
    'No escort': "Sin escolta",
    'Last mission': "Última misión",
    'Maximum effort: danger +1, merit ×1.5.': "Esfuerzo máximo: peligro +1, mérito ×1.5.",
    'Fly this mission': "Volar esta misión",
    'Stand down a day': "Un día de descanso",
    'The crew has had its rest. The next sortie is waiting.': "La tripulación ya ha descansado. La próxima salida espera.",
    'A stand-down lowers fatigue and lets the wounded heal, once between missions.': "Un día de descanso reduce el cansancio y deja sanar a los heridos, una vez entre misiones.",
    'Latest': "Novedades",
    'Abandon the tour': "Abandonar el turno",
    'Press again to abandon the tour': "Pulsa otra vez para abandonar el turno",
    'Between missions': "Entre misiones",
    'Milk run': "Paseo",
    'Light opposition': "Oposición ligera",
    'Defended': "Defendido",
    'Heavily defended': "Muy defendido",
    'Deep penetration': "Penetración profunda",
    'Tour log ({n} sorties)': "Diario del turno ({n} salidas)",
    'Mission {n}': "Misión {n}",
    'Credited': "Acreditada",
    'Ship lost': "Avión perdido",
    'Not credited': "No acreditada",
    '{n} kills': "{n} derribos",
    // the ship
    'The ship': "El avión",
    'Damage carried by the ship': "Daños que arrastra el avión",
    'Missions flown': "Misiones voladas",
    'Repair patches': "Parches de reparación",
    'Condition': "Estado",
    'Engine {e} rough': "Motor {e} irregular",
    'Ships lost: {names}': "Aviones perdidos: {names}",
    'Nose': "Morro", 'Cockpit': "Cabina", 'Forward fuselage': "Fuselaje delantero", 'Waist section': "Sección central", 'Rear fuselage': "Fuselaje trasero", 'Tail': "Cola",
    'Engine 1': "Motor 1", 'Engine 2': "Motor 2", 'Engine 3': "Motor 3", 'Engine 4': "Motor 4",
    'Left wing': "Ala izquierda", 'Left wingtip': "Punta del ala izquierda", 'Right wing': "Ala derecha", 'Right wingtip': "Punta del ala derecha",
    // the crew
    'The crew': "La tripulación",
    'Morale': "Moral",
    'Fatigue': "Cansancio",
    'In good heart': "Animada", 'Holding steady': "Estable", 'Shaken': "Afectada", 'Breaking': "Al límite",
    'Fresh': "Descansada", 'Tired': "Cansada", 'Worn out': "Agotada", 'Flak-happy': "Neurosis de combate",
    'Crew gunnery {n}% of a veteran crew.': "Puntería de la tripulación: {n}% de una tripulación veterana.",
    'Wounded · out {n}': "Herido · baja {n}",
    'New man': "Nuevo",
    '{n} missions': "{n} misiones",
    'Pilot': "Piloto", 'Co-Pilot': "Copiloto", 'Navigator': "Navegante", 'Bombardier': "Bombardero", 'Radio Room': "Cabina de radio",
    'Top Turret': "Torreta superior", 'Ball Turret': "Torreta ventral", 'Left Waist': "Lateral izquierdo", 'Right Waist': "Lateral derecho", 'Tail Gun': "Ametrallador de cola",
    'Air Medal': "Medalla del Aire", 'Oak Leaf Cluster': "Hojas de Roble", 'Distinguished Flying Cross': "Cruz de Vuelo Distinguido", 'Purple Heart': "Corazón Púrpura",
    'Interphone': "Intercomunicador",
    // the report
    'The Tour · {n} of 25 missions credited': "El Turno · {n} de 25 misiones acreditadas",
    'Back to the tour': "Volver al turno",
    'Mission {n} of 25 credited.': "Misión {n} de 25 acreditada.",
    'The {ship} went down in the sea. Air-Sea Rescue picked up the crew. The sortie is not credited.': "El {ship} cayó al mar. El rescate aeromarítimo recogió a la tripulación. La salida no se acredita.",
    'The {ship} ditched in the sea on the way home. Air-Sea Rescue picked up the crew.': "El {ship} amaró de emergencia de regreso. El rescate aeromarítimo recogió a la tripulación.",
    'The {ship} was shot down. The sortie is not credited.': "El {ship} fue derribado. La salida no se acredita.",
    'The sortie is not credited. Mission {n} will be flown again.': "La salida no se acredita. La misión {n} se volverá a volar.",
    '{who} died of his wounds.': "{who} murió a causa de sus heridas.",
    '{who} is badly wounded and is going home. Purple Heart.': "{who} está gravemente herido y vuelve a casa. Corazón Púrpura.",
    '{who} is seriously wounded: hospital for {n} missions. Purple Heart.': "{who} está herido de gravedad: hospital durante {n} misiones. Corazón Púrpura.",
    '{who} was nicked by a splinter and stays on flying status. Purple Heart.': "A {who} le rozó una esquirla y sigue apto para volar. Corazón Púrpura.",
    '{who} is wounded and misses the next mission. Purple Heart.': "{who} está herido y se pierde la próxima misión. Corazón Púrpura.",
    '{who} did not get out of the {ship}.': "{who} no logró salir del {ship}.",
    '{who} is missing. Nobody saw a parachute.': "{who} está desaparecido. Nadie vio un paracaídas.",
    'The rest of the crew bailed out over the coast and is back at the base.': "El resto de la tripulación saltó sobre la costa y ya está de vuelta en la base.",
    'A replacement Fortress is assigned to the crew: the {ship}.': "Se asigna a la tripulación una Fortaleza de reemplazo: el {ship}.",
    'The ground crew put {n} new patches on the {ship}. She carries {total} now.': "El personal de tierra puso {n} parches nuevos al {ship}. Ya lleva {total}.",
    'The {ship} came home without a scratch.': "El {ship} volvió sin un rasguño.",
    'Number {e} engine is still running rough.': "El motor número {e} sigue funcionando irregular.",
    '{who} is promoted to {rank}.': "{who} asciende a {rank}.",
    '{medal}: {who}': "{medal}: {who}",
    'You are awarded the {medal}.': "Condecoración recibida: {medal}.",
    '{who} joins the crew at the {post}.': "{who} se une a la tripulación en el puesto: {post}.",
    'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.': "Moral de la tripulación {a}% → {b}%. Cansancio {c}% → {d}%.",
    'The crew is stood down for a day. Fatigue {a}% → {b}%.': "La tripulación descansa un día. Cansancio {a}% → {b}%.",
    'Maximum effort: +{n} merit.': "Esfuerzo máximo: +{n} de mérito.",
    'Stand-down': "Descanso",
    // the mission
    'Bring her home': "Llévalo a casa",
    'Going Home': "De vuelta a casa",
    'Mission twenty-five. When this one is over, the crew goes home.': "Misión veinticinco. Cuando termine esta, la tripulación se va a casa.",
    'Intelligence expects light opposition: a few single-engine fighters near the coast. A milk run, if there is such a thing.':
      "Inteligencia espera oposición ligera: unos pocos cazas monomotores cerca de la costa. Un paseo, si es que existe tal cosa.",
    'Expect fighters on the way in and out, and flak over the target. Keep the formation tight.':
      "Esperad cazas a la ida y a la vuelta, y flak sobre el objetivo. Mantened la formación cerrada.",
    'The target is well defended. Fighters will be waiting at the border, and the flak over the target is heavy.':
      "El objetivo está bien defendido. Los cazas esperarán en la frontera, y la flak sobre el objetivo es intensa.",
    'This is a heavily defended target. Expect repeated attacks by single- and twin-engine fighters, with rockets from astern.':
      "Es un objetivo muy defendido. Esperad ataques repetidos de cazas monomotores y bimotores, con cohetes desde atrás.",
    'Deep penetration. Every fighter group in the Reich will be up, in relays, from the coast to the target and back. Some of us will not come home.':
      "Penetración profunda. Todos los grupos de caza del Reich estarán en el aire, por relevos, desde la costa hasta el objetivo y de vuelta. Algunos no volveremos a casa.",
    'There is no escort beyond the Dutch coast. From there on the formation is its own escort.':
      "No hay escolta más allá de la costa holandesa. A partir de ahí, la formación es su propia escolta.",
    'Thunderbolts will take us as far as the German border. After that we are on our own until they meet us on the way home.':
      "Los Thunderbolt nos acompañarán hasta la frontera alemana. Después estaremos solos hasta que nos recojan a la vuelta.",
    'Mustangs will be with us all the way to the target. Hold out until the little friends arrive.':
      "Los Mustang nos acompañarán hasta el objetivo. Aguantad hasta que lleguen los pequeños amigos.",
    'One new man is flying with the crew. Keep an eye on them.': "Un hombre nuevo vuela con la tripulación. Vigiladlo.",
    'Maximum effort: every ship that can fly goes today.': "Esfuerzo máximo: hoy despega todo avión que pueda volar.",
    'Twenty-five. Wheels down at Deenethorpe, and the crew climbs out for the last time. Tour complete.':
      "Veinticinco. Ruedas en tierra en Deenethorpe, y la tripulación baja por última vez. Turno completado.",
    // the finale
    'Twenty-five missions. The crew climbs out of the {ship} for the last time.': "Veinticinco misiones. La tripulación baja del {ship} por última vez.",
    'Lucky Bastard Club': "Lucky Bastard Club",
    'This certifies that the bearer has completed a combat tour of twenty-five missions over enemy territory with the 401st Bomb Squadron.':
      "Se certifica que el portador ha completado un turno de combate de veinticinco misiones sobre territorio enemigo con el 401st Bomb Squadron.",
    'Sorties flown': "Salidas realizadas",
    'Confirmed kills': "Derribos confirmados",
    'Fortresses': "Fortalezas",
    'Medals': "Condecoraciones",
    'Going home with you': "Vuelven a casa contigo",
    'Sent home wounded': "Repatriados heridos",
    'Remembered': "En memoria",
    'Begin a new tour': "Empezar un nuevo turno",
    'Main menu': "Menú principal",
    // events
    'Flak house': "Casa de reposo",
    'Halfway. The flight surgeon sends the crew to a rest home in the country for a week: real beds, real eggs and no interphone.':
      "A mitad de camino. El médico de vuelo manda a la tripulación una semana a una casa de reposo en el campo: camas de verdad, huevos de verdad y nada de intercomunicador.",
    'Pack your bags': "Hacer las maletas",
    'A week of sleep. The crew comes back rested.': "Una semana de sueño. La tripulación vuelve descansada.",
    'Mail call': "Reparto de correo",
    'Letters and parcels from home reach the hut. Nobody says much for an hour.': "Llegan al barracón cartas y paquetes de casa. Durante una hora, nadie dice gran cosa.",
    'Read your letters': "Leer las cartas",
    'The hut is quiet and warm. Morale rises.': "El barracón está tranquilo y caliente. La moral sube.",
    'A new engine': "Un motor nuevo",
    'The crew chief has found a factory-fresh Wright Cyclone and wants to hang it on the {ship}.': "El jefe de mecánicos ha encontrado un Wright Cyclone recién salido de fábrica y quiere montarlo en el {ship}.",
    'Hang the new engine': "Montar el motor nuevo",
    'The tired engine is replaced. She runs like a watch.': "El motor cansado ha sido sustituido. Funciona como un reloj.",
    'Forty-eight hour pass': "Permiso de cuarenta y ocho horas",
    'The crew has a pass to London. The ground crew could use extra hands on the {ship}.': "La tripulación tiene permiso para ir a Londres. Al personal de tierra le vendrían bien más manos en el {ship}.",
    'Go to London': "Ir a Londres",
    'Two days in London. The crew comes back tired but happy.': "Dos días en Londres. La tripulación vuelve cansada pero feliz.",
    'Stay and help the ground crew': "Quedarse a ayudar al personal de tierra",
    'Extra hands on the line. The {ship} is in better shape.': "Más manos en la pista. El {ship} está en mejor estado.",
    'Empty bunks': "Literas vacías",
    'The crew in the next hut did not come back yesterday. Their bunks were stripped this morning.': "La tripulación del barracón de al lado no volvió ayer. Esta mañana vaciaron sus literas.",
    'Carry on': "Seguir adelante",
    'Nobody talks much at breakfast.': "Nadie habla mucho en el desayuno.",
    'Maximum effort': "Esfuerzo máximo",
    'Group orders a maximum effort: every ship that can fly goes next. The crew chief wants the {ship} on the ground for repairs.':
      "El grupo ordena un esfuerzo máximo: todo avión que pueda volar sale en la próxima. El jefe de mecánicos quiere el {ship} en tierra para repararlo.",
    'Volunteer the {ship}': "Ofrecer el {ship}",
    'The {ship} is on the board. The danger is higher, and so is the merit.': "El {ship} está en la pizarra. El peligro es mayor, y el mérito también.",
    'Ground her for repairs': "Dejarlo en tierra para reparar",
    'The ground crew works through the night.': "El personal de tierra trabaja toda la noche.",
    'Lucky charm': "Amuleto de la suerte",
    "Sergeant Walsh has lost the rabbit's foot he keeps in his flak vest. He swears he will not fly without it.": "El sargento Walsh ha perdido la pata de conejo que lleva en el chaleco antimetralla. Jura que no volará sin ella.",
    'Search the dispersal': "Registrar la zona de dispersión",
    'Found it under his bunk. Walsh grins all the way to the briefing.': "Estaba bajo su litera. Walsh sonríe todo el camino hasta la reunión informativa.",
    'Tell him luck is for the Luftwaffe': "Decirle que la suerte es para la Luftwaffe",
    'Walsh flies without it. He does not say a word all day.': "Walsh vuela sin ella. No dice ni una palabra en todo el día.",
    'Fogbound': "Atrapados por la niebla",
    'Fog sits on the field for three days. Nobody flies, and everybody sleeps.': "La niebla cubre el aeródromo tres días. Nadie vuela y todos duermen.",
    'Sleep': "Dormir",
    'Three quiet days.': "Tres días tranquilos.",
    'Dance in the hangar': "Baile en el hangar",
    'A band from the States plays in the big hangar tonight.': "Esta noche toca en el hangar grande una orquesta llegada de Estados Unidos.",
    'Go dancing': "Ir a bailar",
    'The crew dances until the band packs up.': "La tripulación baila hasta que la orquesta recoge.",
    'Green replacements': "Reemplazos novatos",
    'The new men have never fired at a moving target. You could take them up for gunnery practice over the Wash.': "Los nuevos nunca han disparado a un blanco en movimiento. Podrías llevarlos a practicar tiro sobre el Wash.",
    'Fly a practice flight': "Hacer un vuelo de práctica",
    'The new men can lead a target now.': "Los nuevos ya saben apuntar por delante del blanco.",
    'Let them rest': "Dejarlos descansar",
    'They will learn over Germany.': "Aprenderán sobre Alemania.",
    'The general visits': "Visita del general",
    'A general is visiting the group. The {ship} must shine.': "Un general visita el grupo. El {ship} tiene que brillar.",
    'Polish her': "Sacarle brillo",
    'The general shakes every hand. The crew stands a little taller.': "El general estrecha todas las manos. La tripulación se mantiene un poco más erguida.",
    'Hide in the hangar': "Esconderse en el hangar",
    'Nobody notices you were missing.': "Nadie nota vuestra ausencia.",
    'Letters home': "Cartas a casa",
    'The skipper sits up late writing to the families of the men the crew has lost.': "El comandante se queda despierto hasta tarde escribiendo a las familias de los hombres que ha perdido la tripulación.",
    'Help him write': "Ayudarle a escribir",
    'It is the hardest thing the crew has done. They will fly the next one for them.': "Es lo más duro que ha hecho la tripulación. La próxima la volarán por ellos.",
    "Armorers' work": "Trabajo de los armeros",
    'The armorers have new barrels and fresh belts for every gun aboard the {ship}.': "Los armeros tienen cañones nuevos y cintas frescas para cada ametralladora del {ship}.",
    'Test fire over the sea': "Tiro de prueba sobre el mar",
    'Every gun runs clean.': "Todas las ametralladoras funcionan perfectamente.",
    // titles of the field orders
    'First Light over Emden': "Primera luz sobre Emden", 'The Dutch Airfields': "Los aeródromos holandeses", 'Frankfurt Morning': "Mañana en Fráncfort",
    'Saar Rail Yards': "Las vías del Sarre", 'Bremen Docks': "Los muelles de Bremen", 'The Baltic Run': "La ruta del Báltico", 'Sunday at Münster': "Domingo en Münster",
    'Black Thursday': "Jueves Negro", 'Through the Undercast': "A través de las nubes", 'Münster Again': "Otra vez Münster", 'Bremen in the Clouds': "Bremen entre nubes",
    'Paris Ball-Bearings': "Los rodamientos de París", 'Kiel with the Mustangs': "Kiel con los Mustang", 'Bremen Port Area': "El puerto de Bremen", 'Christmas Week': "Semana de Navidad",
    'Flak Alley': "El callejón de la flak", 'Frankfurt by Radar': "Fráncfort por radar", 'Frankfurt Rail Yards': "Las vías de Fráncfort", 'Big Week: Leipzig': "Big Week: Leipzig",
    'Big Week: Brunswick': "Big Week: Brunswick", 'Schweinfurt Again': "Otra vez Schweinfurt", 'Big B': "Big B", 'Erkner': "Erkner",
    'Berlin by Daylight': "Berlín a plena luz",
  },
  patterns: [
    [new RegExp(`^(${whatRx}), (.+)$`), (m, tr) => `${tr(m[1])}, ${tr(m[2])}`],
    [/^Mission (\d+) of your tour\. The group is going to (.+) today, and the target is the (.+)\.$/, (m, tr) => `Misión ${m[1]} de tu turno. Hoy el grupo va a ${tr(m[2])}, y el objetivo es: ${tr(m[3])}.`],
    [/^The target is the (.+) at (.+), a long way south\. The Luftwaffe knows the bombers are coming, and a battle group will meet us over the target\.$/,
      (m, tr) => `Objetivo: ${tr(m[1])} en ${tr(m[2])}, muy al sur. La Luftwaffe sabe que vienen los bombarderos, y un grupo de combate nos esperará sobre el objetivo.`],
    [/^The (.+) carries (\d+) repair patches from earlier missions\.$/, (m) => `El ${m[1]} lleva ${m[2]} parches de misiones anteriores.`],
    [/^The (.+) is fresh from the depot\. Treat her well\.$/, (m) => `El ${m[1]} acaba de salir del depósito. Cuidadlo bien.`],
    [/^Number (\d) engine is running rough\. The crew chief says she will hold\.$/, (m) => `El motor número ${m[1]} funciona irregular. El jefe de mecánicos dice que aguantará.`],
    [/^(.+) is in hospital\. A spare man from the pool flies in his place\.$/, (m, tr) => `${name(m[1], tr)} está en el hospital. Un reserva vuela en su lugar.`],
    [/^(\d+) new men are flying with the crew\. Keep an eye on them\.$/, (m) => `${m[1]} hombres nuevos vuelan con la tripulación. Vigiladlos.`],
    [/^You are on the (.+) today\. Use every position, one through five\.$/, (m, tr) => `Tu puesto hoy: ${tr(m[1])}. Usa todas las posiciones, de la uno a la cinco.`],
    [/^Bombs on the (.+) at (.+)\. Mission (\d+) is in the books\.$/, (m, tr) => `Bombas sobre ${tr(m[1])} en ${tr(m[2])}. La misión ${m[3]} queda anotada.`],
    [/^(Sgt\.|S\/Sgt\.|T\/Sgt\.|Lt\.|Capt\.|Maj\.) ([A-Z][A-Za-z']+)$/, (m, tr) => `${RANK[m[1]]} ${tr(m[2])}`],
    // recorded interphone lines (tools/voice/lines.json, group "Phase 11 the tour")
    [/^Pilot to crew: that's number ([a-z-]+) in the books\.$/, (m) => `Piloto a tripulación: la número ${NUM_WORDS.indexOf(m[1]) + 1}, anotada.`],
  ],
};
table.phrases["Halfway, boys. Twelve down and thirteen to go."] = "A mitad de camino, chicos. Doce hechas y trece por delante.";
table.phrases["One more, crew. One more and we all go home."] = "Una más, tripulación. Una más y nos vamos todos a casa.";
table.phrases["That's twenty-five. Crew, we're going home."] = "Ya van veinticinco. Tripulación, nos vamos a casa.";
table.phrases["They won't count that one. We go again."] = "Esa no la van a contar. Volvemos a salir.";
table.phrases["We lost the ship. They'll find us another one."] = "Hemos perdido el avión. Ya nos encontrarán otro.";
table.phrases['Mail call! Letters from home for everybody.'] = "¡Correo! Cartas de casa para todos.";
table.phrases['A week at the flak house. Real beds and real eggs.'] = "Una semana en la casa de reposo. Camas de verdad y huevos de verdad.";
table.phrases['Maximum effort tomorrow. Get some sleep.'] = "Mañana, esfuerzo máximo. Dormid un poco.";
table.phrases["Fog on the field. Nobody's flying today."] = "Niebla en el aeródromo. Hoy no vuela nadie.";

export default table;
