// Independent plain Leopard 2A6 source-study build. Scalar dimensions describe
// authored solids; no donor builder, source topology, or source asset is loaded.
import { markFixedPaintedPanel } from './fixedPaintedPanel.ts';
import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { addLeopardA6XFittings } from './leopardA6XFittings.ts';
import { leopardA6WheelSolids } from './leopardA6XWheels.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
type Point = readonly [number, number, number];
type Row = readonly [z: number, left: number, right: number, floor: number, roof: number];

export const LEOPARD_A6_X_DATUMS = Object.freeze({
  leo2a6_x: {
    dims: { hullLengthM: 7.63049, overallLengthM: 10.9547999, widthM: 3.80991006, heightM: 2.43111 },
    structuralRoofY: 2.43111,
    fixedOpticHeightM: 2.89810,
    highestFittingM: 4.15628,
    turretPivot: [.000005, 2.14836, 1.047795] as Point,
    // The source object's origin sits above its actual tube. Independent
    // muzzle and straight-sleeve cuts establish this physical pitch axis.
    trunnion: [.000005, 1.97054, 1.419495] as Point,
    muzzleZ: 7.139555,
  },
});
const D = LEOPARD_A6_X_DATUMS.leo2a6_x;

function local(geometry: THREE.BufferGeometry, origin: Point): THREE.BufferGeometry {
  return geometry.translate(-origin[0], -origin[1], -origin[2]);
}

function equipment(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry,
  x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x - D.turretPivot[0], y - D.turretPivot[1],
    z - D.turretPivot[2], rx, ry, rz);
}

function wall(rows: readonly Row[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, left, right, floor, roof]) => ({ z,
    ring: [[left, floor], [right, floor], [right, roof], [left, roof]],
  })));
}

function hull(P: TankBuilderPort): void {
  // Closed narrow lower tub with rising transverse belly chamfers. The wide
  // sponson exists only above the source 1.32223 m underside, leaving real air
  // over the wheels. The two large deck planes meet through one short rake.
  const rows = [
    [-3.486, 1.04015, 1.825398], [-3.360, .65259, 1.821474], [-2.915, .41956, 1.808],
    [-.999, .41956, 1.74795], [-.660, .41956, 1.62747],
    [2.083, .41956, 1.62747], [2.863, .41956, 1.458],
    [3.076, .517, 1.41182], [3.254, .59866, 1.368], [3.662, .9800, .9820],
  ];
  const sections: SolidSection[] = rows.map(([z, bottom, roof]) => {
    const lowerHalf = Math.min(1, .71176 + Math.max(0, bottom - .41956) * .6185);
    const elbow = Math.max(bottom + .0003, .88557);
    const shoulder = Math.max(elbow + .0003, Math.min(1.32223, roof - .001));
    const outer = z > 3.076 ? 1.001 : 1.695;
    const topHalf = z > 3.076 ? 1 : 1.641 - Math.max(0, roof - 1.62747) * .174;
    return { z, ring: [
      [-lowerHalf, bottom], [lowerHalf, bottom], [1.0001, elbow], [1.0001, shoulder],
      [outer, shoulder], [topHalf, roof], [-topHalf, roof], [-outer, shoulder],
      [-1.0001, shoulder], [-1.0001, elbow],
    ] };
  });
  P.add('hull', sectionSolid(sections));
  rearHullFolds(P);
  P.add('hull', cylY(1.11036, 1.11036, .10223, 48), 0, 1.648315, 1.047795);
}

