/**
 * The proving ground's type (2026-10-20; the owner's UI rules of 2026-10-17: Chakra Petch for display, IBM Plex Mono for
 * figures). Copyright © 2026 Kevin B. Liu. The faces are third-party, SIL Open Font License 1.1 (docs/ATTRIBUTION.md,
 * public/fonts/<face>/OFL.txt), the same files byte for byte as the brand type package carries.
 *
 * The range card and the range's boards are the only readers, and both load lazily with the proving ground: the faces
 * register through the FontFace API on first use, so no page downloads them until a test drive begins.
 */

/** Display: the range card's titles and figures, the boards' numerals. */
export const PROVING_DISPLAY = "'Chakra Petch','ABC Monument Grotesk','Arial Narrow',Arial,sans-serif";
/** Data: readouts that tick in place (tabular figures). */
export const PROVING_MONO = "'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const FACES = [
  { family: 'Chakra Petch', weight: '600', file: '/fonts/chakra-petch/ChakraPetch-SemiBold-Latin.woff2' },
  { family: 'Chakra Petch', weight: '700', file: '/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2' },
  { family: 'IBM Plex Mono', weight: '500', file: '/fonts/ibm-plex-mono/IBMPlexMono-Medium-Latin1.woff2' },
] as const;

let loading: Promise<void> | null = null;

/** Register and load the three faces once; resolves when they are ready (or failed: the stacks fall back). */
export function loadProvingType(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
    loading = Promise.resolve();
    return loading;
  }
  loading = Promise.all(FACES.map((face) => {
    const font = new FontFace(face.family, `url(${face.file}) format('woff2')`, { weight: face.weight, display: 'swap' });
    document.fonts.add(font);
    return font.load().catch(() => null);
  })).then(() => undefined);
  return loading;
}
