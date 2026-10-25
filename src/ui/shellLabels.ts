// The shell classes' names and codes (moved from garageDossier.ts in 250): the HUD, the Garage and Deploy read them
// here, so no surface imports another surface's module for a shell's name, and the glyphs (shellIcons.ts) stay free of
// strings for the pages that only draw them. Copyright © 2026 Kevin B. Liu.
import { t } from './i18n.ts';

// Ammunition type tags come from the vehicle spec data as canonical English
// codes (APFSDS, HEAT, HE, etc.). Translate the codes at the UI layer so the
// in-garage shell list shows a localized label while the simulation keeps the
// original enum value.
const SHELL_TYPE_I18N: Readonly<Record<string, string>> = Object.freeze({
  APFSDS: 'garage.shellType.APFSDS',
  'APFSDS-T': 'garage.shellType.APFSDS',
  APDS: 'garage.shellType.APDS',
  'APDS-T': 'garage.shellType.APDS',
  HEAT: 'garage.shellType.HEAT',
  'HEAT-MP': 'garage.shellType.HEAT',
  'HEAT-T': 'garage.shellType.HEAT',
  HESH: 'garage.shellType.HESH',
  HE: 'garage.shellType.HE',
  'HE-T': 'garage.shellType.HE',
  AP: 'garage.shellType.AP',
  APHE: 'garage.shellType.APHE',
  'APHE-T': 'garage.shellType.APHE',
  APCR: 'garage.shellType.APCR',
  'APCR-T': 'garage.shellType.APCR',
  GATGM: 'garage.shellType.GATGM',
  ATGM: 'garage.shellType.ATGM',
  STAFF: 'garage.shellType.STAFF',
  AMP: 'garage.shellType.AMP',
  HEP: 'garage.shellType.HEP',
});

/** The canonical type code (APFSDS-T reads APFSDS): what the HUD's ammo slots and scope readout print in every locale.
 *  At the 11 px type floor a slot holds five Chinese characters at most and the full names run to seven, so the slot
 *  prints the code, as the scope readout and the Chinese catalog's own tips do; its tooltip carries the full name. */
export function shellTypeCode(type: string): string {
  const key = SHELL_TYPE_I18N[type];
  return key ? key.slice(key.lastIndexOf('.') + 1) : type;
}

/** Resolve a shell type code to its localized label, falling back to the
 *  canonical English code when no translation key is registered. */
export function shellTypeLabel(type: string): string {
  if (!type) return '';
  const key = SHELL_TYPE_I18N[type];
  return key ? t(key) : type;
}