function rearHullFolds(P: TankBuilderPort): void {
  // Source engine lip and lower return are separate folded surfaces. The old
  // first-pass tub extended underneath them into genuine stern air.
  P.add('hull', wall([[-3.815, -1.59, 1.59, 1.78771, 1.8103],
    [-3.743, -1.621, 1.621, 1.7979, 1.83341],
    [-3.637925, -1.645, 1.645, 1.81278, 1.83013],
    [-3.486, -1.670, 1.670, 1.34441, 1.825398]]));
  P.add('hull', wall([[-3.654, -1.674, 1.674, 1.29741, 1.32062],
    [-3.577, -1.674, 1.674, 1.32223, 1.33153],
    [-3.486, -1.674, 1.674, 1.32223, 1.34441]]));
  P.add('hull', wall([[-3.577, -1.0, 1.0, 1.320765, 1.33153],
    [-3.486, -1.0, 1.0, 1.04015, 1.34441]]));
  const hook = new THREE.Shape();
  hook.moveTo(-3.518, .99325);
  hook.quadraticCurveTo(-3.577, .983, -3.56675, .920);
  hook.lineTo(-3.51550, .800);
  hook.lineTo(-3.54096, .760);
  hook.quadraticCurveTo(-3.589, .745, -3.60856, .800);
  hook.lineTo(-3.62284, .849);
  hook.lineTo(-3.653595, .84730);
  hook.lineTo(-3.6432076, .800);
  hook.quadraticCurveTo(-3.633, .756, -3.61834, .730);
  hook.quadraticCurveTo(-3.583, .680, -3.48, .71825);
  hook.lineTo(-3.453265, .940);
  hook.quadraticCurveTo(-3.47, .991, -3.518, .99325);
  const g = new THREE.ExtrudeGeometry(hook, { depth: .05898, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -.02949).rotateY(-Math.PI / 2);
  P.addEquipment('hullDetail', g);
}

function runningGear(P: TankBuilderPort): void {
  const wheels = leopardA6WheelSolids();
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .34531, wheelW: .3484, wheelY: .4182,
    wheelZs: [-2.239845, -1.357925, -.483615, .398305, 1.127355, 1.899555, 2.715785],
    wheelTireBands: [-.10442, .10442].map(centerM => ({ centerM,
      widthM: .13956, innerRadiusM: .31624 })),
    wheelCoreGeometry: { disc: wheels.core },
    wheelFaceLayers: [
      { geometry: wheels.left, material: P.mats.wheels, side: -1, name: 'a6SourcePairedWheelFacesL' },
      { geometry: wheels.right, material: P.mats.wheels, side: 1, name: 'a6SourcePairedWheelFacesR' },
    ],
    // Source flat outer shoe spans Y0–.07568. A 24 mm concealed carrier
    // puts the native pad/web skin within 3 mm of that source span. The
    // 2.4 mm tangent-corner allowance keeps every rigid shoe above ground
    // without moving an axle or overlapping the wheel rest height .07289.
    xc: 1.32814, trackW: .63558, trackTh: .024, topY: 1.199, botY: .0564,
    trackShoeDimensions: { padHeight: .032, grouserHeight: .014, webHeight: .030, hornHeight: .10 },
    sprocket: { z: -3.058845, y: .82369, r: .3175, trackR: .306,
      axleOutsetM: .0025545, axialScaleLeft: .90119701, axialScaleRight: .90119701 },
    idler: { z: 3.365775, y: .8399, r: .26407, trackR: .285,
      axleOutsetM: -.063095, axialScaleLeft: .83454832, axialScaleRight: .83454832 },
    rollers: [-1.819725, -.162095, 1.578445, 2.368575].map(z => ({ z, y: 1.07755, r: .084665 })),
    returnRollerWidthM: .12906, returnRollerInsetM: .1737,
    suspensionDimensions: {
      // Each source end is only 69.62 mm thick. The apparent 165.59 mm
      // bounding width includes its genuine 95.97 mm outward axial shear.
      armWidthM: .06962, armAxialShearM: .09597,
      armHeightM: .192, armAxleHeightM: .21828, armCenterAbsXM: 1.07335,
      anchorBossWidthM: .28297, anchorBossRadiusM: .14897, anchorBossCenterAbsXM: .85961,
      axleBossWidthM: .23257, axleBossRadiusM: .08630, axleBossCenterAbsXM: 1.16893,
      anchorLiftM: .20832, anchorTrailM: .485275,
    },
    arms: true, paintedEnds: true, coveredTop: true,
  });
}

