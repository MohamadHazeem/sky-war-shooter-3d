# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 153.0.8010.12. Source revision: `53c4a85806520ef19db96819f73fdc8bf627b343` (dirty at capture: true).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.332 | 0.278 | 16.54 | 0.000608 | 0.012 | 3.19 / 3.10 / 4.50 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.139 | 0.012 | 3.30 | 0.000300 | 0.000 | 4.41 / 4.40 / 5.00 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.644 | 0.141 | 34.22 | 0.000750 | 0.032 | 2.31 / 2.20 / 3.00 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.429 | 0.124 | 7.18 | 0.000796 | 0.013 | 2.27 / 2.00 / 3.60 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.540 | 0.189 | 11.30 | 0.000730 | 0.026 | 2.17 / 1.80 / 4.20 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.612 | 0.197 | 22.90 | 0.000462 | 0.012 | 2.10 / 1.80 / 4.50 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.803 | 0.089 | 21.73 | 0.000149 | 0.000 | 1.43 / 1.30 / 2.40 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.515 | 0.193 | 21.03 | 0.000352 | 0.019 | 2.12 / 1.80 / 3.90 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.296 | 0.266 | 5.94 | 0.000568 | 0.013 | 2.67 / 2.60 / 3.80 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.069 | 0.019 | 5.34 | 0.000322 | 0.000 | 2.08 / 1.80 / 4.00 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.633 | 0.144 | 43.00 | 0.001209 | 0.061 | 1.21 / 1.00 / 2.20 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.608 | 0.199 | 22.95 | 0.000564 | 0.011 | 2.21 / 1.80 / 4.20 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.605 | 0.149 | 16.33 | 0.000277 | 0.026 | 1.87 / 1.60 / 3.80 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.192 | 0.096 | 21.49 | 0.000851 | 0.019 | 3.03 / 3.10 / 3.60 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.494 | 0.156 | 24.61 | 0.000463 | 0.051 | 3.33 / 3.10 / 5.50 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.455 | 0.246 | 28.19 | 0.001718 | 0.023 | 2.08 / 1.70 / 5.80 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.3, 10.3, 51.1, 4.9, 1.0, 0.4, 0.6, 0.4, 0.5, 1.5, 5.7, 8.2, 9.7, 5.2, 0.1, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 13.7, 86.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.1, 1.9, 0.5, 0.7, 0.4, 0.6, 1.3, 2.6, 13.8, 18.5, 18.4, 18.7, 15.7, 6.7, 0.2, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.3, 6.4, 4.0, 2.7, 2.2, 0.8, 4.1, 63.7, 15.5, 0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.9, 2.1, 0.6, 0.8, 13.6, 24.5, 8.7, 7.0, 5.8, 7.1, 10.9, 10.7, 3.1, 3.1, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 1.3, 12.7, 5.7, 2.4, 7.7, 7.5, 4.9, 9.7, 16.7, 17.0, 10.9, 3.4, 0.1 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.3, 11.6, 14.6, 19.5, 27.6, 21.9, 2.5 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 8.5, 17.3, 8.4, 5.8, 5.1, 5.6, 8.5, 15.9, 14.6, 9.3, 1.1, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.4, 44.9, 21.7, 1.3, 0.4, 0.4, 0.1, 0.1, 0.1, 2.6, 13.2, 9.7, 5.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 37.8, 60.4, 1.8, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 1.4, 3.7, 5.5, 11.4, 9.9, 10.9, 16.6, 16.1, 15.1, 8.4, 1.1, 0.0 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.2, 1.5, 12.9, 5.8, 2.5, 7.7, 7.5, 4.8, 9.6, 16.5, 16.8, 10.7, 3.3, 0.1 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.0, 0.1, 0.4, 9.4, 25.6, 15.3, 6.5, 7.2, 13.0, 12.9, 5.9, 3.5, 0.3 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.9, 28.5, 29.4, 11.1, 19.0, 7.6, 2.0, 0.9, 0.1, 0.2, 0.1, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 4.4, 10.6, 8.4, 6.5, 32.3, 11.8, 4.3, 4.7, 8.5, 7.1, 1.1, 0.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.7, 20.8, 4.3, 2.5, 3.2, 1.9, 5.3, 4.6, 12.3, 16.4, 10.4, 8.4, 7.4, 1.6, 0.3, 0.0 | 0.00 / 0.00 |
