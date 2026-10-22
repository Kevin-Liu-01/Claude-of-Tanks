// Compatibility layer for the shared UI icon calls (brand-ui BUI-F4). Copyright © 2026 Kevin B. Liu.
//
// The glyphs moved into the one sprite (./icons/sprite.svg) behind the icon() component (./icons/icon.ts). Existing
// surfaces keep calling uiIconSVG(id, size, color, className) and now render the redrawn set; each surface package
// moves to icon() directly as it is rebuilt. Retired ids resolve through ALIASES.

import { icon, iconInSvg, type IconId } from './icons/icon.ts';
import { ICON_IDS } from './icons/spriteIndex.ts';

/** Ids a retired glyph maps to. */
const ALIASES = Object.freeze({ tick: 'check' } as const satisfies Readonly<Record<string, IconId>>);

export type UiIconId = IconId | keyof typeof ALIASES;

const resolve = (id: string): IconId => ((ALIASES as Readonly<Record<string, IconId>>)[id] ?? id) as IconId;

/** Return the shared icon markup for a UI id ('' for an empty id). */
export function uiIconSVG(id: string, size = 24, color = 'currentColor', className = ''): string {
  return id ? icon(resolve(id), { size, color, className }) : '';
}

/** A UI glyph placed inside another SVG drawing at (x, y), `size` units square (medallions, plates). */
export function uiIconInSvg(id: string, x: number, y: number, size: number, color = ''): string {
  return id ? iconInSvg(resolve(id), x, y, size, color) : '';
}

/** Every id uiIconSVG accepts (receipts and the icon sheet). */
export function uiIconIds(): string[] {
  return [...ICON_IDS, ...Object.keys(ALIASES)];
}