function skirts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    thinSkirtRows(P, side);
    const left = side < 0 ? -1.884565 : 1.674585;
    const right = side < 0 ? -1.674585 : 1.884565;
    for (const [back, front] of [[1.558595, 2.168485], [2.169565, 2.779455], [2.780485, 3.390375]]) {
      P.addExternalArmor('hull', wall([[back, left, right, .88171, 1.32576],
        [front, left, right, .88171, 1.32576]]));
    }
    P.addExternalArmor('hull', wall([[3.394485, left, right, .87971, 1.32414],
      [3.711525, side < 0 ? -1.785 : 1.674585, side < 0 ? -1.674585 : 1.785, 1.002, 1.27]]));
    skirtSupports(P, side);
    const x0 = side < 0 ? -1.678 : 1.06, x1 = side < 0 ? -1.06 : 1.678;
    P.addMudguard(`a6x_front_guard_${side}`, 'hullPaintedDetail', markFixedPaintedPanel(wall([
      [3.074, x0, x1, 1.310, 1.420], [3.50, x0, x1, 1.246, 1.318],
      [3.75, x0, x1, 1.115, 1.194], [3.815, x0, x1, 1.000, 1.009],
    ]), 'a6-fixed-front-guard', 'hullDetail'));
  }
}

function skirtSupports(P: TankBuilderPort, side: number): void {
  // Independently measured folded upper sheets: their 17.4% inward crossfall
  // is important, and is not a full-height armor extension into the track bay.
  const ring: [number, number][] = [[1.69355, 1.32859], [1.707285, 1.32859],
    [1.65721, 1.61942], [1.64287, 1.61942]];
  const mirrored = side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring;
  for (const [back, front] of [[-.567805, -.251205], [-.245175, .811865], [.837935, 1.589835]]) {
    P.addEquipment('hullPaintedDetail', markFixedPaintedPanel(
      sectionSolid([{ z: back, ring: mirrored }, { z: front, ring: mirrored }]),
      'a6-fixed-upper-sheet', 'hullDetail'));
  }
  for (const [z, top] of [[1.643775, 1.64596], [2.085605, 1.64528], [2.254175, 1.61199]]) {
    const a = side < 0 ? -1.717155 : 1.498355, b = side < 0 ? -1.498355 : 1.717155;
    P.addEquipment('hullDetail', wall([[z - .01101, a, b, 1.44367, top],
      [z + .01101, a, b, 1.44367, top]]));
  }
  for (const z of [1.642505, 2.084575, 2.253475, 2.695545, 2.864395, 3.306465]) {
    // Source hinge stock is a folded receiving tab; a concealed 25 mm root
    // continuation meets the retained cover, not an invented tall pedestal.
    P.addEquipment('hullDetail', box(.0461, .126, .04954), side * 1.708895, 1.38402, z);
    P.addEquipment('hullDetail', cylX(.017, .02238, 12), side * 1.735055, 1.36749, z);
  }
  for (const z of [1.59902, 2.12807, 2.20999, 2.73904, 2.82091, 3.34995]) {
    P.addEquipment('hullDetail', cylX(.02114, .02828, 12), side * 1.890815, 1.23104, z);
  }
}

function thinSkirtRows(P: TankBuilderPort, side: number): void {
  for (let i = 0; i < 6; i++) {
    const z = 1.124 - i * .874;
    P.addExternalArmor('hull', box(.0354, i === 5 ? .2226 : .41069, .82275),
      side * 1.7232, i === 5 ? 1.18644 : 1.092395, z);
    for (const dz of [-.33, .33]) P.addEquipment('hullDetail', cylX(.015, .012, 8),
      side * 1.748, 1.247, z + dz);
  }
}

