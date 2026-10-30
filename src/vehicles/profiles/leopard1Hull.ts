// The Leopard 1 hull and running gear (release 265): the 262 proportion rebuild of the Leopard 1A5's hull, lifted out of
// profiles/leopard.ts unchanged so the Danish 1A3 DK and 1A5 DK builds (profiles/leopard1Dk.ts) ride the same hull. The
// Leopard 1A5 builds it with the defaults. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, orientedSlab, convexSlab } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Vec2Tuple = readonly [number, number];

export interface Leo1HullOptions {
  /** The German A5's grouser rack across the upper glacis. */
  readonly grouserRack?: boolean;
  /** The pioneer tools on the sloped upper sides (the Danish tanks carry stowage bins there). */
  readonly sideTools?: boolean;
  /** The shovel and crowbar on the deck beside the turret ring (the Danish welded turret's gun sweeps that deck low). */
  readonly deckTools?: boolean;
  /** The side skirts' hem: the German A5's black rubber, or the coat (the Danish tanks' skirts are painted over). */
  readonly skirtBucket?: 'hullRubber' | 'hull';
  /** The two fuel cans in their rear carriers: drab cloth, or the coat (the DK-1's UN white painted them over). */
  readonly rearCanBucket?: 'hullCloth' | 'hull';
}

/** The hull datums a turret or national kit seats on. */
export interface Leo1HullDatums {
  readonly bellyY: number;
  readonly fenderY: number;
  readonly deckEdgeX: number;
  readonly sponsonX: number;
  readonly skirtX: number;
  readonly upperGlacisFrontZ: number;
  readonly upperGlacisFrontY: number;
  readonly upperGlacisRearZ: number;
  readonly upperGlacisRearY: number;
  readonly deckTopY: (z: number) => number;
  readonly deckEdgeY: (z: number) => number;
  readonly upperGlacisY: (z: number) => number;
}

