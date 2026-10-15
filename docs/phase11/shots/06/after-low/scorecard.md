# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `d483ab6b167a3fa2ba19a49fde099e35c0c237cb` (dirty at capture: false).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [night-formation](night-formation.jpg) | — | __/10 | — | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset-rim](sunset-rim.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.081 | 0.039 | 6.15 | 0.000321 | 0.000 | 2.82 / 2.10 / 4.70 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.417 | 0.160 | 25.48 | 0.000316 | 0.022 | 4.94 / 4.70 / 7.30 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.077 | 0.034 | 7.11 | 0.000338 | 0.018 | 4.60 / 4.20 / 6.90 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.617 | 0.158 | 28.02 | 0.000875 | 0.045 | 4.53 / 4.20 / 7.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 29.0, 61.8, 5.2, 3.2, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 8.0, 15.1, 11.7, 6.8, 6.3, 11.6, 15.4, 19.3, 4.8, 0.9, 0.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 29.3, 68.1, 1.7, 0.3, 0.2, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.3, 0.5, 0.3, 2.6, 4.2, 4.5, 8.3, 15.8, 14.7, 14.5, 14.1, 9.6, 5.9, 3.5, 1.3 | 0.00 / 0.00 |
