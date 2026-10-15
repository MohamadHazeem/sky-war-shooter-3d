import { tx } from '../i18n';

// Streamer mode (Settings → Advanced, Phase 11 goal 34): a clean picture to broadcast.
//   - no personal info on screen: join codes and the cloud-save transfer code are masked (a
//     "Show" button reveals them for a few seconds), callsigns in the co-op lobby, the crew list
//     and the kill feed become "You" / "Gunner 2…4", the region line of the game browser goes
//   - a big readable HUD: the HUD panels, kill feed, subtitles and the spectator bar a size up
//   - no FPS counter
// Game.applySettings() calls streamer.apply(settings); everything else reads streamer.on.

export const streamer = {
  on: false,
  apply(s: { streamer?: boolean }) {
    this.on = s.streamer === true;
    if (typeof document === 'undefined') return;
    ensureCss();
    document.body.classList.toggle('streamer', this.on);
  },
};

/** A code as it may be shown: dots in streamer mode (same length, so the layout does not jump). */
export function maskCode(code: string, on = streamer.on) {
  return on ? code.replace(/[^\s-]/g, '•') : code;
}

/** A crew member's name as it may be shown: "You" / "Gunner n" in streamer mode (id 0 is the host: Gunner 1). */
export function crewLabel(name: string, id: number, mine: boolean, on = streamer.on) {
  if (!on) return name;
  return mine ? tx('You') : tx('Gunner {n}', { n: id + 1 });
}

/** A masked code with a "Show" button that reveals it for 5 s (the DOM of the code element is replaced). */
export function revealable(code: string, cls: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  if (!streamer.on) return `<span class="${cls}">${esc(code)}</span>`;
  return `<span class="${cls}" data-masked="${esc(code)}">${esc(maskCode(code))}</span> <button class="btn ghost stream-show" data-reveal>${tx('Show')}</button>`;
}
export function wireReveal(root: ParentNode) {
  root.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((b) => b.addEventListener('click', () => {
    const el = b.previousElementSibling as HTMLElement | null;
    const code = el?.dataset.masked;
    if (!el || !code) return;
    el.textContent = code;
    setTimeout(() => { if (el.isConnected) el.textContent = maskCode(code); }, 5000);
  }));
}

const CSS = `
body.streamer #hud .hud-text, body.streamer #feed, body.streamer #subs, body.streamer #tip, body.streamer #specHud .bar, body.streamer #specHud .top { zoom: 1.3; }
body.streamer #hud .hud-label { letter-spacing: 1.5px; }
body.streamer #feed > * { text-shadow: 0 1px 3px #000, 0 0 8px rgba(0,0,0,.7); }
body.streamer .sws-fps { display: none !important; }
.stream-show { padding: 4px 10px; font-size: 11px; letter-spacing: 1px; vertical-align: middle; }
`;
function ensureCss() {
  if (document.getElementById('streamerCss')) return;
  const s = document.createElement('style');
  s.id = 'streamerCss'; s.textContent = CSS;
  document.head.appendChild(s);
}
