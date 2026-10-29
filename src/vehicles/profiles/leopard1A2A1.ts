// Leopard 1A2A1 (release 263). Owner 2026-10-28: "keep ur new leopard variants and make one that uses the old hull and
// has like a rounder 'unarmored' version that looks more like the world of tanks leopard 1", then "need it to look
// accurate", then "completely redesign this current leopard. it needs to take a lot more inspo from that 1a2, from the
// chevron mantlet that joins at a line, the turret that is a lot better and not just a torus, the boxes, smoke
// canisters, tech etc". The hull and running gear are the Leopard 1A5's as they stood before the 262 proportion rebuild
// (0a3d073341). The turret is the Panzermuseum Munster's Leopard 1A2A1: the bare 1A2 casting (no Blohm & Voss
// appliqué), the chevron mantlet and the PERI R12 (Commons "Kampfpanzer Leopard 1 A2 A1.JPG", "Panzermuseum Munster
// 2010 0705/0706.JPG", "Leopard 1 A2 A1 (27470540069).jpg", "Leopard 1 A2 A1 \"Rotland\" (51438927896).jpg";
// docs/references/tanks/leo1a2a1.md). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// One station of the cast turret: z, the chine's half-width and height, the foot and the roof, and how far the upper
// face leans in per metre of rise. The section is the 1A2 casting's: an undercut lower face from the foot out to a hard
// horizontal chine, then a broad upper face leaning in (slightly convex) and rolling over into a flat roof.
interface CastStation { readonly z: number; readonly chineX: number; readonly footY: number; readonly chineY: number;
  readonly roofY: number; readonly lean: number }
