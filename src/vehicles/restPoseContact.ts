// Rest-pose contact scan and presentation floor: movement-solve and
// presentation metadata read from the finished geometry (never written).
// Split out of tankFactoryCore.ts in round 46 (docs/CLEANUP-2026-09-22.md §4.4).
import * as THREE from 'three';
import { isVehicleInstancedMesh, isVehicleMesh, type VehicleInstancedMesh, type VehicleMesh } from './vehicleMesh.ts';

// ---------------------------------------------------------------------------
// Rest-pose contact scan (movement-solve metadata — reads geometry, never
// writes it). Runs once per createTank, after the gear instances are seated
// at rest: strided vertices of every visible color-writing Mesh plus every
// live InstancedMesh instance, in root-local (= hull) space. Returns the
// SURFACE floor (robust low quantile — see below) and the 5 cm low-band
// footprint. The whole-visual floor matters because mask-sovereign rebuilds
// may sink a hull keel BELOW the gear line (m1a2_sepv2: keel +0.055 vs gear
// +0.10) — the support solve must seat whatever actually renders lowest.
//
// FLOOR = FIRST DENSE SHELL, NOT MIN: the absolute lowest vertex is
// routinely a single tilted approach-ramp pad corner grazing ~1.6 cm under
// the flat run (its center clamps to y ≥ 0.078, the rotated grouser corner
// swings below) — seating THAT on the terrain would float the entire visible
// contact run to protect one grouser tip. A load-bearing surface shows up as
// a DENSE shell of samples, so the floor is the lowest level where 12
// samples fit inside a 1.5 cm band. (A global percentile fails both ways:
// vertex counts follow tessellation, not area — a huge keel plate is 4
// corner verts, a pad field is thousands.)
const _rcM = new THREE.Matrix4();
const _rcM2 = new THREE.Matrix4();
const _rcV = new THREE.Vector3();
const _floorHeap: number[] = [];
const FLOOR_DENSE_SAMPLES = 12;
const FLOOR_DENSE_BAND_M = 0.015;

function maxHeapPush(heap: number[], value: number): void {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent] >= value) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function maxHeapReplaceRoot(heap: number[], value: number): void {
  const length = heap.length;
  let index = 0;
  for (;;) {
    const left = index * 2 + 1;
    if (left >= length) break;
    const right = left + 1;
    const child = right < length && heap[right] > heap[left] ? right : left;
    if (heap[child] <= value) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = value;
}

function stridedValueCount(values: ArrayLike<number>, offset: number, stride: number): number {
  return values.length <= offset
    ? 0 : Math.floor((values.length - 1 - offset) / stride) + 1;
}

function lowestStridedValue(
  values: ArrayLike<number>, offset: number, stride: number,
): number {
  let lowest = values[offset];
  for (let index = offset + stride; index < values.length; index += stride) {
    if (values[index] < lowest) lowest = values[index];
  }
  return lowest;
}

function collectLowestFloorSamples(
  values: ArrayLike<number>, offset: number, stride: number, limit: number,
): void {
  _floorHeap.length = 0;
  for (let index = offset; index < values.length; index += stride) {
    const value = values[index];
    if (_floorHeap.length < limit) maxHeapPush(_floorHeap, value);
    else if (value < _floorHeap[0]) maxHeapReplaceRoot(_floorHeap, value);
  }
  _floorHeap.sort((a, b) => a - b);
}

function denseFloorSample(limit: number): number | undefined {
  for (let index = 0; index + FLOOR_DENSE_SAMPLES - 1 < limit; index++) {
    const bandTop = _floorHeap[index + FLOOR_DENSE_SAMPLES - 1];
    if (bandTop - _floorHeap[index] <= FLOOR_DENSE_BAND_M) return _floorHeap[index];
  }
  return undefined;
}

function robustFloorYStrided(
  values: ArrayLike<number>, offset = 0, stride = 1,
): number | undefined {
  const length = stridedValueCount(values, offset, stride);
  if (!length) return undefined;
  if (length < FLOOR_DENSE_SAMPLES) return lowestStridedValue(values, offset, stride);
  let limit = Math.min(64, length);
  for (;;) {
    collectLowestFloorSamples(values, offset, stride, limit);
    const sample = denseFloorSample(limit);
    if (sample !== undefined) return sample;
    if (limit === length) return _floorHeap[0];
    limit = Math.min(length, limit * 4);
  }
}

export function robustFloorY(ys: ArrayLike<number>): number | undefined {
  return robustFloorYStrided(ys);
}

// Presentation surfaces are rigid, unlike the terrain support solve. Track
// approach/departure pads can rotate one outer corner up to ~24 mm below the
// analytic flat-run contact plane, so seating only bottomYM visibly buries
// those corners in the gallery/garage floor. Keep the battle contact plane
// exact and publish a separate conservative envelope for static presentation.
export const PRESENTATION_TRACK_TIP_ALLOWANCE_M = 0.025;

export interface RestContactReceipt {
  bottomYM: number;
  absMinYM: number;
  panYM: number | null;
  halfLenM: number | null;
  halfWidM: number | null;
  zCenterM: number | null;
}

export function materialWritesColor(material: THREE.Material | THREE.Material[]): boolean {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => entry.colorWrite !== false);
}

