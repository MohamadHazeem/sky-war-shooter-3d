# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `3701aed406cb78295fb52e288aa9f384f49ae17c` (dirty at capture: true).
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
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.543 | 0.192 | 11.67 | 0.000805 | 0.028 | 3.03 / 2.70 / 4.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.642 | 0.145 | 34.32 | 0.000814 | 0.030 | 3.69 / 3.40 / 5.30 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.191 | 0.094 | 21.18 | 0.000860 | 0.022 | 4.30 / 4.40 / 6.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.8, 2.1, 0.8, 1.1, 13.2, 23.9, 8.2, 6.9, 5.7, 6.8, 11.1, 10.7, 4.2, 3.2, 1.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.2, 2.1, 0.6, 0.7, 0.3, 0.7, 1.2, 2.7, 13.5, 18.5, 18.4, 18.5, 16.0, 6.4, 0.2, 0.0 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.9, 26.8, 31.7, 11.1, 19.7, 6.6, 1.8, 0.8, 0.1, 0.2, 0.1, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
