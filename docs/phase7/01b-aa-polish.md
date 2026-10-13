# Phase 7 · Goal 1b — Hold the Field: visual and HUD polish

Report to: `docs/phase7/reports/01b.md` · Dev server port: 5271 · Screenshots: `docs/phase7/shots/01b/`

## Review findings (reviewer looked at your 01 screenshots)
Gameplay and systems are good; presentation is well below the rest of the game:
1. **Gun model** (`day.jpg`): the quad .50 is a few dark boxes and two slabs. Rebuild it as a recognisable
   M45 Maxson quad mount: four M2 barrels with perforated cooling jackets and flash hiders, the armoured
   gunner shield with a sight window, ammo chests on each side with visible belts feeding, the reflector
   (Mk 9) sight on its post, hand grips, the gunner seat edge. Bofors: proper 40 mm with the long barrel and
   flash cone, the loader's clip guides, the ring-and-bead / cartwheel sight, the shield sides. Parkerised
   metal + olive drab paint, wear on edges; reuse the parkerised-gun / riveted-metal procedural textures
   used elsewhere (Viewmodels / InteriorFx / TurretInteriors). Barrels recoil and smoke when hot; heat glow.
2. **Sandbags**: they are huge beige blocks. Make real sandbag rings: many small rounded bags (instanced),
   stacked in courses, slightly irregular, hessian texture/colour variation, at a believable height (~1.2 m)
   so the field is visible over them.
3. **Strange radial streaks** across the sky in `day.jpg` and `destroyed-hangar.jpg` (thin lines fanning out
   from the centre). Find the cause (speed lines / GameFeel / a precipitation or tracer artefact / glass
   overlay?) and remove it for this mode.
4. **Airfield from the ground**: Airbase.ts was built to be seen from altitude, so at eye level the
   buildings are plain boxes (the big flat brick-red wall on the left). Add ground-level detail near the
   pits: T2 hangars with curved/ribbed walls and doors, Nissen huts with corrugated half-cylinders, the
   watch office with windows and balcony rail, B-17s parked on hardstands with ground equipment (fuel
   bowser, bomb trolleys), windsock, perimeter-track edges, grass texture variation, a few trees/hedges,
   crew figures running for cover during raids if cheap. LOD so it stays fast.
5. **HUD**: the asset list in the top-left is a long run-on line in a serif font; replace with a compact
   icon/bar list (tower, 2 hangars, 4 B-17s, fuel, pits) in the game's HUD style (same fonts as the rest of
   the game's HUD). The radio subtitle box overlaps the gun panel — move the gun panel lower/smaller or move
   subtitles up. Make the gun panel slimmer (ammo/heat as bars). Make it look like the other modes' HUDs.
6. **Feel**: screen shake and dust when bombs land near the pit; spent casings spill visibly; Bofors
   clips (4 rounds) reload rhythm; flak bursts for Bofors at the target (black puffs, like the existing flak).
Keep Low preset fast, no runtime shader recompiles (prewarm), no per-frame allocations.

## Done when
`npm run check` passes; new screenshots (same views as 01 plus close-ups of each gun, sandbag pit, the
airfield at ground level, HUD in Arabic) in `docs/phase7/shots/01b/`; report with before/after links and a
`sws.bench` number. Commit on the current branch.
