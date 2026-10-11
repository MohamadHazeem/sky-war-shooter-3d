// Optional same-origin TURN credentials. Never persist credentials or block joining indefinitely.
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export function validIceServers(value: unknown): value is RTCIceServer[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every((s) => {
    if (!s || typeof s !== 'object') return false;
    const urls = typeof s.urls === 'string' ? [s.urls] : s.urls;
    return Array.isArray(urls) && urls.length > 0 && urls.length <= 10 && urls.every((u: unknown) =>
      typeof u === 'string' && /^(stun|stuns|turn|turns):[^\s]+$/.test(u) &&
      (!/^turns?:/.test(u) || (typeof s.username === 'string' && !!s.username && typeof s.credential === 'string' && !!s.credential)));
  });
}

export async function fetchIceServers(request: typeof fetch = fetch, timeoutMs = 3000): Promise<RTCIceServer[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      request('/api/turn', { method: 'POST', cache: 'no-store', signal: controller.signal }).then(async r => {
        if (!r.ok) throw new Error('TURN unavailable');
        return await r.json();
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TURN timeout')); }, timeoutMs); }),
    ]);
    return validIceServers(data?.iceServers) ? [...ICE_SERVERS, ...data.iceServers] : ICE_SERVERS;
  } catch { return ICE_SERVERS; }
  finally { clearTimeout(timer); }
}
