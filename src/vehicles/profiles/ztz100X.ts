// ZTZ-100 (`ztz100_x`, owner 2026-09-17: "add a new ztz100 tank … use the glb model and our best most up to date
// tank generation procedures based off of models"; "the ztz 100 should NOT be based off of the type 100 at all. it
// needs to be completely separate following completely inspired generation").
//
// This module is generated from the owner's supplied reference model and nothing else. The Sketchfab
// "[OD]ZTZ-20 Test-3" is a LOCAL comparison oracle (docs/references/tanks/ztz100_x.source-measurements.json,
// quarantined GLB hash-pinned in tools/source-world-registration.mjs); the study script measured its welded
// islands, axis-aligned depth maps and shaded elevations, and every number below is one of those scalars in the
// game frame (uniform 0.92, structural hull centred on z = 0, ground y = 0). No source vertex, island or topology
// participates, no other profile is imported or imitated: the hull, skirts, deck, stern, turret, towers, weapon
// station, missile bank and gun are original primitive constructions laid out on the measured planes, and the
// procedural-fidelity gate rasterises the build against the oracle from nine cameras.
//
// Measured layout (see the record): hull 6.94 m stern plate to nose with a 0.70 m slat screen behind it, 3.70 m
// over the skirt planes (aft band 1.765, forward band 1.849, lower band 1.707, hem 0.45), roof 1.41 forward /
// 1.50 over the engine, a 4.6° glacis from z 0.95 to the nose line (y 1.20, z 3.56) over a stepped lower bow;
// seven 0.3135 m road wheels at axle 0.374, 0.311 m drive aft, 0.2035 m idler forward, two 0.1195 m return
// rollers, a 0.515 m track; turret pivot (0, 1.41, −0.55), flanks ±1.50 to y 2.09, roof shelf 2.14, plateau 2.31,
// bustle ±0.91 to z −2.60, housing to z 1.13, trunnion (0, 1.76, 0.55), muzzle z 5.175 behind a multi-baffle
// brake; cylindrical sensor/launcher towers at ±1.25 / z −0.79 rising to 2.54, weapon station at z −0.75 rising to
// 3.03 with a twin-tube cannon, missile bank on the right cheek (x 0.44–0.58, z 0.18–1.34), panoramic sight left.
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
  geometry.userData.ztz100 = name;
  return geometry;
}

// ---------------------------------------------------------------------------------------------- measured frame
export const ZTZ100_X_DATUMS = Object.freeze({
  widthM: 3.70, hullLengthM: 6.94, overallLengthM: 8.98, roofHeightM: 1.41, turretRoofM: 2.31, overallHeightM: 3.04,
  turretPivot: [0, 1.41, -0.55] as const, trunnion: [0, 1.76, 0.55] as const, muzzleZ: 5.175,
  wheelStations: [-2.3375, -1.6015, -0.8655, -0.1295, 0.6065, 1.4345, 2.1705] as const,
  wheelR: 0.3135, wheelY: 0.374, trackW: 0.515, trackX: 1.2485,
  sprocket: { z: -2.961, y: 0.658, r: 0.311 } as const,
  idler: { z: 2.9915, y: 0.7395, r: 0.2035 } as const,
  rollers: [{ z: -0.933, y: 0.8775, r: 0.1195 }, { z: 0.648, y: 0.9045, r: 0.1195 }] as const,
  sternPlateZ: -3.38, sternScreenZ: -4.08, noseZ: 3.56, noseY: 1.20,
});

// ------------------------------------------------------------------------------------------------------- hull
const H = {
  belly: 0.35, tub: 0.96, sponson: 1.08, fender: 1.30, roof: 1.41, deck: 1.50, deckZ: -2.40,
  glacisTopZ: 0.95, noseZ: ZTZ100_X_DATUMS.noseZ, noseY: ZTZ100_X_DATUMS.noseY, sternZ: ZTZ100_X_DATUMS.sternPlateZ,
  skirtAft: 1.765, skirtFwd: 1.849, skirtLow: 1.707, skirtLip: 1.60, skirtStep: 0.82, lipY: 0.62, hem: 0.50, curtain: 0.04,
} as const;
const GLACIS_SLOPE = (H.roof - H.noseY) / (H.noseZ - H.glacisTopZ);
const GLACIS_TILT = Math.atan(GLACIS_SLOPE);
const glacisY = (z: number): number => (z <= H.glacisTopZ ? H.roof : H.roof - (z - H.glacisTopZ) * GLACIS_SLOPE);
/** Measured lower bow: the belly rises through the depth-map steps to the nose line. */
const BOW: readonly (readonly [number, number])[] = [[2.45, H.belly], [2.74, 0.50], [2.91, 0.70], [3.20, 0.80], [3.42, 0.90], [H.noseZ, 1.13]];
const STERN_RAKE_Z = -2.78; // the lower stern plate rakes 45° from the belly here up to y 0.95 at the stern plate
function bellyY(z: number): number {
  if (z <= STERN_RAKE_Z) return Math.min(0.95, H.belly + (STERN_RAKE_Z - z));
  if (z <= BOW[0][0]) return H.belly;
  for (let i = 1; i < BOW.length; i++) {
    const [z0, y0] = BOW[i - 1], [z1, y1] = BOW[i];
    if (z <= z1) return y0 + ((z - z0) * (y1 - y0)) / (z1 - z0);
  }
  return BOW[BOW.length - 1][1];
}
/** Hull flank behind the curtains; the plan draws in toward the nose ahead of z 2.90. */
function flankX(z: number): number {
  const base = (z < -0.40 ? H.skirtAft : H.skirtFwd) - H.curtain - 0.005;
  return z <= 2.90 ? base : base - (z - 2.90) * ((base - 1.30) / (H.noseZ - 2.90));
}

