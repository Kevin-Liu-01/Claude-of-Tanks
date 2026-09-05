// Chinese main-battle-tank family.
//
// §5.248 GROUND-UP REBUILDS (2026-08-17): ztz85_iii and ztz99a2 are complete
// first-party constructions measured against their own batch-B prints
// (docs/references/vertex/ztz85_iii.json / ztz99a2.json — both WEAK fused
// whole-view instruments, so published dims anchor every frame and the
// prints carry silhouette/proportion truth only).  No donor build is called:
// hulls are station lofts, turrets are connected welded polyMultiLoft
// shells, and every fitting seats on real geometry per BUILD-STANDARD §B.
// The type99a oracle package below is a RESIDENT of this module riding the
// frozen canonical Type-99A constructor — it is guard-held and unchanged.

import { KIT, FITTINGS, MUDGUARDS, orientedSlab, muzzleBore } from './kit.ts';
import {
  chevronSurfacePanel,
  closedIntegratedChevron,
  interpolateChevronStation,
  type ChevronStation,
} from './chineseChevron.ts';
import {
  loftHull, tubeGun, ruSkirtBand, ruFlaps, widthAnchor,
  buildT62Obr1975Chassis, meshDome, meshDomeCurved, ringSkin, domeRailRu, ruSaddle,
  ruBoot,
} from './russia.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { BufferGeometry, Object3D } from 'three';

type Vec3Tuple = [number, number, number];
type Vec2Tuple = [number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';

export interface ChinaBuilderPort extends TankBuilderPort {}

const nonUniformXform = KIT.xform as (
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: number | readonly number[],
) => BufferGeometry;

function mount(
  P: ChinaBuilderPort,
  owner: VehicleAssemblyOwner,
  fitting: Object3D,
  x: number,
  y: number,
  z: number,
  rotation: Vec3Tuple | null = null,
): void {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function armorCassette(
  P: ChinaBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  seam = true,
): void {
  const r = rotation || [0, 0, 0];
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.visualEraCluster(`china-layered-${owner}-era`, owner, () => {
  P.add(bucket, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (seam) {
    P.add(detail, KIT.box(w * 0.72, 0.018, Math.max(0.025, d * 0.07)),
      x, y + h * 0.50 + 0.010, z + d * 0.30, r[0], r[1], r[2]);
  }
  });
}

function addSmokeBanks(
  P: ChinaBuilderPort,
  x: number,
  y: number,
  z: number,
  count: number,
  seed: number,
): void {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.043, len: 0.30, splay: side * 1.02,
      pitch: -0.44, arc: 0.58, spacing: 0.10, slot: 'detail',
      rotation: [0, 0, -side * 0.12], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

interface RearFuelDrumOptions {
  readonly radius?: number;
  readonly length?: number;
  readonly centerX?: number;
  readonly cradleDepth?: number;
  readonly rearPlateZ?: number;
}

export function addRearFuelDrums(
  P: ChinaBuilderPort,
  y: number,
  z: number,
  seed: number,
  options: RearFuelDrumOptions = {},
): void {
  const { cylX, cylY, box } = KIT;
  const radius = options.radius ?? 0.17;
  const length = options.length ?? 0.76;
  const centerX = options.centerX ?? 0.78;
  const cradleDepth = options.cradleDepth ?? Math.max(0.20, radius * 1.24);
  const rearPlateZ = options.rearPlateZ ?? z + radius * 0.55;
  const bandOffset = length * 0.31;
  const outerX = centerX + length / 2;

  // Each auxiliary barrel is a complete transverse cylinder with proud end
  // hoops, two retaining bands and a filler cap.  The shared shelf overlaps
  // both barrel bellies and the rear plate, while four triangular-looking
  // feet carry that shelf back into the hull instead of leaving two floating
  // cylinders behind the transom.
  P.add('hullDark', box(outerX * 2 + 0.10, 0.09, cradleDepth),
    0, y - radius * 0.76, z + radius * 0.55);
  for (const side of [-1, 1]) {
    P.add('hull', cylX(radius, length, 20), side * centerX, y, z);
    for (const bandX of [centerX - bandOffset, centerX + bandOffset]) {
      P.add('hullDark', cylX(radius + 0.009, 0.050, 20), side * bandX, y, z);
      P.add('hullDark', box(0.060, radius * 0.92, cradleDepth),
        side * bandX, y - radius * 0.67, z + radius * 0.42);
    }
    P.add('hullDark', cylX(radius + 0.012, 0.042, 20),
      side * (centerX + length / 2 - 0.018), y, z);
    P.add('hullDetail', cylY(0.045, 0.052, 0.062, 12),
      side * centerX, y + radius + 0.025, z - radius * 0.08);
  }
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: outerX * 2 + 0.06, d: cradleDepth, h: 0.18,
    fill: 0, rails: 2, seed,
  }), 0, y - radius * 0.86, z + radius * 0.56);
  P.hullG.userData.rearFuelDrumReceipt = Object.freeze({
    fuelDrums: 2,
    axis: 'x',
    drumDiameterM: radius * 2,
    drumLengthM: length,
    centerSpacingM: centerX * 2,
    rearPlateOverlapM: Math.max(0, z + radius - rearPlateZ),
    supportBrackets: 4,
    supportedAndSeated: true,
  });
}

function addZTZ99A2RearServiceComplex(P: ChinaBuilderPort): void {
  const { box, cylX, cylZ, torus } = KIT;

  // The welded rear wall is armor; everything mounted to it is equipment.
  // Keep the service complex slightly embedded in the shell so the three
  // cabinets, their drip rail and the basket cradle read as one supported
  // installation instead of a second armor slab floating behind the turret.
  P.addEquipment('turret', box(2.18, 0.56, 0.085), 0, 0.43, -1.738);
  P.add('turretDark', box(2.06, 0.030, 0.055), 0, 0.735, -1.782);
  P.add('turretDark', box(2.06, 0.032, 0.055), 0, 0.125, -1.782);
  const cabinets = [
    { x: -0.74, w: 0.52, h: 0.34, y: 0.43 },
    { x: 0, w: 0.66, h: 0.42, y: 0.42 },
    { x: 0.74, w: 0.52, h: 0.34, y: 0.43 },
  ];
  for (const { x, w, h, y } of cabinets) {
    P.addEquipment('turret', box(w, h, 0.18), x, y, -1.82);
    P.add('turretDark', box(w * 0.88, h * 0.84, 0.022), x, y, -1.922);
    P.add('turretDetail', box(w * 0.74, 0.024, 0.030), x, y + h * 0.39, -1.940);
    P.add('turretDetail', box(w * 0.74, 0.024, 0.030), x, y - h * 0.39, -1.940);
  }

  // Louvered central APU/radio door, side access latches and real rear-face
  // fasteners provide the density missing from the marked broad slab.
  for (let row = 0; row < 5; row++) {
    P.add('turretDetail', box(0.46, 0.025, 0.030), 0, 0.30 + row * 0.058, -1.947);
  }
  for (const x of [-0.91, -0.57, 0.57, 0.91]) {
    P.add('turretDetail', box(0.036, 0.12, 0.035), x, 0.43, -1.947);
  }
  for (const x of [-0.99, -0.49, 0.49, 0.99]) {
    for (const y of [0.18, 0.68]) {
      P.add('turretDark', cylZ(0.022, 0.035, 8), x, y, -1.952);
    }
  }
  // Transverse recovery/tool tube and two positive straps.  Its ends remain
  // inside the side-return rails and below the antenna collars.
  P.addEquipment('turret', cylX(0.095, 1.88, 14), 0, 0.80, -1.86);
  for (const x of [-0.64, 0.64]) {
    P.add('turretDark', box(0.055, 0.23, 0.23), x, 0.80, -1.86);
  }

  // Rear-facing cable reel and extinguisher bottle are asymmetric on
  // purpose, like the roof fittings, but both have planted cradles.
  P.addEquipment('turret', cylZ(0.155, 0.105, 16), 0.77, 0.48, -2.005);
  P.add('turretDark', torus(0.13, 0.020, 16), 0.77, 0.48, -2.064);
  P.add('turretDark', cylZ(0.030, 0.120, 10), 0.77, 0.48, -2.070);
  P.addEquipment('turret', cylX(0.095, 0.62, 14), -0.69, 0.48, -2.015);
  for (const x of [-0.91, -0.47]) {
    P.add('turretDark', box(0.035, 0.22, 0.22), x, 0.48, -2.015);
  }
  // Cabinet-to-basket load paths and a populated lower tray.  The cases sit
  // inside the existing rail envelope rather than replacing or widening it.
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.055, 0.055, 0.52), side * 1.04, 0.25, -1.98,
      0, side * 0.08, 0);
  }
  for (const x of [-0.78, -0.26, 0.26, 0.78]) {
    P.addEquipment('turret', box(0.39, 0.34, 0.30), x, 0.36, -2.18);
    P.add('turretDark', box(0.055, 0.36, 0.32), x, 0.36, -2.18);
    P.add('turretDetail', box(0.19, 0.035, 0.050), x, 0.54, -2.29);
  }
  P.addEquipment('turret', cylX(0.13, 1.10, 14), -0.43, 0.69, -2.22);
  P.addEquipment('turret', cylX(0.11, 0.92, 14), 0.54, 0.67, -2.19);
}

// ===========================================================================
// ZTZ-85-III (WZ-1227F3) — GROUND-UP §K BUILD (§5.248, 2026-08-17)
// ===========================================================================
// Published frame (scout-gen2-type85 packet + batch-B REG): hull 6.40, overall
// 10.28 gun forward, width 3.45 over skirts, height 2.30 to the cupola crown.
// Print work order (docs/references/vertex/ztz85_iii.json, ring frame z=0 at
// world -0.10): hull body -3.99..+2.50, deck 1.41-1.48, welded turret shell
// -1.3..+1.1 with the flat-cheek wedge, bustle/deck stowage band topping
// 1.95, gun axis 1.70, sparse fused tube (print muzzle +4.53 vs published
// overhang — published wins, type59 muzzle-law).  The print runs ~9% tall
// against its own width datum (hull LOW-CONF instrument): published heights
// rule every horizontal line.
function buildZTZ85IIIHullEdges(P: ChinaBuilderPort): void {
  const { box, cylX } = KIT;
  // Stern service shelf, gearbox plate, lights, guard tips, and deep corner
  // flaps all remain above the final-drive wrap and inside the published aft
  // envelope.
  P.add('hull', box(1.86, 0.14, 0.12), 0, 1.30, -3.90);
  P.add('hullDetail', box(1.60, 0.26, 0.09), 0, 1.06, -3.90);
  P.add('hullDark', box(0.34, 0.12, 0.04), 0, 0.86, -3.935);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.12, 0.06, 0.05), side * 0.98, 1.20, -3.94);
    P.add('hullDark', box(0.10, 0.11, 0.12),
      side * 0.66, 0.58, -3.82, 0.3, 0, 0);
    P.add('hull', box(0.50, 0.055, 0.30), side * 1.45, 1.155, -3.82);
    P.add('hullRubber', box(0.52, 0.46, 0.045), side * 1.45, 0.90, -3.97);
  }
  ruFlaps(P, { x: 1.45, w: 0.55, front: [0.94, 0.46], frontZ: 2.47 });
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.04, 0.07, 0.20),
      side * 1.30, 1.13, 2.40, -0.32, 0, 0);
    P.add('hullDark', box(0.04, 0.08, 0.15), side * 1.42, 1.06, -3.90);
    P.add('hullDark', cylX(0.045, 0.46, 10), side * 1.45, 0.41, 2.46);
    P.add('hullDark', box(0.04, 0.22, 0.045), side * 1.45, 0.55, 2.46);
  }

  // The segmented shelf and raised lip carry the 3.45-m width datum from
  // bow to stern while the shallow skirt leaves all six wheels visible.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 12; index++) {
      P.add('hull', box(0.185, 0.030, 0.48),
        side * 1.635, 1.115, -3.60 + index * 0.518);
    }
    for (let index = 0; index < 8; index++) {
      P.add('hull', box(0.045, 0.16, 0.46),
        side * 1.70, 1.20, -3.38 + index * 0.78);
    }
  }
  widthAnchor(P, 1.725, 1.06, -0.55);
  ruSkirtBand(P, {
    x: 1.70, th: 0.05, z0: -3.50, z1: 2.15, yTop: 1.10, yBot: 0.80,
    panels: 7, lipY: 0.78, dressIn: 0.012,
  });
}

