# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.354 | 0.298 | 16.45 | 0.003986 | 0.079 | 16.06 / 15.80 / 18.70 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.036 | 15.43 | 0.002130 | 0.000 | 19.80 / 19.60 / 25.70 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.620 | 0.172 | 49.18 | 0.006791 | 0.095 | 15.96 / 15.80 / 20.30 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.491 | 0.193 | 16.81 | 0.007307 | 0.081 | 15.29 / 15.00 / 18.20 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.587 | 0.222 | 14.82 | 0.006588 | 0.103 | 16.92 / 16.60 / 20.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.680 | 0.143 | 23.86 | 0.004193 | 0.147 | 19.10 / 18.80 / 23.80 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.82 | 0.001230 | 0.179 | 11.57 / 11.10 / 14.80 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.576 | 0.155 | 30.88 | 0.003861 | 0.185 | 18.87 / 18.60 / 22.20 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.281 | 0.263 | 6.86 | 0.003567 | 0.064 | 15.53 / 15.10 / 18.40 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.088 | 0.043 | 13.71 | 0.002675 | 0.031 | 13.55 / 13.40 / 17.40 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.650 | 0.152 | 48.96 | 0.003573 | 0.199 | 14.40 / 14.30 / 18.00 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.673 | 0.151 | 23.84 | 0.004346 | 0.092 | 19.40 / 19.40 / 23.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.619 | 0.208 | 20.20 | 0.002673 | 0.121 | 13.60 / 13.50 / 16.00 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.155 | 0.086 | 9.44 | 0.003216 | 0.061 | 18.51 / 18.70 / 20.70 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.605 | 0.147 | 19.05 | 0.003013 | 0.156 | 15.85 / 16.20 / 19.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.502 | 0.294 | 32.55 | 0.008385 | 0.098 | 13.47 / 13.50 / 16.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.6, 11.5, 39.5, 14.1, 1.9, 0.9, 0.6, 0.2, 0.1, 0.2, 2.9, 4.3, 7.8, 8.5, 5.8, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.0, 18.5, 67.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 0.4, 1.6, 4.1, 14.5, 13.0, 13.0, 11.0, 12.5, 12.4, 10.1, 3.8, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.3, 0.2, 0.7, 5.4, 16.1, 14.0, 22.7, 18.8, 5.5, 0.3, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.7, 1.9, 0.9, 5.7, 12.1, 9.8, 8.3, 5.7, 6.7, 6.6, 8.1, 11.2, 13.5, 6.6, 1.3 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.1, 2.6, 3.5, 2.4, 2.4, 4.0, 12.4, 19.0, 18.9, 17.6, 13.2, 3.8, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.3, 10.2, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.2, 3.6, 4.9, 3.7, 5.8, 9.5, 12.7, 17.2, 15.3, 14.8, 9.6, 2.5, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 55.3, 11.9, 1.3, 0.5, 0.1, 0.0, 0.0, 1.0, 7.0, 6.3, 9.7, 5.2, 0.2, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.5, 59.4, 12.1, 2.5, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 1.8, 3.7, 4.0, 5.2, 13.9, 14.7, 13.0, 12.1, 15.0, 12.9, 3.3, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 0.4, 2.8, 3.6, 2.4, 2.4, 4.1, 12.5, 18.8, 18.7, 17.3, 12.8, 3.7, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 3.2, 7.7, 8.0, 6.2, 6.9, 6.9, 5.6, 7.0, 10.0, 17.2, 15.1, 6.0, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 56.8, 16.7, 12.1, 7.9, 4.0, 1.5, 0.5, 0.1, 0.1, 0.0, 0.0, 0.1, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.1, 2.9, 7.6, 15.6, 15.9, 15.0, 11.4, 7.9, 11.4, 9.5, 1.5, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.8, 4.8, 2.3, 1.3, 1.3, 1.0, 1.2, 5.1, 14.2, 12.2, 8.1, 9.7, 9.9, 4.8, 0.1 | 0.00 / 0.00 |
