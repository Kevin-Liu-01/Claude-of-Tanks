// src/ui/equipIcons.ts — EQUIPMENT SYSTEM icon set.
// One recognizable glyph per catalog item, refreshed into the shared armored
// UI language: a large white silhouette on a quiet, category-coded steel
// plate. All paths live on a 24x24 grid and are built from >=1.5px strokes /
// chunky fills so they stay crisp from 20 to 48 px. The compact 15px battle
// readout omits the plate to preserve maximum glyph legibility.
//
// equipIconSVG(id, size, ink) returns an inline <svg> string (or '' for
// unknown ids). Consumers: the garage slot boxes + picker grid (garage.ts)
// and the battle HUD loadout readout (damagePanel.ts).

/** Default ink — matches hud.ts TRAY_INK. */
const EQUIP_INK = 'rgba(238,244,250,0.86)';

// Each entry is the inner markup of a 24x24 viewBox, as a function of ink.
type EquipmentGlyph = (ink: string) => string;

type EquipmentIconCategory = 'firepower' | 'recon' | 'mobility' | 'survival';

const ICON_CATEGORY: Readonly<Record<string, EquipmentIconCategory>> = {
  rammer: 'firepower',
  vstab: 'firepower',
  gld: 'firepower',
  vents: 'firepower',
  optics: 'recon',
  binoculars: 'recon',
  camo_net: 'recon',
  rotation: 'mobility',
  susp: 'mobility',
  toolbox: 'survival',
  spall_liner: 'survival',
  wet_rack: 'survival',
  fuel_safety: 'survival',
  auto_ext: 'survival',
};

const CATEGORY_ACCENT: Readonly<Record<EquipmentIconCategory, string>> = {
  firepower: '#d9a451',
  recon: '#79afc0',
  mobility: '#a4b66d',
  survival: '#c48e70',
};

