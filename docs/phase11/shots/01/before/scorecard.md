# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `4b8dd7555d12c72b70078965c67972f5fac44b0e` (dirty at capture: false).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [b17-beauty](b17-beauty.jpg) | __/10 | __/10 | — | — | — | — | __/10 | — | — | __/10 |
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.621 | 0.212 | 12.92 | 0.006960 | 0.121 | 9.69 / 9.70 / 11.60 |
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.647 | 0.242 | 31.23 | 0.009679 | 0.107 | 9.82 / 9.70 / 11.50 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.294 | 0.331 | 12.76 | 0.012345 | 0.141 | 10.94 / 10.30 / 14.30 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.7, 3.1, 9.4, 9.3, 5.2, 4.0, 6.3, 8.4, 12.5, 18.9, 12.2, 5.1, 1.2 | 0.00 / 0.00 |
| [waist-fw190](waist-fw190.jpg) | 1.9, 6.7, 2.3, 3.2, 1.4, 1.2, 1.3, 0.5, 0.8, 4.6, 12.8, 21.1, 21.5, 12.1, 8.3, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.9, 8.5, 4.8, 3.1, 3.6, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.5, 12.7, 3.4 | 0.00 / 0.00 |
