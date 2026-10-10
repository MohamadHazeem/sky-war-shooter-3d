import { vi } from 'vitest';

// Minimal in-memory Storage for modules that persist to localStorage.
export class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
}

export function stubStorage(seed: Record<string, unknown> = {}): MemoryStorage {
  const s = new MemoryStorage();
  for (const [k, v] of Object.entries(seed)) s.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  vi.stubGlobal('localStorage', s);
  return s;
}

// Deterministic Math.random (mulberry32) so random-driven code is reproducible.
export function seedRandom(seed = 1) {
  let a = seed >>> 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}
