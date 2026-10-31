// The Leopard 1 hull and running gear (release 265): the 262 proportion rebuild of the Leopard 1A5's hull, lifted out of
// profiles/leopard.ts so the Danish 1A3 DK and 1A5 DK builds (profiles/leopard1Dk.ts) ride the same hull. The Leopard 1A5
// builds it with the defaults. Integration 266: leopard1-263's critic rounds on the German 1A5's hull (the raked front
// mudguards, the painted skirts, the louvred engine outlets, bow headlights and mirrors, the grouser lattice, the clean
// transom) are `fit263`, the 1A5's default; the Danish builds keep the 265 hull they were certified on (their gun stops
// over the stern quarters are not swept against the louvres) until the Denmark lane adopts the fit. First-party
// procedural geometry: Kevin B. Liu (NOTICE.md).
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
  /** The side skirts' hem: the 265 hull's black rubber (steel-backed rubber painted with the hull's fittings under
   * `fit263`, leopard1-263's critics round 3), or the coat (the Danish tanks' skirts are painted over). */
  readonly skirtBucket?: 'hullRubber' | 'hull';
  /** Release 265, r8: close-set slats over the engine deck's dark beds (the UN-white DK-1, whose six slats a field read
   * as black zebra stripes). */
  readonly denseGrilles?: boolean;
  /** leopard1-263's critic rounds on the German 1A5 (default on): the raked boxed front mudguards, the longer painted
   * skirts, the louvred engine outlets over the sprockets, the bow headlights under guard bars and the driver's mirrors,
   * the grouser lattice and the clean transom. Off: the 265 hull the Danish builds were certified on. */
  readonly fit263?: boolean;
  /** The two fuel cans in their rear carriers (the 265 hull; the German A5's Munster transom is clean under `fit263`):
   * drab cloth, or the coat (the DK-1's UN white painted them over). */
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
  const { grouserRack = true, sideTools = true, deckTools = true, skirtBucket: skirtOption = 'hullRubber', fit263 = true,
    rearCanBucket = 'hullCloth', denseGrilles = false } = options;
  const skirtBucket = fit263 && skirtOption === 'hullRubber' ? 'hullDetail' : skirtOption;
  const rearCans = !fit263;
  const { box, cylX, cylY, cylZ, torus, sph, buildRunningGear, headlight, liftEye, towCable, shovelTool, xform } = KIT;
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
  // The front mudguards' plate (its top from the shelf at rearZ to frontY at frontZ) and the rear louvre boxes' run.
  const frontGuard = { rearZ: 2.98, frontZ: 3.64, frontY: 1.02 };
  const frontGuardTopY = (z: number): number =>
    fenderY - (fenderY - frontGuard.frontY) * (z - frontGuard.rearZ) / (frontGuard.frontZ - frontGuard.rearZ);
  const rearLouvre = { rearZ: -3.36, frontZ: -2.40, topY: 1.655 };

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
      if (fit263) {
        // Front mudguards (critics 265: "large flared, sloped plates over the track fronts"): long plates falling forward
        // from the shelf over the idler to past the nose, boxed by a deep outer flange, an inner wall and a deep front lip
        // (critics 265: "deep angled boxes", not thin plates).
        P.add('hullDetail', slab(
          [s * 1.05, fenderY - 0.03, frontGuard.rearZ], [s * 1.71, fenderY - 0.03, frontGuard.rearZ],
          [s * 1.71, frontGuard.frontY - 0.03, frontGuard.frontZ], [s * 1.05, frontGuard.frontY - 0.03, frontGuard.frontZ],
          [s * 1.05, fenderY, frontGuard.rearZ], [s * 1.71, fenderY, frontGuard.rearZ],
          [s * 1.71, frontGuard.frontY, frontGuard.frontZ], [s * 1.05, frontGuard.frontY, frontGuard.frontZ]));
        // (critics 265, round 3: "tall raked mudguard plates", not low boxes) the outer flange deepens to the front, where
        // the lip falls 0.32 m and rakes back 7 cm at its foot, 4 cm ahead of the track's wrap over the idler
        P.add('hullDetail', slab(
          [s * 1.69, fenderY - 0.22, frontGuard.rearZ], [s * 1.712, fenderY - 0.22, frontGuard.rearZ],
          [s * 1.712, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.07], [s * 1.69, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.07],
          [s * 1.69, fenderY, frontGuard.rearZ], [s * 1.712, fenderY, frontGuard.rearZ],
          [s * 1.712, frontGuard.frontY, frontGuard.frontZ], [s * 1.69, frontGuard.frontY, frontGuard.frontZ]));
        // (the inner wall 4 cm deep over the idler, 8 cm at the nose: at 12 cm its foot stood in the strict track band over
        // the idler's wrap, track-clip-audit --exact --strict)
        P.add('hullDetail', slab(
          [s * 1.05, fenderY - 0.04, frontGuard.rearZ], [s * 1.072, fenderY - 0.04, frontGuard.rearZ],
          [s * 1.072, frontGuard.frontY - 0.08, frontGuard.frontZ], [s * 1.05, frontGuard.frontY - 0.08, frontGuard.frontZ],
          [s * 1.05, fenderY, frontGuard.rearZ], [s * 1.072, fenderY, frontGuard.rearZ],
          [s * 1.072, frontGuard.frontY, frontGuard.frontZ], [s * 1.05, frontGuard.frontY, frontGuard.frontZ]));
        P.add('hullDetail', slab(
          [s * 1.05, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.092], [s * 1.712, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.092],
          [s * 1.712, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.07], [s * 1.05, frontGuard.frontY - 0.32, frontGuard.frontZ - 0.07],
          [s * 1.05, frontGuard.frontY, frontGuard.frontZ - 0.022], [s * 1.712, frontGuard.frontY, frontGuard.frontZ - 0.022],
          [s * 1.712, frontGuard.frontY, frontGuard.frontZ], [s * 1.05, frontGuard.frontY, frontGuard.frontZ]));
      } else {
        // Front mudguards fall from the shelf over the idler; the rear ones close the shelf behind the sprocket.
        P.add('hullDetail', slab(
          [s * 1.05, fenderY - 0.03, 3.30], [s * 1.69, fenderY - 0.03, 3.30], [s * 1.69, 1.02, 3.50], [s * 1.05, 1.02, 3.50],
          [s * 1.05, fenderY, 3.30], [s * 1.69, fenderY, 3.30], [s * 1.69, 1.05, 3.49], [s * 1.05, 1.05, 3.49]));
      }
      // Side skirts: hem over the wheel tops, top on the fender edge (segmented as on service vehicles). Under `fit263`
      // steel-backed rubber painted with the hull (critics 265, round 3: dark separate tiles read wrong), continuous
      // sections from the fender edge down over the road-wheel tops.
      P.hangMudguard('leo1a5-front-skirt-hem', skirtBucket, box(0.014, 0.30, 0.36), s * skirtX, 0.97, 3.31, -0.06, 0, 0);
      P.hangMudguard('leo1a5-rear-skirt-hem', skirtBucket, box(0.014, 0.32, 0.40), s * skirtX, 0.96, -3.34, 0.08, 0, 0);
      for (let k = 0; k < 7; k++) {
        const z = 2.40 - k * 0.82;
        if (fit263) {
          P.hangMudguard('leo1a5-skirt-hem', skirtBucket, box(0.014, 0.40, 0.82), s * skirtX, 0.915, z);
          P.add('hullDetail', box(0.012, 0.41, 0.03), s * (skirtX - 0.004), 0.915, z - 0.41);
        } else {
          P.hangMudguard('leo1a5-skirt-hem', skirtBucket, box(0.014, 0.33, 0.76), s * skirtX, 0.945, z);
          P.add('hullDetail', box(0.012, 0.34, 0.026), s * (skirtX - 0.004), 0.945, z - 0.395);
        }
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
      if (fit263) {
        // The engine's louvred air outlets over the sprockets (critics 265, round 3: "the large louvred boxes on each rear
        // side, a Leopard 1 signature, modelled as shallow slatted panels"; the Munster 1A5's side and quarter photos): a
        // grille box on the sloped side from the fender to a level top 4-9 cm over the deck edge, its face leaning in
        // 37 degrees, framed by end plates and rails, nine slats over a dark backing in three bays. The gun's stops over
        // the stern quarters follow it (modern2.ts LEO1A5_GUN_PITCH_BY_YAW_DEG).
        const louvreFaceFrom = new THREE.Vector2(1.708, fenderY + 0.05);
        const louvreFaceTo = new THREE.Vector2(1.708 - 0.75 * (rearLouvre.topY - louvreFaceFrom.y), rearLouvre.topY);
        const louvreRing = (outX: number, top: number): readonly (readonly [number, number])[] => {
          const ring = [[1.24, fenderY], [outX, fenderY], [outX, louvreFaceFrom.y],
            [outX - 0.75 * (top - louvreFaceFrom.y), top], [1.24, top]] as const;
          return s > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse();
        };
        P.addEquipment('hull', sectionSolid([rearLouvre.rearZ, rearLouvre.frontZ]
          .map((z) => ({ z, ring: louvreRing(louvreFaceFrom.x, rearLouvre.topY) }))));
        for (const [z0, z1] of [[rearLouvre.rearZ - 0.02, rearLouvre.rearZ], [rearLouvre.frontZ, rearLouvre.frontZ + 0.02]]) {
          P.addEquipment('hull', sectionSolid([z0, z1].map((z) => ({ z, ring: louvreRing(louvreFaceFrom.x + 0.03, rearLouvre.topY + 0.015) }))));
        }
        const louvreN = new THREE.Vector2(0.8, 0.6), louvreTilt = s * Math.atan2(0.6, 0.8);
        const louvreFaceLength = louvreFaceFrom.distanceTo(louvreFaceTo);
        const louvreLength = rearLouvre.frontZ - rearLouvre.rearZ, louvreZ = (rearLouvre.rearZ + rearLouvre.frontZ) / 2;
        const onLouvre = (t: number, out: number): THREE.Vector2 =>
          louvreFaceFrom.clone().lerp(louvreFaceTo, t).addScaledVector(louvreN, out);
        const backing = onLouvre(0.5, 0.003);
        P.add('hullDark', box(0.006, louvreFaceLength * 0.92, louvreLength), s * backing.x, backing.y, louvreZ, 0, 0, louvreTilt);
        for (const t of [0.02, 0.98]) {
          const at = onLouvre(t, 0.016);
          P.addEquipment('hull', box(0.026, 0.04, louvreLength), s * at.x, at.y, louvreZ, 0, 0, louvreTilt);
        }
        for (const bay of [-1, 1]) {
          const at = onLouvre(0.5, 0.016);
          P.addEquipment('hull', box(0.026, louvreFaceLength * 0.92, 0.04), s * at.x, at.y, louvreZ + bay * louvreLength / 6,
            0, 0, louvreTilt);
        }
        for (let k = 0; k < 9; k++) {
          const at = onLouvre(0.10 + k * 0.10, 0.014);
          P.addEquipment('hull', box(0.022, 0.028, louvreLength), s * at.x, at.y, louvreZ, 0, 0, louvreTilt);
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
      if (fit263) {
        // Round headlights on the bow's outer corners beside the grouser rack, inboard of the mudguards, each on a foot
        // under a bent guard bar (critics 265, round 4: "round headlights beside the grille ... become small boxes on the
        // fender fronts"; the Munster 1A5's front photo).
        P.addEquipment('hull', box(0.08, 0.10, 0.08), s * 0.95, 1.16, 3.35);
        headlight(P, s * 0.95, 1.27, 3.37, 0, 0.075);
        P.addEquipment('hullDark', cylY(0.011, 0.011, 0.26, 7), s * 0.86, 1.24, 3.46);
        P.addEquipment('hullDark', cylY(0.011, 0.011, 0.28, 7), s * 1.04, 1.23, 3.46);
        P.addEquipment('hullDark', cylX(0.011, 0.19, 7), s * 0.95, 1.37, 3.46);
      } else {
        // Headlights and their guards on the front cheeks, ahead of the glacis corners.
        headlight(P, s * 1.31, 1.17, 3.27, -0.26);
        P.addEquipment('hull', box(0.018, 0.18, 0.16), s * 1.31, 1.20, 3.30, -0.26, 0, 0);
      }
      P.add('hull', box(0.10, 0.10, 0.13), s * 0.70, 0.64, 3.37);
      liftEye(P, 'hullDetail', s * 1.17, deckTopY(1.65) + 0.015, 1.65, s * 0.45);
      // width-indicator rods on the front mudguards
      if (fit263) {
        P.addEquipment('hull', cylY(0.010, 0.010, 0.34, 7), s * 1.58, frontGuardTopY(3.36) + 0.17, 3.36, 0, 0, s * 0.08);
        P.addEquipment('hull', sph(0.018, 8), s * (1.58 - Math.sin(0.08) * 0.17), frontGuardTopY(3.36) + 0.17 + Math.cos(0.08) * 0.17, 3.36);
        // the driver's mirror: an oval head on its stalk behind the lamp, the glass facing back (critics 265, round 5: "no
        // mirror heads"; the Munster 1A5's front photo)
        // (low enough that the barrel laid over it at full depression keeps its 25 mm: at 0.37 m it touched at yaw 22)
        const mirrorY = frontGuardTopY(3.10) + 0.30, mirrorYaw = s * 0.30;
        P.addEquipment('hull', cylY(0.012, 0.012, 0.26, 7), s * 1.12, frontGuardTopY(3.10) + 0.13, 3.10);
        P.addEquipment('hull', xform(cylZ(0.085, 0.05, P.q ? 16 : 12), 0, 0, 0, 0, 0, 0, [1.35, 1, 1]),
          s * 1.12, mirrorY, 3.10, 0, mirrorYaw, 0);
        P.addEquipment('hullDark', xform(cylZ(0.072, 0.006, P.q ? 16 : 12), 0, 0, 0, 0, 0, 0, [1.35, 1, 1]),
          s * 1.12 - Math.sin(mirrorYaw) * 0.027, mirrorY, 3.10 - Math.cos(mirrorYaw) * 0.027, 0, mirrorYaw, 0);
      } else {
        P.addEquipment('hull', cylY(0.010, 0.010, 0.34, 7), s * 1.58, fenderY + 0.17, 3.36, 0, 0, s * 0.08);
        P.addEquipment('hull', sph(0.018, 8), s * (1.58 - Math.sin(0.08) * 0.17), fenderY + 0.17 + Math.cos(0.08) * 0.17, 3.36);
      }
    }
    // tow cable run across the bow edge, below the grouser rack
    towCable(P, [
      [-0.70, upperGlacisY(3.42) + 0.075, 3.42],
      [0, upperGlacisY(3.44) + 0.075, 3.44],
      [0.70, upperGlacisY(3.42) + 0.075, 3.42],
    ], 0.024);
    if (grouserRack) {
      // The A5's grouser (Schneegreifer) rack across the upper glacis: the photos' dense lattice of interlocking links,
      // drawn as two crossing runs of diagonal bars inside a bar frame (critics 265, round 5: "sparse, separated cubes instead of the tightly interlocking chevrons").
      const glacisTilt = THREE.MathUtils.degToRad(90 - upperGlacisAngleFromVerticalDeg);
      // (shallower, wider and lighter since round 8: "a raised, thick-framed, multi-row lattice" where the photos show a
      // shallow mesh about half the hull's width)
      const rack = { halfWidth: 0.78, z0: 2.98, z1: 3.32, pitch: 0.15 };
      const rackSlope = (rack.z1 - rack.z0) / Math.cos(glacisTilt);
      const onRack = (u: number, v: number, lift: number): [number, number, number] => {
        const z = rack.z0 + v * Math.cos(glacisTilt);
        return [u, upperGlacisY(z) + lift, z];
      };
      for (const v of [0, rackSlope]) {
        P.addEquipment('hullDark', box(rack.halfWidth * 2 + 0.03, 0.02, 0.025), ...onRack(0, v, 0.068), glacisTilt, 0, 0);
      }
      // dir -1 runs along u - v = c, dir 1 along u + v = c (u across the plate, v down its slope), each clipped to the frame
      for (const dir of [-1, 1] as const) {
        for (let c = -rack.halfWidth - rackSlope + rack.pitch / 2; c < rack.halfWidth + rackSlope; c += rack.pitch) {
          const va = dir < 0 ? Math.max(0, -rack.halfWidth - c) : Math.max(0, c - rack.halfWidth);
          const vb = dir < 0 ? Math.min(rackSlope, rack.halfWidth - c) : Math.min(rackSlope, c + rack.halfWidth);
          if (vb - va < 0.03) continue;
          const vm = (va + vb) / 2, um = dir < 0 ? vm + c : c - vm;
          P.addEquipment('hullDark', box((vb - va) * Math.SQRT2, 0.022, 0.026), ...onRack(um, vm, 0.074),
            glacisTilt, dir * Math.PI / 4, 0);
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
      if (denseGrilles) for (let k = 0; k < 11; k++) P.addEquipment('hull', box(0.78, 0.014, 0.075), s * 0.52, engineDeckY + 0.012, -1.265 - k * 0.091);
      else for (let k = 0; k < 6; k++) P.addEquipment('hull', box(0.78, 0.014, 0.035), s * 0.52, engineDeckY + 0.012, -1.29 - k * 0.17);
      // (the UN-white DK-1's deck covers painted over: r10 critics, dark discs on white read as unpainted)
      P.add(rearCanBucket === 'hull' ? 'hull' : 'hullDark', cylY(0.23, 0.23, 0.012, P.q ? 24 : 16), s * 0.55, deckTopY(-2.50) + 0.006, -2.50);
      P.addEquipment('hull', torus(0.23, 0.014, P.q ? 24 : 16), s * 0.55, deckTopY(-2.50) + 0.015, -2.50);
      P.addEquipment('hull', cylY(0.055, 0.055, 0.022, 10), s * 0.55, deckTopY(-2.50) + 0.018, -2.50);
      P.addEquipment('hull', cylY(0.085, 0.085, 0.025, 12), s * 1.08, deckTopY(-2.08) + 0.0105, -2.08);
    }
    const exhaustTopY = deckTopY(-3.00) + 0.022;
    P.add('hullDark', box(1.78, 0.018, 0.44), 0, exhaustTopY - 0.009, -3.00);
    if (denseGrilles) for (let k = 0; k < 7; k++) P.addEquipment('hull', box(1.70, 0.014, 0.05), 0, exhaustTopY + 0.006, -2.82 - k * 0.061);
    else for (let k = 0; k < 4; k++) P.addEquipment('hull', box(1.70, 0.014, 0.045), 0, exhaustTopY + 0.006, -2.84 - k * 0.11);

    // Rear service face, two giant NATO fuel cans in proper carriers against the transom, clear of the sprocket wraps,
    // with braces running forward into the hull, and the tail lights. Under `fit263` no fuel cans (critics 265, round 3:
    // the X-marked can carriers stood over the deck line, and the Munster 1A5's rear quarter shows a clean transom).
    P.add('hullDark', box(2.28, 0.46, 0.035), 0, 1.26, -3.525);
    for (let k = 0; k < 7; k++) {
      P.add('hullDetail', box(0.035, 0.38, 0.035), -0.90 + k * 0.30, 1.26, -3.545);
    }
    // the cans' carriers: black, or (the UN-white DK-1, its cans painted over) a grey (r8 critics: black frames on white)
    const carrier = rearCanBucket === 'hull' ? 'hullFittingPaint' : 'hullDark';
    for (const s of [-1, 1] as const) {
      if (!rearCans) {
        P.add('hullGlass', box(0.10, 0.08, 0.018), s * 1.24, 1.42, -3.545);
        continue;
      }
      const canX = s * 0.72;
      P.addEquipment(rearCanBucket, box(0.56, 0.66, 0.24), canX, 1.32, -3.45);
      P.addEquipment(rearCanBucket, box(0.48, 0.09, 0.22), canX, 1.685, -3.45);
      P.addEquipment(carrier, box(0.23, 0.075, 0.07), canX, 1.75, -3.45);
      P.addEquipment(carrier, cylY(0.035, 0.040, 0.045, 10), canX + s * 0.16, 1.7525, -3.45);
      P.addEquipment(carrier, box(0.035, 0.50, 0.020), canX, 1.32, -3.582, 0, 0, 0.66);
      P.addEquipment(carrier, box(0.035, 0.50, 0.020), canX, 1.32, -3.584, 0, 0, -0.66);
      P.addEquipment(carrier, box(0.62, 0.035, 0.28), canX, 1.68, -3.45);
      P.addEquipment(carrier, box(0.62, 0.035, 0.28), canX, 0.96, -3.45);
      P.addEquipment(carrier, box(0.035, 0.75, 0.28), canX - 0.30, 1.32, -3.45);
      P.addEquipment(carrier, box(0.035, 0.75, 0.28), canX + 0.30, 1.32, -3.45);
      P.addEquipment(carrier, box(0.075, 0.11, 0.40), canX, 0.98, -3.34, 0.26, 0, 0);
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
      skirtHemY: fit263 ? 0.715 : 0.78,
      slopedUpperSides: true,
      segmentedSideAprons: 14,
      rearFuelCans: rearCans ? 2 : 0,
      ...(rearCans ? { rearFuelCanSize: [0.56, 0.66, 0.24] } : {}),
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
