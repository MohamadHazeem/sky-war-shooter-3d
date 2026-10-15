# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `e2b1c1e990f1a7c89b838571f51faa322ca10c9b` (dirty at capture: true).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.644 | 0.240 | 32.39 | 0.009697 | 0.115 | 28.26 / 27.60 / 40.20 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.295 | 0.331 | 12.89 | 0.012369 | 0.139 | 15.35 / 15.20 / 19.30 |
| [waist-fw190-close](waist-fw190-close.jpg) | PNG 1920×1080 | 0.598 | 0.262 | 28.47 | 0.010654 | 0.084 | 9.57 / 9.40 / 13.20 |
| [tail-bf109-close](tail-bf109-close.jpg) | PNG 1920×1080 | 0.266 | 0.295 | 13.45 | 0.012673 | 0.135 | 13.73 / 13.60 / 16.70 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | PNG 1920×1080 | 0.603 | 0.178 | 39.24 | 0.009619 | 0.112 | 12.18 / 12.20 / 15.60 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | PNG 1920×1080 | 0.623 | 0.155 | 33.38 | 0.006011 | 0.100 | 10.70 / 10.40 / 14.60 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | PNG 1920×1080 | 0.643 | 0.243 | 31.79 | 0.009070 | 0.110 | 12.59 / 12.30 / 16.60 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | PNG 1920×1080 | 0.645 | 0.244 | 31.42 | 0.009351 | 0.106 | 12.07 / 11.90 / 15.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.8, 6.2, 2.7, 3.2, 1.5, 1.3, 1.3, 0.5, 1.0, 5.4, 13.3, 22.3, 19.8, 11.6, 7.9, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.6, 8.3, 4.7, 2.9, 3.7, 1.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.6, 3.4 | 0.00 / 0.00 |
| [waist-fw190-close](waist-fw190-close.jpg) | 1.8, 10.2, 2.8, 2.0, 2.5, 3.4, 2.7, 4.4, 1.0, 3.5, 10.9, 20.0, 17.5, 10.7, 6.1, 0.5 | 0.00 / 0.00 |
| [tail-bf109-close](tail-bf109-close.jpg) | 5.5, 55.7, 5.5, 4.0, 2.5, 2.6, 4.4, 0.3, 0.2, 0.1, 0.3, 1.2, 4.5, 6.9, 5.8, 0.5 | 0.00 / 0.00 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | 0.4, 2.3, 1.5, 1.4, 2.7, 0.7, 1.7, 11.4, 15.8, 13.4, 13.8, 12.1, 13.1, 7.6, 2.0, 0.0 | 0.00 / 0.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | 0.0, 1.7, 1.8, 1.2, 1.6, 0.6, 0.3, 5.3, 15.3, 18.3, 17.5, 15.8, 13.7, 6.7, 0.2, 0.0 | 0.00 / 0.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | 1.8, 6.1, 2.7, 3.5, 1.8, 2.0, 1.5, 0.5, 0.8, 4.2, 12.5, 21.0, 21.6, 11.6, 8.1, 0.3 | 0.00 / 0.00 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | 1.8, 6.1, 2.8, 3.5, 1.8, 1.9, 1.5, 0.5, 0.8, 3.8, 12.2, 20.5, 22.3, 11.9, 8.4, 0.3 | 0.00 / 0.00 |
