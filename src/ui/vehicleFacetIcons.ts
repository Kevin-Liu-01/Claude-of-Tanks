// Fleet facet glyphs: a side silhouette per vehicle class (facing right, as the Garage's tanks do) and a symbol per
// battle role. Owner UI rules 2026-10-17: tank icons on vehicles, beautiful icons, less text and more showing.
//
// Constant first-party SVG markup only: the only inputs are facet ids from vehicleFacets.ts, looked up as own keys,
// so nothing a player types or a link carries is ever written into the markup. Loaded with the Garage Filter panel
// (garageFacetPanel.ts, lazy) and the Gallery, never on the game entry.

const WHEELS = '<g fill="rgba(8,12,16,.55)"><circle cx="6.4" cy="13.2" r=".95"/><circle cx="10.4" cy="13.2" r=".95"/>'
  + '<circle cx="14.4" cy="13.2" r=".95"/><circle cx="18.4" cy="13.2" r=".95"/><circle cx="22.4" cy="13.2" r=".95"/></g>';
const TRACK = '<rect x="2.6" y="11.2" width="25.4" height="3.8" rx="1.9"/>';

/** Class silhouettes, viewBox 0 0 32 16, ground at y 15. */
const CLASS_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  mbt: `<g fill="currentColor">${TRACK}<path d="M2.4 9.3h24.2l2.6 2.4H1.6Z"/>`
    + '<path d="M8.6 9.3 10.4 5.7h8.1l2.9 1.6v2Z"/><path d="M20.6 6.2H31v1.1H20.6Z"/><rect x="12" y="4.5" width="2.8" height="1.3" rx=".4"/>'
    + `</g>${WHEELS}`,
  medium: `<g fill="currentColor">${TRACK}<path d="M3.2 9.3h22.6l2.4 2.4H2.4Z"/>`
    + '<path d="M9.6 9.3c.2-2.6 2.2-3.9 5.3-3.9 3 0 4.8 1.3 5.1 3.9Z"/><path d="M19.4 6.6h8.4v1H19.4Z"/></g>' + WHEELS,
  heavy: '<g fill="currentColor"><rect x="1.8" y="10.6" width="26.6" height="4.4" rx="2.2"/><path d="M1.8 8.2h24.6l3 3H1Z"/>'
    + '<path d="M7.2 8.2 8.8 4.1h10.9l2.9 1.8v2.3Z"/><path d="M21.8 5.2h8.4v1.6h-8.4Z"/><rect x="29.6" y="4.7" width="1.9" height="2.6" rx=".3"/>'
    + `</g>${WHEELS}`,
  light: '<g fill="currentColor"><rect x="5" y="11.6" width="20.4" height="3.4" rx="1.7"/><path d="M5 10h19.2l2 2H4.2Z"/>'
    + '<path d="M11 10l1.1-2.4h5l1.6 1v1.4Z"/><path d="M18.3 8.1h7.4v.8h-7.4Z"/></g>'
    + '<g fill="rgba(8,12,16,.55)"><circle cx="8.4" cy="13.3" r=".85"/><circle cx="12.6" cy="13.3" r=".85"/>'
    + '<circle cx="16.8" cy="13.3" r=".85"/><circle cx="21" cy="13.3" r=".85"/></g>',
  ifv: `<g fill="currentColor">${TRACK}<path d="M2 11.6V7.9l1-1.1h18.4l7.2 3.6v1.2Z"/>`
    + '<path d="M11 6.8V4.9h5.8l1.4 1.9Z"/><path d="M17.6 5.4h9.6v.7h-9.6Z"/><rect x="11.6" y="3.3" width="4.2" height="1.2" rx=".4"/>'
    + `</g>${WHEELS}`,
  apc: `<g fill="currentColor">${TRACK}<path d="M2.2 11.6V6.9l1-1.1h17.6l7.8 4v1.8Z"/>`
    + '<rect x="8.6" y="4.4" width="3.4" height="1.4" rx=".4"/><path d="M11.6 4.6h4.4v.6h-4.4Z"/></g>' + WHEELS,
  td: `<g fill="currentColor">${TRACK}<path d="M2.2 11.6V8.1l3.2-2.3h10.4l9.6 3.6 2.8 2.2Z"/>`
    + '<path d="M21.4 8.1H31v1.2h-9.6Z"/><rect x="7.6" y="4.6" width="2.6" height="1.3" rx=".4"/></g>' + WHEELS,
  spaa: `<g fill="currentColor">${TRACK}<path d="M2.4 9.3h24.2l2.6 2.4H1.6Z"/><path d="M8.8 9.3V6h10.6l1.6 3.3Z"/></g>`
    + '<path d="m18.4 6.6 7-5.2m-6.1 6.2 7-5.2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>'
    + '<path d="M9.4 5.6a2.6 2.6 0 0 1 4.2-2.9M11.5 4.2v1.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>'
    + WHEELS,
  'fire-support': `<g fill="currentColor">${TRACK}<path d="M2.4 9.3h24.2l2.6 2.4H1.6Z"/>`
    + '<path d="m6.6 8.7 13.2-5.6 1.5 3.3-13 4.9Z"/></g>'
    + '<g fill="rgba(8,12,16,.6)"><circle cx="20.2" cy="4.3" r=".55"/><circle cx="20.8" cy="5.6" r=".55"/></g>' + WHEELS,
  // the concept and prototype filter: the main battle tank drawn as a dashed blueprint outline
  'concept-prototype': '<g fill="none" stroke="currentColor" stroke-width=".9" stroke-dasharray="1.5 1" stroke-linejoin="round">'
    + '<rect x="3" y="11.6" width="24.6" height="3" rx="1.5"/><path d="M2.4 9.3h24.2l2.6 2.3H1.6Z"/>'
    + '<path d="M8.6 9.3 10.4 5.7h8.1l2.9 1.6v2Z"/><path d="M21.4 6.6H31"/></g>',
});

