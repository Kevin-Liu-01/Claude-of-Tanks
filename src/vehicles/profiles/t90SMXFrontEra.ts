// Independently authored SM front applique from local-source scalar planes.
// No source vertex/index data, source assets, or donor-family geometry.
import { sectionSolid } from './sectionSolid.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type PointYZ = readonly [y: number, z: number];
type Plate = {
  left: number; right: number;
  rear: PointYZ; front: PointYZ;
  /** Measured bottom-face displacement from the upper face, in metres. */
  down: number; back: number;
};

function crosswiseSolid(P: TankBuilderPort, left: number, right: number, yz: readonly PointYZ[], equipment = false, reactive = false): void {
  // sectionSolid's longitudinal primitive is rotated into a transverse
  // extrusion. The four authored faces remain closed at both side edges.
  const ring = yz.map(([y, z]) => [-z, y] as const);
  const g = sectionSolid([{ z: left, ring }, { z: right, ring }]).rotateY(Math.PI / 2);
  if (reactive) { if (equipment) markEraFurniture(g); else markEraHitFaces(g, [0, 1, 0]); }
  if (equipment) P.addEquipment('hullDetail', g);
  else P.addExternalArmor('hull', g);
}

function plate(P: TankBuilderPort, p: Plate, equipment = false, reactive = false): void {
  const [ry, rz] = p.rear, [fy, fz] = p.front;
  crosswiseSolid(P, p.left, p.right, [
    [fy - p.down, fz - p.back], [ry - p.down, rz - p.back], [ry, rz], [fy, fz],
  ], equipment, reactive);
}

function reactiveCover(P: TankBuilderPort, p: Plate, equipment = false): void {
  P.destructibleCluster(`glacis_era_${p.left + p.right < 0 ? 'L' : 'R'}`,
    () => plate(P, p, equipment, true));
}

function forwardCourse(P: TankBuilderPort): void {
  // Two broad, asymmetric front covers, not fourteen identical proud blocks.
  // These measured oblique end caps are substantive thickness, not dark ink.
  reactiveCover(P, { left: -.8914446, right: -.0022647, rear: [1.15841734, 2.86578679],
    front: [.93933767, 3.44641829], down: .03769761, back: .01583123 });
  reactiveCover(P, { left: -.0083044, right: .8808763, rear: [1.16186523, 2.86741972],
    front: [.93562871, 3.44498563], down: .03749806, back: .01634383 });
  // The narrow lower folded rib is separated from the left cover by genuine
  // source air around Y .900; it must not become a tall opaque crossbar.
  crosswiseSolid(P, -.88183713, .89554518, [
    [.827125967, 3.423683405], [.830116928, 3.413158178],
    [.898902535, 3.440521717], [.895413637, 3.451048136],
  ]);
}

function rearCenterCovers(P: TankBuilderPort): void {
  // Source cap thickness is visible at the rear. The small concealed lower
  // closure is mechanical inference where the source underside is uncapped.
  plate(P, { left: -.57124364, right: .02158443, rear: [1.38902628, 2.21713567],
    front: [1.14858377, 2.85693622], down: .0375, back: .01275 });
  plate(P, { left: .01397144, right: .60679954, rear: [1.39013433, 2.22093439],
    front: [1.14968193, 2.86072850], down: .0375, back: .01275 });
  // Four source panels, not two merged faces. The 26.9 mm spaces between
  // each pair expose the unchanged lower bases, about 6.45 mm below normal.
  for (const [left, right] of [[-.55814576, -.28847849], [-.26154882, .00811921]]) {
    reactiveCover(P, { left, right, rear: [1.39054942, 2.23141265],
      front: [1.15903747, 2.84749913], down: .007, back: 0 });
  }
  for (const [left, right] of [[.02743666, .29710391], [.32403436, .59370166]]) {
    reactiveCover(P, { left, right, rear: [1.39165378, 2.23520732],
      front: [1.16001189, 2.85152054], down: .007, back: 0 });
  }
}

