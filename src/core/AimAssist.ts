// Aim-assist presets (Settings > Aim assist). The level is a strength 0..1.5 that the
// controllers scale their sight magnetism, aim friction and lock cone by (Game.applyAssist).
// 'strong' is the accessibility preset: a wide cone and a firm pull for players who cannot
// make fine aiming movements. With "stronger on a gamepad" on (access.padAssist), playing on
// a gamepad moves the preset one step up, because a thumbstick is coarser than a mouse.

export type AssistLevel = 'off' | 'low' | 'high' | 'strong';

export const ASSIST_LEVELS: readonly AssistLevel[] = ['off', 'low', 'high', 'strong'];

export const ASSIST_STRENGTH: Readonly<Record<AssistLevel, number>> = { off: 0, low: 0.5, high: 1, strong: 1.5 };

/** Strength for a level; 'off' always stays off (pure gunnery is a choice, not a device default). */
export function assistStrength(level: AssistLevel | undefined, padBoost = false): number {
  const lv: AssistLevel = level && level in ASSIST_STRENGTH ? level : 'high';
  if (lv === 'off') return 0;
  const i = ASSIST_LEVELS.indexOf(lv);
  return ASSIST_STRENGTH[padBoost ? ASSIST_LEVELS[Math.min(ASSIST_LEVELS.length - 1, i + 1)] : lv];
}
