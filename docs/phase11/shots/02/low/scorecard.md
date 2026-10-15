# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `2dc10f15baa213a44426893c972297845f99f937` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [b17-beauty](b17-beauty.jpg) | __/10 | __/10 | — | — | — | — | __/10 | — | — | __/10 |
| [top-formation](top-formation.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | — | __/10 | — | __/10 |
| [waist-interior](waist-interior.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.541 | 0.189 | 11.37 | 0.000800 | 0.032 | 3.46 / 3.30 / 4.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.606 | 0.202 | 33.50 | 0.001136 | 0.018 | 4.17 / 3.90 / 5.50 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.217 | 0.096 | 22.39 | 0.000873 | 0.018 | 4.55 / 4.30 / 6.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.6, 1.7, 1.2, 1.2, 13.7, 24.4, 8.3, 6.9, 5.8, 6.9, 11.0, 10.8, 3.1, 3.2, 1.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.8, 7.9, 1.1, 0.8, 0.5, 0.7, 0.3, 3.1, 10.7, 17.3, 16.7, 17.4, 15.3, 7.1, 0.2, 0.0 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.8, 19.6, 20.7, 23.9, 19.3, 11.0, 2.8, 1.4, 0.1, 0.2, 0.1, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
