// The rendered paint of a vehicle's marking draws, read through the footprints the factory records on each draw
// (userData.markingFootprints: the seat's unit square in the draw's frame, carried into a static batch's frame when
// low detail folds the markings together). 2026-10-23 (lane 243): markings are films cut to the armour under their
// seats (markingFilm.ts), not four-corner quads, so a receipt can no longer recover a footprint from a quad's corners.
// It reads the recorded footprint and holds the actual buffer to it: every painted triangle lies inside one
// footprint, and the paint covers at least `minCoverage` of each.
import assert from 'node:assert/strict';
import * as THREE from 'three';

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const centroid = new THREE.Vector3(), cross = new THREE.Vector3(), offset = new THREE.Vector3();

/** World footprints ({ center, u, v, normal }) of one marking draw and the share of each its paint covers. */
export function renderedMarkingFootprints(mesh, { minCoverage = 0, label = mesh.name } = {}) {
  mesh.updateWorldMatrix(true, false);
  const records = mesh.userData.markingFootprints;
  assert.ok(Array.isArray(records) && records.length > 0, `${label}: the draw records its marking footprints`);
  const footprints = records.map(({ center, u, v }) => {
    const origin = new THREE.Vector3().fromArray(center).applyMatrix4(mesh.matrixWorld);
    const along = (axis) => new THREE.Vector3().fromArray(center).add(new THREE.Vector3().fromArray(axis))
      .applyMatrix4(mesh.matrixWorld).sub(origin);
    const footprintU = along(u), footprintV = along(v);
    return { center: origin, u: footprintU, v: footprintV,
      normal: new THREE.Vector3().crossVectors(footprintU, footprintV).normalize(), covered: 0 };
  });
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    cross.subVectors(b, a).cross(offset.subVectors(c, a));
    if (cross.lengthSq() < 1e-16) continue;
    const owner = footprints.find((footprint) => {
      offset.subVectors(centroid, footprint.center);
      const s = offset.dot(footprint.u) / footprint.u.lengthSq(), t = offset.dot(footprint.v) / footprint.v.lengthSq();
      return Math.abs(s) <= 0.5 + 1e-3 && Math.abs(t) <= 0.5 + 1e-3;
    });
    assert.ok(owner, `${label}: painted triangle ${i / 3} lies inside its marking's footprint`);
    // its area as seen along the footprint's normal
    owner.covered += Math.abs(cross.dot(owner.normal)) / 2;
  }
  for (const [n, footprint] of footprints.entries()) {
    footprint.coverage = footprint.covered / footprint.u.clone().cross(footprint.v).length();
    assert.ok(footprint.coverage >= minCoverage,
      `${label}: footprint ${n} carries paint over ${(100 * footprint.coverage).toFixed(1)} % of it (>= ${100 * minCoverage} %)`);
  }
  return footprints;
}
