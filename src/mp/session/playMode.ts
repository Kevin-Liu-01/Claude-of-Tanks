import type { RuntimeValue } from '../../runtimeTypes.ts';

/** The entry modes; a persisted `ranked` (the first multiplayer's mode) reopens Private. */
export type PlayMode = 'solo' | 'private' | 'lan';

/** Old saved Ranked selections reopen Private rooms without loading a queue. */
export function normalizePlayMode(value: RuntimeValue): PlayMode {
  if (value === 'private' || value === 'lan' || value === 'solo') return value;
  return value === 'ranked' ? 'private' : 'solo';
}