/** Stern taper (measured rear rows): the tub narrows to ±0.76 under a 0.78 sponson floor behind z −2.9, so the tracks
 * stand clear of the hull with daylight between them; the full tub returns by z −2.0. */
function sternTub(z: number): [number, number] {
  // 2026-09-17 (release gate): only the lower TUB narrows behind the sprocket; the sponson floor keeps its
  // datum height so the hull never reaches down into the sprocket wrap (a .78 floor put 56 voxels of hull
  // inside the rear band).
  if (z <= -2.90) return [0.76, H.sponson];
  if (z >= -2.00) return [H.tub, H.sponson];
  const t = (z + 2.90) / 0.90;
  return [0.76 + t * (H.tub - 0.76), H.sponson];
}
/** Twelve-point section: flat belly with chamfered keel edges, tub wall, sponson floor, flank, chamfered roof edge. */
function hullSection(z: number, roofOverride?: number): SolidSection {
  const belly = bellyY(z), roof = roofOverride ?? glacisY(z), flank = flankX(z);
  const [tubMax, sponsonMax] = sternTub(z);
  const tub = Math.min(tubMax, flank - 0.03);
  const sponson = Math.max(Math.min(sponsonMax, roof - 0.045), belly + 0.025);
  const chamfer = Math.min(0.09, Math.max(0.004, (sponson - belly) * 0.28));
  const roofIn = Math.min(0.05, (roof - sponson) * 0.4);
  const ring: SectionPoint[] = [
    [-tub + 0.08, belly], [tub - 0.08, belly], [tub, belly + chamfer], [tub, sponson], [flank, sponson],
    [flank, roof - roofIn], [flank - roofIn, roof], [-(flank - roofIn), roof], [-flank, roof - roofIn], [-flank, sponson],
    [-tub, sponson], [-tub, belly + chamfer],
  ];
  return { z, ring };
}
const HULL_Z: readonly (readonly [number, number | undefined])[] = [
  [H.sternZ, H.deck], [-3.10, H.deck], [-2.90, H.deck], [STERN_RAKE_Z, H.deck], [H.deckZ - 0.02, H.deck], [H.deckZ + 0.02, H.roof], [-2.00, H.roof], [-0.45, H.roof], [-0.35, H.roof],
  [H.glacisTopZ, H.roof], [1.80, undefined], [2.45, undefined], [2.74, undefined], [2.91, undefined], [3.20, undefined], [3.42, undefined], [H.noseZ - 0.01, undefined],
];

/** Louvre field: a recessed dark plate with a bar frame and `bars` cross bars — the reference's deck and stern grilles. */
function louvreField(P: TankBuilderPort, owner: 'hull' | 'turret', name: string, centre: XYZ, width: number, span: number,
  bars: number, face: 'up' | 'aft', depth = 0.035): void {
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark', detail = owner === 'hull' ? 'hullDetail' : 'turretDetail';
  const [x, y, z] = centre;
  if (face === 'up') {
    P.add(dark, part(box(width, depth, span), name), x, y, z);
    for (const dz of [-span / 2, span / 2]) P.add(detail, part(box(width + 0.04, 0.016, 0.04), `${name}-frame`), x, y + depth / 2 + 0.008, z + dz);
    for (let i = 0; i < bars; i++) P.add(dark, part(box(width - 0.06, depth + 0.02, 0.016), `${name}-bar`), x, y + 0.004, z - span / 2 + 0.05 + (i * (span - 0.10)) / (bars - 1));
  } else {
    P.add(dark, part(box(width, span, depth), name), x, y, z);
    for (const dy of [-span / 2, span / 2]) P.add(detail, part(box(width + 0.04, 0.04, 0.016), `${name}-frame`), x, y + dy, z - depth / 2 - 0.008);
    for (let i = 0; i < bars; i++) P.add(dark, part(box(width - 0.06, 0.016, depth + 0.02), `${name}-bar`), x, y - span / 2 + 0.05 + (i * (span - 0.10)) / (bars - 1), z - 0.004);
  }
}

function hullBody(P: TankBuilderPort): void {
  P.add('hull', part(sectionSolid(HULL_Z.map(([z, roof]) => hullSection(z, roof))), 'hull-body'));
  for (const x of [-0.78, 0.78]) P.add('hullDark', part(box(0.02, 0.006, 3.20), 'roof-seam'), x, H.roof + 0.003, -0.70);
  P.add('hullDark', part(box(3.30, 0.006, 0.02), 'deck-seam'), 0, H.deck + 0.003, H.deckZ);
}

