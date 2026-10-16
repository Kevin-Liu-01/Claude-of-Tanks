/**
 * Where the centre notices sit on the MOUSE layout (body without .cot-touch-layout), so that none of them covers the
 * crosshair's ink (owner 2026-10-16: "Keep desktop centre notices off the crosshair"). Main placed the detection under
 * the kill feeds whenever a 248 px notice crossed the 400 px lanes (every window under 1076 px wide), so each kill row
 * slid it 29 px further down until it sat on the aim point; the alert sat at bottom 23 %, over the scope's lower arm,
 * ammunition and zoom readouts; the countdown, the revive count and the medal card were never measured against the
 * reticle at all.
 *
 * The reticle (mouseReticleFootprint) is everything hud.ts draws around the screen-centre aim point in the battle sight
 * and the scope, at rest and at full bloom: the dispersion ring at 15 % of the shorter side, the magazine / reload /
 * SWITCHING readouts under the marker, the canvas gun-limit chip, the scope's cross arms (1.55 r + 3 from the centre,
 * so its upper arm runs up the centre line towards the score), its ammunition, zoom and range readouts and the DOM
 * scope-vision toggle. Every notice keeps MOUSE_RETICLE_MARGIN_PX off all of it.
 *
 * The placement is chosen from the viewport and the fixed instruments only (score, objective, rosters, minimap,
 * damage panel and its status strip, drive gauge, systems strip, ammunition rail, consumables, report dock, network
 * readouts), never from the kill rows, toasts, chat or the notices' own text, so nothing moves while kills arrive. The
 * side lanes are kept off the notices instead: a lane whose column a notice crosses starts below it (laneTop), where the
 * cheapest place needs that, and never loses its last row. The two notices take the cheapest of
 * - stack: detection over the alert, sharing a centre (main's arrangement, centred where it fits);
 * - flank: detection left of the scope's centre-line arm and the alert right of it, on one line (the band above the
 *   ring is tall enough for one notice but the arm splits it: 1000 to 1366 px wide at 600 to 768 px tall);
 * - split: each at its own place (narrow and short windows).
 * Cheapest is highest (from main's own top), then most central, then widest (fewest alert lines), with kill rows a
 * moved lane loses priced in. The alert can fall back to main's 9 px type (its smallest) only where no 12 px place
 * clears the reticle. The countdown and the revive count take one place each, scaled down to 50 % where they must (the
 * revive count keeps off the notices' places unless that costs much more); the medal card takes one too (compact where
 * the full card cannot clear the reticle) and waits, keeping its time, while a notice it shares its place with is up,
 * or wherever no place clears the reticle. Where no place clears everything (very small windows) a reduced keep-out is
 * tried (the battle sight at full bloom, then the resting sight), so nothing ever sits on the aim point.
 *
 * DOM-free and deterministic; battleHudLayout.ts measures the inputs and caches the plan by them.
 * mouseNoticePlan.selftest.mjs checks every viewport of the census, and tools/battle-hud-layout.browser.mjs measures
 * the rendered boxes against the reticle's real ink.
 */

export interface PlanRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
interface PlanDisc { readonly cx: number; readonly cy: number; readonly r: number }
type PlanKeepOut = PlanRect | PlanDisc;
/** A side lane (kill feed, damage toasts, chat): its column and the band it may fill. */
export interface PlanLane { readonly x: number; readonly w: number; readonly top: number; readonly bottom: number }
interface PlanSize { readonly w: number; readonly h: number }

export interface MouseNoticeInput {
  readonly width: number;
  readonly height: number;
  /** Bottom of the score plate, or of the objective under it. */
  readonly top: number;
  /** Fixed instruments the notices keep MOUSE_NOTICE_GAP_PX off. */
  readonly obstacles: readonly PlanRect[];
  /** [left, right]; null where the lane cannot hold one row. */
  readonly lanes: readonly [PlanLane | null, PlanLane | null];
  /** main sets the alert in 9 px type here (h <= 550 or w <= 480). */
  readonly smallAlert: boolean;
  /** main hides the detection's second line here (h <= 550). */
  readonly compactDetection: boolean;
  /** The countdown's and revive count's unscaled boxes (null: not measured). */
  readonly countdown: PlanSize | null;
  readonly revive: PlanSize | null;
  /** The medal card's widest box at this width (full card) and in its compact form. */
  readonly medal: PlanSize;
  readonly medalCompact: PlanSize;
}