function buildZTZ85IIIDeckFurniture(P: ChinaBuilderPort): void {
  const { box, cylY, cylZ, headlight, periscope, towCable, liftEye } = KIT;
  // Fender bins and fuel cells follow the recovered 1.41–1.48-m deck line.
  P.add('hull', box(0.28, 0.30, 1.00), -1.40, 1.295, -0.95);
  P.add('hull', box(0.28, 0.26, 0.72), -1.40, 1.275, 0.35);
  P.add('hull', box(0.28, 0.22, 0.50), -1.40, 1.25, 1.05);
  P.add('hullDark', box(0.24, 0.02, 0.03), -1.40, 1.45, -0.60);
  P.add('hullDetail', cylZ(0.10, 0.80, 10), -1.42, 1.245, -2.55);
  P.add('hullDark', cylZ(0.055, 0.20, 8), -1.42, 1.285, -3.02);
  P.add('hullDark', box(0.05, 0.04, 0.30), -1.42, 1.20, -2.55);
  P.add('hullDetail', box(0.28, 0.24, 0.90), 1.40, 1.25, -1.10);
  P.add('hullDetail', box(0.28, 0.24, 0.90), 1.40, 1.25, -0.05);
  P.add('hullDark', box(0.24, 0.02, 0.03), 1.40, 1.375, -0.58);
  P.add('hull', box(0.28, 0.28, 0.66), 1.40, 1.28, 1.05);

  for (let index = 0; index < 5; index++) {
    P.add('hullDark', box(1.46, 0.018, 0.075),
      0, 1.412, -2.42 - index * 0.24);
    P.add('hullDetail', box(1.46, 0.028, 0.026),
      0, 1.44, -2.54 - index * 0.24);
  }
  for (const [x, z] of [[-0.62, -1.72], [0.55, -1.86], [0.95, -2.10]]) {
    P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), x, 1.452, z);
  }
  P.add('hull', box(1.78, 0.045, 0.20), 0, 1.415, 0.58, -0.32, 0, 0);
  P.add('hull', cylY(0.25, 0.25, 0.045, 14), -0.42, 1.455, 0.28);
  P.add('hullDark', cylY(0.256, 0.256, 0.014, 14), -0.42, 1.468, 0.28);
  periscope(P, 'hullDetail', -0.56, 1.475, 0.52);
  periscope(P, 'hullDetail', -0.28, 1.475, 0.52);

  P.add('hullDetail', cylZ(0.115, 0.20, 12),
    0.46, 1.20, 1.52, -0.30, 0, 0);
  P.add('hullDark', cylZ(0.119, 0.02, 12),
    0.46, 1.23, 1.615, -0.30, 0, 0);
  P.add('hullDark', box(0.06, 0.13, 0.06),
    0.46, 1.10, 1.47, -0.30, 0, 0);
  headlight(P, -0.44, 1.19, 1.55, -0.30, 0.055);
  headlight(P, -0.66, 1.15, 1.60, -0.30, 0.05);
  for (const [x0, x1, yc, zc] of [
    [-0.78, -0.32, 1.17, 1.66],
    [0.30, 0.62, 1.21, 1.63],
  ]) {
    const xm = (x0 + x1) / 2;
    P.add('hullDark', box(0.022, 0.20, 0.022), x0, yc, zc, -0.30, 0, 0);
    P.add('hullDark', box(0.022, 0.20, 0.022), x1, yc, zc, -0.30, 0, 0);
    P.add('hullDark', box(x1 - x0 + 0.022, 0.022, 0.022),
      xm, yc + 0.085, zc + 0.026, -0.30, 0, 0);
    P.add('hullDark', box(x1 - x0 + 0.022, 0.022, 0.022),
      xm, yc - 0.045, zc + 0.065, -0.30, 0, 0);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.10, 0.12, 0.14),
      side * 0.85, 0.62, 2.30, -0.3, 0, 0);
    liftEye(P, 'hullDetail', side * 1.10, 1.30, 1.10);
  }
  towCable(P, [[-0.95, 1.06, 1.72], [0, 1.24, 1.30], [0.95, 1.06, 1.72]]);
}

function buildZTZ85IIIStorageBaskets(P: ChinaBuilderPort): number {
  const { box } = KIT;
  // The -III identity uses slat frames wrapping the side walls into a deep
  // rear basket. Every rail remains tied to the welded turret shell.
  for (const side of [-1, 1]) {
    for (const y of [0.18, 0.34, 0.50]) {
      P.add('turretDetail', box(0.032, 0.026, 2.62),
        side * 1.16, y, -1.04, 0, -side * 0.04, 0);
    }
    for (const z of [0.24, -0.34, -0.92, -1.50, -2.08, -2.34]) {
      P.add('turretDetail', box(0.035, 0.40, 0.035),
        side * 1.155, 0.34, z, 0, -side * 0.05, 0);
    }
    // Open-slat backing keeps the basket see-through like the reference.
    for (const y of [0.205, 0.295, 0.385, 0.475]) {
      P.add('turretDark', box(0.020, 0.058, 2.54),
        side * 1.135, y, -1.05, 0, -side * 0.04, 0);
    }
    P.add('turretDark', box(0.09, 0.030, 0.030),
      side * 1.06, 0.50, 0.22, 0, -side * 0.05, 0);
    P.add('turretDark', box(0.09, 0.030, 0.030),
      side * 1.08, 0.50, -1.04, 0, -side * 0.05, 0);
    P.add('turretDark', box(0.09, 0.030, 0.030),
      side * 0.99, 0.50, -2.24, 0, -side * 0.05, 0);
  }

  const rearBasketZ = -3.16;
  for (const y of [0.16, 0.33, 0.50]) {
    P.add('turretDetail', box(1.84, 0.028, 0.034), 0, y, rearBasketZ);
  }
  for (let index = 0; index < 7; index++) {
    P.add('turretDetail', box(0.032, 0.40, 0.034),
      -0.90 + index * 0.30, 0.33, rearBasketZ);
  }
  // The reference's rear bustle band is solid; the tarped fill remains
  // visible through the open flank baskets.
  P.add('turretDark', box(1.80, 0.36, 0.022),
    0, 0.33, rearBasketZ + 0.025);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.034, 0.028, 0.46),
      side * 0.92, 0.50, -2.94);
    P.add('turretDetail', box(0.034, 0.028, 0.46),
      side * 0.92, 0.16, -2.94);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 1.56, d: 0.40, h: 0.20, fill: 0.35, rails: 2, seed: 8552,
  }), 0, 0.40, -2.94);
  return rearBasketZ;
}

