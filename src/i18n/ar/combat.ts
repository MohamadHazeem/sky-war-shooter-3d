import type { PhraseTable } from '../types';

// Arabic for the combat texts, keyed by the exact English shown in game.
// Covers: mid-round bonus objectives and their HUD card (Objectives, MidRound, ObjectiveCard),
// random in-flight events (RandomEvents), the boss battle and its canvas HUD (BossBattle,
// BossHud, BossShip names) and the radar plot (Radar).
const SHIPS = 'Walküre|Donnerkeil|Brunhilde|Götterdämmerung';

const table: PhraseTable = {
  phrases: {
    // ---------- bonus objective card ----------
    'BONUS OBJECTIVE': 'هدف إضافي',
    '+{n} MERIT': '+{n} نقطة استحقاق',
    'COMPLETE · +{n} MERIT': 'أُنجز · +{n} نقطة استحقاق',
    'FAILED': 'فشل',
    'Bonus: {title}': 'مكافأة: {title}',
    '{n} m': '{n} م',
    '{n} km': '{n} كم',
    'out of time': 'انتهى الوقت',
    'no target': 'لا يوجد هدف',

    // Protect the <bomber>
    'Protect the {name}': 'احمِ {name}',
    'She\'s shot up and the fighters smell blood. Keep her flying.': 'أُصيبت إصابات بالغة والمقاتلات تشمّ رائحة الدم. أبقِها في الجو.',
    '{name} went down': 'سقطت {name}',
    'hold {n} s': 'اصمد {n} ث',

    // Down the pathfinder
    'Down the pathfinder': 'أسقِط طائرة التوجيه',
    'A marked Ju 88 is shadowing the box and calling in the fighters. Shoot it down before it gets away.': 'طائرة Ju 88 مُعلَّمة تتعقّب التشكيل وتوجّه المقاتلات نحونا. أسقِطها قبل أن تفلت.',
    'he got away': 'أفلت منّا',
    'PATHFINDER': 'طائرة التوجيه',
    'Ju 88 pathfinder': 'طائرة التوجيه Ju 88',
    '{n}% left': 'تبقّى {n}%',
    'down': 'أُسقطت',

    // Cool barrel
    'Cool barrel': 'سبطانة باردة',
    'Down 3 fighters without overheating your gun. Short bursts.': 'أسقِط 3 مقاتلات دون أن يسخن مدفعك. رشقات قصيرة.',
    'barrel overheated': 'سخنت السبطانة',
    '{n} / {m} kills': '{n} / {m} إسقاطات',

    // Clear the tail
    'Clear the tail': 'أمِّن الذيل',
    'Two fighters are boring in from six o\'clock. Take the tail gun ({key}) and get them both.': 'مقاتلتان تنقضّان من الساعة السادسة. تولَّ مدفع الذيل ({key}) وأسقِطهما معًا.',
    'Two bandits are working over the box from six o\'clock. Get them both.': 'طائرتان معاديتان تنهالان على التشكيل من الساعة السادسة. أسقِطهما معًا.',
    'SIX O\'CLOCK': 'الساعة السادسة',

    // Sharpshooter
    'Sharpshooter': 'القنّاص',
    'Down 3 fighters at more than {range} m. Lead them early.': 'أسقِط 3 مقاتلات من مسافة تزيد على {range} م. صوّب أمامها مبكرًا.',
    '{n} / {m} long kills': '{n} / {m} إسقاطات بعيدة',

    // Hold the box
    'Hold the box': 'حافظ على التشكيل',
    'No Fortress goes down for the rest of this round.': 'لا تسقط أي قلعة طائرة حتى نهاية هذه الجولة.',
    'a B-17 went down': 'سقطت قاذفة B-17',
    '{n} s to go': 'تبقّى {n} ث',

    // ---------- random events: rewards and tips ----------
    'Engine fire out': 'أُخمد حريق المحرك',
    'Gun cleared': 'حُرِّر المدفع',
    'Gun cleared — back in action': 'حُرِّر المدفع — عاد إلى العمل',
    'Oxygen restored': 'عاد الأكسجين',
    'Spare bottle on — breathe easy': 'فُتحت الأسطوانة الاحتياطية — تنفّس براحة',
    'The radio operator cleared the jam for you': 'حرّر عامل اللاسلكي انحشار المدفع بدلًا منك',
    'Guns recharged': 'أُعيد تلقيم المدافع',
    'The waist gunner plugged you into a walk-around bottle': 'وصلك رامي الجانب بأسطوانة أكسجين محمولة',
    'Emergency oxygen on': 'تم تشغيل أكسجين الطوارئ',
    '{name} protected': 'تمت حماية {name}',

    // random events: prompt under the sight
    'ENGINE FIRE · NUMBER {n}': 'حريق في المحرك · رقم {n}',
    'SPREADING': 'ينتشر',
    '<kbd>X</kbd> HOLD OR MASH — EXTINGUISHER': '<kbd>X</kbd> اضغط باستمرار أو بسرعة — المطفأة',
    'The wing is burning': 'الجناح يحترق',
    'Put it out before it spreads': 'أطفئه قبل أن ينتشر',
    'GUNS': 'المدافع',
    '{gun} JAMMED': 'انحشار · {gun}',
    '<kbd>R</kbd> TAP FAST OR HOLD — CLEAR THE JAM': '<kbd>R</kbd> انقر بسرعة أو اضغط باستمرار — حرِّر الانحشار',
    'Work the charging handle': 'شغّل مقبض التلقيم',
    'Your other guns still fire — or go back with {key}': 'مدافعك الأخرى ما زالت تعمل — أو عُد إليه بالمفتاح {key}',
    'OXYGEN FAILURE': 'عطل في الأكسجين',
    '<kbd>O</kbd> OPEN THE SPARE BOTTLE': '<kbd>O</kbd> افتح الأسطوانة الاحتياطية',
    'You are blacking out': 'أنت تفقد الوعي',
    'STRAGGLER · {name}': 'قاذفة متخلّفة · {name}',
    'COVER HER — DOWN THE FIGHTERS ON HER': 'احمِها — أسقِط المقاتلات التي تلاحقها',
    '{n} fighter on her · hold {s} s': '{n} مقاتلة تلاحقها · اصمد {s} ث',
    '{n} fighters on her · hold {s} s': '{n} مقاتلات تلاحقها · اصمد {s} ث',

    // gun stations (jammed-gun prompt)
    'Left Waist': 'الجانب الأيسر',
    'Right Waist': 'الجانب الأيمن',
    'Top Turret': 'البرج العلوي',
    'Ball Turret': 'البرج الكروي',
    'Tail Gun': 'مدفع الذيل',

    // ---------- boss battle ----------
    'Walküre': 'فالكوره',
    'Donnerkeil': 'دونركايل',
    'Brunhilde': 'برونهيلده',
    'Götterdämmerung': 'غوتردمرونغ',
    'Luftkreuzer': 'الطرّاد الجوي',
    'Schlachtkreuzer': 'طرّاد المعركة',
    'LUFTKREUZER-GESCHWADER': 'سرب الطرّادات الجوية',
    'SCHLACHTGESCHWADER GÖTTERDÄMMERUNG': 'سرب المعركة غوتردمرونغ',
    'BATTLE GROUP · FLAGSHIP GÖTTERDÄMMERUNG': 'مجموعة قتالية · السفينة القائدة غوتردمرونغ',
    'BATTLE GROUP INBOUND': 'مجموعة قتالية تقترب',
    'LUFTKREUZER': 'الطرّادات الجوية',
    'BATTLE GROUP DESTROYED': 'دُمّرت المجموعة القتالية',
    'Shoot the bracketed <kbd>weak points</kbd> — turrets, engines, fuel tank, bridge — to breach the armour': 'أطلق النار على <kbd>نقاط الضعف</kbd> المؤطّرة — الأبراج والمحركات وخزان الوقود وجسر القيادة — لاختراق الدرع',
    'Armour plate — bullets bounce off the hull. Hit the <kbd>weak points</kbd> first': 'صفائح مدرّعة — الرصاص يرتدّ عن الهيكل. اضرب <kbd>نقاط الضعف</kbd> أولًا',
    'A <kbd>charging</kbd> weapon glows red — destroy it before it fires (it takes extra damage while charging)': 'السلاح <kbd>المشحون</kbd> يتوهّج بالأحمر — دمّره قبل أن يطلق (يتلقّى ضررًا إضافيًا أثناء الشحن)',

    // boss objective line
    'Destroy the battle group — {n} warships': 'دمّر المجموعة القتالية — {n} سفن حربية',
    'Battle group — {n} warships · {p}%': 'المجموعة القتالية — {n} سفن حربية · {p}%',
    'Battle group — {n} warship · {p}%': 'المجموعة القتالية — {n} سفينة حربية · {p}%',
    'Battle group destroyed': 'دُمّرت المجموعة القتالية',
    'Battle group destroyed — clear the last fighters': 'دُمّرت المجموعة القتالية — أسقِط آخر المقاتلات',

    // boss flash text and score pop-ups
    'ENRAGED': 'هائجة',
    'LAST STAND': 'الصمود الأخير',
    'ARMOUR BREACHED': 'اختُرق الدرع',
    '{ship} — hit the hull!': '{ship} — اضرب الهيكل!',
    '+400  ARMOUR BREACHED': '+400  اختُرق الدرع',
    '+{pts}  {what} DESTROYED': '+{pts}  دُمّر {what}',
    '{name} IS GOING DOWN': '{name} تسقط',
    'The battle group is finished': 'انتهت المجموعة القتالية',
    '{n} warship left': 'تبقّت {n} سفينة حربية',
    '{n} warships left': 'تبقّت {n} سفن حربية',

    // weak-point names (pop-ups) and HUD tags
    'TURRET': 'البرج',
    'FLAK 88': 'مدفع فلاك 88',
    'ROCKETS': 'الصواريخ',
    'ENGINE': 'المحرك',
    'FUEL': 'الوقود',
    'BRIDGE': 'جسر القيادة',
    'GUN': 'مدفع',
    'FLAK': 'فلاك',
    'RKT': 'صواريخ',
    'ENG': 'محرك',
    'BRDG': 'جسر',

    // boss HUD
    'DESTROYED': 'دُمّرت',
    'BREACHED': 'مخترَقة',
    'ARMOURED {n}/{m}': 'مدرّعة {n}/{m}',
    'ARMOURED': 'مدرّعة',
    'CHARGING': 'تشحن',
    'HULL EXPOSED': 'الهيكل مكشوف',
    '{name} IS TURNING TO RAM': '{name} تستدير للصدم',
    'RAMMING RUN — SHOOT HER DOWN': 'هجوم صدم — أسقِطها!',
    '{n}s': '{n} ث',

    // ---------- radar ----------
    'HEADING': 'الاتجاه',
    'close map': 'إغلاق الخريطة',
    'map': 'الخريطة',
    '{n} FIGHTERS  {s}s': '{n} مقاتلات  {s} ث',
  },
  patterns: [
    // MidRound.reward -> ui.feed: '<label> — +N merit' (label: 'Engine fire out', 'Bonus: <title>', ...)
    [/^(.+) — \+(\d+) merit$/, (m, tr) => `${tr(m[1])} — +${m[2]} نقطة استحقاق`],
    // Objectives -> ui.tip / ui.feed
    [/^Fighters at six o'clock — press <kbd>(.+?)<\/kbd> for the TAIL gun$/, 'مقاتلات عند الساعة السادسة — اضغط <kbd>$1</kbd> لمدفع الذيل'],
    [/^Long shot — (\d+) m$/, 'إصابة بعيدة — $1 م'],
    [/^Too close for Sharpshooter — (\d+) m \(need (\d+) m\)$/, 'قريبة جدًا لهدف القنّاص — $1 م (المطلوب $2 م)'],
    // BossBattle -> ui.banner / ui.feed
    [/^\+(\d+) · MERIT \+(\d+)$/, '+$1 · نقاط الاستحقاق +$2'],
    [new RegExp(`^(${SHIPS}) ENRAGED$`), (m, tr) => `${tr(m[1])} هائجة`],
    [new RegExp(`^(Luftkreuzer|Schlachtkreuzer) (${SHIPS}) destroyed — \\+(\\d+)$`), (m, tr) => `دُمّر ${tr(m[1])} ${tr(m[2])} — +${m[3]}`],
    [/^Battle group destroyed — \+(\d+)$/, 'دُمّرت المجموعة القتالية — +$1'],
  ],
};
export default table;
