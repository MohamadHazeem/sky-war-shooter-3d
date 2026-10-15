import type { PhraseTable, Pattern } from '../types';

// Arabic for the radio texts, keyed by the exact English shown in game.
// Radio lines reach the screen through World.callout -> events.radio -> UI.subtitle, which
// translates both the speaker and the line. The recorded voices play their Arabic takes
// (tools/voice/arabic.mjs speaks exactly these texts; re-run it after changing one).

// ---------- building blocks ----------

// World.clockPosition: `${word} o'clock ${high|low|level}`
const HOURS: Record<string, string> = {
  one: 'الواحدة', two: 'الثانية', three: 'الثالثة', four: 'الرابعة', five: 'الخامسة', six: 'السادسة',
  seven: 'السابعة', eight: 'الثامنة', nine: 'التاسعة', ten: 'العاشرة', eleven: 'الحادية عشرة', twelve: 'الثانية عشرة',
};
const ELEV: Record<string, string> = { high: 'من الأعلى', low: 'من الأسفل', level: 'على مستوانا' };
const CLOCK = "(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) o'clock (high|low|level)";
const clockAr = (h: string, e: string) => `الساعة ${HOURS[h]} ${ELEV[e]}`;

const SIDE: Record<string, string> = { left: 'الأيسر', right: 'الأيمن' };

// Crew names: "Rank First Last" (CrewRoster MEN calls, rookies, B17Layout station crews)
const RANKS: Record<string, string> = { 'Capt.': 'النقيب', 'Lt.': 'الملازم', 'Sgt.': 'الرقيب', 'Maj.': 'الرائد', 'Col.': 'العقيد' };
const NAME_WORDS: Record<string, string> = {
  Hal: 'هال', Brenner: 'برينر', Frank: 'فرانك', Doyle: 'دويل', Eli: 'إيلاي', Stern: 'ستيرن',
  Ray: 'راي', Kessler: 'كيسلر', Luis: 'لويس', Mendez: 'منديز', Tom: 'توم', Gallo: 'غالو',
  Mick: 'ميك', Reilly: 'رايلي', Earl: 'إيرل', Price: 'برايس', Danny: 'داني', Walsh: 'والش',
  Dawson: 'داوسون', Bill: 'بيل', Morrow: 'مورو', Jim: 'جيم', Carver: 'كارفر', Ed: 'إد',
  Pruitt: 'برويت', Sam: 'سام', Ortega: 'أورتيغا', Kowalski: 'كوالسكي', Hughes: 'هيوز',
  Baker: 'بيكر', Russo: 'روسو', Novak: 'نوفاك', Fisher: 'فيشر',
};
const CREW_CALLS = [
  'Capt. Hal Brenner', 'Lt. Frank Doyle', 'Lt. Eli Stern', 'Lt. Ray Kessler', 'Sgt. Mendez', 'Sgt. Luis Mendez',
  'Sgt. Tom Gallo', 'Sgt. Reilly', 'Sgt. Price', 'Sgt. Walsh', 'Sgt. Dawson',
  'Capt. Bill Morrow', 'Lt. Jim Carver', 'Lt. Ed Pruitt', 'Lt. Sam Ortega', 'Sgt. Kowalski', 'Sgt. Hughes',
  'Sgt. Baker', 'Sgt. Russo', 'Sgt. Novak', 'Sgt. Fisher',
];
const nameAr = (s: string) => s.split(' ').map((w) => RANKS[w] ?? NAME_WORDS[w] ?? w).join(' ');
const crewNames: Record<string, string> = {};
for (const c of CREW_CALLS) crewNames[c] = nameAr(c);
// radio speakers that are a crewman's surname (CrewRoster voice aliases)
for (const s of ['Mendez', 'Gallo', 'Reilly', 'Price', 'Walsh', 'Dawson']) crewNames[s] = NAME_WORDS[s];

// Crew.ts spots, for "<name> is hit <spot>!"
const SPOTS: Record<string, string> = {
  'up front in the cockpit': 'في قمرة القيادة',
  'at the nav table': 'عند طاولة الملاحة',
  'in the nose': 'في المقدمة',
  'at the top turret': 'في البرج العلوي',
  'at the radio': 'عند جهاز اللاسلكي',
  'in the ball turret': 'في البرج الكروي',
  'at the left waist gun': 'عند مدفع الجانب الأيسر',
  'at the right waist gun': 'عند مدفع الجانب الأيمن',
  'in the tail': 'في الذيل',
};

// Luftkreuzer names (BossShip.ts)
const SHIPS: Record<string, string> = {
  'Walküre': 'فالكيري',
  'Donnerkeil': 'دونركايل',
  'Brunhilde': 'برونهيلده',
  'Götterdämmerung': 'غوتردَمِرونغ',
};

