// Crew patches: embroidered shoulder patches earned through Gunner Mastery (Mastery.ts). The
// chosen one is worn on the mastery screen, the debrief's mastery report and the crew roster
// header. Drawn as inline SVG (no text on the patch, so it reads the same in both languages);
// pure strings, so the module runs in Node for the unit tests.

export type PatchId =
  | 'wings' | 'portwatch' | 'starboard' | 'tophat' | 'ballbearing' | 'stinger'
  | 'crossfire' | 'acehunter' | 'untouched' | 'longshot' | 'fullcrew' | 'legend' | 'huntmaster';

export interface PatchDef { id: PatchId; name: string; bg: string; rim: string; ink: string; free?: boolean }

export const PATCHES: PatchDef[] = [
  { id: 'wings', name: 'Gunner\'s Wings', bg: '#1f2f57', rim: '#c9c3a6', ink: '#d9dde2', free: true },
  { id: 'portwatch', name: 'Port Watch', bg: '#3c4428', rim: '#d8c58a', ink: '#c8352a' },
  { id: 'starboard', name: 'Starboard Watch', bg: '#3c4428', rim: '#d8c58a', ink: '#3fae5a' },
  { id: 'tophat', name: 'Top Hat', bg: '#22406e', rim: '#e2b33c', ink: '#1a1a1a' },
  { id: 'ballbearing', name: 'Ball Bearing', bg: '#5a2a2a', rim: '#d8c58a', ink: '#c9ccd1' },
  { id: 'stinger', name: 'Stinger', bg: '#2c2c2c', rim: '#e2b33c', ink: '#e2b33c' },
  { id: 'crossfire', name: 'Crossfire', bg: '#1d2d3a', rim: '#9fc2d8', ink: '#ff9a3c' },
  { id: 'acehunter', name: 'Ace Hunter', bg: '#efe6c8', rim: '#b3261b', ink: '#17130c' },
  { id: 'untouched', name: 'Untouchable', bg: '#2d4a3a', rim: '#efe6c8', ink: '#efe6c8' },
  { id: 'longshot', name: 'Long Shot', bg: '#4b3a22', rim: '#efe6c8', ink: '#efe6c8' },
  { id: 'fullcrew', name: 'Full Crew', bg: '#1f2f57', rim: '#e2b33c', ink: '#efe6c8' },
  { id: 'legend', name: 'Legend', bg: '#17130c', rim: '#e2b33c', ink: '#e2b33c' },
  { id: 'huntmaster', name: 'Hunt Master', bg: '#6b1a14', rim: '#e2b33c', ink: '#efe6c8' },
];

const BY_ID = new Map<string, PatchDef>(PATCHES.map((p) => [p.id, p]));
export const patchDef = (id: string): PatchDef => BY_ID.get(id) ?? PATCHES[0];
export const isPatchId = (id: unknown): id is PatchId => typeof id === 'string' && BY_ID.has(id);

const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
};

