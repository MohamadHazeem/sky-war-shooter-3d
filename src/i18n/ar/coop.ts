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
