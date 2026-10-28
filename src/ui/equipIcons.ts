// Item badges: equipment and consumables (brand-ui BUI-F4; consumables 261). Copyright © 2026 Kevin B. Liu.
//
// One glyph per catalog item, drawn in the shared sprite (./icons/sprite.svg: eq* for equipment, cs* for consumables) with
// the house stroke, caps and joins. From 20 px up the glyph sits on the one chamfered badge, framed in its category's
// colour (tokens.json component.surface-badge, read from its own module so the boot's tokens.ts carries none); the
// compact readouts below 20 px draw the bare glyph for legibility (its 16-unit master).
// Consumers: the Garage's slot boxes and pickers (garage.ts, garageConsumables.ts), the battle HUD's loadout readout
// (damagePanel.ts) and the Field Manual's equipment and consumable lists (docs/chapters/tanks.ts).

import { icon, iconInSvg, type IconId } from './icons/icon.ts';
import { SURFACE_TOKENS } from './tokens/surface-badge.ts';
import { CONSUMABLE_ICONS } from '../game/consumableLoadout.ts';
import { CONSUMABLE_BY_ID } from '../sim/consumableRules.ts';

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

/** A badge category's frame colour: its surface-badge token (badge-equip-<category> or badge-cons-<category>). */
const accentOf = (token: string): string => (SURFACE_TOKENS as Readonly<Record<string, string>>)[token] ?? EQUIP_INK;

/**
 * The one badge: the bare glyph below 20 px, the glyph on its category's chamfered plate from 20 px. `item` names the
 * data attribute that identifies it (data-equipment-icon or data-consumable-icon).
 */
function badgeSVG(glyph: IconId, category: string, token: string, item: string, size: number, ink: string): string {
  if (size < 20) return icon(glyph, { size, color: ink }).replace('<svg ', `<svg ${item} `);
  const accent = accentOf(token);
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" `
    + `${item} data-icon-category="${category}">`
    + `<path d="M4 1.5h16.5l2 2v16L20 22.5H3.5l-2-2V4Z" fill="${accent}" fill-opacity=".1" stroke="${accent}" `
    + 'stroke-opacity=".7" stroke-width="1.5" stroke-linejoin="miter"/>'
    + `<path d="M5 22.5h14" stroke="${accent}" stroke-width="1.5"/>${iconInSvg(glyph, 3.6, 3.6, 16.8, ink)}</svg>`;
}

/** An equipment item's sprite glyph (null for an unknown id): the kit's chips draw it in their own ink. */
export function equipIconId(id: string): IconId | null {
  return EQUIPMENT[id]?.[0] ?? null;
}

/**
 * Inline SVG for an equipment item: the bare glyph below 20 px, the glyph on its category plate from 20 px.
 * Returns '' for unknown ids.
 */
export function equipIconSVG(id: string, size = 24, ink = EQUIP_INK): string {
  const entry = EQUIPMENT[id];
  if (!entry) return '';
  const [glyph, category] = entry;
  return badgeSVG(glyph, category, `badge-equip-${category}`, `data-equipment-icon="${id}"`, size, ink);
}

/**
 * Inline SVG for a consumable (sim/consumableRules.ts CONSUMABLE_CATALOG): its glyph (game/consumableLoadout.ts
 * CONSUMABLE_ICONS) on the same badge, framed in its category's colour. Returns '' for unknown ids.
 */
export function consumableIconSVG(id: string, size = 24, ink = EQUIP_INK): string {
  const item = CONSUMABLE_BY_ID.get(id);
  if (!item) return '';
  return badgeSVG(CONSUMABLE_ICONS[item.id], item.category, `badge-cons-${item.category}`, `data-consumable-icon="${id}"`, size, ink);
}

/** All catalog ids this set covers (icon sheet and receipts). */
export function equipIconIds(): string[] {
  return Object.keys(EQUIPMENT);
}
