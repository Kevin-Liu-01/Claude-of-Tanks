// One hull-side line for both PL-01s (Kevin 2026-11-24: "make the sideskirts of the pl01s align with the upper glacis
// and hull"). The print's deck is one surface from the centreline out to |x| 1.70 at every station, stern included, and
// the skirt crest falls away from it. The loft deck, the upper glacis, the skirt tops, the bow bridge, the stern wings
// (profiles/poland.ts) and the pl01_105 escort kit's glacis cut (escortFieldKitLayout.ts) all read this profile and
// this side plane. A leaf with no imports, so the layout and armour modules can read it without the builder.
export const PL01_HULL_SIDE_X = 1.616;
// [z, y] knots, stern to nose; the last three are the driver's deck, the glacis fold and the glacis nose.
export const PL01_DRIVER_DECK = [0.50, 2.02] as const;
export const PL01_GLACIS_FOLD = [1.30, 1.975] as const;
export const PL01_GLACIS_NOSE = [3.425, 1.46] as const;
export const PL01_DECK_LINE: readonly (readonly [z: number, y: number])[] = [
  [-3.505, 2.095], [-3.35, 2.095], [-1.50, 2.065], [-0.45, 2.04], PL01_DRIVER_DECK, PL01_GLACIS_FOLD, PL01_GLACIS_NOSE,
];
export function pl01DeckY(z: number): number {
  const line = PL01_DECK_LINE;
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z1, y1] = line[i];
    if (z <= z1) {
      const [z0, y0] = line[i - 1];
      return y0 + (y1 - y0) * ((z - z0) / (z1 - z0));
    }
  }
  return line[line.length - 1][1];
}
