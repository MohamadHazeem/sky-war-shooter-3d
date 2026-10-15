# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `7a01ded75122b70da2ffa25d5edb2da2490775c5` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [cloud-flythrough](cloud-flythrough.jpg) | — | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.740 | 0.114 | 20.17 | 0.002795 | 0.204 | 11.84 / 11.30 / 16.90 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.601 | 0.127 | 32.39 | 0.002994 | 0.203 | 15.84 / 15.00 / 21.50 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.769 | 0.095 | 28.49 | 0.001368 | 0.159 | 6.09 / 5.30 / 13.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.577 | 0.220 | 7.24 | 0.005180 | 0.091 | 13.13 / 12.90 / 17.40 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.566 | 0.222 | 14.83 | 0.007600 | 0.076 | 14.83 / 14.40 / 18.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.2, 1.7, 1.3, 1.8, 1.6, 5.1, 14.9, 16.8, 28.6, 22.6, 5.4, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 2.5, 2.2, 2.0, 3.1, 6.9, 14.8, 18.6, 24.7, 17.9, 5.7, 1.5, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 3.8, 7.1, 7.9, 14.9, 27.7, 27.8, 10.7, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 9.3, 3.2, 2.4, 1.2, 0.5, 0.2, 0.1, 5.1, 20.8, 22.3, 16.5, 13.1, 3.9, 0.0, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.5, 8.8, 2.3, 1.5, 0.1, 0.0, 0.1, 1.3, 12.5, 19.5, 19.7, 17.6, 8.6, 3.9, 0.6, 0.1 | 0.00 / 0.00 |
