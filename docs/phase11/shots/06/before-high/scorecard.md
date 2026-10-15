# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `d483ab6b167a3fa2ba19a49fde099e35c0c237cb` (dirty at capture: true).
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
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.088 | 0.044 | 13.64 | 0.002730 | 0.033 | 5.04 / 5.10 / 6.70 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.130 | 30.29 | 0.003834 | 0.193 | 11.64 / 11.30 / 15.50 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.123 | 0.074 | 22.10 | 0.002755 | 0.049 | 11.95 / 11.90 / 14.30 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.603 | 0.171 | 35.31 | 0.005292 | 0.103 | 10.52 / 9.90 / 15.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 26.8, 58.2, 11.9, 2.6, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.9, 4.0, 7.3, 14.2, 19.3, 21.9, 17.9, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 11.4, 51.5, 24.7, 9.2, 1.7, 0.5, 0.3, 0.2, 0.1, 0.1, 0.1, 0.3, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.2, 1.1, 0.7, 0.4, 3.3, 10.0, 17.0, 14.1, 10.5, 7.8, 9.6, 11.2, 8.6, 4.8, 0.6 | 0.00 / 0.00 |
