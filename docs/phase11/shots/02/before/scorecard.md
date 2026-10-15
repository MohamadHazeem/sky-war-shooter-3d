# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `2dc10f15baa213a44426893c972297845f99f937` (dirty at capture: true).
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
| [turret-glass](turret-glass.jpg) | __/10 | __/10 | — | — | — | __/10 | — | — | — | __/10 |
| [close-shadow](close-shadow.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [formation-glints](formation-glints.jpg) | __/10 | __/10 | — | — | — | — | — | __/10 | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.621 | 0.212 | 12.92 | 0.006960 | 0.121 | 8.50 / 8.00 / 12.70 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.622 | 0.167 | 49.03 | 0.006773 | 0.109 | 8.11 / 7.50 / 10.40 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.55 | 0.009437 | 0.114 | 6.97 / 5.90 / 11.90 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.126 | 18.37 | 0.006693 | 0.075 | 10.90 / 10.70 / 13.50 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.130 | 30.29 | 0.003775 | 0.194 | 12.47 / 12.10 / 16.80 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.088 | 0.044 | 13.68 | 0.002750 | 0.037 | 4.30 / 4.20 / 5.30 |
| [turret-glass](turret-glass.jpg) | PNG 1920×1080 | 0.619 | 0.170 | 47.72 | 0.005116 | 0.083 | 8.42 / 8.30 / 11.80 |
| [close-shadow](close-shadow.jpg) | PNG 1920×1080 | 0.678 | 0.153 | 33.49 | 0.008373 | 0.136 | 10.50 / 10.10 / 14.40 |
| [formation-glints](formation-glints.jpg) | PNG 1920×1080 | 0.567 | 0.180 | 11.06 | 0.004344 | 0.126 | 6.81 / 6.30 / 9.50 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.7, 3.1, 9.4, 9.3, 5.2, 4.0, 6.3, 8.4, 12.5, 18.9, 12.2, 5.1, 1.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.4, 1.2, 2.8, 14.0, 13.8, 13.5, 11.4, 13.7, 14.4, 8.4, 2.8, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.3, 19.8, 4.8, 2.2, 1.2, 1.3, 1.1, 1.2, 3.4, 12.3, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.4, 28.6, 28.8, 13.7, 6.6, 2.7, 0.9, 0.3, 0.2, 0.2, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.9, 4.0, 7.3, 14.2, 19.2, 21.9, 18.0, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.1, 57.3, 12.4, 2.7, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [turret-glass](turret-glass.jpg) | 0.5, 1.8, 0.9, 0.5, 0.8, 0.5, 3.5, 15.3, 14.0, 13.1, 10.5, 12.6, 13.6, 9.2, 3.2, 0.0 | 0.00 / 0.00 |
| [close-shadow](close-shadow.jpg) | 0.1, 1.1, 1.0, 1.3, 0.8, 0.5, 0.5, 2.5, 10.3, 13.2, 13.4, 15.8, 22.1, 15.5, 1.8, 0.0 | 0.00 / 0.00 |
| [formation-glints](formation-glints.jpg) | 0.0, 0.9, 1.4, 0.3, 2.0, 7.2, 18.8, 11.6, 9.5, 8.2, 8.7, 11.5, 11.0, 5.3, 3.0, 0.5 | 0.00 / 0.00 |
