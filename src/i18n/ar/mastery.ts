import type { PhraseTable } from '../types';
import { ltr } from './fmt';

// Arabic for Gunner Mastery (game/Mastery.ts, game/GunSights.ts, game/CrewPatches.ts,
// game/MasteryWatch.ts, ui/MasteryScreen.ts): station ranks, challenge sets, the weekly Ace
// Hunt, the Locker (sights, patches, nose art, names), the stats page and the debrief report.
// Bomber names stay in English (they are painted on the aircraft), like the other presets.

const table: PhraseTable = {
  phrases: {
    // ---------------- menu ----------------
    'Gunner Mastery': 'إتقان الرماية',
    'Station ranks, challenges and unlocks': 'رتب المواقع والتحديات والمكافآت',
    'GUNNER MASTERY': 'إتقان الرماية',
    'Gunner Mastery reward': 'مكافأة إتقان الرماية',
    'Weekly Ace Hunt · B-17 Gunner': 'صيد الآسات الأسبوعي · رامي B-17',
    'WEEKLY ACE HUNT · TOP 10': 'صيد الآسات الأسبوعي · أفضل 10',

    // ---------------- ranks ----------------
    'Trainee': 'متدرّب',
    'Gunner': 'رامٍ',
    'Seasoned Gunner': 'رامٍ متمرّس',
    'Expert': 'خبير',
    'Ace Gunner': 'رامٍ آس',
    'Master Gunner': 'سيّد الرماية',
    'Legend': 'أسطورة',

    // ---------------- tabs ----------------
    'Stations': 'المواقع',
    'Challenges': 'التحديات',
    'Locker': 'الخزانة',
    'Stats': 'الإحصاءات',

    // ---------------- stations tab ----------------
    'Rank {n}': 'الرتبة {n}',
    'Tier {n}': 'المستوى {n}',
    '{xp} / {next} XP': '{xp} / {next} خبرة',
    'Highest rank · {xp} XP': 'أعلى رتبة · {xp} خبرة',
    'accuracy {p}': 'الدقة {p}',
    'Mastery XP: 10 a kill, +10 deflection, +25 ace, +10 at 600 m or more, +5 heavy, +20 an untouched round, +20 for 25% accuracy over 100 rounds.':
      `خبرة الإتقان: ${ltr('10')} لكل إسقاط، ${ltr('+10')} للرمي الجانبي، ${ltr('+25')} للآس، ${ltr('+10')} من مسافة ${ltr('600 m')} أو أكثر، ${ltr('+5')} للثقيلة، ${ltr('+20')} لجولة بلا إصابة، ${ltr('+20')} لدقة ${ltr('25%')} على ${ltr('100')} طلقة.`,
    'Best gun: {s}, rank {n}': 'أفضل رشاش: {s}، الرتبة {n}',
    '{n} of {of} ranks': '{n} من {of} رتبة',
    'Goal reached ✓ {p}': 'تحقّق الهدف ✓ {p}',

    // ---------------- rewards ----------------
    'Gun sight': 'منظار التصويب',
    'Crew patch': 'شارة الطاقم',
    'Weekly Ace Hunt goal': 'هدف صيد الآسات الأسبوعي',

    // ---------------- challenges ----------------
    'Deflection Shooting': 'الرمي الجانبي',
    'Down fighters crossing your line of fire at 60° or more.': `أسقِط مقاتلات تعبر خط نيرانك بزاوية ${ltr('60°')} أو أكثر.`,
    'Ace Hunter': 'صائد الآسات',
    'Down aces: named Experten, Ace Hunt aces and squadron leaders.': 'أسقِط الآسات: الطيارين الخبراء المسمَّين وآسات صيد الآسات وقادة الأسراب.',
    'Untouched': 'بلا خدش',
    'Clear a round at the guns without your B-17 taking a hit.': 'أنهِ جولة على الرشاشات دون أن تُصاب طائرتك B-17.',
    'Long Shot': 'الطلقة البعيدة',
    'Down fighters 600 m away or more.': `أسقِط مقاتلات على بعد ${ltr('600 m')} أو أكثر.`,
    'Every Gun': 'كل الرشاشات',
    'Kills at every gun station: counts the station with the fewest.': 'إسقاطات من كل مواقع الرماية: يُحتسب الموقع الأقل.',
    'All tiers complete · {n}': 'اكتملت كل المستويات · {n}',

    // ---------------- weekly Ace Hunt ----------------
    'Fw 190s': 'طائرات Fw 190',
    'Bf 109s': 'طائرات Bf 109',
    'Heavy fighters (Bf 110 / Ju 88 / Me 410)': `المقاتلات الثقيلة (${ltr('Bf 110 / Ju 88 / Me 410')})`,
    'Jets and rockets (Me 262 / Me 163)': `النفاثات والصاروخيات (${ltr('Me 262 / Me 163')})`,
    'Week {n}': 'الأسبوع {n}',
    'B-17 gunners': 'رماة B-17',
    'Quarry': 'الطريدة',
    'Every gunner sortie this week counts: campaign, Survival and the other modes.': 'كل طلعة رماية هذا الأسبوع تُحتسب: الحملة والبقاء والأنماط الأخرى.',
    'Resets in': 'يُعاد بعد',
    'points': 'نقطة',
    'Goal reached': 'تحقّق الهدف',
    '{k} kills · {m} sorties this week': '{k} إسقاط · {m} طلعة هذا الأسبوع',
    'Weeks won: {n}': 'الأسابيع المكتملة: {n}',
    'Goal reward: +{m} merit every week, and the Hunt Master patch the first time.': `مكافأة الهدف: ${ltr('+{m}')} نقطة استحقاق كل أسبوع، وشارة سيّد الصيد في المرة الأولى.`,
    'Quarry kill (extra)': 'إسقاط الطريدة (إضافي)',
    'Ace kill': 'إسقاط آس',
    'Deflection kill': 'إسقاط بالرمي الجانبي',
    'Kill at 600 m or more': `إسقاط من ${ltr('600 m')} أو أكثر`,
    'Untouched round': 'جولة بلا إصابة',
    'Weekly Ace Hunt': 'صيد الآسات الأسبوعي',
    '+{n} points': `${ltr('+{n}')} نقطة`,

    // ---------------- Locker ----------------
    'EQUIPPED': 'مُجهَّز',
    'EQUIP': 'جهِّز',
    'Gun sights': 'مناظير التصويب',
    "Your reticle on the waist guns, the top turret and the ball turret's reflector glass.": 'شبكة التصويب على الرشاشين الجانبيين والبرج العلوي وزجاج العاكس في البرج الكروي.',
    'Crew patches': 'شارات الطاقم',
    'Worn on your mastery record and in the debrief.': 'تظهر على سجل إتقانك وفي التقرير بعد المهمة.',
    'Bomber names': 'أسماء القاذفة',
    // sights
    'Standard Ring': 'الحلقة القياسية',
    'Issue ring with four ticks and a centre dot.': 'حلقة رسمية بأربع علامات ونقطة في المركز.',
    'Mk IX Reflector': `العاكس ${ltr('Mk IX')}`,
    'Two rings for range and a fine centre dot, in amber.': 'حلقتان للمدى ونقطة دقيقة في المركز، بلون كهرماني.',
    'Fine Crosshair': 'التقاطع الدقيق',
    'Thin cross with range ticks, nothing else in the way.': 'تقاطع رفيع بعلامات المدى، دون أي شيء يحجب الرؤية.',
    'Gyro K-14': `الجيروسكوبي ${ltr('K-14')}`,
    'Six diamonds round a centre pipper, like the fighters carry.': 'ست معيّنات حول نقطة مركزية، كما في المقاتلات.',
    "Ace's Chevron": 'شيفرون الآس',
    'A gold chevron over the aim point and a short ring.': 'شيفرون ذهبي فوق نقطة التصويب وحلقة قصيرة.',
    'Tracer Dot': 'نقطة الخطّاط',
    'A bright green dot in a broken ring.': 'نقطة خضراء ساطعة داخل حلقة متقطعة.',
    'Deflection Rings': 'حلقات الرمي الجانبي',
    'Inner and outer lead rings with crossing-speed ticks.': 'حلقتا استباق داخلية وخارجية بعلامات لسرعة العبور.',
    // patches
    "Gunner's Wings": 'جناحا الرامي',
    'Port Watch': 'حراسة الميسرة',
    'Starboard Watch': 'حراسة الميمنة',
    'Top Hat': 'القبعة العالية',
    'Ball Bearing': 'الكرة الفولاذية',
    'Stinger': 'الإبرة',
    'Crossfire': 'النيران المتقاطعة',
    'Hunt Master': 'سيّد الصيد',

    // ---------------- stats ----------------
    'Hits': 'الإصابات',
    'Rounds fired': 'الطلقات المُطلقة',
    'Time at the gun': 'الوقت على الرشاش',
    'All stations': 'كل المواقع',
    'Your best gun: {s}, {p} accuracy.': 'أفضل رشاش لديك: {s}، بدقة {p}.',
    'Deflection': 'جانبي',
    'Aces': 'آسات',
    '600 m+': `${ltr('600')} م فأكثر`,
    'Heavies': 'ثقيلة',
    'Untouched rounds': 'جولات بلا إصابة',
    'Best sortie': 'أفضل طلعة',
    'Rounds and hits are counted since Gunner Mastery arrived; earlier kills carry over from your service record.': 'تُحتسب الطلقات والإصابات منذ إضافة إتقان الرماية؛ أما الإسقاطات السابقة فمنقولة من سجل خدمتك.',

    // ---------------- debrief ----------------
    'RANK UP': 'ترقية',
    '{k} kills · {d} deflection · {a} aces': '{k} إسقاط · {d} جانبي · {a} آس',
  },
};

export default table;
