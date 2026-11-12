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
 * - 5 or 6 seats: 3 columns x 2 rows on a wide screen, 2 x 3 on a narrower one.
 * - 7 or 8 seats: 4 columns x 2 rows on a wide screen, 3 x 3 on a narrower one.
 * A pane never shrinks the HUD (Kevin, 2026-11-11: "dont squish the uis"): a screen whose panes would not hold the HUD's
 * core at its solo size splits for fewer seats (couchSplitCapacity: 6 on a 1080p screen); with more, the shared camera.
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

/** The grids a seat count may take, the screen's preferred shape first (a wide screen splits side by side). */
function gridCandidates(seats: number, wide: boolean): readonly { columns: number; rows: number }[] {
  if (seats === 1) return [{ columns: 1, rows: 1 }];
  if (seats === 2) return wide ? [{ columns: 2, rows: 1 }, { columns: 1, rows: 2 }] : [{ columns: 1, rows: 2 }, { columns: 2, rows: 1 }];
  if (seats <= 4) return [{ columns: 2, rows: 2 }];
  if (seats <= 6) return wide ? [{ columns: 3, rows: 2 }, { columns: 2, rows: 3 }] : [{ columns: 2, rows: 3 }, { columns: 3, rows: 2 }];
  return wide ? [{ columns: 4, rows: 2 }, { columns: 3, rows: 3 }] : [{ columns: 3, rows: 3 }, { columns: 4, rows: 2 }];
}

/** A grid's cell on the screen, CSS px (the gutters out). */
function cellOf(grid: { columns: number; rows: number }, width: number, height: number, gutter = PANE_GUTTER_PX): { width: number; height: number } {
  return {
    width: Math.floor((width - gutter * (grid.columns - 1)) / grid.columns),
    height: Math.floor((height - gutter * (grid.rows - 1)) / grid.rows),
  };
}

/**
 * The smallest pane that holds the HUD's core at the solo HUD's own pixel size, CSS px (measured 2026-11-11 with
 * tools/couch-panes.browser.mjs: the damage panel 16-176, the speed gauge 184-292 and the shell slots 305-509 across, a
 * rack the layout moves right to clear the gauge, with the right margin; the panel's 203 px over its 16 px foot under the
 * 44 px score band, with a gap). Kevin, 2026-11-11: "dont squish the uis"; a screen too small for more panes seats fewer.
 */
export const CORE_MIN_CELL = Object.freeze({ width: 528, height: 272 });
const holdsCore = (cell: { width: number; height: number }): boolean => cell.width >= CORE_MIN_CELL.width && cell.height >= CORE_MIN_CELL.height;

/** The grid for `count` seats on a `width` x `height` screen (columns x rows): the screen's preferred shape whose cell
 *  holds the core at the solo size, or the preferred shape when none does (couchSplitCapacity keeps a battle from that). */
export function couchPaneGrid(count: number, width: number, height: number): { columns: number; rows: number } {
  const seats = Math.max(1, Math.min(MAX_COUCH_PANES, Math.floor(count) || 1));
  const candidates = gridCandidates(seats, width / Math.max(1, height) >= SIDE_BY_SIDE_ASPECT);
  return candidates.find((grid) => holdsCore(cellOf(grid, width, height))) ?? candidates[0];
}

/** The most seats the split screen shows on a `width` x `height` screen: the largest count whose grid's cell holds the
 *  core at the solo size (one rule from the screen: six at 1080p, eight on a screen that fits them). */
