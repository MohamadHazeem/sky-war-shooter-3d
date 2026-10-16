// Localisation: English (default), Arabic (right-to-left), French, German and Spanish.
//
// Two lookups:
//  - t(key, vars)  : interface chrome, keyed by concise ids grouped by screen (en.ts / ar.ts / ui/*.ts).
//  - tx(text, vars): content written in English in the game code and data tables (mission
//                    texts, upgrade names, banners, tips, radio subtitles...). The English text
//                    itself is the key; translations live in the phrase tables under ./ar/,
//                    ./fr/, ./de/ and ./es/. Strings built at runtime are matched by the tables'
//                    patterns.
// Both return the English when English is active, so wrapping a string never changes the
// English game. Recorded voices play their Arabic takes in Arabic (src/audio/VoiceLang.ts).
// Arabic ships in the main bundle; French, German and Spanish are one lazy chunk each
// (./packs/*.ts), loaded before the menu when chosen (langReady) or on a switch (setLang).
import { en, type UiKey } from './en';
import { ar } from './ar';
import { PHRASES, PATTERNS } from './phrases';
import type { LangPack } from './pack';

export type Lang = 'en' | 'ar' | 'fr' | 'de' | 'es';
export type Vars = Record<string, string | number>;

// The language picker's list, each name in its own language
export const LANGS: readonly { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es', name: 'Español' },
  { id: 'ar', name: 'العربية' },
];
const isLang = (s: unknown): s is Lang => LANGS.some((l) => l.id === s);

const KEY = 'sws3d.lang';
const listeners: ((l: Lang) => void)[] = [];

function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (isLang(s)) return s;
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language ?? '' : '').toLowerCase().slice(0, 2);
  return isLang(nav) ? nav : 'en';
}

const packs: Partial<Record<Lang, LangPack>> = { ar: { ui: ar, phrases: PHRASES, patterns: PATTERNS, caseless: true } };
const loaders: Partial<Record<Lang, () => Promise<{ default: LangPack }>>> = {
  fr: () => import('./packs/fr'),
  de: () => import('./packs/de'),
  es: () => import('./packs/es'),
};
const loading = new Map<Lang, Promise<void>>();

let current: Lang = initial();
let cache = new Map<string, string>();

export const getLang = (): Lang => current;
export const isAr = () => current === 'ar';
// True when shown text goes through the translation tables (any language but English)
export const isTranslated = () => current !== 'en';

// Fetch a language's tables (no-op for English and Arabic, which are always present)
export function loadLang(l: Lang): Promise<void> {
  if (packs[l] || !loaders[l]) return Promise.resolve();
  let p = loading.get(l);
  if (!p) {
    p = loaders[l]!().then((m) => { packs[l] = m.default; if (l === current) cache = new Map(); },
      (e) => { loading.delete(l); console.warn(`language ${l} failed to load`, e); });
    loading.set(l, p);
  }
  return p;
}
// Resolves once the active language can be shown (boot waits for it before the menu)
export const langReady = () => loadLang(current);

// Switches at once (English shows until a lazy pack arrives); the promise resolves when the
// new language is ready, so a screen can rebuild itself in it.
export function setLang(l: Lang): Promise<void> {
  if (l === current) return langReady();
  current = l;
  cache = new Map();
  try { localStorage.setItem(KEY, l); } catch { /* */ }
  applyDocumentLang();
  const done = () => { if (current === l) for (const f of listeners) f(l); };
  if (packs[l] || !loaders[l]) { done(); return Promise.resolve(); }
  return loadLang(l).then(done);
}

export function onLangChange(f: (l: Lang) => void) { listeners.push(f); }

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// Interface string by key
export function t(key: UiKey, vars?: Vars): string {
  return fill(packs[current]?.ui[key] ?? en[key] ?? key, vars);
}

// English content string -> displayed string. `vars` fill {name} placeholders in the
// English template (and in its translation), e.g. tx('Wave {n}', { n: 3 }).
export function tx(text: string, vars?: Vars): string {
  const pack = packs[current];
  if (!pack || !text) return fill(text, vars);
  return fill(translate(text), vars);
}

function translate(text: string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out = lookup(packs[current]!, text, translate);
  out = out === undefined ? text : current === 'ar' ? isolateLatin(out) : out;
  if (cache.size > 4000) cache.clear();   // numbers in runtime strings make the key set open-ended
  cache.set(text, out);
  return out;
}

function lookup(pack: LangPack, text: string, tr: (s: string) => string): string | undefined {
  const { phrases } = pack;
  let out: string | undefined = phrases[text];
  if (out === undefined) {
    const trimmed = text.trim();
    if (trimmed !== text && phrases[trimmed] !== undefined) out = text.replace(trimmed, phrases[trimmed]);
  }
  // the game upper-cases some texts for display (stations, targets, dates): Arabic has no case,
  // the other languages are upper-cased the same way (placeholders and markup untouched)
  if (out === undefined) {
    out = lowerIndex(pack).get(text.toLowerCase());
    if (out !== undefined && !pack.caseless && text !== text.toLowerCase() && text === text.toUpperCase()) out = upper(out);
  }
  if (out === undefined) {
    for (const [re, rep] of pack.patterns) {
      const m = text.match(re);
      if (m) { out = typeof rep === 'string' ? text.replace(re, rep) : rep(m, tr); break; }
    }
  }
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

const upper = (s: string) => s.split(/(\{\w+\}|<[^>]*>|&\w+;)/).map((p, i) => (i % 2 ? p : p.toUpperCase())).join('');

const lowers = new WeakMap<LangPack, Map<string, string>>();
function lowerIndex(pack: LangPack) {
  let lower = lowers.get(pack);
  if (!lower) {
    lower = new Map();
    for (const k in pack.phrases) if (!lower.has(k.toLowerCase())) lower.set(k.toLowerCase(), pack.phrases[k]);
    lowers.set(pack, lower);
  }
  return lower;
}

// True when a language's phrase tables have a line for this English text (tests; Arabic by
// default; a lazy language must be loaded first)
export function hasPhrase(text: string, lang: Lang = 'ar') {
  const pack = packs[lang];
  return !!pack && (pack.phrases[text] !== undefined || lowerIndex(pack).has(text.toLowerCase()) || pack.patterns.some(([re]) => re.test(text)));
}
// The translation of an English text in a given language, whatever the active one (tests)
export function txIn(lang: Lang, text: string): string {
  const pack = packs[lang];
  if (!pack) return text;
  const tr = (s: string): string => lookup(pack, s, tr) ?? s;
  return tr(text);
}

// Western digits are kept in Arabic for readability; this only adds thousands separators
// (French, German and Spanish use their own: 12 345 / 12.345)
export const num = (n: number) => n.toLocaleString(current === 'en' || current === 'ar' ? 'en-US' : current);

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
