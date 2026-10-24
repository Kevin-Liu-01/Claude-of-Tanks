// A broken vehicle body built off the main thread (perf-248). A burnt civilian vehicle's or a broken cart's body is the
// kit's own builder from a seed its pool spends a fixed number of the destructible stream's draws for
// (civilianVehicleKit.ts, cartKit.ts `spending`), so the props build takes the draws in order and posts the job; the
// broken-vehicle pool's worker builds the body (brokenVehicleBuild.ts) and sends it back on this wire, or the build makes
// it at its join from the same job. The wire carries the geometry exactly: its attributes (insertion order, item size,
// normalisation, the arrays), index, draw range, bounds, name and userData (a Box3 rebuilt as one).
import * as THREE from 'three';

export interface BrokenVehicleJob {
  readonly kit: 'civilian' | 'cart';
  readonly mapId: string;
  readonly mobile: boolean;
  readonly role: string;
  readonly seed: number;
}

interface AttributeWire { name: string; array: THREE.TypedArray; itemSize: number; normalized: boolean }

export interface BrokenVehicleGeometryWire {
  name: string;
  attributes: AttributeWire[];
  index: THREE.TypedArray | null;
  drawRange: [number, number];
  boundingSphere: [number, number, number, number] | null;
  boundingBox: [number, number, number, number, number, number] | null;
  userData: Record<string, unknown>;
  /** userData keys whose values were Box3 (sent as their six numbers) */
  boxes: string[];
}

const boxValues = (box: THREE.Box3): [number, number, number, number, number, number] =>
  [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
const boxOf = (v: readonly number[]): THREE.Box3 =>
  new THREE.Box3(new THREE.Vector3(v[0], v[1], v[2]), new THREE.Vector3(v[3], v[4], v[5]));

/** The geometry packed for postMessage, and its buffers to transfer. */
export function packBrokenVehicleGeometry(geometry: THREE.BufferGeometry): { wire: BrokenVehicleGeometryWire; transfer: ArrayBuffer[] } {
  if (geometry.groups.length || Object.keys(geometry.morphAttributes).length) {
    throw new Error('broken vehicle: groups and morph attributes do not travel');
  }
  const transfer = new Set<ArrayBuffer>();
  const attributes: AttributeWire[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error(`broken vehicle: interleaved ${name}`);
    const a = attribute as THREE.BufferAttribute;
    attributes.push({ name, array: a.array, itemSize: a.itemSize, normalized: a.normalized });
    transfer.add(a.array.buffer as ArrayBuffer);
  }
  const index = geometry.index ? geometry.index.array : null;
  if (index) transfer.add(index.buffer as ArrayBuffer);
  const userData: Record<string, unknown> = {};
  const boxes: string[] = [];
  for (const [key, value] of Object.entries(geometry.userData)) {
    if ((value as THREE.Box3 | null)?.isBox3) { userData[key] = boxValues(value as THREE.Box3); boxes.push(key); continue; }
    userData[key] = value;
    if (ArrayBuffer.isView(value)) transfer.add(value.buffer as ArrayBuffer);
  }
  const s = geometry.boundingSphere, b = geometry.boundingBox;
  return {
    wire: {
      name: geometry.name, attributes, index, drawRange: [geometry.drawRange.start, geometry.drawRange.count],
      boundingSphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null, boundingBox: b ? boxValues(b) : null,
      userData, boxes,
    },
    transfer: [...transfer],
  };
}

/** The geometry back from its wire (the wire's arrays become the geometry's). */
export function unpackBrokenVehicleGeometry(wire: BrokenVehicleGeometryWire): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = wire.name;
  for (const { name, array, itemSize, normalized } of wire.attributes) geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized));
  if (wire.index) geometry.setIndex(new THREE.BufferAttribute(wire.index, 1));
  geometry.setDrawRange(wire.drawRange[0], wire.drawRange[1]);
  if (wire.boundingSphere) {
    const [x, y, z, r] = wire.boundingSphere;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
  }
  if (wire.boundingBox) geometry.boundingBox = boxOf(wire.boundingBox);
  const userData: Record<string, unknown> = { ...wire.userData };
  for (const key of wire.boxes) userData[key] = boxOf(userData[key] as number[]);
  geometry.userData = userData;
  return geometry;
}
