// Source-measured medium exterior forms, authored as original closed equipment
// and folded sheets. Supplied topology/media remain reference-only.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Band = readonly [z: number, inside: number, outside: number, low: number, top: number];

function boxSpan(P: TankBuilderPort, x1: number, x2: number, y1: number, y2: number,
  z1: number, z2: number, bucket = 'hullDetail'): void {
  P.addEquipment(bucket, KIT.box(x2 - x1, y2 - y1, z2 - z1),
    (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
}

function slope(side: number, rows: readonly Band[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, inside, outside, low, top]) => {
    const ring: [number, number][] = [[inside, low], [outside, low],
      [outside, top], [inside, top]];
    if (side < 0) ring.reverse();
    return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
  }));
}

function foreFlap(P: TankBuilderPort, side: number): void {
  // Source central sheet is only about 9 mm deep. Its separate lateral
  // returns fold aft outside the belt; no large transverse box fills that air.
  const contour = [[-3.441, 1.142], [-3.482, 1.062], [-3.5227, .8433],
    [-3.5134, .8433], [-3.473, 1.060], [-3.432, 1.140]];
  const shape = new THREE.Shape(contour.map(([z, y]) => new THREE.Vector2(z, y)));
  const sheet = new THREE.ExtrudeGeometry(shape, { depth: .660, bevelEnabled: false, steps: 1 })
    .rotateY(Math.PI / 2).translate(side < 0 ? -1.620 : .960, 0, 0);
  P.addMudguard(`chieftain5_x_source_front_flap_${side}`, 'hullDark', sheet);
  for (const x of [.919, 1.635]) {
    P.addMudguard(`chieftain5_x_source_flap_return_${side}_${x}`, 'hullDark',
      slope(side, [[3.195, x - .014, x + .014, .802, .841],
        [3.440, x - .014, x + .014, .842, .887],
        [3.521, x - .014, x + .014, .842, .891]]));
  }
}

function upperBins(P: TankBuilderPort, side: number): void {
  for (const [back, front, a, b] of [[.467, 1.6797, 1.566, 1.518],
    [1.7819, 2.4120, 1.5184, 1.3983]]) {
    P.addEquipment('hullDetail', slope(side, [[back, 1.023, 1.588, 1.30594, a],
      [front, 1.023, 1.588, 1.30594, b]]));
    P.addEquipment('hullDetail', slope(side, [[back - .004, 1.017, 1.596, a, a + .016],
      [front + .007, 1.017, 1.596, b, b + .016]]));
    for (const z of [back + .14, front - .15]) P.addEquipment('hullDetail',
      KIT.cylX(.0115, .019, 8), side * 1.606, a - (a - b) * (z - back) / (front - back) - .034, z);
  }
  P.addEquipment('hullDetail', slope(side, [[-3.2725, 1.378, 1.612, 1.355, 1.7138],
    [-1.0344, 1.378, 1.612, 1.355, 1.694]]));
  P.addEquipment('hullDetail', KIT.box(.037, .047, 1.755), side * 1.351, 1.716, -1.506);
  for (const [z, y] of [[-2.9431, 1.667], [-.8708, 1.647]]) {
    P.addEquipment('hullDetail', KIT.cylY(.143, .143, .029, 24), side * 1.118, y, z);
    P.addEquipment('hullDetail', KIT.box(.066, .027, .034), side * 1.118, y + .023, z);
  }
}

function bowLamps(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const center = side * .6870;
    boxSpan(P, center - .175, center + .175, 1.179, 1.197, 2.753, 3.008);
    for (const x of [center - .086, center + .084]) {
      P.addEquipment('hullDetail', KIT.cylZ(.0645, .1031, 20), x, 1.2620, 2.9502);
      P.addEquipment('hullGlass', KIT.cylZ(.0484, .002, 20), x, 1.2616, 2.9940);
    }
    for (const dx of [-.173, 0, .173]) {
      P.addEquipment('hullDetail', KIT.box(.018, .155, .255), center + dx, 1.270, 2.884);
    }
    P.addEquipment('hullDetail', KIT.box(.359, .018, .260), center, 1.345, 2.888);
    P.addEquipment('hullDetail', KIT.cylZ(.036, .148, 16), side * 1.420, 1.3463, 2.8349);
    P.addEquipment('hullGlass', KIT.cylZ(.0296, .004, 16), side * 1.420, 1.3463, 2.9075);
    P.addEquipment('hullDetail', KIT.box(.175, .132, .081), side * .862, 1.042, 3.166);
    P.addEquipment('hullDetail', KIT.torus(.058, .021, 20, 6), side * .862, 1.047, 3.218, Math.PI / 2);
  }
  P.addEquipment('hullDetail', slope(1, [[3.097, -.534, .538, 1.113, 1.270],
    [3.211, -.534, .538, 1.113, 1.225]]));
}

