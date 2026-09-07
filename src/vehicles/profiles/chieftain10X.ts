// Original Chieftain Mk10 solids from the owner's local scalar study.
// The supplied mesh, textures and topology are never runtime dependencies.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addChieftain10XCupola } from './chieftain10XCupola.ts';
import { chieftain10CastFloor } from './chieftain10XCastFloor.ts';
import { addChieftain10XAftCasting } from './chieftain10XAftCasting.ts';
import { chieftain10WheelSolids } from './chieftain10XWheels.ts';
import { addChieftain10XEngineDeck } from './chieftain10XEngineDeck.ts';
import { addChieftain10XGun } from './chieftain10XGun.ts';
import { addChieftain10XStowage } from './chieftain10XStowage.ts';
import { addChieftain10XSkirts } from './chieftain10XSkirts.ts';
import { addChieftain10XFenders } from './chieftain10XFenders.ts';
import { addChieftain10XBasket } from './chieftain10XBasket.ts';
import { addChieftain10XUpperFittings } from './chieftain10XUpperFittings.ts';
import { addChieftain10XBowLights } from './chieftain10XBowLights.ts';
import { addChieftain10XRearBox } from './chieftain10XRearHull.ts';
import { chieftain10HullWithCaseChannel } from './chieftain10XCaseChannel.ts';
import { addChieftain10XRearSupport } from './chieftain10XRearSupport.ts';
import { addChieftain10XRearEquipment } from './chieftain10XRearEquipment.ts';
import { addChieftain10XFenderCases } from './chieftain10XFenderCases.ts';
import { addChieftain10XServiceFrame } from './chieftain10XServiceFrame.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { chieftainCastSection, chieftainCheekHorn, chieftainHullSection } from './chieftainXFoundation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Slab = readonly [z: number, left: number, right: number, bottom: number, top: number];
type CastRow = readonly [z: number, width: number, crown: number, shoulder: number];

export const CHIEFTAIN10_X_DATUMS = Object.freeze({
  chieftain_mk10_x: {
    dims: { hullLengthM: 7.38869, overallLengthM: 10.803698, widthM: 3.678103, heightM: 2.453337 },
    structuralRoofY: 2.453337, fixedOpticHeightM: 3.091425, highestFittingM: 4.249091,
    // Flattened source hierarchy contains no valid mechanical object origins.
    // Circular bearing bounds determine yaw; straight bore and barrel root
    // determine an explicitly inferred, physically seated pitch datum.
    turretPivot: [0, 1.512956, .595241] as Point,
    trunnion: [.000026, 1.912199, 1.550505] as Point,
    muzzleZ: 7.093385,
  },
});
const D = CHIEFTAIN10_X_DATUMS.chieftain_mk10_x;

function local(g: THREE.BufferGeometry, p: Point): THREE.BufferGeometry {
  return g.translate(-p[0], -p[1], -p[2]);
}

function slab(rows: readonly Slab[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, a, b, low, high]) => ({ z,
    ring: [[a, low], [b, low], [b, high], [a, high]],
  })));
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x - D.turretPivot[0], y - D.turretPivot[1],
    z - D.turretPivot[2], rx, ry, rz);
}

function hullBayHeight(z: number): number {
  // Independent root_7 under-fender planes, above the actual return course.
  if (z < -1.70) return 1.293548 + .011578 * z;
  if (z < .50) return 1.300426 + .014182 * z;
  return 1.28660 + .01310 * z;
}

