# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset cinematic.
Browser: 153.0.8010.12. Source revision: `7b1e3dd812a736f7c8e2b226784f3940ef9267a0` (dirty at capture: true).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.655 | 0.246 | 26.60 | 0.005996 | 0.074 | 21.01 / 20.70 / 25.00 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.292 | 0.333 | 11.79 | 0.010174 | 0.124 | 24.94 / 24.90 / 28.00 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.625 | 0.166 | 45.76 | 0.006125 | 0.101 | 24.03 / 24.40 / 28.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.512 | 0.212 | 15.99 | 0.005601 | 0.063 | 20.81 / 20.90 / 23.50 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.605 | 0.216 | 15.29 | 0.006606 | 0.126 | 23.37 / 23.50 / 27.20 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.713 | 0.124 | 23.47 | 0.004293 | 0.172 | 23.04 / 23.00 / 25.30 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.040 | 9.38 | 0.002487 | 0.276 | 12.86 / 13.20 / 15.40 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.597 | 0.136 | 30.41 | 0.004086 | 0.212 | 25.65 / 25.30 / 31.60 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.603 | 0.231 | 6.55 | 0.005017 | 0.055 | 24.55 / 24.60 / 29.20 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.092 | 0.047 | 13.79 | 0.002762 | 0.033 | 19.14 / 18.40 / 23.30 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.659 | 0.143 | 46.96 | 0.004212 | 0.220 | 20.95 / 20.80 / 25.10 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.704 | 0.136 | 23.48 | 0.005039 | 0.122 | 22.59 / 22.50 / 26.10 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.617 | 0.198 | 20.24 | 0.002909 | 0.141 | 18.77 / 18.70 / 22.00 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.222 | 0.129 | 17.82 | 0.004629 | 0.066 | 21.55 / 21.10 / 24.30 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.619 | 0.167 | 18.51 | 0.003924 | 0.198 | 20.24 / 20.10 / 22.90 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.517 | 0.307 | 32.39 | 0.008671 | 0.104 | 17.25 / 16.90 / 21.30 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.0, 6.9, 2.3, 3.4, 1.3, 0.9, 1.3, 0.5, 0.4, 3.0, 12.1, 19.8, 23.1, 14.3, 8.5, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.5, 53.7, 8.6, 3.2, 1.9, 3.9, 0.7, 0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 5.5, 12.2, 3.8 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.6, 0.3, 0.5, 2.1, 2.2, 13.0, 13.6, 12.3, 11.6, 14.7, 15.8, 9.1, 1.7, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.3, 1.9, 1.2, 0.1, 0.4, 2.4, 15.4, 24.2, 14.4, 8.9, 4.6, 11.3, 2.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 2.0, 1.7, 0.7, 2.4, 9.9, 11.6, 9.3, 7.0, 4.7, 6.0, 8.2, 16.4, 12.2, 6.8, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.7, 1.9, 1.7, 2.6, 4.2, 8.5, 14.4, 19.7, 24.6, 18.6, 3.0, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.1, 10.4, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.1, 1.7, 3.1, 3.7, 5.6, 6.8, 12.2, 16.7, 20.7, 21.3, 6.9, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.5, 10.1, 3.0, 2.3, 0.9, 0.2, 0.1, 0.1, 0.3, 5.3, 24.3, 30.9, 18.7, 2.3, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 23.4, 58.9, 13.8, 3.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.1, 1.1, 3.7, 4.5, 4.7, 10.0, 13.2, 13.5, 17.2, 19.0, 11.1, 1.6, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.4, 0.6, 0.9, 2.0, 1.7, 2.7, 4.3, 8.5, 14.4, 19.6, 24.4, 17.6, 2.9, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.5, 7.5, 8.7, 10.3, 6.9, 5.7, 4.8, 7.0, 12.1, 19.1, 12.4, 4.8, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 16.2, 29.6, 27.8, 13.4, 6.3, 2.5, 0.7, 0.2, 0.2, 0.2, 0.5, 1.2, 1.1, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.8, 3.7, 8.8, 15.1, 13.9, 9.5, 7.6, 8.2, 12.9, 16.4, 1.6, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.4, 20.0, 4.6, 2.3, 1.6, 1.2, 1.0, 1.1, 2.9, 10.7, 10.0, 8.3, 12.6, 13.2, 5.8, 0.1 | 0.00 / 0.00 |
