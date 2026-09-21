// Presentation-only azimuth. Sparse tall fittings must remain visible without
// reducing the shared dense-core scale or relaxing the card pixel envelope.
// A more side-on angle exposes enough chassis width for these tall portraits.
// Round 31 (owner 2026-09-20: "make the tank images in the bottom carousel face left (rn they face right)"): the
// camera crossed to the hull's other flank — every ratio flipped sign — so the bow points left on the cards.
export function portraitSideRatio(id: string): number {
  // Retain Barak's complete aerials; a 5.7-degree wider side view fits both cards.
  if (id === 'merkava4_barak') return 0.70;
  if (id === 'kf41_lynx_x') return 0.86;
  // Mirrored, the KF51's full silhouette measured 123.8 card px against the 123.2 px envelope (0.88 × 140):
  // a touch more frontal shortens its projected barrel without dropping below the dense-core fill.
  if (id === 'kf51_x') return 0.72;
  if (id === 't72b3_x' || id === 'strv122_x') return 0.76;
  return 0.56;
}
