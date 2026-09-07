// Original closed planar primitives from scalar face witnesses of source725.
// Plane intersections are authored here; no source mesh connectivity is used.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { classicTurret } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Face = readonly [number, number, number, number];

function intersection(a: Face, b: Face, c: Face): THREE.Vector3 | null {
  const matrix = new THREE.Matrix3().set(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  if (Math.abs(matrix.determinant()) < 1e-10) return null;
  return new THREE.Vector3(a[3], b[3], c[3]).applyMatrix3(matrix.invert());
}

function closedCell(faces: readonly Face[]): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let a = 0; a < faces.length; a++) for (let b = a + 1; b < faces.length; b++) {
    for (let c = b + 1; c < faces.length; c++) {
      const p = intersection(faces[a], faces[b], faces[c]);
      if (p && faces.every(f => f[0] * p.x + f[1] * p.y + f[2] * p.z <= f[3] + 1e-8)
        && !points.some(q => q.distanceToSquared(p) < 1e-14)) points.push(p);
    }
  }
  if (points.length < 4) throw new Error('Classic folded roof has no closed stock');
  const g = new ConvexGeometry(points), uv: number[] = [];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getZ(i));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function roofCell(P: TankBuilderPort, left: number, right: number, top: number,
  folds: readonly Face[]): void {
  classicTurret(P, 'turretDetail', closedCell([
    [-1, 0, 0, -left], [1, 0, 0, right], [0, -1, 0, -2.14],
    [0, 1, 0, top], [0, 0, -1, 1.95], [0, 0, 1, -.5779], ...folds,
  ]));
}

function foldedCover(P: TankBuilderPort): void {
  // The two aft folds and clipped outer corner are genuine visible surfaces.
  // Retain the existing concealed2.14m lower stock for permanent attachment;
  // the source sheet's2.15785m underside does not become a floating skin.
  roofCell(P, -.2525, .873, 2.3445813656, [
    [-.010879448156, .510612033785, -.859742396629, 2.762627100454],
    [.001795763454, .565362909423, -.824840321446, 2.823901868907],
  ]);
  roofCell(P, .873, 1.09001, 2.3384656906, [
    [.020667883307, .166099342929, -.985892411411, 2.287433993282],
    [.031718221580, .178758729578, -.983381549054, 2.321940576424],
  ]);
  roofCell(P, 1.09001, 1.440751, 2.3384656906, [
    [.525596503424, .153019394500, -.836859235771, 2.521390855641],
    [.556298783850, .260979318069, -.788936916761, 2.716209460000],
    [.952856208935, .303399875180, -.003682503883, 2.029721523312],
    [.943325826302, .331864492687, .001530988309, 2.074295688957],
    [.488539704433, .840222154002, .235277897639, 2.390230730634],
    [.077751184819, 0, .996972794644, -.486813631744],
  ]);
}

function mastBase(P: TankBuilderPort): void {
  // Source856 is a real rectangular support with a37.68mm-deep rear pocket,
  // not a pedestal invented to bridge the newly exposed fold.
  const x = .025177, y = 2.23979644, rz = -.00038354;
  classicTurret(P, 'turretDetail', new THREE.BoxGeometry(.215082, .115, .335472),
    x, y, -1.880320, 0, 0, rz);
  for (const dx of [-.10181, .10181]) classicTurret(P, 'turretDetail',
    new THREE.BoxGeometry(.011462, .115, .037675), x + dx, y - dx * .00038354, -2.066894, 0, 0, rz);
  for (const dy of [-.05175, .05175]) classicTurret(P, 'turretDetail',
    new THREE.BoxGeometry(.19216, .0115, .037675), x + dy * .00038354, y + dy, -2.066894, 0, 0, rz);
}

export function addLeclercClassicXRearRoof(P: TankBuilderPort): void {
  foldedCover(P); mastBase(P);
}
