// A combat collision cell fitted to the armour's own plates (247; tools/gen-combat-anatomy.mjs PLATE_FIT_IDS).
//
// The generator's support hull joins a slice's 26 extreme vertices, so its facets cross the real plates at angles no
// plate has, and each facet takes its own penetration result (the 243 critics: "K2's turret cheek reads as a
// red/green/orange patchwork"). A plate-fitted cell is cut from the slice's box by the slice's own convex-hull planes:
// while a corner stands more than PLATE_FIT_TOLERANCE_M outside the slice's hull, the hull plane that corner violates
// most cuts it off (at most PLATE_FIT_MAX_CUTS cuts). Its faces lie on the armour's plates and it holds the slice's hull
// to the tolerance (the support hull lies inside it).
// First-party tooling: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

const PLATE_FIT_TOLERANCE_M = 0.015;
const PLATE_FIT_MAX_CUTS = 40;
const PLATE_FIT_SAME_NORMAL_COS = Math.cos(0.5 * Math.PI / 180);
const PLATE_FIT_EPSILON_M = 1e-6;
// The written cell: corners within 2 mm are one, a corner on a straight run of its face's edge goes, and a triangle
// whose normal leaves its face's plane by more than a degree goes (the runtime takes each triangle's own normal: a
// 1.5e-6 m² sliver read a side plate's plane 0.8 m inside the cell).
const PLATE_FIT_WELD_M = 0.002;
const PLATE_FIT_STRAIGHT_SIN = 0.01;
const PLATE_FIT_FACE_COS = Math.cos(1 * Math.PI / 180);

const round = (value) => Number(value.toFixed(4));

function pointBounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min: min.map(round), max: max.map(round) };
}

/** The faces of a convex polytope ({ points in order, normal }) cut by the half-space n·p <= c. */
function cutPolytope(faces, normal, constant) {
  const side = (point) => point[0] * normal[0] + point[1] * normal[1] + point[2] * normal[2] - constant;
  const kept = [];
  const cap = [];
  for (const face of faces) {
    const polygon = face.points;
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const sc = side(current);
      const sn = side(next);
      if (sc <= PLATE_FIT_EPSILON_M) out.push(current);
      if ((sc < -PLATE_FIT_EPSILON_M && sn > PLATE_FIT_EPSILON_M) || (sc > PLATE_FIT_EPSILON_M && sn < -PLATE_FIT_EPSILON_M)) {
        const t = sc / (sc - sn);
        const point = [0, 1, 2].map((axis) => current[axis] + (next[axis] - current[axis]) * t);
        out.push(point);
        cap.push(point);
      } else if (Math.abs(sc) <= PLATE_FIT_EPSILON_M) {
        cap.push(current);
      }
    }
    if (out.length >= 3) kept.push({ points: out, normal: face.normal });
  }
  // the cap: the cut's corners round their centroid in the plane
  const unique = [...new Map(cap.map((point) => [point.map((v) => Math.round(v * 1e6)).join(','), point])).values()];
  if (unique.length >= 3) {
    const centre = [0, 1, 2].map((axis) => unique.reduce((sum, point) => sum + point[axis], 0) / unique.length);
    const reference = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = new THREE.Vector3(...reference).cross(new THREE.Vector3(...normal)).normalize();
    const v = new THREE.Vector3(...normal).cross(u);
    const angle = (point) => {
      const d = [0, 1, 2].map((axis) => point[axis] - centre[axis]);
      return Math.atan2(d[0] * v.x + d[1] * v.y + d[2] * v.z, d[0] * u.x + d[1] * u.y + d[2] * u.z);
    };
    kept.push({ points: unique.sort((a, b) => angle(a) - angle(b)), normal });
  }
  return kept;
}