const GLYPHS: Readonly<Record<string, EquipmentGlyph>> = {
  // Gun Rammer — shell being driven forward by a double chevron.
  rammer: (I) =>
    `<path fill="${I}" d="M11 8.5h5.2q4.4.5 6.2 3.5-1.8 3-6.2 3.5H11Z"/>` +
    `<path fill="${I}" d="M2.2 7.2 7 12l-4.8 4.8v-2.7L4.3 12 2.2 9.9Zm3.8 0L10.8 12 6 16.8v-2.7L8.1 12 6 9.9Z"/>`,

  // Vertical Stabilizer — an unmistakable two-axis gun cradle / gyroscope.
  vstab: (I) =>
    `<path d="M4 5v4M4 5h4M20 5v4M20 5h-4M4 19v-4M4 19h4M20 19v-4M20 19h-4" ` +
    `fill="none" stroke="${I}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<ellipse cx="12" cy="12" rx="7.3" ry="3.3" fill="none" stroke="${I}" stroke-width="1.7" transform="rotate(-28 12 12)"/>` +
    `<path d="M12 3.2v17.6M6.2 12h11.6" fill="none" stroke="${I}" stroke-width="1.55" stroke-linecap="round"/>` +
    `<circle cx="12" cy="12" r="2.25" fill="${I}"/>`,

  // Gun Laying Drive — settling reticle: ring, center mass, hard outer ticks.
  gld: (I) =>
    `<circle cx="12" cy="12" r="6.3" fill="none" stroke="${I}" stroke-width="1.7"/>` +
    `<circle cx="12" cy="12" r="1.9" fill="${I}"/>` +
    `<path stroke="${I}" stroke-width="2" stroke-linecap="round" d="M12 2.2v3.4M12 18.4v3.4M2.2 12h3.4M18.4 12h3.4"/>`,

  // Improved Ventilation — square louvered housing around a three-blade fan.
  vents: (I) => {
    const petal = `M12 10.9C10 10.2 9 8.2 9.6 6.1c.5-1.6 4.3-1.6 4.8 0 .6 2.1-.4 4.1-2.4 4.8Z`;
    return `<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="2.2" fill="none" stroke="${I}" stroke-width="1.6"/>` +
      `<g fill="${I}"><path d="${petal}"/>` +
      `<path d="${petal}" transform="rotate(120 12 12)"/>` +
      `<path d="${petal}" transform="rotate(240 12 12)"/></g>` +
      `<circle cx="12" cy="12" r="2" fill="${I}"/>` +
      `<path d="M5.2 5.8h2.5M16.3 18.2h2.5" stroke="${I}" stroke-width="1.45" stroke-linecap="round"/>`;
  },

  // Coated Optics — side-on armored sight body with a bright objective lens.
  optics: (I) =>
    `<path fill="${I}" fill-rule="evenodd" d="M2.2 8.2h4.2l2.4-2.4h8.7l4.3 4v4.4l-4.3 4H8.8l-2.4-2.4H2.2Zm14.5.5a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z"/>` +
    `<circle cx="16.7" cy="12" r="1.35" fill="${I}"/>` +
    `<path d="M5.5 9.1v5.8" stroke="${I}" stroke-width="1.6" opacity=".55"/>`,

  // Binocular Telescope — twin barrels flaring into objectives, bridge.
  binoculars: (I) =>
    `<path fill="${I}" fill-rule="evenodd" d="M4.6 3.4h4.6l1 4.2a5 5 0 1 1-6.6 0Zm2.3 8.4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>` +
    `<path fill="${I}" fill-rule="evenodd" d="M14.8 3.4h4.6l1 4.2a5 5 0 1 1-6.6 0Zm2.3 8.4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>` +
    `<rect x="10.7" y="8.2" width="2.6" height="3.6" fill="${I}"/>`,

  // Camouflage Net — drape line with a hanging swag of diamond mesh cells.
  camo_net: (I) => {
    const d = (cx: number, cy: number, rx: number, ry: number): string =>
      `M${cx} ${cy - ry}L${cx + rx} ${cy}L${cx} ${cy + ry}L${cx - rx} ${cy}Z`;
    return `<path d="M1.8 5q5.1-2.6 10.2 0t10.2 0" fill="none" stroke="${I}" stroke-width="1.9" stroke-linecap="round"/>` +
      `<g stroke="${I}" stroke-width="1.35" fill="none" stroke-linejoin="round">` +
      `<path d="${d(6.6, 9.8, 2.7, 3)}"/><path d="${d(12, 9.8, 2.7, 3)}"/>` +
      `<path d="${d(17.4, 9.8, 2.7, 3)}"/><path d="${d(9.3, 14.6, 2.7, 3)}"/>` +
      `<path d="${d(14.7, 14.6, 2.7, 3)}"/><path d="${d(12, 19.2, 2.7, 2.8)}"/>` +
      `</g>`;
  },

  // Improved Rotation — circular arrows around a readable tank turret.
  rotation: (I) =>
    `<path d="M4.8 8.2A8.2 8.2 0 0 1 19 7" fill="none" stroke="${I}" stroke-width="1.8"/>` +
    `<path fill="${I}" d="M21.3 4.9v5.4l-4.8-2.4Z"/>` +
    `<path d="M19.2 15.8A8.2 8.2 0 0 1 5 17" fill="none" stroke="${I}" stroke-width="1.8"/>` +
    `<path fill="${I}" d="M2.7 19.1v-5.4l4.8 2.4Z"/>` +
    `<path fill="${I}" d="M8.2 11.1h7.6l1.8 2.2v2.2H6.4v-2.2Zm3-2.6h3.7v2.9h-3.7Z"/>`,

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
 * @param {string} id catalog item id (game/equipment.ts)
 * @param {number} [size] rendered square size in px (crisp 20-48)
 * @param {string} [ink] fill/stroke color
 * @returns {string} '<svg …>…</svg>' or '' for unknown ids
 */
export function equipIconSVG(id: string, size = 24, ink = EQUIP_INK): string {
  const g = GLYPHS[id];
  if (!g) return '';
  if (size < 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ` +
      `data-equipment-icon="${id}">${g(ink)}</svg>`;
  }
  const category = ICON_CATEGORY[id];
  const accent = CATEGORY_ACCENT[category];
  const plate =
    `<path d="M4.4 1.25h14.7l3.65 3.65v14.7l-3.15 3.15H4.9L1.25 19.1V4.4Z" ` +
    `fill="${accent}" fill-opacity=".105" stroke="${accent}" stroke-width="1.25" stroke-opacity=".7"/>` +
    `<path d="M4.8 3h11.4M3 7.8v8.4M7.8 21h11.1" fill="none" stroke="${ink}" ` +
    `stroke-width="1.05" stroke-linecap="round" opacity=".28"/>` +
    `<path d="M5.2 22.15h13.9" stroke="${accent}" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ` +
    `data-equipment-icon="${id}" data-icon-category="${category}">` +
    `${plate}<g transform="translate(2.35 2.35) scale(.804)">${g(ink)}</g></svg>`;
}

/** All catalog ids this set covers (icon-sheet tooling + selftest). */
export function equipIconIds(): string[] {
  return Object.keys(GLYPHS);
}
