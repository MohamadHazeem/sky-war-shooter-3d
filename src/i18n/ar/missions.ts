import type { PhraseTable } from '../types';

// Arabic for the missions texts, keyed by the exact English shown in game.
// Covers src/game/Missions.ts (campaign, story arc, survival), the game modes (Modes.ts),
// round pacing banners/tips/callouts (Pacing.ts) and the briefing sheet extras and route map.

const MONTHS: Record<string, string> = {
  January: 'يناير', February: 'فبراير', March: 'مارس', April: 'أبريل', May: 'مايو', June: 'يونيو',
  July: 'يوليو', August: 'أغسطس', September: 'سبتمبر', October: 'أكتوبر', November: 'نوفمبر', December: 'ديسمبر',
};

// Luftwaffe ranks and the Ace Hunt aces' names (Modes.ts ACE_NAMES)
const RANKS: Record<string, string> = { 'Hptm.': 'النقيب', 'Oblt.': 'الملازم أول', 'Maj.': 'الرائد', 'Lt.': 'الملازم' };
const ACES: Record<string, string> = {
  Krüger: 'كروغر', Hahn: 'هان', Steiner: 'شتاينر', Vogt: 'فوغت', Brandt: 'برانت',
  Wolff: 'فولف', Falk: 'فالك', Richter: 'ريشتر', Lange: 'لانغه', Keller: 'كيلر',
};
const ACE_RE = `(Hptm\\.|Oblt\\.|Maj\\.|Lt\\.) (${Object.keys(ACES).join('|')})`;

// "N fighters" with the Arabic counted-noun form (3-10 take the plural)
const fighters = (n: string) => { const k = Number(n); return k >= 3 && k <= 10 ? `${n} مقاتلات` : `${n} مقاتلة`; };
const bombers = (n: string) => { const k = Number(n); return k >= 3 && k <= 10 ? `${n} قاذفات` : `${n} قاذفة`; };

