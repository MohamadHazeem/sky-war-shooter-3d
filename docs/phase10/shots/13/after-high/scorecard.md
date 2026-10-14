# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.653 | 0.246 | 29.76 | 0.009385 | 0.094 | 14.11 / 13.80 / 18.10 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.291 | 0.331 | 12.52 | 0.012095 | 0.130 | 17.77 / 17.50 / 22.30 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.619 | 0.168 | 49.05 | 0.006811 | 0.089 | 13.68 / 13.90 / 17.30 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.479 | 0.186 | 17.31 | 0.007633 | 0.084 | 14.33 / 13.80 / 17.30 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.614 | 0.218 | 15.09 | 0.007022 | 0.109 | 15.39 / 15.20 / 18.50 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.711 | 0.112 | 23.16 | 0.004135 | 0.156 | 17.17 / 17.00 / 20.40 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.646 | 0.038 | 8.84 | 0.001238 | 0.187 | 11.05 / 10.80 / 14.50 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.594 | 0.124 | 29.93 | 0.003798 | 0.185 | 16.99 / 16.90 / 20.10 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.601 | 0.231 | 6.89 | 0.006740 | 0.079 | 13.53 / 13.20 / 17.70 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.092 | 0.045 | 13.77 | 0.002673 | 0.027 | 11.34 / 10.80 / 14.50 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.653 | 0.141 | 49.79 | 0.003835 | 0.213 | 12.39 / 12.10 / 16.40 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.703 | 0.125 | 23.17 | 0.004779 | 0.106 | 19.70 / 20.00 / 24.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.620 | 0.205 | 20.16 | 0.002739 | 0.112 | 14.90 / 14.90 / 17.70 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.226 | 0.128 | 18.35 | 0.006873 | 0.077 | 19.57 / 19.90 / 23.30 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.611 | 0.168 | 17.96 | 0.003376 | 0.149 | 17.01 / 17.40 / 19.60 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.510 | 0.298 | 32.54 | 0.008748 | 0.105 | 13.19 / 12.90 / 17.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 2.0, 6.9, 2.3, 3.3, 1.4, 0.9, 1.3, 0.5, 0.5, 3.6, 11.8, 19.2, 24.3, 13.6, 8.1, 0.3 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 5.2, 52.9, 8.4, 4.8, 2.9, 3.0, 0.4, 0.1, 0.1, 0.0, 0.0, 0.1, 0.8, 5.6, 12.2, 3.6 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.4, 0.3, 1.7, 3.6, 13.8, 13.7, 13.1, 10.9, 13.7, 14.4, 8.3, 2.7, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.7, 9.2, 1.9, 1.3, 0.2, 0.5, 4.5, 20.2, 21.8, 18.6, 12.3, 5.4, 0.1, 0.0, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.1, 2.1, 1.7, 0.9, 4.1, 10.2, 8.1, 5.8, 5.7, 6.6, 6.9, 9.4, 18.1, 13.1, 6.2, 1.1 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.1, 0.0, 0.7, 0.7, 0.9, 2.3, 4.0, 11.0, 17.0, 21.0, 25.1, 14.6, 2.6, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 3.6, 20.9, 65.3, 10.1, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 0.1, 1.3, 1.4, 2.7, 5.7, 9.9, 14.3, 18.6, 21.0, 17.9, 5.8, 1.2, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.5, 10.1, 2.9, 2.4, 1.0, 0.2, 0.1, 0.1, 0.3, 6.2, 26.4, 27.6, 18.7, 2.5, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 23.5, 59.0, 13.8, 3.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.1, 1.3, 3.3, 3.6, 4.8, 13.1, 14.9, 14.0, 14.6, 18.6, 9.4, 2.1, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 0.6, 1.0, 0.7, 0.9, 2.3, 4.0, 11.0, 17.0, 20.9, 24.8, 13.8, 2.5, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 3.7, 6.8, 8.6, 8.4, 3.9, 4.3, 5.2, 7.6, 14.1, 19.9, 12.6, 4.6, 0.2 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 14.8, 28.7, 28.5, 14.1, 6.8, 2.7, 0.8, 0.2, 0.2, 0.3, 0.5, 1.3, 1.0, 0.1, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 2.5, 3.2, 10.8, 15.0, 12.7, 10.3, 7.5, 9.2, 12.5, 13.9, 2.0, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.2, 19.9, 4.7, 2.3, 1.3, 1.3, 1.0, 1.2, 3.4, 12.2, 11.2, 10.0, 11.8, 11.1, 4.2, 0.1 | 0.00 / 0.00 |
