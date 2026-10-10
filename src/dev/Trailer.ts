import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import type { Game } from '../game/Game';
import type { Aircraft, Fighter } from '../world/Aircraft';
import type { StationId } from '../world/B17Layout';
import { CAMPAIGN, survivalMission, type Mission } from '../game/Missions';
import type { Weather } from '../render/Weather';
import { GUNNER_HIDDEN } from '../game/PhotoMode';
import { sound } from '../audio/Sound';
import { GAME_NAME, SHARE_URL } from '../game/Share';

// In-engine trailer (dev hook): sws.trailer() plays a ~57 s scripted cinematic over a live
// survival mission — establishing shot over the clouds, a bomber close-up, a Fw 190 diving in,
// the waist gunner's view with tracers, a kill with slow motion, the Luftkreuzer battle group
// reveal and the title card. What is shown is drawn into a 16:9 compositor canvas (letterbox,
// captions, title) that sits on top of the page; with { record: true } that canvas (and the
// game audio) is recorded with MediaRecorder to a WebM and offered as a download.
//
// Real-time recording needs a visible tab (requestAnimationFrame). In a hidden or headless tab
// the timeline can still be driven with sws.step(n, 1/30, true). See docs/TRAILER.md.

export interface TrailerOptions {
  record?: boolean;     // record a WebM (MediaRecorder on the compositor canvas)
  save?: boolean;       // dev server: also write it to trailer-out/ (git-ignored)
  download?: boolean;   // trigger a browser download when done (default: true when recording)
  audio?: boolean;      // include the game audio in the recording (default true)
  width?: number;       // compositor size (default 1280 x 720)
  height?: number;
  fps?: number;         // capture rate (default 30)
  bitrate?: number;     // video bits per second (default 8 Mbit/s)
  weather?: Weather;
  start?: number;       // start the timeline at this second (testing)
}

export interface TrailerResult {
  seconds: number;
  frames: number;
  aborted: boolean;
  bytes?: number;
  url?: string;
  mime?: string;
  saved?: string;
}

interface Shot { at: number; len: number; name: string; caption?: [string, string?] }
export const SHOTS: Shot[] = [
  { at: 0, len: 8, name: 'establish', caption: ['1943', 'THE EIGHTH AIR FORCE GOES TO WAR'] },
  { at: 8, len: 7, name: 'bomber' },
  { at: 15, len: 8, name: 'attack', caption: ['THEY CAME OUT OF THE SUN'] },
  { at: 23, len: 8, name: 'gunner', caption: ['MAN THE GUNS'] },
  { at: 31, len: 6, name: 'kill' },
  { at: 37, len: 11, name: 'boss', caption: ['AND THEN', 'THE LUFTKREUZERS'] },
  { at: 48, len: 9, name: 'title' },
];
export const TRAILER_LENGTH = 57;

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Formation frame: x = left, y = up, z = forward, metres from `base`. */
export function formationPoint(game: Game, x: number, y: number, z: number, base?: THREE.Vector3, out = new THREE.Vector3()) {
  const w = game.world;
  const fwd = _a.copy(w.formationForward).setY(0).normalize();
  const left = _b.crossVectors(UP, fwd).normalize();
  return out.copy(base ?? w.formationCenter).addScaledVector(left, x).addScaledVector(UP, y).addScaledVector(fwd, z);
}

/** Starts a live survival mission dressed for filming: no HUD, no damage to the player. */
export function startFilmingMission(game: Game, weather?: Weather): Mission {
  const m: Mission = { ...survivalMission('gunner'), weather: weather ?? CAMPAIGN[1].weather };
  game.startMission(m);
  game.world.playerDamageScale = 0;
  return m;
}

const STYLE_ID = 'sws-trailer-style';
export function hideGameUi(on: boolean) {
  document.body.classList.toggle('sws-trailer', on);
  if (on && !document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = 'body.sws-trailer > *:not(#app):not(.sws-trailer-comp) { visibility: hidden !important; }'
      + '.sws-trailer-comp { position: fixed; inset: 0; width: 100vw; height: 100vh; object-fit: contain; background: #000; z-index: 9999; }';
    document.head.appendChild(st);
  }
}

