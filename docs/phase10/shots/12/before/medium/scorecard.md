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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.350 | 0.290 | 16.77 | 0.001493 | 0.066 | 16.60 / 16.30 / 19.50 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.035 | 15.45 | 0.000815 | 0.000 | 20.52 / 20.50 / 25.30 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.614 | 0.169 | 48.29 | 0.002686 | 0.096 | 17.68 / 17.20 / 22.40 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.443 | 0.167 | 17.19 | 0.002922 | 0.053 | 16.40 / 15.70 / 23.70 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.572 | 0.227 | 15.40 | 0.002897 | 0.080 | 16.06 / 15.90 / 19.80 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.640 | 0.172 | 24.54 | 0.001370 | 0.065 | 17.95 / 17.90 / 20.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.42 | 0.000441 | 0.057 | 9.56 / 9.80 / 12.10 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.550 | 0.181 | 30.91 | 0.001230 | 0.115 | 18.14 / 17.80 / 21.40 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.276 | 0.254 | 6.55 | 0.001302 | 0.042 | 13.74 / 13.50 / 16.30 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.090 | 0.040 | 13.78 | 0.000961 | 0.046 | 12.28 / 12.10 / 14.10 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.629 | 0.163 | 47.66 | 0.001192 | 0.081 | 12.00 / 11.50 / 15.20 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.641 | 0.177 | 24.18 | 0.001467 | 0.048 | 17.20 / 16.80 / 20.70 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.607 | 0.202 | 21.55 | 0.001146 | 0.080 | 12.34 / 12.00 / 15.90 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.157 | 0.087 | 9.41 | 0.001327 | 0.035 | 18.46 / 18.10 / 20.90 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.576 | 0.159 | 21.69 | 0.001313 | 0.096 | 15.01 / 14.70 / 18.20 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.486 | 0.286 | 32.63 | 0.003442 | 0.067 | 12.81 / 12.70 / 15.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.3, 11.1, 39.7, 14.8, 1.8, 0.6, 0.6, 0.3, 0.1, 0.5, 3.9, 6.1, 7.4, 6.9, 4.9, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.6, 15.8, 69.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.4, 1.9, 0.7, 0.5, 0.4, 1.9, 3.8, 14.4, 14.6, 13.6, 10.9, 12.9, 11.7, 8.8, 3.4, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.3, 9.3, 1.8, 1.6, 0.4, 1.0, 7.9, 36.6, 19.4, 11.8, 6.3, 0.4, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 1.5, 2.1, 0.8, 6.0, 18.6, 9.9, 4.6, 5.6, 5.8, 5.7, 7.4, 11.2, 12.7, 6.7, 1.3 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 2.2, 3.2, 5.7, 5.2, 5.6, 5.4, 9.7, 16.1, 15.7, 16.0, 12.0, 3.2, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.5, 20.7, 65.7, 10.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 1.8, 5.9, 6.4, 7.0, 7.1, 8.7, 9.1, 12.8, 14.2, 13.3, 9.9, 3.6, 0.1, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.1, 57.4, 10.2, 1.1, 0.5, 0.2, 0.0, 0.0, 1.1, 8.3, 7.8, 10.1, 2.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.2, 57.6, 13.9, 2.9, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 2.6, 6.7, 6.2, 4.9, 12.4, 14.2, 12.3, 12.5, 13.7, 10.8, 3.2, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 2.4, 3.0, 6.0, 4.8, 5.6, 5.5, 8.1, 16.1, 15.4, 16.3, 12.5, 3.6, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.3, 4.5, 12.2, 14.3, 8.1, 5.3, 4.7, 5.0, 9.0, 16.2, 13.8, 6.4, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 57.2, 15.3, 12.3, 8.4, 4.3, 1.6, 0.6, 0.1, 0.1, 0.1, 0.0, 0.1, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.1, 2.4, 3.2, 13.8, 23.2, 11.5, 9.2, 8.4, 7.4, 9.6, 9.3, 1.8, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 3.3, 20.3, 4.9, 2.3, 1.1, 1.9, 3.8, 3.4, 7.2, 12.6, 9.8, 7.4, 9.3, 9.1, 3.6, 0.1 | 0.00 / 0.00 |