type SurfacePlane = readonly [normalY: number, normalZ: number, d: number];
function surfaceY(z: number, [ny, nz, d]: SurfacePlane): number { return (d - nz * z) / ny; }

function panelRibs(P: TankBuilderPort): void {
  // Scalar crown planes and longitudinal face extents, independently measured
  // on the eight distinct source rows. Each row has two separate 269 mm ribs.
  const rows: readonly (readonly [number, number, number, number, number])[] = [
    [2.30625105, 2.31418252, .937882852, .346952094, 2.082335707],
    [2.42172050, 2.42977405, .937814217, .347137573, 2.082058388],
    [2.53754115, 2.54558086, .937850709, .347038971, 2.081238115],
    [2.65309095, 2.66112757, .936529980, .350587503, 2.088398792],
    [2.31016588, 2.31821132, .937151750, .348922050, 2.088229075],
    [2.42562580, 2.43368006, .937765502, .347269150, 2.084641649],
    [2.54146314, 2.54950070, .937843191, .347059288, 2.083605032],
    [2.65711164, 2.66506577, .939740366, .341888936, 2.071582165],
  ];
  rows.forEach(([rear, front, ny, nz, d], index) => {
    const bands = index < 4 ? [[-.55790138, -.28909022], [-.26118147, .00762969]]
      : [[.02768105, .29661441], [.32452390, .59345645]];
    for (const [left, right] of bands) reactiveCover(P, { left, right,
      rear: [surfaceY(rear, [ny, nz, d]), rear], front: [surfaceY(front, [ny, nz, d]), front],
      down: .0057, back: .00236 }, true);
  });
}

function clippedLatch(P: TankBuilderPort, left: number, right: number, rear: number, front: number,
  plane: SurfacePlane, thickness: number, cap = false): void {
  // Small clipped corners are geometry; no painted hinge or transparent gap.
  const c = .004;
  const ring = (insetX: number, insetRear: number, insetFront: number) => {
    const l = left + insetX, r = right - insetX, a = rear + insetRear, b = front - insetFront;
    return [[l, -b + c], [l + c, -b], [r - c, -b], [r, -b + c],
      [r, -a - c], [r - c, -a], [l + c, -a], [l, -a - c]] as const;
  };
  const g = sectionSolid([{ z: -thickness, ring: ring(0, 0, 0) },
    { z: 0, ring: ring(cap ? .00343 : .00275, cap ? .007475 : .007294, cap ? 0 : .004123) }])
    .rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + surfaceY(p.getZ(i), plane));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  P.addEquipment('hullDetail', markEraFurniture(g));
}

function rearLatches(P: TankBuilderPort): void {
  for (const x of [-.80932963, -.63771179]) {
    P.destructibleCluster('glacis_era_L', () => {
    clippedLatch(P, x - .037702, x + .037702, 2.18728948, 2.25939083,
      [.878292747, .478123259, 2.313489112], .0106);
    clippedLatch(P, x - .0262565, x + .0262565, 2.20576334, 2.25019336,
      [.878331111, .478052780, 2.322509105], .0106, true);
    });
  }
  for (const x of [.67400232, .84561941]) {
    P.destructibleCluster('glacis_era_R', () => {
    clippedLatch(P, x - .037702, x + .037702, 2.18979430, 2.26165843,
      [.878297753, .478114063, 2.313319026], .0106);
    clippedLatch(P, x - .0262565, x + .0262565, 2.20825934, 2.25246334,
      [.878332437, .478050344, 2.322348527], .0106, true);
    });
  }
}

function intersectYZ(a: SurfacePlane, b: SurfacePlane): PointYZ {
  const d = a[0] * b[1] - b[0] * a[1];
  return [(a[2] * b[1] - b[2] * a[1]) / d, (a[0] * b[2] - b[0] * a[2]) / d];
}

