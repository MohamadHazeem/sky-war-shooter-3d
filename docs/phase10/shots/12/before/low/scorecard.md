# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `e4494dd5043ad3e11ee4025b12846eb31e62deca` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.238 | 0.157 | 26.80 | 0.000640 | 0.004 | 8.96 / 8.70 / 10.80 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.457 | 0.075 | 29.85 | 0.000270 | 0.000 | 11.15 / 10.90 / 15.80 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.655 | 0.144 | 35.08 | 0.001070 | 0.041 | 10.52 / 11.40 / 13.70 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.439 | 0.156 | 10.29 | 0.001097 | 0.015 | 8.39 / 8.50 / 9.30 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.561 | 0.203 | 10.64 | 0.001036 | 0.034 | 10.20 / 11.30 / 13.10 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.676 | 0.156 | 18.81 | 0.000544 | 0.024 | 16.04 / 16.30 / 19.80 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.798 | 0.088 | 21.98 | 0.000256 | 0.026 | 12.50 / 12.10 / 18.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.558 | 0.174 | 24.51 | 0.000494 | 0.040 | 16.11 / 16.20 / 19.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.195 | 0.124 | 15.94 | 0.000629 | 0.002 | 10.81 / 10.30 / 13.50 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.071 | 0.021 | 5.49 | 0.000512 | 0.000 | 10.69 / 11.20 / 13.10 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.660 | 0.133 | 42.68 | 0.002179 | 0.104 | 11.59 / 11.50 / 13.60 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.694 | 0.130 | 15.16 | 0.000665 | 0.027 | 13.21 / 13.60 / 16.40 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.605 | 0.166 | 18.59 | 0.000502 | 0.030 | 10.17 / 10.10 / 12.60 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.131 | 0.087 | 10.00 | 0.000826 | 0.014 | 12.42 / 12.30 / 13.30 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.544 | 0.168 | 20.43 | 0.000559 | 0.049 | 14.11 / 14.30 / 17.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.459 | 0.255 | 27.55 | 0.001754 | 0.026 | 15.47 / 15.20 / 19.30 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.4, 14.9, 51.4, 1.8, 0.6, 0.3, 6.8, 22.8, 0.0, 0.0, 0.1, 0.2, 0.2, 0.3, 0.1, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 2.6, 1.7, 0.0, 0.0, 0.0, 8.2, 77.8, 9.7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 1.9, 0.5, 0.8, 0.3, 1.0, 0.8, 1.7, 11.6, 18.6, 19.4, 17.6, 15.3, 9.2, 1.4, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.9, 11.7, 1.6, 2.1, 0.5, 0.3, 3.0, 39.9, 30.3, 8.8, 0.8, 0.1, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.0, 2.2, 1.2, 1.1, 12.0, 22.4, 6.9, 6.5, 5.9, 6.3, 9.3, 12.9, 7.3, 3.5, 1.4 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.4, 2.9, 4.2, 1.6, 5.8, 7.0, 7.3, 13.3, 19.4, 20.8, 11.9, 5.2, 0.1 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.5, 12.3, 14.7, 20.4, 28.1, 20.5, 1.5 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.9, 4.9, 7.3, 6.6, 7.0, 8.2, 8.6, 11.0, 16.9, 16.4, 11.2, 1.1, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.4, 45.4, 21.8, 1.3, 0.6, 22.9, 6.6, 0.0, 0.0, 0.0, 0.3, 0.3, 0.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 36.1, 61.4, 2.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.4, 2.8, 4.1, 7.1, 7.1, 13.7, 19.3, 17.7, 15.2, 10.7, 1.9, 0.0 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.2, 0.2, 0.2, 0.2, 1.5, 9.2, 6.9, 7.6, 13.6, 21.4, 21.7, 11.9, 5.1, 0.1 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.5, 1.3, 3.1, 10.9, 21.4, 11.8, 6.7, 6.2, 10.6, 13.4, 10.5, 3.3, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 2.5, 57.9, 32.7, 0.9, 0.2, 0.3, 1.2, 4.2, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 4.1, 10.1, 2.3, 3.2, 24.9, 13.3, 9.9, 6.3, 11.5, 10.4, 3.7, 0.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.6, 22.1, 4.5, 2.5, 2.2, 1.6, 3.8, 5.1, 12.7, 13.7, 9.9, 9.6, 9.1, 2.3, 0.3, 0.0 | 0.00 / 0.00 |
