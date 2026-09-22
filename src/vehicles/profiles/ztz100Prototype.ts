// Owner-directed 2026-09-19 missile-carrier concept, distinct from service ZTZ-100.
// The historical first-party hull and complete running gear remain unchanged.
// The broad shouldered 2x2 banks, angular low body and short backup cannon are
// original concept stock; no historical turret/source-fidelity claim applies.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { KIT, orientedSlab } from './kit.ts';
import { sectionSolid, type SolidSection, type SectionPoint } from './sectionSolid.ts';
import { lathedWheelSection } from './lathedWheelStock.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type XYZ = [number, number, number];

/** Tag a geometry with its measured part name so the receipt can census the build. */
function part(geometry: THREE.BufferGeometry, name: string): THREE.BufferGeometry {
  geometry.userData.ztz100 = name;
  return geometry;
}

// ---------------------------------------------------------------------------------------------- measured frame
export const ZTZ100_PROTOTYPE_DATUMS = Object.freeze({
  widthM: 3.734, hullLengthM: 6.94, overallLengthM: 7.70, roofHeightM: 1.41, turretRoofM: 1.90, overallHeightM: 2.74,
  turretPivot: [0, 1.41, -0.55] as const, trunnion: [0, 2.05, .25] as const, muzzleZ: 1.70,
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
  glacisTopZ: 0.95, noseZ: ZTZ100_PROTOTYPE_DATUMS.noseZ, noseY: ZTZ100_PROTOTYPE_DATUMS.noseY, sternZ: ZTZ100_PROTOTYPE_DATUMS.sternPlateZ,
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
  const cageY0 = 0.68, cageY1 = 1.48, cageBars = 8, cageZ = ZTZ100_PROTOTYPE_DATUMS.sternScreenZ + 0.02, cageX = 1.80;
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
  const D = ZTZ100_PROTOTYPE_DATUMS;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: D.wheelR, wheelW: 0.366, wheelY: D.wheelY, xc: D.trackX,
    wheelZs: [...D.wheelStations],
    sprocket: { ...D.sprocket }, idler: { ...D.idler },
    rollerR: D.rollers[0].r, rollers: D.rollers.map((r) => ({ z: r.z, y: r.y })),
    trackW: D.trackW, trackTh: 0.028, topY: 0.96, botY: 0.05,
    trackPattern: 'nato-double-pin', linkPitchM: 0.177, shoeWidthScale: 0.99,
    paintedEnds: true, arms: true, coveredTop: true,
    contactZF: 2.45, contactZR: -2.62,
  });
}

// ----------------------------------------------------------------------------------------------------- turret
// Owner-directed missile-carrier concept. Dimensions are design decisions,
// not measurements of the superseded historical MBT turret.
const T = { roof: .49, gunY: .64, gunZ: .80, gunLen: 1.45, pivotY: 1.41, pivotZ: -.55 } as const;
export const ZTZ100_PROTOTYPE_LAUNCHER = Object.freeze({
  columns: [-1.28, -.88, .88, 1.28] as const, rows: [.02, .42] as const,
  rear: -1.12, mouth: 1.00, outerRadius: .175, innerRadius: .145,
  gunPivot: [0, T.gunY, T.gunZ] as const, backupLength: T.gunLen,
  backupOuterRadius: .045, backupInnerRadius: .0175, backupDepth: .09,
});

function bodySection(z: number, width: number, top: number): SolidSection {
  return { z, ring: [[-width + .08, .015], [width - .08, .015], [width, .055],
    [width - .08, top], [-width + .08, top], [-width, .055]] };
}

