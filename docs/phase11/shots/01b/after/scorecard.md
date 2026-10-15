# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `c783961c55df46ed1dba49c95fc3ef07e4757772` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [waist-fw190-close](waist-fw190-close.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [tail-bf109-close](tail-bf109-close.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.646 | 0.239 | 32.28 | 0.009657 | 0.118 | 10.81 / 10.20 / 15.40 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.295 | 0.331 | 12.92 | 0.012128 | 0.135 | 12.51 / 12.30 / 14.20 |
| [waist-fw190-close](waist-fw190-close.jpg) | PNG 1920×1080 | 0.602 | 0.263 | 27.01 | 0.010832 | 0.095 | 9.93 / 9.00 / 15.80 |
| [tail-bf109-close](tail-bf109-close.jpg) | PNG 1920×1080 | 0.266 | 0.295 | 13.48 | 0.012162 | 0.119 | 12.00 / 11.70 / 15.40 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | PNG 1920×1080 | 0.604 | 0.176 | 39.25 | 0.009255 | 0.121 | 10.01 / 9.70 / 13.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | PNG 1920×1080 | 0.638 | 0.148 | 32.96 | 0.005651 | 0.102 | 7.67 / 7.60 / 9.20 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | PNG 1920×1080 | 0.642 | 0.243 | 31.88 | 0.008862 | 0.111 | 10.40 / 10.10 / 12.80 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | PNG 1920×1080 | 0.642 | 0.243 | 31.95 | 0.008719 | 0.105 | 10.03 / 9.90 / 13.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.8, 6.2, 2.5, 3.2, 1.6, 1.3, 1.3, 0.5, 1.0, 5.2, 13.2, 22.1, 20.1, 11.7, 8.1, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.6, 8.3, 4.7, 2.9, 3.7, 1.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.6, 3.5 | 0.00 / 0.00 |
| [waist-fw190-close](waist-fw190-close.jpg) | 1.8, 10.1, 2.2, 1.9, 2.6, 3.7, 5.8, 1.8, 0.8, 3.2, 9.7, 17.4, 20.9, 11.9, 5.7, 0.6 | 0.00 / 0.00 |
| [tail-bf109-close](tail-bf109-close.jpg) | 5.5, 55.7, 5.4, 4.0, 2.5, 2.6, 4.4, 0.4, 0.2, 0.1, 0.3, 1.2, 4.5, 6.8, 5.9, 0.5 | 0.00 / 0.00 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | 0.4, 2.3, 1.3, 1.5, 2.6, 0.6, 1.8, 11.7, 15.9, 13.3, 14.0, 12.0, 13.2, 7.5, 1.9, 0.0 | 0.00 / 0.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | 0.0, 1.3, 1.6, 1.2, 0.8, 0.6, 0.4, 3.4, 14.6, 18.3, 17.9, 16.6, 15.4, 7.6, 0.3, 0.0 | 0.00 / 0.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | 1.8, 6.1, 2.7, 3.6, 2.2, 1.7, 1.4, 0.5, 0.8, 4.4, 12.7, 21.3, 21.2, 11.6, 7.9, 0.2 | 0.00 / 0.00 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | 1.8, 6.1, 2.7, 3.6, 2.1, 1.5, 1.3, 0.5, 0.9, 4.6, 12.8, 21.5, 20.9, 11.1, 8.3, 0.2 | 0.00 / 0.00 |
