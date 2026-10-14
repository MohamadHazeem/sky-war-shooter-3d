import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { loadInteriorAssets } from '../game/InteriorAssets';

// Development-only: the fixed station captures of Phase 10 goal 07 (B-17 interior 2.0), the
// same views before and after. Needs a gunner mission running (sws.autoplay(sws.CAMPAIGN[0], 300))
// and tools/gallery/save-server.mjs on `port` (files land in tools/gallery/p10-07/<dir>/).
//   await sws.interiorShots('after')            every view
//   await sws.interiorShots('after', ['waist-fwd'], 5219)
export const INTERIOR_SHOTS: [string, string, { ads?: boolean; lookYaw?: number; lookPitch?: number }][] = [
  ['waist-hip', 'waistL', {}], ['waist-ads', 'waistL', { ads: true }], ['waist-fwd', 'waistL', { lookYaw: -1.5, lookPitch: -0.12 }],
  ['waist-aft', 'waistL', { lookYaw: 1.5, lookPitch: -0.12 }], ['waist-across', 'waistL', { lookYaw: -2.5, lookPitch: -0.15 }],
  ['waist-down', 'waistL', { lookYaw: -0.9, lookPitch: -0.9 }], ['top', 'top', {}], ['top-down', 'top', { lookYaw: 0.6, lookPitch: -1.0 }],
  ['ball', 'ball', {}], ['ball-up', 'ball', { lookPitch: 1.3 }], ['tail', 'tail', {}], ['tail-back', 'tail', { lookYaw: 2.9, lookPitch: -0.1 }],
];

export function interiorShots(_engine: Engine, game: Game) {
  return async (dir: string, only?: string[], port = 5317) => {
    await loadInteriorAssets(0);
    const v = (window as any).sws.vqa;
    v.freeze();
    const out: string[] = [];
    for (const [n, st, o] of INTERIOR_SHOTS) {
      if (only && !only.includes(n)) continue;
      v.clear(); v.gunner(st, o); v.step(40, 14);
      out.push(await v.save(`p10-07/${dir}/${n}.jpg`, port));
    }
    v.release();
    void game;
    return out;
  };
}