interface PlannedNotice { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
/** The alert's slot: `x` is its anchor (centre, left edge or right edge), `w` its max-width, `h` the reserve. */
interface PlannedAlert extends PlannedNotice { readonly anchor: 'centre' | 'start' | 'end'; readonly small: boolean }
/** A box shown at `scale` of its natural size (x, y, w, h: the box as shown), clear of the keep-out at `clearance`;
 *  `sharesNotices`: it covers a notice's place (a notice up meanwhile is drawn over it). */
interface PlannedScaled extends PlannedNotice { readonly scale: number; readonly clearance: 2 | 1 | 0; readonly sharesNotices: boolean }
interface PlannedMedal extends PlannedNotice { readonly compact: boolean; readonly sharesNotices: boolean; readonly clearance: 2 }

export interface MouseNoticePlan {
  readonly arrangement: 'stack' | 'flank' | 'split' | 'fallback';
  /** The keep-out the notices clear: 2 everything the reticle draws, 1 the battle sight at full bloom, 0 the resting
   *  sight only, -1 none (the fallback). */
  readonly clearance: 2 | 1 | 0 | -1;
  /** The detection's box. */
  readonly detection: PlannedNotice;
  readonly alert: PlannedAlert;
  /** Where each lane starts (its own top unless a notice needs the band). */
  readonly laneTop: readonly [number, number];
  /** null: no place clears the reticle, so the card waits (main showed it on the crosshair). */
  readonly medal: PlannedMedal | null;
  readonly countdown: PlannedScaled | null;
  readonly revive: PlannedScaled | null;
}

/** Between a notice and an instrument, a lane or another notice. */
export const MOUSE_NOTICE_GAP_PX = 8;
/** Between a notice and any reticle ink. */
export const MOUSE_RETICLE_MARGIN_PX = 4;
const EDGE_PX = 12;

/**
 * The reticle as hud.ts draws it on .cot-ret (CSS px offsets from the aim point). mouseNoticePlan.selftest.mjs pins
 * each source line these restate, and the browser receipt checks the rendered ink lies inside the footprint.
 */
export const MOUSE_RETICLE = Object.freeze({
  /** RET_FLOOR_PX, RET_CEIL_FRAC: the dispersion ring's radius range; the dashed stroke and its halo add 2.5 px. */
  ringFloorPx: 11, ringCeilFraction: .15, ringStrokePx: 2.5,
  /** paintAutoloaderMagazine / paintReloadCountdown under the marker in both sights (SWITCHING is the widest). */
  stackTopPx: 8, stackBottomPx: 70, stackHalfWidthPx: 58,
  /** paintAimWarning: the chip's centre at cy + max(62, r + 24), its box 16 px above and 13 below; text + 50 wide. */
  chipMinPx: 62, chipRingPx: 24, chipAbovePx: 16, chipBelowPx: 13, chipHalfWidthPx: 92,
  /** drawScope: arms from the ring to 1.55 r + 3, a 2.4 px under-stroke and mil ticks either side. */
  armFactor: 1.55, armPx: 3 + 1.3, armHalfWidthPx: 6.5,
  /** paintSniperAmmoReadout / paintSniperZoom: ammunition then zoom 24 px (18 at <= 300 tall) under it. */
  readoutHalfWidthPx: 62, readoutAbovePx: 15, readoutBelowPx: 9,
  /** paintSniperDistance: "1500 m" off the ring's 4:30 point. */
  rangeWidthPx: 60, rangeAbovePx: 13, rangeBelowPx: 6,
  /** .cot-scope-vision (aerialHud.css): top 50% + 145px, min-height 48, on every scoped frame. */
  visionTopPx: 145, visionHeightPx: 50, visionHalfWidthPx: 100,
});

/** sniperAmmoReadoutY (hud.ts): the scope's ammunition baseline below the aim point for ring radius `r`. */
function ammoOffset(height: number, r: number): number {
  if (height <= 300) return 32;
  if (height <= 430) return 44;
  return Math.min(Math.max(r * 1.02 + 24, r * 1.55 + 18, 96), height - 176 - height / 2);
}

/**
 * The reticle's keep-out at `tier`: 2 everything either sight draws at any bloom (the default), 1 the battle sight
 * at full bloom with its readouts and gun-limit chip, 0 the resting battle sight with its readouts.
 */
export function mouseReticleFootprint(width: number, height: number, tier: 0 | 1 | 2 = 2, out: PlanKeepOut[] = []): PlanKeepOut[] {
  const R = MOUSE_RETICLE;
  out.length = 0;
  const cx = width / 2, cy = height / 2;
  const floor = R.ringFloorPx;
  const ceil = Math.max(floor, R.ringCeilFraction * Math.min(width, height));
  out.push({ cx, cy, r: (tier === 0 ? floor : ceil) + R.ringStrokePx });
  out.push({ x: cx - R.stackHalfWidthPx, y: cy + R.stackTopPx, w: R.stackHalfWidthPx * 2, h: R.stackBottomPx - R.stackTopPx });
  if (tier === 0) return out;
  const chipTop = cy + R.chipMinPx - R.chipAbovePx;
  out.push({ x: cx - R.chipHalfWidthPx, y: chipTop, w: R.chipHalfWidthPx * 2,
    h: cy + Math.max(R.chipMinPx, ceil + R.chipRingPx) + R.chipBelowPx - chipTop });
  if (tier === 1) return out;
  const arm = ceil * R.armFactor + R.armPx;
  out.push({ x: cx - R.armHalfWidthPx, y: cy - arm, w: R.armHalfWidthPx * 2, h: arm * 2 });
  out.push({ x: cx - arm, y: cy - R.armHalfWidthPx, w: arm * 2, h: R.armHalfWidthPx * 2 });
  const zoomGap = height <= 300 ? 18 : 24;
  const readTop = cy + ammoOffset(height, floor) - R.readoutAbovePx;
  out.push({ x: cx - R.readoutHalfWidthPx, y: readTop, w: R.readoutHalfWidthPx * 2,
    h: cy + ammoOffset(height, ceil) + zoomGap + R.readoutBelowPx - readTop });
  // The range tag rides the ring outward as it blooms: four boxes span the sweep exactly.
  const tagX = (r: number) => cx + .7071 * (r + 9) + 4, tagY = (r: number) => cy + .7071 * (r + 9) + 12;
  for (let k = 0; k < 4; k++) {
    const a = floor + (ceil - floor) * k / 4, b = floor + (ceil - floor) * (k + 1) / 4;
    out.push({ x: tagX(a) - 3, y: tagY(a) - R.rangeAbovePx, w: tagX(b) + R.rangeWidthPx - tagX(a) + 3,
      h: tagY(b) + R.rangeBelowPx - tagY(a) + R.rangeAbovePx });
  }
  out.push({ x: cx - R.visionHalfWidthPx, y: cy + R.visionTopPx, w: R.visionHalfWidthPx * 2, h: R.visionHeightPx });
  return out;
}

/** The detection's box height at width `w` (hud.ts .cot-sixth: one 8 px sub line from 230 px, two from 164). */
export function detectionHeight(w: number, compact: boolean): number {
  if (compact) return 32;
  return w >= 230 ? 48 : w >= 164 ? 53 : 64;
}
/** Widths the detection may take: main's 248 down to 164 (narrower clips the label outside the six-sided frame). */
const DETECTION_WIDTHS = [248, 230, 164] as const;

/**
 * The alert's reserved height at slot width `w`: the tallest of every alert in both catalogues at that width
 * (wave cleared, carrier down, ammunition type empty, ATGM deselected and the long auto-aim target are the widest,
 * 512 px on one line in en-US, 409 in zh-CN). [min width, height] pairs, widest first.
 */
const ALERT_RESERVE_12 = [[512, 38], [409, 50], [334, 53], [260, 68], [234, 71], [180, 102], [159, 119]] as const;
const ALERT_RESERVE_9 = [[326, 28], [200, 31], [159, 42]] as const;
export function alertReserve(w: number, small: boolean): number {
  for (const [min, h] of small ? ALERT_RESERVE_9 : ALERT_RESERVE_12) if (w >= min) return h;
  return small ? 53 : 136;
}
/** One slot width per reserve height: the widest that keeps it (narrower slots only make the alert wrap more). */
const ALERT_WIDTHS_12 = [520, 409, 334, 260, 234, 180] as const;
const ALERT_WIDTHS_9 = [340, 200, 159] as const;

// Costs: a px down from main's top costs 1, a px up from it .5, a px sideways 1.5.
const UP_COST = .5, SHIFT_COST = 1.5;
const FLANK_COST = 24, SPLIT_COST = 60, SMALL_ALERT_COST = 200;
/** Each kill row a moved lane can no longer hold, and each px it moves; a lane is never emptied. */
const ROW_COST = 120, LANE_PX_COST = .25;
/** The flank's inner edges sit this far either side of the centre line (the scope arm and its margin). */
const HUG_PX = MOUSE_RETICLE.armHalfWidthPx + MOUSE_RETICLE_MARGIN_PX;
/** The search's vertical step; the cheapest place is then refined to the px within a step of it. */
const Y_STEP = 8;
/** The countdown and revive count shrink in these steps (each 10 % costs as much as moving 80 px down). */
const SCALES = [1, .9, .8, .7, .6, .5] as const;
const SCALE_COST = 800;
const MEDAL_COMPACT_COST = 80, MEDAL_SHARE_COST = 40;
/** The revive count keeps off the notices' places unless that costs more than this (the pre-battle countdown, which
 *  no notice shares the screen with in practice, takes its cheapest place). */
const SCALED_SHARE_COST = 400;
const best0 = (one: { x: number; y: number }, w: number, h: number): PlanRect => ({ x: one.x - w / 2, y: one.y, w, h });
const overlapsAny = (r: PlanRect, list: readonly PlanRect[]) => list.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);