function driver(P: TankBuilderPort): void {
  const hatch = KIT.cylY(.513, .513, .018, 16).scale(1, 1, 1.42).rotateX(.216);
  P.addHatch('hullDetail', hatch, 0, 1.415, 2.085);
  boxSpan(P, -.166, .168, 1.441, 1.468, 1.785, 1.945);
  for (const x of [-.153, .155]) boxSpan(P, x - .012, x + .012, 1.460, 1.555, 1.785, 1.945);
  boxSpan(P, -.166, .168, 1.542, 1.555, 1.785, 1.945);
  boxSpan(P, -.092, .093, 1.474, 1.5345, 1.932, 1.938, 'hullGlass');
  boxSpan(P, -.102, .103, 1.466, 1.541, 1.923, 1.931, 'hullDark');
}

function engineDeck(P: TankBuilderPort): void {
  for (const [x1, x2] of [[-.8932, -.4388], [-.4226, .4235], [.4396, .8941]]) {
    boxSpan(P, x1, x2, 1.674, 1.714, -3.204, -2.500);
    boxSpan(P, x1 + .003, x2 - .003, 1.714, 1.7281, -3.201, -2.501);
  }
  boxSpan(P, -.8564, .8573, 1.6618, 1.6878, -2.4792, -1.0335);
  for (const side of [-1, 1]) {
    const a = side < 0 ? -.8923 : .213, b = side < 0 ? -.2120 : .8932;
    boxSpan(P, a, b, 1.663, 1.6896, -2.136, -.989);
    for (const z of [-1.9858, -1.7805, -1.4588, -1.2535]) {
      P.addEquipment('hullDetail', KIT.box(.0618, .0099, .1156), side * .1806, 1.6828, z);
    }
  }
  boxSpan(P, -.8313, .8322, 1.690, 1.7433, -2.3762, -2.3412);
}

function stern(P: TankBuilderPort): void {
  boxSpan(P, -.7507, .7507, 1.1141, 1.6949, -3.5136, -3.2761);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', slope(side, [[-3.5611, .959, 1.357, 1.2701, 1.6949],
      [-3.2761, .959, 1.357, 1.2701, 1.6949]]));
    P.addEquipment('hullDetail', slope(side, [[-3.5647, .955, 1.360, 1.688, 1.7084],
      [-3.2743, .955, 1.360, 1.688, 1.7084]]));
    P.addMudguard(`chieftain5_x_source_rear_guard_${side}`, 'hullDetail',
      slope(side, [[-3.5754, .862, 1.620, 1.0218, 1.2970],
        [-3.5485, .862, 1.620, 1.0218, 1.2960]]));
    P.addEquipment('hullDetail', KIT.cylZ(.036, .030, 16), side * 1.469, 1.3068, -3.567);
    P.addEquipment('hullGlass', KIT.cylZ(.0296, .002, 16), side * 1.469, 1.3068, -3.5820);
    P.addEquipment('hullDetail', KIT.torus(.089, .022, 20, 6), side * .728, .714, -3.340, Math.PI / 2);
    for (const y of [1.287, 1.480]) P.addEquipment('hullDetail', KIT.cylZ(.065, .233, 18),
      side * .847, y, -3.476, -.42 * side);
  }
  boxSpan(P, -.532, -.228, 1.243, 1.509, -3.5996, -3.5130);
  boxSpan(P, -.112, .138, 1.3552, 1.4637, -3.5718, -3.5618);
  for (const x of [-.116, .140]) P.addEquipment('hullDetail', KIT.box(.016, .2868, .070), x, 1.565, -3.573);
  // Separate source upper receiving ears set the exterior stern envelope.
  for (const x of [-.217, .185]) P.addEquipment('hullDetail', KIT.box(.0072, .0896, .1506), x, 1.6456, -3.5835);
}

export function addChieftain5XSourceHullEquipment(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    foreFlap(P, side);
    upperBins(P, side);
  }
  bowLamps(P);
  driver(P);
  engineDeck(P);
  stern(P);
}
