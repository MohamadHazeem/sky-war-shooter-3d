import type { PhraseTable } from '../types';
const table: PhraseTable = { phrases: {
  'Ju 88 Gs only': 'طائرات يو 88 جي فقط',
  'Ju 88 G': 'يو 88 جي',
  'Junkers Ju 88 G-6': 'يونكرز يو 88 جي-6',
  'Radar night fighter': 'مقاتلة ليلية مزودة برادار',
  'radar night fighter — attacks from below with upward-firing cannon': 'مقاتلة ليلية مزودة برادار — تهاجم من الأسفل بمدافع موجهة إلى الأعلى',
  'Ju 88 Gs coming in — radar night fighter — attacks from below with upward-firing cannon!': 'مقاتلات يو 88 جي قادمة — مزودة برادار وتهاجم من الأسفل بمدافع موجهة إلى الأعلى!',
  '4 × 20 mm forward cannon · 2 × 20 mm upward-firing cannon': '4 مدافع أمامية عيار 20 ملم · مدفعان موجهان إلى الأعلى عيار 20 ملم',
  '388 mph (625 km/h)': '388 ميلاً/س (625 كم/س)',
  '20.1 m × 15.5 m': '20.1 م × 15.5 م',
  'Radar finds the bomber in darkness. Watch below: the upward cannon cannot fire sideways.': 'يرصد الرادار القاذفة في الظلام. راقب الأسفل: المدافع الموجهة إلى الأعلى لا تستطيع إطلاق النار جانبياً.',
  'Night fighter below us! Watch his upward cannon!': 'مقاتلة ليلية أسفلنا! انتبهوا لمدافعها الموجهة إلى الأعلى!',
  'NIGHT FIGHTER': 'مقاتلة ليلية',
  'Ju 88 G below — use the BALL turret before its upward cannon lines up.': 'يو 88 جي في الأسفل — استخدم البرج الكروي قبل أن تصوّب مدافعها إلى الأعلى.',
}, patterns: [
  [/^(?=.*Ju 88 G)(?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335)(?:, (?:Fw 190|Bf 109|Bf 110|Ju 88 G|Ju 88|Me 262|Me 163|Me 410|He 111|Do 335))+$/, (m, tr) => m[0].split(', ').map(tr).join('، ')],
] };
export default table;
