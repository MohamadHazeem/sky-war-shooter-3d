# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset ultra.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.659 | 0.244 | 20.93 | 0.006390 | 0.081 | 9.91 / 9.90 / 11.30 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.297 | 0.335 | 10.96 | 0.011103 | 0.150 | 11.08 / 11.10 / 12.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.642 | 0.155 | 37.44 | 0.005884 | 0.110 | 8.34 / 8.50 / 10.40 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.557 | 0.221 | 15.22 | 0.006095 | 0.059 | 8.80 / 8.60 / 10.10 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.648 | 0.150 | 10.00 | 0.005275 | 0.166 | 8.75 / 8.70 / 10.20 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.721 | 0.109 | 23.09 | 0.003540 | 0.172 | 9.82 / 10.10 / 11.40 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.039 | 9.08 | 0.001988 | 0.284 | 3.78 / 3.40 / 7.10 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.599 | 0.121 | 29.68 | 0.003429 | 0.219 | 9.85 / 9.60 / 11.70 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.608 | 0.232 | 6.36 | 0.005621 | 0.059 | 9.16 / 9.20 / 11.10 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.088 | 0.045 | 13.63 | 0.002758 | 0.037 | 4.54 / 4.50 / 5.20 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.683 | 0.121 | 44.04 | 0.004091 | 0.218 | 6.45 / 6.40 / 7.90 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.711 | 0.126 | 23.07 | 0.004387 | 0.111 | 9.62 / 9.40 / 11.80 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.646 | 0.153 | 18.02 | 0.002552 | 0.160 | 8.38 / 8.30 / 10.20 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.222 | 0.127 | 18.00 | 0.005042 | 0.071 | 10.32 / 10.40 / 11.00 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.621 | 0.157 | 17.42 | 0.003187 | 0.193 | 8.90 / 9.00 / 10.40 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.520 | 0.306 | 32.52 | 0.008675 | 0.108 | 6.73 / 6.30 / 8.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.0, 6.7, 2.1, 3.2, 1.3, 1.3, 1.2, 0.6, 0.5, 3.1, 7.8, 21.5, 25.8, 15.1, 7.7, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.3, 52.8, 8.2, 3.7, 2.1, 3.1, 2.2, 0.1, 0.1, 0.1, 0.0, 0.1, 0.3, 3.6, 14.4, 3.9 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.6, 1.9, 0.6, 0.2, 0.2, 1.4, 1.3, 6.6, 13.6, 14.0, 14.9, 18.9, 16.9, 7.6, 1.3, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.3, 0.1, 0.0, 0.2, 2.6, 14.1, 21.8, 20.3, 9.7, 10.4, 4.5, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.0, 0.0, 0.1, 0.7, 2.8, 6.2, 9.7, 11.8, 11.5, 9.4, 19.9, 14.2, 8.7, 4.1, 0.8 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 1.4, 2.5, 4.5, 8.5, 15.3, 20.6, 25.6, 18.0, 2.9, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.0, 10.4, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.1, 0.2, 2.1, 3.7, 5.8, 7.3, 14.4, 18.5, 21.6, 19.7, 5.7, 1.0, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 10.2, 3.0, 2.3, 0.9, 0.2, 0.1, 0.0, 0.1, 3.8, 19.7, 37.5, 18.8, 1.8, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.5, 57.6, 11.7, 2.7, 0.2, 0.1, 0.1, 0.0, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.1, 0.8, 1.5, 2.2, 3.0, 5.8, 14.5, 17.3, 21.9, 21.5, 9.6, 1.5, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.6, 0.6, 0.3, 0.6, 1.4, 2.5, 4.5, 8.5, 15.2, 20.5, 25.1, 17.1, 2.8, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.1, 1.2, 3.0, 7.7, 10.7, 9.6, 7.4, 10.6, 18.5, 18.5, 11.0, 1.7, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 16.0, 29.1, 28.4, 13.4, 6.4, 2.6, 0.8, 0.3, 0.2, 0.2, 0.3, 1.1, 1.1, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 0.3, 2.8, 9.6, 14.9, 14.3, 11.0, 8.6, 9.0, 13.2, 15.5, 0.7, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.3, 19.9, 4.7, 2.2, 1.4, 1.3, 1.0, 1.2, 2.9, 10.5, 9.9, 8.5, 13.2, 13.0, 5.7, 0.1 | 0.00 / 0.00 |
