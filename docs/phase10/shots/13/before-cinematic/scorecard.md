# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset cinematic.
Browser: 153.0.8010.12. Source revision: `40569f3af8606eed68dedb11fd1cec5c6f662ca6` (dirty at capture: false).
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
| [waist-fw190](waist-fw190.jpg) | PNG 1920×1080 | 0.351 | 0.297 | 16.28 | 0.003123 | 0.059 | 16.53 / 16.10 / 18.90 |
| [tail-bf109](tail-bf109.jpg) | PNG 1920×1080 | 0.184 | 0.036 | 15.41 | 0.002129 | 0.000 | 16.15 / 16.00 / 17.50 |
| [top-formation](top-formation.jpg) | PNG 1920×1080 | 0.623 | 0.176 | 49.02 | 0.005711 | 0.096 | 14.68 / 14.60 / 16.80 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.523 | 0.208 | 15.38 | 0.005769 | 0.062 | 16.40 / 16.40 / 19.40 |
| [b17-beauty](b17-beauty.jpg) | PNG 1920×1080 | 0.606 | 0.208 | 14.42 | 0.006361 | 0.120 | 15.22 / 14.90 / 18.90 |
| [formation-chase](formation-chase.jpg) | PNG 1920×1080 | 0.688 | 0.167 | 24.05 | 0.003750 | 0.118 | 16.92 / 16.70 / 19.70 |
| [cloud-flythrough](cloud-flythrough.jpg) | PNG 1920×1080 | 0.649 | 0.047 | 9.77 | 0.001883 | 0.203 | 14.68 / 14.70 / 17.90 |
| [sunset](sunset.jpg) | PNG 1920×1080 | 0.586 | 0.177 | 32.15 | 0.003485 | 0.159 | 18.60 / 18.10 / 21.90 |
| [overcast-rain](overcast-rain.jpg) | PNG 1920×1080 | 0.278 | 0.259 | 6.81 | 0.002978 | 0.030 | 14.83 / 14.60 / 17.00 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.092 | 0.048 | 13.85 | 0.002757 | 0.031 | 12.26 / 12.10 / 14.10 |
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.655 | 0.158 | 46.34 | 0.003216 | 0.171 | 12.42 / 12.30 / 14.30 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.680 | 0.174 | 24.03 | 0.003965 | 0.075 | 17.10 / 16.90 / 18.60 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.622 | 0.198 | 19.88 | 0.002693 | 0.124 | 12.95 / 12.80 / 14.10 |
| [waist-interior](waist-interior.jpg) | PNG 1920×1080 | 0.154 | 0.085 | 9.14 | 0.002869 | 0.059 | 17.14 / 16.50 / 21.70 |
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.622 | 0.147 | 17.86 | 0.003326 | 0.163 | 14.88 / 14.60 / 18.60 |
| [p51-cockpit](p51-cockpit.jpg) | PNG 1920×1080 | 0.511 | 0.302 | 32.26 | 0.007451 | 0.097 | 14.74 / 14.30 / 18.40 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [waist-fw190](waist-fw190.jpg) | 1.6, 12.5, 39.2, 13.6, 1.9, 0.8, 0.5, 0.2, 0.1, 0.2, 2.9, 4.7, 8.3, 8.3, 5.2, 0.1 | 0.00 / 0.00 |
| [tail-bf109](tail-bf109.jpg) | 0.0, 14.0, 18.7, 67.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [top-formation](top-formation.jpg) | 0.5, 1.9, 0.7, 0.5, 0.4, 1.8, 5.3, 13.0, 12.8, 12.5, 10.4, 12.0, 13.4, 10.7, 4.1, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.3, 1.9, 1.2, 0.1, 0.1, 1.4, 9.5, 19.9, 21.1, 12.9, 10.4, 8.2, 0.2, 0.1, 0.0 | 0.00 / 0.00 |
| [b17-beauty](b17-beauty.jpg) | 0.0, 1.9, 1.7, 0.6, 2.1, 7.3, 12.5, 9.1, 7.1, 8.1, 7.9, 8.4, 11.9, 13.8, 6.3, 1.2 | 0.00 / 0.00 |
| [formation-chase](formation-chase.jpg) | 0.0, 0.0, 0.0, 2.1, 3.1, 3.7, 2.2, 2.7, 3.0, 8.3, 14.1, 16.7, 19.9, 17.9, 6.2, 0.0 | 0.00 / 0.00 |
| [cloud-flythrough](cloud-flythrough.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 4.1, 21.7, 59.3, 12.4, 2.3, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [sunset](sunset.jpg) | 0.0, 0.1, 2.1, 4.6, 5.3, 3.9, 4.9, 6.2, 7.9, 14.7, 13.9, 18.8, 14.8, 2.9, 0.0, 0.0 | 0.00 / 0.00 |
| [overcast-rain](overcast-rain.jpg) | 1.4, 55.9, 11.6, 1.1, 0.4, 0.1, 0.0, 0.0, 1.0, 7.0, 7.0, 12.2, 2.2, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 25.4, 56.8, 14.0, 3.0, 0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.4, 2.4, 4.5, 3.8, 3.8, 12.1, 13.2, 12.6, 13.7, 15.5, 14.2, 3.7, 0.2 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 2.6, 3.3, 3.8, 2.3, 2.8, 3.0, 8.4, 14.2, 16.5, 19.7, 17.1, 5.8, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.6, 6.3, 7.5, 11.2, 7.8, 6.6, 6.3, 6.4, 8.4, 17.4, 15.8, 5.4, 0.1 | 0.00 / 0.00 |
| [waist-interior](waist-interior.jpg) | 0.1, 57.2, 17.1, 12.0, 7.6, 3.7, 1.4, 0.4, 0.1, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0 | 0.00 / 0.00 |
| [bomb-run](bomb-run.jpg) | 0.0, 0.0, 0.1, 0.1, 0.2, 2.2, 7.2, 13.9, 17.3, 12.8, 9.6, 9.3, 14.9, 11.0, 1.3, 0.0 | 0.00 / 0.00 |
| [p51-cockpit](p51-cockpit.jpg) | 4.4, 20.0, 4.7, 2.3, 1.6, 1.2, 0.9, 0.9, 3.0, 11.7, 12.8, 9.6, 9.6, 10.9, 6.1, 0.2 | 0.00 / 0.00 |
