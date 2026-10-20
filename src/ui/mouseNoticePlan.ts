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
 * Every place is chosen from the viewport and the fixed instruments only (score, objective, rosters down to their
 * Tab-expanded height, minimap, damage panel and its status strip, drive gauge, systems strip, ammunition rail,
 * consumables, report dock, network readouts) and the side lanes' bands, never from the kill rows, toasts, chat or the
 * notices' own text, so nothing moves while kills arrive. A place that crosses a side lane carries that lane's band
 * while the element shows (`giveWay`: the lane's rows start below it or end above it); the lanes keep all their rows
 * while nothing is up, and a lane gives up its last row only where every place clear of the reticle crosses it whole
 * (a 768 px wide window). The detection and the alert take the cheapest of
 * - stack: detection over the alert, sharing a centre (main's arrangement, centred where it fits);
 * - flank: detection left of the scope's centre-line arm and the alert right of it, on one line (the band above the
 *   ring is tall enough for one notice but the arm splits it: 1000 to 1366 px wide at 600 to 768 px tall);
 * - split: each at its own place (narrow and short windows).
 * Cheapest is highest (from main's own top), then most central, then widest (fewest alert lines), with the rows a lane
 * yields while the notice shows priced in. The alert keeps main's type size everywhere (9 px only where main's own
 * small-window rule sets it). The countdown, the revive count and the medal card then take one place each, off both
 * notices' places (the countdown and the revive count scaled down to 60 % where they must); only where no such place
 * exists does the countdown or the revive count share a notice's place, and only one it never shows with: the countdown
 * the detection's (nothing spots the player before the roll-out); the revive count never (an alert, or a detection lit
 * before the death, can show with it). The medal card is the full card wherever a place for it clears the keep-out
 * (the compact card only where none does), and it waits, keeping its time, while anything shown meets its place: a
 * notice whose place it shares, the revive count (mouseMedalWaits). Where no place clears everything (very small
 * windows) a reduced keep-out is tried (the battle sight at full bloom, then the resting sight, where the countdown and
 * the revive count may shrink to 40 %), so nothing ever sits on the aim point or shows on another notice.
 *
 * DOM-free and deterministic; battleHudLayout.ts measures the inputs and caches the plan by them.
 * mouseNoticePlan.selftest.mjs checks every viewport of the census, and tools/battle-hud-layout.browser.mjs measures
 * the rendered boxes against the reticle's real ink and against main.
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
  /** Fixed instruments the notices keep MOUSE_NOTICE_GAP_PX off (each roster down to its Tab-expanded height). */
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

/** [left top, left bottom, right top, right bottom]: each side lane's band while the element shows (NaN: its own). */
type PlanGiveWay = readonly [number, number, number, number];
interface PlannedNotice { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly giveWay: PlanGiveWay }
/** The alert's slot: `x` is its anchor (centre, left edge or right edge), `w` its max-width, `h` the reserve. */
interface PlannedAlert extends PlannedNotice { readonly anchor: 'centre' | 'start' | 'end'; readonly small: boolean }
/** A box shown at `scale` of its natural size (x, y, w, h: the box as shown), clear of the keep-out at `clearance`;
 *  `sharesNotices`: it covers a notice's place (only where no other place exists). */
interface PlannedScaled extends PlannedNotice { readonly scale: number; readonly clearance: 2 | 1 | 0; readonly sharesNotices: boolean }
interface PlannedMedal extends PlannedNotice { readonly compact: boolean; readonly sharesNotices: boolean; readonly clearance: 2 | 1 | 0 }
/** What shows with the medal card, as the layout owner reads it. */
export interface MouseMedalCompany { readonly detection: boolean; readonly alert: boolean; readonly revive: boolean; readonly scoped: boolean }

