/**
 * guidancePlan.ts — one place for the battle's guidance: the tutorial's card and the battle's toasts (274).
 * Copyright © 2026 Kevin B. Liu.
 *
 * Kevin, 2026-11-18: "for the tutorial, the armor shader hexagon and the tutorial squares at top overlap. there should
 * be one unified thing for this". Each guidance surface over the battle chose its own spot: the tutorial's card stood
 * in its own upper band (ui/tutorial/tutorialOverlay.ts), the battle's toasts (ui/battleNotices.ts: the armour tip, the
 * pointer lock's prompt, the network's banner, on the HUD's angled notice plate) at a fixed 76 px from the top, the
 * detection and the alert where the notice planners put them (mouseNoticePlan.ts, touchNoticePlan.ts). Nothing kept one
 * off another, and on a phone a toast lay over the right-hand shell and kit buttons.
 *
 * battleHudLayout.ts now plans them together with the centre notices, in one order: on a touch layout, where a phone
 * has no spare row, the card first (placeGuidanceCard), then the detection and the alert round it (touchNoticePlan.ts
 * takes the card as an obstacle), then the toasts, or, where the notice planner still has no place off the card, the
 * notices first and the card round them, or, where neither order keeps them apart (the smallest landscapes), the card
 * giving way while a detection or an alert shows (planTouchGuidance cardYields); on a mouse layout, which has the room, the centre notices keep their
 * places and the card and the toasts go round them (planGuidance). Each takes a place on the window's centre line (noticeCentreLine.ts: a place moves up or down, never
 * sideways), each clear of every HUD instrument and control (`hard`: the score, the panels, the shell and kit buttons,
 * the vehicle actions, the touch buttons, the detection and the alert), of each other, and, where the screen has room,
 * of the map, the rosters, the kill lanes and the sight (`soft`). A place narrows to the free span between the side
 * columns at its height (a phone's shell and kit column among them), and the card's height grows as it narrows (its
 * words reflow). It tries, in order, each surface at full height clear of all, then of the hard boxes alone, then shrunk
 * (the card scrolls; a toast never shrinks) clear of all, then of the hard alone; where nothing clears (the smallest
 * screens) it may lie on an instrument, never on a shell or kit button or another notice (`never`), marked not cleared;
 * a surface no centred band holds at all stands off the line in the first free box (offCentre).
 * The toasts take their place after the card's; where none keeps them off the controls, the card and the centre notices
 * they wait (null) and show when one frees, as the medal card waits for its place.
 *
 * DOM-free and deterministic; guidancePlan.selftest.mjs lays out every recorded HUD size (tools/fixtures/
 * hud-sight-furniture.json) at desktop, phone portrait and phone landscape and holds every place clear.
 */

export interface GuidanceBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
export interface GuidanceSize { readonly w: number; readonly h: number }

/** Space kept between a guidance surface and anything else (px). */
const GUIDANCE_GAP = 6;
/** The narrowest a card or a toast may be laid out (px), and the least a card may shrink to (it scrolls below that). */
const GUIDANCE_CARD_MIN_W = 200;
const GUIDANCE_TOAST_MIN_W = 200;
const GUIDANCE_CARD_MIN_H = 96;
/** The card's least of all, on the smallest phones only (568 x 290): its words wrap and it scrolls. */
const GUIDANCE_CARD_LEAST = { w: 150, h: 72 } as const;
/** The search step down the screen (px). */
const STEP = 2;

export interface GuidanceInput {
  readonly width: number;
  readonly height: number;
  /** The first row the guidance may use (under the score and the objective). */
  readonly top: number;
  /** Never covered: the instruments and controls, and the centre notices. */
  readonly hard: readonly GuidanceBox[];
  /** Kept clear where the screen has room: the map, the rosters, the kill lanes, the sight. */
  readonly soft: readonly GuidanceBox[];
  /** Never covered, even where nothing clears: the shell and kit buttons, and the centre notices (with the other guidance
   *  surface, which the plan adds). */
  readonly never: readonly GuidanceBox[];
  /** The tutorial card's natural size while one shows (its width the widest it takes). */
  readonly card: GuidanceSize | null;
  /** The toasts' column while one shows. */
  readonly toasts: GuidanceSize | null;
}

interface GuidancePlace extends GuidanceBox {
  /** The tier it cleared: 0 all, 1 the hard boxes alone, 2 only the never-covered boxes (it lies on an instrument). */
  readonly tier: 0 | 1 | 2;
  /** Shrunk below its natural height (the card scrolls). */
  readonly shrunk: boolean;
  /** Off the centre line: the last resort where no centred band holds it (the smallest windows). */
  readonly offCentre: boolean;
}

