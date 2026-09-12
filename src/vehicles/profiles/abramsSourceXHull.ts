import { drainTankBuild, type TankProfileBuild } from '../tankBuildCooperation.ts';
// Independent SEP v2 source-study hull. Sparse scalar dimensions below are in
// the approved metre frame [-rawX, rawY + .203945, .357965 - rawZ].
// This first construction checkpoint is not a source-qualified receipt.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { closedSectionLoft, planeBoundedArmor, roundMember, type CrossSection, type XY } from './abramsSourceXGeometry.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { buildAbramsSourceXRoadWheelGeometry, buildAbramsSourceXIdlerGeometry } from './abramsSourceXWheels.ts';
import { buildAbramsSourceXDriveGeometry } from './abramsSourceXDrive.ts';
import { buildAbramsSourceXTrackShoe } from './abramsSourceXTrackShoe.ts';
import { returnRollerStock } from '../runningGearPrimitives.ts';
import { addAbramsSourceXSkirtReturns } from './abramsSourceXSkirtReturns.ts';
import { addAbramsPaintedHullPanel } from './abramsPaintedHullPanel.ts';
import { addAbramsSourceXHullFittings } from './abramsSourceXHullFittings.ts';
import { addAbramsSourceXRearGrilles } from './abramsSourceXRearGrilles.ts';
import { withAbramsSourceXStern, addAbramsSourceXSternFittings } from './abramsSourceXStern.ts';
import { addAbramsSourceXHullDeck } from './abramsSourceXHullDeck.ts';
import { addAbramsSourceXShoulderClosure } from './abramsSourceXShoulderClosure.ts';
import { abramsRearTrackCeiling, abramsFrontTrackHalfWidth, addAbramsRearTrackFender } from './abramsSourceXTrackRelief.ts';
import type { TankBuilderPort, TrackGuideProfile, TrackShoeBuildParameters } from '../tankFactoryCore.ts';

const { box, cylX, cylZ } = KIT;
export interface AbramsSourceXHullOptions {
  urbanArmor: boolean;
  curvedArat: boolean;
  sepv3: boolean;
}

// Seven independently observed axle stations, not a uniformly spaced donor
// wheel train. A common 316.68 mm tire radius approximates the small source
// station-to-station radius variation (maximum 1.40 mm).
export const ABRAMS_SOURCE_X_ROAD_Z = Object.freeze([
  -2.331410, -1.581010, -.840938, -.117802, .626604, 1.384258, 2.258970,
]);
export const ABRAMS_SOURCE_X_DRIVE_CROWN_M = .410699;
// Source120's two ~0.8mm walls taper from ~32mm at groundY.070 to a
// narrow ridge nearY.194. The hollow guide remains part of each live shoe.
// The lower receiving legs join the unchanged web inside source119 stock;
// per-link depth taper is an explicit mechanical construction inference,
// not a claimed source engagement cadence (the source guide is continuous).
export const ABRAMS_SOURCE_X_GUIDE_PROFILE: TrackGuideProfile = Object.freeze({
  // Two ruled walls preserve the independent source intervals within the
  // original 2 mm bound, with 24 rather than 48 closed-stock triangles.
  stations: Object.freeze([Object.freeze([.012, .0192] as const),
    Object.freeze([.169, 0] as const)]),
  wallM: .0008, cavityTipInwardM: .169 - .0008 * (.169 - .012) / .0192,
  triangularTip: true,
  // The unchanged upper/idler transition leaves only ~65.8mm between
  // opposing near-ridge samples; the rejected .45-pitch tip overlaps.
  // This fixed .30-pitch depth preserves source width/height and clears
  // the bend without changing the guide with its animation phase.
  rootDepthRatio: .90, tipDepthRatio: .30,
});
type HullStation = readonly [z: number, lowerHalf: number, upperHalf: number, floor: number, roof: number];
const HULL_STATIONS: readonly HullStation[] = [
  [-3.976945, 1.067035, 1.10, .648044, 1.615],
  [-3.472775, 1.067035, 1.759, .648044, 1.697365],
  [-3.156965, 1.067035, 1.759, .439834, 1.697365],
  [-3.079295, 1.067035, 1.759, .388613, 1.697365],
  [-2.274, 1.067035, 1.759, .388613, 1.697365],
  [-1.112, 1.067035, 1.759, .388613, 1.482805],
  [1.37, 1.067035, 1.759, .388613, 1.482805],
  [2.043025, 1.067035, 1.759, .439764, 1.38874],
  [2.539915, 1.067035, 1.759, .50969, 1.344475],
  [2.898445, 1.067035, 1.759, .560134, 1.344475],
  [3.511485, 1.067035, 1.100, .646153, 1.20332],
  [3.900355, 1.067035, 1.100, 1.136193, 1.15431],
  [3.913465, 1.067035, 1.100, 1.148, 1.15267],
];

