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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.352 | 0.296 | 16.19 | 0.003148 | 0.046 | 16.23 / 15.90 / 18.40 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.036 | 15.42 | 0.002129 | 0.000 | 17.11 / 17.10 / 20.60 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.633 | 0.172 | 45.94 | 0.005891 | 0.100 | 14.51 / 14.10 / 17.80 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.514 | 0.204 | 15.31 | 0.005708 | 0.073 | 15.27 / 15.10 / 18.70 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.610 | 0.207 | 13.32 | 0.006155 | 0.114 | 15.99 / 15.50 / 18.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.690 | 0.165 | 24.03 | 0.003374 | 0.136 | 16.03 / 15.90 / 18.80 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.039 | 9.03 | 0.001576 | 0.216 | 13.06 / 13.30 / 15.80 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.589 | 0.176 | 32.14 | 0.003222 | 0.176 | 18.61 / 18.70 / 21.60 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.279 | 0.259 | 6.74 | 0.003006 | 0.039 | 16.26 / 15.90 / 19.60 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.089 | 0.045 | 13.70 | 0.002823 | 0.042 | 12.03 / 11.80 / 14.00 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.669 | 0.146 | 46.37 | 0.003583 | 0.210 | 13.82 / 13.80 / 16.10 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.683 | 0.171 | 24.01 | 0.003606 | 0.085 | 17.67 / 17.50 / 20.90 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.640 | 0.176 | 18.08 | 0.002507 | 0.133 | 15.43 / 15.10 / 20.40 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.154 | 0.085 | 9.26 | 0.002955 | 0.058 | 22.07 / 21.60 / 26.50 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.628 | 0.139 | 16.86 | 0.002874 | 0.175 | 16.24 / 16.20 / 19.20 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.513 | 0.302 | 32.32 | 0.007538 | 0.098 | 14.65 / 14.40 / 17.60 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.6, 12.0, 39.2, 13.9, 1.9, 0.9, 0.5, 0.2, 0.1, 0.2, 2.9, 4.7, 8.4, 8.3, 5.2, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.0, 18.6, 67.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.6, 1.9, 0.7, 0.5, 0.4, 1.2, 5.0, 10.0, 11.6, 12.7, 13.0, 13.4, 14.3, 10.9, 3.8, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.2, 2.0, 1.2, 0.1, 0.2, 1.3, 10.7, 25.5, 16.8, 13.1, 8.9, 7.1, 0.2, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.9, 1.7, 0.9, 3.1, 7.6, 8.6, 8.1, 8.2, 8.9, 8.9, 9.3, 12.1, 13.6, 5.9, 1.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 2.1, 2.8, 3.7, 2.6, 2.7, 2.3, 7.9, 14.5, 17.0, 20.2, 18.0, 6.1, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.1, 10.3, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 2.0, 4.2, 5.5, 4.4, 4.7, 5.1, 8.1, 14.7, 14.1, 19.3, 14.9, 2.9, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 55.5, 11.8, 1.2, 0.5, 0.1, 0.0, 0.0, 1.0, 7.0, 7.0, 12.3, 2.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.5, 59.4, 12.1, 2.6, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.3, 0.8, 2.8, 4.6, 4.2, 10.3, 14.0, 13.5, 14.6, 16.4, 14.5, 3.7, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.4, 2.5, 3.0, 3.8, 2.7, 2.7, 2.3, 7.9, 14.5, 16.9, 20.0, 17.5, 5.9, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.3, 2.9, 5.8, 7.3, 8.9, 11.3, 7.9, 8.0, 9.9, 17.9, 15.5, 4.1, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 57.0, 16.9, 12.0, 7.8, 3.9, 1.4, 0.4, 0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.0, 0.1, 0.8, 6.1, 15.0, 15.4, 15.9, 10.0, 9.8, 15.0, 10.6, 1.2, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.3, 19.9, 4.7, 2.2, 1.4, 1.3, 1.0, 0.9, 2.9, 11.3, 12.7, 10.3, 9.7, 10.9, 6.0, 0.2 | 0.00 / 0.00 |