export interface MouseNoticePlan {
  readonly arrangement: 'stack' | 'flank' | 'split' | 'fallback';
  /** The keep-out the notices clear: 2 everything the reticle draws, 1 the battle sight at full bloom, 0 the resting
   *  sight only, -1 none (the fallback: main's own places). */
  readonly clearance: 2 | 1 | 0 | -1;
  /** The detection's box. */
  readonly detection: PlannedNotice;
  readonly alert: PlannedAlert;
  /** null: no place clears even the resting sight, so the card waits (main showed it on the crosshair). These three are
   *  placed when first read. */
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
const FLANK_COST = 24, SPLIT_COST = 60;
/** What a lane yielding to an element costs while it shows: each kill row it gives up (of its rows clear of the battle
 *  sight), each px its rows move down, and the yield itself. The countdown runs before the first kill, while the lanes
 *  are empty (only chat can be up): it pays less. */
interface LanePrice { readonly row: number; readonly px: number; readonly fixed: number; readonly empty: number }
/** In battle a lane left without a kill row while elements show is the last resort before any reticle ink. */
const BATTLE_LANES: LanePrice = { row: 30, px: .25, fixed: 40, empty: 900 };
const PREBATTLE_LANES: LanePrice = { row: 15, px: .25, fixed: 20, empty: 300 };
/** The band a lane needs to show one kill row: 26 px, or 62 beside the left lane's damage toasts (they take up to
 *  45 % of it, battleHudLayout.ts) where the lane is that tall at all. */
const laneRowPx = (side: number, lane: PlanLane) => side === 0 && lane.bottom - lane.top >= 62 ? 62 : 26;
/** The flank's inner edges sit this far either side of the centre line (the scope arm and its margin). */
const HUG_PX = MOUSE_RETICLE.armHalfWidthPx + MOUSE_RETICLE_MARGIN_PX;
/** The search's vertical step; the cheapest place is then refined to the px within a step of it. */
const Y_STEP = 8;
/** The countdown and revive count shrink in these steps, each 10 % costing as much as moving 80 px down; 60 % keeps the
 *  countdown's 17 px kicker at 10 px, and half size (8.5 px) is the last resort before sharing a notice's place. Clear
 *  of the resting sight only (tier 0, a short window whose notices take the one band beside the bloomed sight: 844 x
 *  390), they may go on down to 40 % (the count's numeral still 34 px) rather than cover a notice. */
const SCALES = [1, .9, .8, .7, .6, .5] as const;
const SCALE_COSTS = [0, 80, 160, 240, 320, 1200] as const;
const LAST_SCALES = [...SCALES, .45, .4] as const;
const LAST_SCALE_COSTS = [...SCALE_COSTS, 2400, 3600] as const;
/** The medal card waits (keeping its time) while anything shown meets its place (mouseMedalWaits), so sharing a notice's
 *  place costs only the wait: the alert's (2.4 s) a little, the detection's (8 s) more, both the most. The full card in
 *  any place clear of a keep-out beats the compact card at that keep-out (main's look wherever the full card fits). */
const MEDAL_SHARE_ALERT_COST = 60, MEDAL_SHARE_DETECTION_COST = 150, MEDAL_SHARE_BOTH_COST = 180;
const MEDAL_COMPACT_COST = 1e6;

const rowsIn = (h: number) => Math.min(8, Math.max(0, Math.floor((h + 3) / 29)));
const overlapsAny = (r: PlanRect, list: readonly PlanRect[]) => list.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);

/** Lanes block a place, or yield to it while it shows (pricing the rows they give up). */
type LaneMode = 'block' | 'yield';
/**
 * One search space: a keep-out and a lane mode over the plan's input. The fixed boxes are kept as x intervals sorted by
 * their start, each with the y band it blocks (gaps and margins included), and the ring as a disc, so a band's blocked
 * intervals come out sorted and merged in one pass; bands are cached in an open-addressed table stamped per plan. A
 * few spaces are pooled and reused, so planning allocates almost nothing.
 */
interface Env {
  input: MouseNoticeInput;
  lanes: LaneMode;
  /** [x0, x1, y0, y1] per fixed box, sorted by x0. */
  items: Float64Array;
  itemCount: number;
  /** [cx, cy, reach] per disc. */
  discs: Float64Array;
  discCount: number;
  /** band key -> code (see `at` / `count`), valid where `stamps` holds the env's generation. */
  keys: Int32Array;
  codes: Int32Array;
  stamps: Int32Array;
  generation: number;
  arena: Float64Array;
  used: number;
  /** Ink of the full keep-out this space's keep-out leaves out (reduced tiers): placing over it costs SOFT_INK_COST a px²,
   *  so a place that must reach into the reticle takes as little of it as it can. */
  soft: PlanRect[];
}
const SOFT_INK_COST = .5;
const TABLE_BITS = 14, TABLE_MASK = (1 << TABLE_BITS) - 1;
const pool: Env[] = [];
/** The plan whose spaces the pool holds (a later plan's lazy places rebuild theirs). */
let poolPlan = 0, plansMade = 0;
const itemScratch: number[] = [];
function makeEnv(slot: number, input: MouseNoticeInput, keep: readonly PlanKeepOut[], lanes: LaneMode,
  soft: readonly PlanKeepOut[] = []): Env {
  const env = pool[slot] ??= {
    input, lanes, items: new Float64Array(256), itemCount: 0, discs: new Float64Array(12), discCount: 0,
    keys: new Int32Array(1 << TABLE_BITS), codes: new Int32Array(1 << TABLE_BITS), stamps: new Int32Array(1 << TABLE_BITS),
    generation: 0, arena: new Float64Array(8192), used: 0, soft: [],
  };
  env.input = input; env.lanes = lanes; env.used = 0;
  env.soft.length = 0;
  for (const k of soft) if (!('r' in k)) env.soft.push(k);
  env.generation = env.generation >= 0x7ffffff0 ? 1 : env.generation + 1;
  if (env.generation === 1) env.stamps.fill(0);
  const g = MOUSE_NOTICE_GAP_PX, m = MOUSE_RETICLE_MARGIN_PX;
  const raw = itemScratch;
  raw.length = 0;
  for (const o of input.obstacles) raw.push(o.x - g, o.x + o.w + g, o.y - g, o.y + o.h + g);
  env.discCount = 0;
  for (const k of keep) {
    if ('r' in k) {
      if (env.discCount * 3 + 3 > env.discs.length) { const d = new Float64Array(env.discs.length * 2); d.set(env.discs); env.discs = d; }
      env.discs[env.discCount * 3] = k.cx; env.discs[env.discCount * 3 + 1] = k.cy; env.discs[env.discCount * 3 + 2] = k.r + m;
      env.discCount++;
    } else raw.push(k.x - m, k.x + k.w + m, k.y - m, k.y + k.h + m);
  }
  if (lanes === 'block') for (const lane of input.lanes) if (lane) raw.push(lane.x - g, lane.x + lane.w + g, lane.top - g, lane.bottom + g);
  // insertion sort by x0 (a few dozen boxes)
  for (let i = 4; i < raw.length; i += 4) {
    const a = raw[i], b = raw[i + 1], c = raw[i + 2], d = raw[i + 3];
    let j = i;
    while (j > 0 && raw[j - 4] > a) { raw[j] = raw[j - 4]; raw[j + 1] = raw[j - 3]; raw[j + 2] = raw[j - 2]; raw[j + 3] = raw[j - 1]; j -= 4; }
    raw[j] = a; raw[j + 1] = b; raw[j + 2] = c; raw[j + 3] = d;
  }
  if (raw.length > env.items.length) env.items = new Float64Array(raw.length * 2);
  for (let i = 0; i < raw.length; i++) env.items[i] = raw[i];
  env.itemCount = raw.length / 4;
  return env;
}
/** A band's intervals: `arena[at .. at + count)` (pairs). */
const at = (code: number) => code >>> 7, count = (code: number) => (code & 127) * 2;

