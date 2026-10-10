import type { PhraseTable, Pattern } from '../types';
import { counted, ltr } from './fmt';

// Arabic for the dynamic campaign: the campaign map and its gauges, intelligence reports, the
// next-operation and side-raid cards, the tour summary, the debrief report and the briefing line
// (ui/CampaignMap.ts, game/CampaignState.ts), and the side raids generated from templates
// (game/SideRaids.ts): their titles, targets, briefings, objectives, radio calls and results.
// Report lines are saved in English with the campaign, so they are matched by the patterns below.

// Raid target cities (also the briefing route chart's labels, which are looked up upper-cased)
const CITY: Record<string, string> = {
  Hamm: 'هام', Münster: 'مونستر', Osnabrück: 'أوسنابروك', Hannover: 'هانوفر', Rheine: 'راينه', Twente: 'تفينته',
  Oldenburg: 'أولدنبورغ', Gelsenkirchen: 'غيلزنكيرشن', Leuna: 'لوينا', Misburg: 'ميسبورغ', Wilhelmshaven: 'فيلهلمسهافن',
  Kiel: 'كيل', Emden: 'إمدن', Brunswick: 'براونشفايغ', Kassel: 'كاسل', Gotha: 'غوتا',
};
// Raid target names (the pilot raids' targets and the briefings use them lower-cased)
const TARGET: Record<string, string> = {
  'Marshalling yards': 'ساحات الفرز', 'Rail junction': 'تقاطع السكك الحديدية', 'Rail yards': 'ساحات السكك الحديدية',
  'Fighter airfield': 'مطار المقاتلات', 'Fighter base': 'قاعدة المقاتلات',
  'Synthetic oil plant': 'مصنع النفط الصناعي', 'Synthetic fuel works': 'معامل الوقود الصناعي', 'Refinery': 'المصفاة',
  'U-boat base': 'قاعدة الغواصات', 'U-boat yards': 'أحواض بناء الغواصات',
  'Aircraft assembly plant': 'مصنع تجميع الطائرات', 'Fieseler works': 'مصنع فيزلر', 'Gothaer Waggonfabrik': 'مصنع غوتا للعربات',
};
const LABEL: Record<string, string> = {
  'Rail yards': 'ساحات السكك الحديدية', 'Airfields': 'المطارات', 'Oil': 'النفط', 'U-boat pens': 'ملاجئ الغواصات', 'Aircraft factory': 'مصنع الطائرات',
};

const alt = (o: Record<string, string>) => Object.keys(o).map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
const C = `(${alt(CITY)})`;
const N = `(${alt(TARGET)})`;

const ships = (n: string | number) => counted(n, 'طائرة واحدة', 'طائرتين', 'طائرات', 'طائرة');
const forts = (n: string | number) => counted(n, 'قلعة طائرة واحدة', 'قلعتين طائرتين', 'قلاع طائرة', 'قلعة طائرة');
const crews = (n: string | number) => counted(n, 'طاقم بديل واحد', 'طاقمان بديلان', 'أطقم بديلة', 'طاقماً بديلاً');

