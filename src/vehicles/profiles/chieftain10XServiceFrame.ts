// Original raised engine-service frame from root_7003/7012/7014 scalar
// planes and assembly bounds. No source geometry or sampled contours.
import * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Plane = readonly [number, number, number, number];
const yOn = (p: Plane, x: number, z: number): number => (p[3] - p[0] * x - p[2] * z) / p[1];

function add(P: TankBuilderPort, g: THREE.BufferGeometry, name: string, structural = false): void {
  g.userData.chieftain10ServiceFrame = name;
  if (structural) P.add('hull', g); else P.addEquipment('hullDetail', g);
}

function plate(P: TankBuilderPort, name: string, x0: number, x1: number,
  z0: number, z1: number, bottom: (x: number, z: number) => number,
  top: (x: number, z: number) => number, structural = false): void {
  add(P, sectionSolid([z0, z1].map(z => ({ z, ring: [[x0, bottom(x0, z)],
    [x1, bottom(x1, z)], [x1, top(x1, z)], [x0, top(x0, z)]] }))), name, structural);
}

function transverseRail(P: TankBuilderPort, x0: number, x1: number): void {
  const planes: readonly Plane[] = [
    [0, .052820032813, -.998604047725, 2.401177950188],
    [0, .371407489761, -.928469965346, 2.799452324532],
    [0, .920068365537, -.391757836855, 2.541256363161],
    [0, .928506034561, .371317308760, .816623697648],
    [0, .394717953235, .918802338588, -1.370528564934],
    [0, .077135480170, .997020620498, -2.105207607435],
  ];
  // The six crown planes meet at their physical folds. The two ~61 mm
  // inter-segment gaps are not bridged by a single full-width bounding bar.
  const zs = [-2.3130, -2.31149, -2.30241, -2.27991533, -2.257285, -2.247645, -2.24544];
  const floor: Plane = [0, -.999913366166, .013162832655, -1.760264223211];
  add(P, sectionSolid(zs.map(z => {
    const low = yOn(floor, 0, z), high = Math.max(low + .0001, Math.min(...planes.map(p => yOn(p, 0, z))));
    return { z, ring: [[x0, low], [x1, low], [x1, high], [x0, high]] };
  })), 'transverseRail');
}

function serviceCover(P: TankBuilderPort): void {
  const top = (_x: number, z: number) => yOn([0, .999931021930, -.011745270630, 1.759342034453], 0, z);
  plate(P, 'serviceCover', -.84790, .84700, -2.397685, -2.072465,
    (x, z) => top(x, z) - .006, top);
  // Source root_7003 has two real flat engine pads, not a full slab across
  // the central shaft relief. Their concealed closures overlap the old tub.
  for (const [a, b] of [[-.81058, -.18], [.18, .80990]]) {
    plate(P, 'enginePad', a, b, -2.476895, -2.031255, () => 1.586,
      () => 1.691300034523, true);
  }
  // Downturned perimeter walls meet those pads. Sheet thickness and the
  // hidden 1.5 mm lap are construction allowances, not copied source topology.
  for (const z of [-2.397685, -2.078465]) plate(P, 'coverEndReturn', -.84790, .84700,
    z, z + .006, () => 1.6898, (x, q) => top(x, q));
  for (const [a, b] of [[-.84790, -.84190], [.841, .847]]) plate(P, 'coverSideReturn', a, b,
    -2.391685, -2.078465, () => 1.6898, top);
}

function crossReceiving(P: TankBuilderPort, side: number): void {
  const a = side > 0 ? .93867 : -1.33237, b = side > 0 ? 1.33236 : -.93867;
  const top = (x: number, z: number) => yOn([0, .999870221150, -.016110271799, 1.767294503002], x, z);
  plate(P, 'crossReceivingFlange', a, b, -2.308415, -2.248205, (x, z) => top(x, z) - .005, top);
  // The web has a rising diagonal underside and a folded outboard foot.
  // Preserve air below the web instead of extending it to the whole deck.
  const deck = (x: number, z: number) => 1.946819 - .23107658 * Math.abs(x) + .011245 * z;
  const xs = side > 0 ? [a, 1.31027, b] : [a, -1.31027, b];
  const bottom = (x: number, z: number) => Math.max(
    yOn([-.218026618886, -.975777571763, .017958950482, -1.923730932006], Math.abs(x), z),
    yOn([.914744806959, -.404011580676, .004071955337, .532962870273], Math.abs(x), z));
  add(P, sectionSolid([-2.28634, -2.2800].map(z => ({ z, ring: [
    ...xs.map((x): [number, number] => [x, bottom(x, z)]),
    ...[...xs].reverse().map((x): [number, number] => [x, top(x, z)]),
  ] }))), 'crossReceivingWeb');
  foldedFoot(P, side, deck);
  const lo = side > 0 ? .918 : -1.478, hi = side > 0 ? 1.478 : -.918;
  plate(P, 'localReceivingShoulder', lo, hi, -2.434, -2.028,
    () => 1.50, deck, true);
}

