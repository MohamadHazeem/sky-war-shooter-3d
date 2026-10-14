# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `e3154fc7d0fd4db2fea4bcbef02924da07e04156` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [flak-barrage](flak-barrage.jpg) | — | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.629 | 0.236 | 22.94 | 0.001731 | 0.018 | 13.76 / 14.70 / 16.40 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.271 | 0.299 | 10.60 | 0.002034 | 0.028 | 16.68 / 16.60 / 17.70 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.703 | 0.142 | 17.92 | 0.000696 | 0.026 | 12.85 / 12.70 / 15.00 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.157 | 24.56 | 0.000488 | 0.050 | 12.71 / 12.60 / 15.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.4, 8.9, 2.9, 2.4, 1.0, 1.4, 1.4, 1.5, 2.3, 4.2, 14.4, 21.3, 23.7, 13.4, 1.0, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.7, 62.2, 5.6, 4.8, 3.5, 0.6, 0.2, 0.2, 0.5, 0.5, 0.5, 2.5, 5.3, 6.9, 5.8, 0.3 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.2, 0.2, 1.9, 1.3, 3.2, 4.0, 4.9, 6.2, 12.8, 20.9, 23.1, 16.0, 5.3, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.2, 2.3, 5.1, 5.9, 5.8, 6.6, 8.4, 12.0, 19.9, 19.9, 12.8, 1.0, 0.0, 0.0 | 0.00 / 0.00 |
