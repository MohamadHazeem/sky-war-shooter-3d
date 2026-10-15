import type { PhraseTable } from '../types';

// Arabic for Phase 11 · 18, co-op lobbies: the public game list and quick join (ui/CoopScreen.ts),
// invite links, region / latency hints (net/Lobbies.ts), rejoin and host migration (game/CoopSession.ts).
// Host = المضيف, crew = الطاقم, join code = رمز الانضمام (as in coop.ts).
const table: PhraseTable = {
  phrases: {
    // ---- the co-op menu ----
    'List it publicly — anyone can join': 'اعرضها للعموم — يمكن لأي لاعب الانضمام',
    'Quick join': 'انضمام سريع',
    'Find a game': 'ابحث عن لعبة',
    'Rejoin your last crew': 'عُد إلى طاقمك الأخير',
    'Looking for a crew…': 'جارٍ البحث عن طاقم…',
    'No open crews right now. Host a public game and others can find it.': 'لا توجد طواقم متاحة الآن. استضف لعبة عامة ليجدها الآخرون.',
    'Could not load the game list. Check your connection and try again.': 'تعذّر تحميل قائمة الألعاب. تحقق من اتصالك وحاول مجدداً.',

    // ---- the public game list ----
    'Public games': 'الألعاب العامة',
    'Looking for games…': 'جارٍ البحث عن ألعاب…',
    'Your region': 'منطقتك',
    'Closest crews first; the bars estimate the connection.': 'الطواقم الأقرب أولاً؛ تقدّر الأشرطة جودة الاتصال.',
    'In the lobby': 'في الردهة',
    'In battle · wave {n}': 'في المعركة · الموجة {n}',
    'Estimated round trip: {ms} ms': 'زمن الذهاب والإياب المقدّر: {ms} ملّي ثانية',
    'Refresh': 'تحديث',
    'Europe': 'أوروبا',
    'North America': 'أمريكا الشمالية',
    'South America': 'أمريكا الجنوبية',
    'Africa': 'أفريقيا',
    'Middle East': 'الشرق الأوسط',
    'Asia': 'آسيا',
    'Oceania': 'أوقيانوسيا',
    'Unknown region': 'منطقة غير معروفة',

    // ---- the lobby: invites and listing ----
    'Copy invite link': 'انسخ رابط الدعوة',
    'Invite link copied — send it to a friend': 'نُسخ رابط الدعوة — أرسله إلى صديق',
    'Listed publicly — players can find this crew': 'معروضة للعموم — يمكن للاعبين العثور على هذا الطاقم',
    'Private — only people with the code or link can join': 'خاصة — لا ينضم إلا من لديه الرمز أو الرابط',

    // ---- rejoin and host migration ----
    'Connection lost — rejoining…': 'انقطع الاتصال — جارٍ العودة…',
    'Back aboard': 'عدت على متن الطائرة',
    'The host left — you now run the battle': 'غادر المضيف — أنت الآن تدير المعركة',
    'You are the new host': 'أنت المضيف الجديد',
    'Could not reopen the crew rooms — carrying on alone': 'تعذّر فتح غرف الطاقم من جديد — تواصل وحدك',
    'The host left. Return to the co-op lobby to rejoin your crew under the new host.': 'غادر المضيف. عُد إلى ردهة اللعب التعاوني لتنضم إلى طاقمك مع المضيف الجديد.',
  },
};
export default table;
