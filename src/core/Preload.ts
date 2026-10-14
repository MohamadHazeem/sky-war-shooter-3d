// Progressive loading plan.
//  1. Essentials (the loading screen waits for these, with byte progress): the models the menu
//     shows (B-17 formation, P-51 escorts) and the default enemy (Fw 190), the audio manifest
//     and the core one-shots (guns, hits, UI click, radio squelch).
//  2. Background, after the menu is up, a few files at a time in this order: the menu music,
//     the other one-shots, the other models (enemy types, P-51 cockpit), the engine/cabin/wind
//     loops, the mission music, then the rest. Sound decodes whatever is in when the
//     AudioContext starts (first click) and swaps each recording in as it arrives
//     (the synthesized sounds stand in until then).
//  3. A mission starts only once every model (enemy types change hit boxes, not just looks)
//     and every one-shot is in (whenMissionReady: a small loading screen if the player is
//     faster than the network). The engine / cabin / wind loops (~4 MB of WAV) are not waited
//     for: their synthesized versions play until Sound swaps the recordings in.
//  4. Once everything is in, the service worker is registered and fills the offline cache
//     (mostly from the HTTP cache, so nothing is downloaded twice).
// Voice clips stay lazy (audio/Voice.ts: manifest after the first gesture, clips on first use).
import { NOW, json, progress, request } from './Assets';
import { ALL_MODELS, ESSENTIAL_MODELS, loadModels, modelPath } from '../world/Models';
import { tx } from '../i18n';
import { loadInteriorAssets } from '../game/InteriorAssets';

interface AudioManifest {
  loops?: Record<string, { file: string }>;
  sfx?: Record<string, { file?: string; files?: string[] }>;
  music?: Record<string, { file: string }>;
}

export const AUDIO_MANIFEST = 'audio/manifest.json';
const CORE_SFX = ['ui_click', 'mg50_shot', 'impact_metal', 'hit_confirm', 'kill_confirm', 'radio_squelch_on'];
const MISSION_LOOPS = ['b17_interior', 'wind', 'radial_exterior', 'merlin'];
// background priorities (lower first)
export const P_MENU_MUSIC = 1, P_SFX = 2, P_MODELS = 3, P_LOOPS = 4, P_MISSION_MUSIC = 5, P_REST = 6;

const sfxFiles = (m: AudioManifest, keys: string[]) =>
  keys.flatMap((k) => { const e = m.sfx?.[k]; return e ? e.files ?? (e.file ? [e.file] : []) : []; }).map((f) => 'audio/' + f);
const loopFiles = (m: AudioManifest, keys: string[]) => keys.flatMap((k) => (m.loops?.[k] ? ['audio/' + m.loops[k].file] : []));
const musicFiles = (m: AudioManifest, keys: string[]) => keys.flatMap((k) => (m.music?.[k] ? ['audio/' + m.music[k].file] : []));

let missionFiles: string[] = [];
let missionReady: Promise<void> | null = null;
let missionDone = false;

// Resolves once every essential download has been requested (the manifest decides which
// sounds): main.ts waits for it, briefly, before the renderer setup blocks the main thread.
let markRequested!: () => void;
export const essentialsRequested = new Promise<void>((r) => { markRequested = r; });

// Step 1. onProgress(0..1) follows the bytes of the essentials.
export async function loadEssentials(onProgress: (f: number) => void): Promise<void> {
  const models = ESSENTIAL_MODELS.map(modelPath);
  let files = [...models, AUDIO_MANIFEST];
  const tick = () => onProgress(progress(files).f);
  const timer = setInterval(tick, 100);
  try {
    const modelsDone = loadModels(ESSENTIAL_MODELS, NOW);
    const man = await json<AudioManifest>(AUDIO_MANIFEST).catch(() => ({} as AudioManifest));
    const core = sfxFiles(man, CORE_SFX);
    files = [...files, ...core];
    const sounds = core.map((f) => request(f, NOW).catch(() => null));
    markRequested();
    await Promise.all([modelsDone, ...sounds]);
    tick();
  } finally {
    clearInterval(timer);
    markRequested();
  }
}

// Step 2. Returns at once; the work runs in the background.
export function loadInBackground() {
  if (missionReady) return;
  missionReady = (async () => {
    const man = await json<AudioManifest>(AUDIO_MANIFEST).catch(() => ({} as AudioManifest));
    const allSfx = Object.keys(man.sfx ?? {});
    const allLoops = Object.keys(man.loops ?? {});
    const allMusic = Object.keys(man.music ?? {});
    const get = (files: string[], prio: number) => files.map((f) => request(f, prio).then(() => {}, () => {}));
    const menuMusic = get(musicFiles(man, ['menu']), P_MENU_MUSIC);
    const sfx = get(sfxFiles(man, allSfx), P_SFX);
    const models = loadModels(ALL_MODELS, P_MODELS);
    const loops = get(loopFiles(man, MISSION_LOOPS), P_LOOPS);
    const missionMusic = get(musicFiles(man, ['tension', 'combat']), P_MISSION_MUSIC);
    const rest = get([
      ...loopFiles(man, allLoops.filter((k) => !MISSION_LOOPS.includes(k))),
      ...musicFiles(man, allMusic.filter((k) => !['menu', 'tension', 'combat'].includes(k))),
    ], P_REST);
    void loadInteriorAssets(P_LOOPS);   // B-17 interior 2.0 (~0.6 MB): not waited for; Low never uses it
    missionFiles = [...ALL_MODELS.map(modelPath), ...sfxFiles(man, allSfx)];
    void Promise.all([...menuMusic, ...missionMusic, ...rest, ...sfx, ...loops, models]).then(registerServiceWorker);
    await Promise.all([...sfx, models]);
    missionDone = true;
  })();
}

export const isMissionReady = () => missionDone;

// Step 3. Runs start() at once if the mission assets are in, otherwise after a loading screen
// (only the latest request is kept, so a double click starts one mission).
let queued: (() => void) | null = null;
export function whenMissionReady(ui: { loading(f: number, msg?: string): void }, start: () => void) {
  if (isMissionReady()) { start(); return; }
  const first = !queued;
  queued = start;
  if (!first) return;
  loadInBackground();
  const el = document.getElementById('loading');
  const show = () => {
    const p = progress(missionFiles.length ? missionFiles : ALL_MODELS.map(modelPath));
    ui.loading(p.f, tx('Loading aircraft and sounds… {a} / {b} MB', { a: (p.loaded / 1048576).toFixed(1), b: (p.total / 1048576).toFixed(1) }));
  };
  el?.classList.add('show');
  show();
  const timer = setInterval(show, 150);
  void missionReady!.then(() => {
    clearInterval(timer);
    ui.loading(1, tx('Ready'));
    el?.classList.remove('show');
    const go = queued;
    queued = null;
    go?.();
  });
}

// Step 4. Production only (the dev server serves unbundled modules).
function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch((e) => console.info('Service worker not registered', e));
}
