// The player's favourite tanks: one set for the Garage and the Tank Gallery. Copyright © 2026 Kevin B. Liu.
// The Gallery's stored preferences (src/gallery/gallery.ts, cot.gallery.v2) already hold it; the Garage reads and
// writes the same field and keeps the Gallery's other preferences. Blocked storage reads as no favourites.
const KEY = 'cot.gallery.v2';

function stored(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch (_) { return {}; }
}

/** The stored favourites' ids. */
export function readFavouriteTanks(): Set<string> {
  const list = stored().favourites;
  return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []);
}

/** Store `ids` as the favourites, keeping the Gallery's other preferences. */
export function writeFavouriteTanks(ids: ReadonlySet<string>): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...stored(), favourites: [...ids] })); } catch (_) { /* session-only */ }
}
