# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `4b8dd7555d12c72b70078965c67972f5fac44b0e` (dirty at capture: false).
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
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.130 | 30.29 | 0.003775 | 0.194 | 10.28 / 10.80 / 13.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.600 | 0.230 | 6.82 | 0.006733 | 0.078 | 9.40 / 9.60 / 11.20 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.81 | 0.001220 | 0.168 | 3.61 / 2.90 / 7.50 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.526 | 0.207 | 16.19 | 0.008002 | 0.075 | 8.96 / 8.60 / 10.60 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.710 | 0.117 | 23.28 | 0.004117 | 0.158 | 11.72 / 11.60 / 13.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.9, 4.0, 7.3, 14.2, 19.2, 21.9, 18.0, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 10.1, 3.0, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.5, 25.6, 30.0, 17.1, 2.4, 0.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.3, 10.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.4, 0.1, 0.2, 0.7, 8.8, 16.5, 21.2, 17.4, 15.6, 3.1, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 1.0, 0.9, 2.1, 2.3, 2.5, 9.5, 17.3, 21.3, 25.4, 15.0, 2.5, 0.0 | 0.00 / 0.00 |