const rowsIn = (h: number) => Math.min(8, Math.max(0, Math.floor((h + 3) / 29)));

/** Lanes block a place, move below what crosses them (pricing the rows they lose), or are ignored. */
type LaneMode = 'block' | 'move' | 'ignore';
interface Env {
  readonly input: MouseNoticeInput;
  readonly keep: readonly PlanKeepOut[];
  readonly lanes: LaneMode;
  /** band key -> where its sorted, merged x intervals (pairs, widened by their gaps) start in `arena` and how many. */
  readonly cache: Map<number, number>;
  arena: Float64Array;
  used: number;
}
const makeEnv = (input: MouseNoticeInput, keep: readonly PlanKeepOut[], lanes: LaneMode): Env =>
  ({ input, keep, lanes, cache: new Map(), arena: new Float64Array(4096), used: 0 });
/** A band's intervals: `arena[at .. at + count)` (pairs). */
const at = (code: number) => code >>> 7, count = (code: number) => (code & 127) * 2;

const rawScratch: number[] = [];
const mergedScratch: number[] = [];
/** The x intervals blocking anything over [y0, y0 + h] (integers), sorted by start and merged, as a code for `at` /
 *  `count`. Cached per env, in its arena: the search allocates nothing per band. */
function band(env: Env, y0: number, h: number): number {
  const key = y0 * 4096 + h;
  const hit = env.cache.get(key);
  if (hit !== undefined) return hit;
  const { input } = env;
  const y1 = y0 + h, g = MOUSE_NOTICE_GAP_PX, m = MOUSE_RETICLE_MARGIN_PX;
  const raw = rawScratch;
  raw.length = 0;
  blockRects(raw, y0, y1, input.obstacles);
  for (let i = 0; i < env.keep.length; i++) {
    const k = env.keep[i];
    if ('r' in k) {
      const reach = k.r + m;
      const dy = k.cy < y0 ? y0 - k.cy : k.cy > y1 ? k.cy - y1 : 0;
      if (dy < reach) { const hc = Math.sqrt(reach * reach - dy * dy); raw.push(k.cx - hc, k.cx + hc); }
    } else if (y0 < k.y + k.h + m && y1 > k.y - m) {
      raw.push(k.x - m, k.x + k.w + m);
    }
  }
  if (env.lanes === 'block') {
    for (const lane of input.lanes) {
      if (lane && y0 < lane.bottom + g && y1 > lane.top - g) raw.push(lane.x - g, lane.x + lane.w + g);
    }
  }
  const merged = sortMerge(raw, mergedScratch);
  if (env.used + merged.length > env.arena.length) {
    const grown = new Float64Array(Math.max(env.arena.length * 2, env.used + merged.length));
    grown.set(env.arena);
    env.arena = grown;
  }
  env.arena.set(merged, env.used);
  const code = env.used * 128 + merged.length / 2;
  env.used += merged.length;
  env.cache.set(key, code);
  return code;
}

