import type { PhraseTable, Pattern } from '../types';

// Arabic for the P-51 overhaul (PilotOps / PilotRounds / m4 + m7 briefings), the field dressing
// call, and the special-event / pacing radio lines recorded after the first translation pass.

const KIND: Record<string, string> = { INTERCEPT: 'اعتراض', SWEEP: 'اكتساح', STRAGGLER: 'المتخلّفة' };
const SIDE: Record<string, string> = { left: 'يساراً', right: 'يميناً' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (INTERCEPT|SWEEP|STRAGGLER) — (.+)$/, (m, tr) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])}`],
  [/^ROUND (\d+) · (INTERCEPT|SWEEP|STRAGGLER)$/, (m) => `الجولة ${m[1]} · ${KIND[m[2]]}`],
  [/^cover "(.+)" \((\d+)%\) · (\d+)s$/, 'غطِّ «$1» ($2%) · $3 ث'],
  [/^cover "(.+)" \((\d+)%\) · clear her six$/, 'غطِّ «$1» ($2%) · نظّف ذيلها'],
  [/^(\d+) bandits?, (\d+) on the bombers$/, '$1 من المعادين، $2 منهم على القاذفات'],
  [/^(\d+) bandits?$/, '$1 من المعادين'],
  [/^(\d+) bombers protected — \+(\d+)$/, 'حُميت $1 قاذفة — +$2'],
  [/^Straggler defended — \+(\d+)$/, 'دافعت عن المتخلّفة — +$1'],
  [/^Bomber saved — \+(\d+)$/, 'أنقذت قاذفة — +$1'],
  [/^Intercepted — \+(\d+)$/, 'اعتراض ناجح — +$1'],
  [/^Straggler "(.+)" lost$/, 'خسرنا المتخلّفة «$1»'],
  [/^Cover "(.+)" — she's falling out of formation$/, 'غطِّ «$1» — إنها تخرج من التشكيل'],
  [/^"(.+)" is heading home · \+(\d+)$/, '«$1» في طريقها إلى الديار · +$2'],
  [/^Careful, Blue two — that (.+) has a rear gunner\. Come at him from below!$/, (m, tr) => `انتبه يا أزرق اثنان — طائرة ${tr(m[1])} تلك فيها رامٍ خلفي. هاجمها من الأسفل!`],
  [/^He's seen you — he's breaking (left|right)! Stay with him!$/, (m) => `لقد رآك — إنه ينعطف ${SIDE[m[1]]}! ابقَ خلفه!`],
  [/^The (.+) is diving away — let him go or run him down!$/, (m, tr) => `الـ${tr(m[1])} تغوص هاربة — اتركها أو الحق بها!`],
  [/^Little friends, this is (.+)\. We've lost two engines and can't keep up — can you cover us\?$/, 'أيها الأصدقاء الصغار، هنا «$1». فقدنا محرّكين ولا نستطيع المجاراة — هل تغطّوننا؟'],
];

const table: PhraseTable = {
  phrases: {
    // m4 / m7 briefings and objectives
    'You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. First the Focke-Wulfs and Zerstörers will go for the bombers — intercept them before they reach the box. Then expect a fighter sweep of 109s hunting the escort, flying in pairs: watch for the wingman. And if a Fortress falls out of formation, the wolves will go for her. Do not let them.':
      'ستقود موستانج P-51D في مرافقة قريبة لتشكيل من اثنتي عشرة قلعة طائرة. أولاً ستنقضّ طائرات فوكه-وولف والمدمّرات على القاذفات — اعترضها قبل أن تصل إلى التشكيل. ثم توقّع اكتساحاً من طائرات 109 تطارد المرافقة، تطير أزواجاً: احذر من الجناح المرافق. وإن خرجت قلعة من التشكيل، فستنقضّ عليها الذئاب. لا تسمح لهم بذلك.',
    'Mouse aim flies the aircraft toward where you look. W and S for throttle, V for cockpit or chase view, T padlocks the nearest bandit. Your six fifties are harmonised at two hundred and fifty metres — get in close.':
      'التصويب بالفأرة يوجّه الطائرة إلى حيث تنظر. W وS للخانق، V لمنظر قمرة القيادة أو المطاردة، T يثبّت النظر على أقرب طائرة معادية. رشّاشاتك الستة من عيار خمسين مضبوطة على مئتين وخمسين متراً — اقترب.',
    'Intercept the attackers before they reach the bombers': 'اعترض المهاجمين قبل أن يصلوا إلى القاذفات',
    'Win the dogfight against the fighter sweep': 'انتصر في الاشتباك على اكتساح المقاتلات',
    'Save the straggler': 'أنقذ القاذفة المتخلّفة',
    'You lead the escort for our box. Rocket-armed Zerstörers will try to break up the formation, then the 109s and the new jets will come for the escort. The Me 262 is faster than anything we have — do not chase it, turn inside it and catch it when it comes back round. Bf 110s carry a rear gunner: come at them from below.':
      'أنت تقود مرافقة تشكيلنا. ستحاول المدمّرات المسلّحة بالصواريخ تفريق التشكيل، ثم تأتي طائرات 109 والنفّاثات الجديدة للمرافقة. الـMe 262 أسرع من أي شيء لدينا — لا تطاردها، انعطف داخل منعطفها واقتنصها حين تعود. طائرات Bf 110 تحمل رامياً خلفياً: هاجمها من الأسفل.',
    'Over the target a crippled Fortress will need you. Pick your targets, protect the bombers, and keep your speed up.':
      'فوق الهدف ستحتاجك قلعة معطوبة. اختر أهدافك، واحمِ القاذفات، وحافظ على سرعتك.',
    'Break up the Zerstörer attacks': 'فرّق هجمات المدمّرات',
    'Survive the sweep of 109s and jets': 'اصمد أمام اكتساح طائرات 109 والنفّاثات',
    'Save the straggler over Berlin': 'أنقذ القاذفة المتخلّفة فوق برلين',

    // PilotRounds titles and objectives
    'Intercept — head them off before they reach the box': 'اعتراض — اقطع طريقهم قبل أن يصلوا إلى التشكيل',
    'Fighter sweep — the 109s are hunting the escort': 'اكتساح المقاتلات — طائرات 109 تطارد المرافقة',
    'Save the straggler — a Fortress is falling out': 'أنقذ المتخلّفة — قلعة تخرج من التشكيل',
    'Intercept — break up the Zerstörer attack': 'اعتراض — فرّق هجوم المدمّرات',
    'Fighter sweep — 109s and jets over Berlin': 'اكتساح المقاتلات — طائرات 109 ونفّاثات فوق برلين',
    'Save the straggler — a crippled Fortress over Berlin': 'أنقذ المتخلّفة — قلعة معطوبة فوق برلين',
    'Dogfight the sweep — keep them off the bombers': 'اشتبك مع الاكتساح — أبعدهم عن القاذفات',
    'Cover the straggler': 'غطِّ القاذفة المتخلّفة',
    'Break up the attacks before they reach the bombers': 'فرّق الهجمات قبل أن تصل إلى القاذفات',
    'Win the dogfight — keep them off the bombers': 'انتصر في الاشتباك — أبعدهم عن القاذفات',
    'more bandits inbound': 'المزيد من المعادين قادمون',
    'sky clear': 'السماء خالية',
    'STRAGGLER': 'القاذفة المتخلّفة',
    'STRAGGLER SAVED': 'أُنقذت المتخلّفة',

    // pilot radio
    "He's reversing — scissors! Throttle back, make him fly out in front!": 'إنه يعكس اتجاهه — مقصّ! خفّف الخانق، اجعله يتجاوزك إلى الأمام!',
    "Jet's running — don't chase him, catch him when he turns back!": 'النفّاثة تهرب — لا تطاردها، اقتنصها حين تستدير عائدة!',
    "Head-on! Hold your fire till he's close, then break high!": 'وجهاً لوجه! أمسك نارك حتى يقترب، ثم انعطف إلى الأعلى!',
    'Watch it, Blue two — his wingman is sliding in behind you!': 'انتبه يا أزرق اثنان — جناحه المرافق ينزلق خلفك!',
    "He's spiralling down — don't follow him into the deck!": 'إنه يهبط حلزونياً — لا تتبعه إلى الأرض!',
    "Focke-Wulf's zooming up for another pass. Keep your speed!": 'الفوكه-وولف تصعد بسرعة لتمريرة أخرى. حافظ على سرعتك!',
    'Thanks, little friend — he was all over us!': 'شكراً أيها الصديق الصغير — كان يلتصق بنا!',
    "We owe you one, little friend. We're going to make it!": 'ندين لك بواحدة أيها الصديق الصغير. سننجو!',
    'Bandits twelve o\'clock low, climbing for the bombers. Get between them and the big friends!': 'معادون عند الساعة الثانية عشرة من الأسفل، يصعدون نحو القاذفات. ادخل بينهم وبين الأصدقاء الكبار!',
    "Little friends, twin-engine bandits closing at our six — they've got rockets!": 'أيها الأصدقاء الصغار، معادون ثنائيو المحرّك يقتربون من خلفنا — معهم صواريخ!',
    "Another gaggle, nine o'clock level. Some of them are coming for us!": 'سرب آخر عند الساعة التاسعة على مستوانا. بعضهم قادم نحونا!',
    'Heads up — 109s high at six, coming down on us! Break and engage!': 'انتبهوا — طائرات 109 من الأعلى خلفنا، تنقضّ علينا! انعطفوا واشتبكوا!',
    "Bandits on the bombers, twelve o'clock! Little friends, where are you?": 'معادون على القاذفات، عند الساعة الثانية عشرة! أيها الأصدقاء الصغار، أين أنتم؟',
    "Focke-Wulfs diving out of the sun — don't try to out-climb them!": 'طائرات فوكه-وولف تنقضّ من جهة الشمس — لا تحاول التفوّق عليها في الصعود!',
    'Bandits going for the cripple! Blue two, get back there and cover her!': 'المعادون يتّجهون إلى المعطوبة! أزرق اثنان، عُد إلى هناك وغطِّها!',
    "More of them coming in on our tail — we can't take another pass!": 'المزيد منهم قادمون على ذيلنا — لا نحتمل تمريرة أخرى!',
    "One last pass at the box, twelve o'clock. Let's finish this!": 'تمريرة أخيرة على التشكيل، عند الساعة الثانية عشرة. لننهِ هذا!',
    "Big gaggle at twelve o'clock — drop tanks and go! Hit them before they reach the box!": 'سرب كبير عند الساعة الثانية عشرة — ألقوا الخزانات وانطلقوا! اضربوهم قبل أن يصلوا إلى التشكيل!',
    "Zerstörers at six o'clock, with rockets! Get them off us!": 'مدمّرات عند الساعة السادسة، معها صواريخ! أبعدوها عنا!',
    "Jets! Twelve o'clock high, fast movers — go for them when they slow down!": 'نفّاثات! عند الساعة الثانية عشرة من الأعلى، سريعة جداً — هاجموها حين تبطئ!',
    "Messerschmitts, high at five o'clock! Here they come — break!": 'مسرشميت من الأعلى عند الساعة الخامسة! ها هي قادمة — انعطفوا!',
    "Jets coming through! You won't out-run them — turn inside them!": 'نفّاثات تخترق! لن تسبقها — انعطف داخل منعطفها!',
    "Fighters on the bombers, twelve o'clock level!": 'مقاتلات على القاذفات، عند الساعة الثانية عشرة على مستوانا!',
    "They're sending another Gruppe down on us. Stay together!": 'يرسلون مجموعة أخرى علينا. ابقوا متماسكين!',
    "They're on the straggler! Blue two, cover her, I'll take the box!": 'إنهم على المتخلّفة! أزرق اثنان، غطِّها، وأنا آخذ التشكيل!',
    'Jet coming up our tail! Somebody get him off us!': 'نفّاثة تصعد خلف ذيلنا! ليُبعدها أحدكم عنا!',
    "Last push — they're throwing everything at the box!": 'الدفعة الأخيرة — يرمون كل ما لديهم على التشكيل!',

    // field dressing, special events, pacing
    "Hold still — I've patched you up. Back on that gun.": 'اثبت — ضمّدت جرحك. عُد إلى ذلك الرشّاش.',
    "The yellow noses are breaking off — they've lost their leader!": 'ذوو الأنوف الصفراء ينسحبون — لقد فقدوا قائدهم!',
    "Rocket barrage! Heavies standing off at a kilometre — they'll keep lobbing rockets into the box until we knock them down!": 'وابل صواريخ! الثقيلة تقف على بُعد كيلومتر — ستواصل قذف الصواريخ على التشكيل حتى نسقطها!',
    "Launchers are down! That's the end of the rockets.": 'سقطت منصّات الإطلاق! انتهت الصواريخ.',
    "They're out of rockets — the heavies are heading home.": 'نفدت صواريخهم — الثقيلة عائدة إلى قواعدها.',
    "That's the last of the destroyers! Nice work, boys.": 'كانت تلك آخر المدمّرات! عمل رائع يا شباب.',
    "That one's an ace — kill markings all down the tail. Watch him!": 'ذاك طيّار بارع — علامات الإسقاط على طول ذيله. احذروه!',
    "That's the lot of them! They're breaking off!": 'هذا كل ما لديهم! إنهم ينسحبون!',
  },
  patterns,
};
export default table;