/** Two measured skirt bands: upper (aft 1.765 / forward 1.849) from the fender line to y 0.82, lower (1.707) to the hem. */
function skirts(P: TankBuilderPort): void {
  const bolt = (x: number, y: number, z: number): void => { P.add('hullDetail', part(cylX(0.013, 0.02, 8), 'skirt-bolt'), x, y, z); };
  for (const s of [-1, 1]) {
    const upperZ = [-3.90, -3.30, -2.44, -1.58, -0.72, 0.14, 1.00, 1.86, 2.72, 3.20];
    for (let i = 0; i < upperZ.length - 1; i++) {
      const z0 = upperZ[i] + 0.012, z1 = upperZ[i + 1] - 0.012, zc = (z0 + z1) / 2, outer = zc < -0.40 ? H.skirtAft : H.skirtFwd;
      P.addExternalArmor('hull', part(box(H.curtain, H.fender - H.skirtStep, z1 - z0), 'skirt-upper'), s * (outer - H.curtain / 2), (H.fender + H.skirtStep) / 2, zc);
      for (const dz of [-0.30, 0, 0.30]) { bolt(s * (outer + 0.006), H.fender - 0.07, zc + dz); bolt(s * (outer + 0.006), H.skirtStep + 0.07, zc + dz); }
    }
    P.add('hullDark', part(box(H.skirtFwd - H.skirtAft + 0.02, H.fender - H.skirtStep, 0.04), 'skirt-step'), s * ((H.skirtFwd + H.skirtAft) / 2 - 0.02), (H.fender + H.skirtStep) / 2, -0.40);
    // the lower band spans the measured z −2.60..2.80 and its inboard lip (1.60) z −2.20..2.40; the ends stay open
    const lowerZ = [-2.60, -1.70, -0.80, 0.10, 1.00, 1.90, 2.80];
    for (let i = 0; i < lowerZ.length - 1; i++) {
      const z0 = lowerZ[i] + 0.012, z1 = lowerZ[i + 1] - 0.012, zc = (z0 + z1) / 2;
      P.addExternalArmor('hull', part(box(H.curtain, H.skirtStep - H.lipY, z1 - z0), 'skirt-lower'), s * (H.skirtLow - H.curtain / 2), (H.skirtStep + H.lipY) / 2, zc);
      for (const dz of [-0.28, 0.28]) bolt(s * (H.skirtLow + 0.006), H.lipY + 0.06, zc + dz);
    }
    const lipZ = [-2.20, -1.28, -0.36, 0.56, 1.48, 2.40];
    for (let i = 0; i < lipZ.length - 1; i++) {
      const z0 = lipZ[i] + 0.012, z1 = lipZ[i + 1] - 0.012;
      P.addExternalArmor('hull', part(box(H.curtain, H.lipY - H.hem, z1 - z0), 'skirt-lip'), s * (H.skirtLip - H.curtain / 2), (H.lipY + H.hem) / 2, (z0 + z1) / 2);
    }
    P.add('hullDark', part(box(H.skirtAft - H.skirtLow + 0.02, 0.05, 2.90), 'skirt-rail'), s * ((H.skirtAft + H.skirtLow) / 2 - 0.01), H.skirtStep, -1.85);
    P.add('hullDark', part(box(H.skirtFwd - H.skirtLow + 0.02, 0.05, 3.60), 'skirt-rail'), s * ((H.skirtFwd + H.skirtLow) / 2 - 0.01), H.skirtStep, 1.40);
    P.add('hullDark', part(box(H.skirtLow - H.skirtLip + 0.02, 0.04, 4.56), 'skirt-lip-rail'), s * ((H.skirtLow + H.skirtLip) / 2 - 0.01), H.lipY, 0.10);
    P.add('hullRubber', part(box(0.03, 0.06, 4.56), 'skirt-hem'), s * (H.skirtLip - 0.03), H.hem - 0.02, 0.10);
    for (const z of [-1.90, 0.60]) P.add('hullDark', part(box(0.008, 0.16, 0.42), 'skirt-panel'), s * ((z < -0.4 ? H.skirtAft : H.skirtFwd) + 0.004), 1.08, z);
    // forward sponson boxes on the skirt line (measured x 1.592–1.849, y 1.03–1.385, z 1.448–2.358)
    P.addEquipment('hull', part(box(0.26, 0.355, 0.91), 'sponson-box'), s * (H.skirtFwd + 0.006 - 0.13), 1.2075, 1.903);
    for (const dz of [-0.30, 0, 0.30]) P.add('hullDark', part(box(0.012, 0.28, 0.02), 'sponson-box-rib'), s * (H.skirtFwd + 0.012), 1.2075, 1.903 + dz);
    // aft sponson boxes above the aft skirt band (measured x 1.592–1.765, y 1.03–1.50, z −3.25..−1.32)
    for (const [z0, z1] of [[-3.25, -2.34], [-2.32, -1.32]]) {
      P.addEquipment('hull', part(box(0.17, 0.47, z1 - z0), 'sponson-box-aft'), s * (H.skirtAft - 0.085 + 0.004), 1.265, (z0 + z1) / 2);
      for (const dz of [-0.28, 0, 0.28]) P.add('hullDark', part(box(0.012, 0.36, 0.02), 'sponson-box-rib'), s * (H.skirtAft + 0.01), 1.265, (z0 + z1) / 2 + dz);
    }
  }
}