// Enemy types first seen (EnemyTypes.ts): "<label>s coming in — <blurb>!"
const BLURBS: Record<string, string> = {
  'Butcher-bird': 'طائر الجزّار',
  'nimble, lightly built': 'رشيقة وخفيفة البنية',
  'jet — very fast, fragile': 'نفّاثة — سريعة جداً وهشّة',
  'twin-engine destroyer — heavy, tough': 'مدمّرة ثنائية المحرك — ثقيلة وصلبة',
  'heavy twin — slow, armoured, hard to bring down': 'ثقيلة ثنائية المحرك — بطيئة ومدرّعة ويصعب إسقاطها',
  'rocket fighter — blindingly fast, made of paper': 'مقاتلة صاروخية — سريعة كالبرق، هشّة كالورق',
};

// RandomEvents jam: STATIONS label lower-cased, then " gun"
const JAM_GUN: Record<string, string> = {
  'left waist': 'الجانب الأيسر', 'right waist': 'الجانب الأيمن', 'top turret': 'البرج العلوي',
  'ball turret': 'البرج الكروي', 'tail gun': 'الذيل',
};

const ship = (s: string, tr: (s: string) => string) => SHIPS[s] ?? tr(s);
const crew = (s: string, tr: (s: string) => string) => crewNames[s] ?? tr(s);

