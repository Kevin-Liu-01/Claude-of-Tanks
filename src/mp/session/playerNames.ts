import type { RuntimeValue } from '../../runtimeTypes.ts';
const MAX_PLAYER_NAME_LENGTH = 24;

function hashString(value: RuntimeValue): number {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Normalize a user-facing commander name without inventing a fallback. */
export function normalizePlayerName(value: RuntimeValue): string {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

/** Stable per-browser automatic callsign; room authority still resolves collisions. */
export function automaticPlayerName(playerId: RuntimeValue): string {
  const suffix = hashString(playerId).toString(36).toUpperCase().padStart(4, '0').slice(-4);
  return `Commander ${suffix}`;
}
