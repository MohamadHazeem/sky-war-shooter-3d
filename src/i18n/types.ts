// A pattern translates a string built at runtime. The replacement is either a String.replace
// template ('$1' etc.) or a function given the match and the translator, so captured
// sub-phrases (a station, a crew name) can be translated too: (m, tr) => `${tr(m[1])} ...`.
export type Pattern = [RegExp, string | ((m: RegExpMatchArray, tr: (s: string) => string) => string)];

export interface PhraseTable {
  phrases: Record<string, string>;   // exact English text -> Arabic
  patterns?: Pattern[];              // anchored regexes (^...$) for runtime strings
}