/** Append [x0 - gap, x1 + gap] for each rect that reaches the band [y0, y1] (gap included). */
function blockRects(out: number[], y0: number, y1: number, rects: readonly PlanRect[]): void {
  const g = MOUSE_NOTICE_GAP_PX;
  for (let i = 0; i < rects.length; i++) {
    const o = rects[i];
    if (y0 < o.y + o.h + g && y1 > o.y - g) out.push(o.x - g, o.x + o.w + g);
  }
}

/** Sort the pairs of `raw` by start (in place: a few dozen) and merge overlapping ones into `out`. */
function sortMerge(raw: number[], out: number[]): number[] {
  for (let i = 2; i < raw.length; i += 2) {
    const a = raw[i], b = raw[i + 1];
    let j = i;
    while (j > 0 && raw[j - 2] > a) { raw[j] = raw[j - 2]; raw[j + 1] = raw[j - 1]; j -= 2; }
    raw[j] = a; raw[j + 1] = b;
  }
  out.length = 0;
  for (let i = 0; i < raw.length; i += 2) {
    const k = out.length;
    if (k && raw[i] <= out[k - 1]) { if (raw[i + 1] > out[k - 1]) out[k - 1] = raw[i + 1]; }
    else out.push(raw[i], raw[i + 1]);
  }
  return out;
}

/**
 * The point in [lo, hi] nearest `target` outside every open interval of `a[ai .. ai + an)` widened by `ha` and of
 * `b[bi .. bi + bn)` widened by `hb` (both sorted by start, so widening keeps their order), or NaN: the centres a column
 * of boxes may take.
 */
