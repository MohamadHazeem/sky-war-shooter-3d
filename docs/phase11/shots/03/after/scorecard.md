# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `4b8dd7555d12c72b70078965c67972f5fac44b0e` (dirty at capture: true).
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
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.597 | 0.118 | 31.20 | 0.003753 | 0.199 | 11.35 / 11.20 / 13.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.594 | 0.227 | 6.99 | 0.006664 | 0.078 | 9.91 / 9.90 / 12.60 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.624 | 0.035 | 6.58 | 0.001232 | 0.168 | 4.47 / 4.10 / 7.80 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.526 | 0.207 | 16.19 | 0.008000 | 0.075 | 10.08 / 9.70 / 13.70 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.729 | 0.107 | 23.31 | 0.004227 | 0.190 | 12.17 / 12.10 / 13.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.1, 1.2, 3.1, 4.7, 7.1, 16.3, 21.3, 22.0, 16.8, 5.2, 1.0, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 10.1, 3.0, 2.4, 1.1, 0.3, 0.1, 0.1, 0.3, 8.5, 29.8, 24.7, 15.8, 2.6, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 5.7, 40.1, 54.1, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.4, 0.1, 0.2, 0.7, 8.8, 16.5, 21.2, 17.4, 15.6, 3.1, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 0.6, 0.5, 1.3, 1.9, 1.8, 7.1, 14.1, 22.8, 28.9, 17.8, 2.9, 0.0 | 0.00 / 0.00 |
