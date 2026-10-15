# Phase 10 visual scorecard

Capture rig v1; seed 19431008; requested webgl2; preset high.
Browser: 153.0.8010.12. Source revision: `72831a4eae16bfe51340a47c3fc1088d76862c7a` (dirty at capture: true).
[Contact sheet](contact-sheet.jpg) · [Capture metadata](manifest.json) · [Metric data](metrics.json)

Score relevant cells from 0–10 against [the reference board](../../../../phase10/reference.md). `__/10` is unscored; `—` is not a primary subject. Do not convert image metrics into artistic scores. Review each pillar across its relevant shots; the ten pillar judgments sum to /100.

| Shot | 1 Aircraft | 2 Lighting | 3 Clouds / sky | 4 Ground | 5 Effects | 6 Interior / crew | 7 Camera / post | 8 Scale | 9 Destruction | 10 Performance |
|---|---|---|---|---|---|---|---|---|---|---|
| [bomb-run](bomb-run.jpg) | — | — | — | __/10 | __/10 | — | __/10 | __/10 | — | __/10 |
| [ball-europe](ball-europe.jpg) | — | __/10 | — | __/10 | — | __/10 | __/10 | — | — | __/10 |

## Objective measurements

Luma is Rec.709-weighted displayed sRGB in [0,1]; histogram has 16 equally spaced bins, dark→light (percent). Contrast is luma standard deviation. Colourfulness uses opponent-channel deviation + 0.3 × mean magnitude (byte units). Sharpness is variance of the four-neighbour luma Laplacian. Aliasing is the fraction of strong edge pixels with opposing adjacent gradients >0.08: a spatial high-frequency proxy, also sensitive to texture, grain and sharp detail; it cannot measure temporal shimmer from a still.

Frame times are real wall-clock milliseconds for a frozen scene render plus a GPU completion fence, after 24 warmup renders. They exclude simulation and capture encoding, include synchronization overhead, and are not gameplay FPS. Compare only the same browser, GPU, preset, resolution and metric source. Low retains its native pixel budget; its PNG is resampled to 1920×1080 and native size is recorded.

| Shot | Source / pixels | Luma | RMS contrast | Colourfulness | Sharpness | Aliasing estimate | Render ms mean / p50 / p95 |
|---|---|---:|---:|---:|---:|---:|---|
| [bomb-run](bomb-run.jpg) | PNG 1920×1080 | 0.613 | 0.161 | 17.52 | 0.003263 | 0.162 | 8.38 / 8.00 / 11.10 |
| [ball-europe](ball-europe.jpg) | PNG 1920×1080 | 0.525 | 0.205 | 16.17 | 0.007859 | 0.072 | 10.09 / 10.10 / 13.00 |

| Shot | Luminance histogram (%) | Black / white clipped (%) |
|---|---|---|
| [bomb-run](bomb-run.jpg) | 0.0, 0.1, 0.1, 0.1, 1.1, 3.8, 9.1, 16.8, 13.3, 10.2, 8.4, 9.9, 12.1, 14.0, 1.2, 0.0 | 0.00 / 0.00 |
| [ball-europe](ball-europe.jpg) | 3.6, 9.2, 1.9, 1.5, 0.1, 0.2, 0.7, 8.6, 16.7, 21.8, 18.0, 15.5, 2.2, 0.0, 0.1, 0.1 | 0.00 / 0.00 |