/** Glacis appliqué field, driver's hood, bow lamps, tow hooks and the nose strip. */
function bow(P: TankBuilderPort): void {
  const plate = (xa: number, xb: number, z0: number, z1: number): void => {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), depth = 0.05;
    P.addExternalArmor('hull', part(sectionSolid([
      { z: z0, ring: [[x0, glacisY(z0) - depth], [x1, glacisY(z0) - depth], [x1, glacisY(z0) + 0.03], [x0, glacisY(z0) + 0.03]] },
      { z: z1, ring: [[x0, glacisY(z1) - depth], [x1, glacisY(z1) - depth], [x1, glacisY(z1) + 0.03], [x0, glacisY(z1) + 0.03]] },
    ]), 'glacis-plate'));
    for (const x of [x0 + 0.06, x1 - 0.06]) for (const z of [z0 + 0.06, z1 - 0.06]) {
      P.add('hullDetail', part(cylY(0.012, 0.014, 0.02, 6), 'glacis-plate-bolt'), x, glacisY(z) + 0.04, z, GLACIS_TILT, 0, 0);
    }
  };
  for (let i = 0; i < 4; i++) {
    const x0 = -1.42 + i * 0.71 + 0.02, x1 = x0 + 0.71 - 0.04;
    plate(x0, x1, 1.20, 1.98);
    if (i === 0 || i === 3) plate(x0, x1, 2.10, 2.90);
  }
  for (const s of [-1, 1]) plate(s * 0.06, s * 0.66, 2.10, 2.75);
  const hz = 3.02, hy = glacisY(hz);
  P.addCupola('hull', part(box(0.62, 0.06, 0.34), 'driver-hood'), 0, hy + 0.03, hz, GLACIS_TILT, 0, 0);
  for (const x of [-0.18, 0, 0.18]) P.addModuleVisual('optics', 'hullGlass', part(box(0.12, 0.028, 0.01), 'driver-periscope'), x, hy + 0.062, hz + 0.16, GLACIS_TILT, 0, 0);
  P.add('hullDark', part(box(0.60, 0.016, 0.03), 'driver-hood-hinge'), 0, hy + 0.06, hz - 0.18, GLACIS_TILT, 0, 0);
  for (const s of [-1, 1]) {
    const lz = 3.30, ly = glacisY(lz), lx = 1.15;
    P.add('hullDark', part(cylZ(0.07, 0.10, 14), 'lamp'), s * lx, ly + 0.07, lz, GLACIS_TILT, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', part(markVehicleNightLens(cylZ(0.052, 0.014, 16), 'headlight'), 'lamp-lens'), s * lx, ly + 0.085, lz + 0.055, GLACIS_TILT, 0, 0);
    P.add('hullDetail', part(box(0.22, 0.024, 0.20), 'lamp-guard'), s * lx, ly + 0.17, lz + 0.02, GLACIS_TILT - 0.08, 0, 0);
    for (const dx of [-0.09, 0.09]) P.add('hullDetail', part(cylY(0.011, 0.011, 0.13, 8), 'lamp-guard-post'), s * lx + dx, ly + 0.11, lz + 0.08, GLACIS_TILT, 0, 0);
    P.add('hullDark', part(torus(0.06, 0.02, 12), 'tow-eye'), s * 0.86, 1.00, 3.50, Math.PI / 2 - 0.6, 0, 0);
    P.add('hullDark', part(box(0.10, 0.10, 0.12), 'tow-eye-block'), s * 0.86, 0.98, 3.44, 0.6, 0, 0);
  }
  P.add('hullDark', part(box(0.20, 0.08, 0.08), 'bow-sensor'), 0, 1.10, 3.58, 0.3, 0, 0);
  P.add('hullDark', part(box(2.10, 0.05, 0.05), 'nose-strip'), 0, 0.86, 3.40, 0.55, 0, 0);
  for (let i = 0; i < 8; i++) P.add('hullDetail', part(cylZ(0.016, 0.012, 8), 'nose-strip-bolt'), -0.91 + i * 0.26, 0.86, 3.43, 0.55, 0, 0);
  P.add('hullDark', part(cylY(0.15, 0.15, 0.03, 24), 'roof-vent'), 1.10, H.roof + 0.015, -1.90);
  for (const r of [0.05, 0.10, 0.14]) P.add('hullDark', part(torus(r, 0.005, 20), 'roof-vent-ring'), 1.10, H.roof + 0.03, -1.90, Math.PI / 2, 0, 0);
}

/** Engine deck: twin louvre fields either side of a spine, filler caps, exhaust housing and the slatted deck rack. */
function deck(P: TankBuilderPort): void {
  for (const s of [-1, 1]) louvreField(P, 'hull', 'deck-grille', [s * 0.80, H.deck + 0.018, -2.92], 1.10, 0.84, 8, 'up');
  P.add('hullDetail', part(box(0.16, 0.03, 0.90), 'deck-spine'), 0, H.deck + 0.015, -2.92);
  for (const s of [-1, 1]) P.add('hullDark', part(cylY(0.09, 0.09, 0.03, 16), 'filler-cap'), s * 0.55, H.deck + 0.015, -2.48);
  P.add('hull', part(box(0.40, 0.14, 0.60), 'exhaust-housing'), -1.35, H.deck + 0.07, -2.20);
  for (let i = 0; i < 5; i++) P.add('hullDark', part(box(0.012, 0.09, 0.06), 'exhaust-louvre'), -1.556, H.deck + 0.07, -2.42 + i * 0.11);
  // slatted stowage rack behind the bustle (measured x ±0.959, y 1.78–2.15, z −3.21..−2.96)
  // the rack stands on the deck: a dense bin from 1.52 to 2.15 with slat ribs (measured x ±0.959, z −3.21..−2.96)
  P.addEquipment('hull', part(box(1.90, 0.61, 0.24), 'deck-rack-floor'), 0, 1.835, -3.085);
  for (const s of [-1, 1]) for (const [x, z] of [[0.945, -3.20], [0.945, -2.97], [0.32, -3.20]] as const) {
    P.add('hullDark', part(box(0.03, 0.63, 0.03), 'deck-rack-post'), s * x, 1.835, z);
  }
  for (let i = 0; i < 7; i++) {
    P.add('hullDark', part(box(1.92, 0.014, 0.014), 'deck-rack-slat'), 0, 1.60 + i * 0.085, -3.212);
    for (const s of [-1, 1]) P.add('hullDark', part(box(0.014, 0.014, 0.25), 'deck-rack-slat'), s * 0.959, 1.60 + i * 0.085, -3.085);
  }
  for (const s of [-1, 1]) P.add('hullDark', part(box(0.03, 0.03, 0.18), 'deck-rack-bracket'), s * 0.80, 2.13, -2.90);
}

