import type { PhraseTable } from '../types';

// Arabic for the formation set pieces (game/SetPieces.ts) and the straggler event's new lines
// (game/RandomEvents.ts): radio lines, the drama-cam captions and the reward feed. The bomber's
// name ({name}) stays as it is; the recorded voices stay English.

const table: PhraseTable = {
  phrases: {
    // ---- flak hit: the wing folds, a flat spin, the chutes counted ----
    'Direct hit on the ship next to us! Her wing\'s folding up!': 'إصابة مباشرة في الطائرة المجاورة لنا! جناحها ينطوي!',
    'Debris coming through! Hang on!': 'الحطام قادم نحونا! تمسّكوا!',
    'She\'s rolling over… she\'s going into a flat spin. Get out, fellas — get out of there!': 'إنها تنقلب… دخلت في دوران مسطّح. اقفزوا يا رفاق — اخرجوا من هناك!',
    'Chute! I see a chute!': 'مظلة! أرى مظلة!',
    'I count two chutes… three…': 'أعدّ مظلتين… ثلاثاً…',
    'I count three chutes… four…': 'أعدّ ثلاث مظلات… أربعاً…',
    'I count four chutes… five…': 'أعدّ أربع مظلات… خمساً…',
    'I count five chutes… six…': 'أعدّ خمس مظلات… ستاً…',
    'That\'s all. Ten men on that ship… God help the rest of them.': 'هذا كل شيء. عشرة رجال على تلك الطائرة… ليكن الله في عون الباقين.',
    'That\'s all I see. Come on… come on… that\'s all of them.': 'هذا كل ما أراه. هيا… هيا… هذا كل من خرج.',

    // ---- mid-air collision ----
    'That one-ninety\'s on fire — he\'s not pulling out! He\'s going to ram her!': 'تلك الفوكه-فولف تحترق — لن يبتعد! سيصطدم بها!',
    'He hit her! Oh God, they\'re locked together!': 'لقد صدمها! يا إلهي، إنهما ملتحمتان!',
    'They\'re going down together… I don\'t see anybody getting out.': 'إنهما تسقطان معاً… لا أرى أحداً يخرج.',
    'One chute! One man got out!': 'مظلة واحدة! نجا رجل واحد!',
    'Got him before he hit her! That was too close!': 'أسقطناه قبل أن يصدمها! كان ذلك قريباً جداً!',

    // ---- bomb-bay explosion ----
    'She\'s hit in the bomb bay — she\'s burning! She\'s going to blow!': 'أُصيبت في حجرة القنابل — إنها تحترق! ستنفجر!',
    'Wing section coming past the window — look out!': 'قطعة من الجناح تمرّ بجانب النافذة — احترس!',
    'She\'s gone. The whole ship… just gone.': 'لقد اختفت. الطائرة كلها… اختفت ببساطة.',
    'Crew, check in! Is anybody hurt back there?': 'أيها الطاقم، أبلغوا عن حالتكم! هل أُصيب أحد في الخلف؟',
    'Tail\'s okay. Just… shook up.': 'الذيل بخير. فقط… مصدومون قليلاً.',

    // ---- straggler ----
    'She\'s feathered two engines — she can\'t keep up! She\'s dropping out!': 'أوقفت محرّكين — لا تستطيع المجاراة! إنها تخرج من التشكيل!',
    'They\'re chewing us to pieces back here! For God\'s sake, somebody help us!': 'إنهم يمزّقوننا هنا في الخلف! بحق الله، فليساعدنا أحد!',
    'She\'s going down… we couldn\'t do a thing for her.': 'إنها تسقط… لم نستطع فعل شيء لأجلها.',

    // ---- little friends ----
    'Big friends, hold your fire — Mustangs coming through!': 'أيها الأصدقاء الكبار، أوقفوا النار — طائرات موستانغ تعبر!',
    'Little friends! Right past the window — they\'re all over him!': 'الأصدقاء الصغار! بجانب النافذة تماماً — إنهم يطاردونه من كل جانب!',
    'They got him! God bless those little friends!': 'أسقطوه! بارك الله في الأصدقاء الصغار!',

    // ---- drama cam captions and the reward feed ----
    'FLAK HIT': 'إصابة بالمضادات',
    'MID-AIR COLLISION': 'تصادم في الجو',
    'BOMB BAY HIT': 'إصابة في حجرة القنابل',
    'STRAGGLER': 'قاذفة متخلّفة',
    'LITTLE FRIENDS': 'الأصدقاء الصغار',
    '{name} is going down': '{name} تسقط',
    '{name} — a Fw 190 on a collision course': '{name} — طائرة Fw 190 في مسار تصادم',
    '{name} — fire in the bomb bay': '{name} — حريق في حجرة القنابل',
    '{name} is dropping out of formation': '{name} تخرج من التشكيل',
    'P-51s on a Bf 109': 'طائرات P-51 تطارد Bf 109',
    'Collision averted': 'أُحبط التصادم',
  },
};
export default table;
