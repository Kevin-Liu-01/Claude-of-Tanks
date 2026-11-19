// The reticle's penetration bands (274), a leaf the HUD's ring can import without the armour solver: the reticle
// (game/aimController.ts), the ring (ui/hud.ts penColor), the range cards (sim/provingGround.ts provingOutcome) and the
// scoped armour paint (game/armorAimOverlay.ts) all band a ratio from sim/aimPenetration.ts here.

/** The bands of the average round's penetration over the effective armour along its path: at or above `pen` it goes
 * through (green), from `marginal` it may (amber), below it does not (red). */
export const PEN_RATIO = Object.freeze({ pen: 1.15, marginal: 0.85 });

export type PenVerdict = 'pen' | 'marginal' | 'nopen';

/** A ratio's verdict; null where there is none (no armour along the line). */
export function penVerdict(ratio: number | null | undefined): PenVerdict | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return ratio >= PEN_RATIO.pen ? 'pen' : ratio >= PEN_RATIO.marginal ? 'marginal' : 'nopen';
}
