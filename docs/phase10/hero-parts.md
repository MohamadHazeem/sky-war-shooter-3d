# Hero aircraft: named-parts contract

The hero models built by `tools/hero/luftwaffe` (Bf 109 G-6, Fw 190 A-8, Me 262 A-1a, Bf 110 G-2, Ju 88 A-4)
share one node layout. Since goal 05b their surfaces are the FlightGear shapes, cut into these parts by planes at
the joints and hinge lines (`airframe.py`). Game code finds parts by name, so these names are the contract with
`world/HeroLook.ts`, `Wrecks.ts`, `FighterDeath.ts`, `DamageStages.ts` and Phase 10 goal 09 (physical
destruction). The model frame is the game's: metres, +X left wing, +Y up, +Z nose. Every type keeps the
anchor points of the FlightGear model it is built from (prop hubs, pilot eye, gun muzzles, fans), so the gun
offsets and other code written for the old models still line up. Exception: the Me 262 is scaled to its
published span / length (x 1.19, z 0.849) and its anchors moved with it.

## Structure

```
airframe                         group: everything structural (Paint / DamageStages / EnemyDress look it up)
  part_fuselage                  forward fuselage: engine cowling (single-engine), cockpit sides, wing root fairing
    part_fuselage_lod0           its own meshes (LOD0)
    part_fuselage_lod1           LOD1 = the WHOLE airframe merged into one mesh (40 % of LOD0)
    part_fuselage_lod2           LOD2 = the WHOLE airframe merged into one ~2.6-4.2k triangle mesh
  part_fuselage_aft              rear fuselage (from behind the cockpit to the tail cone)
  part_tail                      fin + tailplane (fixed surfaces)
    ctl_elevator_L / _R          hinged, rotate about local X (+ = trailing edge up)
    ctl_rudder                   hinged, local X along the hinge (+ = trailing edge to the right)
    ctl_rudder_L / _R            Bf 110 twin fins instead of ctl_rudder
  part_wingL / part_wingR        inner wing panels (root to the part joint)
    ctl_flap_L / _R              (no deflection in flight)
  part_wingLtip / part_wingRtip  outer wing panels (joint to the tip)
    ctl_aileron_L / _R           hinged, local X along the hinge (+ = trailing edge up)
    ctl_flap_L_outer / _R_outer  twins: the flap section outboard of the joint
  part_engine1 / part_engine2    twins: nacelles (left = 1 = prop_1, right = 2 = prop_2); Me 262 Jumo 004s
prop_N                           propeller pivot (spins about local +Z), as before
  spinner_N                      spinner: stays visible while the blur disc shows
  blades_N                       blades: hidden while the disc shows
cooling_fan                      Fw 190 BMW 801 cooling fan
fan_1 / fan_2                    Me 262 intake starter bullets (spin about local Z)
glass                            canopy / glazing (one transparent mesh; FighterDeath hides it)
pilot                            pilot figure (FighterDeath slumps / hides it)
crew                             other crew figures (Bf 110 gunner facing aft, Ju 88 crew)
interior                         cockpit tub, instrument panel, seat, head armour, gunsight, static guns
gun_rear / muzzle_rear           Bf 110 MG 81Z on its mount (RearGunners swings it)
gear_left / gear_right / gear_tail / gear_nose   undercarriage, posed down; hidden by HeroLook (retracted)
eye_pilot, eye_gunner, muzzle_*, exhaust_left/right   empty markers as before
```

Every `part_*` and `ctl_*` node has a `<name>_lod0` child (`part_fuselage` also `_lod1` / `_lod2`);
`HeroLook.prepareHero` turns them into one `HeroLOD` per node. Parts other than `part_fuselage` have an empty
LOD2 level: far away the whole airframe is the single merged mesh under `part_fuselage`.

All opaque meshes share one material, `hero_<kind>` (one 2048 atlas: base colour; ORM = occlusion /
roughness / metalness; tangent-space normal), plus the same maps as `<kind>_{base,normal,orm}.ktx2` that
`HeroLook.enableHeroKtx2` swaps in. The glass is `hero_<kind>_glass`. Parts and control surfaces are cut from the
FlightGear skin without caps: a separated part is open at its cut, like a torn panel.

## Using the parts

- Break-up: hide or detach whole `part_*` nodes, and pin every `HeroLOD` of the pieces to LOD0 (the merged
  levels would still draw the lost parts). `Wrecks.cut` already does this for hero models: each part (and
  each root node such as a prop or the pilot) goes whole with the piece that contains its centre
  (`HeroLook.partCentre`, `insidePlanes`). No clipping planes, so no new shader programs.
- Hit zones (`EnemyDress` ZONES) sit over the same parts: `engine`/`engine2` over `part_engine1/2` or the cowling,
  `wingL`/`wingLtip` over `part_wingL`/`part_wingLtip`, `tail` over `part_tail`, `cockpit`/`fuselage` over
  `part_fuselage`/`part_fuselage_aft`.
- Part centres (model frame, from LOD0) are cached per type: `partCentre(model, part)`.
- Control surfaces: `HeroLook.animateControls` drives them from `FlightModel` roll/pitch/yaw. A detached
  wing keeps its aileron (it is a child of the outer panel).