function freeNear(a: ArrayLike<number>, ai: number, an: number, ha: number, b: ArrayLike<number>, bi: number, bn: number, hb: number,
  lo: number, hi: number, target: number): number {
  if (lo > hi) return NaN;
  const ae = ai + an, be = bi + bn;
  let i = ai, j = bi, cursor = lo, best = NaN, bestD = Infinity;
  for (;;) {
    const sa = i < ae ? a[i] - ha : Infinity;
    const sb = j < be ? b[j] - hb : Infinity;
    let s = Infinity, e = Infinity;
    if (sa <= sb && sa !== Infinity) { s = sa; e = a[i + 1] + ha; i += 2; }
    else if (sb !== Infinity) { s = sb; e = b[j + 1] + hb; j += 2; }
    const end = Math.min(s, hi);
    if (end >= cursor) {
      const x = Math.min(end, Math.max(cursor, target));
      const d = Math.abs(x - target);
      if (d < bestD) { bestD = d; best = x; }
      if (end >= target) return best;
    }
    if (s >= hi) return best;
    if (e > cursor) cursor = e;
  }
}
/** freeNear for one band of `env` (and, optionally, a second band or a plain interval list). */
function freeIn(env: Env, code: number, half: number, lo: number, hi: number, target: number,
  other: number | readonly number[] | null = null, otherHalf = 0): number {
  const A = env.arena;
  if (other === null) return freeNear(A, at(code), count(code), half, A, 0, 0, 0, lo, hi, target);
  if (typeof other === 'number') return freeNear(A, at(code), count(code), half, A, at(other), count(other), otherHalf, lo, hi, target);
  return freeNear(A, at(code), count(code), half, other, 0, other.length, otherHalf, lo, hi, target);
}

/** How far down a lane's rows stay clear of the battle sight at full bloom (its ring, readouts and chip): main's rows
 *  below that already meet the ring, so a moved lane is priced by the clear rows it loses. */
function clearBottom(lane: PlanLane, keep: readonly PlanKeepOut[]): number {
  let bottom = lane.bottom;
  for (const k of keep) {
    if ('r' in k) {
      const dx = Math.max(lane.x - k.cx, 0, k.cx - (lane.x + lane.w));
      if (dx < k.r) bottom = Math.min(bottom, k.cy - Math.sqrt(k.r * k.r - dx * dx));
    } else if (lane.x < k.x + k.w && lane.x + lane.w > k.x) bottom = Math.min(bottom, k.y);
  }
  return bottom;
}
const laneClear: [number, number] = [NaN, NaN];

/** Where each lane must start for boxes that cross its column, and the cost of the rows it loses: its rows clear of
 *  the battle sight (laneClear), and Infinity where it would lose its last row of all. */
function laneShift(input: MouseNoticeInput, boxes: readonly PlanRect[], out: [number, number]): number {
  let cost = 0;
  const g = MOUSE_NOTICE_GAP_PX;
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    if (!lane) { out[side] = NaN; continue; }
    let top = lane.top;
    for (const b of boxes) {
      if (b.x < lane.x + lane.w + g && b.x + b.w > lane.x - g && b.y < lane.bottom + g && b.y + b.h + g > top) top = b.y + b.h + g;
    }
    out[side] = top;
    if (top <= lane.top) continue;
    if (rowsIn(lane.bottom - top) === 0 && rowsIn(lane.bottom - lane.top) > 0) return Infinity;
    const clear = Number.isNaN(laneClear[side]) ? lane.bottom : laneClear[side];
    const before = rowsIn(clear - lane.top), after = rowsIn(clear - top);
    cost += ROW_COST * (before - after) + LANE_PX_COST * (top - lane.top);
  }
  return cost;
}

/**
 * Visit y from `yPref` in order of its own cost (a px up costs UP_COST, a px down 1) within [yMin, yMax], stopping once
 * the next y would cost `limit()` or more.
 */
function walkY(yPref: number, yMin: number, yMax: number, limit: () => number, at: (y: number, yCost: number) => void,
  step = Y_STEP): void {
  const start = Math.max(yMin, Math.min(yMax, yPref));
  let up = start, down = start + step;
  for (;;) {
    const upCost = up >= yMin ? Math.max(0, yPref - up) * UP_COST : Infinity;
    const downCost = down <= yMax ? Math.max(0, down - yPref) : Infinity;
    const cost = Math.min(upCost, downCost);
    if (cost === Infinity || cost >= limit()) return;
    if (upCost <= downCost) {
      at(up, upCost);
      // the highest place (yMin, under the score) is always visited, on the grid or not
      up = up > yMin && up - step < yMin ? yMin : up - step;
    } else { at(down, downCost); down += step; }
  }
}
/** walkY on the coarse grid, then to the px within a step of the cheapest y `found()` reports (NaN: none). */
function walkFine(yPref: number, yMin: number, yMax: number, limit: () => number, at: (y: number, yCost: number) => void,
  found: () => number): void {
  walkY(yPref, yMin, yMax, limit, at);
  const y = found();
  if (Number.isFinite(y)) walkY(yPref, Math.max(yMin, y - Y_STEP + 1), Math.min(yMax, y + Y_STEP - 1), limit, at, 1);
}

const NONE: readonly PlanRect[] = [];
const detFit = new Map<number, boolean>();
const avoidRaw: number[] = [];
const avoidMerged: number[] = [];
interface Single { y: number; x: number; cost: number; lane: number }
/** The cheapest place for one `w` x `h` box (x: its centre) from `yPref`; its cost includes `base` (Infinity when none
 *  beats `bound`), `lane` the part the lanes' moves make up. */
