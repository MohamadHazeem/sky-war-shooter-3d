import type { PhraseTable, Pattern } from '../types';
import { counted, ltr } from './fmt';

// Arabic for the skill tree (game/Skills.ts, game/SkillRuntime.ts, ui/SkillTreeScreen.ts): branch
// and node names and descriptions, the blueprint sheet, counters, respec, the hangar section, the
// title menu entry, the in-flight effects and the debrief's skill-point line.

const pts = (n: string) => counted(n, 'نقطة واحدة', 'نقطتان', 'نقاط', 'نقطة');

const patterns: Pattern[] = [
  [/^(\d+) pts?$/, (m) => pts(m[1])],
  [/^The crew patched her up · \+(\d+)% integrity$/, (m) => `رمّم الطاقم الطائرة · السلامة ${ltr(`+${m[1]}%`)}`],
];

const table: PhraseTable = {
  phrases: {
    // ---------------- branches ----------------
    'Marksman': 'الرامي الماهر',
    'Put every round where it counts': 'ضع كل طلقة حيث تُحدث فرقاً',
    'Gunnery Sergeant': 'رقيب المدفعية',
    'Keep the guns hot and talking': 'أبقِ الرشاشات ساخنة لا تصمت',
    'Survivor': 'الناجي',
    'Bring her home in one piece': 'أعِدها إلى الديار سالمة',

    // ---------------- nodes ----------------
    'Computing Sight': 'المهداف الحاسب',
    "The lead indicator computes with your gun's true muzzle velocity (upgrades and mods included). +6% hit radius.":
      `يحسب مؤشر الاستباق بسرعة الفوهة الحقيقية لسلاحك (بما فيها التحسينات والتعديلات). نصف قطر الإصابة ${ltr('+6%')}.`,
    'Steady Eye': 'العين الثابتة',
    '+30% aim assist strength.': `قوة مساعد التصويب ${ltr('+30%')}.`,
    'Vital Points': 'النقاط الحيوية',
    'Critical hits: +30% damage on cockpits and engines.': `إصابات حرجة: الضرر ${ltr('+30%')} على قمرات القيادة والمحرّكات.`,
    'Eagle Eye': 'عين الصقر',
    '+12% hit radius, −20% spread.': `نصف قطر الإصابة ${ltr('+12%')}، والتشتّت ${ltr('−20%')}.`,
    'Sweet Spot': 'المَقتَل',
    'Boss weak points are 30% larger, armour breaks one part sooner and the hull takes double chip damage before the breach.':
      'نقاط ضعف الطائرات العملاقة أكبر بنسبة 30%، وينكسر الدرع قبل تدمير جزء واحد مما يلزم عادة، ويتلقّى الهيكل ضعف الضرر الطفيف قبل الاختراق.',
    'Every 10th round is a guaranteed hit: it flies true onto the bandit nearest your aim (within 8°).':
      'كل طلقة عاشرة إصابة مضمونة: تنطلق مستقيمة نحو الطائرة المعادية الأقرب إلى تصويبك (ضمن 8°).',
    'Barrel Discipline': 'انضباط السبطانة',
    '−15% barrel heat.': `حرارة السبطانة ${ltr('−15%')}.`,
    'Buffer Tuning': 'ضبط المخمِّد',
    '+8% rate of fire.': `معدّل الإطلاق ${ltr('+8%')}.`,
    'Overdrive Drill': 'تمرين الطاقة القصوى',
    'Overdrive lasts 40% longer (8 s → 11.2 s).': 'تدوم الطاقة القصوى أطول بنسبة 40% (من 8 ث إلى 11.2 ث).',
    'Ready Rack': 'رفّ الذخيرة الجاهزة',
    'All ability cooldowns −20% (Mustangs, Overdrive, Focus).': `زمن إعادة شحن كل القدرات ${ltr('−20%')} (موستانغ، الطاقة القصوى، التركيز).`,
    'Cold Nerves': 'أعصاب باردة',
    'Focus lasts 50% longer (3 s → 4.5 s).': 'يدوم التركيز أطول بنسبة 50% (من 3 ث إلى 4.5 ث).',
    'Iron Lungs': 'رئتان من حديد',
    'The barrel never overheats: at full heat it keeps firing at 75% rate. Every kill during Overdrive tops it up by 1 s.':
      'لا تحمى السبطانة أبداً: عند أقصى حرارة تواصل الإطلاق بمعدّل 75%. وكل إسقاط خلال الطاقة القصوى يمدّها ثانية واحدة.',
    'Extra Plating': 'تصفيح إضافي',
    '−10% damage taken.': `الضرر المتلقّى ${ltr('−10%')}.`,
    'Flak Suits': 'سترات الشظايا',
    'Crew wound chance −40%, yours included.': `احتمال إصابة أفراد الطاقم ${ltr('−40%')}، وأنت منهم.`,
    'Damage Control': 'السيطرة على الأضرار',
    'Faster field repairs: +50% from kills and between rounds, and the crew patches 0.4% a second after 8 s without a hit.':
      `إصلاحات ميدانية أسرع: ${ltr('+50%')} من الإسقاطات وبين الجولات، ويرمّم الطاقم 0.4% في الثانية بعد 8 ث بلا إصابة.`,
    'Second Wind': 'النَّفَس الثاني',
    'Once per mission, when a vital part drops below 25%, the crew patches your aircraft back up by 40%.':
      'مرة واحدة في كل مهمة، حين ينخفض جزء حيوي دون 25%، يرمّم الطاقم طائرتك بنسبة 40%.',
    'Fire Drill': 'تمرين الإطفاء',
    'Extinguishers work 95% of the time (from 75%) and every engine carries two bottles.':
      'تنجح طفايات الحريق في 95% من المرات (بدلاً من 75%) ويحمل كل محرّك أسطوانتين.',
    'Fortress': 'الحصن',
    'The first heavy cannon hit each round is ignored: it glances off the armour plate.':
      'تُلغى أول إصابة بمدفع ثقيل في كل جولة: ترتدّ عن الصفيحة المدرّعة.',

    // ---------------- blueprint sheet (SkillTreeScreen.ts) ----------------
    'WAR DEPARTMENT · ARMY AIR FORCES': 'وزارة الحربية · القوات الجوية للجيش',
    'TECHNICAL MANUAL TM 1-SK · AERIAL GUNNERY QUALIFICATION': 'الدليل الفني TM 1-SK · تأهيل الرماية الجوية',
    'Skills': 'المهارات',
    'Long-term qualifications. Points come with every promotion and every {n} XP past Major.':
      'مؤهلات طويلة الأمد. تأتي النقاط مع كل ترقية، ومع كل {n} خبرة بعد رتبة الرائد.',
    'DRAWING NO. SK-1944 · SHEET 1 OF 1 · SCALE NONE': 'رسم رقم SK-1944 · اللوحة 1 من 1 · بلا مقياس',
    'SKILLS · LONG-TERM QUALIFICATIONS': 'المهارات · مؤهلات طويلة الأمد',
    'SKILL POINT<br/>AVAILABLE': 'نقطة مهارة<br/>متاحة',
    'SKILL POINTS<br/>AVAILABLE': 'نقاط مهارة<br/>متاحة',
    'Earned <b>{e}</b> · spent <b>{s}</b> of {t}': 'المكتسبة <b>{e}</b> · المنفقة <b>{s}</b> من {t}',
    'Next point at <b>{n} XP</b> ({m} to go)': 'النقطة التالية عند <b>{n} خبرة</b> (بقي {m})',
    'Refund every skill point. Costs merit.': 'استرداد كل نقاط المهارة. يكلّف نقاط استحقاق.',
    'Respec': 'إعادة التوزيع',
    'Respec · {n} merit': 'إعادة التوزيع · {n} استحقاق',
    'Confirm respec · {n} merit': 'تأكيد إعادة التوزيع · {n} استحقاق',
    'Qualified': 'مؤهَّل',
    'Available': 'متاح',
    'Short of points': 'النقاط لا تكفي',
    'Hover a card for details · click twice to qualify': 'مرّر المؤشر فوق بطاقة لرؤية التفاصيل · انقر مرتين للتأهّل',
    'QUALIFIED': 'مؤهَّل',
    'AVAILABLE': 'متاح',
    'NOT ENOUGH POINTS': 'النقاط لا تكفي',
    'LOCKED': 'مقفلة',
    'CONFIRM · {pts}': 'تأكيد · {pts}',
    'QUALIFY · {pts}': 'تأهَّل · {pts}',
    'NEEDS {pts}': 'المطلوب: {pts}',
    '{name}: {desc} {state}, costs {pts}': '{name}: {desc} {state}، الكلفة {pts}',
    'CAPSTONE': 'المهارة الختامية',
    'Requires: {list}': 'يتطلّب: {list}',
    'or': 'أو',
    'and': 'و',
    'click twice to qualify': 'انقر مرتين للتأهّل',

    // ---------------- title menu, in flight and debrief (SkillRuntime.ts, ServiceRecord.ts) ----------------
    '1 point to spend': 'نقطة واحدة للإنفاق',
    '{n} points to spend': 'نقاط للإنفاق: {n}',
    '{n}/{total} qualified': 'المؤهَّلة: {n}/{total}',
    'skill points waiting': 'نقاط مهارة بانتظارك',
    'SECOND WIND': 'النَّفَس الثاني',
    "Patched the worst of it, skipper! She'll hold!": 'رمّمنا أسوأ ما فيها أيها القائد! ستصمد!',
    "You're streaming smoke but still flying, Blue two. Stay in it!": 'يتصاعد منك الدخان لكنك ما زلت تطير يا أزرق اثنان. ابقَ في المعركة!',
    'That one bounced right off the armour plate!': 'تلك ارتدّت عن الصفيحة المدرّعة!',
    'FORTRESS — heavy hit glanced off': 'الحصن — ارتدّت الإصابة الثقيلة',
    '+1 skill point': `${ltr('+1')} نقطة مهارة`,
    '+{n} skill points': `نقاط مهارة ${ltr('+{n}')}`,
    'Spend in Skills (title menu or hangar)': 'أنفِقها في المهارات (من القائمة الرئيسية أو الحظيرة)',
  },
  patterns,
};
export default table;
