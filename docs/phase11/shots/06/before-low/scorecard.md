# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
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
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.071 | 0.023 | 5.48 | 0.000322 | 0.000 | 2.20 / 1.70 / 4.00 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.505 | 0.205 | 23.47 | 0.000365 | 0.013 | 3.26 / 3.10 / 4.70 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.078 | 0.041 | 7.40 | 0.000351 | 0.006 | 3.63 / 3.40 / 4.80 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.649 | 0.155 | 21.94 | 0.000714 | 0.021 | 3.93 / 3.70 / 5.30 |
| [night-clouds](night-clouds.jpg) | PNG 1920×1080 | 0.089 | 0.046 | 7.76 | 0.000314 | 0.000 | 4.94 / 4.50 / 7.40 |
| [night-waist](night-waist.jpg) | PNG 1920×1080 | 0.063 | 0.040 | 7.41 | 0.000333 | 0.002 | 5.45 / 5.20 / 7.80 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 36.8, 59.3, 3.9, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 2.9, 13.8, 11.0, 7.4, 5.4, 4.9, 5.4, 8.4, 16.0, 14.4, 9.3, 1.1, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 31.8, 64.6, 2.1, 0.6, 0.4, 0.3, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.3, 0.8, 0.6, 1.1, 3.3, 3.8, 4.0, 10.7, 16.5, 15.4, 16.6, 13.3, 8.2, 4.0, 1.4 | 0.00 / 0.00 |
| [night-clouds](night-clouds.jpg) | 31.4, 49.4, 13.6, 5.7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-waist](night-waist.jpg) | 69.2, 26.1, 1.5, 1.8, 1.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
