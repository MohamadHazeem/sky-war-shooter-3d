import type { PhraseTable } from '../types';
// Phase 11 · 15 — touch and phone gunner: gyro aim, gun-position and reload buttons, phone
// performance mode, the "Install Sky War" card.
export default { phrases: {
  // touch HUD
  'GYRO': 'جيرو',
  'Gyro aim': 'التصويب بالجيروسكوب',
  'RELOAD': 'تلقيم',
  'Previous gun position': 'موقع الرشاش السابق',
  'Next gun position': 'موقع الرشاش التالي',
  'Gyro aim off': 'أُوقف التصويب بالجيروسكوب',
  'Gyro aim on — turn the phone to aim': 'التصويب بالجيروسكوب مفعّل — أدر الهاتف لتصوّب',
  'Motion access was refused: allow it in the browser settings': 'رُفض الوصول إلى مستشعر الحركة: اسمح به من إعدادات المتصفح',
  'This device has no gyro': 'لا يحتوي هذا الجهاز على جيروسكوب',
  // Settings → Touch & gamepad
  'Gyro aim (turn the phone to aim)': 'التصويب بالجيروسكوب (أدر الهاتف لتصوّب)',
  'Gyro sensitivity': 'حساسية الجيروسكوب',
  'Phone performance mode': 'وضع أداء الهاتف',
  'Phone performance mode renders fewer pixels and effects so a phone stays smooth and cool.': 'يرسم وضع أداء الهاتف بكسلات ومؤثرات أقل ليبقى الهاتف سلسًا وباردًا.',
  // install card
  'Install Sky War': 'ثبّت حرب السماء',
  'Play full screen from your home screen, even offline.': 'العب بملء الشاشة من شاشتك الرئيسية، حتى دون اتصال.',
  'Tap Share, then “Add to Home Screen” to play full screen, even offline.': 'اضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية» لتلعب بملء الشاشة، حتى دون اتصال.',
  'Install': 'تثبيت',
  'Not now': 'ليس الآن',
  'Got it': 'فهمت',
} } satisfies PhraseTable;
