// Geometric diagnostics, not a vehicle-fidelity or visual acceptance gate.
// Operates on actual triangles from shellPart; callers own source/part scope.
import { Ray, Vector3 } from 'three';
const vertexKey = p => p.map(n => Math.round(n * 1e6)).join(',');

export function shellEdgeTopology(part) {
  const edges = new Map();
  for (const { points } of part.triangles) for (let i = 0; i < 3; i++) {
    const a = vertexKey(points[i]), b = vertexKey(points[(i + 1) % 3]);
    const key = [a, b].sort().join('|'), row = edges.get(key) ?? { count: 0, balance: 0 };
    row.count++; row.balance += a < b ? 1 : -1; edges.set(key, row);
  }
  const values = [...edges.values()];
  return {
    boundary: values.filter(e => e.count === 1).length,
    nonmanifold: values.filter(e => e.count > 2).length,
    inconsistent: values.filter(e => e.count === 2 && e.balance !== 0).length,
  };
}

/** Opposite vertices pierce both face planes and a finite edge crosses the
 * other triangle over a nonzero intersection segment. Coplanar contact, cap-boundary subdivisions and shared
 * vertices are deliberately excluded. Absence of these witnesses is not a
 * proof against all possible self-intersection modes. */
export function properSurfaceCrossings(part, toleranceM = 0.00002) {
  const hits = [], intersection = new Vector3();
  const straddles = (a, b) => {
    const normal = b.triangle.getNormal(new Vector3());
    const distances = a.points.map(p => normal.dot(new Vector3(...p).sub(b.triangle.a)));
    return Math.min(...distances) < -toleranceM && Math.max(...distances) > toleranceM;
  };
  // Sweep broad phase covers every emitted triangle, including large cast
  // shells. There is no triangle-count cutoff that can turn skipped stock
  // into a clean census row.
  const extent=part.bounds.getSize(new Vector3());
  const axis=extent.x>=extent.y&&extent.x>=extent.z?'x':extent.y>=extent.z?'y':'z';
  const order=part.triangles.map((triangle,i)=>({triangle,i})).sort((a,b)=>
    a.triangle.bounds.min[axis]-b.triangle.bounds.min[axis]||a.i-b.i);
  for (let ai=0;ai<order.length;ai++) for(let bi=ai+1;bi<order.length;bi++) {
    const {triangle:a,i}=order[ai],{triangle:b,i:j}=order[bi];
    if(b.bounds.min[axis]>a.bounds.max[axis])break;
    if (!a.bounds.intersectsBox(b.bounds) || a.points.some(p => b.points.some(q => vertexKey(p) === vertexKey(q)))) continue;
    if (!straddles(a, b) || !straddles(b, a)) continue;
    // Two plane-straddling triangles can still touch only at a single
    // vertex-on-edge point (a subdivided cap seam). Their intersection-line
    // intervals must overlap with finite length, not merely share an endpoint.
    const direction = new Vector3().crossVectors(a.triangle.getNormal(new Vector3()),
      b.triangle.getNormal(new Vector3())).normalize();
    const interval = (face, plane) => {
      const normal = plane.triangle.getNormal(new Vector3());
      const distances = face.points.map(p => normal.dot(new Vector3(...p).sub(plane.triangle.a)));
      const values = [];
      for (let k = 0; k < 3; k++) {
        const next = (k + 1) % 3, start = new Vector3(...face.points[k]);
        if (Math.abs(distances[k]) < 1e-12) values.push(start.dot(direction));
        if (distances[k] * distances[next] < 0) values.push(start.lerp(new Vector3(...face.points[next]),
          distances[k] / (distances[k] - distances[next])).dot(direction));
      }
      return [Math.min(...values), Math.max(...values)];
    };
    const ia = interval(a, b), ib = interval(b, a);
    if (Math.min(ia[1], ib[1]) - Math.max(ia[0], ib[0]) <= toleranceM) continue;
    let witness;
    for (const [edgeFace, face] of [[a, b], [b, a]]) {
      for (let k = 0; k < 3; k++) {
        const start = new Vector3(...edgeFace.points[k]);
        const direction = new Vector3(...edgeFace.points[(k + 1) % 3]).sub(start), length = direction.length();
        if (length < toleranceM) continue;
        const ray = new Ray(start, direction.divideScalar(length));
        if (!ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, intersection)) continue;
        const distance = start.distanceTo(intersection);
        if (distance > toleranceM && distance < length - toleranceM) { witness = intersection.toArray(); break; }
      }
      if (witness) break;
    }
    if (witness) hits.push({ triangles: [i, j].sort((a,b)=>a-b), point: witness });
  }
  return hits.sort((a,b)=>a.triangles[0]-b.triangles[0]||a.triangles[1]-b.triangles[1]);
}

/** For an explicitly authored two-triangle panel, a convex ridge must place
 * each triangle's unshared corner behind the other triangle's outward plane.
 * This must not be applied across intentional re-entrant contour edges. */
export function weldedPanelConcavity(a, b) {
  const distances = [];
  for (const [plane, other] of [[a, b], [b, a]]) {
    const normal = plane.triangle.getNormal(new Vector3());
    for (const p of other.points) if (!plane.points.some(q => vertexKey(p) === vertexKey(q)))
      distances.push(normal.dot(new Vector3(...p).sub(plane.triangle.a)));
  }
  return Math.max(0, ...distances);
}
