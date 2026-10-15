/**
 * Touch action dock: where the vehicle-controls row ("the stuff you can do": jump, special action, drone, missile,
 * smoke, lights, roof gun) sits on a phone or tablet, and how its cooldowns read.
 *
 * The desktop strip is a 74 x 32 px text row. On touch it used to be the same row at 44 px with 9 px labels, placed
 * above the ammo selector and scrolled sideways under a hidden scrollbar once five controls no longer fit, so on a
 * 360 px phone the last controls were simply off-screen. The dock instead lays the controls out as 48 px icon tiles
 * in reading order (the first control is the top-left tile, so the row's own order decides what comes first), wraps
 * into a second row only when no single row fits, and never scrolls. Its position is searched, not hard-coded: the
 * dock goes to the free spot nearest the point between the two thumbs (the joystick and FIRE), keeping a clearance
 * from every fixed touch control and instrument it is given.
 *
 * DOM-free and deterministic, so the placement is checked in plain Node (touchActionDock.selftest.mjs) for the
 * phone viewports the owner plays on, and recomputed by battleHudLayout.ts only when the HUD's layout changes.
 */

export interface TouchDockRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface TouchDockPlacement extends TouchDockRect {
  /** Tile edge in px: 48, or 44 (still a full touch target) on screens too crowded for 48. */
  readonly tile: number;
  readonly columns: number;
  readonly rows: number;
  /** One rect per control, in the row's order (left to right, then the next row). */
  readonly tiles: readonly TouchDockRect[];
}

interface TouchDockInput {
  readonly width: number;
  readonly height: number;
  /** Visible controls in the row. */
  readonly count: number;
  /** Fixed touch controls and instruments the dock must not cover. */
  readonly obstacles: readonly TouchDockRect[];
  /** Space the dock avoids while it can but may use on the most crowded screens (the ammo selector's open drawer). */
  readonly soft?: readonly TouchDockRect[];
  /** Where the thumbs rest (between the joystick and FIRE); the default is the bottom centre. */
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  /** Safe-area insets (notch, home indicator). */
  readonly insets?: { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number } | null;
}

/** A tile is a 48 px square: above the 44 px touch-target floor, and the size of the touch quick buttons' family. */
export const TOUCH_ACTION_TILE_PX = 48;
export const TOUCH_ACTION_GAP_PX = 6;
/** Space kept between the dock and any other control, and between the dock and the screen edge. */
export const TOUCH_ACTION_CLEARANCE_PX = 8;
/** The most crowded screens (320 px phones) relax in steps, never below a 44 px target or 4 px of clearance. */
const FALLBACKS = [
  { tile: TOUCH_ACTION_TILE_PX, clearance: TOUCH_ACTION_CLEARANCE_PX, soft: true },
  { tile: 44, clearance: 6, soft: true },
  { tile: 44, clearance: 4, soft: false },
] as const;
const EDGE_PX = 12;
/** One extra row costs as much as this much more distance from the thumbs: a single row wins whenever one fits nearby. */
const ROW_PENALTY_PX = 72;
const MAX_ROWS = 3;

const extent = (count: number, tile: number) => count * tile + Math.max(0, count - 1) * TOUCH_ACTION_GAP_PX;

/**
 * The dock nearest the thumbs that clears every obstacle, or null when nothing fits even relaxed (the caller keeps its
 * older strip placement then). Candidates are 1 to 3 rows; for each row count every vertical position is tried and the
 * best horizontal position at that height is solved from the obstacles' blocked intervals, so the search is exact on
 * a 1 px grid and costs a few hundred interval scans per step of FALLBACKS.
 */
export function placeTouchActionDock(input: TouchDockInput): TouchDockPlacement | null {
  for (const step of FALLBACKS) {
    const placement = searchDock(input, step.tile, step.clearance, step.soft);
    if (placement) return placement;
  }
  return null;
}

