import type { PhraseTable, Pattern } from '../types';

// Arabic for the P-51 ground-attack Special operation "Train Busting" (StrafeOps.ts,
// GroundTargets.ts): radio, banners, HUD objective lines, feed, overlay labels, the mission.

const KIND: Record<string, string> = { 'TRAIN BUSTING': 'مطاردة القطارات', CONVOY: 'القافلة', AIRFIELD: 'المطار' };

const TARGETS = ['Locomotive', 'Goods wagon', 'Tank wagon', 'Flak wagon', 'Truck', 'Fuel truck', 'Flak half-track', 'Aircraft on the ground',
  'Fw 190 on the ground', 'Bf 109 on the ground', 'Ju 88 on the ground', 'Bf 110 on the ground', '20 mm flak', 'Flak tower'].join('|');

const patterns: Pattern[] = [
  [/^ROUND (\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD)$/, (m) => `الجولة ${m[1]} · ${KIND[m[2]]}`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — locomotive ([\d.]+) km from the tunnel$/, (m) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — القاطرة على بُعد ${m[4]} كم من النفق`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — train stopped · (-?\d+)\/(\d+) wagons destroyed$/, (m) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — توقّف القطار · دُمّرت ${m[4]}/${m[5]} عربات`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) vehicles destroyed$/, (m) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — دُمّرت ${m[4]}/${m[5]} مركبات`],
  [/^Round (\d+)\/(\d+) · (TRAIN BUSTING|CONVOY|AIRFIELD) — (\d+)\/(\d+) aircraft destroyed on the ground$/, (m) => `الجولة ${m[1]}/${m[2]} · ${KIND[m[3]]} — دُمّرت ${m[4]}/${m[5]} طائرات على الأرض`],
  [/^Objective complete — \+(\d+)$/, 'أُنجز الهدف — +$1'],
  [new RegExp(`^(${TARGETS}) destroyed — \\+(\\d+)$`), (m, tr) => `دُمّر ${tr(m[1])} — +${m[2]}`],
  [new RegExp(`^Blue Two got the (${TARGETS})$`), (m, tr) => `أصاب «أزرق اثنان» ${tr(m[1])}`],
  [new RegExp(`^(${TARGETS}) reached the village$`), (m, tr) => `${tr(m[1])} وصلت إلى القرية`],
];

const table: PhraseTable = {
  phrases: {
    // radio
    'Control to Blue flight: a supply train is heading east for the tunnel. Stop that locomotive before it gets there!':
      'المراقبة إلى السرب الأزرق: قطار إمدادات يتجه شرقاً نحو النفق. أوقفوا تلك القاطرة قبل أن تصل إليه!',
    'Control: a truck convoy is on the road to the village. Shoot it up before it gets under cover!':
      'المراقبة: قافلة شاحنات على الطريق إلى القرية. اضربوها قبل أن تحتمي!',
    'Control: the Luftwaffe field to the north-east. Strafe the aircraft on the ground — and watch the flak!':
      'المراقبة: مطار اللوفتفافه في الشمال الشرقي. امسحوا الطائرات الرابضة على الأرض بالنيران — واحذروا المضادات!',
    "Got the loco! She's blown her boiler!": 'أصبت القاطرة! انفجر مرجلها!',
    'The train made it into the tunnel. Too late, Blue flight.': 'دخل القطار النفق. فات الأوان يا سرب الأزرق.',
    'Light flak coming up! Stay low and keep jinking!': 'نيران مضادة خفيفة تصعد نحونا! ابقوا منخفضين وواصلوا المناورة!',
    'Focke-Wulfs coming down on us! Watch your tail, Leader!': 'طائرات فوكه-وولف تنقضّ علينا! احذر ذيلك أيها القائد!',
    'Blue Two, going down on your target!': 'أزرق اثنان، أنقضّ على هدفك!',
    'Blue Two — got one on the ground!': 'أزرق اثنان — أصبت واحداً على الأرض!',
    'Blue Leader, you are leaving the target area. Come back round.': 'قائد الأزرق، أنت تغادر منطقة الهدف. استدر وعُد.',

    // banners and feed
    'Stop the supply train before it reaches the tunnel': 'أوقف قطار الإمدادات قبل أن يصل إلى النفق',
    'Shoot up the truck convoy before it reaches the village': 'اضرب قافلة الشاحنات قبل أن تصل إلى القرية',
    'Strafe the Luftwaffe airfield': 'امسح مطار اللوفتفافه بالنيران',
    'The train reached the tunnel': 'وصل القطار إلى النفق',
    'Your Mustang was brought down by flak.': 'أسقطت المضادات الأرضية طائرتك الموستانغ.',

    // ground targets
    'Locomotive': 'القاطرة',
    'Goods wagon': 'عربة البضائع',
    'Tank wagon': 'عربة الصهريج',
    'Flak wagon': 'عربة المضادات',
    'Truck': 'الشاحنة',
    'Fuel truck': 'شاحنة الوقود',
    'Flak half-track': 'نصف المجنزرة المضادة',
    'Aircraft on the ground': 'طائرة على الأرض',
    'Fw 190 on the ground': 'طائرة Fw 190 على الأرض',
    'Bf 109 on the ground': 'طائرة Bf 109 على الأرض',
    'Ju 88 on the ground': 'طائرة Ju 88 على الأرض',
    'Bf 110 on the ground': 'طائرة Bf 110 على الأرض',
    '20 mm flak': 'مدفع مضاد 20 مم',
    'Flak tower': 'برج المضادات',

    // overlay
    'TRAIN': 'القطار',
    'CONVOY': 'القافلة',
    'AIRFIELD': 'المطار',
    'FLAK': 'مضادات',
    'LOCOMOTIVE': 'القاطرة',
    'PULL UP': 'ارفع المقدمة',
    'FT AGL': 'قدم فوق الأرض',

    // mission and mode
    'Train Busting': 'مطاردة القطارات',
    'Rail and road traffic, Normandy': 'حركة السكك والطرق، نورماندي',
    'Normandy, July 1944': 'نورماندي، يوليو 1944',
    'Today we go down on the deck. The Germans are moving supplies to the front by rail and road in daylight, and it is our job to stop them. Fly low and fast, and pick your targets.':
      'اليوم ننزل إلى مستوى الأرض. الألمان ينقلون الإمدادات إلى الجبهة بالسكك والطرق في وضح النهار، ومهمتنا أن نوقفهم. طِر منخفضاً وسريعاً، واختر أهدافك.',
    'First a supply train heading east for a tunnel: stop the locomotive before it gets there, then work over the wagons. Then a truck convoy on the road into the village. Last, the Luftwaffe airfield to the north-east, with aircraft parked in the open.':
      'أولاً قطار إمدادات يتجه شرقاً نحو نفق: أوقف القاطرة قبل أن تصل إليه، ثم اعمل على العربات. بعدها قافلة شاحنات على الطريق إلى القرية. وأخيراً مطار اللوفتفافه في الشمال الشرقي، وطائراته رابضة في العراء.',
    'Everything down there shoots back. The 20 mm flak hoses tracer at anything low — keep moving and do not make two passes from the same direction. Watch your height in the dive: the ground does not forgive. Blue Two goes down on your target when you press one.':
      'كل ما في الأسفل يردّ النار. المضادات عيار 20 مم ترشّ الطلقات المضيئة على كل ما يطير منخفضاً — واصل الحركة ولا تكرّر الانقضاض من الاتجاه نفسه. راقب ارتفاعك أثناء الانقضاض: الأرض لا تغفر. «أزرق اثنان» ينقضّ على هدفك حين تضغط واحد.',
    'Stop the train before it reaches the tunnel': 'أوقف القطار قبل أن يصل إلى النفق',
    'Shoot up the truck convoy': 'اضرب قافلة الشاحنات',
    'Strafe the aircraft on the airfield': 'امسح الطائرات في المطار بالنيران',
    'Command your wingman: 1 attack my target · 2 cover me': 'أعطِ أوامرك للجناح المرافق: 1 هاجم هدفي · 2 غطِّني',
    'The rail line is blocked, the convoy is burning and the airfield will not be flying tomorrow. That was flying, Blue Leader.':
      'خط السكة مقطوع، والقافلة تحترق، والمطار لن يُقلع منه أحد غداً. هذا هو الطيران يا قائد الأزرق.',
    'Special operation — ground attack. Down on the deck over Normandy: stop a supply train before it reaches the tunnel, shoot up a truck convoy and strafe a Luftwaffe airfield, through 20 mm flak and a few Fw 190s. Mind the ground — it does not forgive.':
      'عملية خاصة — هجوم أرضي. على ارتفاع منخفض فوق نورماندي: أوقف قطار إمدادات قبل أن يصل إلى النفق، واضرب قافلة شاحنات، وامسح مطاراً للوفتفافه بالنيران، وسط مضادات 20 مم وبعض طائرات Fw 190. احذر الأرض — فهي لا تغفر.',
  },
  patterns,
};
export default table;
