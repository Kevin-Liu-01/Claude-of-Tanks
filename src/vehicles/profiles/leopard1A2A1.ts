// Leopard 1A2A1 (release 263). Owner 2026-10-28: "keep ur new leopard variants and make one that uses the old hull and
// has like a rounder 'unarmored' version that looks more like the world of tanks leopard 1"; then, on its turret, "it
// needs to take a lot more inspo from that 1a2 ... the boxes, smoke canisters, tech etc"; then "make it based off the
// 1a5 more with a slightly rounded corners and the correct mantlet (which the 1a5 should also have this kind of mantlet
// that ends in a line)". The hull and running gear are the Leopard 1A5's as they stood before the 262 proportion rebuild
// (0a3d073341). The turret takes the 262 Leopard 1A5's lines (its chevron casting, the wedges either side of the mask and
// the side plates) as one casting with slightly rounded corners and no bolts, its chevron mask closing to a line at the
// gun, with the Munster 1A2A1's PERI R12 (docs/references/tanks/leo1a2a1.md). First-party procedural geometry: Kevin B.
// Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** A corner rounded by two short segments: the points `bevel` along each neighbouring edge and their midpoint pulled
 * halfway back toward the corner, so the smoothed normals read as a small radius between two flat faces. */
const roundCorner = (prev: SectionPoint, corner: SectionPoint, next: SectionPoint, bevel: number): SectionPoint[] => {
  const along = (to: SectionPoint): SectionPoint => {
    const dx = to[0] - corner[0], dy = to[1] - corner[1], len = Math.hypot(dx, dy);
    const d = Math.min(bevel, len * 0.3);
    return [corner[0] + dx / len * d, corner[1] + dy / len * d];
  };
  const a = along(prev), b = along(next);
  return [a, [(a[0] + b[0]) / 4 + corner[0] / 2, (a[1] + b[1]) / 4 + corner[1] / 2], b];
};
/** The 1A5 casting's chevron section (base, ridge, roof edge), its ridge and roof edges rounded. 14 points. */
const castChevronRing = (wb: number, yb: number, wm: number, ym: number, wr: number, yr: number): readonly SectionPoint[] => {
  const base: SectionPoint = [wb, yb], ridge: SectionPoint = [wm, ym], roofEdge: SectionPoint = [wr, yr];
  const right = [base, ...roundCorner(base, ridge, roofEdge, 0.05), ...roundCorner(ridge, roofEdge, [-wr, yr], 0.04)];
  const left = right.map(([x, y]) => [-x, y] as const).reverse();
  return [left.at(-1)!, ...right, ...left.slice(0, -1)];
};
// the two rounded corners on each side (edges 2-3 and 5-6, mirrored 8-9 and 11-12) read as one smooth radius
const CAST_ROUND_EDGES = [2, 3, 5, 6, 8, 9, 11, 12];
/** One side's plate or wedge section (x > 0), the 1A5 chevron: an inner face buried in the core, the lower face out to a
 * rounded ridge 0.30 m up, the upper face in to a rounded top edge. 9 points; mirror for the left. */
const plateChevronRing = (xi: number, xb: number, yb: number, xr: number, xt: number, yt: number): readonly SectionPoint[] => {
  const ib: SectionPoint = [xi, yb], ob: SectionPoint = [xb, yb], ridge: SectionPoint = [xr, 0.30];
  const top: SectionPoint = [xt, yt], it: SectionPoint = [xi, yt];
  return [ib, ob, ...roundCorner(ob, ridge, top, 0.045), ...roundCorner(ridge, top, it, 0.035), it];
};
const PLATE_ROUND_EDGES = [2, 3, 5, 6];
const mirrorRing = (ring: readonly SectionPoint[]): readonly SectionPoint[] =>
  ring.map(([x, y]) => [-x, y] as const).reverse();
const mirrorEdges = (edges: readonly number[], count: number): number[] => edges.map((e) => count - 2 - e);

