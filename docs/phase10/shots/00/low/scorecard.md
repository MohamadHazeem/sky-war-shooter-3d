# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset low.
Browser: 155.0.8059.41. Source revision: `2d2939ab4b890df25c599b0adfcc670ce1139fed` (dirty at capture: true).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.652 | 0.209 | 19.62 | 0.001409 | 0.013 | 5.90 / 5.70 / 7.40 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.309 | 0.263 | 9.84 | 0.001410 | 0.018 | 8.28 / 7.50 / 13.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.683 | 0.121 | 25.87 | 0.000727 | 0.034 | 5.10 / 4.80 / 6.80 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.542 | 0.168 | 10.32 | 0.001176 | 0.016 | 5.02 / 4.60 / 7.40 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.653 | 0.130 | 6.99 | 0.001096 | 0.046 | 8.34 / 8.30 / 10.00 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.714 | 0.103 | 14.09 | 0.000514 | 0.026 | 6.45 / 6.00 / 9.90 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.796 | 0.085 | 19.72 | 0.000241 | 0.000 | 4.34 / 4.30 / 5.90 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.642 | 0.111 | 16.77 | 0.000526 | 0.033 | 5.65 / 5.60 / 7.80 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.613 | 0.186 | 9.46 | 0.001194 | 0.009 | 3.77 / 3.60 / 5.90 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.095 | 0.019 | 4.50 | 0.000504 | 0.000 | 3.77 / 3.90 / 4.80 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.681 | 0.096 | 35.29 | 0.000911 | 0.067 | 4.75 / 4.80 / 6.30 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.710 | 0.110 | 14.06 | 0.000615 | 0.021 | 6.55 / 6.10 / 10.60 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.676 | 0.100 | 13.17 | 0.000449 | 0.041 | 6.97 / 6.50 / 11.10 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.169 | 0.111 | 8.23 | 0.001290 | 0.038 | 9.30 / 8.90 / 12.20 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.645 | 0.064 | 9.86 | 0.000467 | 0.073 | 7.06 / 7.20 / 8.90 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.549 | 0.223 | 20.12 | 0.002536 | 0.034 | 4.62 / 4.50 / 5.60 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.0, 0.4, 10.5, 1.3, 0.9, 0.8, 0.6, 1.0, 2.8, 5.1, 15.8, 22.0, 24.0, 13.8, 1.0, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 0.6, 66.1, 8.9, 0.8, 0.5, 0.5, 0.2, 0.1, 0.2, 2.7, 3.1, 6.6, 6.7, 2.8, 0.2 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 0.2, 1.5, 0.3, 1.0, 0.4, 1.0, 0.5, 1.6, 16.9, 23.4, 24.0, 20.8, 8.0, 0.4, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.0, 1.1, 10.9, 2.2, 1.5, 0.4, 0.2, 0.2, 6.9, 40.7, 35.7, 0.1, 0.1, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.0, 0.9, 1.7, 0.9, 0.6, 0.4, 1.0, 10.7, 27.1, 16.4, 18.5, 13.2, 5.7, 2.7, 0.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.2, 20.2, 21.3, 17.9, 17.4, 12.0, 6.8, 1.1 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 2.1, 12.2, 15.6, 21.7, 28.0, 19.5, 0.8 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.7, 8.4, 21.0, 16.4, 17.3, 16.4, 13.2, 5.1, 1.4, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.0, 0.4, 10.9, 0.8, 0.8, 0.6, 0.5, 0.7, 2.1, 11.1, 33.1, 25.2, 13.5, 0.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 1.0, 93.1, 5.6, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.9, 1.5, 5.8, 21.2, 24.7, 20.4, 15.8, 8.2, 1.2, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.1, 0.3, 0.3, 0.2, 0.2, 0.1, 3.3, 20.2, 20.8, 17.8, 17.2, 11.9, 6.6, 1.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.2, 0.2, 0.3, 0.3, 0.8, 5.6, 24.3, 27.4, 17.7, 13.3, 6.0, 3.4, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 7.2, 84.4, 3.1, 1.1, 0.6, 0.2, 0.2, 0.2, 0.1, 0.5, 0.8, 0.9, 0.5, 0.2, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 0.1, 5.0, 34.4, 39.6, 12.1, 7.5, 0.7, 0.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.0, 0.1, 10.7, 11.2, 3.0, 1.8, 1.2, 1.4, 3.5, 14.7, 22.4, 13.8, 11.0, 4.9, 0.3, 0.0 | 0.00 / 0.00 |
