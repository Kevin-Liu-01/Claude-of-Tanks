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
 * SWITCHING readouts and the out-of-ammo marks (a struck round or rack) under the marker, the canvas gun-limit chip, the
 * scope's cross arms (1.55 r + 3 from the centre, so its upper arm runs up the centre line towards the score), its
 * ammunition, zoom and range readouts and the DOM scope-vision toggle beside the sight. Since the out-of-ammo rounds
 * (r10) those marks keep 3 px from the HUD's panels and controls and go over the ring or beside the column under the
 * marker where those sit under it; the footprint replays the HUD's choices among the same furniture
 * (MouseNoticeInput.furniture). Every notice keeps MOUSE_RETICLE_MARGIN_PX off all of it.
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
  /** The HUD's panels and controls among them that the reticle's marks keep clear of (sightFurniture.ts: not the report,
   *  the network readouts or the flight console); where one sits under the sight the keep-out takes the places the marks
   *  move to (mouseReticleFootprint). None: the marks in their first places. */
  readonly furniture?: readonly PlanRect[];
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
/** `cutsLanes`: the card's place leaves a side lane fewer kill rows than it holds (only where every place for it does: a
 *  phone-width mouse window), so it waits while that lane shows a row. */
interface PlannedMedal extends PlannedNotice {
  readonly compact: boolean; readonly sharesNotices: boolean; readonly clearance: 2 | 1 | 0; readonly cutsLanes: readonly [boolean, boolean];
}
/** What shows with the medal card, as the layout owner reads it (`feeds`: whether each side lane shows a kill row). */
export interface MouseMedalCompany {
  readonly detection: boolean; readonly alert: boolean; readonly revive: boolean; readonly scoped: boolean;
  readonly feeds?: readonly [boolean, boolean];
}

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
 * The reticle as hud.ts draws it on .cot-ret (CSS px offsets from the aim point), after the out-of-ammo rounds (r10):
 * the marks under the marker, the gun-limit chip and the scope's readout row each keep 3 px from the ring, from one
 * another and from the HUD's panels and controls (sightFurniture.ts), so where the furniture sits under the sight the HUD
 * moves them over the ring or beside the column under the marker (mouseReticleFootprint replays those choices).
 * mouseNoticePlan.selftest.mjs pins each source line these restate, and the browser receipt checks the rendered ink,
 * out-of-ammo marks included, lies inside the footprint.
 */
export const MOUSE_RETICLE = Object.freeze({
  /** RET_FLOOR_PX, RET_CEIL_FRAC: the dispersion ring's radius range; the dashed stroke and its halo add 2.5 px. */
  ringFloorPx: 11, ringCeilFraction: .15, ringStrokePx: 2.5,
  /** RING_STROKE_REACH, SIGHT_MARK_RING_GAP: how far hud.ts reckons the ring's stroke past its radius, and the gap its marks
   *  keep from the ring, from each other and from the furniture. Those extents place the marks; their ink reaches further:
   *  the countdown, the chip, the scope's readouts and range tag are painted under shadowBlur 3 (inkPadPx past each side,
   *  the measured ink 16 px over the chip's baseline and 13 under), the zoom plate's ink 9 px under its baseline, and the
   *  marks' antialiasing 1 px. */
  ringReachPx: 1.5, markGapPx: 3, inkPadPx: 3, zoomInkBelowPx: 9,
  /** centerClearanceRadius: 14 px in the battle sight, 14 + (zoomScale - 1) * 9 in the scope (zoomScale at most 1.8). */
  clearCentrePx: 14, scopeClearCentrePx: 21.2,
  /** The column under the marker (paintAutoloaderMagazine, paintDryRound, paintReloadCountdown): SWITCHING and the countdown
   *  under a small ring (stack*); the empty mark 6 px under the clear centre, or 3 px under a ring that crosses it
   *  (sightMarkTop, belowRing), its strike 3 px over its top: a struck round 17 px tall (19 in the scope) or a struck rack
   *  (2.25 px arc, 14 / 16 px shells; four 5.5 / 6.5 px shells 3.5 / 4 px apart: 24 px either side with the strike); the
   *  countdown, 16 px type (13.12 px of ink; SWITCHING about 76 px wide), 3 px under it, or set beside a rack, left: 76 px
   *  from the centre to the rack's side. */
  stackTopPx: 8, stackBottomPx: 70, stackHalfWidthPx: 58, markHalfWidthPx: 24, countdownPx: 13.12, countdownHalfWidthPx: 40,
  besideCountdownPx: 76,
  /** placeAimWarning: the chip's baseline at cy + max(62, r + 24), or 3 px under the column's marks (its ink 14 px over
   *  the baseline, AIM_WARNING_CHIP_ABOVE, and 10 under); text + 50 wide. */
  chipMinPx: 62, chipRingPx: 24, chipAbovePx: 14, chipBelowPx: 10, chipHalfWidthPx: 92,
  /** drawScope: arms from the ring to 1.55 r + 3, a 2.4 px under-stroke and mil ticks either side. */
  armFactor: 1.55, armPx: 3 + 1.3, armHalfWidthPx: 6.5,
  /** sniperReadoutStack: the readout line (digits 10 px over the baseline; a leading struck round 14.7 over and 4.7 under)
   *  centred under the marker, about 124 px wide; the zoom plate 24 px (18 at <= 300 tall) under it, or 16 px right of it
   *  (TAG_GROUP_GAP), 11.9 px over its baseline and 1.3 under, about 105 px wide. */
  readoutHalfWidthPx: 62, readoutAbovePx: 14.7, readoutBelowPx: 4.7, zoomHalfWidthPx: 53, zoomWidthPx: 105,
  zoomAbovePx: 11.9, zoomBelowPx: 1.3, rowGroupPx: 16,
  /** sniperDistanceTag: "1500 m" off the ring's 4:30 point, past a rack (its half width + 6: 25 px), or hung at the 1:30
   *  (3.5 px over the marker's offset) where the furniture sits at the 4:30. */
  rangeWidthPx: 60, rangeAbovePx: 13, rangeBelowPx: 6, rangeRackPx: 25, rangeOverPx: 3.5,
  /** .cot-scope-vision (aerialHud.css): beside the sight, level with the marker (48 px tall, SCOPE_VISION_HALF_H), its
   *  left edge at min(50% + max(15vmin + 8px, 80px), 100% - 180px) (100% - 112px for the 104 px plate under 540 px wide),
   *  or the mirror seat left of the sight (battleHudLayout seatScopeVision). */
  visionReachPx: 8, visionMinReachPx: 80, visionEdgePx: 180, visionCompactEdgePx: 112, visionWidthPx: 168,
  visionCompactWidthPx: 104, visionHalfHeightPx: 24,
});

