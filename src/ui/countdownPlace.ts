/**
 * The pre-battle countdown's place on both layouts (owner, 2026-10-21, over a Turbo Ball match whose count the notice
 * planners had sent to 31 % of the width: "the 3 2 1 area can be a lot better but regardless it needs to be in center
 * of screen"). The dial sits on the window's centre line just over the crosshair, its bottom a twelfth of the height
 * over the aim point (at least clear of the resting sight), and slides up, then shrinks, only where a panel or the score
 * and objective would meet it; the rules panel sits on the same line under the sight's marks (or, where they leave it no
 * place, under the resting sight), sliding down, then shrinking to the 11 px type floor, and stays hidden where nothing
 * clears it (a phone's touch controls leave it no centred place: the play menu's mode card lists the same rules).
 * On touch (`overSight`), where nothing over the sight clears it (a short landscape between its objective and its
 * controls row, a narrow phone under its top row), the dial comes down over the crosshair, idle before the roll-out, as
 * far as its top at the aim point and as small as a 26 px numeral; where even that meets a panel, it takes the place
 * that covers least of them, never the ceiling place over the map and the controls. Neither ever leaves the centre
 * line (noticeCentreLine.ts: every centre notice keeps to it).
 *
 * DOM-free and deterministic: mouseNoticePlan.ts and touchNoticePlan.ts call it with their own blocks.
 */

import { noticeCentreX } from './noticeCentreLine.ts';

export interface CountdownBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface CountdownSize { readonly w: number; readonly h: number }

export interface CountdownPlace {
  /** The dial's top and scale (its centre is the window's; the CSS scales it from its top centre). */
  top: number; scale: number;
  /** false: no place on the centre line kept clear of the blocks, so it took the one that covers least of them. */
  cleared: boolean;
  /** The rules panel's top and scale (from its top centre); hidden where no place under the sight keeps clear. */
  rulesTop: number; rulesScale: number; rulesShown: boolean;
}

/** The resting sight: the dispersion ring at its floor (11 px), its dashed stroke and halo, and the reticle margin. */
export const SIGHT_CLEAR_PX = 20;
/** Under the aim point: the column of marks under the marker (the rack, the struck round, the reload count) and the
 *  gun-limit chip at 50 % + 48 px (battleHudLayout.css .cot-aim-warning, 24 px tall). */
export const MARKS_BELOW_PX = 76;
/** The dial's bottom over the aim point, as a share of the height (a twelfth: at a twentieth the dial's 6 o'clock tick met
 *  the ring of a gun not yet aimed, gauntlet r3 from 1024x600 to 2560). */
const LIFT = 0.08;
const DIAL_SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4] as const;
/** Over the sight, smaller still: a 100 px numeral at 26 px at the least (568x256 leaves the centre line 43 px). */
const OVER_SIGHT_SCALES = [...DIAL_SCALES, 0.35, 0.3, 0.26] as const;
/** 13 px type (11 px on touch's 12 px) at the last: the type floor. */
const RULES_SCALES = [1, 0.92, 0.85] as const;
const STEP_PX = 4;

const clearOf = (x0: number, y0: number, x1: number, y1: number, blocks: readonly CountdownBox[], gap: number) => {
  for (const b of blocks) {
    if (x0 < b.x1 + gap && x1 > b.x0 - gap && y0 < b.y1 + gap && y1 > b.y0 - gap) return false;
  }
  return true;
};

/** The area of the blocks, each grown by `gap`, a box covers. */
const coveredBy = (x0: number, y0: number, x1: number, y1: number, blocks: readonly CountdownBox[], gap: number) => {
  let area = 0;
  for (const b of blocks) {
    area += Math.max(0, Math.min(x1, b.x1 + gap) - Math.max(x0, b.x0 - gap)) * Math.max(0, Math.min(y1, b.y1 + gap) - Math.max(y0, b.y0 - gap));
  }
  return area;
};

/**
 * The dial's and the rules panel's places (see the module's note). `top`: the bottom of the score and objective;
 * `blocks`: the panels, controls and readouts each keeps `gap` from (never the reticle: the centre line is its place);
 * `maxScale`: the largest dial (a step smaller while a mouse alert shows beside it, mouseNoticePlan.ts); `sightY`: the
 * battle sight's y (battleSight.ts: the chase framing's lens shift raises it over the centre).
 */
