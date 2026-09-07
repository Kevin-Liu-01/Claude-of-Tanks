// Bounded source corrections: an oblique cloth roll, its actual rear case,
// and the inclined inner-fender web missing from the first supplied draft.
// All surfaces are original solids parameterized by independently measured
// planes/dimensions; no supplied vertices, topology or contour arrays are used.
import * as THREE from 'three';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function chieftain5SourceClothRoll(): THREE.BufferGeometry {
  // The source's 399 mm global X bound includes a ~170 mm/m oblique axis.
  // Its actual transverse body is only 185–200 mm thick, with folded ends.
  const rows = [[-1.679709, 1.516, 1.572, 2.149, 2.158],
    [-1.65, 1.460558, 1.629405, 2.061586, 2.196633],
    [-1.60, 1.464747, 1.658270, 1.883874, 2.230890],
    [-1.55, 1.471176, 1.671230, 1.899325, 2.245889],
    [-1.10, 1.550317, 1.74119, 1.9062, 2.2409],
    [-.60, 1.631221, 1.819498, 1.886012, 2.245137],
    [-.47, 1.6600, 1.859422, 1.866144, 2.247977],
    [-.40, 1.674857, 1.820140, 2.025155, 2.220082],
    [-.359425, 1.711, 1.736, 2.199, 2.212]];
  return sectionSolid(rows.map(([z, left, right, low, top]): SolidSection => {
    const bevelX = (right - left) * .12, bevelY = (top - low) * .11;
    return { z, ring: [[left + bevelX, low], [right - bevelX, low],
      [right, low + bevelY], [right, top - bevelY], [right - bevelX, top],
      [left + bevelX, top], [left, top - bevelY], [left, low + bevelY]] };
  }));
}

function aftCase(P: TankBuilderPort): void {
  // Object_4 island3265: a real rear-facing 276×304 mm equipment case.
  // A concealed 16 mm root continuation reaches the existing rear skin with
  // 3 mm positive overlap; its visible aft face and all extrema stay fixed.
  const ring: [number, number][] = [[.335673, 1.171494], [.582162, 1.171494],
    [.596503, 1.185835], [.596503, 1.461006], [.582162, 1.475347],
    [.335673, 1.475347], [.320435, 1.461006], [.320435, 1.185835]];
  const g = sectionSolid([-3.6587893963, -3.510].map(z => ({ z, ring })));
  g.userData.chieftain5SourceClosure = 'aftCase';
  P.addEquipment('hullDetail', g);
}

function innerReturn(P: TankBuilderPort, side: number): void {
  // Source inward plane n=[-.982645575,.183001337,.030301549], d=-.627490045.
  // The outward/lower web plane is independently measured; this is a narrow
  // sloping wall, not a full-width filler over the idler. The concealed inboard
  // root overlaps the already closed bow while preserving the exposed planes.
  const upper = (x: number, z: number) => (-.627490045239 + .982645575405 * x
    - .030301549147 * z) / .183001336760;
  const lowerD = .972132725216 * .96 - .234111600867 * .963293655686 - .012236131047 * 3;
  const lower = (x: number, z: number) => (.972132725216 * x
    - .012236131047 * z - lowerD) / .234111600867;
  const rows = [2.369877, 2.73, 3.00, 3.087832];
  const g = sectionSolid(rows.map(z => {
    const yCap = z < 2.92 ? 1.307 : 1.307 - (z - 2.92) * .0762;
    const bend = Math.max(.9115, Math.min(.978, (yCap * .183001336760
      + .627490045239 + .030301549147 * z) / .982645575405));
    const xs = [.911, bend, .978];
    const ring: [number, number][] = [...xs.map((x): [number, number] => [x, lower(x, z)]),
      ...[...xs].reverse().map((x): [number, number] => [x, Math.min(upper(x, z), yCap)])];
    if (side < 0) ring.reverse();
    return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
  }));
  g.userData.chieftain5SourceClosure = 'innerFenderReturn';
  P.add('hull', g);
}

export function addChieftain5XSourceClosure(P: TankBuilderPort): void {
  aftCase(P);
  for (const side of [-1, 1]) innerReturn(P, side);
}
