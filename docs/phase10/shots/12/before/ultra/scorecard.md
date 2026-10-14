# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset ultra.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.352 | 0.296 | 16.28 | 0.003214 | 0.048 | 16.07 / 15.90 / 17.60 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.036 | 15.42 | 0.002129 | 0.000 | 17.56 / 17.50 / 19.80 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.622 | 0.176 | 48.96 | 0.005872 | 0.099 | 13.70 / 13.40 / 16.40 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.523 | 0.208 | 15.38 | 0.006112 | 0.068 | 15.01 / 14.60 / 17.70 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.606 | 0.208 | 14.09 | 0.006292 | 0.114 | 14.57 / 14.20 / 18.30 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.688 | 0.167 | 24.00 | 0.003383 | 0.124 | 15.99 / 15.80 / 18.30 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.649 | 0.046 | 9.46 | 0.001593 | 0.223 | 12.73 / 12.60 / 14.40 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.586 | 0.177 | 32.08 | 0.003196 | 0.163 | 17.46 / 17.20 / 20.00 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.278 | 0.259 | 6.81 | 0.003009 | 0.038 | 14.66 / 14.30 / 16.70 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.091 | 0.047 | 13.85 | 0.002802 | 0.036 | 11.39 / 11.10 / 13.40 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.654 | 0.158 | 46.34 | 0.003003 | 0.172 | 13.36 / 13.30 / 15.00 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.679 | 0.174 | 23.98 | 0.003601 | 0.078 | 16.03 / 16.00 / 18.20 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.621 | 0.197 | 19.82 | 0.002517 | 0.127 | 13.33 / 13.30 / 14.80 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.155 | 0.085 | 9.23 | 0.002941 | 0.059 | 18.35 / 18.20 / 21.00 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.621 | 0.147 | 17.69 | 0.003016 | 0.156 | 15.74 / 15.60 / 19.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.512 | 0.302 | 32.31 | 0.007699 | 0.101 | 12.95 / 12.80 / 15.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.6, 12.0, 39.5, 13.7, 1.9, 0.9, 0.5, 0.2, 0.1, 0.2, 2.9, 4.7, 8.4, 8.3, 5.2, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.0, 18.6, 67.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 0.4, 1.8, 5.2, 13.0, 12.9, 12.5, 10.5, 12.1, 13.2, 10.6, 4.1, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.3, 0.1, 0.1, 1.4, 9.5, 19.9, 21.1, 12.9, 10.4, 8.2, 0.2, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.8, 1.8, 0.7, 2.1, 7.2, 12.6, 9.1, 7.2, 8.2, 7.9, 8.4, 11.8, 13.7, 6.2, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 2.1, 3.1, 3.7, 2.3, 2.7, 3.0, 8.3, 14.2, 16.7, 19.8, 17.8, 6.1, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 4.1, 21.7, 59.2, 12.5, 2.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 2.1, 4.6, 5.3, 4.0, 4.9, 6.2, 7.9, 14.7, 13.8, 18.7, 14.7, 2.9, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 55.7, 11.8, 1.1, 0.4, 0.1, 0.0, 0.0, 1.0, 7.0, 7.1, 12.2, 2.2, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.4, 56.8, 14.0, 3.0, 0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.4, 2.5, 4.5, 3.8, 3.9, 12.2, 13.2, 12.6, 13.8, 15.4, 13.9, 3.7, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 2.6, 3.3, 3.8, 2.3, 2.8, 3.0, 8.4, 14.2, 16.5, 19.7, 17.0, 5.8, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.6, 6.2, 7.5, 11.2, 8.0, 6.6, 6.4, 6.6, 8.4, 17.3, 15.6, 5.4, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 57.0, 17.0, 12.1, 7.8, 3.8, 1.5, 0.4, 0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.1, 0.2, 2.3, 7.3, 14.0, 17.3, 12.7, 9.6, 9.3, 14.9, 11.0, 1.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.4, 20.0, 4.7, 2.2, 1.4, 1.3, 1.0, 0.9, 3.1, 11.7, 12.8, 9.7, 9.7, 10.9, 6.0, 0.2 | 0.00 / 0.00 |