function buildZTZ85III(P: ChinaBuilderPort): void {
  const { box, cylY, cylZ, torus, buildRunningGear, periscope, liftEye } = KIT;
  const seg = P.q ? 18 : 12;

  // ---- six-station running gear phased to the print's own contact line
  // (flat-bottom run -2.88..+1.02, long shallow sprocket rise to the stern,
  // idler wrap topping ~0.9 ahead of the bow flap row, §B4 clear).
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.335, wheelW: 0.24, wheelY: 0.42, xc: 1.34,
    dishR: 0.80,
    wheelZs: [1.02, 0.24, -0.54, -1.32, -2.10, -2.88],
    sprocket: { z: -3.48, y: 0.62, r: 0.29 },
    idler: { z: 1.85, y: 0.58, r: 0.28 },
    rollers: [], trackW: 0.58, topY: 0.88, botY: 0.05,
    paintedEnds: true, coveredTop: true, arms: true,
    contactZF: 1.02, contactZR: -2.88,
  });

  // ---- lofted hull to the published envelope: stern -3.90, bow toe +2.50,
  // deck 1.41-1.44 held FLAT to the stern (print line), long shallow
  // composite glacis (the Type 85's 17-deg plate), belly 0.375 (print
  // front-view floor 0.38).
  loftHull(P, {
    deck: [[-3.90, 1.38], [-3.45, 1.41], [-2.30, 1.43],
      [-0.90, 1.44], [0.72, 1.44], [0.95, 1.42], [2.50, 0.90]],
    belly: [[-3.90, 0.58], [-3.50, 0.40], [-2.60, 0.375], [1.55, 0.375],
      [2.28, 0.52], [2.50, 0.86]],
    wUp: [[-3.90, 1.575], [2.10, 1.575], [2.50, 1.28]],
    wLo: [[-3.90, 0.92], [2.50, 0.92]],
    sponsonY: 1.13,
  });
  buildZTZ85IIIHullEdges(P);
  buildZTZ85IIIDeckFurniture(P);

  // ---- WELDED TURRET (the -III identity): one connected multi-ring shell —
  // near-vertical lower belt through a weld shoulder into the raked flat
  // cheeks and side walls.  The roof RAKES REARWARD like the print's: cheek
  // apex 2.30 world (the published height datum) falling to 2.18 over the
  // bustle; the commander cupola crown rides the same 2.30 line.
  P.turretG.position.set(0, 1.44, -0.10);
  // The former 2.28 m plan stopped at the ring and left its gun and two
  // rear-deck racks reading as independent props.  Keep the same welded
  // cheek language, but carry the casting into a full 4.55 m turret body:
  // a slightly longer nose seats the mantlet while almost all of the added
  // length becomes a low integral bustle over the engine deck.
  const turretShellFrontZ = 1.55;
  const turretShellRearZ = -3.00;
  const plan85: Vec2Tuple[] = [
    [0.34, turretShellFrontZ], [0.74, 1.22], [1.12, 0.25], [1.18, -0.55],
    [1.16, -1.55], [1.05, -2.55], [0.52, turretShellRearZ],
    [-0.52, turretShellRearZ], [-1.05, -2.55], [-1.16, -1.55],
    [-1.18, -0.55], [-1.12, 0.25], [-0.74, 1.22], [-0.34, turretShellFrontZ],
  ];
  const inset85 = [0.54, 0.58, 0.76, 0.82, 0.85, 0.88, 0.90,
    0.90, 0.88, 0.85, 0.82, 0.76, 0.58, 0.54];
  const crown85 = [0.86, 0.85, 0.80, 0.78, 0.75, 0.73, 0.72,
    0.72, 0.73, 0.75, 0.78, 0.80, 0.85, 0.86];
  P.add('turret', KIT.polyMultiLoft(plan85, [
    { height: 0.02, inset: 1.0 },
    { height: 0.30, inset: 1.0 },
    { height: crown85, inset: inset85, centerHeight: 0.80 },
  ]));
  crownRimTrim(P, plan85, inset85, crown85);
  // ring skirt seats the shell on the deck at every yaw (§B2)
  P.add('turret', cylY(1.02, 1.08, 0.10, seg), 0, -0.03, -0.05);
  // weld seam beads along the belt/cheek break
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.022, 0.022, 0.86), s * 0.845, 0.315, 0.60, 0, -s * 0.32, 0);
    P.add('turretDark', box(0.022, 0.022, 2.62), s * 1.075, 0.315, -0.98, 0, -s * 0.06, 0);
  }

  // Twin bustle panniers replace the hull-owned floating rack.  Each floor
  // is planted into the extended crown and the transverse beams overlap the
  // welded shell, so the complete assembly follows turret yaw as one body.
  const bustleRackZ = -2.05;
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.70, 0.16, 1.48), s * 0.59, 0.79, bustleRackZ);
    P.add('turretDark', box(0.62, 0.025, 1.34), s * 0.59, 0.8825, bustleRackZ);
    for (const z of [-1.47, -2.61]) {
      P.add('turretDetail', box(0.58, 0.16, 0.045), s * 0.59, 0.76, z);
    }
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 0.64, d: 1.34, h: 0.20, fill: 0.48, rails: 2,
      seed: 8551 + (s > 0 ? 1 : 0),
    });
    rack.name = `ztz85iii_bustleRack_${s < 0 ? 'left' : 'right'}`;
    mount(P, 'turret', rack, s * 0.59, 0.885, bustleRackZ);
  }
  P.add('turretDetail', box(1.72, 0.09, 0.10), 0, 0.78, -1.42);
  P.add('turretDetail', box(1.48, 0.09, 0.10), 0, 0.74, -2.68);

  // ---- roof stations on the raked roof: cupola RIGHT (crown 2.30 world =
  // the cheek-apex line), flush loader hatch LEFT, low armored gunner-sight
  // box right-forward (ISFCS-212 class).
  P.add('turret', cylY(0.265, 0.285, 0.055, seg), 0.55, 0.8075, -0.35);
  P.add('turret', cylY(0.235, 0.235, 0.028, seg), 0.55, 0.849, -0.35);
  P.add('turretDark', torus(0.245, 0.013, seg), 0.55, 0.851, -0.35);
  P.add('turretDetail', box(0.11, 0.050, 0.16), 0.55, 0.835, -0.10);
  periscope(P, 'turretDetail', 0.38, 0.82, -0.35);
  P.add('turret', cylY(0.235, 0.245, 0.040, seg), -0.48, 0.80, -0.30);
  P.add('turretDark', torus(0.24, 0.013, seg), -0.48, 0.822, -0.30);
  // ISFCS-212 head raised to the print's forward-cluster band (2.28 -> 2.41
  // world; z-span 0.34 stays inside the P95 spike budget — the W-85 keeps
  // the silhouette row)
  chamferBox85(P, 0.30, 0.24, 0.34, 0.28, 0.80, 0.42);
  P.add('turretDark', box(0.22, 0.085, 0.030), 0.28, 0.845, 0.60);
  P.add('turretGlass', box(0.15, 0.060, 0.018), 0.28, 0.845, 0.618);
  P.add('turretDetail', box(0.32, 0.028, 0.36), 0.28, 0.935, 0.42);
  // low vent dome center-rear (flattened; the raked roof is ~0.75 here)
  P.add('turret', cylY(0.125, 0.135, 0.055, 12), -0.10, 0.775, -0.72);
  P.add('turret', cylY(0.09, 0.125, 0.030, 12), -0.10, 0.817, -0.72);
  periscope(P, 'turretDetail', -0.25, 0.83, -0.05);

  // W-85 12.7 mm at the commander ring (MG law).  The cluster is seated so
  // its columns land inside the print's own 2.5-2.75 roof-cluster band —
  // heightM keeps the published 2.30 crown while silhouetteHeightM carries
  // the mounted-MG convention (t62mv1 precedent).
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'dshk', scale: 0.68, tone: 'two-tone', elev: 0.06,
    ammo: true, rotation: [0, 0.55, 0], seed: 8560,
  }), 0.55, 0.845, -0.45);

  // smoke banks: 2x4 on the upper cheek flanks (Type 85 signature)
  addSmokeBanks(P, 1.00, 0.52, 0.62, 4, 8530);

  const rearBasketZ = buildZTZ85IIIStorageBaskets(P);

  // command-variant RADIO MAST on the basket's rear-left corner — the
  // print's dominant vertical: staged tube on a planted collar bridging the
  // rear backing rails, guyed to the shell, whip tip above.  Two chased
  // variants were built, measured and REVERTED with receipts in the round
  // packet: the fat vertical stack (whole 87.4 -> 85.6) and the print-true
  // aft-raked stack (floaters 0 at yaw poses + P95 3.93 volatility).  The
  // narrow z-column keeps the W-85 cluster on the P95/silhouette row.
  P.add('turretDark', box(0.16, 0.05, 0.24), -0.85, 0.50, -3.15);
  // radio junction box at the mast foot (the print's rear-shoulder mass)
  P.add('turretDark', box(0.24, 0.20, 0.22), -0.83, 0.63, -2.96);
  P.add('turretDetail', box(0.026, 0.10, 0.16), -0.70, 0.60, -2.88);
  P.add('turretDetail', cylY(0.055, 0.070, 0.14, 10), -0.85, 0.59, -3.18);
  P.add('turretDetail', cylY(0.042, 0.050, 0.85, 10), -0.85, 1.08, -3.18);
  P.add('turretDark', cylY(0.052, 0.052, 0.05, 10), -0.85, 1.52, -3.18);
  P.add('turretDetail', cylY(0.030, 0.038, 0.75, 10), -0.85, 1.92, -3.18);
  P.add('turretDark', box(0.10, 0.09, 0.10), -0.85, 2.32, -3.18);
  // guy stay tying the mast mid-stage to the shell rear wall
  P.add('turretDark', box(0.026, 0.026, 0.52), -0.85, 0.94, -2.92, -0.55, 0, 0);
  mount(P, 'turret', FITTINGS.antennaWhip({
    mats: P.mats, h: 0.95, r: 0.014, rake: -0.05, seed: 8543,
  }), -0.85, 2.36, -3.18);
  P.add('turretDetail', cylY(0.034, 0.044, 0.055, 10), 0.92, 0.52, -0.95);
  mount(P, 'turret', FITTINGS.antennaWhip({
    mats: P.mats, h: 0.72, r: 0.012, rake: 0.06, seed: 8544,
  }), 0.92, 0.55, -0.95);
  // roof lift eyes + side grab rails
  for (const s of [-1, 1]) {
    liftEye(P, 'turretDetail', s * 0.72, 0.78, 0.12);
    P.add('turretDetail', box(0.026, 0.026, 0.62), s * 1.00, 0.62, 0.30, 0, -s * 0.42, 0);
  }

  // ---- 125 mm autoloaded gun: axis 1.70 world, compact Soviet-style saddle
  // in the flat nose face, evacuator at the print's mid-tube band.  MUZZLE
  // LAW (type59 precedent): the tube matches the print's extracted visible
  // tube (muzzle +4.43 world) — published 10.28 overall stays the spec/UI
  // datum via overallLengthM while silhouetteOverallLengthM carries the
  // authored span, and the whole-registered gate frame stays counterweighted
  // (a published-length tube dragged the body registration -0.75 m).
  const gunPivotZ = 1.10;
  P.gunG.position.set(0, 0.26, gunPivotZ);
  // §5.266 critic fix 3: the proud saddle doghouse + brow read against the
  // print's recessed mantlet shadow — the root box is tucked behind the
  // nose line (built shallower/lower) and the brow plate is deleted; the
  // canvas collar and dark recess ring carry the mantlet read.
  P.addGunExtra(box(0.70, 0.46, 0.34), 0, 0.00, 0.08);
  P.addGunExtra(cylZ(0.17, 0.38, seg, 0.23), 0, 0, 0.32);
  P.addGunExtraDark(cylZ(0.235, 0.040, seg), 0, 0, 0.13);
  P.addGunExtraDark(box(0.62, 0.055, 0.12), 0, -0.225, 0.10);
  // gun-slaved IR illuminator tucked onto the saddle shoulder LEFT
  P.addGunExtra(cylZ(0.09, 0.13, 12), -0.38, 0.13, 0.24);
  P.addGunExtraDark(cylZ(0.094, 0.015, 12), -0.38, 0.13, 0.315);
  P.addGunExtraDark(box(0.05, 0.12, 0.05), -0.38, 0.015, 0.20);
  tubeGun(P, [
    [0.52, 1.50, 0.108], [1.50, 2.45, 0.098], [2.45, 3.05, 0.126],
    [3.05, 3.72, 0.094], [3.72, 4.03, 0.099],
  ], { rings: [[1.50, 0.112], [2.45, 0.129], [3.05, 0.129], [3.72, 0.103]], muzzle: 4.03 });
  muzzleBore(P, { r: 0.083 }); // §B3.1

  P.turretG.userData.ztz85iiiAttachmentReceipt = Object.freeze({
    originalShellLengthM: 2.28,
    shellFrontZ: turretShellFrontZ,
    shellRearZ: turretShellRearZ,
    shellLengthM: turretShellFrontZ - turretShellRearZ,
    lengthRatio: (turretShellFrontZ - turretShellRearZ) / 2.28,
    gunPivotZ,
    gunMountRearZ: gunPivotZ - 0.09,
    gunMountOverlapM: turretShellFrontZ - (gunPivotZ - 0.09),
    bustleRackFloorY: 0.885,
    bustleCrownY: 0.72,
    bustleRackNames: ['ztz85iii_bustleRack_left', 'ztz85iii_bustleRack_right'],
    rearBasketZ,
  });

  // §5.266 critic fix 2: the mid-wall seats reseated onto the shell BEHIND
  // the basket backing (markings ray only sees the 'turret' bucket) — both
  // marks now live on the exposed forward flank band (z +0.29..+0.95, under
  // the smoke banks; §5.04 vertical-flank law).  The authored star also
  // preempts the hidden auto-anchor insignia.
  P.decal('turret', 'star', null, 0.22, [1.05, 0.27, 0.68], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '85-III', 0.21, [1.06, 0.27, 0.40], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '85-III', 0.21, [-1.05, 0.27, 0.55], -Math.PI / 2);
  P.topY = 1.18;
}

// low armored sight box with layered plan chamfers (no bare-cuboid read)
function chamferBox85(
  P: ChinaBuilderPort,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): void {
  const { box } = KIT;
  P.add('turret', box(w, h, d - 0.10), x, y, z);
  P.add('turret', box(w - 0.10, h, d), x, y, z);
  P.add('turretDark', box(w * 0.62, 0.016, d * 0.62), x, y + h / 2 + 0.008, z);
}

// §5.266 critic fix (both turrets): the polyMultiLoft crown ring caught sun
// as a pale unpainted ribbon in plan/top-tilt.  Dress the rim with a dark
// weld-trim band: one thin plate per plan edge hugging the lip (2 mm proud
// of the ring — inside AA, mask-neutral) and lapping 7 cm onto the roof.
function crownRimTrim(
  P: ChinaBuilderPort,
  plan: readonly Vec2Tuple[],
  insets: number | readonly number[],
  crowns: number | readonly number[],
): void {
  const n = plan.length;
  const cx = plan.reduce((s, p) => s + p[0], 0) / n;
  const cz = plan.reduce((s, p) => s + p[1], 0) / n;
  const at = (value: number | readonly number[], index: number): number => (
    typeof value === 'number' ? value : value[index]
  );
  const ring = plan.map(([x, z], i) => [
    cx + (x - cx) * at(insets, i), at(crowns, i), cz + (z - cz) * at(insets, i)]);
  const pull = (point: readonly number[], scale: number): Vec3Tuple => [
    point[0] + (cx - point[0]) * scale,
    point[1],
    point[2] + (cz - point[2]) * scale,
  ];
  for (let i = 0; i < n; i++) {
    const a = ring[i]; const b = ring[(i + 1) % n];
    const ao = pull(a, -0.004); const bo = pull(b, -0.004);
    const ai = pull(a, 0.075); const bi = pull(b, 0.075);
    P.add('turretDark', orientedSlab(
      [ao[0], ao[1] - 0.030, ao[2]], [bo[0], bo[1] - 0.030, bo[2]],
      [bi[0], bi[1] + 0.002, bi[2]], [ai[0], ai[1] + 0.002, ai[2]],
      [ao[0], ao[1] - 0.016, ao[2]], [bo[0], bo[1] - 0.016, bo[2]],
      [bi[0], bi[1] + 0.014, bi[2]], [ai[0], ai[1] + 0.014, ai[2]]));
  }
}

