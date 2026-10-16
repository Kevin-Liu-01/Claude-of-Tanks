/**
 * Where the centre notices (detection and the system alert) and the pre-battle countdown sit on a touch screen, so
 * that they never cover the reticle, and how they share the space above it with the touch action dock (verifier
 * 2026-10-15: on 390 x 844 the dock pushed the alert to 11 px above the aim point and the countdown across the
 * crosshair; main itself puts them on the crosshair of most phones, pushed down by the kill feeds or placed at fixed
 * percentages of the screen).
 *
 * The reticle is three nested keep-outs (reticleTiers): the crosshair core (the 64 px round the aim point and the
 * magazine / reload countdown under it), the battle sight at full bloom (the dispersion ring at 15% of the shorter
 * side), and everything either sight draws at any bloom (touchReticleFootprint: the scope's cross arms, ammunition
 * line, zoom plate and range tag besides). The notices take the cheapest place (highest, then most central) that clears
 * the widest keep-out any place clears, in one of two arrangements:
 * - stacked: detection over the alert, centred on the screen, or shifted sideways past an instrument;
 * - flanking: detection left of the reticle's column and the alert right of it on one line, where a stack would reach
 *   the ring (landscape phones: the objective plate ends 30 to 60 px above the ring at full bloom);
 * at full size where that keep-out allows, else compact (COMPACT_NOTICES: the stylesheet's own 299 px landscape
 * notices). The countdown takes the same kind of place, scaled down to 60% or as one compact line where its full size
 * does not fit. Neither is ever pushed by the kill feeds: the feeds end above the notices while one shows.
 *
 * planTouchCentre decides the order with the action dock: the notices' place reserved before the dock is placed, or
 * the dock placed first and the notices kept off it; whichever leaves the notices and the countdown clearer of the
 * reticle, then shows more controls on the dock (at 48 px rather than 44), then sits higher and nearer the thumbs.
 * Inputs are the fixed instruments and touch controls, never the feeds or the notices' own text, so nothing moves
 * while notices come and go. DOM-free and deterministic: centreNotices.selftest.mjs checks every touch viewport of
 * the rendered receipt, and tools/battle-hud-layout.browser.mjs measures the rendered boxes against the reticle.
 */
import {
  placeTouchActionDock, touchReticleFootprint, type TouchDockKeepOut, type TouchDockPlacement, type TouchDockRect,
} from './touchActionDock.ts';

export interface NoticeSize { readonly w: number; readonly h: number }
/** How clear of the reticle a placement is: 3 clears everything it draws, 2 the battle sight at full bloom, 1 the
 *  crosshair core, 0 none of them. */
export type ReticleClearance = 0 | 1 | 2 | 3;

export interface NoticeLane {
  readonly arrangement: 'stack' | 'flank' | 'split';
  readonly detection: TouchDockRect;
  readonly alert: TouchDockRect;
  readonly clearance: ReticleClearance;
  /** The compact notices (battleHudLayout.css data-hud-notices=compact) were needed. */
  readonly compact: boolean;
  /** Distance down from the top lane plus weighted sideways shift (lower is better). */
  readonly cost: number;
  /** At clearance 0, how much of the reticle the notices cover (4 px cells, weighted inward); else 0. */
  readonly cover: number;
}

export interface CountdownLane extends TouchDockRect {
  /** The countdown's scale (1 at its natural size); x/y/w/h are the box as shown. */
  readonly scale: number;
  /** One compact line (battleHudLayout.css data-hud-countdown=compact). */
  readonly compact: boolean;
  readonly clearance: ReticleClearance;
  /** At clearance 0, how much of the reticle it covers (4 px cells, weighted inward); else 0. */
  readonly cover: number;
}

/**
 * The compact notices' default boxes (the page measures its own, battleHudLayout.ts): detection in 9 px type without
 * its second line (where main hides it too: a landscape phone), the alert in 8 px type (main's smallest) 180 px wide,
 * where the longest alert takes two lines (verifier 2026-10-16: the old 120 px alert, clamped to two lines, cut
 * "AMMUNITION TYPE EMPTY · SELECT ANOTHER TYPE" short where main showed it whole), and the countdown on one 40 px line.
 */