const discScratch: number[] = [];
/** The last plan's work: the bands it computed (its cost, independent of the machine; the selftest bounds it). */
export const mouseNoticePlanWork = { bands: 0 };
/** The x intervals blocking anything over [y0, y0 + h] (integers), sorted by start and merged, as a code for `at` /
 *  `count`. Cached per env, in its arena: the search allocates nothing per band. */
function band(env: Env, y0: number, h: number): number {
  const key = y0 * 4096 + h;
  let slot = Math.imul(key, 0x9e3779b1) >>> (32 - TABLE_BITS);
  const { keys, stamps, generation } = env;
  while (stamps[slot] === generation) {
    if (keys[slot] === key) return env.codes[slot];
    slot = (slot + 1) & TABLE_MASK;
  }
  mouseNoticePlanWork.bands++;
  const y1 = y0 + h;
  // the discs' intervals at this band, sorted by start (one or two)
  const ds = discScratch;
  ds.length = 0;
  for (let i = 0; i < env.discCount; i++) {
    const cx = env.discs[i * 3], cy = env.discs[i * 3 + 1], reach = env.discs[i * 3 + 2];
    const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
    if (dy < reach) {
      const hc = Math.sqrt(reach * reach - dy * dy);
      let j = ds.length;
      ds.push(0, 0);
      while (j > 0 && ds[j - 2] > cx - hc) { ds[j] = ds[j - 2]; ds[j + 1] = ds[j - 1]; j -= 2; }
      ds[j] = cx - hc; ds[j + 1] = cx + hc;
    }
  }
  if (env.used + env.itemCount * 2 + ds.length + 2 > env.arena.length) {
    const grown = new Float64Array(Math.max(env.arena.length * 2, env.used + env.itemCount * 2 + ds.length + 2));
    grown.set(env.arena.subarray(0, env.used));
    env.arena = grown;
  }
  const A = env.arena, items = env.items, start = env.used;
  let end = start, di = 0;
  for (let i = 0, n = env.itemCount * 4; i <= n; i += 4) {
    // the next interval in start order: a disc's, or the next box reaching the band (i === n: the discs left)
    let a: number, b: number;
    if (i < n && !(y0 < items[i + 3] && y1 > items[i + 2])) continue;
    const next = i < n ? items[i] : Infinity;
    while (di < ds.length && ds[di] <= next) {
      a = ds[di]; b = ds[di + 1]; di += 2;
      if (end > start && a <= A[end - 1]) { if (b > A[end - 1]) A[end - 1] = b; } else { A[end] = a; A[end + 1] = b; end += 2; }
    }
    if (i === n) break;
    a = next; b = items[i + 1];
    if (end > start && a <= A[end - 1]) { if (b > A[end - 1]) A[end - 1] = b; } else { A[end] = a; A[end + 1] = b; end += 2; }
  }
  env.used = end;
  const code = start * 128 + (end - start) / 2;
  keys[slot] = key; env.codes[slot] = code; stamps[slot] = generation;
  return code;
}

/** What placing a `w` x `h` box at (x, y) over the space's soft ink costs (its overlap in px², margin included). */
function softCost(env: Env, x: number, y: number, w: number, h: number): number {
  let area = 0;
  const m = MOUSE_RETICLE_MARGIN_PX;
  for (const k of env.soft) {
    const ox = Math.min(x + w, k.x + k.w + m) - Math.max(x, k.x - m), oy = Math.min(y + h, k.y + k.h + m) - Math.max(y, k.y - m);
    if (ox > 0 && oy > 0) area += ox * oy;
  }
  return area * SOFT_INK_COST;
}

/** Append [x0 - gap, x1 + gap] for each rect that reaches the band [y0, y1] (gap included). */
function blockRects(out: number[], y0: number, y1: number, rects: readonly PlanRect[]): void {
  const g = MOUSE_NOTICE_GAP_PX;
  for (let i = 0; i < rects.length; i++) {
    const o = rects[i];
    if (y0 < o.y + o.h + g && y1 > o.y - g) out.push(o.x - g, o.x + o.w + g);
  }
}

/** Sort the pairs of `raw` by start (in place: a few) and merge overlapping ones into `out`. */
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
 *  below that already meet the ring, so a yielding lane is priced by the clear rows it gives up. */
