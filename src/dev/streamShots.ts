import type { Engine, Quality } from '../core/Engine';
import type { Game } from '../game/Game';
import { survivalMission } from '../game/Missions';

// Development-only captures and A/B timing for the bomber stream (Phase 10 goal 08,
// docs/phase10/reports/08.md). Runs in hidden tabs: every frame is driven by engine.frame.
//   await sws.streamShots.all(5318)         the goal's three captures, saved through
//                                           tools/gallery/save-server.mjs (visual-qa/08/*.jpg)
//   sws.streamShots.perf('high')            bench with the stream on and off
type Vqa = { freeze(): void; mood(n: string): void; gunner(st: string, o?: Record<string, number | boolean>): void; release(): void; clear(): void; quality(q: Quality): void };

export function streamShots(engine: Engine, game: Game, vqa: Vqa, bench: (n?: number) => Record<string, number>) {
  const s = engine.bomberStream;
  const step = (n: number, render = 0) => { for (let i = 0; i < n; i++) engine.frame(1 / 60, i >= n - render); };
  const ensureMission = () => {
    if (game.state !== 'playing' || game.mission?.role !== 'gunner') {
      const b = (game as any).bookends; const auto = b?.auto; if (b) b.auto = true;
      game.startMission(survivalMission('gunner'));
      if (b) b.auto = auto;
    }
  };
  // a calm frame on a gun position: no enemies, the stream baked and in place
  const setup = (mood: string, station: string, yaw: number, pitch: number, q: Quality = 'high') => {
    vqa.freeze();
    vqa.quality(q);
    ensureMission();
    vqa.mood(mood);
    for (let i = 0; i < 40 && !s.stats().baked.gaggle; i++) step(10);
    vqa.clear();
    vqa.gunner(station, { yaw, pitch });
    step(90, 16);
    vqa.clear();
    step(2, 2);
  };
  const save = async (file: string, port: number) => {
    const url = engine.renderer.domElement.toDataURL('image/jpeg', 0.9);
    const r = await fetch(`http://localhost:${port}/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: url });
    return r.text();
  };
  return {
    setup, step, save,
    /** top turret toward the stream, tail looking back over the following boxes, sunset field */
    async all(port = 5318, q: Quality = 'high') {
      const out: string[] = [];
      setup('clear', 'top', 1.75, 0.12, q); out.push(await save(`visual-qa/08/top-turret-stream-${q}.jpg`, port));
      setup('clear', 'tail', 0.25, 0.04, q); out.push(await save(`visual-qa/08/tail-following-boxes-${q}.jpg`, port));
      setup('dusk', 'waistR', 0, 0.05, q); out.push(await save(`visual-qa/08/sunset-contrail-field-${q}.jpg`, port));
      vqa.release();
      return out;
    },
    /** frame times with the stream on and off at a quality tier */
    perf(q: Quality = 'high', n = 90) {
      setup('clear', 'top', 1.75, 0.12, q);
      s.enabled = true; step(4, 4);
      const on = { ...bench(n), stream: s.stats() };
      s.enabled = false; step(4, 4);
      const off = bench(n);
      s.enabled = true;
      return { q, on, off };
    },
  };
}
