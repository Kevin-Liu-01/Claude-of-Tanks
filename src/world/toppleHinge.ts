// src/world/toppleHinge.ts — where a toppling shaft or frame breaks over its foot (lane B, 2026-10-16, for 227): one
// rule for the mask's topple (fx/structureStages.ts structureTopple) and the set pieces' lying frames (landmarks/damage.ts
// collapseLandmark), so the frame the mask lays down and the frame the collapse lays agree.
//
// A shaft (a stack, a minaret) goes over above its stump: the hinge at 1.5 m, a fifth of a short one. An open frame (a
// headframe, a guyed mast, a trestle tower, a mill on its trestle) buckles where a struck frame of members gives, its lower
// bays standing: the hinge at LATTICE_STAND_SHARE of its height (the anti-raft floor, 25 % of the intact's height, with
// margin; regional latticeFall.ts stands its kit frames' bays to the same share).

/** A shaft's hinge over its foot (m), the most. */
export const TOPPLE_HINGE_M = 1.5;
/** The share of an open frame's height its standing bays reach. */
const LATTICE_HINGE_SHARE = 0.5;

/** The hinge (m over the foot) of a toppling structure `heightM` tall: an open frame's (`lattice`) or a shaft's. */
export function toppleHingeM(heightM: number, lattice: boolean): number {
  return lattice ? heightM * LATTICE_HINGE_SHARE : Math.min(TOPPLE_HINGE_M, heightM * 0.2);
}
