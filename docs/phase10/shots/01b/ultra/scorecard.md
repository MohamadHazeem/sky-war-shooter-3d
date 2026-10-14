# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset ultra.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.622 | 0.242 | 26.56 | 0.005937 | 0.067 | 8.89 / 8.70 / 10.50 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.262 | 0.302 | 14.48 | 0.007935 | 0.089 | 10.22 / 10.00 / 11.70 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.614 | 0.147 | 43.36 | 0.004547 | 0.089 | 7.91 / 7.50 / 11.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.546 | 0.204 | 18.82 | 0.006350 | 0.052 | 5.92 / 5.50 / 8.90 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.618 | 0.166 | 13.06 | 0.004610 | 0.085 | 7.57 / 7.60 / 8.60 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.630 | 0.142 | 24.47 | 0.002648 | 0.039 | 10.39 / 9.80 / 13.30 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.723 | 0.115 | 34.42 | 0.001275 | 0.063 | 6.28 / 6.20 / 8.10 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.584 | 0.141 | 24.18 | 0.002375 | 0.043 | 10.27 / 10.30 / 11.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.587 | 0.224 | 6.34 | 0.005559 | 0.046 | 8.44 / 8.70 / 10.10 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.068 | 0.034 | 7.38 | 0.002827 | 0.039 | 6.22 / 6.30 / 6.70 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.613 | 0.128 | 49.90 | 0.003810 | 0.226 | 6.09 / 6.10 / 7.00 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.630 | 0.146 | 24.31 | 0.002915 | 0.038 | 12.17 / 12.40 / 13.70 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.614 | 0.132 | 22.39 | 0.002078 | 0.077 | 10.32 / 7.50 / 9.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.099 | 0.128 | 9.60 | 0.005040 | 0.074 | 11.00 / 11.30 / 12.60 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.609 | 0.083 | 18.27 | 0.002243 | 0.142 | 7.23 / 6.90 / 10.00 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.468 | 0.275 | 31.46 | 0.005881 | 0.099 | 9.32 / 9.00 / 11.80 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.4, 7.8, 4.2, 1.5, 1.2, 0.6, 0.1, 0.2, 1.4, 7.6, 18.3, 19.6, 21.1, 12.8, 1.1, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 8.8, 57.4, 3.3, 2.2, 2.4, 3.2, 0.1, 0.1, 0.1, 0.4, 2.5, 2.2, 5.5, 6.5, 4.6, 0.7 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 1.0, 0.4, 0.1, 8.8, 17.4, 20.4, 17.4, 13.5, 12.4, 4.6, 0.5, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.3, 9.3, 2.3, 1.1, 0.2, 0.0, 0.1, 0.2, 7.2, 30.1, 33.1, 12.3, 0.7, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 2.8, 1.5, 0.9, 0.4, 0.2, 0.2, 7.2, 23.6, 16.5, 11.6, 13.5, 12.0, 5.2, 3.7, 0.6 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.1, 0.1, 0.0, 0.0, 0.0, 5.4, 17.7, 15.9, 12.1, 13.0, 12.6, 9.9, 7.7, 5.0, 0.3 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 10.9, 13.1, 12.4, 13.8, 22.0, 19.2, 7.7, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 0.0, 0.3, 1.9, 15.0, 18.5, 10.7, 13.5, 12.9, 12.3, 8.7, 4.5, 1.4, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.7, 10.6, 2.5, 1.6, 0.6, 0.1, 0.1, 0.0, 1.1, 14.2, 29.8, 22.7, 13.1, 1.8, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 45.4, 51.5, 2.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 1.3, 1.8, 2.9, 10.5, 21.3, 19.2, 14.1, 11.0, 10.4, 6.0, 1.1, 0.1 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.2, 0.4, 0.2, 0.1, 0.1, 4.9, 16.7, 16.5, 11.9, 13.1, 12.8, 10.1, 7.7, 5.1, 0.4 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.2, 0.6, 0.8, 1.7, 1.9, 10.0, 26.1, 17.6, 11.0, 12.6, 9.9, 5.2, 2.2, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 25.9, 67.2, 2.2, 0.8, 0.6, 0.2, 0.1, 0.1, 0.0, 0.0, 0.2, 0.8, 1.0, 0.5, 0.3, 0.2 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 0.0, 0.0, 0.1, 4.3, 24.2, 41.2, 12.2, 9.6, 6.7, 1.3, 0.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.9, 21.0, 4.1, 1.9, 1.5, 1.4, 1.1, 1.5, 9.0, 16.6, 14.1, 8.4, 9.0, 4.5, 0.9, 0.0 | 0.00 / 0.00 |
