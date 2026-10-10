// Small helpers shared by the phrase tables written after the first translation pass.

// A left-to-right isolate: keeps a signed number or a multiplier ("−3", "+300", "×1.05") in
// reading order inside Arabic text (a bare sign next to a digit is pulled to the wrong side).
export const ltr = (s: string | number) => `⁦${s}⁩`;

// "N <noun>" with the Arabic counted-noun forms: 1 and 2 have their own words, 3-10 take the
// plural, 11+ (and 0) the singular accusative.
export function counted(n: number | string, one: string, two: string, few: string, many: string): string {
  const k = Number(n);
  if (k === 1) return one;
  if (k === 2) return two;
  const r = k % 100;
  return r >= 3 && r <= 10 ? `${k} ${few}` : `${k} ${many}`;
}
