// Coplanar depth offsets bounded by contact (2026-10-23, lane 243; the owner: "insignias and marks on tanks are still
// glitching, for example if u drag them around the tank gallery. fix that. fix any glitching of that or tank props").
//
// installCoplanarDepthLayers (tankFactoryCore.ts) gave every colour-pass mesh its own polygon offset, one depth-buffer
// unit per place in the semantic order: 52-173 units on the sampled fleet. A unit spans about d² × 2^-24 / near metres
// of eye depth, so the ladder's top (a turret's merged equipment, the roof guns' parts) drew 2-8 cm nearer a Gallery
// camera than it stood and 5-20 cm nearer a battle camera at 50-100 m: props showed through the armour in front of
// them, and the armour covered its own markings past 11-15 m in the Gallery and 30-40 m in battle, both turning with
// the orbit.
//
// An offset only has to order meshes that can tie: surfaces in one facing plane whose bounds meet. Each record keeps
// its place in the order (`layer`) and draws with `depth`, one unit deeper than the deepest earlier record it can tie
// with, so every exact tie resolves as the ladder resolved it while the offsets stay within the longest chain of
// touching coplanar meshes (9-23 units on the sampled fleet). Instanced and batched draws, whose planes move per
// instance, order against every record their bounds meet.
import * as THREE from 'three';
import { isVehicleBatchedMesh, isVehicleInstancedMesh, type VehicleMesh } from './vehicleMesh.ts';
import type { CoplanarLayerRecord } from './staticDrawMerge.ts';

/** Plane-distance bucket; a plane is compared with its neighbours' buckets too, so ties up to 1 mm apart are read. */
const PLANE_STEP_M = 0.0005;
/** Normal quantisation per axis (about 0.2 degrees). */
const NORMAL_STEPS = 256;
const NORMAL_SPAN = 2 * NORMAL_STEPS + 1;
/** Plane distances of ±65 m in PLANE_STEP_M buckets. */
const DISTANCE_SPAN = 1 << 18;
/** Bounds meet when they come this close. */
const CONTACT_PAD_M = 0.001;

const rootInverse = new THREE.Matrix4();
const toRoot = new THREE.Matrix4();
const box = new THREE.Box3();

function planeKey(nx: number, ny: number, nz: number, distance: number): number {
  return (((Math.round(nx * NORMAL_STEPS) + NORMAL_STEPS) * NORMAL_SPAN + Math.round(ny * NORMAL_STEPS) + NORMAL_STEPS)
    * NORMAL_SPAN + Math.round(nz * NORMAL_STEPS) + NORMAL_STEPS) * DISTANCE_SPAN
    + Math.floor(distance / PLANE_STEP_M) + DISTANCE_SPAN / 2;
}

