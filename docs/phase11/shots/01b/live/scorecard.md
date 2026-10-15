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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.645 | 0.239 | 32.49 | 0.009380 | 0.115 | 13.09 / 11.20 / 23.60 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.295 | 0.331 | 12.89 | 0.012109 | 0.136 | 14.21 / 14.00 / 18.80 |
| [waist-fw190-close](waist-fw190-close.jpg) | PNG 1920×1080 | 0.600 | 0.261 | 28.90 | 0.010120 | 0.081 | 8.07 / 7.70 / 10.70 |
| [tail-bf109-close](tail-bf109-close.jpg) | PNG 1920×1080 | 0.267 | 0.296 | 13.45 | 0.012261 | 0.133 | 15.57 / 15.50 / 23.50 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | PNG 1920×1080 | 0.606 | 0.175 | 39.36 | 0.008951 | 0.112 | 12.80 / 10.90 / 25.30 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | PNG 1920×1080 | 0.629 | 0.145 | 33.87 | 0.005267 | 0.102 | 9.92 / 8.70 / 18.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | PNG 1920×1080 | 0.643 | 0.243 | 31.79 | 0.008823 | 0.108 | 12.80 / 11.80 / 22.90 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | PNG 1920×1080 | 0.644 | 0.243 | 31.58 | 0.009143 | 0.104 | 10.84 / 10.50 / 13.40 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.8, 6.2, 2.5, 3.2, 1.5, 1.3, 1.3, 0.5, 1.0, 5.5, 13.4, 22.3, 19.7, 11.6, 8.0, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.6, 8.3, 4.7, 2.9, 3.7, 1.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.6, 3.5 | 0.00 / 0.00 |
| [waist-fw190-close](waist-fw190-close.jpg) | 1.8, 10.1, 2.3, 2.0, 2.7, 3.4, 3.0, 4.0, 0.8, 3.9, 11.1, 19.0, 19.0, 10.4, 6.1, 0.5 | 0.00 / 0.00 |
| [tail-bf109-close](tail-bf109-close.jpg) | 5.5, 55.7, 5.4, 3.9, 2.5, 2.6, 4.4, 0.3, 0.2, 0.1, 0.3, 1.2, 4.5, 6.9, 5.9, 0.5 | 0.00 / 0.00 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | 0.4, 2.2, 1.2, 1.4, 2.7, 0.7, 1.7, 11.5, 15.9, 13.4, 14.0, 12.1, 13.3, 7.6, 2.0, 0.0 | 0.00 / 0.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | 0.0, 1.0, 1.4, 1.1, 1.4, 0.6, 0.3, 5.7, 15.5, 19.2, 16.7, 16.3, 14.1, 6.5, 0.1, 0.0 | 0.00 / 0.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | 1.8, 6.1, 2.7, 3.5, 1.8, 2.0, 1.5, 0.5, 0.8, 4.2, 12.5, 21.0, 21.6, 11.7, 8.1, 0.3 | 0.00 / 0.00 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | 1.8, 6.1, 2.8, 3.5, 1.8, 1.9, 1.5, 0.5, 0.8, 3.9, 12.3, 20.7, 21.9, 11.8, 8.3, 0.3 | 0.00 / 0.00 |