function centerSpanningMeshBottomY(
  mesh: VehicleMesh,
  invRoot: THREE.Matrix4,
): number | null {
  if (isVehicleInstancedMesh(mesh)) return null;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return null;
  _rcM2.multiplyMatrices(invRoot, mesh.matrixWorld);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? bounds.max.x : bounds.min.x;
    const y = corner & 2 ? bounds.max.y : bounds.min.y;
    const z = corner & 4 ? bounds.max.z : bounds.min.z;
    _rcV.set(x, y, z).applyMatrix4(_rcM2);
    if (_rcV.x < minX) minX = _rcV.x;
    if (_rcV.x > maxX) maxX = _rcV.x;
    if (_rcV.y < minY) minY = _rcV.y;
  }
  return minX < -0.2 && maxX > 0.2 ? minY : null;
}

interface RestContactSamples {
  points: number[];
  absMinYM: number;
  panYM: number | null;
}

function isVisibleBelowRoot(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object;
    current && current !== root; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function appendInstancedRestContactSamples(
  mesh: VehicleInstancedMesh,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  invRoot: THREE.Matrix4,
  samples: RestContactSamples,
): void {
  const stride = Math.max(1, Math.floor(position.count / 48));
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, _rcM);
    const elements = _rcM.elements;
    // Covered-top pads and thrown gear use collapsed instances.
    if (Math.abs(elements[0]) + Math.abs(elements[5]) + Math.abs(elements[10]) < 1e-5) {
      continue;
    }
    _rcM2.multiplyMatrices(mesh.matrixWorld, _rcM);
    _rcM2.premultiply(invRoot);
    for (let vertex = 0; vertex < position.count; vertex += stride) {
      _rcV.fromBufferAttribute(position, vertex).applyMatrix4(_rcM2);
      samples.points.push(_rcV.x, _rcV.y, _rcV.z);
      if (_rcV.y < samples.absMinYM) samples.absMinYM = _rcV.y;
    }
  }
}

function appendMeshRestContactSamples(
  mesh: VehicleMesh,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  invRoot: THREE.Matrix4,
  samples: RestContactSamples,
): void {
  _rcM2.multiplyMatrices(invRoot, mesh.matrixWorld);
  const stride = Math.max(1, Math.floor(position.count / 20000));
  for (let vertex = 0; vertex < position.count; vertex += stride) {
    _rcV.fromBufferAttribute(position, vertex).applyMatrix4(_rcM2);
    samples.points.push(_rcV.x, _rcV.y, _rcV.z);
    if (_rcV.y < samples.absMinYM) samples.absMinYM = _rcV.y;
  }
}

function collectRestContactSamples(
  object: THREE.Object3D,
  root: THREE.Object3D,
  invRoot: THREE.Matrix4,
  samples: RestContactSamples,
): void {
  if (!isVehicleMesh(object) && !isVehicleInstancedMesh(object)) return;
  if (!materialWritesColor(object.material)) return;
  if (!isVisibleBelowRoot(object, root)) return;
  const position = object.geometry.getAttribute?.('position');
  if (!position?.count) return;
  if (isVehicleMesh(object)) {
    const meshBottomY = centerSpanningMeshBottomY(object, invRoot);
    if (meshBottomY !== null
      && (samples.panYM === null || meshBottomY < samples.panYM)) {
      samples.panYM = meshBottomY;
    }
  }
  if (isVehicleInstancedMesh(object)) {
    appendInstancedRestContactSamples(object, position, invRoot, samples);
  } else {
    appendMeshRestContactSamples(object, position, invRoot, samples);
  }
}