function deckEquipment(P: TankBuilderPort): void {
  for (const x of [-.524, .524]) {
    P.addEquipment('hullDark', cylY(.489, .489, .027, 40), x, 1.803, -3.042);
    for (const r of [.17, .24, .31, .39, .47]) {
      P.addEquipment('hullDetail', torus(r, .007, 40, 5), x, 1.836, -3.042);
    }
    for (let spoke = 0; spoke < 10; spoke++) {
      const a = spoke * Math.PI / 5;
      P.addEquipment('hullDetail', box(.012, .018, .48),
        x + Math.sin(a) * .24, 1.828, -3.042 + Math.cos(a) * .24, 0, a);
    }
  }
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(.44, .036, 1.20), side * 1.43, 1.81, -3.03);
    for (let i = 0; i < 12; i++) P.addEquipment('hullDark', box(.40, .013, .022),
      side * 1.43, 1.834, -3.56 + i * .095);
    bowFurniture(P, side);
  }
  P.addHatch('hullDetail', box(.90218, .024, .61779), -.782385, 1.56162, 2.39914, .258);
  for (const [x, y, z, width] of [[-.882, 1.6147, 2.3353, .2217],
    [-.6600, 1.60004, 2.40447, .21038], [-.26232, 1.56335, 2.56006, .22621]]) {
    P.addEquipment('hullDetail', box(width, .064, .107), x, y, z, .258);
    P.addEquipment('hullGlass', box(width * .81, .024, .008), x, y + .009, z + .054, .258);
  }
  P.addEquipment('hullDetail', box(.89, .03, .13), 0, 1.668, 2.13);
}

function openConnector(width: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, length / 2, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, width * .255, length * .315, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: false, curveSegments: 12 });
  return g.translate(0, 0, -.0125);
}

function bowFurniture(P: TankBuilderPort, side: number): void {
  const x = side * .841965;
  P.addEquipment('hullDetail', cylZ(.10466, .225, 24), x, 1.26415, 3.53584);
  P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.091, .006, 24), 'headlight'), x, 1.26415, 3.647335);
  P.addEquipment('hullDetail', wall([[3.4045, x - .079, x + .079, 1.138, 1.205],
    [3.56, x - .079, x + .079, 1.138, 1.205]]));
  for (const absoluteX of [.38272, .51931, .65654]) {
    P.addEquipment('hullDetail', openConnector(.11759, .225), side * absoluteX, 1.284375, 3.355885, -.813);
  }
  P.addEquipment('hullDetail', openConnector(.11759, .225), side * .38272, 1.139655, 3.507075, -.813);
  for (const [y, z] of [[1.1587735, 3.5457855], [1.301956, 3.3917025]]) {
    P.addEquipment('hullDetail', box(.23937, .048, .220), side * .14926, y, z, .758);
    for (const dx of [-.070, .070]) P.addEquipment('hullDark', box(.024, .052, .19),
      side * .14926 + dx, y + .012, z + .012, .758);
  }
  for (const [cx, y, z] of [[1.148375, 1.276715, 3.55936], [1.371945, 1.276715, 3.55936],
    [1.148375, 1.315255, 3.35961], [1.371945, 1.315255, 3.35961]]) {
    P.addEquipment('hullDetail', openConnector(.11759, .20528), side * cx, y, z, -1.376, 0, Math.PI / 2);
  }
  P.addEquipment('hullDetail', cylX(.02294, .75118, 20), side * 1.36525, 1.26013, 3.67624);
  P.addEquipment('hullDetail', openConnector(.10056, .238), side * .65219, 1.12117, 3.63228, -.35, Math.PI / 2);
  P.addEquipment('hullDetail', box(.10, .062, .16), side * .65219, 1.100, 3.493);
  for (const cx of [1.23737, 1.34301, 1.45583, 1.56148]) {
    P.addEquipment('hullDetail', box(.06442, .032, .14753), side * cx, 1.3669, 3.16345, .22);
  }
}