function clearBottom(lane: PlanLane, keep: readonly PlanKeepOut[]): number {
  let bottom = lane.bottom;
  for (const k of keep) {
    if ('r' in k) {
      const dx = Math.max(lane.x - k.cx, 0, k.cx - (lane.x + lane.w));
      if (dx < k.r) bottom = Math.min(bottom, k.cy - Math.sqrt(k.r * k.r - dx * dx));
    } else if (lane.x < k.x + k.w && lane.x + lane.w > k.x) bottom = Math.min(bottom, k.y);
  }
  return Math.max(lane.top, bottom);
}
const laneClear: [number, number] = [NaN, NaN];

/**
 * The band each lane keeps while `box` shows (`out[o .. o + 4)`, NaN: its own): its rows start below the box or end
 * above it, whichever keeps more of its rows clear of the battle sight (ending above moves nothing). Returns the cost
 * at `price`, `price.empty` more for a lane left without a row.
 */
function yieldLanes(input: MouseNoticeInput, x: number, y: number, w: number, h: number, out: number[], o: number,
  price: LanePrice = BATTLE_LANES): number {
  let cost = 0;
  const g = MOUSE_NOTICE_GAP_PX;
  for (let side = 0; side < 2; side++) {
    out[o + side * 2] = NaN; out[o + side * 2 + 1] = NaN;
    const lane = input.lanes[side];
    if (!lane || !(x < lane.x + lane.w + g && x + w > lane.x - g && y < lane.bottom + g && y + h + g > lane.top)) continue;
    const clear = Number.isNaN(laneClear[side]) ? lane.bottom : laneClear[side];
    const before = rowsIn(clear - lane.top);
    const below = Math.ceil(y + h + g), above = Math.floor(y - g);
    const need = laneRowPx(side, lane);
    const keptBelow = lane.bottom - below >= need ? rowsIn(lane.bottom - below) : 0, keptAbove = above - lane.top >= need ? rowsIn(above - lane.top) : 0;
    if (!keptBelow && !keptAbove && lane.bottom - lane.top >= need) cost += price.empty;
    const clearBelow = keptBelow ? rowsIn(clear - below) : -1, clearAbove = keptAbove ? rowsIn(Math.min(clear, above) - lane.top) : -1;
    if (clearAbove >= clearBelow) {
      out[o + side * 2 + 1] = above;
      cost += price.fixed + price.row * (before - clearAbove);
    } else {
      out[o + side * 2] = below;
      cost += price.fixed + price.row * (before - clearBelow) + price.px * (below - lane.top);
    }
  }
  return cost;
}
const NO_YIELD: PlanGiveWay = Object.freeze([NaN, NaN, NaN, NaN]);
const giveWayOf = (s: readonly number[], o: number): PlanGiveWay =>
  Number.isNaN(s[o]) && Number.isNaN(s[o + 1]) && Number.isNaN(s[o + 2]) && Number.isNaN(s[o + 3]) ? NO_YIELD : [s[o], s[o + 1], s[o + 2], s[o + 3]];
/** What the lanes left without a kill row cost while both bands `gw[0..4)` and `gw[4..8)` apply. */
function jointRows(input: MouseNoticeInput, gw: readonly number[], price: LanePrice = BATTLE_LANES): number {
  let cost = 0;
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    if (!lane) continue;
    const t = Math.max(lane.top, Number.isNaN(gw[side * 2]) ? -Infinity : gw[side * 2], Number.isNaN(gw[4 + side * 2]) ? -Infinity : gw[4 + side * 2]);
    const b = Math.min(lane.bottom, Number.isNaN(gw[side * 2 + 1]) ? Infinity : gw[side * 2 + 1], Number.isNaN(gw[5 + side * 2]) ? Infinity : gw[5 + side * 2]);
    const need = laneRowPx(side, lane);
    if (b - t < need && lane.bottom - lane.top >= need) cost += price.empty;
  }
  return cost;
}

/**
 * Visit y from `yPref` in order of its own cost (a px up costs UP_COST, a px down 1) within [yMin, yMax], stopping once
 * the next y would cost `limit()` or more.
 */
function walkY(yPref: number, yMin: number, yMax: number, limit: () => number, visit: (y: number, yCost: number) => void,
  step = Y_STEP): void {
  const start = Math.max(yMin, Math.min(yMax, yPref));
  // (a range wholly below or above yPref, as walkFine's, still prices each y from yPref)
  const costAt = (y: number) => y < yPref ? (yPref - y) * UP_COST : y - yPref;
  let up = start, down = start + step;
  for (;;) {
    const upCost = up >= yMin ? costAt(up) : Infinity;
    const downCost = down <= yMax ? costAt(down) : Infinity;
    const cost = Math.min(upCost, downCost);
    if (cost === Infinity || cost >= limit()) return;
    if (upCost <= downCost) {
      visit(up, upCost);
      // the highest place (yMin, under the score) is always visited, on the grid or not
      up = up > yMin && up - step < yMin ? yMin : up - step;
    } else { visit(down, downCost); down += step; }
  }
}
/** walkY on the coarse grid, then to the px within a step of the cheapest y `found()` reports (NaN: none). */
function walkFine(yPref: number, yMin: number, yMax: number, limit: () => number, visit: (y: number, yCost: number) => void,
  found: () => number): void {
  walkY(yPref, yMin, yMax, limit, visit);
  const y = found();
  if (Number.isFinite(y)) walkY(yPref, Math.max(yMin, y - Y_STEP + 1), Math.min(yMax, y + Y_STEP - 1), limit, visit, 1);
}

