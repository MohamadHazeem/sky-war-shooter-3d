import type { PhraseTable, Pattern } from '../types';
import { ltr } from './fmt';

// Arabic for Co-op (beta): the screens (ui/CoopScreen.ts), the session's status, error and
// disconnect messages (game/CoopSession.ts, net/Signal.ts), and its tips, banners and feed lines.
// Host = المضيف, partner = زميلك (the tag: الزميل), join code = رمز الانضمام.

const patterns: Pattern[] = [
  [/^Joining ([A-Z0-9]+)…$/, (m) => `جارٍ الانضمام إلى ${ltr(m[1])}…`],
  [/^Mission over — (.+)$/, (m, tr) => `انتهت المهمة — ${tr(m[1])}`],
  // the guest's gun is taken by the host (GunnerController notice)
  [/^PARTNER is on the (.+)$/, (m, tr) => `زميلك يشغل ${tr(m[1])}`],
  // the host's kill feed during the guest's hit ("… destroyed — partner" is matched by game.ts)
  [/^(.+) — partner$/, (m, tr) => `${tr(m[1])} — زميلك`],
];

const table: PhraseTable = {
  phrases: {
    'Up to four gunners crew one B-17, or two pilots fly Mustangs. Share one room code.': 'حتى أربعة رماة في بي-١٧ واحدة، أو طياران في موستانغ. شاركوا رمز غرفة واحداً.',
    'Crew connected — pick a seat and ready up': 'اتصل الطاقم — اختر موقعك وأكّد استعدادك',
    'Crew member left — AI has the gun': 'غادر أحد أفراد الطاقم — تولّى الرامي الآلي المدفع',
    'Crew full or unavailable. Try again shortly.': 'الطاقم مكتمل أو غير متاح. حاول مجدداً بعد قليل.',
    'That crew slot is occupied.': 'مكان الطاقم هذا مشغول.',
    'That gun is crewed': 'يشغل أحد أفراد الطاقم هذا المدفع',
    'Open crew slot · AI covering': 'مكان شاغر في الطاقم · يغطيه الرامي الآلي',
    'Ready': 'جاهز',
    'Not ready': 'غير جاهز',
    'Ping target': 'حدّد الهدف',

    'Blue One': 'الأزرق واحد',
    'Leave co-op': 'مغادرة التعاون',
    'B-17 crew or P-51 escort · online': 'طاقم بي-١٧ أو مرافقة بي-٥١ · عبر الإنترنت',
    'Crew a B-17 or fly two Mustangs. The host picks the mission; your partner joins with a code.': 'شكّلا طاقم بي-١٧ أو قودا طائرتي موستانغ. يختار المضيف المهمة وينضم زميلك برمز.',
    'Co-op mode': 'نمط التعاون',
    'B-17 crew (gunners)': 'طاقم بي-١٧ (رماة)',
    'P-51 escort (pilots)': 'مرافقة بي-٥١ (طياران)',
    'Custom Battle — saved escort settings': 'معركة مخصصة — إعدادات المرافقة المحفوظة',
    'Partner connected — ready to fly': 'اتصل زميلك — جاهزان للطيران',
    'Co-op Survival — Pilots': 'البقاء التعاوني — الطيارون',
    'Pause is disabled in co-op': 'الإيقاف المؤقت غير متاح في التعاون',
    'You are down — spectating your partner until the next round': 'سقطت طائرتك — تتابع زميلك حتى الجولة التالية',
    'Form up on your partner': 'انضم إلى تشكيل زميلك',
    '{name} destroyed {target}': '{name} أسقط {target}',
    'm': 'م',

    'Your callsign': 'نداءك',
    'Crew score': 'نقاط الطاقم',
    'CREW LEADERBOARD': 'لوحة ترتيب الطواقم',
    'Return to co-op lobby': 'العودة إلى ردهة اللعب التعاوني',
    'Waiting for your partner to return…': 'في انتظار عودة زميلك…',
    'Shared crew score and personal rewards. Relay support is used when available.': 'نقاط مشتركة للطاقم ومكافآت شخصية. يُستخدم خادم الترحيل عند توفره.',
    'Could not connect to the host. Try another network or try again.': 'تعذّر الاتصال بالمضيف. جرّب شبكة أخرى أو حاول مجدداً.',
    '{name} (partner) destroyed {target}': '{name} (زميلك) أسقط {target}',

    // ---- title menu and the host / join menu ----
    'Co-op (beta)': 'اللعب التعاوني (تجريبي)',
    'two gunners, one B-17 · online': 'راميان في B-17 واحدة · عبر الإنترنت',
    'ONLINE · PEER TO PEER': 'عبر الإنترنت · اتصال مباشر بين اللاعبين',
    'Two gunners crew the same Fortress in Survival. One player hosts and runs the battle; the other joins with a code.':
      'راميان يشغلان القلعة الطائرة نفسها في وضع البقاء. يستضيف أحدهما اللعبة ويدير المعركة، وينضم الآخر برمز.',
    'Host a game': 'استضف لعبة',
    'Join a game': 'انضم إلى لعبة',
    'CODE': 'الرمز',
    'Join code': 'رمز الانضمام',
    'Join': 'انضم',
    'Prototype. Peer-to-peer with no relay server, so some networks (strict firewalls, some corporate, campus and mobile networks) cannot connect.':
      'نسخة أولية. الاتصال مباشر بين اللاعبين بلا خادم ترحيل، لذا تعجز بعض الشبكات عن الاتصال (جدران الحماية الصارمة، وبعض شبكات الشركات والجامعات وشبكات الهاتف المحمول).',

    // ---- stand-by screen and lobby ----
    'CO-OP (BETA)': 'اللعب التعاوني (تجريبي)',
    'Stand by': 'انتظر',
    'Cancel': 'إلغاء',
    'CO-OP (BETA) · SURVIVAL · B-17 GUNNERS': 'اللعب التعاوني (تجريبي) · البقاء · رماة B-17',
    'Join code — give it to your partner': 'رمز الانضمام — أعطِه لزميلك',
    'Joined game': 'انضممت إلى اللعبة',
    'Your gun position': 'موقع رمايتك',
    'Start mission': 'ابدأ المهمة',
    'Leave': 'غادر',
    'You run the battle: if your partner drops out you carry on alone.': 'أنت تدير المعركة: إن انقطع زميلك تواصل وحدك.',
    'The host starts the mission. If the host leaves, the game ends.': 'المضيف يبدأ المهمة. وإن غادر المضيف تنتهي اللعبة.',
    'PARTNER': 'الزميل',
    'partner': 'زميلك',

    // ---- connection indicator (tooltip) ----
    'Connection: waiting for a reply': 'الاتصال: في انتظار الرد',
    'Connection: {ms} ms round trip': 'الاتصال: {ms} ملّي ثانية ذهاباً وإياباً',

    // ---- status and errors ----
    'Creating a game…': 'جارٍ إنشاء اللعبة…',
    'Waiting for your partner to join…': 'في انتظار انضمام زميلك…',
    'Could not create a game. Check your connection and try again.': 'تعذّر إنشاء اللعبة. تحقّق من اتصالك وحاول مجدداً.',
    'A join code is 6 letters and digits.': 'رمز الانضمام 6 أحرف وأرقام.',
    'Connecting to the host…': 'جارٍ الاتصال بالمضيف…',
    'Could not connect to the host. Your networks may not allow a direct connection (there is no relay server).':
      'تعذّر الاتصال بالمضيف. قد لا تسمح شبكتاكما باتصال مباشر (لا يوجد خادم ترحيل).',
    'Could not reach the game server. Check your connection.': 'تعذّر الوصول إلى خادم اللعبة. تحقّق من اتصالك.',
    'That room has expired or does not exist.': 'انتهت صلاحية هذه الغرفة أو أنها غير موجودة.',
    'No game with that code. Check it and try again.': 'لا توجد لعبة بهذا الرمز. تحقّق منه وحاول مجدداً.',
    'That game already has two gunners.': 'هذه اللعبة فيها راميان بالفعل.',
    'Could not join that game (it may have just been taken or expired).': 'تعذّر الانضمام إلى هذه اللعبة (ربما شُغلت للتو أو انتهت صلاحيتها).',
    'Partner connected — pick your guns and start': 'اتصل زميلك — اختر مدفعك وابدأ',
    'Connected — waiting for the host to start': 'تمّ الاتصال — في انتظار أن يبدأ المضيف',

    // ---- disconnects ----
    'Your partner left — carrying on alone': 'غادر زميلك — تواصل وحدك',
    'Lost your partner — carrying on alone': 'انقطع الاتصال بزميلك — تواصل وحدك',
    'Partner disconnected': 'انقطع اتصال الزميل',
    'Your partner left.': 'غادر زميلك.',
    'The connection to your partner was lost.': 'انقطع الاتصال بزميلك.',
    'The host left the game. Co-op session ended.': 'غادر المضيف اللعبة. انتهت الجلسة التعاونية.',
    'Lost the connection to the host. Co-op session ended.': 'انقطع الاتصال بالمضيف. انتهت الجلسة التعاونية.',

    // ---- in the mission ----
    'Your partner took that gun': 'زميلك أخذ هذا المدفع',
    'Waiting for the host…': 'في انتظار المضيف…',
    'The mission is over.': 'انتهت المهمة.',
    'MISSION OVER': 'انتهت المهمة',
    'The Fortress is lost': 'سقطت القلعة الطائرة',
    'Co-op Survival — Gunners': 'البقاء التعاوني — الرماة',
  },
  patterns,
};
export default table;
