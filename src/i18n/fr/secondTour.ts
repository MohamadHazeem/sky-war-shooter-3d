// French for ar/secondTour.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = {
  phrases: {
    'NORTH SEA & NORTHWEST EUROPE · 1944–45': 'MER DU NORD ET EUROPE DU NORD-OUEST · 1944–45',
    'Extended operation {n}': 'Opération prolongée {n}',
    '{n} operations completed': 'Opérations accomplies : {n}',
    'Frankfurt': 'Francfort',
    'Berlin': 'Berlin',
    'Bremen': 'Brême',
    'Volunteer for a second tour': 'Se porter volontaire pour un second tour',
    'Second tour': 'Second tour',
    'Second Tour Medal': 'Médaille du second tour',
    'Complete twenty-five second-tour operations.': 'Accomplissez vingt-cinq opérations du second tour.',
    'Extended service': 'Service prolongé',
    'Tour score: {n}': 'Score du tour : {n}',
    'Cities': 'Villes',
    'Industrial district': 'Quartier industriel',
    'industrial district': 'le quartier industriel',
    'Bomb the industrial district': 'Bombardez le quartier industriel',
    'Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Vingt-cinq victoires valent la Médaille du second tour ; les opérations continuent ensuite.',
    'Each successful operation changes enemy strength, replacements and morale. Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Chaque opération réussie modifie la force ennemie, ses renforts et son moral. Vingt-cinq victoires valent la Médaille du second tour ; les opérations continuent ensuite.',
    'Armoured Sturmböcke are joining the defence. Expect close attacks from astern.': 'Des Sturmböcke blindés rejoignent la défense. Attendez-vous à des attaques rapprochées par l’arrière.',
    'Me 262 jets are operational; later sorties also face Me 163 rocket fighters.': 'Les Me 262 à réaction sont opérationnels ; les sorties suivantes affrontent aussi les Me 163 à fusée.',
    'A battle group guards this target. Destroy it in the final round.': 'Un groupement de combat garde cet objectif. Détruisez-le lors de la dernière manche.',
    'Extended service: a fictional continuation of the air war through late 1945.': 'Service prolongé : une suite fictive de la guerre aérienne jusqu’à fin 1945.',
  },
  patterns: [
    [/^Second tour — (.+) — (.+)$/, (m, tr) => `Second tour — ${tr(m[1])} — ${tr(m[2])}`],
    [/^Second tour operation (\d+): strike the (.+) at (.+)\.$/, (m, tr) => `Opération ${m[1]} du second tour : frappez ${tr(m[2])} à ${tr(m[3])}.`],
    [/^Industrial district, (.+)$/, (m, tr) => `Quartier industriel, ${tr(m[1])}`],
    [/^The industrial district at (.+) has been hit\.$/, (m, tr) => `Le quartier industriel de ${tr(m[1])} a été touché.`],
  ],
};
export default table;
