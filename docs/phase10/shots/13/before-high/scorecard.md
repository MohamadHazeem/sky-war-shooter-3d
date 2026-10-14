# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `e4494dd5043ad3e11ee4025b12846eb31e62deca` (dirty at capture: true).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.353 | 0.298 | 16.53 | 0.004076 | 0.094 | 15.80 / 15.40 / 18.30 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.036 | 15.42 | 0.002129 | 0.000 | 19.81 / 19.60 / 24.70 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.619 | 0.173 | 49.19 | 0.006847 | 0.090 | 16.17 / 16.40 / 20.00 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.499 | 0.195 | 16.71 | 0.007760 | 0.082 | 14.45 / 14.20 / 16.30 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.592 | 0.217 | 14.47 | 0.006936 | 0.110 | 16.15 / 15.90 / 18.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.676 | 0.147 | 23.89 | 0.004220 | 0.133 | 17.49 / 17.20 / 20.80 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.647 | 0.042 | 9.07 | 0.001252 | 0.189 | 11.34 / 10.80 / 14.70 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.576 | 0.158 | 30.84 | 0.003907 | 0.179 | 20.69 / 20.50 / 24.50 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.280 | 0.263 | 6.90 | 0.003570 | 0.064 | 17.87 / 17.80 / 22.00 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.091 | 0.046 | 13.84 | 0.002664 | 0.026 | 14.21 / 13.50 / 18.40 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.640 | 0.163 | 47.64 | 0.002967 | 0.153 | 11.85 / 11.10 / 18.20 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.668 | 0.156 | 23.88 | 0.004366 | 0.083 | 17.91 / 17.80 / 20.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.615 | 0.212 | 20.85 | 0.002772 | 0.120 | 13.85 / 13.60 / 17.40 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.155 | 0.086 | 9.44 | 0.003227 | 0.064 | 19.76 / 19.70 / 22.70 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.605 | 0.154 | 18.85 | 0.003189 | 0.148 | 17.16 / 17.30 / 19.40 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.502 | 0.294 | 32.51 | 0.008443 | 0.101 | 12.99 / 12.60 / 17.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.6, 11.5, 39.7, 14.0, 1.8, 0.8, 0.5, 0.2, 0.1, 0.2, 2.9, 4.4, 7.8, 8.3, 5.8, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.0, 18.5, 67.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 0.5, 1.7, 4.4, 14.3, 13.1, 13.0, 10.8, 12.5, 12.3, 10.1, 3.8, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.3, 0.1, 0.5, 3.1, 15.2, 15.4, 22.0, 20.1, 6.9, 0.4, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.8, 1.9, 0.9, 3.5, 11.0, 11.9, 7.9, 6.6, 7.1, 6.7, 8.2, 11.4, 13.3, 6.5, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 1.3, 1.8, 3.1, 2.3, 2.8, 5.7, 12.4, 18.3, 17.9, 17.3, 13.2, 3.9, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.8, 21.3, 62.5, 11.5, 0.8, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 1.2, 2.8, 4.2, 3.9, 7.0, 10.0, 11.4, 16.5, 15.3, 14.8, 10.0, 2.8, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 55.6, 11.9, 1.1, 0.5, 0.1, 0.0, 0.0, 1.0, 7.0, 6.3, 9.7, 5.1, 0.3, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.4, 56.9, 14.1, 3.0, 0.3, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.1, 0.8, 4.0, 3.8, 3.7, 4.9, 13.5, 13.9, 12.5, 11.8, 14.7, 12.8, 3.3, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.6, 1.7, 2.0, 3.1, 2.3, 2.8, 5.7, 12.5, 18.0, 17.6, 17.0, 12.8, 3.7, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 3.8, 7.9, 8.0, 7.5, 7.4, 5.1, 5.3, 6.7, 9.6, 17.0, 15.3, 6.3, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 56.8, 16.7, 12.1, 7.9, 4.0, 1.5, 0.5, 0.1, 0.1, 0.1, 0.0, 0.1, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 2.6, 3.0, 8.6, 13.2, 13.5, 14.6, 12.4, 9.0, 11.5, 9.7, 1.5, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.9, 4.7, 2.3, 1.3, 1.3, 1.0, 1.2, 5.2, 14.0, 12.1, 8.2, 9.6, 9.9, 4.8, 0.1 | 0.00 / 0.00 |
