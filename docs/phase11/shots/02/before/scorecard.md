# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `9b333aec65c7acde8a7c8b07080dbae2043ed940` (dirty at capture: false).
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
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.630 | 0.205 | 12.87 | 0.007009 | 0.111 | 8.01 / 7.80 / 10.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.622 | 0.167 | 49.03 | 0.006773 | 0.109 | 8.85 / 8.60 / 11.20 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.63 | 0.008960 | 0.104 | 6.46 / 5.80 / 9.10 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.126 | 18.37 | 0.006693 | 0.075 | 10.85 / 10.50 / 13.50 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.130 | 30.29 | 0.003775 | 0.194 | 11.28 / 11.00 / 14.10 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.087 | 0.043 | 13.62 | 0.002662 | 0.034 | 4.09 / 3.70 / 6.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.7, 1.4, 7.5, 9.7, 6.5, 4.6, 6.8, 8.7, 12.6, 19.2, 12.3, 5.1, 1.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.4, 1.2, 2.8, 14.0, 13.8, 13.5, 11.4, 13.7, 14.4, 8.4, 2.8, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.8, 4.8, 2.2, 1.3, 1.4, 1.0, 1.2, 3.4, 12.2, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.4, 28.6, 28.8, 13.7, 6.6, 2.7, 0.9, 0.3, 0.2, 0.2, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.9, 4.0, 7.3, 14.2, 19.2, 21.9, 18.0, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.6, 57.7, 11.7, 2.6, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
