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
export const LINEBACKER_MUZZLE = 2.36;
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
