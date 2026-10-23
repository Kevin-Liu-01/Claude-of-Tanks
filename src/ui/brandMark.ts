/**
 * The Claude of Tanks mark (brand-ui BUI-F6): the Bracket Chevron, a target bracket around a rising chevron. It won the
 * BUI-01 blind judging against the shield badge. It is first-party and replaces the retired crest. Copyright © 2026
 * Kevin B. Liu.
 *
 * Two strokes, so it lives beside the icon sprite rather than in it (the sprite carries one stroke weight on its host):
 * the bracket takes the surrounding ink, the chevron the brand accent.
 */
/** The wordmark, "Claude of Tanks" with its small accent "of" between rules, in Latin in every locale (lang="en"). */
export const BRAND_WORDMARK_HTML = '<span class="wm" lang="en">Claude <span class="of">of</span> Tanks</span>';

export function brandMarkSVG(size: number): string {
  return `<svg class="cot-mark" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">` +
    '<path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M6.5 16.5 12 8.2l5.5 8.3" fill="none" style="stroke:var(--accent)" stroke-width="2.4" ' +
    'stroke-linecap="square" stroke-linejoin="miter"/></svg>';
}
