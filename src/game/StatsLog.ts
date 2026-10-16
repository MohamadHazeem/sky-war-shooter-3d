// StatsLog: the player's sortie-by-sortie logbook behind the personal stats page (ui/StatsScreen.ts)
// and the share cards (game/ShareCard.ts). Career.ts keeps lifetime totals; this keeps one short
// entry per tracked sortie so the stats page can chart accuracy and survival over time.
// Pure data and maths plus guarded localStorage ('sws3d.*', so CloudSave carries it), unit-tested in Node.
//
// Hook: ServiceRecord.onDebrief (tracked sorties only, the same ones the Career counts).

export const STATS_KEY = 'sws3d.statslog.v1';
export const LOG_MAX = 200;   // newest sorties kept

export interface SortieEntry {
  t: number;                       // timestamp (ms)
  id: string;                      // mission id
  title: string;
  role: 'gunner' | 'pilot';
  success: boolean;
  survived: boolean;               // the player came home (not shot down / out of the fight)
  kills: number;
  shots: number;
  hits: number;
  score: number;
  medals: string[];
  types: Record<string, number>;   // kills by enemy type this sortie
}

const int = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

export function cleanEntry(raw: unknown): SortieEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.t !== 'number' || !Number.isFinite(o.t)) return null;
  const types: Record<string, number> = {};
  if (o.types && typeof o.types === 'object') {
    for (const [k, v] of Object.entries(o.types as Record<string, unknown>)) { const n = int(v, 999); if (n > 0 && k.length <= 16) types[k] = n; }
  }
  const shots = int(o.shots);
  return {
    t: o.t, id: o.id.slice(0, 48), title: typeof o.title === 'string' ? o.title.slice(0, 80) : o.id.slice(0, 48),
    role: o.role === 'pilot' ? 'pilot' : 'gunner', success: o.success === true, survived: o.survived !== false,
    kills: int(o.kills, 9999), shots, hits: Math.min(shots, int(o.hits)), score: int(o.score),
    medals: Array.isArray(o.medals) ? o.medals.filter((m): m is string => typeof m === 'string').slice(0, 12).map((m) => m.slice(0, 48)) : [],
    types,
  };
}

export function loadLog(): SortieEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null');
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.log) ? raw.log : [];
    return list.map(cleanEntry).filter((e: SortieEntry | null): e is SortieEntry => !!e).sort((a: SortieEntry, b: SortieEntry) => a.t - b.t).slice(-LOG_MAX);
  } catch { return []; }
}

export function saveLog(log: SortieEntry[]) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify({ v: 1, log: log.slice(-LOG_MAX) })); } catch { /* storage unavailable */ }
}

/** Appends one sortie (cleaned) and returns the new log. */
export function recordSortie(e: Omit<SortieEntry, 't'> & { t?: number }): SortieEntry[] {
  const clean = cleanEntry({ ...e, t: e.t ?? Date.now() });
  const log = loadLog();
  if (clean) log.push(clean);
  const out = log.slice(-LOG_MAX);
  saveLog(out);
  return out;
}

// ---------------- chart data ----------------

export interface Point { i: number; v: number; label: string }

/** Accuracy per sortie (sorties without a shot fired are skipped) and its rolling average. */
export function accuracySeries(log: SortieEntry[], window = 5, last = 40): { each: Point[]; avg: Point[] } {
  const shot = log.filter((e) => e.shots > 0).slice(-last);
  const each = shot.map((e, i) => ({ i, v: e.hits / e.shots, label: e.title }));
  const avg = each.map((_, i) => {
    const w = shot.slice(Math.max(0, i - window + 1), i + 1);
    const s = w.reduce((a, e) => a + e.shots, 0), h = w.reduce((a, e) => a + e.hits, 0);
    return { i, v: s ? h / s : 0, label: shot[i].title };
  });
  return { each, avg };
}

/** Rolling survival rate (share of the last `window` sorties the player came home from). */
export function survivalSeries(log: SortieEntry[], window = 10, last = 40): Point[] {
  const all = log.slice(-(last + window - 1));
  const start = Math.max(0, all.length - last);
  const out: Point[] = [];
  for (let i = start; i < all.length; i++) {
    const w = all.slice(Math.max(0, i - window + 1), i + 1);
    out.push({ i: i - start, v: w.filter((e) => e.survived).length / w.length, label: all[i].title });
  }
  return out;
}

export interface Summary { sorties: number; survived: number; survivalRate: number; wins: number; kills: number; shots: number; hits: number; accuracy: number; best: SortieEntry | null }

export function summarize(log: SortieEntry[], role?: 'gunner' | 'pilot'): Summary {
  const l = role ? log.filter((e) => e.role === role) : log;
  const survived = l.filter((e) => e.survived).length;
  const shots = l.reduce((a, e) => a + e.shots, 0), hits = l.reduce((a, e) => a + e.hits, 0);
  let best: SortieEntry | null = null;
  for (const e of l) if (!best || e.kills > best.kills || (e.kills === best.kills && e.score > best.score)) best = e;
  return {
    sorties: l.length, survived, survivalRate: l.length ? survived / l.length : 0, wins: l.filter((e) => e.success).length,
    kills: l.reduce((a, e) => a + e.kills, 0), shots, hits, accuracy: shots ? hits / shots : 0, best,
  };
}

/** Kills by enemy type, largest first; `known` lists the types always shown (zero bars included). */
export function killsByType(byType: Record<string, number>, known: readonly string[] = []): { type: string; kills: number }[] {
  const keys = new Set([...known, ...Object.keys(byType)]);
  return [...keys].map((type) => ({ type, kills: Math.max(0, Math.round(byType[type] ?? 0)) }))
    .sort((a, b) => b.kills - a.kills || known.indexOf(a.type) - known.indexOf(b.type));
}

/** "Nice" upper bound for an accuracy axis: 10% steps up to 50%, then 20% steps; at least 30%, at most 100%. */
export function accuracyCeiling(values: number[]): number {
  const m = Math.max(0, ...values);
  const tenth = Math.max(3, Math.ceil(m * 10 - 1e-9));
  return tenth <= 5 ? tenth / 10 : Math.min(1, Math.ceil(tenth / 2) / 5);
}

/** Axis ticks for a 0..yMax percentage axis (10% or 20% apart). */
export function percentTicks(yMax: number): number[] {
  const step = yMax <= 0.5 + 1e-9 ? 0.1 : 0.2, out: number[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
