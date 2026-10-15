// Applies the enabled mods (Phase 11 goal 38; validation and storage in Mods.ts): crew names on
// the roster, paint schemes and nose art in the render registry (render/ModArt.ts), and decodes
// the mods' images as plain bitmaps. Game's constructor calls initMods() before the first
// bomber is dressed; the Mods screen calls setInstalled() after every change.
import { IMAGE_PX, loadInstalled, modItemId, saveInstalled, type InstalledMod, type ModMission } from './Mods';
import { dropModImages, modImage, setModArt, setModImage, type ModNose, type ModPaint } from '../render/ModArt';
import { MEN } from './CrewRoster';
import { refreshPlayerBomber } from './Customize';
import { forgetModNoseArt } from '../render/NoseArt';
import { forgetModPaint } from '../render/Paint';

let installed: InstalledMod[] = [];
const ORIGINAL = new Map(MEN.map((m) => [m.id, { first: m.first, last: m.last, nick: m.nick, bio: m.bio }]));
const failed = new Set<string>();         // images that could not be decoded (or are too big)
const pending = new Set<string>();
const listeners = new Set<() => void>();

export const installedMods = (): readonly InstalledMod[] => installed;
export const onModsChanged = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
export const imageFailed = (url: string) => failed.has(url);

export function initMods() {
  installed = loadInstalled();
  applyMods();
}

// Store and apply a new list; false when it does not fit in storage
export function setInstalled(list: InstalledMod[]): boolean {
  if (!saveInstalled(list)) return false;
  installed = list;
  applyMods();
  return true;
}

// Missions of the enabled mods
export function activeModMissions(): { pack: string; packId: string; mission: ModMission }[] {
  return installed.filter((m) => m.enabled).flatMap((m) => m.pack.missions.map((mission) => ({ pack: m.pack.name, packId: m.pack.id, mission })));
}

export function applyMods() {
  const on = installed.filter((m) => m.enabled);
  // crew names: back to the originals, then each enabled mod in install order (later mods win)
  for (const m of MEN) Object.assign(m, ORIGINAL.get(m.id));
  for (const mod of on) for (const man of MEN) {
    const n = mod.pack.crew[man.id];
    if (n) Object.assign(man, n);
  }
  const paints: ModPaint[] = on.flatMap((mod) => mod.pack.paints.map((p) => ({ ...p, id: modItemId(mod.pack.id, p.id), pack: mod.pack.name })));
  const noses: ModNose[] = on.flatMap((mod) => mod.pack.noseArt.map((n) => ({ ...n, id: modItemId(mod.pack.id, n.id), pack: mod.pack.name })));
  setModArt(paints, noses);
  const urls = new Set<string>([...paints.flatMap((p) => (p.pattern ? [p.pattern] : [])), ...noses.map((n) => n.image)]);
  dropModImages(urls);
  for (const u of urls) if (!modImage(u) && !failed.has(u) && !pending.has(u)) decode(u);
  forgetModNoseArt();
  forgetModPaint();
  refreshPlayerBomber();
  notify();
}

function notify() { for (const cb of listeners) cb(); }

function decode(url: string) {
  if (typeof Image === 'undefined') return;
  pending.add(url);
  const img = new Image();
  img.decoding = 'async';
  const done = (ok: boolean) => {
    pending.delete(url);
    if (ok && img.naturalWidth > 0 && img.naturalWidth <= IMAGE_PX && img.naturalHeight > 0 && img.naturalHeight <= IMAGE_PX) setModImage(url, img);
    else failed.add(url);
    forgetModNoseArt();
    forgetModPaint();
    refreshPlayerBomber();
    notify();
  };
  img.onload = () => done(true);
  img.onerror = () => done(false);
  img.src = url;
}
