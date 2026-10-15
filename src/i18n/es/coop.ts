import type { PhraseTable, Pattern } from '../types';

// Spanish for ar/coop.ts (same keys and patterns).

const patterns: Pattern[] = [
  [/^Joining ([A-Z0-9]+)…$/, 'Uniéndote a $1…'],
  [/^Mission over — (.+)$/, (m, tr) => `Misión terminada — ${tr(m[1])}`],
  [/^PARTNER is on the (.+)$/, (m, tr) => `Tu COMPAÑERO está en ${tr(m[1])}`],
  [/^(.+) — partner$/, (m, tr) => `${tr(m[1])} — compañero`],
];

const table: PhraseTable = {
  phrases: {
    'Up to four gunners crew one B-17, or two pilots fly Mustangs. Share one room code.': 'Hasta cuatro artilleros en un B-17, o dos pilotos en Mustang. Compartid un código de sala.',
    'Crew connected — pick a seat and ready up': 'Tripulación conectada — elige un puesto y confirma',
    'Crew member left — AI has the gun': 'Un tripulante se ha ido — la IA toma el arma',
    'Crew full or unavailable. Try again shortly.': 'Tripulación completa o no disponible. Inténtalo en un momento.',
    'That crew slot is occupied.': 'Ese puesto está ocupado.',
    'That gun is crewed': 'Esa arma está ocupada',
    'Open crew slot · AI covering': 'Puesto libre · lo cubre la IA',
    'Ready': 'Listo',
    'Not ready': 'No listo',
    'Ping target': 'Marcar objetivo',

    'Blue One': 'Azul Uno',
    'Leave co-op': 'Salir del cooperativo',
    'B-17 crew or P-51 escort · online': 'Tripulación de B-17 o escolta P-51 · en línea',
    'Crew a B-17 or fly two Mustangs. The host picks the mission; your partner joins with a code.': 'Tripulad un B-17 o volad dos Mustang. El anfitrión elige la misión; tu compañero se une con un código.',
    'Co-op mode': 'Modo cooperativo',
    'B-17 crew (gunners)': 'Tripulación de B-17 (artilleros)',
    'P-51 escort (pilots)': 'Escolta P-51 (pilotos)',
    'Custom Battle — saved escort settings': 'Batalla personalizada — ajustes de escolta guardados',
    'Partner connected — ready to fly': 'Compañero conectado — listos para volar',
    'Co-op Survival — Pilots': 'Supervivencia cooperativa — Pilotos',
    'Pause is disabled in co-op': 'La pausa está desactivada en cooperativo',
    'You are down — spectating your partner until the next round': 'Te han derribado — observas a tu compañero hasta la próxima ronda',
    'Form up on your partner': 'Forma con tu compañero',
    '{name} destroyed {target}': '{name} destruyó {target}',
    'm': 'm',

    'Your callsign': 'Tu indicativo',
    'Crew score': 'Puntuación de la tripulación',
    'CREW LEADERBOARD': 'CLASIFICACIÓN DE TRIPULACIONES',
    'Return to co-op lobby': 'Volver a la sala cooperativa',
    'Waiting for your partner to return…': 'Esperando a que vuelva tu compañero…',
    'Shared crew score and personal rewards. Relay support is used when available.': 'Puntuación de tripulación compartida y recompensas personales. Se usa un relé cuando está disponible.',
    'Could not connect to the host. Try another network or try again.': 'No se pudo conectar con el anfitrión. Prueba otra red o inténtalo de nuevo.',
    '{name} (partner) destroyed {target}': '{name} (compañero) destruyó {target}',

    'Co-op (beta)': 'Cooperativo (beta)',
    'two gunners, one B-17 · online': 'dos artilleros, un B-17 · en línea',
    'ONLINE · PEER TO PEER': 'EN LÍNEA · ENTRE PARES',
    'Two gunners crew the same Fortress in Survival. One player hosts and runs the battle; the other joins with a code.':
      'Dos artilleros tripulan la misma Fortaleza en Supervivencia. Un jugador hace de anfitrión y dirige la batalla; el otro se une con un código.',
    'Host a game': 'Crear partida',
    'Join a game': 'Unirse a una partida',
    'CODE': 'CÓDIGO',
    'Join code': 'Código de partida',
    'Join': 'Unirse',
    'Prototype. Peer-to-peer with no relay server, so some networks (strict firewalls, some corporate, campus and mobile networks) cannot connect.':
      'Prototipo. Conexión entre pares sin servidor relé, así que algunas redes (cortafuegos estrictos, algunas redes corporativas, universitarias y móviles) no pueden conectarse.',

    'CO-OP (BETA)': 'COOPERATIVO (BETA)',
    'Stand by': 'Espera',
    'Cancel': 'Cancelar',
    'CO-OP (BETA) · SURVIVAL · B-17 GUNNERS': 'COOPERATIVO (BETA) · SUPERVIVENCIA · ARTILLEROS B-17',
    'Join code — give it to your partner': 'Código de partida — dáselo a tu compañero',
    'Joined game': 'Te has unido a la partida',
    'Your gun position': 'Tu puesto de tiro',
    'Start mission': 'Iniciar misión',
    'Leave': 'Salir',
    'You run the battle: if your partner drops out you carry on alone.': 'Tú diriges la batalla: si tu compañero se desconecta, sigues solo.',
    'The host starts the mission. If the host leaves, the game ends.': 'El anfitrión inicia la misión. Si se va, la partida termina.',
    'PARTNER': 'COMPAÑERO',
    'partner': 'compañero',

    'Connection: waiting for a reply': 'Conexión: esperando respuesta',
    'Connection: {ms} ms round trip': 'Conexión: {ms} ms de ida y vuelta',

    'Creating a game…': 'Creando partida…',
    'Waiting for your partner to join…': 'Esperando a que se una tu compañero…',
    'Could not create a game. Check your connection and try again.': 'No se pudo crear la partida. Revisa tu conexión e inténtalo de nuevo.',
    'A join code is 6 letters and digits.': 'Un código de partida tiene 6 letras y dígitos.',
    'Connecting to the host…': 'Conectando con el anfitrión…',
    'Could not connect to the host. Your networks may not allow a direct connection (there is no relay server).':
      'No se pudo conectar con el anfitrión. Puede que vuestras redes no permitan una conexión directa (no hay servidor relé).',
    'Could not reach the game server. Check your connection.': 'No se pudo contactar con el servidor del juego. Revisa tu conexión.',
    'That room has expired or does not exist.': 'Esa sala ha caducado o no existe.',
    'No game with that code. Check it and try again.': 'No hay ninguna partida con ese código. Revísalo e inténtalo de nuevo.',
    'That game already has two gunners.': 'Esa partida ya tiene dos artilleros.',
    'Could not join that game (it may have just been taken or expired).': 'No se pudo unir a esa partida (puede que acaben de ocuparla o haya caducado).',
    'Partner connected — pick your guns and start': 'Compañero conectado — elegid vuestras armas y empezad',
    'Connected — waiting for the host to start': 'Conectado — esperando a que empiece el anfitrión',

    'Your partner left — carrying on alone': 'Tu compañero se ha ido — sigues solo',
    'Lost your partner — carrying on alone': 'Has perdido a tu compañero — sigues solo',
    'Partner disconnected': 'Compañero desconectado',
    'Your partner left.': 'Tu compañero se ha ido.',
    'The connection to your partner was lost.': 'Se perdió la conexión con tu compañero.',
    'The host left the game. Co-op session ended.': 'El anfitrión abandonó la partida. Sesión cooperativa terminada.',
    'Lost the connection to the host. Co-op session ended.': 'Se perdió la conexión con el anfitrión. Sesión cooperativa terminada.',

    'Your partner took that gun': 'Tu compañero ha tomado esa arma',
    'Waiting for the host…': 'Esperando al anfitrión…',
    'The mission is over.': 'La misión ha terminado.',
    'MISSION OVER': 'MISIÓN TERMINADA',
    'The Fortress is lost': 'La Fortaleza se ha perdido',
    'Co-op Survival — Gunners': 'Supervivencia cooperativa — Artilleros',
  },
  patterns,
};
export default table;
