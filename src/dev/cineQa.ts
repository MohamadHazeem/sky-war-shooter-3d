import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import { filmLook } from '../render/FilmParams';

// Dev hooks for the combat director and the film look (Phase 10 goal 10), as sws.cine:
//   sws.cine.pass('waist' | 'wingtip' | 'telephoto')   a close pass now (nearest fighter put on a passing line)
//   sws.cine.kill('gunCam' | 'chase' | 'telephoto')    the nearest fighter dies, followed by that camera
//   sws.cine.reel()                                    the mission-end combat film (debrief state)
//   sws.cine.film('off' | 'film' | 'kodachrome' | 'newsreel')   the play look (Settings "Film look")
//   sws.cine.status()                                  shot / film parameters / objects motion-blurred
//   sws.cine.save(name)                                this frame as docs/phase10/shots/10/<name>.jpg
export function cineQa(engine: Engine, game: Game) {
  return {
    pass: (cam?: string) => game.cine.devShot('pass', cam),
    kill: (cam?: string) => game.cine.devShot('kill', cam),
    reel: () => game.cine.theatre.openReel(),
    film: (look?: string) => { game.settings.filmLook = filmLook(look); game.applySettings(); return game.settings.filmLook; },
    status: () => ({ shot: game.cine.shotInfo, film: { ...engine.post.film.p }, shotLook: engine.post.film.shotName, blurred: engine.post.film.objectsBlurred, timeScale: engine.timeScale }),
    save: async (name: string, q = 0.82) => {
      engine.render(1 / 60);
      const url = engine.renderer.domElement.toDataURL('image/jpeg', q);
      const blob = await (await fetch(url)).blob();
      const r = await fetch(`/__dev/save?path=docs/phase10/shots/10/${encodeURIComponent(name)}.jpg`, { method: 'POST', body: blob });
      return r.ok ? `${name}.jpg ${blob.size} B` : `save failed ${r.status}`;
    },
  };
}
