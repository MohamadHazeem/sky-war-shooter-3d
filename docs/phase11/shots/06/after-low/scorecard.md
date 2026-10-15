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
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.078 | 0.035 | 7.43 | 0.000324 | 0.005 | 1.86 / 1.60 / 2.90 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.492 | 0.179 | 22.84 | 0.000394 | 0.009 | 3.23 / 3.00 / 4.90 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.095 | 0.046 | 8.28 | 0.000399 | 0.055 | 4.41 / 4.20 / 6.30 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.653 | 0.154 | 27.37 | 0.000859 | 0.042 | 3.91 / 3.70 / 5.30 |
| [night-clouds](night-clouds.jpg) | PNG 1920×1080 | 0.119 | 0.072 | 18.08 | 0.000312 | 0.000 | 3.52 / 3.00 / 6.60 |
| [night-waist](night-waist.jpg) | PNG 1920×1080 | 0.070 | 0.056 | 8.84 | 0.000363 | 0.015 | 3.48 / 3.30 / 4.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 28.8, 64.4, 3.5, 2.8, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 8.7, 18.6, 8.5, 5.3, 4.6, 8.8, 14.5, 14.7, 12.8, 2.9, 0.5, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 16.4, 67.2, 14.6, 0.9, 0.3, 0.2, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.1, 0.4, 0.3, 1.3, 3.4, 3.6, 5.0, 12.2, 15.7, 14.9, 15.9, 11.9, 8.3, 4.5, 2.5 | 0.00 / 0.00 |
| [night-clouds](night-clouds.jpg) | 14.0, 57.3, 9.7, 9.8, 8.3, 0.7, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-waist](night-waist.jpg) | 64.8, 29.8, 1.0, 1.0, 1.1, 1.6, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