/** Stern: full-width louvre panel between the tail lamps, shackle plates, tow eyes, mud flap and the slat screen. */
function stern(P: TankBuilderPort): void {
  const z = H.sternZ - 0.03;
  louvreField(P, 'hull', 'stern-grille', [0, 1.02, z], 2.30, 0.56, 7, 'aft');
  for (const s of [-1, 1]) {
    P.add('hullDetail', part(box(0.03, 0.56, 0.05), 'stern-grille-divider'), s * 0.40, 1.02, z - 0.01);
    P.add('hullDark', part(box(0.22, 0.12, 0.06), 'tail-lamp'), s * 1.38, 1.40, z);
    for (const [k, dx] of [-0.07, 0, 0.07].entries()) P.addModuleVisual('optics', 'hullGlass', part(box(0.05, 0.07, 0.012), `tail-lamp-glass-${k}`), s * 1.38 + dx, 1.40, z - 0.035);
    // the recessed lower stern carries no furniture; the tow eyes hang from the plate above the grille
    P.add('hullDark', part(torus(0.07, 0.02, 14), 'tow-eye'), s * 1.20, 1.40, z - 0.06, Math.PI / 2, 0, 0);
  }
  // slat cage (the reference's rear render): eight horizontal bars from y 0.68 to 1.48 wrap the stern 0.70 m behind
  // the stern plate (measured rear extreme z −4.08) and run along both rear flanks at x ±1.80 to z −0.40, on posts
  const cageY0 = 0.68, cageY1 = 1.48, cageBars = 8, cageZ = ZTZ100_X_DATUMS.sternScreenZ + 0.02, cageX = 1.80;
  // the bin body the bars wrap (the reference reads a dense stowage bin, and the top silhouette must be closed)
  P.add('hullDark', part(box(cageX * 2 - 0.04, cageY1 - cageY0 - 0.04, -(cageZ + 0.02) + (H.sternZ - 0.02)), 'cage-bin'),
    0, (cageY0 + cageY1) / 2, (cageZ + 0.02 + H.sternZ - 0.02) / 2);
  for (let i = 0; i < cageBars; i++) {
    const y = cageY0 + (i * (cageY1 - cageY0)) / (cageBars - 1);
    P.add('hullDark', part(cylX(0.012, cageX * 2, 8), 'cage-bar'), 0, y, cageZ);
    for (const s of [-1, 1]) P.add('hullDark', part(cylZ(0.012, cageZ * -1 - 0.40, 8), 'cage-bar'), s * cageX, y, (cageZ - 0.40) / 2);
  }
  for (const s of [-1, 1]) {
    for (const z of [cageZ, -3.50, -2.90, -2.30, -1.70, -1.10, -0.40]) P.add('hullDark', part(box(0.03, cageY1 - cageY0 + 0.04, 0.03), 'cage-post'), s * cageX, (cageY0 + cageY1) / 2, z);
    for (const x of [1.10, 0.40]) P.add('hullDark', part(box(0.03, cageY1 - cageY0 + 0.04, 0.03), 'cage-post'), s * x, (cageY0 + cageY1) / 2, cageZ);
    P.add('hullDark', part(box(0.03, 0.03, cageZ * -1 - 0.40), 'cage-rail'), s * cageX, cageY1 + 0.02, (cageZ - 0.40) / 2);
  }
  P.add('hullDark', part(box(cageX * 2 + 0.03, 0.03, 0.03), 'cage-rail'), 0, cageY1 + 0.02, cageZ);
}

function runningGear(P: TankBuilderPort): void {
  const D = ZTZ100_X_DATUMS;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.70, wheelR: D.wheelR, wheelW: 0.366, wheelY: D.wheelY, xc: D.trackX,
    wheelZs: [...D.wheelStations],
    sprocket: { ...D.sprocket }, idler: { ...D.idler },
    rollerR: D.rollers[0].r, rollers: D.rollers.map((r) => ({ z: r.z, y: r.y })),
    trackW: D.trackW, trackTh: 0.028, topY: 0.96, botY: 0.05,
    wheelPattern: 'armored-hub-six', trackPattern: 'nato-double-pin', linkPitchM: 0.177, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.45, contactZR: -2.62,
  });
}

// ----------------------------------------------------------------------------------------------------- turret
// Turret frame: pivot at hull (0, 1.41, −0.55); local z = hull z + 0.55, local y = hull y − 1.41.
const T = { roof: 0.90, shelf: 0.73, sideTop: 0.68, gunY: 0.35, gunZ: 1.10, gunLen: 4.625, housingZ: 1.68, pivotY: 1.41, pivotZ: -0.55 } as const;

interface TurretStation { z: number; wl: number; wpod: number; shelf: number; wt: number; podY: number; sideTop: number; shelfY: number; roof: number }
/** Fourteen-point section (measured flank and roof tables): a narrower lower body to the pod line (hull 1.90), the
 * wide upper cheek pods to the side top (2.09), the roof shelf (2.14) and the chamfer to the plateau (2.31). */
function turretSection(s: TurretStation): SolidSection {
  const ring: SectionPoint[] = [
    [-s.wl + 0.08, 0.02], [s.wl - 0.08, 0.02], [s.wl, 0.10], [s.wl, s.podY], [s.wpod, s.podY + 0.01], [s.wpod, s.sideTop],
    [s.shelf, s.shelfY], [s.wt, s.roof], [-s.wt, s.roof], [-s.shelf, s.shelfY], [-s.wpod, s.sideTop], [-s.wpod, s.podY + 0.01],
    [-s.wl, s.podY], [-s.wl, 0.10],
  ];
  return { z: s.z, ring };
}
const st = (z: number, wl: number, wpod: number, shelf: number, wt: number, roof: number = T.roof, sideTop: number = T.sideTop, shelfY: number = T.shelf, podY = 0.49): TurretStation => {
  const top = roof, side = Math.min(sideTop, top - 0.04), shelfHeight = Math.min(shelfY, top - 0.02), pod = Math.min(podY, side - 0.03);
  const podW = Math.max(wpod, wl + 0.01), shelfW = Math.min(shelf, podW - 0.02), topW = Math.min(wt, shelfW - 0.02);
  return { z, wl, wpod: podW, shelf: shelfW, wt: topW, podY: pod, sideTop: side, shelfY: shelfHeight, roof: top };
};
const TURRET_Z: readonly TurretStation[] = [
  st(-2.05, 0.88, 0.89, 0.82, 0.58, 0.88, 0.66, 0.72),        // bustle rear face (hull −2.60)
  st(-1.50, 0.91, 0.92, 0.84, 0.62, 0.90, 0.68, 0.74),        // bustle (hull −2.05)
  st(-1.44, 0.91, 1.50, 1.15, 0.76),                          // pods begin over the narrow body (hull −1.99)
  st(-0.80, 0.98, 1.50, 1.15, 0.76),                          // hull −1.35
  st(-0.72, 1.47, 1.50, 1.15, 0.76),                          // the body widens under the pods (hull −1.27)
  st(-0.15, 1.47, 1.50, 1.15, 0.76),                          // hull −0.70
  st(0.20, 1.10, 1.37, 1.05, 0.70, 0.82),                     // cheeks: body 1.10, pods 1.37 (hull −0.35)
  st(0.45, 1.10, 1.18, 0.90, 0.60, 0.80),                     // hull −0.10
  st(0.70, 1.11, 1.12, 0.80, 0.46, 0.70, 0.60, 0.66),         // hull 0.15
  st(1.00, 0.96, 0.97, 0.66, 0.34, 0.64, 0.52, 0.60),         // wedge over the housing (hull 0.45; measured roof 2.05)
  st(1.30, 0.66, 0.67, 0.48, 0.30, 0.54, 0.44, 0.50),         // hull 0.75 (measured 1.94)
  st(T.housingZ, 0.58, 0.59, 0.44, 0.28, 0.52, 0.42, 0.48),   // housing front (hull 1.13)
];

