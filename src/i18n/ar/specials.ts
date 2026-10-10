import type { PhraseTable, Pattern } from '../types';
import { ltr, counted } from './fmt';

// Arabic for the mid-round special events (game/SpecialEvents.ts: the ace squadron, the
// Zerstörer wave, the rocket barrage; panel and tags drawn by ui/SpecialHud.ts) and the enemy
// tactics (world/Tactics.ts: radar cue labels, gunner hints, radio calls). The aces are
// fictional; their names are transliterated, the ranks are the Arabic ranks used for the Ace
// Hunt aces (ar/missions.ts).

const RANK: Record<string, string> = { hauptmann: 'النقيب', major: 'الرائد', oberleutnant: 'الملازم أول' };
const SHORT: Record<string, string> = { 'hptm.': 'النقيب', 'maj.': 'الرائد', 'oblt.': 'الملازم أول' };
const FIRST: Record<string, string> = { otto: 'أوتو', wilhelm: 'فيلهلم', ernst: 'إرنست', kurt: 'كورت', johann: 'يوهان' };
const LAST: Record<string, string> = {
  kessler: 'كيسلر', brandauer: 'برانداور', falkenrath: 'فالكنرات', reinholt: 'راينهولت', steinbrecher: 'شتاينبريشر',
};
const R_RANK = '(Hauptmann|Major|Oberleutnant)';
const R_SHORT = '(Hptm\\.|Maj\\.|Oblt\\.)';
const R_FIRST = `(${Object.keys(FIRST).join('|')})`;
const R_LAST = `(${Object.keys(LAST).join('|')})`;
const rank = (s: string) => RANK[s.toLowerCase()];
const short = (s: string) => SHORT[s.toLowerCase()];
const last = (s: string) => LAST[s.toLowerCase()];
const full = (f: string, l: string) => `${FIRST[f.toLowerCase()]} ${last(l)}`;
const victories = (n: string) => counted(n, 'انتصار واحد', 'انتصاران', 'انتصارات', 'انتصاراً');
const re = (s: string, flags = 'i') => new RegExp(`^${s}$`, flags);
const SIDE: Record<string, string> = { RIGHT: 'الأيمن', LEFT: 'الأيسر' };

