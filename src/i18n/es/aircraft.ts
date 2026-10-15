// Spanish for ar/aircraft.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^Me 410 lining up at <b>(.+)<\/b> — kill him before he fires the <b>50 mm<\/b>$/,
    (m, tr) => `Me 410 apuntando desde <b>${tr(m[1].toLowerCase())}</b> — derríbalo antes de que dispare el <b>50 mm</b>`],
  [/^BOMBERS ×(\d+)$/, 'BOMBARDEROS ×$1'],
];

const table: PhraseTable = {
  phrases: {
    'bombers in close formation, gunners in every window': 'bombarderos en formación cerrada, artilleros en cada ventanilla',
    'Hornisse, a fifty-millimetre cannon that fires from two kilometres': 'Hornisse, un cañón de cincuenta milímetros que dispara desde dos kilómetros',
    'Pfeil, a push-pull fighter as fast as a jet in a dive': 'Pfeil, un caza de motores en tándem tan rápido como un reactor en picado',
    "Me 410 hanging back out of range — he's carrying a fifty-millimetre cannon!": '¡Un Me 410 se queda fuera de alcance — lleva un cañón de cincuenta milímetros!',
    'Me 410 lining up with the big gun!': '¡El Me 410 está apuntando el cañón grande!',
    "He's firing the big gun! Kill him before he reloads!": '¡Está disparando el cañón grande! ¡Derríbalo antes de que recargue!',
    'Got the Me 410 before he could fire!': '¡Derribamos al Me 410 antes de que disparara!',
    "Do 335 diving on us from high astern — he's as fast as a jet!": '¡Un Do 335 se lanza en picado desde arriba y atrás — es tan rápido como un reactor!',
    'Heinkels! A whole formation of bombers — get into them before they reach the target!': '¡Heinkels! Toda una formación de bombarderos — ¡a por ellos antes de que lleguen al objetivo!',
    'German bombers crossing ahead — a whole formation of Heinkels!': '¡Bombarderos alemanes cruzando delante — toda una formación de Heinkels!',
    'BIG GUN': 'CAÑÓN GRANDE',
    'PFEIL': 'PFEIL',
    'BOMBER': 'BOMBARDERO',
  },
  patterns,
};
export default table;
