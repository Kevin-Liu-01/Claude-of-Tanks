/**
 * The Claude of Tanks mark (brand-ui BUI-F6): the Bracket Chevron, a target bracket around a rising chevron. It won the
 * BUI-01 blind judging against the shield badge. It is first-party and replaces the retired crest. Copyright © 2026
 * Kevin B. Liu.
 *
 * Two strokes, so it lives beside the icon sprite rather than in it (the sprite carries one stroke weight on its host):
 * the bracket takes the surrounding ink, the chevron the brand accent.
 */
import { WORDMARK_OF, WORDMARK_VIEWBOX, WORDMARK_WORDS } from './brandWordmark.ts';

/**
 * The wordmark, CLAUDE —of— TANKS, as the outlined master (src/ui/brandWordmark.ts, SPEC 3.1: never live text): the
 * words take the surrounding ink, the "of" and its rules the accent. Its host names the game; the drawing is decorative.
 */
export const BRAND_WORDMARK_HTML = `<svg class="wm" viewBox="${WORDMARK_VIEWBOX}" aria-hidden="true" focusable="false">`
  + `<path fill="currentColor" d="${WORDMARK_WORDS}"/><path style="fill:var(--accent)" d="${WORDMARK_OF}"/></svg>`;

export function brandMarkSVG(size: number): string {
  return `<svg class="cot-mark" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    '<path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M6.5 16.5 12 8.2l5.5 8.3" fill="none" style="stroke:var(--accent)" stroke-width="2.4" ' +
    'stroke-linecap="square" stroke-linejoin="miter"/></svg>';
}
