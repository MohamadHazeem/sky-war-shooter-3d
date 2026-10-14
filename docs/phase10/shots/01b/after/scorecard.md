# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 155.0.8059.41. Source revision: `e8ce68b6095f11a06be2ee2cb116e99fc78d5c51` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.622 | 0.241 | 26.74 | 0.008319 | 0.089 | 8.37 / 8.40 / 9.60 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.260 | 0.302 | 14.33 | 0.009733 | 0.106 | 8.93 / 8.50 / 12.90 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.613 | 0.147 | 43.27 | 0.005265 | 0.093 | 8.48 / 8.30 / 10.70 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.546 | 0.204 | 19.31 | 0.008367 | 0.055 | 9.64 / 8.60 / 19.30 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.619 | 0.165 | 13.05 | 0.005765 | 0.098 | 9.57 / 8.60 / 17.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.630 | 0.143 | 24.53 | 0.003002 | 0.040 | 11.06 / 10.30 / 14.70 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.730 | 0.118 | 34.29 | 0.001204 | 0.047 | 10.15 / 9.80 / 16.20 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.585 | 0.140 | 24.31 | 0.002796 | 0.042 | 10.89 / 10.30 / 15.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.587 | 0.225 | 6.54 | 0.006089 | 0.053 | 8.50 / 8.40 / 9.90 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.068 | 0.032 | 7.35 | 0.002698 | 0.030 | 7.33 / 7.80 / 9.70 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.613 | 0.128 | 49.93 | 0.003798 | 0.233 | 5.48 / 5.60 / 7.00 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.630 | 0.146 | 24.37 | 0.003280 | 0.040 | 9.12 / 8.90 / 11.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.614 | 0.132 | 22.36 | 0.002167 | 0.080 | 6.03 / 5.90 / 8.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.099 | 0.128 | 9.75 | 0.005851 | 0.080 | 11.03 / 11.00 / 13.90 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.609 | 0.083 | 18.27 | 0.002509 | 0.149 | 6.89 / 6.00 / 12.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.469 | 0.274 | 31.57 | 0.006927 | 0.100 | 6.50 / 6.30 / 8.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.3, 7.9, 4.1, 1.4, 1.3, 0.6, 0.1, 0.2, 1.4, 7.5, 18.4, 19.6, 21.1, 13.0, 1.0, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 8.6, 56.3, 5.0, 3.5, 3.2, 0.9, 0.1, 0.0, 0.0, 0.3, 2.5, 2.2, 5.6, 6.4, 4.8, 0.7 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 1.0, 0.4, 0.1, 8.7, 17.4, 20.4, 17.4, 13.6, 12.4, 4.4, 0.5, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.2, 9.4, 2.3, 1.2, 0.2, 0.0, 0.0, 0.1, 7.1, 30.1, 33.1, 12.3, 0.7, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 2.8, 1.5, 0.9, 0.4, 0.1, 0.1, 6.8, 23.2, 16.8, 12.0, 13.7, 12.3, 4.9, 3.7, 0.6 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.1, 0.1, 0.0, 0.0, 0.0, 5.5, 17.8, 15.7, 12.2, 13.0, 12.5, 10.2, 7.5, 5.2, 0.3 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.9, 10.6, 12.8, 12.4, 12.8, 20.0, 19.7, 10.9, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 0.0, 0.1, 1.9, 15.0, 18.6, 10.6, 13.6, 13.0, 12.3, 9.0, 4.3, 1.4, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.7, 10.6, 2.5, 1.6, 0.6, 0.1, 0.1, 0.0, 1.1, 14.1, 29.7, 22.7, 13.3, 1.9, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 45.5, 51.5, 2.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 1.3, 1.8, 2.9, 10.6, 21.2, 19.1, 14.1, 11.3, 10.3, 5.8, 1.1, 0.1 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.2, 0.3, 0.2, 0.1, 0.1, 5.0, 16.8, 16.3, 11.9, 13.1, 12.6, 10.3, 7.5, 5.2, 0.4 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.2, 0.5, 0.8, 1.6, 1.9, 10.0, 26.1, 17.5, 11.2, 12.9, 9.5, 4.8, 2.7, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 25.6, 67.4, 2.4, 0.8, 0.5, 0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.8, 1.0, 0.5, 0.4, 0.2 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 0.0, 0.0, 0.1, 4.2, 24.0, 41.3, 12.3, 9.8, 6.7, 1.2, 0.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.7, 20.9, 4.2, 1.9, 1.3, 1.5, 1.1, 1.6, 9.2, 16.7, 14.1, 8.6, 8.8, 4.5, 0.9, 0.0 | 0.00 / 0.00 |