const NONE: readonly PlanRect[] = [];
const avoidRaw: number[] = [];
const avoidMerged: number[] = [];
const yieldScratch: number[] = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
const jointScratch: number[] = [NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN];
const partnerScratch: number[] = [NaN, NaN, NaN, NaN];
interface Single { y: number; x: number; cost: number; lane: number; readonly giveWay: number[] }
const single = (): Single => ({ y: 0, x: 0, cost: Infinity, lane: 0, giveWay: [NaN, NaN, NaN, NaN] });
/** The cheapest place for one `w` x `h` box (x: its centre) from `yPref` off `avoid`; its cost includes `base`
 *  (Infinity when none beats `bound`), `lane` the part the lanes' yielding makes up. */
function singleBest(env: Env, w: number, h: number, yPref: number, base: number, bound: number, out: Single,
  avoid: readonly PlanRect[] = NONE, price: LanePrice = BATTLE_LANES, partner: readonly number[] | null = null): Single {
  const { input } = env;
  const cx = input.width / 2;
  out.cost = Infinity; out.lane = 0;
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
    let lane = env.lanes === 'yield' ? yieldLanes(input, m - w / 2, y, w, h, yieldScratch, 0, price) : 0;
    // shown with `partner` (a placed box's lane bands): a lane the two leave without a row
    if (partner) {
      for (let i = 0; i < 4; i++) { jointScratch[i] = partner[i]; jointScratch[4 + i] = yieldScratch[i]; }
      lane += jointRows(input, jointScratch, price);
    }
    const cost = base + yCost + SHIFT_COST * Math.abs(m - cx) + lane + (env.soft.length ? softCost(env, m - w / 2, y, w, h) : 0);
    if (cost < out.cost) {
      out.cost = cost; out.x = m; out.y = y; out.lane = lane;
      for (let i = 0; i < 4; i++) out.giveWay[i] = env.lanes === 'yield' ? yieldScratch[i] : NaN;
    }
  }, () => out.cost < Infinity ? out.y : NaN);
  return out;
}

/**
 * Up to `k` more places for one `w` x `h` box, apart from each other and from `skip` (centre x, top y, cost; cheapest
 * first) on the coarse grid: the detection's cheapest place can leave the alert none where a dearer one would not.
 */
function otherPlaces(env: Env, w: number, h: number, yPref: number, bound: number, k: number, skip: readonly Single[],
  out: number[]): number[] {
  const { input } = env;
  const cx = input.width / 2, hh = Math.ceil(h);
  const found: number[] = [];
  walkY(yPref, Math.ceil(input.top + MOUSE_NOTICE_GAP_PX), input.height - EDGE_PX - hh, () => bound, (y, yCost) => {
    const m = freeIn(env, band(env, y, hh), w / 2, EDGE_PX + w / 2, input.width - EDGE_PX - w / 2, cx);
    if (Number.isNaN(m)) return;
    const lane = env.lanes === 'yield' ? yieldLanes(input, m - w / 2, y, w, h, yieldScratch, 0) : 0;
    found.push(m, y, yCost + SHIFT_COST * Math.abs(m - cx) + lane);
  });
  const order: number[] = [];
  for (let i = 0; i < found.length; i += 3) order.push(i);
  order.sort((a, b) => found[a + 2] - found[b + 2]);
  out.length = 0;
  const apart = (x: number, y: number, ox: number, oy: number) => Math.abs(x - ox) >= w || Math.abs(y - oy) >= h;
  for (const i of order) {
    if (out.length >= k * 3) break;
    const x = found[i], y = found[i + 1];
    if (skip.some((o) => Number.isFinite(o.cost) && !apart(x, y, o.x, o.y))) continue;
    let ok = true;
    for (let j = 0; ok && j < out.length; j += 3) ok = apart(x, y, out[j], out[j + 1]);
    if (ok) out.push(x, y, found[i + 2]);
  }
  return out;
}
const alternatives: number[] = [];
const ALTERNATIVES = 3;

interface PairResult { cost: number; arrangement: MouseNoticePlan['arrangement']; det: PlannedNotice; alert: PlannedAlert }
interface Config { readonly dw: number; readonly dh: number; readonly aw: number; readonly ah: number; readonly base: number }

function configs(input: MouseNoticeInput): Config[] {
  const out: Config[] = [];
  const { width, smallAlert: small } = input;
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
      out.push({ dw, dh, aw, ah, base: detCost + (ah - alertMin) + (520 - awFull) * .02 });
    }
  }
  return out.sort((a, b) => a.base - b.base);
}

/** The detection's and the alert's cheapest places in the spaces `envs` (one keep-out: the lanes blocking, then
 *  yielding), or null. */
