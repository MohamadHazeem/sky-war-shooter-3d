// Minimal (Big)TIFF reader for the WorldCover COG overviews (tools/terrain/fetch_raw.mjs, build_terrain.mjs)
// IFDs: sizes, tile size, tile offsets/counts
export function readIfds(b) {
  const le = b[0] === 0x49, big = (le ? b.readUInt16LE(2) : b.readUInt16BE(2)) === 43;
  const u16 = (o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
  const u32 = (o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  const u64 = (o) => Number(le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o));
  const SZ = { 1: 1, 3: 2, 4: 4, 16: 8 };
  const out = [];
  let off = big ? u64(8) : u32(4);
  while (off && off < b.length) {
    const count = big ? u64(off) : u16(off);
    const tags = {};
    for (let i = 0; i < count; i++) {
      const e = off + (big ? 8 : 2) + i * (big ? 20 : 12);
      const tag = u16(e), type = u16(e + 2), cnt = big ? u64(e + 4) : u32(e + 4);
      const size = (SZ[type] ?? 1) * cnt, inline = size <= (big ? 8 : 4);
      const vo = inline ? e + (big ? 12 : 8) : (big ? u64(e + 12) : u32(e + 8));
      const read = (k) => type === 3 ? u16(vo + k * 2) : type === 4 ? u32(vo + k * 4) : type === 16 ? u64(vo + k * 8) : b[vo + k];
      tags[tag] = vo + size <= b.length ? Array.from({ length: cnt }, (_, k) => read(k)) : null;
    }
    out.push({ width: tags[256][0], height: tags[257][0], tile: tags[322]?.[0], offsets: tags[324], counts: tags[325], compression: tags[259][0], predictor: tags[317]?.[0] ?? 1 });
    const next = off + (big ? 8 : 2) + count * (big ? 20 : 12);
    off = big ? u64(next) : u32(next);
  }
  return out;
}
