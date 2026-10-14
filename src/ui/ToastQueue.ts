/** Paused notifications retain their remaining visible time. One shared lane, no stacking. */
export class ToastQueue<T> {
  private pending: T[] = [];
  current: T | null = null;
  remaining = 0;
  private gap = 0;
  constructor(readonly duration = 2.5) {}
  push(value: T) { this.pending.push(value); }
  get busy() { return this.current !== null || this.pending.length > 0; }
  update(dt: number, blocked: boolean): T | null {
    if (blocked) return null;
    if (this.current !== null) {
      this.remaining -= Math.max(0, dt);
      if (this.remaining <= 0) { this.current = null; this.gap = 0.15; }
    } else if ((this.gap -= Math.max(0, dt)) <= 0 && this.pending.length) {
      this.current = this.pending.shift()!; this.remaining = this.duration;
    }
    return this.current;
  }
}