const patterns: Pattern[] = [
  // ---------------- SideRaids.ts: generated raid missions ----------------
  [new RegExp(`^Strike on ${C}$`), (m, tr) => `ضربة على ${tr(m[1])}`],
  [new RegExp(`^(${alt(LABEL)}) — ${C}$`), (m, tr) => `${LABEL[m[1]]} — ${tr(m[2])}`],
  [new RegExp(`^Escort — ${N}, ${C}$`, 'i'), (m, tr) => `مرافقة — ${tr(m[1])}، ${tr(m[2])}`],
  [new RegExp(`^${N}, ${C}$`, 'i'), (m, tr) => `${tr(m[1])}، ${tr(m[2])}`],
  [new RegExp(`^A short one today\\. The ${N} at ${C} move every train between the Ruhr and the north German ports: fighters, fuel and flak shells all pass through them\\.$`, 'i'),
    (m, tr) => `مهمة قصيرة اليوم. عبر ${tr(m[1])} في ${tr(m[2])} تمرّ كل القطارات بين الرور وموانئ شمال ألمانيا: المقاتلات والوقود وقذائف المضادات كلها تعبر من هناك.`],
  [new RegExp(`^The yards at ${C} are a tangle of twisted rail\\. Nothing will move through them for a week\\.$`),
    (m, tr) => `ساحات ${tr(m[1])} الآن كومة من القضبان الملتوية. لن يتحرك عبرها شيء لأسبوع كامل.`],
  [new RegExp(`^The Jagdgruppe at ${C} has been hitting our formations over the coast for a month\\. Today we hit it at home: runways, hangars and dispersal pens\\.$`),
    (m, tr) => `مجموعة المقاتلات الألمانية في ${tr(m[1])} تضرب تشكيلاتنا فوق الساحل منذ شهر. اليوم نضربها في عقر دارها: المدارج والحظائر ومرابض الطائرات.`],
  [new RegExp(`^${C} is cratered from end to end\\. The Jagdgruppe there will be flying from somewhere else for a while\\.$`),
    (m, tr) => `${tr(m[1])} مليئة بالحفر من أقصاها إلى أقصاها. ستضطر مجموعة المقاتلات هناك إلى الإقلاع من مكان آخر لبعض الوقت.`],
  [new RegExp(`^The target is the ${N} at ${C}\\. Germany has almost no natural oil: every drop of fuel for her fighters is cooked out of coal in plants like this one\\.$`, 'i'),
    (m, tr) => `الهدف هو ${tr(m[1])} في ${tr(m[2])}. لا تكاد ألمانيا تملك نفطاً طبيعياً: كل قطرة وقود لمقاتلاتها تُستخلص من الفحم في منشآت كهذه.`],
  [new RegExp(`^Black smoke over ${C} is climbing past twenty thousand feet\\. The Luftwaffe will be counting its fuel by the litre\\.$`),
    (m, tr) => `الدخان الأسود فوق ${tr(m[1])} يتجاوز ارتفاع عشرين ألف قدم. ستعدّ اللوفتفافه وقودها باللتر.`],
  [new RegExp(`^The Navy has asked for this one\\. The ${N} at ${C} turns out the boats that hunt our convoys in the Atlantic, and those convoys carry our new aircraft and crews\\.$`, 'i'),
    (m, tr) => `البحرية هي من طلبت هذه المهمة. ${tr(m[1])} في ${tr(m[2])} تُخرج الغواصات التي تطارد قوافلنا في الأطلسي، وتلك القوافل تحمل طائراتنا وأطقمنا الجديدة.`],
  [new RegExp(`^The slipways at ${C} took a pounding\\. The next convoy will have a quieter crossing, and the group will see the benefit\\.$`),
    (m, tr) => `تلقّت منحدرات الإطلاق في ${tr(m[1])} ضربات قاسية. ستعبر القافلة التالية بهدوء أكبر، وستجني المجموعة الثمار.`],
  [new RegExp(`^The ${N} at ${C} builds fighters, and every one it finishes will be shooting at us within a month\\. This is a deep one, and it will be defended like Berlin\\.$`, 'i'),
    (m, tr) => `${tr(m[1])} في ${tr(m[2])} يبني المقاتلات، وكل واحدة يُنجزها ستطلق النار علينا في غضون شهر. إنها مهمة في العمق، وسيُدافَع عنه كما يُدافَع عن برلين.`],
  [new RegExp(`^The assembly halls at ${C} are burning\\. That is a month of fighters the Luftwaffe will never get\\.$`),
    (m, tr) => `قاعات التجميع في ${tr(m[1])} تحترق. هذا شهر كامل من المقاتلات لن تحصل عليه اللوفتفافه أبداً.`],
  [new RegExp(`^Bandits climbing out of ${C}! Blue flight, go get them\\.$`), (m, tr) => `طائرات معادية تتسلّق من ${tr(m[1])}! السرب الأزرق، انقضّوا عليها.`],
  [new RegExp(`^Fighters coming up from ${C}\\. Here they come!$`), (m, tr) => `مقاتلات تصعد من ${tr(m[1])}. ها هي قادمة!`],

  // ---------------- CampaignState.ts: intelligence report (saved in English) ----------------
  [/^Mission (complete|failed) · (.+)$/, (m, tr) => `${m[1] === 'complete' ? 'اكتملت المهمة' : 'فشلت المهمة'} · ${tr(m[2])}`],
  [/^Luftwaffe strength (up|down|holds) (?:at (\d+)%|(\d+)% → (\d+)%)\. (.+)$/, (m, tr) => {
    const head = m[1] === 'holds' ? `بقيت قوة اللوفتفافه عند ${m[2]}%.` : `${m[1] === 'up' ? 'ارتفعت' : 'تراجعت'} قوة اللوفتفافه من ${m[3]}% إلى ${m[4]}%.`;
    return `${head} ${tr(m[5])}`;
  }],
  [/^Losses over (.+) are thinning the Jagdgruppen\.$/, (m, tr) => `الخسائر فوق ${tr(m[1])} تستنزف مجموعات المقاتلات الألمانية.`],
  [/^Squadron (\d+) → (\d+) ships\. (?:(\d+) Fortress(?:es)? lost|No Fortresses lost); (\d+) replacement crews arrived(?:, (\d+) of them early thanks to the convoys)?\.(?: The next formation will be (\d+)% of full size\.)?$/, (m) => {
    let s = m[1] === m[2] ? `السرب ثابت عند ${ships(m[2])}. ` : `السرب: من ${m[1]} إلى ${ships(m[2])}. `;
    s += m[3] ? `خسرنا ${forts(m[3])}؛ ` : 'لم نخسر أي قلعة طائرة؛ ';
    s += `ووصل ${crews(m[4])}${m[5] ? `، ${m[5] === '1' ? 'أحدها' : `${m[5]} منها`} مبكراً بفضل القوافل` : ''}.`;
    if (m[6]) s += ` سيكون التشكيل التالي بنسبة ${m[6]}% من حجمه الكامل.`;
    return s;
  }],
  [/^Crew morale (?:steady at (\d+)%|(\d+)% → (\d+)%)\. (.+?)(?: Merit x([\d.]+)\.)?$/, (m, tr) => {
    const head = m[1] ? `معنويات الأطقم ثابتة عند ${m[1]}%.` : `${+m[3] > +m[2] ? 'ارتفعت' : 'تراجعت'} معنويات الأطقم من ${m[2]}% إلى ${m[3]}%.`;
    return `${head} ${tr(m[4])}${m[5] ? ` مضاعِف الاستحقاق ${ltr(`×${m[5]}`)}.` : ''}`;
  }],
  [/^Escort availability (\d+)% → (\d+)%\.(?: (.+))?$/, (m, tr) => `${+m[2] > +m[1] ? 'ارتفع' : 'تراجع'} توفّر المرافقة من ${m[1]}% إلى ${m[2]}%.${m[3] ? ` ${tr(m[3])}` : ''}`],
  [/^Mustangs join the gunner missions at (\d+)%\.$/, 'تنضم طائرات موستانغ إلى مهمات الرماية عند $1%.'],
  [/^Next operation: Mission (\d+), (.+) \((.+)\)\. Enemy fighters x([\d.]+)\.$/, (m, tr) => `العملية التالية: المهمة ${m[1]}، «${tr(m[2])}» (${tr(m[3])}). مضاعِف مقاتلات العدو ${ltr(`×${m[4]}`)}.`],
  // tour summary log: "6 kills · 2 lost"
  [/^(\d+) kills$/, (m) => counted(m[1], 'إسقاط واحد', 'إسقاطان', 'إسقاطات', 'إسقاطاً')],
  [/^(\d+) lost$/, (m) => `خسرنا ${forts(m[1])}`],
  [/^Raid bonus: \+(\d+) merit\.$/, (m) => `مكافأة الغارة: ${ltr(`+${m[1]}`)} نقطة استحقاق.`],
  [/^Your (\d+) completed missions? (?:have|has) been entered in the group's records\. The strategic picture below reflects them\.$/,
    (m) => `${m[1] === '1' ? 'قُيِّدت مهمتك المكتملة' : `قُيِّدت مهماتك المكتملة (${m[1]})`} في سجلات المجموعة. والصورة الاستراتيجية أدناه تعكس ذلك.`],
];