export function measureRestContact(root: THREE.Object3D): RestContactReceipt | null {
  try {
    root.updateMatrixWorld(true);
    const invRoot = _rcM2.copy(root.matrixWorld).invert().clone();
    const samples: RestContactSamples = {
      points: [],
      absMinYM: Infinity,
      panYM: null,
    };
    // Hull-pan floor candidates: lowest root-local bbox bottom over
    // non-instanced meshes whose bbox SPANS the centerline (vertex sampling
    // cannot see a wide belly plate — a 1.9 m box face crossing the center
    // strip has all its vertices at the ±corners, outside any strip). Track
    // bands/skirts sit one-sided; wheels/pads are instanced — excluded.
    root.traverse((object) => {
      collectRestContactSamples(object, root, invRoot, samples);
    });
    if (!samples.points.length) return null;
    const bottomYM = robustFloorYStrided(samples.points, 1, 3);
    if (bottomYM === undefined) return null;
    // Hull-pan floor (see panConsider above). The movement belly guard used a
    // fixed 0.34 m line on the premise every pan sits ≥ 0.40 m — stale on the
    // rebuilt profiles (soviet-heavy/sepv2 bellies at 0.30): sharing the fan
    // yield there let ridge crests clip a parked pan ~15 cm. With the real
    // pan height the guard clamps HARD at the measured plate. Floored just
    // above the contact plane so keel-seated defects (sepv2) cannot collapse
    // the guard below the seated floor.
    if (samples.panYM !== null) {
      samples.panYM = Math.max(samples.panYM, bottomYM + 0.05);
    }
    const band = bottomYM + 0.05;
    let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity, n = 0;
    for (let i = 0; i < samples.points.length; i += 3) {
      if (samples.points[i + 1] > band) continue;
      const x = samples.points[i], z = samples.points[i + 2];
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      n++;
    }
    if (n < 8) {
      return {
        bottomYM,
        absMinYM: samples.absMinYM,
        panYM: samples.panYM,
        halfLenM: null,
        halfWidM: null,
        zCenterM: null,
      };
    }
    return {
      bottomYM,
      absMinYM: samples.absMinYM,
      panYM: samples.panYM,
      halfLenM: (zMax - zMin) / 2,
      halfWidM: (xMax - xMin) / 2,
      zCenterM: (zMax + zMin) / 2,
    };
  } catch (e) {
    return null; // best-effort: the solve falls back to spec fractions
  }
}

// Exact conservative lower bound of the attached, color-writing rest-pose
// subtree in root-local space. This is intentionally lazy: battle actors do
// not need a rigid presentation seat, while a garage/gallery hero pays this
// cheap bounding-box walk once when seatOnFloor is first called.
const _pfM = new THREE.Matrix4();
const _pfM2 = new THREE.Matrix4();
const _pfV = new THREE.Vector3();
export function measurePresentationFloor(root: THREE.Object3D): number | null {
  try {
    root.updateMatrixWorld(true);
    const invRoot = _pfM2.copy(root.matrixWorld).invert().clone();
    let minY = Infinity;
    const considerBox = (box: THREE.Box3, matrix: THREE.Matrix4): void => {
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            _pfV.set(x, y, z).applyMatrix4(matrix);
            minY = Math.min(minY, _pfV.y);
          }
        }
      }
    };
    root.traverse((object) => {
      if (!isVehicleMesh(object) && !isVehicleInstancedMesh(object)) return;
      if (!materialWritesColor(object.material)) return;
      for (let current: THREE.Object3D | null = object;
        current && current !== root; current = current.parent) {
        if (!current.visible) return;
      }
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox;
      if (!box || box.isEmpty()) return;
      _pfM2.multiplyMatrices(invRoot, object.matrixWorld);
      if (!isVehicleInstancedMesh(object)) {
        considerBox(box, _pfM2);
        return;
      }
      for (let instance = 0; instance < object.count; instance++) {
        object.getMatrixAt(instance, _pfM);
        const elements = _pfM.elements;
        if (Math.abs(elements[0]) + Math.abs(elements[5]) + Math.abs(elements[10]) < 1e-5) continue;
        _pfM.multiplyMatrices(_pfM2, _pfM);
        considerBox(box, _pfM);
      }
    });
    return Number.isFinite(minY) ? minY : null;
  } catch (_) {
    return null;
  }
}
