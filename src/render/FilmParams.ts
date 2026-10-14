// Film look parameters (pure data, no WebGL): what the film passes in FilmLook.ts draw.
//
// Two sources are resolved every frame into one FilmParams (resolveFilm):
//   base   the Settings "Film look" (off / film / Kodachrome / newsreel), used in play; Phase 10
//          goal 12's Cinematic preset is meant to set it (engine.post.film.setLook('film'))
//   shot   a cinematic camera's own look (Cinematics / CombatDirector / Theatre reel), or null
// then filtered by the device and the player: Reduce motion (Accessibility) removes grain, gate
// weave, flicker and dust; Low (economy) removes the expensive passes (DOF, per-object blur).

export type FilmGrade = 'none' | 'kodachrome' | 'newsreel' | 'gunCamera';
export type FilmLookSetting = 'off' | 'film' | 'kodachrome' | 'newsreel';
export const FILM_LOOKS: FilmLookSetting[] = ['off', 'film', 'kodachrome', 'newsreel'];
export const filmLook = (v?: string): FilmLookSetting => (FILM_LOOKS as string[]).includes(v ?? '') ? v as FilmLookSetting : 'off';

/** Cinematic supplies a default; an explicit saved Off or period stock always wins. */
export const presetFilmLook = (quality: string, setting?: string): FilmLookSetting =>
  setting === undefined ? (quality === 'cinematic' ? 'film' : 'off') : filmLook(setting);

export interface FilmParams {
  on: boolean;          // the film pass (everything below except dof / objectBlur) runs
  grade: FilmGrade;
  gradeMix: number;     // 0..1
  grain: number;        // emulsion grain amplitude (display space)
  grainSize: number;    // grain cell, px at 1080p
  weave: number;        // gate weave amplitude, px at 1080p
  halation: number;     // red bleed around highlights (white on B&W stocks)
  ghosts: number;       // spherical lens ghosts + halo from bright sources (no anamorphic streaks)
  vignette: number;     // natural (cos^4) light falloff toward the corners
  flicker: number;      // per-frame exposure flicker, stops
  dust: number;         // dust specks and scratches, 0..1
  soft: number;         // 16 mm softness, 0..1
  exposure: number;     // stops
  dof: boolean;         // bokeh depth of field (thin lens, focus / fStop below)
  focus: number;        // m
  fStop: number;
  cocScale: number;     // artistic multiplier on the physical circle of confusion
  objectBlur: number;   // per-object motion blur shutter, s (0 = off): 1/48 = a 180 degree shutter at 24 fps
}

const base: FilmParams = {
  on: false, grade: 'none', gradeMix: 1, grain: 0, grainSize: 1.5, weave: 0, halation: 0, ghosts: 0, vignette: 0,
  flicker: 0, dust: 0, soft: 0, exposure: 0, dof: false, focus: 100, fStop: 2.8, cocScale: 1, objectBlur: 0,
};
const mk = (p: Partial<FilmParams>): FilmParams => ({ ...base, ...p });

/** Film looks for play (Settings "Film look"). */
export const LOOK_PRESETS: Record<FilmLookSetting, FilmParams> = {
  off: mk({}),
  film: mk({ on: true, grain: 0.032, grainSize: 1.6, weave: 0.3, halation: 0.22, ghosts: 0.45, vignette: 0.32, objectBlur: 1 / 60 }),
  kodachrome: mk({ on: true, grade: 'kodachrome', grain: 0.03, grainSize: 1.5, weave: 0.3, halation: 0.26, ghosts: 0.45, vignette: 0.36, objectBlur: 1 / 60 }),
  newsreel: mk({ on: true, grade: 'newsreel', grain: 0.055, grainSize: 1.8, weave: 0.55, halation: 0.18, ghosts: 0.3, vignette: 0.6, flicker: 0.035, dust: 0.3, objectBlur: 1 / 60 }),
};

/** Cinematic cameras (CineShots.ts, Theatre reel). */
export const SHOT_PRESETS = {
  // colour cinema camera: shallow focus, 180 degree shutter, a little more of everything
  cinema: mk({ on: true, grain: 0.042, grainSize: 1.7, weave: 0.45, halation: 0.34, ghosts: 0.7, vignette: 0.45, dof: true, fStop: 2.0, cocScale: 1.6, objectBlur: 1 / 48 }),
  // a long lens from a neighbouring bomber: compressed, focus on the subject, slightly hazy
  telephoto: mk({ on: true, grain: 0.045, grainSize: 1.8, weave: 0.6, halation: 0.3, ghosts: 0.5, vignette: 0.5, dof: true, fStop: 4, cocScale: 3, objectBlur: 1 / 48, exposure: 0.05 }),
  // 16 mm gun camera (AN-N6 / G-45 style): B&W, soft, heavy grain, gate weave, hot highlights
  gunCamera: mk({ on: true, grade: 'gunCamera', grain: 0.11, grainSize: 2.3, weave: 1.4, halation: 0.55, ghosts: 0, vignette: 1.15, flicker: 0.08, dust: 0.55, soft: 0.55, exposure: 0.3, objectBlur: 1 / 32 }),
  // the mission-end combat film (newsreel B&W)
  reel: mk({ on: true, grade: 'newsreel', grain: 0.06, grainSize: 1.9, weave: 0.8, halation: 0.25, ghosts: 0.35, vignette: 0.7, flicker: 0.045, dust: 0.45, dof: true, fStop: 2.8, cocScale: 1.5, objectBlur: 1 / 48 }),
  // the combat film in colour (Settings "Film look" = Kodachrome)
  reelColour: mk({ on: true, grade: 'kodachrome', grain: 0.045, grainSize: 1.7, weave: 0.6, halation: 0.32, ghosts: 0.5, vignette: 0.5, flicker: 0.015, dust: 0.15, dof: true, fStop: 2.8, cocScale: 1.5, objectBlur: 1 / 48 }),
} satisfies Record<string, FilmParams>;
export type ShotLook = keyof typeof SHOT_PRESETS;

export interface FilmFlags { calm: boolean; economy: boolean }

/** shot ?? base, filtered by Reduce motion (calm) and the Low preset (economy). Writes into
 *  `out` (no allocation: runs every frame). */
export function resolveFilm(out: FilmParams, look: FilmParams, shot: FilmParams | null, f: FilmFlags): FilmParams {
  Object.assign(out, shot ?? look);
  // a shot keeps the player's period grade unless it has one of its own (the gun camera)
  if (shot && shot.grade === 'none' && look.grade !== 'none') out.grade = look.grade;
  if (f.calm) { out.grain = 0; out.weave = 0; out.flicker = 0; out.dust = 0; }
  if (f.economy) { out.on = false; out.dof = false; out.objectBlur = 0; }
  return out;
}

export const SENSOR_H = 0.024;   // m: full-frame gate height (shallower focus than Super 35)

/** Thin-lens circle of confusion scale: CoC in px = k * (dist - focus) / dist. */
export function cocScalePx(fovDeg: number, focus: number, fStop: number, resY: number, artistic = 1): number {
  const F = 0.5 * SENSOR_H / Math.tan((fovDeg * Math.PI) / 360);
  const f = Math.max(focus, F * 1.5);
  const cocM = (F * F) / (Math.max(0.7, fStop) * (f - F));
  return (cocM / SENSOR_H) * resY * artistic;
}