function searchPair(input: MouseNoticeInput, envs: readonly Env[]): PairResult | null {
  const { width, height, top } = input;
  const cx = width / 2;
  const yMin = Math.ceil(top + MOUSE_NOTICE_GAP_PX);
  const yPref = Math.max(yMin, Math.ceil(height * .12));
  const g = MOUSE_NOTICE_GAP_PX;
  let best: PairResult | null = null;
  const bestCost = () => best === null ? Infinity : best.cost;
  const gw = yieldScratch;
  const detAny = single(), detOff = single(), two = single();
  const list = configs(input);
  const minBase = list[0].base;
  for (const env of envs) {
    const yielding = env.lanes === 'yield';
    /** Both boxes' lane bands (gw[0..4) the detection's, gw[4..8) the alert's) and their cost, a lane the two shown
     *  together would leave without a row included, and the soft ink they cover. */
    const laneCost = (dx: number, dy: number, dw: number, dh: number, ax: number, ay: number, aw: number, ah: number) =>
      (env.soft.length ? softCost(env, dx, dy, dw, dh) + softCost(env, ax, ay, aw, ah) : 0)
      + (yielding ? yieldLanes(input, dx, dy, dw, dh, gw, 0) + yieldLanes(input, ax, ay, aw, ah, gw, 4) + jointRows(input, gw) : 0);
    const offer = (cost: number, arrangement: PairResult['arrangement'], det: Omit<PlannedNotice, 'giveWay'>,
      alert: Omit<PlannedAlert, 'giveWay'>) => {
      if (!(cost < bestCost())) return;
      best = { cost, arrangement, det: { ...det, giveWay: yielding ? giveWayOf(gw, 0) : NO_YIELD },
        alert: { ...alert, giveWay: yielding ? giveWayOf(gw, 4) : NO_YIELD } };
    };
    const detFit = new Map<number, boolean>();
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
            const ay = y + dh + g;
            offer(c.base + yCost + SHIFT_COST * Math.abs(m - cx) + laneCost(m - dw / 2, y, dw, dh, m - aw / 2, ay, aw, ah), 'stack',
              { x: m - dw / 2, y, w: dw, h: dh }, { x: m, y: ay, w: aw, h: ah, anchor: 'centre', small: input.smallAlert });
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
          offer(lb + SHIFT_COST * (Math.abs(md - dTarget) + Math.abs(ma - aTarget)) / 2 + laneCost(md - dw / 2, y, dw, dh, ma - aw / 2, y, aw, ah),
            'flank', { x: md - dw / 2, y, w: dw, h: dh },
            { x: detLeft ? ma - aw / 2 : ma + aw / 2, y, w: aw, h: ah, anchor: detLeft ? 'start' : 'end', small: input.smallAlert });
        }
      }
    }, () => best === null ? NaN : best.det.y);
    // split: the detection at its own cheapest place (with the lanes yielding: also its cheapest off them, and a few
    // dearer places apart from those), then the alert at its own, off the detection, pricing a lane the two would
    // leave without a row
    let lastDw = -1;
    const others: number[] = [];
    for (const c of list) {
      if (c.base + SPLIT_COST >= bestCost()) continue;
      if (c.dw !== lastDw) {
        lastDw = c.dw;
        singleBest(env, c.dw, c.dh, yPref, 0, bestCost(), detAny);
        detOff.cost = Infinity;
        others.length = 0;
        if (yielding) {
          singleBest(envs[0], c.dw, c.dh, yPref, 0, bestCost(), detOff);
          for (const v of otherPlaces(env, c.dw, c.dh, yPref, bestCost(), ALTERNATIVES, [detAny, detOff], alternatives)) others.push(v);
        }
      }
      for (let k = 0; k < 2 + others.length / 3; k++) {
        let dx: number, dy: number, dcost: number;
        if (k < 2) {
          const dets = k ? detOff : detAny;
          if (!Number.isFinite(dets.cost)) continue;
          dx = dets.x; dy = dets.y; dcost = dets.cost - dets.lane;
        } else {
          dx = others[(k - 2) * 3]; dy = others[(k - 2) * 3 + 1];
          dcost = others[(k - 2) * 3 + 2] - yieldLanes(input, dx - c.dw / 2, dy, c.dw, c.dh, partnerScratch, 0);
        }
        const fixed = c.base + SPLIT_COST + dcost;
        if (fixed >= bestCost()) continue;
        const detBox: PlanRect = { x: dx - c.dw / 2, y: dy, w: c.dw, h: c.dh };
        const detLanes = yielding ? (yieldLanes(input, detBox.x, detBox.y, c.dw, c.dh, partnerScratch, 0), partnerScratch) : null;
        singleBest(env, c.aw, c.ah, yPref, fixed, bestCost(), two, [detBox], BATTLE_LANES, detLanes);
        if (!Number.isFinite(two.cost)) continue;
        // each search priced its own lanes; the pair is priced once more, as laneCost leaves both bands in gw
        offer(two.cost - two.lane + laneCost(detBox.x, detBox.y, c.dw, c.dh, two.x - c.aw / 2, two.y, c.aw, c.ah), 'split', detBox,
          { x: two.x, y: two.y, w: c.aw, h: c.ah, anchor: 'centre', small: input.smallAlert });
      }
    }
  }
  return best;
}

