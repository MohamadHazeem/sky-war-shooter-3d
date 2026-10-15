// The paint schemes and nose art of the enabled mods (Phase 11 goal 38), as the renderer and the
// hangar see them. game/ModRuntime.ts fills this registry from the validated mod packs and the
// decoded images; Paint.ts, NoseArt.ts and Customize.ts only read it. No imports, so the render
// modules stay free of the mod loader.

export interface ModPaint {
  id: string;              // 'mod.<pack>.<item>' (the key in Progression.bomber.paint)
  name: string;
  pack: string;            // the mod's display name
  top: string;             // '#rrggbb' upper surfaces
  under: string;           // '#rrggbb' underside
  metal: boolean;          // polished (metallic) finish
  scale: number;           // pattern tiles per hull texture
  pattern?: string;        // data: URL of a tileable camouflage image
}

export interface ModNose {
  id: string;              // 'mod.<pack>.<item>' (Progression.bomber.nose)
  name: string;
  pack: string;
  image: string;           // data: URL (2:1 works best; fitted into the 512x256 decal)
  showName: boolean;       // paint the ship's name over the bottom of the image
}

let paints: ModPaint[] = [];
let noses: ModNose[] = [];
const images = new Map<string, CanvasImageSource & { width: number; height: number }>();

export const modPaints = (): readonly ModPaint[] => paints;
export const modNoses = (): readonly ModNose[] => noses;
export const modPaint = (id: string) => (id.startsWith('mod.') ? paints.find((p) => p.id === id) : undefined);
export const modNose = (id: string) => (id.startsWith('mod.') ? noses.find((n) => n.id === id) : undefined);

// A decoded image (undefined until ModRuntime has decoded it)
export const modImage = (url: string | undefined) => (url ? images.get(url) : undefined);

export function setModArt(p: ModPaint[], n: ModNose[]) { paints = p; noses = n; }
export function setModImage(url: string, img: CanvasImageSource & { width: number; height: number }) { images.set(url, img); }
export function dropModImages(keep: Set<string>) { for (const k of [...images.keys()]) if (!keep.has(k)) images.delete(k); }

// A 'paint:mod…' / 'nose:mod…' cosmetic key of an enabled mod (free to use while the mod is on)
export function isModKey(key: string): boolean {
  if (key.startsWith('paint:')) return !!modPaint(key.slice(6));
  if (key.startsWith('nose:')) return !!modNose(key.slice(5));
  return false;
}

// CSS background for a swatch. Only validated values reach here (#rrggbb colours and base64
// data: URLs), so the string is safe inside a style attribute.
export function modSwatch(p: ModPaint): string {
  const base = `linear-gradient(${p.top} 55%, ${p.under} 55%)`;
  return p.pattern ? `url(${p.pattern}) 0 0 / 56px 56px repeat, ${base}` : base;
}