/** Closed U-section stock preserves the open hull well. Covers and the
 * bearing are separate seated stock, rather than a solid block filling it. */
function hullSection([z, low, sourceWidth, floor, roof]: HullStation): CrossSection {
  const wide = abramsFrontTrackHalfWidth(z, sourceWidth);
  const wall = .035, depth = roof - floor;
  const centerFloor = Math.max(floor, Math.min(.43979, roof - depth * .35));
  const bottomTop = Math.min(centerFloor + .032, roof - depth * .25);
  const shoulder = Math.max(bottomTop + depth * .02, Math.min(roof - .009, abramsRearTrackCeiling(z)));
  // The aft sponson is closed up to its roof, not a diagonal trough into
  // the engine bay. Source4/3986 and13/1158 give a nearly horizontal left
  // cover; the right14 covers seat at this existing roof datum. Retain the
  // open central well and every forward/bow section beyond the aft deck.
  const innerShoulder = z <= -1.112 ? roof : shoulder;
  const ring: XY[] = [
    [-low, floor], [-.625, floor], [-.6249, centerFloor], [.6249, centerFloor],
    [.625, floor], [low, floor], [low, shoulder], [wide, shoulder], [wide, roof],
    [wide - wall, roof], [low - wall, innerShoulder], [low - wall, bottomTop],
    [-low + wall, bottomTop], [-low + wall, innerShoulder], [-wide + wall, roof],
    [-wide, roof], [-wide, shoulder], [-low, shoulder],
  ];
  return { z, ring };
}

function sheet(x0: number, x1: number, z0: number, z1: number,
  y0: number, y1: number, thickness: number): THREE.BufferGeometry {
  return closedSectionLoft([
    { z: z0, ring: [[x0, y0 - thickness], [x1, y0 - thickness], [x1, y0], [x0, y0]] },
    { z: z1, ring: [[x0, y1 - thickness], [x1, y1 - thickness], [x1, y1], [x0, y1]] },
  ]);
}

function bearing(): THREE.BufferGeometry {
  const profile = [[1.18, 1.482], [1.325172, 1.482], [1.325172, 1.492645],
    [1.313084, 1.513295], [1.18, 1.513295], [1.18, 1.482]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64)
    .translate(-.000209, 0, .392931);
}

function bearingDeck(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.759, -1.112); shape.lineTo(1.759, -1.112);
  shape.lineTo(1.759, 1.718); shape.lineTo(-1.759, 1.718); shape.closePath();
  const aperture = new THREE.Path();
  aperture.absarc(-.000209, .392931, 1.308, 0, Math.PI * 2, true);
  shape.holes.push(aperture);
  const geometry = new THREE.ExtrudeGeometry(shape,
    { depth: .037, bevelEnabled: false, curveSegments: 32 });
  geometry.rotateX(Math.PI / 2).translate(0, 1.482805, 0);
  return geometry;
}

