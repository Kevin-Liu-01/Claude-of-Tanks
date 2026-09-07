// First-party folded Galix carrier interpreted from Army VIRIN
// 180604-A-OY408-399. Dimensions and concealed support roots are construction
// estimates, not measurements from the supplied TRIPO mesh.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Pair = readonly [number, number];
type Pivot = readonly [number, number, number];

function frame(side: number): THREE.Matrix4 {
  const normal = new THREE.Vector3(side * .953, .28, .11).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  return new THREE.Matrix4().makeBasis(u, v, normal).setPosition(side * 1.56, 2.23, -1.18);
}

function add(P: TankBuilderPort, pivot: Pivot, matrix: THREE.Matrix4,
  geometry: THREE.BufferGeometry, bucket = 'turretDetail'): void {
  P.addEquipment(bucket, geometry.applyMatrix4(matrix), -pivot[0], -pivot[1], -pivot[2]);
}

function piercedSkin(): THREE.BufferGeometry {
  const skin = new THREE.Shape();
  skin.moveTo(-.30, -.235); skin.lineTo(.30, -.235);
  skin.lineTo(.26, .235); skin.lineTo(-.26, .235); skin.closePath();
  for (const u of [-.135, .135]) for (const v of [-.105, .105]) {
    const opening = new THREE.Path();
    opening.absarc(u, v, .052, 0, Math.PI * 2, true);
    skin.holes.push(opening);
  }
  return new THREE.ExtrudeGeometry(skin, { depth: .010, steps: 1,
    bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -.010);
}

function foldedEdge(front: readonly Pair[], matrix: THREE.Matrix4, side: number): THREE.BufferGeometry {
  const points = front.map(([u, v]) => new THREE.Vector3(u, v, -.005).applyMatrix4(matrix));
  // Only the perimeter folds return to the actual permanent flank. The
  // interior remains empty; there is no solid wedge behind the pierced skin.
  points.push(...points.map(p => new THREE.Vector3(side * 1.335, p.y, p.z)));
  const triangles = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
  const xyz: number[] = [], uv: number[] = [];
  for (let i = 0; i < triangles.length; i++) {
    xyz.push(...points[triangles[i]].toArray());
    uv.push(i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function stocks(P: TankBuilderPort, pivot: Pivot, matrix: THREE.Matrix4): void {
  for (const u of [-.135, .135]) for (const v of [-.105, .105]) {
    const points = [[.054, -.110], [.054, .008], [.041, .008],
      [.041, -.100], [0, -.100], [0, -.110], [.054, -.110]];
    const tube = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), 32)
      .rotateX(Math.PI / 2).translate(u, v, 0);
    add(P, pivot, matrix, tube);
    add(P, pivot, matrix, KIT.cylZ(.0412, .010, 32).translate(u, v, -.095), 'turretDark');
  }
}

export function addStrv122XGalix(P: TankBuilderPort, pivot: Pivot): void {
  const folds: readonly (readonly Pair[])[] = [
    [[-.30, -.235], [.30, -.235], [.2989, -.222], [-.2989, -.222]],
    [[-.2611, .222], [.2611, .222], [.26, .235], [-.26, .235]],
    [[-.30, -.235], [-.287, -.235], [-.247, .235], [-.26, .235]],
    [[.287, -.235], [.30, -.235], [.26, .235], [.247, .235]],
  ];
  for (const side of [-1, 1]) {
    const matrix = frame(side);
    add(P, pivot, matrix, piercedSkin());
    for (const fold of folds) P.addEquipment('turretDetail', foldedEdge(fold, matrix, side),
      -pivot[0], -pivot[1], -pivot[2]);
    stocks(P, pivot, matrix);
  }
}
