// Equipment icons (brand-ui BUI-F4). Copyright © 2026 Kevin B. Liu.
//
// One glyph per catalog item, drawn in the shared sprite (./icons/sprite.svg, ids eq*) with the house stroke, caps and
// joins. From 20 px up the glyph sits on a chamfered plate that names its category (firepower, mobility, protection,
// survival, recon: its data-icon-category) drawn in the surrounding ink; the compact battle readout below 20 px draws the bare
// glyph for legibility.
// Consumers: the garage slot boxes and picker grid (garage.ts) and the battle HUD loadout readout (damagePanel.ts).

import { icon, iconInSvg, type IconId } from './icons/icon.ts';

/** Default ink, matching the HUD tray. */
const EQUIP_INK = 'rgba(238,244,250,0.86)';

type EquipmentIconCategory = 'firepower' | 'recon' | 'mobility' | 'protection' | 'survival';

const EQUIPMENT: Readonly<Record<string, readonly [IconId, EquipmentIconCategory]>> = Object.freeze({
  rammer: ['eqRammer', 'firepower'],
  vstab: ['eqVstab', 'firepower'],
  gld: ['eqGld', 'firepower'],
  vents: ['eqVents', 'firepower'],
  ready_rack: ['eqReadyRack', 'firepower'],
  fire_control: ['eqFireControl', 'firepower'],
  loader_kit: ['eqLoaderKit', 'firepower'],
  rotation: ['eqRotation', 'mobility'],
  susp: ['eqSusp', 'mobility'],
  turret_drive: ['eqTurretDrive', 'mobility'],
  drivetrain: ['eqDrivetrain', 'mobility'],
  spall_liner: ['eqSpallLiner', 'protection'],
  skirts: ['eqSkirts', 'protection'],
  ring_guard: ['eqRingGuard', 'protection'],
  mantlet_shield: ['eqMantletShield', 'protection'],
  toolbox: ['eqToolbox', 'survival'],
  wet_rack: ['eqWetRack', 'survival'],
  fuel_safety: ['eqFuelSafety', 'survival'],
  auto_ext: ['eqAutoExt', 'survival'],
  fire_blankets: ['eqFireBlankets', 'survival'],
  optics: ['eqOptics', 'recon'],
  binoculars: ['eqBinoculars', 'recon'],
  camo_net: ['eqCamoNet', 'recon'],
  exhaust_baffles: ['eqExhaustBaffles', 'recon'],
  thermal_sight: ['eqThermalSight', 'recon'],
});


/**
 * Inline SVG for an equipment item: the bare glyph below 20 px, the glyph on its category plate from 20 px.
 * Returns '' for unknown ids.
 */
/** An equipment item's sprite glyph (null for an unknown id): the kit's chips draw it in their own ink. */
export function equipIconId(id: string): IconId | null {
  return EQUIPMENT[id]?.[0] ?? null;
}

export function equipIconSVG(id: string, size = 24, ink = EQUIP_INK): string {
  const entry = EQUIPMENT[id];
  if (!entry) return '';
  const [glyph, category] = entry;
  if (size < 20) {
    return icon(glyph, { size, color: ink }).replace('<svg ', `<svg data-equipment-icon="${id}" `);
  }
  // the plate is the ink's, every category alike (the 261 critic: five category hues, the firepower gold beside the accent,
  // read as marks of choice on unchosen tiles; the kit's colour exceptions are Settings and the mode glyphs)
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" `
    + `data-equipment-icon="${id}" data-icon-category="${category}">`
    + '<path d="M4 1.5h16.5l2 2v16L20 22.5H3.5l-2-2V4Z" fill="currentColor" fill-opacity=".06" stroke="currentColor" '
    + 'stroke-opacity=".4" stroke-width="1.5" stroke-linejoin="miter"/>'
    + `<path d="M5 22.5h14" stroke="currentColor" stroke-opacity=".55" stroke-width="1.5"/>${iconInSvg(glyph, 3.6, 3.6, 16.8, ink)}</svg>`;
}

/** All catalog ids this set covers (icon sheet and receipts). */
export function equipIconIds(): string[] {
  return Object.keys(EQUIPMENT);
}
