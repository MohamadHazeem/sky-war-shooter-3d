# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset cinematic.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.302 | 0.252 | 13.62 | 0.000598 | 0.010 | 17.15 / 17.00 / 19.20 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.162 | 0.037 | 14.35 | 0.000117 | 0.000 | 18.51 / 18.30 / 20.70 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.558 | 0.168 | 41.23 | 0.001767 | 0.072 | 14.55 / 14.10 / 18.20 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.450 | 0.175 | 13.33 | 0.001461 | 0.030 | 16.04 / 15.90 / 18.60 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.536 | 0.190 | 12.66 | 0.002511 | 0.078 | 16.65 / 16.50 / 19.00 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.607 | 0.164 | 20.43 | 0.001406 | 0.140 | 20.49 / 20.40 / 22.60 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.568 | 0.074 | 9.20 | 0.000423 | 0.173 | 13.94 / 13.20 / 19.40 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.519 | 0.171 | 29.71 | 0.001233 | 0.165 | 19.48 / 19.30 / 21.70 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.239 | 0.219 | 5.85 | 0.000472 | 0.005 | 15.62 / 15.20 / 18.10 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.078 | 0.041 | 12.41 | 0.000281 | 0.028 | 12.52 / 12.20 / 14.30 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.588 | 0.140 | 42.91 | 0.001765 | 0.172 | 13.74 / 13.50 / 16.00 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.601 | 0.167 | 20.96 | 0.001566 | 0.082 | 18.43 / 18.40 / 20.70 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.571 | 0.170 | 15.72 | 0.000948 | 0.105 | 15.11 / 15.00 / 17.80 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.136 | 0.078 | 8.24 | 0.000345 | 0.023 | 19.50 / 19.40 / 24.10 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.549 | 0.124 | 15.40 | 0.000965 | 0.137 | 14.43 / 14.40 / 16.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.442 | 0.265 | 27.83 | 0.002784 | 0.067 | 14.39 / 14.20 / 16.70 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.3, 18.6, 44.2, 2.4, 1.8, 0.6, 0.3, 1.2, 3.1, 5.9, 6.6, 5.3, 4.5, 2.6, 0.5, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 17.4, 51.6, 31.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 1.3, 1.2, 0.7, 0.6, 2.1, 5.7, 10.9, 13.3, 14.5, 14.3, 12.5, 9.6, 7.7, 4.3, 1.4, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 4.7, 8.6, 1.9, 0.9, 0.6, 2.1, 13.2, 19.4, 22.0, 18.5, 7.1, 0.9, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.9, 1.9, 2.6, 7.7, 8.5, 9.3, 10.1, 11.1, 12.4, 9.7, 9.8, 9.2, 3.6, 1.6, 0.6 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 3.8, 3.8, 2.7, 3.5, 7.6, 13.6, 17.3, 14.7, 11.6, 11.1, 8.1, 2.1, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 4.2, 15.9, 24.0, 28.4, 26.4, 0.6, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 3.2, 6.8, 5.7, 5.7, 7.6, 11.6, 16.3, 12.7, 11.4, 11.5, 6.7, 0.8, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 66.3, 2.0, 0.7, 0.2, 0.1, 1.6, 4.5, 8.2, 7.0, 5.4, 2.6, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 42.7, 47.3, 8.8, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 2.4, 4.2, 7.9, 13.9, 16.1, 14.6, 13.5, 13.1, 9.3, 3.9, 0.7, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.8, 3.5, 4.2, 3.0, 3.5, 7.5, 13.7, 17.3, 14.7, 11.4, 10.7, 7.6, 2.0, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 1.4, 6.1, 8.2, 8.9, 11.5, 11.7, 10.7, 12.3, 10.9, 10.6, 6.4, 0.9, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 1.3, 63.8, 14.8, 9.7, 6.4, 2.7, 0.8, 0.3, 0.1, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.2, 1.1, 6.1, 12.5, 17.5, 18.2, 16.8, 11.6, 8.8, 6.4, 0.8, 0.0, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 5.0, 20.7, 4.2, 2.2, 1.9, 1.5, 2.8, 8.1, 12.4, 13.4, 10.8, 6.2, 3.8, 5.1, 2.1, 0.0 | 0.00 / 0.00 |
