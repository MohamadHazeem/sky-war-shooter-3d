// Rejoin after a disconnect and host migration for the B-17 crew mode (pure parts, unit-tested in
// tests/coopLobbies.test.ts; the flow lives in game/CoopSession.ts).
//
// Rejoin: a guest keeps a small ticket { code, at } in localStorage while it is aboard. After a
// dropped connection it retries the same code for a while (the host re-offers the departed slot,
// Crew.ts / CoopSession.onLinkClosed), and after a reload the co-op menu offers "Rejoin" while the
// ticket is fresh.
//
// Host migration: the host names an heir (the lowest connected crew id) and a fresh "next" code in
// a `plan` event whenever its crew changes. If the host leaves mid-round (it sends `migrate`
// first) or vanishes (no reconnect possible), the heir takes the battle over in its own world and
// opens rooms under the next code; everyone else rejoins that code. When no heir can take over the
// round ends gracefully: each guest gets a debrief of the sortie so far.
import { normalizeCode } from './Signal';
import type { CrewSeat } from './Crew';

export const TICKET_KEY = 'sws3d.coopTicket';
export const TICKET_MS = 15 * 60 * 1000;     // "Rejoin" is offered this long after leaving
export const RECONNECT_TRIES = 4;            // same code, after a dropped link
export const RECONNECT_GAP_MS = 4000;        // host timeout (10 s) + re-offer fit in 4 tries
export const MIGRATE_TRIES = 8;              // the next code, while the heir opens its rooms
export const MIGRATE_GAP_MS = 4000;

export interface RejoinTicket { code: string; at: number }
export interface MigrationPlan { heir: number; next: string; pub: boolean }

export function parseTicket(raw: string | null, now: number): RejoinTicket | null {
  if (!raw) return null;
  let t: any;
  try { t = JSON.parse(raw); } catch { return null; }
  const code = typeof t?.code === 'string' ? normalizeCode(t.code) : null;
  if (!code || !Number.isFinite(t.at) || now - t.at > TICKET_MS || t.at > now + 60_000) return null;
  return { code, at: t.at };
}

export function loadTicket(now = Date.now()): RejoinTicket | null {
  try { return parseTicket(localStorage.getItem(TICKET_KEY), now); } catch { return null; }
}
export function saveTicket(code: string, now = Date.now()) {
  try { localStorage.setItem(TICKET_KEY, JSON.stringify({ code, at: now })); } catch { /* private mode */ }
}
export function clearTicket() {
  try { localStorage.removeItem(TICKET_KEY); } catch { /* */ }
}

// The heir: the connected crew member with the lowest id (the host is id 0 and never its own heir)
export function pickHeir(crew: readonly Pick<CrewSeat, 'id'>[]): number {
  let heir = -1;
  for (const p of crew) if (p.id > 0 && (heir < 0 || p.id < heir)) heir = p.id;
  return heir;
}

export function validPlan(m: any): m is MigrationPlan {
  return Number.isInteger(m?.heir) && m.heir >= 1 && m.heir <= 3 && typeof m.next === 'string' && normalizeCode(m.next) === m.next && typeof m.pub === 'boolean';
}

// What a guest does when its link to the host closes during a B-17 crew round:
//   'reconnect'  try the same code again (our own connection may be what failed)
//   'takeover'   we are the heir: carry the battle on and host the next code
//   'follow'     rejoin the crew under the heir's next code
//   'end'        no plan (or not the crew mode): end the round gracefully
export type LossAction = 'reconnect' | 'takeover' | 'follow' | 'end';
export function lossAction(o: { crewMode: boolean; plan: MigrationPlan | null; myId: number; hostLeft: boolean; reconnectFailed: boolean }): LossAction {
  if (!o.crewMode) return 'end';
  if (!o.hostLeft && !o.reconnectFailed) return 'reconnect';
  if (!o.plan) return 'end';
  return o.plan.heir === o.myId ? 'takeover' : 'follow';
}
