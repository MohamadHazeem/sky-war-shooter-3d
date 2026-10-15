# Phase 11 goal 24 aircraft

`BASISU=/path/to/existing/basisu sh tools/hero/enemies/build.sh` uses the shared cache and heavy-job slot. No packages or assets are downloaded. The Blender pass bakes a shipped 2048 colour atlas, 1024 normal/ORM, three structural LODs and an ace paint; the finishing pass embeds WebP and writes UASTC KTX2 with mipmaps. Basis Universal 2.50 was used.

- **Me 410 A-1/U4**: FlightGear Bf 110 DB-engine nacelle detail, props, crew and interior (original GPL attribution in `public/models/CREDITS.md`), with a separately authored fuselage, swept wing, single central fin, tailplanes, framed canopy, BK 5 and side barbettes. It no longer renders a Bf 110 silhouette. Airframe target 16.35 m span / 12.48 m length; the forward BK 5 muzzle extends beyond the airframe datum.
- **Me 163 B**: existing GPL FlightGear shape, registered to 9.30 m span / 5.70 m overall length. Original tailless outline retained; separated elevons and rudder, cockpit/pilot, skid, panel and rivet bakes. Pitch and roll mix on the elevons; there is no conventional tailplane or propeller.
- **Ju 88 G-6**: existing GPL FlightGear Ju 88 surface, with a solid fighter nose, enlarged square fin, FuG 220 antler aerials, exhaust flame dampers, forward cannon and a pair of 75° oblique cannon. Wing/cockpit/nacelle detail remains derived from the Ju 88 source. Target 20.08 m span; overall length including aerials is approximately 15.5 m. This is a game reconstruction, not an engineering scan.

References (links only):

- [RAF Museum Me 410](https://www.rafmuseum.org.uk/research/collections/messerschmitt-me-410a-1-u2/) — preserved airframe and role.
- [Me 410 CC0 profile by charner1963](https://commons.wikimedia.org/wiki/File:Messerschmitt_Me_410.svg) — single-fin, canopy and nose recognition details.
- [Me 410 recognition three-view, IBCC archive](https://ibccdigitalarchive.lincoln.ac.uk/collections/document/28785) — silhouette reference.
- [Science Museum Me 163](https://www.sciencemuseum.org.uk/sites/default/files/2025-11/Flight-Large%20Print%20Book%202%20of%203-DIGITAL.pdf) — 9.3 m / 5.7 m dimensions.
- [Smithsonian Me 163](https://airandspace.si.edu/collection-objects/messerschmitt-me-163b-1a-komet/nasm_A19530072000) — tailless rocket-interceptor layout.
- [Australian War Memorial Ju 88](https://www.awm.gov.au/visit/exhibitions/striking/planes/german/ju88) — night-fighter role and radar.
- Existing Ju 88 public-domain recognition silhouette: `tools/hero/luftwaffe/silhouette/refs.json`.

QA uses the installed Playwright **headless shell**, never desktop Chrome. Set `PLAYWRIGHT_EXECUTABLE` to that existing shell if its build differs from the installed module. Start Vite in this worktree on **5424** (the task did not assign a port; 5324 was already occupied).

```
tools/heavy.sh sh tools/hero/enemies/verify.sh
node tools/hero/enemies/silhouette.mjs
```

The capture extension uses the Phase 10 rig's seed, six-second / 18-bomber fixture, 1080p viewport and JPEG budget helper. It records exact world poses and cameras, loads the deployed LIVE game for the baseline, then copies those poses/cameras into the task build. Since LIVE has no Ju 88 G, its ordinary Ju 88 is the baseline for that slot. Three aircraft views only, plus Low verification. All evidence lives under `docs/phase11/shots/24/`.
