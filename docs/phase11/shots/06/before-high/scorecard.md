# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `743dfe2579895dabcf7ade98fea1c241212f5227` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [night-formation](night-formation.jpg) | — | __/10 | — | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset-rim](sunset-rim.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [night-clouds](night-clouds.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | — | — | __/10 |
| [night-waist](night-waist.jpg) | — | __/10 | — | — | __/10 | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.089 | 0.045 | 13.73 | 0.002674 | 0.037 | 6.05 / 5.90 / 11.00 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.595 | 0.130 | 30.25 | 0.003858 | 0.192 | 16.28 / 16.40 / 22.60 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.124 | 0.074 | 22.13 | 0.002759 | 0.048 | 11.32 / 10.90 / 16.00 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.604 | 0.170 | 35.31 | 0.005217 | 0.096 | 11.77 / 11.40 / 15.20 |
| [night-clouds](night-clouds.jpg) | PNG 1920×1080 | 0.102 | 0.058 | 15.32 | 0.002727 | 0.052 | 10.52 / 10.20 / 14.40 |
| [night-waist](night-waist.jpg) | PNG 1920×1080 | 0.119 | 0.095 | 20.46 | 0.003258 | 0.022 | 12.58 / 12.30 / 16.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 27.0, 56.7, 12.8, 3.0, 0.3, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.7, 3.8, 4.0, 7.0, 14.1, 19.3, 21.7, 18.4, 5.9, 1.3, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 11.0, 51.5, 24.7, 9.3, 1.8, 0.5, 0.3, 0.2, 0.1, 0.1, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.2, 1.1, 0.7, 0.4, 3.2, 9.9, 16.9, 14.3, 10.6, 7.8, 9.6, 11.2, 8.8, 4.7, 0.6 | 0.00 / 0.00 |
| [night-clouds](night-clouds.jpg) | 21.5, 51.8, 22.7, 3.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-waist](night-waist.jpg) | 17.3, 52.8, 18.1, 7.8, 1.6, 0.5, 0.4, 0.3, 0.2, 0.2, 0.2, 0.1, 0.2, 0.1, 0.2, 0.1 | 0.00 / 0.00 |