/** Cylindrical sensor / launcher tower on a front roof corner (measured x ±1.25, y 1.91–2.54, z −0.96..−0.61). */
function tower(P: TankBuilderPort, s: number): void {
  const x = s * 1.25, z = -0.235, base = T.shelf - 0.02;
  P.addEquipment('turret', part(box(0.39, 0.10, 0.39), 'tower-plate'), x, base + 0.05, z);
  for (const dx of [-0.14, 0.14]) for (const dz of [-0.14, 0.14]) P.add('turretDark', part(cylY(0.012, 0.012, 0.012, 6), 'tower-plate-bolt'), x + dx, base + 0.106, z + dz);
  P.add('turretDark', part(cylY(0.07, 0.09, 0.14, 16), 'tower-column'), x, base + 0.17, z);
  // measured drum: a horizontal 0.17 m cylinder 0.35 m long at hull y 2.35–2.52 with its 0.18 × 0.19 × 0.20 sensor box
  P.addEquipment('turret', part(cylZ(0.085, 0.35, 20), 'tower-drum'), x, base + 0.325, z);
  for (const dz of [-0.16, 0.16]) P.add('turretDark', part(torus(0.086, 0.007, 8, 20), 'tower-drum-ring'), x, base + 0.325, z + dz);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P.add('turretDark', part(cylZ(0.022, 0.02, 10), 'tower-mouth'), x + Math.sin(a) * 0.052, base + 0.325 + Math.cos(a) * 0.052, z + 0.185);
  }
  P.addEquipment('turret', part(box(0.18, 0.19, 0.20), 'tower-sensor'), x, base + 0.335, z - 0.30);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.12, 0.10, 0.012), 'tower-sensor-glass'), x, base + 0.35, z - 0.195);
  P.add('turretDark', part(box(0.06, 0.12, 0.06), 'tower-neck'), x, base + 0.27, z);
}

/** Weapon station at the rear centre: base ring, fork, cannon body with twin tubes, sight plate, forward barrel. */
function weaponStation(P: TankBuilderPort): void {
  const z = -0.20;
  P.add('turretDark', part(cylY(0.26, 0.28, 0.06, 24), 'rws-ring'), 0, T.roof + 0.03, z);
  P.add('turret', part(cylY(0.22, 0.24, 0.10, 20), 'rws-base'), 0, T.roof + 0.11, z);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', part(orientedSlab(
      [s * 0.15, 0, -0.31], [s * 0.29, 0, -0.31], [s * 0.29, 0, 0.30], [s * 0.15, 0, 0.30],
      [s * 0.15, 0.56, -0.36], [s * 0.29, 0.56, -0.36], [s * 0.29, 0.56, 0.24], [s * 0.15, 0.56, 0.24]), 'rws-fork'), 0, T.roof + 0.10, z);
    P.add('turretDark', part(cylX(0.03, 0.02, 12), 'rws-fork-bolt'), s * 0.30, T.roof + 0.56, z - 0.02);
  }
  // the gun itself is the fleet pintle machine-gun fitting (KIT.fittings census: mg >= 1) in the forked cradle
  // scale/seat chosen so the fitting tops out at the measured silhouette (3.04 m world): the dims gate reads it
  const weapon = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', scale: 1.15, tone: 'two-tone', elev: 0, ammo: true, shield: false, ring: false, barrelBridge: true, seed: 100317 });
  weapon.name = 'ztz100RemoteMachineGun';
  weapon.position.set(0, T.roof + 0.41, z - 0.02);
  P.turretG.add(weapon);
  P.add('turretDark', part(box(0.30, 0.20, 0.36), 'rws-breech'), 0, T.roof + 0.57, z - 0.72);
  for (const y of [0.47, 0.60]) P.add('turretDark', part(cylZ(0.06, 1.39, 12), 'rws-tube'), -0.43, T.roof + y, z - 0.23);
  P.add('turretDark', part(box(0.14, 0.26, 0.10), 'rws-tube-bracket'), -0.43, T.roof + 0.53, z - 0.66);
  // measured sight plate x 0.08–0.58, hull z −1.37..−0.88; cross bar at hull z −1.0
  P.addEquipment('turret', part(box(0.50, 0.08, 0.49), 'rws-sight-plate'), 0.33, T.roof + 0.63, z - 0.575);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.30, 0.05, 0.012), 'rws-sight-glass'), 0.33, T.roof + 0.64, z - 0.325);
  P.add('turretDark', part(box(0.87, 0.10, 0.10), 'rws-cross-bar'), 0.09, T.roof + 0.60, z - 0.25);
  P.add('turretDark', part(box(0.25, 0.23, 0.28), 'rws-sight'), 0, T.roof + 0.24, z + 0.14);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.16, 0.12, 0.012), 'rws-sight-front-glass'), 0, T.roof + 0.26, z + 0.285);
}