function searchDock({ width, height, count, obstacles, soft, anchor, insets }: TouchDockInput,
  tile: number, c: number, avoidSoft: boolean): TouchDockPlacement | null {
  const n = Math.floor(count);
  if (!(n > 0) || !(width > 0) || !(height > 0)) return null;
  const avoid = avoidSoft && soft?.length ? [...obstacles, ...soft] : obstacles;
  const left = EDGE_PX + Math.max(0, insets?.left ?? 0);
  const right = width - EDGE_PX - Math.max(0, insets?.right ?? 0);
  const top = EDGE_PX + Math.max(0, insets?.top ?? 0);
  const bottom = height - EDGE_PX - Math.max(0, insets?.bottom ?? 0);
  const ax = anchor && Number.isFinite(anchor.x) ? anchor.x : width / 2;
  const ay = anchor && Number.isFinite(anchor.y) ? anchor.y : bottom;
  let best: { x: number; y: number; columns: number; rows: number; cost: number } | null = null;
  const blocked: number[] = [];
  for (let rows = 1; rows <= Math.min(MAX_ROWS, n); rows++) {
    const columns = Math.ceil(n / rows);
    // Two row counts can need the same columns (5 controls: 3 columns for 2 rows, also 2 for 3): keep the fewest rows.
    if (rows > 1 && Math.ceil(n / columns) !== rows) continue;
    const w = extent(columns, tile), h = extent(rows, tile);
    if (left + w > right || top + h > bottom) continue;
    for (let y = Math.floor(bottom - h); y >= Math.ceil(top); y--) {
      blocked.length = 0;
      for (const o of avoid) {
        if (y < o.y + o.h + c && y + h > o.y - c) blocked.push(o.x - c - w, o.x + o.w + c);
      }
      const x = nearestFreeX(blocked, left, right - w, ax - w / 2);
      if (x === null) continue;
      const cost = Math.hypot(x + w / 2 - ax, y + h / 2 - ay) + ROW_PENALTY_PX * (rows - 1);
      if (!best || cost < best.cost - 1e-9) best = { x, y, columns, rows, cost };
    }
  }
  if (!best) return null;
  const { x, y, columns, rows } = best;
  const tiles: TouchDockRect[] = [];
  for (let i = 0; i < n; i++) {
    tiles.push({ x: x + (i % columns) * (tile + TOUCH_ACTION_GAP_PX),
      y: y + Math.floor(i / columns) * (tile + TOUCH_ACTION_GAP_PX), w: tile, h: tile });
  }
  return { x, y, w: extent(columns, tile), h: extent(rows, tile), tile, columns, rows, tiles };
}

/** The integer x in [min, max] outside every open interval (pairs in `blocked`) nearest `target`, or null. */
function nearestFreeX(blocked: number[], min: number, max: number, target: number): number | null {
  const lo = Math.ceil(min), hi = Math.floor(max);
  if (lo > hi) return null;
  const free = (x: number) => {
    for (let i = 0; i < blocked.length; i += 2) if (x > blocked[i] && x < blocked[i + 1]) return false;
    return true;
  };
  // Candidates: the target itself, the bounds, and both integer edges of every blocked interval.
  let best: number | null = null;
  const consider = (value: number) => {
    const x = Math.min(hi, Math.max(lo, value));
    if (!free(x)) return;
    if (best === null || Math.abs(x - target) < Math.abs(best - target) || (Math.abs(x - target) === Math.abs(best - target) && x < best)) best = x;
  };
  consider(Math.round(target));
  consider(lo);
  consider(hi);
  for (let i = 0; i < blocked.length; i += 2) {
    consider(Math.floor(blocked[i]));
    consider(Math.ceil(blocked[i + 1]));
  }
  return best;
}

/**
 * A cooldown sweep for a control whose total cooldown the HUD does not know (smoke, the drone, a missile launcher):
 * the first remaining time seen after the control was ready is the whole cooldown, so the sweep reads 1 at the start
 * and runs down to 0. A longer remaining time than the latched one starts a new cooldown.
 */
export function createCooldownSweep(): (remainingS: number) => number {
  let peak = 0;
  return (remainingS) => {
    const remaining = Number.isFinite(remainingS) ? Math.max(0, remainingS) : 0;
    if (remaining <= 0) { peak = 0; return 0; }
    if (remaining > peak) peak = remaining;
    return remaining / peak;
  };
}
