// French for ar/newEnemies.ts (same keys and patterns).
import type { PhraseTable } from '../types';
const table: PhraseTable = { phrases: {
  'Ju 88 Gs only': 'Ju 88 G uniquement',
  'Ju 88 G': 'Ju 88 G',
  'Junkers Ju 88 G-6': 'Junkers Ju 88 G-6',
  'Radar night fighter': 'Chasseur de nuit à radar',
  'radar night fighter — attacks from below with upward-firing cannon': 'chasseur de nuit à radar — attaque par en dessous avec des canons tirant vers le haut',
  'Ju 88 Gs coming in — radar night fighter — attacks from below with upward-firing cannon!': 'Des Ju 88 G arrivent — chasseurs de nuit à radar — ils attaquent par en dessous avec des canons tirant vers le haut !',
  '4 × 20 mm forward cannon · 2 × 20 mm upward-firing cannon': '4 canons de 20 mm vers l\'avant · 2 canons de 20 mm tirant vers le haut',
  '388 mph (625 km/h)': '388 mph (625 km/h)',
  '20.1 m × 15.5 m': '20,1 m × 15,5 m',
  'Radar finds the bomber in darkness. Watch below: the upward cannon cannot fire sideways.': 'Le radar trouve le bombardier dans l\'obscurité. Surveillez le dessous : ses canons verticaux ne peuvent pas tirer de côté.',
  'Night fighter below us! Watch his upward cannon!': 'Chasseur de nuit sous nous ! Attention à ses canons verticaux !',
  'NIGHT FIGHTER': 'CHASSEUR DE NUIT',
  'Ju 88 G below — use the BALL turret before its upward cannon lines up.': 'Ju 88 G en dessous — utilisez la tourelle VENTRALE avant que ses canons verticaux soient en ligne.',
}, patterns: [
  [/^(?=.*Ju 88 G)(?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)(?:, (?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335))+$/, (m, tr) => m[0].split(', ').map(tr).join(', ')],
] };
export default table;