/** The scope readout line's rest under the aim point at ring radius `r` (sniperReadoutStack: 32 px at <= 300 tall, 48 at
 *  <= 430, else over the controls). */
function readoutRest(height: number, r: number): number {
  if (height <= 300) return 32;
  if (height <= 430) return 48;
  return Math.min(Math.max(r * 1.02 + 24, r * 1.55 + 18, 96), height - 176 - height / 2);
}

/** How far a box keeps from the nearest furniture box (Infinity with none), as sightFurnitureGap reckons it. */
function furnitureGap(furniture: readonly PlanRect[], x0: number, y0: number, x1: number, y1: number): number {
  let gap = Infinity;
  for (const f of furniture) gap = Math.min(gap, Math.max(f.x - x1, x0 - (f.x + f.w), f.y - y1, y0 - (f.y + f.h)));
  return gap;
}

/** The scope row's places, in hud.ts's order (SNIPER_ROW_PLACES): mode, the chip set over the sight, the zoom plate left
 *  out, a place only a chip makes different. */
const ROW_PLACES = [
  ['stack', false, false, false], ['zoomBeside', false, false, false], ['chipBeside', false, false, true],
  ['stack', true, false, true], ['zoomBeside', true, false, true], ['rowBeside', false, false, false],
  ['rowAbove', false, false, false], ['rowAbove', true, false, true], ['stack', false, true, false], ['stack', true, true, true],
  ['rowAbove', false, true, false], ['rowAbove', true, true, true],
] as const;
type RowMode = typeof ROW_PLACES[number][0];

/** The choices a sight's heaviest case makes at the widest ring (sightMarks), replayed at the smallest; `rows`: how many of
 *  ROW_PLACES it tried, the last the one it seated. */
interface SightChoices { markUp: boolean; countdown: 'under' | 'beside' | 'over'; chipUp: boolean; tagUp: boolean; rows: number }

/**
 * The marks of one sight at ring radius `r`, pushed as boxes [x0, y0, x1, y1] into `boxes`: its heaviest case (a struck
 * mark or a reloading rack with its countdown, the chip with `chip`, the scope's range tag and readout row with `scope`)
 * where hud.ts places them. With `choose` the choices are made from `furniture` and written to `made`; otherwise `made`
 * is replayed, so the same boxes come out in the same order. The row's boxes are those of every place tried, the last the
 * one seated. The range tag is left to the caller (it moves diagonally with the bloom).
 */
