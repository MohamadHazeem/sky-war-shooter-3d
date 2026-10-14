/** Metrics on displayed sRGB bytes, not scene-linear HDR. No subjective score inference. */
export function imageMetrics(rgb, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || rgb.length !== width * height * 3) {
    throw new Error('Expected an RGB image at least 3 × 3');
  }
  const n = width * height, luma = new Float64Array(n), histogram = Array(16).fill(0);
  let sum = 0, sum2 = 0, rg = 0, rg2 = 0, yb = 0, yb2 = 0, black = 0, white = 0;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const y = (.2126 * r + .7152 * g + .0722 * b) / 255;
    luma[i] = y; sum += y; sum2 += y * y; histogram[Math.min(15, Math.floor(y * 16))]++;
    const a = r - g, c = (r + g) / 2 - b;
    rg += a; rg2 += a * a; yb += c; yb2 += c * c;
    if (r <= 2 && g <= 2 && b <= 2) black++;
    if (r >= 253 && g >= 253 && b >= 253) white++;
  }
  let lap = 0, lap2 = 0, edges = 0, alternating = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, a = luma[i];
    const dx0 = a - luma[i - 1], dx1 = luma[i + 1] - a;
    const dy0 = a - luma[i - width], dy1 = luma[i + width] - a;
    const v = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * a;
    lap += v; lap2 += v * v;
    if (Math.max(Math.abs(dx0), Math.abs(dx1), Math.abs(dy0), Math.abs(dy1)) > .08) {
      edges++;
      if ((dx0 * dx1 < 0 && Math.min(Math.abs(dx0), Math.abs(dx1)) > .08)
        || (dy0 * dy1 < 0 && Math.min(Math.abs(dy0), Math.abs(dy1)) > .08)) alternating++;
    }
  }
  const inner = (width - 2) * (height - 2);
  const variance = (s, sq, count) => Math.max(0, sq / count - (s / count) ** 2);
  return { luminanceMean: sum / n, histogram: histogram.map(v => v / n),
    contrastRms: Math.sqrt(variance(sum, sum2, n)),
    colourfulness: Math.sqrt(variance(rg, rg2, n) + variance(yb, yb2, n)) + .3 * Math.hypot(rg / n, yb / n),
    sharpness: variance(lap, lap2, inner), edgeAliasingEstimate: edges ? alternating / edges : 0,
    edgeDensity: edges / inner, blackFraction: black / n, whiteFraction: white / n };
}

export function parseArgs(argv, defaults, flags = []) {
  const out = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !(key in defaults)) throw new Error(`Unknown argument: ${argv[i]}`);
    if (flags.includes(key)) out[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
      out[key] = argv[++i];
    }
  }
  return out;
}
