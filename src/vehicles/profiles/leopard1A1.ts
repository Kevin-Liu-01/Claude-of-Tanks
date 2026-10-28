// Leopard 1A1 (release 263; owner 2026-10-28: "keep ur new leopard variants and make one that uses the old hull and has
// like a rounder 'unarmored' version that looks more like the world of tanks leopard 1", then "the old turret is still
// bad and the new turret for leopard is better, but need it to look accurate"). The hull and running gear are the
// Leopard 1A5's as they stood before the 262 proportion rebuild (0a3d073341); the turret is the bare cast turret of the
// first series, before the 1A1A1's Blohm & Voss appliqué, drawn from the Panzermuseum Munster's Leopard 1A2A1 (Commons
// "Kampfpanzer Leopard 1 A2 A1.JPG", "Panzermuseum Munster 2010 0705/0706.JPG", "Leopard 1 A2 A1 (27470540069).jpg";
// docs/references/tanks/leo1a1.md). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// The casting's cross-section: an egg, tucked in at its lower edge, widest a fifth of the way up, its side rolling over
// into a broad flat roof. Rows are [height fraction, half-width fraction].
const CAST_EGG: readonly (readonly [number, number])[] = [
  [0, 0.90], [0.10, 0.97], [0.25, 1], [0.45, 0.975], [0.64, 0.925], [0.78, 0.86], [0.88, 0.78], [0.95, 0.67],
  [0.99, 0.52], [1, 0.38],
];
const castEggRing = (halfWidth: number, baseY: number, roofY: number): readonly SectionPoint[] => {
  const h = roofY - baseY;
  const right = CAST_EGG.map(([f, w]) => [halfWidth * w, baseY + f * h] as const);
  const left = [...right].reverse().map(([x, y]) => [-x, y] as const);
  return [left.at(-1)!, right[0], ...right.slice(1), ...left.slice(0, -1)];
};
// Every side edge of the egg is one continuous casting (the floor edge, index 0, stays a hard floor).
const CAST_SMOOTH_EDGES = Array.from({ length: CAST_EGG.length * 2 - 1 }, (_, i) => i + 1);

