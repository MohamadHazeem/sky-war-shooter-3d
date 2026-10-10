// OAuth access token from the Firebase CLI login on this machine (`npx firebase-tools login`),
// for authenticated REST calls from the tools without firebase-admin or a service-account key.
// The CLI keeps a refresh token in ~/.config/configstore/firebase-tools.json; the access token
// there is used while it is valid, otherwise a fresh one is minted (it is not written back).
//
//   import { accessToken } from './firebase_token.mjs';
//   const token = await accessToken();
//
// The refresh needs the Firebase CLI's own OAuth client id/secret. They are read at run time from
// the firebase-tools package that `npx firebase-tools` installed (lib/api.js), so nothing is
// stored in this repo; FIREBASE_CLIENT_ID / FIREBASE_CLIENT_SECRET override them, as for the CLI.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROJECT = 'sky-war-shooter-3d';

function cliClient() {
  if (process.env.FIREBASE_CLIENT_ID && process.env.FIREBASE_CLIENT_SECRET) return { id: process.env.FIREBASE_CLIENT_ID, secret: process.env.FIREBASE_CLIENT_SECRET };
  const roots = [join(homedir(), '.npm', '_npx'), join(process.cwd(), 'node_modules')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = root.endsWith('_npx') ? readdirSync(root).map((d) => join(root, d, 'node_modules')) : [root];
    for (const d of dirs) {
      const api = join(d, 'firebase-tools', 'lib', 'api.js');
      if (!existsSync(api)) continue;
      const src = readFileSync(api, 'utf8');
      const id = src.match(/clientId = \(\) => utils\.envOverride\("[^"]+", "([^"]+)"\)/)?.[1];
      const secret = src.match(/clientSecret = \(\) => utils\.envOverride\("[^"]+", "([^"]+)"\)/)?.[1];
      if (id && secret) return { id, secret };
    }
  }
  throw new Error('Firebase CLI not found: run `npx firebase-tools login` once (or set FIREBASE_CLIENT_ID / FIREBASE_CLIENT_SECRET).');
}

export async function accessToken() {
  if (process.env.SWS_ACCESS_TOKEN) return process.env.SWS_ACCESS_TOKEN;
  const file = join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'configstore', 'firebase-tools.json');
  let cfg;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch {
    throw new Error(`No Firebase CLI login found (${file}). Run: npx firebase-tools login`);
  }
  const t = cfg.tokens ?? {};
  if (t.access_token && t.expires_at && t.expires_at > Date.now() + 60_000) return t.access_token;
  if (!t.refresh_token) throw new Error('The Firebase CLI login has no refresh token. Run: npx firebase-tools login');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: cliClient().id, client_secret: cliClient().secret }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Firestore REST value -> plain JS */
export function fromValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {});
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return null;
}
export function fromFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) o[k] = fromValue(v);
  return o;
}
