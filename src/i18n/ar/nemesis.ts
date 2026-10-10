import type { PhraseTable, Pattern } from '../types';

// Arabic for the named Luftwaffe Experten (game/Nemesis.ts, game/NemesisRuntime.ts,
// ui/NemesisScreen.ts): names word by word, ranks, units, places, traits, the dossier and
// debrief lines (templates filled with already-translated names), the HUD card, and the radio
// lines (full English sentences with a name inside, matched by the patterns below).

// German first names and surnames (Nemesis.ts FIRST_NAMES / SURNAMES)
const FIRST: Record<string, string> = {
  Heinz: 'هاينتس', Walter: 'فالتر', Erich: 'إريش', 'Günther': 'غونتر', Hans: 'هانس', Josef: 'يوزف', Wolfgang: 'فولفغانغ', Gerhard: 'غيرهارد',
  Helmut: 'هلموت', Friedrich: 'فريدريش', Karl: 'كارل', Ernst: 'إرنست', Werner: 'فيرنر', Rudolf: 'رودولف', Egon: 'إيغون', Anton: 'أنتون',
  Horst: 'هورست', Dieter: 'ديتر',
};
const LAST: Record<string, string> = {
  'Brückner': 'بروكنر', Dorn: 'دورن', Eckhardt: 'إكهارت', Faber: 'فابر', Gebhardt: 'غيبهارت', Hollmann: 'هولمان', Kranz: 'كرانتس', Lindner: 'ليندنر',
  Neumeyer: 'نويماير', Ostermann: 'أوسترمان', Pfeiffer: 'فايفر', Reuter: 'رويتر', Sauer: 'زاور', Thalberg: 'تالبرغ', Vossberg: 'فوسبرغ', Wendt: 'فينت',
  Zeller: 'تسيلر', Kaltenbach: 'كالتنباخ', Riedel: 'ريدل', Stahl: 'شتال', Winterfeld: 'فينترفيلد', Haller: 'هالر', Ritter: 'ريتر', Engel: 'إنغل',
};
export const NEMESIS_NAME_AR: Record<string, string> = { ...FIRST, ...LAST };

// Luftwaffe ranks: full (the rank alone) and the short form before a name (definite)
const RANKS: Record<string, string> = {
  Leutnant: 'ملازم', Oberleutnant: 'ملازم أول', Hauptmann: 'نقيب', Major: 'رائد', Oberstleutnant: 'مقدّم', Oberst: 'عقيد',
};
const SHORT: Record<string, string> = {
  'Lt.': 'الملازم', 'Oblt.': 'الملازم أول', 'Hptm.': 'النقيب', 'Maj.': 'الرائد', 'Obstlt.': 'المقدّم', 'Obst.': 'العقيد',
};
const UNITS: Record<string, string> = { JG: 'جناح المقاتلات', KG: 'جناح القاذفات', ZG: 'جناح المدمّرات' };

// Where an encounter happened (Nemesis.placeOf)
const PLACES: Record<string, string> = {
  'the Reich': 'الرايخ', 'the Ruhr': 'الرور', 'the Netherlands': 'هولندا', 'the Channel': 'القنال',
  Emden: 'إمدن', Bremen: 'بريمن', Ludwigshafen: 'لودفيغسهافن', Leipzig: 'لايبزيغ', Schweinfurt: 'شفاينفورت', Berlin: 'برلين', Kiel: 'كيل',
  Regensburg: 'ريغنسبورغ', Oschersleben: 'أوشرسليبن', Hamm: 'هام', 'Münster': 'مونستر', 'Osnabrück': 'أوسنابروك', Hannover: 'هانوفر',
  Rheine: 'راينه', Twente: 'تفينته', Oldenburg: 'أولدنبورغ', Gelsenkirchen: 'غيلزنكيرشن', Leuna: 'لوينا', Misburg: 'ميسبورغ',
  Wilhelmshaven: 'فيلهلمسهافن', Brunswick: 'براونشفايغ', Kassel: 'كاسل', Gotha: 'غوتا',
};

const RK = '(Lt\\.|Oblt\\.|Hptm\\.|Maj\\.|Obstlt\\.|Obst\\.)';