function hull(P: TankBuilderPort): void {
  const rows = [
    [-2.60, .52367, 1.610], [-.77, .52416, 1.53], [.40, .52447, 1.54],
    [1.85, .52485, 1.558], [2.33, .52498, 1.528], [3.0149, .52516, 1.41154],
    [3.20, .635, 1.294358], [3.40, .745, 1.245], [3.6681, 1.006, 1.104],
  ];
  const sections: SolidSection[] = rows.map(([z, low, roof]) => {
    const elbow = low + Math.min(.10, (roof - low) * .30);
    const bay = Math.max(elbow + .001, Math.min(hullBayHeight(z), roof - .002));
    const shoulder = Math.max(bay, roof - .07);
    // The broad fender is separate. The source's forward main armor closes
    // inboard of the idler; a full-width nose was filling the genuine gap.
    const nose = Math.max(0, Math.min(1, (z - 3.0149) / .1851));
    const outer = 1.43 - .41 * nose, wall = 1.03 - .05 * nose;
    const topX = Math.min(1.40, outer - .015);
    return chieftainHullSection(z, [[.82, low], [wall, elbow], [wall, bay],
      [outer, shoulder], [topX, roof]]);
  });
  // Closed carrier under the turret covers the source's unmodeled hidden
  // interior roof only. External deck planes remain independently shaped.
  P.add('hull', chieftain10HullWithCaseChannel(sections));
  addChieftain10XRearBox(P);
  addChieftain10XRearSupport(P);
  P.add('hull', cylY(.858, .858, .078, 40), 0, 1.527, .595241);
}

function runningGear(P: TankBuilderPort): void {
  const zs = [-2.174642, -1.254642, -.289679, .630321, 1.700374, 2.620374];
  const rollers = [-1.714196, .170798, 2.160767].map(z => ({ z, y: 1.032859, r: .149615 }));
  const wheels = chieftain10WheelSolids(P.q ? 32 : 24);
  P.gear = KIT.buildRunningGear(P, {
    style: 'steel', wheelR: .411105, wheelW: .39303, wheelY: .474396,
    wheelZs: zs,
    // Actual paired wheel span 1.15636..1.54938, independently of the belt
    // lane. Nominal axle Y/Z, both end stations and the complete course stay fixed.
    roadWheelOutsetM: -.00734,
    wheelCoreGeometry: { disc: wheels.core },
    wheelFaceLayers: [
      { geometry: wheels.left, material: P.mats.wheels, side: -1, name: 'gearMk10WheelDishL' },
      { geometry: wheels.right, material: P.mats.wheels, side: 1, name: 'gearMk10WheelDishR' },
    ],
    // Horstmann fulcrums are nominally level with their wheel axles, with
    // independent fore/aft pivots rather than one invented shared pair midpoint.
    // The connecting native web is an explicit closed construction between
    // the measured cap faces, not a claim to every hidden forged-lever fillet.
    suspensionDimensions: {
      armWidthM: .128, armHeightM: .17451, armAxleHeightM: .15425,
      armCenterAbsXM: .999961,
      anchorBossWidthM: .225212, anchorBossRadiusM: .088215,
      anchorBossCenterAbsXM: .990477,
      axleBossWidthM: .23479, axleBossRadiusM: .07725,
      axleBossCenterAbsXM: 1.046706,
      anchorLiftM: 0, anchorTrailM: .367175,
    },
    xc: 1.36021, trackW: .61317, trackTh: .030, botY: .04385, topY: 1.2019,
    // Fixed source lower cuts: outer pad .011260.. .022440 m, inner web
    // to .066970 m and guide crown .152291 m. Web/guide inputs account for
    // the native 4/6 mm construction overlaps, not an inflated outer shoe.
    trackShoeDimensions: { padHeight: .01118, grouserHeight: .01126,
      webHeight: .04853, hornHeight: .087321 },
    // The native course places shoe centres 27 mm outside the carrier.
    // These recipe radii also exclude its separate 45 mm wrap clearance.
    sprocket: { z: -3.014356, y: .850819, r: .329485, trackR: .25615 },
    idler: { z: 3.417292, y: .922103, r: .304185, trackR: .278 },
    rollers,
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler: { z: 3.417292, y: .922103, r: .278 },
      sprocket: { z: -3.014356, y: .850819, r: .25615 },
      contact: { zF: 2.7437, zR: -2.3000 }, botY: .04385, topY: 1.2019,
      supports: rollers.map(r => ({ z: r.z, y: 1.2019 })), sag: .022,
      frontArcSteps: 24, rearArcSteps: 24,
    }), .04385, .411105),
    rigidLinkChords: true,
    returnRollerWidthM: .26778, returnRollerInsetM: .015,
    arms: true, paintedEnds: true, coveredTop: true,
  });
}