function* buildLeo1A2A1Steps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylY, cylZ, torus, sph, buildGun, buildRunningGear,
    headlight, liftEye, towCable, stowage, jerryCan, tarpRoll, ammoCan,
    shovelTool, xform } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  // ------------------------------------------------------------ the old hull --
  // Kept as the Leopard 1A5 stood at 0a3d073341 (owner: "uses the old hull"). Leopard 1 upper glacis: 60 degrees from
  // vertical (30 degrees above the ground plane), the deck break solved from that angle.
  const upperGlacisAngleFromVerticalDeg = 60;
  const upperGlacisFrontZ = 3.54;
  const upperGlacisFrontY = 1.04;
  const upperGlacisRearY = 1.54;
  const upperGlacisRisePerRun = Math.tan(
    THREE.MathUtils.degToRad(90 - upperGlacisAngleFromVerticalDeg),
  );
  const upperGlacisRearZ = upperGlacisFrontZ
    - (upperGlacisRearY - upperGlacisFrontY) / upperGlacisRisePerRun;
  const upperGlacisY = (z: number): number => upperGlacisFrontY
    + (upperGlacisFrontZ - z) * upperGlacisRisePerRun;
  const centerDeckRearZ = -1.25;
  const centerDeckTopY = (z: number): number => THREE.MathUtils.lerp(
    1.77,
    1.60,
    THREE.MathUtils.clamp(
      (z - centerDeckRearZ) / (upperGlacisRearZ - centerDeckRearZ),
      0,
      1,
    ),
  );
  // The lifted terminal wraps crest at 1.265 m including their shoes; the continuous shelf and the lower sponson seam
  // stand over them.
  const fenderShelfY = 1.295;
  const fenderShelfTopY = 1.3175;
  const hullSponsonBottomY = 1.29;
  const hullSponsonTopY = 1.44;
  const roadWheelR = 0.345;
  const roadWheelY = 0.37;
  const roadWheelZs = [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92];
  const returnRollerZs = [2.40, 1.00, -0.42, -1.77];
  const returnRollerY = 1.00;
  const trackWidth = 0.54;
  const trackThickness = 0.07;
  const trackTopSupportY = returnRollerY + 0.105 + trackThickness / 2;
  const trackBotY = 0.05;
  // Both ground-course knees directly below the terminal road-wheel centres.
  const trackContactZF = roadWheelZs[0];
  const trackContactZR = roadWheelZs.at(-1);
  const frontIdler = { z: 3.17, y: 0.79, r: 0.29 };
  const rearSprocket = { z: -2.70, y: 0.84, r: 0.30 };
  // The front mudguards' drooped plate (its top from the fender plate at rearZ to frontY at frontZ) and the rear louvre
  // boxes' run.
  const frontGuard = { rearZ: 3.04, topY: 1.33, frontZ: 3.64, frontY: 1.21 };
  const frontGuardTopY = (z: number): number =>
    frontGuard.topY - (frontGuard.topY - frontGuard.frontY) * (z - frontGuard.rearZ) / (frontGuard.frontZ - frontGuard.rearZ);
  const rearLouvre = { rearZ: -3.36, frontZ: -2.32 };

  const buildLeo1A2A1HullStage1 = (): void => {
    P.add('hull', box(1.90, 0.54, 6.48), 0, 0.68, -0.02);
  };
  buildLeo1A2A1HullStage1();
  yield 'buildLeo1A2A1HullStage1';
  // The sponson is the hull shoulder above the fenders, ending at the angle-derived deck break.
  const sponsonRearZ = -3.34;
  const sponsonLength = upperGlacisRearZ - sponsonRearZ;
  const sponsonCenterZ = (upperGlacisRearZ + sponsonRearZ) / 2;
  const buildLeo1A2A1RunningGearStage1 = (): void => {
    P.add('hull', box(3.26, hullSponsonTopY - hullSponsonBottomY, sponsonLength),
      0, (hullSponsonBottomY + hullSponsonTopY) / 2, sponsonCenterZ);
    P.add('hull', box(2.58, 0.18, sponsonLength), 0, 1.43, sponsonCenterZ);
    // Nose-only lower glacis, sharing the upper plate's x=±.80, y=1.04, z=3.54 seam.
    const lowerBow = convexSlab(
      [-0.78, 0.48, 3.24], [0.78, 0.48, 3.24], [0.78, 0.48, 2.92], [-0.78, 0.48, 2.92],
      [-0.80, 1.04, 3.54], [0.80, 1.04, 3.54], [0.80, 0.74, 3.30], [-0.80, 0.74, 3.30]);
    lowerBow.userData.primaryStockRole = 'leo1a2a1-lower-bow';
    P.add('hull', lowerBow);
    P.add('hull', slab(
      [-1.05, 1.34, upperGlacisRearZ], [1.05, 1.34, upperGlacisRearZ],
      [1.05, 1.34, -3.34], [-1.05, 1.34, -3.34],
      [-1.24, 1.54, upperGlacisRearZ], [1.24, 1.54, upperGlacisRearZ],
      [1.24, 1.51, -3.34], [-1.24, 1.51, -3.34]));
    for (const s of [-1, 1] as const) {
      const m = (x: number): number => s * x;
      P.add('hull', slab(
        [m(1.05), 1.34, upperGlacisRearZ], [m(1.63), 1.34, upperGlacisRearZ],
        [m(1.63), 1.34, -3.34], [m(1.05), 1.34, -3.34],
        [m(1.24), 1.54, upperGlacisRearZ], [m(1.29), 1.49, upperGlacisRearZ],
        [m(1.29), 1.47, -3.34], [m(1.24), 1.51, -3.34]));
      P.add('hull', slab(
        [m(0.80), 1.04, upperGlacisFrontZ], [m(1.64), 1.34, 3.48],
        [m(1.63), 1.34, upperGlacisRearZ], [m(1.05), 1.34, upperGlacisRearZ],
        [m(0.80), 1.10, upperGlacisFrontZ], [m(1.64), 1.40, 3.43],
        [m(1.29), 1.49, upperGlacisRearZ], [m(1.05), 1.54, upperGlacisRearZ]));
    }
    // Deck crown: the engine deck lies flat at 1.75 under the turret's sweep to -2.45 and climbs to the stern's crown
    // behind; it falls through two breaks into the glacis ahead.
    P.add('hull', slab(
      [-1.28, 1.7387, -2.45], [1.28, 1.7387, -2.45], [1.28, 1.71, -1.25], [-1.28, 1.71, -1.25],
      [-1.28, 1.75, -2.45], [1.28, 1.75, -2.45], [1.28, 1.75, -1.25], [-1.28, 1.75, -1.25]));
    P.add('hull', slab(
      [-1.28, 1.76, -3.34], [1.28, 1.76, -3.34], [1.28, 1.7387, -2.45], [-1.28, 1.7387, -2.45],
      [-1.28, 1.82, -3.34], [1.28, 1.82, -3.34], [1.28, 1.75, -2.45], [-1.28, 1.75, -2.45]));
    P.add('hull', slab(
      [-1.28, 1.71, centerDeckRearZ], [1.28, 1.71, centerDeckRearZ],
      [1.24, upperGlacisRearY, upperGlacisRearZ], [-1.24, upperGlacisRearY, upperGlacisRearZ],
      [-1.28, 1.77, centerDeckRearZ], [1.28, 1.77, centerDeckRearZ],
      [1.24, 1.60, upperGlacisRearZ], [-1.24, 1.60, upperGlacisRearZ]));
    // Structural lofts under the two deck skins, so the rear and centre runs are one closed volume.
    P.add('hull', slab(
      [-1.27, 1.46, -3.34], [1.27, 1.46, -3.34], [1.27, 1.47, -1.25], [-1.27, 1.47, -1.25],
      [-1.28, 1.761, -3.34], [1.28, 1.761, -3.34], [1.28, 1.711, -1.25], [-1.28, 1.711, -1.25]));
    P.add('hull', slab(
      [-1.27, 1.47, centerDeckRearZ], [1.27, 1.47, centerDeckRearZ],
      [1.23, 1.44, upperGlacisRearZ], [-1.23, 1.44, upperGlacisRearZ],
      [-1.28, 1.711, centerDeckRearZ], [1.28, 1.711, centerDeckRearZ],
      [1.24, 1.541, upperGlacisRearZ], [-1.24, 1.541, upperGlacisRearZ]));
    P.add('hull', slab(
      [-1.05, upperGlacisRearY, upperGlacisRearZ],
      [1.05, upperGlacisRearY, upperGlacisRearZ],
      [0.80, upperGlacisFrontY, upperGlacisFrontZ],
      [-0.80, upperGlacisFrontY, upperGlacisFrontZ],
      [-1.05, upperGlacisRearY + 0.06, upperGlacisRearZ],
      [1.05, upperGlacisRearY + 0.06, upperGlacisRearZ],
      [0.80, upperGlacisFrontY + 0.06, upperGlacisFrontZ],
      [-0.80, upperGlacisFrontY + 0.06, upperGlacisFrontZ]));
    P.add('hull', box(2.50, 0.60, 0.15), 0, 1.21, -3.47);
    // lower rear plate: the belly rises from its rear edge (z -3.26, y 0.41) to the rear plate's foot (z -3.395, y 0.91)
    P.add('hull', slab(
      [-0.944, 0.416, -3.23], [0.944, 0.416, -3.23], [0.944, 0.916, -3.425], [-0.944, 0.916, -3.425],
      [-0.944, 0.496, -3.23], [0.944, 0.496, -3.23], [0.944, 0.996, -3.425], [-0.944, 0.996, -3.425]));
    P.add('hull', box(2.62, 0.06, 0.20), 0, 1.50, -3.43);

    // The fenders are a continuous structural shelf: the sealed hull side behind the running gear, the shelf bridging
    // it to the outer fascia, a shallow shoulder under it.
    for (const s of [-1, 1] as const) {
      P.add('hull', box(0.08, 0.62, 6.30), s * 0.95, 1.02, -0.05);
      P.add('hull', box(0.10, 0.30, 0.30), s * 0.95, 1.15, 3.18, -0.28, 0, 0);
      P.add('hull', box(0.10, 0.32, 0.28), s * 0.95, 1.12, -3.22, 0.12, 0, 0);
      P.add('hullDetail', box(0.575, 0.045, 6.78), s * 1.4175, fenderShelfY, -0.02);
      P.add('hullDetail', box(0.08, 0.28, 6.16), s * 1.01, 1.195, -0.08);
      P.add('hullDetail', box(0.012, 0.18, 6.04), s * 1.70, 1.195, -0.10);
      P.add('hullDetail', slab(
        [s * 1.10, 1.27, frontGuard.rearZ], [s * 1.67, 1.27, frontGuard.rearZ], [s * 1.67, 1.27, 2.70], [s * 1.13, 1.27, 2.62],
        [s * 1.10, 1.33, frontGuard.rearZ], [s * 1.67, 1.33, frontGuard.rearZ], [s * 1.67, 1.33, 2.70], [s * 1.13, 1.33, 2.62]));
      // Front mudguards (critics 265: "large drooped front mudguards" in every 1A2A1 photo): the plate falls forward
      // from the fender over the idler to past the nose, with a deep outer flange and a front lip.
      P.add('hullDetail', slab(
        [s * 1.10, frontGuard.topY - 0.06, frontGuard.rearZ], [s * 1.712, frontGuard.topY - 0.06, frontGuard.rearZ],
        [s * 1.712, frontGuard.frontY - 0.03, frontGuard.frontZ], [s * 1.10, frontGuard.frontY - 0.03, frontGuard.frontZ],
        [s * 1.10, frontGuard.topY, frontGuard.rearZ], [s * 1.712, frontGuard.topY, frontGuard.rearZ],
        [s * 1.712, frontGuard.frontY, frontGuard.frontZ], [s * 1.10, frontGuard.frontY, frontGuard.frontZ]));
      P.add('hullDetail', slab(
        [s * 1.69, frontGuard.topY - 0.13, frontGuard.rearZ], [s * 1.712, frontGuard.topY - 0.13, frontGuard.rearZ],
        [s * 1.712, frontGuard.frontY - 0.11, frontGuard.frontZ], [s * 1.69, frontGuard.frontY - 0.11, frontGuard.frontZ],
        [s * 1.69, frontGuard.topY, frontGuard.rearZ], [s * 1.712, frontGuard.topY, frontGuard.rearZ],
        [s * 1.712, frontGuard.frontY, frontGuard.frontZ], [s * 1.69, frontGuard.frontY, frontGuard.frontZ]));
      P.add('hullDetail', box(0.612, 0.11, 0.022), s * 1.406, frontGuard.frontY - 0.055, frontGuard.frontZ - 0.011);
      // The 1A1's rubber skirts, the hems overlapping the fascia's outer face by 2 mm.
      P.hangMudguard('leo1a2a1-front-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.36), s * 1.711, 1.045, 3.31, -0.06, 0, 0);
      P.hangMudguard('leo1a2a1-rear-skirt-hem', 'hullRubber', box(0.014, 0.34, 0.40), s * 1.711, 1.02, -3.34, 0.08, 0, 0);
      for (let k = 0; k < 7; k++) {
        const z = 2.40 - k * 0.82;
        P.hangMudguard('leo1a2a1-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.76), s * 1.711, 0.995, z);
        P.add('hullDetail', box(0.012, 0.34, 0.026), s * 1.707, 1.00, z - 0.395);
        P.add('hullDetail', box(0.36, 0.035, 0.055), s * 1.47, 1.345, z);
      }
      // The engine's louvred air outlets over the sprockets (critics 265: "the raised slatted exhaust grille boxes on
      // the rear deck corners"): a box on the sponson from the fender up to under the deck's crown, its face sloped
      // 45 degrees, slats along it; it takes the rearmost locker's place.
      const louvreTop = 1.72;
      const louvreRing = [[1.26, 1.34], [1.68, 1.34], [1.68, 1.38], [1.34, louvreTop], [1.26, louvreTop]] as const;
      P.addEquipment('hull', sectionSolid([rearLouvre.rearZ, rearLouvre.frontZ]
        .map((z) => ({ z, ring: s > 0 ? louvreRing : mirrorRing(louvreRing) }))));
      const louvreLength = rearLouvre.frontZ - rearLouvre.rearZ - 0.08, louvreZ = (rearLouvre.rearZ + rearLouvre.frontZ) / 2;
      for (let k = 0; k < 6; k++) {
        const u = (k + 0.5) / 6, ax = 1.68 - 0.34 * u, ay = 1.38 + (louvreTop - 1.38) * u;
        P.add('hullDark', box(0.012, 0.046, louvreLength), s * (ax + 0.707 * 0.003), ay + 0.707 * 0.003, louvreZ, 0, 0, s * Math.PI / 4);
        P.addEquipment('hull', box(0.014, 0.018, louvreLength + 0.02), s * (ax + 0.707 * 0.008 - 0.707 * 0.024),
          ay + 0.707 * 0.008 + 0.707 * 0.024, louvreZ, 0, 0, s * Math.PI / 4);
      }
      // Leopard-pattern fender lockers: flush lids and small outboard latches.
      for (let k = 1; k < 4; k++) {
        const z = -2.58 + k * 0.83;
        P.addEquipment('hull', box(0.42, 0.16, 0.72), s * 1.43, 1.395, z);
        P.addEquipment('hull', box(0.44, 0.025, 0.74), s * 1.43, 1.487, z);
        P.add('hullDark', box(0.022, 0.07, 0.11), s * 1.649, 1.395, z + 0.22);
      }
    }
    P.mats.rubber.color.setHex(0x34372d);
  };
  buildLeo1A2A1RunningGearStage1();
  yield 'buildLeo1A2A1RunningGearStage1';

  // Driver station, lamps, guards, towing gear and deck kit.
  const driverHatchY = centerDeckTopY(0.86);
  const buildLeo1A2A1HullStage2 = (): void => {
    P.addCupola('hull', box(0.68, 0.08, 0.42), -0.45, driverHatchY + 0.04, 0.86, -0.04, 0, 0);
  };
  buildLeo1A2A1HullStage2();
  yield 'buildLeo1A2A1HullStage2';
  const driverPeriscopeY = centerDeckTopY(1.03);
  const buildLeo1A2A1HullStage3 = (): void => {
    for (const x of [-0.66, -0.45, -0.24]) {
      P.addEquipment('hull', box(0.13, 0.07, 0.05), x, driverPeriscopeY + 0.035, 1.03, -0.10, 0, 0);
      P.add('hullGlass', box(0.09, 0.035, 0.014), x, driverPeriscopeY + 0.072, 1.061, -0.10, 0, 0);
    }
  };
  buildLeo1A2A1HullStage3();
  yield 'buildLeo1A2A1HullStage3';
  const roundHatchY = centerDeckTopY(0.70);
  const buildLeo1A2A1RunningGearStage2 = (): void => {
    P.addEquipment('hull', cylY(0.18, 0.18, 0.025, P.q ? 20 : 14), 0.63, roundHatchY + 0.0125, 0.70);
    P.addEquipment('hull', torus(0.18, 0.012, P.q ? 20 : 14), 0.63, roundHatchY + 0.031, 0.70);
    for (const s of [-1, 1] as const) {
      headlight(P, s * 1.31, frontGuardTopY(3.27) + 0.06, 3.27, -0.26);
      P.addEquipment('hull', box(0.018, 0.18, 0.16), s * 1.31, frontGuardTopY(3.30) + 0.09, 3.30, -0.26, 0, 0);
      P.add('hull', box(0.10, 0.10, 0.13), s * 0.70, 0.64, 3.37);
      liftEye(P, 'hullDetail', s * 1.17, centerDeckTopY(1.65) + 0.015, 1.65, s * 0.45);
      P.addEquipment('hull', cylY(0.010, 0.010, 0.34, 7), s * 1.58, frontGuardTopY(3.36) + 0.17, 3.36, 0, 0, s * 0.08);
      P.addEquipment('hull', sph(0.018, 8), s * (1.58 - Math.sin(0.08) * 0.17), frontGuardTopY(3.36) + 0.17 + Math.cos(0.08) * 0.17, 3.36);
    }
    // tow cable run across the bow edge, below the grouser rack
    towCable(P, [
      [-0.70, upperGlacisY(3.42) + 0.075, 3.42],
      [0, upperGlacisY(3.44) + 0.075, 3.44],
      [0.70, upperGlacisY(3.42) + 0.075, 3.42],
    ], 0.024);
    // The grouser (Schneegreifer) rack across the upper glacis, the Munster 1A2A1's: three staggered rows of spiked
    // cleats on a bar frame (critics 265).
    const glacisTilt = THREE.MathUtils.degToRad(90 - upperGlacisAngleFromVerticalDeg);
    for (const [row, z] of [2.86, 3.06, 3.26].entries()) {
      P.addEquipment('hullDark', box(1.30, 0.03, 0.04), 0, upperGlacisY(z) + 0.075, z, glacisTilt, 0, 0);
      for (let k = 0; k < 9 - (row % 2); k++) {
        P.addEquipment('hullDark', box(0.10, 0.07, 0.14), -0.56 + (row % 2) * 0.07 + k * 0.14, upperGlacisY(z) + 0.095, z,
          glacisTilt, 0, 0);
      }
    }
    // The shovel and crowbar lie on the fender lockers' lids (1.50 m), out of the cast mantlet's sweep: on the deck
    // beside the ring they stood under its underside whenever the gun was laid over the rear quarters.
    const lockerLidTopY = 1.4995;
    shovelTool(P, -1.43, lockerLidTopY + 0.015, -0.505);
    P.addEquipment('hull', box(0.030, 0.025, 0.86), 1.43, lockerLidTopY + 0.0125, -0.505);

    // Leopard engine deck: long intake fields, twin fan rings, transverse exhaust bank and rear louvres, all below the
    // rotating basket.
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.82, 0.018, 1.04), s * 0.52, 1.759, -1.72);
      P.addEquipment('hull', box(0.86, 0.022, 0.035), s * 0.52, 1.762, -1.20);
      P.addEquipment('hull', box(0.86, 0.022, 0.035), s * 0.52, 1.762, -2.24);
      for (let k = 0; k < 6; k++) P.addEquipment('hull', box(0.78, 0.014, 0.035), s * 0.52, 1.762, -1.29 - k * 0.17);
      P.add('hullDark', cylY(0.23, 0.23, 0.012, P.q ? 24 : 16), s * 0.55, 1.756, -2.50);
      P.addEquipment('hull', torus(0.23, 0.014, P.q ? 24 : 16), s * 0.55, 1.765, -2.50);
      P.addEquipment('hull', cylY(0.055, 0.055, 0.022, 10), s * 0.55, 1.768, -2.50);
      P.addEquipment('hull', cylY(0.085, 0.085, 0.025, 12), s * 1.08, 1.7605, -2.08);
    }
    P.add('hullDark', box(1.78, 0.018, 0.44), 0, 1.806, -3.00);
    for (let k = 0; k < 4; k++) P.addEquipment('hull', box(1.70, 0.014, 0.045), 0, 1.819, -2.84 - k * 0.11);

    // Rear service face and two NATO fuel cans in their carriers against the transom, braced into the hull.
    P.add('hullDark', box(2.28, 0.46, 0.035), 0, 1.34, -3.525);
    for (let k = 0; k < 7; k++) {
      P.add('hullDetail', box(0.035, 0.38, 0.035), -0.90 + k * 0.30, 1.34, -3.545);
    }
    for (const s of [-1, 1] as const) {
      const canX = s * 0.72;
      P.addEquipment('hullCloth', box(0.56, 0.66, 0.24), canX, 1.44, -3.45);
      P.addEquipment('hullCloth', box(0.48, 0.09, 0.22), canX, 1.805, -3.45);
      P.addEquipment('hullDark', box(0.23, 0.075, 0.07), canX, 1.87, -3.45);
      P.addEquipment('hullDark', cylY(0.035, 0.040, 0.045, 10), canX + s * 0.16, 1.8695, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.50, 0.020), canX, 1.44, -3.582, 0, 0, 0.66);
      P.addEquipment('hullDark', box(0.035, 0.50, 0.020), canX, 1.44, -3.584, 0, 0, -0.66);
      P.addEquipment('hullDark', box(0.62, 0.035, 0.28), canX, 1.80, -3.45);
      P.addEquipment('hullDark', box(0.62, 0.035, 0.28), canX, 1.08, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.75, 0.28), canX - 0.30, 1.44, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.75, 0.28), canX + 0.30, 1.44, -3.45);
      P.addEquipment('hullDark', box(0.075, 0.11, 0.40), canX, 1.10, -3.34, 0.26, 0, 0);
      P.add('hullGlass', box(0.10, 0.08, 0.018), s * 1.18, 1.49, -3.553);
    }

    // Seven 690 mm dual wheels on the Leopard trapezoid course, both drums lifted 50 mm so the end wraps rise cleanly
    // into the return run.
    buildRunningGear(P, {
      style: 'rubber', dishR: 0.77, wheelR: roadWheelR, wheelW: 0.225, wheelY: roadWheelY, xc: 1.40,
      wheelZs: roadWheelZs,
      sprocket: rearSprocket, idler: frontIdler,
      rollers: returnRollerZs.map((z) => ({ z, y: returnRollerY, r: 0.105 })),
      trackW: trackWidth, trackTh: trackThickness, topY: trackTopSupportY, botY: trackBotY,
      contactZF: trackContactZF, contactZR: trackContactZR,
      frontArcSteps: 12, rearArcSteps: 12,
      linkPitchM: 0.125, shoeRadialScale: 0.58, shoeWidthScale: 0.97,
      endRingSpan: 0.50, coveredTop: 1.06, arms: true, paintedEnds: true,
      padHex: 0x3b3c32, chainHex: 0x2c3029, gearFloor: true,
    });

    P.hullG.userData.leopard1A2A1FinishReceipt = {
      revision: 'leo1a2a1-263-old-hull',
      oldHullFrom: '0a3d073341',
      continuousFenders: true,
      segmentedSideAprons: 14,
      fenderLockers: 8,
      rearFuelCans: 2,
      roadWheelStations: 7,
      roadWheelR,
      roadWheelY,
      roadWheelPitch: 0.74,
      roadWheelZs: [...roadWheelZs],
      returnRollerZs: [...returnRollerZs],
      returnRollerY,
      trackWidth,
      trackOuterEdgeX: Number((1.40 + trackWidth / 2).toFixed(4)),
      trackTopSupportY: Number(trackTopSupportY.toFixed(4)),
      trackThickness,
      trackBotY,
      hullSponsonBottomY,
      fenderShelfTopY,
      upperGlacisAngleFromVerticalDeg,
      upperGlacisFrontZ,
      upperGlacisRearZ: Number(upperGlacisRearZ.toFixed(4)),
      frontIdler: { ...frontIdler },
      rearSprocket: { ...rearSprocket },
    };
  };
  buildLeo1A2A1RunningGearStage2();
  yield 'buildLeo1A2A1RunningGearStage2';


  // ------------------------------------------------------- the cast turret --
  // The 262 Leopard 1A5's lines as one casting (owner 2026-10-28: "make it based off the 1a5 more with a slightly rounded
  // corners"): the 1A5's chevron core (its base set in under a 0.30 m ridge, its upper face leaning in to the roof), the
  // side plates running the ridge back along it and the wedges carrying it forward either side of the mask, each closing
  // in front on the ridge line. The ridges and roof edges are rounded by a few centimetres; there are no bolts. The ring
  // sits on the old hull's deck at the source station (0.50 m ahead of the hull origin); the deck rises from 1.69 m at the
  // ring to 1.77 m 1.75 m behind it, so every foot stands over the deck within its reach at any bearing.
  const turretY = centerDeckTopY(0.50) + 0.016;
  P.turretG.position.set(0, turretY, 0.50);
  const castRoofY = 0.79;
  const ridgeY = 0.30;
  // [z, base half-width, ridge half-width, roof half-width, roof, foot]: the 1A5's stations, their feet lifted for the
  // old deck
  const coreRows: readonly (readonly [number, number, number, number, number, number])[] = [
    [-2.20, 0.50, 0.62, 0.44, 0.58, 0.16],
    [-1.80, 0.76, 0.88, 0.58, 0.70, 0.11],
    [-1.10, 0.96, 1.08, 0.72, 0.78, 0.07],
    [-0.40, 1.00, 1.12, 0.76, castRoofY, 0.05],
    [0.20, 1.00, 1.12, 0.76, castRoofY, 0.05],
    [0.65, 0.92, 1.02, 0.70, 0.77, 0.05],
    [0.95, 0.74, 0.84, 0.58, 0.70, 0.08],
    [1.08, 0.62, 0.70, 0.50, 0.64, 0.12],
  ];
  const coreSections: readonly SolidSection[] = coreRows.map(([z, wb, wm, wr, yr, yb]) => ({
    z, ring: castChevronRing(wb, yb, wm, ridgeY, wr, yr) }));
  const coreRoofAt = (z: number): number => {
    const i = Math.max(0, Math.min(coreRows.length - 2, coreRows.findIndex((r) => r[0] > z) - 1));
    const a = coreRows[i], b = coreRows[i + 1], t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
    return a[4] + (b[4] - a[4]) * t;
  };
  // The side plates' run ([z, inner, outer base, foot, ridge, top edge, top]): the 1A5's, from a short tail tapering into
  // the core back to the wedges.
  const sideRows: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [-1.34, 0.78, 1.02, 0.10, 1.10, 0.86, 0.70],
    [-1.20, 0.92, 1.18, 0.08, 1.28, 0.98, 0.74],
    [-0.40, 0.96, 1.22, 0.07, 1.34, 1.02, 0.75],
    [0.40, 0.98, 1.22, 0.07, 1.34, 1.02, 0.75],
  ];
  // The wedges either side of the mask: the ridge runs from the side plates (±1.34 at z 0.40) to the tip beside the mask
  // (±0.76 at z 1.36); ahead of z 1.12 the upper and lower faces close on the ridge, so each wedge ends in its line.
  const wedgeRows: readonly (readonly [number, number, number, number, number, number, number])[] = [
    [0.40, 0.98, 1.22, 0.07, 1.34, 1.02, 0.75],
    [0.70, 0.86, 1.05, 0.08, 1.16, 0.89, 0.74],
    [1.00, 0.74, 0.88, 0.08, 0.98, 0.75, 0.74],
    [1.12, 0.69, 0.82, 0.08, 0.91, 0.71, 0.72],
    [1.22, 0.66, 0.76, 0.11, 0.85, 0.69, 0.56],
    [1.30, 0.65, 0.73, 0.19, 0.80, 0.68, 0.41],
    [1.36, 0.66, 0.71, 0.27, 0.76, 0.67, 0.33],
  ];
  const plateSections = (rows: typeof sideRows, s: -1 | 1): SolidSection[] => rows.map(([z, xi, xb, yb, xr, xt, yt]) => {
    const ring = plateChevronRing(xi, xb, yb, xr, xt, yt);
    return { z, ring: s > 0 ? ring : mirrorRing(ring) };
  });
  const plateEdges = (s: -1 | 1): readonly number[] => (s > 0 ? PLATE_ROUND_EDGES : mirrorEdges(PLATE_ROUND_EDGES, 9));
  const buildLeo1A2A1TurretStage0 = (): void => {
    P.add('turret', cylY(0.98, 1.04, 0.165, P.q ? 28 : 18), 0, -0.0275, 0);
    const core = sectionSolid(coreSections, { smoothSideEdges: CAST_ROUND_EDGES });
    core.userData.primaryStockRole = 'leo1a2a1-cast-core';
    P.add('turret', core);
    for (const s of [-1, 1] as const) {
      const side = sectionSolid(plateSections(sideRows, s), { smoothSideEdges: plateEdges(s) });
      side.userData.primaryStockRole = 'leo1a2a1-cast-side';
      P.add('turret', side);
      const wedge = sectionSolid(plateSections(wedgeRows, s), { smoothSideEdges: plateEdges(s) });
      wedge.userData.primaryStockRole = 'leo1a2a1-cast-wedge';
      P.add('turret', wedge);
    }
  };
  buildLeo1A2A1TurretStage0();
  yield 'buildLeo1A2A1TurretStage0';

  const buildLeo1A2A1TurretStage1 = (): void => {
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * 0.64, castRoofY + 0.01, 0.20, s * 0.45);
      liftEye(P, 'turretDetail', s * 0.62, coreRoofAt(-1.10) - 0.01, -1.10, s * 2.65);
      // Wegmann 76 mm dischargers: four per side on the casting behind the side plates, as on the 1A5
      P.addEquipment('turret', box(0.08, 0.28, 0.42), s * 0.90, 0.45, -1.46, 0, 0, s * 0.25);
      for (let k = 0; k < 8; k++) {
        const row = Math.floor(k / 4), col = k % 4;
        const y = 0.34 + row * 0.18, z = -1.30 - col * 0.11;
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.54, s * 0.16, 0), s * 0.97, y, z);
      }
    }

    // PERI R12: the commander's stabilised periscope, a tall box on its pedestal over the right front roof (-x: a +Z hull's
    // right), its window looking forward under a hood (the Munster 1A2A1's).
    const periX = -0.46, periZ = 0.24, periBase = coreRoofAt(periZ);
    P.addEquipment('turret', box(0.30, 0.12, 0.32), periX, periBase + 0.04, periZ);
    P.addEquipment('turret', cylY(0.11, 0.12, 0.08, P.q ? 16 : 10), periX, periBase + 0.13, periZ);
    P.addEquipment('turret', box(0.44, 0.30, 0.50), periX, periBase + 0.31, periZ);
    P.addEquipment('turret', box(0.46, 0.022, 0.52), periX, periBase + 0.47, periZ);
    P.addEquipment('turretDark', box(0.32, 0.12, 0.025), periX, periBase + 0.36, periZ + 0.255);
    P.add('turretGlass', box(0.26, 0.08, 0.012), periX, periBase + 0.36, periZ + 0.272);
    P.addEquipment('turret', box(0.36, 0.022, 0.08), periX, periBase + 0.43, periZ + 0.28, 0.20, 0, 0);
    for (const dx of [-0.16, 0.16]) P.addEquipment('turretDark', box(0.022, 0.20, 0.022), periX + dx, periBase + 0.31, periZ - 0.26);

    // The commander's cupola behind it, the loader's hatch and MG3 on the left (+x), the gunner's periscopes, the beacon
    // and ventilator.
    const cmdX = -0.48, cmdZ = -0.62;
    P.addCupola('turret', cylY(0.26, 0.27, 0.06, P.q ? 20 : 14), cmdX, castRoofY + 0.03, cmdZ);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P.add('turretGlass', box(0.055, 0.045, 0.018), cmdX + Math.sin(a) * 0.23, castRoofY + 0.0825, cmdZ + Math.cos(a) * 0.23, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.21, 0.22, 0.045, P.q ? 20 : 14), cmdX, castRoofY + 0.13, cmdZ);
    P.addCupola('turret', xform(sph(0.19, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.26, 1]), cmdX, castRoofY + 0.175, cmdZ);
    P.addCupola('turret', cylY(0.23, 0.24, 0.055, P.q ? 20 : 14), 0.52, castRoofY + 0.0275, -0.46);
    P.addCupola('turret', xform(sph(0.20, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.24, 1]), 0.52, castRoofY + 0.0975, -0.46);
    for (const x of [0.28, 0.10, -0.08]) P.add('turretGlass', box(0.09, 0.035, 0.025), x, castRoofY + 0.01, 0.28, -0.10, 0, 0);
    {
      P.addEquipment('turret', cylY(0.12, 0.14, 0.13, P.q ? 16 : 10), 0.45, castRoofY + 0.065, -0.30);
      P.addEquipment('turret', box(0.24, 0.08, 0.20), 0.45, castRoofY + 0.12, -0.30);
      // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the loader's working MG3
      const mg = FITTINGS.pintleMG({
        mats: P.mats, cls: 'mg3', tone: 'two-tone', elev: 0.05,
        scale: 0.96, seed: 15, shield: true, ammo: true, working: true, ridingCradle: true,
      });
      mg.name = 'leo1LoaderMg3';
      mg.position.set(0.45, castRoofY + 0.12, -0.30);
      mg.rotation.y = -0.34;
      P.turretG.add(mg);
    }
    const beaconRoof = coreRoofAt(-1.00);
    P.addEquipment('turretDark', cylY(0.05, 0.06, 0.03, 10), -0.20, beaconRoof + 0.010, -1.00);
    P.addEquipment('turretDark', cylY(0.014, 0.014, 0.20, 8), -0.20, beaconRoof + 0.125, -1.00);
    P.addEquipment('turretDark', cylY(0.045, 0.045, 0.03, 12), -0.20, beaconRoof + 0.24, -1.00);
    P.add('turretGlass', xform(sph(0.045, 12), 0, 0, 0, 0, 0, 0, [1, 1.3, 1]), -0.20, beaconRoof + 0.285, -1.00);
    P.addEquipment('turret', cylY(0.10, 0.11, 0.05, P.q ? 16 : 10), 0.12, coreRoofAt(-1.25) + 0.02, -1.25);
    P.addEquipment('turret', xform(sph(0.14, P.q ? 16 : 10), 0, 0, 0, 0, 0, 0, [1, 0.32, 1]), 0.12, coreRoofAt(-1.25) + 0.05, -1.25);
  };
  buildLeo1A2A1TurretStage1();
  yield 'buildLeo1A2A1TurretStage1';

  // The 1A5's bustle basket on the casting's tail, loaded, and the stowage racks on its flanks.
  const bustleWidth = 1.88;
  const bustleFrontZ = -2.24;
  const bustleRearZ = -2.84;
  const bustleCenterZ = (bustleFrontZ + bustleRearZ) / 2;
  const bustleDepth = bustleFrontZ - bustleRearZ;
  const bustleFloorY = 0.31;
  const buildLeo1A2A1MarkingsStage1 = (): void => {
    P.addEquipment('turret', box(1.60, 0.25, 0.20), 0, 0.44, -2.20);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, 0.78, bustleRearZ);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, 0.29, bustleRearZ);
    P.addEquipment('turret', box(1.80, 0.025, bustleDepth), 0, bustleFloorY, bustleCenterZ);
    P.addEquipment('turret', box(1.84, 0.035, 0.10), 0, 0.74, bustleFrontZ);
    P.addEquipment('turret', box(1.82, 0.030, 0.035), 0, 0.53, bustleCenterZ);
    for (let k = 0; k < 7; k++) {
      const x = -0.86 + k * (1.72 / 6);
      P.addEquipment('turret', box(0.030, 0.49, 0.030), x, 0.535, bustleRearZ);
      P.addEquipment('turret', box(0.034, 0.034, bustleDepth - 0.03), x, 0.37, bustleCenterZ, -0.10, 0, 0);
    }
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.92, 0.78, bustleCenterZ);
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.92, 0.29, bustleCenterZ);
      P.addEquipment('turret', box(0.055, 0.055, bustleDepth + 0.02), s * 0.76, 0.47, bustleCenterZ, -0.50, 0, 0);
      const rack = FITTINGS.stowageRack({ mats: P.mats, w: 0.64, d: 0.27, h: 0.26,
        rails: 3, fill: 0.82, seed: s > 0 ? 31 : 32, rotation: [0, s * Math.PI / 2, 0] });
      rack.position.set(s * 1.03, 0.31, -1.68);
      P.turretG.add(rack);
      P.addEquipment('turret', box(0.07, 0.08, 0.08), s * 0.60, coreRoofAt(-1.42) - 0.04, -1.42);
      P.addEquipment('turret', cylY(0.014, 0.016, 2.62, 8), s * 0.60, coreRoofAt(-1.42) + 0.66, -1.42, 0, 0, s * 0.025);
    }
    stowage(P, 'turretCloth', rng, [
      [-0.56, 0.51, -2.54, 0.52, 0.32, 0.48], [0, 0.50, -2.55, 0.50, 0.31, 0.48],
      [0.56, 0.51, -2.54, 0.46, 0.31, 0.46],
    ]);
    jerryCan(P, 'turretCloth', 0.68, 0.57, -2.65, 0.16);
    tarpRoll(P, 'turretCloth', -0.04, 0.736, -2.45, 0.96, 0.095, true, P.q ? 12 : 8);
    ammoCan(P, 'turretDark', -0.72, 0.45, -2.66, 0.12);

    P.turretG.userData.leopard1A2A1TurretFinishReceipt = {
      revision: 'leo1a2a1-263-1a5-lines',
      castTurret: true,
      leopard1A5Lines: true,
      roundedCorners: true,
      boltedPlates: false,
      castRoofY,
      ridgeY,
      ridgeHalfWidth: Math.max(...sideRows.map((r) => r[4])),
      wedgeTipZ: wedgeRows.at(-1)![0],
      castFootOverDeckAtEveryBearing: true,
      periR12: [-0.46, 0.24],
      rearDischargers: 8,
      connectedBustleBasket: true,
      bustleRearZ,
      bustleWidth,
      bustleFloorY,
    };

    P.decal('turret', 'crossgrey', null, 0.28, [1.235, 0.45, -0.40], Math.PI / 2, 0, 0.60);
    P.decal('turret', 'crossgrey', null, 0.28, [-1.235, 0.45, -0.40], -Math.PI / 2, 0, -0.60);
    P.decal('turret', 'number', P.spec.visual.number || '211', 0.21, [0.81, 0.52, -1.50], Math.PI / 2, 0, 0.70);
  };
  buildLeo1A2A1MarkingsStage1();
  yield 'buildLeo1A2A1MarkingsStage1';

  // The mantlet and the L7A3: the 1A5's chevron mask, as wide as the gap between the wedges, its brow sloping down and its
  // chin up until they meet in a horizontal line where the gun leaves (owner 2026-10-28: "the correct mantlet ... that
  // ends in a line"). The turret owns a flat receiver plate; the moving mask owns a matching rear pad and the block. The
  // trunnion stands 0.40 m over the ring; the mask's underside clears the old hull's rising engine deck (1.74-1.77 m at its
  // radius) when the gun is laid over the rear.
  const trunnionY = 0.40;
  const trunnionZ = 1.15;
  const mantletReceiver = { width: 1.32, height: 0.62, depth: 0.16, y: trunnionY + 0.01, z: 0.99 };
  const mantletRearPad = { width: 1.20, height: 0.48, depth: 0.14, z: -0.22 };
  const mantletMask = { halfWidth: 0.62, low: -0.30, high: 0.34, rearZ: -0.16, rearHigh: 0.24, bodyZ: 0.10,
    ridgeHalfWidth: 0.58, ridgeLow: -0.012, ridgeHigh: 0.012, ridgeZ: 0.50 };
  const maskRing = (w: number, yb: number, yt: number, c: number): readonly (readonly [number, number])[] => [
    [-w + c, yb], [w - c, yb], [w, yb + c], [w, yt - c], [w - c, yt], [-w + c, yt], [-w, yt - c], [-w, yb + c],
  ];
  const buildLeo1A2A1GunStage1 = (): void => {
    P.add('turret', new THREE.BoxGeometry(mantletReceiver.width, mantletReceiver.height, mantletReceiver.depth),
      0, mantletReceiver.y, mantletReceiver.z);
    P.gunG.position.set(0, trunnionY, trunnionZ);
    P.addGunExtra(new THREE.BoxGeometry(mantletRearPad.width, mantletRearPad.height, mantletRearPad.depth),
      0, 0, mantletRearPad.z);
    const k = mantletMask;
    // (the corners chamfered and their normals smoothed, so the block's vertical and horizontal edges read slightly round)
    P.addGunExtra(sectionSolid([
      { z: k.rearZ, ring: maskRing(k.halfWidth - 0.02, k.low + 0.02, k.rearHigh, 0.05) },
      { z: k.bodyZ, ring: maskRing(k.halfWidth, k.low, k.high, 0.06) },
      { z: k.ridgeZ, ring: maskRing(k.ridgeHalfWidth, k.ridgeLow, k.ridgeHigh, 0.008) },
    ], { smoothSideEdges: [1, 3, 5, 7] }));
    // The brow and chin faces' outward normals (y, z), for seating the bolts and the sight / coax ports square to them.
    const brow = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.high - k.ridgeHigh).normalize();
    const chin = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.ridgeLow - k.low).normalize();
    const onBrow = (t: number, out: number): [number, number] => [
      k.high - (k.high - k.ridgeHigh) * t + brow.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + brow.y * out];
    const onChin = (t: number, out: number): [number, number] => [
      k.low + (k.ridgeLow - k.low) * t - chin.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + chin.y * out];
    // the gunner's telescope port on the right of the brow (-x), the coaxial MG's on the left of the chin (+x)
    P.addGunExtraDark(xform(cylZ(0.055, 0.05, 14), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), -0.30, ...onBrow(0.5, 0.012));
    P.addGunExtraDark(xform(cylZ(0.045, 0.06, 12), 0, 0, 0, Math.atan2(chin.x, chin.y), 0, 0), 0.34, ...onChin(0.80, 0.014));
    // the ring around the tube where it leaves the line, just over the sleeve (critics 265: not a big protruding collar)
    P.addGunExtra(cylZ(0.095, 0.09, P.q ? 20 : 14, 0.10), 0, 0, k.ridgeZ - 0.005);
    // (the mantlet root at the sleeve's size, inside the mask: at 0.14 m it stood out through the wedge as a collar)
    buildGun(P, { len: 4.35, r: 0.064, sleeve: true, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.08 });
    muzzleBore(P, { len: 4.35, r: 0.064 });
    P.gunG.userData.leopard1A2A1MantletReceipt = {
      seated: true,
      chevronProfile: true,
      endsInLine: true,
      maskWidth: k.halfWidth * 2,
      maskHeight: Number((k.high - k.low).toFixed(2)),
      maskRidgeZ: k.ridgeZ,
      maskRidgeHalfHeight: k.ridgeHigh,
      maskDepth: Number((k.ridgeZ - k.rearZ).toFixed(2)),
      rearContactWidth: mantletRearPad.width,
      rearContactZ: mantletRearPad.z,
      receiverWidth: mantletReceiver.width,
      receiverY: mantletReceiver.y,
      receiverZ: mantletReceiver.z,
      trunnion: [0, trunnionY, trunnionZ],
      barrelRadius: 0.064,
    };

    P.mats.glass.color.setHex(0x3e493b);
    P.mats.glass.roughness = 0.48;
    P.mats.glass.metalness = 0.30;
    P.topY = turretY;
  };
  buildLeo1A2A1GunStage1();
}
export function buildLeo1A2A1(...args: Parameters<typeof buildLeo1A2A1Steps>): void {
  drainTankBuild(buildLeo1A2A1Steps(...args));
}
withBuildSteps(buildLeo1A2A1, buildLeo1A2A1Steps);
