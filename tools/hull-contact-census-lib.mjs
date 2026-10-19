// Hull contact census: every piece of hull-owned stock must touch the hull, and the belly between the tracks must
// be closed (owner 2026-10-19: "the flaps often hang off many tanks ... and the empty gaps in hulls are annoying.
// check for both on all tanks").
//
// Floating stock. Two parts touch when a vertex of one lies inside the other's closed solid or within CONTACT_TOL_M
// of its surface, or an edge of one crosses a triangle of the other. This is real geometry, not bounding boxes: one
// lofted hull's box swallows every fitting on it, which is how flaps 0.6 m under an overhang passed the factory's
// AABB mudguard audit. Parts that never reach the largest part's component float; each island reports its clearance
// to that component.
//
// Belly pits. Rays rise from below on a 40 mm grid between the track bands' inner faces, against the structural shell
// only (hull and external-armour stock). A cell whose first hit stands BELLY_PIT_DEPTH_M above the lowest belly within
// BELLY_PIT_REACH_M both fore and aft of it, or that sees through the shell with belly both sides, is a pit: an
// opening into the hull seen from under the tank. A cell seeing through every hull part, with stock fore and aft of it,
// is one too, whatever bounds it.
//
// Reads only. The census runs in Node on the factory's default high-quality build.
import * as THREE from 'three';
import { createTank } from '../src/vehicles/tankFactory.ts';

export const CONTACT_TOL_M = 0.002;
/** A floating island whose clearance to the hull is under this reads as a hairline overlay, not a visible float. */
export const VISIBLE_FLOAT_GAP_M = 0.004;
export const BELLY_PIT_DEPTH_M = 0.15;
export const BELLY_PIT_REACH_M = 1.2;
export const BELLY_PIT_MIN_AREA_M2 = 0.02;
const BELLY_STEP_M = 0.04;
const CELL_M = 0.08;

/** Triangle soup (9 numbers a triangle) of a geometry, optionally transformed. */
export function triangleSoup(geometry, matrix = null) {
  const position = geometry.attributes.position, index = geometry.index;
  const count = index ? index.count : position.count, out = new Float64Array(count * 3), v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(position, index ? index.getX(i) : i);
    if (matrix) v.applyMatrix4(matrix);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

/** One soup per instance of an instanced mesh, else the mesh's own soup. */
function meshSoups(mesh, matrix) {
  if (!mesh.isInstancedMesh) return [triangleSoup(mesh.geometry, matrix)];
  const out = [], instance = new THREE.Matrix4(), combined = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, instance);
    out.push(triangleSoup(mesh.geometry, combined.multiplyMatrices(matrix, instance)));
  }
  return out;
}

function soupBox(T) {
  const box = new THREE.Box3();
  for (let i = 0; i < T.length; i += 3) {
    box.min.x = Math.min(box.min.x, T[i]); box.min.y = Math.min(box.min.y, T[i + 1]); box.min.z = Math.min(box.min.z, T[i + 2]);
    box.max.x = Math.max(box.max.x, T[i]); box.max.y = Math.max(box.max.y, T[i + 1]); box.max.z = Math.max(box.max.z, T[i + 2]);
  }
  return box;
}

