# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 155.0.8059.41. Source revision: `24e045fc348de0bd8cea63c0998ce0184078f9ed` (dirty at capture: false).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [cloud-flythrough](cloud-flythrough.jpg) | — | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.642 | 0.111 | 16.96 | 0.001707 | 0.053 | 10.57 / 10.10 / 13.20 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.605 | 0.183 | 9.30 | 0.002937 | 0.014 | 8.91 / 8.70 / 11.40 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.790 | 0.083 | 19.81 | 0.001106 | 0.011 | 7.91 / 7.70 / 10.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.552 | 0.173 | 11.92 | 0.002719 | 0.027 | 7.11 / 7.10 / 7.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.717 | 0.102 | 14.24 | 0.001798 | 0.053 | 12.74 / 11.50 / 17.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 8.7, 20.1, 17.0, 17.3, 16.2, 12.9, 5.5, 1.4, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.0, 0.4, 10.7, 0.9, 0.8, 0.6, 0.5, 0.8, 2.8, 17.2, 31.2, 20.6, 13.1, 0.2, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.4, 12.2, 16.3, 23.8, 28.1, 17.0, 0.2 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.0, 1.2, 10.2, 2.7, 1.4, 0.5, 0.2, 0.2, 7.3, 35.0, 33.4, 7.7, 0.1, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 4.6, 15.5, 23.8, 18.6, 17.1, 11.9, 7.3, 1.0 | 0.00 / 0.00 |