const patterns: Pattern[] = [
  [new RegExp(`^(Fw 190|Bf 109|Bf 110|Ju 88|Me 262|Me 163|He 111|Me 410|Do 335)s, ${CLOCK}!$`), (m) => `طائرات ${m[1]}، ${clockAr(m[2], m[3])}!`],
  // a bare clock position (World.clockPosition), so other lines can tr() it
  [new RegExp(`^${CLOCK}$`), (m) => clockAr(m[1], m[2])],

  // World.radioChatter: attack calls with a clock position
  [new RegExp(`^Fighters, ${CLOCK}!$`), (m) => `مقاتلات، ${clockAr(m[1], m[2])}!`],
  [new RegExp(`^Bandit coming in, ${CLOCK}!$`), (m) => `طائرة معادية قادمة، ${clockAr(m[1], m[2])}!`],
  [new RegExp(`^Here he comes, ${CLOCK}!$`), (m) => `ها هو قادم، ${clockAr(m[1], m[2])}!`],
  [new RegExp(`^Fw one-ninety, ${CLOCK}! Get him!$`), (m) => `Fw 190، ${clockAr(m[1], m[2])}! أسقِطوه!`],
  // Game: a new group arrives
  [/^(More bandits|Bandits), (.+)!$/, (m, tr) => `${m[1] === 'Bandits' ? 'أعداء' : 'مزيد من الأعداء'}، ${tr(m[2])}!`],
  // Game: first sighting of an enemy type
  [/^(.+)s coming in — (.+)!$/, (m, tr) => `طائرات ${m[1]} قادمة — ${BLURBS[m[2]] ?? tr(m[2])}!`],

  // World: engines and fires on the player's bomber
  [/^Number (\d) engine is hit! Feathering number \1!$/, 'أُصيب المحرك رقم $1! نوقف مروحة المحرك $1!'],
  [/^Fire in number (\d) engine!$/, 'حريق في المحرك رقم $1!'],
  [/^Extinguisher's in\. Fire's out on number (\d)\.$/, 'أطلقنا المطفأة. أُخمد الحريق في المحرك $1.'],
  [/^Extinguisher didn't take! Number (\d) is still burning!$/, 'المطفأة لم تنفع! المحرك $1 ما زال يحترق!'],
  // World: wingmen and crew
  [/^(.+) is falling out of formation!$/, (m, tr) => `${tr(m[1])} تخرج من التشكيل!`],
  [/^(.+) is hit (.+)! Somebody get him some help!$/, (m, tr) => `${crew(m[1], tr)} مصاب ${SPOTS[m[2]] ?? tr(m[2])}! ليُسعفه أحدكم!`],
  // Game: a bomber of the group lost
  [/^(.+) is going down! Count the chutes!$/, (m, tr) => `${tr(m[1])} تسقط! عُدّوا المظلات!`],

  // PlayerBomberDamage
  [/^We're taking hits in the (left|right) wing!$/, (m) => `نتلقى إصابات في الجناح ${SIDE[m[1]]}!`],
  [/^Ball turret to pilot: we're streaming fuel from the (left|right) wing tank!$/, (m) => `البرج الكروي إلى الطيار: الوقود يتسرّب من خزان الجناح ${SIDE[m[1]]}!`],
  [/^Number (\d) feathered\. Watch your fuel, engineer\.$/, 'أوقفنا مروحة المحرك $1. راقب الوقود أيها المهندس.'],
  [/^Number (\d) won't feather — she's windmilling! Hang on, she's going to shake!$/, 'مروحة المحرك $1 لا تتوقف — تدور بلا سيطرة! تمسّكوا، ستهتز الطائرة!'],
  [/^Fire's spreading along the (left|right) wing! Hit it again!$/, (m) => `النار تنتشر على الجناح ${SIDE[m[1]]}! أطلقوا المطفأة مجدداً!`],
  [/^Number (\d)'s throwing oil! She's smoking bad!$/, 'المحرك $1 يقذف الزيت! الدخان كثيف!'],
  [/^The (left|right) wingtip's gone — shot clean off!$/, (m) => `طرف الجناح ${SIDE[m[1]]} اختفى — قُطع بالكامل!`],

  // RandomEvents
  [/^Fire in number (\d)! Get the extinguisher on it before it reaches the tanks!$/, 'حريق في المحرك $1! أطفئوه قبل أن يصل إلى الخزانات!'],
  [/^It's spreading to number (\d)! Get it out!$/, 'النار تمتد إلى المحرك $1! أطفئوها!'],
  [/^Fire's out on number (\d)\. Good work back there\.$/, 'أُخمد الحريق في المحرك $1. أحسنتم هناك في الخلف.'],
  [/^Engineer got it out — but number (\d)'s finished\. Feathering it\.$/, 'المهندس أخمده — لكن المحرك $1 انتهى. نوقف مروحته.'],
  [/^Engineer got the fire out on number (\d)\.$/, 'المهندس أخمد الحريق في المحرك $1.'],
  [/^Gunner, your (.+) gun's gone quiet — is it jammed\? Clear it!$/, (m, tr) => `أيها الرامي، مدفع ${JAM_GUN[m[1]] ?? tr(m[1])} صمت — هل تعطّل؟ أصلِحه!`],
  [/^(.+) to anybody — two engines out, we're falling behind and they're all over us! We need cover!$/, (m, tr) => `${tr(m[1])} إلى الجميع — محرّكان معطّلان، نتأخر عن التشكيل وهم يحيطون بنا! نحتاج إلى حماية!`],
  [/^(.+) here — thanks for the cover\. We'll make it home\.$/, (m, tr) => `هنا ${tr(m[1])} — شكراً على الحماية. سنصل إلى الديار.`],
  // Objectives
  [/^(.+) to group: we're hit bad and they're lining up on us\. Cover us!$/, (m, tr) => `${tr(m[1])} إلى المجموعة: إصابتنا بالغة وهم يصطفّون علينا. احمونا!`],
  [/^(.+) here\. Thanks for the cover — we owe you one\.$/, (m, tr) => `هنا ${tr(m[1])}. شكراً على الحماية — لكم علينا دَين.`],

  // BossBattle: lines naming a Luftkreuzer
  [/^(.+)'s big gun is training on us — knock it out!$/, (m, tr) => `مدفع ${ship(m[1], tr)} الكبير يصوّب علينا — دمّروه!`],
  [/^Flak gun on (.+) is laying on us! Hit it before it fires!$/, (m, tr) => `مدفع المضادات على ${ship(m[1], tr)} مصوَّب نحونا! اضربوه قبل أن يطلق!`],
  [/^(.+)'s loading rockets — shoot the pods!$/, (m, tr) => `${ship(m[1], tr)} تلقّم الصواريخ — اضربوا الحاضنات!`],
  [/^Rocket pods on (.+) are glowing! Take them out!$/, (m, tr) => `حاضنات الصواريخ على ${ship(m[1], tr)} تتوهّج! دمّروها!`],
  [/^(.+) is swinging every gun onto us — broadside coming!$/, (m, tr) => `${ship(m[1], tr)} توجّه كل مدافعها نحونا — رشقة جانبية قادمة!`],
  [/^(.+) is turning into us — she means to ram! Shoot her down!$/, (m, tr) => `${ship(m[1], tr)} تستدير نحونا — تنوي الصدم! أسقطوها!`],
  [/^(.+) is turning into the bombers — she's going to ram!$/, (m, tr) => `${ship(m[1], tr)} تستدير نحو القاذفات — ستصدمها!`],
  [/^(.+)'s mad as hell — she's throwing everything at us!$/, (m, tr) => `${ship(m[1], tr)} في قمة غضبها — ترمينا بكل ما لديها!`],
  [/^(.+) is hurt and angry! Watch her guns!$/, (m, tr) => `${ship(m[1], tr)} جريحة وغاضبة! احذروا مدافعها!`],
  [/^(.+) is the last one — she's desperate! Brace yourselves!$/, (m, tr) => `${ship(m[1], tr)} هي الأخيرة — إنها يائسة! استعدّوا!`],
  [/^(.+)'s armour is cracked wide open — pour it into her hull!$/, (m, tr) => `درع ${ship(m[1], tr)} تشقّق تماماً — أمطروا هيكلها!`],
  [/^Her plating's gone! Hit (.+) anywhere now!$/, (m, tr) => `صفائحها تحطّمت! اضربوا ${ship(m[1], tr)} في أي مكان الآن!`],
  [/^Got one of (.+)'s turrets!$/, (m, tr) => `دمّرنا أحد أبراج ${ship(m[1], tr)}!`],
  [/^(.+)'s big gun is gone!$/, (m, tr) => `مدفع ${ship(m[1], tr)} الكبير انتهى!`],
  [/^(.+)'s got an engine on fire — she's losing speed!$/, (m, tr) => `محرك في ${ship(m[1], tr)} يشتعل — إنها تفقد سرعتها!`],
  [/^You hit (.+)'s fuel tank — look at her burn!$/, (m, tr) => `أصبتَ خزان وقود ${ship(m[1], tr)} — انظروا إليها تحترق!`],
  [/^Her bridge is gone! (.+)'s guns are firing blind!$/, (m, tr) => `جسر قيادتها دُمّر! مدافع ${ship(m[1], tr)} تطلق عشوائياً!`],
  [/^They're launching fighters from (.+)!$/, (m, tr) => `يُطلقون مقاتلات من ${ship(m[1], tr)}!`],
  [/^More fighters coming off (.+)!$/, (m, tr) => `مزيد من المقاتلات تخرج من ${ship(m[1], tr)}!`],
  [/^(.+) is breaking up! She's going down!$/, (m, tr) => `${ship(m[1], tr)} تتفكك! إنها تسقط!`],
  [/^Scratch (.+)! She's finished!$/, (m, tr) => `شطبنا ${ship(m[1], tr)}! انتهى أمرها!`],
];

const table: PhraseTable = {
  phrases: {
    // weather fronts (World.weatherFront)
    "Storm front dead ahead. Tighten it up — we're going right through it.": 'جبهة عاصفة أمامنا مباشرة. شدّوا التشكيل — سنعبرها من وسطها.',
    'Blue flight, storm front dead ahead. Close it up and stay on my wing in the murk.': 'السرب الأزرق، جبهة عاصفة أمامنا مباشرة. اقتربوا والزموا جناحي وسط العتمة.',
    "We're breaking out of the cloud — clear sky ahead. They'll see us coming now.": 'نخرج من الغيوم — سماء صافية أمامنا. سيروننا قادمين الآن.',
    "Blue flight, the cloud's breaking up. Clear sky ahead — keep your eyes open.": 'السرب الأزرق، الغيوم تنقشع. سماء صافية أمامنا — أبقوا أعينكم مفتوحة.',
    // ---------- speakers ----------
    'Pilot': 'الطيار',
    'Co-Pilot': 'مساعد الطيار',
    'Co-pilot': 'مساعد الطيار',
    'Copilot': 'مساعد الطيار',
    'Navigator': 'الملاح',
    'Bombardier': 'مُلقي القنابل',
    'Engineer': 'المهندس',
    'Radio': 'اللاسلكي',
    'Tail': 'الذيل',
    'Top Turret': 'البرج العلوي',
    'Ball Turret': 'البرج الكروي',
    'Ball': 'الكروي',
    'Waist': 'الجانب',
    'Lead': 'القائد',
    'Big Friend': 'الصديق الكبير',
    'Blue Three': 'الأزرق 3',
    'Intelligence Officer': 'ضابط الاستخبارات',
    ...crewNames,
    ...SPOTS,
    ...SHIPS,
    ...BLURBS,

    // ---------- voiceLines.ts (the recorded lines) ----------
    "That's five! You're an ace, gunner — drinks are on me tonight!": 'هذه الخامسة! صرتَ آساً يا رامي — المشروبات على حسابي الليلة!',
    "Bombs away! Let's get out of here!": 'أُلقيت القنابل! لنخرج من هنا!',
    'Ball turret. Nothing below but cloud. Guns are clear.': 'البرج الكروي. لا شيء تحتنا سوى الغيوم. المدافع جاهزة.',
    'Little friends, little friends, thanks for the company.': 'أيها الأصدقاء الصغار، أيها الأصدقاء الصغار، شكراً على الصحبة.',
    'Blue Three, engine temps okay. Holding high cover.': 'الأزرق 3، حرارة المحرك سليمة. أحافظ على الغطاء العلوي.',
    'Bombardier here. Keep your eyes open, they like to come out of the sun.': 'هنا مُلقي القنابل. افتحوا أعينكم، يحبّون الانقضاض من جهة الشمس.',
    "Engineer to pilot: number three's running a little hot. Watching it.": 'المهندس إلى الطيار: المحرك الثالث حرارته مرتفعة قليلاً. أراقبه.',
    'Stay off the interphone unless you see fighters. Keep scanning.': 'لا تستخدموا الاتصال الداخلي إلا إن رأيتم مقاتلات. واصلوا المراقبة.',
    'Blue flight, check your fuel. Weave over the big friends.': 'السرب الأزرق، تفقّدوا الوقود. تعرّجوا فوق الأصدقاء الكبار.',
    "Keep your heads on a swivel. They'll come out of the sun.": 'أديروا رؤوسكم في كل اتجاه. سيأتون من جهة الشمس.',
    'Navigator to pilot: on course, two-seven minutes to the IP.': 'الملاح إلى الطيار: على المسار، 27 دقيقة إلى نقطة البدء.',
    'Pilot to crew, oxygen check. Sound off.': 'الطيار إلى الطاقم، فحص الأكسجين. أبلغوا تباعاً.',
    'Radio to pilot: group says keep it tight, fighters reported ahead.': 'اللاسلكي إلى الطيار: المجموعة تقول حافظوا على التشكيل، مقاتلات مُبلَّغ عنها أمامنا.',
    'Tail gunner, oxygen okay.': 'رامي الذيل، الأكسجين سليم.',
    "Getting the feel of this gun now. Keep 'em coming!": 'بدأت أعتاد هذا المدفع. هاتوا المزيد!',
    "I'm getting the hang of this. Send me another one!": 'صرتُ أتقن هذا. أرسلوا لي واحدة أخرى!',
    "Starting to see 'em before they see me.": 'بدأت أراهم قبل أن يروني.',
    "Little friends at six o'clock high! The Mustangs are here!": 'الأصدقاء الصغار عند الساعة السادسة من الأعلى! وصلت الموستانغ!',
    'Flak ahead. Initial point in two minutes — here it comes.': 'نيران المضادات أمامنا. نقطة البدء بعد دقيقتين — ها هي قادمة.',
    "Short bursts! You'll burn out that barrel!": 'رشقات قصيرة! ستحرق تلك السبطانة!',
    'Scratch one Focke-Wulf!': 'أسقطنا فوكه-وولف!',
    "Got him! He's going down!": 'أصبته! إنه يسقط!',
    'Scratch one Messerschmitt!': 'أسقطنا مسرشميت!',
    'You got him! Nice shooting!': 'أصبته! رماية رائعة!',
    "He's smoking — he's finished!": 'إنه يدخّن — انتهى أمره!',
    "Fighters assembling behind us, six o'clock level. Lots of them.": 'مقاتلات تتجمّع خلفنا، الساعة السادسة على مستوانا. أعداد كبيرة.',
    "More bandits! They're everywhere!": 'مزيد من الأعداء! إنهم في كل مكان!',
    "Little friends, little friends, we have bandits at our six o'clock!": 'أيها الأصدقاء الصغار، لدينا أعداء عند الساعة السادسة!',
    "Bandits up high, going for the lead ships. Keep them off me till we're on the bomb run!": 'أعداء في الأعلى يستهدفون طائرات المقدمة. أبعدوهم عني حتى نبدأ مسار القصف!',
    "Fighters coming up from the coast, nine o'clock low. Stay sharp.": 'مقاتلات صاعدة من الساحل، الساعة التاسعة من الأسفل. ابقوا متيقّظين.',
    'Escort reports sixty seconds out. Hang on!': 'المرافقة على بُعد ستين ثانية. اصمدوا!',
    'Last bunch before the target. Make them count!': 'آخر دفعة قبل الهدف. اجعلوا كل طلقة تُحسب!',
    "Bandits twelve o'clock low, climbing for the bombers. Let's go get them.": 'أعداء عند الساعة الثانية عشرة من الأسفل، يصعدون نحو القاذفات. لننقضّ عليهم.',
    "Here they come. Big gaggle at twelve o'clock — drop tanks and go!": 'ها هم قادمون. سرب كبير عند الساعة الثانية عشرة — ألقوا الخزانات وانطلقوا!',
    "Bandits climbing out of the murk, twelve o'clock low. Blue flight, stay with me!": 'أعداء يخرجون من الضباب، الساعة الثانية عشرة من الأسفل. السرب الأزرق، ابقوا معي!',
    "Fighters low on the water, six o'clock. They followed us out.": 'مقاتلات منخفضة فوق الماء، الساعة السادسة. لحقوا بنا.',
    "More of them up ahead. Twelve o'clock — here they come.": 'المزيد منهم أمامنا. الساعة الثانية عشرة — ها هم قادمون.',
    'More coming in on the left! Watch your nine!': 'المزيد قادمون من اليسار! راقبوا الساعة التاسعة!',
    "Pilot to crew, one more time. Fighters, twelve o'clock high, a lot of them!": 'الطيار إلى الطاقم، مرة أخرى. مقاتلات، الساعة الثانية عشرة من الأعلى، أعداد كبيرة!',
    'Fighters up high, coming out of the sun!': 'مقاتلات في الأعلى، قادمة من جهة الشمس!',
    'Another Staffel forming up astern!': 'سرب آخر يتشكّل خلفنا!',
    "Bandits! Twelve o'clock high, a whole Staffel of them!": 'أعداء! الساعة الثانية عشرة من الأعلى، سرب كامل منهم!',
    "Fighters, three o'clock level! Coming in from the right!": 'مقاتلات، الساعة الثالثة على مستوانا! قادمة من اليمين!',
    "We're through the flak. Here come the fighters again — watch the cripples.": 'تجاوزنا نيران المضادات. المقاتلات عائدة — احموا الطائرات المتضرّرة.',
    "Two fighters closing from six o'clock. They've spotted us.": 'مقاتلتان تقتربان من الساعة السادسة. لقد رصدونا.',
    "Here comes the whole gaggle! Tail, they're all yours!": 'السرب كله قادم! يا ذيل، إنهم لك!',
    'Here they come. Looks like the whole Luftwaffe is up today!': 'ها هم قادمون. يبدو أن اللوفتفافه كلها في الجو اليوم!',
    'Little friends coming in!': 'الأصدقاء الصغار قادمون!',
    'Little friends coming in! Red flight, sweep the bombers!': 'الأصدقاء الصغار قادمون! السرب الأحمر، طهّروا محيط القاذفات!',
    "Pour it on, gunner! Give 'em everything!": 'أمطِرهم يا رامي! أعطهم كل ما لديك!',
    "Give 'em everything you've got, Blue two!": 'أعطهم كل ما لديك يا أزرق 2!',
    'Steady... take your time. Lead him.': 'اثبت... على مهلك. صوّب أمامه.',
    'Steady, Blue two... line him up.': 'اثبت يا أزرق 2... ضعه في مرماك.',
    "That's the last of them! Scratch one battle group — drinks are on me!": 'هذا آخرهم! شطبنا مجموعة قتالية كاملة — المشروبات على حسابي!',
    'You got it just in time!': 'أدركتَه في اللحظة الأخيرة!',
    'Nice shooting — that broke it up!': 'رماية رائعة — أفشلتَ الهجوم!',
    'Rockets! Rockets incoming!': 'صواريخ! صواريخ قادمة!',
    'Jesus, that was close! She nearly took our tail off!': 'يا إلهي، كانت قريبة! كادت تقتلع ذيلنا!',
    'Turret knocked out! Keep at it!': 'دُمّر البرج! واصلوا!',
    'Rocket pod went up like a firework!': 'انفجرت حاضنة الصواريخ كالألعاب النارية!',
    "Engine hit! She's dropping back!": 'أُصيب المحرك! إنها تتأخر!',
    "Fighters dropping out of that thing's belly!": 'مقاتلات تخرج من بطن ذلك الشيء!',
    "She's breaking up! That's the last of them!": 'إنها تتفكك! هذه آخرهم!',
    "Look at her go — she's breaking in two!": 'انظروا إليها — إنها تنشطر نصفين!',
    "Lead him! Aim where he's going to be, not where he is.": 'صوّب أمامه! صوّب حيث سيكون، لا حيث هو.',
    'Use the ring sight for the long ones. Hold the right button.': 'استخدم المهداف الحلقي للمسافات البعيدة. اضغط الزر الأيمن مطوّلاً.',
    'Fighter on the other side! Somebody get on that gun!': 'مقاتلة على الجهة الأخرى! ليتولَّ أحدكم ذلك المدفع!',
    'Navigator here. Watch the radar plot — and Tab gives you the big picture.': 'هنا الملاح. راقب شاشة الرادار — وزر Tab يعطيك الصورة الكاملة.',
    'Nice shooting. The ground crew fitted you something extra.': 'رماية رائعة. طاقم الصيانة جهّز لك شيئاً إضافياً.',
    "Here they come — three bandits. Show me what you've learned!": 'ها هم قادمون — ثلاث طائرات معادية. أرني ما تعلّمت!',
    "You're ready, gunner! Welcome to the crew of the Sky Queen.": 'أنت جاهز يا رامي! مرحباً بك في طاقم Sky Queen.',
    'This is a training flight, gunner. Nobody shoots back today. See that target drone? Put your sight on it.': 'هذه رحلة تدريبية يا رامي. لن يردّ أحد بإطلاق النار اليوم. ترى تلك الطائرة الهدف؟ ضع مهدافك عليها.',
    'Short bursts! Watch your tracers and walk them in.': 'رشقات قصيرة! راقب الطلقات الخطّاطة وقرّبها من الهدف.',
    'Hang on — evasive action!': 'تمسّكوا — مناورة مراوغة!',
    'Bandit coming in,': 'طائرة معادية قادمة،',
    'Bandits,': 'أعداء،',
    'Fighters,': 'مقاتلات،',
    'Fw one-ninety,': 'Fw 190،',
    'Here he comes,': 'ها هو قادم،',
    'More bandits,': 'مزيد من الأعداء،',
    "We've had it! Bail out! Bail out!": 'انتهى أمرنا! اقفزوا بالمظلات! اقفزوا!',
    "Ammo's getting low back there. Make 'em count!": 'الذخيرة تنفد هناك في الخلف. اجعلوا كل طلقة تُحسب!',
    'Watch your ammo, short bursts!': 'انتبه لذخيرتك، رشقات قصيرة!',
    'Thanks, little friends. That was close!': 'شكراً أيها الأصدقاء الصغار. كانت قريبة!',
    'Blue three, splash one!': 'الأزرق 3، أسقطتُ واحدة!',
    "He's coming right at us! Keep firing!": 'إنه قادم نحونا مباشرة! واصل الرمي!',
    "They're going after the stragglers. Cover them!": 'إنهم يلاحقون المتأخرين. احموهم!',
    'Hang on, evasive action!': 'تمسّكوا، مناورة مراوغة!',
    "That's the last of them. We're going home, boys.": 'هذا آخرهم. عائدون إلى الديار يا شباب.',
    "We're hit, we're hit!": 'أُصبنا، أُصبنا!',
    'Pilot to crew, damage check. Everybody okay back there?': 'الطيار إلى الطاقم، تفقّد الأضرار. هل الجميع بخير في الخلف؟',
    "She's still flying. Stay on those guns!": 'ما زالت تطير. ابقوا على مدافعكم!',
    "I see a chute. He's out of it.": 'أرى مظلة. لقد خرج من المعركة.',
    "He's a flamer! Nice work!": 'إنه يشتعل! عمل رائع!',
    "Good shooting, he's going down!": 'رماية جيدة، إنه يسقط!',
    "That's another one! Keep it up, gunner!": 'واحدة أخرى! واصل يا رامي!',
    "Bandits on the bombers! Go get 'em!": 'أعداء على القاذفات! انقضّوا عليهم!',
    'Blue two, break left!': 'أزرق 2، انعطف يساراً!',
    'Blue two, break right!': 'أزرق 2، انعطف يميناً!',
    'Check six, Blue two! Check six!': 'تفقّد خلفك يا أزرق 2! تفقّد خلفك!',
    "Sky's clear. Good work, Blue flight.": 'السماء خالية. أحسنتم أيها السرب الأزرق.',
    'Tally ho! Blue flight, drop tanks and engage!': 'رصدناهم! السرب الأزرق، ألقوا الخزانات واشتبكوا!',
    "Lead him more! Aim where he's going!": 'صوّب أمامه أكثر! صوّب حيث يتّجه!',
    'Nice shooting, Blue two!': 'رماية رائعة يا أزرق 2!',
    'Blue flight, regroup on me.': 'السرب الأزرق، تجمّعوا حولي.',
    'Bandit on your six!': 'معادٍ خلفك!',
    "Blue two, you're trailing smoke!": 'أزرق 2، أنت تُخلّف دخاناً!',
    'Splash one!': 'أسقطنا واحدة!',
    "Keep scanning. They'll be back.": 'واصلوا المراقبة. سيعودون.',
    'Here comes the next wave, look sharp!': 'الموجة التالية قادمة، انتبهوا!',
    "They're regrouping, here they come again!": 'إنهم يعيدون التجمّع، ها هم قادمون مجدداً!',
    'Round over. Nice work, gunners.': 'انتهت الجولة. أحسنتم أيها الرماة.',
    'Fighters forming up out there. Stand by, gunners.': 'مقاتلات تتشكّل هناك. استعدّوا أيها الرماة.',
    "Switch guns! They're coming in on the other side!": 'بدّلوا المدافع! إنهم قادمون من الجهة الأخرى!',
    "Ball turret, they're coming up from below!": 'أيها البرج الكروي، إنهم صاعدون من الأسفل!',
    "Bandits on the nose, twelve o'clock level!": 'أعداء على المقدمة، الساعة الثانية عشرة على مستوانا!',
    "Fighters coming in from six o'clock, get on the tail gun!": 'مقاتلات قادمة من الساعة السادسة، إلى مدفع الذيل!',
    'Top turret, bandits high at twelve!': 'أيها البرج العلوي، أعداء في الأعلى عند الثانية عشرة!',
    "Left waist, bandits coming in at nine o'clock!": 'الجانب الأيسر، أعداء قادمون عند الساعة التاسعة!',
    "Right waist, fighters at three o'clock!": 'الجانب الأيمن، مقاتلات عند الساعة الثالثة!',
    "Rockets! They're firing rockets into the formation!": 'صواريخ! يطلقون الصواريخ على التشكيل!',
    'Get him!': 'أسقِطه!',
    "Pilot to crew: we're at altitude. Test fire your guns, and keep your eyes open.": 'الطيار إلى الطاقم: بلغنا الارتفاع. جرّبوا مدافعكم، وأبقوا أعينكم مفتوحة.',
    'Blue flight, form up on the bombers. Keep your eyes peeled for bandits.': 'السرب الأزرق، اصطفّوا مع القاذفات. راقبوا الأعداء جيداً.',
    "We can't hold formation. We're falling behind — keep those guns hot!": 'لا نستطيع البقاء في التشكيل. نحن نتأخر — أبقوا المدافع ساخنة!',
    "They're dropping their belly tanks — here they come!": 'يُلقون خزاناتهم الإضافية — ها هم قادمون!',
    'Smoke all the way to the river. The whole works is burning!': 'الدخان يمتد حتى النهر. المصنع كله يحترق!',
    'Bomb bay doors coming open. Hold her steady…': 'أبواب حجرة القنابل تُفتح. ثبّتها…',
    'Look at that… we hit it square!': 'انظروا إلى هذا… أصبناه في الصميم!',
    'Bombs on target! Look at it burn!': 'القنابل على الهدف! انظروا إليه يحترق!',
    'Secondary explosion! Something big just went up down there!': 'انفجار ثانوي! شيء كبير انفجر هناك في الأسفل!',
    "Gunner's hit! Stay on that gun if you can!": 'أُصيب الرامي! ابقَ على مدفعك إن استطعت!',

    // ---------- other radio lines (BossBattle, Modes, Pacing, Objectives, damage, events) ----------
    "Big formation, twelve o'clock high... those aren't fighters.": 'تشكيل ضخم، الساعة الثانية عشرة من الأعلى... هذه ليست مقاتلات.',
    'Good God... look at the size of those things!': 'يا إلهي... انظروا إلى حجم هذه الأشياء!',
    'Luftkreuzers! Their hulls are armoured — go for the turrets, the engines and the fuel tanks!': 'طرادات جوية! هياكلها مدرّعة — استهدفوا الأبراج والمحركات وخزانات الوقود!',
    "She's lining up a broadside! Kill her bridge!": 'إنها تستعد لرشقة جانبية! دمّروا جسر قيادتها!',
    "That one's an ace — kill markings all down the tail. Watch him!": 'ذلك آس — علامات الإسقاط تملأ ذيله. احذروه!',
    'Here comes the whole Luftwaffe! Blue flight, break them up before they reach the bombers!': 'اللوفتفافه كلها قادمة! السرب الأزرق، شتّتوهم قبل أن يصلوا إلى القاذفات!',
    'Here comes the whole Luftwaffe! Every gun, pick a target!': 'اللوفتفافه كلها قادمة! كل مدفع، اختر هدفاً!',
    "That's the lot of them! They're breaking off!": 'هذا كل ما لديهم! إنهم ينسحبون!',
    "Ju 88 out ahead, all alone — that's a pathfinder calling the fighters onto us. Knock him down!": 'طائرة Ju 88 أمامنا وحدها — إنها طائرة توجيه تستدعي المقاتلات إلينا. أسقطوها!',
    "The Ju 88's turning for home — he got away!": 'طائرة Ju 88 تستدير عائدة — لقد أفلتت!',
    "Gunner, short bursts! Three of them on a cool barrel and the first round's on me.": 'رشقات قصيرة يا رامي! أسقط ثلاثة منهم بسبطانة باردة والمشروب الأول على حسابي.',
    "Two of them sitting at six o'clock — coming straight up our tail!": 'اثنتان منهم عند الساعة السادسة — قادمتان مباشرة نحو ذيلنا!',
    "Reach out and touch them, gunner — don't wait till they're on top of us.": 'اضربهم من بعيد يا رامي — لا تنتظر حتى يصبحوا فوقنا.',
    'Blue Leader, take your shots long. Break them up before they reach the bombers.': 'قائد الأزرق، أطلق من مسافة بعيدة. شتّتهم قبل أن يصلوا إلى القاذفات.',
    'Group lead says hold it together — nobody drops out of this box!': 'قائد المجموعة يقول حافظوا على التماسك — لا أحد يخرج من هذا التشكيل!',
    "Little friends, stay close. We can't afford to lose another ship.": 'أيها الأصدقاء الصغار، ابقوا قريبين. لا نحتمل خسارة طائرة أخرى.',
    "Tail's getting chewed up back here!": 'الذيل يتمزّق هنا في الخلف!',
    "Tail to pilot: the stabiliser's shot to pieces back here!": 'الذيل إلى الطيار: المثبّت الأفقي ممزّق هنا في الخلف!',
    "Tail's half gone! The fin's shot up — rudder's hanging by a thread!": 'نصف الذيل اختفى! الزعنفة مثقوبة — الدفّة معلّقة بخيط!',
    "It's into the wing! Put it out!": 'وصلت النار إلى الجناح! أطفئوها!',
    'Blue Leader, your guns have quit on you — recharge them!': 'قائد الأزرق، توقفت مدافعك — أعد تلقيمها!',
    "Oxygen check! Gunner, you're not answering — check your mask hose!": 'فحص الأكسجين! أيها الرامي، لا تجيب — تفقّد خرطوم قناعك!',
    "Blue Leader, you're wandering all over the sky. Check your oxygen!": 'قائد الأزرق، أنت تتخبّط في السماء. تفقّد الأكسجين!',
  },
  patterns,
};
export default table;
