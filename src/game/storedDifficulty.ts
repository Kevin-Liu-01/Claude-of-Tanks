// The AI difficulty the settings panel stores with the other gameplay settings (cot.settings.v1, its GAMEPLAY tab), read
// once at battle setup. Its own module so the local step (game/state.ts) reads one setting without reaching the
// device-input layer (game/input.ts: mouse smoothing, wheel dolly and the rest, sampled at frame rate), which
// tools/det-math-lint.mjs would otherwise hold to the simulation's math (276, sim-det-trig).
import type { AiDifficulty } from './ai.ts';

const AI_DIFFICULTIES: readonly string[] = ['easy', 'normal', 'hard'];

/** The stored AI difficulty, or 'normal' when none (or no storage) is there. */
export function getStoredDifficulty(): AiDifficulty {
  let stored: unknown = null;
  try { stored = JSON.parse(localStorage.getItem('cot.settings.v1') || 'null'); } catch { stored = null; }
  const difficulty = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as { aiDifficulty?: unknown }).aiDifficulty : null;
  return typeof difficulty === 'string' && AI_DIFFICULTIES.includes(difficulty) ? difficulty as AiDifficulty : 'normal';
}
