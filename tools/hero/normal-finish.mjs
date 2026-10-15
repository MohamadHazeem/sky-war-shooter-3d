import sharp from 'sharp';

// Resize in linear tangent space and restore unit length. Export sharpening was
// removed: amplifying atlas/bake boundaries produced false ripples and dark roots.
export async function finishNormalPng(source, size) {
  const fine = await sharp(source).resize(size, size).removeAlpha().raw().toBuffer();
  const output = Buffer.alloc(fine.length);
  for (let i = 0; i < fine.length; i += 3) {
    const x = fine[i] / 127.5 - 1, y = fine[i + 1] / 127.5 - 1, z = fine[i + 2] / 127.5 - 1;
    const length = Math.hypot(x, y, z) || 1;
    output[i] = Math.round((x / length * .5 + .5) * 255);
    output[i + 1] = Math.round((y / length * .5 + .5) * 255);
    output[i + 2] = Math.round((z / length * .5 + .5) * 255);
  }
  return sharp(output, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}
