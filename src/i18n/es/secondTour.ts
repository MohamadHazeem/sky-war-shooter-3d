// Spanish for ar/secondTour.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = {
  phrases: {
    'NORTH SEA & NORTHWEST EUROPE · 1944–45': 'MAR DEL NORTE Y NOROESTE DE EUROPA · 1944–45',
    'Extended operation {n}': 'Operación ampliada {n}',
    '{n} operations completed': 'Operaciones completadas: {n}',
    'Frankfurt': 'Fráncfort',
    'Berlin': 'Berlín',
    'Bremen': 'Bremen',
    'Volunteer for a second tour': 'Presentarse voluntario a un segundo turno',
    'Second tour': 'Segundo turno',
    'Second Tour Medal': 'Medalla del segundo turno',
    'Complete twenty-five second-tour operations.': 'Completa veinticinco operaciones del segundo turno.',
    'Extended service': 'Servicio ampliado',
    'Tour score: {n}': 'Puntuación del turno: {n}',
    'Cities': 'Ciudades',
    'Industrial district': 'Distrito industrial',
    'industrial district': 'el distrito industrial',
    'Bomb the industrial district': 'Bombardea el distrito industrial',
    'Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Veinticinco victorias otorgan la Medalla del segundo turno; después las operaciones continúan.',
    'Each successful operation changes enemy strength, replacements and morale. Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Cada operación con éxito cambia la fuerza enemiga, sus reemplazos y su moral. Veinticinco victorias otorgan la Medalla del segundo turno; después las operaciones continúan.',
    'Armoured Sturmböcke are joining the defence. Expect close attacks from astern.': 'Sturmböcke blindados se unen a la defensa. Espera ataques cercanos por la cola.',
    'Me 262 jets are operational; later sorties also face Me 163 rocket fighters.': 'Los reactores Me 262 ya operan; las salidas posteriores también se enfrentan a cazas cohete Me 163.',
    'A battle group guards this target. Destroy it in the final round.': 'Un grupo de combate protege este objetivo. Destrúyelo en la última ronda.',
    'Extended service: a fictional continuation of the air war through late 1945.': 'Servicio ampliado: una continuación ficticia de la guerra aérea hasta finales de 1945.',
  },
  patterns: [
    [/^Second tour — (.+) — (.+)$/, (m, tr) => `Segundo turno — ${tr(m[1])} — ${tr(m[2])}`],
    [/^Second tour operation (\d+): strike the (.+) at (.+)\.$/, (m, tr) => `Operación ${m[1]} del segundo turno: ataca ${tr(m[2])} en ${tr(m[3])}.`],
    [/^Industrial district, (.+)$/, (m, tr) => `Distrito industrial, ${tr(m[1])}`],
    [/^The industrial district at (.+) has been hit\.$/, (m, tr) => `El distrito industrial de ${tr(m[1])} ha sido alcanzado.`],
  ],
};
export default table;
