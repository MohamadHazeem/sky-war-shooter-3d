// Spanish for ar/pilot.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const KIND: Record<string, string> = { INTERCEPT: 'INTERCEPCIÓN', SWEEP: 'BARRIDO', STRAGGLER: 'REZAGADO' };
const SIDE: Record<string, string> = { left: 'a la izquierda', right: 'a la derecha' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (INTERCEPT|SWEEP|STRAGGLER) — (.+)$/, (m, tr) => `Ronda ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])}`],
  [/^ROUND (\d+) · (INTERCEPT|SWEEP|STRAGGLER)$/, (m) => `RONDA ${m[1]} · ${KIND[m[2]]}`],
  [/^cover "(.+)" \((\d+)%\) · (\d+)s$/, 'cubre a "$1" ($2 %) · $3 s'],
  [/^cover "(.+)" \((\d+)%\) · clear her six$/, 'cubre a "$1" ($2 %) · límpiale la cola'],
  [/^(\d+) bandits?, (\d+) on the bombers$/, (m) => `${m[1]} ${+m[1] === 1 ? 'bandido' : 'bandidos'}, ${m[2]} sobre los bombarderos`],
  [/^(\d+) bandits?$/, (m) => `${m[1]} ${+m[1] === 1 ? 'bandido' : 'bandidos'}`],
  [/^(\d+) bombers protected — \+(\d+)$/, (m) => `${m[1]} ${+m[1] === 1 ? 'bombardero protegido' : 'bombarderos protegidos'} — +${m[2]}`],
  [/^Straggler defended — \+(\d+)$/, 'Rezagado defendido — +$1'],
  [/^Bomber saved — \+(\d+)$/, 'Bombardero salvado — +$1'],
  [/^Intercepted — \+(\d+)$/, 'Interceptado — +$1'],
  [/^Straggler "(.+)" lost$/, 'Rezagado "$1" perdido'],
  [/^Cover "(.+)" — she's falling out of formation$/, 'Cubre a "$1" — se está saliendo de la formación'],
  [/^"(.+)" is heading home · \+(\d+)$/, '"$1" vuelve a casa · +$2'],
  [/^Careful, Blue two — that (.+) has a rear gunner\. Come at him from below!$/, (m, tr) => `¡Cuidado, Azul dos — ese ${tr(m[1])} lleva ametrallador de cola. Atácalo desde abajo!`],
  [/^He's seen you — he's breaking (left|right)! Stay with him!$/, (m) => `¡Te ha visto — rompe ${SIDE[m[1]]}! ¡No lo sueltes!`],
  [/^The (.+) is diving away — let him go or run him down!$/, (m, tr) => `¡El ${tr(m[1])} se escapa en picado — déjalo ir o dale caza!`],
  [/^Little friends, this is (.+)\. We've lost two engines and can't keep up — can you cover us\?$/, 'Amiguitos, aquí "$1". Hemos perdido dos motores y no podemos seguir — ¿podéis cubrirnos?'],
];

