// Original aft carrier from scalar rear-plane and separate box measurements.
// The narrow rear box does not justify filling the surrounding source air.
import * as THREE from 'three';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];

function rearZ(y: number): number {
  return y <= 1.2558796406
    ? (3.05069600457 + .104557387978 * y) / -.994518854833
    : (3.05091256882 + .104380700789 * y) / -.994537414732;
}

/** The aft cap is inclined, not a constant-Z station. Its two measured
 * planes meet the independently authored transverse carrier contour. */
export function chieftain10ClosedHull(forward: readonly SolidSection[]): THREE.BufferGeometry {
  const aftXY: [number, number][] = [[-.818, .6592097878], [.818, .6592097878],
    [.92321, 1.2558796406], [1.03, 1.2565], [1.43, 1.62688964], [1.40, 1.69688964],
    [-1.40, 1.69688964], [-1.43, 1.62688964], [-1.03, 1.2565], [-.92321, 1.2558796406]];
  const transition: SolidSection = { z: -2.9119048119,
    ring: [[-.818, .539639771], [.818, .539639771], [1.03, .639639771],
      [1.03, 1.259834], [1.43, 1.54488], [1.40, 1.61488], [-1.40, 1.61488],
      [-1.43, 1.54488], [-1.03, 1.259834], [-1.03, .639639771]] };
  const rings: Point[][] = [aftXY.map(([x, y]) => [x, y, rearZ(y)]),
    ...[transition, ...forward].map(s => s.ring.map(([x, y]): Point => [x, y, s.z]))];
  const positions: number[] = [];
  const triangle = (a: Point, b: Point, c: Point) => positions.push(...a, ...b, ...c);
  for (let s = 0; s < rings.length - 1; s++) for (let i = 0; i < 10; i++) {
    const j = (i + 1) % 10;
    triangle(rings[s][i], rings[s][j], rings[s + 1][j]);
    triangle(rings[s][i], rings[s + 1][j], rings[s + 1][i]);
  }
  for (const s of [0, rings.length - 1]) {
    const caps = THREE.ShapeUtils.triangulateShape(rings[s].map(([x, y]) => new THREE.Vector2(x, y)), []);
    if (caps.length !== 8) throw new Error('Mk10 aft closure contour is not triangulatable');
    for (const [a, b, c] of caps) {
      if (s === 0) triangle(rings[s][c], rings[s][b], rings[s][a]);
      else triangle(rings[s][a], rings[s][b], rings[s][c]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = positions.flatMap((_, i) => i % 3 === 0 ? [positions[i], positions[i + 2]] : []);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function boxSection(x: number, z0: number, z1: number, low: number,
  top: (z: number) => number): THREE.BufferGeometry {
  return sectionSolid([z0, z1].map(z => ({ z,
    ring: [[-x, low], [x, low], [x, top(z)], [-x, top(z)]],
  })));
}

export function addChieftain10XRearBox(P: TankBuilderPort): void {
  // Permanent root_7016 enclosure: independently measured six principal
  // faces. The front overlaps the sloping hull, never an invented pedestal.
  P.add('hull', boxSection(.7860299945, -3.5452947617, -3.1907448769,
    1.1033196449, () => 1.6842896938));
  P.addEquipment('hullDetail', boxSection(.771695, -3.5422148705, -3.2508149147,
    1.6815, z => 1.69585370899 + .00030886418 * z));
  // The raised lid has a thin perimeter and actual under-lid clearance.
  // Two folded end walls seat that perimeter on the separate lower cover.
  for (const [z0, z1] of [[-3.539285, -3.524475], [-3.314795, -3.299985]]) {
    P.addEquipment('hullDetail', boxSection(.727955, z0, z1, 1.731479645, () => 1.736089706));
    P.addEquipment('hullDetail', boxSection(.6445, z0, z1, 1.69465, () => 1.732));
  }
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -.727955 : .700,
      x1 = side < 0 ? -.700 : .727955;
    P.addEquipment('hullDetail', sectionSolid([-3.539285, -3.299985].map(z => ({ z,
      ring: [[x0, 1.731479645], [x1, 1.731479645], [x1, 1.736089706], [x0, 1.736089706]],
    }))));
  }
  P.addEquipment('hullDetail', boxSection(.71761, -3.4778152, -3.3097651,
    1.7345798, () => 1.73812985));
}