function bellyAddon(P: TankBuilderPort): void {
  // Source group5/ex_armor_10 is real separate stock below the main tub.
  // Its physical underbody role is inferred; no protection rating is inferred.
  const sections = [
    [-.75, -.49426, .81228, .26720, .388658],
    [-.142035, -1.09124, 1.09122, .2572585, .388658],
    [1.857965, -1.09124, 1.09122, .2572585, .388658],
    [2.157965, -1.09124, 1.09122, .2734677, .42601],
    [2.757965, -1.09124, 1.09122, .3684808, .4939183],
    [2.957965, -1.09124, 1.09122, .4001518, .644359],
    [3.057965, -1.09124, 1.09122, .5265302, .644359],
  ];
  P.add('hull', closedSectionLoft(sections.map(([z, x0, x1, low, high]) => ({
    z, ring: [[x0, low + .0573], [0, low], [x1, low + .0573],
      [x1, high], [x0, high]],
  }))));
}

function frontDeck(): THREE.BufferGeometry {
  // Preserve the existing deck planes, but terminate their finite thickness
  // at the measured lower-bow face instead of a forward vertical filler.
  // Complete original FrontSide rays at Y1.105/1.12/1.135 independently
  // confirm this face behind the four source towing-eye apertures.
  const slope = (1.15266 - 1.42863) / (3.913465 - 1.72);
  const top = 1.42863 - slope * 1.72;
  const bowRise = (1.136193 - .646153) / (3.900355 - 3.511485);
  return planeBoundedArmor([
    [1, 0, 0, 1.10], [-1, 0, 0, 1.10], [0, 0, -1, -1.72],
    [0, 0, 1, 3.913465], [0, 1, -slope, top], [0, -1, slope, .051 - top],
    [0, -1, bowRise, bowRise * 3.511485 - .646153],
  ]);
}

function mainStock(P: TankBuilderPort): void {
  P.add('hull', withAbramsSourceXStern(closedSectionLoft(HULL_STATIONS.slice(1).map(hullSection))));
  // Source panels close the engine bay above the hollow lower tub. Distinct
  // side shelves leave the measured circular ring mouth open in the middle.
  P.add('hull', sheet(-1.10, 1.10, -3.81, -2.274, 1.694155, 1.694155, .047));
  P.add('hull', sheet(-1.10, 1.10, -2.274, -1.11, 1.694155, 1.481555, .042));
  P.add('hull', bearingDeck());
  P.add('hull', frontDeck());
  P.add('hull', bearing());
}