export function* buildLeo1HullSteps(P: TankBuilderPort, options: Leo1HullOptions = {}): Generator<string, Leo1HullDatums, void> {
  const { grouserRack = true, sideTools = true, deckTools = true, skirtBucket = 'hullRubber', rearCanBucket = 'hullCloth' } = options;
  const { box, cylY, cylZ, torus, sph, buildRunningGear, headlight, liftEye, towCable, shovelTool } = KIT;
  const slab = orientedSlab;
  // 262 proportion rebuild (owner 2026-10-27: "based on proper historical referrences so they will no longer look so
  // chungus"; gap table in docs/references/tanks/leo1a5.md). Datums from the Panzermuseum Munster 1A5 (data placard:
  // 9.54 m, 3.25 m over the tracks, 2.71 m; side, front and quarter photos): 0.44 m belly, the fender and skirt top at
  // 1.12, the deck at 1.58 under the turret's sweep and 1.64 at the stern, a flat cast-turret roof at 2.39 and the
  // EMES 18 lid at 2.71. The former stack (fender shelf 1.30, deck 1.72-1.82, a 2.5 m-wide domed turret) read tall
  // and swollen.
  const bellyY = 0.44;
  const fenderY = 1.12;
  const deckEdgeX = 1.30;
  const sponsonX = 1.66;
  const skirtX = 1.678;
  // Leopard 1 upper glacis: 60 degrees from vertical (30 degrees above the ground plane) from the source nose up to
  // the deck break, solved from that angle.
  const upperGlacisAngleFromVerticalDeg = 60;
  const upperGlacisFrontZ = 3.54;
  const upperGlacisFrontY = 1.04;
  const upperGlacisRearY = 1.52;
  const upperGlacisRisePerRun = Math.tan(
    THREE.MathUtils.degToRad(90 - upperGlacisAngleFromVerticalDeg),
  );
  const upperGlacisRearZ = upperGlacisFrontZ
    - (upperGlacisRearY - upperGlacisFrontY) / upperGlacisRisePerRun;
  const upperGlacisY = (z: number): number => upperGlacisFrontY
    + (upperGlacisFrontZ - z) * upperGlacisRisePerRun;
  // Deck crown along the hull centre: the break, the turret ring, the flat engine deck under the turret's sweep (its
  // bustle and basket clear it at every bearing) and the stern rise.
  const deckStations: readonly Vec2Tuple[] = [
    [upperGlacisRearZ, upperGlacisRearY], [1.40, 1.565], [0.50, 1.58], [-2.30, 1.58], [-3.34, 1.64],
  ];
  const deckTopY = (z: number): number => {
    for (let i = 0; i < deckStations.length - 1; i++) {
      const [z0, y0] = deckStations[i], [z1, y1] = deckStations[i + 1];
      if (z <= z0 && z >= z1) return y0 + (y1 - y0) * (z0 - z) / (z0 - z1);
    }
    return z > deckStations[0][0] ? deckStations[0][1] : deckStations[deckStations.length - 1][1];
  };
  const deckEdgeY = (z: number): number => deckTopY(z) - 0.025;
  // Running gear: the source's seven stations on the 0.74 m pitch, the track on the published 3.25 m (centres 2.70,
  // 550 mm shoes) and the return run lowered under the 1.12 fender with the terminal drums.
  const roadWheelR = 0.34;
  const roadWheelY = 0.37;
  const roadWheelZs = [2.52, 1.78, 1.04, 0.30, -0.44, -1.18, -1.92];
  const returnRollerZs = [2.40, 1.00, -0.42, -1.77];
  const returnRollerY = 0.86;
  const trackWidth = 0.55;
  const trackXc = 1.35;
  const trackThickness = 0.07;
  const trackTopSupportY = returnRollerY + 0.105 + trackThickness / 2;
  const trackBotY = 0.05;
  const trackContactZF = roadWheelZs[0];
  const trackContactZR = roadWheelZs.at(-1);
  const frontIdler = { z: 3.17, y: 0.66, r: 0.28 };
  const rearSprocket = { z: -2.70, y: 0.73, r: 0.29 };

  // ---------------------------------------------------------------- hull --
  // Lower tub between the tracks, from the 0.44 belly to the fender line.
  const buildLeo1A5ArticulatedProfileHullStage1 = (): void => {
    P.add('hull', box(1.90, fenderY - bellyY, 6.48), 0, (fenderY + bellyY) / 2, -0.02);
  };
  buildLeo1A5ArticulatedProfileHullStage1();
  yield 'buildLeo1A5ArticulatedProfileHullStage1';
  const buildLeo1A5ArticulatedProfileRunningGearStage1 = (): void => {
    // The upper hull: one loft from the stern to the deck break. Sloped side plates run from the fender (±1.66) in to
    // the deck edge (±1.30) over the full width of the vehicle, the Leopard 1 tumblehome, not a vertical sponson box.
    const upperRing = (z: number): readonly (readonly [number, number])[] => [
      [-sponsonX, fenderY - 0.02], [sponsonX, fenderY - 0.02], [deckEdgeX, deckEdgeY(z)],
      [deckEdgeX - 0.20, deckTopY(z)], [-(deckEdgeX - 0.20), deckTopY(z)], [-deckEdgeX, deckEdgeY(z)],
    ];
    P.add('hull', sectionSolid([-3.34, -2.30, 0.50, 1.40, upperGlacisRearZ]
      .map((z) => ({ z, ring: upperRing(z) }))));
    // Nose-only lower glacis from the belly to the upper plate's front edge.
    const lowerBow = convexSlab(
      [-0.78, bellyY + 0.04, 3.24], [0.78, bellyY + 0.04, 3.24], [0.78, bellyY + 0.04, 2.92], [-0.78, bellyY + 0.04, 2.92],
      [-0.80, 1.04, 3.54], [0.80, 1.04, 3.54], [0.80, 0.74, 3.30], [-0.80, 0.74, 3.30]);
    lowerBow.userData.primaryStockRole = 'leo1a5-lower-bow';
    P.add('hull', lowerBow);
    // The single 60-degree upper glacis, from the nose (±0.80) to the deck break (±1.30).
    P.add('hull', slab(
      [-deckEdgeX, upperGlacisRearY, upperGlacisRearZ], [deckEdgeX, upperGlacisRearY, upperGlacisRearZ],
      [0.80, upperGlacisFrontY, upperGlacisFrontZ], [-0.80, upperGlacisFrontY, upperGlacisFrontZ],
      [-deckEdgeX, upperGlacisRearY + 0.06, upperGlacisRearZ], [deckEdgeX, upperGlacisRearY + 0.06, upperGlacisRearZ],
      [0.80, upperGlacisFrontY + 0.06, upperGlacisFrontZ], [-0.80, upperGlacisFrontY + 0.06, upperGlacisFrontZ]));
    for (const s of [-1, 1] as const) {
      const m = (x: number): number => s * x;
      // Front cheek: the sloped side runs forward from the deck break down to the bow fender corner beside the glacis.
      P.add('hull', slab(
        [m(0.80), 1.00, upperGlacisFrontZ], [m(1.64), 1.04, 3.46],
        [m(sponsonX), fenderY - 0.04, upperGlacisRearZ], [m(1.05), fenderY - 0.04, upperGlacisRearZ],
        [m(0.80), 1.10, upperGlacisFrontZ], [m(1.64), fenderY, 3.42],
        [m(sponsonX), fenderY - 0.02, upperGlacisRearZ], [m(deckEdgeX), upperGlacisRearY - 0.025, upperGlacisRearZ]));
    }
    // Rear plate from the belly rise to the stern deck, and its deck lip.
    P.add('hull', box(2.58, 1.64 - 0.94, 0.15), 0, (1.64 + 0.94) / 2, -3.47);
    // lower rear plate: the belly rises from its rear edge (z -3.26) to the rear plate's foot (z -3.395) (owner
    // 2026-10-19 sweep: the slot between them stood open from below up to the deck), 30 mm into each
    P.add('hull', slab(
      [-0.944, bellyY + 0.006, -3.23], [0.944, bellyY + 0.006, -3.23], [0.944, 0.946, -3.425], [-0.944, 0.946, -3.425],
      [-0.944, bellyY + 0.086, -3.23], [0.944, bellyY + 0.086, -3.23], [0.944, 1.026, -3.425], [-0.944, 1.026, -3.425]));
    P.add('hull', box(2.62, 0.05, 0.20), 0, 1.62, -3.43);

    for (const s of [-1, 1] as const) {
      // The real hull side behind the running gear, sealed from belly to fender.
      P.add('hull', box(0.08, fenderY - 0.45, 6.30), s * 0.95, (fenderY + 0.45) / 2, -0.05);
      P.add('hull', box(0.10, 0.30, 0.30), s * 0.95, 0.98, 3.18, -0.28, 0, 0);
      P.add('hull', box(0.10, 0.32, 0.28), s * 0.95, 0.95, -3.22, 0.12, 0, 0);
      // Continuous fender shelf over the return run, the sloped side resting on it.
      P.add('hullDetail', box(0.70, 0.03, 6.78), s * 1.345, fenderY - 0.015, -0.02);
      P.add('hullDetail', box(0.012, 0.06, 6.70), s * 1.692, fenderY - 0.03, -0.04);
      // Front mudguards fall from the shelf over the idler; the rear ones close the shelf behind the sprocket.
      P.add('hullDetail', slab(
        [s * 1.05, fenderY - 0.03, 3.30], [s * 1.69, fenderY - 0.03, 3.30], [s * 1.69, 1.02, 3.50], [s * 1.05, 1.02, 3.50],
        [s * 1.05, fenderY, 3.30], [s * 1.69, fenderY, 3.30], [s * 1.69, 1.05, 3.49], [s * 1.05, 1.05, 3.49]));
      // Rubber side skirts: hem over the wheel tops, top on the fender edge (segmented as on service vehicles).
      P.hangMudguard('leo1a5-front-skirt-hem', skirtBucket, box(0.014, 0.30, 0.36), s * skirtX, 0.97, 3.31, -0.06, 0, 0);
      P.hangMudguard('leo1a5-rear-skirt-hem', skirtBucket, box(0.014, 0.32, 0.40), s * skirtX, 0.96, -3.34, 0.08, 0, 0);
      for (let k = 0; k < 7; k++) {
        const z = 2.40 - k * 0.82;
        P.hangMudguard('leo1a5-skirt-hem', skirtBucket, box(0.014, 0.33, 0.76), s * skirtX, 0.945, z);
        P.add('hullDetail', box(0.012, 0.34, 0.026), s * (skirtX - 0.004), 0.945, z - 0.395);
      }
      if (sideTools) {
        // Pioneer tools and their brackets on the sloped upper side, where the A5 carries them.
        for (let k = 0; k < 3; k++) {
          const z = -1.90 + k * 1.10;
          const xAt = (y: number): number => sponsonX - (sponsonX - deckEdgeX) * (y - fenderY) / (deckEdgeY(z) - fenderY);
          P.addEquipment('hullDark', box(0.04, 0.05, 0.08), s * (xAt(1.30) + 0.012), 1.30, z - 0.30, 0, 0, s * 0.68);
          P.addEquipment('hullDark', box(0.04, 0.05, 0.08), s * (xAt(1.30) + 0.012), 1.30, z + 0.30, 0, 0, s * 0.68);
          P.addEquipment('hullWood', cylZ(0.022, 0.90, 8), s * (xAt(1.32) + 0.035), 1.32, z);
        }
      }
    }
    P.mats.rubber.color.setHex(0x34372d);
  };
  buildLeo1A5ArticulatedProfileRunningGearStage1();
  yield 'buildLeo1A5ArticulatedProfileRunningGearStage1';

  // Driver station, lamps, guards, towing gear and source-visible deck kit.
  const driverHatchY = deckTopY(0.86);
  const buildLeo1A5ArticulatedProfileHullStage2 = (): void => {
    P.addCupola('hull', box(0.68, 0.08, 0.42), -0.45, driverHatchY + 0.04, 0.86, -0.04, 0, 0);
  };
  buildLeo1A5ArticulatedProfileHullStage2();
  yield 'buildLeo1A5ArticulatedProfileHullStage2';
  const driverPeriscopeY = deckTopY(1.03);
  const buildLeo1A5ArticulatedProfileHullStage3 = (): void => {
    for (const x of [-0.66, -0.45, -0.24]) {
      P.addEquipment('hull', box(0.13, 0.07, 0.05), x, driverPeriscopeY + 0.035, 1.03, -0.10, 0, 0);
      P.add('hullGlass', box(0.09, 0.035, 0.014), x, driverPeriscopeY + 0.072, 1.061, -0.10, 0, 0);
    }
  };
  buildLeo1A5ArticulatedProfileHullStage3();
  yield 'buildLeo1A5ArticulatedProfileHullStage3';
  const roundHatchY = deckTopY(0.70);
  const buildLeo1A5ArticulatedProfileRunningGearStage2 = (): void => {
    P.addEquipment('hull', cylY(0.18, 0.18, 0.025, P.q ? 20 : 14), 0.63, roundHatchY + 0.0125, 0.70);
    P.addEquipment('hull', torus(0.18, 0.012, P.q ? 20 : 14), 0.63, roundHatchY + 0.031, 0.70);
    for (const s of [-1, 1] as const) {
      // Headlights and their guards on the front cheeks, ahead of the glacis corners.
      headlight(P, s * 1.31, 1.17, 3.27, -0.26);
      P.addEquipment('hull', box(0.018, 0.18, 0.16), s * 1.31, 1.20, 3.30, -0.26, 0, 0);
      P.add('hull', box(0.10, 0.10, 0.13), s * 0.70, 0.64, 3.37);
      liftEye(P, 'hullDetail', s * 1.17, deckTopY(1.65) + 0.015, 1.65, s * 0.45);
      // width-indicator rods on the front mudguards
      P.addEquipment('hull', cylY(0.010, 0.010, 0.34, 7), s * 1.58, fenderY + 0.17, 3.36, 0, 0, s * 0.08);
      P.addEquipment('hull', sph(0.018, 8), s * (1.58 - Math.sin(0.08) * 0.17), fenderY + 0.17 + Math.cos(0.08) * 0.17, 3.36);
    }
    // tow cable run across the bow edge, below the grouser rack
    towCable(P, [
      [-0.70, upperGlacisY(3.42) + 0.075, 3.42],
      [0, upperGlacisY(3.44) + 0.075, 3.44],
      [0.70, upperGlacisY(3.42) + 0.075, 3.42],
    ], 0.024);
    if (grouserRack) {
      // The A5's grouser (Schneegreifer) rack across the upper glacis: two rows of spiked cleats on a bar frame.
      const glacisTilt = THREE.MathUtils.degToRad(90 - upperGlacisAngleFromVerticalDeg);
      for (const z of [2.92, 3.14]) {
        P.addEquipment('hullDark', box(1.30, 0.03, 0.04), 0, upperGlacisY(z) + 0.075, z, glacisTilt, 0, 0);
        for (let k = 0; k < 9; k++) {
          P.addEquipment('hullDark', box(0.10, 0.07, 0.14), -0.56 + k * 0.14, upperGlacisY(z) + 0.095, z, glacisTilt, 0, 0);
        }
      }
    }
    if (deckTools) {
      shovelTool(P, -1.05, deckTopY(-0.25) + 0.015, -0.25);
      P.addEquipment('hull', box(0.030, 0.025, 0.86), 1.08, deckTopY(-0.48) + 0.015, -0.48);
    }

    // Leopard engine deck: long intake fields, twin fan rings, transverse exhaust bank and rear louvres, all below the
    // rotating basket.
    const engineDeckY = deckTopY(-1.72);
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.82, 0.018, 1.04), s * 0.52, engineDeckY + 0.009, -1.72);
      P.addEquipment('hull', box(0.86, 0.022, 0.035), s * 0.52, engineDeckY + 0.012, -1.20);
      P.addEquipment('hull', box(0.86, 0.022, 0.035), s * 0.52, engineDeckY + 0.012, -2.24);
      for (let k = 0; k < 6; k++) P.addEquipment('hull', box(0.78, 0.014, 0.035), s * 0.52, engineDeckY + 0.012, -1.29 - k * 0.17);
      P.add('hullDark', cylY(0.23, 0.23, 0.012, P.q ? 24 : 16), s * 0.55, deckTopY(-2.50) + 0.006, -2.50);
      P.addEquipment('hull', torus(0.23, 0.014, P.q ? 24 : 16), s * 0.55, deckTopY(-2.50) + 0.015, -2.50);
      P.addEquipment('hull', cylY(0.055, 0.055, 0.022, 10), s * 0.55, deckTopY(-2.50) + 0.018, -2.50);
      P.addEquipment('hull', cylY(0.085, 0.085, 0.025, 12), s * 1.08, deckTopY(-2.08) + 0.0105, -2.08);
    }
    const exhaustTopY = deckTopY(-3.00) + 0.022;
    P.add('hullDark', box(1.78, 0.018, 0.44), 0, exhaustTopY - 0.009, -3.00);
    for (let k = 0; k < 4; k++) P.addEquipment('hull', box(1.70, 0.014, 0.045), 0, exhaustTopY + 0.006, -2.84 - k * 0.11);

    // Rear service face and two giant NATO fuel cans in proper carriers, against the transom, clear of the sprocket
    // wraps, with braces running forward into the hull.
    P.add('hullDark', box(2.28, 0.46, 0.035), 0, 1.26, -3.525);
    for (let k = 0; k < 7; k++) {
      P.add('hullDetail', box(0.035, 0.38, 0.035), -0.90 + k * 0.30, 1.26, -3.545);
    }
    for (const s of [-1, 1] as const) {
      const canX = s * 0.72;
      P.addEquipment(rearCanBucket, box(0.56, 0.66, 0.24), canX, 1.32, -3.45);
      P.addEquipment(rearCanBucket, box(0.48, 0.09, 0.22), canX, 1.685, -3.45);
      P.addEquipment('hullDark', box(0.23, 0.075, 0.07), canX, 1.75, -3.45);
      P.addEquipment('hullDark', cylY(0.035, 0.040, 0.045, 10), canX + s * 0.16, 1.7525, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.50, 0.020), canX, 1.32, -3.582, 0, 0, 0.66);
      P.addEquipment('hullDark', box(0.035, 0.50, 0.020), canX, 1.32, -3.584, 0, 0, -0.66);
      P.addEquipment('hullDark', box(0.62, 0.035, 0.28), canX, 1.68, -3.45);
      P.addEquipment('hullDark', box(0.62, 0.035, 0.28), canX, 0.96, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.75, 0.28), canX - 0.30, 1.32, -3.45);
      P.addEquipment('hullDark', box(0.035, 0.75, 0.28), canX + 0.30, 1.32, -3.45);
      P.addEquipment('hullDark', box(0.075, 0.11, 0.40), canX, 0.98, -3.34, 0.26, 0, 0);
      P.add('hullGlass', box(0.10, 0.08, 0.018), s * 1.24, 1.42, -3.545);
    }

    buildRunningGear(P, {
      style: 'rubber', dishR: 0.77, wheelR: roadWheelR, wheelW: 0.225, wheelY: roadWheelY, xc: trackXc,
      wheelZs: roadWheelZs,
      sprocket: rearSprocket, idler: frontIdler,
      rollers: returnRollerZs.map((z) => ({ z, y: returnRollerY, r: 0.10 })),
      trackW: trackWidth, trackTh: trackThickness, topY: trackTopSupportY, botY: trackBotY,
      contactZF: trackContactZF, contactZR: trackContactZR,
      frontArcSteps: 12, rearArcSteps: 12,
      linkPitchM: 0.125, shoeRadialScale: 0.58, shoeWidthScale: 0.97,
      endRingSpan: 0.50, coveredTop: true, arms: true, paintedEnds: true,
      padHex: 0x3b3c32, chainHex: 0x2c3029, gearFloor: true,
    });

    P.hullG.userData.leopard1A5FinishReceipt = {
      revision: 'leo1a5-262-proportions',
      bellyY,
      fenderY,
      deckAtRingY: deckTopY(0.50),
      engineDeckY,
      sternDeckY: deckTopY(-3.34),
      deckEdgeX,
      sponsonX,
      skirtOuterX: skirtX + 0.007,
      skirtHemY: 0.78,
      slopedUpperSides: true,
      segmentedSideAprons: 14,
      rearFuelCans: 2,
      rearFuelCanSize: [0.56, 0.66, 0.24],
      roadWheelStations: 7,
      roadWheelR,
      roadWheelY,
      roadWheelPitch: 0.74,
      roadWheelZs: [...roadWheelZs],
      returnRollerZs: [...returnRollerZs],
      returnRollerY,
      trackWidth,
      trackXc,
      trackOuterEdgeX: Number((trackXc + trackWidth / 2).toFixed(4)),
      trackTopSupportY: Number(trackTopSupportY.toFixed(4)),
      trackThickness,
      trackBotY,
      upperGlacisAngleFromVerticalDeg,
      upperGlacisFrontZ,
      upperGlacisRearZ: Number(upperGlacisRearZ.toFixed(4)),
      upperGlacisFrontY,
      upperGlacisRearY,
      frontIdler: { ...frontIdler },
      rearSprocket: { ...rearSprocket },
    };
  };
  buildLeo1A5ArticulatedProfileRunningGearStage2();
  yield 'buildLeo1A5ArticulatedProfileRunningGearStage2';
  return {
    bellyY, fenderY, deckEdgeX, sponsonX, skirtX, upperGlacisFrontZ, upperGlacisFrontY, upperGlacisRearZ, upperGlacisRearY,
    deckTopY, deckEdgeY, upperGlacisY,
  };
}
