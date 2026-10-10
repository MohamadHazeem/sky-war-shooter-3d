// Localisation: English (default) and Arabic (right-to-left).
//
// Two lookups:
//  - t(key, vars)  : interface chrome, keyed by concise ids grouped by screen (en.ts / ar.ts).
//  - tx(text, vars): content written in English in the game code and data tables (mission
//                    texts, upgrade names, banners, tips, radio subtitles...). The English text
//                    itself is the key; the Arabic lives in the phrase tables under ./ar/.
//                    Strings built at runtime are matched by the phrase tables' patterns.
// Both return the English when English is active, so wrapping a string never changes the
// English game. Radio voices stay English: only the displayed subtitle is translated.
import { en, type UiKey } from './en';
import { ar } from './ar';
import { PHRASES, PATTERNS } from './phrases';

export type Lang = 'en' | 'ar';
export type Vars = Record<string, string | number>;

const KEY = 'sws3d.lang';
const listeners: ((l: Lang) => void)[] = [];

function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'ar') return s;
  } catch { /* storage unavailable */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language ?? '' : '';
  return nav.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

let current: Lang = initial();
let cache = new Map<string, string>();

export const getLang = (): Lang => current;
export const isAr = () => current === 'ar';

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  cache = new Map();
  try { localStorage.setItem(KEY, l); } catch { /* */ }
  applyDocumentLang();
  for (const f of listeners) f(l);
}

export function onLangChange(f: (l: Lang) => void) { listeners.push(f); }

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Interface string by key
export function t(key: UiKey, vars?: Vars): string {
  return fill((current === 'ar' ? ar[key] : undefined) ?? en[key] ?? key, vars);
}

// English content string -> displayed string. `vars` fill {name} placeholders in the
// English template (and in its translation), e.g. tx('Wave {n}', { n: 3 }).
export function tx(text: string, vars?: Vars): string {
  if (current !== 'ar' || !text) return fill(text, vars);
  return fill(translate(text), vars);
}

function translate(text: string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out: string | undefined = PHRASES[text];
  if (out === undefined) {
    const trimmed = text.trim();
    if (trimmed !== text && PHRASES[trimmed] !== undefined) out = text.replace(trimmed, PHRASES[trimmed]);
  }
  // the game upper-cases some texts for display (stations, targets, dates): Arabic has no case
  if (out === undefined) out = lowerIndex().get(text.toLowerCase());
  if (out === undefined) {
    for (const [re, rep] of PATTERNS) {
      const m = text.match(re);
      if (m) { out = typeof rep === 'string' ? text.replace(re, rep) : rep(m, translate); break; }
    }
  }
  out = out === undefined ? text : isolateLatin(out);
  if (cache.size > 4000) cache.clear();   // numbers in runtime strings make the key set open-ended
  cache.set(text, out);
  return out;
}

// A quoted Latin name inside Arabic («Lucky Lady», "Sky Queen") would join the Latin text next
// to it and drag the quote marks out of place; first-strong isolates keep the name in its quotes.
function isolateLatin(s: string) {
  s = s.replace(/«([^«»\u2068]*[A-Za-z][^«»]*)»/g, '«\u2068$1\u2069»');
  // straight quotes only in plain text (never touch markup attributes)
  if (!s.includes('<') && /[\u0600-\u06FF]/.test(s)) s = s.replace(/"([^"\u2068]*[A-Za-z][^"]*)"/g, '"\u2068$1\u2069"');
  return s;
}

let lower: Map<string, string> | null = null;
function lowerIndex() {
  if (!lower) {
    lower = new Map();
    for (const k in PHRASES) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), PHRASES[k]);
  }
  return lower;
}

// True when the phrase tables have an Arabic line for this English text (tests)
export const hasPhrase = (text: string) => PHRASES[text] !== undefined || lowerIndex().has(text.toLowerCase()) || PATTERNS.some(([re]) => re.test(text));

// Western digits are kept in Arabic for readability; this only adds thousands separators
export const num = (n: number) => n.toLocaleString('en-US');

// Canvas text: Latin glyphs from the game's font, Arabic glyphs from the Arabic fallback.
// Use in ctx.font strings: `600 11px ${CANVAS_MONO}`
export const CANVAS_MONO = '"IBM Plex Mono", "IBM Plex Sans Arabic", monospace';
export const CANVAS_SANS = 'Oswald, "Noto Kufi Arabic", sans-serif';

let fontsLinked = false;
// <html dir/lang>, and the Arabic web fonts (loaded only once Arabic is used)
export function applyDocumentLang() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = current;
  root.dir = current === 'ar' ? 'rtl' : 'ltr';
  if (current === 'ar' && !fontsLinked) {
    fontsLinked = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap';
    document.head.appendChild(l);
  }
}