function turretBack(P: TankBuilderPort): void {
  const rows: Row[] = [
    [-2.7387, -.368, .6174, 1.85406, 2.33565],
    [-1.8062, -1.126, 1.1769, 1.85406, 2.43111],
    [-1.023, -1.213, 1.1769, 1.85406, 2.43111],
    [-.4664, -1.2742, 1.1769, 1.786, 2.43111],
    [.2587, -1.2742, 1.1769, 1.69774, 2.43111],
    [.3715, -1.2742, 1.1769, 1.69774, 2.43035],
    [1.0977, -1.2742, 1.1769, 1.69774, 2.37947],
  ];
  P.add('turret', local(wall(rows), D.turretPivot));
}

function turretCheeks(P: TankBuilderPort): void {
  // Broad surfaces use independently measured plane normals. The leading
  // cheeks fall outward as well as forward; a level rectangular wedge would
  // erase that medium-scale form. Neither half crosses the real gun throat.
  cheek(P, 1, .259, 1.393745, 1.176925);
  cheek(P, -1, .196995, 1.491045, 1.274225);
}

function cheekRoof(side: number, x: number, z: number): number {
  if (side > 0) return Math.min(
    (2.41496517 - .02096949 * x - .02873983 * z) / .99936695,
    (3.11507045 - .26781475 * x - .40417141 * z) / .87459747,
    (2.23276603 - .86978401 * x - .03448941 * z) / .49222582);
  return Math.min(
    (2.43833975 + .02484870 * x - .03993549 * z) / .99889324,
    (3.12201470 + .27490637 * x - .41942070 * z) / .86516632,
    (2.31739595 + .86978401 * x - .03448941 * z) / .49222582);
}

function cheek(P: TankBuilderPort, side: number, inner: number, broad: number, shoulder: number): void {
  const turn = side > 0 ? 1.904985 : 1.833575;
  const stations = [1.095, 1.5634, turn, 2.24, 2.413, 2.616, 3.1427];
  const sections = stations.map(z => {
    let outer = broad;
    if (z > 1.5634 && z <= turn) outer = THREE.MathUtils.lerp(broad, broad - .018,
      (z - 1.5634) / (turn - 1.5634));
    if (z > turn && z <= 2.413) outer = THREE.MathUtils.lerp(broad - .018, shoulder,
      (z - turn) / (2.413 - turn));
    if (z > 2.413) outer = THREE.MathUtils.lerp(shoulder, inner + .002,
      (z - 2.413) / (3.1452 - 2.413));
    const shoulderX = Math.min(shoulder, outer - .0003);
    const floor = 1.69774 + Math.max(0, z - 1.905) * .229;
    const xs = [inner, Math.min(.4777, outer - .0007), Math.min(.9707, outer - .0005), shoulderX, outer];
    // Corresponding narrow strips keep the port EMES floor recessed while
    // both adjacent armor reveals and the forward lip remain closed solids.
    return { z, outer, floor, xs };
  });
  for (let strip = 0; strip < 4; strip++) {
    const rows: SolidSection[] = sections.map(({ z, floor, xs }) => {
      const a = xs[strip], b = Math.max(a + .0001, xs[strip + 1]);
      const top = (value: number) => {
        let y = cheekRoof(side, side * value, z);
        if (side < 0 && strip === 1 && z < 2.616) {
          y = Math.min(y, (2.60381611 - .10226206 * value - .15453040 * z) / .98268145);
        }
        return Math.max(floor + .001, y);
      };
      const left = side < 0 ? -b : a, right = side < 0 ? -a : b;
      return { z, ring: [[left, floor], [right, floor],
        [right, top(Math.abs(right))], [left, top(Math.abs(left))]] };
    });
    P.add('turret', local(sectionSolid(rows), D.turretPivot));
  }
}

