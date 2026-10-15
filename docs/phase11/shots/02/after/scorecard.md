# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `3701aed406cb78295fb52e288aa9f384f49ae17c` (dirty at capture: true).
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
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.630 | 0.205 | 11.79 | 0.007136 | 0.115 | 8.54 / 8.40 / 10.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.624 | 0.161 | 44.40 | 0.006948 | 0.096 | 10.14 / 9.70 / 13.00 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.523 | 0.304 | 28.55 | 0.009117 | 0.104 | 7.94 / 7.90 / 9.90 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.127 | 18.31 | 0.006708 | 0.073 | 10.18 / 9.60 / 15.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.580 | 0.141 | 28.08 | 0.003657 | 0.186 | 8.73 / 7.60 / 17.30 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.089 | 0.044 | 13.73 | 0.002675 | 0.032 | 4.70 / 4.60 / 6.50 |
| [turret-glass](turret-glass.jpg) | PNG 1920×1080 | 0.623 | 0.164 | 43.51 | 0.005151 | 0.063 | 8.44 / 8.50 / 9.60 |
| [close-shadow](close-shadow.jpg) | PNG 1920×1080 | 0.676 | 0.153 | 34.04 | 0.008579 | 0.140 | 8.38 / 8.30 / 10.60 |
| [formation-glints](formation-glints.jpg) | PNG 1920×1080 | 0.566 | 0.181 | 10.40 | 0.004632 | 0.126 | 6.57 / 6.60 / 9.60 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.4, 1.3, 0.7, 1.4, 7.5, 9.8, 5.8, 4.5, 7.1, 8.9, 12.9, 19.2, 12.0, 5.6, 0.9 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.7, 2.1, 0.6, 0.3, 0.4, 1.2, 0.6, 11.9, 14.4, 15.6, 13.8, 15.2, 14.5, 6.9, 1.7, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.5, 19.5, 4.7, 2.2, 1.1, 1.1, 1.3, 1.5, 1.7, 6.1, 13.2, 14.2, 12.1, 11.9, 4.5, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.1, 29.9, 28.4, 13.0, 6.5, 2.8, 0.9, 0.3, 0.2, 0.3, 0.4, 1.1, 1.0, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 3.4, 3.8, 3.9, 3.5, 7.4, 15.1, 19.6, 20.0, 15.8, 5.8, 1.4, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.4, 58.9, 12.5, 2.7, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [turret-glass](turret-glass.jpg) | 0.7, 2.0, 0.9, 0.4, 0.7, 0.7, 1.1, 12.6, 14.2, 15.1, 13.1, 14.9, 13.7, 8.3, 2.0, 0.0 | 0.00 / 0.00 |
| [close-shadow](close-shadow.jpg) | 0.1, 1.2, 1.0, 1.2, 0.7, 0.5, 0.5, 2.8, 10.7, 13.5, 13.4, 15.8, 21.6, 15.0, 2.0, 0.0 | 0.00 / 0.00 |
| [formation-glints](formation-glints.jpg) | 0.0, 1.3, 1.1, 0.3, 2.1, 7.8, 18.2, 11.5, 9.3, 8.0, 9.2, 11.8, 10.9, 5.4, 2.9, 0.4 | 0.00 / 0.00 |
