import type { BombingResult } from '../game/Bombardier';
import { BOMB_RUN_TEXT } from '../game/BombRunState';
import { tx } from '../i18n';
export function bombingReport(result?: BombingResult) {
  if (!result) return '';
  return `<p>${tx(result.percent >= 50 ? BOMB_RUN_TEXT.on : BOMB_RUN_TEXT.off)}</p><figure class="strike-photo"><figcaption>${tx('Strike photo')} · ${tx('{percent} % within 1,000 ft of the aiming point', { percent: result.percent })}</figcaption>
    ${result.photo ? `<img src="${result.photo}" alt="${tx('Strike photo')}">` : ''}
    ${result.score ? `<div>${tx('Bombing score +{score}', { score: result.score })}</div>` : ''}</figure>`;
}
