import type { Settings } from './UI';
export type GraphicsChoice = 'low' | 'medium' | 'high' | 'auto';
export const BASIC_SETTINGS = ['difficulty', 'hudDetail', 'volume', 'musicVolume', 'voiceVolume', 'sensitivity', 'invertY'] as const;
export const difficultyBalance = (difficulty: Settings['difficulty']) => difficulty === 'recruit'
  ? { enemy: 0.8, damage: 0.7, allies: 1.2 } : difficulty === 'ace'
    ? { enemy: 1.2, damage: 1.3, allies: 1 } : { enemy: 1, damage: 1, allies: 1 };
export function graphicsChoice(s: Pick<Settings, 'quality' | 'graphicsMode' | 'gfxAuto'>): GraphicsChoice {
  return s.graphicsMode === 'auto' || s.gfxAuto === 'pending' ? 'auto' : (s.quality === 'ultra' || s.quality === 'cinematic') ? 'high' : s.quality;
}
export function selectGraphics(s: Settings, choice: GraphicsChoice) {
  s.graphicsMode = choice === 'auto' ? 'auto' : 'manual';
  if (choice !== 'auto') { s.quality = choice; delete s.gfxAuto; }
}
