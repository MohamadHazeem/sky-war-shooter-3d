// Public co-op lobbies (B-17 crew mode): a small listing per public game, the lobby browser's
// ranking, quick join, region / latency hints and friend invite links.
//
//   coop_lobbies/{CODE}  { host, name, crew, open, phase, round, region, updatedAt, expiresAt, v }
//
// CODE is the game's base room code (its slot-0 signalling room, coop_rooms/{CODE}, must belong to
// the same host: firestore.rules). The host publishes on hosting, refreshes on every crew, phase or
// round change (coalesced, at most one write per PUBLISH_GAP_MS) plus a heartbeat, and deletes the
// listing on leave. A crashed host's listing simply goes stale: the browser only shows listings
// refreshed within FRESH_MS. Everything except the three Firestore calls at the bottom is pure and
// unit-tested (tests/coopLobbies.test.ts).
import { fbConnect } from './Leaderboard';
import { normalizeCode, ROOM_TTL_MS } from './Signal';

export type Region = 'eu' | 'na' | 'sa' | 'af' | 'me' | 'as' | 'oc' | 'xx';
export const REGIONS: readonly Region[] = ['eu', 'na', 'sa', 'af', 'me', 'as', 'oc', 'xx'];
export const REGION_LABEL: Record<Region, string> = {
  eu: 'Europe', na: 'North America', sa: 'South America', af: 'Africa', me: 'Middle East', as: 'Asia', oc: 'Oceania', xx: 'Unknown region',
};

export const MAX_CREW = 4;
export const FRESH_MS = 3 * 60 * 1000;        // listings older than this are hidden (host gone)
export const HEARTBEAT_MS = 60 * 1000;        // the host refreshes its listing at least this often
export const PUBLISH_GAP_MS = 5 * 1000;       // and at most this often (rules: 3 s)
export const BROWSE_LIMIT = 20;

export interface LobbyListing {
  code: string;
  name: string;           // the host's callsign
  crew: number;           // players aboard, host included (1..4)
  open: number;           // free gun positions for players (0..3)
  phase: 'lobby' | 'mission';
  round: number;          // survival wave reached (mission phase)
  region: Region;
  updated: number;        // ms since the epoch
  host?: string;          // the host's uid (not shown)
}

// ---------------- region and latency hints ----------------

const SOUTH_AMERICA = /^America\/(Argentina|Sao_Paulo|Santiago|Bogota|Lima|Caracas|Montevideo|Asuncion|La_Paz|Guayaquil|Recife|Fortaleza|Belem|Manaus|Bahia|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha|Paramaribo|Cayenne|Guyana|Punta_Arenas)/;
const MIDDLE_EAST = /^Asia\/(Dubai|Riyadh|Baghdad|Tehran|Qatar|Kuwait|Bahrain|Muscat|Amman|Beirut|Damascus|Jerusalem|Tel_Aviv|Gaza|Hebron|Aden|Nicosia|Famagusta)$/;
const MIDDLE_EAST_AFRICA = /^Africa\/(Cairo|Khartoum|Tripoli)$/;

// A coarse region from the IANA time zone (no location lookup, nothing leaves the device but the
// region code itself).
export function regionFromTimeZone(tz: string | undefined | null): Region {
  if (!tz) return 'xx';
  if (MIDDLE_EAST.test(tz) || MIDDLE_EAST_AFRICA.test(tz)) return 'me';
  if (tz.startsWith('Europe/') || /^Atlantic\/(Reykjavik|Canary|Madeira|Faroe|Azores)$/.test(tz) || tz === 'Asia/Istanbul') return 'eu';
  if (SOUTH_AMERICA.test(tz)) return 'sa';
  if (tz.startsWith('America/') || tz.startsWith('US/') || tz.startsWith('Canada/') || /^Pacific\/Honolulu$/.test(tz)) return 'na';
  if (tz.startsWith('Africa/')) return 'af';
  if (tz.startsWith('Australia/') || /^Pacific\/(Auckland|Fiji|Guam|Port_Moresby|Noumea|Tongatapu|Apia)$/.test(tz)) return 'oc';
  if (tz.startsWith('Asia/') || tz.startsWith('Indian/')) return 'as';
  return 'xx';
}

export function localRegion(): Region {
  try { return regionFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return 'xx'; }
}

// Typical peer-to-peer round trips between regions (ms, rough public-internet medians).
const RTT: Record<string, number> = {
  'eu-eu': 40, 'na-na': 60, 'sa-sa': 60, 'af-af': 110, 'me-me': 60, 'as-as': 80, 'oc-oc': 50,
  'eu-na': 110, 'eu-sa': 210, 'eu-af': 150, 'eu-me': 90, 'eu-as': 220, 'eu-oc': 290,
  'na-sa': 140, 'na-af': 240, 'na-me': 200, 'na-as': 180, 'na-oc': 180,
  'sa-af': 290, 'sa-me': 300, 'sa-as': 310, 'sa-oc': 290,
  'af-me': 150, 'af-as': 280, 'af-oc': 360,
  'me-as': 160, 'me-oc': 260,
  'as-oc': 140,
};

export function estimateRtt(a: Region, b: Region): number {
  if (a === 'xx' || b === 'xx') return 160;
  return RTT[`${a}-${b}`] ?? RTT[`${b}-${a}`] ?? 200;
}