const placeScratch = single();
/** A candidate box for placeOne: its size, base cost and the notice places it keeps off. */
type Option = readonly [w: number, h: number, base: number, avoid: readonly PlanRect[]];
/** The cheapest place for any of `options` from `yPref` in `env` (its keep-out; the lanes blocking or yielding). */
function placeOne(env: Env, options: readonly Option[], yPref: number, price: LanePrice, partner: readonly number[] | null,
  out: { cost: number; option: number; s: Single }): boolean {
  const one = placeScratch;
  out.cost = Infinity;
  for (let i = 0; i < options.length; i++) {
    const [w, h, base, avoid] = options[i];
    if (base >= out.cost) continue;
    singleBest(env, w, h, yPref, base, out.cost, one, avoid, price, partner);
    if (one.cost < out.cost) {
      out.cost = one.cost; out.option = i;
      out.s.x = one.x; out.s.y = one.y; out.s.cost = one.cost; out.s.lane = one.lane;
      for (let k = 0; k < 4; k++) out.s.giveWay[k] = one.giveWay[k];
    }
  }
  return out.cost < Infinity;
}

/** main's own places: the detection under the score, the alert at bottom 23 % (the last resort). */
function fallbackPair(input: MouseNoticeInput): PairResult {
  const { width, height, top } = input;
  const dw = Math.min(248, width - 28), dh = detectionHeight(dw, input.compactDetection);
  const aw = Math.min(520, width - 32), ah = alertReserve(aw, input.smallAlert);
  const y = Math.max(top + MOUSE_NOTICE_GAP_PX, height * .12);
  return { cost: Infinity, arrangement: 'fallback', det: { x: (width - dw) / 2, y, w: dw, h: dh, giveWay: NO_YIELD },
    alert: { x: width / 2, y: height * .77 - ah, w: aw, h: ah, anchor: 'centre', small: input.smallAlert, giveWay: NO_YIELD } };
}

const TIERS = [2, 1, 0] as const;
/** Where the countdown, the revive count and the medal card look for a place, in order: [tier, may share a notice's
 *  place]. A place off the notices at a reduced keep-out beats sharing their place at the full one, and sharing beats
 *  touching the resting sight. */
const STEPS = [[2, false], [1, false], [2, true], [1, true], [0, false], [0, true]] as const;

