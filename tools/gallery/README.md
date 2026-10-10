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
