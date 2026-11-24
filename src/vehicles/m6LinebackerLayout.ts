// Owner 2026-10-04: shrink the complete turret about its existing bearing.
// The constants below remain the native authoring frame; specs and geometry
// each apply this factor once, including all four launcher mouths.
export const LINEBACKER_TURRET_SCALE = .90;
// Kevin B. Liu — original upgraded Linebacker concept, not a historical replica.
// Shared firing/armor datums. Metres, +Z forward; launcher mouths are gun-local.
// 268 (the owner's Bradley source, coordinator 2026-11-02): the ring on the shared hull's measured datum, the deck 2.06,
// 0.14 m right of the centreline, z -0.40 (was [.04, 1.895, -.36]).
export const LINEBACKER_RING: [number, number, number] = [-.14, 2.06, -.40];
export const LINEBACKER_GUN: [number, number, number] = [0, .48, .90];
/**
 * 276 (Kevin 2026-11-23: "make the m6 linebackers gun a minigun so its an evolution from the m163"): the 25 mm GAU-12/U
 * Equalizer, the Vulcan family's five-barrel successor (the LAV-AD carried it with Stingers), in place of the M242 chain
 * gun (gun-local, native frame; the builder and the spec both scale it by LINEBACKER_TURRET_SCALE once). Built: five
 * barrels on a 124 mm circle, 40 mm across at the muzzle and 48 at the breech round a 25 mm bore; their breeches inside
 * the receiver's stepped sleeve (its mouth 0.196 m across), the rotor's front ring just ahead of the sleeve, a mid clamp
 * and a muzzle clamp 0.12 m short of the tips, the spindle on the centre line. 1.45 m of barrel shows past the sleeve (the
 * M242's 2.12 m tube was 1.82 m), the cluster 0.17 m across at its clamps. Radii here are native: x 0.9 when built.
 */
export const LINEBACKER_ROTARY = Object.freeze({
  barrels: 5, pitchR: .0689, barrelR: .0222, barrelRearR: .0267, barrelRearZ: .44, barrelTipZ: 2.06,
  boreR: .0125 / LINEBACKER_TURRET_SCALE, boreDepth: .05,
  /** the rotor's front ring, just ahead of the sleeve's mouth (z .54, its lip r .119) */
  collarR: .108, collarZ: [.545, .62] as const,
  midClampR: .1, midClampZ: [1.05, 1.11] as const,
  muzzleClampR: .097, muzzleClampZ: [1.86, 1.94] as const,
  /** the spindle from the muzzle clamp to the mouth, and the centre tie from inside the sleeve to the muzzle clamp */
  hubR: .0211, tieR: .014, tieZ0: .40,
});
/** The fire axis's mouth: the spindle's face on the cluster's centre line, 5 mm behind the barrels' tips (native). */
export const LINEBACKER_MUZZLE = LINEBACKER_ROTARY.barrelTipZ - .005;
/** The spindle's opening the fleet draws at the mouth (tankFactoryCore.ts P.muzzleMouth), built metres. */
export const LINEBACKER_MUZZLE_MOUTH = Object.freeze({outerRadiusM: .015, innerRadiusM: .0075});
// The forward/upward cradle keeps the rear corner above the roof throughout
// the complete 45-degree elevation arc, including a turret turned aft.
const POD_SCALE = .70;
// 268: the pod rides the turret's LEFT, +X, where the source Bradley carries its TOW launcher (it stood on -X, the
// vehicle's right); everything else about it is the owner's concept, unchanged.
export const LINEBACKER_LAUNCHER = Object.freeze({x: 1.62, y: .48,
  rear: .45-.87*POD_SCALE, front: .45+.87*POD_SCALE,
  scale: POD_SCALE, halfWidth: .345*POD_SCALE,
  spacing: .29*POD_SCALE, radius: .115*POD_SCALE});
export const LINEBACKER_MOUTHS = [-1, 1].flatMap(row => [-1, 1].map(column => ({
  x: LINEBACKER_LAUNCHER.x + column * LINEBACKER_LAUNCHER.spacing / 2,
  y: LINEBACKER_LAUNCHER.y + row * LINEBACKER_LAUNCHER.spacing / 2,
  z: LINEBACKER_LAUNCHER.front,
})));
// The front return rises with the Bradley's glacis, rather than extending a
// rectangular cage into its approach angle. Both armor and visible stock use it.
export const LINEBACKER_SKIRT_STATIONS = [
  [-3.00, 1.02, 1.65], [-2.70, .92, 1.76], [1.74, .92, 1.76], [2.65, 1.20, 1.40],
] as const;
export const LINEBACKER_SKIRT_INNER = 1.73;
export const LINEBACKER_SKIRT_OUTER = 1.94;
