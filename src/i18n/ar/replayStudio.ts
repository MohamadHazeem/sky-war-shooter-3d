import type { PhraseTable } from '../types';

// Arabic for replay and photo mode 2.0 (Phase 11 goal 20): the theatre's chase camera, film
// look picker, slow-motion switch, share card and WebM clip recorder (game/ReplayStudio.ts,
// game/Theatre.ts, ui/TheatreScreen.ts). 'Film', 'Kodachrome', 'Newsreel B&W' and 'Film look'
// come from cinema.ts.

const table: PhraseTable = {
  phrases: {
    // camera + film look
    'Chase': 'مطاردة',
    'As in Settings': 'كما في الإعدادات',
    'Clean': 'صافية',
    'Slow motion on moments': 'حركة بطيئة عند اللقطات المميزة',
    // share card
    'Share card': 'بطاقة للمشاركة',
    'The current view as a picture card with the mission, the moment and your kills': 'المشهد الحالي كبطاقة مصوّرة تضم المهمة واللقطة وعدد إسقاطاتك',
    '1 kill in this replay': 'إسقاط واحد في هذه الإعادة',
    '{n} kills in this replay': 'إسقاطات في هذه الإعادة: {n}',
    'Card shared': 'شوركت البطاقة',
    'Card saved': 'حُفظت البطاقة',
    'Card saved · share text and link copied': 'حُفظت البطاقة · نُسخ نص المشاركة والرابط',
    // WebM clips
    'Record clip': 'تسجيل مقطع',
    'Stop recording': 'إيقاف التسجيل',
    'REC': 'تسجيل',
    'Plays the best moment and saves it as a short WebM video': 'يعرض أفضل لقطة ويحفظها مقطع فيديو قصيراً بصيغة WebM',
    'Recording the best moment…': 'جارٍ تسجيل أفضل لقطة…',
    'Saving clip…': 'جارٍ حفظ المقطع…',
    'Clip saved (WebM video)': 'حُفظ المقطع (فيديو WebM)',
    'Could not record the clip': 'تعذّر تسجيل المقطع',
    'Video clips are not supported in this browser': 'هذا المتصفح لا يدعم تسجيل المقاطع',
  },
};
export default table;
