// The Strv 103 family's datum frame (274, the Leclerc rebuild pattern: one frame every subsystem reads): the marks, their
// per-mark frames, the measured casemate stations, the glacis plane and the fixed guns.
// Frame: the measured A hull (published 7.04 hull, 8.99 overall, 3.60 bare width, 2.14 to the cupola), nose +z.
// First-party: Kevin B. Liu (NOTICE.md).

export type Strv103Mark = 'a' | 'b' | 'e' | 'p' | 'x';

/** Per-mark frame: the bore height, the gun housing, the tail plane (the 152's autoloader bustle lengthens it). */
/** tailZ: the hull's rear terminus; plateZ: the casemate's own tail plate (the rear boxes or the 152's bustle behind it). */
interface MarkFrame { axisY: number; housingTop: number; housingHalfW: readonly [number, number]; tailZ: number; plateZ: number; tubeR: number }
export const FRAMES: Record<Strv103Mark, MarkFrame> = {
  // the rear boxes stand inside the published 7.04 m hull (they are in the real tank's photographs and in the reference
  // print): the plate moves forward to -3.04 and the boxes fill to the published -3.52
  a: { axisY: 1.59, housingTop: 1.745, housingHalfW: [0.18, 0.15], tailZ: -3.52, plateZ: -3.04, tubeR: 0.098 },
  b: { axisY: 1.59, housingTop: 1.745, housingHalfW: [0.18, 0.15], tailZ: -3.52, plateZ: -3.04, tubeR: 0.098 },
  e: { axisY: 1.59, housingTop: 1.745, housingHalfW: [0.18, 0.15], tailZ: -3.52, plateZ: -3.04, tubeR: 0.110 },
  p: { axisY: 1.59, housingTop: 1.745, housingHalfW: [0.18, 0.15], tailZ: -3.52, plateZ: -3.52, tubeR: 0.098 },
  // the 152 mm sits 11 cm higher in a wider, taller housing; its autoloader bustle ends the hull 0.60 m further back
  x: { axisY: 1.70, housingTop: 1.93, housingHalfW: [0.34, 0.28], tailZ: -4.12, plateZ: -3.52, tubeR: 0.165 },
};

/** A casemate station, tail to beak: the tub's belly y, the deck y, the upper body's half-width at its side. */
export interface CasemateStation { readonly z: number; readonly belly: number; readonly deck: number; readonly halfW: number }

/** The measured casemate (print z-profile on the published frame; glacis plane 1.845@z0.62 -> 1.47@z2.98). */
export const CASEMATE: readonly CasemateStation[] = [
  { z: -3.52, belly: 1.22, deck: 1.77, halfW: 1.44 },     // tail plate
  { z: -3.18, belly: 1.10, deck: 1.84, halfW: 1.52 },     // tail fall
  { z: -2.62, belly: 0.78, deck: 1.90, halfW: 1.64 },     // rear deck rise
  { z: -2.02, belly: 0.42, deck: 1.88, halfW: 1.68 },     // deck run to the rear bay
  { z: -0.60, belly: 0.40, deck: 1.88, halfW: 1.68 },     // mid deck
  { z: 0.62, belly: 0.40, deck: 1.85, halfW: 1.68 },      // glacis break
  { z: 1.55, belly: 0.40, deck: 1.70, halfW: 1.67 },      // glacis mid under the tube
  { z: 2.36, belly: 0.64, deck: 1.57, halfW: 1.65 },      // nose run
  { z: 2.98, belly: 0.88, deck: 1.47, halfW: 1.60 },      // beak root over the sprockets
  { z: 3.52, belly: 1.26, deck: 1.475, halfW: 1.46 },     // beak lip
];
/** A mark's casemate stations: the measured table, its rear (behind the deck run at -2.02) compressed onto the mark's own
 * tail plate. */
export function casemateFor(mark: Strv103Mark): readonly CasemateStation[] {
  const plate = FRAMES[mark].plateZ, k = (plate + 2.02) / (-3.52 + 2.02);
  if (Math.abs(k - 1) < 1e-9) return CASEMATE;
  return CASEMATE.map((st) => (st.z < -2.02 ? { ...st, z: -2.02 + (st.z + 2.02) * k } : st));
}
export const SEAM = 1.38;                                          // the shoe-clearance seam the two lofts meet at
/** The glacis surface over the tube's flanks, and its pitch. */
export const glacisY = (z: number): number => 1.845 - (z - 0.62) * 0.1585;
export const GLACIS_PITCH = Math.atan(0.1585);

export interface GunRun { muzzleZ: number; tube: readonly { z0: number; z1: number; r: number; r2?: number; dark?: boolean }[] }
export const GUNS: Record<Strv103Mark, GunRun> = {
  // 105 mm kan Strv 103 L74 (L/62): the muzzle at the published 8.99 overall
  a: { muzzleZ: 5.47, tube: [
    { z0: 5.47, z1: 5.32, r: 0.105 }, { z0: 5.32, z1: 3.55, r: 0.090 },
    { z0: 3.55, z1: 2.30, r: 0.098 }, { z0: 2.30, z1: 1.10, r: 0.106, r2: 0.125 }] },
  b: { muzzleZ: 5.47, tube: [
    { z0: 5.47, z1: 5.32, r: 0.105 }, { z0: 5.32, z1: 3.55, r: 0.090 },
    { z0: 3.55, z1: 2.30, r: 0.098 }, { z0: 2.30, z1: 1.10, r: 0.106, r2: 0.125 }] },
  // the UDES 03 trials prototype's shorter 105 mm test tube (the published 7.65 overall)
  p: { muzzleZ: 4.13, tube: [
    { z0: 4.13, z1: 3.99, r: 0.102 }, { z0: 3.99, z1: 3.05, r: 0.088 },
    { z0: 3.05, z1: 2.20, r: 0.096 }, { z0: 2.20, z1: 1.10, r: 0.104, r2: 0.122 }] },
  // the Strv 152's 152 mm L/50: the five-baffle muzzle brake, the long tube with its thermal sleeve joints, the heavy
  // chamber run into its housing
  x: { muzzleZ: 6.30, tube: [
    { z0: 6.30, z1: 5.92, r: 0.175 }, { z0: 5.92, z1: 4.90, r: 0.118 },
    { z0: 4.90, z1: 4.85, r: 0.132, dark: true }, { z0: 4.85, z1: 3.80, r: 0.126 },
    { z0: 3.80, z1: 3.75, r: 0.148, dark: true }, { z0: 3.75, z1: 2.95, r: 0.140, r2: 0.152 },
    { z0: 2.95, z1: 1.10, r: 0.158, r2: 0.178 }] },
  // the concept's 120 mm L/55-class tube: the muzzle reference collar, a segmented thermal sleeve (dark joints) and the
  // thicker chamber run into the housing
  e: { muzzleZ: 5.70, tube: [
    { z0: 5.70, z1: 5.58, r: 0.108 }, { z0: 5.58, z1: 4.70, r: 0.092 },
    { z0: 4.70, z1: 4.66, r: 0.106, dark: true }, { z0: 4.66, z1: 3.70, r: 0.102 },
    { z0: 3.70, z1: 3.66, r: 0.112, dark: true }, { z0: 3.66, z1: 2.50, r: 0.100, r2: 0.106 },
    { z0: 2.50, z1: 2.46, r: 0.122, dark: true }, { z0: 2.46, z1: 1.10, r: 0.120, r2: 0.135 }] },
};
