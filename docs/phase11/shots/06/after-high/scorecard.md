# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `743dfe2579895dabcf7ade98fea1c241212f5227` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset](sunset.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | __/10 | — | __/10 |
| [night-formation](night-formation.jpg) | — | __/10 | — | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [sunset-rim](sunset-rim.jpg) | __/10 | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [night-clouds](night-clouds.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | — | — | __/10 |
| [night-waist](night-waist.jpg) | — | __/10 | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [waist-fw190](waist-fw190.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | __/10 | — | — | __/10 |
| [tail-bf109](tail-bf109.jpg) | __/10 | — | — | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [top-formation](top-formation.jpg) | __/10 | __/10 | __/10 | — | — | __/10 | — | __/10 | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |
| [b17-beauty](b17-beauty.jpg) | __/10 | __/10 | — | — | — | — | __/10 | — | — | __/10 |
| [formation-chase](formation-chase.jpg) | __/10 | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [cloud-flythrough](cloud-flythrough.jpg) | — | __/10 | __/10 | — | — | — | __/10 | — | — | __/10 |
| [overcast-rain](overcast-rain.jpg) | — | __/10 | __/10 | — | __/10 | __/10 | __/10 | — | — | __/10 |
| [explosion-close](explosion-close.jpg) | — | __/10 | — | — | __/10 | — | __/10 | — | __/10 | __/10 |
| [flak-barrage](flak-barrage.jpg) | — | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [damaged-neighbour](damaged-neighbour.jpg) | __/10 | __/10 | — | — | __/10 | — | — | __/10 | __/10 | __/10 |
| [waist-interior](waist-interior.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [bomb-run](bomb-run.jpg) | — | — | — | __/10 | __/10 | — | __/10 | __/10 | — | __/10 |
| [p51-cockpit](p51-cockpit.jpg) | __/10 | __/10 | — | — | — | __/10 | __/10 | — | — | __/10 |
| [waist-fw190-close](waist-fw190-close.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [tail-bf109-close](tail-bf109-close.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | __/10 | __/10 | — | — | — | — | — | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.110 | 0.058 | 18.52 | 0.002446 | 0.017 | 6.78 / 7.30 / 9.50 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.578 | 0.131 | 38.80 | 0.003832 | 0.154 | 12.31 / 11.50 / 17.40 |
| [night-formation](night-formation.jpg) | PNG 1920×1080 | 0.141 | 0.074 | 28.87 | 0.002831 | 0.126 | 11.05 / 11.10 / 13.70 |
| [sunset-rim](sunset-rim.jpg) | PNG 1920×1080 | 0.616 | 0.188 | 47.29 | 0.005908 | 0.158 | 10.64 / 10.50 / 13.40 |
| [night-clouds](night-clouds.jpg) | PNG 1920×1080 | 0.137 | 0.067 | 25.60 | 0.002395 | 0.009 | 8.40 / 8.10 / 10.60 |
| [night-waist](night-waist.jpg) | PNG 1920×1080 | 0.146 | 0.103 | 26.13 | 0.003373 | 0.053 | 10.58 / 10.20 / 13.20 |
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.650 | 0.243 | 30.75 | 0.009637 | 0.110 | 12.79 / 11.50 / 19.70 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.293 | 0.332 | 12.40 | 0.011929 | 0.123 | 11.65 / 11.50 / 14.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.616 | 0.166 | 49.96 | 0.006848 | 0.100 | 8.46 / 8.20 / 10.90 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.523 | 0.204 | 16.32 | 0.007980 | 0.079 | 11.75 / 10.30 / 23.90 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.628 | 0.204 | 12.91 | 0.006813 | 0.111 | 8.73 / 8.60 / 10.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.710 | 0.117 | 23.27 | 0.004209 | 0.170 | 10.09 / 10.00 / 13.10 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.81 | 0.001222 | 0.169 | 3.35 / 2.90 / 6.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.601 | 0.230 | 6.88 | 0.006801 | 0.079 | 10.05 / 10.00 / 12.60 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.656 | 0.137 | 50.56 | 0.003649 | 0.214 | 12.89 / 12.80 / 16.80 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.702 | 0.131 | 23.24 | 0.004994 | 0.114 | 9.39 / 9.30 / 11.50 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.631 | 0.178 | 19.28 | 0.002640 | 0.126 | 9.38 / 8.20 / 14.60 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.127 | 18.21 | 0.006795 | 0.076 | 11.33 / 11.10 / 13.40 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.612 | 0.161 | 17.58 | 0.003253 | 0.158 | 9.98 / 9.00 / 17.70 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.64 | 0.009039 | 0.107 | 7.96 / 7.50 / 11.40 |
| [waist-fw190-close](waist-fw190-close.jpg) | PNG 1920×1080 | 0.601 | 0.262 | 25.47 | 0.010701 | 0.092 | 8.75 / 8.50 / 11.40 |
| [tail-bf109-close](tail-bf109-close.jpg) | PNG 1920×1080 | 0.267 | 0.296 | 13.47 | 0.012481 | 0.111 | 17.45 / 18.30 / 21.30 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | PNG 1920×1080 | 0.609 | 0.175 | 40.10 | 0.008762 | 0.122 | 9.65 / 9.70 / 13.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | PNG 1920×1080 | 0.645 | 0.245 | 30.44 | 0.008792 | 0.101 | 12.07 / 11.90 / 17.10 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | PNG 1920×1080 | 0.644 | 0.245 | 30.70 | 0.008701 | 0.096 | 12.72 / 12.60 / 17.40 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | PNG 1920×1080 | 0.637 | 0.148 | 33.93 | 0.005529 | 0.103 | 9.66 / 9.10 / 16.60 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [night-flak](night-flak.jpg) | 12.7, 61.0, 15.3, 7.3, 3.3, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.8, 3.0, 3.7, 4.0, 12.5, 16.2, 16.5, 19.6, 16.8, 5.5, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [night-formation](night-formation.jpg) | 9.2, 41.8, 25.5, 14.9, 6.3, 1.6, 0.4, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset-rim](sunset-rim.jpg) | 0.0, 0.1, 0.6, 0.4, 0.4, 5.7, 12.7, 14.2, 13.0, 8.8, 6.6, 7.1, 8.5, 10.6, 8.9, 2.3 | 0.00 / 0.00 |
| [night-clouds](night-clouds.jpg) | 10.7, 39.7, 26.8, 16.7, 5.6, 0.2, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-waist](night-waist.jpg) | 13.3, 38.8, 25.4, 11.8, 6.2, 2.2, 0.8, 0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.1, 0.2, 0.1 | 0.00 / 0.00 |
| [waist-fw190](waist-fw190.jpg) | 1.9, 6.7, 2.1, 3.1, 1.6, 1.2, 1.4, 0.5, 0.8, 4.3, 12.3, 20.2, 22.6, 12.9, 8.0, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.3, 53.0, 7.8, 4.4, 2.9, 3.7, 0.5, 0.1, 0.0, 0.0, 0.0, 0.0, 0.5, 5.2, 12.9, 3.6 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.4, 1.2, 4.2, 14.1, 13.8, 13.5, 11.4, 13.5, 13.9, 7.7, 2.5, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.2, 1.9, 1.5, 0.1, 0.2, 0.8, 8.5, 17.3, 22.0, 18.4, 14.6, 1.8, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.8, 1.4, 7.6, 9.8, 6.5, 4.7, 6.9, 8.8, 12.9, 18.9, 11.8, 5.4, 1.0 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 1.0, 0.9, 2.1, 2.3, 2.5, 9.5, 17.3, 21.6, 25.5, 14.7, 2.6, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.3, 10.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 9.8, 3.2, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.6, 25.9, 27.9, 18.6, 2.5, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 1.0, 2.3, 3.8, 4.8, 12.8, 14.5, 15.2, 15.2, 19.2, 8.5, 2.1, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.6, 0.6, 1.2, 1.0, 2.1, 2.3, 2.5, 9.5, 17.3, 21.5, 24.8, 14.2, 2.5, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.3, 5.6, 4.9, 7.7, 10.5, 5.0, 6.9, 9.2, 17.3, 17.7, 11.4, 3.1, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.2, 28.9, 28.4, 13.9, 6.7, 2.6, 0.8, 0.3, 0.2, 0.2, 0.3, 1.2, 1.1, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.0, 3.7, 10.1, 16.7, 12.5, 10.1, 8.4, 9.9, 12.2, 14.0, 1.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.8, 4.7, 2.3, 1.3, 1.3, 1.0, 1.2, 3.4, 12.2, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
| [waist-fw190-close](waist-fw190-close.jpg) | 1.7, 10.1, 2.3, 2.0, 2.6, 4.5, 5.2, 1.5, 0.8, 2.8, 8.7, 17.6, 23.5, 12.4, 4.2, 0.2 | 0.00 / 0.00 |
| [tail-bf109-close](tail-bf109-close.jpg) | 5.5, 55.6, 5.4, 3.7, 2.4, 2.7, 4.6, 0.5, 0.3, 0.1, 0.3, 1.2, 4.4, 6.8, 6.1, 0.5 | 0.00 / 0.00 |
| [headon-fw190-wedge](headon-fw190-wedge.jpg) | 0.5, 2.3, 1.3, 1.2, 2.5, 0.5, 1.0, 11.7, 15.8, 13.7, 13.6, 12.3, 13.4, 8.1, 2.0, 0.0 | 0.00 / 0.00 |
| [waist-fw190-broadside](waist-fw190-broadside.jpg) | 1.9, 6.6, 2.2, 3.5, 1.9, 1.8, 1.4, 0.5, 0.7, 3.8, 12.0, 20.2, 22.6, 13.2, 7.2, 0.4 | 0.00 / 0.00 |
| [waist-bf109-broadside](waist-bf109-broadside.jpg) | 1.9, 6.6, 2.3, 3.5, 2.0, 1.5, 1.4, 0.5, 0.8, 4.1, 12.4, 20.6, 22.1, 12.5, 7.4, 0.4 | 0.00 / 0.00 |
| [headon-fw190-zoom](headon-fw190-zoom.jpg) | 0.0, 1.3, 1.6, 1.2, 0.9, 0.5, 0.3, 3.9, 14.5, 18.1, 17.7, 16.5, 15.9, 7.4, 0.2, 0.0 | 0.00 / 0.00 |