function opticHousing(P: TankBuilderPort): void {
  // The EMES housing continues aft to a diagonal wall at Z 1.082–1.348.
  // This is a substantial raised housing, not the short front-window box of
  // the initial draft. Its front stops behind the separately recessed glass.
  const top = (x: number, z: number) => Math.min(2.56609,
    (2.66353118 + .02598410 * x - .07007806 * z) / .99720303);
  const sections: SolidSection[] = [-.981105, -.94, -.80, -.66, -.54, -.468425].map(x => {
    const back = (1.41226538 + .46021466 * x) / .88780767;
    const front = (1.9494 + .30898084 * x) / .95106826;
    // Local Z is source X; rotating the closed section restores +Z forward.
    return { z: x, ring: [[-front, 2.270], [-back, 2.30468],
      [-back, top(x, back)], [-front, top(x, front)]] };
  });
  const body = sectionSolid(sections);
  body.rotateY(Math.PI / 2);
  P.addEquipment('turretDetail', local(body, D.turretPivot));
}

function optic(P: TankBuilderPort): void {
  // Measured canted sight face: its glazing is recessed 45 mm behind the
  // front rim, and over 0.3 m behind the forward armor at the same height.
  const cx = -.72, front = 1.822243, y = 2.412, angle = -.314159;
  opticHousing(P);
  equipment(P, 'turretGlass', box(.442, .171, .012), cx + .001854, y, front - .005706, 0, angle);
  for (const dy of [-.099, .099]) equipment(P, 'turretDetail', box(.49, .040, .08),
    cx, y + dy, front + .00553, 0, angle);
  for (const dx of [-.237, .237]) equipment(P, 'turretDetail', box(.024, .235, .08),
    cx + dx * Math.cos(angle), y, front + .013 - dx * Math.sin(angle), 0, angle);
}

function cupolasAndSight(P: TankBuilderPort): void {
  for (const [x, z, radius, bottom, top] of [[-.6221, -.0401, .31935, 2.431, 2.5954],
    [.53145, -.01375, .37077, 2.431, 2.5328]]) {
    P.add('turret', cylY(radius, radius, top - bottom, 32),
      x - D.turretPivot[0], (top + bottom) / 2 - D.turretPivot[1], z - D.turretPivot[2]);
    P.addHatch('turretDetail', cylY(radius * .73, radius * .73, .0166, 24),
      x - D.turretPivot[0], top + .006 - D.turretPivot[1], z - D.turretPivot[2]);
  }
  equipment(P, 'turretDetail', box(.31, .1665, .768), -.2776, 2.50, -.7385);
  equipment(P, 'turretDetail', cylY(.2313, .2313, .16855, 32), -.2776, 2.6646, -.526);
  equipment(P, 'turretDetail', box(.20414, .1555, .23591), -.2776, 2.82035, -.54275);
  equipment(P, 'turretGlass', box(.175, .08, .01), -.2776, 2.825, -.416);
  for (const x of [-.88017, .91495]) {
    equipment(P, 'turretDetail', cylY(.0335, .0335, .10156, 16), x, 2.46655, -1.8698);
    const path = new THREE.LineCurve3(new THREE.Vector3(x, 2.5116, -1.873), new THREE.Vector3(x, 4.1563, -2.1022));
    P.addEquipment('turretDetail', local(new THREE.TubeGeometry(path, 2, .0086, 6, false), D.turretPivot));
  }
}

function smokeTube(P: TankBuilderPort, mouth: Point, direction: Point): void {
  const axis = new THREE.Vector3(...direction).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const center = new THREE.Vector3(...mouth).addScaledVector(axis, -.1071);
  const body = new THREE.CylinderGeometry(.0437, .0437, .2142, 16, 1, true);
  body.applyQuaternion(rotation).translate(...center.toArray());
  P.addEquipment('turretDetail', local(body, D.turretPivot));
  const rim = new THREE.RingGeometry(.0305, .0437, 16);
  rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
  rim.translate(...mouth);
  P.addEquipment('turretDetail', local(rim, D.turretPivot));
  const back = new THREE.Vector3(...mouth).addScaledVector(axis, -.207);
  const cap = new THREE.CylinderGeometry(.042, .042, .014, 16);
  cap.applyQuaternion(rotation).translate(...back.toArray());
  P.addEquipment('turretDark', local(cap, D.turretPivot));
  // Small original saddle joins the measured stock to the permanent flank.
  // Its concealed root is a construction allowance, not a source landmark.
  const root = back.clone();
  root.x = mouth[0] < 0 ? -1.262 : 1.165;
  const path = new THREE.LineCurve3(root, back);
  P.addEquipment('turretDetail', local(new THREE.TubeGeometry(path, 1, .024, 8, false), D.turretPivot));
}

