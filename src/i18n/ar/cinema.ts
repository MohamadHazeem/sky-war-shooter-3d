import type { PhraseTable } from '../types';

// Arabic for the combat director and the film look (Phase 10 goal 10): Settings rows
// (ui/UI.ts), director shot captions (game/Cinematics.ts startShot) and the mission-end
// combat film (game/Theatre.ts openReel, debrief button).

export const CINEMA_PHRASES: Record<string, string> = {
  // Settings
  'Combat director': 'المخرج القتالي',
  'Rare': 'نادر',
  'Often': 'كثيراً',
  'Film look': 'المظهر السينمائي',
  'Film': 'فيلم',
  'Kodachrome': 'كوداكروم',
  'Newsreel B&W': 'جريدة سينمائية بالأبيض والأسود',
  // director shots
  'GUN CAMERA FILM': 'فيلم كاميرا المدفع',
  'WAIST WINDOW': 'نافذة الخصر',
  'WING CAMERA': 'كاميرا الجناح',
  'FROM “{name}”': 'من «{name}»',
  'FROM THE NEXT SHIP': 'من القاذفة المجاورة',
  '{what} · CLOSE PASS': '{what} · مرور قريب',
  // combat film
  'COMBAT FILM': 'فيلم المعركة',
  '▶ Combat film': '▶ فيلم المعركة',
};

const table: PhraseTable = { phrases: CINEMA_PHRASES };
export default table;
