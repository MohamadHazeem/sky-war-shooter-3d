// Arabic voice-over: when the game language is Arabic, every recorded line (radio, interphone,
// briefings, crew room) plays its Arabic take from public/audio/voice/ar/ — same clip ids, same
// per-role voices (tools/voice/generate.py --lang ar). The Arabic manifest is fetched only once
// Arabic is in use, clips one by one on first use, so English players download nothing extra.
// A clip without an Arabic take falls back to the English recording.
import { isAr, onLangChange } from '../i18n';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'audio/voice/';

export interface ArClip { file: string; dur: number; text?: string }

let pending: Promise<Record<string, ArClip> | null> | null = null;
let clips: Record<string, ArClip> | null = null;

/** Fetch the Arabic manifest (once). Resolves null when there is none. */
export function loadArabicVoice(): Promise<Record<string, ArClip> | null> {
  pending ??= fetch(BASE + 'ar/manifest.json')
    .then((r) => (r.ok && !(r.headers.get('content-type') ?? '').includes('text/html') ? r.json() : null))
    .then((m) => {
      clips = m && typeof m.clips === 'object' ? (m.clips as Record<string, ArClip>) : null;
      return clips;
    })
    .catch(() => null);
  return pending;
}

/** Language of the recordings that play now ('ar' only once the Arabic manifest is in). */
export const voiceLang = (): 'en' | 'ar' => (isAr() && clips ? 'ar' : 'en');

/** URL of a clip in the current voice language; `enFile` is its English manifest file. */
export function voiceUrl(id: string, enFile: string): string {
  const a = isAr() ? clips?.[id] : undefined;
  return a ? BASE + 'ar/' + a.file : BASE + enFile;
}

/** Same, waiting for the Arabic manifest first when Arabic is active. */
export async function voiceUrlReady(id: string, enFile: string): Promise<string> {
  if (isAr()) await loadArabicVoice();
  return voiceUrl(id, enFile);
}

/** True when this clip has an Arabic take (tests, debugging). */
export const hasArabicTake = (id: string) => !!clips?.[id];

/** Called after a language switch, once the matching manifest is loaded: drop decoded audio of the other language. */
export function onVoiceLangChange(f: () => void) {
  onLangChange(() => {
    if (isAr()) void loadArabicVoice().then(() => f());
    else f();
  });
}

/** Testing hook: reset the module state. */
export function _resetVoiceLang(m: Record<string, ArClip> | null = null) {
  clips = m;
  pending = m ? Promise.resolve(m) : null;
}
