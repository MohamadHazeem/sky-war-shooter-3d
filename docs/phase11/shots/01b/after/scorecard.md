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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.646 | 0.239 | 32.26 | 0.009921 | 0.115 | 18.07 / 17.50 / 22.60 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.295 | 0.331 | 12.96 | 0.012462 | 0.140 | 13.63 / 13.50 / 15.50 |
| [waist-fw190-close](waist-fw190-close.jpg) | PNG 1920×1080 | 0.609 | 0.259 | 27.41 | 0.012648 | 0.107 | 9.71 / 9.50 / 13.20 |
| [tail-bf109-close](tail-bf109-close.jpg) | PNG 1920×1080 | 0.265 | 0.295 | 13.73 | 0.012895 | 0.131 | 16.53 / 16.10 / 22.10 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | PNG 1920×1080 | 0.602 | 0.177 | 39.23 | 0.009541 | 0.117 | 11.25 / 10.70 / 15.10 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | PNG 1920×1080 | 0.630 | 0.153 | 32.85 | 0.005928 | 0.096 | 8.71 / 8.30 / 10.90 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | PNG 1920×1080 | 0.641 | 0.240 | 32.33 | 0.009204 | 0.112 | 10.82 / 10.60 / 13.60 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | PNG 1920×1080 | 0.643 | 0.240 | 32.17 | 0.008957 | 0.109 | 10.84 / 10.50 / 13.80 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.8, 6.2, 2.7, 3.2, 1.4, 1.1, 1.5, 0.6, 1.0, 5.2, 13.2, 22.1, 20.1, 11.7, 8.1, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.6, 8.3, 4.7, 2.9, 3.7, 1.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.6, 3.5 | 0.00 / 0.00 |
| [waist-fw190-close](waist-fw190-close.jpg) | 1.8, 10.4, 2.7, 1.8, 1.9, 2.2, 1.2, 1.4, 4.5, 5.3, 11.0, 18.7, 19.3, 11.5, 5.9, 0.4 | 0.00 / 0.00 |
| [tail-bf109-close](tail-bf109-close.jpg) | 5.5, 55.7, 5.4, 4.0, 2.6, 2.6, 4.4, 0.3, 0.2, 0.1, 0.3, 1.2, 4.5, 6.8, 5.8, 0.5 | 0.00 / 0.00 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | 0.5, 2.4, 1.4, 1.3, 2.6, 0.8, 2.0, 11.8, 15.9, 13.3, 13.9, 12.0, 13.0, 7.3, 1.9, 0.0 | 0.00 / 0.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | 0.0, 1.8, 1.7, 0.7, 1.3, 0.8, 0.5, 4.2, 15.0, 18.0, 18.1, 16.1, 14.2, 7.3, 0.2, 0.0 | 0.00 / 0.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | 1.8, 6.2, 2.6, 3.3, 1.6, 1.3, 2.3, 0.9, 0.9, 4.8, 12.9, 21.7, 20.6, 11.3, 7.6, 0.2 | 0.00 / 0.00 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | 1.8, 6.1, 2.6, 3.3, 1.7, 1.4, 2.1, 0.7, 0.9, 4.7, 12.9, 21.6, 20.7, 11.0, 8.3, 0.2 | 0.00 / 0.00 |
