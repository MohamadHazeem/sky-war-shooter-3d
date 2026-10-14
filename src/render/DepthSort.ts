/** Stable descending depth order with bounded O(n log n) work. Scratch storage is
 * allocated once with the particle pool; equal depths retain their original order. */
export class DepthSort {
  private readonly order: Int32Array;
  private readonly keys: Float32Array;
  constructor(capacity: number) { this.order = new Int32Array(capacity); this.keys = new Float32Array(capacity); }
  sort(order: Int32Array, keys: Float32Array, n: number) {
    let srcO = order, srcK = keys, dstO = this.order, dstK = this.keys;
    for (let width = 1; width < n; width *= 2) {
      for (let start = 0; start < n; start += width * 2) {
        const mid = Math.min(start + width, n), end = Math.min(start + width * 2, n);
        let a = start, b = mid;
        for (let out = start; out < end; out++) {
          const i = a < mid && (b >= end || srcK[a] >= srcK[b]) ? a++ : b++;
          dstO[out] = srcO[i]; dstK[out] = srcK[i];
        }
      }
      const oldO = srcO, oldK = srcK; srcO = dstO; srcK = dstK; dstO = oldO; dstK = oldK;
    }
    if (srcO !== order) for (let i = 0; i < n; i++) { order[i] = srcO[i]; keys[i] = srcK[i]; }
  }
}