/** The lateral deck stays below the bank's complete +20 degree rear sweep. */
function armoredBody(P: TankBuilderPort): void {
  P.add('turretDark', part(cylY(1.15, 1.20, .07, P.q ? 48 : 24), 'concept-ring'), 0, -.015, .10);
  P.add('turret', part(sectionSolid([
    bodySection(-1.62, 1.08, .08), bodySection(-1.20, 1.49, .08),
    bodySection(.75, 1.49, .08), bodySection(1.42, .64, .08),
  ]), 'concept-armored-platter'));
  const spine = (z: number, w: number, roof: number): SolidSection => ({ z, ring: [
    [-w, .07], [w, .07], [w, roof - .14], [w - .15, roof],
    [-w + .15, roof], [-w, roof - .14],
  ] });
  P.add('turret', part(sectionSolid([
    spine(-1.58, .58, .44), spine(-1.12, .60, T.roof),
    spine(.34, .60, T.roof), spine(.76, .43, .42),
  ]), 'concept-central-spine'));
  for (const s of [-1, 1]) {
    P.add('turret', part(box(.15, .48, .42), 'pitch-pedestal'), s * .515, .37, T.gunZ);
    P.add('turret', part(cylX(.18, .20, P.q ? 28 : 14), 'pitch-bearing'), s * .515, T.gunY, T.gunZ);
    P.add('turretDark', part(cylX(.095, .018, P.q ? 20 : 10), 'pitch-bearing-cap'), s * .625, T.gunY, T.gunZ);
  }
}

/** A closed thick-walled tube with real air, joined to its closed rear plate. */
function missileCell(P: TankBuilderPort, x: number, y: number): void {
  const D = ZTZ100_PROTOTYPE_LAUNCHER, n = P.q ? 28 : 14;
  const tube = lathedWheelSection([[D.rear, D.innerRadius], [D.rear, D.outerRadius],
    [D.mouth, D.outerRadius], [D.mouth, D.innerRadius]], n).rotateY(-Math.PI / 2);
  P.addModuleVisual('missileRack', 'gunMount', part(tube, 'missile-canister'), x, y, 0);
  P.addEquipment('gunMountDark', part(cylZ(D.outerRadius, .05, n), 'missile-backplate'), x, y, D.rear + .02);
  for (const z of [-.72, .54]) {
    const band = lathedWheelSection([[z - .04, .173], [z - .04, .196],
      [z + .04, .196], [z + .04, .173]], n).rotateY(-Math.PI / 2);
    P.addEquipment('gunMount', part(band, 'canister-saddle'), x, y, 0);
  }
}

/** Thin faceted shoulders frame each 2x2 bank; none caps a terminal mouth. */
function bankHousing(P: TankBuilderPort, side: number): void {
  const x = side * 1.08;
  for (const edge of [-1, 1]) {
    const wall = (z: number, bottom: number): SolidSection => ({ z,
      ring: [[-.0225, bottom], [.0225, bottom], [.0225, .655], [-.0225, .655]] });
    P.addEquipment('gunMount', part(sectionSolid([
      wall(-1.10, -.155), wall(-.92, -.215), wall(.97, -.215),
    ]), 'bank-side-armor'), x + edge * .445, 0, 0);
  }
  P.addEquipment('gunMount', part(sectionSolid([
    { z: -1.10, ring: [[-.445, .63], [.445, .63], [.37, .69], [-.37, .69]] },
    { z: .97, ring: [[-.445, .63], [.445, .63], [.37, .69], [-.37, .69]] },
  ]), 'bank-armored-roof'), x, 0, 0);
  P.addEquipment('gunMount', part(box(.93, .04, 1.91), 'bank-lower-tray'), x, -.195, .015);
  // The inner fork is beside the bores; the low transverse webs meet saddles.
  P.addEquipment('gunMount', part(box(.07, .25, .30), 'bank-inner-fork'), side * .655, -.075, 0);
  for (const z of [-.72, .54]) {
    P.addEquipment('gunMount', part(box(.91, .04, .08), 'bank-saddle-web'), x, -.16, z);
    P.addEquipment('gunMount', part(box(.91, .035, .08), 'bank-between-row-web'), x, .22, z);
  }
  P.addEquipment('gunMount', part(cylX(.13, .14, P.q ? 24 : 12), 'bank-pitch-journal'), side * .64, 0, 0);
}

