import type { PhraseTable, Pattern } from '../types';

// Arabic for the replay theatre (game/Theatre.ts, game/Recorder.ts markLabel, ui/TheatreScreen.ts):
// the playback interface, camera modes, photo panel, status messages, timeline moments, the
// saved-moments library and its title-menu / debrief entries; and the FPS counter overlay
// (render/FpsCounter.ts).

const MARK = '(Double kill|Triple kill|\\d+× kill|Boss kill|Ace down|Close call|Near miss|Kill|Moment)';

const patterns: Pattern[] = [
  [/^(\d+)× kill$/, 'إسقاط ×$1'],
  // the recording's title, "Mission 3 · Baptism of Fire" (Theatre.newMission)
  [/^Mission (\d+) · (.+)$/, (m, tr) => `المهمة ${m[1]} · ${tr(m[2])}`],
  // a saved moment: "<mark> · <recording title>"
  [new RegExp(`^${MARK} · (.+)$`), (m, tr) => `${tr(m[1])} · ${tr(m[2])}`],
  // aircraft list: "You · B-17", "<type> #12"
  [/^You · (P-51|B-17)$/, 'أنت · $1'],
  [/^(.+) #(\d+)$/, (m, tr) => `${tr(m[1])} #${m[2]}`],
  // status line
  [/^Saved (\d+)×(\d+) PNG$/, 'حُفظت صورة PNG بمقاس $1×$2'],
  [/^Moment saved \((\d+)\/(\d+)\)$/, 'حُفظت اللقطة ($1/$2)'],
  [/^(\d+)\/(\d+) saved: delete one from Theatre in the title menu first$/, 'المحفوظ $1/$2: احذف لقطة من «المسرح» في القائمة الرئيسية أولاً'],
  [/^(\d+)\/(\d+) saved: delete one first$/, 'المحفوظ $1/$2: احذف لقطة أولاً'],
];

const table: PhraseTable = {
  phrases: {
    // ---------------- timeline moments (Recorder.markLabel) ----------------
    'Double kill': 'إسقاط مزدوج',
    'Triple kill': 'إسقاط ثلاثي',
    'Boss kill': 'إسقاط طائرة عملاقة',
    'Ace down': 'سقط الآس',
    'Close call': 'نجاة بأعجوبة',
    'Near miss': 'إصابة وشيكة',
    'Kill': 'إسقاط',
    'Moment': 'لقطة',
    'Replay': 'إعادة',
    'Mission': 'مهمة',

    // ---------------- playback interface (TheatreScreen.ts) ----------------
    'REPLAY THEATRE': 'مسرح الإعادة',
    'Hide the interface (H)': 'إخفاء الواجهة (H)',
    'Hide UI': 'إخفاء الواجهة',
    'Back (Esc)': 'رجوع (Esc)',
    'Exit': 'خروج',
    'Camera': 'الكاميرا',
    'Player': 'اللاعب',
    'Orbit': 'مدار',
    'Free': 'حرّة',
    'Director': 'المخرج',
    'Aircraft': 'الطائرات',
    '· Tab cycles': '· Tab للتنقّل',
    'Space play/pause · ←/→ frame · Shift+←/→ 5 s · ,/. moments · 1–4 camera · Free: WASD Q/E, drag to look, Shift fast · Orbit: drag, wheel · H hide UI · Esc exit':
      'المسافة تشغيل/إيقاف · ←/→ إطار · Shift+←/→ ‏5 ث · ,/. اللقطات · 1–4 الكاميرا · الحرّة: WASD وQ/E، اسحب للنظر، Shift للإسراع · المدار: اسحب، العجلة · H إخفاء الواجهة · Esc خروج',
    'Photo': 'التصوير',
    'Field of view': 'مجال الرؤية',
    'Auto FOV': 'مجال رؤية تلقائي',
    'Depth of field': 'عمق الميدان',
    'Focus distance': 'مسافة التركيز',
    'Exposure': 'التعريض',
    'Resolution': 'الدقة',
    'Screen': 'الشاشة',
    '2× screen': '2× الشاشة',
    '3× screen': '3× الشاشة',
    'Save screenshot': 'حفظ لقطة شاشة',
    'Moments': 'اللقطات',
    'Keep the 15 s around the playhead (up to 5 saved)': 'احفظ الثواني الـ15 المحيطة بمؤشر التشغيل (حتى 5 لقطات)',
    'Save moment': 'حفظ اللقطة',
    'Previous moment (,)': 'اللقطة السابقة (,)',
    'Step back one frame (←)': 'إطار واحد إلى الخلف (←)',
    'Play / pause (Space)': 'تشغيل / إيقاف (المسافة)',
    'Step forward one frame (→)': 'إطار واحد إلى الأمام (→)',
    'Next moment (.)': 'اللقطة التالية (.)',
    'H — SHOW INTERFACE': 'H — إظهار الواجهة',
    'auto': 'تلقائي',
    'off': 'معطّلة',
    '{n} m': '{n} م',
    'Rendering…': 'جارٍ التصيير…',
    'Saving…': 'جارٍ الحفظ…',
    'Screenshot failed': 'تعذّر حفظ لقطة الشاشة',
    'Nothing to save here': 'لا شيء للحفظ هنا',
    'Could not save (storage unavailable)': 'تعذّر الحفظ (التخزين غير متاح)',

    // ---------------- saved moments library ----------------
    'Saved moments': 'اللقطات المحفوظة',
    '{n} s': '{n} ث',
    'Watch': 'شاهد',
    'Delete': 'حذف',
    'No saved moments yet. After a mission, open the Replay theatre from the debriefing and press “Save moment” (up to 5 are kept).':
      'لا لقطات محفوظة بعد. بعد أي مهمة، افتح «مسرح الإعادة» من شاشة استخلاص المعلومات واضغط «حفظ اللقطة» (تُحفظ حتى 5 لقطات).',
    'Replay theatre': 'مسرح الإعادة',
    'Theatre': 'المسرح',
    'saved moments': 'اللقطات المحفوظة',
    'You': 'أنت',

    // ---------------- FPS counter (FpsCounter.ts) ----------------
    'fps': 'إطار/ث',
    'ms': 'ملّي ث',
    'Hz': 'هرتز',
    'max {n}': 'الأقصى {n}',
    '{n}% res': 'الدقة {n}%',
  },
  patterns,
};
export default table;
