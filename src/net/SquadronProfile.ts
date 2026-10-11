// Small local mirror: CloudSave already includes every sws3d.* key. Membership is always
// rechecked on the server; restoring this cache on another device never grants access.
export const SQUADRON_KEY = 'sws3d.squadron';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SQUADRON_ADJECTIVES = ['Silver', 'Golden', 'Brave', 'Flying', 'Desert', 'Midnight'] as const;
export const SQUADRON_NOUNS = ['Falcons', 'Eagles', 'Hawks', 'Wings', 'Stars', 'Owls'] as const;
export interface SquadronProfile { callsign: string; code: string }
export function squadronCode(bytes = crypto.getRandomValues(new Uint8Array(6))): string {
  if (bytes.length < 6) throw new Error('Six random bytes required');
  // Exactly 32 readable symbols: every byte maps uniformly to one symbol.
  return Array.from(bytes.subarray(0, 6), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export function normalizeSquadronCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}
// An allowlist, rather than an incomplete profanity blacklist, works in both languages and
// is also enforced by the rules. Display translations never change the stored name.
export function safeSquadronName(name: string): boolean {
  return SQUADRON_ADJECTIVES.some((a) => SQUADRON_NOUNS.some((n) => name === `${a} ${n}`));
}
export function validCallsign(name: string): boolean {
  const folded = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[013457]/g, c => ({0:'o',1:'i',3:'e',4:'a',5:'s',7:'t'}[c]!)).replace(/[^\p{L}]/gu, '');
  return name === name.trim() && /^[\p{L}\p{N} .'-]{2,16}$/u.test(name)
    && !/(fuck|shit|cunt|nigger|nazi|hitler|كسعر|شرموط|قحب)/u.test(folded);
}
export function cachedSquadron(): SquadronProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(SQUADRON_KEY) ?? 'null');
    return p && validCallsign(p.callsign) && (p.code === '' || normalizeSquadronCode(p.code) === p.code) ? p : null;
  } catch { return null; }
}
export function cacheSquadron(profile: SquadronProfile | null) {
  try {
    if (profile) localStorage.setItem(SQUADRON_KEY, JSON.stringify(profile));
    else localStorage.removeItem(SQUADRON_KEY);
  } catch { /* online membership still works when storage is unavailable */ }
}
