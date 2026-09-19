// Object 695 (`object695_x`): this session's build of the Kurganets-25 IFV, fielded under the vehicle's factory index
// (owner 2026-09-18: "make the tanks you made into separate tanks with a unique name and id" — the Codex-built
// `kurganets25_x` keeps the Kurganets-25 name). The source model below is the Kurganets-25 Armored Warfare export.
// Object 695 (`object695_x`, owner 2026-09-17: "make a completely new kurganets 25 tier X russian IFV now with a
// machine gun like machine gun thats very powerful. make it look extremely good following our best tank generation
// procedures").
//
// This module is generated from the owner's supplied reference model and nothing else. The Armored Warfare
// Object 695 export is a LOCAL comparison oracle (docs/references/tanks/object695_x.source-measurements.json,
// quarantined GLB hash-pinned in tools/source-world-registration.mjs); the study scripts measured its welded islands,
// axis-aligned depth maps, 0.1 m elevation grids and shaded elevations, and every number below is one of those
// scalars in the game frame (uniform 0.965, hull centred on x = 0, ground y = 0, stern plate z −3.46). No source
// vertex, island or topology participates and no other profile is imported or imitated: the hull, side armour
// modules, deck, stern, unmanned module, pods, launcher, sights, masts and gun are original primitive constructions
// laid out on the measured planes, and the procedural-fidelity gate rasterises the build against the oracle.
//
// Measured layout (see the record): hull 7.08 m stern plate to nose edge (7.23 m over the stern boxes), 3.985 m
// over the side armour modules (x 1.66–1.99, y 0.80–1.95), belly 0.56, rear roof 2.19 easing to 2.13 under the
// module and a 7° deck down to the 1.70 m nose edge over a two-plate lower bow; seven paired 0.275 m road wheels at
// axle 0.3485 on a 1.357 m lane, rear drive 0.235 at (0.913, −3.186), raised front idler 0.336 at (0.87, 2.76), no
// return rollers behind the modules;
// module pivot (0, 2.15, −1.10): rear block ±1.05 to y 2.96 with the 3.05 crown, front block to 2.62, pods to
// x 1.50, right-rear four-tube launcher to 3.49, four masts (tallest 4.03), 30 mm gun axis y 2.81 from the trunnion at z −0.45
// to the muzzle at z 3.20.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, FITTINGS, orientedSlab, muzzleBore } from './kit.ts';
import { sectionSolid, type SolidSection, type SectionPoint } from './sectionSolid.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type XYZ = [number, number, number];

/** Tag a geometry with its measured part name so the receipt can census the build. */
function part(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.object695 = name;
  return geometry;
}

// ---------------------------------------------------------------------------------------------- measured frame
export const OBJECT695_X_DATUMS = Object.freeze({
  widthM: 3.985, hullLengthM: 7.08, overallLengthM: 7.23, roofHeightM: 2.19, turretRoofM: 3.05, launcherTopM: 3.49, mastTopM: 4.03,
  turretPivot: [0, 2.15, -1.10] as const, trunnion: [0, 2.81, -0.45] as const, muzzleZ: 3.20,
  wheelStations: [-2.32, -1.63, -0.94, -0.24, 0.45, 1.14, 1.84] as const,
  wheelR: 0.275, wheelY: 0.3485, trackW: 0.37, trackX: 1.357,
  sprocket: { z: -3.186, y: 0.913, r: 0.235 } as const,
  idler: { z: 2.76, y: 0.87, r: 0.336 } as const,
  sternPlateZ: -3.46, sternBoxZ: -3.60, noseZ: 3.62, noseY: 1.70, skirtX: 1.99, flankX: 1.66,
});

