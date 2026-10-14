# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset cinematic.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.578 | 0.227 | 18.52 | 0.002338 | 0.036 | 10.39 / 10.10 / 11.70 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.276 | 0.328 | 9.18 | 0.004451 | 0.094 | 11.23 / 11.30 / 12.30 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.566 | 0.156 | 33.61 | 0.002065 | 0.093 | 9.23 / 9.00 / 10.80 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.487 | 0.192 | 13.15 | 0.001492 | 0.031 | 10.31 / 10.00 / 11.70 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.571 | 0.146 | 10.07 | 0.001957 | 0.101 | 9.20 / 9.10 / 10.30 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.635 | 0.124 | 20.15 | 0.001444 | 0.159 | 10.98 / 11.00 / 12.10 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.568 | 0.074 | 9.20 | 0.000556 | 0.217 | 4.27 / 3.90 / 7.40 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.528 | 0.128 | 28.09 | 0.001258 | 0.183 | 11.13 / 11.10 / 11.90 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.533 | 0.215 | 5.64 | 0.002105 | 0.018 | 9.69 / 9.30 / 11.40 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.077 | 0.040 | 12.35 | 0.000241 | 0.028 | 6.11 / 6.10 / 6.70 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.601 | 0.121 | 41.16 | 0.002109 | 0.183 | 8.56 / 8.60 / 10.90 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.625 | 0.134 | 20.14 | 0.001960 | 0.098 | 11.01 / 11.00 / 11.80 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.576 | 0.148 | 15.46 | 0.000901 | 0.112 | 9.25 / 9.20 / 10.50 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.194 | 0.111 | 15.60 | 0.001194 | 0.035 | 10.43 / 10.50 / 11.20 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.546 | 0.148 | 15.06 | 0.001035 | 0.130 | 9.55 / 9.50 / 10.60 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.448 | 0.269 | 27.95 | 0.003391 | 0.076 | 8.38 / 7.90 / 10.70 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.9, 6.5, 2.3, 3.3, 1.7, 1.0, 1.4, 3.8, 9.6, 14.5, 17.9, 14.0, 11.4, 7.2, 2.7, 0.0 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 11.9, 48.8, 7.8, 2.8, 5.0, 0.9, 0.2, 0.1, 0.1, 0.1, 0.2, 0.3, 1.8, 7.7, 11.0, 1.4 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 1.3, 1.1, 0.6, 0.3, 2.0, 3.2, 8.8, 13.9, 15.6, 16.0, 14.6, 11.6, 7.7, 3.0, 0.3, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 4.6, 8.7, 1.9, 0.9, 0.2, 1.5, 6.0, 13.5, 17.9, 21.1, 19.4, 4.2, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.0, 0.0, 0.2, 2.2, 7.9, 11.3, 12.2, 13.8, 14.8, 14.1, 12.9, 6.4, 2.3, 1.5, 0.5 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.1, 0.4, 1.1, 3.9, 8.6, 15.0, 19.5, 16.2, 14.1, 12.9, 7.3, 0.8, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 4.2, 15.9, 24.0, 28.4, 26.4, 0.6, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.1, 1.4, 3.6, 8.1, 12.0, 16.5, 17.0, 15.5, 13.5, 10.0, 2.2, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.1, 11.9, 3.3, 1.4, 0.4, 0.1, 1.2, 6.5, 13.7, 18.3, 19.2, 16.5, 5.9, 0.7, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 45.1, 45.1, 8.6, 0.8, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.1, 0.8, 2.6, 6.2, 10.9, 17.4, 18.5, 17.2, 15.4, 8.3, 2.1, 0.3, 0.1 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.6, 0.6, 0.7, 1.2, 3.9, 8.6, 15.0, 19.5, 16.2, 13.9, 12.0, 6.8, 0.8, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.3, 3.1, 7.6, 10.4, 11.2, 11.9, 14.0, 17.5, 10.5, 9.0, 4.1, 0.3, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 25.6, 35.5, 20.0, 9.0, 4.4, 1.7, 0.5, 0.2, 0.9, 1.2, 0.5, 0.1, 0.1, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.2, 0.6, 3.1, 10.0, 13.1, 14.0, 13.9, 13.4, 10.6, 9.6, 9.4, 1.9, 0.0, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.9, 20.7, 4.2, 2.2, 1.9, 1.6, 3.0, 7.0, 11.3, 13.8, 10.6, 6.1, 5.0, 5.8, 2.0, 0.0 | 0.00 / 0.00 |