/** Shows the player bomber's parts the gunner view hides (for outside shots), or hides them again. */
export function revealPlayerBomber(game: Game, outside: boolean) {
  const m = game.world.playerBomber?.model;
  if (!m) return;
  if (outside) m.traverse((o) => { if (GUNNER_HIDDEN.includes(o.name)) o.visible = true; });
  else (game.gunner as any).applyModelVisibility?.(game.gunner.station);
}

/** Copies the WebGL canvas into a 2D context with cover-fit (call right after a render). */
export function drawCover(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, W: number, H: number) {
  const sa = src.width / src.height, da = W / H;
  let sw = src.width, sh = src.height, sx = 0, sy = 0;
  if (sa > da) { sw = sh * da; sx = (src.width - sw) / 2; } else { sh = sw / da; sy = (src.height - sh) / 2; }
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);
}

function liveFighters(game: Game): Fighter[] {
  return game.world.fighters('axis').filter((f) => f.alive);
}

function nearest(list: Aircraft[], p: THREE.Vector3, min = 0, max = Infinity): Aircraft | null {
  let best: Aircraft | null = null, bd = max;
  for (const a of list) { const d = a.pos.distanceTo(p); if (d >= min && d < bd) { bd = d; best = a; } }
  return best;
}

function toughen(a: Aircraft, k: number) {
  for (const z of a.zones) { z.hp *= k; z.maxHp *= k; }
  const s = a as any;
  if (Number.isFinite(s.maxStructure)) { s.structure *= k; s.maxStructure *= k; }
}

let running: { abort(): void } | null = null;

