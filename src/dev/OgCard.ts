import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import type { Weather } from '../render/Weather';
import { GAME_NAME } from '../game/Share';
import { CAMPAIGN } from '../game/Missions';
import { drawCover, formationPoint, hideGameUi, revealPlayerBomber, startFilmingMission } from './Trailer';

// Social preview card (dev hook): sws.ogCard() frames the B-17 formation over the clouds with a
// Fw 190 diving past, adds the title, and (on the dev server) saves a 1200x630 JPEG to
// public/og-image.jpg through vite.config.ts's /__dev/save endpoint.
//
// The pose numbers are all overridable so the shot can be tuned from the console:
//   sws.ogCard({ save: false, fighter: [x, y, z], cam: [x, y, z] })

export interface OgOptions {
  save?: boolean;                       // POST to /__dev/save (default true)
  path?: string;                        // default public/og-image.jpg
  width?: number; height?: number;      // default 1200 x 630
  quality?: number;                     // JPEG quality (default 0.88)
  weather?: Weather;
  settle?: number;                      // simulated seconds before the shot (default 4)
  fighter?: [number, number, number];   // Fw 190 position, formation frame (x left, y up, z forward)
  aim?: [number, number, number];       // where its nose points, formation frame
  bank?: number;                        // roll in radians
  cam?: [number, number, number];       // camera, relative to the fighter in the formation frame
  look?: [number, number, number];      // camera target, formation frame
  fov?: number;
  title?: boolean;                      // draw the title text (default true)
  keep?: boolean;                       // stay in the posed scene afterwards (default false: back to the menu)
}

export async function ogCard(engine: Engine, game: Game, o: OgOptions = {}) {
  const W = o.width ?? 1200, H = o.height ?? 630;
  const w = game.world;
  startFilmingMission(game, o.weather ?? CAMPAIGN[5].weather);   // low evening sun over the cloud sea
  hideGameUi(true);
  await document.fonts?.load('700 80px Oswald');
  await document.fonts?.load('400 20px "IBM Plex Mono"');
  const drs = (engine as any).dynamicResolution;
  (engine as any).dynamicResolution = () => {};
  engine.renderScale = 1; engine.resize();
  try {
    // let the formation settle (clouds, contrails, prop wash)
    const steps = Math.round((o.settle ?? 4) * 30);
    for (let i = 0; i < steps; i++) { w.playerDamageScale = 0; engine.frame(1 / 30, false); }
    // no enemies but ours
    for (const f of w.fighters('axis')) { f.remove = true; f.root.visible = false; }
    const fp = o.fighter ?? [-50, 40, -30];
    const fw = w.spawnEnemy(formationPoint(game, fp[0], fp[1], fp[2]), 'high', 1, false, false, 'fw190');
    const aim = o.aim ?? [0, 0, 90];
    fw.root.lookAt(formationPoint(game, aim[0], aim[1], aim[2]));
    fw.root.rotateZ(o.bank ?? -0.8);
    fw.vel.copy(game.world.formationForward).multiplyScalar(120);
    fw.root.updateMatrixWorld(true);
    revealPlayerBomber(game, true);
    // camera: behind and beside the fighter, the formation beyond
    const cam = engine.camera;
    if (cam.parent !== engine.scene) engine.scene.add(cam);
    const c = o.cam ?? [45, 10, -95];
    formationPoint(game, c[0], c[1], c[2], fw.pos, cam.position);
    const lk = o.look ?? [-31, 2, 70];
    cam.up.set(0, 1, 0);
    cam.lookAt(formationPoint(game, lk[0], lk[1], lk[2]));
    cam.fov = o.fov ?? 46;
    cam.updateProjectionMatrix();
    const post = engine.post;
    post.nearFocus = 0.1; post.dofStrength = 0; post.noBlurDist = 1e6; post.motionBlur = 0;
    post.resetHistory();
    // render several times without advancing time so temporal effects settle
    for (let i = 0; i < 10; i++) engine.render(1 / 60);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d')!;
    engine.render(1 / 60);
    drawCover(ctx, engine.renderer.domElement, W, H);
    if (o.title !== false) drawTitle(ctx, W, H);
    const blob: Blob = await new Promise((r, j) => out.toBlob((b) => (b ? r(b) : j(new Error('toBlob'))), 'image/jpeg', o.quality ?? 0.88));
    const res: { bytes: number; saved?: string; dataUrl?: string } = { bytes: blob.size };
    if (o.save !== false) {
      const path = o.path ?? 'public/og-image.jpg';
      const r = await fetch(`/__dev/save?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
      if (r.ok) res.saved = path;
    }
    (window as any).sws && ((window as any).sws.ogPreview = out.toDataURL('image/jpeg', 0.6));
    return res;
  } finally {
    (engine as any).dynamicResolution = drs;
    hideGameUi(false);
    if (!o.keep) game.startMenu();
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const u = W / 1200;
  // darken the left third for the type
  const g = ctx.createLinearGradient(0, 0, W * 0.62, 0);
  g.addColorStop(0, 'rgba(8,10,6,0.72)');
  g.addColorStop(0.55, 'rgba(8,10,6,0.35)');
  g.addColorStop(1, 'rgba(8,10,6,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const x = 64 * u;
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14 * u;
  ctx.fillStyle = '#c9b77a';
  ctx.font = `400 ${Math.round(20 * u)}px "IBM Plex Mono", monospace`;
  ctx.fillText('EIGHTH AIR FORCE · 1943–1944', x, 236 * u);
  ctx.fillStyle = '#f2ead3';
  ctx.font = `700 ${Math.round(96 * u)}px Oswald, "Arial Narrow", sans-serif`;
  const [a, b] = GAME_NAME.toUpperCase().split(/ (?=SHOOTER)/);
  ctx.fillText(a, x, 330 * u);
  ctx.fillText(b ?? '', x, 426 * u);
  ctx.fillStyle = '#c9b77a';
  ctx.fillRect(x, 452 * u, 90 * u, 4 * u);
  ctx.fillStyle = 'rgba(242,234,211,0.92)';
  ctx.font = `500 ${Math.round(26 * u)}px Oswald, "Arial Narrow", sans-serif`;
  ctx.fillText('B-17 GUNNER · P-51 ESCORT · FREE IN YOUR BROWSER', x, 500 * u);
  ctx.shadowBlur = 0;
}

