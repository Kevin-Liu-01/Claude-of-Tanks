// Presentation-only azimuth. Sparse tall fittings must remain visible without
// reducing the shared dense-core scale or relaxing the card pixel envelope.
// A more side-on angle exposes enough chassis width for these tall portraits.
// Round 31 (owner 2026-09-20: "make the tank images in the bottom carousel face left (rn they face right)"): the
// camera crossed to the hull's other flank — every ratio flipped sign — so the bow points left on the cards.
export function portraitSideRatio(id: string): number {
  // Retain Barak's complete aerials; a 5.7-degree wider side view fits both cards.
  if (id === 'merkava4_barak') return 0.70;
  if (id === 'kf41_lynx') return 0.86;
  // Mirrored, the KF51's full silhouette measured 123.8 card px against the 123.2 px envelope (0.88 × 140):
  // a touch more frontal shortens its projected barrel without dropping below the dense-core fill.
  if (id === 'kf51_panther') return 0.72;
  if (id === 't72b3' || id === 'strv122') return 0.76;
  // Release 262: the Sho't Kal's tall IDF whips (2.9 and 2.6 m) stood 115.0 card px against the 111.8 px height
  // envelope; a more side-on view widens the dense core and brings the whips inside it.
  if (id === 'shot_kal') return 0.74;
  // The Bernardini light tanks' whips stand over a small chassis: the mirrored X1 measured 119.7 and the X1A2 112.1
  // card px against the 111.8 px full-height envelope (1.27 x 88), so a more side-on view widens the dense core they
  // scale to (brazil-line-266; the X1 still measured 113.7 x 112.0 at the Lynx's 0.86).
  if (id === 'x1_pioneiro') return 1.10;
  if (id === 'x1a2_carcara') return 0.70;
  return 0.56;
}
