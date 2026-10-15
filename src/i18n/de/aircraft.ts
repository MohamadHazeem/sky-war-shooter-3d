// German for ar/aircraft.ts (same keys and patterns).
import type { PhraseTable, Pattern } from '../types';

const patterns: Pattern[] = [
  [/^Me 410 lining up at <b>(.+)<\/b> — kill him before he fires the <b>50 mm<\/b>$/,
    (m, tr) => `Me 410 geht auf <b>${tr(m[1].toLowerCase())}</b> in Position — hol ihn runter, bevor er die <b>50 mm</b> abfeuert`],
  [/^BOMBERS ×(\d+)$/, 'BOMBER ×$1'],
];

const table: PhraseTable = {
  phrases: {
    'bombers in close formation, gunners in every window': 'Bomber in enger Formation, Schützen an jedem Fenster',
    'Hornisse, a fifty-millimetre cannon that fires from two kilometres': 'Hornisse, eine 5-cm-Kanone, die aus zwei Kilometern feuert',
    'Pfeil, a push-pull fighter as fast as a jet in a dive': 'Pfeil, ein Zug-Druck-Jäger, im Sturzflug so schnell wie ein Düsenjäger',
    "Me 410 hanging back out of range — he's carrying a fifty-millimetre cannon!": 'Me 410 hält sich außer Reichweite — er hat eine 5-cm-Kanone!',
    'Me 410 lining up with the big gun!': 'Me 410 richtet die große Kanone aus!',
    "He's firing the big gun! Kill him before he reloads!": 'Er feuert die große Kanone! Hol ihn runter, bevor er nachlädt!',
    'Got the Me 410 before he could fire!': 'Me 410 erwischt, bevor er feuern konnte!',
    "Do 335 diving on us from high astern — he's as fast as a jet!": 'Do 335 stürzt von hinten oben auf uns — schnell wie ein Düsenjäger!',
    'Heinkels! A whole formation of bombers — get into them before they reach the target!': 'Heinkels! Eine ganze Bomberformation — rein in sie, bevor sie das Ziel erreichen!',
    'German bombers crossing ahead — a whole formation of Heinkels!': 'Deutsche Bomber kreuzen vor uns — eine ganze Formation Heinkels!',
    'BIG GUN': 'GROSSE KANONE',
    'PFEIL': 'PFEIL',
    'BOMBER': 'BOMBER',
  },
  patterns,
};
export default table;
