// Presentation-only azimuth of the angle portrait, derived from the card (268): every tank is drawn at the fleet's
// standard azimuth unless its card leaves the fleet envelope there (sparse tall fittings over a small chassis, a long
// gun), and then at the first azimuth of a fixed ladder whose card fits, turning side-on before head-on.
// tools/icons-page.html measures each candidate with the shared portrait audit, which also refuses a card that cuts the
// tank at its edge, so the dense-core scale and the pixel gates never change, and a new or rebuilt tank needs no hand
// row (they were Barak, Lynx, KF51, T-72B3, Strv 122, Sho't Kal, the X1s, the T-80UK and the Challenger 3's camera
// cushion, through 267).
// Round 31 (owner 2026-09-20: "make the tank images in the bottom carousel face left (rn they face right)"): the
// camera crossed to the hull's other flank, so every azimuth is positive and the bow points left on the cards.
export const PORTRAIT_SIDE_RATIO = 0.56;
const STEP = 0.02;
const MIN_RATIO = 0.3;
const MAX_RATIO = 1.3;
const round = (ratio: number) => Math.round(ratio * 100) / 100;

/** The azimuths an angle portrait tries, in order: the standard first, then side-on step by step (a side-on view widens
 * the dense core that tall fittings are scaled against and keeps the hull's length), and head-on only when no side-on
 * view fits: a head-on turn fits only by foreshortening the hull (268's blind A/B judged x1a2_carcara at 0.48 near the
 * head-on limit and weaker than its old side-on card). */
export function portraitSideRatios(): number[] {
  const ratios = [PORTRAIT_SIDE_RATIO];
  for (let k = 1; round(PORTRAIT_SIDE_RATIO + k * STEP) <= MAX_RATIO; k++) ratios.push(round(PORTRAIT_SIDE_RATIO + k * STEP));
  for (let k = 1; round(PORTRAIT_SIDE_RATIO - k * STEP) >= MIN_RATIO; k++) ratios.push(round(PORTRAIT_SIDE_RATIO - k * STEP));
  return ratios;
}