function sightMarks(boxes: number[], width: number, height: number, r: number, scope: boolean, chip: boolean,
  furniture: readonly PlanRect[], choose: boolean, made: SightChoices): void {
  const R = MOUSE_RETICLE, g = R.markGapPx, cx = width / 2, cy = height / 2;
  const gap = (x0: number, y0: number, x1: number, y1: number) => furnitureGap(furniture, x0, y0, x1, y1);
  const room = (x0: number, y0: number, x1: number, y1: number) => Math.min(gap(x0, y0, x1, y1), x0, y0, width - x1, height - y1);
  const pad = R.inkPadPx;
  const push = (x0: number, y0: number, x1: number, y1: number, ink: number = pad) => { boxes.push(x0 - ink, y0 - ink, x1 + ink, y1 + ink); };
  const ring = r + R.ringReachPx;
  /** How far a box keeps from the ring's stroke (ringGap: negative where the ring runs through it). */
  const ringGap = (x0: number, y0: number, x1: number, y1: number) => {
    const near = Math.hypot(Math.max(x0 - cx, 0, cx - x1), Math.max(y0 - cy, 0, cy - y1));
    const far = Math.max(Math.hypot(x0 - cx, y0 - cy), Math.hypot(x1 - cx, y0 - cy), Math.hypot(x0 - cx, y1 - cy), Math.hypot(x1 - cx, y1 - cy));
    return Math.max(near - ring, r - R.ringReachPx - far);
  };
  const belowRing = cy + ring + g;
  const centre = scope ? R.scopeClearCentrePx : R.clearCentrePx;
  // aboveSightTop: the ring's stroke, the marker's clear centre and any mark already set over the ring
  let aboveTop = cy - Math.max(ring, centre);
  // the empty mark (sightColumnTop), over the ring where the furniture sits under it and over it keeps clear; the compact
  // scope stack (compactSniperStack: 430 px tall or less) leads its readout line with the struck round instead, so its
  // column holds a rack at most (2.25 px arc, 16 px shells, 3 px strike)
  const compact = scope && height <= 430;
  const markH = compact ? 2.25 + 16 + g : (scope ? 19 : 17) + g, half = R.markHalfWidthPx;
  let top = cy + centre + 6;
  if (ringGap(cx - half, top - g, cx + half, top + markH) < g) top = belowRing + g;
  // (a choice this sight or case never makes stays as a lighter case makes it, so runs of rings compare by what matters)
  if (choose) { made.tagUp = false; made.chipUp = false; made.rows = 1; }
  if (choose) {
    const up = aboveTop - g - markH;
    made.markUp = gap(cx - half, top - g, cx + half, top + markH) < g && gap(cx - half, up - g, cx + half, up + markH) >= g;
  }
  if (made.markUp) { top = aboveTop - g - markH; aboveTop = top - g; }
  push(cx - half, top - g, cx + half, top + markH, 1);
  const markBottom = top + markH;
  // the range tag (sniperDistanceTag): the countdown, the chip and the row keep off it
  const offset = .7071 * (r + 9), tagX = cx + Math.max(offset, R.rangeRackPx) + 4;
  let tagY = cy + offset + 12, tagTop = Infinity;
  if (scope) {
    if (choose) {
      const y = cy - offset - R.rangeOverPx - 1;
      made.tagUp = gap(tagX, tagY - 9, tagX + R.rangeWidthPx, tagY + 1) < g && gap(tagX, y - 9, tagX + R.rangeWidthPx, y + 1) >= g;
    }
    if (made.tagUp) { tagY = cy - offset - R.rangeOverPx - 1; tagTop = tagY - 9; }
  }
  // the countdown 3 px under the mark; beside the rack, left, or over the sight where the furniture sits under it
  const ch = R.countdownPx, cw = R.countdownHalfWidthPx;
  const sideTop = markBottom - g - 2 - ch, overTop = () => Math.min(aboveTop, tagTop - g) - g - ch;
  if (choose) {
    // beside the rack, left, in the compact stack or where under it the readout line would sink past its rest
    // (underRackSinks), where the ring keeps clear of it there
    const sinks = scope && markBottom + g + ch + 3 + 10 > height - 176;
    made.countdown = (compact || sinks) && ringGap(cx - R.besideCountdownPx, sideTop, cx - half, sideTop + ch) >= g ? 'beside' : 'under';
    const under = Math.max(markBottom + g, ringGap(cx - cw, markBottom + g, cx + cw, markBottom + g + ch) < g ? belowRing : 0);
    if (made.countdown === 'under' && gap(cx - cw, under, cx + cw, under + ch) < g) {
      if (gap(cx - R.besideCountdownPx, sideTop, cx - half, sideTop + ch) >= g) made.countdown = 'beside';
      else if (gap(cx - cw, overTop(), cx + cw, overTop() + ch) >= g) made.countdown = 'over';
    }
  }
  let cdTop = markBottom + g;
  if (ringGap(cx - cw, cdTop, cx + cw, cdTop + ch) < g) cdTop = Math.max(cdTop, belowRing);
  if (made.countdown === 'beside') push(cx - R.besideCountdownPx, sideTop, cx - half, sideTop + ch);
  else {
    if (made.countdown === 'over') { cdTop = overTop(); aboveTop = Math.min(aboveTop, cdTop); }
    push(cx - cw, cdTop, cx + cw, cdTop + ch);
  }
  const cdBottom = made.countdown === 'under' ? cdTop + ch : 0;
  // the chip under the marker and 3 px under the column's marks and a tag at the 4:30; over the sight (sniperChipAboveY)
  // where the furniture sits under it and over it reaches less far into it
  const chipHalf = R.chipHalfWidthPx;
  const chipOver = Math.min(aboveTop, cy - R.visionHalfHeightPx, tagTop) - g - R.chipBelowPx;
  let chipBase = 0;
  if (chip) {
    chipBase = Math.max(cy + Math.max(R.chipMinPx, r + R.chipRingPx), markBottom + g + R.chipAbovePx,
      cdBottom && cdBottom + g + R.chipAbovePx, scope && !made.tagUp ? tagY + 1 + g + R.chipAbovePx : 0);
    if (ringGap(cx - chipHalf, chipBase - R.chipAbovePx, cx + chipHalf, chipBase + R.chipBelowPx) < g) {
      chipBase = Math.max(chipBase, belowRing + R.chipAbovePx);
    }
    if (choose) {
      const under = gap(cx - chipHalf, chipBase - R.chipAbovePx, cx + chipHalf, chipBase + R.chipBelowPx);
      made.chipUp = under < g && gap(cx - chipHalf, chipOver - R.chipAbovePx, cx + chipHalf, chipOver + R.chipBelowPx) > under;
    }
    if (made.chipUp) chipBase = chipOver;
    push(cx - chipHalf, chipBase - R.chipAbovePx, cx + chipHalf, chipBase + R.chipBelowPx);
  }
  if (!scope) return;
  // The readout row (sniperReadoutStack), each place in order until one keeps 3 px from the furniture and the screen's
  // edges: every place tried is one a lighter case (a smaller ring, fewer marks) may seat.
  const rest = cy + readoutRest(height, r), drop = height <= 300 ? 18 : 24;
  const lineHalf = R.readoutHalfWidthPx, group = R.rowGroupPx, chipW = chipHalf * 2;
  const columnRight = cx + Math.max(half, cw) + group;
  const parts = ROW_PARTS;
  const rowParts = (mode: RowMode, noZoom: boolean, y: number) => {
    parts.length = 0;
    const x0 = mode === 'rowBeside' ? columnRight : cx - lineHalf, x1 = x0 + lineHalf * 2;
    parts.push(x0, y - R.readoutAbovePx, x1, y + R.readoutBelowPx);
    if (!noZoom && mode === 'stack') {
      parts.push(cx - R.zoomHalfWidthPx, y + drop - R.zoomAbovePx, cx + R.zoomHalfWidthPx, y + drop + R.zoomBelowPx);
    } else if (!noZoom) parts.push(x1 + group, y - R.zoomAbovePx, x1 + group + R.zoomWidthPx, y + R.zoomBelowPx);
    if (mode === 'chipBeside') parts.push(cx - lineHalf - group - chipW, y - R.chipAbovePx, cx - lineHalf - group, y + R.chipBelowPx);
  };
  const rowTop = (mode: RowMode) => mode === 'chipBeside' ? Math.max(R.readoutAbovePx, R.chipAbovePx) : R.readoutAbovePx;
  /** sightFurnitureRise over the row's parts: the baseline at or over `y` keeping 3 px over the furniture under them. */
  const rise = (mode: RowMode, noZoom: boolean, y: number) => {
    for (let pass = 0; pass < 4; pass++) {
      rowParts(mode, noZoom, y);
      let moved = false;
      for (let i = 0; i < parts.length && !moved; i += 4) {
        const x0 = parts[i], x1 = parts[i + 2], up = y - parts[i + 1], foot = parts[i + 3] - y;
        for (const f of furniture) {
          if (f.x - x1 >= g || x0 - (f.x + f.w) >= g || f.y + f.h + g <= y - up || f.y - g >= y + foot || f.y < y - up) continue;
          y = f.y - g - foot; moved = true;
        }
      }
      if (!moved) break;
    }
    return y;
  };
  let tried = 0;
  const places = choose ? ROW_PLACES.length : made.rows;
  for (let i = 0; i < places; i++) {
    const [mode, over, noZoom, needsChip] = ROW_PLACES[i];
    if (needsChip && !chip) continue;
    // (rowBeside sets a chip over the sight)
    const chipAbove = over || (mode === 'rowBeside' && chip);
    let y: number, chipY = chipAbove ? chipOver : chipBase;
    if (mode === 'rowAbove') {
      // its foot 3 px over the ring, the marker's clear centre, the marks set over it, the vision switch level with the
      // marker and a tag hung at the 1:30; the chip over it
      // (over a chip placeAimWarning set over the sight already)
      y = Math.min(aboveTop, cy - R.visionHalfHeightPx, tagTop, made.chipUp && chip ? chipBase - R.chipAbovePx : Infinity)
        - g - R.readoutBelowPx;
      if (chipAbove) chipY = Math.min(y - R.readoutAbovePx, tagTop) - g - R.chipBelowPx;
    } else {
      // risen from its rest past the furniture under it, then 3 px under the column's marks, the chip, a tag at the 4:30
      // over its columns and the ring
      const column = mode !== 'rowBeside', chipInColumn = chip && mode !== 'chipBeside' && !chipAbove;
      const t = rowTop(mode);
      rowParts(mode, noZoom, 0);
      let right = -Infinity;
      for (let p = 0; p < parts.length; p += 4) right = Math.max(right, parts[p + 2]);
      y = Math.max(rise(mode, noZoom, rest), column ? markBottom + g + t : 0, column && cdBottom ? cdBottom + g + t : 0,
        chipInColumn ? chipBase + R.chipBelowPx + g + t : 0, scope && !made.tagUp && tagX < right + g ? tagY + 1 + g + t : 0);
      rowParts(mode, noZoom, y);
      for (let p = 0; p < parts.length; p += 4) {
        if (ringGap(parts[p], parts[p + 1], parts[p + 2], parts[p + 3]) < g) { y = Math.max(y, belowRing + t); break; }
      }
    }
    rowParts(mode, noZoom, y);
    let clear = Infinity;
    for (let p = 0; p < parts.length; p += 4) {
      // (the zoom plate, the row's second part where it has one, inks 9 px under its baseline)
      const zoom = p === 4 && !noZoom, inkFoot = zoom ? (mode === 'stack' ? y + drop : y) + R.zoomInkBelowPx - pad : parts[p + 3];
      push(parts[p], parts[p + 1], parts[p + 2], Math.max(parts[p + 3], inkFoot));
      clear = Math.min(clear, room(parts[p], parts[p + 1], parts[p + 2], parts[p + 3]));
    }
    if (chip && mode !== 'chipBeside') {
      push(cx - chipHalf, chipY - R.chipAbovePx, cx + chipHalf, chipY + R.chipBelowPx);
      clear = Math.min(clear, room(cx - chipHalf, chipY - R.chipAbovePx, cx + chipHalf, chipY + R.chipBelowPx));
    }
    tried = i + 1;
    if (choose && clear >= g) break;
  }
  if (choose) made.rows = tried;
}

