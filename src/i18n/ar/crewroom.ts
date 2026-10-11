import type { PhraseTable } from '../types';

// Arabic for the crew-room interludes (game/CrewRoom.ts, ui/CrewRoomScene.ts): the captions, the
// scene's controls, the names the crew uses for each other, and every line of the twelve
// vignettes and of the outcome block. Voices stay English; only the subtitles are translated.

const table: PhraseTable = {
  phrases: {
    // captions and controls
    'Deenethorpe · Hut 14': 'دينيثورب · الكوخ 14',
    'Deenethorpe · The Club': 'دينيثورب · النادي',
    'RAF Manston · Transit hut': 'قاعدة مانستون الجوية الملكية · كوخ العبور',
    'Night': 'ليلاً',
    'Evening': 'مساءً',
    'Crew room': 'استراحة الطاقم',
    'Space · next line': 'المسافة · السطر التالي',
    'Tap · next line': 'انقر · السطر التالي',
    'Esc · skip': 'Esc · تخطٍّ',
    'Skip scene': 'تخطّي المشهد',
    'Tour complete': 'اكتملت الجولة',

    // how the crew speaks of each other ({name} in the hospital lines)
    'the Skipper': 'الربّان',
    'Lieutenant Doyle': 'الملازم دويل',
    'Lieutenant Stern': 'الملازم ستيرن',
    'Lieutenant Kessler': 'الملازم كيسلر',

    // m1 · Baptism of Fire
    "Well, that's one. First thing tomorrow I'm painting a bomb under the window.": 'حسنًا، هذه واحدة. أول ما سأفعله غدًا أن أرسم قنبلة تحت النافذة.',
    'I counted forty-one holes in her. Forty-one, and not one of them in us.': 'عددتُ فيها واحدًا وأربعين ثقبًا. واحد وأربعون، وليس واحد منها فينا.',
    'Emden on the first try. I said I would.': 'إمدن من المحاولة الأولى. قلت لكم إنني سأفعلها.',
    'Told you. Nobody can find me down in that ball.': 'ألم أقل لكم؟ لا أحد يستطيع أن يجدني هناك في البرج الكروي.',
    'Nobody wants to, Shorty.': 'ولا أحد يرغب في ذلك أصلًا يا قصير.',
    "My hands didn't stop shaking till we crossed the English coast. Is that normal?": 'لم تتوقف يداي عن الارتجاف حتى عبرنا الساحل الإنجليزي. هل هذا طبيعي؟',
    "It's normal. Mine haven't stopped yet.": 'طبيعي. يداي لم تتوقفا بعد.',
    'Get some sleep, all of you. One down. Twenty-four to go.': 'ناموا قليلًا، جميعكم. انقضت واحدة، وبقيت أربع وعشرون.',

    // m2 · Twelve O'Clock High
    'They came straight at the nose. All I could see was the propeller hub and the guns winking at me.': 'جاؤوا مباشرة نحو المقدّمة. كل ما رأيته محور المروحة والرشاشات تومض في وجهي.',
    'That top turret earned its keep today. Twin fifties, and somebody who knew what to do with them.': 'البرج العلوي استحق مكانه اليوم. رشاشان من عيار خمسين، ومن يعرف ماذا يفعل بهما.',
    "Lieutenant, you've been humming the same four bars since we landed.": 'حضرة الملازم، ما زلت تدندن المقاطع الأربعة نفسها منذ هبطنا.',
    "It helps. Don't ask me why. It helps.": 'إنها تساعد. لا تسألني لماذا. إنها تساعد.',
    "Two down. I'm keeping the tally in the back of my navigation log.": 'اثنتان. أدوّن العدد في آخر سجل الملاحة.',
    "Fog's coming in. Maybe they'll stand us down tomorrow.": 'الضباب يزحف. ربما يعفوننا من الطيران غدًا.',
    'Maybe. Sleep while you can.': 'ربما. ناموا ما دمتم تستطيعون.',

    // m8 · Black Thursday
    "They came for the Lucky Lady's things an hour ago. Folded the blankets. Took the photographs off the wall.": 'جاؤوا قبل ساعة لأخذ أغراض طاقم «Lucky Lady». طووا البطانيات، وأنزلوا الصور عن الجدار.',
    "Their tail gunner owed me two dollars. I'd give anything for him to walk in here and not pay it.": 'رامي الذيل عندهم كان مدينًا لي بدولارين. أعطي أي شيء ليدخل من هذا الباب ولا يدفعهما.',
    'Sixty Fortresses. Six hundred men. I keep doing the arithmetic, and it keeps coming out the same.': 'ستون قلعة. ستمئة رجل. أعيد الحساب مرة بعد مرة، والنتيجة لا تتغير.',
    "From the ball I could see the chutes. I tried to count them. I couldn't keep up.": 'من البرج الكروي كنت أرى المظلات. حاولت أن أعدّها. لم أستطع اللحاق بها.',
    "I lit a candle for them in the chapel. I didn't know what else to do.": 'أشعلت لهم شمعة في الكنيسة الصغيرة. لم أعرف ماذا أفعل غير ذلك.',
    "Still got the rabbit's foot. I don't know if that makes me lucky, or them not.": 'ما زالت قدم الأرنب معي. لا أدري إن كان هذا يجعلني محظوظًا، أم يجعلهم غير محظوظين.',
    "We came home. Tomorrow we'll think about why. Tonight, try to sleep.": 'عدنا إلى الديار. غدًا نفكر في السبب. الليلة، حاولوا أن تناموا.',

    // m9 · Into the Front
    "There he is. The Mustang that stayed with us all the way to Kiel. Sit down, sir. Dinner's on me.": 'ها هو. طيار الموستانغ الذي بقي معنا حتى كيل. اجلس يا سيدي. العشاء على حسابي.',
    'For a month, Hawkeye. You said a month. The whole ship heard you on the interphone.': 'لشهر كامل يا عين الصقر. قلت شهرًا. سمعك كل من في الطائرة على الهاتف الداخلي.',
    'I know what I said. Worth every penny.': 'أعرف ما قلته. ويستحق كل قرش.',
    "We couldn't see our own wingtips in that front. When the Germans came through the gaps, you were already there.": 'لم نكن نرى أطراف أجنحتنا في تلك الجبهة. وحين تسلّل الألمان من الفجوات، كنت هناك قبلهم.',
    "The first time anyone's gone all the way with us. It changes the arithmetic.": 'أول مرة يرافقنا أحد طوال الطريق. هذا يغيّر الحساب.',
    'To the little friends.': 'نخب الأصدقاء الصغار.',
    'To the little friends. May they never run short of fuel.': 'نخب الأصدقاء الصغار. عسى ألا ينفد وقودهم أبدًا.',
    "Same time tomorrow, sir? I'll bring my wallet.": 'الموعد نفسه غدًا يا سيدي؟ سأحضر محفظتي.',

    // m3 · Flak Alley
    "Two hundred guns down there, and I still put the bombs right on the aiming point. I've never seen flak like it.": 'مئتا مدفع هناك في الأسفل، ومع ذلك وضعت القنابل على نقطة التصويب تمامًا. لم أرَ نيرانًا مضادة كهذه قط.',
    'Merry Christmas, Ray. Five days late.': 'عيد ميلاد مجيد يا راي. متأخرًا خمسة أيام.',
    "Every gun had its Saint Christopher today, and every one of us came home. I'm not saying it's the medals. I'm not saying it isn't.": 'كان لكل رشاش قدّيسه كريستوفر اليوم، وعاد كل واحد منا. لا أقول إنها الميداليات. ولا أقول إنها ليست هي.',
    "On Christmas Eve I kept thinking about the Lucky Lady's boys. They'd have liked the snow.": 'ليلة عيد الميلاد ظللت أفكر في شباب «Lucky Lady». كان الثلج سيعجبهم.',
    'Tomorrow is the last day of the year. Nineteen forty-four, gentlemen.': 'غدًا آخر يوم في السنة. ألف وتسعمئة وأربعة وأربعون، أيها السادة.',
    'Next Christmas at home. Everybody say it.': 'عيد الميلاد القادم في الديار. قولوها جميعًا.',
    'Next Christmas at home.': 'عيد الميلاد القادم في الديار.',

    // m10 · Last Light
    "I kissed that runway, and I'd do it again. The RAF boys think I've gone flak happy.": 'قبّلت ذلك المدرج، وسأفعلها ثانية. شباب سلاح الجو الملكي يظنون أن النيران المضادة أفقدتني صوابي.',
    "They took Frank to the hospital. The surgeon says he'll keep the leg.": 'نقلوا فرانك إلى المستشفى. يقول الجرّاح إنه لن يفقد ساقه.',
    "I told you. I wasn't putting an old lady in the Channel on her thirteenth.": 'قلت لكم. لم أكن لأُغرق سيدة عجوزًا في القنال في مهمتها الثالثة عشرة.',
    'When the Spitfires showed up off the coast, I could have cried. Maybe I did.': 'حين ظهرت طائرات السبيتفاير قبالة الساحل، كدت أبكي. ربما بكيت فعلًا.',
    'Somebody write to Frank tonight. Tell him the old lady made it.': 'ليكتب أحدكم إلى فرانك الليلة. أخبروه أن السيدة العجوز نجت.',
    "I'll write it. I'll make it long. He hates long letters.": 'سأكتبها أنا. وسأطيلها. إنه يكره الرسائل الطويلة.',
    'Lights out. We fly home in the morning.': 'أطفئوا الأنوار. نطير إلى قاعدتنا في الصباح.',

    // m4 · Little Friends
    "Leipzig and back, and not one of them got through to us. I said there was a steak in it, didn't I?": 'إلى لايبزيغ والعودة، ولم يصل إلينا واحد منهم. ألم أقل إن هناك شريحة لحم بانتظار من يفعلها؟',
    "He's been saving his coupons for a week. Don't ask him where he found a steak in England.": 'ظل يدّخر قسائم التموين أسبوعًا. لا تسأله أين وجد شريحة لحم في إنجلترا.',
    "Big Week, they're calling it. The whole Eighth went out today, all of us after the aircraft factories.": 'يسمّونه «الأسبوع الكبير». خرج سلاح الجو الثامن بأكمله اليوم، وكلنا نطارد مصانع الطائرات.',
    'When that Fortress fell out of formation, I thought she was finished. Then you came down on the wolves.': 'حين خرجت تلك القلعة من التشكيل، ظننت أنها انتهت. ثم انقضضت على الذئاب.',
    'Frank wrote from the hospital. He says the nurses are lovely and the food is a crime.': 'كتب فرانك من المستشفى. يقول إن الممرضات لطيفات والطعام جريمة.',
    "There's a rumour we're going back to Schweinfurt. Nobody say it out loud.": 'تسري شائعة أننا عائدون إلى شفاينفورت. لا يقلها أحد بصوت عالٍ.',
    'Eat your steak, sir. You earned it.': 'كُل شريحتك يا سيدي. لقد استحققتها.',

    // m5 · Sturmgruppe
    'Schweinfurt. There, I said it. Somebody had to.': 'شفاينفورت. ها قد قلتها. كان لا بد أن يقولها أحد.',
    "A hundred yards. I could see the rounds sparking off their windscreens, and they still didn't break.": 'مئة ياردة. كنت أرى الطلقات تتطاير شررًا عن زجاجهم الأمامي، ومع ذلك لم ينعطفوا.',
    "I've got my piece of Frankfurt on my key ring. It came up through the floor and found my leg. I'm keeping it.": 'قطعتي من فرانكفورت معلّقة في حلقة مفاتيحي. اخترقت الأرضية ووجدت ساقي. سأحتفظ بها.',
    "Sixty ships stayed behind the last time. Today we brought ours home. That's enough for me.": 'في المرة الماضية بقيت ستون طائرة هناك. اليوم أعدنا طائرتنا. هذا يكفيني.',
    "Nineteen missions. Six to go. I don't like saying the number out loud either.": 'تسع عشرة مهمة. بقيت ست. أنا أيضًا لا أحب أن أقول الرقم بصوت عالٍ.',
    "Same socks tomorrow. Don't anybody say a word.": 'الجوارب نفسها غدًا. لا ينطق أحد بكلمة.',
    'Long day tomorrow. Lights out in ten minutes.': 'غدًا يوم طويل. نطفئ الأنوار بعد عشر دقائق.',

    // m11 · Bomb Run
    "Right on the aiming point. I've seen the photographs. The assembly hall is gone.": 'على نقطة التصويب تمامًا. رأيت الصور. قاعة التجميع اختفت.',
    "He's shown everybody the photographs. Twice. He showed the barman.": 'أرى الصور للجميع. مرتين. حتى إنه أراها للساقي.',
    "I waited nineteen missions for that target. I'm entitled.": 'انتظرت هذا الهدف تسع عشرة مهمة. هذا من حقي.',
    "Four minutes straight and level through that flak. I said it in September and I'll say it now. I do not like flak.": 'أربع دقائق في خط مستقيم ومستوٍ وسط تلك النيران. قلتها في سبتمبر وأقولها الآن: لا أحب النيران المضادة.',
    'Noted, Sergeant.': 'سُجّلت ملاحظتك أيها الرقيب.',
    "Every Messerschmitt they don't build is one that won't be waiting for the next crew. Remember that.": 'كل مسرشميت لا يصنعونها هي طائرة لن تكون بانتظار الطاقم التالي. تذكّروا ذلك.',
    'Buy the man a drink. Even if he is insufferable.': 'اشتروا للرجل شرابًا. حتى لو كان لا يُطاق.',
    "I'll take it.": 'سأقبله.',

    // m6 · The Long Way Home
    'Two engines, all the way across Holland. I listened to every cylinder the whole way home.': 'بمحركين، عبر هولندا كلها. أصغيت إلى كل أسطوانة طوال طريق العودة.',
    'Twenty-two missions, and she carried us home again.': 'اثنتان وعشرون مهمة، وحملتنا إلى الديار مرة أخرى.',
    "When the Mustangs came over the horizon, Price started laughing and couldn't stop.": 'حين ظهرت الموستانغ فوق الأفق، بدأ برايس يضحك ولم يستطع التوقف.',
    "Wasn't laughing. Something in my eye.": 'لم أكن أضحك. دخل شيء في عيني.',
    "The ground crew has been out there since we landed. In the rain, with lamps. They say she'll be ready by Wednesday.": 'الطاقم الأرضي هناك منذ هبطنا. تحت المطر، بالمصابيح. يقولون إنها ستكون جاهزة يوم الأربعاء.',
    "Somebody take those boys a thermos of coffee. They've earned it more than we have.": 'ليأخذ أحدكم لأولئك الشباب ترمس قهوة. يستحقونه أكثر منا.',
    "I'll go. I owe them.": 'سأذهب أنا. أنا مدين لهم.',
    'We all do.': 'كلنا مدينون لهم.',

    // m7 · Big Week
    'Berlin. We went to Berlin and back, and the Mustangs never left us.': 'برلين. ذهبنا إلى برلين وعدنا، ولم تفارقنا الموستانغ لحظة.',
    "I saw a Fortress with a crown on her nose get a lot of extra cover today. Somebody told you, didn't they?": 'رأيت اليوم قلعة على مقدّمتها تاج تحظى بحماية إضافية كثيرة. أحدهم أخبرك، أليس كذلك؟',
    "I painted that crown. I'm taking the credit for the whole escort.": 'أنا رسمت ذلك التاج. سأنسب فضل المرافقة كلها إلى نفسي.',
    "They say the Luftwaffe lost more today than it can replace. You could feel it. They didn't press like they used to.": 'يقولون إن اللوفتفافه خسرت اليوم أكثر مما تستطيع تعويضه. كان يمكنك أن تشعر بذلك. لم يضغطوا كما اعتادوا.',
    "The ground crew put her back together in two days. She flew today with every man who wouldn't leave her.": 'أعاد الطاقم الأرضي تجميعها في يومين. وطارت اليوم بكل رجل رفض أن يتركها.',
    "I've stopped pretending I don't count the missions. We're close now.": 'كففت عن التظاهر بأنني لا أعدّ المهمات. اقتربنا الآن.',
    'To the little friends. Again.': 'نخب الأصدقاء الصغار. مرة أخرى.',
    'And put it on my tab.': 'وسجّلوه على حسابي.',

    // m12 · Maximum Effort: the end of the tour
    "I rubbed out the pencil. It's in paint now. Twenty-five bombs under the window.": 'مسحت خطوط القلم. صارت بالطلاء الآن. خمس وعشرون قنبلة تحت النافذة.',
    'In paint. Now it counts.': 'بالطلاء. الآن تُحتسب.',
    'I went out to her after we landed and put my hand on number three engine. Still warm. I said thank you.': 'خرجت إليها بعد الهبوط ووضعت يدي على المحرك رقم ثلاثة. كان لا يزال دافئًا. قلت له شكرًا.',
    "I'm going to miss the ball. Don't tell anybody I said that.": 'سأشتاق إلى البرج الكروي. لا تخبروا أحدًا أنني قلت هذا.',
    "I'm burning these socks. Out behind the hut, a proper funeral.": 'سأحرق هذه الجوارب. خلف الكوخ، في جنازة لائقة.',
    "Twenty-five missions. I've worked it out a dozen ways, and it never adds up to why we came home and the others didn't.": 'خمس وعشرون مهمة. حسبتها بعشرات الطرق، ولا يخرج الحساب أبدًا بجواب: لماذا عدنا ولم يعد الآخرون.',
    "I want to say something about the Lucky Lady's boys. And the new crews who never finished their first week.": 'أريد أن أقول شيئًا عن شباب «Lucky Lady». وعن الطواقم الجديدة التي لم تُكمل أسبوعها الأول.',
    'We knew some of their names. Not all of them. We carry them home anyway.': 'عرفنا أسماء بعضهم. لا كلهم. سنحملهم معنا إلى الديار على أي حال.',
    'Twenty-five missions and never a scratch. I think about that more than I should.': 'خمس وعشرون مهمة ولا خدش واحد. أفكر في ذلك أكثر مما ينبغي.',
    "First thing, I'm going to stand in the middle of the cornfield and look at the sky. Just look at it.": 'أول ما سأفعله أن أقف وسط حقل الذرة وأنظر إلى السماء. أنظر إليها فقط.',
    "The ranch will still be there. Cattle don't know there was a war.": 'المزرعة ستبقى هناك. الماشية لا تعرف أن حربًا قامت.',
    "Brooklyn. My mother's going to cook for three days, and I'm going to let her.": 'بروكلين. ستطبخ أمي ثلاثة أيام، وسأتركها تفعل.',
    "Boston. I'm singing at my sister's wedding, and this time I'll know all the words.": 'بوسطن. سأغني في عرس أختي، وهذه المرة سأحفظ الكلمات كلها.',
    'Philadelphia. A classroom full of kids who think arithmetic is boring. God bless every one of them.': 'فيلادلفيا. صف مليء بأطفال يظنون أن الحساب مملّ. بارك الله في كل واحد منهم.',
    "San Antonio. I'm going to fix my father's truck, and nobody is going to shoot at me while I do it.": 'سان أنطونيو. سأصلح شاحنة أبي، ولن يطلق أحد النار عليّ وأنا أفعل.',
    "I'm going to sleep for a week. Then I'll think about it.": 'سأنام أسبوعًا كاملًا. ثم أفكر في الأمر.',
    'Kansas. Low and slow over the wheat, and nobody shooting.': 'كانساس. على ارتفاع منخفض وببطء فوق القمح، ولا أحد يطلق النار.',
    'It was an honour to fly with every one of you. Thank you.': 'كان شرفًا لي أن أطير مع كل واحد منكم. شكرًا لكم.',
    'Somebody wind up the gramophone.': 'ليُدِر أحدكم الحاكي.',
    "Twenty-five. Let's go home.": 'خمس وعشرون. لنعد إلى الديار.',

    // the outcome block: wounds
    "Doc says {name} will be in the hospital a week or two. I'll take him his mail.": 'يقول الطبيب إن {name} سيبقى في المستشفى أسبوعًا أو اثنين. سأحمل إليه بريده.',
    '{name} is in the next bed over. He asked us to keep his place by the stove.': '{name} في السرير المجاور. طلب منا أن نحفظ له مكانه قرب المدفأة.',
    "We'll go over and see him in the morning.": 'سنذهب لزيارته في الصباح.',
    "We'll go over and see them both in the morning.": 'سنذهب لزيارتهما في الصباح.',
    'How are you holding up, {nick}?': 'كيف حالك، {nick}؟',
    "Doc put a few stitches in it. I'll be flying the next one.": 'خاطها الطبيب ببضع غرز. سأطير في المهمة القادمة.',
    // losses
    'Every ship in the group came home today. I counted them twice.': 'عادت كل طائرات المجموعة اليوم. عددتها مرتين.',
    "One ship didn't come back today. Ten men.": 'طائرة واحدة لم تعد اليوم. عشرة رجال.',
    'Two ships went down today. Twenty men.': 'سقطت طائرتان اليوم. عشرون رجلًا.',
    "{n} ships didn't come back today. I wrote down every name I knew.": '{n} طائرات لم تعد اليوم. دوّنت كل اسم كنت أعرفه.',
    'They came for the bunks across the aisle an hour ago. Folded the blankets. Took the photographs down.': 'جاؤوا قبل ساعة لإخلاء الأسرّة على الجانب الآخر من الممر. طووا البطانيات، وأنزلوا الصور.',
    'Nobody sleeps in those bunks tonight. Leave them be.': 'لا ينام أحد في تلك الأسرّة الليلة. اتركوها كما هي.',
    // the Experten
    "{ace} won't be back. I watched him go down.": '{ace} لن يعود. رأيته يسقط.',
    "{ace} got away from us again. He'll be back.": 'أفلت {ace} منا مرة أخرى. سيعود.',
    "That was your shooting. Don't go looking for a parade. There was a man in that cockpit, too.": 'كانت تلك رمايتك. لا تنتظر استعراضًا احتفاليًا. كان في تلك القمرة رجل أيضًا.',
    // the strategic picture
    'Intelligence says the Luftwaffe is running short of pilots. You can see it. The new ones break off early.': 'تقول الاستخبارات إن اللوفتفافه تعاني نقصًا في الطيارين. وهذا ظاهر. الجدد منهم ينسحبون مبكرًا.',
    "Intelligence says they're stronger than they were a month ago. More of them every time we go.": 'تقول الاستخبارات إنهم أقوى مما كانوا قبل شهر. يزداد عددهم في كل مرة نخرج.',
    'Then we fly a tighter formation.': 'إذن نطير بتشكيل أكثر تماسكًا.',
    'Intelligence calls it even. They lose fighters, they build more. So do we.': 'تقول الاستخبارات إن الكفّتين متعادلتان. يخسرون مقاتلات فيصنعون غيرها. ونحن كذلك.',
    // the player's day
    "Didn't get one today? Don't let it eat at you. Every burst you fired kept one of them off us.": 'لم تُسقط واحدة اليوم؟ لا تدع ذلك ينهشك. كل رشقة أطلقتها أبعدت واحدًا منهم عنا.',
    'You got one today. Some fellows fly ten missions and never see one fall.': 'أسقطت واحدة اليوم. بعض الرجال يطيرون عشر مهمات ولا يرون واحدة تسقط.',
    "The low squadron saw you knock them down, one after another. They're asking who was on that gun.": 'رآك السرب المنخفض تُسقطهم واحدًا تلو الآخر. يسألون من كان على ذلك الرشاش.',
    "Five or more in one day. They're putting your name in for the Cross, and I'm telling everybody I know you.": 'خمس أو أكثر في يوم واحد. سيرشحونك لصليب الطيران، وأنا أخبر الجميع أنني أعرفك.',
    'I checked the claims board. {kills} confirmed, and you hit with {acc} percent of your rounds.': 'راجعت لوحة الإسقاطات: {kills} مؤكدة، وأصابت {acc} بالمئة من طلقاتك.',
    "You shoot like a man who's paying for his own shells.": 'ترمي كرجل يدفع ثمن ذخيرته من جيبه.',
    'The armourers say you nearly burned out a barrel. Short bursts. Let the gun cool between them.': 'يقول عمال الذخيرة إنك كدت تحرق سبطانة. رشقات قصيرة. دع الرشاش يبرد بينها.',
    "You didn't get one? Doesn't matter. Every time one of them saw you coming, he broke off.": 'لم تُسقط أحدًا؟ لا يهم. في كل مرة رآك أحدهم قادمًا، انسحب.',
    'I watched you from the tail. You came down on them like a hawk on a chicken run.': 'راقبتك من الذيل. انقضضت عليهم كالصقر على حظيرة دجاج.',
    'Five or more, the way Dawson tells it. Somebody paint a row of crosses under that canopy.': 'خمس أو أكثر، كما يرويها داوسون. ليرسم أحدكم صفًّا من الصلبان تحت تلك القمرة.',
    'By my count you got {kills} of them, and every one was heading for a bomber.': 'بحسب عدّي أسقطت {kills} منهم، وكان كل واحد متجهًا نحو قاذفة.',
    // a replacement, the tour
    "{rookie} flew in {who}'s place today. Not bad for a first mission.": 'طار {rookie} مكان {who} اليوم. ليس سيئًا لمهمة أولى.',
    "Over the whole tour, we claimed {kills} fighters. The group lost {lost} Fortresses. I'll remember the second number longer.": 'على امتداد الجولة كلها، أسقطنا {kills} مقاتلة. وخسرت المجموعة {lost} قلعة. سأتذكر الرقم الثاني أطول.',
  },
};

export default table;
