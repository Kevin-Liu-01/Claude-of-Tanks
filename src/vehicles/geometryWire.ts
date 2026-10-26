// A BufferGeometry across a realm (UI-LOCKDOWN E, 2026-10-25): its attributes' arrays (copied, so the sender keeps its
// geometry, and transferable), index, groups, draw range, bounds and userData. The riding-parts prebuild
// (ridingPartsWire.ts) and the decor worker (decorPlanWire.ts, tankGraphWire.ts) post geometry on it. A morph target or
// an interleaved attribute does not travel: the sender throws, and its caller builds in-line instead.
import * as THREE from 'three';

interface AttributeWire {
  readonly array: Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array;
  readonly itemSize: number;
  readonly normalized: boolean;
  readonly name: string;
  readonly usage: number;
  readonly gpuType: number;
}
export interface GeometryWire {
  readonly name: string;
  readonly attributes: readonly (readonly [string, AttributeWire])[];
  readonly index: AttributeWire | null;
  readonly groups: readonly { start: number; count: number; materialIndex?: number }[];
  readonly drawRange: { start: number; count: number };
  readonly boundingBox: readonly number[] | null;
  readonly boundingSphere: readonly number[] | null;
  readonly userData: unknown;
}

function attributeWire(attribute: THREE.BufferAttribute): AttributeWire {
  const array = attribute.array as AttributeWire['array'];
  return { array: array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized, name: attribute.name,
    usage: attribute.usage, gpuType: attribute.gpuType };
}

/** The geometry as it travels; `userData` encodes its userData (by default a structured clone of plain values). */
export function geometryWire(geometry: THREE.BufferGeometry,
  userData: (value: Record<string, unknown>) => unknown = (value) => structuredClone(value)): GeometryWire {
  if (Object.keys(geometry.morphAttributes).length) throw new Error('geometry wire: a morph target does not travel');
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error('geometry wire: an interleaved attribute does not travel');
    return [name, attributeWire(attribute as THREE.BufferAttribute)] as const;
  });
  const box = geometry.boundingBox, sphere = geometry.boundingSphere;
  return {
    name: geometry.name, attributes, index: geometry.index ? attributeWire(geometry.index) : null,
    groups: geometry.groups.map((group) => ({ ...group })), drawRange: { ...geometry.drawRange },
    boundingBox: box ? [...box.min.toArray(), ...box.max.toArray()] : null,
    boundingSphere: sphere ? [...sphere.center.toArray(), sphere.radius] : null,
    userData: userData(geometry.userData),
  };
}

function attributeFrom(wire: AttributeWire): THREE.BufferAttribute {
  const attribute = new THREE.BufferAttribute(wire.array, wire.itemSize, wire.normalized);
  attribute.name = wire.name;
  attribute.usage = wire.usage as THREE.Usage;
  attribute.gpuType = wire.gpuType as THREE.AttributeGPUType;
  return attribute;
}

/** The geometry rebuilt; `userData` decodes what geometryWire encoded. */
export function geometryFrom(wire: GeometryWire,
  userData: (value: unknown) => Record<string, unknown> = (value) => value as Record<string, unknown>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = wire.name;
  for (const [name, attribute] of wire.attributes) geometry.setAttribute(name, attributeFrom(attribute));
  if (wire.index) geometry.setIndex(attributeFrom(wire.index));
  for (const group of wire.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(wire.drawRange.start, wire.drawRange.count);
  if (wire.boundingBox) {
    const [x0 = 0, y0 = 0, z0 = 0, x1 = 0, y1 = 0, z1 = 0] = wire.boundingBox;
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  }
  if (wire.boundingSphere) {
    const [x = 0, y = 0, z = 0, r = 0] = wire.boundingSphere;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
  }
  geometry.userData = userData(wire.userData);
  return geometry;
}

/** Add the arrays a geometry wire can hand over without a copy. */
export function addGeometryBuffers(wire: GeometryWire, buffers: Set<ArrayBuffer>): void {
  for (const [, attribute] of wire.attributes) buffers.add(attribute.array.buffer as ArrayBuffer);
  if (wire.index) buffers.add(wire.index.array.buffer as ArrayBuffer);
}
