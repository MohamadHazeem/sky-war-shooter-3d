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
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.629 | 0.205 | 13.08 | 0.006869 | 0.112 | 9.45 / 9.20 / 13.00 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.620 | 0.167 | 49.35 | 0.006961 | 0.107 | 10.92 / 9.80 / 25.00 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.511 | 0.298 | 32.60 | 0.009064 | 0.106 | 7.68 / 7.10 / 11.40 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.127 | 18.19 | 0.006731 | 0.077 | 13.57 / 13.50 / 17.20 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.592 | 0.130 | 30.28 | 0.003774 | 0.196 | 10.73 / 10.50 / 12.90 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.089 | 0.044 | 13.73 | 0.002675 | 0.032 | 4.72 / 4.60 / 6.60 |
| [turret-glass](turret-glass.jpg) | PNG 1920×1080 | 0.620 | 0.171 | 48.16 | 0.004993 | 0.077 | 8.80 / 8.40 / 11.90 |
| [close-shadow](close-shadow.jpg) | PNG 1920×1080 | 0.677 | 0.153 | 34.06 | 0.008560 | 0.139 | 8.98 / 8.80 / 10.60 |
| [formation-glints](formation-glints.jpg) | PNG 1920×1080 | 0.567 | 0.181 | 11.15 | 0.004254 | 0.123 | 8.46 / 8.20 / 11.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.1, 1.6, 0.8, 1.6, 7.8, 9.7, 5.7, 4.5, 7.2, 8.8, 12.8, 19.0, 11.9, 5.6, 0.9 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 0.3, 1.2, 3.2, 14.2, 13.8, 13.6, 11.3, 13.6, 14.3, 8.2, 2.7, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.8, 4.7, 2.3, 1.3, 1.3, 1.1, 1.2, 3.3, 12.2, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.3, 28.8, 28.5, 13.7, 6.7, 2.7, 0.8, 0.3, 0.2, 0.2, 0.4, 1.2, 1.0, 0.1, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.8, 4.0, 7.3, 14.3, 19.5, 22.0, 17.5, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.4, 58.9, 12.5, 2.7, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [turret-glass](turret-glass.jpg) | 0.5, 1.8, 0.9, 0.4, 0.7, 0.6, 3.2, 15.3, 14.0, 13.2, 10.6, 12.6, 13.4, 9.5, 3.2, 0.0 | 0.00 / 0.00 |
| [close-shadow](close-shadow.jpg) | 0.1, 1.1, 1.0, 1.3, 0.7, 0.5, 0.5, 2.7, 10.7, 13.4, 13.4, 15.7, 21.6, 15.2, 2.1, 0.0 | 0.00 / 0.00 |
| [formation-glints](formation-glints.jpg) | 0.0, 0.9, 1.4, 0.3, 2.1, 7.5, 18.2, 11.8, 9.4, 8.1, 8.9, 11.7, 11.1, 5.3, 3.0, 0.5 | 0.00 / 0.00 |
