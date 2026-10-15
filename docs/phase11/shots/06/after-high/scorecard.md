# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `d483ab6b167a3fa2ba19a49fde099e35c0c237cb` (dirty at capture: false).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

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
| [night-formation](night-formation.jpg) | — | __/10 | — | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset-rim](sunset-rim.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.646 | 0.240 | 31.86 | 0.009811 | 0.115 | 12.89 / 12.60 / 17.60 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.292 | 0.332 | 12.50 | 0.012266 | 0.141 | 14.14 / 13.50 / 18.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.620 | 0.166 | 49.42 | 0.006811 | 0.105 | 11.77 / 10.50 / 20.60 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.525 | 0.205 | 16.17 | 0.007859 | 0.072 | 10.38 / 10.20 / 13.00 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.623 | 0.203 | 12.63 | 0.006771 | 0.111 | 9.83 / 9.30 / 13.50 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.710 | 0.117 | 23.28 | 0.004213 | 0.159 | 11.46 / 11.60 / 13.60 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.81 | 0.001220 | 0.168 | 4.41 / 3.70 / 10.20 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.495 | 0.113 | 31.96 | 0.003274 | 0.192 | 12.57 / 12.80 / 16.80 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.600 | 0.229 | 6.88 | 0.006755 | 0.082 | 19.19 / 13.80 / 55.30 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.093 | 0.045 | 14.08 | 0.002498 | 0.024 | 5.08 / 4.50 / 11.40 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.653 | 0.139 | 48.06 | 0.002932 | 0.169 | 7.89 / 7.90 / 10.10 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.702 | 0.130 | 23.10 | 0.004997 | 0.107 | 11.78 / 11.30 / 16.30 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.633 | 0.178 | 19.46 | 0.002655 | 0.130 | 10.13 / 9.60 / 16.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.125 | 18.37 | 0.006713 | 0.075 | 16.61 / 14.60 / 33.80 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.612 | 0.162 | 17.66 | 0.003259 | 0.162 | 12.94 / 10.60 / 25.30 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.63 | 0.009107 | 0.107 | 13.13 / 10.40 / 28.00 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.106 | 0.053 | 21.63 | 0.002694 | 0.098 | 11.17 / 11.10 / 13.70 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.548 | 0.180 | 40.92 | 0.005797 | 0.160 | 9.00 / 8.80 / 11.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.8, 6.5, 2.5, 3.3, 1.5, 1.2, 1.3, 0.5, 1.0, 5.1, 13.1, 21.9, 20.2, 12.0, 8.0, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 53.0, 8.1, 4.5, 2.8, 3.3, 0.6, 0.1, 0.0, 0.0, 0.0, 0.0, 0.5, 5.4, 12.8, 3.5 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.4, 1.2, 3.3, 14.1, 13.8, 13.5, 11.4, 13.6, 14.2, 8.2, 2.7, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.2, 1.9, 1.5, 0.1, 0.2, 0.7, 8.6, 16.7, 21.8, 18.0, 15.5, 2.2, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.7, 1.3, 8.0, 9.9, 7.0, 4.9, 7.0, 9.0, 13.1, 18.2, 10.8, 5.5, 1.0 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 1.0, 0.9, 2.1, 2.3, 2.5, 9.6, 17.2, 21.4, 25.4, 14.9, 2.5, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.3, 10.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.6, 2.5, 4.9, 6.4, 14.6, 17.9, 22.1, 18.8, 11.0, 0.9, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.2, 10.2, 3.1, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.6, 25.7, 30.3, 16.6, 2.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 21.5, 60.3, 13.3, 4.1, 0.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.4, 1.0, 2.6, 4.1, 4.6, 12.8, 14.5, 15.1, 15.2, 18.8, 8.5, 2.0, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 0.6, 0.3, 2.3, 1.9, 2.4, 2.5, 9.2, 17.2, 21.3, 24.7, 14.5, 2.4, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.3, 5.3, 5.0, 7.9, 10.2, 4.8, 6.8, 9.3, 17.4, 17.9, 11.7, 3.1, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.4, 28.5, 28.5, 14.0, 6.5, 2.8, 0.9, 0.3, 0.2, 0.2, 0.3, 1.1, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.0, 3.8, 10.1, 16.9, 12.4, 10.1, 8.3, 9.8, 12.1, 14.1, 1.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.3, 19.9, 4.7, 2.2, 1.2, 1.3, 1.0, 1.2, 3.4, 12.3, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 18.1, 53.7, 21.1, 5.9, 0.9, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.3, 0.7, 0.5, 4.0, 11.6, 17.2, 13.8, 9.6, 7.4, 8.0, 9.2, 8.6, 4.9, 3.6, 0.5 | 0.00 / 0.00 |
