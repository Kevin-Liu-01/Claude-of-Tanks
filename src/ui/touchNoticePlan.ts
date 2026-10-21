/**
 * Where the centre notices sit on a TOUCH layout (r10e; the coordinator, from the notices session's blind critic on
 * integ/229 ce8b634668): the pre-battle countdown, the detection (.cot-sixth), the alert (.cot-alert) and the medal card
 * keep off the reticle's footprint and off the HUD's panels and controls. Integ stacked the detection and the alert
 * centred under the systems row, which on every phone but the tallest put them on the aim point, the ring, the struck
 * round and rack, the scope's circle and readouts and its vision plate; the alert sat on the countdown's digit, the
 * countdown itself on the ring, and the medal card on the scope's readout row (the mouse layout has its own planner).
 *
 * The footprint (touchSightKeepOut) is what hud.ts can draw around the screen-centre aim point at full bloom, so nothing
 * moves as the ring breathes: the dispersion ring at 15 % of the shorter side (RET_CEIL_FRAC); in battle the column under
 * it (the rack, the struck round, the countdown and the seated warning chip, at most max(62, r + 24) + 10 under the
 * marker, 180 px wide) and the chip's seat over the ring where a small portrait phone sends it; through the scope the
 * circle at 1.55 r + 3, the readout row and zoom plate under it (its rest, sniperReadoutStack), the range tag at the 4:30,
 * the row over the circle where a short landscape sends it, and the row and a seated chip stacked over the ring. The vision plate, the panels and the
 * controls are measured and passed in (`obstacles`), the map, the score and the objective, the rosters, the network
 * readouts and the feed lanes with them (`soft`).
 *
 * Each takes the highest place that keeps TOUCH_SIGHT_GAP from the footprint and TOUCH_NOTICE_GAP from everything else,
 * centred on the sight where it fits there, else in the free span nearest the centre. The countdown goes first, in the
 * detection's place (nothing spots the player before the roll-out), scaled down to 60 % where it must, the alert alone
 * then off it; otherwise the detection
 * and the alert take, cheapest first: where integ put them,
 * when that keeps clear; the stack (the detection over the alert, one centre); the two apart; the same with the alert,
 * then the detection, then both in their compact form (the short landscapes' 136 px notice, the alert in 8 px type). The
 * alert's slot is the detection's width, so its wrapped height holds. Where no place keeps clear (the smallest phones),
 * each element takes the least intrusive one, reaching into the footprint (modelled at full bloom) before it covers any
 * panel or control, and over a button's label before the footprint (through the scope over the minimap too: its readouts
 * matter more), each block counted out to its gap, the detection and the alert in the order that reaches least far in
 * all (`cleared` false). The medal card takes the highest free place off them all, or waits (`bannerReady` false), keeping its time.
 *
 * DOM-free and deterministic; battleHudLayout.ts measures the inputs on each relayout. touchNoticePlan.selftest.mjs checks
 * every recorded touch size; tools/hud-touch-notices.browser.mjs measures the rendered boxes against the reticle's ink.
 */

export interface TouchBox { x0: number; y0: number; x1: number; y1: number }
export interface TouchSize { w: number; h: number }

/** How far the notices keep from the obstacles and each other, and from the footprint (itself at full bloom). */
export const TOUCH_NOTICE_GAP = 6;
const TOUCH_SIGHT_GAP = 4;
/** Integ's alert under its detection (battleHudLayout's own touch rule), kept wherever its place clears. */
const INTEG_STACK_GAP = 8;
/** The shorter side's share the dispersion ring is capped at (hud.ts RET_CEIL_FRAC). */
const RING_CEILING = 0.15;
/** The compact notice and alert (battleHudLayout.css data-touch-notices). */
export const TOUCH_COMPACT_NOTICE: TouchSize = { w: 136, h: 32 };
export const TOUCH_COMPACT_ALERT: TouchSize = { w: 150, h: 40 };

/**
 * The reticle's footprint at full bloom on a touch layout (see the module's note), as boxes. `seated`: the warning chip
 * sits by the sight (a portrait, or a landscape 550 px tall or more), so its seats under and over the ring count.
 */