function smokeAndRearGear(P: TankBuilderPort): void {
  const rightAxis: Point = [.2833336, .5865999, .7586980];
  const leftAxis: Point = [-.3683290, .5865440, .7213180];
  for (const dz of [-.43220, -.22331, 0, .20889]) {
    smokeTube(P, [1.330162, 2.350317, -1.264813 + dz], rightAxis);
  }
  for (const dz of [-.32763, 0, .20889, .41150]) {
    smokeTube(P, [1.368452, 2.066207, -.980383 + dz], rightAxis);
  }
  for (const [dx, dz] of [[.06149, -.53299], [.03755, -.32547], [0, 0], [-.02394, .20751]]) {
    smokeTube(P, [-1.427776 + dx, 2.066742, -.855594 + dz], leftAxis);
  }
  for (const [dx, dz] of [[.04954, -.42934], [.02560, -.22183], [0, 0], [-.02394, .20752]]) {
    smokeTube(P, [-1.357136 + dx, 2.350862, -1.133764 + dz], leftAxis);
  }
  for (const side of [-1, 1]) {
    const x = side > 0 ? .910 : -.91;
    equipment(P, 'turretDetail', box(.49, .055, .57), x, 1.8815, -2.425);
    for (const dz of [-.24, 0, .24]) equipment(P, 'turretDetail', cylY(.0139, .0139, .334, 8),
      x + side * .235, 2.0505, -2.425 + dz);
    equipment(P, 'turretDetail', box(.028, .028, .54), x + side * .235, 2.226, -2.425);
    for (const dz of [-.25, .25]) equipment(P, 'turretDetail', box(.49, .028, .028), x, 2.226, -2.425 + dz);
  }
}

function weapons(P: TankBuilderPort): void {
  const [gx, gy, gz] = D.trunnion;
  P.muzzleZ = D.muzzleZ - gz;
  const barrel = (radius: number, back: number, front: number, y = gy) =>
    P.add('gun', cylZ(radius, front - back, 32), -gx, y - gy, (back + front) / 2 - gz);
  barrel(.1413, 2.6038, 3.35);
  const shoulder = new THREE.CylinderGeometry(.17423, .1413, .102, 32);
  shoulder.rotateX(Math.PI / 2);
  P.add('gun', shoulder, 0, .01497, 3.40 - gz);
  barrel(.17423, 3.45, 3.88, 2.00048);
  barrel(.14, 3.88, 4.08);
  barrel(.11821, 4.08, 6.72);
  barrel(.13034, 6.72, 6.88);
  const muzzle = new THREE.CylinderGeometry(.10160, .10160, D.muzzleZ - 6.88, 32, 1, true);
  muzzle.rotateX(Math.PI / 2);
  P.add('gun', muzzle, 0, 0, (6.88 + D.muzzleZ) / 2 - gz);
  const bore = new THREE.CylinderGeometry(.060, .060, .25, 32, 1, true);
  bore.rotateX(Math.PI / 2);
  P.add('gunDark', bore, 0, 0, P.muzzleZ - .125);
  const rim = new THREE.RingGeometry(.060, .10160, 32);
  P.add('gun', rim, 0, 0, P.muzzleZ);
  P.add('gunDark', cylZ(.060, .007, 32), 0, 0, P.muzzleZ - .251);
  muzzleReference(P);
  movingMantlet(P);
  const mg = sourceMachineGun(P, D.turretPivot);
  mg.add('turretDetail', box(.19, .10, .25), .8823, 2.577, -.1265);
  mg.add('turretDark', box(.08, .055, .18), .9349, 2.6331, -.155);
  mg.add('turretDark', cylZ(.01985, .31484, 20), .9349, 2.63313, -.007705);
  mg.add('turretDark', cylZ(.006, .007, 16), .9349, 2.63313, .150);
  mg.finish();
}

