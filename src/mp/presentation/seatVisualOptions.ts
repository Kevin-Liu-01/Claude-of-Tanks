/**
 * 2026-10-22 (item/mp-rejoin-seat-241): the options a match builds a seat's vehicle with. The roster
 * (battlePresentation) and a returning tab's boot (main.ts, which builds its own seat's vehicle in place of the Garage
 * hero it never shows) both read this one derivation, so the vehicle the boot made is the one the roster would make.
 * A leaf: a returning tab's boot imports it (lazily) without the match presentation.
 */
export interface SeatVisualOptions {
  camoSeed: number;
  camoPattern: string;
  quality: 'high' | 'ai';
  eraVisualBindingReceipt: false;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The viewer's own vehicle paints at full texture quality, every other seat at the AI tier. */
export function seatTextureQuality(isViewer: boolean): 'high' | 'ai' {
  return isViewer ? 'high' : 'ai';
}

/** Every client paints a seat alike: the camouflage seed comes from the player's id. */
export function seatVisualOptions(playerId: string, camoPattern: string, isViewer: boolean): SeatVisualOptions {
  return {
    camoSeed: 4000 + (hashString(playerId) % 100000),
    camoPattern,
    quality: seatTextureQuality(isViewer),
    // Generated anatomy and live strip/reset clusters already own gameplay; the authoring audit stays off.
    eraVisualBindingReceipt: false,
  };
}
