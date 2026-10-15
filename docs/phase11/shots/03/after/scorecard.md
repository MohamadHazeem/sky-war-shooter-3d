# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `982d01b68dfef3fd861c206b2d70ed58dc49e32b` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [cloud-flythrough](cloud-flythrough.jpg) | — | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.717 | 0.121 | 23.13 | 0.004135 | 0.161 | 11.88 / 11.00 / 17.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.134 | 30.70 | 0.003775 | 0.194 | 10.49 / 9.70 / 18.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.527 | 0.207 | 16.20 | 0.008004 | 0.075 | 10.65 / 10.30 / 13.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.601 | 0.231 | 6.85 | 0.006774 | 0.079 | 9.76 / 9.60 / 12.70 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.760 | 0.103 | 32.55 | 0.001370 | 0.148 | 4.72 / 4.40 / 8.40 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 1.0, 0.9, 2.1, 2.3, 2.4, 9.4, 16.1, 18.9, 25.0, 18.1, 3.6, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.7, 2.9, 3.9, 4.1, 7.6, 14.6, 18.7, 21.1, 16.6, 6.3, 2.3, 0.0, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.4, 0.1, 0.2, 0.7, 8.7, 16.5, 21.2, 17.5, 15.7, 3.1, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 10.2, 3.0, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.7, 25.8, 28.3, 16.8, 3.9, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.1, 6.1, 5.8, 8.0, 14.4, 28.5, 26.2, 9.8, 0.0 | 0.00 / 0.00 |
