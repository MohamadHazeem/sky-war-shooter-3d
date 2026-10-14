// Continuous hydraulic motor: prebuilt with the audio graph, follows actual traverse
// speed, falls silent when parked / changing stations. Uses the ambience volume bus.
export class TurretDrive {
  private motor: OscillatorNode;
  private sample: AudioBufferSourceNode | null = null;
  private gain: GainNode;
  constructor(private ctx: AudioContext, bus: AudioNode) {
    this.motor = ctx.createOscillator(); this.motor.type = 'triangle';
    this.motor.frequency.value = 115;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.motor.connect(this.gain).connect(bus); this.motor.start();
  }
  setBuffer(buf: AudioBuffer | null) {
    if (!buf || this.sample?.buffer === buf) return;
    if (this.sample) { this.sample.stop(); this.sample.disconnect(); }
    this.motor.disconnect();
    this.sample = this.ctx.createBufferSource(); this.sample.buffer = buf; this.sample.loop = true;
    this.sample.connect(this.gain); this.sample.start();
  }
  update(speed: number) {
    const k = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed) / 0.65) : 0;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setTargetAtTime(k * (this.sample ? .32 : .022), this.ctx.currentTime, 0.06);
    this.sample?.playbackRate.setTargetAtTime(.8 + .4 * k, this.ctx.currentTime, .08);
    // A photo/kill camera can stop controller updates; fade without needing another hook.
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime + 0.15, 0.06);
    this.motor.frequency.setTargetAtTime(115 + k * 65, this.ctx.currentTime, 0.08);
  }
  dispose() { this.sample?.stop(); this.sample?.disconnect(); this.motor.stop(); this.motor.disconnect(); this.gain.disconnect(); }
}
