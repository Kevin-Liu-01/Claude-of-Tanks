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
  // Release 227 (owner 2026-10-16): its own Krata-2 frontal package (profiles/polandFrontEra.ts) and a 12.7 mm WKM-B
  // armoured emplacement in place of the 30 mm drum cannon.
  description: 'Polish T-72B3 Zubr II heavy modernization concept retaining the native T-72B3 hull and running gear beneath the T-72B3M (2016) turret. Raked welded cheek boxes faced by a stepped terrace of two-layer ERAWA-2 cassettes funnel into the mantlet, with four two-layer roof tiles in two columns stepped back behind the lids of the boxes, ahead of the cupolas; long squared armour cabinets close each turret flank round its stowage boxes behind three stepped courses of the same cassettes, with square driving lamps on their fronts. The glacis rises in three stepped terraces of cassettes between two armoured LED cluster housings, framed cassette fields cover the lower front plate and fitted grids the front skirts. A 12.7 mm WKM-B in a closed armoured casemate (side plates, roof and floor round the receiver behind a raked three-piece front plate) with a sensor head and a boresighted searchlight that follows the weapon, aimed and fired by its remote station, stands on the commander\'s cupola beside a monocle sensor, an independent guarded sight and a split-panel roof sensor; a long open bustle basket with slatted sides carries strapped loads, guarded rear lights and the whips. Thick segmented skirts with four ERAWA courses fold around both track ends and meet the native curved fenders through continuous fitted shoulders; rear lamps, engine service fittings, rear communications equipment and the woodland field suit with leaves remain physically seated.'
} as const;
