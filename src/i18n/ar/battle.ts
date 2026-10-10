import type { PhraseTable, Pattern } from '../types';
import { counted, ltr } from './fmt';

// Arabic for the Custom Battle (game/CustomBattle.ts, ui/CustomBattleScreen.ts) and the Weekly
// Challenge (game/Weekly.ts): the set-up screen, the Survival-screen tabs and strip, the generated
// weekly scenarios (operation names, headlines, briefings, objectives) and the reward lines.

// Weekly.ts OPERATIONS: the code names, given an Arabic name (a few historical ones transliterated)
const OPS: Record<string, string> = {
  Thunderclap: 'قصف الرعد', Argument: 'الحُجّة', Pointblank: 'المدى الصفري', Clarion: 'النفير', Frantic: 'الهياج',
  Gomorrah: 'عمورة', 'Tidal Wave': 'الموجة العارمة', Hydra: 'هيدرا', Crossbow: 'القوس والنشّاب', Chattanooga: 'تشاتانوغا',
  Jericho: 'أريحا', Varsity: 'فارسيتي', Cobra: 'الكوبرا', Grubworm: 'اليرقة', Aphrodite: 'أفروديت', Juggler: 'المشعوذ',
  Starkey: 'ستاركي', Carpetbagger: 'الدخيل', Cadillac: 'كاديلاك', 'Lucky Strike': 'الضربة المحظوظة',
  'Iron Cross': 'الصليب الحديدي', 'Long Reach': 'الذراع الطويلة', Hailstorm: 'عاصفة البَرَد', 'Black Ribbon': 'الشريط الأسود',
  'Steel Rain': 'المطر الفولاذي', Nightjar: 'السُّبَد', Overcast: 'السماء الملبّدة', 'High Card': 'الورقة الرابحة',
};
const OP = `(${Object.keys(OPS).join('|')})`;
const ENEMY = '(?:Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)';
const SEAT = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';
const TOD = '(?:dawn|morning sun|noon|dusk)';

const rounds = (n: string | number) => counted(n, 'جولة واحدة', 'جولتان', 'جولات', 'جولة');

// "Operation Thunderclap — 5 rounds, Me 262s only, dusk, boss in round 5" (the weekly headline)
const HEAD = new RegExp(`^Operation ${OP} — (\\d+) rounds, (.+?), ((?:(?:overcast|storm), )?${TOD})(?:, boss in round (\\d+))?$`);
function headline(m: RegExpMatchArray, tr: (s: string) => string): string {
  const w = m[4].split(', ').map(tr).join('، ');
  return `عملية ${OPS[m[1]]} — ${rounds(m[2])}، ${tr(m[3])}، ${w}${m[5] ? `، والمجموعة القتالية في الجولة ${m[5]}` : ''}`;
}

