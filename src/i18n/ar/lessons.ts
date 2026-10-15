import type { PhraseTable } from '../types';

// Station lessons (game/StationLessons.ts, game/LessonRunner.ts, ui/TrainingScreen.ts)
export default { phrases: {
  // lesson topics and summaries
  'Leading targets': 'التصويب الاستباقي',
  'Waist gun · aim where the fighter will be, not where it is': 'الرشاش الجانبي · صوّب حيث ستكون المقاتلة، لا حيث هي الآن',
  'Convergence': 'نقطة التقاء النيران',
  'Top turret · the twin guns hit hardest at 300 m': 'البرج العلوي · يصيب الرشاشان التوأمان بأقصى قوة على مسافة 300 م',
  'Ammo and jams': 'الذخيرة والأعطال',
  'Ball turret · short bursts save the belt; clear a jam fast': 'البرج الكروي · الرشقات القصيرة توفّر الحزام؛ أصلح التعطّل بسرعة',
  'Oxygen': 'الأكسجين',
  'Tail gun · at altitude a loose mask hose blacks you out': 'الرشاش الخلفي · في الارتفاعات العالية يُفقدك خرطوم القناع المفكوك وعيك',

  // drills
  'Warm-up drill': 'تمرين الإحماء',
  'Final drill': 'التمرين الأخير',
  'Shoot down the drone your own way. This drill measures your accuracy — the same drill comes back at the end of the lesson.':
    'أسقط الطائرة المسيّرة بطريقتك. يقيس هذا التمرين دقتك — وسيعود التمرين نفسه في نهاية الدرس.',
  'The same drill as the start. Use what you just learned.': 'التمرين نفسه الذي بدأت به. استخدم ما تعلّمته للتو.',
  "Training drone on the left waist. Show me what you've got before we start.": 'طائرة تدريب مسيّرة عند الرشاش الجانبي الأيسر. أرني ما لديك قبل أن نبدأ.',
  "Training drone on the top turret. Show me what you've got before we start.": 'طائرة تدريب مسيّرة عند البرج العلوي. أرني ما لديك قبل أن نبدأ.',
  "Training drone on the ball turret. Show me what you've got before we start.": 'طائرة تدريب مسيّرة عند البرج الكروي. أرني ما لديك قبل أن نبدأ.',
  "Training drone on the tail gun. Show me what you've got before we start.": 'طائرة تدريب مسيّرة عند الرشاش الخلفي. أرني ما لديك قبل أن نبدأ.',
  "Same drone as before. Let's see the difference.": 'الطائرة المسيّرة نفسها كما من قبل. لنرَ الفرق.',

  // waist: leading targets
  'Aim ahead': 'صوّب أمامه',
  'Your rounds need time to get there, so aim ahead of a crossing plane. Hold the sight on the yellow <b class="gold">◇ lead indicator</b> for a second.':
    'تحتاج طلقاتك وقتاً لتصل، فصوّب أمام الطائرة العابرة. أبقِ المنظار على <b class="gold">◇ مؤشر التصويب الاستباقي</b> الأصفر لثانية.',
  "Don't chase his tail — get ahead of him.": 'لا تطارد ذيله — تقدّم أمامه.',
  'Fire at the lead': 'أطلق على نقطة الاستباق',
  '{fire} at the <b class="gold">◇</b>, not at the plane. Short bursts — let the drone fly into your tracers.':
    '{fire} على <b class="gold">◇</b>، لا على الطائرة. رشقات قصيرة — دع الطائرة المسيّرة تطير داخل طلقاتك المضيئة.',
  'Lead him and let him fly into it!': 'تقدّم أمامه ودعه يطير داخل النيران!',
  'Lead by eye': 'الاستباق بالعين',
  'No indicator now. Aim ahead along its path: further ahead the faster it crosses and the further away it is. A plane flying straight at you needs no lead at all.':
    'لا مؤشر الآن. صوّب أمامها على مسارها: أبعد كلما عبرت أسرع وكانت أبعد. الطائرة القادمة نحوك مباشرة لا تحتاج إلى أي استباق.',
  'No crutches this time, gunner. Lead him by eye.': 'لا مساعدة هذه المرة أيها الرامي. استبقه بعينك.',

  // top: convergence
  'The sweet spot': 'المسافة المثالية',
  'Your twin .50s are aligned so their two streams cross at <b>{conv} m</b>. Near that range both land on the same spot. This drone sits right there: knock it down.':
    'رشاشاك التوأمان من عيار .50 مضبوطان كي يلتقي تيارا نيرانهما على مسافة <b>{conv} م</b>. قرب هذه المسافة يصيب الاثنان النقطة نفسها. هذه الطائرة المسيّرة هناك تماماً: أسقطها.',
  "Both guns meet at three hundred metres. That's where you hurt them.": 'يلتقي الرشاشان على ثلاثمئة متر. هناك تؤلمهم.',
  'Wait for it': 'انتظره',
  'This one starts far out, where your streams spread apart and the rounds lose their punch. Hold your fire and open up once it is inside <b>400 m</b>.':
    'هذه تبدأ بعيدة، حيث يتباعد تيارا نيرانك وتفقد الطلقات قوتها. أمسك نيرانك وابدأ الإطلاق حين تصبح أقرب من <b>400 م</b>.',
  "He's way out. Don't waste it — wait till he's close.": 'إنه بعيد جداً. لا تهدر الذخيرة — انتظر حتى يقترب.',

  // ball: ammo and jams
  'Short bursts': 'رشقات قصيرة',
  "Every gun has a limited belt and a barrel that overheats. Fire <b>{n} short bursts</b> — under a second each. A turret can't be reloaded by hand: when its box runs low, the crew passes up more.":
    'لكل رشاش حزام ذخيرة محدود وسبطانة ترتفع حرارتها. أطلق <b>{n} رشقات قصيرة</b> — أقل من ثانية لكل منها. لا يمكن إعادة تذخير البرج يدوياً: حين ينفد صندوقه يمرّر الطاقم المزيد.',
  'Short bursts, gunner. That belt has to last all the way to the target and back.': 'رشقات قصيرة أيها الرامي. على ذلك الحزام أن يكفي حتى الهدف والعودة.',
  'Clear the jam': 'أصلح التعطّل',
  'Your gun has jammed — the trigger just clicks. Hold {reload} or tap it twice to work the charging handle.':
    'تعطّل رشاشك — الزناد ينقر فقط. اضغط مطولاً على {reload} أو اضغطه مرتين لتشغيل مقبض التعمير.',
  "Gun's jammed! Working the charging handle!": 'الرشاش متعطّل! أعمل على مقبض التعمير!',
  'Jam under fire': 'تعطّل تحت النيران',
  'Shoot this drone down. Expect a jam half way through: clear it with {reload} and get straight back on target.':
    'أسقط هذه الطائرة المسيّرة. توقّع تعطّلاً في منتصف الطريق: أصلحه بـ {reload} وعد فوراً إلى الهدف.',
  'Fighter low! Get him, and keep that gun running.': 'مقاتلة في الأسفل! أسقطها، وأبقِ ذلك الرشاش يعمل.',

  // tail: oxygen
  'Check your mask': 'افحص قناعك',
  'Up here the air is too thin to breathe. Your mask hose just came loose: the picture greys out and your aim drifts. Press {o2} to reconnect it.':
    'الهواء هنا أرقّ من أن يُتنفّس. انفكّ خرطوم قناعك للتو: تبهت الصورة ويضطرب تصويبك. اضغط {o2} لإعادة توصيله.',
  "Oxygen check! Tail, you're not answering — check your mask hose!": 'فحص الأكسجين! أيها الرامي الخلفي، أنت لا تجيب — افحص خرطوم قناعك!',
  'Oxygen under fire': 'الأكسجين تحت النيران',
  "Shoot this drone down. If the screen starts to grey, press {o2} first — a gunner who blacks out can't hit anything.":
    'أسقط هذه الطائرة المسيّرة. إن بدأت الشاشة تبهت فاضغط {o2} أولاً — الرامي الذي يفقد وعيه لا يصيب شيئاً.',
  "Bandit at six! I'm on him.": 'معادٍ عند الساعة السادسة! أنا أتولاه.',

  // in flight
  'Station lesson': 'درس موقع الرماية',
  'Complete the lesson': 'أكمل الدرس',
  'STATION LESSON': 'درس موقع الرماية',
  'Station lesson — follow the instructions': 'درس موقع الرماية — اتبع التعليمات',
  'Lesson complete': 'اكتمل الدرس',
  'LESSON COMPLETE': 'اكتمل الدرس',
  'Accuracy {a} → {b}': 'الدقة {a} ← {b}',
  "Good work, gunner. That one's in the log book.": 'عمل جيد أيها الرامي. سُجّل هذا في دفتر الطيران.',
  'Back to the {st}: press {key}': 'عد إلى {st}: اضغط {key}',
  'Range {m} m': 'المسافة {m} م',
  'Rounds wasted out of range: {n}': 'طلقات مهدرة خارج المدى: {n}',
  'Short bursts: {n} / {m}': 'رشقات قصيرة: {n} / {m}',
  'Too long! Let go sooner.': 'طويلة جداً! ارفع إصبعك أبكر.',
  'Hose loose! Press {o2}': 'الخرطوم مفكوك! اضغط {o2}',
  'Jammed! Hold {reload}': 'متعطّل! اضغط مطولاً {reload}',
  'Skip step': 'تخطَّ الخطوة',
  '{key} skip step': '{key} تخطَّ الخطوة',
  'Skipped': 'تم التخطي',

  // Training screen
  'Gunnery School and station lessons': 'مدرسة الرماية ودروس مواقع الرماية',
  'A calm two-minute course: aim, fire, lead, seats and radar': 'دورة هادئة مدتها دقيقتان: التصويب، الإطلاق، الاستباق، المواقع والرادار',
  'Short lessons for each gun position. Each one unlocks the next; skip any you already know.':
    'دروس قصيرة لكل موقع رماية. كل درس يفتح الذي يليه؛ تخطَّ أي درس تعرفه مسبقاً.',
  'Lessons complete: {n} / {m}': 'الدروس المكتملة: {n} / {m}',
  'Average accuracy change: {n} points': 'متوسط تغيّر الدقة: {n} نقطة',
  'Finish or skip the lesson above to unlock': 'أكمل الدرس السابق أو تخطَّه لفتح هذا',
  'Locked': 'مقفل',
  'New': 'جديد',
  'Done': 'تم',
  'Fly again': 'حلّق مجدداً',
  'Start': 'ابدأ',
  'Skip': 'تخطَّ',
} } satisfies PhraseTable;
