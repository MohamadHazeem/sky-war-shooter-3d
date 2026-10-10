import type { PhraseTable } from '../types';
import { PHRASES } from '../phrases';

// Arabic for the game texts, keyed by the exact English shown in game: banners, tips, the
// kill feed, HUD objective / formation / crew lines, perk labels, hangar headers between
// rounds, debrief reasons and medals, loading messages, cinematic captions, station and crew
// labels. Runtime-built strings (numbers, station labels, names) are matched by `patterns`.

// Station labels: the HUD shows them as written and in capitals (Arabic has no case)
const STATION: Record<string, string> = {
  'Left Waist': 'الجانب الأيسر',
  'Right Waist': 'الجانب الأيمن',
  'Top Turret': 'البرج العلوي',
  'Ball Turret': 'البرج الكروي',
  'Tail Gun': 'مدفع الذيل',
};
const STATION_UP: Record<string, string> = Object.fromEntries(Object.entries(STATION).map(([k, v]) => [k.toUpperCase(), v]));
const ST = '(Left Waist|Right Waist|Top Turret|Ball Turret|Tail Gun)';

const MONTHS: Record<string, string> = {
  JANUARY: 'يناير', FEBRUARY: 'فبراير', MARCH: 'مارس', APRIL: 'أبريل', MAY: 'مايو', JUNE: 'يونيو',
  JULY: 'يوليو', AUGUST: 'أغسطس', SEPTEMBER: 'سبتمبر', OCTOBER: 'أكتوبر', NOVEMBER: 'نوفمبر', DECEMBER: 'ديسمبر',
};

// Arabic counted nouns: 1, 2 (dual), 3-10 (plural), 11+ / 0 (singular accusative)
const fighters = (s: string) => {
  const n = +s;
  return n === 1 ? 'مقاتلة واحدة' : n === 2 ? 'مقاتلتان' : n >= 3 && n <= 10 ? `${n} مقاتلات` : `${n} مقاتلة`;
};
const enemyFighters = (s: string) => {
  const n = +s;
  return n === 1 ? 'مقاتلة معادية تهاجم' : n === 2 ? 'مقاتلتان معاديتان تهاجمان' : n >= 3 && n <= 10 ? `${n} مقاتلات معادية تهاجم` : `${n} مقاتلة معادية تهاجم`;
};
const kills = (s: string) => {
  const n = +s;
  return n === 1 ? 'إسقاط واحد' : n === 2 ? 'إسقاطان' : n >= 3 && n <= 10 ? `${n} إسقاطات` : `${n} إسقاطًا`;
};
const round = (a: string, b?: string) => (b ? `الجولة ${a}/${b}` : `الجولة ${a}`);

// Text the game shows in capitals (mission titles, targets, dates on the HUD and banners):
// the phrase tables are keyed by the mixed-case English, so look the capitals up too.
let upperMap: Map<string, string> | null = null;
function upper(s: string, tr: (s: string) => string): string {
  const d = tr(s);
  if (d !== s) return d;
  upperMap ??= new Map(Object.entries(PHRASES).map(([k, v]) => [k.toUpperCase(), v]));
  const hit = upperMap.get(s);
  if (hit !== undefined) return hit;
  const date = s.match(/^(\d{1,2}) ([A-Z]+) (\d{4})$/);
  if (date && MONTHS[date[2]]) return `${date[1]} ${MONTHS[date[2]]} ${date[3]}`;
  return s;
}

const MODE: Record<string, string> = { 'MOUSE AIM': 'توجيه بالفأرة', DIRECT: 'تحكم مباشر', COCKPIT: 'قمرة القيادة', CHASE: 'منظر المطاردة' };
const QUALITY: Record<string, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' };

