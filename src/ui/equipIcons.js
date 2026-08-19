// src/ui/equipIcons.js — EQUIPMENT SYSTEM icon set.
// One recognizable glyph per catalog item, refreshed into the shared armored
// UI language: a flat white silhouette inside a quiet clipped-corner equipment
// plate. All paths live on a 24x24 grid and are built from >=1.5px strokes /
// chunky fills so they stay crisp from 20 to 48 px. The compact 15px battle
// readout omits the frame to preserve maximum glyph legibility.
//
// equipIconSVG(id, size, ink) returns an inline <svg> string (or '' for
// unknown ids). Consumers: the garage slot boxes + picker grid (garage.js)
// and the battle HUD loadout readout (damagePanel.js).

/** Default ink — matches hud.js TRAY_INK. */
const EQUIP_INK = 'rgba(238,244,250,0.86)';

// Each entry is the inner markup of a 24x24 viewBox, as a function of ink.
const GLYPHS = {
  // Gun Rammer — shell being driven forward by a double chevron.
  rammer: (I) =>
    `<path fill="${I}" d="M11 8.5h5.2q4.4.5 6.2 3.5-1.8 3-6.2 3.5H11Z"/>` +
    `<path fill="${I}" d="M2.2 7.2 7 12l-4.8 4.8v-2.7L4.3 12 2.2 9.9Zm3.8 0L10.8 12 6 16.8v-2.7L8.1 12 6 9.9Z"/>`,

  // Vertical Stabilizer — gyroscope: axis, outer ring, spinning ellipse.
  vstab: (I) =>
    `<circle cx="12" cy="12" r="8.2" fill="none" stroke="${I}" stroke-width="1.6"/>` +
    `<ellipse cx="12" cy="12" rx="8.2" ry="3.4" fill="none" stroke="${I}" stroke-width="1.5" transform="rotate(-24 12 12)"/>` +
    `<circle cx="12" cy="12" r="2.2" fill="${I}"/>` +
    `<path stroke="${I}" stroke-width="1.7" stroke-linecap="round" d="M12 1.6v3.1M12 19.3v3.1"/>`,

  // Gun Laying Drive — settling reticle: ring, center mass, hard outer ticks.
  gld: (I) =>
    `<circle cx="12" cy="12" r="6.3" fill="none" stroke="${I}" stroke-width="1.7"/>` +
    `<circle cx="12" cy="12" r="1.9" fill="${I}"/>` +
    `<path stroke="${I}" stroke-width="2" stroke-linecap="round" d="M12 2.2v3.4M12 18.4v3.4M2.2 12h3.4M18.4 12h3.4"/>`,

  // Improved Ventilation — fan: housing ring, three petal blades, hub.
  vents: (I) => {
    const petal = `M12 10.9C9.9 10.2 8.7 7.9 9.4 5.5 9.9 3.7 14.1 3.7 14.6 5.5c.7 2.4-.5 4.7-2.6 5.4Z`;
    return `<circle cx="12" cy="12" r="9.6" fill="none" stroke="${I}" stroke-width="1.6"/>` +
      `<g fill="${I}"><path d="${petal}"/>` +
      `<path d="${petal}" transform="rotate(120 12 12)"/>` +
      `<path d="${petal}" transform="rotate(240 12 12)"/></g>` +
      `<circle cx="12" cy="12" r="2.1" fill="${I}"/>`;
  },

  // Coated Optics — objective lens: barrel ring, iris with glint cutout.
  optics: (I) =>
    `<circle cx="12" cy="12" r="8.6" fill="none" stroke="${I}" stroke-width="2.1"/>` +
    `<path fill="${I}" fill-rule="evenodd" d="M12 6.8a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4Zm-1.8 1.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Z"/>`,

  // Binocular Telescope — twin barrels flaring into objectives, bridge.
  binoculars: (I) =>
    `<path fill="${I}" fill-rule="evenodd" d="M4.6 3.4h4.6l1 4.2a5 5 0 1 1-6.6 0Zm2.3 8.4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>` +
    `<path fill="${I}" fill-rule="evenodd" d="M14.8 3.4h4.6l1 4.2a5 5 0 1 1-6.6 0Zm2.3 8.4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>` +
    `<rect x="10.7" y="8.2" width="2.6" height="3.6" fill="${I}"/>`,

  // Camouflage Net — drape line with a hanging swag of diamond mesh cells.
  camo_net: (I) => {
    const d = (cx, cy, rx, ry) =>
      `M${cx} ${cy - ry}L${cx + rx} ${cy}L${cx} ${cy + ry}L${cx - rx} ${cy}Z`;
    return `<path d="M1.8 5q5.1-2.6 10.2 0t10.2 0" fill="none" stroke="${I}" stroke-width="1.9" stroke-linecap="round"/>` +
      `<g stroke="${I}" stroke-width="1.35" fill="none" stroke-linejoin="round">` +
      `<path d="${d(6.6, 9.8, 2.7, 3)}"/><path d="${d(12, 9.8, 2.7, 3)}"/>` +
      `<path d="${d(17.4, 9.8, 2.7, 3)}"/><path d="${d(9.3, 14.6, 2.7, 3)}"/>` +
      `<path d="${d(14.7, 14.6, 2.7, 3)}"/><path d="${d(12, 19.2, 2.7, 2.8)}"/>` +
      `</g>`;
  },

  // Improved Rotation — circular arrows around a turret hub.
  rotation: (I) =>
    `<path d="M5.4 8.4a7.6 7.6 0 0 1 13.5 1.2" fill="none" stroke="${I}" stroke-width="2"/>` +
    `<path fill="${I}" d="M21.6 6.2v5.4l-4.8-2.4Z"/>` +
    `<path d="M18.6 15.6a7.6 7.6 0 0 1-13.5-1.2" fill="none" stroke="${I}" stroke-width="2"/>` +
    `<path fill="${I}" d="M2.4 17.8v-5.4l4.8 2.4Z"/>` +
    `<circle cx="12" cy="12" r="2.4" fill="${I}"/>`,

  // Enhanced Suspension — leaf-spring pack: master leaf with curled end
  // eyes, two shorter leaves, center clamp (the wheel-plus-arcs draft read
  // as a Wi-Fi glyph — the eyes + clamp are what say "leaf spring").
  susp: (I) =>
    `<g fill="none" stroke="${I}" stroke-width="2" stroke-linecap="round">` +
    `<path d="M4.4 9.6Q12 5.4 19.6 9.6"/>` +
    `<path d="M6.4 13.2Q12 9.8 17.6 13.2"/>` +
    `<path d="M8.6 16.8Q12 14.6 15.4 16.8"/></g>` +
    `<circle cx="3.6" cy="11.4" r="1.9" fill="none" stroke="${I}" stroke-width="1.6"/>` +
    `<circle cx="20.4" cy="11.4" r="1.9" fill="none" stroke="${I}" stroke-width="1.6"/>` +
    `<rect x="10.7" y="6.2" width="2.6" height="12.4" fill="${I}"/>`,

  // Toolbox — wide chest: lid + body with a seam, center clasp, low handle
  // (deliberately flat proportions — an arched handle on a square body reads
  // as a padlock at small sizes).
  toolbox: (I) =>
    `<path fill="${I}" d="M3 8.6h18V12H3Z"/>` +
    `<path fill="${I}" d="M3 13.2h18V20H3Z"/>` +
    `<rect x="10.4" y="10.8" width="3.2" height="3.9" fill="${I}"/>` +
    `<path d="M9.6 8.4v-1a2.4 2.4 0 0 1 4.8 0v1" fill="none" stroke="${I}" stroke-width="1.7"/>`,

  // Spall Liner — armored shield with an inner lining layer.
  spall_liner: (I) =>
    `<path fill="${I}" fill-rule="evenodd" d="M12 1.8l8.6 3v7.4q0 6.6-8.6 10-8.6-3.4-8.6-10V4.8Zm0 2.8L6 6.7v5.5q0 4.8 6 7.5 6-2.7 6-7.5V6.7Z"/>` +
    `<path fill="${I}" d="M12 6.6l4.2 1.5v4.1q0 3.4-4.2 5.4-4.2-2-4.2-5.4V8.1Z"/>`,

  // Wet Ammo Rack — coolant droplet over two racked shells.
  wet_rack: (I) =>
    `<path fill="${I}" d="M12 1.6q3.5 4.5 3.5 6.7a3.5 3.5 0 1 1-7 0q0-2.2 3.5-6.7Z"/>` +
    `<path fill="${I}" d="M8.9 22.2v-6.6q0-1.6 1.75-3.2 1.75 1.6 1.75 3.2v6.6Zm4.7 0v-6.6q0-1.6 1.75-3.2 1.75 1.6 1.75 3.2v6.6Z"/>`,

  // Safety Fuel Tanks — jerrycan with the classic cross emboss (knocked out
  // of the silhouette with even-odd arms so it needs no second color).
  fuel_safety: (I) =>
    `<path fill="${I}" fill-rule="evenodd" d="M4 6.6h11.4L20 10.8v10.6H4Z` +
    `M6.2 10.8 7.4 9.2 17.8 17 16.6 18.6Z` +
    `M16.6 9.2 17.8 10.8 7.4 18.6 6.2 17Z"/>` +
    `<rect x="5" y="2.9" width="4.6" height="2.7" fill="${I}"/>` +
    `<rect x="11.2" y="3.6" width="7.8" height="2" fill="${I}"/>`,

  // Auto Extinguishers — fixed bottle discharging a spray fan from its
  // side nozzle (no hand lever — the point is that it fires itself).
  auto_ext: (I) =>
    `<path fill="${I}" d="M11.4 8h5.2a1.6 1.6 0 0 1 1.6 1.6v10.2a2 2 0 0 1-2 2h-4.4a2 2 0 0 1-2-2V9.6A1.6 1.6 0 0 1 11.4 8Z"/>` +
    `<rect x="12.6" y="5.2" width="2.8" height="2.4" fill="${I}"/>` +
    `<rect x="8.7" y="4.7" width="6.7" height="1.9" fill="${I}"/>` +
    `<path d="M7.4 5.6H4.2M8 2.9 5.4 1.7M8 8.3l-2.6 1.2" stroke="${I}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
};

/**
 * Inline SVG for an equipment item.
 * @param {string} id catalog item id (game/equipment.js)
 * @param {number} [size] rendered square size in px (crisp 20-48)
 * @param {string} [ink] fill/stroke color
 * @returns {string} '<svg …>…</svg>' or '' for unknown ids
 */
export function equipIconSVG(id, size = 24, ink = EQUIP_INK) {
  const g = GLYPHS[id];
  if (!g) return '';
  if (size < 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${g(ink)}</svg>`;
  }
  const frame =
    `<path d="M6 1.5h12L22.5 6v12L18 22.5H6L1.5 18V6Z" fill="none" ` +
    `stroke="${ink}" stroke-width="1.15" opacity=".28"/>` +
    `<path d="M2.2 8V6.3L6.3 2.2H8M16 21.8h1.7l4.1-4.1V16" fill="none" ` +
    `stroke="${ink}" stroke-width="1.35" stroke-linecap="round" opacity=".62"/>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">` +
    `${frame}<g transform="translate(3 3) scale(.75)">${g(ink)}</g></svg>`;
}

/** All catalog ids this set covers (icon-sheet tooling + selftest). */
export function equipIconIds() {
  return Object.keys(GLYPHS);
}