/** Every centre notice's place on the mouse layout (see the module comment). */
export function planMouseNotices(input: MouseNoticeInput): MouseNoticePlan {
  mouseNoticePlanWork.bands = 0;
  const id = ++plansMade;
  let pair: PairResult | null = null;
  let clearance: MouseNoticePlan['clearance'] = -1;
  const keeps = TIERS.map((tier) => mouseReticleFootprint(input.width, input.height, tier));
  const clear: [number, number] = [NaN, NaN];
  for (let side = 0; side < 2; side++) {
    const lane = input.lanes[side];
    clear[side] = lane ? clearBottom(lane, keeps[1]) : NaN;
  }
  // The search spaces per keep-out (made on first use, again if a later plan took the pool meanwhile): the lanes
  // blocking, then yielding (where there are lanes).
  const hasLanes = !!(input.lanes[0] || input.lanes[1]);
  const spaces: (Env[] | undefined)[] = [];
  const own = () => {
    laneClear[0] = clear[0]; laneClear[1] = clear[1];
    if (poolPlan !== id) { spaces.length = 0; poolPlan = id; }
  };
  // (a reduced keep-out still prices the rest of the full one as soft ink)
  const envsAt = (i: number): Env[] => spaces[i] ??= hasLanes
    ? [makeEnv(i * 2, input, keeps[i], 'block', i ? keeps[0] : []), makeEnv(i * 2 + 1, input, keeps[i], 'yield', i ? keeps[0] : [])]
    : [makeEnv(i * 2, input, keeps[i], 'block', i ? keeps[0] : [])];
  own();
  for (let i = 0; i < TIERS.length && !pair; i++) {
    pair = searchPair(input, envsAt(i));
    if (pair) clearance = TIERS[i];
  }
  if (!pair) pair = fallbackPair(input);
  const a = pair.alert;
  const det = pair.det, alert: PlanRect = { x: a.anchor === 'centre' ? a.x - a.w / 2 : a.anchor === 'start' ? a.x : a.x - a.w, y: a.y, w: a.w, h: a.h };
  const notices: PlanRect[] = [det, alert], alertOnly = [alert];
  const found = { cost: Infinity, option: 0, s: single() };
  let chosen: readonly Option[] = [];
  // The lanes' bands while both notices show: a later element shown beside them keeps every lane a row too, if it can.
  const both: number[] = [];
  for (let i = 0; i < 4; i++) {
    const d = det.giveWay[i], al = pair.alert.giveWay[i];
    both.push(Number.isNaN(d) ? al : Number.isNaN(al) ? d : i % 2 ? Math.min(d, al) : Math.max(d, al));
  }
  /** The first step of STEPS where one of `options(share)` has a place (its lanes yield where there are lanes); the
   *  place is left in `found`, its option in `chosen[found.option]`. `mayShare` false: the sharing steps are skipped. */
  const place = (options: (share: boolean, tier: 2 | 1 | 0) => readonly Option[], yPref: number, price: LanePrice, mayShare = true) => {
    for (const [tier, share] of STEPS) {
      if (share && !mayShare) continue;
      const envs = envsAt(TIERS.indexOf(tier));
      chosen = options(share, tier);
      if (placeOne(envs[envs.length - 1], chosen, yPref, price, hasLanes ? both : null, found)) return tier;
    }
    return -1;
  };
  /** `shareDetection`: the box may take the detection's place where nothing else clears the reticle (the countdown: the
   *  battle does not step before the roll-out, so no enemy can spot the player). It never takes the alert's: H, R and E
   *  raise alerts during the countdown, and modes' events and keys raise them while the player waits to revive (when a
   *  detection lit just before the death also burns on, so the revive count takes neither place). */
  const scaled = (size: PlanSize | null, yFrac: number, price: LanePrice, shareDetection: boolean): PlannedScaled | null => {
    if (!size || size.w <= 0 || size.h <= 0) return null;
    const yPref = Math.max(Math.ceil(input.top + MOUSE_NOTICE_GAP_PX), Math.ceil(input.height * yFrac));
    const ladder = (tier: number) => tier ? SCALES : LAST_SCALES;
    const tier = place((share, t) => ladder(t).map((s, i) => [size.w * s, size.h * s, LAST_SCALE_COSTS[i], share ? alertOnly : notices] as const),
      yPref, price, shareDetection);
    if (tier < 0) return null;
    const s = ladder(tier)[found.option], w = size.w * s, h = size.h * s, x = found.s.x - w / 2, y = found.s.y;
    return { x, y, w, h, scale: s, clearance: tier as 2 | 1 | 0, sharesNotices: overlapsAny({ x, y, w, h }, notices), giveWay: giveWayOf(found.s.giveWay, 0) };
  };
  // The medal card: the full card wherever a place clears the keep-out, off both notices or (waiting while it is up) on
  // the alert's place, the detection's or both; the compact card only where the full one has no place at that keep-out.
  const { medal: full, medalCompact: compact } = input;
  const detOnly = [det];
  const medalOptions = (): readonly Option[] => [
    [full.w, full.h, 0, notices], [full.w, full.h, MEDAL_SHARE_ALERT_COST, detOnly],
    [full.w, full.h, MEDAL_SHARE_DETECTION_COST, alertOnly], [full.w, full.h, MEDAL_SHARE_BOTH_COST, NONE],
    [compact.w, compact.h, MEDAL_COMPACT_COST, notices], [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_ALERT_COST, detOnly],
    [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_DETECTION_COST, alertOnly],
    [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_BOTH_COST, NONE]];
  const placeMedal = (): PlannedMedal | null => {
    // (its sharing is in its options: the steps are the keep-outs alone)
    const medalTier = place(medalOptions, Math.ceil(input.top + 16), BATTLE_LANES, false);
    if (medalTier < 0) return null;
    const [w, h, base] = chosen[found.option];
    const box = { x: found.s.x - w / 2, y: found.s.y, w, h };
    return { ...box, compact: base >= MEDAL_COMPACT_COST, clearance: medalTier as 2 | 1 | 0,
      sharesNotices: overlapsAny(box, notices), giveWay: giveWayOf(found.s.giveWay, 0) };
  };
  // The countdown, the revive count and the medal card are placed when first asked for (a battle shows one or two of
  // them; the layout owner asks for one only while it is up), then kept.
  const later = <T>(make: () => T): (() => T) => {
    let made = false, value: T;
    return () => { if (!made) { own(); value = make(); made = true; } return value; };
  };
  const medal = later(placeMedal);
  const countdown = later(() => scaled(input.countdown, .22, PREBATTLE_LANES, true));
  const revive = later(() => scaled(input.revive, .30, BATTLE_LANES, false));
  return {
    arrangement: pair.arrangement, clearance, detection: det, alert: pair.alert,
    // The card is optional: where it shares a notice's place it waits while that notice is up (keeping its time).
    get medal() { return medal(); },
    get countdown() { return countdown(); },
    get revive() { return revive(); },
  };
}

/** The alert's box from its slot (its anchor: centre, left edge or right edge). */
export function mouseAlertBox(a: MouseNoticePlan['alert']): PlanRect {
  return { x: a.anchor === 'centre' ? a.x - a.w / 2 : a.anchor === 'start' ? a.x : a.x - a.w, y: a.y, w: a.w, h: a.h };
}
/** Two places closer than MOUSE_NOTICE_GAP_PX. */
const meets = (a: PlanRect, b: PlanRect) => a.x < b.x + b.w + MOUSE_NOTICE_GAP_PX && a.x + a.w > b.x - MOUSE_NOTICE_GAP_PX
  && a.y < b.y + b.h + MOUSE_NOTICE_GAP_PX && a.y + a.h > b.y - MOUSE_NOTICE_GAP_PX;
/**
 * Whether the medal card waits (keeping its time; medalToast.ts) rather than show with what is up: it has no place, the
 * scope is up where its place clears the battle sight only, or a shown element's place meets its own: a notice whose
 * place it shares, or the revive count (a medal can arrive after the death: a shell still in flight, a mutual kill).
 * The revive count's place is read (made) only while it shows.
 */
export function mouseMedalWaits(plan: MouseNoticePlan, up: MouseMedalCompany): boolean {
  const slot = plan.medal;
  if (!slot) return true;
  if (up.scoped && slot.clearance < 2) return true;
  if (up.detection && meets(slot, plan.detection)) return true;
  if (up.alert && meets(slot, mouseAlertBox(plan.alert))) return true;
  const revive = up.revive ? plan.revive : null;
  return !!revive && meets(slot, revive);
}
