import type { PhraseTable } from '../types';

// Arabic for the museum and codex (Phase 11 goal 30): game/Museum.ts (history, crew positions,
// facts), game/Codex.ts (crew roles, medals, operations), the P-47 and Spitfire spec cards
// (game/AircraftData.ts) and the new texts of ui/GalleryScreen.ts and ui/CodexPanel.ts.
// Aircraft and weapon designations stay Latin.

const table: PhraseTable = {
  phrases: {
    // ---------- screen ----------
    'Museum and codex': 'المتحف والموسوعة',
    'Museum': 'المتحف',
    'Codex': 'الموسوعة',
    'Specs': 'المواصفات',
    'History': 'التاريخ',
    'Facts': 'حقائق',
    'Positions on board: {n}': 'المواقع على متنها: {n}',
    'Facts found: {n} / {total}': 'الحقائق المكتشفة: {n} / {total}',
    'New facts: {list}': 'حقائق جديدة: {list}',
    ', ': '، ',
    'Allied · RAF': 'الحلفاء · سلاح الجو الملكي البريطاني',
    'Type first flight': 'أول طيران للطراز',
    'Scroll for more': 'مرّر للمزيد',
    '5 March 1936 (Mk IX: 1942)': '5 مارس 1936 (مارك 9: 1942)',
    'Hangar → Aircraft & Armory → Museum': 'الحظيرة ← الطائرات والتسليح ← المتحف',
    'Fly it to open the file': 'نفّذها لفتح الملف',
    'Classified. Fly this operation to open its file.': 'سرّي. نفّذ هذه العملية لفتح ملفها.',
    'How to earn it': 'كيف تناله',
    'Awarded to you:': 'مُنح لك:',
    'Not yet awarded': 'لم يُمنح بعد',
    'Date of the raid': 'تاريخ الغارة',
    'In the game': 'في اللعبة',
    'Aircraft, crew, medals and operations': 'الطائرات والطاقم والأوسمة والعمليات',
    'Meet it in a mission': 'صادفها في مهمة',
    'Meet it in {n} missions': 'صادفها في {n} مهمات',
    'Shoot one down': 'أسقط واحدة',
    'Shoot down {n}': 'أسقط {n}',
    'Fly {n} missions': 'نفّذ {n} مهمات',
    'Crew roles': 'أدوار الطاقم',
    'Operations': 'العمليات',
    'B-17 crew': 'طاقم B-17',
    'Game award': 'جائزة اللعبة',
    'US decoration': 'وسام أمريكي',

    // ---------- P-47 and Spitfire spec cards ----------
    'Republic P-47D Thunderbolt': 'ريبابليك P-47D ثاندربولت',
    'Escort fighter · fighter-bomber': 'مقاتلة مرافقة · مقاتلة قاذفة',
    '1': '1',
    '8 × .50 cal M2 machine guns · up to 2,500 lb of bombs': '8 رشاشات M2 عيار .50 · حتى 2,500 رطل من القنابل',
    'Friendly! A huge round nose and broad elliptical wings: the "Jug" rides with the bombers part of the way.': 'صديقة! مقدمة مستديرة ضخمة وجناحان بيضويان عريضان: «الإبريق» يرافق القاذفات جزءًا من الطريق.',
    'Supermarine Spitfire Mk IX': 'سوبرمارين سبيتفاير مارك 9',
    'Spitfire': 'سبيتفاير',
    'RAF fighter · escort': 'مقاتلة سلاح الجو الملكي · مرافقة',
    '2 × 20 mm Hispano cannon · 2 × .50 cal M2 machine guns': 'مدفعا هيسبانو عيار 20 مم · رشاشا M2 عيار .50',
    'Friendly! Thin elliptical wings and RAF roundels: Spitfires cover the bombers near the coast.': 'صديقة! جناحان بيضويان رقيقان وشارات سلاح الجو الملكي: طائرات السبيتفاير تحمي القاذفات قرب الساحل.',

    // ---------- crew positions ----------
    'Flight engineer · top turret': 'مهندس الطيران · البرج العلوي',
    'Radio operator': 'مشغّل اللاسلكي',
    'Ball turret gunner': 'رامي البرج الكروي',
    'Left waist gunner': 'رامي الخصر الأيسر',
    'Right waist gunner': 'رامي الخصر الأيمن',
    'Tail gunner': 'رامي الذيل',
    'Radio operator · rear gunner': 'مشغّل اللاسلكي · الرامي الخلفي',
    'Radar operator (night fighters)': 'مشغّل الرادار (المقاتلات الليلية)',
    'Observer · bomb aimer': 'المراقب · مصوّب القنابل',
    'Radio operator · gunner': 'مشغّل اللاسلكي · رامٍ',
    'Flight engineer · ventral gunner': 'مهندس الطيران · الرامي البطني',
    'Radar operator': 'مشغّل الرادار',
    'Flight engineer · gunner': 'مهندس الطيران · رامٍ',
    'Radio operator · dorsal gunner': 'مشغّل اللاسلكي · الرامي الظهري',
    'Waist gunner': 'رامي الخصر',
    'Waist gunners': 'رماة الخصر',

    // ---------- B-17 ----------
    'The backbone of the Eighth Air Force\'s daylight bombing from England. Bristling with guns and famous for bringing its crews home with terrible damage, the Fortress flew in tight combat boxes so that its gunners could cover one another.':
      'عماد القصف النهاري للقوة الجوية الثامنة انطلاقًا من إنجلترا. مدجّجة بالرشاشات وشهيرة بإعادة أطقمها إلى الوطن رغم أضرار مروّعة، وكانت القلعة تطير في تشكيلات قتالية متراصّة كي يحمي رماتها بعضهم بعضًا.',
    'Boeing built the prototype, the Model 299, in under a year; a newspaper caption called it a "flying fortress" and the name stuck.':
      'بنت بوينغ النموذج الأولي، الطراز 299، في أقل من عام؛ ووصفها تعليق في صحيفة بأنها «قلعة طائرة» فلصق بها الاسم.',
    'More than 12,700 B-17s were built, by Boeing, Douglas and Lockheed-Vega.': 'بُنيت أكثر من 12,700 طائرة B-17 لدى بوينغ ودوغلاس ولوكهيد-فيغا.',
    'An Eighth Air Force tour was 25 missions; in 1944 it was raised to 30 and then 35.': 'كانت جولة الخدمة في القوة الجوية الثامنة 25 مهمة؛ ورُفعت عام 1944 إلى 30 ثم إلى 35.',
    'The chin turret of the B-17G, two remote-controlled .50s under the nose, was the answer to the head-on attacks.': 'كان برج الذقن في B-17G، رشاشان عيار .50 يُداران عن بُعد تحت المقدمة، هو الرد على الهجمات الأمامية.',

    // ---------- P-51 ----------
    'Designed for the British in 1940 and transformed by the Rolls-Royce Merlin engine, the Mustang had the range to fly to Berlin and back. From early 1944 it escorted the bombers all the way, and the Luftwaffe\'s day fighters never recovered.':
      'صُمّمت للبريطانيين عام 1940 وغيّرها محرك رولز-رويس ميرلين تمامًا، فصار للموستانغ مدى يكفي للطيران إلى برلين والعودة. ومنذ مطلع 1944 رافقت القاذفات طوال الطريق، ولم تتعافَ مقاتلات اللوفتفافه النهارية بعدها قط.',
    'The prototype, the NA-73X, was rolled out 102 days after the contract was signed.': 'خرج النموذج الأولي من المصنع بعد 102 يوم من توقيع العقد.',
    'The bubble canopy of the D model gave its pilot a clear view all round, above all to the rear.': 'منحت القمرة الفقاعية في الطراز D طيّارها رؤية واضحة في كل الاتجاهات، ولا سيما إلى الخلف.',
    'With two drop tanks it could escort the bombers to Berlin and back, more than 1,800 km.': 'بخزانين إضافيين قابلين للإسقاط كانت تستطيع مرافقة القاذفات إلى برلين والعودة، أي أكثر من 1,800 كم.',
    'More than 15,000 Mustangs were built; the D model was the most numerous, with about 8,000.': 'بُنيت أكثر من 15,000 موستانغ؛ وكان الطراز D الأكثر عددًا بنحو 8,000 طائرة.',

    // ---------- P-47 ----------
    'The heaviest single-engine fighter of the war, built around a 2,000 hp radial engine and a turbo-supercharger. It escorted the Eighth\'s bombers through 1943, then became a feared ground-attack aircraft.':
      'أثقل مقاتلة أحادية المحرك في الحرب، بُنيت حول محرك نجمي بقوة 2,000 حصان وشاحن توربيني. رافقت قاذفات القوة الثامنة طوال 1943، ثم صارت طائرة هجوم أرضي مرهوبة.',
    'Pilots called it the "Jug". Empty, it weighed almost twice as much as a Spitfire.': 'سمّاها الطيارون «الإبريق». وكان وزنها فارغةً نحو ضعف وزن السبيتفاير.',
    'Its eight .50-calibre guns together fired more than a hundred rounds a second.': 'كانت رشاشاتها الثمانية عيار .50 تطلق معًا أكثر من مئة طلقة في الثانية.',
    'It could out-dive any German piston fighter, and its pilots used the dive to attack and to escape.': 'كانت تنقضّ أسرع من أي مقاتلة ألمانية مكبسية، واستخدم طيّاروها الانقضاض للهجوم وللإفلات.',
    'Republic built 15,636 Thunderbolts, more than any other American fighter.': 'بنت ريبابليك 15,636 ثاندربولت، أكثر من أي مقاتلة أمريكية أخرى.',

    // ---------- Spitfire ----------
    'Reginald Mitchell\'s elegant fighter defended Britain in 1940. The Mk IX, rushed into service in 1942 to answer the Fw 190, gave it a two-stage Merlin engine; Spitfires covered the American bombers on the first and last legs of their raids.':
      'دافعت مقاتلة ريجينالد ميتشل الأنيقة عن بريطانيا عام 1940. والطراز التاسع، الذي دُفع إلى الخدمة على عجل عام 1942 للرد على Fw 190، منحها محرك ميرلين بشاحن ثنائي المرحلة؛ وحمت طائرات السبيتفاير القاذفات الأمريكية في المراحل الأولى والأخيرة من غاراتها.',
    'Its thin elliptical wing was very efficient at high speed, and became its signature.': 'كان جناحها البيضوي الرقيق عالي الكفاءة في السرعات العالية، وصار علامتها المميزة.',
    'More than 20,000 Spitfires were built, more than any other British aircraft.': 'بُنيت أكثر من 20,000 سبيتفاير، أكثر من أي طائرة بريطانية أخرى.',
    'The Mk IX was meant as a stopgap, yet more than 5,600 were built.': 'أُريد للطراز التاسع أن يكون حلًا مؤقتًا، ومع ذلك بُنيت منه أكثر من 5,600 طائرة.',
    'The Spitfire was in production before the war began and after it ended: from 1938 to 1948.': 'كانت السبيتفاير قيد الإنتاج قبل أن تبدأ الحرب وبعد أن انتهت: من 1938 إلى 1948.',

    // ---------- Fw 190 ----------
    'Kurt Tank\'s rugged radial-engined fighter shocked the RAF in 1941. The heavily armed and armoured A-8 was the Luftwaffe\'s main bomber destroyer: the Sturmgruppen flew it right up to the Fortresses.':
      'صدمت مقاتلة كورت تانك المتينة ذات المحرك النجمي سلاح الجو الملكي عام 1941. وكان الطراز A-8 المدجّج بالسلاح والدروع مدمّر القاذفات الرئيسي في اللوفتفافه: قادته مجموعات الاقتحام حتى أقرب نقطة من القلاع.',
    'Its wide undercarriage made it far easier to land than the Bf 109.': 'جعل عجلات هبوطها المتباعدة الهبوط بها أسهل بكثير من Bf 109.',
    'German pilots called it the "Würger": the butcher-bird, or shrike.': 'سمّاها الطيارون الألمان «فورغر»: أي طائر الصُّرَد الجزّار.',
    'Sturm pilots swore to close in until they could not miss, and to ram the bomber if they had to.': 'أقسم طيارو الاقتحام أن يقتربوا حتى يستحيل أن يخطئوا، وأن يصدموا القاذفة إن لزم الأمر.',
    'More than 20,000 Fw 190s were built, thousands of them for ground attack.': 'بُنيت أكثر من 20,000 طائرة Fw 190، آلاف منها للهجوم الأرضي.',

    // ---------- Bf 109 ----------
    'Willy Messerschmitt\'s light fighter flew in Spain, over Britain and on every front. By 1944 the G model was outclassed by the newest Allied fighters, but it remained the most numerous fighter in the Luftwaffe.':
      'حلّقت مقاتلة فيلي مسرشميت الخفيفة في إسبانيا وفوق بريطانيا وعلى كل الجبهات. وبحلول 1944 تفوّقت أحدث مقاتلات الحلفاء على الطراز G، لكنه ظل أكثر المقاتلات عددًا في اللوفتفافه.',
    'About 34,000 were built: more than any other fighter in history.': 'بُني منها نحو 34,000: أكثر من أي مقاتلة أخرى في التاريخ.',
    'Its narrow undercarriage made take-offs and landings tricky; many were wrecked on the ground.': 'جعلت عجلات هبوطها المتقاربة الإقلاع والهبوط صعبين؛ وتحطّم كثير منها على الأرض.',
    'The bulges over the guns of the G-6 earned it the nickname "Beule": the bump.': 'أكسبتها الانتفاخات فوق رشاشات الطراز G-6 لقب «بويله»: أي الحدبة.',
    'Erich Hartmann, the highest-scoring ace in history with 352 victories, flew the Bf 109.': 'طار بها إريش هارتمان، أعلى الآسات رصيدًا في التاريخ بـ352 انتصارًا.',

    // ---------- Bf 110 ----------
    'Designed as a long-range Zerstörer to clear the way for the bombers, it was mauled by single-seat fighters over Britain. It found a new life as a night fighter and, by day, as a rocket-armed destroyer of unescorted bombers.':
      'صُمّمت «مدمّرةً» بعيدة المدى تمهّد الطريق للقاذفات، فمزّقتها المقاتلات أحادية المقعد فوق بريطانيا. ثم وجدت حياة جديدة مقاتلةً ليلية، وفي النهار مدمّرةً مسلّحة بالصواريخ للقاذفات غير المرافَقة.',
    'Zerstörer means "destroyer": the heavy fighter was meant to escort bombers deep into enemy land.': 'تسيرشتورر تعني «المدمّرة»: أُريد للمقاتلة الثقيلة أن ترافق القاذفات إلى عمق أرض العدو.',
    'Its 21 cm rockets were adapted from the army\'s Nebelwerfer barrage rockets, fired into the bomber boxes to break them up.': 'كانت صواريخها عيار 21 سم معدّلة من صواريخ «نيبلفيرفر» التي استخدمها الجيش للقصف المكثّف، تُطلق على تشكيلات القاذفات لتفريقها.',
    'Once American escorts could reach Germany, the slow Bf 110 day units suffered terrible losses.': 'حين صارت المرافقة الأمريكية قادرة على بلوغ ألمانيا، تكبّدت وحدات Bf 110 النهارية البطيئة خسائر فادحة.',
    'As a night fighter it served the most successful night aces, such as Heinz-Wolfgang Schnaufer.': 'وبوصفها مقاتلة ليلية خدمت أنجح آسات الليل، مثل هاينتس-فولفغانغ شناوفر.',

    // ---------- Ju 88 ----------
    'Junkers\' fast twin-engined "Schnellbomber" was the Luftwaffe\'s most versatile aircraft: bomber, dive bomber, reconnaissance aircraft, night fighter and even a flying bomb.':
      'كانت «القاذفة السريعة» ثنائية المحرك من يونكرز أكثر طائرات اللوفتفافه تنوعًا: قاذفة، وقاذفة انقضاضية، وطائرة استطلاع، ومقاتلة ليلية، بل وقنبلة طائرة.',
    'Its four crew sat close together in the glazed nose, the "Kampfkopf" or combat head.': 'جلس أفراد طاقمها الأربعة متقاربين في المقدمة الزجاجية، «رأس القتال».',
    'About 15,000 Ju 88s of all versions were built.': 'بُنيت نحو 15,000 طائرة Ju 88 بكل طُرُزها.',
    'Dive brakes under the wings let it bomb in a steep dive.': 'مكّنتها مكابح الانقضاض تحت الجناحين من القصف في انقضاض حاد.',
    'Late in the war worn-out Ju 88s were flown as Mistel flying bombs, with a fighter riding on top.': 'في أواخر الحرب طارت طائرات Ju 88 المستهلكة قنابلَ طائرة «ميستل»، تعتليها مقاتلة.',

    // ---------- Ju 88 G ----------
    'The ultimate Ju 88 night fighter, with a bigger tail and SN-2 radar. Its Schräge Musik cannon fired upwards into the unarmoured bellies of the bombers.':
      'ذروة مقاتلات Ju 88 الليلية، بذيل أكبر ورادار ليختنشتاين. كان مدفعها «الموسيقى المائلة» يطلق إلى الأعلى في بطون القاذفات غير المدرّعة.',
    'Schräge Musik, "slanted music", was German slang for jazz.': 'كانت «الموسيقى المائلة» تعبيرًا ألمانيًا عاميًا يعني موسيقى الجاز.',
    'It crept in below the bomber, where the gunners could rarely see it.': 'كانت تتسلّل تحت القاذفة، حيث نادرًا ما يراها الرماة.',
    'In July 1944 a Ju 88 G landed in England by mistake and gave its radar secrets away.': 'في يوليو 1944 هبطت Ju 88 G في إنجلترا خطأً فكشفت أسرار رادارها.',
    'Its SN-2 radar could see through the "Window" foil strips that blinded earlier sets.': 'كان رادارها يرى عبر شرائط الرقائق المعدنية «النافذة» التي أعمت الأجهزة السابقة.',

    // ---------- Me 262 ----------
    'The first operational jet fighter. Faster than anything the Allies had, it came too late and in too small numbers: its engines lasted only hours, and fuel and trained pilots were short.':
      'أول مقاتلة نفاثة عاملة. كانت أسرع من كل ما لدى الحلفاء، لكنها جاءت متأخرة جدًا وبأعداد قليلة جدًا: لم تعمّر محركاتها سوى ساعات، وشحّ الوقود والطيارون المدرّبون.',
    'Its Jumo 004 jet engines needed an overhaul after as little as ten to twenty-five hours.': 'احتاجت محركاتها النفاثة إلى صيانة شاملة بعد ما لا يزيد على عشر إلى خمس وعشرين ساعة.',
    'Three or four hits from its 30 mm cannon could bring down a B-17.': 'كانت ثلاث أو أربع إصابات من مدافعها عيار 30 مم كفيلة بإسقاط B-17.',
    'Allied pilots caught it where it was slow: taking off and landing.': 'اصطادها طيارو الحلفاء حيث كانت بطيئة: عند الإقلاع والهبوط.',
    'About 1,400 were built, but only a fraction ever reached combat.': 'بُني منها نحو 1,400، لكن جزءًا صغيرًا فقط بلغ القتال.',

    // ---------- Me 163 ----------
    'A tiny tailless rocket fighter, the only one ever to see combat. It climbed to the bombers in under four minutes, made a pass or two, and glided home with empty tanks.':
      'مقاتلة صاروخية صغيرة بلا ذيل، الوحيدة من نوعها التي خاضت القتال. كانت تصعد إلى القاذفات في أقل من أربع دقائق، وتنفّذ هجمة أو اثنتين، ثم تنزلق عائدةً بخزانات فارغة.',
    'Its rocket burned two violently reactive fuels, T-Stoff and C-Stoff, which could kill the pilot on contact.': 'كان صاروخها يحرق وقودين شديدي التفاعل قد يقتلان الطيار بمجرد ملامستهما.',
    'It took off from a wheeled dolly that it dropped, and landed on a skid.': 'كانت تقلع من عربة بعجلات تُسقطها، وتهبط على زلّاجة.',
    'Its speed was so high that its pilots had only a split second to aim at a bomber.': 'كانت سرعتها عالية إلى حد أن طياريها لم يملكوا سوى جزء من الثانية للتصويب على القاذفة.',
    'For all its speed it shot down only a handful of Allied aircraft.': 'ورغم كل سرعتها لم تُسقط سوى حفنة من طائرات الحلفاء.',

    // ---------- He 111 ----------
    'Developed in secret as an "airliner", the Heinkel was the Luftwaffe\'s main bomber of 1940. By 1944 it was obsolete, but it still flew as a transport, a torpedo bomber and a launcher of V-1 flying bombs.':
      'طُوّرت سرًا على أنها «طائرة ركاب»، وكانت الهاينكل القاذفة الرئيسية للوفتفافه عام 1940. وبحلول 1944 صارت متقادمة، لكنها ظلت تطير طائرةَ نقل وقاذفة طوربيدات ومنصّة لإطلاق القنابل الطائرة.',
    'Its fully glazed nose put the pilot beside the bomb aimer, with no stepped cockpit.': 'وضعت مقدمتها الزجاجية بالكامل الطيار بجوار مصوّب القنابل، بلا قمرة بارزة.',
    'Spain built it after the war with Merlin engines, as the CASA 2.111.': 'بنتها إسبانيا بعد الحرب بمحركات ميرلين باسم «كاسا».',
    'More than 6,500 were built.': 'بُني منها أكثر من 6,500.',
    'In 1944 He 111s launched V-1 flying bombs at England from over the North Sea.': 'في 1944 أطلقت طائرات He 111 القنابل الطائرة على إنجلترا من فوق بحر الشمال.',

    // ---------- Me 410 ----------
    'The troubled Me 210 rebuilt into a fast heavy fighter. Over Germany it hunted the bomber boxes; some carried a 50 mm BK 5 cannon to fire from beyond the gunners\' reach.':
      'أُعيد بناء الطراز المتعثّر Me 210 فصار مقاتلة ثقيلة سريعة. وفوق ألمانيا طاردت تشكيلات القاذفات؛ وحمل بعضها مدفع BK 5 عيار 50 مم ليطلق من خارج مدى الرماة.',
    'Hornisse means "hornet".': 'هورنيسه تعني «الدبّور».',
    'The rear gunner aimed two remote barbettes, one on each side of the fuselage.': 'كان الرامي الخلفي يصوّب برجين يُداران عن بُعد، واحدًا على كل جانب من جسم الطائرة.',
    'The BK 5 was an adapted tank gun with only 21 rounds.': 'كان BK 5 مدفع دبابة معدّلًا بـ21 طلقة فقط.',
    'About 1,200 were built.': 'بُني منها نحو 1,200.',

    // ---------- Do 335 ----------
    'The fastest piston fighter Germany built, with one engine in the nose and one in the tail. Only a few dozen were finished before the war ended.':
      'أسرع مقاتلة مكبسية بنتها ألمانيا، بمحرك في المقدمة وآخر في الذيل. لم يكتمل منها سوى بضع عشرات قبل نهاية الحرب.',
    'Pfeil means "arrow".': 'بفايل تعني «السهم».',
    'It had an ejection seat; the tail fin and rear propeller were blown off first.': 'كان فيها مقعد قاذف؛ وكانت الزعنفة والمروحة الخلفية تُفجَّران أولًا.',
    'Its push-pull layout gave twin-engine power with the drag of a single-engine fighter.': 'منحها ترتيب الدفع والسحب قوة محركين بمقاومة هواء مقاتلة أحادية المحرك.',
    'The only surviving Do 335 is in the Smithsonian\'s collection in Virginia.': 'آخر Do 335 باقية محفوظة ضمن مجموعة سميثسونيان في فرجينيا.',

    // ---------- boss ----------
    'Invented for the game: a flying warship built on the Ju 88 hull at three times its size, with gun turrets, flak and rocket pods.':
      'مُبتكرة للعبة: سفينة حربية طائرة مبنية على هيكل Ju 88 بثلاثة أضعاف حجمه، بأبراج رشاشات ومدافع مضادة وحاضنات صواريخ.',
    'No such aircraft ever flew; the real giants of the Luftwaffe were transports such as the Me 323.': 'لم تطر طائرة كهذه قط؛ فعمالقة اللوفتفافه الحقيقيون كانوا طائرات نقل مثل Me 323.',
    'Every turret, engine and flak gun you shoot away weakens the armour around the hull.': 'كل برج ومحرك ومدفع مضاد تدمّره يُضعف الدرع حول الهيكل.',
    'Its 8.8 cm dorsal flak gun fires bursts into the formation: kill it first.': 'يطلق مدفعها المضاد الظهري عيار 8.8 سم رشقات على التشكيل: دمّره أولًا.',
    'Bringing one down earns the Giant Killer medal.': 'إسقاط واحدة منها يمنحك وسام قاهر العمالقة.',

    // ---------- codex: crew roles ----------
    'The aircraft commander, usually a lieutenant, responsible for the ship and all ten men. Holding a heavy bomber in tight formation for eight hours was exhausting work.':
      'قائد الطائرة، ملازم في العادة، مسؤول عنها وعن رجالها العشرة. وكان إبقاء قاذفة ثقيلة في تشكيل متراصّ ثماني ساعات عملًا منهكًا.',
    'Your pilot jinks the bomber when fighters bore in; his nerve sets how soon.': 'يناور طيارك بالقاذفة حين تندفع المقاتلات؛ وثبات أعصابه يحدّد متى.',
    'Second in command, flying in turns with the pilot and ready to take over if he was hit. He watched the engines, fuel and the formation on his side.':
      'الرجل الثاني في القيادة، يتناوب الطيران مع الطيار ومستعد لتولّي القيادة إن أُصيب. وكان يراقب المحركات والوقود والتشكيل في جانبه.',
    'Shares the flying and the nerve of the cockpit with the pilot.': 'يشارك الطيار القيادة وثبات أعصاب قمرة القيادة.',
    'Kept track of the bomber\'s position by dead reckoning, radio fixes and the stars, and manned the cheek guns in the nose.':
      'كان يتتبّع موقع القاذفة بالملاحة التقديرية وتحديدات اللاسلكي والنجوم، ويشغّل رشاشَي جانبي المقدمة.',
    'One of the lookouts: calls fighters coming from the front.': 'أحد المراقبين: ينبّه إلى المقاتلات القادمة من الأمام.',
    'Aimed the bombs through the Norden bombsight on the run to the target, and fired the twin-gun chin turret of the B-17G.':
      'كان يصوّب القنابل عبر منظار نوردن في مسار الاقتراب من الهدف، ويطلق من برج الذقن ثنائي الرشاشات في B-17G.',
    'Flies the bomb run: hold the crosshairs on the aiming point until bombs away.': 'يقود مسار القصف: أبقِ التقاطع على نقطة التصويب حتى إسقاط القنابل.',
    'The bomber\'s mechanic in the air: fuel transfers, engines and repairs. In combat he manned the power-driven top turret behind the cockpit.':
      'ميكانيكي القاذفة في الجو: نقل الوقود والمحركات والإصلاحات. وفي القتال كان يشغّل البرج العلوي الآلي خلف قمرة القيادة.',
    'A station you can man: the top turret, best against high and head-on attacks. He also fights fires and repairs.':
      'موقع يمكنك شغله: البرج العلوي، الأفضل ضد الهجمات العالية والأمامية. وهو يكافح الحرائق ويُصلح أيضًا.',
    'Kept the radio watch, sent position reports and worked the radio room; in the field he often gave first aid to the wounded.':
      'كان يتولّى المناوبة اللاسلكية ويرسل تقارير الموقع ويدير غرفة اللاسلكي؛ وكثيرًا ما قدّم الإسعافات الأولية للجرحى.',
    'Dresses the wounded: his first aid shortens how long a gunner is out.': 'يضمّد الجرحى: إسعافاته تقصّر مدة غياب الرامي عن موقعه.',
    'Curled up in a steel and glass ball under the belly, usually the smallest man of the crew, with no room for his parachute inside.':
      'منكمش داخل كرة من الفولاذ والزجاج تحت البطن، وهو في العادة أصغر أفراد الطاقم حجمًا، بلا متّسع لمظلته في الداخل.',
    'A station you can man: the ball turret covers every attack from below.': 'موقع يمكنك شغله: البرج الكروي يغطي كل هجوم من الأسفل.',
    'Two gunners standing at open windows in the fuselage, in the bitter cold of high altitude. From 1944 many crews flew with only one.':
      'راميان يقفان عند نافذتين مفتوحتين في جسم الطائرة، في برد الارتفاعات العالية القارس. ومنذ 1944 طار كثير من الأطقم برامٍ واحد فقط.',
    'Two stations you can man: the left and right waist guns cover the beams.': 'موقعان يمكنك شغلهما: رشاشا الخصر الأيسر والأيمن يغطيان الجانبين.',
    'Kneeling on a bicycle-type seat in the tail, he faced the fighters that attacked from behind and reported what was happening to the formation.':
      'جاثيًا على مقعد يشبه مقعد الدراجة في الذيل، كان يواجه المقاتلات المهاجمة من الخلف ويُبلغ بما يجري للتشكيل.',
    'A station you can man: the tail guns meet attacks from six o\'clock.': 'موقع يمكنك شغله: رشاشا الذيل يواجهان الهجمات من الساعة السادسة.',

    // ---------- codex: medals ----------
    'Created in 1942 for meritorious achievement in flight. Bomber crews of the Eighth Air Force usually received it after their first five missions, and an oak-leaf cluster for every five after that.':
      'أُنشئ عام 1942 للإنجاز الجدير بالتقدير في الطيران. وكانت أطقم قاذفات القوة الجوية الثامنة تناله عادةً بعد أول خمس مهمات، ثم عنقود أوراق البلوط عن كل خمس بعدها.',
    'Created in 1926 for heroism or extraordinary achievement in flight. Many bomber crewmen received it on completing their tour.':
      'أُنشئ عام 1926 للبطولة أو الإنجاز الاستثنائي في الطيران. وناله كثير من أفراد أطقم القاذفات عند إتمام جولة خدمتهم.',
    'The third-highest American award for gallantry in combat, given for bravery against an armed enemy.': 'ثالث أعلى وسام أمريكي للبسالة في القتال، يُمنح للشجاعة في مواجهة عدو مسلّح.',
    'Given to every serviceman wounded or killed by enemy action. It was revived in 1932 from George Washington\'s Badge of Military Merit of 1782.':
      'يُمنح لكل عسكري جُرح أو قُتل بفعل العدو. وقد أُحيي عام 1932 من شارة الاستحقاق العسكري التي أنشأها جورج واشنطن عام 1782.',
    'Not a medal but a title of honour: five enemy aircraft shot down in a single day. Only a few dozen American airmen managed it.':
      'ليس وسامًا بل لقب شرف: إسقاط خمس طائرات معادية في يوم واحد. لم يحققه سوى بضع عشرات من الطيارين الأمريكيين.',
    'In 1943 the real Aerial Gunner badge, silver wings around a winged bullet, was given to the graduates of gunnery school.':
      'في 1943 مُنحت شارة الرامي الجوي الحقيقية، جناحان فضيان حول رصاصة مجنّحة، لخريجي مدرسة الرماية.',
    'An award of this game for the whole formation coming home. In 1943 the Eighth Air Force often lost one bomber in ten on a deep raid.':
      'جائزة من هذه اللعبة لعودة التشكيل كاملًا. ففي 1943 كثيرًا ما خسرت القوة الجوية الثامنة قاذفة من كل عشر في الغارات العميقة.',
    'An award of this game. The Luftwaffe called its aces "Experten"; some scored dozens of bombers.': 'جائزة من هذه اللعبة. سمّت اللوفتفافه آساتها «الخبراء»؛ وأسقط بعضهم عشرات القاذفات.',
    'An award of this game for bringing down a Luftkreuzer, the fictional flying warship.': 'جائزة من هذه اللعبة لإسقاط الطرّاد الجوي، السفينة الحربية الطائرة الخيالية.',
    'An award of this game. Few airmen volunteered for a second tour: by late 1943 fewer than half the crews survived their first.':
      'جائزة من هذه اللعبة. قلّة من الطيارين تطوّعوا لجولة ثانية: فبحلول أواخر 1943 نجا أقل من نصف الأطقم من جولتهم الأولى.',

    // ---------- codex: operations ----------
    'On 27 September 1943 the Eighth Air Force bombed Emden through cloud, led by pathfinders with H2S radar for the first time, and P-47s with drop tanks escorted the bombers all the way to the target.':
      'في 27 سبتمبر 1943 قصفت القوة الجوية الثامنة إمدن عبر الغيوم، بقيادة طائرات استدلال مزوّدة برادار القصف لأول مرة، ورافقت طائرات P-47 بخزانات إضافية القاذفات حتى الهدف.',
    'On 8 October 1943 the bombers hit Bremen and the U-boat yards at Vegesack. Head-on attacks and flak brought down about thirty bombers.':
      'في 8 أكتوبر 1943 ضربت القاذفات بريمن وأحواض الغواصات في فيغيزاك. وأسقطت الهجمات الأمامية والمضادات نحو ثلاثين قاذفة.',
    'On 14 October 1943, "Black Thursday", sixty of the bombers sent to Schweinfurt were lost. Unescorted deep raids stopped until long-range fighters arrived.':
      'في 14 أكتوبر 1943، «الخميس الأسود»، فُقدت ستون من القاذفات المرسلة إلى شفاينفورت. وتوقفت الغارات العميقة غير المرافَقة حتى وصلت المقاتلات بعيدة المدى.',
    'On 13 December 1943 P-51 Mustangs flew their first long-range escort, to the port of Kiel.': 'في 13 ديسمبر 1943 نفّذت موستانغ P-51 أول مرافقة بعيدة المدى لها، إلى ميناء كيل.',
    'On 30 December 1943 more than six hundred heavy bombers struck the IG Farben chemical works at Ludwigshafen.': 'في 30 ديسمبر 1943 ضربت أكثر من ستمئة قاذفة ثقيلة مصانع الكيماويات «إي غي فاربن» في لودفيغسهافن.',
    'On 29 January 1944 more than eight hundred heavy bombers set out for Frankfurt, the largest force the Eighth had yet sent.': 'في 29 يناير 1944 انطلقت أكثر من ثمانمئة قاذفة ثقيلة إلى فرانكفورت، أكبر قوة أرسلتها القوة الثامنة حتى ذلك الحين.',
    'On 20 February 1944 more than a thousand bombers took off to attack the German aircraft industry around Leipzig: the first day of "Big Week", Operation Argument.':
      'في 20 فبراير 1944 أقلعت أكثر من ألف قاذفة لضرب صناعة الطائرات الألمانية حول لايبزيغ: اليوم الأول من «الأسبوع الكبير»، عملية «الحجّة».',
    'On 24 February 1944, during Big Week, the bombers went back to the ball-bearing plants of Schweinfurt.': 'في 24 فبراير 1944، خلال الأسبوع الكبير، عادت القاذفات إلى مصانع المحامل الكروية في شفاينفورت.',
    'On 25 February 1944, the last day of Big Week, bombers from England and Italy struck the Messerschmitt works at Regensburg.': 'في 25 فبراير 1944، آخر أيام الأسبوع الكبير، ضربت قاذفات من إنجلترا وإيطاليا مصانع مسرشميت في ريغنسبورغ.',
    'On 6 March 1944 the Eighth Air Force made its first great daylight raid on Berlin and lost sixty-nine bombers, its worst day of the war.':
      'في 6 مارس 1944 شنّت القوة الجوية الثامنة أول غارة نهارية كبرى على برلين وخسرت تسعًا وستين قاذفة، أسوأ أيامها في الحرب.',
    'On 8 March 1944 the bombers returned to Berlin and the ball-bearing works at Erkner. The Luftwaffe was losing pilots faster than it could train them.':
      'في 8 مارس 1944 عادت القاذفات إلى برلين ومصنع المحامل الكروية في إركنر. وكانت اللوفتفافه تخسر طياريها أسرع مما تستطيع تدريبهم.',
    'On 11 April 1944 the bombers hit aircraft plants across central Germany, among them the Fw 190 factory at Oschersleben; sixty-four bombers were lost.':
      'في 11 أبريل 1944 ضربت القاذفات مصانع الطائرات في أنحاء وسط ألمانيا، ومنها مصنع Fw 190 في أوشرسليبن؛ وفُقدت أربع وستون قاذفة.',
  },
};

export default table;
