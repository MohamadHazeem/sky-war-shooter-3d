import type { PhraseTable } from '../types';

// The Tour (game/Tour.ts, game/TourRuntime.ts, ui/TourScreen.ts). Names of ships stay in Latin
// letters (the player's own ship name replaces "Sky Queen" on display).

const WHAT: Record<string, string> = {
  'U-boat yards': 'أحواض الغواصات', 'Fighter airfield': 'مطار المقاتلات', 'Propeller works': 'مصنع المراوح', 'Marshalling yards': 'ساحات فرز القطارات',
  'Port facilities': 'منشآت الميناء', 'Focke-Wulf plant': 'مصنع فوكه-فولف', 'Arado aircraft works': 'مصنع طائرات أرادو', 'Rail yards': 'ساحات السكك الحديدية',
  'Ball-bearing plants': 'مصانع المحامل الكروية', 'Port area': 'منطقة الميناء', 'Synthetic oil plant': 'مصنع الوقود الصناعي', 'Ball-bearing works': 'مصنع المحامل الكروية',
  'Industrial area': 'المنطقة الصناعية', 'Naval yards': 'الأحواض البحرية', 'Chemical works': 'مصانع الكيماويات', 'Fighter assembly plant': 'مصنع تجميع المقاتلات',
  'Junkers works': 'مصنع يونكرز', 'Aircraft works': 'مصنع الطائرات', 'Aircraft assembly': 'مصنع تجميع الطائرات', 'Messerschmitt works': 'مصنع ميسرشميت',
  'Heinkel works': 'مصنع هاينكل', 'Bearing works': 'مصنع المحامل', 'Industrial rail district': 'حي السكك الصناعي', 'Dornier works': 'مصنع دورنييه',
};
const CITY: Record<string, string> = {
  Emden: 'إمدن', Woensdrecht: 'فونسدريخت', Frankfurt: 'فرانكفورت', 'Saarbrücken': 'زاربروكن', Bremen: 'بريمن', Vegesack: 'فيغيزاك', Marienburg: 'مارينبورغ',
  Anklam: 'أنكلام', 'Münster': 'مونستر', Schweinfurt: 'شفاينفورت', Wilhelmshaven: 'فيلهلمسهافن', Gelsenkirchen: 'غلزنكيرشن', Paris: 'باريس', Solingen: 'زولينغن',
  Kiel: 'كيل', 'Osnabrück': 'أوسنابروك', Ludwigshafen: 'لودفيغسهافن', Oschersleben: 'أوشرسليبن', Halberstadt: 'هالبرشتات', Brunswick: 'براونشفايغ',
  Leipzig: 'لايبزيغ', Aschersleben: 'أشرسليبن', Bernburg: 'برنبورغ', Gotha: 'غوتا', Rostock: 'روستوك', Regensburg: 'ريغنسبورغ', Augsburg: 'أوغسبورغ',
  Stuttgart: 'شتوتغارت', Berlin: 'برلين', Oranienburg: 'أورانينبورغ', Sorau: 'زوراو', Stettin: 'شتيتين', Friedrichshafen: 'فريدريشسهافن',
};
const NAMES: Record<string, string> = {
  Brenner: 'برينر', Doyle: 'دويل', Stern: 'ستيرن', Kessler: 'كيسلر', Mendez: 'منديز', Gallo: 'غالو', Reilly: 'رايلي', Price: 'برايس', Walsh: 'والش', Dawson: 'داوسون',
  Morrow: 'مورو', Carver: 'كارفر', Pruitt: 'برويت', Ortega: 'أورتيغا', Kowalski: 'كوالسكي', Hughes: 'هيوز', Baker: 'بيكر', Russo: 'روسو', Novak: 'نوفاك', Fisher: 'فيشر',
  Whitfield: 'ويتفيلد', Delgado: 'ديلغادو', Brennan: 'برينان', Lindqvist: 'ليندكفيست', Harlan: 'هارلان', Mercer: 'ميرسر',
  Jablonski: 'يابلونسكي', Moreno: 'مورينو', "O'Neill": 'أونيل', Petrakis: 'بتراكيس', Sullivan: 'سوليفان', Carter: 'كارتر', Henderson: 'هندرسون', Vance: 'فانس', Kowalczyk: 'كوفالتشيك', Abbott: 'أبوت',
};
const RANK: Record<string, string> = { 'Sgt.': 'الرقيب', 'S/Sgt.': 'الرقيب أول', 'T/Sgt.': 'الرقيب الفني', 'Lt.': 'الملازم', 'Capt.': 'النقيب', 'Maj.': 'الرائد' };
const NUM_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];
const name = (s: string, tr: (s: string) => string) => { const i = s.indexOf(' '); return i < 0 ? tr(s) : `${tr(s.slice(0, i))} ${tr(s.slice(i + 1))}`; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whatRx = Object.keys(WHAT).map(esc).join('|');

const table: PhraseTable = {
  phrases: {
    ...WHAT, ...CITY, ...NAMES, ...RANK,
    // menu and entry points
    'The Tour': 'جولة الخدمة',
    'THE TOUR': 'جولة الخدمة',
    'Twenty-five missions, one ship, one crew': 'خمس وعشرون مهمة، طائرة واحدة، طاقم واحد',
    'The Tour · 25 missions': 'جولة الخدمة · 25 مهمة',
    'THE TOUR · 25 MISSIONS': 'جولة الخدمة · 25 مهمة',
    'A tour of duty': 'جولة خدمة قتالية',
    'Twenty-five missions, one Fortress, one crew. Damage stays with the ship until the ground crew patches it, wounded men miss missions, and the men you lose are replaced by rookies.':
      'خمس وعشرون مهمة، قلعة طائرة واحدة، وطاقم واحد. تبقى الأضرار في الطائرة حتى يرقّعها طاقم الصيانة، ويغيب الجرحى عن المهمات، ويحلّ المستجدّون محلّ من تفقدهم من الرجال.',
    'Pick each target from the field orders as the air war moves from Emden to Berlin. Watch morale and fatigue, and bring them home after mission twenty-five.':
      'اختر كل هدف من أوامر الميدان والحرب الجوية تنتقل من إمدن إلى برلين. راقب المعنويات والإرهاق، وأعِد الرجال إلى الوطن بعد المهمة الخامسة والعشرين.',
    'Begin the tour': 'ابدأ جولة الخدمة',
    'Back': 'رجوع',
    // the board
    'Mission {n} of 25': 'المهمة {n} من 25',
    '{n} sorties flown': 'الطلعات المنفّذة: {n}',
    '{n} of 25 missions credited': 'المهمات المحتسبة: {n} من 25',
    'Field orders · {date}': 'أوامر الميدان · {date}',
    'Choose the target': 'اختر الهدف',
    'Mustang escort': 'مرافقة موستانغ',
    'Escort to the border': 'مرافقة حتى الحدود',
    'No escort': 'بلا مرافقة',
    'Last mission': 'المهمة الأخيرة',
    'Maximum effort: danger +1, merit ×1.5.': 'الجهد الأقصى: الخطر +1، والجدارة ×1.5.',
    'Fly this mission': 'نفّذ هذه المهمة',
    'Stand down a day': 'استراحة يوم',
    'The crew has had its rest. The next sortie is waiting.': 'نال الطاقم قسطه من الراحة. الطلعة التالية بانتظاره.',
    'A stand-down lowers fatigue and lets the wounded heal, once between missions.': 'الاستراحة تخفّض الإرهاق وتمنح الجرحى وقتاً للشفاء، مرة واحدة بين المهمات.',
    'Latest': 'آخر المستجدات',
    'Abandon the tour': 'التخلي عن جولة الخدمة',
    'Press again to abandon the tour': 'اضغط مرة أخرى للتخلي عن جولة الخدمة',
    'Between missions': 'بين المهمات',
    'Milk run': 'مهمة سهلة',
    'Light opposition': 'مقاومة خفيفة',
    'Defended': 'هدف محصّن',
    'Heavily defended': 'هدف محصّن بشدة',
    'Deep penetration': 'توغّل عميق',
    'Tour log ({n} sorties)': 'سجل الجولة ({n} طلعة)',
    'Mission {n}': 'المهمة {n}',
    'Credited': 'محتسبة',
    'Ship lost': 'فُقدت الطائرة',
    'Not credited': 'غير محتسبة',
    '{n} kills': '{n} إسقاطات',
    // the ship
    'The ship': 'الطائرة',
    'Damage carried by the ship': 'الأضرار التي تحملها الطائرة',
    'Missions flown': 'المهمات المنفّذة',
    'Repair patches': 'رقع الإصلاح',
    'Condition': 'الحالة',
    'Engine {e} rough': 'المحرك {e} مضطرب',
    'Ships lost: {names}': 'الطائرات المفقودة: {names}',
    'Nose': 'المقدمة', 'Cockpit': 'قمرة القيادة', 'Forward fuselage': 'الجسم الأمامي', 'Waist section': 'قسم الوسط', 'Rear fuselage': 'الجسم الخلفي', 'Tail': 'الذيل',
    'Engine 1': 'المحرك 1', 'Engine 2': 'المحرك 2', 'Engine 3': 'المحرك 3', 'Engine 4': 'المحرك 4',
    'Left wing': 'الجناح الأيسر', 'Left wingtip': 'طرف الجناح الأيسر', 'Right wing': 'الجناح الأيمن', 'Right wingtip': 'طرف الجناح الأيمن',
    // the crew
    'The crew': 'الطاقم',
    'Morale': 'المعنويات',
    'Fatigue': 'الإرهاق',
    'In good heart': 'مرتفعة', 'Holding steady': 'ثابتة', 'Shaken': 'مهتزة', 'Breaking': 'منهارة',
    'Fresh': 'نشيط', 'Tired': 'متعب', 'Worn out': 'منهك', 'Flak-happy': 'مصدوم من القتال',
    'Crew gunnery {n}% of a veteran crew.': 'رماية الطاقم {n}% من مستوى طاقم مخضرم.',
    'Wounded · out {n}': 'جريح · غائب {n}',
    'New man': 'رجل جديد',
    '{n} missions': '{n} مهمات',
    'Pilot': 'الطيار', 'Co-Pilot': 'مساعد الطيار', 'Navigator': 'الملاح', 'Bombardier': 'مُلقي القنابل', 'Radio Room': 'غرفة اللاسلكي',
    'Top Turret': 'البرج العلوي', 'Ball Turret': 'البرج الكروي', 'Left Waist': 'الجانب الأيسر', 'Right Waist': 'الجانب الأيمن', 'Tail Gun': 'مدفع الذيل',
    'Air Medal': 'وسام الطيران', 'Oak Leaf Cluster': 'عنقود أوراق البلوط', 'Distinguished Flying Cross': 'صليب الطيران المتميز', 'Purple Heart': 'القلب الأرجواني',
    'Interphone': 'الاتصال الداخلي',
    // the report
    'The Tour · {n} of 25 missions credited': 'جولة الخدمة · المهمات المحتسبة {n} من 25',
    'Back to the tour': 'العودة إلى جولة الخدمة',
    'Mission {n} of 25 credited.': 'احتُسبت المهمة {n} من 25.',
    'The {ship} went down in the sea. Air-Sea Rescue picked up the crew. The sortie is not credited.': 'سقطت {ship} في البحر، وانتشل الإنقاذ الجوي البحري الطاقم. لا تُحتسب الطلعة.',
    'The {ship} was shot down. The sortie is not credited.': 'أُسقطت {ship}. لا تُحتسب الطلعة.',
    'The sortie is not credited. Mission {n} will be flown again.': 'لا تُحتسب الطلعة. ستُنفَّذ المهمة {n} مرة أخرى.',
    '{who} died of his wounds.': 'توفي {who} متأثراً بجراحه.',
    '{who} is badly wounded and is going home. Purple Heart.': 'أُصيب {who} إصابة بالغة ويعود إلى الوطن. القلب الأرجواني.',
    '{who} is seriously wounded: hospital for {n} missions. Purple Heart.': 'أُصيب {who} إصابة خطيرة: في المستشفى لمدة {n} مهمات. القلب الأرجواني.',
    '{who} was nicked by a splinter and stays on flying status. Purple Heart.': 'خدشت شظية {who} ويبقى على قائمة الطيران. القلب الأرجواني.',
    '{who} is wounded and misses the next mission. Purple Heart.': 'أُصيب {who} وسيغيب عن المهمة التالية. القلب الأرجواني.',
    '{who} did not get out of the {ship}.': 'لم يتمكن {who} من الخروج من {ship}.',
    '{who} is missing. Nobody saw a parachute.': '{who} مفقود. لم يرَ أحد مظلته.',
    'The rest of the crew bailed out over the coast and is back at the base.': 'قفز بقية الطاقم بالمظلات فوق الساحل وعادوا إلى القاعدة.',
    'A replacement Fortress is assigned to the crew: the {ship}.': 'خُصّصت للطاقم قلعة طائرة بديلة: {ship}.',
    'The ground crew put {n} new patches on the {ship}. She carries {total} now.': 'وضع طاقم الصيانة {n} رقعة جديدة على {ship}. صارت تحمل {total} رقعة.',
    'The {ship} came home without a scratch.': 'عادت {ship} من دون خدش.',
    'Number {e} engine is still running rough.': 'ما زال المحرك رقم {e} يعمل باضطراب.',
    '{who} is promoted to {rank}.': 'رُقّي {who} إلى رتبة {rank}.',
    '{medal}: {who}': '{medal}: {who}',
    'You are awarded the {medal}.': 'مُنحت {medal}.',
    '{who} joins the crew at the {post}.': 'ينضم {who} إلى الطاقم في موقع {post}.',
    'Crew morale {a}% → {b}%. Fatigue {c}% → {d}%.': 'معنويات الطاقم {a}% ← {b}%. الإرهاق {c}% ← {d}%.',
    'The crew is stood down for a day. Fatigue {a}% → {b}%.': 'أُعطي الطاقم استراحة يوم. الإرهاق {a}% ← {b}%.',
    'Maximum effort: +{n} merit.': 'الجهد الأقصى: +{n} جدارة.',
    'Stand-down': 'استراحة',
    // the mission
    'Bring her home': 'أعِدها إلى الوطن',
    'Going Home': 'العودة إلى الوطن',
    'Mission twenty-five. When this one is over, the crew goes home.': 'المهمة الخامسة والعشرون. حين تنتهي، يعود الطاقم إلى الوطن.',
    'Intelligence expects light opposition: a few single-engine fighters near the coast. A milk run, if there is such a thing.':
      'تتوقع الاستخبارات مقاومة خفيفة: بضع مقاتلات أحادية المحرك قرب الساحل. مهمة سهلة، إن وُجد شيء كهذا.',
    'Expect fighters on the way in and out, and flak over the target. Keep the formation tight.':
      'توقّعوا مقاتلات في الذهاب والإياب، ونيراناً مضادة فوق الهدف. حافظوا على تماسك التشكيل.',
    'The target is well defended. Fighters will be waiting at the border, and the flak over the target is heavy.':
      'الهدف محصّن جيداً. ستنتظرنا المقاتلات عند الحدود، والنيران المضادة فوق الهدف كثيفة.',
    'This is a heavily defended target. Expect repeated attacks by single- and twin-engine fighters, with rockets from astern.':
      'هذا هدف محصّن بشدة. توقّعوا هجمات متكررة من مقاتلات أحادية ومزدوجة المحرك، مع صواريخ من الخلف.',
    'Deep penetration. Every fighter group in the Reich will be up, in relays, from the coast to the target and back. Some of us will not come home.':
      'توغّل عميق. ستقلع كل مجموعة مقاتلات في الرايخ، على دفعات، من الساحل إلى الهدف وفي طريق العودة. بعضنا لن يعود.',
    'There is no escort beyond the Dutch coast. From there on the formation is its own escort.':
      'لا مرافقة بعد الساحل الهولندي. من هناك يحمي التشكيل نفسه بنفسه.',
    'Thunderbolts will take us as far as the German border. After that we are on our own until they meet us on the way home.':
      'سترافقنا طائرات ثندربولت حتى الحدود الألمانية. بعد ذلك نحن وحدنا حتى تلاقينا في طريق العودة.',
    'Mustangs will be with us all the way to the target. Hold out until the little friends arrive.':
      'سترافقنا طائرات موستانغ حتى الهدف. اصمدوا حتى يصل الأصدقاء الصغار.',
    'One new man is flying with the crew. Keep an eye on them.': 'رجل جديد يطير مع الطاقم. انتبهوا له.',
    'Maximum effort: every ship that can fly goes today.': 'الجهد الأقصى: كل طائرة قادرة على الطيران تنطلق اليوم.',
    'Twenty-five. Wheels down at Deenethorpe, and the crew climbs out for the last time. Tour complete.':
      'خمس وعشرون. هبطت العجلات في دينثورب، ويخرج الطاقم من الطائرة للمرة الأخيرة. اكتملت جولة الخدمة.',
    // the finale
    'Twenty-five missions. The crew climbs out of the {ship} for the last time.': 'خمس وعشرون مهمة. يخرج الطاقم من {ship} للمرة الأخيرة.',
    'Lucky Bastard Club': 'نادي المحظوظين',
    'This certifies that the bearer has completed a combat tour of twenty-five missions over enemy territory with the 401st Bomb Squadron.':
      'تشهد هذه الوثيقة بأن حاملها أتمّ جولة قتالية من خمس وعشرين مهمة فوق أراضي العدو مع سرب القاذفات 401.',
    'Sorties flown': 'الطلعات المنفّذة',
    'Confirmed kills': 'الإسقاطات المؤكدة',
    'Fortresses': 'القلاع الطائرة',
    'Medals': 'الأوسمة',
    'Going home with you': 'يعودون معك إلى الوطن',
    'Sent home wounded': 'أُعيدوا جرحى إلى الوطن',
    'Remembered': 'في الذاكرة',
    'Begin a new tour': 'ابدأ جولة خدمة جديدة',
    'Main menu': 'القائمة الرئيسية',
    // events
    'Flak house': 'دار الاستجمام',
    'Halfway. The flight surgeon sends the crew to a rest home in the country for a week: real beds, real eggs and no interphone.':
      'منتصف الطريق. يرسل طبيب الطيران الطاقم إلى دار استجمام في الريف لمدة أسبوع: أسرّة حقيقية، وبيض حقيقي، ولا اتصال داخلي.',
    'Pack your bags': 'احزموا حقائبكم',
    'A week of sleep. The crew comes back rested.': 'أسبوع من النوم. يعود الطاقم مرتاحاً.',
    'Mail call': 'وصل البريد',
    'Letters and parcels from home reach the hut. Nobody says much for an hour.': 'تصل الرسائل والطرود من الوطن إلى الكوخ. لا أحد يتكلم كثيراً لساعة.',
    'Read your letters': 'اقرؤوا رسائلكم',
    'The hut is quiet and warm. Morale rises.': 'الكوخ هادئ ودافئ. ترتفع المعنويات.',
    'A new engine': 'محرك جديد',
    'The crew chief has found a factory-fresh Wright Cyclone and wants to hang it on the {ship}.': 'عثر كبير الفنيين على محرك رايت سايكلون جديد من المصنع ويريد تركيبه على {ship}.',
    'Hang the new engine': 'ركّب المحرك الجديد',
    'The tired engine is replaced. She runs like a watch.': 'استُبدل المحرك المتعب. صارت تعمل بدقة الساعة.',
    'Forty-eight hour pass': 'إجازة ثمانٍ وأربعين ساعة',
    'The crew has a pass to London. The ground crew could use extra hands on the {ship}.': 'لدى الطاقم إجازة إلى لندن. وطاقم الصيانة يحتاج إلى أيدٍ إضافية على {ship}.',
    'Go to London': 'اذهبوا إلى لندن',
    'Two days in London. The crew comes back tired but happy.': 'يومان في لندن. يعود الطاقم متعباً لكنه سعيد.',
    'Stay and help the ground crew': 'ابقوا وساعدوا طاقم الصيانة',
    'Extra hands on the line. The {ship} is in better shape.': 'أيدٍ إضافية في العمل. صارت {ship} في حال أفضل.',
    'Empty bunks': 'أسرّة فارغة',
    'The crew in the next hut did not come back yesterday. Their bunks were stripped this morning.': 'لم يعد طاقم الكوخ المجاور أمس. أُفرغت أسرّتهم هذا الصباح.',
    'Carry on': 'تابعوا',
    'Nobody talks much at breakfast.': 'لا أحد يتكلم كثيراً على الفطور.',
    'Maximum effort': 'الجهد الأقصى',
    'Group orders a maximum effort: every ship that can fly goes next. The crew chief wants the {ship} on the ground for repairs.':
      'تأمر المجموعة بجهد أقصى: كل طائرة قادرة على الطيران تنطلق في المهمة التالية. ويريد كبير الفنيين إبقاء {ship} على الأرض للإصلاح.',
    'Volunteer the {ship}': 'تطوّعوا بـ{ship}',
    'The {ship} is on the board. The danger is higher, and so is the merit.': '{ship} على اللوحة. الخطر أكبر، وكذلك الجدارة.',
    'Ground her for repairs': 'أبقوها على الأرض للإصلاح',
    'The ground crew works through the night.': 'يعمل طاقم الصيانة طوال الليل.',
    'Lucky charm': 'تميمة الحظ',
    "Sergeant Walsh has lost the rabbit's foot he keeps in his flak vest. He swears he will not fly without it.": 'أضاع الرقيب والش قدم الأرنب التي يحتفظ بها في سترته الواقية. ويُقسم أنه لن يطير من دونها.',
    'Search the dispersal': 'فتّشوا موقف الطائرات',
    'Found it under his bunk. Walsh grins all the way to the briefing.': 'وجدوها تحت سريره. يبتسم والش طوال الطريق إلى الإيجاز.',
    'Tell him luck is for the Luftwaffe': 'قولوا له إن الحظ للوفتفافه',
    'Walsh flies without it. He does not say a word all day.': 'يطير والش من دونها. لا ينطق بكلمة طوال اليوم.',
    'Fogbound': 'حبيسو الضباب',
    'Fog sits on the field for three days. Nobody flies, and everybody sleeps.': 'يجثم الضباب على المطار ثلاثة أيام. لا أحد يطير، والجميع ينامون.',
    'Sleep': 'ناموا',
    'Three quiet days.': 'ثلاثة أيام هادئة.',
    'Dance in the hangar': 'حفلة في حظيرة الطائرات',
    'A band from the States plays in the big hangar tonight.': 'فرقة من الولايات المتحدة تعزف في الحظيرة الكبيرة الليلة.',
    'Go dancing': 'اذهبوا للرقص',
    'The crew dances until the band packs up.': 'يرقص الطاقم حتى تحزم الفرقة آلاتها.',
    'Green replacements': 'بدلاء بلا خبرة',
    'The new men have never fired at a moving target. You could take them up for gunnery practice over the Wash.': 'لم يطلق الرجال الجدد النار على هدف متحرك قط. يمكنك أن تأخذهم في طلعة تدريب على الرماية فوق خليج الواش.',
    'Fly a practice flight': 'نفّذ طلعة تدريب',
    'The new men can lead a target now.': 'صار الرجال الجدد يحسنون التصويب أمام الهدف.',
    'Let them rest': 'دعهم يستريحون',
    'They will learn over Germany.': 'سيتعلمون فوق ألمانيا.',
    'The general visits': 'زيارة الجنرال',
    'A general is visiting the group. The {ship} must shine.': 'جنرال يزور المجموعة. يجب أن تلمع {ship}.',
    'Polish her': 'لمّعوها',
    'The general shakes every hand. The crew stands a little taller.': 'يصافح الجنرال الجميع. يقف الطاقم أكثر اعتزازاً.',
    'Hide in the hangar': 'اختبئوا في الحظيرة',
    'Nobody notices you were missing.': 'لم يلاحظ أحد غيابكم.',
    'Letters home': 'رسائل إلى الوطن',
    'The skipper sits up late writing to the families of the men the crew has lost.': 'يسهر قائد الطائرة يكتب إلى عائلات الرجال الذين فقدهم الطاقم.',
    'Help him write': 'ساعده في الكتابة',
    'It is the hardest thing the crew has done. They will fly the next one for them.': 'إنه أصعب ما فعله الطاقم. سيطيرون المهمة التالية من أجلهم.',
    "Armorers' work": 'عمل فنيي الأسلحة',
    'The armorers have new barrels and fresh belts for every gun aboard the {ship}.': 'لدى فنيي الأسلحة سبطانات جديدة وأحزمة ذخيرة لكل رشاش على متن {ship}.',
    'Test fire over the sea': 'اختبروا الرماية فوق البحر',
    'Every gun runs clean.': 'كل الرشاشات تعمل بلا عيب.',
    // titles of the field orders
    'First Light over Emden': 'أول الضوء فوق إمدن', 'The Dutch Airfields': 'المطارات الهولندية', 'Frankfurt Morning': 'صباح فرانكفورت',
    'Saar Rail Yards': 'سكك السار', 'Bremen Docks': 'أرصفة بريمن', 'The Baltic Run': 'رحلة البلطيق', 'Sunday at Münster': 'أحد في مونستر',
    'Black Thursday': 'الخميس الأسود', 'Through the Undercast': 'عبر الغيوم السفلية', 'Münster Again': 'مونستر مجدداً', 'Bremen in the Clouds': 'بريمن في الغيوم',
    'Paris Ball-Bearings': 'محامل باريس', 'Kiel with the Mustangs': 'كيل مع الموستانغ', 'Bremen Port Area': 'منطقة ميناء بريمن', 'Christmas Week': 'أسبوع الميلاد',
    'Flak Alley': 'زقاق النيران', 'Frankfurt by Radar': 'فرانكفورت بالرادار', 'Frankfurt Rail Yards': 'سكك فرانكفورت', 'Big Week: Leipzig': 'الأسبوع الكبير: لايبزيغ',
    'Big Week: Brunswick': 'الأسبوع الكبير: براونشفايغ', 'Schweinfurt Again': 'شفاينفورت مجدداً', 'Big B': 'الهدف الكبير', 'Erkner': 'إركنر',
    'Berlin by Daylight': 'برلين في وضح النهار',
  },
  patterns: [
    [new RegExp(`^(${whatRx}), (.+)$`), (m, tr) => `${tr(m[1])}، ${tr(m[2])}`],
    [/^Mission (\d+) of your tour\. The group is going to (.+) today, and the target is the (.+)\.$/, (m, tr) => `المهمة ${m[1]} من جولتك. تتجه المجموعة اليوم إلى ${tr(m[2])}، والهدف هو ${tr(m[3])}.`],
    [/^The target is the (.+) at (.+), a long way south\. The Luftwaffe knows the bombers are coming, and a battle group will meet us over the target\.$/,
      (m, tr) => `الهدف هو ${tr(m[1])} في ${tr(m[2])}، بعيداً في الجنوب. تعرف اللوفتفافه أن القاذفات قادمة، وستلاقينا مجموعة قتالية فوق الهدف.`],
    [/^The (.+) carries (\d+) repair patches from earlier missions\.$/, (m) => `تحمل ${m[1]} ${m[2]} رقعة إصلاح من المهمات السابقة.`],
    [/^The (.+) is fresh from the depot\. Treat her well\.$/, (m) => `${m[1]} جديدة من المستودع. اعتنوا بها.`],
    [/^Number (\d) engine is running rough\. The crew chief says she will hold\.$/, (m) => `المحرك رقم ${m[1]} يعمل باضطراب. يقول كبير الفنيين إنه سيصمد.`],
    [/^(.+) is in hospital\. A spare man from the pool flies in his place\.$/, (m, tr) => `${name(m[1], tr)} في المستشفى. يطير رجل احتياطي مكانه.`],
    [/^(\d+) new men are flying with the crew\. Keep an eye on them\.$/, (m) => `${m[1]} رجال جدد يطيرون مع الطاقم. انتبهوا لهم.`],
    [/^You are on the (.+) today\. Use every position, one through five\.$/, (m, tr) => `موقعك اليوم: ${tr(m[1])}. استخدم كل المواقع، من واحد إلى خمسة.`],
    [/^Bombs on the (.+) at (.+)\. Mission (\d+) is in the books\.$/, (m, tr) => `القنابل على ${tr(m[1])} في ${tr(m[2])}. سُجّلت المهمة ${m[3]}.`],
    [/^(Sgt\.|S\/Sgt\.|T\/Sgt\.|Lt\.|Capt\.|Maj\.) ([A-Z][A-Za-z']+)$/, (m, tr) => `${RANK[m[1]]} ${tr(m[2])}`],
    // recorded interphone lines (tools/voice/lines.json, group "Phase 11 the tour")
    [/^Pilot to crew: that's number ([a-z-]+) in the books\.$/, (m) => `الطيار إلى الطاقم: هذه المهمة رقم ${NUM_WORDS.indexOf(m[1]) + 1} في السجل.`],
  ],
};
table.phrases["Halfway, boys. Twelve down and thirteen to go."] = 'منتصف الطريق يا رفاق. اثنتا عشرة خلفنا وثلاث عشرة أمامنا.';
table.phrases["One more, crew. One more and we all go home."] = 'واحدة أخرى يا طاقم. واحدة أخرى ونعود جميعاً إلى الوطن.';
table.phrases["That's twenty-five. Crew, we're going home."] = 'هذه الخامسة والعشرون. أيها الطاقم، نحن عائدون إلى الوطن.';
table.phrases["They won't count that one. We go again."] = 'لن يحتسبوا هذه. سنعيدها.';
table.phrases["We lost the ship. They'll find us another one."] = 'خسرنا الطائرة. سيجدون لنا أخرى.';
table.phrases['Mail call! Letters from home for everybody.'] = 'وصل البريد! رسائل من الوطن للجميع.';
table.phrases['A week at the flak house. Real beds and real eggs.'] = 'أسبوع في دار الاستجمام. أسرّة حقيقية وبيض حقيقي.';
table.phrases['Maximum effort tomorrow. Get some sleep.'] = 'جهد أقصى غداً. نالوا قسطاً من النوم.';
table.phrases["Fog on the field. Nobody's flying today."] = 'ضباب على المطار. لا أحد يطير اليوم.';

export default table;