function* runningGearCooperativeSteps(P: TankBuilderPort, cooperative = false): TankProfileBuild {
  const roadWheelGeometry = buildAbramsSourceXRoadWheelGeometry(Boolean(P.q));
  if (cooperative) yield { label: 'roadWheelGeometry', resources: Object.values(roadWheelGeometry).filter((value): value is THREE.BufferGeometry => !!value?.isBufferGeometry) };
  const idlerGeometry = buildAbramsSourceXIdlerGeometry(Boolean(P.q));
  if (cooperative) yield { label: 'idlerGeometry', resources: Object.values(idlerGeometry).filter((value): value is THREE.BufferGeometry => !!value?.isBufferGeometry) };
  const sprocketStockGeometry = buildAbramsSourceXDriveGeometry(Boolean(P.q));
  if (cooperative) yield { label: 'sprocketStockGeometry', resources: Object.values(sprocketStockGeometry).filter((value): value is THREE.BufferGeometry => !!value?.isBufferGeometry) };

  // Each pair is one native physical axle, with two real tires/webs. Source
  // sub-millimetre axial asymmetry is approximated symmetrically; no duplicate
  // station list, arm train or broad generic filler remains inside its gap.
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelPattern: 'split-rim-ten', suspensionPattern: 'abrams-torsion-arm',
    wheelR: .3166805, wheelW: .43087,
    roadWheelGeometry,
    idlerGeometry,
    sprocketStockGeometry,
    wheelZs: [...ABRAMS_SOURCE_X_ROAD_Z], wheelY: .373782,
    xc: 1.425808, xcLeft: 1.425205, xcRight: 1.426410, roadWheelOutsetM: -.00388,
    trackW: .563165, trackTh: .024, trackPattern: 'nato-double-pin', // fleet track standard 2026-09-12: band >= 24 mm
    // The supplied tooth rings physically cross its upper band. Preserve
    // the actual hub and radial tooth envelope, but route this native rear
    // wrap 30 mm outside the crown (21 mm nominal band-inner clearance).
    // This intentional local source-error correction is not an oracle edit.
    sprocket: { z: -3.14623, y: .863479, r: .404735,
      toothTipRadiusM: ABRAMS_SOURCE_X_DRIVE_CROWN_M, trackR: .395699 },
    idler: { z: 3.24798, y: .834808, r: .3167445, trackR: .3225 },
    rollers: [{ z: -1.16958, y: 1.0307505, r: .124465 },
      { z: 1.8042, y: 1.030785, r: .124465 }],
    rollerR: .124465, returnRollerWidthM: .09382, returnRollerInsetM: .1580,
    returnRollerStockGeometry: returnRollerStock(.124465, .563165, Boolean(P.q)),
    returnRollerHullHalfWidthM: 1.057,
    topY: 1.162, botY: .046, contactZF: 2.47, contactZR: -2.53,
    deadSag: .016, paintedEnds: true, coveredTop: true, arms: true,
    rearArcSteps: 24, smoothRearTopTangent: true, tautRearSpan: true,
    // The former .89 draft depth compressed the thin source outboard tooth
    // ring inboard by about34 mm. Keep its complete native axial casting.
    linkPitchM: .155,
    trackShoeDimensions: { padHeight: .030, grouserHeight: .009,
      webHeight: .012, hornHeight: .050, pinRadius: .010, pinCentreY: -.002 },
    trackGuideProfile: ABRAMS_SOURCE_X_GUIDE_PROFILE,
    // All seven configurations retain independent closed-stock/continuous
    // added-volume receipts. The floor is one common rigid world offset.
    trackOutsoleDimensions:{padHeight:.060,grouserHeight:.020},
    trackShoeBuilder: (parameters: TrackShoeBuildParameters) => buildAbramsSourceXTrackShoe(parameters,
      parameters.guideProfile, parameters.outsole),
    rigidLinkChords:true,continuousShoeFloorYM:-.042004,
  });
  if (cooperative) yield 'core-running-gear';
}

function fenders(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -1.833 : 1.11, x1 = side < 0 ? -1.11 : 1.833;
    addAbramsRearTrackFender(P, side);
    addAbramsPaintedHullPanel(P, side, sheet(x0, x1, -2.27, 2.80, 1.405, 1.34447, .009));
    // The front mudguard turns down over the idler, independently of the
    // glacis. These are thin sections; no box spans its under-guard air.
    addAbramsPaintedHullPanel(P, side, sheet(x0, x1, 2.80, 3.11, 1.34447, 1.34315, .006));
    addAbramsPaintedHullPanel(P, side, sheet(x0, x1, 3.11, 3.608, 1.34315, 1.27259, .007));
    addAbramsPaintedHullPanel(P, side, sheet(x0, x1, 3.608, 3.86, 1.27259, .905, .007));
    P.addEquipment('hullDetail', box(.026, .286, .051), side * 1.824, 1.211, -3.714);
  }
}

function skirtStock(P: TankBuilderPort, side: number): void {
  // Eight separate receiving plates on each side. Longitudinal joints are
  // actual gaps, not dark bars on one uninterrupted exterior wall.
  const stations = [-2.60, -1.985, -1.315, -.645, .025, .695, 1.365, 2.035, 2.99];
  for (let i = 0; i < stations.length - 1; i++) {
    const z0 = stations[i] + .008, z1 = stations[i + 1] - .008;
    const top = 1.408, bottom = i === 7 ? .615 : .6563;
    const width = i >= 6 ? .00969 : .00670;
    const centerX = i >= 6 ? 1.824115 : 1.82580;
    const stock = box(width, top - bottom, z1 - z0);
    stock.userData.abramsSourceXSkirtStock = true;
    addAbramsPaintedHullPanel(P, side, stock,
      side * centerX, (top + bottom) / 2, (z0 + z1) / 2);
    for (const z of [z0 + .04, z1 - .04]) {
      P.addEquipment('hullDetail', cylX(.014, .009, 6), side * 1.847, top - .036, z);
    }
  }
  const aft: CrossSection[] = [
    [4.068, .894153], [3.50, .894153], [3.35, .887913],
    [3.20, .755840], [3.10, .479934], [3.036, .4534],
  ].map(([rawZ, rawBottom]) => {
    const ring: XY[] = [[side * 1.82465, rawBottom + .203945],
      [side * 1.82922, rawBottom + .203945], [side * 1.82922, 1.408], [side * 1.82465, 1.408]];
    return { z: .357965 - rawZ, ring: side < 0 ? ring.reverse() : ring };
  });
  // The aft lower edge climbs over the drive, leaving the true joint near
  // raw Z3.0 open. Its top still joins this draft's upper fender assembly.
  addAbramsPaintedHullPanel(P, side, closedSectionLoft(aft));
}