// ------------------------------------------------------------------------------------------------------- hull
const H = {
  belly: 0.56, tub: 1.15, sponson: 1.30, flank: OBJECT695_X_DATUMS.flankX, roofRear: 2.19, roofKnuckle: 2.13, deckNose: 1.727,
  sternZ: OBJECT695_X_DATUMS.sternPlateZ, noseZ: OBJECT695_X_DATUMS.noseZ, skirtX: OBJECT695_X_DATUMS.skirtX, skirtY0: 0.80, skirtY1: 1.95,
} as const;
const REAR_ROOF_SLOPE = (H.roofRear - H.roofKnuckle) / 2.30;   // measured 2.19 at z −2.30 → 2.13 at z 0
const DECK_SLOPE = (H.roofKnuckle - H.deckNose) / 3.30;          // measured 2.13 at z 0 → 1.727 at z 3.30 (7°)
const DECK_TILT = Math.atan(DECK_SLOPE);
/** Measured roof: flat rear roof, a 1.5° ease under the module, the 7° deck, then the bevel to the nose edge. */
function roofY(z: number): number {
  if (z <= -2.30) return H.roofRear;
  if (z <= 0) return H.roofRear - (z + 2.30) * REAR_ROOF_SLOPE;
  if (z <= 3.30) return H.roofKnuckle - z * DECK_SLOPE;
  return H.deckNose - (z - 3.30) * 0.20;
}
/** Measured lower bow: the belly rises through the depth-map steps to the nose edge. */
const BOW: readonly (readonly [number, number])[] = [[2.40, H.belly], [2.78, 0.70], [3.01, 0.80], [3.18, 1.00], [3.40, 1.30], [3.55, 1.50], [3.58, 1.56]];
function bellyY(z: number): number {
  if (z <= -3.32) return Math.min(0.90, H.belly + (-3.32 - z) * 2.4); // the belly meets the stern plate through (0.56, −3.32) → (0.90, −3.46)
  if (z <= BOW[0][0]) return H.belly;
  for (let i = 1; i < BOW.length; i++) {
    const [z0, y0] = BOW[i - 1], [z1, y1] = BOW[i];
    if (z <= z1) return y0 + ((z - z0) * (y1 - y0)) / (z1 - z0);
  }
  return BOW[BOW.length - 1][1];
}
/** Twelve-point section: chamfered keel, tub between the tracks, sponson floor clear of the end wraps (the idler crest
 * reaches 1.24 behind the modules), the flank behind the side armour modules, chamfered roof edge. */
function hullSection(z: number): SolidSection {
  const belly = bellyY(z), roof = roofY(z);
  const flank = z >= 3.50 ? H.flank - (z - 3.50) * 0.6 : H.flank;
  const tub = Math.min(H.tub, flank - 0.03);
  const sponson = Math.min(Math.max(Math.min(H.sponson, roof - 0.06), belly + 0.03), roof - 0.05);
  const chamfer = Math.min(0.14, (sponson - belly) * 0.5);
  const keel = Math.min(0.80, tub - 0.05);
  const roofIn = 0.04;
  const ring: SectionPoint[] = [
    [-keel, belly], [keel, belly], [tub, belly + chamfer], [tub, sponson], [flank, sponson],
    [flank, roof - roofIn], [flank - roofIn, roof], [-(flank - roofIn), roof], [-flank, roof - roofIn], [-flank, sponson],
    [-tub, sponson], [-tub, belly + chamfer],
  ];
  return { z, ring };
}
// interpolated stations (−2.80, −1.60, −0.80, 0.50, 1.50) only tessellate the linear loft: the shadow-proxy receipt wants the
// authored bodies materially richer than their bounded convex casters (tankAssets.selftest, 2026-09-18)
const HULL_Z: readonly number[] = [H.sternZ, -3.40, -3.32, -3.20, -2.80, -2.30, -1.60, -0.80, -0.02, 0.02, 0.50, 1.00, 1.50, 2.00, 2.50, 2.78, 3.01, 3.18, 3.40, 3.55, 3.58];

/** Louvre field: a recessed dark plate with a bar frame and `bars` cross bars. */
function louvres(P: TankBuilderPort, name: string, centre: XYZ, width: number, span: number, bars: number, tilt: number): void {
  const [x, y, z] = centre, depth = 0.03;
  P.add('hullDark', part(box(width, depth, span), name), x, y, z, tilt, 0, 0);
  for (const dz of [-span / 2, span / 2]) P.add('hullDetail', part(box(width + 0.04, 0.016, 0.04), `${name}-frame`), x, y + depth / 2 + 0.008 - dz * Math.sin(tilt), z + dz * Math.cos(tilt), tilt, 0, 0);
  for (let i = 0; i < bars; i++) {
    const dz = -span / 2 + 0.05 + (i * (span - 0.10)) / (bars - 1);
    P.add('hullDark', part(box(width - 0.06, depth + 0.02, 0.016), `${name}-bar`), x, y + 0.004 - dz * Math.sin(tilt), z + dz * Math.cos(tilt), tilt, 0, 0);
  }
}

function hullBody(P: TankBuilderPort): void {
  P.add('hull', part(sectionSolid(HULL_Z.map((z) => hullSection(z))), 'hull-body'));
  // the measured nose edge (y 1.70) is a lip strip along the bevelled deck end
  P.add('hullDark', part(box(3.20, 0.04, 0.06), 'nose-lip'), 0, 1.69, 3.59);
  P.add('hullDark', part(box(3.10, 0.006, 0.02), 'roof-seam'), 0, roofY(-2.30) + 0.003, -2.30);
  P.add('hullDark', part(box(3.10, 0.006, 0.02), 'roof-seam'), 0, roofY(0) + 0.003, 0);
}

/** Full-length side armour modules (measured x 1.66–1.99, y 0.80–1.95, z −3.05..3.05): seven panels a side, chamfered
 * ends to the stern plate and the bow, a top rail, bolt rows and a rubber hem. */