// ===========================================================================
// ZTZ-99A2 — GROUND-UP §K BUILD (§5.248, 2026-08-17)
// ===========================================================================
// Published frame (batch-B REG receipts): hull 7.6, overall 11.0 gun forward,
// width 3.7 over skirts, turret roof 2.37 (spec heightM 2.45 = §5.73-1 P95
// with the flat roof plane; silhouette rows carry the drum-inclusive trace).
// Print work order (docs/references/vertex/ztz99a2.json, ring frame z=0 at
// world -0.15): hull -5.15..+2.65 print (=-4.05..+3.75 here, bow trimmed to
// the published 7.6), deck 1.72, DEEP wedge cheeks falling 2.5 -> 2.06 to a
// +1.7 nose, bustle roof 2.45 running to -2.7, forward-left sight head
// (print 2.79), rear-right mast cluster (print 2.99), gun axis 1.95, twin
// rear fuel drums hanging 1.5..2.1 behind the transom.  This tank is
// DISTINCT from the resident type99a: longer/deeper cheek wedge, revised
// roof optics, drum rack — and its own frame throughout.
export function buildZTZ99A2Hull(P: ChinaBuilderPort): void {
  const { box, cylX, cylY, cylZ, torus, buildRunningGear, headlight, periscope, towCable, liftEye } = KIT;
  const seg = P.q ? 20 : 14;

  // ---- six large-wheel stations, rear drive, covered return run.
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.47, wheelW: 0.26, wheelY: 0.54, xc: 1.47,
    dishR: 0.78, wheelHex: '#4b523c',
    wheelZs: [2.14, 1.30, 0.46, -0.38, -1.22, -2.06],
    sprocket: { z: -3.05, y: 0.78, r: 0.39 },
    idler: { z: 2.95, y: 0.74, r: 0.36 },
    rollers: [], trackW: 0.63, topY: 1.24, botY: 0.06,
    paintedEnds: true, coveredTop: true, arms: true,
    contactZF: 2.14, contactZR: -2.06,
  });

  // ---- lofted hull: stern -4.05, bow toe +3.55, rear deck 1.70 (print
  // 1.72), long shallow glacis to the published 7.6 envelope.
  loftHull(P, {
    deck: [[-4.05, 1.60], [-3.80, 1.68], [-2.05, 1.72], [-0.30, 1.68],
      [1.90, 1.64], [3.55, 1.02]],
    belly: [[-4.05, 0.70], [-3.35, 0.46], [2.15, 0.46], [3.10, 0.60],
      [3.55, 0.96]],
    wUp: [[-4.05, 1.66], [3.10, 1.66], [3.55, 1.26]],
    wLo: [[-4.05, 1.06], [3.55, 1.06]],
    sponsonY: 1.36,
  });
  // fender shelf: the print carries its full 3.7 width at deck height from
  // stern to bow shoulder — segmented plates bridge sponson edge to the
  // skirt hanger line.
  ([-1, 1] as const).forEach((s) => {
    for (let i = 0; i < 12; i++) {
      P.add('hull', box(0.20, 0.032, 0.52), s * 1.755, 1.60, -3.70 + i * 0.575);
    }
    // lower tub side strakes: the print's hull side wall hangs to ~0.34
    // at the sponson line while the centre belly stays at 0.46 — real
    // deep-tub side plates, laterally clear of the track lane (§B4).
    for (let i = 0; i < 9; i++) {
      P.add('hull', box(0.055, 0.26, 0.56), s * 1.035, 0.49, -3.20 + i * 0.655);
    }
    // One closed six-station shoulder now overlaps every adjoining system:
    // deck/fender at the rear, first skirt cassette at the outer belt,
    // glacis at the inner edge and the transverse mudguard at the bow. The
    // former eight-corner slab pinched diagonally and exposed daylight from
    // low oblique views; this loft is a single convex structural body.
    const shoulderPlanRight: Vec2Tuple[] = [
      [1.02, 1.36], [1.72, 1.18], [1.84, 2.70],
      [1.84, 3.48], [1.10, 3.48], [0.72, 3.32],
    ];
    const shoulderLowerRight = [1.46, 1.42, 1.18, 0.98, 0.98, 0.96];
    const shoulderUpperRight = [1.62, 1.60, 1.50, 1.40, 1.39, 1.14];
    const shoulderPlan = s > 0
      ? shoulderPlanRight
      : shoulderPlanRight.map(([x, z]) => [-x, z] as Vec2Tuple).reverse();
    const shoulderLower = s > 0 ? shoulderLowerRight : [...shoulderLowerRight].reverse();
    const shoulderUpper = s > 0 ? shoulderUpperRight : [...shoulderUpperRight].reverse();
    P.add('hull', KIT.polyMultiLoft(shoulderPlan, [
      { height: shoulderLower, inset: 1 },
      { height: shoulderUpper, inset: 1 },
    ]));
  });

  // ---- glacis chevron armor: three raked panel courses with real seam
  // breaks (slope motivates the mass — no tile blanket, no stair steps).
  P.visualEraCluster('ztz99a2-glacis-era', 'hull', () => {
  P.add('hull', orientedSlab(
    [-1.10, 1.64, 1.35], [1.10, 1.64, 1.35], [1.10, 1.60, 1.10], [-1.10, 1.60, 1.10],
    [-0.72, 1.10, 3.40], [0.72, 1.10, 3.40], [0.72, 1.02, 3.22], [-0.72, 1.02, 3.22]));
  for (const s of [-1, 1]) {
    // outboard corners ride ABOVE the idler shoe sweep (§B4: the first cut
    // put the panel toe at y ~1.0 inside the wrap corner — 51 band vox)
    P.add('hull', orientedSlab(
      [s * 1.10, 1.62, 1.28], [s * 1.62, 1.60, 1.02], [s * 1.62, 1.56, 0.82], [s * 1.10, 1.58, 1.06],
      [s * 0.72, 1.08, 3.34], [s * 1.20, 1.22, 2.96], [s * 1.20, 1.16, 2.80], [s * 0.72, 1.00, 3.16]));
    P.add('hullDark', box(0.045, 0.045, 1.30), s * 0.91, 1.37, 2.22, -0.25, s * 0.22, 0);
  }
  P.add('hull', box(1.90, 0.05, 0.22), 0, 1.63, 1.18, -0.30, 0, 0);
  });
  // driver center station behind the chevron crest
  P.add('hull', box(0.54, 0.05, 0.46), 0, 1.685, 0.62);
  P.add('hullDark', cylY(0.24, 0.24, 0.016, 14), 0, 1.715, 0.60);
  [-0.17, 0.17].forEach((x) => periscope(P, 'hullDetail', x, 1.72, 0.86));
  // bow lights on riser pods + tow points + routed cable
  ([-1, 1] as const).forEach((s) => {
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045, rake: -0.22, seed: 9950 + s,
    }), s * 0.95, 1.13, 3.06);
    // §5.266 fix 4: dark bezels + glass lenses tone the pod faces
    for (const dx of [-0.065, 0.065]) {
      P.add('hullDark', cylZ(0.048, 0.014, 12), s * 0.95 + dx, 1.145, 3.115, -0.22, 0, 0);
      P.add('hullGlass', cylZ(0.037, 0.012, 12), s * 0.95 + dx, 1.145, 3.124, -0.22, 0, 0);
    }
    // headlight pair lifted clear of the idler shoe sweep (§B4 voxel margin)
    headlight(P, s * 1.02, 1.18, 3.14, -0.24, 0.042);
    P.add('hullDark', box(0.10, 0.12, 0.15), s * 0.72, 0.66, 3.30, -0.3, 0, 0);
    liftEye(P, 'hullDetail', s * 1.30, 1.42, 2.30);
  });
  towCable(P, [[-1.10, 1.18, 3.06], [-0.42, 1.32, 2.30], [0.48, 1.30, 2.26], [1.10, 1.18, 3.06]]);
  // Broad transverse steel guards replace the detached rubber bow flaps.
  // Their complete rear face is buried 47.5 mm into the new shoulder loft;
  // top and bottom datums exactly match its front stations, so the guard,
  // upper glacis and skirt read as one connected armored shoulder.
  ([-1, 1] as const).forEach((s) => {
    MUDGUARDS.add(P, {
      label: `ztz99a2-front-mudguard-${s < 0 ? 'left' : 'right'}`,
      x: s * 1.47, y: 1.19, z: 3.46,
      thickness: 0.055, length: 0.74, height: 0.42,
      rotation: [0, Math.PI / 2, 0], crown: 0.026,
      frontCut: 0.09, rearCut: 0.025, rake: 0.08,
    });
  });
  ruFlaps(P, { x: 1.47, w: 0.50, rear: [0.86, 0.46], rearZ: -4.02 });

  // ---- heavy side modules: four rigid forward bays with cassette blocks +
  // two rubber rear bays, outer faces on the 3.70 width datum.  §5.266
  // critic fix 1: bay bottoms raised 0.44 -> 0.62 so ~half the wheel run
  // reads side-on (the print's own proportion).
  ([-1, 1] as const).forEach((s) => {
    P.add('hull', box(0.06, 0.16, 6.60), s * 1.79, 1.48, -0.20);
    for (let i = 0; i < 6; i++) {
      const z = 2.42 - i * 1.02;
      const rigid = i < 4;
      P.add(rigid ? 'hull' : 'hullRubber',
        box(0.045, 0.78, 0.96), s * 1.828, 1.01, z);
      P.add('hullDark', box(0.05, 0.06, 0.90), s * 1.829, 1.43, z);
      if (rigid) {
        armorCassette(P, 'hull', s * 1.862, 1.04, z, 0.055, 0.54, 0.78,
          [0, 0, -s * 0.015], true);
        P.add('hullDark', box(0.020, 0.030, 0.62), s * 1.887, 1.27, z);
      }
    }
  });
  widthAnchor(P, 1.85, 1.05, 0.40);

  // ---- rear deck + transom: louvre field, service transom, twin fuel drums
  // on real angle brackets and a center rack (print band 1.5..2.1 at the
  // stern — the silhouette rows in specs carry this overhang).
  Array.from({ length: 7 }, (_, index) => index).forEach((i) => {
    P.add('hullDark', box(2.50, 0.018, 0.075), 0, 1.712, -2.10 - i * 0.24);
    P.add('hullDetail', box(2.50, 0.028, 0.026), 0, 1.735, -2.22 - i * 0.24);
  });
  ([[-0.85, -1.75], [0.72, -1.88]] as const).forEach(([x, z]) => {
    P.add('hullDetail', cylY(0.095, 0.095, 0.032, 10), x, 1.725, z);
  });
  P.add('hull', box(3.26, 0.94, 0.12), 0, 1.06, -3.99);
  P.add('hullDark', box(2.20, 0.50, 0.035), 0, 1.12, -4.055);
  Array.from({ length: 8 }, (_, index) => index).forEach((i) => {
    P.add('hullDetail', box(0.035, 0.44, 0.042), -1.00 + i * 0.286, 1.12, -4.07);
  });
  ([-1, 1] as const).forEach((s) => {
    // drum + dark end caps + straps + twin angle brackets into the transom
    // (print band: y 1.5..2.1 hanging aft — the isolated aft-stretch A/B
    // measured +0.4 on the whole gate; the short-whip change in the same
    // batch was the regression and is reverted separately)
    P.add('hullDetail', cylX(0.32, 0.80, seg), s * 0.76, 1.79, -4.56);
    P.add('hullDark', cylX(0.325, 0.03, seg), s * (0.76 + 0.385), 1.79, -4.56);
    P.add('hullDark', cylX(0.325, 0.03, seg), s * (0.76 - 0.385), 1.79, -4.56);
    for (const dx of [-0.24, 0.24]) {
      P.add('hullDark', box(0.05, 0.68, 0.05), s * (0.76 + dx), 1.77, -4.56);
      P.add('hullDark', box(0.05, 0.10, 0.46), s * (0.76 + dx), 1.52, -4.28, 0.22, 0, 0);
    }
    P.add('hullDark', box(0.12, 0.06, 0.05), s * 1.02, 1.30, -4.06);
    P.add('hullDetail', torus(0.10, 0.021, 12), s * 0.55, 0.92, -4.06, Math.PI / 2, 0, 0);
  });
  mount(P, 'hull', FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.34, h: 0.22, fill: 0.34, rails: 2, seed: 9955,
  }), 0, 1.88, -4.30);

  // These bridge plates close the paired stern service-deck wells. They are
  // hull structure and must travel with the hull when another vehicle uses
  // this exact chassis, rather than being coupled to the A2 turret package.
  ([-1, 1] as const).forEach((side) => {
    P.add('hull', box(0.30, 0.025, 0.42), side * 0.81, 1.38, -4.20);
  });
  P.hullG.userData.ztz99a2HullIntegrationReceipt = Object.freeze({
    architecture: 'ztz99a2-production-chassis-r3',
    shoulderVolumes: 2,
    shoulderStationsPerSide: 6,
    shoulderFrontZM: 3.48,
    frontMudguards: 2,
    frontMudguardsAttachedToShoulders: true,
    frontMudguardShoulderOverlapM: 0.0475,
    floatingBowStiffenersRemoved: true,
    shoulderSkirtJoinGapM: 0,
    endWheelLiftM: 0.10,
    idlerYM: 0.74,
    rearSprocketYM: 0.78,
  });
}

