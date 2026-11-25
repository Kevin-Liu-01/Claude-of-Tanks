/**
 * strikeSeats.ts — where Air Support's call-ins, readout and CALL stand on a touch layout while the binoculars are up
 * (item air-support-seats-276). Copyright © 2026 Kevin B. Liu.
 *
 * notices-276 found the crossings that fixed seats had made: CALL under the vehicle controls' edge section at 844x390, the
 * call-ins on the selected shell at 820x1180 and in the items' column at 744x1001, and the call-ins 80 px off the screen at
 * 1180x820. A seat held at a fixed offset from one corner is right only at the sizes it was tuned at. Here each part has
 * its designed seat, which the gauntlet passed where it is clear. Where a measured box blocks that seat, the part takes the
 * nearest clear seat in its band, then on the far side of the row. The boxes are the live controls and instruments
 * (battleHudLayout.ts measures them each pass), so a new size or kit cannot put one on another. Support never moves (it is
 * also the close, tools/air-support-close-box.selftest.mjs); the parts are seated around it, in order: the call-ins, the
 * readout over or under them, CALL.
 * DOM-free: tools/air-support-seats.selftest.mjs runs it in Node.
 */

export interface SeatBox { x: number; y: number; w: number; h: number }
interface SeatSize { w: number; h: number }

interface StrikeSeatInput {
  width: number; height: number;
  /** battleHudLayout.ts data-systems-slot: '' (the row on its own), 'top' (a small portrait phone's) or 'edge' (a phone's
   *  right edge section). */
  slot: string;
  /** the systems row's place as the layout writes it (--hud-systems-left / -top) */
  systemsLeft: number; systemsTop: number;
  /** the Support slot (its dock on a touch layout) */
  support: SeatBox;
  rack: SeatSize;
  readout: SeatSize | null;
  call: SeatSize | null;
  /** every control and instrument box a part may not cross (Support among them) */
  obstacles: readonly SeatBox[];
}

export interface StrikeSeats { rack: SeatBox; readout: SeatBox | null; call: SeatBox | null }

/** The gap between two parts, and the screen's edge a seat keeps. */
export const SEAT_GAP = 8;
const SEAT_EDGE = 12;

const crosses = (a: SeatBox, b: SeatBox) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;

/**
 * The first clear seat for a box of `size`, from `prefs` (each a designed seat, best first): the seat itself, else the
 * nearest clear place along its band (left or right of each box in that band, or against the screen's edges). Null when
 * no band holds it.
 */
function seatIn(prefs: readonly { x: number; y: number }[], size: SeatSize, blocked: readonly SeatBox[],
  width: number, height: number): SeatBox | null {
  const fits = (b: SeatBox) => b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height
    && !blocked.some((o) => crosses(b, o));
  for (const pref of prefs) {
    const at = { x: Math.round(pref.x), y: Math.round(pref.y), w: size.w, h: size.h };
    if (fits(at)) return at;
    const xs = [SEAT_EDGE, width - SEAT_EDGE - size.w];
    for (const o of blocked) {
      if (o.y >= at.y + at.h || o.y + o.h <= at.y) continue;
      xs.push(o.x - SEAT_GAP - size.w, o.x + o.w + SEAT_GAP);
    }
    const best = xs.map((x) => ({ ...at, x: Math.round(x) })).filter(fits)
      .sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x))[0];
    if (best) return best;
  }
  // (notices-polish-277) then the nearest clear seat up or down from the first preference, at its own left or at the edges:
  // with the notice lanes reserved (the condition lane, the event lane's seat) every designed seat could be taken, and the
  // stylesheet's own then set the call-ins on "Incoming artillery" at 390x844 and 844x390 (the overlap probe)
  const first = prefs[0];
  if (first) {
    for (let dy = SEAT_SWEEP_STEP; dy < height; dy += SEAT_SWEEP_STEP) {
      for (const y of [first.y + dy, first.y - dy]) {
        for (const x of [first.x, SEAT_EDGE, width - SEAT_EDGE - size.w]) {
          const at = { x: Math.round(x), y: Math.round(y), w: size.w, h: size.h };
          if (fits(at)) return at;
        }
      }
    }
  }
  return null;
}

/** The sweep's step (px) when no designed seat is clear. */
const SEAT_SWEEP_STEP = 4;

/** The seats, or null when the call-ins have no clear seat (the layout then keeps the stylesheet's own). */
export function planStrikeSeats(input: StrikeSeatInput): StrikeSeats | null {
  const { width, height, slot, systemsLeft, systemsTop, support, obstacles } = input;
  const portrait = height >= width;
  const edge = slot === 'edge';
  const taken: SeatBox[] = [...obstacles];
  // the call-ins: an edge section's open leftward from it, level with its top (then level with Support over it); a row's
  // start 47 px left of the systems (Support's own left edge beside the row), on the far side of the row from the sight's
  // band (under it in portrait, over it in landscape, 54 px from the row's top), then on the near side
  const { rack: rackSize } = input;
  const rowX = systemsLeft - 47;
  const under = { x: rowX, y: systemsTop + 54 }, over = { x: rowX, y: systemsTop - 54 };
  // (notices-polish-277) then one rack lower, still beside the section: under the condition lane's reserved place, which a
  // view's controls yield to (at 390x844 the lane stands level with the section's top)
  const rackPrefs = edge
    ? [{ x: systemsLeft - SEAT_GAP - rackSize.w, y: systemsTop }, { x: systemsLeft - SEAT_GAP - rackSize.w, y: support.y },
      { x: systemsLeft - SEAT_GAP - rackSize.w, y: systemsTop + rackSize.h + SEAT_GAP }]
    : portrait ? [under, over] : [over, under];
  const rack = seatIn(rackPrefs, rackSize, taken, width, height);
  if (!rack) return null;
  taken.push(rack);
  // the readout: under the call-ins (an edge section's on their right edge, a row's on Support's left edge), 8 px under them
  // as they are under the row; a landscape row's over them, as they are over the row
  let readout: SeatBox | null = null;
  if (input.readout) {
    const size = input.readout;
    const belowX = edge ? rack.x + rack.w - size.w : rowX;
    const below = { x: belowX, y: rack.y + rack.h + SEAT_GAP + (edge ? 0 : 2) };
    const above = { x: edge ? belowX : rack.x, y: rack.y - SEAT_GAP - size.h };
    readout = seatIn(!edge && !portrait ? [above, below] : [below, above], size, taken, width, height);
    if (readout) taken.push(readout);
  }
  // CALL: a portrait layout's on the centre line, over the second FIRE (its designed seat, 252 px over the foot); an edge
  // section's under the readout on the call-ins' edge; a landscape row's left of Support, level with it; then under the
  // readout, then over the call-ins
  let call: SeatBox | null = null;
  if (input.call) {
    const size = input.call;
    const low = readout ?? rack;
    const underLow = { x: edge ? rack.x + rack.w - size.w : portrait ? width / 2 - 24 : low.x, y: low.y + low.h + SEAT_GAP };
    const prefs = portrait
      ? [{ x: width / 2 - 24, y: height - 252 - size.h }, underLow]
      : edge ? [underLow]
        : [{ x: support.x - SEAT_GAP - size.w, y: support.y + support.h / 2 - size.h / 2 }, underLow];
    prefs.push({ x: rack.x + rack.w - size.w, y: Math.min(rack.y, readout?.y ?? rack.y) - SEAT_GAP - size.h });
    call = seatIn(prefs, size, taken, width, height);
  }
  return { rack, readout, call };
}
