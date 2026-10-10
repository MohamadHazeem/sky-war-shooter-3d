import type { PhraseTable, Pattern } from '../types';
import { ltr, counted } from './fmt';

// Arabic for the canvas HUD text drawn each frame: the wingman panel (Wingman.ts drawOverlay),
// the raid-mission markers (RaidDefence.ts), the escort bomber markers (PilotOps.ts) and the
// pilot's gunsight range and padlock readouts (PilotController.ts). Designations (Fw 190) and
// the numbers stay in Western digits; metres are م, kilometres كم, miles per hour ميل/س.

const kills = (n: string) => (+n === 0 ? 'لا إسقاطات' : counted(n, 'إسقاط واحد', 'إسقاطان', 'إسقاطات', 'إسقاطاً'));
const signed = (s: string) => ltr(s);

const patterns: Pattern[] = [
  // wingman panel
  [/^(\d+)%  ·  (\d+) kills?$/, (m) => `${m[1]}%  ·  ${kills(m[2])}`],
  [/^replacement next round · (\d+) kills?$/, (m) => `بديل في الجولة القادمة · ${kills(m[1])}`],
  // raid missions
  [/^AIRFIELD ([\d.]+) km$/, 'المطار $1 كم'],
  [/^(CONED · )?([\d.]+) km TO FIELD$/, (m) => `${m[1] ? 'تحت الكشّافات · ' : ''}${m[2]} كم عن المطار`],
  // escort bomber markers
  [/^UNDER ATTACK ×(\d+)$/, (m) => `تحت الهجوم ${ltr(`×${m[1]}`)}`],
  [/^STRAGGLER (\d+)%( — UNDER ATTACK)?$/, (m) => `القاذفة المتخلّفة ${m[1]}%${m[2] ? ' — تحت الهجوم' : ''}`],
  // gunsight range and padlock
  [/^IN RANGE (\d+)m$/, 'في المدى $1 م'],
  [/^(\d+)m$/, '$1 م'],
  [/^LOCK (\d+)m ([+-]?\d+)mph$/, (m) => `تثبيت ${m[1]} م ${signed(m[2])} ميل/س`],
  [/^LOCK (\d+)m$/, 'تثبيت $1 م'],
];

const table: PhraseTable = {
  phrases: {
    // wingman orders as shown on his panel, and the key list
    'ATTACK MY TARGET': 'هاجم هدفي',
    'COVER ME': 'غطِّني',
    'PROTECT THE BOMBERS': 'احمِ القاذفات',
    'FORM UP': 'عُد إلى التشكيل',
    'DOWN': 'أُسقِط',
    '1 ATK  2 COVER  3 BOMBERS  4 FORM': '1 هجوم  2 تغطية  3 القاذفات  4 التشكيل',
    // the same orders as remappable keys (settings) and touch buttons (DeviceControls.ts)
    'P-51 wingman: attack my target': 'الجناح المرافق P-51: هاجم هدفي',
    'P-51 wingman: cover me': 'الجناح المرافق P-51: غطِّني',
    'P-51 wingman: protect the bombers': 'الجناح المرافق P-51: احمِ القاذفات',
    'P-51 wingman: form up': 'الجناح المرافق P-51: عُد إلى التشكيل',
    'ATK': 'هجوم',
    'COVER': 'تغطية',
    'BOMB': 'القاذفات',
    'FORM': 'التشكيل',
    'Wingman: {order}': 'الجناح المرافق: {order}',

    // escort bomber markers
    'UNDER ATTACK': 'تحت الهجوم',
    // PilotOps tip at the start of an escort mission
    '<kbd>T</kbd> padlocks the nearest bandit — the view tracks him while you fly · <kbd>V</kbd> cockpit / chase':
      '<kbd>T</kbd> يثبّت النظر على أقرب معادٍ — يتبعه المنظر وأنت تطير · <kbd>V</kbd> قمرة القيادة / المطاردة',

    // padlock notes: the bandit's manoeuvre (DogfightAI labels)
    'NO TARGET': 'لا هدف',
    'SPLASHED': 'أُسقِطت',
    'ENGAGING': 'يشتبك',
    'ATTACKING': 'يهاجم',
    'BREAKING': 'ينعطف هارباً',
    'SCISSORS': 'مناورة المقصّ',
    'SPIRALLING': 'يهبط حلزونياً',
    'EXTENDING': 'يبتعد',
    'CLIMBING': 'يتسلّق',
    'UNLOADING': 'يستعيد سرعته',
    'HEAD-ON': 'وجهاً لوجه',
    'COVERING LEAD': 'يغطّي قائده',
  },
  patterns,
};
export default table;
