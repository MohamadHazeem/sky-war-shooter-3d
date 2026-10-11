// Continuous hydraulic motor: prebuilt with the audio graph, follows actual traverse
// speed, falls silent when parked / changing stations. Uses the ambience volume bus.
export class TurretDrive {
  private motor: OscillatorNode;
  private gain: GainNode;
  constructor(private ctx: AudioContext, bus: AudioNode) {
    this.motor = ctx.createOscillator(); this.motor.type = 'triangle';
    this.motor.frequency.value = 115;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.motor.connect(this.gain).connect(bus); this.motor.start();
  }
  update(speed: number) {
    const k = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed) / 0.65) : 0;
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setTargetAtTime(k * 0.022, this.ctx.currentTime, 0.06);
    // A photo/kill camera can stop controller updates; fade without needing another hook.
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime + 0.15, 0.06);
    this.motor.frequency.setTargetAtTime(115 + k * 65, this.ctx.currentTime, 0.08);
  }
  dispose() { this.motor.stop(); this.motor.disconnect(); this.gain.disconnect(); }
}