const table: PhraseTable = {
  phrases: {
    // ---------------- Mission titles ----------------
    "Baptism of Fire": "معمودية النار",
    "Twelve O'Clock High": "الساعة الثانية عشرة من الأعلى",
    "Flak Alley": "ممر المضادات",
    "Little Friends": "الأصدقاء الصغار",
    "Sturmgruppe": "شتورمغروبه",
    "The Long Way Home": "طريق العودة الطويل",
    "Big Week": "الأسبوع الكبير",
    "Black Thursday": "الخميس الأسود",
    "Into the Front": "في قلب العاصفة",
    "Last Light": "آخر ضوء",
    "Bomb Run": "مسار القصف",
    "Maximum Effort": "الجهد الأقصى",
    "Survival — Gunner": "البقاء — الرامي",
    "Survival — Escort": "البقاء — المرافقة",
    "Ace Hunt — Gunner": "صيد الآسات — الرامي",
    "Ace Hunt — Escort": "صيد الآسات — المرافقة",
    "Time Attack — Gunner": "سباق الزمن — الرامي",
    "Time Attack — Escort": "سباق الزمن — المرافقة",

    // ---------------- Targets ----------------
    "U-boat yards, Emden": "أحواض الغواصات، إمدن",
    "Port facilities, Bremen": "المنشآت المرفئية، بريمن",
    "Chemical works, Ludwigshafen": "مصانع الكيماويات، لودفيغسهافن",
    "Escort — Leipzig": "مرافقة — لايبزيغ",
    "Ball-bearing plants, Schweinfurt": "مصانع المحامل الكروية، شفاينفورت",
    "Return leg — over the Netherlands": "رحلة العودة — فوق هولندا",
    "Escort — Berlin": "مرافقة — برلين",
    "Escort — Kiel": "مرافقة — كيل",
    "Return leg — over the Channel": "رحلة العودة — فوق بحر المانش",
    "Messerschmitt works, Regensburg": "مصانع مسرشميت، ريغنسبورغ",
    "Aircraft plants, Oschersleben": "مصانع الطائرات، أوشرسليبن",
    "Endless waves": "موجات لا تنتهي",
    "Jagdgeschwader aces": "آسات الياغدغيشفادر",
    "Three minutes": "ثلاث دقائق",

    // ---------------- Dates ----------------
    "27 September 1943": "27 سبتمبر 1943",
    "8 October 1943": "8 أكتوبر 1943",
    "14 October 1943": "14 أكتوبر 1943",
    "13 December 1943": "13 ديسمبر 1943",
    "30 December 1943": "30 ديسمبر 1943",
    "29 January 1944": "29 يناير 1944",
    "20 February 1944": "20 فبراير 1944",
    "24 February 1944": "24 فبراير 1944",
    "25 February 1944": "25 فبراير 1944",
    "6 March 1944": "6 مارس 1944",
    "8 March 1944": "8 مارس 1944",
    "11 April 1944": "11 أبريل 1944",
    "Somewhere over the Reich": "في مكانٍ ما فوق الرايخ",
    "Over the Ruhr, spring 1944": "فوق الرور، ربيع 1944",
    "The clock is running": "الوقت يمضي",

    // ---------------- Objectives ----------------
    "Defend the formation": "الدفاع عن التشكيل",
    "Survive the mission": "النجاة من المهمة",
    "Lose no more than 3 bombers": "ألّا نخسر أكثر من 3 قاذفات",
    "Lose no more than 4 bombers": "ألّا نخسر أكثر من 4 قاذفات",
    "Lose no more than 5 bombers": "ألّا نخسر أكثر من 5 قاذفات",
    "Lose no more than 6 bombers": "ألّا نخسر أكثر من 6 قاذفات",
    "Lose no more than 7 bombers": "ألّا نخسر أكثر من 7 قاذفات",
    "Lose no more than 8 bombers": "ألّا نخسر أكثر من 8 قاذفات",
    "Lose no more than 9 bombers": "ألّا نخسر أكثر من 9 قاذفات",
    "Break up the head-on attacks": "تفريق الهجمات الأمامية",
    "Fight through to the target": "شقّ الطريق قتالًا حتى الهدف",
    "Survive the flak belt over the target": "النجاة من حزام المضادات فوق الهدف",
    "Defend the formation on the way home": "الدفاع عن التشكيل في طريق العودة",
    "Protect the bombers": "حماية القاذفات",
    "Destroy the attacking fighters": "تدمير المقاتلات المهاجمة",
    "Stop the Sturmgruppe attack from astern": "صدّ هجوم الشتورمغروبه من الخلف",
    "Keep the Sky Queen in the air": "إبقاء Sky Queen في الجو",
    "Hold out until the escort arrives": "الصمود حتى وصول المرافقة",
    "Destroy as many attackers as possible": "تدمير أكبر عدد ممكن من المهاجمين",
    "Survive the mass attack": "النجاة من الهجوم الكثيف",
    "Break up the rocket attacks from astern": "تفريق الهجمات الصاروخية من الخلف",
    "Escort the bombers through the storm front": "مرافقة القاذفات عبر جبهة العاصفة",
    "Break up the attacks on the bombers": "تفريق الهجمات على القاذفات",
    "Reach the English coast before dark": "بلوغ الساحل الإنجليزي قبل حلول الظلام",
    "Fight through to the initial point": "شقّ الطريق قتالًا حتى نقطة البدء",
    "Hold formation through the flak on the bomb run": "الحفاظ على التشكيل وسط المضادات على مسار القصف",
    "Put the bombs on the Messerschmitt works": "إلقاء القنابل على مصانع مسرشميت",
    "Survive the attack on the way in": "النجاة من الهجوم في طريق الذهاب",
    "Bomb the aircraft plants through the flak": "قصف مصانع الطائرات وسط نيران المضادات",
    "Hold out until the Mustangs arrive": "الصمود حتى وصول طائرات موستانغ",
    "Bring the Sky Queen home": "إعادة Sky Queen إلى الديار",
    "Survive as many waves as possible": "النجاة من أكبر عدد ممكن من الموجات",
    "Shoot down the aces — 1000 points each": "إسقاط الآسات — 1000 نقطة لكل آس",
    "Survive three rounds": "النجاة من ثلاث جولات",
    "Score as much as you can in three minutes": "أحرز أكبر قدر من النقاط في ثلاث دقائق",

    // ---------------- Debrief success lines ----------------
    "Emden's U-boat pens took a beating. Good shooting, gunner — you'll make a veteran yet.": "تلقّت ملاجئ الغواصات في إمدن ضربة موجعة. رماية موفقة أيها الرامي — ستصبح من المخضرمين قريبًا.",
    "The head-on attacks broke against a wall of fifty-calibre fire. Bremen's docks are burning.": "تحطّمت الهجمات الأمامية على جدار من نيران عيار .50. أرصفة بريمن تحترق.",
    "Bombs on target through the worst flak of the war. The chemical works at Ludwigshafen are in flames.": "أصابت القنابل الهدف وسط أعنف نيران مضادات في هذه الحرب. مصانع الكيماويات في لودفيغسهافن تشتعل.",
    "The Big Friends made it to Leipzig and back. Outstanding work, Blue Leader.": "بلغ الأصدقاء الكبار لايبزيغ وعادوا سالمين. عمل رائع يا قائد السرب الأزرق.",
    "The Sturmgruppe paid for every pass. The tail gun held, and so did the formation.": "دفعت الشتورمغروبه ثمن كل انقضاضة. صمد مدفع الذيل، وصمد التشكيل معه.",
    "The Mustangs drove them off. The Sky Queen limps home across the North Sea on two engines.": "طردتهم طائرات موستانغ. وتعرج Sky Queen عائدةً عبر بحر الشمال بمحرّكين اثنين.",
    "Berlin has been hit, and the Luftwaffe lost more than it can replace. The air war has turned.": "أُصيبت برلين، وخسرت اللوفتفافه أكثر مما تستطيع تعويضه. لقد انقلبت موازين الحرب الجوية.",
    "Schweinfurt was hit hard, and so were we. Sixty Fortresses did not come home tonight. The Sky Queen did.": "تلقّت شفاينفورت ضربة قاسية، وكذلك نحن. ستون قلعة طائرة لم تعد الليلة. أما Sky Queen فعادت.",
    "The Mustangs went all the way to Kiel and back. Somewhere in the Sky Queen, Sergeant Dawson owes a fighter pilot a month of dinners.": "رافقت طائرات موستانغ القاذفات حتى كيل وعادت معها. وفي مكانٍ ما على متن Sky Queen، صار الرقيب داوسون مدينًا لطيار مقاتلة بعشاء شهر كامل.",
    "Wheels down at Manston in the last of the light. The Sky Queen came home from her thirteenth, and Sergeant Gallo kissed the runway.": "لامست العجلات مدرج مانستون مع آخر خيوط الضوء. عادت Sky Queen من مهمتها الثالثة عشرة، وقبّل الرقيب غالو المدرج.",
    "Bombs away, right on the aiming point. The photographs show the Messerschmitt works in ruins. Lieutenant Kessler is insufferable.": "أُلقيت القنابل على نقطة التصويب تمامًا. تُظهر الصور مصانع مسرشميت وقد صارت أنقاضًا. والملازم كيسلر لم يعد يُطاق.",
    "Twenty-five. The Sky Queen touches down at Deenethorpe and her crew climbs out for the last time. The skies over Europe belong to the Allies now. Tour complete.": "خمس وعشرون. تهبط Sky Queen في دينيثورب، ويترجّل طاقمها منها للمرة الأخيرة. سماء أوروبا صارت للحلفاء الآن. اكتملت جولة الخدمة.",
    "The experten are down.": "سقط الخبراء الألمان.",
    "Time!": "انتهى الوقت!",

    // ---------------- Briefings: m1 Baptism of Fire ----------------
    "Gentlemen, this is your first one. The group puts up eighteen ships against the U-boat yards at Emden. Bombing altitude twenty-five thousand feet.": "أيها السادة، هذه مهمتكم الأولى. تدفع المجموعة بثماني عشرة قاذفة ضد أحواض الغواصات في إمدن. ارتفاع القصف خمسة وعشرون ألف قدم.",
    "You are left waist gunner aboard the Sky Queen, number two ship in the lead element. Expect single-engine fighters over the Frisian coast. They will come in fast and they will come in close.": "أنت رامي الجانب الأيسر على متن Sky Queen، القاذفة الثانية في عنصر القيادة. توقّع مقاتلات أحادية المحرك فوق الساحل الفريزي. ستنقضّ بسرعة، وستقترب كثيرًا.",
    "Lead your target. A fighter crossing at three hundred miles an hour needs a lot of lead — watch your tracers and walk them in. Short bursts. Keep that barrel cool.": "صوّب أمام هدفك. المقاتلة التي تعبر أمامك بسرعة ثلاثمئة ميل في الساعة تحتاج إلى تقديم كبير — راقب طلقاتك الخطّاطة وقُدها نحو الهدف. رشقات قصيرة. وحافظ على برودة السبطانة.",
    "A word about your ship. The Sky Queen is brand new, and so is her crew. Captain Brenner flies her, Lieutenant Stern has promised to find Emden on the first try, and Sergeant Gallo has already painted a crown under the pilot's window. Twenty-five missions and you go home. This is number one.": "كلمة عن طائرتكم. Sky Queen جديدة تمامًا، وكذلك طاقمها. يقودها النقيب برينر، وقد وعد الملازم ستيرن بإيجاد إمدن من المحاولة الأولى، أما الرقيب غالو فقد رسم تاجًا تحت نافذة الطيار. خمس وعشرون مهمة ثم تعودون إلى الوطن. وهذه هي الأولى.",

    // m2 Twelve O'Clock High
    "The Luftwaffe has learned that the nose of a Fortress is its weak spot. Their fighters are making head-on passes at closing speeds of six hundred miles an hour.": "أدركت اللوفتفافه أن مقدمة القلعة الطائرة هي نقطة ضعفها. مقاتلاتهم تنفّذ انقضاضات أمامية بسرعات اقتراب تبلغ ستمئة ميل في الساعة.",
    "You are flying the top turret today. Twin fifties, three hundred and sixty degrees of traverse. When they come in from twelve o'clock high you are the man who has to stop them.": "ستتولى البرج العلوي اليوم. رشاشان توأمان من عيار .50، ودوران كامل بثلاثمئة وستين درجة. حين ينقضّون من الساعة الثانية عشرة من الأعلى، فأنت الرجل الذي عليه إيقافهم.",
    "Bremen is heavily defended. Expect repeated attacks before and after the target.": "بريمن محصّنة بدفاعات كثيفة. توقّعوا هجمات متكررة قبل الهدف وبعده.",
    "The Sky Queen came back from Emden with forty-one holes in her and not a scratch on her crew. Sergeant Reilly says the ball turret is the safest seat in the house, because the Germans cannot find him down there. Lieutenant Doyle says nobody else can either. Mission two. Keep it off the interphone once we cross the coast.": "عادت Sky Queen من إمدن وفي هيكلها واحد وأربعون ثقبًا، دون خدش واحد في طاقمها. يقول الرقيب رايلي إن البرج الكروي أكثر المقاعد أمانًا، لأن الألمان لا يستطيعون العثور عليه هناك في الأسفل. ويقول الملازم دويل إن أحدًا غيرهم لا يستطيع ذلك أيضًا. المهمة الثانية. التزموا الصمت على الاتصال الداخلي حالما نعبر الساحل.",

    // m3 Flak Alley
    "The I.G. Farben works at Ludwigshafen is ringed by more than two hundred heavy flak guns. There is nothing you can do about flak but pray — and keep the fighters off us. The forecast has the overcast breaking up short of the target, so the gunners down there will have a clear view of us.": "تطوّق مصانعَ «آي. جي. فاربن» في لودفيغسهافن أكثرُ من مئتي قطعة مضادات ثقيلة. لا حيلة لكم أمام نيران المضادات سوى الدعاء — وإبعاد المقاتلات عنا. وتتوقّع النشرة الجوية أن تنقشع الغيوم قبل الهدف، فيرانا رماة المدافع في الأسفل بوضوح.",
    "You are right waist gunner. Fighters will hit us on the way in, then pull off when we reach the flak belt. Once bombs are away, they will be back for the cripples.": "أنت رامي الجانب الأيمن. ستضربنا المقاتلات في طريق الذهاب، ثم تنسحب حين نبلغ حزام المضادات. وما إن نُلقي القنابل حتى تعود لاصطياد القاذفات المعطوبة.",
    "Stay at your gun through the bomb run. Do not get out of position.": "الزم رشاشك طوال مسار القصف. لا تغادر موقعك.",
    "Since Schweinfurt the bunks across the aisle have changed names twice. The Lucky Lady never came back from that one, and her crew had been with the Sky Queen since training. Sergeant Mendez has blessed every gun aboard with a Saint Christopher medal. Lieutenant Kessler wants only one thing for Christmas: the aiming point.": "منذ شفاينفورت، تبدّلت أسماء أصحاب الأسرّة على الجانب الآخر من الممر مرتين. لم تعد «Lucky Lady» من تلك المهمة، وكان طاقمها رفيق Sky Queen منذ أيام التدريب. وقد بارك الرقيب منديز كل رشاش على متن الطائرة بميدالية القديس كريستوفر. أما الملازم كيسلر فلا يتمنى في عيد الميلاد إلا شيئًا واحدًا: نقطة التصويب.",

    // m4 Little Friends
    "Big Week. The whole Eighth Air Force is going after the German aircraft industry, and this time the bombers will not go alone.": "إنه الأسبوع الكبير. سلاح الجو الثامن بأكمله يستهدف صناعة الطائرات الألمانية، وهذه المرة لن تمضي القاذفات وحدها.",
    "You are flying a P-51D Mustang on close escort for a box of twelve Fortresses. Your job is to break up the fighter attacks before they reach the bombers. Do not chase the enemy all over Germany — stay with the big friends.": "ستقود موستانغ P-51D في مهمة مرافقة لصيقة لتشكيل من اثنتي عشرة قلعة طائرة. مهمتك تفريق هجمات المقاتلات قبل أن تبلغ القاذفات. لا تطارد العدو في أرجاء ألمانيا كلها — ابقَ مع الأصدقاء الكبار.",
    "Mouse aim flies the aircraft toward where you look. W and S for throttle. Your six fifties are harmonised at three hundred yards.": "التصويب بالفأرة يوجّه الطائرة نحو حيث تنظر. W وS للخانق. رشاشاتك الستة من عيار .50 مضبوطة لتلتقي نيرانها على مسافة ثلاثمئة ياردة.",
    "Some of you met the Sky Queen's crew in the pub at Oundle after Kiel. Their tail gunner, Sergeant Dawson, is still paying for dinners for the Mustang pilots who went all the way with them. He says there is a steak in it for anyone who sees them home from Leipzig.": "التقى بعضكم بطاقم Sky Queen في حانة أوندل بعد مهمة كيل. ولا يزال رامي ذيلهم، الرقيب داوسون، يدفع ثمن عشاء طياري موستانغ الذين رافقوهم طوال الطريق. ويقول إن شريحة لحم بانتظار كل من يعيدهم سالمين من لايبزيغ.",

    // m5 Sturmgruppe
    "Intelligence reports a new kind of German unit: the Sturmgruppe. Heavily armoured Fw 190 A-8s that close to point-blank range from astern, in line abreast, and do not break off.": "تفيد الاستخبارات بظهور نوع جديد من الوحدات الألمانية: الشتورمغروبه، أي مجموعة الاقتحام. طائرات Fw 190 A-8 مدرّعة تدريعًا ثقيلًا، تقترب من الخلف في صفّ متجاور حتى مسافة الصفر، ولا تنكفئ.",
    "You are the tail gunner. They will be coming straight at you. Open fire early and keep firing — armour glass in their windscreens will stop a lot of what you throw at them.": "أنت رامي الذيل. سيأتون نحوك مباشرة. افتح النار مبكرًا وواصل الرمي — فالزجاج المدرّع في واجهاتهم سيصدّ كثيرًا مما تقذفه عليهم.",
    "The Sky Queen is one of the senior ships in the group now, with eighteen missions behind her. Lieutenant Doyle is back from hospital with a piece of Frankfurt flak on his key ring, and nobody aboard will say the word Schweinfurt out loud. The last time we went there, sixty Fortresses stayed behind. Not today.": "صارت Sky Queen من أقدم طائرات المجموعة الآن، وخلفها ثماني عشرة مهمة. عاد الملازم دويل من المستشفى وفي سلسلة مفاتيحه شظية من مضادات فرانكفورت، ولا أحد على متنها ينطق كلمة شفاينفورت بصوت عالٍ. في المرة الأخيرة التي ذهبنا فيها إلى هناك، بقيت ستون قلعة طائرة خلفنا. ليس اليوم.",

    // m6 The Long Way Home
    "Flak over Berlin knocked out two of our engines. We cannot hold formation and the group is pulling away from us. A lone Fortress is exactly what the Jagdflieger are looking for.": "أعطبت نيران المضادات فوق برلين محرّكين من محرّكاتنا. لا نستطيع الحفاظ على مكاننا في التشكيل، والمجموعة تبتعد عنا. وقلعة طائرة وحيدة هي بالضبط ما يبحث عنه طيارو المقاتلات الألمان.",
    "Every gun aboard is manned. Switch positions as they come in — one through five. P-51s are on the way to pick us up, but we have to hold out until they get here.": "كل رشاش على متن الطائرة مأهول. تنقّل بين المواقع كلما هاجموا — من 1 إلى 5. طائرات P-51 في طريقها لملاقاتنا، لكن علينا الصمود حتى تصل.",
    "Sergeant Gallo is calling every station that will listen. Lieutenant Stern has us on a heading for the coast, and Captain Brenner has told the crew that the Sky Queen did not carry them through twenty-one missions to let them down now. Hold on.": "الرقيب غالو ينادي كل محطة قد تسمعه. وقد وضعنا الملازم ستيرن على اتجاه نحو الساحل، وأخبر النقيب برينر الطاقم أن Sky Queen لم تحملهم عبر إحدى وعشرين مهمة لتخذلهم الآن. اصمدوا.",

    // m7 Big Week
    "This is the big one. The Luftwaffe is throwing everything it has left at the bomber stream over Berlin.": "هذه هي المهمة الكبرى. اللوفتفافه ترمي بكل ما تبقّى لديها على رتل القاذفات فوق برلين.",
    "You lead the escort for our box. There will be more fighters than you can count — pick your targets, protect the bombers, and keep your speed up. Ammunition is limited: six hundred seconds of combat will not last six hundred seconds.": "أنت تقود مرافقة تشكيلنا. ستواجه مقاتلات أكثر مما تستطيع عدّه — انتقِ أهدافك، واحمِ القاذفات، وحافظ على سرعتك. الذخيرة محدودة: لن تكفيك لستمئة ثانية من الرمي المتواصل.",
    "The Sky Queen made it home on two engines two days ago. The ground crew worked on her all night, and she is flying today with the men who would not leave her. When you see a Fortress with a crown painted under the cockpit, give her a little extra cover. She has three missions to go.": "عادت Sky Queen إلى القاعدة بمحرّكين قبل يومين. عمل عليها الطاقم الأرضي طوال الليل، وها هي تطير اليوم بالرجال الذين أبوا أن يتركوها. حين ترى قلعة طائرة رُسم تاج تحت قمرة قيادتها، امنحها قليلًا من الحماية الإضافية. لم يبقَ لها سوى ثلاث مهمات.",

    // m8 Black Thursday
    "Gentlemen, the target is Schweinfurt. Half the ball bearings in Germany come out of five factories in one small town. Flatten them, and every tank, U-boat and fighter in the Reich will feel it. The Eighth is putting up nearly three hundred Fortresses, and the Luftwaffe knows we are coming.": "أيها السادة، الهدف هو شفاينفورت. نصف المحامل الكروية في ألمانيا يخرج من خمسة مصانع في بلدة صغيرة واحدة. سوّوها بالأرض، وستشعر بذلك كل دبابة وغواصة ومقاتلة في الرايخ. يدفع سلاح الجو الثامن بنحو ثلاثمئة قلعة طائرة، واللوفتفافه تعلم أننا قادمون.",
    "The escort turns back at Aachen. After that we are on our own for two hundred miles, and intelligence expects every fighter group in western Germany to be waiting: single-engine fighters head-on, twin-engine destroyers firing rockets from astern. They will hit us in relays, land, refuel and come up again.": "ستعود المرافقة أدراجها عند آخن. بعدها سنكون وحدنا مسافة مئتي ميل، وتتوقع الاستخبارات أن تكون كل مجموعة مقاتلات في غرب ألمانيا بانتظارنا: مقاتلات أحادية المحرك من الأمام، ومدمّرات ثنائية المحرك تطلق الصواريخ من الخلف. سيضربوننا على دفعات متتالية، ثم يهبطون ويتزوّدون بالوقود ويعودون إلى الجو من جديد.",
    "You are in the ball turret today. Keep it turning, keep calling them out, and watch the bellies of the low squadron. Nobody else can see what is coming up from below.": "أنت في البرج الكروي اليوم. أبقِه دائرًا، وواصل الإبلاغ عنهم، وراقب بطون قاذفات السرب المنخفض. لا أحد غيرك يرى ما يصعد من الأسفل.",
    "This is the Sky Queen's third mission. Lieutenant Doyle wants it on the record that he volunteered for a milk run and nobody offered him one. Fly tight. Today a tight formation is the only escort you will have.": "هذه هي المهمة الثالثة للقاذفة Sky Queen. ويريد الملازم دويل أن يُسجَّل رسميًا أنه تطوّع لمهمة سهلة ولم يعرضها عليه أحد. حافظوا على تشكيل متراص. اليوم، التشكيل المتراص هو المرافقة الوحيدة التي ستحظون بها.",

    // m9 Into the Front
    "Until now the bombers have gone into Germany alone the moment the escort ran short of fuel. As of today that changes. The Mustang can reach Kiel and come home again, and you are going all the way with them.": "حتى الآن، كانت القاذفات تتوغّل في ألمانيا وحدها ما إن يشحّ وقود المرافقة. اعتبارًا من اليوم يتغيّر ذلك. موستانغ قادرة على بلوغ كيل والعودة، وأنت سترافقهم طوال الطريق.",
    "The weather is the worst we have flown in. A front lies across the North Sea from the Frisian Islands to Denmark: towering cloud, icing above eight thousand feet and lightning in the tops. We take off in clear air, and you will see it ahead long before we reach it. Once we are in, stay on your leader's wing in the murk. The German fighters will come at the bombers through the gaps.": "هذا أسوأ طقس طرنا فيه. جبهة هوائية تمتد عبر بحر الشمال من الجزر الفريزية حتى الدنمارك: سحب شاهقة، وتجمّد فوق ثمانية آلاف قدم، وبرق في قممها. سنقلع في جوّ صافٍ، وسترى الجبهة أمامك قبل أن نبلغها بوقت طويل. وما إن ندخلها حتى تلزم جناح قائدك وسط العتمة. ستنفذ المقاتلات الألمانية إلى القاذفات عبر الفجوات.",
    "The bomber crews are watching you today. The Sky Queen's tail gunner, Sergeant Dawson, has seen too many friends go down after the escort turned for home. He says that if a Mustang sticks with them all the way to Kiel, he will buy its pilot dinner for a month.": "أطقم القاذفات تراقبك اليوم. رامي الذيل في Sky Queen، الرقيب داوسون، رأى أصدقاء كثيرين يسقطون بعد أن عادت المرافقة أدراجها. يقول إنه إن بقيت موستانغ معهم حتى كيل، فسيدعو طيارها إلى العشاء شهرًا كاملًا.",
    "Mouse aim flies the aeroplane where you look. Keep your speed up, do not chase them into the cloud, and stay with the big friends.": "التصويب بالفأرة يوجّه الطائرة إلى حيث تنظر. حافظ على سرعتك، ولا تطاردهم داخل السحب، وابقَ مع الأصدقاء الكبار.",

    // m10 Last Light
    "Frankfurt is burning behind us, and so is the Sky Queen. Flak over the target knocked out two engines and put Lieutenant Doyle on the floor of the cockpit with a piece of steel in his leg. The group could not wait for us. We are alone, low on fuel, and the sun is going down.": "فرانكفورت تحترق خلفنا، وكذلك Sky Queen. أعطبت نيران المضادات فوق الهدف محرّكين، وطرحت الملازم دويل على أرضية قمرة القيادة وفي ساقه شظية فولاذية. لم تستطع المجموعة انتظارنا. نحن وحدنا، والوقود يوشك على النفاد، والشمس تغيب.",
    "Lieutenant Stern has plotted the shortest line home: across Belgium and out over the Channel past Dunkirk. Every fighter field in Flanders sits under that line. Sergeant Gallo is calling Air-Sea Rescue every five minutes, and the crew has thrown out everything that is not bolted down, except the guns.": "رسم الملازم ستيرن أقصر خط للعودة: عبر بلجيكا ثم فوق بحر المانش مرورًا بدنكيرك. وكل مطار للمقاتلات في الفلاندر يقع تحت هذا الخط. الرقيب غالو ينادي فرق الإنقاذ الجوي البحري كل خمس دقائق، وقد رمى الطاقم كل ما ليس مثبّتًا بالمسامير، ما عدا الرشاشات.",
    "The Germans love a straggler at dusk. They will come out of the dark side of the sky, low over the water where you cannot see them against the sea. Watch the east, and use every gun position, one through five.": "يعشق الألمان القاذفة المتخلّفة عند الغسق. سيأتون من الجانب المظلم من السماء، منخفضين فوق الماء حيث لا تميّزهم عن صفحة البحر. راقب الشرق، واستخدم كل مواقع الرشاشات، من 1 إلى 5.",
    "Fighter Command has promised an escort off the coast. Hold out until it gets here. Captain Brenner says this is the Sky Queen's thirteenth mission, and he is not putting an old lady in the Channel on her thirteenth.": "وعدت قيادة المقاتلات بمرافقة قبالة الساحل. اصمدوا حتى تصل. يقول النقيب برينر إن هذه هي المهمة الثالثة عشرة للقاذفة Sky Queen، وإنه لن يُغرق سيدة عجوزًا في المانش في مهمتها الثالثة عشرة.",

    // m11 Bomb Run
    "This is the last day of Big Week, and the target is the one the group paid for so dearly in August: the Messerschmitt works at Regensburg. Every Bf 109 that has come at you this week was built under that roof. Today we take the roof off.": "هذا آخر أيام الأسبوع الكبير، والهدف هو ذاك الذي دفعت المجموعة ثمنه غاليًا في أغسطس: مصانع مسرشميت في ريغنسبورغ. كل Bf 109 هاجمتك هذا الأسبوع بُنيت تحت ذلك السقف. واليوم سننزع السقف.",
    "The plant is ringed by heavy guns, and they will fire a box barrage straight up the bomb run. From the initial point to bombs away is four minutes of straight and level flying. No evasive action. The Sky Queen holds her place in the formation and takes it.": "يطوّق المصنعَ طوقٌ من المدافع الثقيلة، وستطلق وابلًا مربّعًا على امتداد مسار القصف. من نقطة البدء حتى إلقاء القنابل أربع دقائق من الطيران المستقيم المستوي. لا مناورات مراوغة. ستلزم Sky Queen مكانها في التشكيل وتتحمّل الضربات.",
    "Lieutenant Kessler has waited nineteen missions for a target like this. He spent the night with the target photographs and says he could find the assembly hall in his sleep. Your job is to keep the fighters off him until he does. You have the top turret, and they will come for the lead ships from above.": "انتظر الملازم كيسلر تسع عشرة مهمة من أجل هدف كهذا. أمضى الليل مع صور الهدف، ويقول إنه يستطيع إيجاد قاعة التجميع وهو نائم. مهمتك إبعاد المقاتلات عنه حتى يفعلها. أنت في البرج العلوي، وسيأتون لقاذفات القيادة من الأعلى.",
    "Sergeant Mendez has asked me to remind everyone that he does not like flak, and that he has been saying so since September. Noted, Sergeant. Bombs away is what this whole war is about. Make it count.": "طلب مني الرقيب منديز أن أذكّر الجميع بأنه لا يحب نيران المضادات، وأنه يردد ذلك منذ سبتمبر. أُخذ العلم أيها الرقيب. إلقاء القنابل هو جوهر هذه الحرب كلها. فلتكن ضربة لا تُنسى.",

    // m12 Maximum Effort
    "Gentlemen, this is a maximum effort. Big Week broke the back of the German fighter arm; today we finish the job. More than nine hundred heavy bombers are going after the aircraft plants at Oschersleben, Bernburg and Stettin, and the Luftwaffe will throw everything it has left at us.": "أيها السادة، هذه مهمة جهد أقصى. لقد قصم الأسبوع الكبير ظهر سلاح المقاتلات الألماني؛ واليوم نُتمّ المهمة. أكثر من تسعمئة قاذفة ثقيلة تستهدف مصانع الطائرات في أوشرسليبن وبرنبورغ وشتيتين، وسترمي اللوفتفافه علينا بكل ما تبقّى لديها.",
    "There are Mustangs all the way to the target now, so the Germans hit the bomber stream before the escort can join. Expect a heavy attack on the way in, flak over the target, and a last fight before the little friends arrive. Hold on until they get there.": "طائرات موستانغ ترافقنا الآن حتى الهدف، لذا يضرب الألمان رتل القاذفات قبل أن تنضم المرافقة. توقّعوا هجومًا عنيفًا في طريق الذهاب، ونيران مضادات فوق الهدف، ومعركة أخيرة قبل وصول الأصدقاء الصغار. اصمدوا حتى يصلوا.",
    "For the Sky Queen this is mission twenty-five. When she lands, her crew goes home. Lieutenant Doyle is back in the right-hand seat with a new limp and the same old jokes, and Sergeant Gallo has already painted the twenty-fifth bomb under the cockpit window. In pencil, he says, so it does not count as bad luck.": "هذه هي المهمة الخامسة والعشرون للقاذفة Sky Queen. حين تهبط، يعود طاقمها إلى الوطن. عاد الملازم دويل إلى المقعد الأيمن بعرجة جديدة والنكات القديمة نفسها، وقد رسم الرقيب غالو القنبلة الخامسة والعشرين تحت نافذة قمرة القيادة سلفًا. بقلم رصاص، كما يقول، كي لا تُحسب نذير شؤم.",
    "You are back on the left waist gun, where you started at Emden. Think of the crews who are not here today: the Lucky Lady over Schweinfurt, and the new boys who never finished their first week. Fly this one for them. Then come home, all of you.": "عدت إلى رشاش الجانب الأيسر، حيث بدأت في إمدن. تذكّر الأطقم الغائبة اليوم: طاقم «Lucky Lady» فوق شفاينفورت، والشبان الجدد الذين لم يُكملوا أسبوعهم الأول. حلّق في هذه المهمة من أجلهم. ثم عودوا إلى الديار، جميعكم.",

    // Survival and the game modes
    "Endless waves of fighters, growing stronger every time. How long can you hold out?": "موجات لا تنتهي من المقاتلات، تزداد قوة في كل مرة. إلى متى تستطيع الصمود؟",
    "Intelligence has placed a Jagdgeschwader of experten across our route — men with fifty, a hundred victories painted on their rudders.": "رصدت الاستخبارات ياغدغيشفادر من الطيارين الخبراء على امتداد مسارنا — رجال رُسمت على دفّات ذيولهم خمسون انتصارًا، بل مئة.",
    "They will not come in numbers. They will come in ones and twos, fast, from where you are not looking, and they will not miss. Every ace you bring down is worth a thousand points.": "لن يأتوا بأعداد كبيرة. سيأتون فرادى ومثنى، بسرعة، من حيث لا تنظر، ولن يخطئوا. كل آس تُسقطه يساوي ألف نقطة.",
    "Three minutes. As many as you can, as fast as you can. Every kill scores a hundred points times your combo — keep shooting to keep it up.": "ثلاث دقائق. أسقط أكبر عدد ممكن، بأسرع ما يمكن. كل إسقاط يساوي مئة نقطة مضروبة في مضاعِف السلسلة — واصل الرمي لتحافظ عليها.",

    // ---------------- Wave radio lines (Missions.ts) ----------------
    "Fighters coming up from the coast, nine o'clock low. Stay sharp.": "مقاتلات صاعدة من جهة الساحل، الساعة التاسعة من الأسفل. ابقوا متيقظين.",
    "More of them up ahead. Twelve o'clock — here they come.": "المزيد منهم في الأمام. الساعة الثانية عشرة — ها هم قادمون.",
    "More coming in on the left! Watch your nine!": "المزيد قادمون من اليسار! انتبه للساعة التاسعة!",
    "Last bunch before the target. Make them count!": "آخر دفعة قبل الهدف. اجعل كل طلقة تُصيب!",
    "Bandits! Twelve o'clock high, a whole Staffel of them!": "طائرات معادية! الساعة الثانية عشرة من الأعلى، سرب كامل منها!",
    "Fighters up high, coming out of the sun!": "مقاتلات في الأعلى، تنقضّ من جهة الشمس!",
    "Fighters, three o'clock level! Coming in from the right!": "مقاتلات، الساعة الثالثة على المستوى نفسه! قادمة من اليمين!",
    "We're through the flak. Here come the fighters again — watch the cripples.": "تجاوزنا نيران المضادات. المقاتلات تعود مجددًا — احموا القاذفات المعطوبة.",
    "Bandits twelve o'clock low, climbing for the bombers. Let's go get them.": "طائرات معادية، الساعة الثانية عشرة من الأسفل، تتسلق نحو القاذفات. هيا بنا إليهم.",
    "Little friends, little friends, we have bandits at our six o'clock!": "أيها الأصدقاء الصغار، أيها الأصدقاء الصغار، لدينا طائرات معادية عند الساعة السادسة!",
    "Fighters assembling behind us, six o'clock level. Lots of them.": "مقاتلات تتجمع خلفنا، الساعة السادسة على المستوى نفسه. أعداد كبيرة.",
    "Here comes the whole gaggle! Tail, they're all yours!": "ها هو السرب كله قادم! أيها الذيل، إنهم لك جميعًا!",
    "Another Staffel forming up astern!": "سرب آخر يتشكّل خلفنا!",
    "Two fighters closing from six o'clock. They've spotted us.": "مقاتلتان تقتربان من الساعة السادسة. لقد رصدونا.",
    "Escort reports sixty seconds out. Hang on!": "المرافقة تبلغ أنها على بُعد ستين ثانية. اصمدوا!",
    "Here they come. Big gaggle at twelve o'clock — drop tanks and go!": "ها هم قادمون. سرب ضخم عند الساعة الثانية عشرة — أسقطوا الخزانات الإضافية وانطلقوا!",
    "More bandits! They're everywhere!": "المزيد من الطائرات المعادية! إنهم في كل مكان!",
    "Here they come. Looks like the whole Luftwaffe is up today!": "ها هم قادمون. يبدو أن اللوفتفافه كلها في الجو اليوم!",
    "Bandits climbing out of the murk, twelve o'clock low. Blue flight, stay with me!": "طائرات معادية تخرج من العتمة، الساعة الثانية عشرة من الأسفل. السرب الأزرق، ابقوا معي!",
    "Fighters low on the water, six o'clock. They followed us out.": "مقاتلات منخفضة فوق الماء، الساعة السادسة. لقد لحقوا بنا.",
    "Bandits up high, going for the lead ships. Keep them off me till we're on the bomb run!": "طائرات معادية في الأعلى، تتجه نحو قاذفات القيادة. أبعدوهم عني حتى ندخل مسار القصف!",
    "Pilot to crew, one more time. Fighters, twelve o'clock high, a lot of them!": "من الطيار إلى الطاقم، مرة أخيرة. مقاتلات، الساعة الثانية عشرة من الأعلى، أعداد كبيرة!",
    // speakers used by the wave radio lines (also in the radio table)
    "Navigator": "الملاح",
    "Pilot": "الطيار",
    "Waist": "الجانب",
    "Bombardier": "مُلقي القنابل",
    "Tail": "الذيل",
    "Ball Turret": "البرج الكروي",
    "Lead": "القائد",
    "Big Friend": "الصديق الكبير",
    "Radio": "اللاسلكي",

    // ---------------- Pacing.ts: banners, tips, callouts ----------------
    "A lull in the attack — reload and cool the guns": "هدوء في الهجوم — أعد التلقيم وبرّد الرشاشات",
    "A lull in the attack — climb back above the bombers": "هدوء في الهجوم — عُد وتسلّق فوق القاذفات",
    "FINAL WAVE": "الموجة الأخيرة",
    "WAVE BEATEN": "صُدّت الموجة",
    "Here comes the whole Luftwaffe! Blue flight, break them up before they reach the bombers!": "ها هي اللوفتفافه كلها قادمة! السرب الأزرق، فرّقوهم قبل أن يبلغوا القاذفات!",
    "Here comes the whole Luftwaffe! Every gun, pick a target!": "ها هي اللوفتفافه كلها قادمة! كل الرشاشات، اختاروا أهدافكم!",
    "That's the lot of them! They're breaking off!": "هذا آخرهم! إنهم ينسحبون!",

    // ---------------- Modes.ts ----------------
    "Survival": "البقاء",
    "Ace Hunt": "صيد الآسات",
    "Time Attack": "سباق الزمن",
    "Endless rounds of fighters, each one larger and more aggressive than the last, with a final wave to close every round. Bombers lost are not replaced.": "جولات لا تنتهي من المقاتلات، كل جولة أكبر وأشرس من سابقتها، وتُختتم كل جولة بموجة أخيرة. القاذفات التي تُفقد لا تُعوَّض.",
    "Only the elite: Jagdgeschwader aces, heavy destroyers and jets. Fewer of them, all of them deadly. Three rounds — scored by the aces you bring down (1000 each).": "النخبة فقط: آسات الياغدغيشفادر، والمدمّرات الثقيلة، والطائرات النفاثة. أعداد أقل، وكلها فتّاكة. ثلاث جولات — تُحتسب النقاط بالآسات التي تُسقطها (1000 لكل آس).",
    "Three minutes on the clock and fighters streaming in without a pause. Every kill scores 100 × your combo multiplier — keep the combo alive.": "ثلاث دقائق على العدّاد، والمقاتلات تتدفق بلا توقف. كل إسقاط يمنحك 100 × مضاعِف السلسلة — حافظ على السلسلة حيّة.",
    "B-17 Gunner": "رامي B-17",
    "P-51 Escort": "مرافقة P-51",
    "ONLINE TOP 10 — {mode} · B-17 GUNNER": "أفضل 10 عبر الإنترنت — {mode} · رامي B-17",
    "ONLINE TOP 10 — {mode} · P-51 ESCORT": "أفضل 10 عبر الإنترنت — {mode} · مرافقة P-51",
    "ONE MINUTE": "دقيقة واحدة",
    "30 SECONDS": "30 ثانية",
    "10 SECONDS": "10 ثوانٍ",
    "That one's an ace — kill markings all down the tail. Watch him!": "تلك يقودها آس — علامات الإسقاط تملأ ذيلها. احذروه!",

    // ---------------- BriefingExtras.ts ----------------
    "MISSION": "المهمة",
    "OF {total}": "من {total}",
    "MISSION No. {n} OF {total}": "المهمة رقم {n} من {total}",
    " · FINAL MISSION": " · المهمة الأخيرة",
    "Weather: {w}": "الطقس: {w}",
    "Fair": "صحو",
    "Dusk": "غسق",
    "Overcast": "غائم كليًا",
    "Storm front": "جبهة عاصفة",
    "Storm front ahead": "جبهة عاصفة في الطريق",
    "Clearing later": "ينقشع لاحقاً",
    "Changing": "متقلّب",
    "Clearing": "انقشاع",
    "Low winter sun": "شمس شتوية منخفضة",
    "Clear": "صافٍ",
    "Broken cloud": "غيوم متقطعة",
    "{n} rounds": "{n} جولات",
    "Endless rounds": "جولات لا تنتهي",
    "Two engines out": "محرّكان معطّلان",
    "Heavy flak": "مضادات كثيفة",
    "Flak": "نيران المضادات",
    "Bomb run": "مسار القصف",
    "Escort due {t}": "المرافقة عند {t}",
    "{n} Mustangs": "{n} طائرات موستانغ",
    "Play briefing": "تشغيل الإيجاز",
    "Stop": "إيقاف",
    "Read by the group intelligence officer": "يقرؤه ضابط استخبارات المجموعة",
    "Intelligence officer…": "ضابط الاستخبارات…",
    "Paragraph {i} of {n}": "الفقرة {i} من {n}",
    "Briefing complete": "اكتمل الإيجاز",

    // ---------------- BriefingMap.ts ----------------
    "ENGLAND": "إنجلترا",
    "NORTH SEA": "بحر الشمال",
    "HOLLAND": "هولندا",
    "BELGIUM": "بلجيكا",
    "FRANCE": "فرنسا",
    "GERMANY": "ألمانيا",
    "DENMARK": "الدنمارك",
    "DEENETHORPE": "دينيثورب",
    "RETURN ROUTE": "مسار العودة",
    "FLAK": "المضادات",
    "{n} MI": "{n} ميل",
    "Route chart to {p}": "خريطة المسار إلى {p}",
    "EMDEN": "إمدن",
    "BREMEN": "بريمن",
    "LUDWIGSHAFEN": "لودفيغسهافن",
    "LEIPZIG": "لايبزيغ",
    "SCHWEINFURT": "شفاينفورت",
    "BERLIN": "برلين",
    "NETHERLANDS": "هولندا",
    "KIEL": "كيل",
    "REGENSBURG": "ريغنسبورغ",
    "OSCHERSLEBEN": "أوشرسليبن",
    "CHANNEL": "بحر المانش",
    "Emden": "إمدن",
    "Bremen": "بريمن",
    "Ludwigshafen": "لودفيغسهافن",
    "Leipzig": "لايبزيغ",
    "Schweinfurt": "شفاينفورت",
    "Berlin": "برلين",
    "Netherlands": "هولندا",
    "Kiel": "كيل",
    "Regensburg": "ريغنسبورغ",
    "Oschersleben": "أوشرسليبن",
    "Channel": "بحر المانش",
    "Route in red": "المسار باللون الأحمر",
    ", homeward leg": "، رحلة العودة",
    " · hatched: flak zone": " · المنطقة المظللة: نيران المضادات",
    " · scale in statute miles": " · المقياس بالأميال البرية",
  },
  patterns: [
    // Missions.ts rewrites the loss limit at load time (+3 for the round-based campaign)
    [/^Lose no more than (\d+) bombers$/, (m) => `ألّا نخسر أكثر من ${bombers(m[1])}`],
    // any "D Month YYYY" date
    [/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, (m) => `${m[1]} ${MONTHS[m[2]]} ${m[3]}`],
    // Pacing.ts: FINAL WAVE / WAVE BEATEN banner sub-lines
    [/^(\d+) elite fighters — the aces are coming$/, (m) => `${fighters(m[1])} من النخبة — الآسات قادمون`],
    [/^(\d+) fighters — here comes the whole Luftwaffe!$/, (m) => `${fighters(m[1])} — اللوفتفافه كلها قادمة!`],
    [/^(\d+) fighters inbound from (\d+) directions$/, (m) => `${fighters(m[1])} قادمة من ${m[2] === '2' ? 'اتجاهين' : `${m[2]} اتجاهات`}`],
    [/^The sky is clear · \+(\d+)$/, 'السماء صافية · +$1'],
    // Modes.ts: Time Attack banner sub-line and debrief line, Ace Hunt debrief line, ace kill feed
    [/^(\d+) kills · (-?\d+) points$/, 'الإسقاطات: $1 · النقاط: $2'],
    [/^Time! (\d+) kills in three minutes, best combo ×([\d.]+)\.$/, 'انتهى الوقت! الإسقاطات: $1 في ثلاث دقائق، وأفضل سلسلة ×$2.'],
    [/^(\d+) aces? downed and (-?\d+) more of the Jagdgeschwader with them\. The experten will remember this formation\.$/,
      'الآسات المُسقطة: $1، ومعهم $2 آخرون من الياغدغيشفادر. لن ينسى الخبراء هذا التشكيل.'],
    [/^ACE DOWN — (.+) · \+1000$/, (m, tr) => `سقط الآس — ${tr(m[1])} · +1000`],
    // Ace Hunt: a named ace's label, "Hptm. Krüger (Fw 190)", and the bare name
    [new RegExp(`^${ACE_RE} \\((.+)\\)$`), (m, tr) => `${RANKS[m[1]]} ${ACES[m[2]]} (${tr(m[3])})`],
    [new RegExp(`^${ACE_RE}$`), (m) => `${RANKS[m[1]]} ${ACES[m[2]]}`],
  ],
};
export default table;