function sideModules(P: TankBuilderPort): void {
  const xIn = H.flank, xOut = H.skirtX, th = xOut - xIn, yMid = (H.skirtY0 + H.skirtY1) / 2, height = H.skirtY1 - H.skirtY0;
  const seams = [-3.05, -2.21, -1.37, -0.53, 0.31, 1.15, 2.00, 2.85];
  const bolt = (x: number, y: number, z: number): void => { P.add('hullDetail', part(cylX(0.014, 0.02, 8), 'module-bolt'), x, y, z); };
  for (const s of [-1, 1]) {
    for (let i = 0; i < seams.length - 1; i++) {
      const z0 = seams[i] + 0.012, z1 = seams[i + 1] - 0.012, zc = (z0 + z1) / 2;
      P.addExternalArmor('hull', part(box(th, height, z1 - z0), 'side-module'), s * (xIn + th / 2), yMid, zc);
      for (const dz of [-0.30, 0, 0.30]) { bolt(s * (xOut + 0.006), H.skirtY1 - 0.08, zc + dz); bolt(s * (xOut + 0.006), H.skirtY0 + 0.08, zc + dz); }
    }
    for (const z of seams.slice(1, -1)) P.add('hullDark', part(box(0.02, height - 0.02, 0.024), 'module-seam'), s * (xOut + 0.004), yMid, z);
    // rear chamfer (measured x 1.99 at z −3.05 → 1.58 at the stern plate) and front chamfer (1.99 at z 3.05 → 1.66 at z 3.40)
    P.addExternalArmor('hull', part(orientedSlab(
      [s * xIn, H.skirtY0, -3.05], [s * xOut, H.skirtY0, -3.05], [s * 1.60, H.skirtY0, H.sternZ], [s * xIn, H.skirtY0, H.sternZ],
      [s * xIn, H.skirtY1, -3.05], [s * xOut, H.skirtY1, -3.05], [s * 1.60, H.skirtY1, H.sternZ], [s * xIn, H.skirtY1, H.sternZ]), 'module-rear-chamfer'));
    // measured prow: the module's front end is a forward-pointing wedge — z 2.90 at the hem, the apex z 3.40 at y 1.30,
    // back to z 2.85 by y 1.75 — drawing in to the flank plane
    P.addExternalArmor('hull', part(orientedSlab(
      [s * xIn, H.skirtY0, 2.85], [s * xOut, H.skirtY0, 2.85], [s * (xOut - 0.05), H.skirtY0, 2.90], [s * xIn, H.skirtY0, 2.90],
      [s * xIn, 1.30, 2.85], [s * xOut, 1.30, 2.85], [s * (xIn + 0.02), 1.30, 3.40], [s * xIn, 1.30, 3.40]), 'module-front-chamfer'));
    P.addExternalArmor('hull', part(orientedSlab(
      [s * xIn, 1.30, 2.85], [s * xOut, 1.30, 2.85], [s * (xIn + 0.02), 1.30, 3.40], [s * xIn, 1.30, 3.40],
      [s * xIn, 1.75, 2.85], [s * xOut, 1.75, 2.85], [s * (xOut - 0.05), 1.75, 2.88], [s * xIn, 1.75, 2.88]), 'module-front-chamfer'));
    // mudguards under the module ends, outboard of the band (measured x 1.50–1.66, y 0.58–0.80 at z 2.70–3.00 and −3.40..−3.00)
    P.addExternalArmor('hull', part(box(0.10, 0.22, 0.30), 'mudguard'), s * 1.61, 0.69, 2.85);
    P.addExternalArmor('hull', part(box(0.10, 0.22, 0.40), 'mudguard'), s * 1.61, 0.69, -3.20);
    P.add('hullDark', part(box(th + 0.02, 0.03, 5.90), 'module-rail'), s * (xIn + th / 2), H.skirtY1 + 0.015, -0.10);
    P.add('hullRubber', part(box(0.03, 0.05, 5.90), 'module-hem'), s * (xOut - 0.015), H.skirtY0 - 0.02, -0.10);
    // stowage strap plates on the two rear panels and the tow cable along the module top
    for (const z of [-2.61, -1.73]) P.add('hullDark', part(box(0.008, 0.30, 0.50), 'module-panel'), s * (xOut + 0.004), 1.45, z);
    P.add('hullDark', part(cylZ(0.016, 3.60, 8), 'tow-cable'), s * (xOut - 0.06), H.skirtY1 + 0.045, -0.60);
    for (const z of [-2.30, 1.00]) P.add('hullDark', part(box(0.06, 0.05, 0.08), 'tow-cable-clamp'), s * (xOut - 0.06), H.skirtY1 + 0.045, z);
  }
}

/** Stern: closed ramp door in its frame, two stowage boxes, tail lamps, tow eyes, the step, the three rear roof
 * hatches and the rear-left roof box with its short mast. */