const ROW_PARTS: number[] = [];
const SIGHT_BOXES: number[] = [];
/** The rings the heaviest case's choices are made at, between the smallest and the widest (mouseReticleFootprint). */
const RADII = 8;
const CHOICES: SightChoices[] = Array.from({ length: RADII + 1 }, () => ({ markUp: false, countdown: 'under', chipUp: false, tagUp: false, rows: 0 }));
const sameChoices = (a: SightChoices, b: SightChoices) => a.markUp === b.markUp && a.countdown === b.countdown && a.chipUp === b.chipUp
  && a.tagUp === b.tagUp && a.rows === b.rows;

/**
 * The reticle's keep-out at `tier`: 2 everything either sight draws at any bloom (the default), 1 the battle sight
 * at full bloom with its readouts and gun-limit chip, 0 the resting battle sight with its readouts and chip (the browser
 * receipt's resting mask has always held the chip; the r10 marks under a resting sight made it matter). `furniture` is what the
 * HUD's marks keep 3 px from (battleHudLayout measures the same panels and controls for sightFurniture.ts): each sight's
 * heaviest case makes hud.ts's choices at the tier's widest ring (a mark or the countdown over the ring, the chip over
 * the sight, the range tag at the 1:30, the readout row's places in order), and each place it takes or tries is swept
 * down to the smallest ring; the marks in their first places are swept too, as a lighter case seats them, and so are
 * the chip and the row with nothing over them.
 */
