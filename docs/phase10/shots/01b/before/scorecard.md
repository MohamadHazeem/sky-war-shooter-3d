# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 155.0.8059.41. Source revision: `e8ce68b6095f11a06be2ee2cb116e99fc78d5c51` (dirty at capture: false).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.637 | 0.203 | 20.15 | 0.005908 | 0.074 | 6.40 / 6.30 / 7.40 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.324 | 0.268 | 9.54 | 0.006943 | 0.128 | 9.37 / 9.70 / 11.50 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.637 | 0.121 | 25.66 | 0.003905 | 0.121 | 6.08 / 6.00 / 6.90 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.572 | 0.181 | 12.70 | 0.006206 | 0.069 | 6.50 / 6.20 / 8.00 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.634 | 0.132 | 8.18 | 0.004095 | 0.113 | 7.91 / 8.00 / 10.10 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.646 | 0.119 | 15.91 | 0.002412 | 0.058 | 9.02 / 8.70 / 11.90 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.727 | 0.101 | 22.67 | 0.001140 | 0.062 | 4.54 / 4.40 / 5.70 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.613 | 0.116 | 15.86 | 0.002347 | 0.073 | 8.83 / 8.00 / 12.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.607 | 0.184 | 7.44 | 0.004760 | 0.056 | 8.58 / 8.40 / 10.70 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.097 | 0.032 | 4.98 | 0.002625 | 0.026 | 5.19 / 5.20 / 5.90 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.632 | 0.107 | 34.33 | 0.002618 | 0.203 | 4.00 / 4.00 / 4.90 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.645 | 0.123 | 15.82 | 0.002594 | 0.052 | 8.03 / 7.20 / 11.70 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.633 | 0.110 | 14.37 | 0.001858 | 0.094 | 4.64 / 4.70 / 5.40 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.171 | 0.116 | 8.07 | 0.004969 | 0.066 | 7.82 / 7.70 / 8.90 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.629 | 0.067 | 11.08 | 0.002020 | 0.171 | 4.85 / 4.80 / 5.50 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.552 | 0.241 | 18.75 | 0.006854 | 0.077 | 5.54 / 5.50 / 6.40 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.0, 0.7, 9.6, 1.8, 1.0, 0.8, 0.9, 1.5, 2.1, 7.0, 20.0, 22.4, 22.9, 8.8, 0.4, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 1.1, 57.1, 9.4, 6.6, 2.3, 0.7, 0.3, 0.1, 0.1, 1.3, 3.2, 6.4, 7.6, 3.6, 0.3 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 0.3, 1.5, 0.7, 0.9, 0.4, 1.0, 0.5, 14.1, 22.8, 23.4, 18.8, 13.0, 2.5, 0.1, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.0, 1.2, 10.2, 2.8, 1.5, 0.6, 0.1, 0.0, 3.0, 23.1, 39.7, 17.1, 0.7, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.0, 1.1, 1.8, 0.9, 0.5, 0.4, 2.1, 17.0, 26.0, 16.0, 16.6, 10.7, 4.0, 2.7, 0.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.3, 8.5, 22.1, 17.2, 15.5, 14.8, 10.5, 7.6, 3.5, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 6.5, 13.6, 15.1, 16.9, 23.4, 19.4, 4.9, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.1, 0.1, 0.0, 0.2, 3.0, 16.3, 19.8, 15.5, 16.0, 14.7, 9.7, 4.2, 0.5, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.0, 0.5, 10.7, 1.0, 0.8, 0.6, 0.5, 0.8, 2.4, 14.7, 31.3, 24.7, 11.7, 0.3, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 2.2, 89.6, 7.1, 0.6, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.2, 1.1, 1.9, 4.8, 17.6, 26.2, 18.0, 13.9, 11.3, 4.4, 0.4, 0.1 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.1, 0.3, 0.2, 0.1, 0.2, 7.9, 21.4, 17.4, 15.5, 14.9, 10.7, 7.6, 3.5, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.1, 0.4, 0.8, 1.9, 4.8, 15.7, 29.8, 16.4, 14.6, 8.9, 4.8, 1.5, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 8.8, 82.0, 3.5, 1.3, 0.6, 0.3, 0.2, 0.2, 0.0, 0.1, 1.0, 1.1, 0.4, 0.4, 0.1 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.0, 0.1, 0.1, 0.0, 0.0, 1.1, 9.2, 43.8, 27.7, 11.5, 5.6, 0.6, 0.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.0, 0.4, 18.2, 4.6, 3.0, 1.8, 1.4, 1.0, 1.6, 9.7, 21.4, 17.3, 12.6, 6.3, 0.6, 0.0 | 0.00 / 0.00 |