// The emblem in a 100 x 100 box, drawn in the patch's ink colour
function glyph(p: PatchDef): string {
  const k = p.ink;
  switch (p.id) {
    case 'wings': return `<g fill="${k}"><path d="M50 50 C38 36 22 34 12 38 C20 42 26 44 30 47 C22 47 16 49 12 52 C22 53 32 54 40 56 Z"/><path d="M50 50 C62 36 78 34 88 38 C80 42 74 44 70 47 C78 47 84 49 88 52 C78 53 68 54 60 56 Z"/><circle cx="50" cy="52" r="9"/></g><rect x="47" y="44" width="6" height="18" rx="3" fill="${p.bg}"/>`;
    case 'portwatch': return `<g fill="${k}"><polygon points="20,50 46,28 46,40 78,40 78,60 46,60 46,72"/></g>${star(50, 82, 6).replace('<polygon', `<polygon fill="${p.rim}"`)}`;
    case 'starboard': return `<g fill="${k}"><polygon points="80,50 54,28 54,40 22,40 22,60 54,60 54,72"/></g>${star(50, 82, 6).replace('<polygon', `<polygon fill="${p.rim}"`)}`;
    case 'tophat': return `<g fill="${k}"><rect x="34" y="24" width="32" height="38" rx="3"/><ellipse cx="50" cy="64" rx="28" ry="7"/></g><rect x="34" y="50" width="32" height="7" fill="${p.rim}"/>`;
    case 'ballbearing': return `<circle cx="50" cy="50" r="22" fill="${k}"/><circle cx="43" cy="43" r="6" fill="#ffffff" opacity=".55"/><g stroke="${k}" stroke-width="4" stroke-linecap="round"><line x1="40" y1="70" x2="28" y2="86"/><line x1="60" y1="70" x2="72" y2="86"/></g>`;
    case 'stinger': return `<path d="M50 18 L62 58 L50 86 L38 58 Z" fill="${k}"/><g stroke="${p.bg}" stroke-width="5"><line x1="40" y1="44" x2="60" y2="44"/><line x1="38" y1="56" x2="62" y2="56"/><line x1="42" y1="68" x2="58" y2="68"/></g>`;
    case 'crossfire': return `<g stroke="${k}" stroke-width="5" stroke-linecap="round" stroke-dasharray="10 7"><line x1="18" y1="22" x2="82" y2="78"/><line x1="82" y1="22" x2="18" y2="78"/></g><circle cx="50" cy="50" r="10" fill="none" stroke="${p.rim}" stroke-width="4"/>`;
    case 'acehunter': return `<path d="M50 20 C56 32 76 42 74 58 C72 72 58 72 53 64 L58 82 L42 82 L47 64 C42 72 28 72 26 58 C24 42 44 32 50 20 Z" fill="${k}"/><g stroke="${p.rim}" stroke-width="3.5" fill="none"><circle cx="50" cy="52" r="30"/><line x1="50" y1="14" x2="50" y2="30"/><line x1="50" y1="74" x2="50" y2="90"/><line x1="12" y1="52" x2="28" y2="52"/><line x1="72" y1="52" x2="88" y2="52"/></g>`;
    case 'untouched': return `<path d="M50 18 L76 28 L76 52 C76 70 62 80 50 86 C38 80 24 70 24 52 L24 28 Z" fill="${k}"/><path d="M50 26 L68 33 L68 52 C68 64 59 72 50 77 Z" fill="${p.bg}" opacity=".35"/>`;
    case 'longshot': return `<g fill="none" stroke="${k}" stroke-width="4"><circle cx="64" cy="50" r="22"/><circle cx="64" cy="50" r="12"/></g><circle cx="64" cy="50" r="4" fill="${k}"/><g stroke="${p.rim}" stroke-width="4" stroke-linecap="round"><line x1="12" y1="50" x2="58" y2="50"/><polyline points="20,42 12,50 20,58" fill="none"/></g>`;
    case 'fullcrew': return `<g fill="${k}">${[0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return star(50 + Math.cos(a) * 24, 52 + Math.sin(a) * 24, 10); }).join('')}</g>`;
    case 'legend': return `<g fill="none" stroke="${k}" stroke-width="4" stroke-linecap="round"><path d="M30 78 C16 64 16 40 30 24"/><path d="M70 78 C84 64 84 40 70 24"/></g><g fill="${k}">${[0, 1, 2, 3].map((i) => `<ellipse cx="${24 - i * 1}" cy="${66 - i * 12}" rx="6" ry="3" transform="rotate(-50 ${24 - i} ${66 - i * 12})"/><ellipse cx="${76 + i * 1}" cy="${66 - i * 12}" rx="6" ry="3" transform="rotate(50 ${76 + i} ${66 - i * 12})"/>`).join('')}${star(50, 50, 22)}</g>`;
    case 'huntmaster': return `<g fill="${k}"><rect x="47" y="30" width="6" height="42" rx="3"/><polygon points="20,48 80,48 80,54 20,54"/><polygon points="38,72 62,72 62,76 38,76"/></g><g stroke="${p.rim}" stroke-width="3.5" fill="none"><circle cx="50" cy="51" r="32"/><line x1="50" y1="12" x2="50" y2="24"/><line x1="50" y1="78" x2="50" y2="90"/><line x1="11" y1="51" x2="23" y2="51"/><line x1="77" y1="51" x2="89" y2="51"/></g>`;
  }
}

// The patch as an inline SVG (a twill rim with a stitched edge, the emblem, a soft sheen)
export function patchSvg(id: string, size = 64, locked = false): string {
  const p = patchDef(id);
  const body = locked
    ? `<circle cx="50" cy="50" r="40" fill="#2a2d29"/><text x="50" y="62" text-anchor="middle" font-size="34" font-family="Oswald, sans-serif" fill="#6c6f66">?</text>`
    : `<circle cx="50" cy="50" r="40" fill="${p.bg}"/>${glyph(p)}<ellipse cx="38" cy="32" rx="22" ry="12" fill="#fff" opacity=".07"/>`;
  return `<svg class="patch" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false">`
    + `<circle cx="50" cy="50" r="48" fill="${locked ? '#3a3d38' : p.rim}"/>`
    + `<circle cx="50" cy="50" r="44" fill="none" stroke="${locked ? '#555' : p.bg}" stroke-width="1.6" stroke-dasharray="3 2.4" opacity=".7"/>`
    + body + '</svg>';
}