function uniqueVertices(T) {
  const seen = new Set(), out = [];
  for (let i = 0; i < T.length; i += 3) {
    const key = `${Math.round(T[i] * 1e5)},${Math.round(T[i + 1] * 1e5)},${Math.round(T[i + 2] * 1e5)}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(T[i], T[i + 1], T[i + 2]);
  }
  return Float64Array.from(out);
}

/** Uniform grid of triangle offsets over one soup (or several, with a part index). */
class TriangleGrid {
  constructor(cell = CELL_M) { this.cell = cell; this.map = new Map(); this.stamp = 0; this.marks = new Map(); }
  key(i, j, k) { return (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512); }
  add(T, part = 0) {
    const c = (value) => Math.floor(value / this.cell);
    for (let o = 0; o < T.length; o += 9) {
      const x0 = Math.min(T[o], T[o + 3], T[o + 6]), x1 = Math.max(T[o], T[o + 3], T[o + 6]);
      const y0 = Math.min(T[o + 1], T[o + 4], T[o + 7]), y1 = Math.max(T[o + 1], T[o + 4], T[o + 7]);
      const z0 = Math.min(T[o + 2], T[o + 5], T[o + 8]), z1 = Math.max(T[o + 2], T[o + 5], T[o + 8]);
      for (let i = c(x0); i <= c(x1); i++) for (let j = c(y0); j <= c(y1); j++) for (let k = c(z0); k <= c(z1); k++) {
        const key = this.key(i, j, k);
        let list = this.map.get(key);
        if (!list) this.map.set(key, list = []);
        list.push(part, o);
      }
    }
    return this;
  }
  /** Calls visit(part, offset) once per triangle whose cells meet the box. */
  query(x0, y0, z0, x1, y1, z1, visit) {
    const c = (value) => Math.floor(value / this.cell), stamp = ++this.stamp;
    for (let i = c(x0); i <= c(x1); i++) for (let j = c(y0); j <= c(y1); j++) for (let k = c(z0); k <= c(z1); k++) {
      const list = this.map.get(this.key(i, j, k));
      if (!list) continue;
      for (let n = 0; n < list.length; n += 2) {
        const id = list[n] * 1e8 + list[n + 1];
        if (this.marks.get(id) === stamp) continue;
        this.marks.set(id, stamp);
        if (visit(list[n], list[n + 1]) === true) return true;
      }
    }
    return false;
  }
}

/** Parameter t along a→b where the segment crosses triangle o of T, or -1. */
function segmentTriangle(T, o, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
  const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det, tx = ax - T[o], ty = ay - T[o + 1], tz = az - T[o + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

const triangle = new THREE.Triangle(), closest = new THREE.Vector3(), probe = new THREE.Vector3();
function triangleDistance(T, o, x, y, z) {
  triangle.a.set(T[o], T[o + 1], T[o + 2]); triangle.b.set(T[o + 3], T[o + 4], T[o + 5]); triangle.c.set(T[o + 6], T[o + 7], T[o + 8]);
  return triangle.closestPointToPoint(probe.set(x, y, z), closest).distanceTo(probe);
}

function partGrid(part) { return part.grid ||= new TriangleGrid().add(part.T); }

function nearSurface(part, x, y, z, tol) {
  const T = part.T;
  return partGrid(part).query(x - tol, y - tol, z - tol, x + tol, y + tol, z + tol,
    (_, o) => triangleDistance(T, o, x, y, z) <= tol);
}

/** Even-odd test along +X from a jittered point (closed solids only; open shells answer false or true at random). */
function insideSolid(part, x, y, z) {
  const T = part.T, jy = y + 1.37e-6, jz = z + 2.71e-6, end = part.box.max.x + 1;
  let crossings = 0;
  partGrid(part).query(x, jy, jz, end, jy, jz, (_, o) => {
    const t = segmentTriangle(T, o, x, jy, jz, end, jy, jz);
    if (t > 0 && t < 1) crossings++;
  });
  return crossings % 2 === 1;
}

/** Real contact between two parts within tol. */
export function partsTouch(a, b, tol = CONTACT_TOL_M) {
  const overlap = a.box.clone().expandByScalar(tol).intersect(b.box.clone().expandByScalar(tol));
  if (overlap.isEmpty()) return false;
  const vertexIn = (from, into) => {
    const U = from.U ||= uniqueVertices(from.T);
    for (let i = 0; i < U.length; i += 3) {
      const x = U[i], y = U[i + 1], z = U[i + 2];
      if (x < overlap.min.x || x > overlap.max.x || y < overlap.min.y || y > overlap.max.y || z < overlap.min.z || z > overlap.max.z) continue;
      if (nearSurface(into, x, y, z, tol) || insideSolid(into, x, y, z)) return true;
    }
    return false;
  };
  if (vertexIn(a, b) || vertexIn(b, a)) return true;
  const edgesCross = (from, into) => {
    const T = from.T, G = partGrid(into), I = into.T;
    for (let o = 0; o < T.length; o += 9) {
      for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) {
        const ax = T[o + i], ay = T[o + i + 1], az = T[o + i + 2], bx = T[o + j], by = T[o + j + 1], bz = T[o + j + 2];
        if (Math.max(ax, bx) < overlap.min.x || Math.min(ax, bx) > overlap.max.x || Math.max(ay, by) < overlap.min.y
          || Math.min(ay, by) > overlap.max.y || Math.max(az, bz) < overlap.min.z || Math.min(az, bz) > overlap.max.z) continue;
        if (G.query(Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz), Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz),
          (_, q) => { const t = segmentTriangle(I, q, ax, ay, az, bx, by, bz); return t >= 0 && t <= 1; })) return true;
      }
    }
    return false;
  };
  return edgesCross(a, b) || edgesCross(b, a);
}

function makePart(bucket, source, T) {
  if (!T.length) return null;
  const box = soupBox(T), size = box.getSize(new THREE.Vector3());
  return { bucket, source, T, box, volume: size.x * size.y * size.z };
}

/** One census part from a geometry already in the hull frame. */
export function stockPart(bucket, geometry, source = 'add') { return makePart(bucket, source, triangleSoup(geometry)); }

/** The articulated body a factory bucket belongs to (its rig group moves it as one). */
export function bucketBody(bucket) {
  if (bucket.startsWith('hull')) return /RunningGear|Track/.test(bucket) ? null : 'hull';
  if (bucket.startsWith('turret')) return 'turret';
  if (bucket.startsWith('gun')) return 'gun';
  return null;
}
const BUCKET_RIG = (bucket) => bucket.startsWith('hull') ? 'rig_hull' : bucket.startsWith('turret') ? 'rig_turret'
  : bucket === 'gun' ? 'rig_recoil' : /^gunBarrel(\d+)$/.test(bucket) ? `rig_barrel_${bucket.slice(9)}` : 'rig_gun';

/** Builds the tank at rest and collects every body's stock (census parts and standalone meshes: fittings, stowage,
 * nets, props) in the tank's hull frame, before the hull rig's uniform scale. Decals and running gear are left out. */
/** The authoring frames (profile and kit lines, innermost first) that added a part. */
function authoringSite() {
  const frames = [];
  for (const line of new Error().stack.split('\n')) {
    const match = /src\/vehicles\/(.+?\.ts):(\d+):\d+/.exec(line);
    if (!match || /^(tankFactoryCore|tankFactory|factoryGeometry)\.ts$/.test(match[1])) continue;
    frames.push(`${match[1]}:${match[2]}`);
    if (frames.length === 3) break;
  }
  return frames.join(' < ');
}

export function collectStock(id, options = {}) {
  // The add-time stream names each part's source and authoring lines; the final census is what ships (after size
  // scaling, bucket clears and the factory's own passes), read just before the buckets merge.
  const added = new Map(), raw = [];
  const limit = Error.stackTraceLimit;
  if (options.where) Error.stackTraceLimit = 40;
  let tank;
  try {
    tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242,
      partCensus(bucket, geometry, source) {
        added.set(geometry, { source, where: options.where ? authoringSite() : undefined });
      },
      finalPartCensus(bucket, geometry) {
        const body = bucketBody(bucket);
        const origin = added.get(geometry) ?? { source: 'factory' };
        if (body) raw.push({ bucket, body, source: origin.source, T: triangleSoup(geometry), where: origin.where });
      } });
  } finally { Error.stackTraceLimit = limit; }
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    if (!hull) throw new Error(`${id}: no rig_hull`);
    const inverse = new THREE.Matrix4().copy(hull.matrixWorld).invert();
    const rigMatrix = new Map();
    const frame = (name) => {
      if (!rigMatrix.has(name)) {
        const rig = tank.root.getObjectByName(name) ?? tank.root.getObjectByName('rig_gun');
        rigMatrix.set(name, rig ? new THREE.Matrix4().multiplyMatrices(inverse, rig.matrixWorld) : null);
      }
      return rigMatrix.get(name);
    };
    const parts = [];
    for (const entry of raw) {
      const matrix = frame(BUCKET_RIG(entry.bucket));
      if (!matrix) continue;
      const T = entry.T;
      const v = new THREE.Vector3();
      for (let i = 0; i < T.length; i += 3) { v.set(T[i], T[i + 1], T[i + 2]).applyMatrix4(matrix); T[i] = v.x; T[i + 1] = v.y; T[i + 2] = v.z; }
      const part = makePart(entry.bucket, entry.source, T);
      if (part) { part.body = entry.body; part.where = entry.where; parts.push(part); }
    }
    const buckets = new Set(raw.map((entry) => entry.bucket));
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const gear = [];
    let instanced = 0;
    tank.root.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.visible) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      if (mesh.userData.runningGear || /^gear/.test(mesh.name)) {
        if (/^gearTrackBand/.test(mesh.name) && !mesh.isInstancedMesh) gear.push(triangleSoup(mesh.geometry, matrix));
        // Wheels, sprockets, idlers and rollers turn in place: hub bolts and caps authored in hull buckets ride them.
        // Tracks move: nothing may hang from a band, a pad or a link.
        if (!/Track/i.test(mesh.name)) for (const T of meshSoups(mesh, matrix)) {
          const part = makePart(`gear:${mesh.name}`, 'gear', T);
          if (part) { part.body = 'hull'; part.gear = true; parts.push(part); }
        }
        return;
      }
      if (buckets.has(mesh.name) || mesh.userData.shadowOnly
        || /procShadow|Shadow$|^vehicleMarking|decal|muzzleBore|TrackLinks|_track_/i.test(mesh.name)) return;
      if (mesh.isInstancedMesh) { instanced++; return; }
      let body = 'hull';
      for (let p = mesh; p; p = p.parent) { if (p === gun) { body = 'gun'; break; } if (p === turret) { body = 'turret'; break; } }
      const label = `mesh:${mesh.parent?.name && !/^(LOD|Object3D)$/.test(mesh.parent.name) ? `${mesh.parent.name}/` : ''}`
        + `${mesh.name || mesh.type}:${[].concat(mesh.material).map((m) => m?.name ?? '').join('|')}`;
      const part = makePart(label, 'mesh', triangleSoup(mesh.geometry, matrix));
      if (part) { part.body = body; parts.push(part); }
    });
    let trackInnerX = Infinity;
    for (const T of gear) for (let i = 0; i < T.length; i += 3) trackInnerX = Math.min(trackInnerX, Math.abs(T[i]));
    return { id, parts, instanced, trackInnerX: Number.isFinite(trackInnerX) ? trackInnerX : null, hullScale: hull.scale.x };
  } finally {
    tank.dispose();
  }
}

/** Hull-body stock only (the belly and hull-float receipts). */
export function collectHullStock(id) {
  const stock = collectStock(id);
  return { ...stock, parts: stock.parts.filter((part) => part.body === 'hull') };
}

/** Floating islands of one body's stock: components of the real-contact graph other than the largest part's. */
export function floatingIslands(parts, tol = CONTACT_TOL_M, anchors = [() => true]) {
  const adjacency = parts.map(() => []);
  for (let i = 0; i < parts.length; i++) {
    const grown = parts[i].box.clone().expandByScalar(tol);
    for (let j = i + 1; j < parts.length; j++) {
      if (!grown.intersectsBox(parts[j].box)) continue;
      // A wheel carries only what rides it (a hub cap, a bolt ring inside its bounds): a skirt brushing it still floats.
      if (parts[i].gear !== parts[j].gear) {
        const [wheel, other] = parts[i].gear ? [parts[i], parts[j]] : [parts[j], parts[i]];
        if (!wheel.box.clone().expandByScalar(0.03).containsBox(other.box)) continue;
      }
      if (partsTouch(parts[i], parts[j], tol)) { adjacency[i].push(j); adjacency[j].push(i); }
    }
  }
  const component = new Array(parts.length).fill(-1);
  let count = 0;
  for (let i = 0; i < parts.length; i++) {
    if (component[i] >= 0) continue;
    const queue = [i]; component[i] = count;
    while (queue.length) for (const next of adjacency[queue.pop()]) if (component[next] < 0) { component[next] = count; queue.push(next); }
    count++;
  }
  // The main structure is the largest part's component; with `anchors`, also each anchor's largest part's (the gun's
  // recoiling tube slides in its mount's bore with designed clearance: gun-junction-census.mjs owns that seam).
  const mains = new Set();
  for (const keep of anchors) {
    let largest = -1;
    parts.forEach((part, i) => { if (keep(part) && (largest < 0 || part.volume > parts[largest].volume)) largest = i; });
    if (largest >= 0) mains.add(component[largest]);
  }
  const mainGrid = new TriangleGrid(0.1);
  parts.forEach((part, i) => { if (mains.has(component[i])) mainGrid.add(part.T, i); });
  const islands = new Map();
  parts.forEach((part, i) => {
    if (mains.has(component[i])) return;
    if (!islands.has(component[i])) islands.set(component[i], []);
    islands.get(component[i]).push(i);
  });
  return [...islands.values()].map((members) => {
    const box = new THREE.Box3();
    for (const i of members) box.union(parts[i].box);
    let gap = Infinity;
    for (const reach of [0.01, 0.03, 0.1, 0.3, 0.8]) {
      for (const i of members) {
        const U = parts[i].U ||= uniqueVertices(parts[i].T);
        for (let v = 0; v < U.length; v += 3) {
          const x = U[v], y = U[v + 1], z = U[v + 2];
          mainGrid.query(x - reach, y - reach, z - reach, x + reach, y + reach, z + reach, (p, o) => {
            gap = Math.min(gap, triangleDistance(parts[p].T, o, x, y, z));
          });
        }
      }
      if (gap <= reach) break;
    }
    const members_ = members.map((i) => parts[i]);
    return {
      parts: members_.map((part) => ({ bucket: part.bucket, source: part.source, min: part.box.min.toArray(), max: part.box.max.toArray(),
        ...(part.where ? { where: part.where } : {}) })),
      min: box.min.toArray(), max: box.max.toArray(),
      gapM: Number.isFinite(gap) ? gap : null,
      flap: members_.some((part) => part.source === 'mudguard' || part.bucket === 'hullRubber' || /mudguard/i.test(part.bucket)),
    };
  });
}

/** Openings into the hull seen from below, between the track bands' inner faces. */
export function bellyPits(parts, trackInnerX, options = {}) {
  const step = options.step ?? BELLY_STEP_M, depth = options.depth ?? BELLY_PIT_DEPTH_M, reach = options.reach ?? BELLY_PIT_REACH_M;
  const seeThroughOnly = options.seeThroughOnly === true;
  if (!trackInnerX) return [];
  // the fleet tub-wall standard stands 50 mm inside the band (leoHullV3 innerW); the lane beside it is sponson
  const half = trackInnerX - 0.06;
  // xz grid of every hull triangle, for vertical rays
  const cell = 0.1, map = new Map(), key = (i, k) => (i + 512) * 4096 + (k + 512), c = (v) => Math.floor(v / cell);
  let z0 = Infinity, z1 = -Infinity;
  parts.forEach((part, p) => {
    z0 = Math.min(z0, part.box.min.z); z1 = Math.max(z1, part.box.max.z);
    const T = part.T;
    for (let o = 0; o < T.length; o += 9) {
      for (let i = c(Math.min(T[o], T[o + 3], T[o + 6])); i <= c(Math.max(T[o], T[o + 3], T[o + 6])); i++)
        for (let k = c(Math.min(T[o + 2], T[o + 5], T[o + 8])); k <= c(Math.max(T[o + 2], T[o + 5], T[o + 8])); k++) {
          let list = map.get(key(i, k)); if (!list) map.set(key(i, k), list = []); list.push(p, o);
        }
    }
  });
  const lowestHit = (x, z) => {
    const list = map.get(key(c(x), c(z)));
    let best = Infinity;
    if (!list) return best;
    for (let n = 0; n < list.length; n += 2) {
      const T = parts[list[n]].T, o = list[n + 1];
      const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
      best = Math.min(best, u * T[o + 1] + v * T[o + 4] + (1 - u - v) * T[o + 7]);
    }
    return best;
  };
  const xs = [], zs = [];
  for (let x = -half + step / 2; x < half; x += step) xs.push(x);
  for (let z = z0 + step / 2; z < z1; z += step) zs.push(z);
  const h = xs.map((x) => zs.map((z) => lowestHit(x, z)));
  const window = Math.round(reach / step);
  const pit = xs.map(() => zs.map(() => 0));
  for (let i = 0; i < xs.length; i++) {
    const column = h[i];
    for (let k = 0; k < zs.length; k++) {
      let left = Infinity, right = Infinity;
      for (let n = Math.max(0, k - window); n < k; n++) left = Math.min(left, column[n]);
      for (let n = k + 1; n <= Math.min(zs.length - 1, k + window); n++) right = Math.min(right, column[n]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      const rise = column[k] - Math.max(left, right);
      if (seeThroughOnly ? !Number.isFinite(column[k]) : rise > depth) pit[i][k] = Number.isFinite(column[k]) ? rise : Infinity;
    }
  }
  const seen = xs.map(() => zs.map(() => false)), regions = [];
  for (let i = 0; i < xs.length; i++) for (let k = 0; k < zs.length; k++) {
    if (!pit[i][k] || seen[i][k]) continue;
    const queue = [[i, k]]; seen[i][k] = true;
    let cells = 0, x0 = Infinity, x1 = -Infinity, za = Infinity, zb = -Infinity, deepest = 0, seeThrough = 0;
    while (queue.length) {
      const [a, b] = queue.pop();
      cells++; x0 = Math.min(x0, xs[a]); x1 = Math.max(x1, xs[a]); za = Math.min(za, zs[b]); zb = Math.max(zb, zs[b]);
      if (pit[a][b] === Infinity) seeThrough++; else deepest = Math.max(deepest, pit[a][b]);
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const na = a + da, nb = b + db;
        if (na < 0 || nb < 0 || na >= xs.length || nb >= zs.length || seen[na][nb] || !pit[na][nb]) continue;
        seen[na][nb] = true; queue.push([na, nb]);
      }
    }
    const area = cells * step * step;
    if (area < BELLY_PIT_MIN_AREA_M2) continue;
    regions.push({ kind: seeThroughOnly ? 'see-through' : 'rise', x: [x0 - step / 2, x1 + step / 2], z: [za - step / 2, zb + step / 2],
      areaM2: area, riseM: deepest, seeThroughCells: seeThrough });
  }
  return regions;
}

/** Every running-gear part anchors its own component (a wheel turns in place; what rides it is carried). */
function gearAnchors(parts) {
  return parts.filter((part) => part.gear).map((gear) => (part) => part === gear);
}

/** Floating islands of one articulated body's stock, anchored as the census anchors them. */
export function bodyIslands(parts, body) {
  const own = parts.filter((part) => part.body === body);
  const anchors = body === 'gun' ? [(part) => part.bucket === 'gun' || part.bucket.startsWith('gunBarrel'),
    (part) => part.bucket !== 'gun' && !part.bucket.startsWith('gunBarrel')]
    : body === 'hull' ? [(part) => !part.gear, ...gearAnchors(own)] : [() => true];
  return own.length ? floatingIslands(own, CONTACT_TOL_M, anchors).map((island) => ({ body, ...island })) : [];
}

/** The hull's belly pits as the census reads them. */
export function hullBellyPits(parts, trackInnerX) {
  // Only the structural shell bounds an opening: stern stowage or a tow fitting hanging below an undercut is not a belly.
  const shell = parts.filter((part) => part.body === 'hull' && !part.gear && part.source !== 'mudguard'
    && (part.bucket === 'hull' || part.bucket === 'hullExternalArmor'));
  // ... while a see-through cell (no stock at all over it, stock fore and aft) is an opening whatever bounds it.
  return [...bellyPits(shell, trackInnerX),
    ...bellyPits(parts.filter((part) => part.body === 'hull' && !part.gear), trackInnerX, { seeThroughOnly: true })];
}

/** One tank's census: each body's floating islands (tagged with the body) and the hull's belly pits. */
export function hullContactCensus(id, options = {}) {
  const { parts, trackInnerX, hullScale, instanced } = collectStock(id, options);
  const islands = ['hull', 'turret', 'gun'].flatMap((body) => bodyIslands(parts, body));
  const pits = hullBellyPits(parts, trackInnerX);
  return { id, parts: parts.length, instanced, trackInnerX, hullScale, islands, pits };
}
