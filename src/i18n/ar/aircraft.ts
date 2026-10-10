import type { PhraseTable, Pattern } from '../types';

// Arabic for the late-war enemy types (EnemyTypes.ts he111 / me410 / do335): their blurbs
// (first-sighting call, Custom Battle checkboxes), the Me 410 big-gun, Do 335 and He 111 raid
// radio lines (Tactics.ts, Raid.ts), radar cues and the gunner tip.

const patterns: Pattern[] = [
  // Tactics.bigGunWarning: gunner tip with an upper-cased clock position
  [/^Me 410 lining up at <b>(.+)<\/b> — kill him before he fires the <b>50 mm<\/b>$/,
    (m, tr) => `طائرة Me 410 تتهيّأ للرمي عند <b>${tr(m[1].toLowerCase())}</b> — أسقِطها قبل أن تطلق مدفع <b>50 ملم</b>`],
  // Raid.ts radar cue
  [/^BOMBERS ×(\d+)$/, 'قاذفات ×$1'],
];

const table: PhraseTable = {
  phrases: {
    // blurbs: "<label>s coming in — <blurb>!" and the Custom Battle enemy list
    'bombers in close formation, gunners in every window': 'قاذفات في تشكيل متراص، ورامٍ عند كل نافذة',
    'Hornisse, a fifty-millimetre cannon that fires from two kilometres': 'الدبّور، مدفع عيار خمسين ملّيمتراً يرمي من كيلومترين',
    'Pfeil, a push-pull fighter as fast as a jet in a dive': 'السهم، مقاتلة بمحرّكين دافع وساحب سريعة كالنفّاثة في الانقضاض',

    // radio (recorded: tools/voice/lines.json)
    "Me 410 hanging back out of range — he's carrying a fifty-millimetre cannon!": 'طائرة Me 410 تتريّث خارج المدى — إنها تحمل مدفعاً عيار خمسين ملّيمتراً!',
    'Me 410 lining up with the big gun!': 'طائرة Me 410 تصوّب المدفع الكبير!',
    "He's firing the big gun! Kill him before he reloads!": 'إنه يطلق المدفع الكبير! أسقِطه قبل أن يعيد التلقيم!',
    'Got the Me 410 before he could fire!': 'أسقطنا الـMe 410 قبل أن يتمكّن من الرمي!',
    "Do 335 diving on us from high astern — he's as fast as a jet!": 'طائرة Do 335 تنقضّ علينا من الأعلى والخلف — إنها سريعة كالنفّاثة!',
    'Heinkels! A whole formation of bombers — get into them before they reach the target!': 'هاينكل! تشكيل كامل من القاذفات — انقضّوا عليها قبل أن تبلغ الهدف!',
    'German bombers crossing ahead — a whole formation of Heinkels!': 'قاذفات ألمانية تعبر أمامنا — تشكيل كامل من طائرات هاينكل!',

    // radar cues (ui/Radar.ts)
    'BIG GUN': 'المدفع الكبير',
    'PFEIL': 'السهم',
    'BOMBER': 'قاذفة',
  },
  patterns,
};
export default table;