function muzzleReference(P: TankBuilderPort): void {
  // Source side-mounted reference optic and partial collars are real tube
  // hardware. They must not disappear from the forward gun outline or remain
  // attached to the static mantlet during recoil.
  for (const z of [6.850, 7.100]) {
    const collar = new THREE.TorusGeometry(.094, .009, 6, 20, 2.50);
    collar.rotateZ(Math.PI / 2 + .3208);
    P.add('gun', collar, 0, 0, z - D.trunnion[2]);
  }
  P.add('gun', box(.025, .05646, .10286), -.11630 - D.trunnion[0], 0, 7.020365 - D.trunnion[2]);
  P.add('gun', box(.07874, .05003, .04204), -.131635 - D.trunnion[0], 0, 6.949445 - D.trunnion[2]);
  P.add('gun', cylZ(.019285, .07079, 20), -.14109 - D.trunnion[0], 0, 6.89424 - D.trunnion[2]);
  P.add('gunDark', cylZ(.011, .006, 16), -.14109 - D.trunnion[0], 0, 6.932635 - D.trunnion[2]);
}

function movingMantlet(P: TankBuilderPort): void {
  // Source front-rake begins at Z2.478895, not at the rear of the housing.
  // Its long upper cover and offset narrow optical hump are substantial
  // pitch-owned forms; both are included in the direct source gun mask.
  const stations = [[1.076785, 1.71535, 2.32568], [1.170095, 1.71535, 2.37004],
    [1.707855, 1.71535, 2.37004], [1.740935, 1.71535, 2.35304],
    [1.776495, 1.71535, 2.37004], [2.448, 1.71535, 2.32709],
    [2.478895, 1.72866, 2.32512], [2.70, 1.824, 2.22513],
    [3.146975, 1.983, 2.02298]];
  P.add('gunMount', local(wall(stations.map(([z, floor, roof]) =>
    [z, -.191385, .251975, floor, roof] as Row)), D.trunnion));
  const hump = [[1.528005, 2.370, 2.403], [1.605675, 2.370, 2.498],
    [1.705215, 2.370, 2.50433], [1.779545, 2.359, 2.44272], [1.935855, 2.34915, 2.42330]];
  P.add('gunMount', local(sectionSolid(hump.map(([z, bottom, top]) => ({ z, ring: [
    [-.144745, bottom], [.025375, bottom], [.019835, bottom + .025],
    [-.016, top], [-.10337, top], [-.139205, bottom + .025],
  ] }))), D.trunnion));
  for (const side of [-1, 1]) {
    for (const z of [1.8391, 2.0588]) P.add('gunMount', box(.0216, .0206, .0614),
      side > 0 ? .22590 - D.trunnion[0] : -.171375 - D.trunnion[0],
      2.37347 - (z - 1.8391) * .0622 - D.trunnion[1], z - D.trunnion[2]);
    P.add('gunMount', box(.0613, .0190, .0216), side > 0 ? .19873 : -.13092,
      2.337195 - D.trunnion[1], 2.409985 - D.trunnion[2]);
  }
}

export function buildLeopard2A6X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(...D.trunnion.map((v, i) => v - D.turretPivot[i]) as [number, number, number]);
  P.topY = 2.43111 - D.turretPivot[1];
  hull(P);
  runningGear(P);
  skirts(P);
  deckEquipment(P);
  turretBack(P);
  turretCheeks(P);
  optic(P);
  cupolasAndSight(P);
  addLeopardA6XFittings(P, D.turretPivot);
  smokeAndRearGear(P);
  weapons(P);
}

export const LEOPARD_A6_X_PROFILES = Object.freeze({ leo2a6_x: { build: buildLeopard2A6X } });