export function touchSightKeepOut(width: number, height: number, scope: boolean, seated: boolean): TouchBox[] {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * RING_CEILING;
  // (the ring's stroke and its halo)
  const ring = r + 3;
  if (!scope) {
    const boxes = [{ x0: cx - ring, y0: cy - ring, x1: cx + ring, y1: cy + ring },
      // the rack, the struck round and the countdown under the marker, the seated chip under them
      { x0: cx - 90, y0: cy, x1: cx + 90, y1: cy + Math.max(62, r + 24) + 10 },
      // and over the ring, whatever its size, where the furniture under the sight sends them (a short landscape's
      // systems row)
      { x0: cx - 60, y0: cy - ring - 3 - 30, x1: cx + 60, y1: cy }];
    // (the chip's seat over the ring)
    if (seated) boxes.push({ x0: cx - 90, y0: cy - ring - 3 - 24, x1: cx + 90, y1: cy - ring });
    return boxes;
  }
  const circle = r * 1.55 + 3 + 3;
  const rest = height <= 300 ? 32 : height <= 430 ? 48 : Math.max(r * 1.02 + 24, r * 1.55 + 18, 96);
  const boxes = [{ x0: cx - circle, y0: cy - circle, x1: cx + circle, y1: cy + circle },
    // the readout row, the zoom plate (beside it or under it) and the chip with them
    { x0: cx - 110, y0: cy, x1: cx + 170, y1: cy + rest + 30 },
    // the range tag at the 4:30 (or the 1:30)
    { x0: cx, y0: cy - r * 0.71 - 16, x1: cx + r * 0.71 + 64, y1: cy + r * 0.71 + 16 }];
  // the row over the ring, whatever its size, its zoom plate reaching past the circle (a short landscape's), and a seated
  // chip with it: hud.ts sets the row 3 px over the ring and the chip 3 px over or under the row (sniperReadoutStack's
  // 'rowAbove'), so the stack reaches the ring's halo, 3 + 24 + 3 + 20 px past it, not past the arms' ends (r10g: the
  // circle plus 30 px kept a portrait phone's notices 20 px over the real stack, and its top slot left them no place)
  boxes.push({ x0: cx - 110, y0: cy - ring - 3 - 40, x1: cx + 170, y1: cy });
  if (height <= 430) boxes.push({ x0: cx - 110, y0: cy - circle - 30, x1: cx + 170, y1: cy - circle });
  else if (seated) boxes.push({ x0: cx - 110, y0: cy - Math.max(circle, ring + 3 + 24 + 3 + 20), x1: cx + 170, y1: cy });
  return boxes;
}

const apart = (a: TouchBox, b: TouchBox) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);
const grow = (box: TouchBox, by: number): TouchBox => ({ x0: box.x0 - by, y0: box.y0 - by, x1: box.x1 + by, y1: box.y1 + by });
const boxOf = (cx: number, y: number, size: TouchSize): TouchBox => ({ x0: cx - size.w / 2, y0: y, x1: cx + size.w / 2, y1: y + size.h });

/**
 * The highest place at or under `top` where a box of `size` keeps `gap` from every block and the screen's edges: centred
 * on `cx` where it fits there, else in the free span whose nearest centre to `cx` is nearest. Its centre and top, or null.
 */
export function touchFreePlace(size: TouchSize, cx: number, top: number, width: number, height: number,
  blocks: readonly TouchBox[], gap = TOUCH_NOTICE_GAP): { cx: number; y: number } | null {
  if (size.w + 2 * gap > width) return null;
  for (let y = Math.ceil(Math.max(top, gap)); y + size.h <= height - gap; y += 2) {
    // the columns the blocks on this band leave free
    const taken: [number, number][] = [];
    for (const block of blocks) {
      if (block.y1 + gap <= y || block.y0 - gap >= y + size.h) continue;
      taken.push([block.x0 - gap, block.x1 + gap]);
    }
    taken.sort((a, b) => a[0] - b[0]);
    let best: number | null = null;
    let from = gap;
    for (let i = 0; i <= taken.length; i++) {
      const end = i < taken.length ? Math.min(taken[i][0], width - gap) : width - gap;
      if (end - from >= size.w) {
        const centre = Math.min(Math.max(cx, from + size.w / 2), end - size.w / 2);
        if (best === null || Math.abs(centre - cx) < Math.abs(best - cx)) best = centre;
      }
      if (i < taken.length) from = Math.max(from, taken[i][1]);
    }
    if (best !== null) return { cx: best, y };
  }
  return null;
}

