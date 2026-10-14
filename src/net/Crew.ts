import { STATION_ORDER, type StationId } from '../world/B17Layout';
import { CODE_ALPHABET } from './Signal';

export interface CrewSeat { id: number; name: string; seat: StationId; ready: boolean }
export function freeSeat(crew: readonly CrewSeat[], preferred?: StationId): StationId | null {
  if (preferred && STATION_ORDER.includes(preferred) && !crew.some(p => p.seat === preferred)) return preferred;
  return STATION_ORDER.find(s => !crew.some(p => p.seat === s)) ?? null;
}
export function canTakeSeat(crew: readonly CrewSeat[], id: number, seat: unknown): seat is StationId {
  return STATION_ORDER.includes(seat as StationId) && !crew.some(p => p.id !== id && p.seat === seat);
}
// Three independent, existing-rule-compatible signalling documents; only the base code is
// shown to players. Keeping them until room closure enables late join and slot replacement.
export function crewCode(base: string, slot: number): string {
  return base.slice(0, 5) + CODE_ALPHABET[(CODE_ALPHABET.indexOf(base[5]) + slot) % CODE_ALPHABET.length];
}
export const SNAP_BYTES_PER_SECOND = 27000; // leaves headroom for reliable events/heartbeats
export const snapshotInterval = (bytes: number) => Math.max(1 / 20, bytes / SNAP_BYTES_PER_SECOND);
export interface CrewPing { t: 'mark'; run: number; target: number; clock: number; level: number; from: number }
export function validCrewPing(p: any): p is CrewPing {
  return Number.isInteger(p?.from) && p.from >= 0 && p.from <= 3 && p?.t === 'mark' && Number.isSafeInteger(p.run) && p.run > 0 && Number.isSafeInteger(p.target) && p.target >= -1 &&
    Number.isInteger(p.clock) && p.clock >= 1 && p.clock <= 12 && Number.isInteger(p.level) && p.level >= -1 && p.level <= 1;
}
export function clockCall(p: Pick<CrewPing, 'clock' | 'level'>) {
  return `${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][p.clock]} o'clock ${p.level > 0 ? 'high' : p.level < 0 ? 'low' : 'level'}!`;
}