export function trailer(engine: Engine, game: Game, o: TrailerOptions = {}): Promise<TrailerResult> {
  running?.abort();
  const W = o.width ?? 1280, H = o.height ?? 720, FPS = o.fps ?? 30;
  const w = game.world;
  const cam = engine.camera;
  const inp = (game as any).input;

  // ---- setup ----
  startFilmingMission(game, o.weather);
  hideGameUi(true);
  const comp = document.createElement('canvas');
  comp.className = 'sws-trailer-comp';
  comp.width = W; comp.height = H;
  document.body.appendChild(comp);
  const ctx = comp.getContext('2d')!;
  void document.fonts?.load('700 64px Oswald');
  void document.fonts?.load('400 20px "IBM Plex Mono"');

  // fixed resolution while filming (no dynamic-resolution drops)
  const drs = (engine as any).dynamicResolution;
  (engine as any).dynamicResolution = () => {};
  engine.renderScale = 1; engine.resize();

  const origFrame = engine.onFrame;
  const origRender = engine.render;
  let t = o.start ?? 0, frames = 0, done = false, aborted = false;
  let shotName = '', shotT = 0;
  let target: Aircraft | null = null;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let camInit = false;
  const killOff = new THREE.Vector3();
  let killed = false, bossForced = false, spawnedA = false, spawnedB = false;
  const fired = new Set<string>();

  // ---- recording ----
  let rec: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  let audioTap: { node: AudioNode; dest: MediaStreamAudioDestinationNode } | null = null;
  let mime = '';
  if (o.record && typeof MediaRecorder !== 'undefined') {
    const stream = comp.captureStream(FPS);
    const master = (sound as any).master as GainNode | undefined;
    if (o.audio !== false && sound.ctx && master) {
      const dest = sound.ctx.createMediaStreamDestination();
      master.connect(dest);
      audioTap = { node: master, dest };
      for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    }
    mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x)) ?? '';
    rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: o.bitrate ?? 8_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.start(1000);
  }

  // ---- camera direction per shot ----
  const setCam = (pos: THREE.Vector3, look: THREE.Vector3, fov: number, ease = 0) => {
    if (cam.parent !== engine.scene) engine.scene.add(cam);
    if (!camInit || ease <= 0) { camPos.copy(pos); camLook.copy(look); camInit = true; }
    else { camPos.lerp(pos, ease); camLook.lerp(look, ease); }
    cam.position.copy(camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(camLook);
    cam.fov = fov;
    cam.updateProjectionMatrix();
    const post = engine.post;
    post.nearFocus = 0.1; post.dofStrength = 0; post.noBlurDist = 1e6;
  };

  const aimAndFire = () => {
    // the gunner's view: swing to the nearest fighter in a gun's arc, lead it, fire
    const gun = game.gunner, pb = w.playerBomber;
    inp.locked = true; inp.buttons = 0;
    if (!pb) return;
    const f = nearest(liveFighters(game), pb.pos, 60, 900) as Fighter | null;
    if (!f) return;
    const d = f.pos.distanceTo(pb.pos), tof = d / 870;
    const tp = f.pos.clone().add(f.vel.clone().sub(pb.vel).multiplyScalar(tof));
    tp.y += 0.5 * 9.81 * tof * tof;
    const ids: StationId[] = ['waistL', 'waistR', 'top', 'tail'];   // the ball turret's view reads poorly on film
    for (const id of [gun.station, ...ids]) {
      const def = (gun as any).states.get(id).def;
      const local = pb.worldToLocal(tp.clone()).sub(def.pivot);
      const yaw = Math.atan2(local.x, local.z), pitch = Math.asin(local.y / local.length());
      let dy = yaw - def.rest.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      if (dy >= def.yaw[0] && dy <= def.yaw[1] && pitch >= def.pitch[0] && pitch <= def.pitch[1]) {
        if (id !== gun.station) { (gun as any).setStation(id, true); revealPlayerBomber(game, false); }
        gun.state.tYaw = dy; gun.state.tPitch = pitch - def.rest.pitch;
        if (!gun.state.overheated && d < 700) inp.buttons = 1;
        return;
      }
    }
  };

  const direct = (dt: number) => {
    const shot = SHOTS.find((s) => t >= s.at && t < s.at + s.len) ?? SHOTS[SHOTS.length - 1];
    if (shot.name !== shotName) {
      if (shotName === 'gunner') inp.locked = false;   // aimAndFire fakes pointer lock for the gun
      shotName = shot.name; shotT = 0; camInit = false; revealPlayerBomber(game, shot.name !== 'gunner');
    }
    shotT += dt;
    const s = shotT;
    const fc = w.formationCenter;
    const pb = w.playerBomber;
    w.playerDamageScale = 0;
    inp.buttons = 0;

    // scripted events
    if (!spawnedA && t >= 12.5) {
      spawnedA = true;
      const f = w.spawnEnemy(formationPoint(game, 380, 260, 1100), 'headon', 1.3, false, false, 'fw190');
      toughen(f, 30);
      target = f;
      for (let i = 0; i < 3; i++) w.spawnEnemy(formationPoint(game, -300 + i * 240, 200 + i * 60, 1300 + i * 120), (['headon', 'high', 'beam'] as const)[i], 1, false, false, 'fw190');
    }
    if (!spawnedB && t >= 21) {
      spawnedB = true;
      for (let i = 0; i < 3; i++) w.spawnEnemy(formationPoint(game, 420 + i * 60, 80 + i * 40, -200 + i * 250), 'beam', 1.1, false, false, 'fw190');
    }
    if (!bossForced && t >= 25) { bossForced = true; game.boss.force(); }

    switch (shot.name) {
      case 'establish':
        setCam(formationPoint(game, -260 + s * 12, 110 - s * 3, 220 - s * 10), formationPoint(game, 0, -25, -40), 40);
        break;
      case 'bomber': {
        const b = pb ?? w.bombers()[0];
        if (!b) break;
        const a = 2.5 - s * 0.11, r = 30;
        setCam(formationPoint(game, Math.cos(a) * r, 4 + s * 0.35, Math.sin(a) * r, b.pos), formationPoint(game, 0, 1, 3, b.pos), 48);
        break;
      }
      case 'attack': {
        if (!target || !target.alive) target = nearest(liveFighters(game), fc, 0, 3000);
        if (!target) { setCam(formationPoint(game, 30, -10, -80), formationPoint(game, 0, 60, 900), 50); break; }
        const fwd = (target as Fighter).forward(new THREE.Vector3());
        const pos = target.pos.clone().addScaledVector(fwd, -62).addScaledVector(UP, 13);
        // ahead of the fighter, drawn a little toward the bombers it is diving on
        const look = target.pos.clone().addScaledVector(fwd, 120).lerp(fc, 0.18);
        setCam(pos, look, 52, 1 - Math.exp(-dt * 6));
        break;
      }
      case 'gunner':
        aimAndFire();   // the gunner controller owns the camera in this shot
        break;
      case 'kill': {
        if (!target || s < dt * 1.5) {
          // the closest fighter to the formation, still flying
          if (!target || !target.alive || target.pos.distanceTo(fc) > 1500) target = nearest(liveFighters(game), fc, 80, 1500);
          if (target) {
            const fwd = (target as Fighter).forward(new THREE.Vector3());
            const left = new THREE.Vector3().crossVectors(UP, fwd).normalize();
            killOff.copy(left).multiplyScalar(48).addScaledVector(fwd, 55).addScaledVector(UP, 8);
          }
        }
        if (!target) { setCam(formationPoint(game, -60, 10, -40), fc, 50); break; }
        if (!killed && s >= 1.0) {
          killed = true;
          if (target.alive) w.killAircraft(target, true, 'engine');
          engine.timeScale = 0.35;
        }
        if (killed && s >= 3.6) engine.timeScale = 1;
        setCam(target.pos.clone().add(killOff), target.pos, 50, killed ? 1 - Math.exp(-dt * 3) : 0);
        break;
      }
      case 'boss': {
        const ships = game.boss.ships.filter((x) => x.deathT < 0);
        const look = new THREE.Vector3();
        if (ships.length) { for (const x of ships) look.add(x.ship.pos); look.multiplyScalar(1 / ships.length); }
        else formationPoint(game, 0, 200, 1500, undefined, look);
        setCam(formationPoint(game, 34, -18, -70 + s * 5), look, 44 - s * 0.9, s < 0.05 ? 0 : 1 - Math.exp(-dt * 1.5));
        break;
      }
      case 'title': {
        const ships = game.boss.ships.filter((x) => x.deathT < 0);
        const look = formationPoint(game, 0, 60, 500);
        if (ships.length) look.lerp(ships[0].ship.pos, 0.35);
        setCam(formationPoint(game, -150 + s * 7, 50 + s * 2, -230), look, 46, s < 0.05 ? 0 : 1 - Math.exp(-dt * 1.2));
        break;
      }
    }
  };

  // ---- overlay: letterbox, captions, title card, fades ----
  const fadeIn = (x: number, a: number, len: number) => Math.max(0, Math.min(1, (x - a) / len));
  const overlay = () => {
    const bar = Math.round((H - W / 2.35) / 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    const u = W / 1280;
    // caption for the current shot (fades in and out)
    const shot = SHOTS.find((s) => t >= s.at && t < s.at + s.len);
    if (shot?.caption) {
      const k = Math.min(fadeIn(t, shot.at + 0.6, 0.8), 1 - fadeIn(t, shot.at + 3.6, 0.8));
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.textAlign = 'center';
        // set in the lower letterbox bar: always legible, whatever the sky is doing
        ctx.fillStyle = '#f2ead3';
        ctx.font = `600 ${Math.round(28 * u)}px Oswald, "Arial Narrow", sans-serif`;
        const y = H - bar + (shot.caption[1] ? 36 : 52) * u;
        ctx.fillText(shot.caption[0], W / 2, y);
        if (shot.caption[1]) {
          ctx.font = `400 ${Math.round(14 * u)}px "IBM Plex Mono", monospace`;
          ctx.fillStyle = 'rgba(201,183,122,0.95)';
          ctx.fillText(shot.caption[1], W / 2, y + 26 * u);
        }
        ctx.restore();
      }
    }
    // title card
    const tc = fadeIn(t, 49.2, 1.4);
    if (tc > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(6,8,6,${0.45 * tc})`;
      ctx.fillRect(0, bar, W, H - 2 * bar);
      ctx.globalAlpha = tc;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 18 * u;
      ctx.fillStyle = '#c9b77a';
      ctx.font = `400 ${Math.round(16 * u)}px "IBM Plex Mono", monospace`;
      ctx.fillText('EIGHTH AIR FORCE · 1943–1944', W / 2, H / 2 - 74 * u);
      ctx.fillStyle = '#f2ead3';
      ctx.font = `700 ${Math.round(92 * u)}px Oswald, "Arial Narrow", sans-serif`;
      ctx.fillText(GAME_NAME.toUpperCase(), W / 2, H / 2 + 14 * u);
      ctx.fillStyle = '#c9b77a';
      ctx.fillRect(W / 2 - 40 * u, H / 2 + 34 * u, 80 * u, 3 * u);
      ctx.globalAlpha = tc * fadeIn(t, 50.6, 1);
      ctx.fillStyle = 'rgba(242,234,211,0.9)';
      ctx.font = `500 ${Math.round(22 * u)}px Oswald, "Arial Narrow", sans-serif`;
      ctx.fillText('MAN THE GUNS OF A B-17 · FLY ESCORT IN A P-51', W / 2, H / 2 + 74 * u);
      ctx.font = `400 ${Math.round(15 * u)}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = 'rgba(242,234,211,0.75)';
      ctx.fillText('Play free in your browser — ' + SHARE_URL.replace(/^https:\/\//, '').replace(/\/$/, ''), W / 2, H / 2 + 108 * u);
      ctx.restore();
    }
    // fade from and to black
    const black = Math.max(1 - fadeIn(t, 0, 1.6), fadeIn(t, TRAILER_LENGTH - 1.6, 1.4));
    if (black > 0) { ctx.fillStyle = `rgba(0,0,0,${black})`; ctx.fillRect(0, 0, W, H); }
  };

  let resolveP!: (r: TrailerResult) => void;
  const result = new Promise<TrailerResult>((r) => { resolveP = r; });

  // the timeline runs on real (unscaled) time: slow motion slows the world, not the edit
  const origEngineFrame = engine.frame;
  let realDt = 0, lastNow = performance.now();
  engine.frame = (fixedDt?: number, render = true) => {
    const now = performance.now();
    realDt = fixedDt ?? Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    origEngineFrame.call(engine, fixedDt, render);
  };
  engine.onFrame = (dt, time) => {
    origFrame?.(dt, time);
    if (done) return;
    if (game.state === 'paused' || game.state === 'menu' || game.state === 'debrief') { finish(true); return; }
    t += realDt;
    direct(realDt);
    if (t >= TRAILER_LENGTH) finish(false);
  };
  engine.render = (dt: number) => {
    origRender.call(engine, dt);
    if (done) return;
    drawCover(ctx, engine.renderer.domElement, W, H);
    overlay();
    frames++;
  };

  const cleanup = () => {
    engine.onFrame = origFrame;
    engine.render = origRender;
    engine.frame = origEngineFrame;
    (engine as any).dynamicResolution = drs;
    engine.timeScale = 1;
    inp.buttons = 0; inp.locked = false;
    comp.remove();
    hideGameUi(false);
    audioTap?.node.disconnect(audioTap.dest);
    running = null;
    game.startMenu();
  };

  const finish = (wasAborted: boolean) => {
    if (done) return;
    done = true; aborted = wasAborted;
    const base: TrailerResult = { seconds: +t.toFixed(2), frames, aborted };
    if (!rec) { cleanup(); resolveP(base); return; }
    rec.onstop = async () => {
      cleanup();
      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const name = `sky-war-shooter-3d-trailer-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.webm`;
      const r: TrailerResult = { ...base, bytes: blob.size, url, mime };
      (window as any).sws && ((window as any).sws.trailerBlob = blob);
      if (o.save) {
        try {
          const res = await fetch(`/__dev/save?path=trailer-out/${name}`, { method: 'POST', body: blob });
          if (res.ok) r.saved = `trailer-out/${name}`;
        } catch { /* not on the dev server */ }
      }
      if (o.download !== false) {
        const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      }
      console.info(`Trailer: ${(blob.size / 1e6).toFixed(1)} MB ${mime}`, r);
      resolveP(r);
    };
    rec.stop();
  };

  running = { abort: () => finish(true) };
  (window as any).sws && ((window as any).sws.stopTrailer = () => running?.abort());
  return result;
}
