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
const SHELL_ALIAS: Readonly<Record<string, string>> = Object.freeze({ HESH: 'HE', BEEHIVE: 'HE' });

/** Return a crisp inline SVG whose silhouette is specific to a shell class. */
export function shellIconSVG(type: string, size = 24, className = ''): string {
  const key = SHELL_ICON[type] ? type : SHELL_ICON[SHELL_ALIAS[type] ?? ''] ? SHELL_ALIAS[type] : 'AP';
  return icon(SHELL_ICON[key], { size, className }).replace('<svg ', `<svg data-shell-type="${key}" `);
}

export const shellIconTypes = (): string[] => Object.keys(SHELL_ICON);
