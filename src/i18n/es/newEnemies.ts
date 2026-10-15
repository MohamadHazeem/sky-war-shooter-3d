// Spanish for ar/newEnemies.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = { phrases: {
  'Ju 88 Gs only': 'Solo Ju 88 G',
  'Ju 88 G': 'Ju 88 G',
  'Junkers Ju 88 G-6': 'Junkers Ju 88 G-6',
  'Radar night fighter': 'Caza nocturno con radar',
  'radar night fighter — attacks from below with upward-firing cannon': 'caza nocturno con radar — ataca desde abajo con cañones que disparan hacia arriba',
  'Ju 88 Gs coming in — radar night fighter — attacks from below with upward-firing cannon!': '¡Llegan Ju 88 G — cazas nocturnos con radar — atacan desde abajo con cañones que disparan hacia arriba!',
  '4 × 20 mm forward cannon · 2 × 20 mm upward-firing cannon': '4 cañones de 20 mm frontales · 2 cañones de 20 mm hacia arriba',
  '388 mph (625 km/h)': '388 mph (625 km/h)',
  '20.1 m × 15.5 m': '20,1 m × 15,5 m',
  'Radar finds the bomber in darkness. Watch below: the upward cannon cannot fire sideways.': 'El radar encuentra al bombardero en la oscuridad. Vigila abajo: los cañones hacia arriba no pueden disparar de lado.',
  'Night fighter below us! Watch his upward cannon!': '¡Caza nocturno debajo! ¡Cuidado con sus cañones hacia arriba!',
  'NIGHT FIGHTER': 'CAZA NOCTURNO',
  'Ju 88 G below — use the BALL turret before its upward cannon lines up.': 'Ju 88 G debajo — usa la torreta VENTRAL antes de que alinee sus cañones hacia arriba.',
}, patterns: [
  [/^(?=.*Ju 88 G)(?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)(?:, (?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335))+$/, (m, tr) => m[0].split(', ').map(tr).join(', ')],
] };
export default table;
