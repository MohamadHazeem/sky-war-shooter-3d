import { CAMPAIGN, type Mission } from '../game/Missions';
import { briefingVoice } from '../audio/BriefingVoice';
import { tx } from '../i18n';
import { decorateCampaignBriefing } from './CampaignMap';

// Briefing-sheet extras, added on top of the sheet UI.briefing() renders:
// - a stamped mission-number badge ("MISSION 03 OF 12") and a strip of mission facts
//   (weather, rounds, flak, bomb run, escort, straggler);
// - the recorded briefing: Play / Stop, auto-play when "Radio voices" is on, and the paragraph
//   being read is marked on the sheet.
// The voice stops when the sheet is left (Man your station / Back) or rebuilt.

export const campaignSize = () => CAMPAIGN.length;

const AUTO_DELAY_MS = 900;

let styled = false;
function ensureStyle() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
#briefing .bx-badge { float: left; width: 80px; height: 80px; margin: -4px 20px 8px 0; border: 4px double var(--red); border-radius: 50%; color: var(--red); display: flex; flex-direction: column; align-items: center; justify-content: center; transform: rotate(-9deg); opacity: 0.85; font-family: 'Oswald', sans-serif; line-height: 1; user-select: none; }
#briefing .bx-badge b { font-size: 32px; font-weight: 700; letter-spacing: 1px; margin: 2px 0 1px; }
#briefing .bx-badge span { font-size: 9px; letter-spacing: 2px; }
#briefing .bx-meta { clear: both; display: flex; flex-wrap: wrap; gap: 6px 8px; margin: -8px 0 18px; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; }
#briefing .bx-meta span { border: 1px solid rgba(43,37,24,0.45); padding: 2px 8px; }
#briefing .bx-meta span.hot { border-color: var(--red); color: var(--red); }
#briefing .bx-voice { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; }
#briefing .bx-play { display: inline-flex; align-items: center; gap: 8px; font-family: 'Oswald', sans-serif; letter-spacing: 2px; text-transform: uppercase; font-size: 13px; background: transparent; color: var(--paper-ink); border: 1.5px solid rgba(43,37,24,0.55); padding: 6px 14px; cursor: pointer; }
#briefing .bx-play:hover { background: rgba(43,37,24,0.08); }
#briefing .bx-play:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
#briefing .bx-play[aria-pressed="true"] { background: var(--paper-ink); color: var(--paper); }
#briefing .bx-play .bx-ico { font-style: normal; width: 10px; text-align: center; }
#briefing .bx-vst { font-size: 12px; opacity: 0.72; letter-spacing: 1px; }
#briefing .bx-bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 12px; }
#briefing .bx-bars i { width: 3px; height: 4px; background: currentColor; }
#briefing .bx-play[aria-pressed="true"] .bx-bars i { animation: bx-bar 0.9s ease-in-out infinite; }
#briefing .bx-bars i:nth-child(2) { animation-delay: 0.3s !important; }
#briefing .bx-bars i:nth-child(3) { animation-delay: 0.6s !important; }
@keyframes bx-bar { 0%, 100% { height: 3px; } 50% { height: 12px; } }
#briefing .brief-text > p { border-left: 3px solid transparent; padding-left: 10px; margin-left: -13px; transition: background 0.35s, border-color 0.35s; }
#briefing .brief-text > p.bx-reading { background: rgba(179,50,31,0.07); border-left-color: var(--red); }
html[dir="rtl"] #briefing .bx-badge, html[dir="rtl"] #briefing .bx-badge span, html[dir="rtl"] #briefing .bx-meta, html[dir="rtl"] #briefing .bx-play, html[dir="rtl"] #briefing .bx-vst { letter-spacing: 0; }
html[dir="rtl"] #briefing .bx-badge { float: right; margin: -4px 0 8px 20px; transform: rotate(9deg); }
html[dir="rtl"] #briefing .brief-text > p { border-left: none; border-right: 3px solid transparent; padding-left: 0; padding-right: 10px; margin-left: 0; margin-right: -13px; }
html[dir="rtl"] #briefing .brief-text > p.bx-reading { border-right-color: var(--red); }
@media (prefers-reduced-motion: reduce) { #briefing .bx-play[aria-pressed="true"] .bx-bars i { animation: none; height: 8px; } #briefing .brief-text > p { transition: none; } }
`;
  document.head.appendChild(st);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function weatherLabel(m: Mission): string {
  const w = m.weather;
  if (!w) return 'Fair';
  switch (w.mood) {
    case 'dusk': return 'Dusk';
    case 'overcast': return 'Overcast';
    case 'storm': return 'Storm front';
    default: return w.sunEl < 16 ? 'Low winter sun' : w.low < 0.55 ? 'Clear' : 'Broken cloud';
  }
}

function facts(m: Mission): { text: string; hot?: boolean }[] {
  const out: { text: string; hot?: boolean }[] = [{ text: tx('Weather: {w}', { w: tx(weatherLabel(m)) }) }];
  const n = m.rounds ?? 1;
  out.push({ text: Number.isFinite(n) ? tx('{n} rounds', { n }) : tx('Endless rounds') });
  if (m.playerDamaged) out.push({ text: tx('Two engines out'), hot: true });
  if (m.flak) out.push({ text: tx(m.flak.intensity >= 1.5 ? 'Heavy flak' : 'Flak'), hot: m.flak.intensity >= 1.5 });
  if (m.bombsAway !== undefined) out.push({ text: tx('Bomb run') });
  if (m.escortArrive !== undefined) out.push({ text: tx('Escort due {t}', { t: mmss(m.escortArrive) }) });
  if (m.role === 'pilot' && m.escorts) out.push({ text: tx('{n} Mustangs', { n: m.escorts + 1 }) });
  return out;
}

let cleanup: (() => void) | null = null;

/** Adds the badge, fact strip and briefing voice to the sheet UI.briefing() just rendered in `root` (#briefing). */
export function decorateBriefing(root: HTMLElement, m: Mission) {
  cleanup?.();
  cleanup = null;
  ensureStyle();
  const sheet = root.querySelector<HTMLElement>('.sheet');
  if (!sheet) return;
  const inCampaign = m.number > 0 && CAMPAIGN.includes(m);
  const total = CAMPAIGN.length;

  // Mission badge + facts
  const kicker = sheet.querySelector<HTMLElement>('.kicker');
  if (inCampaign && kicker) {
    const badge = document.createElement('div');
    badge.className = 'bx-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.innerHTML = `<span>${tx('MISSION')}</span><b>${String(m.number).padStart(2, '0')}</b><span>${tx('OF {total}', { total })}</span>`;
    kicker.before(badge);
    kicker.textContent = tx('MISSION No. {n} OF {total}', { n: m.number, total }) + (m.number === total ? tx(' · FINAL MISSION') : '');
  }
  const target = sheet.querySelector<HTMLElement>('.target');
  if (target) {
    const meta = document.createElement('div');
    meta.className = 'bx-meta';
    meta.innerHTML = facts(m).map((f) => `<span${f.hot ? ' class="hot"' : ''}>${esc(f.text)}</span>`).join('');
    target.after(meta);
  }
  decorateCampaignBriefing(sheet, m); // dynamic campaign: side-raid kicker, strategic modifiers

  // Recorded briefing
  const text = sheet.querySelector<HTMLElement>('.brief-text');
  if (!inCampaign || !text) return;
  const paras = Array.from(text.querySelectorAll<HTMLParagraphElement>(':scope > p'));
  const count = Math.min(paras.length, m.briefing.length);
  if (!count) return;
  const bar = document.createElement('div');
  bar.className = 'bx-voice';
  bar.innerHTML = `<button type="button" class="bx-play" aria-pressed="false"><i class="bx-ico">▶</i><span class="bx-lbl">${tx('Play briefing')}</span><span class="bx-bars" aria-hidden="true"><i></i><i></i><i></i></span></button><span class="bx-vst" aria-live="polite">${tx('Read by the group intelligence officer')}</span>`;
  text.prepend(bar);
  const btn = bar.querySelector<HTMLButtonElement>('.bx-play')!;
  const icon = btn.querySelector<HTMLElement>('.bx-ico')!, lbl = btn.querySelector<HTMLElement>('.bx-lbl')!, st = bar.querySelector<HTMLElement>('.bx-vst')!;
  let alive = true;

  const mark = (i: number) => {
    paras.forEach((p, k) => p.classList.toggle('bx-reading', k === i));
    if (i >= 0) paras[i]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  };
  const setUi = (on: boolean, msg?: string) => {
    btn.setAttribute('aria-pressed', String(on));
    icon.textContent = on ? '■' : '▶';
    lbl.textContent = tx(on ? 'Stop' : 'Play briefing');
    if (msg) st.textContent = msg;
  };
  const play = () => {
    setUi(true, tx('Intelligence officer…'));
    void briefingVoice.play(m.id, count, 0, {
      paragraph: (i) => { if (!alive) return; mark(i); st.textContent = tx('Paragraph {i} of {n}', { i: i + 1, n: count }); },
      end: (completed) => { if (!alive) return; mark(-1); setUi(false, tx(completed ? 'Briefing complete' : 'Read by the group intelligence officer')); },
    });
  };
  btn.addEventListener('click', () => (briefingVoice.playing ? briefingVoice.stop() : play()));

  briefingVoice.preload(m.id, count);
  const timer = window.setTimeout(() => {
    if (alive && briefingVoice.autoEnabled && root.classList.contains('show') && !briefingVoice.playing) play();
  }, AUTO_DELAY_MS);

  cleanup = () => { alive = false; clearTimeout(timer); briefingVoice.stop(); };
  // leaving the sheet stops the officer
  root.querySelectorAll('[data-go], [data-back]').forEach((b) => b.addEventListener('click', () => { if (cleanup) { cleanup(); cleanup = null; } }, { capture: true }));
}
