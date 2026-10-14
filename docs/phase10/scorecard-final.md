# Phase 10 final scorecard — goal 13

**53 → 60 / 100.** These are subjective scores against the [reference board](reference.md), not a claim of film quality or the owner's 100/100 target being reached. “Before” means this branch's integrated state on entry to goal 13, captured with fixture v2. The [original Phase 10 baseline](shots/baseline/contact-sheet.jpg) is also shown, separately, in the [full 16-shot comparison board](shots/13/board.html).

| Pillar | Before / 10 | Final / 10 | Evidence and remaining gap |
|---|---:|---:|---|
| Aircraft models & materials | 6 | 6 | B-17 beauty retains metal/glass separation and recognizable detail; older fighter assets remain. Stream uses one hero LOD instead of three overlapping skins. |
| Lighting & shadows | 6 | 6 | Directional sun, compartment shafts and sunset remain coherent; interior fill and some hard shadow edges still fall short of the film reference. |
| Clouds & sky | 6 | 6 | Top-turret ice streaks are filtered; cloud lobes and fly-through extinction work, but cloud shape repetition remains visible. |
| Ground from altitude | 6 | 6 | Ball and bomb-run shots retain rivers, towns and irregular fields with altitude haze. No new terrain work. |
| Effects | 4 | **6** | Denser eroded flak, spreading cloud-occluded ice sheets, sunset scattering, distant tracer exchanges and joint-local breakup bursts. Flipbooks and repeated smoke lobes remain apparent. |
| B-17 interior & crew | 3 | **5** | Waist/tail targets are visible again; sculpted garment folds, seams, leather/cloth response and improved crew fill. Faces, animation and simplified equipment still read as game art. |
| Camera & post | 6 | 6 | Matched framing, restrained grade and readable sights. Stills do not establish temporal stability or motion-blur quality. |
| Scale & spectacle | 6 | 7 | Multiple formation layers, broad wake sheets and recognizable distant wings; minimum-pixel silhouettes intentionally exaggerate the farthest aircraft. |
| Destruction | 5 | 7 | B-17/P-51 structural pieces and hulks now share rigid-body breakup, fragments, fire and origin rebasing. Supplemental motion checks cover both tiers; animation is not an engineering simulation. |
| Performance & polish | 5 | 5 | Low remains functional and damage introduces no shader programs in the checked paths. Full gameplay frame budgets have not been established; measured frozen render times are reported separately. |
| **Total** | **53** | **60** | **The two weakest entry pillars improve by two points each.** |

## Evidence

- [Interactive comparison board: all 16 shots, original baseline plus matched High/Cinematic pairs](shots/13/board.html).
- High pairs: [1](shots/13/comparison-high-1.jpg), [2](shots/13/comparison-high-2.jpg), [3](shots/13/comparison-high-3.jpg), [4](shots/13/comparison-high-4.jpg).
- Cinematic pairs: [1](shots/13/comparison-cinematic-1.jpg), [2](shots/13/comparison-cinematic-2.jpg), [3](shots/13/comparison-cinematic-3.jpg), [4](shots/13/comparison-cinematic-4.jpg).
- Crew geometry close-up: [before](shots/13/runtime/crew-before.jpg), [after](shots/13/runtime/crew-after.jpg). Both use the final renderer/material code and identical camera; only the served crew GLB changes. These supplement the fixed wide interior pair, not a claim of isolated material comparison.
- Physical breakup: [B-17 wing](shots/13/runtime/high-b17-wing-off.jpg), [P-51 wing](shots/13/runtime/high-p51d-wing-off.jpg), [B-17 fragments](shots/13/runtime/high-b17-exploded.jpg), [P-51 fragments](shots/13/runtime/high-p51d-exploded.jpg).

Final runs use `--camera-from` to restore the recorded baseline camera after simulation (including P-51 cockpit vibration), then settle the image again. The board generator rejects incomplete or mismatched fixture-v2 pairs (camera, seed, weather, native size, steps and quality). Original v1 baseline shots used an earlier renderer and did not explicitly load all optional art or bind the stream; that column demonstrates cumulative change, not a controlled goal-13 comparison. No reference imagery is copied into the repository.

See the [implementation and validation report](reports/13.md) for timings, test results, hooks and limitations.