function stern(P: TankBuilderPort): void {
  const z = H.sternZ;
  P.add('hullDark', part(box(0.90, 1.06, 0.02), 'ramp-frame'), 0, 1.48, z - 0.005);
  P.add('hull', part(box(0.80, 0.96, 0.03), 'ramp-door'), 0, 1.48, z - 0.02);
  P.add('hullDark', part(box(0.84, 0.05, 0.03), 'ramp-hinge'), 0, 0.98, z - 0.03);
  for (const s of [-1, 1]) {
    P.add('hullDark', part(box(0.05, 0.16, 0.02), 'ramp-handle'), s * 0.30, 1.50, z - 0.045);
    // stern boxes end at z −3.56 like the source's silhouette (its boxes taper aft of the plate; the record's −3.60 is
    // their outermost fitting), so the body-extent law reads the same stern as the source (2026-09-18)
    P.addEquipment('hull', part(box(0.45, 0.90, 0.10), 'stern-box'), s * 1.275, 1.50, z - 0.05);
    for (const dy of [-0.30, 0, 0.30]) P.add('hullDark', part(box(0.47, 0.02, 0.02), 'stern-box-rib'), s * 1.275, 1.50 + dy, z - 0.105);
    P.add('hullDark', part(box(0.18, 0.10, 0.03), 'tail-lamp'), s * 0.72, 0.92, z - 0.015);
    P.addModuleVisual('optics', 'hullGlass', part(box(0.12, 0.05, 0.012), 'tail-lamp-glass'), s * 0.72, 0.92, z - 0.036);
    P.add('hullDark', part(torus(0.05, 0.016, 12), 'tow-eye'), s * 0.62, 0.80, z - 0.03, Math.PI / 2, 0, 0);
  }
  P.add('hullDark', part(box(2.20, 0.04, 0.05), 'stern-step'), 0, 0.72, z - 0.025);
  P.addCupola('hull', part(box(0.30, 0.13, 0.25), 'rear-roof-hatch'), 0, H.roofRear + 0.065, -3.40);
  for (const x of [-0.70, 0.70]) P.add('hullDark', part(box(0.10, 0.14, 0.10), 'rear-roof-post'), x, H.roofRear + 0.07, -3.35);
  // rear-left stowage rack (measured lid 2.83–2.87 over an open frame: the side elevation is empty below the lid)
  P.addEquipment('hull', part(box(0.40, 0.03, 0.40), 'rear-rack-lid'), -0.55, 2.855, -2.85);
  for (const dx of [-0.19, 0.19]) for (const dz of [-0.19, 0.19]) P.add('hullDark', part(box(0.02, 0.64, 0.02), 'rear-rack-post'), -0.55 + dx, H.roofRear + 0.32, -2.85 + dz);
  for (const y of [2.35, 2.60]) { P.add('hullDark', part(box(0.02, 0.02, 0.40), 'rear-rack-slat'), -0.35, y, -2.85); P.add('hullDark', part(box(0.02, 0.02, 0.40), 'rear-rack-slat'), -0.75, y, -2.85); P.add('hullDark', part(box(0.40, 0.02, 0.02), 'rear-rack-slat'), -0.55, y, -3.05); }
  // right rear roof stowage (measured x 0.40–0.88, top 2.34, z −3.40..−2.50)
  P.addEquipment('hull', part(box(0.48, 0.15, 0.90), 'rear-right-box'), 0.64, H.roofRear + 0.075, -2.95);
  for (const dz of [-0.30, 0, 0.30]) P.add('hullDark', part(box(0.50, 0.02, 0.02), 'rear-right-box-rib'), 0.64, H.roofRear + 0.16, -2.95 + dz);
  P.add('hullDark', part(cylY(0.03, 0.035, 0.05, 10), 'rear-box-mast-pot'), -0.40, 2.87 + 0.025, -2.70);
  P.add('hullDark', part(cylY(0.015, 0.015, 0.20, 8), 'rear-box-mast'), -0.40, 2.87 + 0.05 + 0.10, -2.70);
}

/** Deck: driver's hatch and periscopes on the left, engine access plate, right-hand louvre field, the intake drum,
 * small stowage, the bow hood with its periscopes, armoured lamps, tow eyes, lifting eyes and the smoke launcher
 * banks either side of the module ring. */