export interface GuidancePlan {
  readonly card: GuidancePlace | null;
  /** The toasts' place, or null while they wait: no place keeps them off the controls and the other notices (behind a
   *  card, or on the smallest phones while a centre notice shows); they show when one frees. */
  readonly toasts: GuidancePlace | null;
  readonly toastsWait: boolean;
  /** Every surface placed cleared the hard boxes (toasts that wait are not placed). */
  readonly cleared: boolean;
}

const crosses = (a: GuidanceBox, b: GuidanceBox, gap: number): boolean =>
  a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;

/**
 * The widest centred span free of `boxes` over the band y0..y1 (half its width, from the centre line), or 0 where a box
 * crosses the centre line in that band.
 */
function freeHalf(boxes: readonly GuidanceBox[], cx: number, y0: number, y1: number, edge: number): number {
  let half = Math.min(cx, edge - cx) - GUIDANCE_GAP * 2;
  for (const box of boxes) {
    if (box.y0 >= y1 + GUIDANCE_GAP || box.y1 <= y0 - GUIDANCE_GAP) continue;
    if (box.x0 - GUIDANCE_GAP < cx && box.x1 + GUIDANCE_GAP > cx) return 0;
    half = Math.min(half, box.x1 <= cx ? cx - box.x1 - GUIDANCE_GAP : box.x0 - cx - GUIDANCE_GAP);
  }
  return Math.max(0, half);
}

/** The first place from `from` down for a surface of natural `size` (its height reflowing as it narrows). */
function seek(size: GuidanceSize, minW: number, minH: number | null, input: GuidanceInput, boxes: readonly GuidanceBox[],
  from: number): { box: GuidanceBox; shrunk: boolean } | null {
  const cx = input.width / 2;
  const bottom = input.height - GUIDANCE_GAP;
  const wanted = Math.min(size.w, input.width - GUIDANCE_GAP * 4);
  for (let y = Math.ceil(from); y + (minH ?? size.h) <= bottom; y += STEP) {
    // the width the band allows at the natural height, and the height the words take at that width
    let w = Math.min(wanted, 2 * freeHalf(boxes, cx, y, y + size.h, input.width));
    if (w < minW) {
      if (minH == null) continue;
      w = Math.min(wanted, 2 * freeHalf(boxes, cx, y, y + minH, input.width));
      if (w < minW) continue;
    }
    const h = Math.ceil(size.h * (size.w / Math.max(1, w)));
    if (minH == null) {
      if (y + h > bottom || 2 * freeHalf(boxes, cx, y, y + h, input.width) < w) continue;
      return { box: { x0: cx - w / 2, y0: y, x1: cx + w / 2, y1: y + h }, shrunk: false };
    }
    // shrunk: the tallest band from y the width keeps clear, at least minH
    let reach = y + minH;
    while (reach + STEP <= Math.min(bottom, y + h) && 2 * freeHalf(boxes, cx, y, reach + STEP, input.width) >= w) reach += STEP;
    if (2 * freeHalf(boxes, cx, y, reach, input.width) < w) continue;
    return { box: { x0: cx - w / 2, y0: y, x1: cx + w / 2, y1: reach }, shrunk: reach < y + h };
  }
  return null;
}

/** The card's last resort where no centred band holds it: the first free box anywhere, left to right and top down. */
function seekAnywhere(size: GuidanceSize, minW: number, minH: number, input: GuidanceInput, boxes: readonly GuidanceBox[],
  from: number): { box: GuidanceBox; shrunk: boolean } | null {
  const edge = GUIDANCE_GAP * 2;
  const w = Math.max(minW, Math.min(size.w, input.width - edge * 2));
  for (let width = w; width >= minW; width -= 20) {
    const h = Math.ceil(size.h * (size.w / width));
    for (let y = Math.ceil(from); y + minH <= input.height - edge; y += STEP * 2) {
      for (let x = edge; x + width <= input.width - edge; x += STEP * 4) {
        const at = { x0: x, y0: y, x1: x + width, y1: y + minH };
        if (boxes.some((box) => crosses(at, box, GUIDANCE_GAP))) continue;
        let reach = y + minH;
        while (reach + STEP <= Math.min(input.height - edge, y + h)
          && !boxes.some((box) => crosses({ ...at, y1: reach + STEP }, box, GUIDANCE_GAP))) reach += STEP;
        return { box: { ...at, y1: reach }, shrunk: reach < y + h };
      }
    }
  }
  return null;
}

