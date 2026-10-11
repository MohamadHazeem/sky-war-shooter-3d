import type { PhraseTable, Pattern } from '../types';

// Arabic for the title-menu extras (Phase 5 goal 28): the "What's new" bulletin
// (game/WhatsNew.ts, ui/WhatsNewScreen.ts) and the aircraft recognition gallery and quiz
// (game/AircraftData.ts, ui/GalleryScreen.ts). Aircraft and weapon designations stay Latin.

const MONTHS: Record<string, string> = {
  January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', May: 'مايو', June: 'يونيو',
  July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر',
};

const patterns: Pattern[] = [
  // spec card figures: top speed, span × length, first-flight dates
  [/^([\d,]+) mph \(([\d,]+) km\/h\)$/, '$1 ميلًا في الساعة ($2 كم/س)'],
  [/^([\d.]+) m × ([\d.]+) m$/, '$1 م × $2 م'],
  [/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m) => `${m[1]} ${MONTHS[m[2]]} ${m[3]}`],
];

const table: PhraseTable = {
  phrases: {
    // ---------- What's new ----------
    "What's new": 'ما الجديد',
    '401st Bomb Group · Operations bulletin': 'مجموعة القاذفات 401 · نشرة العمليات',
    'Orders of the day · version {v}': 'أوامر اليوم · الإصدار {v}',
    'Understood': 'عُلم',
    'Try it': 'جرّبها',
    "This bulletin stays pinned up: title menu → What's new, or Settings.": 'تبقى هذه النشرة معلّقة: القائمة الرئيسية ← ما الجديد، أو الإعدادات.',
    'bulletin · version {v}': 'النشرة · الإصدار {v}',
    'WANTED': 'مطلوب',
    'WEEK': 'الأسبوع',
    'BETA': 'تجريبي',
    'Choose the next target on a living 1943–44 map. Side raids on rail yards, airfields and oil hit the Luftwaffe where it hurts.':
      'اختر الهدف التالي على خريطة حيّة لعامَي 1943–44. الغارات الجانبية على ساحات السكك والمطارات ومنشآت النفط تضرب اللوفتفافه حيث يؤلمها.',
    'Take-off and landing': 'الإقلاع والهبوط',
    'Dawn take-off from Deenethorpe and the landing afterwards: red flares and fire trucks if she comes home shot up. Skippable.':
      'إقلاع عند الفجر من دينيثورب ثم الهبوط بعد المهمة: مشاعل حمراء وسيارات إطفاء إن عادت مثخنة بالإصابات. يمكن تخطّيهما.',
    'Boss battle groups': 'مجموعات معارك الزعماء',
    'A Luftkreuzer battle group is coming for the formation in the first round. Shoot away its turrets, engines and flak to breach the armour, then pour fire into the hull.':
      'مجموعة معركة يقودها طرّاد جوي تتّجه نحو التشكيل في الجولة الأولى. أطِح بأبراجه ومحرّكاته ومدافعه المضادة لتخترق درعه، ثم صبّ نيرانك في هيكله.',
    'Luftkreuzer flying warships with turrets, flak and rocket pods. Shoot the parts away to breach the armour.':
      'طرادات جوية طائرة بأبراج ومدافع مضادة للطائرات وحاويات صواريخ. أطِح بأجزائها لتخترق درعها.',
    'Living B-17 interior': 'داخل B-17 النابض بالحياة',
    'The other waist gunner fights beside you, brass piles up, frost creeps over the glass. Hold C to look around.':
      'رامي الخصر الآخر يقاتل بجانبك، والأظرف الفارغة تتكدّس، والصقيع يزحف على الزجاج. اضغط C مطوّلًا لتنظر حولك.',
    'P-51 special operations': 'العمليات الخاصة لطائرة P-51',
    'Defend the Field against a Ju 88 raid, hunt bombers as a Night Fighter, or go Train Busting at treetop height.':
      'دافع عن المطار في وجه غارة Ju 88، أو طارد القاذفات بالمقاتلة الليلية، أو انطلق في مطاردة القطارات على ارتفاع رؤوس الأشجار.',
    'Wingman orders': 'أوامر الجناح المرافق',
    'Your wingman in every P-51 mission: 1 attack my target, 2 cover me, 3 protect the bombers, 4 form up.':
      'جناحك المرافق في كل مهمة P-51: 1 هاجم هدفي، 2 غطِّني، 3 احمِ القاذفات، 4 عُد إلى التشكيل.',
    'Experten nemesis aces': 'الآسات الخصوم',
    'Named Luftwaffe aces who remember you, carry scars and grudges, and climb the ranks if they get away.':
      'آسات من اللوفتفافه بأسمائهم، يتذكّرونك ويحملون الندوب والأحقاد، ويترقّون إن أفلتوا.',
    'Skill tree': 'شجرة المهارات',
    'Spend points from promotions in three branches: Marksman, Gunnery Sergeant and Survivor.':
      'أنفق نقاط الترقيات في ثلاثة فروع: الرامي الماهر ورقيب المدفعية والناجي.',
    'Custom battle and weekly': 'المعركة المخصّصة والتحدّي الأسبوعي',
    'Build your own battle: enemies, weather, time of day, a boss round. Or fly the weekly challenge for its ribbon.':
      'صمّم معركتك: الأعداء والطقس ووقت النهار وجولة الزعيم. أو خُض التحدّي الأسبوعي لتنال وشاحه.',
    'Scrub the last 90 seconds of a mission, fly a free camera, save the best moments and screenshots.':
      'تنقّل في آخر 90 ثانية من المهمة، وحرّك كاميرا حرّة، واحفظ أفضل اللحظات واللقطات.',
    'Co-op': 'اللعب التعاوني',
    'Two gunners, one B-17: share a room code with a friend and man different guns online.':
      'راميان في B-17 واحدة: شارك رمز الغرفة مع صديق وتولّيا رشاشين مختلفين عبر الإنترنت.',
    'Arabic': 'العربية',
    'Every screen in Arabic, right to left. Switch the language in Settings.': 'كل الشاشات بالعربية، من اليمين إلى اليسار. بدّل اللغة من الإعدادات.',

    // ---------- gallery: screen ----------
    'recognition · quiz': 'تعرّف · اختبار',
    'Aircraft recognition': 'التعرّف على الطائرات',
    'Hangar 2 · Deenethorpe': 'الحظيرة 2 · دينيثورب',
    'Gallery': 'المعرض',
    'Recognition quiz': 'اختبار التعرّف',
    'Drag to orbit · wheel or pinch to zoom · ← → change aircraft · gamepad: right stick, LT / RT, LB / RB':
      'اسحب للدوران · العجلة أو إصبعان للتكبير · ← → لتغيير الطائرة · ذراع التحكم: العصا اليمنى، LT / RT، LB / RB',
    'Previous aircraft': 'الطائرة السابقة',
    'Next aircraft': 'الطائرة التالية',
    'Wheeling her out…': 'نُخرجها إلى الحظيرة…',
    'Fictional · boss': 'خيالية · زعيم',
    'Allied · USAAF': 'الحلفاء · سلاح الجو الأمريكي',
    'Luftwaffe': 'اللوفتفافه',
    'On our side: hold your fire': 'في صفّنا: أمسك نيرانك',
    'Warships downed by you:': 'طرادات أسقطتها:',
    'Shot down by you:': 'أسقطتَ منها:',
    'Crew': 'الطاقم',
    'Armament': 'التسليح',
    'Top speed': 'السرعة القصوى',
    'First flight': 'أول طيران',
    'Span × length': 'الباع × الطول',
    "Gunner's note": 'ملاحظة الرامي',
    'HANGAR 2 · KEEP CLEAR': 'الحظيرة 2 · أبقِ المكان خاليًا',
    // quiz
    'Round {i} / {n}': 'الجولة {i} / {n}',
    'Score {n}': 'النقاط {n}',
    'Identify the aircraft': 'تعرّف على الطائرة',
    'Correct: {name}': 'صحيح: {name}',
    'No: that was the {name}': 'خطأ: كانت تلك {name}',
    'Results': 'النتيجة',
    'Next': 'التالي',
    '{n} of {total} identified': 'تعرّفت على {n} من {total}',
    'New best score!': 'أفضل نتيجة جديدة!',
    'Best score: {n} / {total}': 'أفضل نتيجة: {n} / {total}',
    'Again': 'مرة أخرى',

    // ---------- gallery: spec cards (AircraftData.ts) ----------
    'Boeing B-17G Flying Fortress': 'بوينغ B-17G «القلعة الطائرة»',
    'Heavy bomber · your aircraft': 'قاذفة ثقيلة · طائرتك',
    '13 × .50 cal M2 machine guns · up to 8,000 lb of bombs': '13 رشاشًا M2 عيار .50 · حتى 8,000 رطل من القنابل',
    'Five gun positions you can man: switch seats to meet each attack where it comes from.': 'خمسة مواقع رشاشات يمكنك شغلها: بدّل مقعدك لتلاقي كل هجوم من حيث يأتي.',
    'North American P-51D Mustang': 'نورث أمريكان P-51D موستانغ',
    'Long-range escort fighter': 'مقاتلة مرافقة بعيدة المدى',
    '6 × .50 cal M2 machine guns': '6 رشاشات M2 عيار .50',
    'Friendly! Bubble canopy and a belly scoop: hold your fire when one dives past the bombers.': 'صديقة! قمرة فقاعية ومأخذ هواء تحت البطن: أمسك نيرانك حين تنقضّ إحداها بمحاذاة القاذفات.',
    'Focke-Wulf Fw 190 A-8': 'فوكه-وولف Fw 190 A-8',
    'Fighter · bomber destroyer': 'مقاتلة · مدمّرة قاذفات',
    '2 × 13 mm MG 131 · 4 × 20 mm MG 151/20 cannon': 'رشاشان MG 131 عيار 13 ملم · 4 مدافع MG 151/20 عيار 20 ملم',
    "Attacks head-on from twelve o'clock high in tight groups: meet him with the top turret and fire early.": 'يهاجم وجهًا لوجه من الساعة الثانية عشرة عاليًا في مجموعات متراصّة: لاقِه بالبرج العلوي وابدأ الرمي مبكرًا.',
    'Messerschmitt Bf 109 G-14': 'ميسرشميت Bf 109 G-14',
    'Fighter': 'مقاتلة',
    '1 × 20 mm MG 151/20 cannon · 2 × 13 mm MG 131': 'مدفع MG 151/20 عيار 20 ملم · رشاشان MG 131 عيار 13 ملم',
    'Nimble but lightly built: a short, well-led burst brings him down. Watch for him diving on stragglers.': 'رشيقة لكنها خفيفة البنية: رشقة قصيرة بتقدير جيد تُسقطها. راقبها وهي تنقضّ على المتخلّفين.',
    'Messerschmitt Bf 110 G': 'ميسرشميت Bf 110 G',
    'Zerstörer heavy fighter': 'مقاتلة ثقيلة «مدمّرة»',
    '2 × 20 mm cannon · 4 × 7.92 mm MG · twin rear MG 81Z · 21 cm rockets': 'مدفعان عيار 20 ملم · 4 رشاشات عيار 7.92 ملم · رشاش MG 81Z مزدوج في الخلف · صواريخ عيار 21 سم',
    'Hangs back out of range and lobs 21 cm rockets from a kilometre: break the wave up before it fires.': 'تتريّث خارج المدى وتقذف صواريخ عيار 21 سم من مسافة كيلومتر: شتّت الموجة قبل أن تطلق.',
    'Junkers Ju 88 A-4': 'يونكرز Ju 88 A-4',
    'Bomber · heavy fighter': 'قاذفة · مقاتلة ثقيلة',
    '7.92 mm and 13 mm defensive guns · 1,400 kg of bombs internally': 'رشاشات دفاعية عيار 7.92 و13 ملم · 1,400 كغ من القنابل في الداخل',
    'Slow and armoured: go for an engine, not the fuselage.': 'بطيئة ومدرّعة: استهدف أحد المحركين لا جسم الطائرة.',
    'Messerschmitt Me 262 A-1a Schwalbe': 'ميسرشميت Me 262 A-1a «شفالبه»',
    'Jet fighter': 'مقاتلة نفّاثة',
    '4 × 30 mm MK 108 cannon': '4 مدافع MK 108 عيار 30 ملم',
    '18 April 1941 (first jet flight 18 July 1942)': '18 أبريل 1941 (أول طيران نفّاث 18 يوليو 1942)',
    'Too fast to track: lead him far ahead, and fire as he slows to line up his cannon.': 'أسرع من أن تتبعها: صوّب أمامها بمسافة كبيرة، وارمِ حين تبطئ لتصويب مدافعها.',
    'Messerschmitt Me 163 B Komet': 'ميسرشميت Me 163 B «كوميت»',
    'Rocket interceptor': 'معترضة صاروخية',
    '2 × 30 mm MK 108 cannon': 'مدفعان MK 108 عيار 30 ملم',
    'A few minutes of rocket fuel: one slashing pass, then he glides home. One good hit and he is done.': 'وقودها الصاروخي يكفي دقائق معدودة: انقضاضة خاطفة واحدة ثم تعود منزلقة. إصابة واحدة جيدة تنهيها.',
    'Heinkel He 111 H': 'هاينكل He 111 H',
    'Medium bomber': 'قاذفة متوسطة',
    'Up to 7 × 7.92 mm MG · 2,000 kg of bombs': 'حتى 7 رشاشات عيار 7.92 ملم · 2,000 كغ من القنابل',
    'Glazed nose, close formations, a gunner in every window: attack from below and go for the engines.': 'مقدّمة زجاجية وتشكيلات متراصّة ورامٍ عند كل نافذة: هاجم من الأسفل واستهدف المحركات.',
    'Messerschmitt Me 410 A Hornisse': 'ميسرشميت Me 410 A «هورنيسه»',
    'Heavy fighter · bomber destroyer': 'مقاتلة ثقيلة · مدمّرة قاذفات',
    '2 × 20 mm cannon · 2 × 7.92 mm MG · 2 × 13 mm remote barbettes · 50 mm BK 5 cannon (U4)': 'مدفعان عيار 20 ملم · رشاشان عيار 7.92 ملم · برجان جانبيان عيار 13 ملم يُداران عن بُعد · مدفع BK 5 عيار 50 ملم (U4)',
    'The BK 5 cannon telegraphs: he lines up from two kilometres and holds steady. Kill him before he fires.': 'مدفع BK 5 يفضح نيّته: يصطفّ للرمي من كيلومترين ويثبت. أسقِطه قبل أن يطلق.',
    'Shown on the Bf 110 airframe the game uses as a stand-in.': 'معروضة على هيكل Bf 110 الذي تستخدمه اللعبة بديلًا.',
    'Dornier Do 335 A Pfeil': 'دورنييه Do 335 A «السهم»',
    'Heavy fighter (push-pull)': 'مقاتلة ثقيلة (محرّك ساحب وآخر دافع)',
    '1 × 30 mm MK 103 cannon · 2 × 20 mm MG 151/20': 'مدفع MK 103 عيار 30 ملم · مدفعان MG 151/20 عيار 20 ملم',
    'A propeller at each end: he dives from high astern as fast as a jet. Watch the tail and lead him hard.': 'مروحة في كل طرف: تنقضّ من الأعلى والخلف بسرعة النفّاثة. راقب الذيل وصوّب أمامها بقوة.',
    'Luftkreuzer (fictional)': 'الطرّاد الجوي (خيالي)',
    'Flying warship · boss battle group': 'سفينة حربية طائرة · مجموعة معركة الزعيم',
    'Fictional': 'خيالي',
    'Gun turrets · 8.8 cm dorsal flak · rocket pods': 'أبراج رشاشات · مدفع مضاد للطائرات عيار 8.8 سم على الظهر · حاويات صواريخ',
    'Never: invented for the game': 'لم يطِر قط: من ابتكار اللعبة',
    'About three times a Ju 88': 'نحو ثلاثة أضعاف Ju 88',
    'Shoot away turrets, engines and flak to breach the armour, then pour fire into the hull.': 'أطِح بالأبراج والمحركات والمدافع المضادة لتخترق الدرع، ثم صبّ نيرانك في الهيكل.',
    'Fictional: no such aircraft was ever built.': 'خيالي: لم تُبنَ طائرة كهذه قط.',
  },
  patterns,
};
export default table;
