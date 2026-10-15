import type { PhraseTable } from '../types';

// Arabic for Phase 11 · 33, the co-op crew intercom (ui/IntercomHud.ts, game/CrewIntercom.ts,
// the Talk key in core/KeyMap.ts). Intercom = الاتصال الداخلي, push to talk = اضغط للتحدث.
const table: PhraseTable = {
  phrases: {
    'Push to talk (co-op intercom)': 'اضغط للتحدث (الاتصال الداخلي في اللعب الجماعي)',
    'Crew intercom': 'الاتصال الداخلي للطاقم',
    'Hold to talk': 'اضغط مطولاً للتحدث',
    'Talking': 'يتحدث',
    'Volume of {name}': 'مستوى صوت {name}',
    'Mute': 'كتم',
    'Unmute': 'إلغاء الكتم',
    'Intercom volume': 'مستوى صوت الاتصال الداخلي',
    'Microphone on': 'الميكروفون يعمل',
    'Asking for the microphone…': 'جارٍ طلب إذن الميكروفون…',
    'Microphone blocked — allow it in the browser to talk': 'الميكروفون محظور — اسمح به في المتصفح لتتحدث',
    'The microphone turns on the first time you talk': 'يعمل الميكروفون عند أول مرة تتحدث فيها',
    'Microphone blocked — text pings still work': 'الميكروفون محظور — ما زالت الإشارات النصية تعمل',
  },
};

export default table;
