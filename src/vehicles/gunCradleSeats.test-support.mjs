import assert from 'node:assert/strict';
import * as THREE from 'three';

// A raised open cradle can connect through fixed equipment without extending
// the armored turret shell. Prove two finite 50 mm square receiving columns;
// never union equipment AABBs (an unrelated mast would make that vacuous).
const HALF_SPAN_M = .025;
const MAX_JOIN_GAP_M = .005;
const EPSILON = 1e-6;

function visibleMesh(mesh) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.shadowOnly
    || mesh.userData.authoredShadowProxy || /InteriorFill/.test(mesh.name)) return false;
  for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every(material => material.visible && material.colorWrite && material.opacity > 0);
}

function trianglesInFrame(mesh, inverse) {
  const geometry = mesh.geometry, position = geometry.attributes.position;
  const matrix = inverse.clone().multiply(mesh.matrixWorld), result = [];
  const start = Math.max(0, geometry.drawRange.start);
  const end = Math.min(geometry.index?.count ?? position.count, start + geometry.drawRange.count);
  for (let index = start; index + 2 < end; index += 3) {
    const points = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position,
      geometry.index ? geometry.index.getX(index + offset) : index + offset).applyMatrix4(matrix));
    result.push(new THREE.Triangle(...points));
  }
  return result;
}

function verticalIntervals(triangles, x, z) {
  const ray = new THREE.Ray(new THREE.Vector3(x, -100, z), new THREE.Vector3(0, 1, 0));
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), events = [];
  for (const triangle of triangles) {
    if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, point)) continue;
    triangle.getNormal(normal);
    if (Math.abs(normal.y) > EPSILON) events.push({ y: point.y, delta: normal.y < 0 ? 1 : -1 });
  }
  events.sort((a, b) => a.y - b.y);
  // Shared triangle edges produce duplicate intersections of the same surface.
  const unique = events.filter((event, index) => !events.slice(0, index).some(previous =>
    Math.abs(previous.y - event.y) < EPSILON && previous.delta === event.delta));
  let winding = 0, lower = null;
  const intervals = [];
  for (const event of unique) {
    const next = winding + event.delta;
    assert(next >= 0, 'support ray has consistent outward closed-stock winding');
    if (winding === 0 && next > 0) lower = event.y;
    if (winding > 0 && next === 0) intervals.push([lower, event.y]);
    winding = next;
  }
  assert.equal(winding, 0, 'support ray exits closed stock; an open sheet is not a solid column');
  return intervals;
}

function connectedReach(intervals, seed) {
  let reach = seed;
  for (const [lower, upper] of intervals.sort((a, b) => a[0] - b[0])) {
    if (lower > reach + MAX_JOIN_GAP_M) break;
    if (upper >= seed - EPSILON) reach = Math.max(reach, upper);
  }
  return reach;
}

export function verifyGunCradleSeats(root) {
  root.updateMatrixWorld(true);
  const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
  const declaration = turret?.userData.gunCradleSeats;
  if (!declaration) return null;
  const stations = declaration.stations;
  assert(Array.isArray(stations) && stations.length === 2, 'two declared trunnion receiving stations');
  assert(stations.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite)), 'finite receiving stations');
  assert(stations[0][0] < gun.position.x - .05 && stations[1][0] > gun.position.x + .05,
    'receiving stations straddle the actual pitching axis');
  assert(stations.every(point => Math.abs(point[1] - gun.position.y) < EPSILON
    && Math.abs(point[2] - gun.position.z) < EPSILON), 'receiving stations lie on the actual pitching axis');
  const primary = turret.getObjectByName('turret'), mount = gun.getObjectByName('gunMount');
  assert(visibleMesh(primary) && visibleMesh(mount), 'real visible base and pitching stock');
  const inverse = turret.matrixWorld.clone().invert();
  const primaryTriangles = trianglesInFrame(primary, inverse), moving = trianglesInFrame(mount, inverse), fixed = [];
  turret.traverse(mesh => {
    for (let owner = mesh; owner && owner !== turret; owner = owner.parent) if (owner === gun) return;
    if (visibleMesh(mesh)) fixed.push(trianglesInFrame(mesh, inverse));
  });
  const samples = [];
  for (const [cx, pivotY, cz] of stations) for (const dx of [-HALF_SPAN_M, 0, HALF_SPAN_M]) for (const dz of [-HALF_SPAN_M, 0, HALF_SPAN_M]) {
    const x = cx + dx, z = cz + dz;
    const base = verticalIntervals(primaryTriangles, x, z).filter(interval => interval[1] < pivotY - .10).at(-1);
    assert(base && base[1] - base[0] >= .05, 'finite armored receiving base below each support ray');
    const beam = verticalIntervals(moving, x, z).find(interval => interval[0] <= pivotY && interval[1] >= pivotY);
    assert(beam && beam[1] - beam[0] >= .05, 'finite moving crossbeam surrounds each receiving axis ray');
    const reach = connectedReach(fixed.flatMap(triangles => verticalIntervals(triangles, x, z)), base[1]);
    assert(reach >= pivotY - MAX_JOIN_GAP_M, `continuous fixed support reaches pitching axis at ${x},${z}; reached ${reach}, axis ${pivotY}`);
    samples.push({ x, z, baseTop: base[1], fixedTop: reach, moving: beam });
  }
  return { stations: stations.length, rays: samples.length, maxJoinGapM: MAX_JOIN_GAP_M, samples };
}
