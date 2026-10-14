# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.647 | 0.242 | 31.23 | 0.009679 | 0.107 | 8.68 / 8.60 / 10.80 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.294 | 0.331 | 12.75 | 0.012347 | 0.141 | 10.26 / 10.10 / 11.50 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.622 | 0.167 | 49.03 | 0.006773 | 0.109 | 7.25 / 7.30 / 10.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.526 | 0.207 | 16.19 | 0.008002 | 0.075 | 9.00 / 8.90 / 10.60 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.621 | 0.212 | 12.92 | 0.006960 | 0.121 | 9.43 / 9.30 / 10.80 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.710 | 0.117 | 23.28 | 0.004117 | 0.158 | 8.99 / 8.70 / 12.30 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.81 | 0.001220 | 0.168 | 3.42 / 3.00 / 6.80 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.593 | 0.130 | 30.29 | 0.003775 | 0.194 | 9.91 / 9.80 / 12.10 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.600 | 0.230 | 6.82 | 0.006733 | 0.078 | 8.72 / 8.80 / 10.90 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.087 | 0.043 | 13.62 | 0.002662 | 0.034 | 3.71 / 3.70 / 4.60 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.655 | 0.136 | 52.08 | 0.004098 | 0.214 | 7.31 / 7.10 / 10.10 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.700 | 0.133 | 23.27 | 0.004880 | 0.102 | 8.92 / 8.70 / 11.50 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.634 | 0.178 | 19.38 | 0.002667 | 0.129 | 8.31 / 8.60 / 10.30 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.224 | 0.126 | 18.37 | 0.006693 | 0.075 | 10.02 / 9.70 / 11.30 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.608 | 0.164 | 17.63 | 0.003268 | 0.153 | 7.57 / 7.30 / 9.40 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.63 | 0.008960 | 0.104 | 5.59 / 4.90 / 8.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.9, 6.7, 2.3, 3.2, 1.4, 1.2, 1.3, 0.5, 0.8, 4.6, 12.8, 21.1, 21.5, 12.1, 8.3, 0.2 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 51.9, 8.5, 4.8, 3.1, 3.6, 0.4, 0.1, 0.0, 0.0, 0.0, 0.0, 0.7, 5.4, 12.7, 3.5 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.4, 1.2, 2.8, 14.0, 13.8, 13.5, 11.4, 13.7, 14.4, 8.4, 2.8, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 2.0, 1.4, 0.1, 0.2, 0.7, 8.8, 16.5, 21.2, 17.4, 15.6, 3.1, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.0, 1.6, 0.7, 3.1, 9.4, 9.3, 5.2, 4.0, 6.3, 8.4, 12.5, 18.9, 12.2, 5.1, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 1.0, 0.9, 2.1, 2.3, 2.5, 9.5, 17.3, 21.3, 25.4, 15.0, 2.5, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.8, 65.3, 10.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.6, 2.8, 3.9, 4.0, 7.3, 14.2, 19.2, 21.9, 18.0, 5.7, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.3, 10.1, 3.0, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.5, 25.6, 30.0, 17.1, 2.4, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 27.6, 57.7, 11.7, 2.6, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.1, 0.8, 2.2, 4.3, 4.8, 12.9, 14.7, 15.1, 15.3, 18.6, 8.7, 2.1, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.6, 0.7, 1.2, 1.0, 2.2, 2.4, 2.5, 9.5, 17.2, 21.1, 24.8, 14.3, 2.4, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.3, 5.4, 5.1, 7.3, 10.6, 5.1, 6.8, 8.6, 16.6, 18.7, 11.7, 3.3, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 15.4, 28.6, 28.8, 13.7, 6.6, 2.7, 0.9, 0.3, 0.2, 0.2, 0.3, 1.2, 0.9, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.5, 3.4, 12.3, 15.7, 12.0, 9.6, 8.0, 9.9, 12.3, 13.9, 1.1, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.8, 4.8, 2.2, 1.3, 1.4, 1.0, 1.2, 3.4, 12.2, 11.3, 10.2, 11.7, 11.0, 4.2, 0.1 | 0.00 / 0.00 |