/** Source cover is a thin bowed sheet, canted outward 0.2494 m per metre of
 * height. Radius is an analytic approximation to the sparse face probes;
 * measured 13.25 mm stock and open space behind the cover are retained. */
function curvedCassette(side: number, z: number, bottom: number, top: number): THREE.BufferGeometry {
  const half = .1624, radius = .2313, thickness = .01325;
  const stations: CrossSection[] = [];
  for (let k = 0; k <= 12; k++) {
    const dz = -half + 2 * half * k / 12;
    const outer = 2.09261 + Math.sqrt(radius * radius - dz * dz) - radius;
    const rake = (top - bottom) * .2494;
    const ring: XY[] = [[side * (outer - thickness), bottom], [side * outer, bottom],
      [side * (outer + rake), top], [side * (outer + rake - thickness), top]];
    stations.push({ z: z + dz, ring: side < 0 ? ring.reverse() : ring });
  }
  return closedSectionLoft(stations);
}

function reactiveSkirts(P: TankBuilderPort, curved: boolean): void {
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? '_skirt_era_L' : '_skirt_era_R';
    const plates = P.spec.armor.hullPlates.filter(plate => plate.kind === 'era' && plate.name.endsWith(suffix));
    // A generated face set is one bank, not multiple physical cassette banks.
    const names = [...new Set(plates.map(plate => plate.name))];
    if (names.length !== 1) throw new Error(`${P.spec.id}: expected one physical ERA family ${suffix}`);
    const plateName = names[0];
    P.destructibleCluster(plateName, () => {
      for (let i = 0; i < 8; i++) {
        const z = 2.655755 - i * .666455;
        const base = box(.19032, .750506, .65729);
        markEraHitFaces(base, [side, 0, 0]);
        P.addExternalArmor('hull', base, side * 1.93636, .990852, z);
        if (curved) {
          const bottom = i === 0 ? .531191 : .605079;
          for (const offset of [-.1658, .1658]) {
            for (const y0 of [bottom, bottom + .408]) {
              const geometry = curvedCassette(side, z + offset, y0, y0 + .397);
              markEraHitFaces(geometry, [side, 0, 0], .05);
              P.addExternalArmor('hull', geometry);
            }
          }
        }
        for (const dz of [-.275, .275]) {
          P.addExternalArmor('hull', markEraFurniture(cylX(.016, .025, 6)),
            side * 2.019, 1.358, z + dz);
        }
      }
    });
  }
}

function driverHatch(P: TankBuilderPort): void {
  P.addEquipment('hullDetail', sheet(-.470, .463, 1.848, 2.537, 1.502, 1.415, .033));
  for (const x of [-.20, 0, .20]) {
    P.addEquipment('hullDetail', box(.169, .064, .100), x, 1.457, 2.461);
    P.addEquipment('hullGlass', box(.136, .037, .005), x, 1.459, 2.514);
  }
  P.addEquipment('hullDetail', roundMember([-.17, 1.511, 1.95], [.14, 1.511, 1.95], .013));
}