function* buildLeo1A1Steps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, torus, sph, buildGun, buildRunningGear,
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

  const buildLeo1A1HullStage1 = (): void => {
    P.add('hull', box(1.90, 0.54, 6.48), 0, 0.68, -0.02);
  };
  buildLeo1A1HullStage1();
  yield 'buildLeo1A1HullStage1';
  // The sponson is the hull shoulder above the fenders, ending at the angle-derived deck break.
  const sponsonRearZ = -3.34;
  const sponsonLength = upperGlacisRearZ - sponsonRearZ;
  const sponsonCenterZ = (upperGlacisRearZ + sponsonRearZ) / 2;
  const buildLeo1A1RunningGearStage1 = (): void => {
    P.add('hull', box(3.26, hullSponsonTopY - hullSponsonBottomY, sponsonLength),
      0, (hullSponsonBottomY + hullSponsonTopY) / 2, sponsonCenterZ);
    P.add('hull', box(2.58, 0.18, sponsonLength), 0, 1.43, sponsonCenterZ);
    // Nose-only lower glacis, sharing the upper plate's x=±.80, y=1.04, z=3.54 seam.
    const lowerBow = convexSlab(
      [-0.78, 0.48, 3.24], [0.78, 0.48, 3.24], [0.78, 0.48, 2.92], [-0.78, 0.48, 2.92],
      [-0.80, 1.04, 3.54], [0.80, 1.04, 3.54], [0.80, 0.74, 3.30], [-0.80, 0.74, 3.30]);
    lowerBow.userData.primaryStockRole = 'leo1a1-lower-bow';
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
        [s * 1.10, 1.27, 3.34], [s * 1.67, 1.27, 3.36], [s * 1.67, 1.27, 2.70], [s * 1.13, 1.27, 2.62],
        [s * 1.10, 1.33, 3.42], [s * 1.67, 1.33, 3.42], [s * 1.67, 1.33, 2.70], [s * 1.13, 1.33, 2.62]));
      // The 1A1's rubber skirts, the hems overlapping the fascia's outer face by 2 mm.
      P.hangMudguard('leo1a1-front-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.36), s * 1.711, 1.045, 3.31, -0.06, 0, 0);
      P.hangMudguard('leo1a1-rear-skirt-hem', 'hullRubber', box(0.014, 0.34, 0.40), s * 1.711, 1.02, -3.34, 0.08, 0, 0);
      for (let k = 0; k < 7; k++) {
        const z = 2.40 - k * 0.82;
        P.hangMudguard('leo1a1-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.76), s * 1.711, 0.995, z);
        P.add('hullDetail', box(0.012, 0.34, 0.026), s * 1.707, 1.00, z - 0.395);
        P.add('hullDetail', box(0.36, 0.035, 0.055), s * 1.47, 1.345, z);
      }
      // Leopard-pattern fender lockers: flush lids and small outboard latches.
      for (let k = 0; k < 4; k++) {
        const z = -2.58 + k * 0.83;
        P.addEquipment('hull', box(0.42, 0.16, 0.72), s * 1.43, 1.395, z);
        P.addEquipment('hull', box(0.44, 0.025, 0.74), s * 1.43, 1.487, z);
        P.add('hullDark', box(0.022, 0.07, 0.11), s * 1.649, 1.395, z + 0.22);
      }
    }
    P.mats.rubber.color.setHex(0x34372d);
  };
  buildLeo1A1RunningGearStage1();
  yield 'buildLeo1A1RunningGearStage1';

  // Driver station, lamps, guards, towing gear and deck kit.
  const driverHatchY = centerDeckTopY(0.86);
  const buildLeo1A1HullStage2 = (): void => {
    P.addCupola('hull', box(0.68, 0.08, 0.42), -0.45, driverHatchY + 0.04, 0.86, -0.04, 0, 0);
  };
  buildLeo1A1HullStage2();
  yield 'buildLeo1A1HullStage2';
  const driverPeriscopeY = centerDeckTopY(1.03);
  const buildLeo1A1HullStage3 = (): void => {
    for (const x of [-0.66, -0.45, -0.24]) {
      P.addEquipment('hull', box(0.13, 0.07, 0.05), x, driverPeriscopeY + 0.035, 1.03, -0.10, 0, 0);
      P.add('hullGlass', box(0.09, 0.035, 0.014), x, driverPeriscopeY + 0.072, 1.061, -0.10, 0, 0);
    }
  };
  buildLeo1A1HullStage3();
  yield 'buildLeo1A1HullStage3';
  const roundHatchY = centerDeckTopY(0.70);
  const buildLeo1A1RunningGearStage2 = (): void => {
    P.addEquipment('hull', cylY(0.18, 0.18, 0.025, P.q ? 20 : 14), 0.63, roundHatchY + 0.0125, 0.70);
    P.addEquipment('hull', torus(0.18, 0.012, P.q ? 20 : 14), 0.63, roundHatchY + 0.031, 0.70);
    for (const s of [-1, 1] as const) {
      headlight(P, s * 1.31, 1.30, 3.27, -0.26);
      P.addEquipment('hull', box(0.018, 0.18, 0.16), s * 1.31, 1.33, 3.30, -0.26, 0, 0);
      P.add('hull', box(0.10, 0.10, 0.13), s * 0.70, 0.64, 3.37);
      liftEye(P, 'hullDetail', s * 1.17, centerDeckTopY(1.65) + 0.015, 1.65, s * 0.45);
      P.addEquipment('hull', cylY(0.010, 0.010, 0.34, 7), s * 1.58, 1.48, 3.36, 0, 0, s * 0.08);
      P.addEquipment('hull', sph(0.018, 8), s * (1.58 - Math.sin(0.08) * 0.17), 1.48 + Math.cos(0.08) * 0.17, 3.36);
    }
    towCable(P, [
      [-0.76, upperGlacisY(3.18) + 0.07, 3.18],
      [0, upperGlacisY(2.82) + 0.07, 2.82],
      [0.76, upperGlacisY(3.18) + 0.07, 3.18],
    ], 0.024);
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

    P.hullG.userData.leopard1A1FinishReceipt = {
      revision: 'leo1a1-263-old-hull',
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
  buildLeo1A1RunningGearStage2();
  yield 'buildLeo1A1RunningGearStage2';

  // ------------------------------------------------------- the cast turret --
  // The first-series casting, bare: an egg in every section (the side tucked in at its foot, widest low, rolling over
  // into a broad flat roof), the cheeks converging in a blunt rounded nose on the mantlet in plan and the bustle tapering
  // to a rounded tail. The ring sits on the deck at the source station (0.50 m ahead of the hull origin); the casting
  // stands 0.81 m over it. The deck rises from 1.69 m at the ring to 1.77 m 1.75 m behind it, so every station's foot
  // stands over the highest deck within its reach at any bearing (5 cm at the sides, 0.10 m at the bustle) and the ring
  // bearing rises to meet it.
  const turretY = centerDeckTopY(0.50) + 0.016;
  P.turretG.position.set(0, turretY, 0.50);
  const castRoofY = 0.81;
  // [z, half-width, foot, roof]: the roof holds its height back to a blunt tail; ahead it falls to a blunt rounded nose
  const castStationRows: readonly (readonly [number, number, number, number])[] = [
    [-2.16, 0.62, 0.20, 0.64],
    [-2.08, 0.80, 0.15, 0.71],
    [-1.84, 0.92, 0.12, 0.76],
    [-1.42, 1.02, 0.10, 0.79],
    [-0.96, 1.11, 0.07, 0.805],
    [-0.46, 1.17, 0.05, castRoofY],
    [0.06, 1.19, 0.05, castRoofY],
    [0.46, 1.14, 0.05, 0.80],
    [0.76, 1.04, 0.05, 0.78],
    [0.96, 0.90, 0.055, 0.74],
    [1.10, 0.72, 0.08, 0.70],
    [1.18, 0.52, 0.14, 0.63],
  ];
  const castStations: readonly SolidSection[] = castStationRows.map(([z, w, yb, yt]) => ({ z, ring: castEggRing(w, yb, yt) }));
  // Casting surface helpers for seating fittings: the half-width at (z, y) and the roof height at z.
  const castRow = (z: number): readonly [number, number, number] => {
    for (let i = 0; i < castStationRows.length - 1; i++) {
      const [z0, w0, b0, t0] = castStationRows[i], [z1, w1, b1, t1] = castStationRows[i + 1];
      if (z >= z0 && z <= z1) {
        const t = (z - z0) / (z1 - z0);
        return [w0 + (w1 - w0) * t, b0 + (b1 - b0) * t, t0 + (t1 - t0) * t];
      }
    }
    const end = z < castStationRows[0][0] ? castStationRows[0] : castStationRows.at(-1)!;
    return [end[1], end[2], end[3]];
  };
  const castHalfWidthAt = (z: number, y: number): number => {
    const [w, yb, yt] = castRow(z);
    const f = THREE.MathUtils.clamp((y - yb) / (yt - yb), 0, 1);
    for (let i = 0; i < CAST_EGG.length - 1; i++) {
      const [f0, w0] = CAST_EGG[i], [f1, w1] = CAST_EGG[i + 1];
      if (f >= f0 && f <= f1) return w * (w0 + (w1 - w0) * (f - f0) / (f1 - f0));
    }
    return w * CAST_EGG.at(-1)![1];
  };
  const castRoofAt = (z: number): number => castRow(z)[2];
  const buildLeo1A1TurretStage0 = (): void => {
    P.add('turret', cylY(0.98, 1.04, 0.165, P.q ? 28 : 18), 0, -0.0275, 0);
    const casting = sectionSolid(castStations, { smoothSideEdges: CAST_SMOOTH_EDGES });
    casting.userData.primaryStockRole = 'leo1a1-cast-turret';
    P.add('turret', casting);
  };
  buildLeo1A1TurretStage0();
  yield 'buildLeo1A1TurretStage0';

  const rangefinderWindows: [number, number, number][] = [];
  const buildLeo1A1TurretStage1 = (): void => {
    for (const s of [-1, 1] as const) {
      // The TEM 2A rangefinder's armoured end housings, one on each front cheek: a rounded blister cast into the side,
      // its window looking forward under a hinged armoured lid.
      const rfZ = 0.60, rfY = 0.42;
      const rfX = castHalfWidthAt(rfZ, rfY);
      P.add('turret', xform(sph(1, P.q ? 20 : 14), 0, 0, 0, 0, 0, 0, [0.12, 0.13, 0.22]), s * (rfX - 0.02), rfY, rfZ);
      // (the window's rim stands just proud of the blister's nose, 0.207 m ahead of its centre 4 cm outboard)
      P.add('turretDark', cylZ(0.072, 0.03, P.q ? 18 : 12), s * (rfX + 0.02), rfY, rfZ + 0.215);
      P.add('turretGlass', cylZ(0.056, 0.012, P.q ? 18 : 12), s * (rfX + 0.02), rfY, rfZ + 0.234);
      rangefinderWindows.push([s * (rfX + 0.02), rfY, rfZ + 0.24]);
      P.addEquipment('turretDark', box(0.17, 0.022, 0.12), s * (rfX + 0.02), rfY + 0.10, rfZ + 0.18, -0.32, 0, 0);
      P.addEquipment('turretDark', cylX(0.016, 0.16, 8), s * (rfX + 0.02), rfY + 0.10, rfZ + 0.12);

      // Wegmann 76 mm smoke dischargers: four per side in a two-by-two block on each front roof corner, firing forward
      // and out over the cheeks.
      const dZ = 0.56, dX = castHalfWidthAt(dZ, castRoofAt(dZ) - 0.05) - 0.16;
      // (its block runs down into the roof's rolled edge and up round both rows of tube breeches, so no tube stands off it)
      P.addEquipment('turret', box(0.30, 0.20, 0.24), s * dX, castRoofAt(dZ) + 0.02, dZ, 0, s * 0.10, 0);
      for (let k = 0; k < 4; k++) {
        const col = k % 2, row = Math.floor(k / 2);
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.22, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.30, 0),
          s * (dX - 0.06 + col * 0.12), castRoofAt(dZ) + 0.03 + row * 0.07, dZ + 0.02 - row * 0.05);
      }

      liftEye(P, 'turretDetail', s * 0.70, castRoofAt(0.30) + 0.01, 0.30, s * 0.45);
      liftEye(P, 'turretDetail', s * 0.66, castRoofAt(-1.40) + 0.01, -1.40, s * 2.65);
    }

    // The commander's cupola on the right rear roof (eight periscopes, a domed hatch) with the TRP-2A periscopic sight
    // ahead of it; the loader's flat hatch and MG3 station on the left.
    const cmdX = 0.50, cmdZ = -0.52;
    P.addCupola('turret', cylY(0.28, 0.30, 0.10, P.q ? 22 : 14), cmdX, castRoofY + 0.04, cmdZ);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P.add('turretGlass', box(0.06, 0.045, 0.018), cmdX + Math.sin(a) * 0.255, castRoofY + 0.10, cmdZ + Math.cos(a) * 0.255, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.23, 0.25, 0.05, P.q ? 22 : 14), cmdX, castRoofY + 0.145, cmdZ);
    P.addCupola('turret', xform(sph(0.21, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.28, 1]), cmdX, castRoofY + 0.17, cmdZ);
    P.addEquipment('turret', box(0.18, 0.20, 0.22), cmdX, castRoofY + 0.10, cmdZ + 0.38);
    P.addEquipment('turret', box(0.20, 0.03, 0.24), cmdX, castRoofY + 0.215, cmdZ + 0.38);
    P.add('turretGlass', box(0.12, 0.08, 0.014), cmdX, castRoofY + 0.12, cmdZ + 0.497);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 14), -0.52, castRoofY + 0.025, -0.44);
    P.addCupola('turret', cylY(0.22, 0.22, 0.03, P.q ? 20 : 14), -0.52, castRoofY + 0.065, -0.44);
    for (const x of [-0.30, -0.12]) P.add('turretGlass', box(0.09, 0.035, 0.025), x, castRoofY + 0.005, 0.30, -0.10, 0, 0);
    {
      P.addEquipment('turret', cylY(0.12, 0.14, 0.12, P.q ? 16 : 10), -0.52, castRoofY + 0.06, -0.14);
      // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the loader's working MG3
      const mg = FITTINGS.pintleMG({
        mats: P.mats, cls: 'mg3', tone: 'two-tone', elev: 0.05,
        scale: 0.96, seed: 15, shield: false, ammo: true, working: true, ridingCradle: true,
      });
      mg.name = 'leo1LoaderMg3';
      mg.position.set(-0.52, castRoofY + 0.12, -0.14);
      mg.rotation.y = 0.30;
      P.turretG.add(mg);
    }
    // The roof ventilator's mushroom cap behind the hatches.
    P.addEquipment('turret', cylY(0.10, 0.11, 0.05, P.q ? 16 : 10), 0, castRoofAt(-1.10) + 0.02, -1.10);
    P.addEquipment('turret', xform(sph(0.14, P.q ? 16 : 10), 0, 0, 0, 0, 0, 0, [1, 0.32, 1]), 0, castRoofAt(-1.10) + 0.05, -1.10);
    for (const s of [-1, 1] as const) {
      // antenna bases on the rear roof shoulders
      P.addEquipment('turret', cylY(0.05, 0.06, 0.08, 10), s * 0.60, castRoofAt(-1.62) + 0.02, -1.62);
      P.addEquipment('turret', cylY(0.014, 0.016, 2.62, 8), s * 0.60, castRoofAt(-1.62) + 1.37, -1.62, 0, 0, s * 0.025);
    }
  };
  buildLeo1A1TurretStage1();
  yield 'buildLeo1A1TurretStage1';

  // The stowage basket around the casting's tail.
  const bustleWidth = 1.80;
  const bustleFrontZ = -2.00;
  const bustleRearZ = -2.66;
  const bustleFloorY = 0.24;
  const bustleTopY = 0.66;
  const bustleCenterZ = (bustleFrontZ + bustleRearZ) / 2;
  const bustleDepth = bustleFrontZ - bustleRearZ;
  const buildLeo1A1MarkingsStage1 = (): void => {
    P.addEquipment('turret', box(1.40, 0.20, 0.20), 0, 0.36, -2.08);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, bustleTopY, bustleRearZ);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, bustleFloorY - 0.02, bustleRearZ);
    P.addEquipment('turret', box(bustleWidth - 0.08, 0.025, bustleDepth), 0, bustleFloorY, bustleCenterZ);
    P.addEquipment('turret', box(bustleWidth - 0.04, 0.030, 0.035), 0, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
    for (let k = 0; k < 7; k++) {
      const x = -0.84 + k * (1.68 / 6);
      P.addEquipment('turret', box(0.030, bustleTopY - bustleFloorY, 0.030), x, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
      P.addEquipment('turret', box(0.034, 0.034, bustleDepth - 0.03), x, bustleFloorY + 0.06, bustleCenterZ, -0.10, 0, 0);
    }
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.90, bustleTopY, bustleCenterZ);
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.90, bustleFloorY - 0.02, bustleCenterZ);
      // brackets from the casting's tail out to the basket's front corners
      for (const y of [bustleFloorY + 0.04, 0.48]) {
        const inner = castHalfWidthAt(bustleFrontZ, y) - 0.03;
        P.addEquipment('turret', box(0.92 - inner, 0.035, 0.035), s * (inner + 0.92) / 2, y, bustleFrontZ);
      }
      P.addEquipment('turret', box(0.040, bustleTopY - bustleFloorY, 0.040), s * 0.90, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
      const rack = FITTINGS.stowageRack({ mats: P.mats, w: 0.60, d: 0.26, h: 0.24,
        rails: 3, fill: 0.82, seed: s > 0 ? 33 : 34, rotation: [0, s * Math.PI / 2, 0] });
      const rackZ = -1.62;
      rack.position.set(s * (castHalfWidthAt(rackZ, 0.30) + 0.10), 0.22, rackZ);
      P.turretG.add(rack);
    }
    stowage(P, 'turretCloth', rng, [
      [-0.54, bustleFloorY + 0.17, -2.36, 0.50, 0.30, 0.46], [0, bustleFloorY + 0.16, -2.37, 0.48, 0.29, 0.46],
      [0.54, bustleFloorY + 0.17, -2.36, 0.44, 0.30, 0.44],
    ]);
    jerryCan(P, 'turretCloth', 0.66, bustleFloorY + 0.26, -2.50, 0.16);
    tarpRoll(P, 'turretCloth', -0.04, bustleTopY - 0.06, -2.30, 0.94, 0.09, true, P.q ? 12 : 8);
    ammoCan(P, 'turretDark', -0.70, bustleFloorY + 0.14, -2.52, 0.12);

    P.turretG.userData.leopard1A1TurretFinishReceipt = {
      revision: 'leo1a1-263-cast',
      castTurret: true,
      roundedCasting: true,
      blohmVossApplique: false,
      castMaxHalfWidth: 1.19,
      castRoofY,
      castFrontZ: castStationRows.at(-1)![0],
      castRearZ: castStationRows[0][0],
      castFootOverDeckAtEveryBearing: true,
      rangefinderWindows: rangefinderWindows.map((p) => p.map((c) => Number(c.toFixed(4)))),
      frontCornerDischargers: 8,
      connectedBustleBasket: true,
      bustleRearZ,
      bustleWidth,
      bustleFloorY,
    };

    P.decal('turret', 'crossgrey', null, 0.28, [castHalfWidthAt(-0.50, 0.40) + 0.004, 0.40, -0.50], Math.PI / 2, 0, 0.20);
    P.decal('turret', 'crossgrey', null, 0.28, [-castHalfWidthAt(-0.50, 0.40) - 0.004, 0.40, -0.50], -Math.PI / 2, 0, -0.20);
    P.decal('turret', 'number', P.spec.visual.number || '211', 0.21, [castHalfWidthAt(-1.25, 0.42) + 0.004, 0.42, -1.25], Math.PI / 2, 0, 0.28);
  };
  buildLeo1A1MarkingsStage1();
  yield 'buildLeo1A1MarkingsStage1';

  // The first-series cast mantlet and the L7A3. The casting's nose closes on a flat receiver; the mantlet is a cast bell
  // round the gun, as wide as the nose at its root and tapering to the collar, owned by the gun so it pitches with it.
  // The trunnion stands 0.40 m over the ring so the bell's underside clears the old hull's rising engine deck (1.74-1.77 m
  // at its radius) when the gun is laid over the rear.
  const trunnionY = 0.40;
  const trunnionZ = 1.00;
  const bell: readonly (readonly [number, number, number])[] = [
    // [gun-local z, half-width, half-height]
    [-0.06, 0.44, 0.30], [0.10, 0.44, 0.30], [0.24, 0.41, 0.285], [0.36, 0.35, 0.255], [0.45, 0.28, 0.22],
    [0.51, 0.215, 0.19], [0.54, 0.17, 0.165],
  ];
  const bellRing = (rx: number, ry: number): readonly SectionPoint[] => Array.from({ length: P.q ? 24 : 16 }, (_, k) => {
    const a = -Math.PI / 2 + (k / (P.q ? 24 : 16)) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry] as const;
  });
  const buildLeo1A1GunStage1 = (): void => {
    P.gunG.position.set(0, trunnionY, trunnionZ);
    const bellCount = P.q ? 24 : 16;
    P.addGunExtra(sectionSolid(bell.map(([z, rx, ry]) => ({ z, ring: bellRing(rx, ry) })),
      { smoothSideEdges: Array.from({ length: bellCount }, (_, i) => i) }));
    // the telescope's port on the bell's upper left and the coaxial MG3's on its lower right, each in the bell's face
    const bellAt = (z: number, angle: number): [number, number] => {
      const i = bell.findIndex(([bz]) => bz >= z), [z0, x0, y0] = bell[i - 1], [z1, x1, y1] = bell[i];
      const t = (z - z0) / (z1 - z0);
      return [Math.cos(angle) * (x0 + (x1 - x0) * t), Math.sin(angle) * (y0 + (y1 - y0) * t)];
    };
    P.addGunExtraDark(cylZ(0.05, 0.06, 14), ...bellAt(0.42, THREE.MathUtils.degToRad(145)), 0.44);
    P.addGunExtraDark(cylZ(0.026, 0.06, 10), ...bellAt(0.42, THREE.MathUtils.degToRad(-25)), 0.45);
    // the collar round the tube where it leaves the bell
    P.addGunExtra(cylZ(0.13, 0.10, P.q ? 20 : 14, 0.16), 0, 0, bell.at(-1)![0] + 0.04);
    buildGun(P, { len: 4.35, r: 0.064, sleeve: true, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.14 });
    muzzleBore(P, { len: 4.35, r: 0.064 });
    P.gunG.userData.leopard1A1MantletReceipt = {
      seated: true,
      castBell: true,
      bellRootWidth: bell[0][1] * 2,
      bellRootHeight: bell[0][2] * 2,
      bellFrontZ: bell.at(-1)![0],
      trunnion: [0, trunnionY, trunnionZ],
      barrelRadius: 0.064,
    };

    P.mats.glass.color.setHex(0x3e493b);
    P.mats.glass.roughness = 0.48;
    P.mats.glass.metalness = 0.30;
    P.topY = turretY;
  };
  buildLeo1A1GunStage1();
}
export function buildLeo1A1(...args: Parameters<typeof buildLeo1A1Steps>): void {
  drainTankBuild(buildLeo1A1Steps(...args));
}
withBuildSteps(buildLeo1A1, buildLeo1A1Steps);
