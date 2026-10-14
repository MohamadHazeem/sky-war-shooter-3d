# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 155.0.8059.41. Source revision: `2d2939ab4b890df25c599b0adfcc670ce1139fed` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [top-formation](top-formation.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | — | __/10 | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |
| [b17-beauty](b17-beauty.jpg) | __/10 | __/10 | — | — | — | — | __/10 | — | — | __/10 |
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [cloud-flythrough](cloud-flythrough.jpg) | — | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [explosion-close](explosion-close.jpg) | — | __/10 | — | — | __/10 | — | __/10 | — | __/10 | __/10 |
| [flak-barrage](flak-barrage.jpg) | — | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [damaged-neighbour](damaged-neighbour.jpg) | __/10 | __/10 | — | — | __/10 | — | — | __/10 | __/10 | __/10 |
| [waist-interior](waist-interior.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [bomb-run](bomb-run.jpg) | — | — | — | __/10 | __/10 | — | __/10 | __/10 | — | __/10 |
| [p51-cockpit](p51-cockpit.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.653 | 0.208 | 19.56 | 0.003189 | 0.024 | 7.70 / 7.30 / 10.00 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.310 | 0.264 | 9.97 | 0.003783 | 0.030 | 9.86 / 10.00 / 13.10 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.681 | 0.122 | 25.99 | 0.002199 | 0.050 | 8.98 / 9.00 / 12.20 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.552 | 0.173 | 11.92 | 0.002719 | 0.027 | 5.37 / 5.10 / 7.50 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.657 | 0.131 | 7.13 | 0.002797 | 0.091 | 6.54 / 6.20 / 8.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.717 | 0.102 | 14.24 | 0.001798 | 0.053 | 7.68 / 7.40 / 9.80 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.790 | 0.083 | 19.81 | 0.001106 | 0.011 | 7.58 / 6.60 / 11.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.642 | 0.111 | 16.96 | 0.001707 | 0.053 | 7.67 / 7.40 / 10.40 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.605 | 0.183 | 9.30 | 0.002937 | 0.014 | 6.40 / 6.00 / 8.40 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.095 | 0.029 | 4.72 | 0.002785 | 0.042 | 6.19 / 5.80 / 8.40 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.687 | 0.095 | 33.46 | 0.002944 | 0.209 | 5.44 / 5.50 / 5.80 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.714 | 0.108 | 14.23 | 0.002100 | 0.050 | 10.39 / 9.60 / 14.20 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.679 | 0.099 | 14.38 | 0.001410 | 0.061 | 5.99 / 5.70 / 8.00 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.168 | 0.112 | 8.19 | 0.003830 | 0.053 | 12.30 / 12.70 / 15.50 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.652 | 0.063 | 10.94 | 0.001468 | 0.123 | 7.17 / 6.70 / 10.00 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.543 | 0.225 | 20.24 | 0.005491 | 0.070 | 8.63 / 8.40 / 11.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.0, 0.4, 9.9, 1.8, 1.0, 0.8, 0.6, 1.0, 2.6, 5.1, 15.7, 21.9, 24.0, 13.9, 1.3, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 0.9, 66.1, 7.7, 1.3, 0.9, 0.5, 0.2, 0.1, 0.2, 2.5, 3.3, 7.0, 6.7, 2.6, 0.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 0.2, 1.5, 0.3, 0.9, 0.4, 0.8, 0.6, 2.0, 17.0, 23.6, 24.0, 20.2, 7.9, 0.5, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.0, 1.2, 10.2, 2.7, 1.4, 0.5, 0.2, 0.2, 7.3, 35.0, 33.4, 7.7, 0.1, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.0, 1.2, 1.6, 0.8, 0.5, 0.4, 0.6, 9.5, 25.4, 18.7, 18.1, 14.2, 5.9, 2.7, 0.3 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 4.6, 15.5, 23.8, 18.6, 17.1, 11.9, 7.3, 1.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.4, 12.2, 16.3, 23.8, 28.1, 17.0, 0.2 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 8.7, 20.1, 17.0, 17.3, 16.2, 12.9, 5.5, 1.4, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.0, 0.4, 10.7, 0.9, 0.8, 0.6, 0.5, 0.8, 2.8, 17.2, 31.2, 20.6, 13.1, 0.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 2.1, 91.3, 6.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.7, 1.0, 4.9, 19.7, 26.1, 20.2, 15.9, 9.5, 1.5, 0.1 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.0, 0.2, 0.2, 0.2, 0.1, 0.1, 4.7, 15.5, 23.6, 18.4, 16.9, 11.8, 7.2, 1.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.1, 0.1, 0.3, 1.1, 1.5, 6.3, 17.9, 30.9, 19.1, 13.3, 6.1, 3.0, 0.4 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 9.5, 82.4, 2.9, 1.2, 0.4, 0.2, 0.2, 0.2, 0.1, 0.5, 0.8, 0.9, 0.5, 0.2, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 0.2, 4.9, 27.4, 44.6, 14.2, 7.5, 0.8, 0.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.0, 0.1, 12.3, 10.3, 3.2, 1.9, 1.3, 1.2, 3.6, 15.1, 22.0, 13.2, 10.7, 4.7, 0.4, 0.0 | 0.00 / 0.00 |