function skirts(P: TankBuilderPort): void {
  addChieftain10XSkirts(P);
  addChieftain10XFenders(P);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.036, .056, 5.93), side * 1.728, 1.479, -.29);
    for (const z of [-2.7, -.8, 1.1, 2.6]) P.addEquipment('hullDetail',
      box(.047, .17, .036), side * 1.727, 1.41, z);
  }
}

function engineDeck(P: TankBuilderPort): void {
  addChieftain10XEngineDeck(P);
  addChieftain10XRearEquipment(P);
  addChieftain10XFenderCases(P);
  addChieftain10XServiceFrame(P);
  for (const side of [-1, 1]) {
    for (const [x, w] of [[.21137, .42194], [.68115, .53869]]) {
      P.addEquipment('hullDetail', box(w, .047, .79641), side * x, 1.702, -2.80787);
      for (let i = 0; i < 13; i++) P.addEquipment('hullDark', box(w - .024, .022, .028),
        side * x, 1.747, -3.167 + i * .059);
      P.addEquipment('hullDetail', box(w, .028, .024), side * x, 1.75859, -3.194);
    }
    P.addEquipment('hullDetail', box(.74087, .052, .27939), side * .579792, 1.704, -1.88927);
    for (let i = 0; i < 5; i++) P.addEquipment('hullDark', box(.71, .018, .025),
      side * .579792, 1.739, -1.998 + i * .053);
  }
}

function bowFurniture(P: TankBuilderPort): void {
  addChieftain10XBowLights(P);
  P.addHatch('hullDetail', cylY(.36, .36, .035, 28), .03, 1.575, 1.922);
  for (const x of [-.20, 0, .20]) {
    P.addEquipment('hullDetail', box(.15, .11, .14), x, 1.650, 2.06, .17);
    P.addEquipment('hullGlass', box(.115, .033, .008), x, 1.667, 2.132, .17);
  }
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', torus(.073, .022, 16, 6), side * .60, 1.140, 3.589, Math.PI / 2);
    P.addEquipment('hullDetail', box(.09, .12, .14), side * .60, 1.17, 3.516);
  }
}

function castSection(row: CastRow): SolidSection {
  const [z, width, crown] = row;
  const floor = chieftain10CastFloor(z, width);
  const shape = castShoulder(z);
  // The Mk5 foundation's rounded shoulder now follows Mk10's steep lower
  // cheek and broad, shallow roof. The old full-width superellipse placed
  // the outer cheek far above its measured stock. These are sparse physical
  // side/roof datums, not a copied source contour or a scale of the Mk5 mesh.
  const low = Math.max(floor[floor.length - 1][1] + .003, shape[2]);
  const left = leftCastShoulder(z);
  const leftLow = Math.max(floor[0][1] + .003, left[2]);
  return chieftainCastSection({ z, floor,
    rightSide: [[Math.min(width, shape[1]), low],
      [Math.min(width, shape[3]), Math.max(low + .003, shape[4])],
      [shape[5], shape[6]]], roofHalfWidth: shape[0],
    roofY: shape[7], crownY: crown,
    leftSide: [[Math.min(width, left[1]), leftLow],
      [Math.min(width, left[3]), Math.max(leftLow + .003, left[4])], [left[5], left[6]]],
    leftRoofHalfWidth: left[0], leftRoofY: left[7], leftShoulderPower: left[8] });
}

