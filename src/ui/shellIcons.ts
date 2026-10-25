// Ammunition silhouettes for technical cards (brand-ui BUI-F4). Copyright © 2026 Kevin B. Liu.
// Each shell class keeps the same envelope in the shared sprite while the nose, body, sabot or standoff profile
// carries the recognition signal; outline only, in the surrounding text colour.

import { icon, type IconId } from './icons/icon.ts';

const SHELL_ICON: Readonly<Record<string, IconId>> = Object.freeze({
  AP: 'shellAp',
  APCR: 'shellApcr',
  APFSDS: 'shellApfsds',
  HEAT: 'shellHeat',
  HE: 'shellHe',
  ATGM: 'shellAtgm',
});
/** Rounds drawn with a sibling's silhouette (same envelope, same reading at card size). */
const SHELL_ALIAS: Readonly<Record<string, string>> = Object.freeze({
  HESH: 'HE', BEEHIVE: 'HE', APC: 'AP', APBC: 'AP', APCBC: 'AP', APHE: 'AP', HVAP: 'APCR', APDS: 'APFSDS', 'HEAT-FS': 'HEAT',
});

/** The sprite glyph of a shell class (an alias draws its sibling's; an unknown type the AP envelope). */
export function shellIconId(type: string): IconId {
  const code = String(type || '').toUpperCase();
  return SHELL_ICON[code] ?? SHELL_ICON[SHELL_ALIAS[code] ?? ''] ?? (/ATGM|MISSILE/.test(code) ? 'shellAtgm' : 'shellAp');
}

/** Return a crisp inline SVG whose silhouette is specific to a shell class. */
export function shellIconSVG(type: string, size = 24, className = ''): string {
  const id = shellIconId(type);
  const key = Object.keys(SHELL_ICON).find((code) => SHELL_ICON[code] === id) ?? 'AP';
  return icon(id, { size, className }).replace('<svg ', `<svg data-shell-type="${key}" `);
}

export const shellIconTypes = (): string[] => Object.keys(SHELL_ICON);