const table: PhraseTable = {
  phrases: {
    ...CITY,
    ...TARGET,
    ...LABEL,
    'the Netherlands': 'هولندا',
    'the Channel': 'بحر المانش',

    // ---------------- SideRaids.ts: raid template texts ----------------
    'Snarls German supply: Luftwaffe −3, morale +3': `يُربك الإمداد الألماني: اللوفتفافه ${ltr('−3')}، المعنويات ${ltr('+3')}`,
    'Catches fighters on the ground: Luftwaffe −8, escort +12': `يصطاد المقاتلات على الأرض: اللوفتفافه ${ltr('−8')}، المرافقة ${ltr('+12')}`,
    'Starves the fighters of fuel: Luftwaffe −6, morale +2': `يحرم المقاتلات من الوقود: اللوفتفافه ${ltr('−6')}، المعنويات ${ltr('+2')}`,
    'Convoys get through: +3 replacement ships, morale +4': `تعبر القوافل: ${ltr('+3')} طائرات بديلة، المعنويات ${ltr('+4')}`,
    'Cuts fighter production: Luftwaffe −7, escort +6': `يقطع إنتاج المقاتلات: اللوفتفافه ${ltr('−7')}، المرافقة ${ltr('+6')}`,
    'The defences are light, and Group calls it a chance to blood the new crews. Do not believe the words "milk run". The day fighters based nearby will come up to meet us.':
      'الدفاعات خفيفة، وترى قيادة المجموعة فيها فرصة لتعميد الأطقم الجديدة بالنار. لا تصدّقوا من يسمّيها «نزهة سهلة». فالمقاتلات النهارية المتمركزة بالقرب ستصعد لملاقاتنا.',
    'Every fighter we catch on the ground is one that will not be waiting for us over Germany, and with the coastal fields out of action the Mustangs can push further inland. Expect the whole Gruppe to scramble the moment we cross the coast.':
      'كل مقاتلة نصطادها على الأرض لن تكون في انتظارنا فوق ألمانيا، ومع خروج المطارات الساحلية من الخدمة تستطيع طائرات موستانغ التوغّل أعمق في الداخل. توقّعوا أن تقلع المجموعة الألمانية كلها لحظة عبورنا الساحل.',
    'No fuel means no training flights, and no training means green pilots. The Germans know it, so the plant is ringed with heavy flak, and twin-engine destroyers will be up with rockets. Keep them off the formation through the bomb run.':
      'لا وقود يعني لا رحلات تدريب، ولا تدريب يعني طيارين بلا خبرة. والألمان يعرفون ذلك، ولهذا يطوّق المصنعَ حزامٌ من المضادات الثقيلة، وستصعد المدمّرات ثنائية المحرّك بصواريخها. أبعدوها عن التشكيل طوال مسار القصف.',
    'Every convoy that gets through brings replacements to the group sooner. The route runs low over the North Sea; expect fighters from the coastal fields and Ju 88s from the Frisian Islands.':
      'كل قافلة تعبر بسلام تُوصل البدلاء إلى المجموعة أسرع. يمرّ المسار منخفضاً فوق بحر الشمال؛ توقّعوا مقاتلات من المطارات الساحلية وطائرات Ju 88 من جزر فريزيا.',
    'The Sturmgruppen and the rocket-carrying destroyers will be up in force. Hold the formation tight and keep firing; the bombardiers need a steady run of four minutes over the aiming point.':
      'ستصعد مجموعات الاقتحام الألمانية والمدمّرات الحاملة للصواريخ بكامل قوتها. حافظوا على تماسك التشكيل وواصلوا الإطلاق؛ فمُلقو القنابل يحتاجون إلى مسار ثابت مدته أربع دقائق فوق نقطة التصويب.',
    'You are flying close escort in a P-51D. Stay with the bombers until they are off the target, then you may go down and hunt.':
      'ستطير في مرافقة قريبة على متن P-51D. ابقَ مع القاذفات حتى تغادر الهدف، وبعدها يمكنك أن تنقضّ وتصطاد.',
    'This is an optional operation. Group will not hold it against any crew that stands down, but what we hit today changes what is waiting for us on the next big one.':
      'هذه عملية اختيارية. لن تؤاخذ قيادة المجموعة أي طاقم يعتذر عنها، لكن ما نضربه اليوم يغيّر ما ينتظرنا في العملية الكبرى التالية.',
    'Bomb the rail yards': 'اقصف ساحات السكك الحديدية',
    'Wreck the airfield': 'دمّر المطار',
    'Bomb the oil plant through the flak': 'اقصف مصنع النفط عبر نيران المضادات',
    'Hit the U-boat slipways': 'أصِب منحدرات إطلاق الغواصات',
    'Destroy the aircraft factory': 'دمّر مصنع الطائرات',
    'Protect the bombers over the airfield': 'احمِ القاذفات فوق المطار',

    // ---------------- CampaignState.ts: report reasons and notes ----------------
    'With the rail yards cut, fuel and spares are not reaching the fighter fields.': 'مع قطع ساحات السكك الحديدية، لم يعد الوقود وقطع الغيار يصلان إلى مطارات المقاتلات.',
    'Fighters were caught on the ground and the field is out of action.': 'اصطِيدت المقاتلات على الأرض وخرج المطار من الخدمة.',
    'Fuel is short: training flights are grounded and fewer fighters can be put up.': 'الوقود شحيح: أوقِفت رحلات التدريب وقلّ عدد المقاتلات التي يمكن إطلاقها.',
    'A month of fighter production has gone up in smoke.': 'ذهب إنتاج شهر كامل من المقاتلات أدراج الدخان.',
    'The Jagdgruppen are claiming a victory, and their confidence and strength recover.': 'تتباهى مجموعات المقاتلات الألمانية بالنصر، فتستعيد ثقتها وقوتها.',
    'This target did not touch the fighter arm.': 'لم يمسّ هذا الهدف سلاح المقاتلات.',
    'The crews are cheered by the result.': 'النتيجة رفعت معنويات الأطقم.',
    'The crews are holding up.': 'الأطقم صامدة.',
    'Empty bunks in the huts weigh on the crews.': 'الأسرّة الخالية في الأكواخ تُثقل على الأطقم.',
    'A bad day; the crews are subdued.': 'يوم سيئ؛ الأطقم واجمة.',
    'Steady.': 'مستقرة.',
    'Fighter Command confirms: P-51 Mustangs will now join the bombers on gunner missions.': 'تؤكد قيادة المقاتلات: ستنضم طائرات P-51 موستانغ من الآن إلى القاذفات في مهمات الرماية.',
    'The Mustangs will reach us sooner.': 'ستصلنا طائرات موستانغ أبكر.',
    'The tour is complete. The campaign summary is ready.': 'اكتملت جولة الخدمة. ملخص الحملة جاهز.',
    'A replay of a finished operation. The strategic picture is unchanged.': 'إعادة لعملية منتهية. الصورة الاستراتيجية لم تتغير.',
    'Campaign records transferred': 'نُقلت سجلات الحملة',

    // ---------------- CampaignMap.ts: chart ----------------
    '{n}°N': '{n}° ش',
    '{n}°W': '{n}° غ',
    '{n}°E': '{n}° ق',
    'N (compass)': 'ش',
    'LUFTWAFFE DAY FIGHTERS · {n}%': 'مقاتلات اللوفتفافه النهارية · {n}%',
    'ESCORT RADIUS · {n}%': 'مدى المرافقة · {n}%',
    'Mission {n}: {title}': 'المهمة {n}: {title}',
    '{place} · NEXT': '{place} · التالية',
    'DEENETHORPE · 401ST BG': 'دينيثورب · مجموعة القصف 401',
    'Next story operation': 'العملية التالية في القصة',
    'Flown · ○ to come': 'نُفِّذت · ○ قادمة',
    'Side raid on offer': 'غارة جانبية متاحة',
    'Escort radius / raid route': 'مدى المرافقة / مسار الغارة',
    'Campaign map: England, the North Sea and Germany': 'خريطة الحملة: إنجلترا وبحر الشمال وألمانيا',
    'NORTH SEA & NORTHWEST EUROPE · 1943–44': `بحر الشمال وشمال غرب أوروبا · ${ltr('1943–44')}`,

    // ---------------- CampaignMap.ts: gauges and intelligence ----------------
    'Strategic situation': 'الموقف الاستراتيجي',
    'Luftwaffe strength': 'قوة اللوفتفافه',
    'Squadron strength': 'قوة السرب',
    'Crew morale': 'معنويات الأطقم',
    'Escort availability': 'توفّر المرافقة',
    'Enemy fighters x{a} · skill x{b}': `مقاتلات العدو ${ltr('×{a}')} · المهارة ${ltr('×{b}')}`,
    'Full-size formations': 'تشكيلات بكامل حجمها',
    'Formations at {n}% — replacements arriving': 'التشكيلات بنسبة {n}% — البدلاء في الطريق',
    'Merit x{n}': `الاستحقاق ${ltr('×{n}')}`,
    'P-51s join the gunner missions': 'طائرات P-51 تنضم إلى مهمات الرماية',
    'P-51s join gunner missions at {n}%': 'تنضم طائرات P-51 إلى مهمات الرماية عند {n}%',
    'Intelligence report': 'تقرير الاستخبارات',
    'No operations flown yet. Group expects heavy fighter opposition over the German coast.': 'لم تُنفَّذ أي عملية بعد. تتوقع قيادة المجموعة مقاومة عنيفة من المقاتلات فوق الساحل الألماني.',

    // ---------------- CampaignMap.ts: operation cards ----------------
    'P-51D escort': 'مرافقة P-51D',
    'Low sun': 'شمس منخفضة',
    'Formation {n} ships': 'حجم التشكيل: {n}',
    'Fighters x{n}': `المقاتلات ${ltr('×{n}')}`,
    'P-51s at {t}': 'طائرات P-51 عند {t}',
    'MISSION {n} OF {total}': 'المهمة {n} من {total}',
    'Brief the crew': 'أوجِز الطاقم',
    'Tour complete': 'اكتملت جولة الخدمة',
    'Twenty-five missions': 'خمس وعشرون مهمة',
    "The Sky Queen's crew is going home.": 'طاقم «Sky Queen» عائد إلى الديار.',
    'Campaign summary': 'ملخص الحملة',
    'Begin a new tour': 'ابدأ جولة خدمة جديدة',
    'Confirm: new tour (medals and Armory kept)': 'تأكيد: جولة جديدة (تبقى الأوسمة والترسانة)',
    'Raid flown — target destroyed': 'نُفِّذت الغارة — دُمِّر الهدف',
    'Raid flown — target missed': 'نُفِّذت الغارة — أخطأنا الهدف',
    'The window has passed': 'فاتت الفرصة',
    'Fly this raid': 'نفّذ هذه الغارة',
    '{fx} · +{n} merit': `{fx} · ${ltr('+{n}')} نقطة استحقاق`,
    'The tour is over. Side raids are closed.': 'انتهت جولة الخدمة. أُغلقت الغارات الجانبية.',
    'Side raids open after your first mission. Fly Mission 1 to begin the tour.': 'تُفتح الغارات الجانبية بعد مهمتك الأولى. نفّذ المهمة 1 لتبدأ جولة الخدمة.',
    'One raid per lull between operations.': 'غارة واحدة في كل فترة هدوء بين العمليات.',
    'Optional: fly one raid before Mission {n}, or go straight on. What you hit changes the odds on the next big one.':
      'اختياري: نفّذ غارة واحدة قبل المهمة {n}، أو تابع مباشرة. ما تضربه يغيّر موازين العملية الكبرى التالية.',
    '1 medal': 'وسام واحد',
    '{n} medals': 'الأوسمة: {n}',
    '401ST BOMB SQUADRON · OPERATIONS ROOM': 'سرب القاذفات 401 · غرفة العمليات',
    ' · TOUR {n}': ' · الجولة {n}',
    'Campaign': 'الحملة',
    'Campaign date': 'تاريخ الحملة',
    '{done}/{total} operations': 'العمليات: {done}/{total}',
    '1 side raid': 'غارة جانبية واحدة',
    '{n} side raids': 'الغارات الجانبية: {n}',
    'Next operation': 'العملية التالية',
    'Tour of duty': 'جولة الخدمة',
    'Side raids': 'الغارات الجانبية',
    '· before Mission {n}': '· قبل المهمة {n}',
    'Tour timeline': 'الخط الزمني لجولة الخدمة',

    // ---------------- CampaignMap.ts: tour summary ----------------
    'The German day-fighter arm is a shadow of the force that met you over Emden. You helped break it.': 'لم يبقَ من سلاح المقاتلات النهارية الألماني إلا ظلّ القوة التي واجهتك فوق إمدن. وأنت ساهمت في كسره.',
    'The Luftwaffe is still flying, but it is bleeding pilots it cannot replace. The air war has turned.': 'ما زالت اللوفتفافه تطير، لكنها تنزف طيارين لا تستطيع تعويضهم. لقد انقلبت موازين الحرب الجوية.',
    'The Luftwaffe is battered but unbroken. The crews who follow you will still have a fight on their hands.': 'اللوفتفافه مثخنة بالجراح لكنها لم تنكسر. والأطقم التي تخلفكم ما زالت أمامها معركة.',
    'Your {n} successful side raids kept the pressure on between the big operations.': 'غاراتك الجانبية الناجحة ({n}) أبقت الضغط قائماً بين العمليات الكبرى.',
    '1 side raid hit home between the big operations.': 'أصابت غارة جانبية واحدة هدفها بين العمليات الكبرى.',
    '{n} side raids hit home between the big operations.': 'أصابت غاراتك الجانبية ({n}) أهدافها بين العمليات الكبرى.',
    'You flew the story operations alone, without side raids.': 'نفّذت عمليات القصة وحدها، دون غارات جانبية.',
    'The crews finish the tour in fine spirits.': 'تُنهي الأطقم جولة الخدمة بمعنويات عالية.',
    'The crews are tired, but proud.': 'الأطقم متعبة، لكنها فخورة.',
    'The crews are worn to the bone. Too many empty bunks.': 'الأطقم منهكة حتى العظم. أسرّة خالية كثيرة.',
    '401ST BOMB SQUADRON · TOUR OF DUTY': 'سرب القاذفات 401 · جولة الخدمة',
    'Tour in progress': 'جولة الخدمة جارية',
    'Story operations': 'عمليات القصة',
    'Sorties flown': 'الطلعات المنفّذة',
    'Confirmed kills': 'الإسقاطات المؤكدة',
    'Fortresses lost': 'القلاع الطائرة المفقودة',
    'Medals on record': 'الأوسمة المسجّلة',
    'Squadron': 'السرب',
    'Escort': 'المرافقة',
    'Operations log': 'سجل العمليات',
    'No sorties recorded.': 'لا طلعات مسجّلة.',
    'Campaign map': 'خريطة الحملة',
    'Main menu': 'القائمة الرئيسية',

    // ---------------- CampaignMap.ts: briefing sheet ----------------
    'SIDE RAID · OPTIONAL OPERATION': 'غارة جانبية · عملية اختيارية',
    'Campaign: Luftwaffe {n}%': 'الحملة: اللوفتفافه {n}%',
    'Morale {n}% · merit x{m}': `المعنويات {n}% · الاستحقاق ${ltr('×{m}')}`,
    'On success: {fx} · +{n} merit': `عند النجاح: {fx} · ${ltr('+{n}')} نقطة استحقاق`,
  },
  patterns,
};
export default table;
