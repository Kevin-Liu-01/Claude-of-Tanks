/**
 * The proving ground's type (2026-10-20; the owner's UI rules of 2026-10-17: Chakra Petch for display, IBM Plex Mono for
 * figures). Copyright © 2026 Kevin B. Liu. The faces are third-party, SIL Open Font License 1.1 (docs/ATTRIBUTION.md,
 * public/fonts/<face>/OFL.txt).
 *
 * The game document declares them once, through its cot:type marker (src/ui/typeFaces.ts): 'Cot UI' at 600 and 700 is
 * Chakra Petch SemiBold and Bold, and --font-mono is IBM Plex Mono. The range card and the range's boards are the only
 * readers; the boards paint on a canvas, so they wait for the two display faces before their first draw.
 */
import { FONT_STACK } from './fonts.ts';

/** Display: the range card's titles and figures, the boards' numerals (canvas-safe; 600 / 700 are Chakra Petch). */
export const PROVING_DISPLAY = FONT_STACK;
/** Data: the card's readouts (IBM Plex Mono, a monospace face, so its figures never move). DOM only. */
export const PROVING_MONO = 'var(--font-mono)';

let loading: Promise<void> | null = null;

/** Load the display faces the boards paint once; resolves when they are ready (or failed: the stack falls back). */
export function loadProvingType(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || !document.fonts?.load) {
    loading = Promise.resolve();
    return loading;
  }
  loading = Promise.all([600, 700].map((weight) => document.fonts.load(`${weight} 32px 'Cot UI'`).catch(() => null)))
    .then(() => undefined);
  return loading;
}
