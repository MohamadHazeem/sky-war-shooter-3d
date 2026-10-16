// How the Arabic voice-over speaks an Arabic subtitle (tools/voice/arabic.mjs, offline only).
// The subtitle keeps Western digits and Latin designations (Fw 190, Sky Queen) for readability;
// the speech model needs words: digits are spelled out, aircraft and bomber names transliterated,
// dashes and ellipses become pauses.

const ONES = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const TEENS = ['', 'أحد عشر', 'اثنا عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

/** Cardinal number in Arabic words (masculine, 0..999999). */
export function arabicNumber(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n <= 10) return ONES[n];
  if (n < 13) return TEENS[n - 10];
  if (n < 20) return `${ONES[n - 10]} عشر`;
  if (n < 100) return n % 10 ? `${ONES[n % 10]} و${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  if (n < 1000) { const r = n % 100; return HUNDREDS[Math.floor(n / 100)] + (r ? ` و${arabicNumber(r)}` : ''); }
  if (n < 1000000) {
    const k = Math.floor(n / 1000), r = n % 1000;
    const head = k === 1 ? 'ألف' : k === 2 ? 'ألفان' : k <= 10 ? `${arabicNumber(k)} آلاف` : `${arabicNumber(k)} ألف`;
    return head + (r ? ` و${arabicNumber(r)}` : '');
  }
  return String(n);
}

// Latin letters as Arabic speakers say them (key names, model suffixes)
const LETTER: Record<string, string> = {
  A: 'إيه', B: 'بي', C: 'سي', D: 'دي', E: 'إي', F: 'إف', G: 'جي', H: 'إتش', I: 'آي', J: 'جيه', K: 'كيه', L: 'إل', M: 'إم',
  N: 'إن', O: 'أو', P: 'بي', Q: 'كيو', R: 'آر', S: 'إس', T: 'تي', U: 'يو', V: 'في', W: 'دبليو', X: 'إكس', Y: 'واي', Z: 'زد',
};
const MAKER: Record<string, string> = { Fw: 'فوكه وولف', Bf: 'مسرشميت', Me: 'مسرشميت', Ju: 'يونكرز', He: 'هاينكل', Do: 'دورنير' };
// bomber names and other Latin words the subtitles keep
const NAMES: [RegExp, string][] = [
  [/Sky Queen/g, 'سكاي كوين'], [/Lucky Lady/g, 'لاكي ليدي'], [/Miss Fortune/g, 'ميس فورتشن'], [/Ole Rattler/g, 'أول راتلر'],
  [/Hell's Angel II/g, 'هيلز إينجل الثانية'], [/Dinah Might/g, 'داينا مايت'], [/Iron Maiden/g, 'آيرن ميدن'], [/Sweet Sue/g, 'سويت سو'],
  [/Big Stoop/g, 'بيغ ستوب'], [/Night Owl/g, 'نايت آول'], [/Wabash Cannonball/g, 'واباش كانونبول'], [/Patches/g, 'باتشز'],
  [/Belle of Ohio/g, 'بيل أوف أوهايو'], [/Tondelayo II/g, 'توندلايو الثانية'], [/Blue Streak/g, 'بلو ستريك'], [/Short Snorter/g, 'شورت سنورتر'],
  [/\bTab\b/g, 'تاب'], [/\bMustangs?\b/g, 'موستانغ'], [/\bSpitfires?\b/g, 'سبيتفاير'],
];

export function spokenArabic(text: string): string {
  let s = text.replace(/[⁦-⁩‎‏«»"“”]/g, '');
  for (const [rx, to] of NAMES) s = s.replace(rx, to);
  // Fw 190 A-8, Bf 109, Me 262 ...
  s = s.replace(/\b(Fw|Bf|Me|Ju|He|Do)[ -]?(\d+)(?:\s?([A-Z])-?(\d+))?s?\b/g, (_m, mk: string, n: string, l?: string, v?: string) =>
    `${MAKER[mk]} ${arabicNumber(+n)}${l ? ` ${LETTER[l]} ${arabicNumber(+v!)}` : ''}`);
  // P-51D, B-17G
  s = s.replace(/\b([A-Z])-(\d+)([A-Z])?s?\b/g, (_m, a: string, n: string, b?: string) => `${LETTER[a]} ${arabicNumber(+n)}${b ? ' ' + LETTER[b] : ''}`);
  s = s.replace(/\d{1,3}(?:,\d{3})+/g, (m) => m.replace(/,/g, ''));
  s = s.replace(/(^|\s)\.(\d+)/g, '$1$2');   // calibre ".50" is said "fifty"
  s = s.replace(/\d+/g, (m) => arabicNumber(+m));
  s = s.replace(/\b[A-Z]\b/g, (m) => LETTER[m]);
  s = s.replace(/\s*(?:—|–|…|\.\.\.|:)\s*/g, '، ').replace(/،\s*،/g, '،').replace(/\s+([،.!؟?])/g, '$1').replace(/\s+/g, ' ').trim();
  return s.replace(/^،\s*/, '');
}