function uprightTab(P: TankBuilderPort, left: number, right: number): void {
  // Source chasis has a six-sided raised end tab, supported laterally by an
  // inclined leaf. The lower closure is concealed within that actual leaf.
  const sides: readonly SurfacePlane[] = [
    [.434650627, -.900599152, -1.755205989], [.764984840, -.644048286, -.635991432],
    [.999222752, .039419424, 1.481842529], [.726002140, .687692441, 2.823915656],
    [-.087644799, .996151790, 2.540602738], [-.434666285, .900591595, 1.821840432],
    [-1, -.440907, -2.470580],
  ];
  crosswiseSolid(P, left, right, sides.map((p, i) => intersectYZ(p, sides[(i + 1) % sides.length])), true);
}

function uprightCarrier(P: TankBuilderPort, left: boolean): void {
  const mapX = (x: number) => left ? -x + .020073295 : x;
  const a = mapX(.8945), b = mapX(.99347275);
  // Actual lateral leaf: 18 mm vertical / 8.4 mm aft underside displacement.
  // Its inboard bearing closes the source's 2 mm manufacturing seam only.
  plate(P, { left: Math.min(a, b), right: Math.max(a, b),
    rear: [1.35049307, 2.57328701], front: [1.30662966, 2.67432499],
    down: .018, back: .008419 }, true);
  const stations = [.92002720, .94597715, .97241807].map((x, i) => {
    const y0 = i === 1 ? 1.21591210 : 1.22189415, y1 = i === 1 ? 1.33354568 : 1.32656729;
    const back = (y: number) => Math.max((1.98867359 - .531971511 * x + .367645857 * y) / .762786232,
      (1.00305509 + .521725313 * x + .370398249 * y) / .768510140);
    const front = (y: number) => Math.min((2.04909496 - .531998208 * x + .365335912 * y) / .763876677,
      (1.06675802 + .514598400 * x + .374508267 * y) / .771318381);
    // Closed bearing ends penetrate the measured leaf and original hull;
    // the exposed diagonal side planes retain the source fold directions.
    const yz: readonly PointYZ[] = [[y0, front(y0)], [y0, back(y0)], [y1, back(y1)], [y1, front(y1)]];
    return { z: mapX(x), ring: yz.map(([y, z]) => [-z, y] as const) };
  }).sort((a, b) => a.z - b.z);
  P.addEquipment('hullDetail', sectionSolid(stations).rotateY(Math.PI / 2));
}

function edgeUprights(P: TankBuilderPort): void {
  uprightTab(P, .87889689, .89554518);
  uprightTab(P, -.87596130, -.85882431);
  uprightCarrier(P, false);
  uprightCarrier(P, true);
}

function rearOuterCovers(P: TankBuilderPort): void {
  // The outer fields are steeper than the center covers. Their lower support
  // courses remain separately visible ahead of and behind the upper plates.
  reactiveCover(P, { left: -.86637205, right: -.57197827, rear: [1.44245613, 2.17004251],
    front: [1.09092736, 2.81588984], down: .02268, back: .01291 });
  reactiveCover(P, { left: .60753417, right: .90339720, rear: [1.44105661, 2.17231893],
    front: [1.08952713, 2.81816626], down: .02267, back: .01268 });
  plate(P, { left: -.86637205, right: -.57197827, rear: [1.43263841, 2.30231357],
    front: [1.13779378, 2.84401822], down: .04721487, back: .02864337 });
  plate(P, { left: .60887980, right: .90339720, rear: [1.43016267, 2.30409145],
    front: [1.13538110, 2.84568095], down: .04720116, back: .02863765 });
}

export function addT90SMFrontEra(P: TankBuilderPort): void {
  forwardCourse(P);
  rearCenterCovers(P);
  rearOuterCovers(P);
  panelRibs(P);
  rearLatches(P);
  edgeUprights(P);
}