function backupCannon(P: TankBuilderPort): void {
  const D = ZTZ100_PROTOTYPE_LAUNCHER, n = P.q ? 32 : 16;
  P.addEquipment('gunMount', part(box(.34, .29, .43), 'backup-mantlet'), 0, 0, -.04);
  P.addEquipment('gunMount', part(cylZ(.092, .28, n), 'backup-slide-bearing'), 0, 0, .30);
  P.add('gun', part(cylZ(.062, .80, n), 'backup-receiver'), 0, 0, .45);
  P.add('gun', part(new THREE.CylinderGeometry(.045, .045, .68, n, 1, true).rotateX(Math.PI / 2), 'backup-barrel'), 0, 0, 1.11);
  const throat = new THREE.CylinderGeometry(D.backupInnerRadius, D.backupInnerRadius, D.backupDepth, n, 1, true).rotateX(Math.PI / 2);
  const index = throat.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b);
  }
  throat.computeVertexNormals();
  P.add('gunDark', part(throat, 'backup-inner-wall'), 0, 0, T.gunLen - D.backupDepth / 2);
  P.add('gun', part(new THREE.RingGeometry(D.backupInnerRadius, D.backupOuterRadius, n), 'backup-mouth'), 0, 0, T.gunLen);
  P.add('gunDark', part(new THREE.CircleGeometry(D.backupInnerRadius, n), 'backup-backstop'), 0, 0, T.gunLen - D.backupDepth);
  P.muzzleZ = T.gunLen;
  P.physicalMuzzleBore = { outerRadiusM: D.backupOuterRadius, innerRadiusM: D.backupInnerRadius, depthM: D.backupDepth };
}

function sensorsAndHatches(P: TankBuilderPort): void {
  const n = P.q ? 24 : 12;
  P.addEquipment('turret', part(cylY(.18, .21, .10, n), 'sensor-bearing'), .23, T.roof + .04, -.10);
  P.addEquipment('turret', part(box(.31, .31, .32), 'sensor-head'), .23, T.roof + .24, -.10);
  P.addModuleVisual('optics', 'turretGlass', part(box(.21, .14, .015), 'sensor-front-window'), .23, T.roof + .27, .065);
  P.addEquipment('turret', part(box(.35, .04, .38), 'sensor-sunshade'), .23, T.roof + .405, -.08);
  // Offset moving sight sees down the bore direction beside the backup tube.
  P.addEquipment('gunMount', part(box(.24, .08, .17), 'gunner-sight-foot'), -.18, .11, .10);
  P.addEquipment('gunMount', part(box(.08, .14, .17), 'gunner-sight-stem'), -.27, .17, .10);
  P.addEquipment('gunMount', part(box(.28, .16, .26), 'gunner-sight-body'), -.27, .27, .10);
  P.addModuleVisual('optics', 'gunMountGlass', part(box(.18, .08, .015), 'gunner-sight-window'), -.27, .285, .235);
  P.addHatch('turret', part(box(.67, .055, .64), 'service-hatch'), 0, T.roof + .0175, -.91);
  for (const x of [-.23, .23]) P.addEquipment('turret', part(cylX(.045, .15, 10), 'service-hatch-hinge'), x, T.roof + .04, -1.21);
  P.addEquipment('turretDark', part(box(.23, .025, .045), 'service-hatch-handle'), 0, T.roof + .06, -.64);
  P.addEquipment('turret', part(cylY(.035, .05, .09, 10), 'antenna-base'), 0, T.roof + .015, -1.39);
  P.addEquipment('turretDark', part(cylY(.010, .010, .43, 8), 'antenna-stub'), 0, T.roof + .26, -1.39);
}

function turret(P: TankBuilderPort): void {
  armoredBody(P);
  for (const side of [-1, 1]) bankHousing(P, side);
  for (const x of ZTZ100_PROTOTYPE_LAUNCHER.columns) {
    for (const y of ZTZ100_PROTOTYPE_LAUNCHER.rows) missileCell(P, x, y);
  }
  backupCannon(P);
  sensorsAndHatches(P);
  P.topY = 1.33;
}

function buildZtz100Prototype(P: TankBuilderPort): void {
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
  }
  if (P.geometryReceipt) {
    P.hullG.userData.ztz100Receipt = Object.freeze({
      architecture: 'ztz100-prototype-missile-concept', datums: ZTZ100_PROTOTYPE_DATUMS, hullStations: HULL_Z.length,
      launcherTubesByWeapon: { 'HJ-P9 Tandem': 8, 'HJ-P9 Blast': 8 }, physicalLauncherTubes: 8,
      roadWheelsPerSide: 7, gunLengthM: T.gunLen, launcherTopM: 2.74, pivot: [0, T.pivotY, T.pivotZ], trunnion: [0, T.gunY, T.gunZ],
    });
  }
}

export const ZTZ100_PROTOTYPE_PROFILES = Object.freeze({
  ztz100_prototype: Object.freeze({ build: buildZtz100Prototype }),
}) satisfies VehicleProfileRecord;
