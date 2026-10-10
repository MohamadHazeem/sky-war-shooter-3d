import type { PhraseTable } from '../types';

// Arabic for the mission bookends (Bookends.ts): the take-off and landing scenes at the
// Deenethorpe airfield — radio lines, the speaker "Tower", the letterbox captions.

const table: PhraseTable = {
  phrases: {
    // speaker
    'Tower': 'برج المراقبة',

    // radio: take-off
    'Deenethorpe tower to Sky Queen: you are cleared for take-off. Good hunting.':
      'برج دينيثورب إلى Sky Queen: مسموح لكم بالإقلاع. صيداً موفقاً.',
    'Tail wheel locked… full power.': 'العجلة الخلفية مقفلة… القدرة الكاملة.',
    'Ninety… one-ten… she\'s flying! Gear up.': 'تسعون… مئة وعشرة… إنها تطير! ارفعوا العجلات.',
    'Pilot to crew: climbing through the overcast. We form up on top.':
      'الطيار إلى الطاقم: نصعد عبر الغيوم. سنتّخذ التشكيل فوقها.',

    // radio: landing
    'Pilot to crew: letting down through the overcast. We\'re nearly home.':
      'الطيار إلى الطاقم: نهبط عبر الغيوم. اقتربنا من الديار.',
    'Sky Queen, you are number one to land. Welcome home.': 'Sky Queen، أنتم الأوائل في الهبوط. أهلاً بعودتكم.',
    'Wounded aboard — firing red flares!': 'جرحى على متن الطائرة — نطلق الشعلات الحمراء!',
    'Crash crew, stand by! Ambulances to the runway!': 'فرق الطوارئ، استعدّوا! سيارات الإسعاف إلى المدرج!',
    'The gear won\'t come down — brace for a belly landing!': 'العجلات لا تنزل — استعدّوا للهبوط على البطن!',
    'We\'re down! Everybody out — move!': 'هبطنا! الجميع إلى الخارج — تحرّكوا!',
    'Home in one piece. Nice work, everybody.': 'عدنا سالمين. أحسنتم جميعاً.',

    // letterbox captions
    'DEENETHORPE · STATION 128': 'دينيثورب · المحطة 128',
    '401ST BOMB GROUP · TAKE-OFF': 'مجموعة القاذفات 401 · الإقلاع',
    '401ST BOMB GROUP · RETURN TO BASE': 'مجموعة القاذفات 401 · العودة إلى القاعدة',
  },
};

export default table;