const patterns: Pattern[] = [
  // ---- the ace squadron ----
  [re(`ACE SQUADRON · ${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `سرب الآسات · ${rank(m[1])} ${full(m[2], m[3])} · ${victories(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST} · (\\d+) VICTORIES`), (m) => `${rank(m[1])} ${full(m[2], m[3])} · ${victories(m[4])}`],
  [re(`${R_RANK} ${R_FIRST} ${R_LAST}`), (m) => `${rank(m[1])} ${full(m[2], m[3])}`],
  [re(`ACE · (\\d+) VICTORIES`), (m) => `آس · ${victories(m[1])}`],
  [re(`${R_LAST}'s Staffel`), (m) => `سرب ${last(m[1])}`],
  [re(`${R_SHORT} ${R_LAST} · (\\d+)`), (m) => `${short(m[1])} ${last(m[2])} · ${m[3]}`],
  [re(`${R_SHORT} ${R_LAST} got away`), (m) => `أفلت ${short(m[1])} ${last(m[2])}`],
  [re(`${R_SHORT} ${R_LAST} shot down`), (m) => `أُسقط ${short(m[1])} ${last(m[2])}`],
  [re(`${R_SHORT} ${R_LAST}`), (m) => `${short(m[1])} ${last(m[2])}`],
  [re(R_LAST), (m) => last(m[1])],   // the ace as the radio speaker
  [re('(.+) \\(yellow nose\\)'), (m, tr) => `${tr(m[1])} (أنف أصفر)`],
  [re('\\+(\\d+) WINGMEN'), (m) => `معه ${counted(m[1], 'مرافق واحد', 'مرافقان', 'مرافقين', 'مرافقاً')}`],
  [re(`Yellow noses, twelve o'clock high! That's ${R_LAST}'s Staffel — (\\d+) kills!`),
    (m) => `أنوف صفراء، الساعة الثانية عشرة من الأعلى! إنه سرب ${last(m[1])} — ${counted(m[2], 'إسقاط واحد', 'إسقاطان', 'إسقاطات', 'إسقاطاً')}!`],
  [re(`${R_LAST} is breaking off — the yellow noses are heading home\\.`), (m) => `${last(m[1])} ينسحب — الأنوف الصفراء عائدة إلى قواعدها.`],
  [re(`You got ${R_LAST}! The whole group saw him go down!`), (m) => `أسقطتَ ${last(m[1])}! رأته المجموعة كلها يهوي!`],
  [re(`Somebody got ${R_LAST}! Scratch one Experte!`), (m) => `أحدهم أسقط ${last(m[1])}! شطبنا آساً من آساتهم!`],
  // the ace's radio taunts (subtitle only)
  [re(`Viermots ahead\\. ${R_LAST} here — the fat one in the middle is mine\\. Horrido!`), (m) => `قاذفات رباعية أمامنا. هنا ${last(m[1])} — السمينة في الوسط لي. هوريدو!`],
  [/^Achtung, Amis\. Number (\d+) is flying in that box\. Pauke, pauke!$/, 'انتباه أيها الأمريكان. رقم $1 يطير في ذلك التشكيل. باوكه، باوكه!'],

  // ---- Zerstörer wave and rocket barrage ----
  [/^(\d+) HEAVY FIGHTERS WITH ROCKETS$/, (m) => `${counted(m[1], 'مقاتلة ثقيلة واحدة', 'مقاتلتان ثقيلتان', 'مقاتلات ثقيلة', 'مقاتلة ثقيلة')} مسلّحة بالصواريخ`],
  [/^(\d+) \/ (\d+) LEFT$/, (m) => `بقي ${ltr(`${m[1]} / ${m[2]}`)}`],
  [/^(\d+) LAUNCHERS?$/, (m) => counted(m[1], 'حاملة صواريخ واحدة', 'حاملتا صواريخ', 'حاملات صواريخ', 'حاملة صواريخ')],

  // ---- enemy tactics ----
  [/^HEAD-ON ×(\d+)$/, (m) => `وجهاً لوجه ${ltr(`×${m[1]}`)}`],
  [/^109s diving on (.+)! She's out of formation — they're going for her!$/, 'طائرات 109 تنقضّ على «$1»! لقد خرجت من التشكيل — إنهم يلاحقونها!'],
  [/^(.+) hanging back out of range — he's got rocket tubes! He'll lob them in from a kilometre!$/,
    (m, tr) => `${tr(m[1])} تتريّث خارج المدى — معها أنابيب صواريخ! ستقذفها من على بُعد كيلومتر!`],
  [/^Zerstörers! Twin-engine destroyers forming up at (.+) — they're carrying rockets!$/,
    (m, tr) => `مدمّرات! مقاتلات ثقيلة ثنائية المحرّك تتشكّل عند ${tr(m[1])} — إنها تحمل صواريخ!`],
  [/^Zerstörer formation on the <b>(RIGHT|LEFT)<\/b> — <kbd>(\d)<\/kbd> (right|left) waist · break them up before they fire$/,
    (m) => `تشكيل مدمّرات على <b>الجانب ${SIDE[m[1]]}</b> — <kbd>${m[2]}</kbd> الجانب ${SIDE[m[3].toUpperCase()]} · فرّقها قبل أن تطلق`],
];

const table: PhraseTable = {
  phrases: {
    // ---- panel, banners, tips and feed ----
    'SPECIAL EVENT': 'حدث خاص',
    'Yellow noses — bring down the Staffelkapitän': 'الأنوف الصفراء — أسقِط قائد السرب',
    'The aces are coming head-on — <b>TOP TURRET</b> <kbd>3</kbd> · bring down the leader': 'الآسات قادمون وجهاً لوجه — <b>البرج العلوي</b> <kbd>3</kbd> · أسقِط قائدهم',
    'ALONE': 'وحيد',
    'ACE': 'آس',
    'Ace down': 'سقط الآس',
    'Zerstörer wave': 'موجة المدمّرات',
    'Break up the formation before the salvos land': 'فرّق التشكيل قبل أن تنهمر رشقات الصواريخ',
    'Zerstörer wave broken up': 'تفرّقت موجة المدمّرات',
    'Rocket barrage': 'وابل الصواريخ',
    'Shoot down the launchers standing off at 1 km': 'أسقِط حاملات الصواريخ المتربّصة على بُعد 1 كم',
    'SHOOT DOWN THE LAUNCHERS': 'أسقِط حاملات الصواريخ',
    'Launchers on <b>BOTH BEAMS</b> — <kbd>1</kbd> left · <kbd>2</kbd> right waist': 'حاملات الصواريخ على <b>الجانبين</b> — <kbd>1</kbd> الجانب الأيسر · <kbd>2</kbd> الجانب الأيمن',
    'Rocket barrage broken up': 'تحطّم وابل الصواريخ',
    'LAUNCHER': 'حاملة صواريخ',

    // ---- radio ----
    "That's the last of the destroyers! Nice work, boys.": 'هذه آخر المدمّرات! عمل رائع يا شباب.',
    "Launchers are down! That's the end of the rockets.": 'سقطت حاملات الصواريخ! انتهى أمر الصواريخ.',
    "They're out of rockets — the heavies are heading home.": 'نفدت صواريخهم — الثقيلة عائدة إلى قواعدها.',
    'Close up, Kinder. We go through them together — and nobody turns away before me.': 'تقاربوا يا أولاد. نخترقهم معاً — ولا أحد ينسحب قبلي.',
    'Indianer at the bombers? Let them come. Today I paint another bar on my rudder.': 'مقاتلات معادية عند القاذفات؟ دعوها تأتي. اليوم أرسم علامة أخرى على دفّة ذيلي.',

    // ---- enemy tactics: radar cues ----
    'PINCER': 'كمّاشة',
    'KOMET': 'كوميت',
    'JET': 'نفّاثة',
    'ROCKETS': 'صواريخ',
    'ZERSTÖRER': 'مدمّرات',
    'TOP COVER': 'غطاء علوي',
    'BARRAGE': 'وابل',

    // ---- enemy tactics: radio and gunner hints ----
    "They're forming up for a head-on pass! Twelve o'clock high — a whole line of them!": 'يتشكّلون لهجوم وجهاً لوجه! الساعة الثانية عشرة من الأعلى — صفّ كامل منهم!',
    "Schwarm forming up dead ahead, twelve o'clock high! Head-on pass coming!": 'رباعية مقاتلات تتشكّل أمامنا مباشرة، الساعة الثانية عشرة من الأعلى! هجوم وجهاً لوجه قادم!',
    "Head-on attack forming at <b>12 O'CLOCK HIGH</b> — take the <b>TOP TURRET</b> <kbd>3</kbd>": 'هجوم وجهاً لوجه يتشكّل عند <b>الساعة الثانية عشرة من الأعلى</b> — خذ <b>البرج العلوي</b> <kbd>3</kbd>',
    "Two pairs splitting up — one each side! Three o'clock and nine o'clock, they're going to hit us together!": 'زوجان ينفصلان — واحد على كل جانب! الساعة الثالثة والساعة التاسعة، سيضربوننا معاً!',
    'Pincer from <b>BOTH BEAMS</b> — pick a waist gun: <kbd>1</kbd> left · <kbd>2</kbd> right': 'كمّاشة من <b>الجانبين</b> — اختر مدفعاً جانبياً: <kbd>1</kbd> الأيسر · <kbd>2</kbd> الأيمن',
    "Komet! Rocket fighter climbing up from six o'clock low — he's fast!": 'كوميت! مقاتلة صاروخية تتسلّق من الساعة السادسة من الأسفل — إنها سريعة!',
    "They're turning in — rockets!": 'إنها تستدير نحونا — صواريخ!',
    'Here come the 109s — straight down out of the sun!': 'ها هي طائرات 109 — تنقضّ مباشرة من جهة الشمس!',
    'Flak coming up — heavy guns below us. Hold steady.': 'نيران مضادة صاعدة — مدافع ثقيلة تحتنا. اثبتوا.',
    "Me 163 climbing from <b>6 O'CLOCK LOW</b> — <b>BALL</b> <kbd>4</kbd> or <b>TAIL</b> <kbd>5</kbd>": 'Me 163 تتسلّق من <b>الساعة السادسة من الأسفل</b> — <b>البرج الكروي</b> <kbd>4</kbd> أو <b>الذيل</b> <kbd>5</kbd>',
    "Jet coming up from six o'clock! Never seen anything that fast!": 'نفّاثة قادمة من الساعة السادسة! لم أرَ شيئاً بهذه السرعة قط!',
    "109s staying up high — top cover. They'll pounce on anybody who drops out of formation!": 'طائرات 109 تبقى في الأعلى — غطاء علوي. ستنقضّ على كل من يخرج من التشكيل!',
  },
  patterns,
};
export default table;