/** Where a box of `size` reaches least far into the blocks, each layer by its weight, and how far (its cost). Each block
 *  counts out to TOUCH_NOTICE_GAP, as touchFreePlace keeps it: a place that only touches its neighbours costs (r10g: the
 *  smallest phones' notices sat 0 px from the systems row and the quick buttons). */
function leastIntrusive(size: TouchSize, cx: number, top: number, width: number, height: number,
  layers: readonly (readonly [readonly TouchBox[], number])[]): { cx: number; y: number; cost: number } {
  const grown: { box: TouchBox; weight: number }[] = [];
  for (const [blocks, weight] of layers) for (const block of blocks) grown.push({ box: grow(block, TOUCH_NOTICE_GAP), weight });
  let best = { cx, y: top, cost: Infinity };
  // (per row band, the blocks that reach into it, each by its overlapping height and weight)
  const band: { x0: number; x1: number; area: number }[] = [];
  for (let y = Math.max(top, TOUCH_NOTICE_GAP); y + size.h <= height - TOUCH_NOTICE_GAP; y += 4) {
    band.length = 0;
    for (const { box, weight } of grown) {
      const rows = Math.min(y + size.h, box.y1) - Math.max(y, box.y0);
      if (rows > 0) band.push({ x0: box.x0, x1: box.x1, area: rows * weight });
    }
    for (let x = TOUCH_NOTICE_GAP; x + size.w <= width - TOUCH_NOTICE_GAP; x += 4) {
      let cost = Math.abs(x + size.w / 2 - cx) * 0.01;
      for (const block of band) {
        const columns = Math.min(x + size.w, block.x1) - Math.max(x, block.x0);
        if (columns > 0) cost += columns * block.area;
      }
      if (cost < best.cost) best = { cx: x + size.w / 2, y, cost };
    }
  }
  return best;
}

interface TouchNoticeInput {
  readonly width: number;
  readonly height: number;
  /** The first row under the score and the objective. */
  readonly top: number;
  /** The panels and controls the notices keep TOUCH_NOTICE_GAP from (the vision plate, the systems row among them). */
  readonly obstacles: readonly TouchBox[];
  /** The score and the objective, the rosters, the network readouts, the feed lanes: kept clear of alike. */
  readonly soft: readonly TouchBox[];
  /** The minimap: kept clear of alike; through the scope, where nothing clears, a notice covers it before the sight's
   *  footprint (MAP_SCOPE_WEIGHT; r10g, the coordinator: the scope's "0 APFSDS" and zoom matter more than the map while
   *  a notice shows, briefly, and at 320x568 the alert sat on them). */
  readonly map?: TouchBox | null;
  /** The round buttons' labels: kept clear of alike; where nothing clears, a notice covers one before the footprint
   *  (a few letters of a label under it, rather than the sight's readouts: LABEL_WEIGHT). */
  readonly labels?: readonly TouchBox[];
  readonly scope: boolean;
  /** The warning chip sits by the sight (touchSightKeepOut). */
  readonly seated: boolean;
  /** The detection's box and the alert's (its height in the detection's width; a reserve while none shows). */
  readonly notice: TouchSize;
  readonly alert: TouchSize;
  /** The pre-battle countdown's box while it shows. */
  readonly countdown: TouchSize | null;
  /** The medal card's, when one waits for a place. */
  readonly banner: TouchSize | null;
  /** Where integ put the detection's top (the stack's, centred). */
  readonly fallbackTop: number;
}

interface TouchNoticePlan {
  noticeCx: number; noticeTop: number; alertCx: number; alertTop: number; alertW: number;
  /** Each in its compact form. */
  noticeCompact: boolean; alertCompact: boolean;
  /** The countdown's centre, top and scale (its top fixed: battleHudLayout.css scales it from there). */
  countdownCx: number; countdownTop: number; countdownScale: number;
  /** Every element keeps clear of the footprint and the furniture. */
  cleared: boolean;
  bannerCx: number; bannerTop: number; bannerReady: boolean;
}