/** The cell's vertices and triangles from its polytope faces: welded corners, straight runs dropped, true-normal triangles. */
function plateFittedMesh(faces) {
  const vertices = [];
  const indexOf = (point) => {
    const rounded = point.map(round);
    let index = vertices.findIndex((vertex) => Math.hypot(vertex[0] - rounded[0], vertex[1] - rounded[1], vertex[2] - rounded[2]) <= PLATE_FIT_WELD_M);
    if (index < 0) { index = vertices.length; vertices.push(rounded); }
    return index;
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const length = (a) => Math.hypot(a[0], a[1], a[2]);
  const triangles = [];
  for (const face of faces) {
    let ring = face.points.map(indexOf).filter((index, i, all) => index !== all[(i + all.length - 1) % all.length]);
    for (let changed = true; changed && ring.length >= 3;) {
      changed = false;
      for (let i = 0; i < ring.length; i++) {
        const previous = vertices[ring[(i + ring.length - 1) % ring.length]];
        const current = vertices[ring[i]];
        const next = vertices[ring[(i + 1) % ring.length]];
        const a = sub(current, previous), b = sub(next, current);
        if (length(cross(a, b)) <= PLATE_FIT_STRAIGHT_SIN * length(a) * length(b)) { ring.splice(i, 1); changed = true; break; }
      }
    }
    for (let i = 1; i + 1 < ring.length; i++) {
      const [a, b, c] = [ring[0], ring[i], ring[i + 1]].map((index) => vertices[index]);
      const n = cross(sub(b, a), sub(c, a));
      const size = length(n);
      if (!(size > 1e-6)) continue;
      if (Math.abs(n[0] * face.normal[0] + n[1] * face.normal[1] + n[2] * face.normal[2]) / size < PLATE_FIT_FACE_COS) continue;
      triangles.push([ring[0], ring[i], ring[i + 1]]);
    }
  }
  // only the corners a triangle uses
  const used = [...new Set(triangles.flat())].sort((a, b) => a - b);
  const remap = new Map(used.map((index, next) => [index, next]));
  return { vertices: used.map((index) => vertices[index]), faces: triangles.map((t) => t.map((index) => remap.get(index))) };
}

/**
 * The plate-fitted cell of a slice's de-duplicated point cloud (THREE.Vector3[]): { min, max, vertices, faces } in the
 * generator's cell format (vertices rounded to 0.1 mm, faces as vertex-index triangles), or null for a degenerate slice.
 */
export function plateFittedCell(cloud) {
  if (cloud.length < 4) return null;
  let hull;
  try {
    hull = new ConvexHull().setFromPoints(cloud);
  } catch {
    return null;
  }
  if (!hull.faces.length) return null;
  const hullVertices = hull.vertices.map((vertex) => vertex.point);
  const support = (normal) => {
    let best = -Infinity;
    for (const point of hullVertices) best = Math.max(best, point.x * normal[0] + point.y * normal[1] + point.z * normal[2]);
    return best;
  };
  // the slice's plates: its hull's face planes, near-equal normals as one, each at the hull's own support
  const plates = [];
  for (const face of hull.faces) {
    const normal = face.normal.toArray();
    const same = plates.find((plate) => plate.normal[0] * normal[0] + plate.normal[1] * normal[1]
      + plate.normal[2] * normal[2] > PLATE_FIT_SAME_NORMAL_COS);
    if (same) { same.area += face.area; continue; }
    plates.push({ normal, area: face.area });
  }
  for (const plate of plates) plate.constant = support(plate.normal);
  const { min, max } = pointBounds(cloud.map((point) => point.toArray()));
  let polytope = [
    { normal: [-1, 0, 0], points: [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]] },
    { normal: [1, 0, 0], points: [[max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]], [max[0], min[1], max[2]]] },
    { normal: [0, -1, 0], points: [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], min[1], max[2]], [min[0], min[1], max[2]]] },
    { normal: [0, 1, 0], points: [[min[0], max[1], min[2]], [min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]]] },
    { normal: [0, 0, -1], points: [[min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]], [max[0], min[1], min[2]]] },
    { normal: [0, 0, 1], points: [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]] },
  ];
  for (let cut = 0; cut < PLATE_FIT_MAX_CUTS; cut++) {
    let worst = PLATE_FIT_TOLERANCE_M;
    let plane = null;
    for (const face of polytope) {
      for (const point of face.points) {
        for (const plate of plates) {
          const excess = point[0] * plate.normal[0] + point[1] * plate.normal[1] + point[2] * plate.normal[2] - plate.constant;
          if (excess > worst) { worst = excess; plane = plate; }
        }
      }
    }
    if (!plane) break;
    polytope = cutPolytope(polytope, plane.normal, plane.constant);
  }
  const { vertices, faces } = plateFittedMesh(polytope);
  if (vertices.length < 4 || faces.length < 4) return null;
  return { ...pointBounds(vertices), vertices, faces };
}