export const COMPACT_NOTICES = Object.freeze({
  detection: Object.freeze({ w: 120, h: 32 }), alert: Object.freeze({ w: 180, h: 28 }),
  countdown: Object.freeze({ w: 156, h: 40 }),
});
/** The compact alert's widest box (main's handset-landscape alert, max-width 180 px). */
export const COMPACT_ALERT_MAX_W = 180;

/**
 * The alert's reserved box, not its current text (the lane must not move with the copy): up to 260 px wide (the screen
 * less 32), and as tall as the longest alert in the catalogue needs at that width (the page measures it,
 * battleHudLayout.ts naturalCentreSizes); `lineBox` plus 15 px (a second line of 12 px type and less) where nothing
 * was measured.
 */
export function alertReserve(width: number, lineBox: number, measured?: number): NoticeSize {
  return { w: Math.min(260, width - 32), h: measured ? Math.max(lineBox, measured) : lineBox + 15 };
}

/** Gap between detection and the alert, and between a notice and an instrument, control or tile. */
export const NOTICE_GAP_PX = 8;
const EDGE_PX = 12;
/** A hairline kept off the reticle's ink. */
const RETICLE_GAP_PX = 2;
/** The crosshair core: the camera cross and gun mark at rest, as the dock's minimum keep-out (touchActionDock.ts). */
const CORE_RADIUS_PX = 32;
/** Moving a lane sideways costs this much per px against moving it down; flanking costs a fixed amount more. */
const SHIFT_COST = 1.5;
const FLANK_COST = 24;
/** Split notices (each at its own place) cost both places and this much more: a stack or a flank wins where one fits. */
const SPLIT_COST = 48;
/** The dock's distance from the thumbs, as planTouchDock weighs it: two tile rows a step. */
const DOCK_REACH_STEP_PX = 96;
/** The docks planTouchDock weighs when it places the dock first: the search's own pick (any rows), then the nearest of one,
 *  two and three rows. */
const DOCK_ROW_OPTIONS = [0, 1, 2, 3] as const;
/** The countdown shrinks in these steps, to 60% at most; each 10% costs as much as moving 40 px. */
const COUNTDOWN_SCALES = [1, .9, .8, .7, .6] as const;
const COUNTDOWN_SCALE_COST = 400;
/** The compact countdown line costs more than any scaled one. */
const COUNTDOWN_COMPACT_COST = 200;

/** The reticle's keep-outs, innermost first: [crosshair core, battle sight at full bloom, everything at any bloom]. */
export function reticleTiers(width: number, height: number): readonly [TouchDockKeepOut[], TouchDockKeepOut[], TouchDockKeepOut[]] {
  const full = touchReticleFootprint(width, height);
  // touchReticleFootprint: [0] the full-bloom ring, [1, 2] the scope's arms, [3] the magazine and reload stack.
  const ring = full[0] as { x: number; y: number; r: number };
  const stack = full[3] as TouchDockRect;
  return [[{ x: ring.x, y: ring.y, r: CORE_RADIUS_PX }, stack], [ring, stack], full];
}

/** Blocked intervals for the left edge of a `w`-wide box over the band [y, y + h], appended to `out`. */
function blockInterval(out: number[], k: TouchDockKeepOut, y: number, h: number, w: number, gap: number): void {
  if ('r' in k) {
    const reach = k.r + gap;
    const dy = k.y < y ? y - k.y : k.y > y + h ? k.y - y - h : 0;
    if (dy >= reach) return;
    const half = Math.sqrt(reach * reach - dy * dy);
    out.push(k.x - half - w, k.x + half);
  } else if (y < k.y + k.h + gap && y + h > k.y - gap) {
    out.push(k.x - gap - w, k.x + k.w + gap);
  }
}

/** The integer in [lo, hi] outside every open interval in `blocked` (pairs) nearest `target` (the smaller on a tie),
 *  or null: walks outward from the target, jumping past each interval that holds the walker. */
function nearestFree(blocked: readonly number[], lo: number, hi: number, target: number): number | null {
  if (lo > hi) return null;
  const start = Math.min(hi, Math.max(lo, Math.round(target)));
  const walk = (dir: 1 | -1): number | null => {
    let x = start;
    for (let jumped = true; jumped;) {
      jumped = false;
      for (let i = 0; i < blocked.length; i += 2) {
        if (x > blocked[i] && x < blocked[i + 1]) { x = dir > 0 ? Math.ceil(blocked[i + 1]) : Math.floor(blocked[i]); jumped = true; break; }
      }
      if (x > hi || x < lo) return null;
    }
    return x;
  };
  const right = walk(1), left = walk(-1);
  if (left === null) return right;
  if (right === null) return left;
  return Math.abs(right - target) < Math.abs(left - target) ? right : left;
}