/** The countdown's scales, largest first. */
const COUNTDOWN_SCALES = [1, 0.8, 0.6];
/** A label's cost in a least intrusive place, per px² (the footprint's is 1, a panel's or a control's 10), and a notice
 *  already placed (the countdown, the first of the detection and the alert). */
const LABEL_WEIGHT = 0.25;
const PLACED_WEIGHT = 1000;
/** The minimap's cost through the scope (in battle a panel's: the footprint there is mostly the ring's empty middle). */
const MAP_SCOPE_WEIGHT = 0.5;
const scaled = (size: TouchSize, scale: number): TouchSize => ({ w: size.w * scale, h: size.h * scale });

/** The candidates after integ's place: [together, the detection compact, the alert compact] (see the module's note). */
const CANDIDATES: readonly (readonly [boolean, boolean, boolean])[] = [[true, false, false], [false, false, false],
  [false, false, true], [false, true, false], [true, true, true], [false, true, true]];

/** The notices' places (see the module's note). */
export function planTouchNotices(input: TouchNoticeInput): TouchNoticePlan {
  const { width, height, top, scope, seated } = input;
  const gap = TOUCH_NOTICE_GAP;
  const cx = width / 2;
  // (the footprint's boxes drawn in by the difference, so a uniform gap keeps TOUCH_SIGHT_GAP from them)
  const keep = touchSightKeepOut(width, height, scope, seated).map((box) => grow(box, TOUCH_SIGHT_GAP - gap));
  const labels = input.labels ?? [];
  const map = input.map ? [input.map] : [];
  const blocks = [...input.obstacles, ...input.soft, ...map, ...labels, ...keep];
  // (integ's 8 px under the score and the objective)
  const start = top + INTEG_STACK_GAP;
  const plan: TouchNoticePlan = { noticeCx: cx, noticeTop: input.fallbackTop, alertCx: cx,
    alertTop: input.fallbackTop + input.notice.h + INTEG_STACK_GAP, alertW: input.alert.w, noticeCompact: false, alertCompact: false,
    countdownCx: cx, countdownTop: start, countdownScale: 1, cleared: true, bannerCx: cx, bannerTop: start, bannerReady: false };
  // (where nothing clears, a notice reaches into the footprint before it covers a panel or a control: the footprint is
  // modelled at full bloom, and the panels are there whole)
  // (a notice already placed counts a hundred times a panel: the notices never stack on each other while any other place
  // remains, r10g: at 568x256 the gap-wide costs set the detection on the alert)
  const layers = (extra: readonly TouchBox[]) => [[keep, 1], [input.obstacles, 10], [input.soft, 10],
    [map, scope ? MAP_SCOPE_WEIGHT : 10], [labels, LABEL_WEIGHT], [extra, PLACED_WEIGHT]] as const;
  // the countdown first: the alert may show with it, the detection never (nothing spots the player before the roll-out)
  const placed: TouchBox[] = [];
  if (input.countdown) {
    // (in full, then scaled down to 60 % where it must, as the mouse layout's planner does)
    let place: { cx: number; y: number } | null = null;
    for (const scale of COUNTDOWN_SCALES) {
      place = touchFreePlace(scaled(input.countdown, scale), cx, start, width, height, blocks);
      plan.countdownScale = scale;
      if (place) break;
    }
    place ??= leastIntrusive(scaled(input.countdown, plan.countdownScale), cx, start, width, height, layers([]));
    plan.countdownCx = place.cx; plan.countdownTop = place.y;
    placed.push(boxOf(place.cx, place.y, scaled(input.countdown, plan.countdownScale)));
  }
  const clearOf = (box: TouchBox, others: readonly TouchBox[]) => box.x0 >= gap && box.x1 <= width - gap
    && box.y0 >= gap && box.y1 <= height - gap && [...blocks, ...others].every((block) => apart(box, block) >= gap);
  if (input.countdown) {
    // the countdown takes the detection's place (it never shows with it); the alert alone keeps off it
    if (!clearOf(placed[0], [])) plan.cleared = false;
    plan.noticeCx = plan.countdownCx; plan.noticeTop = plan.countdownTop;
    const alert = touchFreePlace(input.alert, cx, start, width, height, [...blocks, ...placed]);
    const compact = alert ? null : touchFreePlace(TOUCH_COMPACT_ALERT, cx, start, width, height, [...blocks, ...placed]);
    const place = alert ?? compact ?? leastIntrusive(TOUCH_COMPACT_ALERT, cx, start, width, height, layers(placed));
    if (!alert && !compact) plan.cleared = false;
    plan.alertCompact = !alert;
    plan.alertW = alert ? input.alert.w : TOUCH_COMPACT_ALERT.w;
    plan.alertCx = place.cx; plan.alertTop = place.y;
    placed.push(boxOf(place.cx, place.y, alert ? input.alert : TOUCH_COMPACT_ALERT));
  }
  const stack = { w: Math.max(input.notice.w, input.alert.w), h: input.notice.h + INTEG_STACK_GAP + input.alert.h };
  let found = !!input.countdown || clearOf(boxOf(cx, input.fallbackTop, stack), placed);
  for (let i = 0; i < CANDIDATES.length && !found; i++) {
    const [together, noticeCompact, alertCompact] = CANDIDATES[i];
    const notice = noticeCompact ? TOUCH_COMPACT_NOTICE : input.notice;
    const alert = alertCompact ? TOUCH_COMPACT_ALERT : input.alert;
    const around = [...blocks, ...placed];
    let first: { cx: number; y: number } | null = null;
    let second: { cx: number; y: number } | null = null;
    if (together) {
      first = touchFreePlace({ w: Math.max(notice.w, alert.w), h: notice.h + gap + alert.h }, cx, start, width, height, around);
      second = first && { cx: first.cx, y: first.y + notice.h + gap };
    } else {
      first = touchFreePlace(notice, cx, start, width, height, around);
      second = first && touchFreePlace(alert, cx, start, width, height, [...around, boxOf(first.cx, first.y, notice)]);
    }
    if (!first || !second) continue;
    plan.noticeCx = first.cx; plan.noticeTop = first.y;
    plan.alertCx = second.cx; plan.alertTop = second.y; plan.alertW = alert.w;
    plan.noticeCompact = noticeCompact; plan.alertCompact = alertCompact;
    found = true;
  }
  if (!found) {
    // the smallest phones: each in its compact form where it reaches least far, one off the other, in the order that
    // reaches least far in all (r10g: the detection first took the one free place at 640x360, and the alert went onto the
    // scope's zoom plate)
    plan.cleared = false;
    plan.noticeCompact = plan.alertCompact = true;
    plan.alertW = TOUCH_COMPACT_ALERT.w;
    const pair = (firstSize: TouchSize, secondSize: TouchSize) => {
      const first = leastIntrusive(firstSize, cx, start, width, height, layers(placed));
      const second = leastIntrusive(secondSize, cx, start, width, height, layers([...placed, boxOf(first.cx, first.y, firstSize)]));
      return { first, second, cost: first.cost + second.cost };
    };
    const noticeFirst = pair(TOUCH_COMPACT_NOTICE, TOUCH_COMPACT_ALERT);
    const alertFirst = pair(TOUCH_COMPACT_ALERT, TOUCH_COMPACT_NOTICE);
    const [notice, alert] = alertFirst.cost < noticeFirst.cost ? [alertFirst.second, alertFirst.first] : [noticeFirst.first, noticeFirst.second];
    plan.noticeCx = notice.cx; plan.noticeTop = notice.y; plan.alertCx = alert.cx; plan.alertTop = alert.y;
  }
  if (input.banner) {
    const notice = plan.noticeCompact ? TOUCH_COMPACT_NOTICE : input.notice;
    const alert = plan.alertCompact ? TOUCH_COMPACT_ALERT : input.alert;
    const taken = input.countdown ? placed : [...placed, boxOf(plan.noticeCx, plan.noticeTop, notice), boxOf(plan.alertCx, plan.alertTop, alert)];
    const place = touchFreePlace(input.banner, cx, start, width, height, [...blocks, ...taken]);
    if (place) { plan.bannerCx = place.cx; plan.bannerTop = place.y; plan.bannerReady = true; }
  }
  return plan;
}