function buildZTZ99A2PrototypeTurret(P: ChinaBuilderPort): void {
  const { box, cylY, cylZ, torus, periscope, liftEye } = KIT;
  const seg = P.q ? 20 : 14;

  // ---- WELDED WEDGE TURRET: one connected shell with the A2's DEEP cheek
  // rake (nose base +1.45 world raking to the +0.66 crown lip), near-vertical
  // side belt, flat 2.45 roof and a long integral bustle.
  P.turretG.position.set(0, 1.56, -0.15);
  // §5.266 critic fix 3: the plan nose broadened toward the print's ~1.0 m
  // arrow chord (was a ~0.6 m pinch).
  const plan99: Vec2Tuple[] = [
    [0.44, 1.58], [1.02, 0.95], [1.46, 0.12], [1.54, -0.60], [1.38, -1.55],
    [0.62, -1.72], [-0.62, -1.72], [-1.38, -1.55], [-1.54, -0.60],
    [-1.46, 0.12], [-1.02, 0.95], [-0.44, 1.58],
  ];
  const inset99 = [0.52, 0.56, 0.80, 0.82, 0.88, 0.92, 0.92, 0.88, 0.82, 0.80, 0.56, 0.52];
  const crown99 = 0.89;
  P.add('turret', KIT.polyMultiLoft(plan99, [
    { height: 0.03, inset: 1.0 },
    { height: 0.34, inset: 1.0 },
    { height: crown99, inset: inset99, centerHeight: 0.89 },
  ]));
  crownRimTrim(P, plan99, inset99, crown99);
  P.add('turret', cylY(1.10, 1.16, 0.11, seg), 0, -0.04, -0.30);
  // Turret-side service modules are socketed into the shell rather than
  // hovering beyond it. Their inner faces cross the belt envelope, while the
  // rails and weld strips sit fractionally proud of the installed cassettes.
  for (const s of [-1, 1]) {
    for (const y of [0.14, 0.42]) {
      P.add('turretDetail', box(0.034, 0.030, 1.64), s * 1.585, y, -0.72, 0, -s * 0.04, 0);
    }
    for (const z of [-0.02, -0.70, -1.34]) {
      P.add('turretDetail', box(0.036, 0.36, 0.036), s * 1.580, 0.28, z, 0, -s * 0.04, 0);
    }
    P.add('turretDark', box(0.22, 0.40, 0.76), s * 1.49, 0.30, -0.30, 0, -s * 0.04, 0);
    P.add('turretDark', box(0.20, 0.36, 0.56), s * 1.47, 0.28, -1.22, 0, -s * 0.04, 0);
    P.add('turret', box(0.24, 0.34, 0.68), s * 1.49, 0.30, 0.39, 0, -s * 0.10, 0);
    P.add('turretDetail', box(0.23, 0.035, 0.64), s * 1.50, 0.505, -0.30, 0, -s * 0.04, 0);
    P.add('turretDark', box(0.065, 0.05, 0.58), s * 1.555, 0.14, 0.39, 0, -s * 0.10, 0);
  }
  // deep add-on cheek cassettes following the wedge rake (the A2 tell):
  // two courses per side, seam battens between, gun channel kept open.
  P.visualEraCluster('ztz99a2-cheek-era', 'turret', () => {
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.34, 0.06, 1.52], [s * 0.94, 0.06, 0.90], [s * 0.80, 0.06, 0.62], [s * 0.30, 0.06, 1.18],
      [s * 0.26, 0.62, 0.94], [s * 0.68, 0.60, 0.56], [s * 0.60, 0.56, 0.36], [s * 0.24, 0.58, 0.70]));
    P.add('turret', orientedSlab(
      [s * 0.94, 0.06, 0.90], [s * 1.55, 0.08, 0.16], [s * 1.36, 0.08, -0.06], [s * 0.80, 0.06, 0.62],
      [s * 0.68, 0.60, 0.56], [s * 1.14, 0.62, 0.10], [s * 1.04, 0.58, -0.10], [s * 0.60, 0.56, 0.36]));
    P.add('turretDark', box(0.035, 0.44, 0.035), s * 0.84, 0.32, 0.78, -0.42, s * 0.72, 0);
    P.add('turretDark', box(1.06, 0.026, 0.045), s * 0.80, 0.625, 0.48, 0, s * 0.62, 0);
  }
  });
  // nose beak walls flanking the OPEN gun channel: the print's wedge line
  // keeps falling 2.5 -> 2.06 out to +1.7 world — two raked prisms continue
  // the cheek slope past the crown lip; the channel stays clear through the
  // full elevation arc (§B3.1).  §5.266 fix 3: chord widened with the plan
  // nose (walls now span x 0.20..0.56 per side — the broad-arrow read).
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.20, 0.30, 1.60], [s * 0.56, 0.32, 1.42], [s * 0.50, 0.40, 0.98], [s * 0.18, 0.38, 1.10],
      [s * 0.20, 0.50, 1.68], [s * 0.56, 0.52, 1.50], [s * 0.44, 0.84, 0.84], [s * 0.16, 0.82, 0.92]));
    P.add('turretDark', box(0.030, 0.030, 0.62), s * 0.34, 0.60, 1.24, -0.36, 0, 0);
  }
  // weld beads along the belt shoulder
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.030, 0.030, 1.40), s * 1.515, 0.340, -0.24, 0, -s * 0.04, 0);
    P.add('turretDark', box(0.030, 0.030, 1.02), s * 1.20, 0.340, 1.30, 0, -s * 0.60, 0);
  }

  // ---- roof suite (print layout): forward-LEFT panoramic head, recessed
  // gunner box right of the gun channel, commander cupola + W-85 right,
  // rear-right mast cluster, LWR pair on the cheek lips.
  P.add('turret', box(0.36, 0.09, 0.32), -0.55, 0.935, 0.30);
  P.add('turretDetail', cylY(0.095, 0.105, 0.14, 12), -0.55, 1.05, 0.30);
  P.add('turret', box(0.28, 0.20, 0.24), -0.55, 1.22, 0.30);
  P.add('turretDark', box(0.20, 0.11, 0.030), -0.55, 1.24, 0.435);
  P.add('turretGlass', box(0.14, 0.075, 0.018), -0.55, 1.24, 0.452);
  P.add('turret', box(0.46, 0.15, 0.42), 0.44, 0.945, 0.40);
  P.add('turret', box(0.38, 0.14, 0.34), 0.44, 1.06, 0.36);
  P.add('turretDark', box(0.28, 0.085, 0.032), 0.44, 1.07, 0.545);
  P.add('turretGlass', box(0.20, 0.06, 0.018), 0.44, 1.07, 0.563);
  P.add('turretDetail', box(0.42, 0.030, 0.38), 0.44, 1.145, 0.36);
  P.add('turret', cylY(0.27, 0.29, 0.075, seg), 0.52, 0.9275, -0.83);
  P.add('turretDark', torus(0.275, 0.014, seg), 0.52, 0.97, -0.83);
  periscope(P, 'turretDetail', 0.30, 0.955, -0.83);
  // the W-85 cluster sits over the print's own rear-right 2.9-class roof
  // band, sharing columns with the mast station behind it
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'dshk', scale: 0.76, tone: 'two-tone', elev: 0.12,
    ammo: true, rotation: [0, 0.10, 0], seed: 9960,
  }), 0.52, 1.00, -0.79);
  P.add('turret', cylY(0.24, 0.25, 0.045, seg), -0.50, 0.9125, -0.55);
  P.add('turretDark', torus(0.245, 0.013, seg), -0.50, 0.935, -0.55);
  // rear-right mast: planted base, tube, compact head (print's 2.99 cluster)
  P.add('turret', box(0.20, 0.10, 0.20), 0.60, 0.94, -1.15);
  P.add('turretDetail', cylY(0.026, 0.034, 0.38, 10), 0.60, 1.16, -1.15);
  P.add('turretDark', box(0.16, 0.07, 0.09), 0.60, 1.38, -1.15);
  // laser-warning boxes on the cheek lips
  for (const s of [-1, 1]) {
    P.add('turret', box(0.18, 0.08, 0.16), s * 0.98, 0.945, 0.14);
    P.add('turretGlass', box(0.11, 0.055, 0.020), s * 0.98, 0.95, 0.225);
  }
  for (const [x, z, r] of [
    [0.20, 0.30, 0.32], [-0.24, -0.12, -0.30], [0.80, -0.20, 0.14],
  ]) periscope(P, 'turretDetail', x, 0.915, z, r);

  // ---- integral bustle basket: a rear-facing open rack plus two seated
  // side panniers.  The old rack sat on the TOP rail and faced into the
  // turret, leaving the full rear/side basket volume visibly empty.  This
  // rack starts on the lower cradle, opens aft and carries soft stowage from
  // floor to crown; the panniers overlap the bustle shell at their forward
  // ends and remain inside the side-return rails (§B2 / §B5).
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.038, 0.038, 0.86), s * 1.29, 0.80, -2.02, 0, s * 0.10, 0);
    P.add('turretDetail', box(0.038, 0.038, 0.86), s * 1.29, 0.22, -2.02, 0, s * 0.10, 0);
    P.add('turretDetail', box(0.038, 0.56, 0.038), s * 1.335, 0.51, -1.60);

    for (const [z, y, h] of [[-2.20, 0.43, 0.34], [-1.84, 0.48, 0.42]]) {
      P.addEquipment('turret', box(0.16, h, 0.31), s * 1.20, y, z);
      P.add('turretDark', box(0.18, h * 1.02, 0.026), s * 1.20, y, z - 0.16);
    }
    P.add('turretDark', box(0.18, 0.040, 0.76), s * 1.20, 0.72, -2.02);
  }
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 2.60, d: 0.60, h: 0.58, posts: 9,
    fill: 0.92, rails: 3, mesh: false, rotation: [0, Math.PI, 0], seed: 9965,
  }), 0, 0.22, -2.24);
  addZTZ99A2RearServiceComplex(P);

  // smoke banks: staggered 5-tube rows on the cheek flanks
  addSmokeBanks(P, 1.38, 0.50, 0.40, 5, 9968);
  // rear whips on planted collars (a short-whip variant was built to chase
  // mask registration and REVERTED: whole 88.3 -> 87.5/87.1 — receipts in
  // the round packet)
  P.add('turretDetail', cylY(0.036, 0.046, 0.060, 10), -1.02, 0.90, -1.42);
  mount(P, 'turret', FITTINGS.antennaWhip({
    mats: P.mats, h: 0.65, r: 0.012, rake: -0.05, seed: 9971,
  }), -1.02, 0.93, -1.42);
  P.add('turretDetail', cylY(0.032, 0.042, 0.055, 10), 1.10, 0.88, -1.55);
  mount(P, 'turret', FITTINGS.antennaWhip({
    mats: P.mats, h: 0.55, r: 0.011, rake: 0.05, seed: 9972,
  }), 1.10, 0.91, -1.55);
  for (const s of [-1, 1]) {
    liftEye(P, 'turretDetail', s * 0.95, 0.90, -0.90);
    P.add('turretDetail', box(0.026, 0.026, 0.88), s * 1.44, 0.66, -0.75, 0, -s * 0.06, 0);
  }

  // ---- ZPT-98 plant: axis 1.95 world, annular root collar in the open
  // wedge channel, evacuator at the print's band, muzzle +7.02 world = the
  // print's own tube (whole-registration counterweight; published 11.0
  // stays the spec/UI overall datum).
  P.gunG.position.set(0, 0.39, 0.75);
  P.addGunExtra(cylZ(0.235, 0.20, seg), 0, 0, 0.28);
  P.addGunExtra(cylZ(0.165, 0.34, seg, 0.20), 0, 0, 0.55);
  P.addGunExtraDark(torus(0.185, 0.024, seg), 0, 0, 0.735);
  P.addGunExtraDark(box(0.44, 0.05, 0.06), 0, -0.235, 0.38);
  tubeGun(P, [
    [0.75, 1.60, 0.104], [1.60, 3.05, 0.090], [3.05, 3.75, 0.118],
    [3.75, 5.90, 0.086], [5.90, 6.42, 0.091],
  ], { rings: [[1.60, 0.108], [3.05, 0.121], [3.75, 0.121], [5.90, 0.094], [6.27, 0.094]], muzzle: 6.42 });
  muzzleBore(P, { r: 0.088 }); // §B3.1

  // §5.266 critic fix 2: the numerals sat half-behind the side service
  // modules — re-seated into the inter-module gap (world z ~ -0.96, the
  // recessed wall column between the two cassettes).  Authored just OUTSIDE
  // the widened belt wall (x 1.567 at this station) so the marking ray
  // seats on the visible face; the authored cheek star preempts the
  // auto-anchor insignia that the widened modules would half-clip.
  P.decal('turret', 'star', null, 0.24, [-1.30, 0.52, 0.42], -Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [1.60, 0.30, -0.81], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [-1.60, 0.30, -0.81], -Math.PI / 2);
  P.turretG.userData.ztz99a2TurretIntegrationReceipt = Object.freeze({
    selectedArmorAttached: true,
    compactedShoulderOuterXM: 1.54,
    serviceModuleCenterXM: 1.49,
    serviceModuleInnerFaceXM: 1.37,
    embeddedWeldCenterYM: 0.34,
    mirroredServiceModules: true,
  });
  P.topY = 1.30;
}

