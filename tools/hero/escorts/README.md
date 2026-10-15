# P-47D / Spitfire Mk IX escorts (Phase 11 goal 23)

The shapes are Syd Adams's P-47D-30 and Detlef Faber's standard-wing Spitfire IX from the
**official FlightGear FGAddon Aircraft-2020 distribution**. `sources.json` pins the downloads
by SHA-256; the original converted geometry is in `tools/convert_models/output/` and the
conversion filters/markers in `tools/convert_models/configs/`. No source simulator code runs.
The conversion excludes alternative wing tips, duplicate flaps, external stores and P-47
extended landing gear. The Spitfire retains its fixed tailwheel and closed main gear.

Source / licence:

- [Official P-47 source](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/P47/),
  author declared in `p47d-30-set.xml`: Syd Adams. Distributed by the official GPLv2+ hangar;
  [FlightGear policy](https://www.flightgear.org/about/policy/) and
  [official hangar terms](https://wiki.flightgear.org/Hangars). The archive has no individual COPYING file.
  This is **not** the modified GPLv3 FGMEMBERS fork.
- [Official Spitfire IX source](https://svn.code.sf.net/p/flightgear/fgaddon/trunk/Aircraft/spitfireIX/),
  Detlef Faber; its explicit GPLv2 README is preserved as `Spitfire-LICENSE.txt`.
- The game's `LICENSE` includes GPLv2. Our derived pipeline and assets retain these source terms.

The shared hero pipeline preserves FlightGear surface vertices, refines curved panels, splits
structural/hinged parts, generates a 2048-pixel atlas, bakes AO, paints panel seams/rivets, wear,
USAAF stars-and-bars and RAF roundels/codes, then generates 10k/3k airframe LODs. Runtime
`HeroLook` selects screen-size LODs and pins Low to LOD2. Controls, canopy, spinner and propeller
retain named nodes. KTX2 UASTC maps (2048 base, 1024 normal/ORM, full mips) have embedded WebP fallback.
These are escort exteriors, not player cockpits or parked-aircraft models.

Rebuild from the checked-in conversion outputs, using an **existing** Blender/Basis encoder:

```sh
BASISU=/path/to/basisu tools/heavy.sh tools/cached.sh escorts \
  tools/hero/escorts/build.sh tools/hero/luftwaffe/types \
  tools/hero/luftwaffe/paint.py tools/hero/luftwaffe/allied_paint.py \
  tools/hero/luftwaffe/build.py tools/hero/luftwaffe/fg.py \
  tools/hero/luftwaffe/airframe.py tools/hero/luftwaffe/model.py \
  tools/hero/luftwaffe/parts.py tools/hero/luftwaffe/geom.py \
  tools/hero/luftwaffe/finish.mjs tools/convert_models/output/p47d.glb \
  tools/convert_models/output/spitfire9.glb -- tools/hero/escorts/build.sh
```

To reconvert, download and SHA-check the archives listed in `sources.json`, unpack in
`.cache/escorts`, and invoke `convert_ac.py` on each listed model with its matching config,
output and report. Wrap Blender invocations with `tools/heavy.sh tools/cached.sh`.

QA uses port **5423** (the task omitted a port and 5323 was occupied). Start one Vite server,
then run `tools/heavy.sh node tools/hero/escorts/capture.mjs`. Set `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_EXECUTABLE` if needed; the executable must be an installed **headless shell**.
The script uses the actual live production game and local game, the same six-second formation,
weather, aircraft positions, cameras and viewport, saving JPEGs, side-by-side sheets and metadata
under `docs/phase11/shots/23/`. The baseline has P-51s because live does not have these aircraft.
The viewport and High render are 1920×1080; individual JPEGs are downsampled to 1280×720.
Low renders at its 1074×604 budget and is resized to 1280×720 for inspection.
Standard comparison sheets are 1280×388; the additional `*-close` comparisons are
1920×568. Both dimensions are recorded in `comparison.json`.

Dimension references: [USAF P-47 data](https://www.aetc.af.mil/Portals/88/Documents/history/AFD-070130-081.pdf) (40 ft 9 in span, 36 ft 2 in length); [Italian Air Force Spitfire V/IX](https://www.aeronautica.difesa.it/en/2023/05/26/spitfire-v-ix/) (11.23 m span, 9.47 m IX length). Tests allow 5%; the source-shape overlay uses fixed metres and no shape fitting.
