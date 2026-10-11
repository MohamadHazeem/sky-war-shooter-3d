import type { BombingResult } from '../game/Bombardier';
import { tx } from '../i18n';
export function bombingReport(result?: BombingResult) {
  if (!result) return '';
  return `<figure class="strike-photo"><figcaption>${tx('Strike photo')} · ${tx('{percent} % within 1,000 ft of the aiming point', { percent: result.percent })}</figcaption>
    ${result.photo ? `<img src="${result.photo}" alt="${tx('Strike photo')}">` : ''}
    <div>${tx('Bombing score +{score}', { score: result.score })}</div></figure>`;
}