function singleBest(env: Env, w: number, h: number, yPref: number, base: number, bound: number, out: Single,
  avoid: readonly PlanRect[] = NONE): Single {
  const { input } = env;
  const cx = input.width / 2;
  out.cost = Infinity; out.lane = 0;
  const shift: [number, number] = [NaN, NaN];
  const box: PlanRect[] = [{ x: 0, y: 0, w, h }];
  const hh = Math.ceil(h);
  walkFine(yPref, Math.ceil(input.top + MOUSE_NOTICE_GAP_PX), input.height - EDGE_PX - hh, () => Math.min(bound, out.cost) - base, (y, yCost) => {
    let extra: number[] | null = null;
    if (avoid.length) {
      avoidRaw.length = 0;
      blockRects(avoidRaw, y, y + hh, avoid);
      if (avoidRaw.length) extra = sortMerge(avoidRaw, avoidMerged);
    }
    const m = freeIn(env, band(env, y, hh), w / 2, EDGE_PX + w / 2, input.width - EDGE_PX - w / 2, cx, extra, w / 2);
    if (Number.isNaN(m)) return;
    let lane = 0;
    if (env.lanes === 'move') { box[0] = { x: m - w / 2, y, w, h }; lane = laneShift(input, box, shift); }
    const cost = base + yCost + SHIFT_COST * Math.abs(m - cx) + lane;
    if (cost < out.cost) { out.cost = cost; out.x = m; out.y = y; out.lane = lane; }
  }, () => out.cost < Infinity ? out.y : NaN);
  return out;
}

interface PairResult {
  cost: number; arrangement: MouseNoticePlan['arrangement'];
  det: PlannedNotice; alert: PlannedAlert; laneTop: [number, number];
}
interface Config { readonly dw: number; readonly dh: number; readonly aw: number; readonly ah: number; readonly small: boolean; readonly base: number }

function configs(input: MouseNoticeInput, small: boolean): Config[] {
  const out: Config[] = [];
  const width = input.width;
  const fontCost = small && !input.smallAlert ? SMALL_ALERT_COST : 0;
  const alertMin = small ? 28 : 38;
  let lastDw = -1;
  for (const full of DETECTION_WIDTHS) {
    const dw = Math.min(full, width - 2 * EDGE_PX);
    if (dw === lastDw) continue;
    lastDw = dw;
    const dh = detectionHeight(dw, input.compactDetection);
    const detCost = (248 - dw) * .1 + (dh - detectionHeight(248, input.compactDetection)) * 1.5;
    let lastAw = -1;
    for (const awFull of small ? ALERT_WIDTHS_9 : ALERT_WIDTHS_12) {
      const aw = Math.min(awFull, width - 2 * EDGE_PX);
      if (aw === lastAw) continue;
      lastAw = aw;
      const ah = alertReserve(aw, small);
      out.push({ dw, dh, aw, ah, small, base: detCost + fontCost + (ah - alertMin) + (520 - awFull) * .02 });
    }
  }
  return out.sort((a, b) => a.base - b.base);
}

