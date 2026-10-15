import type { PhraseTable } from '../types';
// Phase 11 goal 34: co-op spectators, streamer mode and the broadcast delay
const table: PhraseTable = { phrases: {
  // spectator overlay (ui/SpectatorHud.ts)
  'SPECTATING': 'مشاهدة',
  'Delay {n} s': 'تأخير {n} ث',
  'Waiting for the picture…': 'بانتظار الصورة…',
  '1–5 gun positions · C cinematic · ← → switch': '1–5 مواقع الرشاشات · C الكاميرا السينمائية · ← → تبديل',
  'Cinematic': 'سينمائية',
  'Auto camera': 'كاميرا تلقائية',
  'AI gunner': 'الرامي الآلي',
  'Stop watching': 'أوقف المشاهدة',
  'Leave the game': 'غادر اللعبة',
  // streamer mode (ui/Streamer.ts, Settings)
  'Gunner {n}': 'الرامي {n}',
  'Show': 'أظهر',
  'Streamer mode': 'وضع البث',
  'Hides join codes, callsigns and the cloud-save code, and makes the HUD bigger.': 'يخفي رموز الانضمام والأسماء ورمز الحفظ السحابي، ويكبّر واجهة اللعب.',
  'Spectator delay': 'تأخير المشاهدة',
  'Co-op spectators see the battle this much later.': 'يرى مشاهدو اللعب التعاوني المعركة متأخرة بهذا القدر.',
  // co-op screens (ui/CoopScreen.ts) and session (game/CoopSession.ts)
  'Watch the crew without a gun: any gun position or a cinematic camera': 'شاهد الطاقم دون رشاش: أي موقع رشاش أو كاميرا سينمائية',
  'Spectators watching: {n}': 'المشاهدون الآن: {n}',
  'Watching game': 'لعبة تشاهدها',
  'You are a spectator: watch any gun position or the cinematic camera. You cannot fire.': 'أنت مشاهد: تابع أي موقع رشاش أو الكاميرا السينمائية. لا يمكنك الإطلاق.',
  'The broadcast runs {n} s behind.': 'البث متأخر {n} ث.',
  'The mission has started — your delayed picture begins in {n} s': 'بدأت المهمة — تبدأ صورتك المؤجلة بعد {n} ث',
  'A spectator is watching': 'مشاهد يتابع الطاقم',
  'Joining as a spectator…': 'جارٍ الانضمام كمشاهد…',
  'No spectator seat free, or this game cannot be watched.': 'لا مقعد مشاهدة متاح، أو لا يمكن مشاهدة هذه اللعبة.',
  'Watching — waiting for the host to start': 'تشاهد الآن — بانتظار أن يبدأ المضيف',
  'The host left — the broadcast has ended.': 'غادر المضيف — انتهى البث.',
  'Could not copy the invite link.': 'تعذّر نسخ رابط الدعوة.',
  // Field Manual (game/FieldManual.ts, co-op section)
  'Watch: enter a crew\'s code and press Watch to follow the battle without a gun, from any gun position (1–5) or the cinematic camera (C). Settings → Spectator delay holds the picture back; Streamer mode hides codes and callsigns and makes the HUD bigger.':
    'المشاهدة: أدخل رمز الطاقم واضغط «شاهد» لمتابعة المعركة دون رشاش، من أي موقع رشاش (1–5) أو بالكاميرا السينمائية (C). الإعدادات ← تأخير المشاهدة يؤخّر الصورة؛ ووضع البث يخفي الرموز والأسماء ويكبّر واجهة اللعب.',
} };
export default table;
