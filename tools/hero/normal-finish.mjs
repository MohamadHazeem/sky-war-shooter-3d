import sharp from 'sharp';

// Offline compensation for the loss of tiny fastener/lap slopes in the shipped
// atlas and its mip chain. Keep the broad airfoil normal and renormalize every
// texel; steep geometry/UV borders are excluded to avoid hard-edge halos.
export async function finishNormalPng(source, size, gain = 3) {
  const input = await sharp(source).resize(size, size).removeAlpha().png().toBuffer();
  const [fine, smooth] = await Promise.all([
    sharp(input).raw().toBuffer(),
    sharp(input).blur(1.6).raw().toBuffer(),
  ]);
  const output = Buffer.alloc(fine.length);
  for (let i = 0; i < fine.length; i += 3) {
    let x = fine[i] / 127.5 - 1, y = fine[i + 1] / 127.5 - 1;
    const z = fine[i + 2] / 127.5 - 1;
    const weight = Math.max(0, Math.min(1, (Math.min(z, smooth[i + 2] / 127.5 - 1) - .8) / .15));
    x += weight * Math.max(-.22, Math.min(.22, (fine[i] - smooth[i]) / 127.5 * gain));
    y += weight * Math.max(-.22, Math.min(.22, (fine[i + 1] - smooth[i + 1]) / 127.5 * gain));
    const length = Math.hypot(x, y, z) || 1;
    output[i] = Math.round((x / length * .5 + .5) * 255);
    output[i + 1] = Math.round((y / length * .5 + .5) * 255);
    output[i + 2] = Math.round((z / length * .5 + .5) * 255);
  }
  return sharp(output, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}