/** The facing planes of a mesh's triangles in the root frame (a double-sided material faces both ways), sorted. */
function facingPlaneKeys(mesh: VehicleMesh): Float64Array {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) return new Float64Array(0);
  const index = geometry.index?.array ?? null;
  const count = index ? index.length : position.count;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const doubleSided = materials.some((material) => material?.side === THREE.DoubleSide);
  const facing = materials[0]?.side === THREE.BackSide ? -1 : 1;
  const e = toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld).elements;
  // read the vertex store directly (a build's merged hull holds tens of thousands of triangles)
  const interleaved = (position as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
  const direct = !position.normalized;
  const array = interleaved ? (position as THREE.InterleavedBufferAttribute).data.array : (position as THREE.BufferAttribute).array;
  const stride = interleaved ? (position as THREE.InterleavedBufferAttribute).data.stride : position.itemSize;
  const base = interleaved ? (position as THREE.InterleavedBufferAttribute).offset : 0;
  const keys = new Float64Array(Math.floor(count / 3) * (doubleSided ? 2 : 1));
  let n = 0;
  const corner = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let offset = 0; offset + 2 < count; offset += 3) {
    for (let k = 0; k < 3; k++) {
      const vertex = index ? index[offset + k] : offset + k;
      const x = direct ? array[base + vertex * stride] : position.getX(vertex);
      const y = direct ? array[base + vertex * stride + 1] : position.getY(vertex);
      const z = direct ? array[base + vertex * stride + 2] : position.getZ(vertex);
      corner[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      corner[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      corner[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const ax = corner[0], ay = corner[1], az = corner[2];
    const bx = corner[3] - ax, by = corner[4] - ay, bz = corner[5] - az;
    const cx = corner[6] - ax, cy = corner[7] - ay, cz = corner[8] - az;
    let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 1e-12) continue;
    nx *= facing / length; ny *= facing / length; nz *= facing / length;
    const distance = nx * ax + ny * ay + nz * az;
    keys[n++] = planeKey(nx, ny, nz, distance);
    if (doubleSided) keys[n++] = planeKey(-nx, -ny, -nz, -distance);
  }
  const sorted = keys.subarray(0, n).sort();
  let unique = 0;
  for (let i = 0; i < sorted.length; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) sorted[unique++] = sorted[i];
  return sorted.subarray(0, unique);
}

/** A draw's bounds in the root frame, padded to the contact distance. */
export function rootFrameBounds(object: VehicleMesh | THREE.Mesh, root: THREE.Object3D, target = new THREE.Box3()): THREE.Box3 {
  rootInverse.copy(root.matrixWorld).invert();
  if (isVehicleInstancedMesh(object as VehicleMesh) || isVehicleBatchedMesh(object as VehicleMesh)) {
    const batched = object as THREE.InstancedMesh;
    batched.computeBoundingBox();
    target.copy(batched.boundingBox ?? box.makeEmpty());
  } else {
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    target.copy(object.geometry.boundingBox ?? box.makeEmpty());
  }
  if (target.isEmpty()) return target;
  return target.applyMatrix4(toRoot.multiplyMatrices(rootInverse, object.matrixWorld)).expandByScalar(CONTACT_PAD_M);
}

/**
 * Each record's draw depth: one unit deeper than the deepest earlier record (in `layer` order) it can tie with.
 * Returns the records in layer order, each with its `depth`.
 */
export function assignCoplanarDepth(
  root: THREE.Object3D, records: readonly CoplanarLayerRecord[],
): CoplanarLayerRecord[] {
  root.updateMatrixWorld(true);
  const ordered = [...records].sort((lhs, rhs) => lhs.layer - rhs.layer);
  const bounds = ordered.map((record) => rootFrameBounds(record.object, root));
  rootInverse.copy(root.matrixWorld).invert();
  const depth = new Int32Array(ordered.length);
  const seen = new Int32Array(ordered.length).fill(-1);
  const byPlane = new Map<number, number[]>();
  const boundsOnly: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const object = ordered[i].object;
    const planar = !isVehicleInstancedMesh(object) && !isVehicleBatchedMesh(object);
    const keys = planar ? facingPlaneKeys(object) : null;
    let below = 0;
    const meet = (j: number): void => {
      if (seen[j] === i) return;
      seen[j] = i;
      if (depth[j] > below && !bounds[j].isEmpty() && bounds[i].intersectsBox(bounds[j])) below = depth[j];
    };
    if (keys) {
      for (const key of keys) {
        for (let near = key - 1; near <= key + 1; near++) {
          const list = byPlane.get(near);
          if (list) for (const j of list) meet(j);
        }
      }
      for (const j of boundsOnly) meet(j);
    } else {
      for (let j = 0; j < i; j++) meet(j);
    }
    depth[i] = below + 1;
    if (keys) {
      for (const key of keys) {
        const list = byPlane.get(key);
        if (list) list.push(i);
        else byPlane.set(key, [i]);
      }
    } else {
      boundsOnly.push(i);
    }
  }
  return ordered.map((record, i) => ({ ...record, depth: depth[i] }));
}

/**
 * The markings' draws, ordered after every record their bounds meet (the armour they are painted on, and any part
 * coplanar with it there) by `MARKING_DEPTH_MARGIN` units. Appended after the vehicle's own records.
 */
export const MARKING_DEPTH_MARGIN = 2;
export function markingDepthRecords(
  root: THREE.Object3D, records: readonly CoplanarLayerRecord[], markings: readonly VehicleMesh[],
): CoplanarLayerRecord[] {
  root.updateMatrixWorld(true);
  const recordBounds = records.map((record) => rootFrameBounds(record.object, root));
  let rank = records.reduce((top, record) => Math.max(top, record.layer), 0);
  const out: CoplanarLayerRecord[] = [];
  for (const marking of markings) {
    const materials = (Array.isArray(marking.material) ? marking.material : [marking.material]).filter(Boolean);
    if (!materials.length) continue;
    const own = rootFrameBounds(marking, root);
    let below = 0;
    records.forEach((record, index) => {
      const at = record.depth ?? record.layer;
      if (at > below && !recordBounds[index].isEmpty() && own.intersectsBox(recordBounds[index])) below = at;
    });
    out.push({ object: marking, materials, layer: ++rank, depth: below + MARKING_DEPTH_MARGIN });
  }
  return out;
}
