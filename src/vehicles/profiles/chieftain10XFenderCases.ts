// Original folded equipment cases from canonical ex_armor_body_[lr]_01/02/03
// scalar planes. No supplied topology, mesh arrays or donor construction.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Plane = readonly [nx: number, ny: number, nz: number, d: number];
const height = (p: Plane, x: number, z: number): number => (p[3] - p[0] * x - p[2] * z) / p[1];
const rearRoof: Plane = [.002073261474, .999953081622, -.009462353955, 1.704070655914];
const rearLower: Plane = [-.853517291148, -.521041417501, .004906624117, -2.095475681285];
const rearLowerFront: Plane = [-.869011637833, -.494729484252, .007842877206, -2.086704659749];
const rearFloor: Plane = [.006811814886, -.999932463767, .009416320041, -1.371244514999];
const rearChamfer: Plane = [.775536945805, .631271070392, -.006267485715, 2.349044062424];
const intersectionX = (a: Plane, b: Plane, z: number): number =>
  ((a[3] - a[2] * z) / a[1] - (b[3] - b[2] * z) / b[1]) / (a[0] / a[1] - b[0] / b[1]);

function add(P: TankBuilderPort, g: THREE.BufferGeometry, side: number, name: string,
  structural = false): void {
  if (side < 0) {
    const count = g.index?.count ?? g.attributes.position.count, indices: number[] = [];
    for (let i = 0; i < count; i += 3) for (const k of [0, 2, 1]) indices.push(g.index ? g.index.getX(i + k) : i + k);
    g.setIndex(indices); g.scale(-1, 1, 1); g.computeVertexNormals();
  }
  g.userData.chieftain10FenderCase = name;
  if (structural) P.add('hull', g); else P.addEquipment('hullDetail', g);
}

function rearCase(P: TankBuilderPort, side: number): void {
  const rows = [-3.23524, -2.035, -.8300];
  const sections: SolidSection[] = rows.map(z => {
    const floorTurn = Math.max(intersectionX(rearLower, rearFloor, z), intersectionX(rearLowerFront, rearFloor, z));
    const lowerXs = [1.4802, Math.max(1.4803, Math.min(floorTurn - .0001,
      intersectionX(rearLower, rearLowerFront, z))), floorTurn, 1.6930];
    const upperXs = [1.4802, intersectionX(rearRoof, rearChamfer, z), 1.6930];
    return { z, ring: [...lowerXs.map((x): [number, number] => [x,
      Math.max(height(rearLower, x, z), height(rearLowerFront, x, z), height(rearFloor, x, z))]),
      ...upperXs.map((x): [number, number] => [x, Math.min(height(rearRoof, x, z), height(rearChamfer, x, z))]).reverse()] };
  });
  add(P, sectionSolid(sections), side, 'rearFoldedCase');
  // The source's long narrow hinged lid is split at Z-2.03, not a short
  // broad cube. The 4 mm lid seam does not open the closed case below it.
  for (const [a, b] of [[-3.23943, -2.03580], [-2.03021, -.82687]]) {
    add(P, sectionSolid([a, b].map(z => ({ z, ring: [[1.50924, height(rearRoof, 1.50924, z) - .005],
      [1.64424, height(rearRoof, 1.64424, z) - .005], [1.64424, height(rearRoof, 1.64424, z)],
      [1.50924, height(rearRoof, 1.50924, z)]] }))), side, 'rearLid');
  }
}

function rearReceivingShoulder(P: TankBuilderPort, side: number): void {
  // Actual root_7005 inclined receiving shoulder. Its concealed bottom is
  // seated 1 mm into the existing fender; no complete deck/roof is raised.
  const plane: Plane = [.866182610719, .499698345213, -.005408204888, 2.084564625133];
  const zRows = [-3.23320, -1.70, -.82687], xs = [1.48104, 1.60, 1.65939];
  add(P, sectionSolid(zRows.map(z => {
    const base = (z < -1.70 ? 1.2547 + (z + 3.20) * .01305 : 1.27467 + (z + 1.70) * .01285) - .001;
    return { z, ring: [...xs.map((x): [number, number] => [x, base]),
      ...xs.map((x): [number, number] => [x, Math.max(base + .001, height(plane, x, z))]).reverse()] };
  })), side, 'rearReceivingShoulder', true);
}

