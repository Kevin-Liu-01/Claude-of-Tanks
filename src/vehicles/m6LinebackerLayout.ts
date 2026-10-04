// Kevin B. Liu — original upgraded Linebacker concept, not a historical replica.
// Shared firing/armor datums. Metres, +Z forward; launcher mouths are gun-local.
export const LINEBACKER_RING: [number, number, number] = [.04, 1.895, -.36];
export const LINEBACKER_GUN: [number, number, number] = [0, .48, .90];
export const LINEBACKER_MUZZLE = 2.36;
// The forward/upward cradle keeps the rear corner above the roof throughout
// the complete 45-degree elevation arc, including a turret turned aft.
const POD_SCALE = .70;
export const LINEBACKER_LAUNCHER = Object.freeze({x: -1.62, y: .48,
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
