// A language's translations as one object: interface strings (keyed like en.ts) and the
// merged phrase tables. French, German and Spanish tables live in ./fr, ./de and ./es, one
// file per area named like its Arabic twin in ./ar; they merge in the Arabic precedence
// order (phrases.ts), and a file with no Arabic twin goes first (lowest), like there.
import type { UiKey } from './en';
import type { PhraseTable, Pattern } from './types';
import { ALL_TABLES } from './phrases';

export interface LangPack {
  ui: Partial<Record<UiKey, string>>;
  phrases: Record<string, string>;
  patterns: Pattern[];
  caseless?: boolean;   // no upper/lower case (Arabic)
}

type Modules = Record<string, { default?: unknown }>;
const base = (path: string) => path.replace(/^.*\//, '').replace(/\.ts$/, '');
const isTable = (t: unknown): t is PhraseTable => !!t && typeof t === 'object' && 'phrases' in t;

// File names of the Arabic tables, lowest precedence first
const AR_MODULES = import.meta.glob<{ default?: unknown }>('./ar/*.ts', { eager: true });
const AR_NAME = new Map<unknown, string>(Object.entries(AR_MODULES).map(([p, m]) => [m.default, base(p)]));
export const TABLE_ORDER: string[] = ALL_TABLES.map((t) => AR_NAME.get(t) ?? '');
// The Arabic tables by file name (tests compare the other languages with them)
export const arTables = () => new Map(orderTables(AR_MODULES));

export function orderTables(modules: Modules, order: string[] = TABLE_ORDER): [string, PhraseTable][] {
  const rank = new Map(order.map((n, i) => [n, i]));
  return Object.keys(modules).sort()
    .map((p) => [base(p), modules[p].default] as [string, unknown])
    .filter((e): e is [string, PhraseTable] => isTable(e[1]))
    .sort((a, b) => (rank.get(a[0]) ?? -1) - (rank.get(b[0]) ?? -1));
}

export function buildPack(ui: LangPack['ui'], modules: Modules): LangPack & { tables: [string, PhraseTable][] } {
  const tables = orderTables(modules);
  return {
    ui,
    tables,
    phrases: Object.assign({}, ...tables.map(([, t]) => t.phrases)),
    patterns: tables.flatMap(([, t]) => t.patterns ?? []),
  };
}