export function mouseReticleFootprint(width: number, height: number, tier: 0 | 1 | 2 = 2, out: PlanKeepOut[] = [],
  furniture: readonly PlanRect[] = NONE): PlanKeepOut[] {
  const R = MOUSE_RETICLE;
  out.length = 0;
  const cx = width / 2, cy = height / 2;
  const floor = R.ringFloorPx;
  const ceil = Math.max(floor, R.ringCeilFraction * Math.min(width, height));
  const widest = tier === 0 ? floor : ceil;
  const rect = (x0: number, y0: number, x1: number, y1: number) => { out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); };
  out.push({ cx, cy, r: widest + R.ringStrokePx });
  rect(cx - R.stackHalfWidthPx, cy + R.stackTopPx, cx + R.stackHalfWidthPx, cy + R.stackBottomPx);
  // the chip with nothing over it (at rest too: a gun-limit warning shows whatever the bloom)
  rect(cx - R.chipHalfWidthPx - R.inkPadPx, cy + R.chipMinPx - R.chipAbovePx - R.inkPadPx, cx + R.chipHalfWidthPx + R.inkPadPx,
    cy + Math.max(R.chipMinPx, widest + R.chipRingPx) + R.chipBelowPx + R.inkPadPx);
  let scopeFurniture = furniture;
  if (tier === 2) {
    const arm = ceil * R.armFactor + R.armPx;
    rect(cx - R.armHalfWidthPx, cy - arm, cx + R.armHalfWidthPx, cy + arm);
    rect(cx - arm, cy - R.armHalfWidthPx, cx + arm, cy + R.armHalfWidthPx);
    // the vision switch's seat right of the sight, which the scope's marks keep clear of, and its mirror
    const compact = width < 540;
    const reach = Math.max(R.ringCeilFraction * Math.min(width, height) + R.visionReachPx, R.visionMinReachPx);
    const vw = compact ? R.visionCompactWidthPx : R.visionWidthPx;
    const vx = Math.min(cx + reach, width - (compact ? R.visionCompactEdgePx : R.visionEdgePx));
    const seat: PlanRect = { x: vx, y: cy - R.visionHalfHeightPx, w: vw, h: R.visionHalfHeightPx * 2 };
    out.push(seat, { ...seat, x: width - vx - vw });
    scopeFurniture = [...furniture, seat];
    // the row with nothing over it, at its rest
    const drop = height <= 300 ? 18 : 24;
    rect(cx - R.readoutHalfWidthPx - R.inkPadPx, cy + readoutRest(height, floor) - R.readoutAbovePx - R.inkPadPx,
      cx + R.readoutHalfWidthPx + R.inkPadPx, cy + readoutRest(height, widest) + drop + R.zoomInkBelowPx);
  }
  for (let s = 0; s < (tier === 2 ? 2 : 1); s++) {
    const scope = s === 1, marks = scope ? scopeFurniture : furniture, chip = true;
    /** Sweeps the places `choices` sets from ring r0 to ring r1. */
    const sweep = (choices: SightChoices, r0: number, r1: number, around: readonly PlanRect[]) => {
      const boxes = SIGHT_BOXES;
      boxes.length = 0;
      sightMarks(boxes, width, height, r1, scope, chip, around, false, choices);
      const wide = boxes.length;
      sightMarks(boxes, width, height, r0, scope, chip, around, false, choices);
      for (let i = 0; i < wide; i += 4) {
        const j = wide + i;
        rect(Math.min(boxes[i], boxes[j]), Math.min(boxes[i + 1], boxes[j + 1]), Math.max(boxes[i + 2], boxes[j + 2]),
          Math.max(boxes[i + 3], boxes[j + 3]));
      }
    };
    // The heaviest case's choices at each of RADII + 1 rings from the smallest to the widest, among the furniture and
    // without it (where a lighter case keeps its first places); a run of rings making the same choices sweeps those places
    // from the ring before the run to the ring after it, so the ring where a choice flips, between two samples, is inside.
    const made = CHOICES;
    let tagUp = false;
    for (const around of [NONE, marks]) {
      for (let k = 0; k <= RADII; k++) {
        sightMarks(SIGHT_BOXES, width, height, floor + (widest - floor) * k / RADII, scope, chip, around, true, made[k]);
        tagUp ||= made[k].tagUp;
      }
      const r = (i: number) => floor + (widest - floor) * Math.min(RADII, Math.max(0, i)) / RADII;
      for (let k = 0; k <= RADII;) {
        let j = k;
        while (j < RADII && sameChoices(made[j + 1], made[k])) j++;
        sweep(made[k], r(k - 1), r(j + 1), around);
        k = j + 1;
      }
    }
    // the range tag rides the ring outward as it blooms (past a rack, or not): four boxes span each sweep; hung at the
    // 1:30 too where the heaviest case hangs it there
    if (!scope) continue;
    const tagX = (r: number, rack: boolean) => cx + Math.max(.7071 * (r + 9), rack ? R.rangeRackPx : 0) + 4;
    for (const up of tagUp ? [false, true] : [false]) {
      const tagY = (r: number) => up ? cy - .7071 * (r + 9) - R.rangeOverPx - 1 : cy + .7071 * (r + 9) + 12;
      for (let k = 0; k < 4; k++) {
        const a = floor + (widest - floor) * k / 4, b = floor + (widest - floor) * (k + 1) / 4;
        const ya = tagY(a), yb = tagY(b);
        rect(tagX(a, false) - 3, Math.min(ya, yb) - R.rangeAbovePx, tagX(b, true) + R.rangeWidthPx, Math.max(ya, yb) + R.rangeBelowPx);
      }
    }
  }
  // (a box inside another adds nothing: where the furniture moves nothing the replayed places repeat the first ones)
  let kept = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    let inside = false;
    if (!('r' in a)) {
      for (let j = 0; j < out.length && !inside; j++) {
        const b = out[j];
        if (j === i || 'r' in b) continue;
        inside = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
          && (j < i || a.x > b.x || a.y > b.y || a.x + a.w < b.x + b.w || a.y + a.h < b.y + b.h);
      }
    }
    if (!inside) out[kept++] = a;
  }
  out.length = kept;
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
/** The medal card never hides a kill row (owner, 2026-10-20: decided by the lane): each row a lane would give up costs
 *  more than waiting on both notices' places and more than the compact card (MEDAL_COMPACT_COST), so the card waits, or
 *  goes compact, rather than cover the feed (the rows may still start lower while it shows). */
