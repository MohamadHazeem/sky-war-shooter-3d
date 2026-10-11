# Visual QA sweep (combined features)

A sweep for rendering artifacts that only show when tonight's features run together: volumetric
clouds (temporal path and cloud shadows), heat haze, volumetric explosions, combat lights, surface
detail, glass FX, the living interior, night mood (searchlights, flares, cloud glow), weather
fronts and the storm wall, countryside, the airbase bookends, the new aircraft, boss warships and
the living sky.

## Tools

- `src/dev/visualQa.ts` (dev build, `sws.vqa`):
  - `check(name)` draws a frame, scans it and saves `visual-qa/sweep/<name>.jpg` through the save
    server. The HDR scan reads the scene target (opaque, clouds and the transparent pass, before
    post) through a small pass that flags NaN/Inf by their exponent bits, texels brighter than 64
    and negative colour, each with a screen box. The LDR scan reads the final canvas and clusters
    pure-black and fully clipped white pixels on an 8 px grid.
  - `freeze()` stops the rAF loop so a set-up view stays put. `step(n, settle)` runs n frames
    without drawing, then `settle` drawn frames, so the temporal passes converge.
  - `mood('clear' | 'golden' | 'overcast' | 'dusk' | 'storm' | 'night')`, `quality(q)`,
    `gunner(station, { ads, lookYaw, lookPitch, yaw, pitch })` (`lookYaw` holds C for free look),
    `look(from, at, fov)` for a free outside camera, `crop(file, x, y, w, h)`, `pick(px, py)` (the
    visible meshes under a pixel) and `qa(name, setup)`.
- `node tools/gallery/save-server.mjs 5239` writes posted frames. A `.jpg` target is saved as a
  small JPEG, 800 px wide at most.
- `python3 tools/gallery/visual-qa/sheet.py out.jpg <cols> <width> <imgs...>` builds a labelled
  contact sheet.

Example:

```js
const v = sws.vqa; v.freeze();
sws.game.startMission(sws.CAMPAIGN[0]); v.step(240, 2);
v.mood('night'); await v.qa('night-tail', () => { v.gunner('tail'); v.step(40, 14); });
```

## Coverage

Gunner stations (waist L/R, top, ball, tail, ADS, free look and the waist interior), each in
clear, overcast, storm, dusk and night. P-51 cockpit, chase and padlock views. The m9 weather
front from the storm wall through to full storm. A boss battle, with close and far views of the
warships. Explosions close up at 30 m and 70 m, by day and at night, and flak. Damage on the
player's B-17: flak holes, decals and engine fires, from inside and outside. Train Busting
(including the ground targets), Night Fighter (searchlights from altitude, from the ground, a
coned raider, flares close up) and Defend the Field. The take-off and landing bookends
(m1 from its briefing). The replay theatre in every camera mode. The aircraft gallery, all 12
entries. The title-menu camera shots. Low, Medium, High and Ultra on the gunner set plus night,
storm cockpit, searchlights and strafe. Free-look sweeps toward the sun and moon at dusk, golden
hour and night (glass scratch regression). A frame-to-frame flicker scan, and checks for
objects showing through the fuselage walls.

The HDR scan found no NaN or Inf in any frame after the fixes. The earlier searchlight and glass
fixes hold.

## Fixed

