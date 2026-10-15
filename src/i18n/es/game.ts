// Spanish for ar/game.ts (same keys and patterns).
import type { PhraseTable } from '../types';

const STATION: Record<string, string> = {
  'Left Waist': 'Lateral izquierda',
  'Right Waist': 'Lateral derecha',
  'Top Turret': 'Torreta superior',
  'Ball Turret': 'Torreta ventral',
  'Tail Gun': 'Ametralladora de cola',
};
const STATION_UP: Record<string, string> = Object.fromEntries(Object.entries(STATION).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()]));
const ST = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';

const MONTHS: Record<string, string> = {
  JANUARY: 'ENERO', FEBRUARY: 'FEBRERO', MARCH: 'MARZO', APRIL: 'ABRIL', MAY: 'MAYO', JUNE: 'JUNIO',
  JULY: 'JULIO', AUGUST: 'AGOSTO', SEPTEMBER: 'SEPTIEMBRE', OCTOBER: 'OCTUBRE', NOVEMBER: 'NOVIEMBRE', DECEMBER: 'DICIEMBRE',
};

const pl = (s: string, one: string, many: string) => (+s === 1 ? `${s} ${one}` : `${s} ${many}`);
const round = (a: string, b?: string) => (b ? `Ronda ${a}/${b}` : `Ronda ${a}`);

// Text shown in capitals: tr() handles capitalised text; only dates need the fallback
function upper(s: string, tr: (s: string) => string): string {
  const d = tr(s);
  if (d !== s) return d;
  const date = s.match(/^(\d{1,2}) ([A-Z]+) (\d{4})$/);
  if (date && MONTHS[date[2]]) return `${date[1]} DE ${MONTHS[date[2]]} DE ${date[3]}`;
  return s;
}

const MODE: Record<string, string> = { 'MOUSE AIM': 'PUNTERÍA CON RATÓN', DIRECT: 'DIRECTO', COCKPIT: 'CABINA', CHASE: 'PERSECUCIÓN' };
const QUALITY: Record<string, string> = { low: 'baja', medium: 'media', high: 'alta' };

