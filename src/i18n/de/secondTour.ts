// German for ar/secondTour.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = {
  phrases: {
    'NORTH SEA & NORTHWEST EUROPE · 1944–45': 'NORDSEE & NORDWESTEUROPA · 1944–45',
    'Extended operation {n}': 'Verlängerter Einsatz {n}',
    '{n} operations completed': 'Abgeschlossene Einsätze: {n}',
    'Frankfurt': 'Frankfurt',
    'Berlin': 'Berlin',
    'Bremen': 'Bremen',
    'Volunteer for a second tour': 'Freiwillig für eine zweite Tour melden',
    'Second tour': 'Zweite Tour',
    'Second Tour Medal': 'Medaille der zweiten Tour',
    'Complete twenty-five second-tour operations.': 'Schließe fünfundzwanzig Einsätze der zweiten Tour ab.',
    'Extended service': 'Verlängerter Dienst',
    'Tour score: {n}': 'Tour-Punkte: {n}',
    'Cities': 'Städte',
    'Industrial district': 'Industrieviertel',
    'industrial district': 'das Industrieviertel',
    'Bomb the industrial district': 'Bombardiere das Industrieviertel',
    'Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Fünfundzwanzig Siege bringen die Medaille der zweiten Tour; danach gehen die Einsätze weiter.',
    'Each successful operation changes enemy strength, replacements and morale. Twenty-five victories earn the Second Tour Medal; operations continue afterwards.': 'Jeder erfolgreiche Einsatz verändert Feindstärke, Nachschub und Moral. Fünfundzwanzig Siege bringen die Medaille der zweiten Tour; danach gehen die Einsätze weiter.',
    'Armoured Sturmböcke are joining the defence. Expect close attacks from astern.': 'Gepanzerte Sturmböcke verstärken die Abwehr. Rechne mit Nahangriffen von hinten.',
    'Me 262 jets are operational; later sorties also face Me 163 rocket fighters.': 'Me-262-Düsenjäger sind einsatzbereit; spätere Einsätze treffen auch auf Me-163-Raketenjäger.',
    'A battle group guards this target. Destroy it in the final round.': 'Ein Kampfverband schützt dieses Ziel. Vernichte ihn in der letzten Runde.',
    'Extended service: a fictional continuation of the air war through late 1945.': 'Verlängerter Dienst: eine fiktive Fortsetzung des Luftkriegs bis Ende 1945.',
  },
  patterns: [
    [/^Second tour — (.+) — (.+)$/, (m, tr) => `Zweite Tour — ${tr(m[1])} — ${tr(m[2])}`],
    [/^Second tour operation (\d+): strike the (.+) at (.+)\.$/, (m, tr) => `Einsatz ${m[1]} der zweiten Tour: Greif ${tr(m[2])} in ${tr(m[3])} an.`],
    [/^Industrial district, (.+)$/, (m, tr) => `Industrieviertel, ${tr(m[1])}`],
    [/^The industrial district at (.+) has been hit\.$/, (m, tr) => `Das Industrieviertel in ${tr(m[1])} wurde getroffen.`],
  ],
};
export default table;