const MEDAL_LANES: LanePrice = { row: 2e6, px: .25, fixed: 40, empty: 6e6 };
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
 *  390), they may go on down to 40 % (the count's numeral still 34 px) rather than cover a notice; so may the countdown on
 *  the detection's place, before it leaves the bloomed sight (768 x 600 since the HUD's out-of-ammo chip over the sight). */
const SCALES = [1, .9, .8, .7, .6, .5] as const;
const SCALE_COSTS = [0, 80, 160, 240, 320, 1200] as const;
const LAST_SCALES = [...SCALES, .45, .4] as const;
const LAST_SCALE_COSTS = [...SCALE_COSTS, 2400, 3600] as const;
/** The medal card waits (keeping its time) while anything shown meets its place (mouseMedalWaits), so sharing a notice's
 *  place costs only the wait: the alert's (2.4 s) a little; the detection's (its 8 s lamp; main showed the card at once
 *  just below it) more than any move down the centre line to a place clear of the reticle, so the card waits on the
 *  lamp only where no such place exists. A px sideways costs 4 (main's card is centred: it goes down the centre line
 *  before it goes aside). The full card in any place clear of a keep-out beats the compact card at that keep-out (main's
 *  look wherever the full card fits). */
const MEDAL_SHARE_ALERT_COST = 60, MEDAL_SHARE_DETECTION_COST = 600, MEDAL_SHARE_BOTH_COST = 630, MEDAL_SHIFT_COST = 4;
/* Where the card still waits on the lamp (2026-10-20; with these prices, MEDAL_LANES and MEDAL_COMPACT_COST): no place
   down the centre line between the lamp and the aim point clears the keep-out, the instruments, both notices and the
   kill lanes. "s": without an objective; the census at 7, 14 and 20 a side (mouseNoticePlan.selftest.mjs VIEWPORTS):
     768 x 600, 1024 x 768, 1152 x 648, 1280 x 800, 1366 x 768, 1440 x 900, 1536 x 864 and 1600 x 900 (each with and
     without an objective), 1280 x 720 s, and 390 x 844 and 844 x 390 (with and without);
   the critics' off-census windows (synthesised from the census boxes, p229/critic-planner-harness/base.mjs synth):
     500 x 900, 769 x 551, 800 x 600, 911 x 512, 960 x 600, 1242 x 698, 1280 x 689, 1309 x 818, 1440 x 789,
     1463 x 823, 1536 x 864, 1680 x 939, 1707 x 960, 1745 x 982, 1920 x 940, 1920 x 970 (1080p browser windows),
     1966 x 823 and 2293 x 960 (with and without), 1000 x 400 (with an objective), and 1093 x 614 s, 1097 x 617 s,
     1152 x 720 s, 1280 x 720 s, 1366 x 625 s, 1366 x 657 s and 1536 x 753 s. */
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
    // (the medal card's wait counts every row a lane gives up, so its price does too, not only the rows clear of the
    // bloomed battle sight: mouseMedalWaits waits on a cut the price had called free)
    const clear = price === MEDAL_LANES || Number.isNaN(laneClear[side]) ? lane.bottom : laneClear[side];
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
const NO_MARKS: readonly number[] = [];
const edgeScratch: number[] = [];
/** walkY on the coarse grid and at `marks`, then to the px within a step of the cheapest y `found()` reports (NaN: none). */
function walkFine(yPref: number, yMin: number, yMax: number, limit: () => number, visit: (y: number, yCost: number) => void,
  found: () => number, marks: readonly number[] = NO_MARKS): void {
  walkY(yPref, yMin, yMax, limit, visit);
  // then each of `marks` (integers: a band narrower than the coarse step is found at its edges)
  for (const y of marks) {
    const yCost = y < yPref ? (yPref - y) * UP_COST : y - yPref;
    if (y >= yMin && y <= yMax && yCost < limit()) visit(y, yCost);
  }
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
  avoid: readonly PlanRect[] = NONE, price: LanePrice = BATTLE_LANES, partner: readonly number[] | null = null, shift = SHIFT_COST,
  edges = false): Single {
  const { input } = env;
  const cx = input.width / 2;
  out.cost = Infinity; out.lane = 0;
  const hh = Math.ceil(h);
  // `edges`: the rows just clear of each blocking box (the fixed boxes and keep-out with their gaps, the discs, `avoid`),
  // where a place can be a band narrower than the coarse step (844 x 390 without an objective: y 295..296 between the
  // gun-limit chip and the scope-vision toggle)
  let marks = NO_MARKS;
  if (edges) {
    marks = edgeScratch; edgeScratch.length = 0;
    // (below a box: its bottom rounded up; above it: its top less the height, rounded down)
    for (let i = 0; i < env.itemCount; i++) edgeScratch.push(Math.ceil(env.items[i * 4 + 3]), Math.floor(env.items[i * 4 + 2] - hh));
    for (let i = 0; i < env.discCount; i++) {
      const cy = env.discs[i * 3 + 1], reach = env.discs[i * 3 + 2];
      edgeScratch.push(Math.ceil(cy + reach), Math.floor(cy - reach - hh));
    }
    for (const o of avoid) edgeScratch.push(Math.ceil(o.y + o.h + MOUSE_NOTICE_GAP_PX), Math.floor(o.y - MOUSE_NOTICE_GAP_PX - hh));
    // the lowest row, and (the lanes yielding rather than blocking) each lane's own edges
    edgeScratch.push(input.height - EDGE_PX - hh);
    if (env.lanes === 'yield') for (const lane of input.lanes) {
      if (lane) edgeScratch.push(Math.ceil(lane.bottom + MOUSE_NOTICE_GAP_PX), Math.floor(lane.top - MOUSE_NOTICE_GAP_PX - hh));
    }
  }
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
    const cost = base + yCost + shift * Math.abs(m - cx) + lane + (env.soft.length ? softCost(env, m - w / 2, y, w, h) : 0);
    if (cost < out.cost) {
      out.cost = cost; out.x = m; out.y = y; out.lane = lane;
      for (let i = 0; i < 4; i++) out.giveWay[i] = env.lanes === 'yield' ? yieldScratch[i] : NaN;
    }
  }, () => out.cost < Infinity ? out.y : NaN, marks);
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
type Option = readonly [w: number, h: number, base: number, avoid: readonly PlanRect[], shift?: number, edges?: boolean];
/** The cheapest place for any of `options` from `yPref` in `env` (its keep-out; the lanes blocking or yielding). */
function placeOne(env: Env, options: readonly Option[], yPref: number, price: LanePrice, partner: readonly number[] | null,
  out: { cost: number; option: number; s: Single }): boolean {
  const one = placeScratch;
  out.cost = Infinity;
  for (let i = 0; i < options.length; i++) {
    const [w, h, base, avoid, shift, edges] = options[i];
    if (base >= out.cost) continue;
    singleBest(env, w, h, yPref, base, out.cost, one, avoid, price, partner, shift, edges);
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
  const keeps = TIERS.map((tier) => mouseReticleFootprint(input.width, input.height, tier, [], input.furniture));
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
    // (on the detection's place the countdown may go down to 40 % too, before it leaves the bloomed sight: the HUD's
    // out-of-ammo chip over the sight left 768 x 600's half-size countdown no room on it)
    const ladder = (tier: number, share: boolean) => tier && !share ? SCALES : LAST_SCALES;
    let tier = place((share, t) => ladder(t, share).map((s, i) => [size.w * s, size.h * s, LAST_SCALE_COSTS[i], share ? alertOnly : notices] as const),
      yPref, price, shareDetection);
    // The last resorts (a window too small for any of those; the census never comes here): a place clear of the resting
    // sight on either notice's place, then over an instrument or a lane, never main's own place on the aim point.
    if (tier < 0) {
      const envs = envsAt(TIERS.indexOf(0));
      chosen = LAST_SCALES.map((s, i) => [size.w * s, size.h * s, LAST_SCALE_COSTS[i], NONE] as const);
      if (!placeOne(envs[envs.length - 1], chosen, yPref, price, hasLanes ? both : null, found)
        && !placeOne(makeEnv(TIERS.length * 2, { ...input, obstacles: NONE, lanes: [null, null] }, keeps[TIERS.indexOf(0)], 'block'),
          chosen, yPref, price, null, found)) return null;
      tier = 0;
    }
    const s = chosen[found.option][0] / size.w, w = size.w * s, h = size.h * s, x = found.s.x - w / 2, y = found.s.y;
    return { x, y, w, h, scale: s, clearance: tier as 2 | 1 | 0, sharesNotices: overlapsAny({ x, y, w, h }, notices), giveWay: giveWayOf(found.s.giveWay, 0) };
  };
  // The medal card: the full card wherever a place clears the keep-out, off both notices or (waiting while it is up) on
  // the alert's place, the detection's or both; the compact card only where the full one has no place at that keep-out.
  const { medal: full, medalCompact: compact } = input;
  const detOnly = [det];
  // (the card's search also tries the rows just clear of each blocking box: `edges`)
  const medalOptions = (): readonly Option[] => [
    [full.w, full.h, 0, notices, MEDAL_SHIFT_COST, true], [full.w, full.h, MEDAL_SHARE_ALERT_COST, detOnly, MEDAL_SHIFT_COST, true],
    [full.w, full.h, MEDAL_SHARE_DETECTION_COST, alertOnly, MEDAL_SHIFT_COST, true],
    [full.w, full.h, MEDAL_SHARE_BOTH_COST, NONE, MEDAL_SHIFT_COST, true],
    [compact.w, compact.h, MEDAL_COMPACT_COST, notices, MEDAL_SHIFT_COST, true],
    [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_ALERT_COST, detOnly, MEDAL_SHIFT_COST, true],
    [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_DETECTION_COST, alertOnly, MEDAL_SHIFT_COST, true],
    [compact.w, compact.h, MEDAL_COMPACT_COST + MEDAL_SHARE_BOTH_COST, NONE, MEDAL_SHIFT_COST, true]];
  /** The card at the place `found` holds (its option in `chosen`), clear of the keep-out at `tier`. */
  const medalAt = (tier: number): PlannedMedal => {
    const [w, h, base] = chosen[found.option];
    const box = { x: found.s.x - w / 2, y: found.s.y, w, h };
    const giveWay = giveWayOf(found.s.giveWay, 0);
    const cuts = (side: number) => {
      const lane = input.lanes[side];
      if (!lane) return false;
      const t = Number.isNaN(giveWay[side * 2]) ? lane.top : giveWay[side * 2], b = Number.isNaN(giveWay[side * 2 + 1]) ? lane.bottom : giveWay[side * 2 + 1];
      return rowsIn(b - t) < rowsIn(lane.bottom - lane.top);
    };
    return { ...box, compact: base >= MEDAL_COMPACT_COST, clearance: tier as 2 | 1 | 0,
      sharesNotices: overlapsAny(box, notices), giveWay, cutsLanes: [cuts(0), cuts(1)] };
  };
  const placeMedal = (): PlannedMedal | null => {
    // (its sharing is in its options: the steps are the keep-outs alone)
    const medalTier = place(medalOptions, Math.ceil(input.top + 16), MEDAL_LANES, false);
    if (medalTier < 0) return null;
    const medal = medalAt(medalTier);
    // The lane decides (owner, 2026-10-20): a place that leaves a side lane fewer rows makes the card wait while that lane
    // shows a kill, so where the whole reticle leaves the card only such places, one clear of the battle sight at full
    // bloom that keeps both lanes whole wins (that card waits only while the scope is up). The HUD's out-of-ammo marks
    // under a short window's sight made that choice real (844 x 390 without an objective).
    if (medalTier !== 2 || !(medal.cutsLanes[0] || medal.cutsLanes[1])) return medal;
    const envs = envsAt(TIERS.indexOf(1));
    chosen = medalOptions();
    if (!placeOne(envs[envs.length - 1], chosen, Math.ceil(input.top + 16), MEDAL_LANES, hasLanes ? both : null, found)) return medal;
    const kept = medalAt(1);
    return kept.cutsLanes[0] || kept.cutsLanes[1] ? medal : kept;
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
 * scope is up where its place clears the battle sight only, a shown element's place meets its own (a notice whose place
 * it shares, or the revive count: a medal can arrive after the death, a shell still in flight, a mutual kill), or its
 * place would cut a side lane that shows a kill row.
 * The revive count's place is read (made) only while it shows.
 */
export function mouseMedalWaits(plan: MouseNoticePlan, up: MouseMedalCompany): boolean {
  const slot = plan.medal;
  if (!slot) return true;
  if (up.scoped && slot.clearance < 2) return true;
  if (up.detection && meets(slot, plan.detection)) return true;
  if (up.alert && meets(slot, mouseAlertBox(plan.alert))) return true;
  // never a kill row hidden for it: where its place cuts a lane, it waits while that lane shows a row
  if (up.feeds && ((slot.cutsLanes[0] && up.feeds[0]) || (slot.cutsLanes[1] && up.feeds[1]))) return true;
  const revive = up.revive ? plan.revive : null;
  return !!revive && meets(slot, revive);
}