const CAST_UPPER_BULGE = 0.055;
const castRing = ({ chineX: wc, footY: yb, chineY: yc, roofY: yt, lean }: CastStation): readonly SectionPoint[] => {
  const footX = wc - 0.75 * (yc - yb);
  const rise = yt - 0.06 - yc;
  const topX = wc - lean * rise;
  // the upper face rises from the chine bulging outward (the cast cheek's swell) before it rolls over into the roof
  const upper = (t: number): SectionPoint => [wc - lean * rise * t + CAST_UPPER_BULGE * Math.sin(Math.PI * t), yc + rise * t];
  const right: readonly SectionPoint[] = [
    [footX, yb], [wc, yc], upper(1 / 3), upper(2 / 3), [topX, yt - 0.06], [topX - 0.07, yt - 0.016], [topX - 0.19, yt],
  ];
  const left = right.map(([x, y]) => [-x, y] as const).reverse();
  return [left.at(-1)!, ...right, ...left.slice(0, -1)];
};
// The upper faces, shoulders and roof are one continuous casting; the floor, the lower faces and so the chine stay hard.
const CAST_SMOOTH_EDGES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** The ring's right side x at height y (the section is convex above the foot). */
const castRingXAt = (ring: readonly SectionPoint[], y: number): number => {
  const right = ring.slice(1, 8);
  if (y <= right[0][1]) return right[0][0];
  for (let i = 0; i < right.length - 1; i++) {
    const [x0, y0] = right[i], [x1, y1] = right[i + 1];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
  }
  return right.at(-1)![0];
};
// The mantlet's section at one station: a rectangle with rounded vertical corners (radius r), viewed from ahead.
const roundedRect = (hw: number, yb: number, yt: number, r: number, arc = 3): readonly SectionPoint[] => {
  const pts: SectionPoint[] = [];
  const corners: readonly (readonly [number, number, number])[] = [
    [hw - r, yb + r, -Math.PI / 2], [hw - r, yt - r, 0], [-hw + r, yt - r, Math.PI / 2], [-hw + r, yb + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k < arc; k++) {
      const a = a0 + (k / (arc - 1)) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
};

function* buildLeo1A2A1Steps(P: TankBuilderPort): TankProfileBuild {
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
        [s * 1.10, 1.27, 3.34], [s * 1.67, 1.27, 3.36], [s * 1.67, 1.27, 2.70], [s * 1.13, 1.27, 2.62],
        [s * 1.10, 1.33, 3.42], [s * 1.67, 1.33, 3.42], [s * 1.67, 1.33, 2.70], [s * 1.13, 1.33, 2.62]));
      // The 1A1's rubber skirts, the hems overlapping the fascia's outer face by 2 mm.
      P.hangMudguard('leo1a2a1-front-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.36), s * 1.711, 1.045, 3.31, -0.06, 0, 0);
      P.hangMudguard('leo1a2a1-rear-skirt-hem', 'hullRubber', box(0.014, 0.34, 0.40), s * 1.711, 1.02, -3.34, 0.08, 0, 0);
      for (let k = 0; k < 7; k++) {
        const z = 2.40 - k * 0.82;
        P.hangMudguard('leo1a2a1-skirt-hem', 'hullRubber', box(0.014, 0.31, 0.76), s * 1.711, 0.995, z);
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
  // The Leopard 1A2 casting (Munster's 1A2A1). Every section is the 1A2's: an undercut lower face from the foot out to a
  // hard horizontal chine (the widest line, 0.32-0.38 m over the ring, running from the mantlet round the cheeks and down
  // the sides to the bustle), then a broad upper face leaning in and rolling over into a flat roof 1.7 m across. Ahead of
  // the ring both faces close on the chine, so the front is a chevron in profile ending in a horizontal line at the gun's
  // height either side of the mantlet. The ring sits on the deck at the source station (0.50 m ahead of the hull origin);
  // the foot stands over the deck within its reach at every bearing (the deck rises from 1.69 m at the ring to 1.77 m
  // 1.75 m behind it).
  const turretY = centerDeckTopY(0.50) + 0.016;
  P.turretG.position.set(0, turretY, 0.50);
  const castRoofY = 0.81;
  const castStations: readonly CastStation[] = [
    { z: -2.20, chineX: 0.74, footY: 0.20, chineY: 0.36, roofY: 0.64, lean: 0.34 },
    { z: -2.12, chineX: 0.86, footY: 0.15, chineY: 0.35, roofY: 0.71, lean: 0.34 },
    { z: -1.88, chineX: 0.96, footY: 0.12, chineY: 0.34, roofY: 0.76, lean: 0.35 },
    { z: -1.45, chineX: 1.06, footY: 0.10, chineY: 0.33, roofY: 0.79, lean: 0.36 },
    { z: -0.96, chineX: 1.15, footY: 0.07, chineY: 0.32, roofY: castRoofY, lean: 0.36 },
    { z: -0.40, chineX: 1.20, footY: 0.05, chineY: 0.32, roofY: castRoofY, lean: 0.36 },
    { z: 0.10, chineX: 1.21, footY: 0.05, chineY: 0.33, roofY: castRoofY, lean: 0.37 },
    { z: 0.50, chineX: 1.17, footY: 0.05, chineY: 0.34, roofY: 0.80, lean: 0.44 },
    { z: 0.78, chineX: 1.09, footY: 0.06, chineY: 0.36, roofY: 0.76, lean: 0.62 },
    { z: 0.98, chineX: 0.96, footY: 0.12, chineY: 0.37, roofY: 0.69, lean: 0.72 },
    { z: 1.10, chineX: 0.82, footY: 0.22, chineY: 0.38, roofY: 0.58, lean: 0.85 },
    { z: 1.16, chineX: 0.68, footY: 0.32, chineY: 0.38, roofY: 0.45, lean: 1.0 },
  ];
  const castSections: readonly SolidSection[] = castStations.map((st) => ({ z: st.z, ring: castRing(st) }));
  /** The casting's station interpolated at z. */
  const castAt = (z: number): CastStation => {
    const i = Math.max(0, Math.min(castStations.length - 2, castStations.findIndex((s) => s.z > z) - 1));
    const a = castStations[i], b = castStations[i + 1], t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
    const mix = (k: 'chineX' | 'footY' | 'chineY' | 'roofY' | 'lean'): number => a[k] + (b[k] - a[k]) * t;
    return { z, chineX: mix('chineX'), footY: mix('footY'), chineY: mix('chineY'), roofY: mix('roofY'), lean: mix('lean') };
  };
  const castXAt = (z: number, y: number): number => castRingXAt(castRing(castAt(z)), y);
  const castRoofAt = (z: number): number => castAt(z).roofY;
  const buildLeo1A2A1TurretStage0 = (): void => {
    P.add('turret', cylY(0.98, 1.04, 0.165, P.q ? 28 : 18), 0, -0.0275, 0);
    const casting = sectionSolid(castSections, { smoothSideEdges: CAST_SMOOTH_EDGES });
    casting.userData.primaryStockRole = 'leo1a2a1-cast-turret';
    P.add('turret', casting);
  };
  buildLeo1A2A1TurretStage0();
  yield 'buildLeo1A2A1TurretStage0';

  const rangefinderWindows: [number, number, number][] = [];
  const buildLeo1A2A1TurretStage1 = (): void => {
    for (const s of [-1, 1] as const) {
      // The TEM 2A rangefinder's end housings: a short armoured drum across each upper cheek, its domed cap outboard and
      // its window looking forward from the drum's face under a hinged lid.
      const rfZ = 0.66, rfY = 0.52, rfR = 0.115;
      const rfX = castXAt(rfZ, rfY);
      P.add('turret', cylX(rfR, 0.24, P.q ? 20 : 14), s * (rfX + 0.05), rfY, rfZ);
      P.add('turret', xform(sph(1, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [0.05, rfR * 0.96, rfR * 0.96]), s * (rfX + 0.17), rfY, rfZ);
      P.addEquipment('turretDark', torus(rfR * 0.98, 0.012, P.q ? 20 : 14), s * (rfX + 0.17), rfY, rfZ, 0, Math.PI / 2, 0);
      P.add('turretDark', box(0.10, 0.075, 0.03), s * (rfX + 0.08), rfY, rfZ + rfR - 0.005);
      P.add('turretGlass', box(0.08, 0.055, 0.012), s * (rfX + 0.08), rfY, rfZ + rfR + 0.012);
      rangefinderWindows.push([s * (rfX + 0.08), rfY, rfZ + rfR + 0.02]);
      P.addEquipment('turretDark', box(0.12, 0.018, 0.08), s * (rfX + 0.08), rfY + 0.06, rfZ + rfR - 0.01, -0.45, 0, 0);

      // Wegmann 76 mm dischargers: a block of four on a bracket at each front roof corner, the tubes laid forward and out.
      const dZ = 0.74, dTop = castRoofAt(dZ);
      const shoulderX = castXAt(dZ, dTop - 0.06);
      P.addEquipment('turret', box(0.18, 0.16, 0.24), s * (shoulderX - 0.04), dTop - 0.06, dZ);
      P.addEquipment('turretDark', box(0.30, 0.025, 0.26), s * (shoulderX + 0.07), dTop + 0.02, dZ);
      P.addEquipment('turretDark', box(0.26, 0.17, 0.035), s * (shoulderX + 0.07), dTop + 0.10, dZ - 0.11);
      for (let k = 0; k < 4; k++) {
        const col = k % 2, row = Math.floor(k / 2);
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.04, 0.36, P.q ? 12 : 8)), 0, 0, 0, -0.14, s * 0.17, 0),
          s * (shoulderX + 0.02 + col * 0.10), dTop + 0.07 + row * 0.085, dZ - 0.10);
      }
      liftEye(P, 'turretDetail', s * 0.66, castRoofAt(0.30) + 0.01, 0.30, s * 0.45);
      liftEye(P, 'turretDetail', s * 0.62, castRoofAt(-1.40) + 0.01, -1.40, s * 2.65);
    }

    // PERI R12: the commander's stabilised periscope, a tall box on its pedestal over the right front roof, its window
    // looking forward under a hood.
    const periX = 0.46, periZ = 0.08, periBase = castRoofAt(periZ);
    P.addEquipment('turret', box(0.30, 0.12, 0.32), periX, periBase + 0.04, periZ);
    P.addEquipment('turret', cylY(0.11, 0.12, 0.08, P.q ? 16 : 10), periX, periBase + 0.13, periZ);
    P.addEquipment('turret', box(0.44, 0.30, 0.50), periX, periBase + 0.31, periZ);
    P.addEquipment('turret', box(0.46, 0.022, 0.52), periX, periBase + 0.47, periZ);
    P.addEquipment('turretDark', box(0.32, 0.12, 0.025), periX, periBase + 0.36, periZ + 0.255);
    P.add('turretGlass', box(0.26, 0.08, 0.012), periX, periBase + 0.36, periZ + 0.272);
    P.addEquipment('turret', box(0.36, 0.022, 0.08), periX, periBase + 0.43, periZ + 0.28, 0.20, 0, 0);
    for (const dx of [-0.16, 0.16]) P.addEquipment('turretDark', box(0.022, 0.20, 0.022), periX + dx, periBase + 0.31, periZ - 0.26);

    // The commander's cupola behind it (eight periscopes, a domed hatch); the loader's hatch, MG3 and beacon on the left.
    const cmdX = 0.48, cmdZ = -0.56;
    P.addCupola('turret', cylY(0.28, 0.30, 0.10, P.q ? 22 : 14), cmdX, castRoofY + 0.04, cmdZ);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P.add('turretGlass', box(0.06, 0.045, 0.018), cmdX + Math.sin(a) * 0.255, castRoofY + 0.10, cmdZ + Math.cos(a) * 0.255, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.23, 0.25, 0.05, P.q ? 22 : 14), cmdX, castRoofY + 0.145, cmdZ);
    P.addCupola('turret', xform(sph(0.21, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.28, 1]), cmdX, castRoofY + 0.17, cmdZ);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 14), -0.50, castRoofY + 0.025, -0.42);
    P.addCupola('turret', cylY(0.22, 0.22, 0.03, P.q ? 20 : 14), -0.50, castRoofY + 0.065, -0.42);
    for (const x of [-0.30, -0.12]) P.add('turretGlass', box(0.09, 0.035, 0.025), x, castRoofAt(0.30) + 0.005, 0.30, -0.10, 0, 0);
    {
      P.addEquipment('turret', cylY(0.12, 0.14, 0.12, P.q ? 16 : 10), -0.50, castRoofY + 0.06, -0.12);
      // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): the loader's working MG3
      const mg = FITTINGS.pintleMG({
        mats: P.mats, cls: 'mg3', tone: 'two-tone', elev: 0.05,
        scale: 0.96, seed: 15, shield: false, ammo: true, working: true, ridingCradle: true,
      });
      mg.name = 'leo1LoaderMg3';
      mg.position.set(-0.50, castRoofY + 0.12, -0.12);
      mg.rotation.y = 0.30;
      P.turretG.add(mg);
    }
    // the rotating beacon on its post, and the roof ventilator's mushroom cap
    P.addEquipment('turretDark', cylY(0.05, 0.06, 0.03, 10), -0.22, castRoofY + 0.015, -0.92);
    P.addEquipment('turretDark', cylY(0.014, 0.014, 0.20, 8), -0.22, castRoofY + 0.13, -0.92);
    P.addEquipment('turretDark', cylY(0.045, 0.045, 0.03, 12), -0.22, castRoofY + 0.245, -0.92);
    P.add('turretGlass', xform(sph(0.045, 12), 0, 0, 0, 0, 0, 0, [1, 1.3, 1]), -0.22, castRoofY + 0.29, -0.92);
    P.addEquipment('turret', cylY(0.10, 0.11, 0.05, P.q ? 16 : 10), 0.10, castRoofAt(-1.20) + 0.02, -1.20);
    P.addEquipment('turret', xform(sph(0.14, P.q ? 16 : 10), 0, 0, 0, 0, 0, 0, [1, 0.32, 1]), 0.10, castRoofAt(-1.20) + 0.05, -1.20);
    for (const s of [-1, 1] as const) {
      // antenna bases on the rear roof shoulders
      P.addEquipment('turret', cylY(0.05, 0.06, 0.08, 10), s * 0.58, castRoofAt(-1.66) + 0.02, -1.66);
      P.addEquipment('turret', cylY(0.014, 0.016, 2.62, 8), s * 0.58, castRoofAt(-1.66) + 1.37, -1.66, 0, 0, s * 0.025);
      // a closed stowage bin on each rear flank over the chine, standing on the casting's upper face
      const binZ = -1.52, binY = 0.50;
      const binInner = castXAt(binZ, binY + 0.15);
      P.addEquipment('turret', box(0.20, 0.30, 0.62), s * (binInner + 0.08), binY, binZ);
      P.addEquipment('turret', box(0.22, 0.02, 0.64), s * (binInner + 0.08), binY + 0.16, binZ);
      P.addEquipment('turretDark', box(0.02, 0.05, 0.06), s * (binInner + 0.185), binY + 0.08, binZ + 0.20);
      P.addEquipment('turretDark', box(0.02, 0.05, 0.06), s * (binInner + 0.185), binY + 0.08, binZ - 0.20);
    }
  };
  buildLeo1A2A1TurretStage1();
  yield 'buildLeo1A2A1TurretStage1';

  // The stowage basket round the casting's tail, loaded.
  const bustleWidth = 1.86;
  const bustleFrontZ = -2.02;
  const bustleRearZ = -2.74;
  const bustleFloorY = 0.24;
  const bustleTopY = 0.68;
  const bustleCenterZ = (bustleFrontZ + bustleRearZ) / 2;
  const bustleDepth = bustleFrontZ - bustleRearZ;
  const buildLeo1A2A1MarkingsStage1 = (): void => {
    P.addEquipment('turret', box(1.36, 0.20, 0.22), 0, 0.38, -2.12);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, bustleTopY, bustleRearZ);
    P.addEquipment('turret', box(bustleWidth, 0.040, 0.040), 0, bustleFloorY - 0.02, bustleRearZ);
    P.addEquipment('turret', box(bustleWidth - 0.08, 0.025, bustleDepth), 0, bustleFloorY, bustleCenterZ);
    P.addEquipment('turret', box(bustleWidth - 0.04, 0.030, 0.035), 0, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
    for (let k = 0; k < 7; k++) {
      const x = -0.87 + k * (1.74 / 6);
      P.addEquipment('turret', box(0.030, bustleTopY - bustleFloorY, 0.030), x, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
      P.addEquipment('turret', box(0.034, 0.034, bustleDepth - 0.03), x, bustleFloorY + 0.06, bustleCenterZ, -0.10, 0, 0);
    }
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.93, bustleTopY, bustleCenterZ);
      P.addEquipment('turret', box(0.040, 0.040, bustleDepth + 0.04), s * 0.93, bustleFloorY - 0.02, bustleCenterZ);
      // brackets from the casting's tail out to the basket's front corners
      for (const y of [bustleFloorY + 0.04, 0.50]) {
        const inner = castXAt(bustleFrontZ, y) - 0.03;
        P.addEquipment('turret', box(0.95 - inner, 0.035, 0.035), s * (inner + 0.95) / 2, y, bustleFrontZ);
      }
      P.addEquipment('turret', box(0.040, bustleTopY - bustleFloorY, 0.040), s * 0.93, (bustleFloorY + bustleTopY) / 2, bustleRearZ);
    }
    // the load: bags, a tarp roll, jerrycans, ammunition and tool boxes
    stowage(P, 'turretCloth', rng, [
      [-0.56, bustleFloorY + 0.17, -2.40, 0.50, 0.30, 0.48], [0, bustleFloorY + 0.16, -2.42, 0.48, 0.29, 0.48],
      [0.56, bustleFloorY + 0.17, -2.40, 0.46, 0.30, 0.46],
    ]);
    jerryCan(P, 'turretCloth', 0.70, bustleFloorY + 0.26, -2.58, 0.16);
    jerryCan(P, 'turretCloth', 0.52, bustleFloorY + 0.26, -2.58, 0.16);
    tarpRoll(P, 'turretCloth', -0.04, bustleTopY - 0.07, -2.34, 1.00, 0.09, true, P.q ? 12 : 8);
    ammoCan(P, 'turretDark', -0.74, bustleFloorY + 0.14, -2.58, 0.12);
    P.addEquipment('turretDark', box(0.34, 0.20, 0.22), -0.36, bustleFloorY + 0.11, -2.60);
    P.addEquipment('turretDark', box(0.36, 0.02, 0.24), -0.36, bustleFloorY + 0.22, -2.60);

    P.turretG.userData.leopard1A2A1TurretFinishReceipt = {
      revision: 'leo1a2a1-263-cast-1a2',
      castTurret: true,
      chineCasting: true,
      blohmVossApplique: false,
      castMaxHalfWidth: Math.max(...castStations.map((s) => s.chineX)),
      castRoofY,
      castFrontZ: castStations.at(-1)!.z,
      castRearZ: castStations[0].z,
      chineYRange: [Math.min(...castStations.map((s) => s.chineY)), Math.max(...castStations.map((s) => s.chineY))],
      castFootOverDeckAtEveryBearing: true,
      rangefinderWindows: rangefinderWindows.map((p) => p.map((c) => Number(c.toFixed(4)))),
      frontCornerDischargers: 8,
      periR12: [0.46, 0.08],
      connectedBustleBasket: true,
      bustleRearZ,
      bustleWidth,
      bustleFloorY,
    };

    P.decal('turret', 'crossgrey', null, 0.28, [castXAt(-0.55, 0.55) + 0.004, 0.55, -0.55], Math.PI / 2, 0, 0.45);
    P.decal('turret', 'crossgrey', null, 0.28, [-castXAt(-0.55, 0.55) - 0.004, 0.55, -0.55], -Math.PI / 2, 0, -0.45);
    P.decal('turret', 'number', P.spec.visual.number || '211', 0.21, [castXAt(-1.05, 0.56) + 0.004, 0.56, -1.05], Math.PI / 2, 0, 0.45);
  };
  buildLeo1A2A1MarkingsStage1();
  yield 'buildLeo1A2A1MarkingsStage1';

  // The 1A2's cast mantlet and the L7A3: a broad block round the gun with rounded vertical corners, its upper face sloping
  // down and its lower face up to meet at a horizontal line on the gun's axis (the chevron the casting's front repeats
  // either side), owned by the gun so it pitches with it. The trunnion stands 0.40 m over the ring so the block's underside
  // clears the old hull's rising engine deck (1.74-1.77 m at its radius) when the gun is laid over the rear.
  const trunnionY = 0.40;
  const trunnionZ = 1.00;
  const mantlet = { halfWidth: 0.50, rootZ: -0.08, bodyZ: 0.10, low: -0.30, high: 0.32, ridgeZ: 0.42, ridgeHalfWidth: 0.47,
    ridgeHalf: 0.035 };
  const buildLeo1A2A1GunStage1 = (): void => {
    P.gunG.position.set(0, trunnionY, trunnionZ);
    const k = mantlet;
    const mid = (a: number, b: number, t: number): number => a + (b - a) * t;
    P.addGunExtra(sectionSolid([
      { z: k.rootZ, ring: roundedRect(k.halfWidth - 0.01, k.low + 0.01, k.high - 0.01, 0.10) },
      { z: k.bodyZ, ring: roundedRect(k.halfWidth, k.low, k.high, 0.10) },
      { z: mid(k.bodyZ, k.ridgeZ, 0.55), ring: roundedRect(mid(k.halfWidth, k.ridgeHalfWidth, 0.55),
        mid(k.low, -k.ridgeHalf, 0.55), mid(k.high, k.ridgeHalf, 0.55), 0.08) },
      { z: k.ridgeZ, ring: roundedRect(k.ridgeHalfWidth, -k.ridgeHalf, k.ridgeHalf, 0.03) },
    ], { smoothSideEdges: [0, 1, 3, 4, 6, 7, 9, 10] }));
    // The upper (brow) and lower (chin) faces' outward normals (y, z), for seating the ports square to them.
    const brow = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.high - k.ridgeHalf).normalize();
    const chin = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.ridgeHalf - k.low).normalize();
    const onBrow = (t: number, out: number): [number, number] => [
      mid(k.high, k.ridgeHalf, t) + brow.x * out, mid(k.bodyZ, k.ridgeZ, t) + brow.y * out];
    const onChin = (t: number, out: number): [number, number] => [
      mid(k.low, -k.ridgeHalf, t) - chin.x * out, mid(k.bodyZ, k.ridgeZ, t) + chin.y * out];
    // the TZF telescope's port on the brow at the gun's right, the coaxial MG3's on the chin at its left
    P.addGunExtraDark(xform(cylZ(0.055, 0.05, 14), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), -0.30, ...onBrow(0.45, 0.012));
    P.addGunExtraDark(xform(cylZ(0.028, 0.06, 10), 0, 0, 0, Math.atan2(chin.x, chin.y), 0, 0), 0.30, ...onChin(0.50, 0.014));
    for (const x of [-0.40, 0.40]) {
      P.addGunExtraDark(xform(cylZ(0.020, 0.018, 8), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), x, ...onBrow(0.30, 0.007));
      P.addGunExtraDark(xform(cylZ(0.020, 0.018, 8), 0, 0, 0, Math.atan2(chin.x, chin.y), 0, 0), x, ...onChin(0.30, 0.007));
    }
    // the collar round the tube where it leaves the ridge
    P.addGunExtra(cylZ(0.15, 0.12, P.q ? 20 : 14, 0.17), 0, 0, k.ridgeZ + 0.04);
    buildGun(P, { len: 4.35, r: 0.064, sleeve: true, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.14 });
    muzzleBore(P, { len: 4.35, r: 0.064 });
    P.gunG.userData.leopard1A2A1MantletReceipt = {
      seated: true,
      chevronProfile: true,
      ridgeOnGunAxis: true,
      mantletWidth: k.halfWidth * 2,
      mantletHeight: Number((k.high - k.low).toFixed(2)),
      ridgeZ: k.ridgeZ,
      ridgeHalfHeight: k.ridgeHalf,
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
