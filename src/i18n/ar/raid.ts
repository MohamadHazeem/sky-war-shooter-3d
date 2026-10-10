import type { PhraseTable, Pattern } from '../types';

// Arabic for the wingman (Wingman.ts) and the role-reversal raid missions (RaidDefence.ts):
// "Defend the Field" (day) and "Night Fighter".

const KIND: Record<string, string> = { 'NIGHT RAID': 'غارة ليلية', RAID: 'غارة' };

const patterns: Pattern[] = [
  [/^Round (\d+)\/(\d+) · (NIGHT RAID|RAID) — (.+) · (\d+)\/(\d+) through$/, (m, tr) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — ${tr(m[4])} · عبر ${m[5]}/${m[6]}`],
  [/^ROUND (\d+) · (NIGHT RAID|RAID)$/, (m) => `الجولة ${m[1]} · ${KIND[m[2]]}`],
  [/^(\d+) bombers? inbound, nearest ([\d.]+) km from the field$/, '$1 من القاذفات قادمة، أقربها على بُعد $2 كم من المطار'],
  [/^Airfield untouched this round — \+(\d+)$/, 'لم يُمسّ المطار في هذه الجولة — +$1'],
  [/^(.+) bombed the airfield — (\d+) of (\d+) allowed$/, (m, tr) => `${tr(m[1])} قصفت المطار — ${m[2]} من ${m[3]} مسموح بها`],
  [/^(.+) jettisoned his bombs$/, (m, tr) => `${tr(m[1])} تخلّصت من قنابلها`],
  [/^Bomber down short of the field — \+(\d+)$/, 'أُسقطت قاذفة قبل المطار — +$1'],
  [/^Let no more than (\d+) bombers through in three rounds$/, 'لا تسمح بعبور أكثر من $1 قاذفات في ثلاث جولات'],
  [/^Wingman Blue Two: (.+) attack my target · (.+) cover me · (.+) protect the bombers · (.+) form up$/, 'الجناح المرافق «أزرق اثنان»: $1 هاجم هدفي · $2 غطِّني · $3 احمِ القاذفات · $4 عُد إلى التشكيل'],
];

const table: PhraseTable = {
  phrases: {
    // speakers
    'Blue Two': 'أزرق اثنان',
    'Control': 'المراقبة',

    // radio
    "Searchlights have one coned! Get him while he's lit!": 'الكشّافات حاصرت واحدة! انقضّ عليها ما دامت مضاءة!',
    "Messerschmitts coming down on us — they're covering the bombers!": 'طائرات مسرشميت تنقضّ علينا — إنها تحمي القاذفات!',
    "He's dumped his bombs — he's turning for home!": 'ألقى قنابله — إنه يستدير عائداً!',
    'Control to Blue flight: raiders crossing the coast in the dark. Look for their exhaust flames and the searchlights.': 'المراقبة إلى السرب الأزرق: مغيرون يعبرون الساحل في الظلام. ابحثوا عن لهب عوادمهم وعن الكشّافات.',
    'Control: more of them coming in, with night fighters. The searchlights will find the bombers for you.': 'المراقبة: المزيد منهم قادمون، ومعهم مقاتلات ليلية. الكشّافات ستعثر لكم على القاذفات.',
    'Control: the main stream is inbound. Every one you get is one less over the field!': 'المراقبة: التيار الرئيسي قادم. كل واحدة تسقطها تعني واحدة أقل فوق المطار!',
    'Control to Blue flight: raid inbound, Junkers with fighter cover. Get between them and the airfield!': 'المراقبة إلى السرب الأزرق: غارة قادمة، طائرات يونكرز بغطاء من المقاتلات. ادخلوا بينها وبين المطار!',
    'Control, second wave: bombers and Messerschmitts on the same heading. Hit the bombers first!': 'المراقبة، الموجة الثانية: قاذفات ومسرشميت على الاتجاه نفسه. اضربوا القاذفات أولاً!',
    "Control: this is the main raid — everything they've got. Don't let them through!": 'المراقبة: هذه هي الغارة الرئيسية — كل ما لديهم. لا تدعوهم يعبرون!',
    'Bombs on the airfield! Stop the rest of them!': 'قنابل على المطار! أوقفوا البقية!',
    'Blue Two, engaging your target!': 'أزرق اثنان، أشتبك مع هدفك!',
    'Blue Two, going to the bombers!': 'أزرق اثنان، متّجه إلى القاذفات!',
    'Blue Two, covering your six!': 'أزرق اثنان، أغطّي ذيلك!',
    'Blue Two, forming up on your wing.': 'أزرق اثنان، أعود إلى جناحك.',
    "Blue Two, I'm hit! I'm going down!": 'أزرق اثنان، أُصبت! أنا أسقط!',
    'Blue Two, replacement aircraft joining on your wing.': 'أزرق اثنان، طائرة بديلة تنضم إلى جناحك.',
    'Blue Two — no target in front of you, staying on your wing.': 'أزرق اثنان — لا هدف أمامك، أبقى على جناحك.',
    'Blue Two, going after the bombers!': 'أزرق اثنان، ألاحق القاذفات!',
    'Bandit on your tail — Blue Two is on him!': 'معادٍ على ذيلك — أزرق اثنان يلاحقه!',
    'Blue Two — splash one!': 'أزرق اثنان — أسقطت واحدة!',
    'Blue Two is down — a replacement joins next round': 'سقط أزرق اثنان — تنضم طائرة بديلة في الجولة القادمة',

    // the same wingman lines as Blue Four (escort missions)
    'Blue Four': 'أزرق أربعة',
    "Blue Four, engaging your target!": "أزرق أربعة، أشتبك مع هدفك!",
    "Blue Four, going to the bombers!": "أزرق أربعة، متّجه إلى القاذفات!",
    "Blue Four, covering your six!": "أزرق أربعة، أغطّي ذيلك!",
    "Blue Four, forming up on your wing.": "أزرق أربعة، أعود إلى جناحك.",
    "Blue Four, replacement aircraft joining on your wing.": "أزرق أربعة، طائرة بديلة تنضم إلى جناحك.",
    "Blue Four — no target in front of you, staying on your wing.": "أزرق أربعة — لا هدف أمامك، أبقى على جناحك.",
    "Blue Four, going after the bombers!": "أزرق أربعة، ألاحق القاذفات!",
    "Bandit on your tail — Blue Four is on him!": "معادٍ على ذيلك — أزرق أربعة يلاحقه!",
    "Blue Four — splash one!": "أزرق أربعة — أسقطت واحدة!",
    "Blue Four is down — a replacement joins next round": "سقط أزرق أربعة — تنضم طائرة بديلة في الجولة القادمة",
    "Blue Four, I'm hit! I'm going down!": 'أزرق أربعة، أُصبت! أنا أسقط!',

    // missions and modes
    'Defend the Field': 'الدفاع عن المطار',
    'Night Fighter': 'المقاتلة الليلية',
    'Advanced Landing Ground, Normandy': 'مهبط أمامي، نورماندي',
    'Normandy, June 1944': 'نورماندي، يونيو 1944',
    'Airfields in southern England': 'مطارات جنوب إنجلترا',
    'Operation Steinbock, February 1944': 'عملية شتاينبوك، فبراير 1944',
    'For once the boot is on the other foot. The Luftwaffe is coming for us: Junkers 88s with Messerschmitt cover, straight in at the advanced landing ground where your group is based.':
      'هذه المرة انقلبت الأدوار. اللوفتفافه قادمة إلينا: طائرات يونكرز 88 بغطاء من المسرشميت، مباشرة نحو المهبط الأمامي حيث تتمركز مجموعتك.',
    'They will fly a straight course for the field. Every bomber you bring down short of it is one stick of bombs that does not fall on our aircraft. If more than six of them get through, there will be no field to come home to.':
      'ستطير في خط مستقيم نحو المطار. كل قاذفة تسقطها قبله هي حمولة قنابل لن تسقط على طائراتنا. وإن عبرت أكثر من ست، فلن يبقى مطار نعود إليه.',
    'Take Blue Two with you. Keys one to four give him his orders: attack my target, cover me, go for the bombers, form up. Watch the rear gunners on the Junkers — come in from below.':
      'خذ «أزرق اثنان» معك. المفاتيح من واحد إلى أربعة تعطيه أوامره: هاجم هدفي، غطِّني، اذهب إلى القاذفات، عُد إلى التشكيل. احذر الرماة الخلفيين على اليونكرز — هاجمها من الأسفل.',
    'The raid is broken. The field is still ours — the ground crews are already filling in the craters. Outstanding work, Blue Leader.':
      'تحطّمت الغارة. المطار ما زال لنا — أطقم الأرض تردم الحفر منذ الآن. عمل رائع يا قائد الأزرق.',
    'The Baby Blitz. Every few nights the Junkers come back across the Channel in the dark, and tonight they are after the airfields.':
      'الهجوم الخاطف الصغير. كل بضع ليالٍ تعود طائرات اليونكرز عبر القنال في الظلام، والليلة هدفها المطارات.',
    'You will not see them until you are close. Look for the exhaust flames — they show for miles — and watch the searchlights: when the beams cone a bomber, go for him while he is lit. Your gunsight lamp is turned up for the night.':
      'لن تراها حتى تقترب. ابحث عن لهب العوادم — يُرى من على بُعد أميال — وراقب الكشّافات: حين تحاصر الأشعة قاذفة، انقضّ عليها ما دامت مضاءة. مصباح منظارك مرفوع لليل.',
    'From the second wave they are sending Messerschmitt 110 night fighters ahead of the bombers. If more than four bombers get through to the field, we have lost the night.':
      'من الموجة الثانية يرسلون مقاتلات مسرشميت 110 الليلية أمام القاذفات. إن عبرت أكثر من أربع قاذفات إلى المطار، فقد خسرنا الليلة.',
    'Dawn over the field, and every runway still in use. The Junkers will think twice about coming back. Good hunting, Blue Leader.':
      'الفجر فوق المطار، وكل المدارج ما زالت تعمل. ستفكّر اليونكرز مرتين قبل أن تعود. صيد موفّق يا قائد الأزرق.',
    'Special operation — role reversal. The Luftwaffe raids your airfield: Ju 88s on a straight course for the field, Bf 109s flying cover. Bring the bombers down before they reach it, with Blue Two on your wing. Three rounds; more than six through and the field is lost.':
      'عملية خاصة — انقلاب الأدوار. اللوفتفافه تغير على مطارك: طائرات Ju 88 في خط مستقيم نحو المطار وطائرات Bf 109 تحميها. أسقط القاذفات قبل أن تصل، و«أزرق اثنان» على جناحك. ثلاث جولات؛ إن عبرت أكثر من ست ضاع المطار.',
    'Special operation — night defence. Junkers raid the airfields in the dark: find them by their exhaust flames and the searchlight cones, under a lit gunsight. Bf 110 night fighters hunt you from the second wave. Three rounds; more than four through and the night is lost.':
      'عملية خاصة — دفاع ليلي. طائرات اليونكرز تغير على المطارات في الظلام: اعثر عليها بلهب عوادمها وأقماع الكشّافات، بمنظار مضاء. مقاتلات Bf 110 الليلية تطاردك من الموجة الثانية. ثلاث جولات؛ إن عبرت أكثر من أربع ضاعت الليلة.',
    'Shoot down the bombers before they reach the airfield': 'أسقط القاذفات قبل أن تصل إلى المطار',
    'Command your wingman: 1 attack · 2 cover · 3 bombers · 4 form up': 'أعطِ أوامرك للجناح المرافق: 1 هجوم · 2 تغطية · 3 القاذفات · 4 التشكيل',
    'Junkers inbound with fighter cover': 'يونكرز قادمة بغطاء من المقاتلات',
    'Second wave — bombers and Messerschmitts': 'الموجة الثانية — قاذفات ومسرشميت',
    'The main raid — everything they have': 'الغارة الرئيسية — كل ما لديهم',
    'Raiders in the dark — find them by their exhausts': 'مغيرون في الظلام — اعثر عليهم بعوادمهم',
    'More raiders — and night fighters hunting you': 'مزيد من المغيرين — ومقاتلات ليلية تطاردك',
    'The main bomber stream': 'تيار القاذفات الرئيسي',
    'more raiders inbound': 'مزيد من المغيرين قادمون',
    'Padlock the nearest bandit': 'ثبّت النظر على أقرب معادٍ',
  },
  patterns,
};
export default table;
