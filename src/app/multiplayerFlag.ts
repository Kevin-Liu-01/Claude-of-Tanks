/**
 * The Multiplayer v2 switch (charter §8): `?mp=v2` on the URL or
 * `localStorage["cot.mp.v2"] = "1"` routes the Play menu's Private / LAN
 * flows to the v2 session owner (src/mp/session) instead of v1 (src/net).
 * `?mp=v1` (or `off`) clears the stored switch. Pure and DOM-free so the
 * boot path reads it without importing anything under src/mp.
 */
export const MULTIPLAYER_V2_STORAGE_KEY = 'cot.mp.v2';

interface FlagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readMultiplayerV2Flag({ search = '', storage = null }: { search?: string; storage?: FlagStorage | null } = {}): boolean {
  let requested: string | null = null;
  try { requested = new URLSearchParams(search).get('mp'); } catch { requested = null; }
  const value = requested ? requested.trim().toLowerCase() : '';
  const write = (enabled: boolean) => {
    try {
      if (enabled) storage?.setItem(MULTIPLAYER_V2_STORAGE_KEY, '1');
      else storage?.removeItem(MULTIPLAYER_V2_STORAGE_KEY);
    } catch { /* storage unavailable: the switch lives for this page only */ }
  };
  if (value === 'v2' || value === '2') { write(true); return true; }
  if (value === 'v1' || value === '1' || value === 'off') { write(false); return false; }
  try { return storage?.getItem(MULTIPLAYER_V2_STORAGE_KEY) === '1'; } catch { return false; }
}