const table: PhraseTable = {
  phrases: {
    // m4 / m7 briefings and objectives
    'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. First the Focke-Wulfs and Zerstörers will go for the bombers — intercept them before they reach the box. Then expect a fighter sweep of 109s hunting the escort, flying in pairs: watch for the wingman. And if a Fortress falls out of formation, the wolves will go for her. Do not let them.':
      'Pilotas un P-51D Mustang como escolta cercana de un box de doce Fortalezas. Primero, los Focke-Wulf y los Zerstörer irán a por los bombarderos — intercéptalos antes de que lleguen al box. Después espera un barrido de 109 que cazan a la escolta en parejas: vigila al punto. Y si una Fortaleza se sale de la formación, los lobos irán a por ella. No lo permitas.',
    'Mouse aim flies the aircraft toward where you look. W and S for throttle, V for cockpit or chase view, T padlocks the nearest bandit. Your six fifties are harmonised at two hundred and fifty metres — get in close.':
      'Con la puntería por ratón, el avión vuela hacia donde miras. W y S para el gas, V para vista de cabina o de persecución, T fija la vista en el bandido más cercano. Tus seis calibre .50 están armonizadas a doscientos cincuenta metros — acércate.',
    'Intercept the attackers before they reach the bombers': 'Intercepta a los atacantes antes de que lleguen a los bombarderos',
    'Win the dogfight against the fighter sweep': 'Gana el combate aéreo contra el barrido de cazas',
    'Save the straggler': 'Salva al rezagado',
    'You lead the escort for our box. Rocket-armed Zerstörers will try to break up the formation, then the 109s and the new jets will come for the escort. The Me 262 is faster than anything we have — do not chase it, turn inside it and catch it when it comes back round. Bf 110s carry a rear gunner: come at them from below.':
      'Diriges la escolta de nuestro box. Los Zerstörer armados con cohetes intentarán romper la formación; luego los 109 y los nuevos reactores vendrán a por la escolta. El Me 262 es más rápido que cualquier cosa que tengamos — no lo persigas, gira por dentro y atrápalo cuando vuelva. Los Bf 110 llevan ametrallador de cola: atácalos desde abajo.',
    'Over the target a crippled Fortress will need you. Pick your targets, protect the bombers, and keep your speed up.':
      'Sobre el objetivo, una Fortaleza tocada te necesitará. Elige tus blancos, protege a los bombarderos y mantén la velocidad.',
    'Break up the Zerstörer attacks': 'Desbarata los ataques de los Zerstörer',
    'Survive the sweep of 109s and jets': 'Sobrevive al barrido de 109 y reactores',
    'Save the straggler over Berlin': 'Salva al rezagado sobre Berlín',

    // PilotRounds titles and objectives
    'Intercept — head them off before they reach the box': 'Intercepción — córtales el paso antes del box',
    'Fighter sweep — the 109s are hunting the escort': 'Barrido de cazas — los 109 cazan a la escolta',
    'Save the straggler — a Fortress is falling out': 'Salva al rezagado — una Fortaleza se descuelga',
    'Intercept — break up the Zerstörer attack': 'Intercepción — desbarata el ataque de los Zerstörer',
    'Fighter sweep — 109s and jets over Berlin': 'Barrido de cazas — 109 y reactores sobre Berlín',
    'Save the straggler — a crippled Fortress over Berlin': 'Salva al rezagado — una Fortaleza tocada sobre Berlín',
    'Dogfight the sweep — keep them off the bombers': 'Combate el barrido — aléjalos de los bombarderos',
    'Cover the straggler': 'Cubre al rezagado',
    'Break up the attacks before they reach the bombers': 'Desbarata los ataques antes de que lleguen a los bombarderos',
    'Win the dogfight — keep them off the bombers': 'Gana el combate — aléjalos de los bombarderos',
    'more bandits inbound': 'más bandidos en camino',
    'sky clear': 'cielo despejado',
    'STRAGGLER': 'REZAGADO',
    'STRAGGLER SAVED': 'REZAGADO SALVADO',

    // pilot radio
    "He's reversing — scissors! Throttle back, make him fly out in front!": '¡Está invirtiendo — tijera! ¡Quita gas, haz que se te pase por delante!',
    "Jet's running — don't chase him, catch him when he turns back!": '¡El reactor huye — no lo persigas, atrápalo cuando dé la vuelta!',
    "Head-on! Hold your fire till he's close, then break high!": '¡De frente! ¡Aguanta el fuego hasta tenerlo cerca y rompe hacia arriba!',
    'Watch it, Blue two — his wingman is sliding in behind you!': '¡Ojo, Azul dos — su punto se te mete detrás!',
    "He's spiralling down — don't follow him into the deck!": '¡Baja en espiral — no lo sigas hasta el suelo!',
    "Focke-Wulf's zooming up for another pass. Keep your speed!": 'El Focke-Wulf sube para otra pasada. ¡Mantén la velocidad!',
    'Thanks, little friend — he was all over us!': '¡Gracias, amiguito — lo teníamos encima!',
    "We owe you one, little friend. We're going to make it!": 'Te debemos una, amiguito. ¡Lo vamos a conseguir!',
    'Bandits twelve o\'clock low, climbing for the bombers. Get between them and the big friends!': 'Bandidos a las doce bajo, suben hacia los bombarderos. ¡Ponte entre ellos y los amigos grandes!',
    "Little friends, twin-engine bandits closing at our six — they've got rockets!": 'Amiguitos, bimotores enemigos acercándose por las seis — ¡llevan cohetes!',
    "Another gaggle, nine o'clock level. Some of them are coming for us!": 'Otra bandada, a las nueve a nuestra altura. ¡Algunos vienen a por nosotros!',
    'Heads up — 109s high at six, coming down on us! Break and engage!': '¡Atención — 109 altos a las seis, se nos echan encima! ¡Rompe y combate!',
    "Bandits on the bombers, twelve o'clock! Little friends, where are you?": '¡Bandidos sobre los bombarderos, a las doce! Amiguitos, ¿dónde estáis?',
    "Focke-Wulfs diving out of the sun — don't try to out-climb them!": '¡Focke-Wulf en picado desde el sol — no intentes superarlos en ascenso!',
    'Bandits going for the cripple! Blue two, get back there and cover her!': '¡Los bandidos van a por el tocado! ¡Azul dos, vuelve y cúbrela!',
    "More of them coming in on our tail — we can't take another pass!": '¡Vienen más por nuestra cola — no aguantaremos otra pasada!',
    "One last pass at the box, twelve o'clock. Let's finish this!": 'Una última pasada sobre el box, a las doce. ¡Acabemos con esto!',
    "Big gaggle at twelve o'clock — drop tanks and go! Hit them before they reach the box!": '¡Gran bandada a las doce — suelta los depósitos y adelante! ¡Golpéalos antes de que lleguen al box!',
    "Zerstörers at six o'clock, with rockets! Get them off us!": '¡Zerstörer a las seis, con cohetes! ¡Quitádnoslos de encima!',
    "Jets! Twelve o'clock high, fast movers — go for them when they slow down!": '¡Reactores! A las doce alto, muy rápidos — ¡atacadlos cuando frenen!',
    "Messerschmitts, high at five o'clock! Here they come — break!": '¡Messerschmitt, altos a las cinco! ¡Ahí vienen — romped!',
    "Jets coming through! You won't out-run them — turn inside them!": '¡Pasan reactores! No los dejarás atrás — ¡gira por dentro!',
    "Fighters on the bombers, twelve o'clock level!": '¡Cazas sobre los bombarderos, a las doce a nuestra altura!',
    "They're sending another Gruppe down on us. Stay together!": 'Nos lanzan otro Gruppe encima. ¡Manteneos juntos!',
    "They're on the straggler! Blue two, cover her, I'll take the box!": '¡Están sobre el rezagado! ¡Azul dos, cúbrela, yo me encargo del box!',
    'Jet coming up our tail! Somebody get him off us!': '¡Un reactor sube por nuestra cola! ¡Que alguien nos lo quite de encima!',
    "Last push — they're throwing everything at the box!": '¡Último empujón — lanzan todo contra el box!',

    // field dressing, special events, pacing
    "Hold still — I've patched you up. Back on that gun.": 'Quieto — ya te he vendado. Vuelve a esa ametralladora.',
    "The yellow noses are breaking off — they've lost their leader!": '¡Los morros amarillos se retiran — han perdido a su jefe!',
    "Rocket barrage! Heavies standing off at a kilometre — they'll keep lobbing rockets into the box until we knock them down!": '¡Andanada de cohetes! Pesados a un kilómetro — ¡seguirán lanzando cohetes al box hasta que los derribemos!',
    "Launchers are down! That's the end of the rockets.": '¡Los lanzacohetes han caído! Se acabaron los cohetes.',
    "They're out of rockets — the heavies are heading home.": 'Se han quedado sin cohetes — los pesados vuelven a casa.',
    "That's the last of the destroyers! Nice work, boys.": '¡Ese era el último Zerstörer! Buen trabajo, chicos.',
    "That one's an ace — kill markings all down the tail. Watch him!": 'Ese es un as — marcas de derribos por toda la cola. ¡Vigiladlo!',
    "That's the lot of them! They're breaking off!": '¡Eran todos! ¡Se retiran!',
    // share / privacy (Share.ts, Analytics.ts)
    'Share screenshot': 'Compartir captura',
    'Share result': 'Compartir resultado',
    'Could not capture the screen': 'No se pudo capturar la pantalla',
    'Screenshot saved · share text and link copied': 'Captura guardada · texto y enlace copiados',
    'Screenshot saved': 'Captura guardada',
    'Result and link copied — paste it anywhere': 'Resultado y enlace copiados — pégalos donde quieras',
    'PRIVACY': 'PRIVACIDAD',
    'Share anonymous gameplay stats': 'Compartir estadísticas de juego anónimas',
    'Your browser asks sites not to track you (Do Not Track), so no stats are sent.': 'Tu navegador pide a los sitios que no te rastreen (Do Not Track), así que no se envían estadísticas.',
    'One anonymous summary per mission (mission, result, kills, accuracy, gun positions used, settings, screen size and frame rate) helps balance the game. No name, account or personal data is sent.': 'Un resumen anónimo por misión (misión, resultado, derribos, precisión, puestos de tiro usados, ajustes, tamaño de pantalla y fotogramas por segundo) ayuda a equilibrar el juego. No se envía ningún nombre, cuenta ni dato personal.',
  },
  patterns,
};
export default table;