// The same 4..1 bar scale as the in-game connection indicator (CoopScreen.setPing)
export function latencyBars(rtt: number): 1 | 2 | 3 | 4 {
  return rtt < 90 ? 4 : rtt < 160 ? 3 : rtt < 280 ? 2 : 1;
}

// ---------------- listings ----------------

const intIn = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// A Firestore document -> listing, or null when malformed (never trust other clients' writes)
export function parseListing(code: string, d: any): LobbyListing | null {
  if (!d || normalizeCode(code) !== code) return null;
  const updated = typeof d.updatedAt?.toMillis === 'function' ? d.updatedAt.toMillis() : typeof d.updatedAt === 'number' ? d.updatedAt : NaN;
  if (!Number.isFinite(updated) || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 20) return null;
  if (!intIn(d.crew, 1, MAX_CREW) || !intIn(d.open, 0, MAX_CREW - 1) || !intIn(d.round, 0, 999)) return null;
  if (d.phase !== 'lobby' && d.phase !== 'mission') return null;
  const region = REGIONS.includes(d.region) ? d.region as Region : 'xx';
  return { code, name: d.name.trim(), crew: d.crew, open: d.open, phase: d.phase, round: d.round, region, updated, host: typeof d.host === 'string' ? d.host : undefined };
}

export function joinable(l: LobbyListing, now: number, myUid?: string) {
  return l.open > 0 && now - l.updated <= FRESH_MS && l.updated <= now + 60_000 && (!myUid || l.host !== myUid);
}

// Browser order: closest first (latency band), then crews that are waiting in the lobby, then the
// fuller crews (fill games up rather than spreading players thin), then the freshest.
export function rankLobbies(list: readonly LobbyListing[], me: Region, now: number, myUid?: string): LobbyListing[] {
  return list.filter(l => joinable(l, now, myUid)).sort((a, b) =>
    latencyBars(estimateRtt(me, b.region)) - latencyBars(estimateRtt(me, a.region))
    || (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1)
    || b.crew - a.crew
    || b.updated - a.updated
    || (a.code < b.code ? -1 : 1));
}

// Quick join: the best few candidates, in the order to try them (skipping codes that just failed)
export function quickJoinOrder(list: readonly LobbyListing[], me: Region, now: number, myUid?: string, failed: readonly string[] = [], max = 3): string[] {
  return rankLobbies(list, me, now, myUid).filter(l => !failed.includes(l.code)).slice(0, max).map(l => l.code);
}

// What the host publishes (Firestore adds updatedAt / expiresAt)
export function listingFields(name: string, crew: number, phase: 'lobby' | 'mission', round: number, region: Region) {
  const c = Math.max(1, Math.min(MAX_CREW, Math.round(crew)));
  return {
    name: name.trim().slice(0, 20) || 'Gunner', crew: c, open: MAX_CREW - c,
    phase, round: Math.max(0, Math.min(999, Math.round(round))), region,
  };
}
export type ListingFields = ReturnType<typeof listingFields>;
export const sameListing = (a: ListingFields | null, b: ListingFields) => !!a && (Object.keys(b) as (keyof ListingFields)[]).every(k => a[k] === b[k]);

// ---------------- invite links ----------------

export const INVITE_PARAM = 'join';

export function inviteLink(href: string, code: string): string {
  const u = new URL(href);
  u.search = ''; u.hash = '';
  u.searchParams.set(INVITE_PARAM, code);
  return u.toString();
}

// The join code carried by a page URL (?join=CODE, also #join=CODE), or null
export function inviteCode(href: string): string | null {
  let u: URL;
  try { u = new URL(href); } catch { return null; }
  const raw = u.searchParams.get(INVITE_PARAM) ?? new URLSearchParams(u.hash.replace(/^#/, '')).get(INVITE_PARAM);
  return raw ? normalizeCode(raw) : null;
}

// The same URL without the invite (so a reload does not join again)
export function withoutInvite(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(INVITE_PARAM);
  if (new URLSearchParams(u.hash.replace(/^#/, '')).has(INVITE_PARAM)) u.hash = '';
  return u.toString();
}

// ---------------- Firestore ----------------

export async function publishListing(code: string, f: ListingFields): Promise<void> {
  const { db, uid, fs } = await fbConnect();
  await fs.setDoc(fs.doc(db, 'coop_lobbies', code), {
    host: uid, ...f, updatedAt: fs.serverTimestamp(), expiresAt: fs.Timestamp.fromMillis(Date.now() + ROOM_TTL_MS), v: 1,
  });
}

export async function removeListing(code: string): Promise<void> {
  const { db, fs } = await fbConnect();
  await fs.deleteDoc(fs.doc(db, 'coop_lobbies', code));
}

export async function fetchListings(now = Date.now()): Promise<{ list: LobbyListing[]; uid: string }> {
  const { db, uid, fs } = await fbConnect();
  const qs = await fs.getDocs(fs.query(fs.collection(db, 'coop_lobbies'),
    fs.where('updatedAt', '>', fs.Timestamp.fromMillis(now - FRESH_MS)), fs.orderBy('updatedAt', 'desc'), fs.limit(BROWSE_LIMIT)));
  const list: LobbyListing[] = [];
  for (const d of qs.docs) { const l = parseListing(d.id, d.data()); if (l) list.push(l); }
  return { list, uid };
}
