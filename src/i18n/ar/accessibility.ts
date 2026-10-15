// Phase 11 goal 14: gamepad remapping, aim-assist presets, colour-blind palettes, one-handed mouse.
import type { PhraseTable } from '../types';
const table: PhraseTable = { phrases: {
  // aim-assist preset (Settings)
  'Strong (accessibility)': 'قوية (لتسهيل الوصول)',
  // accessibility section
  'Blue-yellow safe (teal friends, pink foes)': 'آمنة للأزرق والأصفر (الأصدقاء بالفيروزي، الأعداء بالوردي)',
  'High contrast (white friends, yellow foes)': 'تباين عالٍ (الأصدقاء بالأبيض، الأعداء بالأصفر)',
  'Extra large': 'كبير جدًا',
  'Reduce motion (shake, slow motion)': 'تقليل الحركة (الاهتزاز والحركة البطيئة)',
  'Reduce flashes': 'تقليل الومضات',
  'One-handed mouse': 'الفأرة بيد واحدة',
  'Gunner on a mouse alone: wheel = gun position · middle click = reload (hold = bombsight) · side buttons = abilities.': 'الرامي بالفأرة وحدها: العجلة = موقع الرماية · النقر الأوسط = إعادة التلقيم (الضغط المطوّل = منظار القصف) · الأزرار الجانبية = القدرات.',
  // gamepad section
  'Gamepad aim speed': 'سرعة التصويب بيد التحكم',
  'Left-handed sticks': 'العصوان لليد اليسرى',
  'On (aim with the left stick)': 'تشغيل (التصويب بالعصا اليسرى)',
  'Stronger aim assist on a gamepad': 'مساعدة تصويب أقوى مع يد التحكم',
  // gamepad summary line, built from the button map and the stick side
  'Gamepad ready: {stick} · {fire} fire · {zoom} zoom · {prev}/{next} gun position · {reload} reload · {map} map · Start pause': 'يد التحكم جاهزة: {stick} · {fire} للإطلاق · {zoom} للتقريب · {prev}/{next} لموقع الرماية · {reload} لإعادة التلقيم · {map} للخريطة · Start للإيقاف المؤقت',
  'Gamepad: plug one in and press any button. {stick}, {fire} fires, {zoom} zooms, {prev}/{next} change gun position, Start pauses.': 'يد التحكم: وصّل واحدة واضغط أي زر. {stick}، و{fire} للإطلاق، و{zoom} للتقريب، و{prev}/{next} لتغيير موقع الرماية، وStart للإيقاف المؤقت.',
  'right stick aim': 'العصا اليمنى للتصويب',
  'left stick aim': 'العصا اليسرى للتصويب',
  'Right stick aims': 'العصا اليمنى للتصويب',
  'Left stick aims': 'العصا اليسرى للتصويب',
  'Gamepad buttons': 'أزرار يد التحكم',
  'Press A on an action, then the new button. Start or View cancels; they stay fixed.': 'اضغط A على إجراء، ثم الزر الجديد. Start أو View للإلغاء؛ فهما ثابتان.',
  'Reset gamepad to defaults': 'إعادة يد التحكم إلى الوضع الافتراضي',
  'Gamepad reset to defaults.': 'أُعيدت يد التحكم إلى الوضع الافتراضي.',
  'Press a button…': 'اضغط زرًّا…',
  // remappable gamepad actions (core/PadMap.ts)
  'Zoom / look down the sight': 'تقريب / النظر عبر المهداف',
  'Bombsight (P-51: cockpit / chase view)': 'منظار القصف (P-51: منظر القمرة / المطاردة)',
  'Previous gun position': 'موقع الرماية السابق',
  'Next gun position': 'موقع الرماية التالي',
  'Ping target (P-51: wingman cover me)': 'حدّد الهدف (P-51: الجناح المرافق يغطيني)',
  'Ability: call the Mustangs': 'قدرة: استدعاء الموستانغ',
  'Ability: Overdrive': 'قدرة: الطاقة القصوى',
  'Ability: Focus': 'قدرة: التركيز',
} };
export default table;
