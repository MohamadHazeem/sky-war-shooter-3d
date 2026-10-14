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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.238 | 0.157 | 26.80 | 0.000641 | 0.004 | 8.53 / 8.30 / 10.30 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.457 | 0.075 | 29.85 | 0.000270 | 0.000 | 10.46 / 10.60 / 11.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.656 | 0.144 | 35.13 | 0.001072 | 0.041 | 12.43 / 11.70 / 16.20 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.442 | 0.157 | 10.24 | 0.001108 | 0.015 | 10.89 / 10.90 / 12.50 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.565 | 0.202 | 10.65 | 0.001047 | 0.034 | 13.47 / 13.50 / 15.60 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.702 | 0.124 | 15.17 | 0.000513 | 0.042 | 14.81 / 14.80 / 18.40 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.799 | 0.088 | 21.89 | 0.000252 | 0.028 | 10.31 / 10.30 / 14.30 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.560 | 0.173 | 24.65 | 0.000505 | 0.041 | 13.38 / 13.90 / 17.60 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.195 | 0.124 | 15.94 | 0.000629 | 0.002 | 8.21 / 7.80 / 11.80 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.069 | 0.020 | 5.45 | 0.000513 | 0.000 | 11.70 / 10.90 / 15.70 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.662 | 0.134 | 40.84 | 0.001598 | 0.092 | 10.23 / 10.20 / 13.70 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.676 | 0.158 | 18.76 | 0.000731 | 0.025 | 13.04 / 13.20 / 16.30 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.610 | 0.165 | 18.18 | 0.000504 | 0.030 | 9.52 / 9.60 / 12.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.131 | 0.087 | 10.00 | 0.000826 | 0.013 | 13.02 / 13.50 / 15.00 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.545 | 0.168 | 20.34 | 0.000560 | 0.052 | 10.18 / 10.60 / 12.80 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.460 | 0.255 | 27.56 | 0.001740 | 0.026 | 10.72 / 10.20 / 14.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.4, 14.9, 51.4, 1.8, 0.6, 0.3, 6.8, 22.8, 0.0, 0.0, 0.1, 0.2, 0.2, 0.3, 0.1, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 2.6, 1.7, 0.0, 0.0, 0.0, 8.2, 77.8, 9.7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 1.9, 0.5, 0.8, 0.3, 0.9, 0.8, 1.6, 11.3, 18.8, 19.5, 17.5, 15.3, 9.3, 1.5, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.9, 11.7, 1.6, 2.0, 0.5, 0.3, 2.8, 37.3, 32.4, 9.1, 1.2, 0.1, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.0, 2.3, 1.2, 1.1, 11.2, 21.6, 7.3, 6.7, 6.1, 6.6, 9.4, 13.2, 7.4, 3.6, 1.4 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.4, 8.9, 6.6, 7.5, 13.6, 21.7, 22.2, 12.3, 5.7, 0.1 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.4, 12.2, 14.7, 20.1, 28.1, 20.8, 1.8 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.8, 4.8, 7.1, 6.4, 6.8, 8.4, 8.7, 11.0, 17.0, 16.5, 11.2, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.4, 45.4, 21.8, 1.3, 0.6, 22.9, 6.6, 0.0, 0.0, 0.0, 0.3, 0.3, 0.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 38.3, 59.4, 2.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.4, 2.7, 4.1, 7.0, 7.0, 13.5, 19.3, 17.7, 15.2, 10.7, 2.2, 0.3 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.2, 0.5, 2.8, 4.4, 1.3, 5.7, 7.1, 7.0, 13.2, 19.5, 20.8, 12.0, 5.4, 0.1 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.4, 1.3, 2.1, 10.7, 21.0, 12.3, 7.0, 6.4, 10.5, 13.6, 10.8, 3.6, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 2.5, 57.9, 32.7, 0.9, 0.2, 0.3, 1.2, 4.2, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 4.1, 10.2, 2.2, 2.8, 23.9, 14.2, 9.9, 6.6, 11.5, 10.3, 3.7, 0.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.6, 22.1, 4.5, 2.5, 2.2, 1.6, 3.8, 5.0, 12.6, 13.7, 9.8, 9.7, 9.2, 2.4, 0.3, 0.0 | 0.00 / 0.00 |