const table: PhraseTable = {
  phrases: {
    // ---- gun stations ----
    ...STATION,
    ...STATION_UP,

    // ---- crew panel ----
    'Pilot': 'Piloto',
    'Co-Pilot': 'Copiloto',
    'Navigator': 'Navegante',
    'Bombardier': 'Bombardero',
    'Engineer': 'Mecánico',
    'Radio': 'Radio',
    'Ball': 'Ventral',
    'Waist L': 'Lateral I',
    'Waist R': 'Lateral D',
    'Tail': 'Cola',
    'OK': 'OK',
    'WOUNDED': 'HERIDO',

    // ---- banners ----
    'FIVE CONFIRMED': 'CINCO CONFIRMADOS',
    'Ace in a day': 'As en un día',
    'They\'re sending everything they have': 'Nos están lanzando todo lo que tienen',
    'More fighters inbound': 'Más cazas en camino',
    'INCOMING': 'ATAQUE',
    'ALL GUNS SECURE': 'ARMAS ASEGURADAS',
    'MISSION FAILED': 'MISIÓN FALLIDA',
    'Mission complete': 'Misión cumplida',
    'Shot down': 'Derribado',
    'BAIL OUT! BAIL OUT!': '¡SALTAD! ¡SALTAD!',
    'Crew, abandon the aircraft': 'Tripulación, abandonad el avión',
    '5 kill streak · +50% score': 'Racha de 5 · +50 % de puntos',
    'ON FIRE': 'EN RACHA',
    'SOMEWHERE OVER THE REICH': 'EN ALGÚN LUGAR SOBRE EL REICH',
    'OVER THE RUHR, SPRING 1944': 'SOBRE EL RUHR, PRIMAVERA DE 1944',
    'THE CLOCK IS RUNNING': 'EL TIEMPO CORRE',
    'TRAINING FLIGHT · OVER THE WASH': 'VUELO DE INSTRUCCIÓN · SOBRE EL WASH',

    // ---- tips ----
    '<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire': '<kbd>Ratón</kbd>: apuntar el arma · <kbd>Mantén clic izquierdo</kbd>: disparar',
    'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom': 'Adelántate a los cazas — apunta adonde estarán · <kbd>Botón derecho</kbd> para ampliar',
    'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position': 'Las ráfagas cortas enfrían el cañón · <kbd>1–5</kbd> cambiar de puesto',
    '<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires': '<kbd>Mueve el ratón</kbd> para volar hacia donde miras · <kbd>Botón izquierdo</kbd> dispara',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle': 'Pon el visor K-14 delante del enemigo y dispara · <kbd>W/S</kbd> acelerador',
    'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view': 'Los Fw 190 irán a por ti — no dejes de virar · <kbd>V</kbd> vista de persecución',
    '<kbd>Drag</kbd> to swing the gun · <kbd>Hold FIRE</kbd> to shoot': '<kbd>Arrastra</kbd> para apuntar el arma · <kbd>Mantén FUEGO</kbd> para disparar',
    'Lead the fighters — aim where they will be · <kbd>ZOOM</kbd> for the ring sight': 'Adelántate a los cazas — apunta adonde estarán · <kbd>ZOOM</kbd> para el visor de anillo',
    'Short bursts keep the barrel cool · tap a gun position to change seats': 'Las ráfagas cortas enfrían el cañón · toca un puesto para cambiarte',
    '<kbd>Drag</kbd> on the left to fly · <kbd>FIRE</kbd> shoots': '<kbd>Arrastra</kbd> a la izquierda para volar · <kbd>FUEGO</kbd> dispara',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>THR</kbd> lever for power': 'Pon el visor K-14 delante del enemigo y dispara · palanca <kbd>ACEL</kbd> para la potencia',
    'Fw 190s will come for you — keep turning · <kbd>VIEW</kbd> chase view': 'Los Fw 190 irán a por ti — no dejes de virar · <kbd>VISTA</kbd> vista de persecución',
    'Guns topped up': 'Munición repuesta',
    'RELOADING — new ammunition box': 'RECARGANDO — nueva caja de munición',
    'BARREL OVERHEATED — let it cool': 'CAÑÓN RECALENTADO — deja que se enfríe',
    '<kbd>Space</kbd> skip': '<kbd>Espacio</kbd> saltar',

    // ---- kill feed ----
    'P-51 lost': 'P-51 perdido',
    'You are wounded': 'Estás herido',
    'Fire\'s out — took a heavy hit': 'Fuego apagado — impacto grave',
    'Streak cooled off': 'Racha terminada',

    // ---- field upgrades ----
    '6 KILLS · FIELD UPGRADE': '6 DERRIBOS · MEJORA DE CAMPAÑA',
    '5 KILLS · FIELD PROMOTION': '5 DERRIBOS · ASCENSO EN COMBATE',

    // ---- hangar / armory headers ----
    'ARMORY': 'ARSENAL',
    'B-17 gunner loadout (P-51 loadout: between rounds)': 'Equipo del ametrallador del B-17 (equipo del P-51: entre rondas)',
    'Back': 'Atrás',

    // ---- HUD objective line ----
    'Gunnery School — follow the instructions': 'Escuela de tiro — sigue las instrucciones',
    'Stand by — enemy fighters approaching': 'Atento — cazas enemigos acercándose',
    'Hold steady through the flak': 'Aguanta firme entre la antiaérea',
    'Scan the sky — more fighters expected': 'Vigila el cielo — se esperan más cazas',

    // ---- pilot HUD mode line ----
    'MOUSE AIM': 'PUNTERÍA CON RATÓN',
    'DIRECT': 'DIRECTO',
    'COCKPIT': 'CABINA',
    'CHASE': 'PERSECUCIÓN',
    'STALL': 'PÉRDIDA',

    // ---- gunner HUD station line ----
    'RELOADING': 'RECARGANDO',
    'BARREL HOT': 'CAÑÓN CALIENTE',

    // ---- debrief: end-of-mission reasons ----
    'Both pilots were hit and the Sky Queen fell out of control.': 'Ambos pilotos fueron alcanzados y el Sky Queen cayó sin control.',
    'The tail was shot away.': 'La cola fue arrancada a tiros.',
    'A wing was shot off.': 'Un ala fue arrancada a tiros.',
    'All four engines were knocked out.': 'Los cuatro motores quedaron fuera de servicio.',
    'The Sky Queen was shot down.': 'El Sky Queen fue derribado.',
    'Your Mustang flew into the ground.': 'Tu Mustang se estrelló contra el suelo.',
    'Your Mustang was shot down.': 'Tu Mustang fue derribado.',
    'You were seriously wounded and could no longer man your gun.': 'Quedaste gravemente herido y ya no podías manejar tu arma.',
    'The formation fought its way through. Good shooting, gunner.': 'La formación se abrió paso combatiendo. Buen tiro, ametrallador.',
    'The bombers made it through. Outstanding work, Blue Leader.': 'Los bombarderos lo lograron. Trabajo excelente, Blue Leader.',

    // ---- debrief: medals and tiles ----
    'Air Medal': 'Air Medal',
    'Ace in a Day': 'As en un día',
    'Distinguished Flying Cross': 'Distinguished Flying Cross',
    'Silver Star': 'Silver Star',
    'Purple Heart': 'Purple Heart',
    'Gun kills': 'Derribos con arma',
    'ONLINE LEADERBOARD': 'CLASIFICACIÓN EN LÍNEA',
    'You': 'Tú',

    // ---- loading screen ----
    'Starting the engines…': 'Arrancando los motores…',
    'Loading aircraft…': 'Cargando aviones…',
    'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.': 'Se necesita WebGL 2. Usa un navegador de escritorio reciente con la aceleración por hardware activada.',
    'Forming up over England…': 'Formando sobre Inglaterra…',
    'Ready': 'Listo',

    // ---- cinematics ----
    'KILL CAM': 'CÁMARA DE DERRIBO',
    '{what} · DESTROYED': '{what} · DESTRUIDO',
    'BANDIT': 'ENEMIGO',
    'CLICK TO SKIP': 'HAZ CLIC PARA SALTAR',
    'MISSION COMPLETE': 'MISIÓN CUMPLIDA',
    'Mission {n} · {title}': 'Misión {n} · {title}',
    '▶ Replay best moment': '▶ Repetir el mejor momento',
    'REPLAY': 'REPETICIÓN',
    'BEST MOMENT': 'MEJOR MOMENTO',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · F exit': 'MODO FOTO · WASD mover · ratón mirar · Q/E bajar/subir · Shift más rápido · rueda velocidad · F salir',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · Enter share · F exit': 'MODO FOTO · WASD mover · ratón mirar · Q/E bajar/subir · Shift más rápido · rueda velocidad · Enter compartir · F salir',

    // ---- kill juice and streak meter ----
    'DOUBLE KILL': 'DOBLE DERRIBO',
    'TRIPLE KILL': 'TRIPLE DERRIBO',
    'QUAD KILL': 'CUÁDRUPLE DERRIBO',
    'RAMPAGE': 'MASACRE',
    'ON FIRE ×{n}': 'EN RACHA ×{n}',
    'ON FIRE  ×{n}': 'EN RACHA  ×{n}',
    '{label} DOWN': '{label} DERRIBADO',
    'STREAK': 'RACHA',
    'ON YOU': 'A POR TI',
  },
  patterns: [
    // ---- banners ----
    [/^MISSION (\d+) · (.+)$/, (m, tr) => `MISIÓN ${m[1]} · ${upper(m[2], tr)}`],
    [/^(\d{1,2}) (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) (\d{4})$/, (m) => `${m[1]} DE ${MONTHS[m[2]]} DE ${m[3]}`],
    [/^DAILY RUN · (.+)$/, 'SALIDA DIARIA · $1'],
    [/^ROUND (\d+)$/, 'RONDA $1'],
    [/^Wave (\d+)$/, 'Oleada $1'],

    // ---- field upgrade labels ----
    [/^WAVE (\d+) CLEARED$/, 'OLEADA $1 REPELIDA'],
    [/^WAVE (\d+) SURVIVED$/, 'OLEADA $1 SUPERADA'],

    // ---- hangar between rounds ----
    [/^ROUND (\d+) CLEARED$/, 'RONDA $1 SUPERADA'],
    [/^(\d+) kills this round · \+(\d+) merit$/, (m) => `${pl(m[1], 'derribo', 'derribos')} en esta ronda · +${m[2]} de mérito`],
    [/^Round (\d+) of (\d+)$/, 'Ronda $1 de $2'],
    [/^Round (\d+)$/, 'Ronda $1'],

    // ---- HUD: mission line, formation, crew ----
    [/^(.+) · (\d+:\d{2})$/, (m, tr) => `${upper(m[1], tr)} · ${m[2]}`],
    [/^(\d+)\/(\d+) B-17s$/, '$1/$2 B-17'],
    [/^Gunner wounded \((\d+)\/4\)$/, 'Ametrallador herido ($1/4)'],

    // ---- HUD objective line ----
    [/^Round (\d+)(?:\/(\d+))? — (\d+:\d{2}) · (\d+) fighters$/, (m) => `${round(m[1], m[2])} — ${m[3]} · ${pl(m[4], 'caza', 'cazas')}`],
    [/^Round (\d+)(?:\/(\d+))? — clear the last (\d+) fighters?$/, (m) => `${round(m[1], m[2])} — ${+m[3] === 1 ? 'derriba el último caza' : `derriba los últimos ${m[3]} cazas`}`],
    [/^Round (\d+)(?:\/(\d+))? — (.+)$/, (m, tr) => `${round(m[1], m[2])} — ${tr(m[3])}`],
    [/^Round (\d+)\/(\d+)$/, 'Ronda $1/$2'],
    [/^Wave (\d+) — (\d+) fighters remaining$/, (m) => `Oleada ${m[1]} — ${+m[2] === 1 ? `queda ${m[2]} caza` : `quedan ${m[2]} cazas`}`],
    [/^Hold out — escort ETA (\d+)s$/, 'Aguantad — escolta en $1 s'],
    [/^(\d+) enemy fighters? attacking$/, (m) => (+m[1] === 1 ? `${m[1]} caza enemigo ataca` : `${m[1]} cazas enemigos atacan`)],

    // ---- pilot HUD mode line ----
    [/^(MOUSE AIM|DIRECT) · (COCKPIT|CHASE)( · STALL)?$/, (m) => `${MODE[m[1]]} · ${MODE[m[2]]}${m[3] ? ' · PÉRDIDA' : ''}`],

    // ---- gunner HUD ----
    [new RegExp(`^${ST} — (RELOADING|BARREL HOT)$`), (m) => `${STATION[m[1]]} — ${m[2] === 'RELOADING' ? 'RECARGANDO' : 'CAÑÓN CALIENTE'}`],
    [/^([1-5]) (LEFT WAIST|RIGHT WAIST|TOP TURRET|BALL TURRET|TAIL GUN)$/, (m) => `${m[1]} ${STATION_UP[m[2]]}`],
    [new RegExp(`^${ST} kills$`), (m) => `Derribos · ${STATION[m[1]]}`],

    // ---- tips ----
    [/^Fighters attacking the (.+) — press <kbd>(.+)<\/kbd>$/, (m, tr) => `Cazas atacando el puesto ${tr(m[1])} — pulsa <kbd>${m[2]}</kbd>`],
    [/^(\d+) fighters? in the (.+) arc — press <kbd>(.+)<\/kbd>$/, (m, tr) => `${pl(m[1], 'caza', 'cazas')} en el sector ${tr(m[2])} — pulsa <kbd>${m[3]}</kbd>`],
    [/^Graphics set to <kbd>(\w+)<\/kbd> to keep the frame rate up \(change in Settings\)$/, (m) => `Gráficos en <kbd>${QUALITY[m[1]] ?? m[1]}</kbd> para mantener la fluidez (cámbialo en Ajustes)`],

    // ---- kill feed ----
    [/^([^—]{1,40}?) destroyed — AI gunner, (.+)$/, (m, tr) => `${tr(m[1])} destruido — ametrallador IA, ${m[2]}`],
    [/^([^—]{1,40}?) destroyed — Escort P-51$/, (m, tr) => `${tr(m[1])} destruido — P-51 de escolta`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed — (.+)$/, (m, tr) => `${tr(m[1])} destruido — ${tr(m[2])}`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed$/, (m, tr) => `${tr(m[1])} destruido`],
    [/^Double — \+(\d+)$/, 'Doble — +$1'],
    [/^Triple — \+(\d+)$/, 'Triple — +$1'],
    [/^(\d+)× — \+(\d+)$/, '$1× — +$2'],
    [/^B-17 "(.+)" going down$/, 'El B-17 "$1" cae'],

    // ---- debrief reasons ----
    [/^(.+\.) The crew bailed out over enemy territory\.$/, (m, tr) => `${tr(m[1])} La tripulación saltó sobre territorio enemigo.`],
    [/^Both pilots were hit and the (.+) fell out of control\.$/, 'Ambos pilotos fueron alcanzados y el $1 cayó sin control.'],
    [/^The (.+) was shot down\.$/, 'El $1 fue derribado.'],
    [/^Too many bombers lost — (\d+) Fortresses went down\.$/, 'Demasiados bombarderos perdidos — cayeron $1 Fortalezas.'],

    // ---- loading ----
    [/^Loading aircraft and sounds… ([\d.]+) \/ ([\d.]+) MB$/, 'Cargando aviones y sonidos… $1 / $2 MB'],

    // ---- enemy marker label ----
    [/^(.+?) {2}(\d+)m$/, (m, tr) => `${tr(m[1])}  ${m[2]}m`],
  ],
};
export default table;