function foldedFoot(P: TankBuilderPort, side: number,
  deck: (x: number, z: number) => number): void {
  const xAt = (y: number, z: number) => (.532962870273 + .404011580676 * y - .004071955337 * z) / .914744806959;
  add(P, sectionSolid([-2.320855, -2.256725].map(z => {
    const low = 1.631, high = 1.7260, x0 = xAt(low, z), x1 = xAt(high, z);
    const ring: [number, number][] = [[x0 - .005, low], [x0, low], [x1, high], [x1 - .005, high]];
    return { z, ring: side > 0 ? ring : ring.map(([x, y]): [number, number] => [-x, y]).reverse() };
  })), 'foldedOutboardFoot');
  const a = side > 0 ? 1.306 : -1.3413, b = side > 0 ? 1.3413 : -1.306;
  // Source foot plate is retained at its measured crown; only its concealed
  // root continues ~15 mm to the existing permanent shoulder, without a pad
  // underneath the open middle of the web.
  plate(P, 'foldedFootRoot', a, b, -2.322805, -2.256585, (x, z) => deck(x, z) - .001,
    (x, z) => yOn([.206371351976, .978344911943, -.015877605605, 1.905227876498], Math.abs(x), z) + .0015);
}

function longitudinalRail(P: TankBuilderPort, side: number): void {
  const planes: readonly Plane[] = [
    [-.997870412362, .065216866290, .001183420186, -1.296447254066],
    [-.923749297631, .382934259531, .006970509604, -.647842877187],
    [-.381511630045, .924210697777, .016836337326, 1.061461613162],
    [.381280258329, .924306379097, .016825045899, 2.162397847121],
    [.923893907991, .382585742363, .006942371141, 2.017893848925],
    [.997719879690, .067479872121, .001228222269, 1.587190945704],
  ];
  const xs = [1.40935, 1.41113, 1.42051, 1.44307, 1.46564, 1.47501, 1.47680];
  const floor = (_x: number, z: number) => 1.683444922 - .018201313 * z;
  const g = sectionSolid([-2.311635, -.733335].map(z => ({ z, ring: [
    ...xs.map((x): [number, number] => [x, floor(x, z)]),
    ...xs.map((x): [number, number] => [x, Math.max(floor(x, z) + .0001,
      Math.min(...planes.map(p => yOn(p, x, z))))]).reverse(),
  ] })));
  if (side < 0) {
    const indices: number[] = [];
    for (let i = 0; i < g.attributes.position.count; i += 3) indices.push(i, i + 2, i + 1);
    g.setIndex(indices); g.scale(-1, 1, 1); g.computeVertexNormals();
  }
  add(P, g, 'longitudinalRail');
  const a = side > 0 ? 1.41208 : -1.47546, b = side > 0 ? 1.47546 : -1.41208;
  plate(P, 'longReceivingFlange', a, b, -2.301575, -.734,
    (x, z) => floor(x, z) - .005, (x, z) => floor(x, z) + .0006);
  const left = side > 0 ? 1.41354 : -1.46040, right = side > 0 ? 1.46040 : -1.41354;
  plate(P, 'aftReceivingWall', left, right, -2.294445, -2.276985,
    () => 1.58158, (x, z) => floor(x, z) - .004);
}

export function addChieftain10XServiceFrame(P: TankBuilderPort): void {
  serviceCover(P);
  for (const [a, b] of [[-1.35005, -.93839], [-.87725, .87724], [.93838, 1.35005]]) transverseRail(P, a, b);
  for (const side of [-1, 1]) { crossReceiving(P, side); longitudinalRail(P, side); }
}
