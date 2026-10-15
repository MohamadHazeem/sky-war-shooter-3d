import type { PhraseTable } from '../types';
import { counted } from './fmt';

// Arabic for the mission editor (game/MissionEditor.ts, ui/MissionEditorScreen.ts): the editor,
// the Survival-screen library tab, the shared-mission card, the debrief rating strip and the
// generated player mission (title, briefing, objectives, debrief line).

const TARGETS: Record<string, string> = {
  'U-boat pens, Wilhelmshaven': 'أحواض الغواصات، فيلهلمسهافن',
  'Docks, Bremen': 'أرصفة الميناء، بريمن',
  'Ball-bearing plants, Schweinfurt': 'مصانع المحامل الكروية، شفاينفورت',
  'Aircraft works, Regensburg': 'مصانع الطائرات، ريغنسبورغ',
  'Oil refinery, Merseburg': 'مصفاة النفط، ميرسيبورغ',
  'Rail yards, Hamm': 'ساحات السكك الحديدية، هام',
  'Chemical works, Ludwigshafen': 'مصانع الكيماويات، لودفيغسهافن',
  'Tank factory, Kassel': 'مصنع الدبابات، كاسل',
  'Airfield, Rheine': 'المطار الحربي، راينه',
  'Government quarter, Berlin': 'الحي الحكومي، برلين',
};
const CITY: Record<string, string> = {
  Wilhelmshaven: 'فيلهلمسهافن', Bremen: 'بريمن', Schweinfurt: 'شفاينفورت', Regensburg: 'ريغنسبورغ', Merseburg: 'ميرسيبورغ',
  Hamm: 'هام', Ludwigshafen: 'لودفيغسهافن', Kassel: 'كاسل', Rheine: 'راينه', Berlin: 'برلين',
};
const TARGET = `(${Object.keys(TARGETS).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
const ROUTE: Record<string, string> = { 'short route': 'مسار قصير', 'medium route': 'مسار متوسط', 'long route': 'مسار طويل' };

const bombers = (n: string | number) => counted(n, 'قاذفة واحدة', 'قاذفتان', 'قاذفات', 'قاذفة');
const fighters = (n: string | number) => counted(n, 'مقاتلة واحدة', 'مقاتلتان', 'مقاتلات', 'مقاتلة');
const groups = (n: string | number) => counted(n, 'مجموعة واحدة', 'مجموعتان', 'مجموعات', 'مجموعة');
const fortresses = (n: string | number) => counted(n, 'قلعة طائرة واحدة', 'قلعتان طائرتان', 'قلاع طائرة', 'قلعة طائرة');
const times = (n: string | number) => counted(n, 'مرة واحدة', 'مرتين', 'مرات', 'مرة');
const SKILL: Record<string, string> = { recruit: 'مجنّدون', veteran: 'مخضرمون', ace: 'من الآسات', insane: 'بمهارة جنونية' };

const table: PhraseTable = {
  phrases: {
    ...TARGETS,
    // ---------------- MissionEditor.ts: labels ----------------
    'Short route': 'مسار قصير', 'Medium route': 'مسار متوسط', 'Long route': 'مسار طويل',
    'No escort': 'بلا مرافقة', 'Escort from the start': 'مرافقة من البداية', 'Escort after the target': 'مرافقة بعد الهدف',
    'No flak': 'بلا مضادات', 'Light flak': 'مضادات خفيفة', 'Heavy flak': 'مضادات كثيفة', 'Deadly flak': 'مضادات قاتلة',
    "12 o'clock": 'الساعة 12', "6 o'clock": 'الساعة 6', "9 o'clock": 'الساعة 9', "3 o'clock": 'الساعة 3', 'From above': 'من الأعلى', 'All around': 'من كل الجهات',
    'Way in': 'طريق الذهاب', 'Over the target': 'فوق الهدف', 'Way home': 'طريق العودة',
    'Paste a mission code or link first.': 'الصق رمز مهمة أو رابطها أولاً.',
    'That is not a mission code.': 'هذا ليس رمز مهمة.',
    'This mission code is damaged — a character is missing or wrong.': 'رمز المهمة هذا تالف — هناك حرف ناقص أو خاطئ.',
    'This mission was made with a newer version of the game.': 'صُنعت هذه المهمة بإصدار أحدث من اللعبة.',
    'This mission code holds values the game does not allow.': 'يحمل رمز المهمة هذا قيماً لا تسمح بها اللعبة.',
    // ---------------- the built mission ----------------
    'Player mission': 'مهمة من صنع لاعب',
    'PLAYER MISSION': 'مهمة من صنع لاعب',
    'No flak over the target.': 'لا مضادات فوق الهدف.',
    'Light flak over the target.': 'مضادات خفيفة فوق الهدف.',
    'Heavy flak over the target.': 'مضادات كثيفة فوق الهدف.',
    'Deadly flak over the target.': 'مضادات قاتلة فوق الهدف.',
    'No escort today.': 'لا مرافقة اليوم.',
    'Mustangs fly with us from the start.': 'طائرات موستانغ تطير معنا من البداية.',
    'Mustangs meet us after the target.': 'طائرات موستانغ تلاقينا بعد الهدف.',
    'Player missions are not posted to the online leaderboards.': 'لا تُنشر مهام اللاعبين في لوحات الصدارة على الإنترنت.',
    'Defend the formation': 'الدفاع عن التشكيل',
    'Bomb the target': 'اقصف الهدف',
    // ---------------- MissionEditorScreen.ts ----------------
    'Mission Editor': 'محرر المهام',
    'Build your own gunner mission — target, route, weather, time of day, enemy waves, escorts and flak — and share it as a link. Fly, rate and replay missions friends send you.':
      'اصنع مهمة رامٍ خاصة بك — الهدف والمسار والطقس ووقت اليوم وموجات العدو والمرافقة والمضادات — وشاركها برابط. حلّق في المهام التي يرسلها أصدقاؤك وقيّمها وأعد لعبها.',
    'MISSION EDITOR · B-17 GUNNER': 'محرر المهام · رامي B-17',
    'Build a mission': 'اصنع مهمة',
    'Mission name': 'اسم المهمة',
    'Optional': 'اختياري',
    'Target': 'الهدف',
    'Enemy waves': 'موجات العدو',
    'Enemy skill': 'مهارة العدو',
    'Add wave': 'أضف موجة',
    'Route & sky': 'المسار والسماء',
    'Route length': 'طول المسار',
    'Time of day': 'وقت اليوم',
    'Sun elevation: dawn to noon': 'ارتفاع الشمس: من الفجر إلى الظهيرة',
    'dawn / dusk': 'فجر / غسق',
    'morning': 'الصباح',
    'noon': 'الظهيرة',
    'Weather': 'الطقس',
    'Bomber, escorts & flak': 'القاذفة والمرافقة والمضادات',
    'Gunner seat': 'موقع الرامي',
    'Formation': 'التشكيل',
    'Flak density': 'كثافة المضادات',
    'Escorts': 'المرافقة',
    'Share link': 'رابط المشاركة',
    'Copy link': 'انسخ الرابط',
    'Link copied': 'نُسخ الرابط',
    'Copy the link above': 'انسخ الرابط أعلاه',
    'Anyone with the link can fly your mission. Player missions are not posted to the online leaderboards.': 'يستطيع كل من لديه الرابط أن يطير في مهمتك. لا تُنشر مهام اللاعبين في لوحات الصدارة على الإنترنت.',
    'Defaults': 'الإعدادات الافتراضية',
    'Save': 'احفظ',
    'Saved': 'حُفظت',
    'Fly mission': 'انطلق في المهمة',
    'When': 'متى',
    'From': 'من أين',
    'Fighters': 'المقاتلات',
    'Remove wave': 'احذف الموجة',
    'SHARED MISSION': 'مهمة مشتركة',
    'SHARED MISSION · B-17 GUNNER': 'مهمة مشتركة · رامي B-17',
    'Mission code not valid': 'رمز المهمة غير صالح',
    'YOUR RATING': 'تقييمك',
    'Your rating': 'تقييمك',
    'Not flown yet': 'لم تُطِر فيها بعد',
    'Edit a copy': 'عدّل نسخة',
    'In your missions': 'ضمن مهامك',
    'Paste a mission code or link': 'الصق رمز مهمة أو رابطها',
    'Mission code': 'رمز المهمة',
    'Open': 'افتح',
    'Your missions': 'مهامك',
    'shared': 'مشتركة',
    'Fly': 'طِر',
    'Edit': 'عدّل',
    'Remove': 'احذف',
    'No missions yet. Build one, or open a code a friend sent you.': 'لا مهام بعد. اصنع واحدة، أو افتح رمزاً أرسله لك صديق.',
    'RATE THIS MISSION': 'قيّم هذه المهمة',
    'Back': 'رجوع',
  },
  patterns: [
    [/^Rate (\d) of 5$/, 'التقييم $1 من 5'],
    [/^Wave (\d+)$/, 'الموجة $1'],
    [/^(\d+(?:\.\d+)?) min$/, '$1 دقيقة'],
    [/^(\d+) bombers$/, (m) => bombers(m[1])],
    [/^(\d+) of (\d+) waves · (\d+) fighters?$/, (m) => `${m[1]} من ${m[2]} موجات · ${fighters(m[3])}`],
    [/^(\d+) enemy groups? · (\d+) fighters?$/, (m) => `${groups(m[1])} من العدو · ${fighters(m[2])}`],
    [/^Flown (\d+) times · best (\d+)$/, (m) => `طرت فيها ${times(m[1])} · أفضل نتيجة ${m[2]}`],
    [/^Flown once · best (\d+)$/, 'طرت فيها مرة واحدة · أفضل نتيجة $1'],
    [new RegExp(`^Strike on (${Object.keys(CITY).join('|')})$`), (m) => `ضربة على ${CITY[m[1]]}`],
    [new RegExp(`^A mission built by a gunner: (\\d+) Fortresses against ${TARGET}, a (short route|medium route|long route)\\.$`),
      (m) => `مهمة صنعها رامٍ: ${fortresses(m[1])} ضد ${TARGETS[m[2]]}، على ${ROUTE[m[3]]}.`],
    [/^(One fighter group|(\d+) fighter groups) expected, (\d+) fighters in all, (recruit|veteran|ace|insane) pilots\.$/,
      (m) => `نتوقع ${m[2] ? groups(m[2]) : 'مجموعة واحدة'} من المقاتلات، ${fighters(m[3])} في المجموع، وطياروها ${SKILL[m[4]]}.`],
    [new RegExp(`^Bombs on ${TARGET}\\. The mission you built is flown\\.$`), (m) => `القنابل على ${TARGETS[m[1]]}. طرت في المهمة التي صنعتها.`],
  ],
};

export default table;
