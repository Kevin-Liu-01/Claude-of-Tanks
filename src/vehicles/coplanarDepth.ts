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
 * Each record's draw depth: one unit deeper than the deepest earlier record (in `layer` order) it can tie with; and its
 * `ties`: how many exact ties (a shared plane key, not a neighbouring one) the chain below it climbs. Both rise along
 * every contact, so any scale of the ties' extra units (coplanarDepthUnits) keeps every pair's order.
 * Returns the records in layer order, each with its `depth` and `ties`.
 */
export function assignCoplanarDepth(
  root: THREE.Object3D, records: readonly CoplanarLayerRecord[],
): CoplanarLayerRecord[] {
  root.updateMatrixWorld(true);
  const ordered = [...records].sort((lhs, rhs) => lhs.layer - rhs.layer);
  const bounds = ordered.map((record) => rootFrameBounds(record.object, root));
  rootInverse.copy(root.matrixWorld).invert();
  const depth = new Int32Array(ordered.length);
  const ties = new Int32Array(ordered.length);
  // per earlier record met by the current one: 1 a neighbouring plane, 2 the same plane (an exact tie)
  const met = new Uint8Array(ordered.length);
  const byPlane = new Map<number, number[]>();
  const boundsOnly: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const object = ordered[i].object;
    const planar = !isVehicleInstancedMesh(object) && !isVehicleBatchedMesh(object);
    const keys = planar ? facingPlaneKeys(object) : null;
    const touched: number[] = [];
    const meet = (j: number, exact: boolean): void => {
      if (!met[j]) touched.push(j);
      met[j] = Math.max(met[j], exact ? 2 : 1);
    };
    if (keys) {
      for (const key of keys) {
        for (let near = key - 1; near <= key + 1; near++) {
          const list = byPlane.get(near);
          if (list) for (const j of list) meet(j, near === key);
        }
      }
      for (const j of boundsOnly) meet(j, false);
    } else {
      for (let j = 0; j < i; j++) meet(j, false);
    }
    let below = 0, tiesBelow = 0;
    for (const j of touched) {
      if (!bounds[j].isEmpty() && bounds[i].intersectsBox(bounds[j])) {
        below = Math.max(below, depth[j]);
        tiesBelow = Math.max(tiesBelow, ties[j] + (met[j] === 2 ? 1 : 0));
      }
      met[j] = 0;
    }
    depth[i] = below + 1;
    ties[i] = tiesBelow;
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
  return ordered.map((record, i) => ({ ...record, depth: depth[i], ties: ties[i] }));
}

/**
 * The near plane under which a unit or two separates an exact tie at every view the Gallery and the game frame (the
 * Gallery's camera before 243 and the depth layers' tuning). Two coplanar draws cut from different triangles differ by
 * about their depth slope over 256 after vertex snapping, and that slope grows with the near plane: under the Gallery's
 * tight near (fitGalleryDepth, metres) the Leclerc's flush rear-deck inlay (hullDark in the deck's plane) sparkled at
 * grazing views, 7.3 per mille of its props' pixels against 0.4 on main (243 GPU census).
 */
export const COPLANAR_TIE_NEAR_M = 0.05;
/** Units each exact tie climbs at COPLANAR_TIE_NEAR_M (the old ladder's one unit between neighbouring ranks held
 * there); they scale with the drawing camera's near plane above it. */
export const COPLANAR_TIE_UNITS = 1;

/**
 * The polygon-offset units a record draws with under a camera with this near plane: its contact depth, plus its exact
 * ties' extra units, which grow with the near plane so a tie stays as far apart, against vertex-snapping error, as it
 * was at COPLANAR_TIE_NEAR_M. In eye depth that extra is what COPLANAR_TIE_UNITS were there (0.17 mm a tie at 12 m,
 * 2 mm for the fleet's longest chains of twelve), so a flush inlay never pulls visibly through what stands before it.
 */
export function coplanarDepthUnits(depth: number, ties: number, near: number): number {
  const scale = near > COPLANAR_TIE_NEAR_M ? near / COPLANAR_TIE_NEAR_M : 1;
  return depth + ties * COPLANAR_TIE_UNITS * (scale - 1);
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
    let below = 0, tiesBelow = 0;
    records.forEach((record, index) => {
      if (recordBounds[index].isEmpty() || !own.intersectsBox(recordBounds[index])) return;
      below = Math.max(below, record.depth ?? record.layer);
      tiesBelow = Math.max(tiesBelow, record.ties ?? 0);
    });
    // the film lies on its armour like an exact tie: it climbs one more, so it stays over the armour's own ties
    out.push({ object: marking, materials, layer: ++rank, depth: below + MARKING_DEPTH_MARGIN, ties: tiesBelow + 1 });
  }
  return out;
}
