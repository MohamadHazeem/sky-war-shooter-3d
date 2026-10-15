# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `9b333aec65c7acde8a7c8b07080dbae2043ed940` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [b17-beauty](b17-beauty.jpg) | __/10 | __/10 | — | — | — | — | __/10 | — | — | __/10 |
| [top-formation](top-formation.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | — | __/10 | — | __/10 |
| [p51-cockpit](p51-cockpit.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [waist-interior](waist-interior.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.629 | 0.202 | 11.59 | 0.007158 | 0.119 | 8.66 / 8.50 / 11.30 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.620 | 0.162 | 47.51 | 0.006834 | 0.131 | 8.52 / 8.50 / 10.00 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.535 | 0.297 | 31.00 | 0.009438 | 0.100 | 8.30 / 8.10 / 11.40 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.247 | 0.127 | 21.89 | 0.006845 | 0.066 | 12.68 / 12.80 / 15.80 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.594 | 0.129 | 29.78 | 0.003710 | 0.194 | 11.25 / 10.70 / 15.00 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.089 | 0.044 | 13.68 | 0.002624 | 0.029 | 4.39 / 4.30 / 6.70 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.1, 2.1, 0.8, 1.6, 7.9, 9.8, 6.3, 4.5, 7.0, 8.8, 13.1, 18.8, 11.9, 5.1, 1.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.4, 1.7, 0.7, 0.3, 0.4, 0.4, 4.4, 13.8, 13.9, 13.8, 11.9, 13.8, 14.3, 7.7, 2.4, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 2.9, 18.5, 5.0, 2.3, 1.5, 1.2, 0.9, 1.4, 2.8, 8.6, 13.2, 12.2, 11.6, 12.4, 5.3, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 9.6, 21.0, 34.5, 15.6, 9.0, 4.5, 2.3, 0.5, 0.3, 0.2, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.5, 2.6, 3.9, 4.0, 7.2, 14.1, 19.2, 22.1, 18.2, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.0, 56.9, 12.8, 2.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