function middleCase(P: TankBuilderPort, side: number): void {
  const roof: Plane = side > 0 ? [.055205078250, .998314681312, .017894032882, 1.694527842051]
    : [.054823412972, .998369974843, .015867788818, 1.689939258308];
  const rows = [[.6480, 1.5140], [1.0810, 1.3796], [1.9586, 1.0146]];
  add(P, sectionSolid(rows.map(([z, inner]) => {
    const floor = 1.300961 + .01289 * z, outer = 1.6740;
    return { z, ring: [[inner, floor], [outer, floor], [outer, height(roof, outer, z)],
      [inner, height(roof, inner, z)]] };
  })), side, 'middleDiagonalCase');
  // Two narrow measured bottom receiving strips meet the original fender.
  for (const z of [.73, 1.82]) {
    const inner = z < 1.081 ? 1.514 - (z - .648) * .3104 : 1.3796 - (z - 1.081) * .4159;
    const top = 1.300961 + .01289 * z + .002, floor = 1.307 + (z - .92) * .0131 - .002;
    add(P, KIT.box(1.67 - inner, top - floor, .025).translate((1.67 + inner) / 2,
      (top + floor) / 2, z), side, 'middleReceivingStrip');
  }
}

function frontCase(P: TankBuilderPort, side: number): void {
  const a: Plane = [.067558110719, .990586250735, .119057891512, 1.891061858758];
  const b: Plane = [.049053960642, .993646020512, .101298049667, 1.827580992101];
  const x0 = 1.01580, x1 = 1.687254;
  add(P, sectionSolid([2.08582, 2.76753].map(z => {
    // Intersection of two independently measured roof planes is the actual
    // diagonal fold, not a globally flat or uniformly thick replacement.
    const bend = ((a[3] - a[2] * z) / a[1] - (b[3] - b[2] * z) / b[1])
      / (a[0] / a[1] - b[0] / b[1]);
    const xs = [x0, Math.max(x0 + .0001, Math.min(x1 - .0001, bend)), x1];
    const floor = 1.299082 + .0131875 * z;
    return { z, ring: [...xs.map((x): [number, number] => [x, floor]),
      ...xs.map((x): [number, number] => [x, Math.min(height(a, x, z), height(b, x, z))]).reverse()] };
  })), side, 'frontCrossfallCase');
  // The source lower face lies on the fender. Two concealed 2 mm laps at
  // real fore/aft receiving positions account for the native sheet faceting.
  for (const z of [2.16, 2.65]) {
    add(P, KIT.box(.65, .006, .022).translate(1.35, 1.2980 + .0131 * z, z), side, 'frontReceivingStrip');
  }
}

function latch(P: TankBuilderPort, side: number, x: number, y: number, z: number,
  width: number, heightM: number, outreach: number): void {
  // Folded lever/receiving seat, not a full bounding block. Small forged
  // curvature is simplified; the open space behind the projecting end stays.
  const profile: [number, number][] = [[x, y], [x + .009, y],
    [x + outreach, y + heightM * .12], [x + outreach - .012, y + heightM],
    [x + outreach - .018, y + heightM], [x + outreach - .006, y + heightM * .20],
    [x, y + .009]];
  add(P, sectionSolid([z - width / 2, z + width / 2].map(q => ({ z: q, ring: profile }))), side, 'foldedLatch');
  add(P, KIT.box(.010, heightM + .006, width * .50).translate(x - .002,
    y + heightM / 2, z), side, 'latchReceivingPlate');
}

export function addChieftain10XFenderCases(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    rearCase(P, side); rearReceivingShoulder(P, side); middleCase(P, side); frontCase(P, side);
    for (const [z, y] of [[-2.636, 1.49380], [-1.4272, 1.50462]]) latch(P, side, 1.6925, y, z, .0586, .076, .0415);
    for (const [z, y] of [[-2.9322, 1.53553], [-2.34446, 1.54105], [-1.75906, 1.54724], [-1.14593, 1.55305]]) {
      latch(P, side, 1.6925, y, z, .030, .0652, .0271);
    }
    latch(P, side, 1.6740, 1.46445, 1.30361, .0586, .06655, .0447);
    latch(P, side, 1.68725, 1.38768, 2.42562, .0586, .06656, .04498);
  }
}
