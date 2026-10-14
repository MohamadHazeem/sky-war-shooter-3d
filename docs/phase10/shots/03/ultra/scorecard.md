# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset ultra.
Browser: 155.0.8059.41. Source revision: `24e045fc348de0bd8cea63c0998ce0184078f9ed` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.618 | 0.100 | 18.83 | 0.001457 | 0.166 | 8.41 / 8.40 / 9.60 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.726 | 0.100 | 13.85 | 0.001545 | 0.170 | 10.10 / 10.00 / 11.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.6, 10.0, 21.8, 20.1, 19.9, 15.5, 8.1, 2.8, 0.0, 0.0 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 5.0, 15.0, 16.2, 17.7, 22.3, 18.5, 5.2, 0.0 | 0.00 / 0.00 |
