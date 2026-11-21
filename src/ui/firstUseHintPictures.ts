/**
 * firstUseHintPictures.ts — each first-use hint's picture, 64 x 48, drawn from the game's own parts (mobile-hud-274):
 * the armour overlay's colours (game/armorShadeColors.ts), the HUD's tile glyphs (the sprite, uiIcons.ts), the reload
 * readout's figure in its ink. First-party SVG only; the notice kit sets it after a hint's words (notice.ts media).
 * Copyright © 2026 Kevin B. Liu.
 */
import { ARMOR_SHADE_EDGE, ARMOR_SHADE_PASSES, ARMOR_SHADE_STOPS } from '../game/armorShadeColors.ts';
import { uiIconInSvg } from './uiIcons.ts';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const W = 64, H = 48;
const frame = (body: string) => `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">`
  + `<rect width="${W}" height="${H}" rx="3" fill="#0b1116"/>${body}</svg>`;
const sightMarks = '<path d="M32 4V12M32 44V40M4 24H9M60 24H55" stroke="#f6f3ec" stroke-opacity=".35" stroke-width="1"/>';
const plate = (points: string, fill: string) =>
  `<polygon points="${points}" fill="${fill}" fill-opacity=".9" stroke="#05080b" stroke-opacity=".55" stroke-width=".7"/>`;
/** A HUD tile: the slot's plate and edge, a glyph on it. */
const tile = (x: number, y: number, size: number, glyph: string, edge = '#f6f3ec', edgeOpacity = '.38') =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" fill="#161b21" stroke="${edge}" stroke-opacity="${edgeOpacity}"/>`
  + uiIconInSvg(glyph, x + size * 0.2, y + size * 0.2, size * 0.6, '#f6f3ec');

/** A tank head-on in the gunner's sight: turret and mantlet stop the round (red), glacis and lower plate take it
 *  (green), the skirts at the edge (amber), as the overlay paints a hull in the sight. */
export function shadedHullPicture(): string {
  const stops = hex(ARMOR_SHADE_STOPS), edge = hex(ARMOR_SHADE_EDGE), passes = hex(ARMOR_SHADE_PASSES);
  return frame(sightMarks
    + plate('4,41 12,41 12,31 6,31', edge) + plate('60,41 52,41 52,31 58,31', edge)
    + plate('12,41 52,41 50,34 14,34', passes) + plate('14,34 50,34 45,26 19,26', passes)
    + plate('20,26 44,26 40,16 24,16', stops) + plate('28,25 36,25 35,18 29,18', stops)
    + '<circle cx="32" cy="21" r="1.8" fill="#05080b"/>'
    + '<circle cx="32" cy="24" r="17" fill="none" stroke="#f6f3ec" stroke-opacity=".18" stroke-width="1"/>');
}

/** A module knocked out (the damage panel's red module) and the repair kit's tile that brings it back. */
export function moduleRepairPicture(): string {
  const stops = hex(ARMOR_SHADE_STOPS);
  return frame('<rect x="6" y="12" width="26" height="24" rx="3" fill="none" stroke="#f6f3ec" stroke-opacity=".3"/>'
    + `<rect x="9" y="15" width="20" height="18" rx="2" fill="${stops}" fill-opacity=".22" stroke="${stops}" stroke-width="1.2"/>`
    + uiIconInSvg('engine', 12, 17, 14, stops)
    + '<path d="M35 24H39" stroke="#f6f3ec" stroke-opacity=".5" stroke-width="1.4"/><path d="M38 21L41 24L38 27" fill="none" stroke="#f6f3ec" stroke-opacity=".5" stroke-width="1.4"/>'
    + tile(42, 12, 24 - 2, 'repair', '#f0a030', '.9'));
}

/** The reload readout as the sight shows it: the next reload's figure in its grey ink by the reticle, on its halo. */
export function reloadPicture(): string {
  const text = (x: number, size: number, body: string) => `<text x="${x}" y="31" font-family="IBM Plex Sans,system-ui,sans-serif" `
    + `font-weight="600" font-size="${size}" fill="var(--ink-2,#c9c5bb)" stroke="rgba(5,8,11,.88)" stroke-width="3" paint-order="stroke">${body}</text>`;
  return frame('<circle cx="18" cy="24" r="9" fill="none" stroke="#f6f3ec" stroke-opacity=".45" stroke-width="1"/>'
    + '<path d="M18 13V18M18 30V35M7 24H12M24 24H29" stroke="#f6f3ec" stroke-opacity=".45" stroke-width="1"/>'
    + text(31, 16, '6.0') + text(55, 11, 's'));
}

/** Auto-aim's lock: its glyph on a target bracketed in the sight. */
export function autoAimPicture(): string {
  return frame(sightMarks
    + '<path d="M20 14H16V18M44 14H48V18M20 34H16V30M44 34H48V30" fill="none" stroke="#f0a030" stroke-width="1.6"/>'
    + uiIconInSvg('autoAim', 22, 14, 20, '#f6f3ec'));
}

/** Hydropneumatic aim: the hull from the side, level (faint) and tilted to lay its gun (solid). */
export function suspensionPicture(): string {
  const hull = (opacity: string, transform: string) => `<g transform="${transform}" opacity="${opacity}">`
    + '<path d="M10 30H46L50 26H14Z" fill="#c9c5bb"/><rect x="20" y="20" width="16" height="6" rx="1" fill="#c9c5bb"/>'
    + '<path d="M36 22H56" stroke="#c9c5bb" stroke-width="2"/>'
    + '<path d="M12 31H44" stroke="#c9c5bb" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 6"/></g>';
  return frame('<path d="M4 40H60" stroke="#f6f3ec" stroke-opacity=".3"/>' + hull('.28', 'translate(0 4)')
    + hull('1', 'translate(0 4) rotate(-9 28 30)')
    + '<path d="M54 34A10 10 0 0 0 52 26" fill="none" stroke="#f0a030" stroke-width="1.4"/>');
}

/** An ability's own tile: the roof gun's, the drone's, Air Support's. */
export function abilityPicture(glyph: string): string {
  return frame(tile(18, 8, 32, glyph));
}

/** The rack's rounds, one tile each, the first selected. */
export function ammoPicture(): string {
  return frame(tile(3, 13, 18, 'shell', '#f0a030', '.9') + tile(23, 13, 18, 'shell') + tile(43, 13, 18, 'shell'));
}