/** Battle role symbols, viewBox 0 0 24 24. */
const ROLE_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  // an arrow driven through a gap in a line
  breakthrough: '<path d="M16.5 2.5v6.2m0 6.6v6.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path d="M2 9.9h10V6.2L21.8 12 12 17.8v-3.7H2Z" fill="currentColor"/>',
  // a held line: its teeth toward the enemy, a second line in depth
  frontline: '<path d="M2 13.2h20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path d="m3.6 12.4 2.9-5.6 2.9 5.6Zm5.5 0 2.9-5.6 2.9 5.6Zm5.5 0 2.9-5.6 2.9 5.6Z" fill="currentColor"/>'
    + '<path d="M5 18h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>',
  // a sweep around the side of a position
  flanker: '<rect x="13.4" y="13.2" width="7.2" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/>'
    + '<path d="M3.5 20.5v-6.8A8.4 8.4 0 0 1 11.9 5.3H17" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>'
    + '<path d="m16 1.8 5.6 3.5-5.6 3.5Z" fill="currentColor"/>',
  // a sight reticle
  sniper: '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.7"/>'
    + '<path d="M12 1.8v5.4m0 9.6v5.4M1.8 12h5.4m9.6 0h5.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
    + '<circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  // eyes forward
  scout: '<path d="M1.8 12s3.7-6.6 10.2-6.6S22.2 12 22.2 12s-3.7 6.6-10.2 6.6S1.8 12 1.8 12Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
    + '<circle cx="12" cy="12" r="3.4" fill="currentColor"/><circle cx="13.2" cy="10.8" r="1" fill="rgba(8,12,16,.6)"/>',
  // fire arcing over the line onto a target
  support: '<path d="M3 20.5C5.5 9 12.5 4.6 19.2 9.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.6 2.2"/>'
    + '<path d="m19.6 9.8 1.2-2.9.9 3 2.9-.6-2.2 2 1.9 2.4-3-.5-1.1 2.8-.8-2.9-3 .4 2.3-2-1.6-2.5Z" fill="currentColor"/>',
});

/** The panel's own controls, viewBox 0 0 24 24. */
const CONTROL_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  search: '<circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<path d="m15.2 15.2 5.6 5.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  clear: '<path d="M5.6 9.2A7.2 7.2 0 1 1 5 14.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M3.2 4.6 4.4 10.6l5.8-1.9Z" fill="currentColor"/>',
});

const CLASS_VIEW_BOX = '0 0 32 16';
const ROLE_VIEW_BOX = '0 0 24 24';

function glyph(body: string | undefined, viewBox: string, width: number, height: number): string {
  if (!body) return '';
  return `<svg class="cot-facet-glyph" viewBox="${viewBox}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** The silhouette for a vehicle class (or the concept-and-prototype filter); '' for an unknown value. */
export function vehicleClassGlyphSVG(value: string, width = 26): string {
  const body = Object.hasOwn(CLASS_GLYPHS, value) ? CLASS_GLYPHS[value] : undefined;
  return glyph(body, CLASS_VIEW_BOX, width, Math.round(width / 2));
}

/** The symbol for a battle role; '' for an unknown value. */
export function vehicleRoleGlyphSVG(value: string, size = 16): string {
  const body = Object.hasOwn(ROLE_GLYPHS, value) ? ROLE_GLYPHS[value] : undefined;
  return glyph(body, ROLE_VIEW_BOX, size, size);
}

/** A Filter panel control glyph ('search', 'clear'). */
export function facetControlGlyphSVG(id: 'search' | 'clear', size = 16): string {
  return glyph(CONTROL_GLYPHS[id], ROLE_VIEW_BOX, size, size);
}

/** The ids drawn (the receipt keeps them equal to the facet tables). */
export const VEHICLE_CLASS_GLYPH_IDS = Object.freeze(Object.keys(CLASS_GLYPHS));
export const VEHICLE_ROLE_GLYPH_IDS = Object.freeze(Object.keys(ROLE_GLYPHS));
