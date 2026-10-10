# Look-development gallery

Before/after screenshots of fixed camera setups, for the visual match pass toward the
Yarnhub "B-17 gunner" animation (the waist-gunner shot at 0:54-0:58, frames in
`reference/video-frames/`).

| Setup | Before | After |
|---|---|---|
| Waist view (right waist gun, neighbour B-17, cloud sea) | ![](before/waist.png) | ![](after/waist.png) |
| Top turret, looking ahead | ![](before/top.png) | ![](after/top.png) |
| Close Fw 190 crossing the waist window | ![](before/fw190.png) | ![](after/fw190.png) |
| The formation from outside | ![](before/formation.png) | ![](after/formation.png) |
| Dusk mood, waist view | ![](before/dusk.png) | ![](after/dusk.png) |
| Living sky through a long lens (after only) | | ![](after/distant.png) |

All shots: 1512x900 viewport, High preset, PNG downscaled to 1200 px wide.

## Aircraft surface detail (Phase 5 graphics goal 2)

Procedural panel lines, rivets and weathering on the aircraft skins (`render/SurfaceDetail.ts`).
Before = detail off (`swsSurf.level(0)`, what Low renders), after = High.

| Setup | Before | After |
|---|---|---|
| The player's B-17 wing and nacelles, close outside view | ![](surface/before/wing.jpg) | ![](surface/after/wing.jpg) |
| Neighbouring B-17 through a long lens from the right waist | ![](surface/before/neighbour.jpg) | ![](surface/after/neighbour.jpg) |
| Fw 190 passing the waist window (~60 m) | ![](surface/before/fw190close.jpg) | ![](surface/after/fw190close.jpg) |
| P-51 cockpit, its own left wing | ![](surface/before/p51wing.jpg) | ![](surface/after/p51wing.jpg) |
| B-17 Olive Drab | ![](surface/before/paint-olive.jpg) | ![](surface/after/paint-olive.jpg) |
| B-17 Natural Metal | ![](surface/before/paint-silver.jpg) | ![](surface/after/paint-silver.jpg) |
| B-17 Desert Pink | ![](surface/before/paint-desert.jpg) | ![](surface/after/paint-desert.jpg) |
| B-17 Invasion Stripes | ![](surface/before/paint-invasion.jpg) | ![](surface/after/paint-invasion.jpg) |
| The formation from outside (distance: must be identical, no shimmer) | ![](surface/before/formation.jpg) | ![](surface/after/formation.jpg) |

Rebuild (JPEG q86 after the PNG capture, 1200 px wide):
```js
swsSurf.level(0); await sws.gallery.captureSurface('surface/before')
swsSurf.level(null); await sws.gallery.captureSurface('surface/after')
```
Other dev hooks: `swsSurf.debug(1)` shows the chip / streak / grime masks as RGB, `debug(2)`
walkway / wing-root junction / forward faces; `?surf=0|1|2` in the URL forces a level from
the first frame (program counts, A/B benches).

## Rebuilding

1. `npx vite --port 5209 --strictPort` (dev build: the gallery hook is dev-only)
2. `node tools/gallery/save-server.mjs` (writes posted PNGs into this folder on port 5219,
   recompressed losslessly with sharp)
3. Open the game, wait for loading, then in the console:
   ```js
   await sws.gallery.capture('after', sws.gallery.SHOTS_AFTER)   // or 'before', sws.gallery.SHOTS
   ```
   One setup on its own: `sws.gallery.setup('waist'); sws.shot()`.

The setups live in `src/dev/gallery.ts`. Each starts mission 1, seeds `Math.random`
(formation wobble, names) and the living sky, applies the mission weather (dusk: the
survival dusk preset), flies 6 s with enemies removed, then places the camera. Runs are
repeatable, so a new `after` set can be compared with this one.

## What changed between the sets

- **Grade** (`render/PostFX.ts`): saturation 1.12 -> 0.9, softer S-curve, cool-teal
  shadows and warm cream highlights, blacks lifted slightly toward brown (print-film toe),
  exposure x1.06. The picture is warmer and a little desaturated, like the film, instead
  of a saturated digital blue.
- **Sky** (`render/Atmosphere.ts`): the horizon colour reaches higher (paler, airier mid
  sky) and a milky haze band hugs the horizon, so the deep blue stays near the zenith.
- **Clouds** (`render/Clouds.ts`): a little more sun and greyer bases, for more relief
  in the cumulus sea.