| Issue | Before | After |
|---|---|---|
| **Tail gun: rivets floating in the air.** The tail's sight-only M2 hid every mesh except tori and spheres. The receiver's 28 rivets and the charging-handle knob are spheres too, so they hung as two arcs of dark dots across the tail window. Now only the ring and the bead near the muzzle stay visible (`GunnerController.ts`). | ![](before/tail-floating-rivets.jpg) | ![](after/tail-floating-rivets.jpg) |
| **Stale sky reflections after a weather change.** Interiors of stations the player was not manning (and anything else out of the scene) missed the env-map retarget. One change later their map was disposed. The tail glass and guns then mirrored the old day sky at night. Every replaced env map is now remembered, and `Engine.sortLayers` points any material still holding one at the current sky (`AircraftLook.freshEnv`). | ![](before/night-tail-window.jpg) | ![](after/night-tail-window.jpg) |
| **Tail window: two white cones at night.** The additive reflection streaks were unlit white, so at night they stood as two bright light cones in the window. They now take the sky's horizon colour: warm at dusk, nearly invisible at night (`Viewmodels.ts`). Same pair of images as the row above. | | |
| **P-51 cockpit: pale veil over the whole view.** Seen from inside, the two-sided canopy mirrored the sky env at x1.6. A storm sky came out at 189/255 instead of 79, and dusk lost its colour. The player's own canopy now gets its own material, and from the cockpit it uses 16 % of the env intensity. Chase view and other P-51s are unchanged (`PilotController.ts`). | ![](before/p51-storm-cockpit-veil.jpg) ![](before/p51-dusk-cockpit-veil.jpg) | ![](after/p51-storm-cockpit-veil.jpg) ![](after/p51-dusk-cockpit-veil.jpg) |
| **Horizontal banding while climbing through the cloud deck** (take-off, about 15-21 s). With the camera inside a layer, grazing rays ran tens of km through the slab with steps about 1 km apart. That left static step noise the temporal resolve could not settle. Inside a layer the march now stops 8 km out (murk), and the cap eases off over the last 500 m before the layer's top or base. Views from above or below a layer are unchanged, and nothing pops (`Clouds.ts`). | ![](before/takeoff-in-cloud-banding.jpg) | ![](after/takeoff-in-cloud-banding.jpg) |
| **Boss HUD covering the streak meter.** On screens 1250 px or wider, the battle-group bar (2D overlay, y 22) sat on the streak meter and the "H — controls" hint at the top centre. It now starts below them, at y 78 (`BossHud.ts`). | ![](before/boss-hud-overlap.jpg) | ![](after/boss-hud-overlap.jpg) |

## Not fixed: recommendations (design, not bugs)

- **Night fill light.** `syncAircraftLook` normalises the hemisphere colour to 0.9 and floors its
  intensity at 70 %. At night the fill is about 80 % of the day's, against a sky about 1/50 as
  bright, and the sky-coloured rim stays at full strength. Aircraft and cockpits read grey-blue,
  where the night mood asks for "barely any fill". At 35 % the player's P-51 nearly vanishes in
  chase view, so this is a readability trade-off for whoever owns the night look.
- **Cloud tops seen from just above the deck** (end of the take-off climb, around 6000 m): grazing
  rays still show stipple. A cap there would cut the cumulus sea, because grazing rays reach the
  dense part kilometres past entry. Real fix: more steps for grazing rays, or a step distribution
  that follows density, on the temporal path.
- **Explosion shock ring at night.** The rim is emissive at a fixed brightness, so it shows as a
  white neon ring at night for about 0.4 s. It could be scaled with `weatherNow.dark`.
- **Debris and ember trails** show as evenly spaced beads (puffs emitted once per frame from fast
  fragments), which is very visible at night as dotted orange lines. They need a smaller spacing,
  or puffs stretched along the velocity.
- **K-14 reflector glass** reads as a pale rectangle in a dark storm or night windscreen
  (MeshPhysical with the default env intensity). It is realistic but distracting, and could drop
  to about 0.4.
- **Low quality interiors** have no shadow map, so the sun lights the inside of the fuselage
  through the hull. The waist and radio room are brighter and greener than on the other tiers. It
  looks readable, not broken.
- **Bullet-hole rims** (bare metal, metalness 0.75) mirror the bright cloud sea and read as white
  outlines on the olive wings, a little sticker-like.
- **Searchlight beams** start a few hundred metres above the lamp (the earlier fix against white
  blobs seen from altitude). From the ground they seem to begin in mid-air. That is fine at the
  night fighter's altitude, but would matter for any low-level night mode.
- **After the landing scene** the debrief backdrop cuts back to the gunner view at altitude.
