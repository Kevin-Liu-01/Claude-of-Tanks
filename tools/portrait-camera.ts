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
  // Release 267: the T-80UK command fit's tall mast stood 112.0 card px against the 111.8 px full-height envelope
  // (1.27 x 88) at the default 0.56; a more side-on view widens the dense core it scales to.
  if (id === 't80uk') return 0.70;
  // Release 269: the M113A1 FSV's whips over its short Saladin-turreted hull stood 115.3 card px against the 111.8 px
  // full-height envelope at the default 0.56, and the MRV's the same once the field load left it (106.6 x 115.3); the
  // X1's side-on view (a small chassis under tall whips) widens their cores.
  // (the US M113A3 on the same hull and whips: 106.9 x 113.9 at the default)
  if (id === 'm113a1_fsv' || id === 'm113a1_mrv' || id === 'm113a3') return 1.10;
  // The M163 VADS's whip over its Vulcan turret stood 112.0 card px at the default 0.56 and 116.1 at the M113s' 1.10
  // (the side-on view narrows its dense core); a touch more frontal than the default brings it inside.
  if (id === 'm163_vads') return 0.48;
  return 0.56;
}