function turret(P: TankBuilderPort): void {
  P.add('turretDark', part(cylY(1.18, 1.24, 0.06, 32), 'ring'), 0, -0.03, 0.10);
  P.add('turret', part(sectionSolid(TURRET_Z.map(turretSection)), 'turret-body'));
  for (const s of [-1, 1]) {
    for (const z of [-1.20, -0.55]) P.add('turretDark', part(box(0.006, T.sideTop - 0.16, 0.02), 'flank-seam'), s * 1.503, 0.42, z);
    P.add('turretDark', part(box(0.02, 0.006, 1.34), 'roof-seam'), s * 0.76, T.roof + 0.003, -0.77);
  }
  // gun housing, moving mantlet and collar, 105 mm tube with the multi-baffle brake
  P.add('turret', part(orientedSlab(
    [-0.58, 0.08, T.housingZ - 0.40], [0.58, 0.08, T.housingZ - 0.40], [0.54, 0.08, T.housingZ + 0.02], [-0.54, 0.08, T.housingZ + 0.02],
    [-0.40, 0.58, T.housingZ - 0.40], [0.40, 0.58, T.housingZ - 0.40], [0.36, 0.54, T.housingZ + 0.02], [-0.36, 0.54, T.housingZ + 0.02],
  ), 'gun-housing'));
  const mantletRing: SectionPoint[] = [[-0.40, -0.22], [0.40, -0.22], [0.30, 0.22], [-0.30, 0.22]];
  P.addGunExtra(part(sectionSolid([{ z: -0.28, ring: mantletRing }, { z: 0.82, ring: mantletRing.map(([x, y]) => [x * 0.9, y * 0.9] as SectionPoint) }]), 'mantlet'), 0, 0, 0);
  P.addGunExtraDark(part(cylZ(0.14, 0.14, 24), 'trunnion-collar'), 0, 0, 0.88);
  // the reference tube leaves the housing in a thick 0.26 m sleeve to hull z 2.3
  P.addGunExtra(part(cylZ(0.13, 1.10, 24), 'root-sleeve'), 0, 0, 1.50);
  KIT.buildGun(P, { len: T.gunLen, r: 0.072, brake: true, sleeve: true, evac: 0.50, evacR: 1.5, collar: true, baseR: 0.14 });
  muzzleBore(P, { len: T.gunLen, r: 0.072, seg: 20 });
  P.muzzleZ = T.gunLen;
  P.addGunExtraDark(part(cylZ(0.15, 0.36, 24), 'brake-body'), 0, 0, T.gunLen - 0.20);
  for (let i = 0; i < 6; i++) P.addGunExtraDark(part(cylZ(0.154, 0.024, 24), 'brake-baffle'), 0, 0, T.gunLen - 0.36 + i * 0.056);
  P.addGunExtraDark(part(cylZ(0.092, 0.03, 24), 'mrs-collar'), 0, 0, T.gunLen - 0.62);
  // gunner's sight: a recessed window in the right cheek facet (the reference carries no boxed sight there)
  P.add('turretDark', part(box(0.26, 0.18, 0.02), 'gunner-sight-frame'), 0.80, 0.42, 1.06, 0, 0.55, 0);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.20, 0.12, 0.012).rotateY(0.55), 'gunner-sight-glass'), 0.81, 0.42, 1.07);
  // right-cheek missile bank (measured x 0.437–0.582, y 1.737–1.949, z 0.181–1.341 hull) and its rail
  P.addEquipment('turret', part(box(0.145, 0.21, 1.16), 'missile-bank'), 0.51, 0.435, 1.31);
  P.add('turretDark', part(cylZ(0.055, 0.03, 16), 'missile-mouth'), 0.51, 0.435, 1.905);
  P.add('turretDark', part(box(0.064, 0.06, 0.97), 'missile-rail'), 0.51, 0.57, 1.65);
  for (const z of [0.85, 1.75]) P.add('turretDark', part(box(0.16, 0.05, 0.06), 'missile-bracket'), 0.51, 0.32, z);
  // left panoramic sight
  P.add('turretDetail', part(cylY(0.19, 0.24, 0.05, 28), 'panoramic-bearing'), -0.58, T.roof + 0.025, 0.45);
  P.add('turret', part(cylY(0.17, 0.17, 0.16, 28), 'panoramic-drum'), -0.58, T.roof + 0.13, 0.45);
  P.addEquipment('turret', part(box(0.30, 0.24, 0.30), 'panoramic-head'), -0.58, T.roof + 0.33, 0.45);
  P.addModuleVisual('optics', 'turretGlass', part(box(0.20, 0.14, 0.012), 'panoramic-glass'), -0.58, T.roof + 0.35, 0.606);
  P.add('turretDetail', part(cylY(0.05, 0.05, 0.02, 20), 'panoramic-cap'), -0.58, T.roof + 0.46, 0.45);
  tower(P, -1);
  tower(P, 1);
  weaponStation(P);
  for (const s of [-1, 1]) {
    P.addCupola('turret', part(cylY(0.26, 0.28, 0.05, 28), 'roof-hatch'), s * 0.42, T.roof + 0.025, -1.05);
    P.add('turretDark', part(torus(0.27, 0.012, 28), 'roof-hatch-ring'), s * 0.42, T.roof + 0.05, -1.05, Math.PI / 2, 0, 0);
    P.add('turretDark', part(box(0.12, 0.03, 0.03), 'roof-hatch-handle'), s * 0.42, T.roof + 0.06, -0.80);
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.4;
      KIT.periscope(P, 'turretDetail', s * 0.42 + Math.sin(a) * 0.36, T.roof + 0.02, -1.05 + Math.cos(a) * 0.36, a);
    }
    // smoke discharger banks on the cheeks, stowage boxes on the bustle flanks, rails, lifting eyes, corner receivers
    P.add('turretDark', part(box(0.08, 0.06, 0.40), 'smoke-base'), s * 1.06, T.shelf + 0.03, 0.22, 0, s * 0.5, 0);
    for (let i = 0; i < 4; i++) {
      const dz = -0.14 + i * 0.093;
      P.add('turretDark', part(cylZ(0.034, 0.28, 12).rotateX(-0.55).translate(0, 0.11, dz), 'smoke-tube'), s * 1.06, T.shelf + 0.05, 0.22, 0, s * 0.5, 0);
      P.add('turretDark', part(cylZ(0.038, 0.012, 12).rotateX(-0.55).translate(0, 0.185, dz + 0.12), 'smoke-cap'), s * 1.06, T.shelf + 0.05, 0.22, 0, s * 0.5, 0);
    }
    P.addEquipment('turret', part(box(0.12, 0.30, 0.44), 'stowage-box'), s * 0.97, 0.36, -1.75);
    for (const dy of [-0.10, 0.10]) P.add('turretDark', part(cylX(0.012, 0.018, 8), 'stowage-bolt'), s * 1.035, 0.36 + dy, -1.75);
    P.add('turretDark', part(cylZ(0.012, 1.10, 8), 'roof-rail'), s * 0.62, T.roof + 0.10, -1.30);
    for (const z of [-1.80, -1.30, -0.80]) P.add('turretDark', part(box(0.024, 0.10, 0.024), 'roof-rail-post'), s * 0.62, T.roof + 0.05, z);
    KIT.liftEye(P, 'turretDetail', s * 0.66, T.roof + 0.02, 0.10);
    KIT.liftEye(P, 'turretDetail', s * 0.50, T.roof + 0.02, -1.95);
    P.addEquipment('turret', part(box(0.12, 0.12, 0.10), 'corner-receiver'), s * 1.02, T.shelf + 0.06, -1.62, 0, s * 0.4, 0);
    P.addModuleVisual('optics', 'turretGlass', part(box(0.05, 0.05, 0.01).rotateY(s * 0.4), 'corner-receiver-glass'), s * 1.02 + s * 0.02, T.shelf + 0.06, -1.57);
  }
  louvreField(P, 'turret', 'bustle-grille', [0, 0.40, -2.06], 1.40, 0.36, 5, 'aft');
  // side bins: the reference's pod bodies run on behind the shoulder to hull z −3.19 (measured x 0.91–1.51, y 1.64–2.14)
  for (const s of [-1, 1]) {
    P.addEquipment('turret', part(box(0.60, 0.50, 1.20), 'bustle-basket'), s * 1.21, 0.48, -2.04);
    for (let i = 0; i < 4; i++) P.add('turretDark', part(box(0.012, 0.012, 1.18), 'bustle-basket-slat'), s * 1.516, 0.30 + i * 0.12, -2.04);
    for (const dz of [-0.45, 0, 0.45]) P.add('turretDark', part(box(0.62, 0.02, 0.02), 'bustle-basket-slat'), s * 1.21, 0.735, -2.04 + dz);
  }
  P.add('turretDark', part(cylY(0.08, 0.09, 0.06, 16), 'gps-dome'), 0.30, T.roof + 0.03, -1.60);
  P.add('turretDark', part(cylY(0.012, 0.012, 0.50, 8), 'met-mast'), -0.95, T.shelf + 0.25, -1.25);
  P.add('turretDark', part(cylY(0.03, 0.03, 0.04, 12), 'met-mast-head'), -0.95, T.shelf + 0.52, -1.25);
  // the reference carries no whips: stub antennas on pots keep the measured 3.04 m silhouette
  for (const [x, z, h] of [[-0.50, -1.98, 0.32], [0.50, -1.98, 0.28]] as const) {
    P.add('turretDark', part(cylY(0.038, 0.05, 0.09, 10), 'antenna-pot'), x, T.roof + 0.045, z);
    P.add('turretDark', part(cylY(0.010, 0.012, h, 8), 'antenna-stub'), x, T.roof + 0.09 + h / 2, z);
  }
  P.topY = Math.max(P.topY || 0, T.roof + 0.73);
}