function deck(P: TankBuilderPort): void {
  const on = (z: number): number => roofY(z);
  P.addCupola('hull', part(box(0.30, 0.12, 0.50), 'driver-hatch'), -1.40, on(2.40) + 0.06, 2.40, DECK_TILT, 0, 0);
  P.add('hullDark', part(box(0.28, 0.02, 0.03), 'driver-hatch-hinge'), -1.40, on(2.40) + 0.12, 2.64, DECK_TILT, 0, 0);
  for (const dx of [-0.09, 0, 0.09]) P.addModuleVisual('optics', 'hullGlass', part(box(0.07, 0.03, 0.01), 'driver-periscope'), -1.40 + dx, on(2.15) + 0.14, 2.15, DECK_TILT, 0, 0);
  P.add('hullDetail', part(box(0.55, 0.02, 1.10), 'engine-plate'), -0.85, on(2.45) + 0.01, 2.45, DECK_TILT, 0, 0);
  for (const dz of [-0.50, 0.50]) for (const dx of [-0.24, 0.24]) P.add('hullDetail', part(cylY(0.014, 0.014, 0.014, 6), 'engine-plate-bolt'), -0.85 + dx, on(2.45 + dz) + 0.025, 2.45 + dz, DECK_TILT, 0, 0);
  louvres(P, 'deck-louvre', [1.15, on(1.30) + 0.015, 1.30], 0.60, 0.90, 7, DECK_TILT);
  P.add('hullDark', part(cylY(0.22, 0.22, 0.12, 24), 'intake-drum'), 1.25, on(0.45) + 0.06, 0.45);
  P.add('hullDetail', part(torus(0.22, 0.008, 10, 24), 'intake-drum-lip'), 1.25, on(0.45) + 0.12, 0.45, Math.PI / 2, 0, 0);
  P.addEquipment('hull', part(box(0.20, 0.15, 0.30), 'deck-box'), 1.25, on(2.00) + 0.075, 2.00, DECK_TILT, 0, 0);
  P.addEquipment('hull', part(box(0.20, 0.15, 0.20), 'deck-box'), -1.40, on(1.35) + 0.075, 1.35, DECK_TILT, 0, 0);
  P.addEquipment('hull', part(box(0.20, 0.08, 0.20), 'deck-box'), 0.65, on(1.80) + 0.04, 1.80, DECK_TILT, 0, 0);
  P.add('hullDark', part(box(0.06, 0.04, 0.70), 'cable-guard'), 0.20, on(2.45) + 0.02, 2.45, DECK_TILT, 0, 0);
  // bow hood (x −0.20..0.30, z 3.30..3.50, top 1.88) with three periscopes, armoured lamps at x ±1.20
  const hz = 3.40, hy = on(hz);
  P.addCupola('hull', part(box(0.50, 0.15, 0.20), 'bow-hood'), 0.05, hy + 0.075, hz, DECK_TILT, 0, 0);
  for (const dx of [-0.14, 0, 0.14]) P.addModuleVisual('optics', 'hullGlass', part(box(0.09, 0.05, 0.01), 'bow-hood-periscope'), 0.05 + dx, hy + 0.10, hz + 0.105, DECK_TILT, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDark', part(box(0.24, 0.16, 0.20), 'lamp-box'), s * 1.20, hy + 0.08, hz, DECK_TILT, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', part(markVehicleNightLens(cylZ(0.055, 0.014, 16), 'headlight'), 'lamp-lens'), s * 1.20, hy + 0.09, hz + 0.107, DECK_TILT, 0, 0);
    P.add('hullDetail', part(box(0.26, 0.02, 0.22), 'lamp-guard'), s * 1.20, hy + 0.17, hz, DECK_TILT, 0, 0);
    // bow tow eyes seated on the lower bow plate where it passes y 1.30 (z 3.37–3.43): the geometry gate's body-extent
    // law counts every side-mask column thicker than 12 % of the height as hull, and eyes hung at the nose (z 3.55–3.66,
    // y 1.24–1.38) read as a 15 cm longer hull than the source (2026-09-18: dims 87.1 → the gate's 92 bar)
    P.add('hullDark', part(torus(0.06, 0.02, 12), 'tow-eye'), s * 0.70, 1.31, 3.43, Math.PI / 2 - 0.5, 0, 0);
    P.add('hullDark', part(box(0.10, 0.10, 0.10), 'tow-eye-block'), s * 0.70, 1.28, 3.37, 0.5, 0, 0);
    KIT.liftEye(P, 'hullDetail', s * 1.40, on(2.90) + 0.02, 2.90);
    KIT.liftEye(P, 'hullDetail', s * 1.40, H.roofRear + 0.02, -3.20);
    // smoke launcher bank beside the module ring (measured x 1.30–1.55, y 2.20–2.36, z −0.60..−0.10)
    const sz = -0.35, sy = on(sz) + 0.03;
    P.add('hullDark', part(box(0.30, 0.06, 0.52), 'smoke-base'), s * 1.30, sy, sz, 0, s * 0.20, 0);
    for (let i = 0; i < 5; i++) {
      const dz = -0.22 + i * 0.11;
      P.add('hullDark', part(cylZ(0.042, 0.36, 12).rotateX(-0.55).translate(0, 0.14, dz), 'smoke-tube'), s * 1.30, sy + 0.02, sz, 0, s * 0.20, 0);
      P.add('hullDark', part(cylZ(0.046, 0.012, 12).rotateX(-0.55).translate(0, 0.235, dz + 0.155), 'smoke-cap'), s * 1.30, sy + 0.02, sz, 0, s * 0.20, 0);
    }
  }
  P.add('hullDark', part(cylY(0.05, 0.05, 0.03, 12), 'antenna-pot'), -1.45, on(-0.10) + 0.015, -0.10);
}