export function couchSplitCapacity(width: number, height: number): number {
  for (let seats = MAX_COUCH_PANES; seats > 1; seats--) {
    if (holdsCore(cellOf(couchPaneGrid(seats, width, height), width, height))) return seats;
  }
  return 1;
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
 * The HUD's parts in the order a pane keeps them (most important first). Kevin, 2026-11-11: "dont squish the uis": a
 * pane's HUD is the solo HUD at the solo HUD's pixel size, never scaled to fit. A pane too small for every part gives up
 * parts from the end of this list, the team lists first, then the minimap, then the consumables row; the core (the
 * sight, hull points, ammunition and reload, speed) is never given up.
 */
export const COUCH_HUD_PRIORITY = [
  'sight', // the reticle, the reload, the gun marker and the hit marks
  'health', // hull points and the damage panel's modules and crew
  'ammunition', // the shell slots, their counts and the reload
  'speed', // the speedometer
  'hits', // the direction of a hit taken, the damage dealt
  'objective', // the score, the clock and the capture or mode state
  'messages', // the kill feed and the battle's alerts
  'furniture', // the vehicle systems row, the network and frame chips, the hints
  'consumables', // the consumables row
  'minimap',
  'rosters', // the team strip and the side rosters
] as const;
export type CouchHudPart = (typeof COUCH_HUD_PRIORITY)[number];

/** The core: never given up, at full size, whatever the pane. */
export const COUCH_HUD_CORE: readonly CouchHudPart[] = ['sight', 'health', 'ammunition', 'speed'];

/** One part's measured state in a pane's HUD (its panels' box, CSS px in the pane's own document). */
export interface CouchHudPartBox {
  readonly part: CouchHudPart;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** The part is drawn under its solo size (the minimap capped by a short pane): it does not fit as it is. */
  readonly squeezed?: boolean;
}

/** The overlap the fit tolerates between two parts' boxes, CSS px (anti-aliased edges and shadows). */
const FIT_SLACK_PX = 2;

/**
 * The fit (one step): whether a pane's HUD fits as it stands (no two parts' panels overlap, none leaves the pane, none
 * is squeezed under its solo size), and if not, the part to give up next: the least important part in a clash, by
 * COUCH_HUD_PRIORITY, never one of the core. `coreFits` is false when only core parts clash.
 */
export function couchHudFitStep(boxes: readonly CouchHudPartBox[], width: number, height: number,
  dropped: ReadonlySet<CouchHudPart>, pairs?: string[]): { fits: boolean; drop: CouchHudPart | null; coreFits: boolean; clashing: readonly CouchHudPart[] } {
  const shown = boxes.filter((box) => !dropped.has(box.part));
  // the parts in a clash: two parts' panels over each other, a panel off the pane, a panel squeezed under its solo size
  const clashing = new Set<CouchHudPart>();
  for (let i = 0; i < shown.length; i++) {
    const a = shown[i];
    if (a.squeezed || a.x0 < -FIT_SLACK_PX || a.y0 < -FIT_SLACK_PX || a.x1 > width + FIT_SLACK_PX || a.y1 > height + FIT_SLACK_PX) {
      clashing.add(a.part);
      pairs?.push(`${a.part}:${a.squeezed ? 'squeezed' : 'off-pane'}`);
    }
    for (let j = i + 1; j < shown.length; j++) {
      const b = shown[j];
      if (a.part === b.part) continue;
      if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > FIT_SLACK_PX && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > FIT_SLACK_PX) {
        clashing.add(a.part);
        clashing.add(b.part);
        pairs?.push(`${a.part}+${b.part}`);
      }
    }
  }
  if (!clashing.size) return { fits: true, drop: null, coreFits: true, clashing: [] };
  // the least important part in a clash goes (giving up one that clashes with nothing would not make room)
  for (let i = COUCH_HUD_PRIORITY.length - 1; i >= 0; i--) {
    const part = COUCH_HUD_PRIORITY[i];
    if (COUCH_HUD_CORE.includes(part)) break;
    if (clashing.has(part)) return { fits: false, drop: part, coreFits: true, clashing: [...clashing] };
  }
  return { fits: false, drop: null, coreFits: false, clashing: [...clashing] };
}

/**
 * The world's detail for a pane, one rule tied to its pixel area (Main's review, 2026-11-11): `areaFraction` is the
 * pane's share of the screen (1 whole, 0.5 a half, 0.25 a quarter, about 0.11 a 3 x 3 ninth). Every knob follows the
 * pane's linear size, the square root of that share, so a pane a third of the screen's width draws its world a third
 * as far in detail:
 * - renderScale: the scene's raster against the pane's own pixels (FSR reconstructs the pane), 1 down to 0.6;
 * - lodBias: how much sooner a hull takes its far meshes (fewer parts and draws), 1 up to 3;
 * - density: the tall grass's share of its couch-tier sward, 1 down to 0.33 (the couch tier's 0.1 times this);
 * - shadowReachM and shadowMapSize: the cascades' reach and maps (one fit for every pane), 240 m down to 80 m;
 * - drawDistanceM: past this a pane's draw leaves the world's detail categories out (couchPaneViews.ts).
 */
export interface CouchPaneDetail {
  readonly renderScale: number;
  readonly lodBias: number;
  readonly density: number;
  readonly shadowReachM: number;
  readonly shadowMapSize: number;
  readonly drawDistanceM: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function couchPaneDetail(areaFraction: number): CouchPaneDetail {
  const size = Math.max(0.2, Math.min(1, Math.sqrt(Number.isFinite(areaFraction) ? areaFraction : 1)));
  return {
    renderScale: round2(Math.max(0.6, Math.min(1, 0.5 + 0.5 * size))),
    lodBias: round2(1 / size),
    density: round2(size),
    shadowReachM: Math.round(240 * size),
    shadowMapSize: size >= 0.7 ? 1024 : 512,
    drawDistanceM: Math.round(1500 * size),
  };
}

/** A layout's pane share of the screen (couchPaneDetail's input). */
export function couchPaneAreaFraction(count: number, width: number, height: number): number {
  const pane = couchPaneLayout(count, width, height).panes[0];
  return (pane.width * pane.height) / Math.max(1, width * height);
}
