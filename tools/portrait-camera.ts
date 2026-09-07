// Presentation-only azimuth. Sparse tall fittings must remain visible without
// reducing the shared dense-core scale or relaxing the card pixel envelope.
// A more side-on angle exposes enough chassis width for these tall portraits.
export function portraitSideRatio(id: string): number {
  if (id === 'kf51_x' || id === 't72b3_x' || id === 'strv122_x') return -0.76;
  return -0.56;
}
