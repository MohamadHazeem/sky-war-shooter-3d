# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 155.0.8059.41. Source revision: `24e045fc348de0bd8cea63c0998ce0184078f9ed` (dirty at capture: true).
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
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.618 | 0.100 | 18.76 | 0.001461 | 0.170 | 8.40 / 7.90 / 11.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.617 | 0.187 | 9.17 | 0.002967 | 0.015 | 6.37 / 6.00 / 7.90 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.727 | 0.038 | 3.54 | 0.001066 | 0.027 | 3.78 / 3.50 / 5.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.553 | 0.172 | 11.90 | 0.002699 | 0.028 | 7.91 / 7.90 / 9.50 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.726 | 0.100 | 13.81 | 0.001551 | 0.173 | 8.23 / 8.10 / 9.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.6, 10.0, 21.9, 20.2, 19.9, 15.4, 7.9, 2.8, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.0, 0.4, 10.6, 1.0, 0.8, 0.6, 0.5, 0.9, 2.4, 11.5, 26.7, 29.7, 13.6, 1.3, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.4, 14.2, 53.8, 30.6, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.0, 1.1, 10.1, 2.5, 1.6, 0.6, 0.2, 0.2, 7.1, 35.0, 33.5, 7.8, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 5.0, 15.1, 16.2, 17.9, 22.3, 18.3, 5.0, 0.0 | 0.00 / 0.00 |
