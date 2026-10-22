/**
 * The pre-battle countdown's place on both layouts (owner, 2026-10-21, over a Turbo Ball match whose count the notice
 * planners had sent to 31 % of the width: "the 3 2 1 area can be a lot better but regardless it needs to be in center
 * of screen"). The dial sits on the window's centre line just over the crosshair, its bottom a twentieth of the height
 * over the aim point (at least clear of the resting sight), and slides up, then shrinks, only where a panel or the score
 * and objective would meet it; the rules panel sits on the same line under the sight's marks (or, where they leave it no
 * place, under the resting sight), sliding down, then shrinking to the 11 px type floor, and stays hidden where nothing
 * clears it (a phone's touch controls leave it no centred place: the play menu's mode card lists the same rules).
 * Neither ever leaves the centre line.
 *
 * DOM-free and deterministic: mouseNoticePlan.ts and touchNoticePlan.ts call it with their own blocks.
 */

export interface CountdownBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface CountdownSize { readonly w: number; readonly h: number }

export interface CountdownPlace {
  /** The dial's top and scale (its centre is the window's; the CSS scales it from its top centre). */
  top: number; scale: number;
  /** false: no place on the centre line kept clear of the blocks, so it took the lowest that fits the band. */
  cleared: boolean;
  /** The rules panel's top and scale (from its top centre); hidden where no place under the sight keeps clear. */
  rulesTop: number; rulesScale: number; rulesShown: boolean;
}

/** The resting sight: the dispersion ring at its floor (11 px), its dashed stroke and halo, and the reticle margin. */
const SIGHT_CLEAR_PX = 20;
/** Under the aim point: the column of marks under the marker (the rack, the struck round, the reload count) and the
 *  gun-limit chip at 50 % + 48 px (battleHudLayout.css .cot-aim-warning, 24 px tall). */
const MARKS_BELOW_PX = 76;
/** The dial's bottom over the aim point, as a share of the height. */
const LIFT = 0.05;
const DIAL_SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4] as const;
/** 13 px type (11 px on touch's 12 px) at the last: the type floor. */
const RULES_SCALES = [1, 0.92, 0.85] as const;
const STEP_PX = 4;

const clearOf = (x0: number, y0: number, x1: number, y1: number, blocks: readonly CountdownBox[], gap: number) => {
  for (const b of blocks) {
    if (x0 < b.x1 + gap && x1 > b.x0 - gap && y0 < b.y1 + gap && y1 > b.y0 - gap) return false;
  }
  return true;
};

/**
 * The dial's and the rules panel's places (see the module's note). `top`: the bottom of the score and objective;
 * `blocks`: the panels, controls and readouts each keeps `gap` from (never the reticle: the centre line is its place).
 */
export function placeCountdown(width: number, height: number, top: number, dial: CountdownSize, rules: CountdownSize | null,
  blocks: readonly CountdownBox[], gap: number): CountdownPlace {
  const cx = width / 2, cy = height / 2;
  const ceiling = Math.ceil(top + gap);
  const lowest = Math.floor(cy - SIGHT_CLEAR_PX - gap);
  const bottom = Math.min(lowest, Math.floor(cy - Math.max(SIGHT_CLEAR_PX + gap, height * LIFT)));
  const place: CountdownPlace = { top: ceiling, scale: DIAL_SCALES[DIAL_SCALES.length - 1], cleared: false,
    rulesTop: Math.ceil(cy + MARKS_BELOW_PX + gap), rulesScale: 1, rulesShown: false };
  let found = false;
  for (const s of DIAL_SCALES) {
    const w = dial.w * s, h = dial.h * s;
    if (w + 2 * gap > width || bottom - h < ceiling) continue;
    for (let y = Math.floor(bottom - h); y >= ceiling && !found; y -= STEP_PX) {
      if (!clearOf(cx - w / 2, y, cx + w / 2, y + h, blocks, gap)) continue;
      place.top = y; place.scale = s; place.cleared = found = true;
    }
    if (found) break;
  }
  if (!found) {
    // nothing clears: the largest dial the band between the objective and the sight holds, as low as it goes
    const band = Math.max(0, lowest - ceiling);
    const s = DIAL_SCALES.find((k) => dial.h * k <= band && dial.w * k + 2 * gap <= width) ?? DIAL_SCALES[DIAL_SCALES.length - 1];
    place.scale = s;
    place.top = Math.max(ceiling, Math.floor(bottom - dial.h * s));
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
