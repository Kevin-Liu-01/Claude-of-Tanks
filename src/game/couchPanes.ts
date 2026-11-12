/**
 * Couch mode's split screen, the pure part (docs/COUCH-MODE.md phase 2): how the big screen splits into one pane per
 * seated player, how large each pane's HUD is laid out and drawn, and which HUD parts a small pane gives up. DOM-free;
 * src/app/couchPaneViews.ts places the panes, their cameras and their HUDs by these numbers.
 *
 * Layout (the owner's, 2026-11-11: "1 = full screen, 2 = side by side (or stacked, by aspect), 3-4 = a 2x2 grid, 5-8 =
 * a 3x3 or 2x4 grid"):
 * - 1 seat: the whole screen.
 * - 2 seats: side by side on a screen at least SIDE_BY_SIDE_ASPECT wide (every TV and laptop), stacked on a narrower one.
 * - 3 or 4 seats: a 2 x 2 grid.
 * - 5 to 8 seats: 4 columns x 2 rows on a wide screen, 3 x 3 on a narrower one.
 * Every pane of a layout is the same size (the post chain is sized once for all of them); a cell no seat takes is a
 * spare, which the screen shows dark with the battle's score.
 */

export interface CouchPaneRect {
  /** CSS pixels from the screen's top left. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CouchPaneLayout {
  readonly columns: number;
  readonly rows: number;
  /** One rectangle per seat, in seat order (left to right, then top to bottom). */
  readonly panes: readonly CouchPaneRect[];
  /** The grid's cells no seat takes. */
  readonly spares: readonly CouchPaneRect[];
}

/** The most panes the split screen draws (the lobby's eight seats). */
const MAX_COUCH_PANES = 8;
/** A screen at least this wide (width / height) splits two seats side by side and five to eight into 4 x 2. */
const SIDE_BY_SIDE_ASPECT = 1.6;
/** The dark line between panes, CSS px. */
export const PANE_GUTTER_PX = 2;

/** The grid for `count` seats on a `width` x `height` screen (columns x rows). */
export function couchPaneGrid(count: number, width: number, height: number): { columns: number; rows: number } {
  const seats = Math.max(1, Math.min(MAX_COUCH_PANES, Math.floor(count) || 1));
  const wide = width / Math.max(1, height) >= SIDE_BY_SIDE_ASPECT;
  if (seats === 1) return { columns: 1, rows: 1 };
  if (seats === 2) return wide ? { columns: 2, rows: 1 } : { columns: 1, rows: 2 };
  if (seats <= 4) return { columns: 2, rows: 2 };
  return wide ? { columns: 4, rows: 2 } : { columns: 3, rows: 3 };
}

/** Split the screen for `count` seats: equal panes with a gutter between, the grid centred on the screen. */
export function couchPaneLayout(count: number, width: number, height: number, gutter = PANE_GUTTER_PX): CouchPaneLayout {
  const seats = Math.max(1, Math.min(MAX_COUCH_PANES, Math.floor(count) || 1));
  const { columns, rows } = couchPaneGrid(seats, width, height);
  const paneW = Math.max(1, Math.floor((width - gutter * (columns - 1)) / columns));
  const paneH = Math.max(1, Math.floor((height - gutter * (rows - 1)) / rows));
  const left = Math.floor((width - (paneW * columns + gutter * (columns - 1))) / 2);
  const top = Math.floor((height - (paneH * rows + gutter * (rows - 1))) / 2);
  const panes: CouchPaneRect[] = [];
  const spares: CouchPaneRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const rect = { x: left + column * (paneW + gutter), y: top + row * (paneH + gutter), width: paneW, height: paneH };
      (panes.length < seats ? panes : spares).push(rect);
    }
  }
  return { columns, rows, panes, spares };
}

/**
 * How a pane's HUD is drawn: laid out at `layoutWidth` x `layoutHeight` CSS px (its own document's viewport, so the
 * HUD's own bands and layouts apply) and drawn at `scale` into the pane. The scale follows the pane's height by its
 * square root, so a half-height pane's type is 0.75 of the solo HUD's, not half: the HUD shrinks slower than the pane and
 * stays readable from a couch. It never draws larger than the solo HUD.
 */
interface CouchHudScale {
  readonly scale: number;
  readonly layoutWidth: number;
  readonly layoutHeight: number;
}

/** The screen height the solo HUD is drawn 1:1 at (a 1080p television). */
const HUD_REFERENCE_HEIGHT = 1080;
/** The smallest scale a pane's HUD is drawn at. */
export const HUD_MIN_SCALE = 0.75;

export function couchHudScale(pane: Pick<CouchPaneRect, 'width' | 'height'>): CouchHudScale {
  const scale = Math.max(HUD_MIN_SCALE, Math.min(1, Math.sqrt(pane.height / HUD_REFERENCE_HEIGHT)));
  return {
    scale: Math.round(scale * 1000) / 1000,
    layoutWidth: Math.round(pane.width / scale),
    layoutHeight: Math.round(pane.height / scale),
  };
}

/**
 * The HUD's parts in the order a pane keeps them (most important first). A pane too small for the whole HUD gives up
 * parts from the end of this list, never ad hoc: the tiers below name how far down the list a pane's HUD keeps.
 */
export const COUCH_HUD_PRIORITY = [
  'sight', // the reticle, the reload, the gun marker and the hit marks: never given up
  'health', // hull points and the damage panel's modules and crew
  'ammunition', // the shell slots and their counts
  'hits', // the direction of a hit taken, the damage dealt
  'objective', // the score, the clock and the capture or mode state
  'minimap',
  'consumables',
  'messages', // the kill feed and the battle's alerts
  'rosters', // the team strip and the side rosters
  'furniture', // key caps, the network and frame chips, the hints
] as const;
type CouchHudPart = (typeof COUCH_HUD_PRIORITY)[number];

/** A pane's HUD tier: how many parts of COUCH_HUD_PRIORITY it keeps. */
export type CouchHudTier = 'full' | 'compact' | 'small' | 'least';

const TIER_KEEPS: Readonly<Record<CouchHudTier, number>> = { full: 10, compact: 8, small: 5, least: 4 };

/** Under this layout width the HUD's own mouse layout leaves the minimap no room beside the ammunition rack (its
 *  --hud-map-max goes negative under the tablet band, battleHudLayout.ts): the small tier gives the map up by the list. */
const MAP_ROOM_MIN_WIDTH = 768;

/**
 * The minimum pane: a pane's HUD laid out under MIN_PANE_LAYOUT (CSS px, after its scale) keeps only the sight, health,
 * ammunition and hits. The 4 x 2 grid on a 1080p screen (478 x 539, laid out at 637 x 719) is above it: small.
 */
export const MIN_PANE_LAYOUT = Object.freeze({ width: 480, height: 300 });

/** The tier for a pane's HUD laid out at `layout` (couchHudScale's layout size). */
export function couchHudTier(layout: { readonly layoutWidth: number; readonly layoutHeight: number }): CouchHudTier {
  const { layoutWidth: w, layoutHeight: h } = layout;
  if (w < MIN_PANE_LAYOUT.width || h < MIN_PANE_LAYOUT.height) return 'least';
  if (w < MAP_ROOM_MIN_WIDTH || h < 480) return 'small';
  if (w < 1100 || h < 640) return 'compact';
  return 'full';
}

/** The parts a tier gives up (the tail of COUCH_HUD_PRIORITY past what it keeps). */
export function couchHudHidden(tier: CouchHudTier): readonly CouchHudPart[] {
  return COUCH_HUD_PRIORITY.slice(TIER_KEEPS[tier]);
}
