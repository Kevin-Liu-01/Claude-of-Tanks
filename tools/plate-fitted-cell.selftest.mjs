// tools/plate-fitted-cell.mjs (247): a plate-fitted collision cell lies on its slice's own plates, holds the slice's
// hull to the tolerance, carries no sliver triangle, and keeps a mirrored slice mirrored.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { plateFittedCell } from './plate-fitted-cell.mjs';

const TOLERANCE_M = 0.015 + 0.002; // the fit's tolerance and its 2 mm weld

/** A slice's point cloud: points over each triangle of a closed mesh (corners, edge thirds and centroid). */
function cloudOf(triangles) {
  const unique = new Map();
  const add = (p) => unique.set(p.map((v) => Math.round(v * 1e4)).join(','), new THREE.Vector3(...p));
  for (const [a, b, c] of triangles) {
    for (const p of [a, b, c]) add(p);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) for (const t of [1 / 3, 2 / 3]) add(u.map((x, i) => x + (v[i] - x) * t));
    add([0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3));
  }
  return [...unique.values()];
}

/** The triangles of a convex point set's hull (the "true" slice surface the cell is fitted to). */
function hullOf(points) {
  const hull = new ConvexHull().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  return hull.faces.map((face) => {
    const out = [];
    let edge = face.edge;
    do { out.push(edge.head().point.toArray()); edge = edge.next; } while (edge !== face.edge);
    return out;
  });
}

function planesOf(cell) {
  const mean = [0, 1, 2].map((a) => cell.vertices.reduce((s, v) => s + v[a], 0) / cell.vertices.length);
  return cell.faces.map(([i, j, k]) => {
    const [a, b, c] = [i, j, k].map((n) => cell.vertices[n]);
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    const area = n.length() / 2;
    n.normalize();
    let d = n.dot(new THREE.Vector3(...a));
    if (n.dot(new THREE.Vector3(...mean)) > d) { n.negate(); d = -d; }
    return { n, d, area };
  });
}

function check(name, cell, hullTriangles) {
  assert.ok(cell, `${name}: a cell`);
  const planes = planesOf(cell);
  const hullPlanes = hullTriangles.map(([a, b, c]) => {
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize();
    return { n, d: n.dot(new THREE.Vector3(...a)) };
  });
  // every face on one of the slice's plates (a hull plane) or on its box's supporting planes (a slice boundary, or the
  // box side a curved slice touches along an edge): no facet at an angle the armour does not have
  const box = new THREE.Box3().setFromPoints(hullTriangles.flat().map((p) => new THREE.Vector3(...p)));
  const boxPlanes = [0, 1, 2].flatMap((axis) => [-1, 1].map((sign) => {
    const n = new THREE.Vector3(); n.setComponent(axis, sign);
    return { n, d: sign * (sign > 0 ? box.max : box.min).getComponent(axis) };
  }));
  for (const plane of planes) {
    assert.ok([...hullPlanes, ...boxPlanes].some((h) => h.n.dot(plane.n) > Math.cos(Math.PI / 180) && Math.abs(h.d - plane.d) < 0.004),
      `${name}: a face [${plane.n.toArray().map((v) => v.toFixed(3))}] lies on no plate of the slice`);
  }
  // no sliver: every face's half-plane holds all of the cell's own corners (the region traceTank tests)
  for (const plane of planes) {
    for (const v of cell.vertices) assert.ok(plane.n.dot(new THREE.Vector3(...v)) - plane.d <= 0.003, `${name}: a face cuts its own cell`);
  }
  // the cell holds the slice's hull, and stands outside it by no more than the tolerance
  for (const tri of hullTriangles) {
    for (const p of tri) {
      for (const plane of planes) assert.ok(plane.n.dot(new THREE.Vector3(...p)) - plane.d <= 0.003, `${name}: the hull leaves the cell`);
    }
  }
  for (const v of cell.vertices) {
    const out = Math.max(...hullPlanes.map((h) => h.n.dot(new THREE.Vector3(...v)) - h.d));
    assert.ok(out <= TOLERANCE_M, `${name}: a corner stands ${out.toFixed(4)} m outside the slice's hull`);
  }
  return planes;
}

// 1. A box with 3 mm edge chamfers (under the tolerance): the box itself, six plates, twelve triangles.
{
  const c = 0.003;
  const pts = [];
  for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [0, 0.6]) {
    pts.push([x - Math.sign(x) * c, y, z], [x, y - (y ? c : -c), z], [x, y, z ? z - c : c]);
  }
  const hull = hullOf(pts);
  const cell = plateFittedCell(cloudOf(hull));
  const planes = check('chamfered box', cell, hull);
  assert.equal(cell.vertices.length, 8, 'the chamfers under the tolerance fold into the box corners');
  assert.equal(new Set(planes.map((p) => p.n.toArray().map((v) => Math.round(v * 100)).join(','))).size, 6);
}

// 2. A turret cheek: a slanted front plate, 6 cm cheek bevels at the corners and a sloped roof, mirrored in x.
{
  const pts = [];
  for (const s of [-1, 1]) {
    pts.push(
      [s * 1.4, 0, 0], [s * 1.4, 0.7, 0], // rear corners
      [s * 1.4, 0, 0.9], [s * 1.34, 0, 0.96], [s * 1.0, 0, 1.3], // bevelled cheek, foot
      [s * 1.3, 0.55, 0.85], [s * 1.25, 0.6, 0.92], [s * 0.9, 0.62, 1.12], // cheek top, under the roof slope
      [s * 0.6, 0.78, 0.4], // roof
    );
  }
  const hull = hullOf(pts);
  const cell = plateFittedCell(cloudOf(hull));
  const planes = check('cheek', cell, hull);
  // the slanted front plate is one face plane, exactly
  const front = hullOf(pts).map(([a, b, c]) => new THREE.Vector3(...b).sub(new THREE.Vector3(...a))
    .cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize()).filter((n) => n.z > 0.5);
  assert.ok(front.length && front.every((n) => planes.some((p) => p.n.dot(n) > Math.cos(Math.PI / 180))),
    'every forward-facing plate of the cheek is a face of the cell');
  // mirrored slice, mirrored cell
  const key = (v) => v.map((x) => Math.round(x * 1000)).join(',');
  const corners = new Set(cell.vertices.map(key));
  for (const v of cell.vertices) assert.ok(corners.has(key([-v[0], v[1], v[2]])), `the mirror of ${v} is a corner`);
}

// 3. A cylinder-like slice of 64 facets: the cell takes no more than its cut budget and still holds the hull.
{
  const pts = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    for (const z of [0, 0.5]) pts.push([Math.cos(a), Math.sin(a) * 0.6 + 0.6, z]);
  }
  const hull = hullOf(pts);
  const cell = plateFittedCell(cloudOf(hull));
  check('64-facet drum', cell, hull);
  assert.ok(planesOf(cell).length <= 2 * (6 + 40), 'at most the box and 40 cuts');
}

assert.equal(plateFittedCell([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]), null,
  'a slice of three points has no cell');
console.log('plate-fitted-cell.selftest: cells lie on their plates, hold the hull within 1.7 cm, carry no sliver and keep mirrors');
