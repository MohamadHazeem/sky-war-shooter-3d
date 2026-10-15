# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `a4ed5925169e2cb2741a76586310e0f9be3e2e11` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [explosion-close](explosion-close.jpg) | — | __/10 | — | — | __/10 | — | __/10 | — | __/10 | __/10 |
| [flak-barrage](flak-barrage.jpg) | — | — | __/10 | — | __/10 | — | — | __/10 | — | __/10 |
| [night-flak](night-flak.jpg) | — | __/10 | __/10 | — | __/10 | — | __/10 | __/10 | — | __/10 |
| [damaged-neighbour](damaged-neighbour.jpg) | __/10 | __/10 | — | — | __/10 | — | — | __/10 | __/10 | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.668 | 0.120 | 56.20 | 0.002053 | 0.093 | 7.90 / 8.10 / 9.20 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.699 | 0.133 | 23.24 | 0.004037 | 0.085 | 10.58 / 10.40 / 12.60 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.095 | 0.044 | 13.80 | 0.002725 | 0.035 | 4.45 / 4.50 / 6.10 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.641 | 0.179 | 22.22 | 0.002331 | 0.142 | 8.84 / 9.00 / 11.20 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.0, 0.0, 0.0, 0.7, 2.2, 4.7, 14.3, 15.5, 16.6, 15.8, 19.1, 8.9, 2.1, 0.1 | 0.00 / 0.01 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.1, 0.5, 0.7, 1.4, 1.0, 2.2, 2.4, 2.5, 9.6, 17.3, 21.3, 24.6, 13.9, 2.3, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 18.5, 63.9, 14.0, 3.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.0, 0.3, 6.1, 4.8, 6.9, 9.1, 4.7, 6.3, 8.8, 17.4, 19.2, 13.0, 3.4, 0.0 | 0.00 / 0.00 |
