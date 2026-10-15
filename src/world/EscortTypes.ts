import { P51_PARAMS, type FlightParams } from './FlightModel';

export type EscortKind = 'p51d' | 'p47d' | 'spitfire9';
export const ESCORT_KINDS: readonly EscortKind[] = ['p47d', 'spitfire9', 'p51d'];
/** Stable roster: no extra aircraft, random draws or per-frame allocations. */
export function escortKind(slot: number): EscortKind { return ESCORT_KINDS[Math.abs(Math.trunc(slot)) % ESCORT_KINDS.length]; }
export function isEscortKind(kind: string): kind is EscortKind { return kind === 'p51d' || kind === 'p47d' || kind === 'spitfire9'; }

interface EscortSpec { label: string; params: FlightParams; propRadius: number; muzzles: readonly (readonly [number, number, number])[]; }
export const ESCORT_TYPES: Record<EscortKind, EscortSpec> = {
  p51d: { label: 'P-51D', params: P51_PARAMS, propRadius: 1.7,
    muzzles: [[2.009, -.434, .6], [2.211, -.417, .55], [2.407, -.392, .55]] },
  p47d: { label: 'P-47D Thunderbolt', propRadius: 1.98,
    params: { ...P51_PARAMS, power: 530, dragK: 7.1e-5, inducedK: 5900, rollRate: 2.25, pitchRate: 1.05 },
    muzzles: [[2.72, -.34, 2.3], [2.89, -.34, 2.21], [3.06, -.34, 2.12], [3.22, -.34, 2.03]] },
  spitfire9: { label: 'Spitfire Mk IX', propRadius: 1.64,
    params: { ...P51_PARAMS, power: 460, dragK: 6.5e-5, inducedK: 3900, liftK: .014, rollRate: 2.5, pitchRate: 1.4 },
    muzzles: [[2.05, -.34, 1.65], [3.1, -.34, .4], [3.7, -.3, .2]] },
};