function buildZtz100X(P: TankBuilderPort): void {
  hullBody(P);
  skirts(P);
  bow(P);
  deck(P);
  stern(P);
  runningGear(P);
  turret(P);
  for (const s of [-1, 1]) {
    P.decal('hull', 'star', null, 0.22, [s * (H.skirtFwd + 0.012), 1.06, 0.60], s * -Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || '100', 0.26, [s * (H.skirtAft + 0.012), 1.06, -1.30], s * -Math.PI / 2);
    P.decal('turret', 'star', null, 0.18, [s * 1.512, 0.40, -0.90], s * -Math.PI / 2);
  }
  if (P.geometryReceipt) {
    P.hullG.userData.ztz100Receipt = Object.freeze({
      architecture: 'ztz100-x-r2', datums: ZTZ100_X_DATUMS, hullStations: HULL_Z.length, turretStations: TURRET_Z.length,
      roadWheelsPerSide: 7, gunLengthM: T.gunLen, rwsTopM: T.roof + 0.73, pivot: [0, T.pivotY, T.pivotZ], trunnion: [0, T.gunY, T.gunZ],
    });
  }
}

export const ZTZ100_X_PROFILES = Object.freeze({
  ztz100_x: Object.freeze({ build: buildZtz100X }),
}) satisfies VehicleProfileRecord;