function buildZTZ99A2ProductionTurret(P: ChinaBuilderPort): void {
  const { box, cylY, cylZ, torus, periscope, liftEye } = KIT;
  const seg = P.q ? 20 : 14;
  const bustleExtensionM = 0.50;
  const bustleUndersideRiseM = 0.42;

  // Production 99A2: a low, broad arrow turret authored in its own station
  // frame. The rear station is exactly 0.50 m aft of the prototype's
  // -1.72 m shell datum, while the lower ring climbs exactly 0.42 m from
  // the forward belt to keep the bustle clear of the engine deck.
  P.turretG.position.set(0, 1.56, 0.12);
  const plan: Vec2Tuple[] = [
    // Stop the primary shell behind the ridge. The closed chevrons below
    // own the complete frontal projection, matching the VT-4A1 hierarchy.
    [0.30, 0.62], [0.82, 0.52], [1.40, 0.28], [1.56, -0.30],
    [1.50, -1.50], [1.18, -2.22], [0.82, -2.22],
    [-0.82, -2.22], [-1.18, -2.22], [-1.50, -1.50],
    [-1.56, -0.30], [-1.40, 0.48], [-0.82, 1.15], [-0.30, 1.43],
  ];
  const lower = [0.02, 0.02, 0.03, 0.05, 0.18, 0.44, 0.44,
    0.44, 0.44, 0.18, 0.05, 0.03, 0.02, 0.02];
  const belt = [0.32, 0.32, 0.34, 0.36, 0.43, 0.49, 0.49,
    0.49, 0.49, 0.43, 0.36, 0.34, 0.32, 0.32];
  const crown = [0.76, 0.76, 0.79, 0.82, 0.82, 0.80, 0.80,
    0.80, 0.80, 0.82, 0.82, 0.79, 0.76, 0.76];
  const crownInset = [0.63, 0.66, 0.80, 0.87, 0.90, 0.93, 0.94,
    0.94, 0.93, 0.90, 0.87, 0.80, 0.66, 0.63];
  P.add('turret', KIT.polyMultiLoft(plan, [
    { height: lower, inset: 1 },
    { height: belt, inset: 1 },
    { height: crown, inset: crownInset, centerHeight: 0.80 },
  ]));
  P.add('turret', cylY(1.08, 1.14, 0.10, seg), 0, -0.03, -0.12);

  // Leopard-class chevrons are the production shell's primary frontal
  // armor. This is the same watertight upper/ridge/lower construction used
  // by VT-4A1, resized to the independent A2 shell and given four raised
  // face cassettes per side. Their roots now run from the turret roof course
  // to the chin course, instead of compressing the arrow into a shallow band.
  // The ridge still sits 1.10 m ahead of the shell nose.
  const chevronStations = Object.freeze([
    { x: 0.22, upperX: 0.22, ridgeX: 0.22, lowerX: 0.22,
      upperY: 0.83, upperZ: 0.58, ridgeY: 0.39, ridgeZ: 1.72, lowerY: -0.04, lowerZ: 0.86 },
    { x: 0.38, upperX: 0.34, ridgeX: 0.38, lowerX: 0.40,
      upperY: 0.83, upperZ: 0.50, ridgeY: 0.38, ridgeZ: 1.66, lowerY: -0.04, lowerZ: 0.82 },
    { x: 0.82, upperX: 0.62, ridgeX: 0.82, lowerX: 0.78,
      upperY: 0.81, upperZ: 0.18, ridgeY: 0.36, ridgeZ: 1.42, lowerY: -0.02, lowerZ: 0.70 },
    { x: 1.18, upperX: 0.86, ridgeX: 1.18, lowerX: 1.18,
      upperY: 0.79, upperZ: -0.08, ridgeY: 0.34, ridgeZ: 1.16, lowerY: 0.00, lowerZ: 0.46 },
    { x: 1.48, upperX: 1.04, ridgeX: 1.48, lowerX: 1.54,
      upperY: 0.76, upperZ: -0.36, ridgeY: 0.31, ridgeZ: 0.88, lowerY: 0.03, lowerZ: 0.18 },
    { x: 1.62, upperX: 1.46, ridgeX: 1.62, lowerX: 1.56,
      upperY: 0.72, upperZ: -0.50, ridgeY: 0.29, ridgeZ: 0.66, lowerY: 0.05, lowerZ: -0.18 },
  ] satisfies readonly ChevronStation[]);
  const chevronPanelBands = Object.freeze([
    [0.055, 0.270], [0.300, 0.505], [0.535, 0.755], [0.785, 0.955],
  ] as const);
  // The closed arrow is permanent turret structure. Only the four raised
  // face cassettes per side are ERA and may disappear after detonation.
  for (const s of [-1, 1] as const) {
    P.add('turret', closedIntegratedChevron(chevronStations, s));
    P.add('turretDark', box(0.034, 0.46, 0.034), s * 0.84, 0.35, 1.06, -0.45, s * 0.70, 0);
  }
  P.visualEraCluster('ztz99a2-production-chevron-era', 'turret', () => {
    for (const s of [-1, 1] as const) {
      for (const [startT, endT] of chevronPanelBands) {
        const startX = chevronStations[0].x
          + (chevronStations.at(-1)!.x - chevronStations[0].x) * startT;
        const endX = chevronStations[0].x
          + (chevronStations.at(-1)!.x - chevronStations[0].x) * endT;
        P.addExternalArmor('turret', chevronSurfacePanel(
          interpolateChevronStation(chevronStations, startX),
          interpolateChevronStation(chevronStations, endX),
          s,
        ));
      }
    }
  });

  // Side cassette and bustle-box grammar comes directly from the production
  // ZTZ photographs: deep rectangular armor flanks, compact smoke banks and
  // a continuous aft service volume seated on the rising shell.
  for (const s of [-1, 1]) {
    P.addExternalArmor('turret', box(0.18, 0.48, 0.82), s * 1.50, 0.36, -0.52, 0, -s * 0.04, 0);
    P.addExternalArmor('turret', box(0.20, 0.44, 0.84), s * 1.42, 0.43, -1.36, 0, -s * 0.08, 0);
    P.addEquipment('turret', box(0.18, 0.30, 0.58), s * 1.30, 0.56, -1.93, 0, -s * 0.08, 0);
    P.add('turretDark', box(0.032, 0.36, 1.52), s * 1.595, 0.39, -0.82, 0, -s * 0.04, 0);
    P.add('turretDetail', box(0.035, 0.035, 1.98), s * 1.49, 0.76, -1.11, 0, -s * 0.05, 0);
    for (const z of [-0.16, -0.82, -1.48, -2.06]) {
      P.add('turretDetail', box(0.034, 0.40, 0.034), s * 1.50, 0.55, z, 0, -s * 0.05, 0);
    }
    liftEye(P, 'turretDetail', s * 0.98, 0.82, -1.18);
  }
  P.addExternalArmor('turret', box(2.22, 0.36, 0.16), 0, 0.62, -2.17, -0.10, 0, 0);
  P.add('turretDark', box(2.02, 0.18, 0.035), 0, 0.57, -2.27, -0.10, 0, 0);
  for (let i = 0; i < 7; i++) {
    P.add('turretDetail', box(0.030, 0.30, 0.038), -0.90 + i * 0.30, 0.62, -2.30, -0.10, 0, 0);
  }

  // Compact production roof suite: commander weapon right, stabilized sight
  // left, gunner window by the throat, and low laser-warning heads.
  P.addEquipment('turret', box(0.42, 0.08, 0.38), -0.52, 0.83, -0.48);
  P.add('turretDetail', cylY(0.14, 0.17, 0.26, 14), -0.52, 1.00, -0.48);
  P.addEquipment('turret', box(0.27, 0.19, 0.24), -0.52, 1.20, -0.48);
  P.add('turretDark', box(0.20, 0.10, 0.030), -0.52, 1.21, -0.35);
  P.add('turretGlass', box(0.15, 0.065, 0.018), -0.52, 1.21, -0.332);
  P.addEquipment('turret', box(0.40, 0.16, 0.38), 0.44, 0.88, 0.32);
  P.add('turretDark', box(0.28, 0.09, 0.030), 0.44, 0.91, 0.525);
  P.add('turretGlass', box(0.20, 0.06, 0.018), 0.44, 0.91, 0.544);
  P.add('turret', cylY(0.26, 0.28, 0.065, seg), 0.52, 0.845, -0.88);
  P.add('turretDark', torus(0.265, 0.014, seg), 0.52, 0.885, -0.88);
  periscope(P, 'turretDetail', 0.30, 0.90, -0.88);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'nsvt', scale: 0.72, tone: 'two-tone', elev: 0.08,
    shield: true, ammo: true, ring: { r: 0.16, stubs: 3 }, seed: 9990,
  }), 0.52, 0.89, -0.88);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.17, 0.08, 0.15), s * 0.96, 0.84, 0.10);
    P.add('turretGlass', box(0.10, 0.052, 0.018), s * 0.96, 0.85, 0.185);
    P.add('turretDetail', cylY(0.034, 0.044, 0.060, 10), s * 1.06, 0.83, -1.58);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: s < 0 ? 0.72 : 0.62, r: 0.011,
      rake: -s * 0.04, seed: 9992 + (s > 0 ? 1 : 0),
    }), s * 1.06, 0.86, -1.58);
  }
  addSmokeBanks(P, 1.33, 0.48, 0.25, 5, 9996);

  // ZPT-98 in an open chevron throat, with the recoil collar buried into
  // the connected nose rather than carried by a separate mantlet shell.
  P.gunG.position.set(0, 0.38, 0.78);
  P.addGunExtra(cylZ(0.23, 0.22, seg), 0, 0, 0.27);
  P.addGunExtra(cylZ(0.16, 0.32, seg, 0.19), 0, 0, 0.54);
  P.addGunExtraDark(torus(0.18, 0.022, seg), 0, 0, 0.72);
  tubeGun(P, [
    [0.72, 1.58, 0.104], [1.58, 3.03, 0.090], [3.03, 3.72, 0.118],
    [3.72, 5.90, 0.086], [5.90, 6.42, 0.091],
  ], { rings: [[1.58, 0.108], [3.03, 0.121], [3.72, 0.121], [5.90, 0.094]], muzzle: 6.42 });
  muzzleBore(P, { r: 0.088 });

  P.decal('turret', 'star', null, 0.23, [-1.48, 0.49, -0.10], -Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '99A2', 0.20, [1.54, 0.48, -1.00], Math.PI / 2);
  P.turretG.userData.ztz99a2ProductionReceipt = Object.freeze({
    architecture: 'ztz99a2-production-arrow-r4',
    independentProductionTurret: true,
    prototypeGeometryReused: false,
    actualReferenceDerived: true,
    integratedChevronFront: true,
    chevronsArePrimaryFront: true,
    permanentChevronCarriers: 2,
    detonatingChevronFacePanels: 8,
    spentStateRetainsClosedFront: true,
    permanentArmoredBustle: true,
    chevronSideJoinGapM: 0,
    chevronProfile: 'vt4a1-leopard-2a6-derived',
    chevronStationsPerSide: 6,
    surfacePanelsPerSide: 4,
    sharedPhysicalRidge: true,
    primaryShellFrontZM: 0.62,
    chevronRidgeFrontZM: 1.72,
    chevronRidgeAdvanceM: 1.10,
    chevronUpperRootYM: 0.83,
    chevronLowerReturnYM: -0.04,
    chevronVerticalCoverageM: 0.87,
    fullHeightFrontCoverage: true,
    bustleExtensionM,
    bustleUndersideRiseM,
    formerRearStationM: -1.72,
    armoredBustleRearZM: -2.22,
    rearLowerStationYM: 0.44,
    risingUndersideClearsEngineDeck: true,
  });
  P.topY = 1.23;
}

function buildZTZ99A2(P: ChinaBuilderPort): void {
  buildZTZ99A2Hull(P);
  buildZTZ99A2ProductionTurret(P);
}

function buildZTZ99A2Prototype(P: ChinaBuilderPort): void {
  buildZTZ99A2Hull(P);
  buildZTZ99A2PrototypeTurret(P);
  P.turretG.userData.ztz99a2PrototypeReceipt = Object.freeze({
    architecture: 'ztz99a2-pre-production-welded-wedge-r1',
    preservedFromCanonicalId: 'ztz99a2',
    canonicalProductionReplacement: 'ztz99a2',
    distinctPlayablePrototype: true,
  });
}

