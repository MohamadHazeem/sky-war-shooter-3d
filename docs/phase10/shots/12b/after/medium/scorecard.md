# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset medium.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.686 | 0.233 | 22.38 | 0.002308 | 0.030 | 7.06 / 6.50 / 10.50 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.302 | 0.309 | 11.06 | 0.002873 | 0.030 | 7.11 / 7.00 / 8.20 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.684 | 0.150 | 37.07 | 0.001628 | 0.057 | 7.63 / 7.50 / 9.70 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.470 | 0.176 | 13.45 | 0.001631 | 0.019 | 7.13 / 7.00 / 9.90 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.608 | 0.199 | 9.94 | 0.001848 | 0.054 | 7.10 / 6.60 / 9.50 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.743 | 0.119 | 16.67 | 0.000671 | 0.081 | 5.97 / 5.90 / 8.70 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.726 | 0.038 | 4.26 | 0.000348 | 0.000 | 2.64 / 2.40 / 4.60 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.607 | 0.144 | 25.03 | 0.000673 | 0.091 | 6.24 / 5.90 / 10.10 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.596 | 0.221 | 5.99 | 0.001866 | 0.012 | 7.59 / 7.20 / 11.70 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.090 | 0.037 | 11.87 | 0.000785 | 0.095 | 2.33 / 2.30 / 2.90 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.715 | 0.120 | 42.16 | 0.001705 | 0.119 | 7.55 / 7.80 / 8.70 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.734 | 0.131 | 16.65 | 0.000976 | 0.037 | 7.23 / 6.90 / 10.50 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.670 | 0.156 | 16.52 | 0.000685 | 0.063 | 5.88 / 5.70 / 7.00 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.249 | 0.120 | 18.76 | 0.002336 | 0.030 | 8.78 / 8.90 / 10.40 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.617 | 0.150 | 16.44 | 0.000797 | 0.087 | 8.68 / 9.50 / 11.10 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.482 | 0.267 | 29.27 | 0.002725 | 0.045 | 3.69 / 3.20 / 4.90 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 0.2, 5.7, 3.0, 1.3, 3.0, 1.0, 1.2, 1.4, 1.3, 1.9, 7.1, 17.4, 24.6, 18.2, 11.9, 0.7 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.3, 51.0, 8.9, 6.5, 7.1, 2.9, 0.7, 0.2, 0.1, 0.2, 0.2, 0.4, 3.2, 8.4, 9.4, 0.6 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.0, 1.8, 0.6, 0.5, 0.3, 0.5, 0.3, 2.1, 9.1, 15.4, 16.5, 16.3, 17.5, 14.0, 5.0, 0.1 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 0.7, 11.2, 1.8, 2.1, 0.5, 0.6, 4.2, 26.9, 23.8, 12.9, 10.1, 5.1, 0.0, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 0.8, 2.2, 0.7, 0.8, 5.6, 17.0, 10.8, 4.8, 5.8, 7.6, 11.0, 15.6, 11.4, 4.8, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 2.7, 2.2, 4.8, 6.0, 8.0, 18.7, 25.0, 23.9, 8.5, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.6, 14.1, 53.8, 30.5, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.0, 0.0, 0.7, 3.3, 5.2, 6.8, 7.2, 8.4, 14.2, 19.5, 20.1, 11.8, 2.7, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 0.4, 10.0, 3.2, 2.3, 1.5, 0.6, 0.2, 0.1, 0.6, 9.0, 26.5, 30.1, 14.1, 1.5, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 19.9, 64.6, 12.6, 2.7, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 1.8, 3.7, 6.7, 8.6, 16.8, 19.0, 18.5, 18.8, 5.4, 0.4 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.0, 0.1, 0.4, 0.5, 0.6, 2.9, 2.2, 4.9, 6.0, 8.0, 18.7, 24.7, 23.1, 8.0, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.0, 0.1, 1.0, 5.4, 11.6, 14.7, 8.9, 7.2, 10.1, 17.8, 15.8, 7.2, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.0, 7.7, 24.4, 28.1, 19.3, 10.6, 4.6, 1.8, 0.6, 0.4, 0.3, 0.5, 1.1, 0.4, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.1, 0.4, 3.8, 4.7, 17.5, 17.5, 9.9, 9.6, 11.1, 12.0, 12.6, 0.8, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 0.5, 21.0, 5.4, 3.0, 1.2, 1.2, 3.1, 4.2, 9.8, 13.6, 10.4, 9.3, 10.2, 5.8, 1.3, 0.0 | 0.00 / 0.00 |
