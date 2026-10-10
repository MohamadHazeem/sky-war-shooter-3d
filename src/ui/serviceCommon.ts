// Small helpers shared by the Career, Trophies and Daily Orders screens.

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Get (or create) a full-screen layer and show it alone. UI.show() hides every '.layer' that
// is not the one it opens, so these screens close themselves whenever the game opens another.
export function showLayer(id: string): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'layer';
    document.body.appendChild(el);
  }
  document.querySelectorAll('.layer').forEach((l) => l.classList.toggle('show', l === el));
  return el;
}

// Esc / Backspace close a screen (removed once the layer is hidden or replaced)
export function onBackKey(layer: HTMLElement, back: () => void) {
  const prev = (layer as any)._svcBackKey as ((e: KeyboardEvent) => void) | undefined;
  if (prev) removeEventListener('keydown', prev);
  const key = (e: KeyboardEvent) => {
    if (!layer.classList.contains('show')) { removeEventListener('keydown', key); return; }
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); removeEventListener('keydown', key); back(); }
  };
  (layer as any)._svcBackKey = key;
  addEventListener('keydown', key);
}

// Rank insignia: enlisted chevrons and rockers, officers' bars and the major's oak leaf
export function insigniaSvg(rank: number, size = 56): string {
  const gold = '#d8b25a', silver = '#d4d8dc', edge = 'rgba(0,0,0,0.55)';
  const chev = (y: number) => `<path d="M10 ${y} L32 ${y - 11} L54 ${y}" fill="none" stroke="${gold}" stroke-width="5" stroke-linejoin="miter"/>`;
  const rock = (y: number) => `<path d="M10 ${y} Q32 ${y + 12} 54 ${y}" fill="none" stroke="${gold}" stroke-width="5"/>`;
  const bar = (x: number, y: number, c: string) => `<rect x="${x}" y="${y}" width="10" height="34" rx="1.5" fill="${c}" stroke="${edge}" stroke-width="1"/>`;
  let body = '';
  if (rank <= 0) body = chev(34);
  else if (rank === 1) body = chev(22) + chev(31) + chev(40) + rock(42);
  else if (rank === 2) body = chev(16) + chev(24) + chev(32) + rock(34) + rock(41) + rock(48);
  else if (rank === 3) body = bar(27, 15, silver);
  else if (rank === 4) body = bar(19, 15, silver) + bar(35, 15, silver) + `<rect x="29" y="22" width="6" height="4" fill="${silver}"/><rect x="29" y="38" width="6" height="4" fill="${silver}"/>`;
  else body = `<path d="M32 8 C38 16 46 14 48 22 C44 24 50 30 46 36 C42 34 40 42 34 44 L33 54 L31 54 L30 44 C24 42 22 34 18 36 C14 30 20 24 16 22 C18 14 26 16 32 8 Z" fill="${gold}" stroke="${edge}" stroke-width="1"/><path d="M32 14 L32 46" stroke="rgba(90,60,10,0.6)" stroke-width="1.2"/>`;
  return `<svg class="svc-insignia" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
}

export const fmtHours = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

export const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};