// ===========================================================================
// Type 59 (WZ-120) — §5.304 REDESIGN ON THE WIDENED T-62 obr. 1975 BASE
// ===========================================================================
// OWNER ORDER (verbatim, 2026-08-17): "update our t62 obr 1975 10% wider and
// then redeisgn our type 59 to be based off of that".  The chassis IS the
// widened obr-1975 construction (profiles/russia.ts buildT62Obr1975Chassis —
// hull loft, twin tail drums, transom, fender/bin rails, §B3.2 service kit),
// re-gauged here only in the wheel PATTERN: the licensed-T-54A big 1st-2nd
// gap replaces the T-62's rear-biased spacing (same span/idler/sprocket, so
// the §B6 ramps hold).  Chinese identity dressing distinguishes the id:
//  * WZ-120 (T-54A-family) mushroom dome — taller, rounder casting than the
//    T-62's long low egg; curved-normal shell (meshDomeCurved), flank
//    shoulder shelves, cast nose BROW over the gun (the T-54A rise).
//  * 100 mm Type 59 gun (licensed D-10T class): measured tube grammar with
//    the BORE EVACUATOR at the muzzle-third + §B3.1 muzzle bore; compact
//    cast-collar mantlet with the canvas-covered wedge look (ruBoot, §5.327)
//    over a sealed ruSaddle + coax 7.62 PORT at the boot's right shoulder.
//  * Type 59-II searchlight RIGHT of the gun on a real shelf bracket +
//    saddle cradles, dark drum housing (§5.327 re-seat: the old cheek-buried
//    drum was the owner's "big bulbouys thing") + small gun-slaved IR.
//  * Chinese fender/stowage grammar: glacis IR drum pod (Type 69 tell), bow
//    MG port on the glacis right (§5.327), muffler on the LEFT rear fender,
//    stowed OPVT snorkel ridge on the rear deck, curved rear stowage rack on
//    the dome tail (turret-owned, §B5).
//  * DShK-class (Type 54 12.7 mm) census MG on the loader-hatch RING MOUNT
//    (race ring + carriage arm, §5.327), barrel forward (CROWS law), stowed
//    low-forward — cluster held under the cupola p95 crown (2.59 datum).
// The LastTriarius Type 69 print (docs/references/vertex/type59.json)
// remains the registered measurement oracle in the three maps; this
// redesign diverges from it BY OWNER DECREE (+10% width, obr-1975 hull) —
// gate deltas are documented in docs/references/tanks/type59.md §5.304,
// never chased back toward the print.
function buildType59(P: ChinaBuilderPort): void {
  const {
    box, cylX, cylY, cylZ, stowage, tarpRoll, shovelTool, spareTrackStrip,
  } = KIT;
  // The previous compact refit already rendered at 95% of the authored
  // frame.  The owner-requested 10% reduction is relative to that live
  // vehicle, so the final articulated scale is 0.95 * 0.90 = 0.855.
  const vehicleScale = 0.855;
  const browDropM = 0.08;
  const gunRaiseM = 0.08;
  const rings59 = [[1.43, -0.016], [1.573, 0.10], [1.6225, 0.22], [1.584, 0.36], [1.518, 0.48], [1.43, 0.56], [1.21, 0.63], [1.166, 0.655], [1.10, 0.665], [1.012, 0.72], [0.924, 0.80], [0.792, 0.88], [0.616, 0.95], [0.44, 1.01], [0.022, 1.04]];
  let turretArmorPanels = 0;

  const buildType59Chassis = (): void => {
  // ---- widened obr-1975 chassis with the T-54A wheel-gap pattern (span,
  // idler, sprocket and both contact tangents rebuilt as one linked course.
  // The donor course's unsupported terminal ramps made the tracks read
  // borrowed from the larger T-62.  Explicitly re-seating both end wheels,
  // contact tangents and return height keeps every shoe visibly supported
  // after the whole vehicle's restrained 5% trim.
  buildT62Obr1975Chassis(P, {
    gear: {
      wheelZs: [2.235, 1.08, 0.10, -0.92, -1.933],
      wheelY: 0.455,
      xc: 1.45,
      sprocket: { z: -2.795, y: 0.79, r: 0.32 },
      idler: { z: 3.01, y: 0.83, r: 0.30 },
      topY: 1.185,
      botY: 0.02,
      contactZF: 2.66,
      contactZR: -2.36,
    },
    // Re-seat the donor bow-service cadence into the Type 59's V-nose. The
    // former y=.55/.66 seats hung visibly below the lower glacis after the
    // compact scale pass; these centers overlap the 3.53 m nose section
    // (belly ~.90, deck ~.98) while their front faces remain just proud.
    bowService: {
      stiffenerY: 0.93,
      stiffenerZ: 3.53,
      recoveryY: 0.92,
      recoveryBodyZ: 3.51,
      recoveryEyeZ: 3.558,
    },
  });
  // Close the two enclosed plan pockets between the Type 59 V-nose and the
  // inner idler shoulders.  Their centers are the standard gate's former
  // ±0.91 / +2.62 m sky cells after the 0.855 owner scale.  These narrow
  // inboard bridges stop 20 mm short of the animated shoe envelope, overlap
  // the lower bow vertically, and never become track covers.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.20, 0.35, 0.30), side * 1.04, 0.90, 3.064, -0.12, 0, 0);
  }
  };
  buildType59Chassis();

  const buildType59HullEquipment = (): void => {
  // ---- Chinese hull dressing --------------------------------------------
  // Type 69-family glacis IR pod: big IR drum right of the driver line on a
  // planted riser (the chassis keeps its paired white lamps at the bow).
  P.add('hullDetail', cylZ(0.125, 0.20, 12), 0.462, 1.30, 2.42, -0.28, 0, 0);
  P.add('hullDark', cylZ(0.129, 0.02, 12), 0.462, 1.33, 2.515, -0.28, 0, 0);
  P.add('hullDark', box(0.06, 0.14, 0.06), 0.462, 1.19, 2.37, -0.28, 0, 0);
  // Bow MG PORT on the glacis right (§5.327 MG order c — the Type 59 hull
  // 7.62 fires through a small round port; a ball/port read, not a barrel):
  // boss cylinder along the local glacis normal (deck run 2.60→2.86 slopes
  // 24.8°, normal rx −1.138), half-proud, dark aperture disc on the face.
  // Outboard of the IR drum pod, inboard of the track band (x .965 < 1.111).
  P.add('hullDetail', cylZ(0.085, 0.06, 12), 0.88, 1.369, 2.698, -1.138, 0, 0);
  P.add('hullDark', cylZ(0.036, 0.014, 10), 0.88, 1.402, 2.712, -1.138, 0, 0);
  // Muffler on the LEFT rear fender (WZ-120 tell) — seated ON the fender
  // run with two dark band straps and a short aft outlet stub.
  P.add('hullDetail', cylZ(0.10, 0.78, 10), -1.65, 1.60, -2.60);
  P.add('hullDark', cylZ(0.055, 0.20, 8), -1.65, 1.63, -3.06, 0.12, 0, 0);
  for (const z of [-2.36, -2.84]) {
    P.add('hullDark', box(0.226, 0.024, 0.03), -1.65, 1.60, z);
    P.add('hullDark', box(0.05, 0.12, 0.03), -1.65, 1.52, z);
  }
  // Stowed OPVT snorkel ridge across the rear deck (saddled, §B2-connected).
  P.add('hullDetail', cylX(0.09, 1.672, 12), 0, 1.62, -2.35);
  for (const s of [-1, 1]) P.add('hullDark', box(0.06, 0.14, 0.22), s * 0.682, 1.56, -2.35);

  // ---- Type 59 field-modernization armor and hull equipment --------------
  // Three shallow applique plates follow the actual upper-glacis rake.  They
  // are external armor rather than hull shell, so the base plate keeps its
  // close combat envelope while the visual reads as a deliberate refit.
  for (const x of [-0.78, 0, 0.78]) {
    const w = x === 0 ? 0.70 : 0.62;
    P.addExternalArmor('hull', box(w, 0.075, 1.18), x, 1.405, 2.31, -0.18, 0, 0);
    for (const bx of [-0.34, 0.34]) {
      P.add('hullDark', cylY(0.022, 0.022, 0.022, 8),
        x + bx * w, 1.447, 1.88, -0.18, 0, 0);
    }
  }
  // Segmented steel/rubber skirt armor hangs from the existing fender line;
  // broad hangers visibly transfer each panel into the hull instead of
  // leaving another parallel floating wall outside the track.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = 2.18 - i * 0.73;
      P.addExternalArmor('hull', box(0.055, 0.48, 0.66), side * 1.86, 1.02, z);
      P.add('hullDark', box(0.18, 0.08, 0.58), side * 1.77, 1.29, z);
      for (const dz of [-0.25, 0.25]) {
        P.add('hullDark', cylZ(0.019, 0.025, 8), side * 1.894, 1.19, z + dz,
          0, side * Math.PI / 2, 0);
      }
    }
  }
  // Crew field kit: spare links and pioneer tools on the glacis, plus a
  // strapped canvas roll on the right rear fender. All are non-armor
  // equipment and remain inside the new skirt/fender envelope.
  spareTrackStrip(P, 'hull', -0.74, 1.515, 1.73, 4, -0.18, 0);
  shovelTool(P, 0.83, 1.565, -1.28, 1.05);
  tarpRoll(P, 'hullCloth', 1.49, 1.63, -0.83, 0.72, 0.095, false, 12);
  };
  buildType59HullEquipment();

  const buildType59Turret = (): void => {
  // ---- WZ-120 (T-54A-family) mushroom dome on the widened base ring ------
  // Ring profile = the certified §5.45 type59 dome ×1.10 laterally (the
  // §5.304 widen law), y as authored (apex turret-local 1.04 → world 2.52);
  // meshDomeCurved sz 1.03 ÷ 1.10 = 0.9364 keeps the plan CHORD byte-held
  // so the casting widens with the hull without lengthening.
  P.turretG.position.set(0, 1.4804, 0.676);
  meshDomeCurved(P, rings59, 0.9364, 0, -0.21, { capR: 1.54 });
  // flank roof-shoulder pair: the T-54A flat shelf lives on the SIDES only
  // (outer face flush with the local dome skin).
  for (const s of [-1, 1]) P.add('turret', box(0.264, 0.15, 1.22), s * 1.232, 0.58, -0.25);
  // cast nose BROW over the mantlet (the T-54A casting rises over the gun):
  // bottom ring buried under the dome skin / into the gun collar (§B2).
  const ringsBrow = [[0.726, 0.40], [0.715, 0.62], [0.682, 0.76], [0.572, 0.85], [0.022, 0.87]]
    .map(([r, y]) => [r, y - browDropM]);
  meshDome(P, ringsBrow, 0.909, 0, 0.95);
  // closed race collar under the casting (the widened base ring).
  P.add('turret', cylY(0.748, 0.7865, 0.10, 20), 0, 0.025, -0.05);
  // commander cupola LEFT: ring + split-hatch lid — the lid crown carries
  // heightM (world 2.59) as the compact p95 head (≤3-4 column law).
  P.add('turret', cylY(0.285, 0.30, 0.20, 14), -0.605, 0.975, -0.09);
  P.add('turretDark', cylY(0.25, 0.25, 0.035, 14), -0.605, 1.0925, -0.09);
  P.add('turretDetail', box(0.11, 0.08, 0.16), -0.605, 1.06, 0.12);
  P.add('turretDetail', box(0.10, 0.07, 0.14), -0.792, 1.03, -0.09);
  // loader dome RIGHT
  P.add('turret', cylY(0.26, 0.27, 0.13, 14), 0.55, 0.94, 0.11);
  P.add('turretDark', cylY(0.267, 0.267, 0.016, 14), 0.55, 1.0125, 0.11);
  // mushroom VENTILATOR dome forward-center + periscope heads (T-54A
  // anatomy) — vent crown held at the dome-apex line (p95 window).
  P.add('turret', cylY(0.16, 0.17, 0.24, 12), 0, 0.78, 0.91);
  P.add('turret', KIT.sph(0.16, 12, Math.PI / 2), 0, 0.88, 0.91);
  P.addModuleVisual('optics', 'turretDetail', box(0.10, 0.08, 0.14), -0.242, 1.00, 1.01);
  P.addModuleVisual('optics', 'turretDetail', box(0.10, 0.08, 0.14), 0.242, 1.00, 1.01);
  // curved rear stowage rack on the dome tail (turret-owned, §B5; the
  // Chinese service-rack grammar) + dark saddle straps into the skin.
  {
    const rack = FITTINGS.stowageRack({
      mats: P.mats, w: 1.42, d: 0.38, h: 0.24, fill: 0.62, rails: 2, seed: 590,
    });
    rack.name = 'type59RearStowageRack';
    rack.position.set(0, 0.42, -1.50);
    P.turretG.add(rack);
    for (const s of [-1, 1]) P.add('turretDark', box(0.06, 0.16, 0.30), s * 0.46, 0.34, -1.44);
  }
  // One enlarged, crew-served weapon AHEAD of each cupola.  Short bridge
  // plates overlap the hatch crowns and carry the pintle feet out to the
  // forward rims; the guns' aft spade grips still reach back over the
  // openings for standing operators.  Barrels remain forward (+Z), and both
  // groups are turret children so every part follows yaw.
  P.addEquipment('turretDetail', box(0.18, 0.035, 0.32), 0.55, 1.015, 0.245);
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 1.08, tone: 'two-tone', elev: 0.08,
      ammo: true, shield: true, barrelBridge: true,
      rotation: [0, -0.04, 0], seed: 6,
    });
    dshk.name = 'type59RoofDShK';
    dshk.userData.cupolaSeat = 'loader';
    dshk.position.set(0.55, 1.021, 0.36);
    P.turretG.add(dshk);
  }
  P.addEquipment('turretDetail', box(0.16, 0.035, 0.30), -0.605, 1.105, 0.02);
  {
    const commanderMG = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', scale: 1.12, tone: 'two-tone', elev: 0.06,
      ammo: true, shield: false, barrelBridge: true,
      rotation: [0, 0.05, 0], seed: 59,
    });
    commanderMG.name = 'type59CommanderCupolaMG';
    commanderMG.userData.cupolaSeat = 'commander';
    commanderMG.position.set(-0.605, 1.111, 0.13);
    P.turretG.add(commanderMG);
  }
  // paired four-tube smoke banks on the dome shoulders (dark pads bridge
  // the bank bodies onto the casting skin).
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.045, len: 0.27, splay: s * 1.02, pitch: -0.52, arc: 0.62, spacing: 0.10, rotation: [0, 0, -s * 0.12], seed: 590 + s });
    smoke.position.set(s * 1.133, 0.68, 0.16);
    P.turretG.add(smoke);
    P.add('turretDark', box(0.30, 0.10, 0.24), s * 1.10, 0.57, 0.10, -0.18, 0, -s * 0.12);
  }
  // leaning whip antenna at the turret nose-left shoulder (planted collar).
  P.add('turret', cylY(0.055, 0.07, 0.08, 10), -0.858, 0.50, 0.78);
  {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.72, r: 0.018, rake: 0.35, seed: 3 });
    whip.position.set(-0.858, 0.52, 0.78);
    P.turretG.add(whip);
  }
  domeRailRu(P, rings59, 1.0, 0.50, 1.1);
  };
  buildType59Turret();

  const buildType59TurretArmor = (): void => {
  // ---- modular turret applique and denser crew equipment -----------------
  // Forward cassettes are tangent to the mushroom cheek; the side course is
  // embedded into the cast shoulder by 20-30 mm.  The two courses overlap at
  // the transition so there is no daylight wedge when the camera moves from
  // the front quarter to a true side view.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = side * (0.58 + i * 0.23);
      const z = 0.88 - i * 0.16;
      P.addExternalArmor('turret', box(0.11, 0.25, 0.34),
        x, 0.52 - i * 0.012, z, 0, -side * 0.68, side * 0.035);
      P.add('turretDark', box(0.018, 0.20, 0.29),
        x + side * 0.050, 0.52 - i * 0.012, z, 0, -side * 0.68, side * 0.035);
      turretArmorPanels++;
    }
    for (let i = 0; i < 4; i++) {
      const z = 0.38 - i * 0.35;
      P.addExternalArmor('turret', box(0.12, 0.28, 0.30),
        side * 1.49, 0.43, z, 0, side * 0.055, 0);
      P.add('turretDark', box(0.020, 0.22, 0.24),
        side * 1.556, 0.43, z, 0, side * 0.055, 0);
      turretArmorPanels++;
    }
    // Full-depth support rail and two return brackets make the cassette
    // course visibly load-bearing rather than a row of boxes hovering beside
    // the casting.
    P.add('turretDetail', box(0.055, 0.055, 1.55), side * 1.405, 0.36, -0.12);
    for (const z of [0.56, -0.76]) {
      P.add('turretDetail', box(0.22, 0.055, 0.055), side * 1.31, 0.36, z);
    }
  }
  stowage(P, 'turretCloth', P.rng, [
    [-0.74, 0.68, -1.12, 0.42, 0.20, 0.34],
    [0.72, 0.64, -1.12, 0.38, 0.18, 0.32],
  ]);
  // Second rear radio whip and its armored socket balance the existing
  // forward-left antenna without creating another tall combat structure.
  P.add('turret', cylY(0.052, 0.065, 0.075, 10), 0.94, 0.50, -0.91);
  {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.66, r: 0.016, rake: -0.20, seed: 14 });
    whip.name = 'type59RearRadioWhip';
    whip.position.set(0.94, 0.53, -0.91);
    P.turretG.add(whip);
  }
  };
  buildType59TurretArmor();

  const buildType59Weapon = (): void => {
  // ---- 100 mm Type 59 gun (licensed D-10T class): measured tube grammar,
  // BORE EVACUATOR at the muzzle-third, §B3.1 muzzle bore. Raise the axis
  // into the lowered brow opening instead of leaving the tube under the
  // cast nose.
  P.gunG.position.set(0, 0.2866 + gunRaiseM, 1.019);
  // §5.327 MANTLET READ: the buried collar alone left the tube exiting the
  // casting bare (§B3.1 failing read — the dome front plane at gun height is
  // world z ~1.97, past the whole old collar). rootL 0.48→0.30 tucks the
  // saddle cone fully under the new boot (no cone sliver under the canvas).
  ruSaddle(P, { rollR: 0.185, rollW: 0.528, tubeR: 0.13, rootR: 0.185, rootL: 0.30 });
  P.addGunExtra(nonUniformXform(cylZ(0.5, 0.28, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.484, 0.33, 1]), 0, 0, 0.11);
  P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.042, 14), 0, 0, 0, 0, 0, 0, [0.319, 0.25, 1]), 0, 0, 0.28);
  // Compact cast-collar mantlet with the canvas-covered wedge look (§5.327,
  // owner order): three tapered boot sections root→tube, root face buried
  // into the casting at every corner (dome front at the ±0.31 root edge is
  // gun-local z 0.246 — root sits at 0.22), crease collars + end clamp per
  // the fleet ruBoot grammar. Small: 0.62×0.50 root vs the 1.45 m brow.
  ruBoot(P, {
    pts: [[0.22, 0.62, 0.50, 0.01], [0.40, 0.48, 0.42, 0.01], [0.58, 0.34, 0.34, 0.02]],
  });
  // Coax 7.62 (Type 59T) PORT beside the main gun in the mantlet area
  // (§5.327 MG order b — an aperture read, not a full barrel): short jacket
  // stub rooted through the casting face at the boot's right shoulder, dark
  // bore dot proud. Gun-bucketed: elevates with the tube (§B5).
  P.addGunExtra(KIT.xform(cylZ(0.045, 0.05, 10), 0, 0, 0), 0.30, -0.06, 0.26);
  P.addGunExtraDark(KIT.xform(cylZ(0.032, 0.15, 10), 0, 0, 0), 0.30, -0.06, 0.30);
  P.addGunExtraDark(KIT.xform(cylZ(0.015, 0.012, 8), 0, 0, 0), 0.30, -0.06, 0.382);
  // small gun-slaved IR right of the mantlet (Type 69 kit)
  P.addGunExtra(KIT.xform(cylZ(0.095, 0.13, 12), 0, 0, 0), 0.396, 0.13, 0.15);
  P.addGunExtraDark(KIT.xform(cylZ(0.099, 0.014, 12), 0, 0, 0), 0.396, 0.13, 0.225);
  P.addGunExtraDark(KIT.xform(cylZ(0.078, 0.010, 12), 0, 0, 0), 0.396, 0.13, 0.233);
  P.addGunExtraDark(box(0.03, 0.10, 0.03), 0.33, 0.05, 0.13);
  // Type 59-II searchlight RIGHT of the gun, PROPERLY SEATED (§5.327: the
  // old drum sat at gun-local z −0.05 — half-swallowed by the dome cheek,
  // its exposed upper crescent on the pale gunMount slot WAS the owner's
  // "big bulbous thing"; whatsat receipt: old drum top world 2.447). New
  // assembly: shelf bracket cantilevered off the boot's right flank, twin
  // saddle cradles, DARK drum housing (§C loud-carrier law) with pale
  // mounting band + bezel, glass recessed. Drum center (0.52, 0.36, 0.50)
  // gun-local → world top 2.367, fully FORWARD of the casting (dome front
  // at that height is world ~1.47) — gun-linked, elevates and yaws (§B5).
  P.addGunExtra(box(0.52, 0.055, 0.34), 0.42, 0.085, 0.42);
  for (const zSad of [0.33, 0.51]) P.addGunExtra(box(0.30, 0.10, 0.06), 0.52, 0.16, zSad);
  P.addGunExtraDark(KIT.xform(cylZ(0.24, 0.30, 18), 0, 0, 0), 0.52, 0.36, 0.50);
  P.addGunExtra(KIT.xform(cylZ(0.245, 0.06, 18), 0, 0, 0), 0.52, 0.36, 0.41);
  P.addGunExtra(KIT.xform(cylZ(0.247, 0.02, 18), 0, 0, 0), 0.52, 0.36, 0.64);
  P.addGunExtraDark(KIT.xform(cylZ(0.225, 0.015, 18), 0, 0, 0), 0.52, 0.36, 0.655);
  P.addGunExtraDark(KIT.xform(cylZ(0.19, 0.010, 16), 0, 0, 0), 0.52, 0.36, 0.662);
  tubeGun(P, [
    [0.32, 0.90, 0.135], [0.90, 1.60, 0.122], [1.60, 2.40, 0.118],
    [2.40, 3.34, 0.118], [3.34, 3.86, 0.155], [3.86, 4.292, 0.118],
  ], { rings: [[0.90, 0.138], [1.60, 0.125], [3.34, 0.158], [3.86, 0.158], [4.17, 0.121]], muzzle: 4.292 });
  muzzleBore(P, { r: 0.115 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT59 = ringSkin(rings59, 0.40) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT59 * 0.98, 0.40, -0.21], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT59 * 0.98, 0.40, -0.21], -Math.PI / 2);
  };
  buildType59Weapon();

  const scaleType59AndStampReceipts = (): void => {
  // Apply the requested modest overall reduction at the articulated owners,
  // not by baking hundreds of unrelated station constants.  Hull gear,
  // turret armor, equipment and gun therefore retain their exact attachment
  // relationships. The turret pivot follows the reduced deck, while the gun
  // remains a clean child of the uniformly scaled yaw rig.
  P.hullG.scale.setScalar(vehicleScale);
  P.turretG.scale.setScalar(vehicleScale);
  P.turretG.position.multiplyScalar(vehicleScale);
  // Running-gear receipts describe the local geometry and instance matrices
  // below `hullG`; the hull owner's scale transforms both together. Keeping
  // that receipt local preserves one coordinate frame for the belt, shoes,
  // drive teeth, wheel stations and suspension arms. Physics-only contact
  // metadata below is still converted to the reduced vehicle frame because
  // it is consumed outside the scaled render hierarchy.
  if (P.gear?.contactGeom) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
      P.gear.contactGeom[key] *= vehicleScale;
    }
    if (P.gear.contactGeom.endRise) {
      for (const key of ['dzM', 'frontM', 'rearM'] as const) {
        P.gear.contactGeom.endRise[key] *= vehicleScale;
      }
    }
  }
  for (const lane of P.gear?.trackHitbox || []) {
    lane.x0 *= vehicleScale;
    lane.x1 *= vehicleScale;
    lane.poly = lane.poly.map(([z, y]) => [z * vehicleScale, y * vehicleScale]);
  }
  P.hullG.userData.type59OverhaulReceipt = Object.freeze({
    revision: 'type59-compact-twin-mg-r3',
    vehicleScale,
    roadWheelStations: 5,
    linkedTrackCourseReseated: true,
    bowServiceAttached: true,
    bowShoulderClosureCount: 2,
    glacisAppliquePanels: 3,
    sideSkirtPanels: 14,
    equipmentAttached: true,
  });
  P.turretG.userData.type59OverhaulReceipt = Object.freeze({
    revision: 'type59-compact-twin-mg-r3',
    vehicleScale,
    browDropM,
    gunRaiseM,
    roofMachineGuns: Object.freeze(['Type 54 DShK', 'Type 59 7.62 mm']),
    roofMachineGunCount: 2,
    roofMachineGunScale: 1.08,
    roofMachineGunScales: Object.freeze([1.08, 1.12]),
    turretArmorPanels,
    equipmentAttached: true,
  });
  };
  scaleType59AndStampReceipts();
  P.topY = 1.035;
}

export const CHINA_PROFILES = {
  // §5.248 ground-up builds — no donor constructor in either call chain.
  ztz85_iii: { build: buildZTZ85III },
  // Type 99A is registered by chineseFrontline.ts so its certified hull can
  // receive the VT-derived rotating assembly from the same authored family.
  ztz99a2_prototype: { build: buildZTZ99A2Prototype },
  ztz99a2: { build: buildZTZ99A2 },
  // §5.304 redesign: Type 59 on the widened obr-1975 chassis (owner order).
  type59: { build: buildType59 },
} satisfies VehicleProfileRecord;