const table: PhraseTable = {
  phrases: {
    // ---- gun stations (B17Layout) ----
    ...STATION,
    ...STATION_UP,

    // ---- crew panel (Crew.ts) ----
    'Pilot': 'الطيار',
    'Co-Pilot': 'مساعد الطيار',
    'Navigator': 'الملاح',
    'Bombardier': 'مُلقي القنابل',
    'Engineer': 'المهندس',
    'Radio': 'اللاسلكي',
    'Ball': 'الكروي',
    'Waist L': 'الجانب الأيسر',
    'Waist R': 'الجانب الأيمن',
    'Tail': 'الذيل',
    'OK': 'سليم',
    'WOUNDED': 'مصاب',

    // ---- banners ----
    'FIVE CONFIRMED': 'خمسة إسقاطات مؤكدة',
    'Ace in a day': 'آس في يوم واحد',
    'They\'re sending everything they have': 'إنهم يرمون بكل ما لديهم',
    'More fighters inbound': 'مزيد من المقاتلات في الطريق',
    'INCOMING': 'هجوم قادم',
    'ALL GUNS SECURE': 'تأمين جميع الرشاشات',
    'MISSION FAILED': 'فشلت المهمة',
    'Mission complete': 'اكتملت المهمة',
    'Shot down': 'أُسقطت الطائرة',
    'BAIL OUT! BAIL OUT!': 'اقفزوا! اقفزوا!',
    'Crew, abandon the aircraft': 'أيها الطاقم، غادروا الطائرة',
    '5 kill streak · +50% score': 'سلسلة 5 إسقاطات · +50% نقاط',
    'ON FIRE': 'مشتعل',
    // banner dates shown in capitals (mode / training missions)
    'SOMEWHERE OVER THE REICH': 'في مكان ما فوق الرايخ',
    'OVER THE RUHR, SPRING 1944': 'فوق الرور، ربيع 1944',
    'THE CLOCK IS RUNNING': 'الوقت يمضي',
    'TRAINING FLIGHT · OVER THE WASH': 'طلعة تدريبية · فوق خليج ذا ووش',

    // ---- tips ----
    '<kbd>Move the mouse</kbd> to swing the gun · <kbd>Hold left button</kbd> to fire': '<kbd>حرّك الفأرة</kbd> لتوجيه الرشاش · <kbd>اضغط مطوّلاً على الزر الأيسر</kbd> للإطلاق',
    'Lead the fighters — aim where they will be · <kbd>Right button</kbd> to zoom': 'تقدّم على المقاتلات — صوّب حيث ستكون · <kbd>الزر الأيمن</kbd> للتقريب',
    'Short bursts keep the barrel cool · <kbd>1–5</kbd> change gun position': 'الرشقات القصيرة تُبقي السبطانة باردة · <kbd>1–5</kbd> لتغيير موقع الرشاش',
    '<kbd>Move the mouse</kbd> to fly where you look · <kbd>Left button</kbd> fires': '<kbd>حرّك الفأرة</kbd> لتطير حيث تنظر · <kbd>الزر الأيسر</kbd> للإطلاق',
    'Put the K-14 sight ahead of the bandit and fire · <kbd>W/S</kbd> throttle': 'ضع منظار K-14 أمام الطائرة المعادية وأطلق · <kbd>W/S</kbd> الخانق',
    'Fw 190s will come for you — keep turning · <kbd>V</kbd> chase view': 'ستلاحقك طائرات Fw 190 — واصل الانعطاف · <kbd>V</kbd> منظر المطاردة',
    'Guns topped up': 'أُعيد تذخير الرشاشات',
    'RELOADING — new ammunition box': 'إعادة التلقيم — صندوق ذخيرة جديد',
    'BARREL OVERHEATED — let it cool': 'السبطانة محمّاة — دعها تبرد',
    '<kbd>Space</kbd> skip': '<kbd>Space</kbd> للتخطي',

    // ---- kill feed ----
    'P-51 lost': 'فقدنا مقاتلة P-51',
    'You are wounded': 'لقد أُصبت',
    'Fire\'s out — took a heavy hit': 'خمدت النار — تلقّيت إصابة قوية',
    'Streak cooled off': 'خمدت السلسلة',

    // ---- field upgrades (perk toast labels) ----
    '6 KILLS · FIELD UPGRADE': '6 إسقاطات · ترقية ميدانية',
    '5 KILLS · FIELD PROMOTION': '5 إسقاطات · ترفيع ميداني',

    // ---- hangar / armory headers ----
    'ARMORY': 'الترسانة',
    'B-17 gunner loadout (P-51 loadout: between rounds)': 'عتاد رامي B-17 (عتاد P-51: بين الجولات)',
    'Back': 'رجوع',

    // ---- HUD objective line ----
    'Gunnery School — follow the instructions': 'مدرسة المدفعية — اتبع التعليمات',
    'Stand by — enemy fighters approaching': 'استعد — مقاتلات معادية تقترب',
    'Hold steady through the flak': 'اثبت وسط نيران المضادات',
    'Scan the sky — more fighters expected': 'راقب السماء — يُتوقع وصول مزيد من المقاتلات',

    // ---- pilot HUD mode line ----
    'MOUSE AIM': 'توجيه بالفأرة',
    'DIRECT': 'تحكم مباشر',
    'COCKPIT': 'قمرة القيادة',
    'CHASE': 'منظر المطاردة',
    'STALL': 'فقدان الرفع',

    // ---- gunner HUD station line (UI suffixes) ----
    'RELOADING': 'إعادة التلقيم',
    'BARREL HOT': 'السبطانة ساخنة',

    // ---- debrief: end-of-mission reasons ----
    'Both pilots were hit and the Sky Queen fell out of control.': 'أُصيب الطياران كلاهما وخرجت Sky Queen عن السيطرة.',
    'The tail was shot away.': 'تطاير الذيل تحت النيران.',
    'A wing was shot off.': 'انتُزع أحد الجناحين بالنيران.',
    'All four engines were knocked out.': 'تعطّلت المحركات الأربعة كلها.',
    'The Sky Queen was shot down.': 'أُسقطت Sky Queen.',
    'Your Mustang flew into the ground.': 'ارتطمت طائرتك الموستانغ بالأرض.',
    'Your Mustang was shot down.': 'أُسقطت طائرتك الموستانغ.',
    'You were seriously wounded and could no longer man your gun.': 'أُصبت إصابة بالغة ولم تعد قادرًا على تشغيل رشاشك.',
    'The formation fought its way through. Good shooting, gunner.': 'شقّ التشكيل طريقه وسط القتال. رماية موفقة أيها الرامي.',
    'The bombers made it through. Outstanding work, Blue Leader.': 'عبرت القاذفات بسلام. عمل رائع أيها القائد الأزرق.',

    // ---- debrief: medals and tiles ----
    'Air Medal': 'وسام الطيران',
    'Ace in a Day': 'آس في يوم واحد',
    'Distinguished Flying Cross': 'صليب الطيران المتميز',
    'Silver Star': 'النجمة الفضية',
    'Purple Heart': 'القلب الأرجواني',
    'Gun kills': 'إسقاطات الرشاشات',
    'ONLINE LEADERBOARD': 'لوحة الصدارة على الإنترنت',
    'You': 'أنت',

    // ---- loading screen (main.ts, Preload.ts) ----
    'Starting the engines…': 'تشغيل المحركات…',
    'Loading aircraft…': 'تحميل الطائرات…',
    'WebGL 2 is required. Please use a recent desktop browser with hardware acceleration enabled.': 'تتطلب اللعبة WebGL 2. يُرجى استخدام متصفح حديث على حاسوب مكتبي مع تفعيل التسريع العتادي.',
    'Forming up over England…': 'التجمّع في التشكيل فوق إنجلترا…',
    'Ready': 'جاهز',

    // ---- cinematics (Cinematics.ts, PhotoMode.ts) ----
    'KILL CAM': 'كاميرا الإسقاط',
    '{what} · DESTROYED': '{what} · أُسقطت',
    'BANDIT': 'طائرة معادية',
    'CLICK TO SKIP': 'انقر للتخطي',
    'MISSION COMPLETE': 'اكتملت المهمة',
    'Mission {n} · {title}': 'المهمة {n} · {title}',
    '▶ Replay best moment': '▶ إعادة أفضل لحظة',
    'REPLAY': 'إعادة',
    'BEST MOMENT': 'أفضل لحظة',
    'PHOTO MODE · WASD move · mouse look · Q/E down/up · Shift faster · wheel speed · F exit': 'وضع التصوير · WASD للتحرك · الفأرة للنظر · Q/E لأسفل/لأعلى · Shift أسرع · العجلة للسرعة · F للخروج',

    // ---- kill juice and streak meter (GameFeel.ts), lining-up warning (CombatFeedback.ts) ----
    'DOUBLE KILL': 'إسقاط مزدوج',
    'TRIPLE KILL': 'إسقاط ثلاثي',
    'QUAD KILL': 'إسقاط رباعي',
    'RAMPAGE': 'اكتساح',
    'ON FIRE ×{n}': 'مشتعل ×{n}',
    'ON FIRE  ×{n}': 'مشتعل  ×{n}',
    '{label} DOWN': 'سقوط {label}',
    'STREAK': 'السلسلة',
    'ON YOU': 'يستهدفك',
  },
  patterns: [
    // ---- banners ----
    [/^MISSION (\d+) · (.+)$/, (m, tr) => `المهمة ${m[1]} · ${upper(m[2], tr)}`],
    [/^(\d{1,2}) (JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) (\d{4})$/, (m) => `${m[1]} ${MONTHS[m[2]]} ${m[3]}`],
    [/^DAILY RUN · (.+)$/, 'الطلعة اليومية · $1'],
    [/^ROUND (\d+)$/, 'الجولة $1'],
    [/^Wave (\d+)$/, 'الموجة $1'],

    // ---- field upgrade labels ----
    [/^WAVE (\d+) CLEARED$/, 'اجتياز الموجة $1'],
    [/^WAVE (\d+) SURVIVED$/, 'النجاة من الموجة $1'],

    // ---- hangar between rounds ----
    [/^ROUND (\d+) CLEARED$/, 'اكتملت الجولة $1'],
    [/^(\d+) kills this round · \+(\d+) merit$/, (m) => `${kills(m[1])} في هذه الجولة · +${m[2]} نقطة استحقاق`],
    [/^Round (\d+) of (\d+)$/, 'الجولة $1 من $2'],
    [/^Round (\d+)$/, 'الجولة $1'],

    // ---- HUD: mission line (title in capitals · clock), formation, crew ----
    [/^(.+) · (\d+:\d{2})$/, (m, tr) => `${upper(m[1], tr)} · ${m[2]}`],
    [/^(\d+)\/(\d+) B-17s$/, 'القاذفات: $1/$2'],
    [/^Gunner wounded \((\d+)\/4\)$/, 'الرامي مصاب ($1/4)'],

    // ---- HUD objective line ----
    [/^Round (\d+)(?:\/(\d+))? — (\d+:\d{2}) · (\d+) fighters$/, (m) => `${round(m[1], m[2])} — ${m[3]} · ${fighters(m[4])}`],
    [/^Round (\d+)(?:\/(\d+))? — clear the last (\d+) fighters?$/, (m) => `${round(m[1], m[2])} — ${m[3] === '1' ? 'أسقط آخر مقاتلة' : m[3] === '2' ? 'أسقط آخر مقاتلتين' : `أسقط آخر ${fighters(m[3])}`}`],
    [/^Round (\d+)(?:\/(\d+))? — (.+)$/, (m, tr) => `${round(m[1], m[2])} — ${tr(m[3])}`],   // boss battle objective
    [/^Round (\d+)\/(\d+)$/, 'الجولة $1/$2'],
    [/^Wave (\d+) — (\d+) fighters remaining$/, (m) => `الموجة ${m[1]} — تبقّى ${fighters(m[2])}`],
    [/^Hold out — escort ETA (\d+)s$/, 'اصمدوا — المرافقة تصل خلال $1 ث'],
    [/^(\d+) enemy fighters? attacking$/, (m) => enemyFighters(m[1])],

    // ---- pilot HUD mode line ----
    [/^(MOUSE AIM|DIRECT) · (COCKPIT|CHASE)( · STALL)?$/, (m) => `${MODE[m[1]]} · ${MODE[m[2]]}${m[3] ? ' · فقدان الرفع' : ''}`],

    // ---- gunner HUD: station line, station strip, debrief tiles ----
    [new RegExp(`^${ST} — (RELOADING|BARREL HOT)$`), (m) => `${STATION[m[1]]} — ${m[2] === 'RELOADING' ? 'إعادة التلقيم' : 'السبطانة ساخنة'}`],
    [/^([1-5]) (LEFT WAIST|RIGHT WAIST|TOP TURRET|BALL TURRET|TAIL GUN)$/, (m) => `${m[1]} ${STATION_UP[m[2]]}`],
    [new RegExp(`^${ST} kills$`), (m) => `إسقاطات ${STATION[m[1]]}`],

    // ---- tips ----
    [/^Fighters attacking the (.+) — press <kbd>(.+)<\/kbd>$/, (m, tr) => `مقاتلات تهاجم موقع ${tr(m[1])} — اضغط <kbd>${m[2]}</kbd>`],
    [/^(\d+) fighters? in the (.+) arc — press <kbd>(.+)<\/kbd>$/, (m, tr) => `${fighters(m[1])} في مجال ${tr(m[2])} — اضغط <kbd>${m[3]}</kbd>`],
    [/^Graphics set to <kbd>(\w+)<\/kbd> to keep the frame rate up \(change in Settings\)$/, (m) => `ضُبطت الرسوميات على <kbd>${QUALITY[m[1]] ?? m[1]}</kbd> للحفاظ على معدل الإطارات (يمكن تغييرها من الإعدادات)`],

    // ---- kill feed (killFeedText in CombatFeedback.ts; streak bonus; bomber lost) ----
    [/^([^—]{1,40}?) destroyed — AI gunner, (.+)$/, (m, tr) => `إسقاط ${tr(m[1])} — رامٍ من طاقم «${m[2]}»`],
    [/^([^—]{1,40}?) destroyed — Escort P-51$/, (m, tr) => `إسقاط ${tr(m[1])} — مقاتلة مرافقة P-51`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed — (.+)$/, (m, tr) => `إسقاط ${tr(m[1])} — ${tr(m[2])}`],
    [/^(?!Battle group)([^—]{1,40}?) destroyed$/, (m, tr) => `إسقاط ${tr(m[1])}`],
    [/^Double — \+(\d+)$/, 'إسقاط مزدوج — +$1'],
    [/^Triple — \+(\d+)$/, 'إسقاط ثلاثي — +$1'],
    [/^(\d+)× — \+(\d+)$/, 'سلسلة $1× — +$2'],
    [/^B-17 "(.+)" going down$/, 'القاذفة B-17 «$1» تسقط'],

    // ---- debrief reasons (also with the player's bomber name in place of Sky Queen) ----
    [/^(.+\.) The crew bailed out over enemy territory\.$/, (m, tr) => `${tr(m[1])} قفز الطاقم بالمظلات فوق أراضي العدو.`],
    [/^Both pilots were hit and the (.+) fell out of control\.$/, 'أُصيب الطياران كلاهما وخرجت $1 عن السيطرة.'],
    [/^The (.+) was shot down\.$/, 'أُسقطت $1.'],
    [/^Too many bombers lost — (\d+) Fortresses went down\.$/, 'خسائر فادحة في القاذفات — سقطت $1 من القلاع الطائرة.'],

    // ---- loading ----
    [/^Loading aircraft and sounds… ([\d.]+) \/ ([\d.]+) MB$/, 'تحميل الطائرات والأصوات… $1 / $2 ميغابايت'],

    // ---- Game.drawOverlay enemy marker label (needs a tx hook + Arabic font fallback there) ----
    [/^(.+?) {2}(\d+)m$/, '$1  $2 م'],
  ],
};
export default table;
