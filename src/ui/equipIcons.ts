// Equipment icons (brand-ui BUI-F4). Copyright © 2026 Kevin B. Liu.
//
// One glyph per catalog item, drawn in the shared sprite (./icons/sprite.svg, ids eq*) with the house stroke, caps and
// joins. From 20 px up the glyph sits on a chamfered plate keyed to its category (firepower, recon, mobility,
// survival); the compact battle readout below 20 px draws the bare glyph for legibility.
// Consumers: the garage slot boxes and picker grid (garage.ts) and the battle HUD loadout readout (damagePanel.ts).

import { icon, iconInSvg, type IconId } from './icons/icon.ts';

/** Default ink, matching the HUD tray. */
const EQUIP_INK = 'rgba(238,244,250,0.86)';

type EquipmentIconCategory = 'firepower' | 'recon' | 'mobility' | 'survival';

const EQUIPMENT: Readonly<Record<string, readonly [IconId, EquipmentIconCategory]>> = Object.freeze({
  rammer: ['eqRammer', 'firepower'],
  vstab: ['eqVstab', 'firepower'],
  gld: ['eqGld', 'firepower'],
  vents: ['eqVents', 'firepower'],
  optics: ['eqOptics', 'recon'],
  binoculars: ['eqBinoculars', 'recon'],
  camo_net: ['eqCamoNet', 'recon'],
  rotation: ['eqRotation', 'mobility'],
  susp: ['eqSusp', 'mobility'],
  toolbox: ['eqToolbox', 'survival'],
  spall_liner: ['eqSpallLiner', 'survival'],
  wet_rack: ['eqWetRack', 'survival'],
  fuel_safety: ['eqFuelSafety', 'survival'],
  auto_ext: ['eqAutoExt', 'survival'],
});

const CATEGORY_ACCENT: Readonly<Record<EquipmentIconCategory, string>> = {
  firepower: '#d9a451',
  recon: '#79afc0',
  mobility: '#a4b66d',
  survival: '#c48e70',
};

/**
 * Inline SVG for an equipment item: the bare glyph below 20 px, the glyph on its category plate from 20 px.
 * Returns '' for unknown ids.
 */
export function equipIconSVG(id: string, size = 24, ink = EQUIP_INK): string {
  const entry = EQUIPMENT[id];
  if (!entry) return '';
  const [glyph, category] = entry;
  if (size < 20) {
    return icon(glyph, { size, color: ink }).replace('<svg ', `<svg data-equipment-icon="${id}" `);
  }
  const accent = CATEGORY_ACCENT[category];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" `
    + `data-equipment-icon="${id}" data-icon-category="${category}">`
    + `<path d="M4 1.5h16.5l2 2v16L20 22.5H3.5l-2-2V4Z" fill="${accent}" fill-opacity=".1" stroke="${accent}" `
    + 'stroke-opacity=".7" stroke-width="1.5" stroke-linejoin="miter"/>'
    + `<path d="M5 22.5h14" stroke="${accent}" stroke-width="1.5"/>${iconInSvg(glyph, 3.6, 3.6, 16.8, ink)}</svg>`;
}

/** All catalog ids this set covers (icon sheet and receipts). */
export function equipIconIds(): string[] {
  return Object.keys(EQUIPMENT);
}
