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
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.629 | 0.202 | 11.60 | 0.007193 | 0.120 | 7.51 / 7.70 / 8.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.616 | 0.207 | 42.78 | 0.007772 | 0.096 | 7.95 / 8.00 / 9.40 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.550 | 0.302 | 26.74 | 0.009464 | 0.105 | 7.09 / 7.20 / 9.30 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.247 | 0.127 | 21.83 | 0.006861 | 0.066 | 10.64 / 10.60 / 12.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.581 | 0.141 | 28.11 | 0.003728 | 0.181 | 8.61 / 8.30 / 10.80 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.088 | 0.044 | 13.68 | 0.002750 | 0.037 | 4.81 / 4.50 / 8.20 |
| [turret-glass](turret-glass.jpg) | PNG 1920×1080 | 0.612 | 0.210 | 42.31 | 0.006337 | 0.078 | 7.58 / 7.70 / 9.20 |
| [close-shadow](close-shadow.jpg) | PNG 1920×1080 | 0.681 | 0.146 | 33.59 | 0.008393 | 0.138 | 7.93 / 7.70 / 11.20 |
| [formation-glints](formation-glints.jpg) | PNG 1920×1080 | 0.568 | 0.180 | 10.50 | 0.004941 | 0.128 | 6.60 / 6.50 / 10.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.1, 2.1, 0.8, 1.6, 7.9, 9.8, 6.3, 4.5, 7.0, 8.8, 13.1, 18.8, 11.9, 5.1, 1.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 2.1, 3.7, 3.2, 1.4, 0.9, 0.2, 0.3, 3.9, 12.8, 15.6, 13.7, 13.7, 15.3, 9.8, 3.1, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 3.0, 18.5, 4.8, 2.1, 1.4, 1.3, 0.7, 0.7, 1.8, 4.4, 12.6, 15.1, 14.1, 13.7, 5.6, 0.4 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 9.6, 21.0, 34.6, 15.5, 8.8, 4.6, 2.3, 0.5, 0.3, 0.3, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 3.4, 3.7, 3.9, 3.6, 7.5, 15.0, 19.2, 20.1, 16.3, 5.8, 1.4, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.1, 57.3, 12.4, 2.7, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [turret-glass](turret-glass.jpg) | 2.2, 4.1, 2.9, 1.2, 0.7, 0.6, 0.6, 3.3, 14.1, 17.2, 13.4, 10.9, 14.1, 10.6, 3.8, 0.1 | 0.00 / 0.00 |
| [close-shadow](close-shadow.jpg) | 0.0, 0.9, 0.7, 0.8, 0.7, 1.1, 0.8, 2.7, 10.4, 13.4, 13.4, 15.8, 22.1, 15.4, 1.8, 0.0 | 0.00 / 0.00 |
| [formation-glints](formation-glints.jpg) | 0.0, 0.4, 1.6, 0.5, 2.1, 7.6, 18.8, 11.2, 9.4, 7.9, 8.9, 11.6, 10.9, 5.5, 3.1, 0.5 | 0.00 / 0.00 |