const patterns: Pattern[] = [
  // ---------------- CustomBattle.ts: the set-up summary pieces and the built mission ----------------
  [new RegExp(`^B-17 ${SEAT}$`), (m, tr) => `B-17، ${tr(m[1])}`],
  [new RegExp(`^(${ENEMY})s only$`), 'طائرات $1 فقط'],
  [new RegExp(`^(${ENEMY}(?:, ${ENEMY})+)$`), (m) => m[1].replace(/, /g, '، ')],
  [/^(\d+)–(\d+) at once$/, 'من $1 إلى $2 في آن واحد'],
  [/^endless (\d+:\d\d) rounds$/, 'جولات لا تنتهي، مدة كل منها $1'],
  [/^(\d+) × (\d+:\d\d)$/, (m) => `${rounds(m[1])} × ${m[2]}`],
  [new RegExp(`^(Clear|Overcast|Storm|Red dusk), (${TOD})$`), (m, tr) => `${tr(m[1])}، ${tr(m[2])}`],
  [/^battle group every (\d+) rounds$/, (m) => `مجموعة قتالية كل ${rounds(m[1])}`],
  [/^battle group in round (\d+)$/, 'مجموعة قتالية في الجولة $1'],
  [/^(\d+) rounds?$/, (m) => rounds(m[1])],
  [/^(Endless rounds|\d+ rounds?) · (.+)$/, (m, tr) => `${tr(m[1])} · ${tr(m[2])}`],
  [/^A battle of your own making: (.+)\.$/, (m, tr) => `معركة من تصميمك: ${m[1].split(' · ').map(tr).join(' · ')}.`],
  [/^Survive (\d+) rounds?$/, (m) => `اصمد ${rounds(m[1])}`],

  // ---------------- Weekly.ts: the generated scenario ----------------
  [new RegExp(`^Operation ${OP}$`), (m) => `عملية ${OPS[m[1]]}`],
  [new RegExp(HEAD.source), headline],
  [new RegExp(`^Week (\\d+): (${HEAD.source.slice(1, -1)})$`), (m, tr) => `الأسبوع ${m[1]}: ${tr(m[2])}`],
  [/^Weekly Challenge · Week (\d+), (\d{4})$/, 'التحدي الأسبوعي · الأسبوع $1، $2'],
  [/^This week's challenge, the same for every crew: (.+)\.$/, (m, tr) => `تحدّي هذا الأسبوع، وهو واحد لكل الأطقم: ${tr(m[1])}.`],
  [/^The enemy schedule is fixed for the week\. Fly all (\d+) rounds to complete it: the first completion each week pays (\d+) merit and a weekly ribbon, and earns the (.+) nose art, found nowhere else\.$/,
    (m, tr) => `جدول هجمات العدو ثابت طوال الأسبوع. حلّق في الجولات الـ${m[1]} كلها لإكماله: أول إكمال في كل أسبوع يمنحك ${m[2]} نقطة استحقاق وشريطاً أسبوعياً، ورسم المقدمة «${tr(m[3])}» الذي لا يُنال في أي مكان آخر.`],
  [/^Survive all (\d+) rounds$/, 'اصمد في الجولات الـ$1 كلها'],
  [/^Destroy the battle group in round (\d+)$/, 'دمّر المجموعة القتالية في الجولة $1'],
  [new RegExp(`^Operation ${OP} complete\\. The weekly ribbon is yours\\.$`), (m) => `اكتملت عملية ${OPS[m[1]]}. الشريط الأسبوعي لك.`],
  // the countdown to next Monday (fmtWeekCountdown)
  [/^(\d+)d (\d+)h (\d+)m$/, '$1 ي $2 س $3 د'],
  [/^(\d+)h (\d+)m$/, '$1 س $2 د'],
  // ServiceRecord debrief reward line
  [/^Weekly Challenge — week (\d+)$/, 'التحدي الأسبوعي — الأسبوع $1'],
  [/^\+(\d+) merit · weekly ribbon(?: · (.+) nose art unlocked \(hangar\))?$/,
    (m, tr) => `${ltr(`+${m[1]}`)} نقطة استحقاق · شريط أسبوعي${m[2] ? ` · فُتح رسم المقدمة «${tr(m[2])}» (الحظيرة)` : ''}`],
  [/^WEEK (\d+) · (B-17 GUNNER|P-51 ESCORT) · TOP 10$/, (m) => `الأسبوع ${m[1]} · ${m[2] === 'B-17 GUNNER' ? 'رامي B-17' : 'مرافقة P-51'} · أفضل 10`],
];

const table: PhraseTable = {
  phrases: {
    // ---------------- modes (Modes.ts tabs) ----------------
    'Custom Battle': 'معركة مخصّصة',
    'Weekly': 'أسبوعي',
    'Set up your own battle: seat, enemy types, numbers, skill, rounds, weather and time of day, battle group, special events, flak and escorts. Custom battles are not posted to the online leaderboards.':
      'جهّز معركتك بنفسك: موقع الرماية، وأنواع العدو، وأعداده، ومهارته، والجولات، والطقس ووقت النهار، والمجموعة القتالية، والأحداث الخاصة، والمضادات، والمرافقة. لا تُنشر نتائج المعارك المخصّصة في لوحات الصدارة على الإنترنت.',
    'A new scenario every Monday, the same for every crew, with its own leaderboard and a weekly-only reward.':
      'سيناريو جديد كل يوم اثنين، واحد لكل الأطقم، وله لوحة صدارة خاصة ومكافأة لا تُنال إلا أسبوعياً.',

    // ---------------- CustomBattle.ts: labels and the built mission ----------------
    'Recruit': 'مجنَّد',
    'Veteran': 'مخضرم',
    'Ace': 'آس',
    'Insane': 'جنوني',
    'Storm': 'عاصفة',
    'Red dusk': 'غسق أحمر',
    'dawn': 'فجر',
    'morning sun': 'شمس الصباح',
    'noon': 'ظهيرة',
    'dusk': 'غسق',
    'every type': 'كل الأنواع',
    'special events': 'أحداث خاصة',
    'flak': 'نيران المضادات',
    'escorts': 'مرافقة',
    'Custom Battle — Gunner': 'معركة مخصّصة — الرامي',
    'Custom Battle — Escort': 'معركة مخصّصة — المرافقة',
    'Custom battle': 'معركة مخصّصة',
    'Custom battles are not posted to the online leaderboards.': 'لا تُنشر نتائج المعارك المخصّصة في لوحات الصدارة على الإنترنت.',
    'Battle won. Every round flown, and the formation still holds.': 'كسبت المعركة. خضت كل الجولات، وما زال التشكيل متماسكاً.',

    // ---------------- CustomBattleScreen.ts: the set-up screen ----------------
    'SURVIVAL · YOUR RULES': 'البقاء · بقواعدك أنت',
    'Role': 'الدور',
    'Gunner seat': 'موقع الرامي',
    'Enemy types': 'أنواع العدو',
    'Fighters at once': 'المقاتلات في آن واحد',
    'min': 'الأدنى',
    'max': 'الأقصى',
    'Enemy skill': 'مهارة العدو',
    'Round length': 'مدة الجولة',
    'Rounds': 'الجولات',
    'Endless': 'بلا نهاية',
    'until you are shot down': 'حتى تُسقَط',
    'Weather': 'الطقس',
    'Time of day': 'وقت النهار',
    'Sun elevation: dawn to noon': 'ارتفاع الشمس: من الفجر إلى الظهيرة',
    'dawn / dusk': 'فجر / غسق',
    'morning': 'صباح',
    'Battle group': 'المجموعة القتالية',
    'Boss round': 'جولة المجموعة القتالية',
    'giant flying warships': 'سفن حربية طائرة عملاقة',
    'Extras': 'إضافات',
    'Special events': 'أحداث خاصة',
    'aces, Zerstörer, rockets': 'آسات، مدمّرات، صواريخ',
    'mid-round barrage': 'وابل في منتصف الجولة',
    'Escorts': 'المرافقة',
    'Mustangs on your side': 'موستانغ إلى جانبك',
    'Custom battles are not posted to the online leaderboards. Your last set-up is kept.': 'لا تُنشر نتائج المعارك المخصّصة في لوحات الصدارة على الإنترنت. يُحفظ آخر إعداد لك.',
    'Defaults': 'الإعدادات الافتراضية',
    'Start': 'ابدأ',
    '{n} of {total}': '{n} من {total}',
    '{min}–{max}': 'من {min} إلى {max}',
    'off': 'معطّلة',
    'round {n}, then every {n}': 'الجولة {n}، ثم كل {n} جولات',
    'round {n}': 'الجولة {n}',
    'Last set-up': 'آخر إعداد',
    'Set up battle': 'جهّز المعركة',
    'Fly last set-up': 'حلّق بآخر إعداد',

    // ---------------- Weekly.ts: themes, reward, the weekly card and strip ----------------
    'The Jet Staffel': 'سرب النفّاثات',
    'Wonder weapons': 'الأسلحة العجيبة',
    'The Zerstörergeschwader': 'جناح المدمّرات',
    'The Sturmgruppe': 'مجموعة الاقتحام',
    'A Gustav swarm': 'سرب من طائرات غوستاف',
    'The day fighters': 'المقاتلات النهارية',
    'Everything the Luftwaffe has': 'كل ما تملكه اللوفتفافه',
    'A mixed Jagdverband': 'تشكيل مقاتلات مختلط',
    "Post a score on this week's board": 'سجّل نتيجة في لوحة هذا الأسبوع',
    'Lightning Shield': 'درع البرق',
    'Weekly Challenge reward': 'مكافأة التحدي الأسبوعي',
    'NEXT SCENARIO IN': 'السيناريو التالي بعد',
    'WEEKLY CHALLENGE · WEEK {w}, {y}': 'التحدي الأسبوعي · الأسبوع {w}، {y}',
    '{r} rounds of {len} · {min}–{max} fighters at once · {skill} skill': '{r} جولات مدة كل منها {len} · المقاتلات في آن واحد: من {min} إلى {max} · مهارة العدو: {skill}',
    ' · battle group in round {n}': ' · المجموعة القتالية في الجولة {n}',
    'no special events': 'بلا أحداث خاصة',
    'no flak': 'بلا مضادات',
    'no escorts': 'بلا مرافقة',
    'Gunners fly the {seat} · the enemy schedule is the same for every crew all week': 'الرماة على {seat} · جدول هجمات العدو واحد لكل الأطقم طوال الأسبوع',
    '✔ Completed this week · 1 weekly ribbon': '✔ أُنجز هذا الأسبوع · شريط أسبوعي واحد',
    '✔ Completed this week · {n} weekly ribbons': '✔ أُنجز هذا الأسبوع · الأشرطة الأسبوعية: {n}',
    'Reward for completing it: +{n} merit, a weekly ribbon': `مكافأة إكماله: ${ltr('+{n}')} نقطة استحقاق، وشريط أسبوعي`,
    ' and the <b>{name}</b> nose art (weekly-only)': ' ورسم المقدمة <b>{name}</b> (أسبوعي حصراً)',
    'WEEKLY CHALLENGE': 'التحدي الأسبوعي',
    'ends in': 'ينتهي بعد',
    ...Object.fromEntries(Object.entries(OPS).map(([k, v]) => [`Operation ${k}`, `عملية ${v}`])),
  },
  patterns,
};
export default table;
