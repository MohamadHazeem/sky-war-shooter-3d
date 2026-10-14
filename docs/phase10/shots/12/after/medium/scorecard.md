# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset medium.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.350 | 0.291 | 16.71 | 0.001486 | 0.065 | 15.99 / 14.80 / 21.10 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.035 | 15.45 | 0.000815 | 0.000 | 20.49 / 20.70 / 23.00 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.615 | 0.169 | 48.25 | 0.002691 | 0.099 | 15.09 / 14.50 / 20.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.444 | 0.167 | 16.85 | 0.002623 | 0.056 | 17.63 / 17.50 / 21.30 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.574 | 0.225 | 15.08 | 0.002705 | 0.077 | 17.08 / 16.70 / 20.50 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.641 | 0.171 | 24.51 | 0.001362 | 0.068 | 16.60 / 16.10 / 20.10 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.42 | 0.000442 | 0.059 | 9.30 / 9.10 / 11.20 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.551 | 0.180 | 30.83 | 0.001244 | 0.118 | 17.18 / 17.10 / 20.90 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.277 | 0.254 | 6.48 | 0.001295 | 0.037 | 15.48 / 15.30 / 19.30 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.087 | 0.037 | 13.66 | 0.000962 | 0.077 | 11.88 / 11.80 / 14.30 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.629 | 0.155 | 49.34 | 0.001393 | 0.102 | 11.86 / 12.00 / 15.10 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.639 | 0.175 | 24.30 | 0.001457 | 0.049 | 16.04 / 15.70 / 20.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.609 | 0.197 | 21.39 | 0.001095 | 0.088 | 11.03 / 10.60 / 15.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.157 | 0.087 | 9.43 | 0.001329 | 0.036 | 19.73 / 19.30 / 23.50 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.579 | 0.155 | 21.49 | 0.001176 | 0.108 | 15.46 / 15.60 / 18.60 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.485 | 0.286 | 32.69 | 0.003437 | 0.066 | 13.88 / 13.40 / 19.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.3, 11.4, 39.1, 15.2, 1.4, 0.8, 0.5, 0.3, 0.1, 0.5, 4.0, 6.1, 7.4, 6.9, 4.9, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.7, 15.8, 69.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.4, 1.9, 0.7, 0.5, 0.4, 1.5, 3.8, 14.4, 14.9, 13.8, 10.9, 12.7, 11.8, 8.9, 3.4, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.3, 9.3, 1.9, 1.6, 0.4, 0.8, 8.0, 36.3, 19.6, 11.4, 6.8, 0.5, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 1.5, 2.1, 0.8, 4.6, 18.6, 11.3, 4.6, 5.5, 6.0, 5.8, 7.4, 11.2, 12.7, 6.6, 1.3 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 2.2, 2.8, 6.0, 4.9, 5.7, 5.7, 9.5, 16.1, 16.1, 15.9, 11.9, 3.1, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.5, 20.7, 66.0, 9.8, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 1.8, 5.6, 6.6, 6.8, 7.2, 8.6, 9.2, 13.1, 14.0, 13.5, 9.9, 3.6, 0.1, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.1, 57.2, 10.1, 1.3, 0.5, 0.2, 0.0, 0.0, 1.1, 8.2, 7.8, 10.3, 2.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.2, 60.3, 12.0, 2.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 1.2, 5.8, 6.9, 5.7, 13.8, 14.4, 12.5, 12.7, 13.5, 10.1, 2.8, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.4, 2.5, 2.7, 6.2, 4.8, 5.7, 5.7, 8.7, 16.1, 15.8, 15.9, 12.0, 3.4, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.2, 3.6, 10.5, 15.9, 9.4, 5.4, 4.9, 5.0, 9.0, 16.2, 13.5, 6.2, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 57.3, 15.2, 12.2, 8.4, 4.2, 1.6, 0.6, 0.1, 0.1, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.1, 0.8, 3.9, 12.0, 24.9, 12.7, 9.3, 8.6, 7.3, 9.5, 9.2, 1.8, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 3.3, 20.3, 4.8, 2.4, 1.1, 1.9, 3.7, 3.7, 7.3, 12.4, 9.7, 7.4, 9.3, 9.0, 3.6, 0.1 | 0.00 / 0.00 |