function searchPair(input: MouseNoticeInput, keep: readonly PlanKeepOut[]): PairResult | null {
  const { width, height, top } = input;
  const cx = width / 2;
  const yMin = Math.ceil(top + MOUSE_NOTICE_GAP_PX);
  const yPref = Math.max(yMin, Math.ceil(height * .12));
  const g = MOUSE_NOTICE_GAP_PX;
  let best: PairResult | null = null;
  const bestCost = () => best === null ? Infinity : best.cost;
  const shift: [number, number] = [NaN, NaN];
  const boxes: PlanRect[] = [];
  const single: Single = { y: 0, x: 0, cost: Infinity, lane: 0 };
  const single2: Single = { y: 0, x: 0, cost: Infinity, lane: 0 };
  const fonts = input.smallAlert ? [true] : [false, true];
  for (const lanes of ['block', 'move'] as const) {
    if (lanes === 'move' && !input.lanes[0] && !input.lanes[1]) break;
    const env = makeEnv(input, keep, lanes);
    const offer = (cost: number, arrangement: PairResult['arrangement'], det: PlannedNotice, alert: PlannedAlert) => {
      if (cost >= bestCost()) return;
      best = { cost, arrangement, det, alert, laneTop: lanes === 'block' ? [NaN, NaN] : [shift[0], shift[1]] };
    };
    const laneCost = () => lanes === 'block' ? 0 : laneShift(input, boxes, shift);
    for (const small of fonts) {
      if (small && !input.smallAlert && bestCost() <= SMALL_ALERT_COST) break;
      const list = configs(input, small);
      const minBase = list[0].base;
      // stack and flank: every configuration at each y, cheapest y first
      walkFine(yPref, yMin, height - EDGE_PX - 28, () => bestCost() - minBase, (y, yCost) => {
        // a y where a detection of some width has no place at all rules out every configuration with that width
        detFit.clear();
        for (const c of list) {
          if (c.base + yCost >= bestCost()) break;
          const { dw, dh, aw, ah } = c;
          let fits = detFit.get(dw);
          if (fits === undefined) {
            fits = y + dh <= height - EDGE_PX && !Number.isNaN(freeIn(env, band(env, y, dh), dw / 2, EDGE_PX + dw / 2, width - EDGE_PX - dw / 2, cx));
            detFit.set(dw, fits);
          }
          if (!fits) continue;
          if (y + dh + g + ah <= height - EDGE_PX) {
            const half = Math.max(dw, aw) / 2;
            const m = freeIn(env, band(env, y, dh), dw / 2, EDGE_PX + half, width - EDGE_PX - half, cx, band(env, y + dh + g, ah), aw / 2);
            if (!Number.isNaN(m)) {
              boxes.length = 0;
              boxes.push({ x: m - dw / 2, y, w: dw, h: dh }, { x: m - aw / 2, y: y + dh + g, w: aw, h: ah });
              offer(c.base + yCost + SHIFT_COST * Math.abs(m - cx) + laneCost(), 'stack', boxes[0],
                { x: m, y: y + dh + g, w: aw, h: ah, anchor: 'centre', small: c.small });
            }
          }
          if (y + Math.max(dh, ah) > height - EDGE_PX) continue;
          for (let side = 0; side < 2; side++) {
            const detLeft = side === 0;
            const lb = c.base + yCost + FLANK_COST + side * 2;
            if (lb >= bestCost()) break;
            const dTarget = detLeft ? cx - HUG_PX - dw / 2 : cx + HUG_PX + dw / 2;
            const aTarget = detLeft ? cx + HUG_PX + aw / 2 : cx - HUG_PX - aw / 2;
            const md = freeIn(env, band(env, y, dh), dw / 2, EDGE_PX + dw / 2, width - EDGE_PX - dw / 2, dTarget);
            if (Number.isNaN(md)) continue;
            const ma = freeIn(env, band(env, y, ah), aw / 2, EDGE_PX + aw / 2, width - EDGE_PX - aw / 2, aTarget);
            if (Number.isNaN(ma)) continue;
            if (detLeft ? md + dw / 2 + g > ma - aw / 2 : ma + aw / 2 + g > md - dw / 2) continue;
            boxes.length = 0;
            boxes.push({ x: md - dw / 2, y, w: dw, h: dh }, { x: ma - aw / 2, y, w: aw, h: ah });
            offer(lb + SHIFT_COST * (Math.abs(md - dTarget) + Math.abs(ma - aTarget)) / 2 + laneCost(), 'flank', boxes[0],
              { x: detLeft ? ma - aw / 2 : ma + aw / 2, y, w: aw, h: ah, anchor: detLeft ? 'start' : 'end', small: c.small });
          }
        }
      }, () => best === null ? NaN : best.det.y);
      // split: the detection at its own cheapest place, then the alert at its own, off the detection
      let lastDw = -1;
      for (const c of list) {
        if (c.base + SPLIT_COST >= bestCost()) continue;
        if (c.dw !== lastDw) {
          lastDw = c.dw;
          singleBest(env, c.dw, c.dh, yPref, 0, bestCost(), single);
        }
        if (!Number.isFinite(single.cost)) continue;
        const fixed = c.base + SPLIT_COST + single.cost - single.lane;
        if (fixed >= bestCost()) continue;
        const detBox: PlanRect = { x: single.x - c.dw / 2, y: single.y, w: c.dw, h: c.dh };
        singleBest(env, c.aw, c.ah, yPref, fixed, bestCost(), single2, [detBox]);
        if (!Number.isFinite(single2.cost)) continue;
        boxes.length = 0;
        boxes.push(detBox, { x: single2.x - c.aw / 2, y: single2.y, w: c.aw, h: c.ah });
        // each search priced its own lane moves; the pair pays for the lanes' joint move once
        offer(single2.cost - single2.lane + laneCost(), 'split', detBox,
          { x: single2.x, y: single2.y, w: c.aw, h: c.ah, anchor: 'centre', small: c.small });
      }
    }
  }
  return best;
}

function placeScaled(env: Env, clearance: 2 | 1 | 0, size: PlanSize | null, yFrac: number,
  notices: readonly PlanRect[]): PlannedScaled | null {
  if (!size || size.w <= 0 || size.h <= 0) return null;
  const { input } = env;
  const yPref = Math.max(Math.ceil(input.top + MOUSE_NOTICE_GAP_PX), Math.ceil(input.height * yFrac));
  const one: Single = { y: 0, x: 0, cost: Infinity, lane: 0 };
  let best: PlannedScaled | null = null, bestCost = Infinity;
  for (const share of notices.length ? [false, true] : [true]) {
    for (const s of SCALES) {
      const base = (1 - s) * SCALE_COST + (share && notices.length ? SCALED_SHARE_COST : 0);
      if (base >= bestCost) break;
      const w = size.w * s, h = size.h * s;
      singleBest(env, w, h, yPref, base, bestCost, one, share ? NONE : notices);
      if (one.cost < bestCost) {
        bestCost = one.cost;
        best = { x: one.x - w / 2, y: one.y, scale: s, w, h, clearance, sharesNotices: share && overlapsAny(best0(one, w, h), notices) };
      }
    }
  }
  return best;
}

