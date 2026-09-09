// Original native service covers derived from owner14's sparse planes and
// measured catch envelopes. These are hull equipment, not additional armor.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type XZ = readonly [x: number, z: number];
const DECK_Y = 1.697365;
const COVER_Y = 1.709765;

function emit(P: TankBuilderPort, geometry: THREE.BufferGeometry, part: string): void {
  geometry.userData.abramsSourceXHullDeck = part;
  P.addEquipment('hullDetail', geometry);
}

function flatStock(shape: THREE.Shape, bottom: number, top: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth: top - bottom, bevelEnabled: false, curveSegments: 16,
  }).rotateX(Math.PI / 2).translate(0, top, 0);
}

function outline(points: readonly XZ[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  for (const point of points.slice(1)) shape.lineTo(...point);
  shape.closePath();
  return shape;
}

function aftOutline(pocket: boolean): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(1.1118, -3.760665);
  shape.lineTo(1.7585, -3.760665);
  shape.lineTo(1.7585, -3.117275);
  if (pocket) {
    // Actual shallow, open-ended catch seat: 5.25 mm below the cover face.
    // The rounded end is an analytic 46.3 mm radius, not source triangles.
    shape.lineTo(1.48142, -3.117275);
    shape.lineTo(1.48142, -3.146285);
    shape.absarc(1.43512, -3.146285, .0463, 0, -Math.PI, true);
    shape.lineTo(1.38882, -3.117275);
  }
  shape.lineTo(1.1118, -3.117275);
  // One small real inward receiving ear; not a mirrored second cover.
  shape.lineTo(1.1118, -3.463545);
  shape.lineTo(1.0958, -3.475685);
  shape.lineTo(1.0958, -3.513185);
  shape.lineTo(1.1118, -3.525325);
  shape.closePath();
  return shape;
}

function serviceCovers(P: TankBuilderPort): void {
  emit(P, flatStock(outline([[1.1118, -3.112665], [1.7585, -3.112665],
    [1.7585, -2.707415], [1.1118, -2.707415]]), DECK_Y, COVER_Y), 'middle-cover');
  emit(P, flatStock(aftOutline(false), DECK_Y, 1.704515), 'aft-cover-base');
  emit(P, flatStock(aftOutline(true), 1.704515, COVER_Y), 'aft-cover-rim');
}

function measuredBox(P: TankBuilderPort, part: string, min: readonly number[], max: readonly number[]): void {
  const geometry = KIT.box(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  geometry.translate((max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2);
  emit(P, geometry, part);
}

function receivingLeaves(P: TankBuilderPort): void {
  for (const [i, x0, x1] of [[0, 1.64279, 1.66709], [1, 1.20401, 1.22837]]) {
    measuredBox(P, `hinge-leaf-${i}`, [x0, COVER_Y, -2.738235], [x1, 1.716255, -2.672335]);
  }
  for (const [i, z0, z1] of [[0, -2.912045, -2.796615], [1, -3.054895, -2.939475]]) {
    measuredBox(P, `inner-leaf-${i}`, [1.08711, 1.707065, z0], [1.13649, 1.720855, z1]);
  }
}

function catchLoop(z: number, direction: number): THREE.BufferGeometry {
  // Source has a laid-down, tapered bent-wire loop, not a proud circular knob.
  // Its local bend radii are approximated; the open middle and thin stock remain.
  const points: readonly XZ[] = [[-.051, -.031], [.051, -.031], [.063, -.014],
    [.048, .022], [.034, .031], [-.034, .031], [-.048, .022], [-.063, -.014]];
  const vertices = points.map(([x, dz]) =>
    new THREE.Vector3(1.43512 + x, 1.71630 + dz * .052, z + dz * direction));
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const c = vertices[(i + 2) % vertices.length];
    const start = a.clone().lerp(b, .12), end = b.clone().lerp(a, .12);
    path.add(new THREE.LineCurve3(start, end));
    path.add(new THREE.QuadraticBezierCurve3(end, b, b.clone().lerp(c, .12)));
  }
  return new THREE.TubeGeometry(path, 64, .00475, 10, true);
}

function catches(P: TankBuilderPort): void {
  for (const [i, z, direction] of [[0, -2.79935, 1], [1, -3.02079, -1]]) {
    const receivingZ = z + direction * .02986;
    // Separate measured receiver overlaps the cover by 0.44 mm, and the
    // loop end overlaps this receiver. No support fills the loop's middle.
    measuredBox(P, `catch-receiver-${i}`, [1.40136, 1.709325, receivingZ - .010255],
      [1.46894, 1.727925, receivingZ + .010255]);
    emit(P, catchLoop(z, direction), `catch-loop-${i}`);
  }
}

export function addAbramsSourceXHullDeck(P: TankBuilderPort): void {
  serviceCovers(P);
  receivingLeaves(P);
  catches(P);
}