type ShoulderRow = readonly [z: number, roofHalfWidth: number, lowX: number,
  lowY: number, middleX: number, middleY: number, roundX: number,
  roundY: number, roofY: number];
function castShoulder(z: number): number[] {
  // Complete source bone_turret_39.004 supplies the lower cheeks; separate
  // roof/hatch leaves conceal some aft central rays. Preserve that carrier
  // roof rather than mistaking the source hatch aperture for an open tank.
  const rows: readonly ShoulderRow[] = [
    [-1.114, .970, 1.010, 1.91, 1.011, 2.30, .998, 2.40, 2.4187],
    [-.90, 1.015, 1.064, 1.91, 1.06214, 2.20, 1.048, 2.38, 2.397225],
    [-.50, .970, 1.15187, 1.90, 1.15358, 2.00, 1.0, 2.405827, 2.39726],
    [0, .870, 1.23285, 1.60, 1.26574, 1.90, 1.0, 2.36016, 2.39728],
    [.30, .800, 1.34122, 1.60, 1.31392, 1.80, 1.0, 2.33276, 2.425],
    [.60, .700, 1.36200, 1.70, 1.24057, 1.90, 1.0, 2.27877, 2.405],
    [.90, .480, 1.31843, 1.70, 1.10321, 2.00, .9, 2.26271, 2.3797],
    [1.20, .300, 1.20695, 1.70, 1.04479, 1.90, .8, 2.21095, 2.3589],
    [1.55, .140, .980, 1.70, .795, 1.90, .665, 2.070, 2.31],
  ];
  const index = rows.findIndex(row => row[0] >= z);
  if (index <= 0) return rows[0].slice(1);
  const a = rows[index - 1], b = rows[index], t = (z - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * t);
}

