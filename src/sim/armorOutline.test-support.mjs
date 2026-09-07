import assert from 'node:assert/strict';
import { Vector3 } from 'three';

/** Bounds are acceleration data only; malformed or inward bounds are rejected. */
export function assertArmorTraceBounds(vertices, bounds, label) {
  if (bounds === undefined) return;
  for (const side of ['min', 'max']) assert.ok(Array.isArray(bounds?.[side])
    && bounds[side].length === 3 && bounds[side].every(Number.isFinite),
  `${label}: finite 3D trace bounds`);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(bounds.min[axis] <= bounds.max[axis], `${label}: ordered trace bounds`);
    assert.ok(vertices.every(point => point[axis] >= bounds.min[axis]
      && point[axis] <= bounds.max[axis]), `${label}: trace bounds contain the complete physical outline`);
  }
}

/** Strict authoring validation for the opt-in planar convex trace contract. */
export function assertConvexArmorOutline(vertices, label, openEdges = []) {
  assert.ok(Array.isArray(vertices) && vertices.length >= 3 && vertices.length <= 128,
    `${label}: bounded convex outline`);
  assert.ok(vertices.every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)),
    `${label}: finite 3D outline`);
  assert.ok(Array.isArray(openEdges) && new Set(openEdges).size === openEdges.length
    && openEdges.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length),
  `${label}: unique valid half-open boundary indices`);
  const points = vertices.map(v => new Vector3(...v));
  const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
  assert.ok(normal.lengthSq() > 1e-16, `${label}: nondegenerate first face`);
  normal.normalize();
  for (const point of points) assert.ok(Math.abs(point.clone().sub(points[0]).dot(normal)) <= 1e-7,
    `${label}: every vertex lies on the same plane`);
  for (let i = 0; i < points.length; i++) {
    const edge = points[(i + 1) % points.length].clone().sub(points[i]);
    assert.ok(edge.lengthSq() > 1e-16, `${label}: no duplicate adjacent vertices`);
    for (const point of points) assert.ok(edge.clone().cross(point.clone().sub(points[i])).dot(normal) >= -1e-9,
      `${label}: convex ordered boundary, not a concavity or crossing`);
  }
}
