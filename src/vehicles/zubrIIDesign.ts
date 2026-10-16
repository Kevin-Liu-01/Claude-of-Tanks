// The Zubr II: a separate, heavier Polish package than the compact Zubr, on the same T-72B3M (2016) turret.
// Data-only metadata keeps geometry out of the spec registry's loading path.
export const ZUBR_II_DESIGN = {
  y: 1.390,
  // Owner 2026-10-15 (VEH-22): the T-72B3M (2016) turret on the T-72B3 hull (nationalDonorTurrets.ts); turret datums
  // are the donor's in its own frame: roof crown .82, the remote station on the commander's cupola.
  roofY: .82,
  rws: [-.627, .808, -.359],
  cupola: [-.627, .808, -.359],
  heightM:3.285,
  width:4.327,
  hullLength:6.94035,
  description: 'Polish T-72B3 Zubr II heavy modernization concept retaining the native T-72 hull and running gear beneath the T-72B3M (2016) turret. Long squared armour cabinets close each turret flank round its stowage boxes: flat walls with clipped rear shoulders, a welded floor and a bolted lid carried on roof-shoulder brackets, faced by three stepped courses of large ERAWA cassettes, with square driving lamps on their fronts. A 30 mm drum-fed remote cannon stands on the commander\'s cupola beside a monocle sensor, an independent guarded sight and a split-panel roof sensor; a long open bustle basket with slatted sides carries strapped loads, guarded rear lights and the whips. Thick segmented skirts with four ERAWA courses fold around both track ends and meet the native curved fenders through continuous fitted shoulders; guarded lamps, engine service fittings, rear communications equipment and the woodland field suit with leaves remain physically seated.'
} as const;
