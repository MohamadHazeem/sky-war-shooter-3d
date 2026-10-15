# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `b34aee6250c7727259b879abe3fa57d1d4c8f9aa` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

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
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.599 | 0.128 | 32.84 | 0.003007 | 0.201 | 12.57 / 12.70 / 17.40 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.577 | 0.220 | 7.77 | 0.005150 | 0.088 | 12.30 / 11.90 / 16.10 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.764 | 0.101 | 31.30 | 0.001369 | 0.152 | 4.97 / 5.10 / 8.40 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.538 | 0.217 | 16.27 | 0.007622 | 0.074 | 23.46 / 24.00 / 32.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.729 | 0.121 | 22.69 | 0.002938 | 0.180 | 10.75 / 10.10 / 14.40 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 2.1, 2.5, 2.3, 3.2, 8.4, 14.9, 17.2, 23.6, 18.3, 6.0, 1.6, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 9.3, 3.2, 2.4, 1.2, 0.5, 0.2, 0.1, 5.2, 20.6, 22.6, 16.6, 13.0, 3.8, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.7, 5.9, 5.5, 7.8, 14.4, 28.1, 27.7, 9.9, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.1, 2.0, 1.4, 0.1, 0.1, 0.8, 8.1, 17.4, 18.6, 16.1, 12.7, 5.5, 3.7, 0.7, 0.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.8, 1.4, 2.1, 1.4, 1.8, 7.7, 14.9, 16.8, 27.0, 21.2, 4.7, 0.0 | 0.00 / 0.00 |