function place(size: GuidanceSize, minW: number, shrinkTo: number | null, input: GuidanceInput, placed: readonly GuidanceBox[],
  from: number): GuidancePlace | null {
  const never = [...input.never, ...placed];
  const hard = [...input.hard, ...never];
  const all = [...hard, ...input.soft];
  const tries: Array<[readonly GuidanceBox[], 0 | 1 | 2, number | null]> = [[all, 0, null], [hard, 1, null]];
  if (shrinkTo != null) tries.push([all, 0, shrinkTo], [hard, 1, shrinkTo]);
  // where nothing clears the instruments, it may lie on one, never on a shell or kit button or another notice
  tries.push([never, 2, shrinkTo]);
  for (const [boxes, tier, minH] of tries) {
    const found = seek(size, minW, minH, input, boxes, from);
    if (found) return { ...found.box, tier, shrunk: found.shrunk, offCentre: false };
  }
  // a surface no centred band holds stands off the line (a card shrunk, toasts at their height), clear of the instruments
  // where it can be, else of the controls
  for (const [boxes, tier] of [[hard, 1], [never, 2]] as const) {
    const found = seekAnywhere(size, minW, shrinkTo ?? size.h, input, boxes, from);
    if (found) return { ...found.box, tier, shrunk: found.shrunk, offCentre: true };
  }
  // the smallest phones (568 x 290): the card at its least, wrapped and scrolling, still off every control
  if (shrinkTo != null) {
    const found = seekAnywhere(size, GUIDANCE_CARD_LEAST.w, GUIDANCE_CARD_LEAST.h, input, never, from);
    if (found) return { ...found.box, tier: 2, shrunk: true, offCentre: true };
  }
  return null;
}

/** The card's place: the first phase on a touch layout, where the centre notices are then planned round it. */
function placeGuidanceCard(input: GuidanceInput): GuidancePlace | null {
  return input.card ? place(input.card, GUIDANCE_CARD_MIN_W, GUIDANCE_CARD_MIN_H, input, [], input.top) : null;
}

/** The toasts' place once the card (and the centre notices, in `never`) have theirs; null while they wait for the card. */
function placeGuidanceToasts(input: GuidanceInput, card: GuidanceBox | null): GuidancePlace | null {
  return input.toasts ? place(input.toasts, GUIDANCE_TOAST_MIN_W, null, input, card ? [card] : [], input.top) : null;
}

/** Where the tutorial's card and the battle's toasts stand, the centre notices already placed (see the module comment). */
export function planGuidance(input: GuidanceInput, card: GuidancePlace | null = placeGuidanceCard(input)): GuidancePlan {
  const toasts = placeGuidanceToasts(input, card);
  return {
    card, toasts, toastsWait: !!input.toasts && !toasts,
    cleared: (!input.card || (!!card && card.tier < 2)) && (!toasts || toasts.tier < 2),
  };
}

/**
 * A touch layout's order (see the module comment): the card first and the centre notices round it; where the notice
 * planner's fallback still lands a notice on the card (the smallest landscapes), the notices first and the card round
 * them. `planNotices` is the touch planner's boxes for the detection and the alert, given the card's place as an obstacle.
 */
export function planTouchGuidance(input: GuidanceInput, planNotices: (card: GuidanceBox | null) => GuidanceBox[]):
  { readonly plan: GuidancePlan; readonly notices: GuidanceBox[]; readonly cardFirst: boolean; readonly cardYields: boolean } {
  const card = placeGuidanceCard(input);
  const notices = planNotices(card);
  const onCard = (place: GuidanceBox | null, boxes: readonly GuidanceBox[]) => !!place && boxes.some((notice) => crosses(place, notice, 0));
  if (!onCard(card, notices)) {
    return { plan: planGuidance({ ...input, never: [...input.never, ...notices] }, card), notices, cardFirst: true, cardYields: false };
  }
  const plain = planNotices(null);
  const withNotices = { ...input, never: [...input.never, ...plain] };
  const around = placeGuidanceCard(withNotices);
  if (around) return { plan: planGuidance(withNotices, around), notices: plain, cardFirst: false, cardYields: false };
  // neither order keeps the card off the centre notices (the smallest landscapes): the card keeps its place and gives way
  // while a detection or an alert shows (battleHudLayout hides it under them), the toasts kept off both
  return { plan: planGuidance({ ...input, never: [...input.never, ...notices] }, card), notices, cardFirst: true, cardYields: true };
}

/**
 * The card's natural size for this pass: as measured while it shows; the last measured while its overlay is open but
 * the card measures nothing (a step's swap, a pause's hide and show); none once the overlay has closed. A pass that took
 * the card as gone while it was open planned the toasts into the card's row, and the next pass put the card back on them
 * (the browser check at 1440 x 900, 36bb485fd0).
 */
export function heldCardSize(last: GuidanceSize | null, open: boolean, measured: GuidanceSize | null): GuidanceSize | null {
  if (!open) return null;
  return measured && measured.w > 0 && measured.h > 0 ? measured : last;
}

/** True when two guidance places (or a place and any box) overlap (receipts). */
export function guidanceOverlaps(a: GuidanceBox, b: GuidanceBox): boolean {
  return crosses(a, b, 0);
}