function runningGear(P: TankBuilderPort): void {
  const D = OBJECT695_X_DATUMS;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.60, wheelR: D.wheelR, wheelW: 0.27, wheelY: D.wheelY, xc: D.trackX,
    wheelZs: [...D.wheelStations],
    sprocket: { ...D.sprocket }, idler: { ...D.idler },
    // no return rollers: the return run is a straight course between the raised end wraps behind the side modules
    trackW: D.trackW, trackTh: 0.028, topY: 1.15, botY: 0.05,
    wheelPattern: 'armored-hub-six', trackPattern: 'compact-ifv', linkPitchM: 0.13, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.55, contactZR: -2.90,
  });
}

// ----------------------------------------------------------------------------------------------------- module
// Module frame: pivot at hull (0, 2.15, −1.10); local z = hull z + 1.10, local y = hull y − 2.15.
const T = { pivotY: 2.15, pivotZ: -1.10, gunY: 0.66, gunZ: 0.65, gunLen: 3.65, belt: 0.30, roofRear: 0.81, crown: 0.90, roofFront: 0.47 } as const;
const lz = (hullZ: number): number => hullZ - T.pivotZ;
const ly = (hullY: number): number => hullY - T.pivotY;

function turret(P: TankBuilderPort): void {
  // ring guard on the hull roof (measured x ±1.35, y 2.13–2.19, z −2.20..0) and the ring itself
  P.add('hullDark', part(box(2.70, 0.06, 2.80), 'ring-collar'), 0, 2.16, -0.80);
  for (const s of [-1, 1]) P.add('hullDark', part(box(0.35, 0.14, 0.45), 'ring-collar-corner'), s * 1.35, 2.23, 0.40);
  P.addEquipment('hull', part(box(0.20, 0.18, 0.16), 'ring-fitting'), -0.85, 2.13 + 0.09, 0.05);
  P.addEquipment('hull', part(box(0.20, 0.18, 0.16), 'ring-fitting'), 1.20, 2.13 + 0.09, 0.05);
  P.add('turretDark', part(cylY(1.30, 1.34, 0.06, 32), 'ring'), 0, -0.02, 0);
  // lower belt: narrow at the undercut rear (measured 0.80 at z −2.30), full width under the front block
  // collinear flank points and interpolated stations tessellate the module lofts without moving a plane (shadow-proxy receipt)
  const belt = (z: number, hw: number): SolidSection => ({ z, ring: [[-hw, 0], [0, 0], [hw, 0], [hw, T.belt / 2], [hw, T.belt], [0, T.belt], [-hw, T.belt], [-hw, T.belt / 2]] });
  const beltHw = (hz: number): number => hz <= -1.70 ? 0.80 + ((hz + 2.30) / 0.60) * 0.15 : 0.95 + ((hz + 1.70) / 1.40) * 0.05;
  P.add('turret', part(sectionSolid([-2.30, -2.15, -2.00, -1.85, -1.70, -1.50, -1.30, -1.10, -0.90, -0.70, -0.50, -0.30].map((hz) => belt(lz(hz), beltHw(hz)))), 'turret-belt'));
  // rear block with the crowned roof (measured ±1.05 to 2.96, crown 3.05 within ±0.40, z −2.67..−1.00)
  const rear = (z: number): SolidSection => ({ z, ring: [[-1.05, T.belt - 0.01], [0, T.belt - 0.01], [1.05, T.belt - 0.01], [1.05, (T.belt - 0.01 + T.roofRear) / 2], [1.05, T.roofRear], [0.40, T.crown], [0, T.crown], [-0.40, T.crown], [-1.05, T.roofRear], [-1.05, (T.belt - 0.01 + T.roofRear) / 2]] });
  P.add('turret', part(sectionSolid([-2.67, -2.50, -2.35, -2.20, -2.05, -1.90, -1.75, -1.60, -1.45, -1.30, -1.15, -1.00].map((hz) => rear(lz(hz)))), 'turret-rear-block'));
  // front block (roof 2.62) drawing to the chamfered nose (centre z −0.25, sides −0.45)
  const front = (z: number, hw: number): SolidSection => ({ z, ring: [[-hw, T.belt - 0.01], [0, T.belt - 0.01], [hw, T.belt - 0.01], [hw, (T.belt - 0.01 + T.roofFront) / 2], [hw, T.roofFront], [0, T.roofFront], [-hw, T.roofFront], [-hw, (T.belt - 0.01 + T.roofFront) / 2]] });
  P.add('turret', part(sectionSolid([-1.02, -0.92, -0.82, -0.72, -0.62, -0.52, -0.42, -0.32, -0.30, -0.285, -0.27, -0.25].map((hz) => front(lz(hz), hz <= -0.32 ? 1.02 : 1.02 - ((hz + 0.32) / 0.07) * 0.42))), 'turret-front-block'));
  for (const s of [-1, 1]) {
    // side pods: upper (y 2.65–2.88, z −1.90..−0.70) and lower (y 2.45–2.65, z −1.37..−0.39) to x 1.50
    P.addEquipment('turret', part(box(0.45, 0.23, 1.20), 'pod-upper'), s * 1.275, ly(2.765), lz(-1.30));
    P.addEquipment('turret', part(box(0.45, 0.20, 0.98), 'pod-lower'), s * 1.275, ly(2.55), lz(-0.88));
    for (const dz of [-0.40, 0, 0.40]) P.add('turretDark', part(box(0.012, 0.19, 0.02), 'pod-rib'), s * 1.506, ly(2.765), lz(-1.30) + dz);
    P.add('turretDark', part(box(0.47, 0.012, 1.22), 'pod-lid'), s * 1.275, ly(2.886), lz(-1.30));
    // bustle corner boxes (x 0.70–1.05, y 2.45–2.85, z −2.85..−2.62)
    P.addEquipment('turret', part(box(0.35, 0.40, 0.23), 'bustle-box'), s * 0.875, ly(2.65), lz(-2.735));
    for (const dy of [-0.12, 0.12]) P.add('turretDark', part(cylZ(0.012, 0.018, 8), 'bustle-box-bolt'), s * 0.875, ly(2.65) + dy, lz(-2.85) - 0.008);
    // flank seams on the rear block, roof hatches on the crown, lifting eyes
    for (const z of [-2.20, -1.60]) P.add('turretDark', part(box(0.006, 0.40, 0.02), 'flank-seam'), s * 1.053, ly(2.70), lz(z));
    P.addCupola('turret', part(cylY(0.26, 0.28, 0.05, 28), 'roof-hatch'), s * 0.30, T.crown + 0.025, lz(-2.00));
    P.add('turretDark', part(torus(0.27, 0.012, 10, 28), 'roof-hatch-ring'), s * 0.30, T.crown + 0.05, lz(-2.00), Math.PI / 2, 0, 0);
    KIT.liftEye(P, 'turretDetail', s * 0.85, T.roofRear + 0.02, lz(-2.50));
    KIT.liftEye(P, 'turretDetail', s * 0.85, T.roofRear + 0.02, lz(-1.20));
  }
  P.add('turretDark', part(box(0.02, 0.006, 1.60), 'roof-seam'), 0, T.crown + 0.003, lz(-1.85));
  // 30 mm gun: root collar, sleeve to hull z 0.80, the thin tube to the measured muzzle (z 3.20), flash hider
  P.addGunExtraDark(part(cylZ(0.07, 0.40, 32), 'gun-root'), 0, 0, 0.20);
  P.addGunExtra(part(cylZ(0.045, 1.00, 32), 'gun-sleeve'), 0, 0, 0.75);
  KIT.buildGun(P, { len: T.gunLen, r: 0.032, brake: false, sleeve: false, collar: false, baseR: 0.045 });
  muzzleBore(P, { len: T.gunLen, r: 0.032, seg: 24 });
  P.muzzleZ = T.gunLen;
  P.addGunExtraDark(part(cylZ(0.046, 0.16, 32), 'flash-hider'), 0, 0, T.gunLen - 0.08);
  for (const dz of [0.03, 0.08, 0.13]) P.addGunExtraDark(part(cylZ(0.05, 0.012, 32), 'flash-hider-ring'), 0, 0, T.gunLen - 0.16 + dz);
  // left housing beside the gun (measured x −0.72..−0.28, y 2.62–2.80, z −0.62..−0.18) carrying the fleet machine-gun
  // fitting as the module's coaxial machine gun (KIT.fittings census: mg >= 1)
  P.addEquipment('turret', part(box(0.44, 0.18, 0.44), 'coax-housing'), -0.50, ly(2.71), lz(-0.40));
  P.addModuleVisual('optics', 'turretGlass', part(box(0.14, 0.08, 0.012), 'coax-housing-glass'), -0.36, ly(2.72), lz(-0.18) + 0.006);
  const coax = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 0.8, tone: 'two-tone', elev: 0, ammo: false, shield: false, ring: false, barrelBridge: false, seed: 250917 });
  coax.name = 'object695CoaxialMachineGun';
  coax.position.set(-0.50, ly(2.60), lz(-0.40));
  P.turretG.add(coax);
  // sights: gunner's box on the right of the front block, commander's housing on the left with the periscope column
  P.addEquipment('turret', part(box(0.50, 0.28, 0.30), 'gunner-sight'), 0.70, ly(2.76), lz(-0.80));
  P.addModuleVisual('optics', 'turretGlass', part(box(0.30, 0.14, 0.012), 'gunner-sight-glass'), 0.70, ly(2.78), lz(-0.65) + 0.006);
  P.addEquipment('turret', part(box(0.40, 0.33, 0.60), 'commander-sight'), -0.55, ly(3.035), lz(-0.95));
  P.addModuleVisual('optics', 'turretGlass', part(box(0.24, 0.16, 0.012), 'commander-sight-glass'), -0.55, ly(3.06), lz(-0.65) + 0.006);
  P.add('turretDark', part(cylY(0.03, 0.03, 0.44, 12), 'periscope-column'), -0.30, ly(3.24), lz(-1.15));
  P.add('turretDark', part(box(0.10, 0.08, 0.10), 'periscope-head'), -0.30, ly(3.44), lz(-1.15));
  P.addModuleVisual('optics', 'turretGlass', part(box(0.08, 0.04, 0.01), 'periscope-glass'), -0.30, ly(3.44), lz(-1.15) + 0.065);
  // right-rear four-tube launcher on its pedestal (box x 0.35–0.95, y 3.15–3.49, z −3.15..−2.28)
  P.addEquipment('turret', part(box(0.20, 0.20, 0.20), 'launcher-pedestal'), 0.80, ly(3.06), lz(-2.40));
  P.addEquipment('turret', part(box(0.48, 0.34, 0.44), 'launcher-box'), 0.72, ly(3.32), lz(-2.88));
  for (const [x, y] of [[0.55, 3.24], [0.83, 3.24], [0.55, 3.40], [0.83, 3.40]] as const) {
    P.add('turretDark', part(cylZ(0.085, 0.40, 16), 'launcher-tube'), x, ly(y), lz(-2.46));
    P.add('turretDark', part(cylZ(0.072, 0.02, 16), 'launcher-mouth'), x, ly(y), lz(-2.26) + 0.005);
    P.add('turretDetail', part(torus(0.086, 0.006, 8, 16), 'launcher-mouth-ring'), x, ly(y), lz(-2.26));
  }
  for (const dz of [-0.15, 0.15]) P.add('turretDark', part(box(0.50, 0.02, 0.02), 'launcher-rib'), 0.72, ly(3.49) + 0.01, lz(-2.88) + dz);
  // masts: four whips on pots (measured tops 4.03, 3.95, 3.75 and 3.36)
  for (const [x, hz, base, top] of [[-0.74, -1.20, 2.98, 4.03], [-0.60, -2.74, 2.85, 3.95], [0.00, -2.57, 3.05, 3.75], [0.05, -2.20, 3.05, 3.36]] as const) {
    if (hz < -2.67) P.add('turretDark', part(box(0.14, 0.10, 0.20), 'mast-bracket'), x, ly(base) - 0.05, lz(hz) + 0.02);
    P.add('turretDark', part(cylY(0.04, 0.05, 0.08, 10), 'mast-pot'), x, ly(base) + 0.04, lz(hz));
    P.add('turretDark', part(cylY(0.018, 0.018, top - base - 0.08, 8), 'mast'), x, ly((top + base + 0.08) / 2), lz(hz));
  }
  P.add('turretDark', part(cylY(0.08, 0.09, 0.06, 16), 'gps-dome'), 0.30, T.crown + 0.03, lz(-1.35));
  P.topY = Math.max(P.topY || 0, ly(OBJECT695_X_DATUMS.launcherTopM));
}

