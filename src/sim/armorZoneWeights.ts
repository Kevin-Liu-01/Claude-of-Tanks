// The armour zones' numbers (262): the scoped paint (vehicles/materials.ts, in the boot materials chunk) and the score
// (sim/armorZones.ts, lazy) read the same weights from here, so the boot chunk carries these numbers and none of the
// zone code.

/** Metres of score a metre outside a plate's outline costs (nearestPlate's 0.75). */
export const ZONE_OUTSIDE_WEIGHT = 0.75;
/** Metres of score a plate turned fully away costs, per unit of 1 - n·m (nearestPlate's 1.25). */
export const ZONE_FACING_WEIGHT = 1.25;
/** A plate facing a point's surface less than this (n·m) never takes it (nearestPlate's 0.12). */
export const ZONE_FACING_MIN = 0.12;
/** A surface whose outward normal's z (frame-local) is above this is forward: over a mantlet's footprint, the mantlet's. */
export const MANTLET_FORWARD_NZ = 0.2;