- **Aircraft** (`render/AircraftLook.ts`, `world/Models.ts`): per-part materials. Canopy
  and turret glass are glossy (roughness 0.03, strong sky reflection), the painted skin
  is satin with a tighter sun highlight, guns and exhausts are worn bare metal, interiors
  are matte with little reflection, and the natural-metal P-51 is polished aluminium. A
  sky-coloured Fresnel rim (from the hemisphere light, which now follows the weather) makes
  silhouettes read against the sky and the cloud sea; it is warm at dusk. Per-material env
  intensities follow weather changes.
- **Shadows** (`core/Engine.ts`): tighter frustum around the camera (+-40 m instead of
  +-60 m, about 1.5x sharper on High, 3x on Ultra with a 4096 map), snapped to shadow texels
  so the edges don't crawl.
- **Contact AO** (`render/PostFX.ts`): 8 depth taps on the near field (within 90 m)
  darken creases: interior frames, wing roots, ammo boxes. High and Ultra only.
- **Contrails** (`render/Contrails.ts`): the formation's trails are about 30 % longer
  (22 s) for the same CPU cost.
- **Living sky** (`render/LivingSky.ts`): 3 other boxes of 9 B-17s on High (4 x 12 on
  Ultra, 2 x 6 on Medium, off on Low) 3-8 km out, each with long contrail streams; dogfights
  of tiny fighters wheeling, with gun flashes and now and then one going down burning on a
  corkscrew smoke trail; flak barrages bursting around two of the boxes. Visible in `waist`,
  `top`, `fw190` and `dusk` (right of frame and at the horizon) and in `distant`.

## Clouds and heat haze (`clouds-haze/`)

Phase 5 graphics goals 1 and 4. Setups in `src/dev/gallery.ts` (`SHOTS_CLOUDS`); each pair
was captured back to back in one session, `before` with the old cloud path forced
(`sws.cloudBench.configs.legacy()`: the Low path at High's buffer size and 64 steps, haze
off), `after` with the new High path:

```js
const g = sws.gallery, B = sws.cloudBench.configs;
for (const n of g.SHOTS_CLOUDS) {
  B.legacy();   g.setup(n); await g.save(`clouds-haze/before/${n}.png`, g.png());
  B.temporal(); g.setup(n); await g.save(`clouds-haze/after/${n}.png`, g.png());
}
```

`sunedge` / `sunlow` move the camera so that its sun ray crosses a half-shadowed texel of
the cloud shadow map, which puts an upper-layer cloud edge in front of the sun.

| Setup | Before | After |
|---|---|---|
| Waist view, cloud sea with the upper layer's shadows | ![](clouds-haze/before/waist.png) | ![](clouds-haze/after/waist.png) |
| An upper-layer cloud edge in front of the sun (50 deg) | ![](clouds-haze/before/sunedge.png) | ![](clouds-haze/after/sunedge.png) |
| Golden-hour sun (14 deg) behind a cloud | ![](clouds-haze/before/sunlow.png) | ![](clouds-haze/after/sunlow.png) |
| Looking down across the sun onto the cumulus sea | ![](clouds-haze/before/cloudsea.png) | ![](clouds-haze/after/cloudsea.png) |
| Top turret over the right wing (engine haze) | ![](clouds-haze/before/engine.png) | ![](clouds-haze/after/engine.png) |
| Close Fw 190 (its exhaust haze) | ![](clouds-haze/before/fw190.png) | ![](clouds-haze/after/fw190.png) |
| P-51 cockpit (the exhaust stubs' haze) | ![](clouds-haze/before/p51.png) | ![](clouds-haze/after/p51.png) |

Heat haze is a moving shimmer and barely shows in a still, so `after/*-haze.png` are
difference images (haze on vs off, x4; red/yellow = displaced pixels, over the frame at
30 %): `engine-haze` (B-17 nacelle plumes over the wing), `fw190-haze` (the fighter's
exhaust banks), `p51-haze` (the stubs along the nose, through the windscreen),
`muzzle-haze` (waist gun muzzle blast), `ripple-haze` (an explosion ripple 60 m out,
radius 30 m, 0.2 s into its life). Faint speckle on the clouds in those is the temporal
cloud jitter between the two frames, not haze.

A/B render times on the gallery cameras: `sws.cloudBench.ab()` (`src/dev/cloudBench.ts`).