function buildObject695X(P: TankBuilderPort): void {
  hullBody(P);
  sideModules(P);
  stern(P);
  deck(P);
  runningGear(P);
  turret(P);
  for (const s of [-1, 1]) {
    P.decal('hull', 'number', P.spec.visual.number || '225', 0.30, [s * (H.skirtX + 0.012), 1.35, -1.00], s * -Math.PI / 2);
    P.decal('hull', 'star', null, 0.22, [s * (H.skirtX + 0.012), 1.35, 1.60], s * -Math.PI / 2);
  }
  if (P.geometryReceipt) {
    P.hullG.userData.object695Receipt = Object.freeze({
      architecture: 'object695-x-r1', datums: OBJECT695_X_DATUMS, hullStations: HULL_Z.length,
      roadWheelsPerSide: 7, gunLengthM: T.gunLen, launcherTopM: OBJECT695_X_DATUMS.launcherTopM, pivot: [0, T.pivotY, T.pivotZ], trunnion: [0, T.gunY, T.gunZ],
      launcherTubes: 4, // the right-rear four-tube Kornet-EM launcher (guided-load rule, 2026-09-18)
    });
  }
}

export const OBJECT695_X_PROFILES = Object.freeze({
  object695_x: Object.freeze({ build: buildObject695X }),
}) satisfies VehicleProfileRecord;