function leftCastShoulder(z: number): number[] {
  // The port casting is not a reflection of the starboard one. In particular
  // its source stock reaches Y1.934144 at X−1.25055/Z.673825 beneath the
  // unchanged antenna seat. Upper forward crossfall also differs by side.
  // These optional controls are absent from the Mk5 recipe.
  const rows = [
    [-.5, .970, 1.15187, 1.90, 1.15358, 2.00, 1.0, 2.405827, 2.39726, 1],
    [0, .870, 1.23285, 1.60, 1.26574, 1.91, 1.08, 2.320, 2.39728, 1],
    [.3, .820, 1.34122, 1.60, 1.30, 1.849113, 1.10, 2.285835, 2.39728, 1],
    [.6, .800, 1.362, 1.70, 1.30, 1.839825, 1.10, 2.266402, 2.37464, 1],
    [.9, .400, 1.31843, 1.70, 1.20, 1.955715, 1.10, 2.110177, 2.315, 2],
    [1.2, .100, 1.2441, 1.60, 1.10, 1.901257, 1.0, 1.984535, 2.310, 2.5],
    [1.55, .050, 1.005, 1.65, .90, 1.78, .70, 1.98, 2.280, 1.8],
  ];
  if (z < rows[0][0]) return [...castShoulder(z), 1];
  const index = rows.findIndex(row => row[0] >= z);
  if (index <= 0) return rows[0].slice(1);
  const a = rows[index - 1], b = rows[index], t = (z - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((value, i) => value + (b[i + 1] - value) * t);
}

function turretCast(P: TankBuilderPort): void {
  const rows: readonly CastRow[] = [
    [-1.114, 1.015, 2.4187, 2.40], [-.90, 1.06492, 2.397225, 2.13],
    [-.78, 1.0927, 2.39725, 2.15], [-.7625, 1.0968, 2.39725, 2.15],
    [-.75, 1.0997, 2.39725, 2.15], [-.70, 1.1113, 2.39725, 2.16],
    [-.65, 1.1224, 2.39726, 2.17], [-.60, 1.1334, 2.39726, 2.18],
    [-.55, 1.1445, 2.39726, 2.177], [-.50, 1.1555, 2.39726, 2.174],
    [-.30, 1.19966, 2.39727, 2.16],
    [0, 1.26588, 2.39728, 2.13], [.30, 1.34346, 2.425, 2.08],
    [.60, 1.37605, 2.42478, 1.93], [.90, 1.34636, 2.38596, 1.83],
    [1.20, 1.2450, 2.36256, 1.70], [1.55, 1.005, 2.31, 1.65],
  ];
  const casting = local(sectionSolid(rows.map(castSection)), D.turretPivot);
  casting.userData.chieftain10Foundation = 'casting';
  P.add('turret', casting);
  // Independent circular lower bearing: source bounds X±1.14163,
  // Z−.527574…1.755626 and Y1.512957. This is not a full-width flat floor.
  P.add('turret', cylY(1.14163, 1.14163, .07528, 64), 0,
    1.550597 - D.turretPivot[1], .614026 - D.turretPivot[2]);
  addChieftain10XBasket(P, D.turretPivot);
  for (const side of [-1, 1]) {
    P.add('turret', local(chieftainCheekHorn(side, [[1.54, .17, 1.015, 1.65, 2.13],
      [1.80, .17, .6984, 1.65, 2.095], [2.114786, .17, .18, 1.65, 1.79]], 0, 0), D.turretPivot));
  }
  P.add('turret', local(slab([[1.54, -.23, .23, 2.075, 2.31],
    [1.796146, -.23, .23, 2.075, 2.15708]]), D.turretPivot));
}

function stillbrew(P: TankBuilderPort): void {
  // Separate asymmetrical cheeks retain the real central mantlet opening.
  for (const side of [-1, 1]) {
    const rows = side < 0 ? [[.78, 1.13, .78, 2.366], [1.0, 1.4447, .50, 2.369],
      [1.2, 1.408, .44, 2.257], [1.4, 1.324, .39, 2.19], [1.6, 1.178, .22, 2.22],
      [1.8, .9595, .19, 2.257], [2, .66589, .18, 2.188], [2.150976, .22, .17, 1.91]] :
      [[.95, .94, .78, 2.369], [1.2, 1.1847, .50, 2.348], [1.4, 1.18268, .41, 2.330],
        [1.6, 1.1683, .20, 2.31], [1.8, .9918, .19, 2.266], [2, .68379, .18, 2.183],
        [2.150976, .22, .17, 1.92]];
    const sections: SolidSection[] = rows.map(([z, outer, inner, crown]) => {
      const a = side < 0 ? -outer : inner, b = side < 0 ? -inner : outer;
      const edge = Math.min(.16, (b - a) * .28);
      const shoulder = Math.max(1.759, crown - .18);
      return { z, ring: [[a, 1.757], [b, 1.757], [b, shoulder],
        [b - edge, crown], [a + edge, crown], [a, shoulder]] };
    });
    const geometry = local(sectionSolid(sections), D.turretPivot);
    geometry.userData.chieftain10Stillbrew = side < 0 ? 'port' : 'starboard';
    P.add('turret', geometry);
  }
  const spine = local(slab([[1.55, -.24, .24, 2.275, 2.32],
    [2.03, -.20, .20, 2.175, 2.205]]), D.turretPivot);
  spine.userData.chieftain10Stillbrew = 'spine';
  P.add('turret', spine);
}

function turretStowage(P: TankBuilderPort): void {
  addChieftain10XStowage(P, D.turretPivot);
  addChieftain10XAftCasting(P, D.turretPivot);
}

function loaderHatches(P: TankBuilderPort): void {
  for (const [hx, hz] of [[.5115, -.34477], [.455, -.0582]]) P.addHatch('turretDetail',
    cylY(.263, .263, .048, 28), hx, 2.499 - D.turretPivot[1], hz - D.turretPivot[2]);
}

function roofFittings(P: TankBuilderPort): void {
  for (const x of [-.97, -.64, -.31]) {
    equipment(P, 'turretDetail', box(.153, .06972, .107), x, 2.465, -.794);
    equipment(P, 'turretGlass', box(.113, .028, .008), x, 2.477, -.736);
  }
  antennaStations(P);
  equipment(P, 'turretDetail', cylY(.02424, .02424, .2488, 16), -.8299, 2.59298, -1.03264);
  equipment(P, 'turretDetail', cylY(.02912, .02912, .3147, 16), -.83062, 2.870925, -1.03383);
  equipment(P, 'turretDetail', cylY(.033, .033, .06324, 16), -.830585, 3.059805, -1.033898);
}

function antennaStations(P: TankBuilderPort): void {
  // Independent source antenna_02 cuts: neither station is mirrored and
  // the port whip ends 146.44 mm below the starboard one. The old shared
  // X/Z row misplaced both actual whips by roughly 40 mm.
  equipment(P, 'turretDetail', slab([[.482857, -1.444901, -1.071391, 1.8825, 2.15202],
    [.864927, -1.444901, -1.071391, 1.8825, 2.15211]]), 0, 0, 0);
  const support = (z: number): SolidSection => ({ z, ring: [
    [.853749, 2.19043], [1.079359, 2.285], [1.079359, 2.3265], [.853749, 2.3265],
  ] });
  equipment(P, 'turretDetail', sectionSolid([support(.664875), support(.818265)]), 0, 0, 0);
  equipment(P, 'turretDetail', cylY(.06265, .06265, .00842, 20),
    1.013923, 2.32938, .747580);
  for (const [x, z, bottom, top, radius] of [
    [-1.25055, .673825, 2.151575, 2.323721, .0717],
    [1.01390, .747445, 2.333239, 2.470161, .0646],
  ]) {
    const h = top - bottom;
    const profile = [[0, 0], [radius, 0], [radius, .008], [radius * .78, .018],
      [radius * .78, h * .34], [radius * .40, h * .58],
      [.017, h * .84], [.00728, h + .0037], [0, h + .0037]];
    equipment(P, 'turretDetail', new THREE.LatheGeometry(profile.map(([r, y]) =>
      new THREE.Vector2(r, y)), 20), x, bottom, z);
    equipment(P, 'turretDetail', cylY(.00015, .00728, 1.77893, 12),
      x, top + 1.77893 / 2, z);
  }
}

function launchers(P: TankBuilderPort): void {
  for (const [x, y, z, yaw] of [[-.1329e1, 1.9685, 1.5298, -.67], [.8578, 1.9951, 2.02245, .67]]) {
    equipment(P, 'turretDetail', box(.25, .085, .22), x, y - .105, z - .105, -.38, yaw);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const g = new THREE.CylinderGeometry(.039, .039, .185, 16, 1, true);
      g.rotateX(Math.PI / 2);
      const dx = (col - 1) * .080 + row * .015, dy = (row - .5) * .079;
      equipment(P, 'turretDetail', g, x + dx, y + dy, z, -.48, yaw);
      equipment(P, 'turretDark', cylZ(.030, .006, 16), x + dx, y + dy - .031,
        z - .060, -.48, yaw);
    }
  }
}

export function buildChieftainMk10X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(...D.trunnion.map((v, i) => v - D.turretPivot[i]) as [number, number, number]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  hull(P);
  runningGear(P);
  skirts(P);
  engineDeck(P);
  bowFurniture(P);
  turretCast(P);
  stillbrew(P);
  turretStowage(P);
  addChieftain10XCupola(P, D.turretPivot);
  addChieftain10XUpperFittings(P, D.turretPivot);
  loaderHatches(P);
  roofFittings(P);
  launchers(P);
  addChieftain10XGun(P, D.trunnion, D.muzzleZ);
}

export const CHIEFTAIN10_X_PROFILES = Object.freeze({ chieftain_mk10_x: { build: buildChieftainMk10X } });