function placeMedal(env: Env, clearance: 2, notices: readonly PlanRect[]): PlannedMedal | null {
  const { input } = env;
  const yPref = Math.ceil(input.top + 16);
  const one: Single = { y: 0, x: 0, cost: Infinity, lane: 0 };
  let best: PlannedMedal | null = null, bestCost = Infinity;
  for (const compact of [false, true]) {
    const size = compact ? input.medalCompact : input.medal;
    for (const share of [false, true]) {
      const base = (compact ? MEDAL_COMPACT_COST : 0) + (share ? MEDAL_SHARE_COST : 0);
      if (base >= bestCost) continue;
      singleBest(env, size.w, size.h, yPref, base, bestCost, one, share ? NONE : notices);
      if (one.cost < bestCost) {
        bestCost = one.cost;
        best = { x: one.x - size.w / 2, y: one.y, w: size.w, h: size.h, compact, sharesNotices: share, clearance };
      }
    }
  }
  return best;
}

/** main's own places: the detection under the score, the alert at bottom 23 % (the last resort). */
function fallbackPair(input: MouseNoticeInput): PairResult {
  const { width, height, top } = input;
  const dw = Math.min(248, width - 28), dh = detectionHeight(dw, input.compactDetection);
  const aw = Math.min(520, width - 32), ah = alertReserve(aw, input.smallAlert);
  const y = Math.max(top + MOUSE_NOTICE_GAP_PX, height * .12);
  return { cost: Infinity, arrangement: 'fallback', det: { x: (width - dw) / 2, y, w: dw, h: dh },
    alert: { x: width / 2, y: height * .77 - ah, w: aw, h: ah, anchor: 'centre', small: input.smallAlert }, laneTop: [NaN, NaN] };
}

const TIERS = [2, 1, 0] as const;

/** Every centre notice's place on the mouse layout (see the module comment). */
export function planMouseNotices(input: MouseNoticeInput): MouseNoticePlan {
  let pair: PairResult | null = null;
  let clearance: MouseNoticePlan['clearance'] = -1;
  const keeps = TIERS.map((tier) => mouseReticleFootprint(input.width, input.height, tier));
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    laneClear[side] = lane ? clearBottom(lane, keeps[1]) : NaN;
  }
  for (let i = 0; i < TIERS.length && !pair; i++) {
    pair = searchPair(input, keeps[i]);
    if (pair) clearance = TIERS[i];
  }
  if (!pair) pair = fallbackPair(input);
  const laneTop: [number, number] = [NaN, NaN];
  const lanesAfter: [PlanLane | null, PlanLane | null] = [null, null];
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    if (!lane) continue;
    const moved = pair.laneTop[side];
    laneTop[side] = Number.isNaN(moved) ? lane.top : Math.max(lane.top, moved);
    lanesAfter[side] = { ...lane, top: laneTop[side] };
  }
  const a = pair.alert;
  const alertLeft = a.anchor === 'centre' ? a.x - a.w / 2 : a.anchor === 'start' ? a.x : a.x - a.w;
  const notices: PlanRect[] = [pair.det, { x: alertLeft, y: a.y, w: a.w, h: a.h }];
  // The countdown and revive count clear the widest keep-out they can, from the one the notices cleared; the lanes keep
  // the tops the notices gave them (the medal and the revive count share the battle with kill rows).
  const after: MouseNoticeInput = { ...input, lanes: lanesAfter };
  const first = Math.max(0, TIERS.indexOf(clearance as 2 | 1 | 0));
  // one search space per keep-out for the three: the lanes block them all
  const envs = keeps.map((keep) => makeEnv(after, keep, 'block'));
  const tiered = <T>(place: (env: Env, tier: 2 | 1 | 0) => T | null): T | null => {
    for (let i = first; i < TIERS.length; i++) { const got = place(envs[i], TIERS[i]); if (got) return got; }
    return null;
  };
  return {
    arrangement: pair.arrangement, clearance, detection: pair.det, alert: pair.alert, laneTop,
    // The card is optional: it waits (main shows it in the debrief) rather than touch any reticle ink.
    medal: clearance === 2 ? placeMedal(envs[0], 2, notices) : null,
    // (the lanes still give way to a countdown crossing them, battleHudLayout.ts; it keeps off their chat and toasts)
    countdown: tiered((env, tier) => placeScaled(env, tier, input.countdown, .22, NONE)),
    revive: tiered((env, tier) => placeScaled(env, tier, input.revive, .30, notices)),
  };
}
