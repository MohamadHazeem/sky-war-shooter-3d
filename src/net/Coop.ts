// Online co-op transport: one WebRTC peer connection with two data channels.
//   'state'  unordered, no retransmits: snapshots (host -> guest) and gun input (guest -> host),
//            where only the newest message matters and a late one is worse than a lost one;
//   'events' ordered and reliable: lobby, start, kills, hits, pings, goodbye.
// Optional TURN credentials are fetched before connecting; unavailable relay falls back to STUN.
// Signalling (offer/answer/ICE) lives in Signal.ts.

import * as THREE from 'three';

import { ICE_SERVERS } from './Ice';
export { ICE_SERVERS } from './Ice';

export type LinkStatus = 'connecting' | 'open' | 'closed';

const PING_EVERY_MS = 1000;
const TIMEOUT_MS = 10000;          // nothing heard for this long: the partner is gone
const DISCONNECT_GRACE_MS = 6000;  // ICE 'disconnected' often recovers by itself
const MAX_BUFFERED = 256 * 1024;   // skip unreliable sends while the channel is backed up

export class CoopLink {
  readonly pc: RTCPeerConnection;
  status: LinkStatus = 'connecting';
  rtt = -1;                 // ms, smoothed; -1 until the first pong
  onOpen?: () => void;
  onClose?: (reason: 'left' | 'lost' | 'local') => void;
  onState?: (m: any) => void;
  onEvent?: (m: any) => void;
  pingInfo?: () => unknown;          // piggybacked on every ping (host: its game state)
  onPingInfo?: (x: unknown) => void;
  private state: RTCDataChannel | null = null;
  private events: RTCDataChannel | null = null;
  private timer: ReturnType<typeof setInterval>;
  private lastRx = performance.now();
  private lostAt = 0;

  constructor(readonly role: 'host' | 'guest', iceServers = ICE_SERVERS) {
    this.pc = new RTCPeerConnection({ iceServers });
    if (role === 'host') {
      this.wire(this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
      this.wire(this.pc.createDataChannel('events', { ordered: true }));
    } else {
      this.pc.ondatachannel = (e) => this.wire(e.channel);
    }
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.close('lost', false);
      else if (s === 'disconnected') this.lostAt ||= performance.now();
      else if (s === 'connected') this.lostAt = 0;
    };
    this.timer = setInterval(() => this.tick(), PING_EVERY_MS);
  }

  private wire(ch: RTCDataChannel) {
    if (ch.label === 'state') this.state = ch; else if (ch.label === 'events') this.events = ch; else return;
    const opened = () => {
      if (this.status === 'connecting' && this.state?.readyState === 'open' && this.events?.readyState === 'open') {
        this.status = 'open';
        this.lastRx = performance.now();
        this.onOpen?.();
      }
    };
    ch.onopen = opened;
    if (ch.readyState === 'open') queueMicrotask(opened);
    ch.onclose = () => { if (this.status === 'open') this.close('lost', false); };
    ch.onmessage = (e) => {
      this.lastRx = performance.now();
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'ping') { this.sendEvent({ t: 'pong', s: m.s }); if (m.x !== undefined) this.onPingInfo?.(m.x); return; }
      if (m.t === 'pong') {
        const r = performance.now() - Number(m.s);
        if (r >= 0 && r < 60000) this.rtt = this.rtt < 0 ? r : this.rtt * 0.7 + r * 0.3;
        return;
      }
      if (m.t === 'bye') { this.close('left', false); return; }
      if (ch === this.state) this.onState?.(m); else this.onEvent?.(m);
    };
  }

  private tick() {
    if (this.status !== 'open') return;
    const now = performance.now();
    this.sendEvent({ t: 'ping', s: now, x: this.pingInfo?.() });
    if (now - this.lastRx > TIMEOUT_MS || (this.lostAt && now - this.lostAt > DISCONNECT_GRACE_MS)) this.close('lost', false);
  }

  // unreliable: dropped while the channel is congested
  sendState(m: unknown) {
    const ch = this.state;
    if (this.status !== 'open' || !ch || ch.readyState !== 'open' || ch.bufferedAmount > MAX_BUFFERED) return false;
    try { ch.send(JSON.stringify(m)); return true; } catch { return false; }
  }

  sendEvent(m: unknown) {
    const ch = this.events;
    if (!ch || ch.readyState !== 'open') return false;
    try { ch.send(JSON.stringify(m)); return true; } catch { return false; }
  }

  // notify = tell the partner we are leaving on purpose
  close(reason: 'left' | 'lost' | 'local' = 'local', notify = true) {
    if (this.status === 'closed') return;
    if (notify) this.sendEvent({ t: 'bye' });
    this.status = 'closed';
    clearInterval(this.timer);
    // let the goodbye go out before the transport is torn down
    setTimeout(() => { try { this.pc.close(); } catch { /* already closed */ } }, notify ? 150 : 0);
    this.onClose?.(reason);
  }
}

// ---------------- snapshot timing (pure, unit-tested) ----------------

export const INTERP_DELAY = 0.1;    // s of host time the guest renders behind the newest snapshot

// one received transform of an aircraft: host time, absolute position, orientation, flags, structure
export interface Sample { t: number; p: THREE.Vector3; q: THREE.Quaternion; f: number; fr: number }

// Position/orientation of a track at time t: interpolated between the bracketing samples,
// briefly extrapolated (<= 0.2 s) past the newest one. Returns the velocity in `vel`.
export function sampleTrack(s: readonly Sample[], t: number, pos: THREE.Vector3, quat: THREE.Quaternion, vel: THREE.Vector3) {
  const n = s.length;
  if (!n) return;
  const last = s[n - 1];
  if (t >= last.t) {
    if (n > 1) {
      const prev = s[n - 2];
      vel.copy(last.p).sub(prev.p).divideScalar(Math.max(1e-3, last.t - prev.t));
    } else vel.set(0, 0, 0);
    pos.copy(last.p).addScaledVector(vel, Math.min(0.2, t - last.t));
    quat.copy(last.q);
    return;
  }
  let i = n - 1;
  while (i > 0 && s[i - 1].t > t) i--;
  if (i === 0) { pos.copy(s[0].p); quat.copy(s[0].q); if (n > 1) vel.copy(s[1].p).sub(s[0].p).divideScalar(Math.max(1e-3, s[1].t - s[0].t)); return; }
  const a = s[i - 1], b = s[i];
  const span = Math.max(1e-3, b.t - a.t);
  const k = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  pos.copy(a.p).lerp(b.p, k);
  quat.copy(a.q).slerp(b.q, k);
  vel.copy(b.p).sub(a.p).divideScalar(span);
}

// The guest's render clock: follows (newest snapshot time - delay), advancing with the local
// frame time and easing toward the target; jumps when it is far off (start, pause, slow-mo).
export function advanceClock(rt: number, latest: number, dt: number, delay = INTERP_DELAY): number {
  const target = latest - delay;
  if (rt < 0 || Math.abs(target - rt) > 0.75) return target;
  rt += dt;
  rt += (target - rt) * Math.min(1, dt * 3);
  return Math.min(rt, latest);
}

