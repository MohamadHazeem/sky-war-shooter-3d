# 3D model credits and licences

The legacy aircraft models in this folder are converted from FlightGear flight-simulator
aircraft (AC3D models and textures) with `tools/convert_models/convert_ac.py`.
They are derivative works and remain under the original licence (GNU GPL v2).
If you redistribute them, you must also make the corresponding source available: the
upstream repositories and commits below, plus the converter in `tools/convert_models/`.
Conversion changes: format conversion to glTF, re-orientation and re-centring,
gear retracted, props/turrets split into pivot nodes, parts merged, some parts decimated
or dropped, crew figures posed, textures
resized and re-encoded (JPEG/PNG), and the cockpit textures packed into atlases.

## hero/b17.glb — Phase 10 B-17G rework (FlightGear derivative)

* Base geometry, canopy/nose/nacelle/turret shapes, crew, UVs and GD-L livery are derived from the **same pinned FlightGear B-17 source and authors listed below**, under GNU GPL v2. This supersedes goal 02's original-only parametric exterior and its source claim.
* Original geometry/FDM: Emmanuel Baranger; model changes: Detlef Faber; turrets: Fabien Barbier; GD-L livery: Brett Harrison (2009/2011); crew: Bertrand Augras through the FlightGear package.
* Complete derivative recipe: `tools/hero/flightgear.json`, `build.py`, `compress.mjs`, and `tools/convert_models/convert_ac.py`; [source, rebuild and validation](../../tools/hero/README.md). Upstream source: https://github.com/FGMEMBERS/B-17/tree/949abb7615da96104a72c2b1a351a05d60a0bf3c.
* Changes: dimension normalization; structural part ownership; staggered waist; Cheyenne-style enclosure; cowl flaps, de-icer surfaces, exhaust/turbo/pitot/antenna fittings; actual-skin relief normal/AO bakes and curvature; reprocessed olive/grey and natural-metal PBR atlases; three LODs; meshopt; KTX2 and WebP fallback.
* Reference: USAAF AN 01-20EG-2 (15 February 1945), Figure 1, printed page 2, [public scan](https://app.aircorpslibrary.com/document/getsamplepage/tsteven3/6). The underlying US military drawing is public-domain; no scan image pixels or archive watermark are included. Committed outlines are manually digitized measurements for QA.
* Added project work is GPL-2.0-or-later; the derivative retains the base's GPL obligations. The locally served Basis decoder is Apache-2.0; its licence accompanies the files at `hero/BASIS-LICENSE.txt`.
* Runtime sizes/formats are in `hero/manifest.json`; the legacy GLB remains available for comparison.

## b17.glb — Boeing B-17G Flying Fortress
* Source: https://github.com/FGMEMBERS/B-17 (commit `949abb7615da96104a72c2b1a351a05d60a0bf3c`)
* Licence: GNU General Public License v2 (`COPYING` in the repository).
* 3D model and FDM: Emmanuel Baranger (2009), http://helijah.free.fr/flightgear/hangar.htm
* 3D model changes: Detlef Faber. Turret system: Fabien Barbier.
* Livery used: "GD-L" by Brett Harrison (2009/2011). Other liveries in the source: default (Emmanuel Baranger), 398bg, 447bg, 48457, 483575 (Brett Harrison), Memphis Belle (Alex Lerr).
* Crew figure (`ww2_pilot_old`): from Bertrand Augras' X-Plane pilot collection, as included in the FlightGear package.

## fw190.glb — Focke-Wulf Fw 190 A-8
* Source: https://github.com/FGMEMBERS/fw190 (commit `49575361d5700466329e73d083867da5983451cd`)
* Licence: GNU General Public License v2 (stated in the repository `README`).
* Author: Detlef Faber (FlightGear hangar).
* Livery used: "Green" (`fw190-1.png`). It has no swastika, so the texture is not edited.
* Pilot figure: `pilot-b.ac` from the same package, posed with its FlightGear animations.
* The upstream README says instrument photo textures were used with permission from
  http://www.cockpitinstrumente.de. Only the low-detail panel texture (`panels.png`) of the
  exterior model is in this glb.

## p51d.glb and p51d_cockpit.glb — North American P-51D-25-NA Mustang
* Source: https://github.com/FGMEMBERS/p51d (commit `cb3bcd6ef41182f6b1bae91395f38d0dadd974e5`)
* Licence: the repository has no licence file. It is the P-51D from the official FlightGear
  aircraft collection (FGAddon), which accepts only GPL-compatible content (GPL v2 or later).
  Treat it as GPL v2+.
* Authors: Jim Wilson (original model, 2003), Hal V. Engel (3D model, cockpit and JSBSim FDM, 2010–2014),
  Jon S. Berndt (JSBSim), later fixes by githlar and Daniel Dubreuil (see `p51d-contributors.txt`).
* Livery used: "Delivery Day – March 1944" (`Liveries/DD*.png`).
* Pilot figure (`pilotWWII`): same origin as the B-17 crew figure (Bertrand Augras' collection, via FlightGear).
* Not included: the K-14 gun sight and the other `Aircraft/Instruments-3d` parts, which are in the
  FlightGear base package and not in this repository.

## bf110.glb — Messerschmitt Bf 110
* Source: https://github.com/FGMEMBERS/Messerschmitt-BF110 (commit `2459e2c7555263f05eebb460bed4e5de340db4dc`)
* Licence: GNU General Public License v2 (`COPYING` in the repository).
* 3D model and FDM: Emmanuel Baranger (2011–2015), http://helijah.free.fr/flightgear/hangar.htm
* Livery used: "Test" (`Models/Liveries/1024x1024/test.png`, RLM 71/65 camouflage) by Emmanuel Baranger. No swastika.
* Crew figures (`ww2_pilot_old`): from Bertrand Augras' X-Plane pilot collection, as included in the FlightGear package.
* Not included: the night-fighter radar antennas, the cockpit instruments and the detailed cockpit parts.

## me262.glb — Messerschmitt Me 262
* Source: https://github.com/FGMEMBERS/ME-262 (commit `b9f6fe1337ba036ca18c633ca18a9066d378a0aa`)
* Licence: GNU General Public License v2 (`COPYING` in the repository).
* 3D model: Emmanuel Baranger (2007–2011). FDM: Michael Koehne.
* Livery used: default (`Models/texture.png`) by Laurent Hayvel (2008). No swastika.
* Pilot figure (`ww2_pilot_old`): Bertrand Augras' collection, as above.

## bf109.glb — Messerschmitt Bf 109 G-14
* Source: https://github.com/FGMEMBERS/bf109 (commit `11bc9d86a24bf8295651414ab545976617761aa3`)
* Licence: GNU General Public License v2 (stated in the repository `README`).
* Authors: Detlef Faber (model), Marco Schüle (cockpit improvements).
* Livery used: "Dayfighter green" (`Models/bf109g.png`). It has no swastika, so the texture is not edited.
* Pilot figure: `germanpilotsuit-m.ac` and `germanheadgear-m.ac` from the same package, posed seated by the converter
  (the FlightGear model uses the generic pilot from the base package instead).
* The upstream README says instrument photo textures were used with permission from
  http://www.cockpitinstrumente.de. Only the low-detail cockpit shell (`cockpit.ac`, `cockpit.png`, `interiour.png`)
  is in this glb, not the instruments.

## ju88.glb — Junkers Ju 88 A-4
* Source: https://github.com/FGMEMBERS/Ju-88 (commit `2104ecaf355192323faf232c5c3bcd9657dcaa60`)
* Licence: the repository has no licence file. It is the Ju-88 from the official FlightGear aircraft collection
  (FGAddon, `trunk/Aircraft/Ju-88`), which accepts only GPL-compatible content (GPL v2 or later). Treat it as GPL v2+.
* Author: Detlef Faber (`ju-88a4-set.xml`).
* Livery used: `Models/ju88-1.png` (splinter camouflage, no markings).

## me163.glb — Messerschmitt Me 163 B Komet
* Source: https://github.com/FGMEMBERS/me163 (commit `5dea5449e6090940af08bab279b3e76ee9065216`)
* Licence: the repository has no licence file. It is the me163 from the official FlightGear aircraft collection
  (FGAddon, `trunk/Aircraft/me163`), which accepts only GPL-compatible content (GPL v2 or later). Treat it as GPL v2+.
* Author: Detlef Faber (`me163-set.xml`).
* Livery used: `Models/me163-1.png`. No swastika.

## he111.glb — Heinkel He 111
* Source: https://github.com/FGMEMBERS/Heinkel-He-111 (commit `0625f5535e022166045c9470668f5243dbcab2dd`)
* Licence: GNU General Public License v2 (`COPYING` in the repository).
* 3D model and FDM: Emmanuel Baranger (2012), http://helijah.free.fr/flightgear/hangar.htm
* Livery used: default (`Models/texture.png`, RLM 70/71 splinter camouflage over RLM 65) by Emmanuel Baranger.
  It carries only Balkenkreuz crosses (no swastika, no unit codes), so the texture is not edited.
  Other liveries in the source: camo, desert, black, 1GHK, 1TKX.
* Crew figure (`ww2_pilot_old`): Bertrand Augras' X-Plane pilot collection, as included in the FlightGear package.
* The dorsal MG 15 (`gun_rear`) and the nose and ventral guns are the package's `Models/Interior/Guns/guns.ac`.
* Not included: the instrument panel, the interior-only glass, lights and shadow.

## do335.glb — Dornier Do 335 Pfeil
* Source: https://github.com/FGMEMBERS/DO-335 (commit `135d343e0aa0ae2c4b6fe1d986d811ef208104b5`)
* Licence: GNU General Public License v2 (`COPYING` in the repository).
* 3D model and FDM: Emmanuel Baranger (2008).
* Livery used: `Models/Liveries/1024x1024/Do335.png` ("ZH", RLM 81/82 over RLM 76) by Alex Kerr (2010).
  The fin carries a plain "X" where a swastika would be; there is no swastika, so the texture is not edited.
  Other liveries in the source: default (`texture.png`) and `gris.png` (Emmanuel Baranger).
* Pilot figure (`ww2_pilot_old`): Bertrand Augras' collection, as above.
* Not included: the instrument panels, the interior-only glass, lights and shadow.

## Me 410 (no model of its own)
There is no GPL-compatible Me 410 model in the FlightGear repositories (FGMEMBERS, FGAddon), so the game's Me 410
flies `bf110.glb` (above) as a stand-in, repainted lighter at runtime and fitted with a procedural BK 5 cannon tray and
barrel and two FDL 131 barbette blisters (`src/world/EnemyDress.ts`). No He 219 or Ta 152 model exists there either.
