// French for ar/aircraft.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^Me 410 lining up at <b>(.+)<\/b> — kill him before he fires the <b>50 mm<\/b>$/,
    (m, tr) => `Me 410 en position à <b>${tr(m[1].toLowerCase())}</b> — abattez-le avant qu’il tire au <b>50 mm</b>`],
  [/^BOMBERS ×(\d+)$/, 'BOMBARDIERS ×$1'],
];

const table: PhraseTable = {
  phrases: {
    'bombers in close formation, gunners in every window': 'bombardiers en formation serrée, un mitrailleur à chaque hublot',
    'Hornisse, a fifty-millimetre cannon that fires from two kilometres': 'Hornisse, un canon de cinquante millimètres qui tire à deux kilomètres',
    'Pfeil, a push-pull fighter as fast as a jet in a dive': 'Pfeil, un chasseur bimoteur en tandem aussi rapide qu’un jet en piqué',
    "Me 410 hanging back out of range — he's carrying a fifty-millimetre cannon!": 'Me 410 en retrait hors de portée — il emporte un canon de cinquante millimètres !',
    'Me 410 lining up with the big gun!': 'Le Me 410 aligne son gros canon !',
    "He's firing the big gun! Kill him before he reloads!": 'Il tire au gros canon ! Abattez-le avant qu’il recharge !',
    'Got the Me 410 before he could fire!': 'On a eu le Me 410 avant qu’il tire !',
    "Do 335 diving on us from high astern — he's as fast as a jet!": 'Do 335 en piqué sur nous, haut à l’arrière — aussi rapide qu’un jet !',
    'Heinkels! A whole formation of bombers — get into them before they reach the target!': 'Des Heinkel ! Toute une formation de bombardiers — tombez-leur dessus avant l’objectif !',
    'German bombers crossing ahead — a whole formation of Heinkels!': 'Bombardiers allemands devant nous — toute une formation de Heinkel !',
    'BIG GUN': 'GROS CANON',
    'PFEIL': 'PFEIL',
    'BOMBER': 'BOMBARDIER',
  },
  patterns,
};
export default table;
