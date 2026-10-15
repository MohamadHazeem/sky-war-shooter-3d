// German for ar/newEnemies.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = { phrases: {
  'Ju 88 Gs only': 'Nur Ju 88 G',
  'Ju 88 G': 'Ju 88 G',
  'Junkers Ju 88 G-6': 'Junkers Ju 88 G-6',
  'Radar night fighter': 'Radar-Nachtjäger',
  'radar night fighter — attacks from below with upward-firing cannon': 'Radar-Nachtjäger — greift von unten mit Schräger Musik an',
  'Ju 88 Gs coming in — radar night fighter — attacks from below with upward-firing cannon!': 'Ju 88 G im Anflug — Radar-Nachtjäger — greifen von unten mit Schräger Musik an!',
  '4 × 20 mm forward cannon · 2 × 20 mm upward-firing cannon': '4 × 20-mm-Kanone nach vorn · 2 × 20-mm-Kanone schräg nach oben',
  '388 mph (625 km/h)': '388 mph (625 km/h)',
  '20.1 m × 15.5 m': '20,1 m × 15,5 m',
  'Radar finds the bomber in darkness. Watch below: the upward cannon cannot fire sideways.': 'Das Radar findet den Bomber im Dunkeln. Achte nach unten: Die schrägen Kanonen können nicht zur Seite schießen.',
  'Night fighter below us! Watch his upward cannon!': 'Nachtjäger unter uns! Achtung, Schräge Musik!',
  'NIGHT FIGHTER': 'NACHTJÄGER',
  'Ju 88 G below — use the BALL turret before its upward cannon lines up.': 'Ju 88 G unter uns — nimm den KUGELTURM, bevor seine schrägen Kanonen ausgerichtet sind.',
}, patterns: [
  [/^(?=.*Ju 88 G)(?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)(?:, (?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335))+$/, (m, tr) => m[0].split(', ').map(tr).join(', ')],
] };
export default table;
