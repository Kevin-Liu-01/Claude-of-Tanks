import type { RuntimeValue } from '../runtimeTypes.ts';
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

/**
 * Allocate a case-insensitively unique display name within one match/lobby.
 * The first commander keeps the requested name; later collisions receive a
 * compact numeric suffix while remaining inside the wire length limit.
 */
export function uniquePlayerName(
  requested: RuntimeValue,
  existingNames: Iterable<RuntimeValue> = [],
): string {
  const base = normalizePlayerName(requested);
  if (!base) return '';
  const taken = new Set([...existingNames].map((name) =>
    normalizePlayerName(name).toLocaleLowerCase('en-US')));
  if (!taken.has(base.toLocaleLowerCase('en-US'))) return base;
  for (let number = 2; number < 1000; number++) {
    const suffix = ` ${number}`;
    const candidate = `${base.slice(0, MAX_PLAYER_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase('en-US'))) return candidate;
  }
  throw new Error('player name space is exhausted');
}