const patterns: Pattern[] = [
  [/^(JG|KG|ZG) (\d+)$/, (m) => `${UNITS[m[1]]} ${m[2]}`],
  // the leader's label in the kill feed and tags: 'Hptm. Dorn'
  [new RegExp(`^${RK} (\\S+)$`), (m, tr) => `${SHORT[m[1]]} ${tr(m[2])}`],
  [/^(.+) \(Experte\)$/, (m, tr) => `${tr(m[1])} (آس)`],
  // radio (recorded with every surname, tools/voice/lines.json)
  [/^Intelligence was right — that's (\S+)'s machine! Watch for his markings!$/, (m, tr) => `كانت الاستخبارات محقّة — تلك طائرة ${tr(m[1])}! انتبهوا لشاراته!`],
  [/^You got (\S+)! That's one Experte off the board!$/, (m, tr) => `أسقطت ${tr(m[1])}! آس أقلّ في السماء!`],
  // radio (spoken by the browser voice: crewman and place change)
  [/^He's back — the one who wounded (.+) over (.+)!$/, (m, tr) => `لقد عاد — إنه من جرح ${tr(m[1])} فوق ${tr(m[2])}!`],
  [/^He's back — the one who shot us down over (.+)!$/, (m, tr) => `لقد عاد — إنه من أسقطنا فوق ${tr(m[1])}!`],
];

const table: PhraseTable = {
  phrases: {
    ...NEMESIS_NAME_AR, ...RANKS, ...SHORT, ...PLACES,
    // traits
    'Head-on specialist': 'متخصص في الهجوم الأمامي',
    "Comes in from twelve o'clock high and never turns away first.": 'يأتي من الساعة الثانية عشرة من الأعلى، ولا يكون أول من ينحرف.',
    'Attacks out of the sun': 'يهاجم من جهة الشمس',
    'Climbs up-sun and dives out of the glare, where the gunners cannot look.': 'يصعد نحو الشمس ثم ينقضّ من وهجها، حيث لا يستطيع الرماة النظر.',
    'Hunts stragglers': 'يصطاد المتخلّفين',
    'Circles the box and pounces on any bomber that falls behind.': 'يحوم حول التشكيل وينقضّ على أي قاذفة تتخلّف عنه.',
    'Goes for the tail gunner': 'يستهدف رامي الذيل',
    'Kills the tail gun first: then the bomber is blind from behind.': 'يُسكت مدفع الذيل أولاً: فتصبح القاذفة عمياء من الخلف.',
    'Fights the escorts': 'يقاتل المرافقين',
    'Leaves the bombers to his wingmen and goes looking for Mustangs.': 'يترك القاذفات لمرافقيه ويبحث عن طائرات موستانغ.',
    'Jet ace (Me 262)': 'آس النفّاثات (Me 262)',
    'One slashing pass at five hundred miles an hour, then gone.': 'انقضاضة خاطفة واحدة بسرعة خمسمئة ميل في الساعة، ثم يختفي.',
    'Sturmbock (armoured Fw 190)': 'شتورمبوك (Fw 190 مدرّعة)',
    'Armour plate and heavy cannon: closes from astern to point-blank range.': 'دروع ومدافع ثقيلة: يقترب من الخلف حتى مسافة الصفر.',
    'Zerstörer ace (Me 410)': 'آس المدمّرات (Me 410)',
    'Stands off at two kilometres and fires his 50 mm cannon.': 'يقف على بُعد كيلومترين ويطلق مدفعه عيار 50 ملم.',
    // colours and emblems
    Yellow: 'أصفر', Red: 'أحمر', Blue: 'أزرق', White: 'أبيض', Black: 'أسود', Green: 'أخضر', Orange: 'برتقالي', Violet: 'بنفسجي',
    'Ace of spades': 'آس البستوني', 'Red heart': 'قلب أحمر', "Wolf's head": 'رأس ذئب', 'Lightning bolt': 'صاعقة', "Eagle's wings": 'جناحا نسر',
    'Red devil': 'الشيطان الأحمر', 'Crown': 'تاج', 'Staffel star': 'نجمة السرب',
    // dossier history lines
    'Over {place}: you shot him down.': 'فوق {place}: أسقطته أنت.',
    'Over {place}: shot down by the formation.': 'فوق {place}: أسقطه التشكيل.',
    'Over {place}: you shot him down, but he bailed out.': 'فوق {place}: أسقطته، لكنه قفز بمظلته.',
    'Over {place}: shot down, but he bailed out.': 'فوق {place}: أُسقط، لكنه قفز بمظلته.',
    'Over {place}: badly shot up, he escaped.': 'فوق {place}: أُصيب إصابات بالغة، لكنه أفلت.',
    'Over {place}: he broke off and went home.': 'فوق {place}: انسحب وعاد إلى قاعدته.',
    'He wounded {crew}.': 'جرح {crew}.',
    'He shot you down.': 'أسقطك.',
    'He shot down your bomber.': 'أسقط قاذفتك.',
    'He claimed one of ours.': 'أسقط واحدة من طائراتنا.',
    'He claimed {n} of ours.': 'أسقط {n} من طائراتنا.',
    'He shot up your aircraft.': 'أمطر طائرتك بالرصاص.',
    'Promoted to {rank}.': 'رُقّي إلى رتبة {rank}.',
    '+{n} merit.': '+{n} نقطة استحقاق.',
    // debrief and campaign intelligence report
    '{name} — shot down by you. +{n} merit.': '{name} — أسقطته أنت. +{n} نقطة استحقاق.',
    '{name} — shot down by the formation.': '{name} — أسقطه التشكيل.',
    '{name} — shot down by you, +{n} merit. He bailed out and will be back.': '{name} — أسقطته أنت، +{n} نقطة استحقاق. قفز بمظلته وسيعود.',
    '{name} — shot down. He bailed out and will be back.': '{name} — أُسقط. قفز بمظلته وسيعود.',
    '{name} — escaped badly damaged. He will return with a grudge.': '{name} — أفلت مُثخنًا بالإصابات. سيعود وفي صدره ثأر.',
    '{name} — broke off and went home.': '{name} — انسحب وعاد إلى قاعدته.',
    '{name} wounded {crew}.': '{name} جرح {crew}.',
    '{name} shot you down.': '{name} أسقطك.',
    '{name} shot down your bomber.': '{name} أسقط قاذفتك.',
    '{name} now claims {n} victories.': 'يدّعي {name} الآن {n} انتصارًا.',
    '{name} has been promoted to {rank}.': 'رُقّي {name} إلى رتبة {rank}.',
    '{name} of {unit} is promoted from the ranks to take his place.': 'رُقّي {name} من {unit} من بين الصفوف ليحلّ محلّه.',
    'Most wanted: {name} · {n} victories · bounty {b} merit': 'المطلوب الأول: {name} · {n} انتصارًا · المكافأة {b} نقطة استحقاق',
    'Experten dossiers': 'ملفات الآسات',
    // what the crew remembers (HUD card)
    'Wounded {crew} over {place}': 'جرح {crew} فوق {place}',
    'Shot us down over {place}': 'أسقطنا فوق {place}',
    'Bailed out over {place}, back from hospital': 'قفز بمظلته فوق {place}، وعاد من المستشفى',
    'Escaped us damaged over {place}': 'أفلت منا مصابًا فوق {place}',
    'Met over {place}': 'التقيناه فوق {place}',
    // HUD: banner, card, panel, tags, tips, feed
    'EXPERTE': 'آس',
    '{n} VICTORIES': '{n} انتصارًا',
    'EXPERTE · {n} VICTORIES': 'آس · {n} انتصارًا',
    '{n} victories': '{n} انتصارًا',
    'victories': 'انتصارًا',
    '+{n} WINGMEN': '+{n} مرافقين',
    'ALONE': 'وحيد',
    'ACE': 'آس',
    'MOST WANTED': 'المطلوب الأول',
    'INTELLIGENCE · EXPERTE': 'الاستخبارات · آس',
    'Patched up after last time · out for revenge': 'رُقّعت طائرته منذ المرة الماضية · يسعى إلى الثأر',
    'Experte down': 'سقط الآس',
    'Most wanted — down': 'سقط المطلوب الأول',
    'The Experte is coming for the <b>TAIL GUN</b> — <kbd>5</kbd>': 'الآس قادم نحو <b>مدفع الذيل</b> — <kbd>5</kbd>',
    'The Experte attacks head-on — <b>TOP TURRET</b> <kbd>3</kbd>': 'الآس يهاجم من الأمام — <b>البرج العلوي</b> <kbd>3</kbd>',
    'The Experte dives <b>OUT OF THE SUN</b> — watch the glare': 'الآس ينقضّ <b>من جهة الشمس</b> — احذر الوهج',
    'Bring down the Experte — {trait}': 'أسقط الآس — {trait}',
    '{name} shot down — +{n} merit bounty': 'أُسقط {name} — مكافأة +{n} نقطة استحقاق',
    '{name} shot down': 'أُسقط {name}',
    '{name} escaped, badly damaged': 'أفلت {name} مُثخنًا بالإصابات',
    '{name} broke off': 'انسحب {name}',
    'Luftwaffe Experten': 'آسات اللوفتفافه',
    // the Experten screen
    'Killed in action': 'قُتل في المعركة',
    'In hospital · back in {n} missions': 'في المستشفى · يعود بعد {n} مهمات',
    'On strength': 'في الخدمة',
    '{n} encounters': '{n} مواجهات',
    'Never met': 'لم نلتقه بعد',
    'wounded {crew}': 'جرح {crew}',
    'shot you down ×{n}': 'أسقطك ×{n}',
    'escaped you ×{n}': 'أفلت منك ×{n}',
    'Bounty: {n} merit': 'المكافأة: {n} نقطة استحقاق',
    'Price on his head: {n} merit': 'ثمن رأسه: {n} نقطة استحقاق',
    'Patches': 'الرقع',
    'Grudge': 'الثأر',
    'Took over from {name}': 'خلَف {name}',
    'HISTORY WITH YOU': 'سجلّه معك',
    'Last sighting: {mission} · over {place}': 'آخر مشاهدة: {mission} · فوق {place}',
    'No Experten met yet. Intelligence expects them on every big raid.': 'لم نلتقِ أي آس بعد. تتوقعهم الاستخبارات في كل غارة كبيرة.',
    'SECRET': 'سرّي',
    '401ST BOMB SQUADRON · S-2 INTELLIGENCE': 'سرب القاذفات 401 · استخبارات S-2',
    'ENEMY PERSONALITIES FILE': 'ملف شخصيات العدو',
    'Experten shot down by you: <b>{n}</b>': 'الآسات التي أسقطتها: <b>{n}</b>',
    'I. ON STRENGTH · {n}': 'أولاً: في الخدمة · {n}',
    'II. KILLED IN ACTION · {n}': 'ثانياً: قُتلوا في المعركة · {n}',
    // achievements and the medal
    'Scratch One Experte': 'آس أقلّ',
    'Shoot down a named Luftwaffe Experte.': 'أسقط آسًا معروفًا بالاسم من اللوفتفافه.',
    'Settled Score': 'تصفية حساب',
    'Shoot down an Experte who hurt your crew or got away from you before.': 'أسقط آسًا آذى طاقمك أو أفلت منك من قبل.',
    'Most Wanted': 'المطلوب الأول',
    "Shoot down the Luftwaffe's most wanted Experte and collect the bounty.": 'أسقط الآس المطلوب الأول في اللوفتفافه واقبض المكافأة.',
    'Knight Hunter': 'صائد الفرسان',
    'Shoot down five named Experten.': 'أسقط خمسة آسات معروفين بالاسم.',
    'Experten Killer': 'قاتل الآسات',
    // German pilots on the radio (subtitles only)
    'Head-on, Kinder. Straight through them, and nobody turns away before me.': 'من الأمام يا أولاد. اخترقوهم مباشرة، ولا ينحرف أحد قبلي.',
    'Out of the sun. They will not see us until it is too late.': 'من جهة الشمس. لن يرونا إلا بعد فوات الأوان.',
    'Look for the cripple at the back. Wounded birds fall easiest.': 'ابحثوا عن العاجزة في المؤخرة. الطيور الجريحة أسهل سقوطًا.',
    'Kill the tail gunner first. Then the Viermot is blind.': 'اقتلوا رامي الذيل أولاً. عندها تصبح ذات المحركات الأربعة عمياء.',
    'Leave the bombers to the others. The Mustangs are mine.': 'اتركوا القاذفات للآخرين. الموستانغ لي.',
    'Turbines at full power. Nobody can catch us today.': 'التوربينات بأقصى قوتها. لن يلحق بنا أحد اليوم.',
    'Close in to a hundred metres. Sturm!': 'اقتربوا حتى مئة متر. هجوم!',
    'Stay out of their range. One shell is enough for a Viermot.': 'ابقوا خارج مداهم. قذيفة واحدة تكفي لذات المحركات الأربعة.',
    'I remember your ship, Amis. Today we finish it.': 'أتذكر طائرتكم أيها الأمريكان. اليوم ننهي أمرها.',
    'Two weeks in hospital because of you. Now it is my turn.': 'أسبوعان في المستشفى بسببكم. الآن جاء دوري.',
    'You again? You should have stayed in England.': 'أنتم مجددًا؟ كان عليكم البقاء في إنجلترا.',
    // crew radio (recorded)
    "That's the one who bailed out on us — he's flying again!": 'إنه الذي قفز بمظلته في المرة الماضية — عاد يطير من جديد!',
    "He's back — you can still see the patches where we shot him up!": 'لقد عاد — ما زالت الرقع ظاهرة حيث أصبناه!',
    "Those markings again — it's the same Experte we tangled with before!": 'تلك الشارات مجددًا — إنه الآس نفسه الذي اشتبكنا معه من قبل!',
    "He's breaking off, trailing smoke — don't let him get away!": 'إنه ينسحب ويجرّ خلفه دخانًا — لا تدعوه يفلت!',
    "He's going after the Mustangs — he wants the little friends!": 'إنه يلاحق الموستانغ — يريد الأصدقاء الصغار!',
    "He's going for the stragglers — the cripples are his meat!": 'إنه يتجه نحو المتخلّفين — العاجزون فريسته!',
    "He's lining up on the tail gun — watch six o'clock!": 'إنه يصطفّ على مدفع الذيل — راقبوا الساعة السادسة!',
    'Sturmbock! Armoured Fw 190s closing to point-blank — hit him hard!': 'شتورمبوك! طائرات Fw 190 مدرّعة تقترب حتى مسافة الصفر — اضربوه بقوة!',
    "He's coming head-on, twelve o'clock high — he never turns away first!": 'إنه قادم من الأمام، الساعة الثانية عشرة من الأعلى — لا يكون أول من ينحرف أبدًا!',
    "He's coming out of the sun — watch the glare!": 'إنه قادم من جهة الشمس — احذروا الوهج!',
    "Jet Experte! One pass and he's gone — be ready!": 'آس نفّاث! انقضاضة واحدة ثم يختفي — كونوا مستعدين!',
    "That Me 410 Experte is hanging back — he'll use the big gun!": 'ذلك الآس على Me 410 يتريّث في الخلف — سيستخدم المدفع الكبير!',
    "He's coming straight for us — he's got a score to settle!": 'إنه قادم نحونا مباشرة — لديه حساب يريد تصفيته!',
    'Somebody got the Experte! Scratch one ace!': 'أحدهم أسقط الآس! آس أقلّ!',
    "He's bailed out — there's his chute! He'll fly again.": 'لقد قفز — ها هي مظلته! سيطير مجددًا.',
    "He got away. He'll be back — and he'll remember us.": 'لقد أفلت. سيعود — وسيتذكرنا.',
    'That was the Experte! He got one of ours!': 'إنه الآس! أصاب أحد رجالنا!',
    'The Experte just got one of the Forts!': 'الآس أسقط للتو إحدى القلاع!',
  },
  patterns,
};
export default table;
