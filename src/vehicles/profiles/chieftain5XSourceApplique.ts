// Independent source-specific cheek covers and launcher assemblies. The
// source is visibly warped: these original ruled/rounded surfaces regularize
// small irregularities, without reusing its triangles or copying a contour.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Row = readonly [z: number, left: number, right: number, low: number,
  edgeLeft: number, crown: number, edgeRight: number];

function lobe(rows: readonly Row[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, left, right, low, yl, crown, yr]) => ({ z,
    ring: [[left, low], [right, low], [right, yr],
      [right - (right - left) * .10, yr + (crown - yr) * .68],
      [right - (right - left) * .26, crown],
      [left + (right - left) * .26, crown],
      [left + (right - left) * .10, yl + (crown - yl) * .68], [left, yl]],
  })));
}

function cheekCovers(): THREE.BufferGeometry[] {
  const port: readonly Row[] = [[.26083, -1.065, -.61, 1.925, 2.147, 2.242, 2.207],
    [.50, -1.205, -.530, 1.704, 1.95, 2.219, 2.1958],
    [.80, -1.29026, -.472, 1.70391, 1.83, 2.179, 2.146],
    [1.00, -1.182, -.446, 1.70391, 1.82, 2.109, 2.101],
    [1.20, -1.050, -.453, 1.70391, 1.83, 2.032, 2.019],
    [1.40, -.907, -.433, 1.70391, 1.758, 1.932, 1.927],
    [1.60, -.672, -.382, 1.70391, 1.772, 1.855, 1.841],
    [1.71, -.492, -.355, 1.704, 1.740, 1.790, 1.776]];
  const starboard: readonly Row[] = [[.61488, .380, .913, 2.015, 2.302, 2.323268, 2.222],
    [.80, .310, 1.057, 1.70481, 2.304, 2.317, 2.058],
    [1.00, .246, 1.118163, 1.70481, 2.304, 2.303, 1.889],
    [1.20, .074843, 1.085, 1.70481, 2.294, 2.294, 1.842],
    [1.40, .074843, .922, 1.70481, 2.250, 2.238, 1.849],
    [1.60, .160, .696, 1.70481, 2.193, 2.177, 1.825]];
  const spine: readonly Row[] = [[1.116, -.443, .071258, 2.194, 2.219, 2.337, 2.337],
    [1.30, -.438, .071258, 2.090, 2.174, 2.270, 2.270],
    [1.50, -.409, .071258, 2.060, 2.143, 2.22037, 2.22037],
    [1.60, -.350, .071258, 2.112, 2.146, 2.193, 2.193]];
  const result = [lobe(port), lobe(starboard), lobe(spine)];
  // The two front tips are genuinely thin skins beside the open gun root.
  // No cross-section joins them through the central source notch.
  for (const side of [-1, 1]) result.push(sectionSolid([
    { z: 1.595, ring: [[.158, 2.106], [.402, 2.111], [.402, 2.149], [.158, 2.190]] },
    { z: 1.70, ring: [[.130, 2.113], [.306, 2.062], [.306, 2.103], [.130, 2.153]] },
    { z: 1.80, ring: [[.171, 2.044], [.234, 2.022], [.234, 2.063], [.171, 2.091]] },
    { z: 1.900205, ring: [[.178, 1.887], [.208, 1.886], [.208, 1.930], [.178, 1.930]] },
  ].map(row => ({ z: row.z, ring: (side < 0 ? [...row.ring].reverse() : row.ring)
    .map(([x, y]): [number, number] => [side * x, y - (side < 0 ? .004 : 0)]) }))));
  return result;
}

export const CHIEFTAIN5_SOURCE_SMOKE_BANKS = Object.freeze([
  { center: [-1.2001761, 1.9217159, 1.1248851] as Point, axis: [-.736, .350, .579] as Point },
  { center: [.7842825, 1.9306791, 1.6617824] as Point, axis: [.620, .289, .730] as Point },
]);

// Eight visibly distinct source mouths per side: four upper, three middle,
// one lower. Individual source tubes are warped; the nominal axes and spacing
// below are an explicitly regularized first construction, not a claimed rig.
export function chieftain5SourceSmokeMouths(): { center: THREE.Vector3; axis: THREE.Vector3 }[] {
  const mouths: { center: THREE.Vector3; axis: THREE.Vector3 }[] = [];
  for (const [side, bank] of CHIEFTAIN5_SOURCE_SMOKE_BANKS.entries()) {
    const axis = new THREE.Vector3(...bank.axis).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
    const v = axis.clone().cross(u).normalize();
    for (const [dx, dy] of [[-.126, .066], [-.042, .076], [.042, .086], [.126, .096],
      [-.042, -.006], [.042, .004], [.126, .014], [.042, -.083]]) {
      const center = new THREE.Vector3(...bank.center).addScaledVector(u, side ? -dx : dx)
        .addScaledVector(v, dy).addScaledVector(axis, .086);
      mouths.push({ center, axis });
    }
  }
  return mouths;
}

function smoke(P: TankBuilderPort, pivot: Point): void {
  for (const { center, axis } of chieftain5SourceSmokeMouths()) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    const body = new THREE.LatheGeometry([[.030, -.184], [.040, -.184],
      [.040, 0], [.030, 0], [.030, -.184]].map(([r, z]) => new THREE.Vector2(r, z)),
    20).rotateX(Math.PI / 2).applyQuaternion(q);
    const local = center.clone().sub(new THREE.Vector3(...pivot));
    P.addEquipment('turretDetail', body, ...local.toArray());
    P.addEquipment('turretDark', new THREE.CircleGeometry(.030, 20).applyQuaternion(q),
      ...local.clone().addScaledVector(axis, -.179).toArray());
    P.addEquipment('turretDetail', KIT.cylZ(.041, .012, 20).applyQuaternion(q),
      ...local.clone().addScaledVector(axis, -.188).toArray());
  }
  // Folded source carriers are behind the stocks. Their broad faces are
  // inclined with the bank, not world-axis boxes crossing the real bores.
  for (const bank of CHIEFTAIN5_SOURCE_SMOKE_BANKS) {
    const axis = new THREE.Vector3(...bank.axis).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
    const v = axis.clone().cross(u).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, axis));
    const carrier = sectionSolid([-.136, -.103].map(z => ({ z,
      ring: [[-.055, -.120], [.055, -.120], [.171, .010], [.171, .132],
        [-.171, .132], [-.171, .010]],
    }))).applyQuaternion(q);
    const center = new THREE.Vector3(...bank.center).sub(new THREE.Vector3(...pivot));
    P.addEquipment('turretDetail', carrier, ...center.toArray());
    P.addEquipment('turretDetail', KIT.box(.100, .155, .058).applyQuaternion(q),
      ...center.clone().addScaledVector(axis, -.155).addScaledVector(v, -.036).toArray());
  }
}

export function addChieftain5XSourceApplique(P: TankBuilderPort, pivot: Point): void {
  for (const g of cheekCovers()) P.addExternalArmor('turret',
    g.translate(-pivot[0], -pivot[1], -pivot[2]));
  smoke(P, pivot);
}