const blockedScratch: number[] = [];
/** The free left edge for a `w` x `h` box at `y` nearest `target`, clear of the obstacles and the keep-out. */
function freeX(width: number, y: number, w: number, h: number, target: number, obstacles: readonly TouchDockRect[],
  keep: readonly TouchDockKeepOut[]): number | null {
  blockedScratch.length = 0;
  for (const o of obstacles) blockInterval(blockedScratch, o, y, h, w, NOTICE_GAP_PX);
  for (const k of keep) blockInterval(blockedScratch, k, y, h, w, RETICLE_GAP_PX);
  return nearestFree(blockedScratch, EDGE_PX, Math.floor(width - EDGE_PX - w), target);
}

interface Candidate { cost: number; boxes: [TouchDockRect, TouchDockRect]; arrangement: 'stack' | 'flank' | 'split' }

const insideShape = (k: TouchDockKeepOut, x: number, y: number) => 'r' in k
  ? Math.hypot(x - k.x, y - k.y) <= k.r : x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h;
const TIER_WEIGHT = [4, 2, 1] as const;
/** The box bounding every shape of a keep-out. */
function shapesBox(shapes: readonly TouchDockKeepOut[]): TouchDockRect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of shapes) {
    const kx0 = 'r' in k ? k.x - k.r : k.x, ky0 = 'r' in k ? k.y - k.r : k.y;
    const kx1 = 'r' in k ? k.x + k.r : k.x + k.w, ky1 = 'r' in k ? k.y + k.r : k.y + k.h;
    x0 = Math.min(x0, kx0); y0 = Math.min(y0, ky0); x1 = Math.max(x1, kx1); y1 = Math.max(y1, ky1);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** How much of the reticle a box covers, in 4 px cells weighted inward (the core 4, the battle sight 2, the rest 1). */
function reticleOverlap(tiers: ReturnType<typeof reticleTiers>, bound: TouchDockRect, r: TouchDockRect): number {
  if (r.x >= bound.x + bound.w || r.x + r.w <= bound.x || r.y >= bound.y + bound.h || r.y + r.h <= bound.y) return 0;
  let sum = 0;
  for (let y = Math.max(r.y, bound.y) + 2; y < Math.min(r.y + r.h, bound.y + bound.h); y += 4) {
    for (let x = Math.max(r.x, bound.x) + 2; x < Math.min(r.x + r.w, bound.x + bound.w); x += 4) {
      for (let level = 0; level < 3; level++) {
        if (tiers[level].some((k) => insideShape(k, x, y))) { sum += TIER_WEIGHT[level]; break; }
      }
    }
  }
  return sum;
}

/** Every free left edge for a `w` x `h` box at `y` on a 4 px grid (clear of the obstacles only). */
function freeEdges(width: number, y: number, w: number, h: number, obstacles: readonly TouchDockRect[]): number[] {
  blockedScratch.length = 0;
  for (const o of obstacles) blockInterval(blockedScratch, o, y, h, w, NOTICE_GAP_PX);
  const out: number[] = [];
  for (let x = EDGE_PX; x <= width - EDGE_PX - w; x += 4) {
    let free = true;
    for (let i = 0; i < blockedScratch.length; i += 2) if (x > blockedScratch[i] && x < blockedScratch[i + 1]) { free = false; break; }
    if (free) out.push(x);
  }
  return out;
}

/** No place clears even the crosshair core (568 x 256): the compact notices where they cover the least of it. */
function leastCoveringNotices(width: number, height: number, top: number, obstacles: readonly TouchDockRect[],
  detection: NoticeSize, alert: NoticeSize): (Candidate & { cover: number }) | null {
  const tiers = reticleTiers(width, height), bound = shapesBox(tiers[2]), cx = width / 2;
  let best: (Candidate & { cover: number }) | null = null;
  const consider = (cover: number, cost: number, arrangement: Candidate['arrangement'], boxes: Candidate['boxes']) => {
    if (!best || cover < best.cover || (cover === best.cover && cost < best.cost)) best = { cover, cost, arrangement, boxes };
  };
  const stackW = Math.max(detection.w, alert.w), stackH = detection.h + NOTICE_GAP_PX + alert.h;
  for (let y = Math.ceil(top); y + Math.max(detection.h, alert.h) <= height - EDGE_PX; y += 2) {
    if (y + stackH <= height - EDGE_PX) {
      for (const x of freeEdges(width, y, stackW, stackH, obstacles)) {
        const mid = x + stackW / 2;
        const boxes: Candidate['boxes'] = [{ x: mid - detection.w / 2, y, w: detection.w, h: detection.h },
          { x: mid - alert.w / 2, y: y + detection.h + NOTICE_GAP_PX, w: alert.w, h: alert.h }];
        consider(reticleOverlap(tiers, bound, boxes[0]) + reticleOverlap(tiers, bound, boxes[1]),
          y - top + SHIFT_COST * Math.abs(mid - cx), 'stack', boxes);
      }
    }
    // Flanking: for each detection place, the least covering alert place to its right (a suffix minimum).
    const ds = freeEdges(width, y, detection.w, detection.h, obstacles), as = freeEdges(width, y, alert.w, alert.h, obstacles);
    if (!ds.length || !as.length) continue;
    const covA = as.map((ax) => reticleOverlap(tiers, bound, { x: ax, y, w: alert.w, h: alert.h }));
    const bestFrom: number[] = new Array(as.length);
    for (let j = as.length - 1; j >= 0; j--) {
      const k = bestFrom[j + 1];
      bestFrom[j] = k === undefined || covA[j] < covA[k] || (covA[j] === covA[k] && Math.abs(as[j] - cx) <= Math.abs(as[k] - cx)) ? j : k;
    }
    let j = 0;
    for (const dx of ds) {
      while (j < as.length && as[j] < dx + detection.w + NOTICE_GAP_PX) j++;
      if (j >= as.length) break;
      const k = bestFrom[j], ax = as[k];
      const boxes: Candidate['boxes'] = [{ x: dx, y, w: detection.w, h: detection.h }, { x: ax, y, w: alert.w, h: alert.h }];
      consider(reticleOverlap(tiers, bound, boxes[0]) + covA[k],
        y - top + SHIFT_COST * (Math.abs(dx + detection.w - cx) + Math.abs(ax - cx)) / 2 + FLANK_COST, 'flank', boxes);
    }
  }
  // Split: the detection at its least covering place, the alert at its own off the detection.
  const least = (size: NoticeSize, avoid: readonly TouchDockRect[]) => {
    let pick: { r: TouchDockRect; cover: number; cost: number } | null = null;
    for (let y = Math.ceil(top); y + size.h <= height - EDGE_PX; y += 2) {
      for (const x of freeEdges(width, y, size.w, size.h, avoid)) {
        const r = { x, y, w: size.w, h: size.h };
        const cover = reticleOverlap(tiers, bound, r), cost = y - top + SHIFT_COST * Math.abs(x + size.w / 2 - cx);
        if (!pick || cover < pick.cover || (cover === pick.cover && cost < pick.cost)) pick = { r, cover, cost };
      }
    }
    return pick;
  };
  const d = least(detection, obstacles);
  const a = d ? least(alert, [...obstacles, d.r]) : null;
  if (d && a) consider(d.cover + a.cover, d.cost + a.cost + SPLIT_COST, 'split', [d.r, a.r]);
  return best;
}

/** One box's cheapest place (highest, then most central) clear of the obstacles and the keep-out, or null; `limit`: give
 *  up on places costing at least this much. */
function singlePlace(width: number, height: number, top: number, size: NoticeSize, obstacles: readonly TouchDockRect[],
  keep: readonly TouchDockKeepOut[], limit = Infinity): { x: number; y: number; cost: number } | null {
  const cx = width / 2;
  let best: { x: number; y: number; cost: number } | null = null;
  for (let y = Math.ceil(top); y + size.h <= height - EDGE_PX; y++) {
    if (y - top >= Math.min(limit, best ? best.cost : Infinity)) break;
    const x = freeX(width, y, size.w, size.h, cx - size.w / 2, obstacles, keep);
    if (x === null) continue;
    const cost = y - top + SHIFT_COST * Math.abs(x + size.w / 2 - cx);
    if (!best || cost < best.cost) best = { x, y, cost };
  }
  return best;
}

/** Split: each notice at its own cheapest place, the second off the first (both orders tried), where neither a stack nor
 *  a flank fits between the feeds' rows, the dock and the reticle (a portrait phone's pockets). */
function splitNotices(width: number, height: number, top: number, obstacles: readonly TouchDockRect[], keep: readonly TouchDockKeepOut[],
  detection: NoticeSize, alert: NoticeSize, limit = Infinity): Candidate | null {
  let best: Candidate | null = null;
  for (const detectionFirst of [true, false]) {
    const [a, b] = detectionFirst ? [detection, alert] : [alert, detection];
    const first = singlePlace(width, height, top, a, obstacles, keep, Math.min(limit, best?.cost ?? Infinity) - SPLIT_COST);
    if (!first) continue;
    const firstBox = { x: first.x, y: first.y, w: a.w, h: a.h };
    const second = singlePlace(width, height, top, b, [...obstacles, firstBox], keep,
      Math.min(limit, best?.cost ?? Infinity) - SPLIT_COST - first.cost);
    if (!second) continue;
    const secondBox = { x: second.x, y: second.y, w: b.w, h: b.h };
    const cost = first.cost + second.cost + SPLIT_COST;
    if (!best || cost < best.cost) best = { cost, arrangement: 'split', boxes: detectionFirst ? [firstBox, secondBox] : [secondBox, firstBox] };
  }
  return best;
}

function searchNotices(width: number, height: number, top: number, obstacles: readonly TouchDockRect[],
  keep: readonly TouchDockKeepOut[], detection: NoticeSize, alert: NoticeSize): Candidate | null {
  const cx = width / 2;
  let best: Candidate | null = null;
  const stackW = Math.max(detection.w, alert.w), stackH = detection.h + NOTICE_GAP_PX + alert.h;
  const lineH = Math.max(detection.h, alert.h);
  const bottom = height - EDGE_PX;
  for (let y = Math.ceil(top); y + Math.min(stackH, lineH) <= bottom; y++) {
    if (best && y - top >= best.cost) break;
    if (y + stackH <= bottom) {
      // Stacked: the union box (the wider of the two) keeps both clear; each is centred on the union's centre.
      const x = freeX(width, y, stackW, stackH, cx - stackW / 2, obstacles, keep);
      if (x !== null) {
        const mid = x + stackW / 2;
        const cost = y - top + SHIFT_COST * Math.abs(mid - cx);
        if (!best || cost < best.cost) {
          best = { cost, arrangement: 'stack', boxes: [
            { x: mid - detection.w / 2, y, w: detection.w, h: detection.h },
            { x: mid - alert.w / 2, y: y + detection.h + NOTICE_GAP_PX, w: alert.w, h: alert.h }] };
        }
      }
    }
    if (y + lineH > bottom || (best && y - top + FLANK_COST >= best.cost)) continue;
    // Flanking: detection right-aligned to just left of the centre, the alert left-aligned just right of it.
    const dx = freeX(width, y, detection.w, detection.h, cx - NOTICE_GAP_PX / 2 - detection.w, obstacles, keep);
    if (dx === null) continue;
    const ax = freeX(width, y, alert.w, alert.h, Math.max(cx + NOTICE_GAP_PX / 2, dx + detection.w + NOTICE_GAP_PX), obstacles, keep);
    if (ax === null || dx + detection.w + NOTICE_GAP_PX > ax) continue;
    const shift = (Math.abs(dx + detection.w - (cx - NOTICE_GAP_PX / 2)) + Math.abs(ax - (cx + NOTICE_GAP_PX / 2))) / 2;
    const cost = y - top + SHIFT_COST * shift + FLANK_COST;
    if (!best || cost < best.cost) {
      best = { cost, arrangement: 'flank', boxes: [{ x: dx, y, w: detection.w, h: detection.h }, { x: ax, y, w: alert.w, h: alert.h }] };
    }
  }
  const split = splitNotices(width, height, top, obstacles, keep, detection, alert, best?.cost ?? Infinity);
  return split && (!best || split.cost < best.cost) ? split : best;
}

/**
 * The notices' lane: the cheapest place (highest, then most central, stacked before flanking) that clears the widest of
 * the reticle's keep-outs any place clears, and every obstacle by NOTICE_GAP_PX; at full size where one clears that
 * keep-out, else compact (COMPACT_NOTICES). Where no place clears even the crosshair core (568 x 256), the compact
 * notices go where they cover the least of the reticle (clearance 0). Null only when nothing fits the screen at all.
 */
export function placeNoticeLane({ width, height, top, obstacles, detection, alert, compact = [COMPACT_NOTICES] }: {
  readonly width: number; readonly height: number; readonly top: number; readonly obstacles: readonly TouchDockRect[];
  readonly detection: NoticeSize; readonly alert: NoticeSize;
  /** The compact notices' boxes as the page measures them, widest first (battleHudLayout.ts naturalCentreSizes: 180,
   *  150 and 120 px, each as tall as its longest copy needs there); COMPACT_NOTICES by default. */
  readonly compact?: readonly { readonly detection: NoticeSize; readonly alert: NoticeSize }[];
}): NoticeLane | null {
  if (!(width > 0) || !(height > 0)) return null;
  const tiers = reticleTiers(width, height);
  const options = (compact.length ? compact : [COMPACT_NOTICES]).map((o) => ({
    detection: { w: Math.min(detection.w, o.detection.w), h: o.detection.h }, alert: { w: Math.min(alert.w, o.alert.w), h: o.alert.h } }));
  const sizes = [{ detection, alert, compact: false }, ...options.map((o) => ({ ...o, compact: true }))];
  for (let level = 3; level >= 1; level--) {
    for (const size of sizes) {
      const found = searchNotices(width, height, top, obstacles, tiers[level - 1], size.detection, size.alert);
      if (found) {
        return { arrangement: found.arrangement, detection: found.boxes[0], alert: found.boxes[1],
          clearance: level as ReticleClearance, compact: size.compact, cost: found.cost, cover: 0 };
      }
    }
  }
  const smallest = options[options.length - 1];
  const least = leastCoveringNotices(width, height, top, obstacles, smallest.detection, smallest.alert);
  return least ? { arrangement: least.arrangement, detection: least.boxes[0], alert: least.boxes[1], clearance: 0, compact: true,
    cost: least.cost, cover: least.cover } : null;
}

/**
 * The pre-battle countdown's place: the cheapest (largest, then highest, most central) that clears the widest reticle
 * keep-out any place clears, and the obstacles by NOTICE_GAP_PX; at its natural size, scaled down to 60%, or as one
 * compact line; where no place clears even the crosshair core, the compact line where it covers the least of it.
 */
export function placeCountdownLane({ width, height, top, obstacles, box }: {
  readonly width: number; readonly height: number; readonly top: number; readonly obstacles: readonly TouchDockRect[];
  readonly box: NoticeSize;
}): CountdownLane | null {
  if (!(width > 0) || !(height > 0) || !(box.w > 0) || !(box.h > 0)) return null;
  const tiers = reticleTiers(width, height);
  const cx = width / 2;
  const options: { w: number; h: number; scale: number; compact: boolean; base: number }[] = COUNTDOWN_SCALES.map((scale) =>
    ({ w: box.w * scale, h: box.h * scale, scale, compact: false, base: (1 - scale) * COUNTDOWN_SCALE_COST }));
  options.push({ w: Math.min(box.w, COMPACT_NOTICES.countdown.w), h: Math.min(box.h, COMPACT_NOTICES.countdown.h), scale: 1, compact: true,
    base: (1 - COUNTDOWN_SCALES[COUNTDOWN_SCALES.length - 1]) * COUNTDOWN_SCALE_COST + COUNTDOWN_COMPACT_COST });
  for (let level = 3; level >= 1; level--) {
    let best: { lane: CountdownLane; cost: number } | null = null;
    for (const { w, h, scale, compact, base } of options) {
      if (best && base >= best.cost) break;
      for (let y = Math.ceil(top); y + h <= height - EDGE_PX; y++) {
        if (best && base + y - top >= best.cost) break;
        const x = freeX(width, y, w, h, cx - w / 2, obstacles, tiers[level - 1]);
        if (x === null) continue;
        const cost = base + y - top + SHIFT_COST * Math.abs(x + w / 2 - cx);
        if (!best || cost < best.cost) best = { cost, lane: { x, y, w, h, scale, compact, clearance: level as ReticleClearance, cover: 0 } };
      }
    }
    if (best) return best.lane;
  }
  // No place clears even the crosshair core: the compact line where it covers the least of it.
  const compact = options[options.length - 1], bound = shapesBox(tiers[2]);
  let least: { lane: CountdownLane; cover: number; cost: number } | null = null;
  for (let y = Math.ceil(top); y + compact.h <= height - EDGE_PX; y += 2) {
    for (const x of freeEdges(width, y, compact.w, compact.h, obstacles)) {
      const cover = reticleOverlap(tiers, bound, { x, y, w: compact.w, h: compact.h });
      const lane = { x, y, w: compact.w, h: compact.h, scale: 1, compact: true, clearance: 0 as ReticleClearance, cover };
      const cost = y - top + SHIFT_COST * Math.abs(x + compact.w / 2 - cx);
      if (!least || cover < least.cover || (cover === least.cover && cost < least.cost)) least = { lane, cover, cost };
    }
  }
  return least?.lane ?? null;
}

/** How clear of the reticle a set of boxes is (the ReticleClearance of the worst of them). */
export function reticleClearance(width: number, height: number, boxes: readonly TouchDockRect[]): ReticleClearance {
  const tiers = reticleTiers(width, height);
  const hits = (r: TouchDockRect, k: TouchDockKeepOut) => 'r' in k
    ? Math.hypot(Math.max(r.x - k.x, 0, k.x - r.x - r.w), Math.max(r.y - k.y, 0, k.y - r.y - r.h)) < k.r
    : r.x < k.x + k.w && r.x + r.w > k.x && r.y < k.y + k.h && r.y + r.h > k.y;
  for (let level = 3; level >= 1; level--) {
    if (boxes.every((r) => tiers[level - 1].every((k) => !hits(r, k)))) return level as ReticleClearance;
  }
  return 0;
}

export interface TouchCentrePlan {
  readonly dock: TouchDockPlacement | null;
  readonly notices: NoticeLane | null;
  readonly countdown: CountdownLane | null;
  /** 'notices': their place was reserved before the dock was placed; 'dock': the dock was placed first. */
  readonly order: 'notices' | 'dock';
}

/** The plan's inputs. `controls`: touch controls (never covered by anything placed here); `instruments`: what the dock
 *  and notices keep clear of (the dock's soft obstacles, plus the score, objective, minimap...); `drawer`: the open ammo
 *  drawer, a soft obstacle for the dock only (the player's own passing gesture); `lanes`: places the dock keeps clear of
 *  besides the notices (the gun-limit warning's), which the notices and the countdown keep clear of too; `feeds`: the
 *  kill feed's and incoming-damage feed's lanes at their fullest on main (battleHudLayout.ts touchFeedLanes), which the
 *  dock keeps clear of; `reference`: the feeds' rows at their usual fill (three kill rows a side and an incoming toast,
 *  FEED_REFERENCE), which the notices' reserved place keeps clear of; `rows`: the rows the feeds show now (the same rows
 *  main shows), which the notices and the countdown keep clear of; `keepOut`: the dock's aim keep-out
 *  (touchAimKeepOut); `compact`: the compact notices' boxes as the page measures them. */
export interface TouchCentreInput {
  readonly width: number; readonly height: number; readonly top: number; readonly count: number;
  readonly controls: readonly TouchDockRect[]; readonly instruments: readonly TouchDockRect[];
  readonly drawer?: readonly TouchDockRect[]; readonly lanes: readonly TouchDockRect[];
  readonly feeds?: readonly TouchDockRect[]; readonly reference?: readonly TouchDockRect[]; readonly rows?: readonly TouchDockRect[];
  readonly keepOut: readonly TouchDockKeepOut[];
  readonly anchor?: { readonly x: number; readonly y: number } | null;
  readonly insets?: { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number } | null;
  readonly detection: NoticeSize; readonly alert: NoticeSize; readonly countdown: NoticeSize | null;
  readonly compact?: readonly { readonly detection: NoticeSize; readonly alert: NoticeSize }[];
}

/**
 * The notices and the countdown around a placed dock and the feeds' rows (`feedRows`): never on a dock tile (unless
 * the dock stands in their lane, 568 x 256: there they read over it), a control, an instrument, the gun-limit
 * warning's place or a feed row, so a notice never costs the feeds a row main shows (verifier 2026-10-16: the kill and
 * incoming-damage feeds collapsed to nothing under every notice and the countdown).
 */
export function placeTouchCentre(input: TouchCentreInput, dock: TouchDockPlacement | null, feedRows: readonly TouchDockRect[]):
  { readonly notices: NoticeLane | null; readonly countdown: CountdownLane | null } {
  const { width, height, top, controls, instruments, lanes, detection, alert, countdown, compact } = input;
  const fixed = [...controls, ...instruments, ...lanes, ...feedRows];
  const tiles = dock ? dock.tiles : [];
  const notices = placeNoticeLane({ width, height, top, obstacles: dock && !dock.inLane ? [...fixed, ...tiles] : fixed, detection, alert, compact });
  const placed = countdown ? placeCountdownLane({ width, height, top, obstacles: [...fixed, ...tiles], box: countdown }) : null;
  return { notices, countdown: placed };
}

/**
 * The dock, and the order it was placed in: off the feeds' fullest lanes always; either after the notices' place was
 * reserved (for the feeds' usual fill, `reference`) or first with the notices kept off it, the first as the search
 * finds it nearest the thumbs and as the nearest dock of one, two and three rows (a portrait phone's column beside the
 * reticle shows every control where its row above the reticle would take the notices' only clear place). Of these the
 * plan that shows the most controls on the dock wins (verifier 2026-10-16, round 5: 390 x 844 and 360 x 640 showed
 * three and More where main's strip showed four), then the one leaving the notices and the countdown (at that fill)
 * clearer of the reticle, then 48 px tiles and the dock nearest the thumbs. Its inputs never include the feeds'
 * current rows, so the dock never moves while kills and hits come and go.
 */
export function planTouchDock(input: TouchCentreInput): { readonly order: TouchCentrePlan['order']; readonly dock: TouchDockPlacement | null } {
  const { width, height, count, controls, instruments, drawer = [], lanes, feeds = [], reference = [], keepOut, anchor, insets } = input;
  const soft = [...instruments, ...drawer];
  const dockAt = (reserved: readonly TouchDockRect[], rows = 0) => count > 0
    ? placeTouchActionDock({ width, height, count, obstacles: controls, soft, lanes: [...lanes, ...reserved], feeds, keepOut, anchor, insets, rows })
    : null;
  const first = placeTouchCentre(input, null, reference).notices;
  const reservedDock = dockAt(first ? [first.detection, first.alert] : []);
  const plans: TouchCentrePlan[] = [{ order: 'notices', dock: reservedDock, ...placeTouchCentre(input, reservedDock, reference) }];
  const same = (a: TouchDockPlacement | null, b: TouchDockPlacement | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  for (const rows of DOCK_ROW_OPTIONS) {
    const dock = dockAt([], rows);
    if (rows && (!dock || plans.some((plan) => same(plan.dock, dock)))) continue;
    plans.push({ order: 'dock', dock, ...placeTouchCentre(input, dock, reference) });
  }
  // The dock's own cost (its distance from the thumbs, extra rows and 44 px tiles), counted in steps of two tile rows
  // (DOCK_REACH_STEP_PX) before its tile size and the notices' size: a dock sent across the screen loses to one by the
  // thumbs.
  const reach = (plan: TouchCentrePlan) => plan.dock ? plan.dock.cost : 1e9;
  const score = (plan: TouchCentrePlan): number[] => [
    plan.dock?.shown ?? 0,
    plan.notices?.clearance ?? -1, -(plan.notices?.cover ?? 0), plan.countdown?.clearance ?? -1, -(plan.countdown?.cover ?? 0),
    -Math.round(reach(plan) / DOCK_REACH_STEP_PX), plan.dock?.tile ?? 0, plan.notices?.compact === false ? 1 : 0,
    -(plan.notices?.cost ?? 1e9) - reach(plan),
  ];
  let best = plans[0], bestScore = score(best);
  for (const plan of plans.slice(1)) {
    const s = score(plan);
    for (let i = 0; i < s.length; i++) if (s[i] !== bestScore[i]) { if (s[i] > bestScore[i]) { best = plan; bestScore = s; } break; }
  }
  return { order: best.order, dock: best.dock };
}

/** The whole plan at once (planTouchDock, then placeTouchCentre for `rows`, the reference fill by default). */
export function planTouchCentre(input: TouchCentreInput): TouchCentrePlan {
  const { order, dock } = planTouchDock(input);
  return { order, dock, ...placeTouchCentre(input, dock, input.rows ?? input.reference ?? []) };
}