export function placeCountdown(width: number, height: number, top: number, dial: CountdownSize, rules: CountdownSize | null,
  blocks: readonly CountdownBox[], gap: number, overSight = false, maxScale = 1, sightY = height / 2): CountdownPlace {
  const cx = noticeCentreX(width), cy = sightY;
  const ceiling = Math.ceil(top + gap);
  const lowest = Math.floor(cy - SIGHT_CLEAR_PX - gap);
  const bottom = Math.min(lowest, Math.floor(cy - Math.max(SIGHT_CLEAR_PX + gap, height * LIFT)));
  const place: CountdownPlace = { top: ceiling, scale: DIAL_SCALES[DIAL_SCALES.length - 1], cleared: false,
    rulesTop: Math.ceil(cy + MARKS_BELOW_PX + gap), rulesScale: 1, rulesShown: false };
  let found = false;
  for (const s of DIAL_SCALES) {
    if (s > maxScale) continue;
    const w = dial.w * s, h = dial.h * s;
    if (w + 2 * gap > width || bottom - h < ceiling) continue;
    for (let y = Math.floor(bottom - h); y >= ceiling && !found; y -= STEP_PX) {
      if (!clearOf(cx - w / 2, y, cx + w / 2, y + h, blocks, gap)) continue;
      place.top = y; place.scale = s; place.cleared = found = true;
    }
    if (found) break;
  }
  // (touch, `overSight`) nothing over the sight clears: down over the crosshair, its top at the aim point at the lowest,
  // the largest that clears
  for (const s of overSight ? OVER_SIGHT_SCALES : []) {
    if (found) break;
    const w = dial.w * s, h = dial.h * s;
    if (w + 2 * gap > width || ceiling + h > height - gap) continue;
    // (the rows nearest its own place, its bottom a twelfth over the aim point, first)
    const ideal = Math.floor(bottom - h);
    const rows: number[] = [];
    for (let y = ceiling; y <= Math.floor(cy); y += STEP_PX) rows.push(y);
    rows.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal));
    for (const y of rows) {
      if (!clearOf(cx - w / 2, y, cx + w / 2, y + h, blocks, gap)) continue;
      place.top = y; place.scale = s; place.cleared = found = true;
      break;
    }
  }
  if (!found && !overSight) {
    // nothing clears: the largest dial the band between the objective and the sight holds, as low as it goes
    const band = Math.max(0, lowest - ceiling);
    const s = DIAL_SCALES.find((k) => dial.h * k <= band && dial.w * k + 2 * gap <= width) ?? DIAL_SCALES[DIAL_SCALES.length - 1];
    place.scale = s;
    place.top = Math.max(ceiling, Math.floor(bottom - dial.h * s));
  } else if (!found) {
    // nothing clears anywhere on the line: the smallest dial where it covers least of the blocks
    const s = OVER_SIGHT_SCALES[OVER_SIGHT_SCALES.length - 1];
    const w = dial.w * s, h = dial.h * s;
    let least = Infinity;
    for (let y = ceiling; y <= Math.floor(cy); y += STEP_PX) {
      const covered = coveredBy(cx - w / 2, y, cx + w / 2, y + h, blocks, gap);
      if (covered < least) { least = covered; place.top = y; }
    }
    place.scale = s;
  }
  if (!rules || rules.w <= 0 || rules.h <= 0) return place;
  const dialBox: CountdownBox = { x0: cx - dial.w * place.scale / 2, y0: place.top, x1: cx + dial.w * place.scale / 2, y1: place.top + dial.h * place.scale };
  // (under the marks' column first; where that leaves no place, under the resting sight alone: the gun is loaded before
  // the roll-out, and a gun-limit chip that shows is among the blocks)
  for (const below of [MARKS_BELOW_PX, SIGHT_CLEAR_PX]) {
    for (const s of RULES_SCALES) {
      const w = rules.w * s, h = rules.h * s;
      if (w + 2 * gap > width) continue;
      for (let y = Math.ceil(cy + below + gap); y + h <= height - gap; y += STEP_PX) {
        if (!clearOf(cx - w / 2, y, cx + w / 2, y + h, blocks, gap) || !clearOf(cx - w / 2, y, cx + w / 2, y + h, [dialBox], gap)) continue;
        place.rulesTop = y; place.rulesScale = s; place.rulesShown = true;
        return place;
      }
    }
  }
  return place;
}
