import { validIceServers } from '../src/net/Ice';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}
const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/turn') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return reply({ error: 'method' }, 405);
    // Browser requests are same-origin; no CORS access to credential minting.
    if (request.headers.get('Origin') !== url.origin) return reply({ error: 'origin' }, 403);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return reply({ error: 'unavailable' }, 503);
    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 7200 }), signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) return reply({ error: 'unavailable' }, 503);
      const data = await response.json() as { iceServers?: unknown };
      if (!validIceServers(data.iceServers)) return reply({ error: 'unavailable' }, 503);
      return reply({ iceServers: data.iceServers });
    } catch { return reply({ error: 'unavailable' }, 503); }
  },
};
