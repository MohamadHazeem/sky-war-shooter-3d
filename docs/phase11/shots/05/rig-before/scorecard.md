# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `4a4b988d3bf18a122b608224b08c7a5450e15f26` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [waist-interior](waist-interior.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.126 | 18.37 | 0.006690 | 0.075 | 13.74 / 13.50 / 17.30 |
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.647 | 0.242 | 31.25 | 0.009671 | 0.107 | 13.03 / 12.60 / 17.10 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.294 | 0.331 | 12.76 | 0.012345 | 0.141 | 17.31 / 16.40 / 26.30 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.600 | 0.230 | 6.82 | 0.006733 | 0.078 | 10.24 / 9.40 / 16.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-interior](waist-interior.jpg) | 0.1, 15.4, 28.6, 28.8, 13.7, 6.6, 2.7, 0.9, 0.3, 0.2, 0.2, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [waist-fw190](waist-fw190.jpg) | 1.9, 6.7, 2.3, 3.2, 1.4, 1.2, 1.3, 0.5, 0.8, 4.6, 13.2, 21.4, 20.8, 12.0, 8.3, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.9, 8.5, 4.8, 3.1, 3.6, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.7, 3.4 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 10.1, 3.0, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.5, 25.6, 30.0, 17.1, 2.4, 0.0, 0.0 | 0.00 / 0.00 |
