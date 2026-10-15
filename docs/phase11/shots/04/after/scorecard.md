# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `c869b04d7ef7966749c92feed62f43d1f55a31b7` (dirty at capture: true).
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
| [explosion-close](explosion-close.jpg) | PNG 1920×1080 | 0.646 | 0.153 | 46.35 | 0.002317 | 0.055 | 6.85 / 6.90 / 9.30 |
| [flak-barrage](flak-barrage.jpg) | PNG 1920×1080 | 0.694 | 0.140 | 23.23 | 0.004496 | 0.078 | 12.28 / 12.50 / 15.50 |
| [night-flak](night-flak.jpg) | PNG 1920×1080 | 0.096 | 0.043 | 13.71 | 0.002627 | 0.030 | 6.10 / 6.30 / 8.50 |
| [damaged-neighbour](damaged-neighbour.jpg) | PNG 1920×1080 | 0.638 | 0.181 | 18.65 | 0.002255 | 0.130 | 8.32 / 8.20 / 11.10 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [explosion-close](explosion-close.jpg) | 0.0, 0.0, 0.1, 2.0, 2.5, 2.3, 3.1, 4.0, 12.7, 14.4, 14.5, 14.3, 18.7, 9.0, 2.3, 0.2 | 0.00 / 0.00 |
| [flak-barrage](flak-barrage.jpg) | 0.0, 0.3, 0.9, 0.9, 1.3, 1.0, 2.2, 2.4, 2.5, 9.5, 17.2, 21.3, 24.6, 13.6, 2.2, 0.0 | 0.00 / 0.00 |
| [night-flak](night-flak.jpg) | 17.2, 64.3, 14.8, 3.4, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0 | 0.00 / 0.00 |
| [damaged-neighbour](damaged-neighbour.jpg) | 0.0, 0.0, 0.1, 0.9, 5.5, 5.1, 6.2, 9.3, 5.1, 6.5, 8.7, 17.1, 19.3, 12.7, 3.3, 0.0 | 0.00 / 0.00 |