function rearEquipment(P: TankBuilderPort, sepv3: boolean): void {
  addAbramsSourceXRearGrilles(P);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', cylZ(.124, .194, 20), side * 1.59, 1.5634, -3.83);
    P.addEquipment('hullDark', cylZ(.092, .007, 20), side * 1.59, 1.5634, -3.931);
  }
  P.addEquipment('hullDetail', box(.744, .031, .50), .70184, 1.704, -2.4721);
  P.addEquipment('hullDetail', box(.41, .031, 1.02), -.8331, 1.704, -2.20);
  if (sepv3) P.addEquipment('hullDetail', box(.48, .19, .66), 1.34, 1.805, -3.00);
}

function bowEquipment(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const x = side * .947;
    P.addEquipment('hullDetail', box(.242, .103, .093), x, 1.220, 3.790);
    P.addEquipment('hullGlass', box(.185, .067, .006), x, 1.221, 3.840);
    P.addEquipment('hullDetail', roundMember([x - .139, 1.17, 3.798], [x - .139, 1.313, 3.798], .011));
    P.addEquipment('hullDetail', roundMember([x + .139, 1.17, 3.798], [x + .139, 1.313, 3.798], .011));
    P.addEquipment('hullDetail', roundMember([x - .139, 1.313, 3.798], [x + .139, 1.313, 3.798], .011));
    for (let k = 0; k < 5; k++) {
      P.addEquipment('hullDetail', box(.075, .042, .173), side * .92, 1.302 + k * .027, 3.10 - k * .21);
    }
  }
}

export function buildAbramsSourceXHull(P: TankBuilderPort, options: AbramsSourceXHullOptions): void {
  drainTankBuild(buildAbramsSourceXHullCooperativeSteps(P, options, false));
}

export function* buildAbramsSourceXHullCooperativeSteps(P: TankBuilderPort, options: AbramsSourceXHullOptions, cooperative = true): TankProfileBuild {
  P.hullG.position.set(0, 0, 0);
  if (cooperative) yield "buildAbramsSourceXHull:P.hullG.position.set(0, 0, 0);";
  mainStock(P);
  if (cooperative) yield "buildAbramsSourceXHull:mainStock(P);";
  if (options.urbanArmor) bellyAddon(P);
  if (cooperative) yield "buildAbramsSourceXHull:if (options.urbanArmor) bellyAddon(P);";
  yield* runningGearCooperativeSteps(P, cooperative);
  fenders(P);
  if (cooperative) yield "buildAbramsSourceXHull:fenders(P);";
  for (const side of [-1, 1]) skirtStock(P, side);
  if (cooperative) yield "buildAbramsSourceXHull:for (const side of [-1, 1]) skirtStock(P, side);";
  addAbramsSourceXShoulderClosure(P);
  if (cooperative) yield "buildAbramsSourceXHull:addAbramsSourceXShoulderClosure(P);";
  if (options.urbanArmor) reactiveSkirts(P, options.curvedArat);
  if (cooperative) yield "buildAbramsSourceXHull:if (options.urbanArmor) reactiveSkirts(P, options.curvedArat);";
  if (options.curvedArat) addAbramsSourceXSkirtReturns(P);
  if (cooperative) yield "buildAbramsSourceXHull:if (options.curvedArat) addAbramsSourceXSkirtReturns(P);";
  driverHatch(P);
  if (cooperative) yield "buildAbramsSourceXHull:driverHatch(P);";
  rearEquipment(P, options.sepv3);
  if (cooperative) yield "buildAbramsSourceXHull:rearEquipment(P, options.sepv3);";
  bowEquipment(P);
  if (cooperative) yield "buildAbramsSourceXHull:bowEquipment(P);";
  addAbramsSourceXHullFittings(P);
  if (cooperative) yield "buildAbramsSourceXHull:addAbramsSourceXHullFittings(P);";
  addAbramsSourceXSternFittings(P);
  if (cooperative) yield "buildAbramsSourceXHull:addAbramsSourceXSternFittings(P);";
  addAbramsSourceXHullDeck(P);
  if (cooperative) yield "buildAbramsSourceXHull:addAbramsSourceXHullDeck(P);";
}
