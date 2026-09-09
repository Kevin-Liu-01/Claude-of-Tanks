import * as THREE from 'three';
import type { WreckBake } from './wrecks.ts';

interface WreckAttributeWire {
  array: THREE.TypedArray;
  itemSize: number;
  normalized: boolean;
  name: string;
  usage: THREE.Usage;
  gpuType: THREE.AttributeGPUType;
  version: number;
  updateRanges: Array<{ start: number; count: number }>;
}

type VectorWire = [number, number, number];

interface WreckGeometryWire {
  name: string;
  type: string;
  attributes: Array<[string, WreckAttributeWire]>;
  index: WreckAttributeWire | null;
  morphAttributes: Array<[string, WreckAttributeWire[]]>;
  morphTargetsRelative: boolean;
  groups: THREE.BufferGeometry['groups'];
  drawRange: { start: number; count: number };
  indirectOffset: number | number[];
  userData: Record<string, unknown>;
  box: [VectorWire, VectorWire] | null;
  sphere: { center: VectorWire; radius: number } | null;
}

export interface WreckBakeWire {
  geo: WreckGeometryWire;
  shadowGeo: WreckGeometryWire | null;
  hx: number;
  hz: number;
  h: number;
  tris: number;
}

function packAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  buffers: Set<ArrayBuffer>,
): WreckAttributeWire {
  // Static wrecks have CPU-owned, non-interleaved streams. Reject formats
  // whose interpretation a plain BufferAttribute would silently change.
  if (!(attribute instanceof THREE.BufferAttribute)
      || 'isInstancedBufferAttribute' in attribute
      || 'isFloat16BufferAttribute' in attribute) {
    throw new TypeError('Unsupported static wreck buffer attribute');
  }
  if (!(attribute.array.buffer instanceof ArrayBuffer)) {
    throw new TypeError('Static wreck buffers must be transferable ArrayBuffers');
  }
  if (attribute.count !== attribute.array.length / attribute.itemSize) {
    throw new TypeError('Static wreck attribute count does not match its array');
  }
  buffers.add(attribute.array.buffer);
  return {
    array: attribute.array,
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
    name: attribute.name,
    usage: attribute.usage,
    gpuType: attribute.gpuType,
    version: attribute.version,
    updateRanges: attribute.updateRanges.map(range => ({ ...range })),
  };
}

function packGeometry(geometry: THREE.BufferGeometry, buffers: Set<ArrayBuffer>): WreckGeometryWire {
  if (geometry.indirect || geometry instanceof THREE.InstancedBufferGeometry) {
    throw new TypeError('Unsupported static wreck geometry');
  }
  return {
    name: geometry.name,
    type: geometry.type,
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) =>
      [name, packAttribute(attribute, buffers)]),
    index: geometry.index ? packAttribute(geometry.index, buffers) : null,
    morphAttributes: Object.entries(geometry.morphAttributes).map(([name, attributes]) =>
      [name, attributes.map(attribute => packAttribute(attribute, buffers))]),
    morphTargetsRelative: geometry.morphTargetsRelative,
    groups: geometry.groups.map(group => ({ ...group })),
    drawRange: { ...geometry.drawRange },
    indirectOffset: Array.isArray(geometry.indirectOffset)
      ? [...geometry.indirectOffset] : geometry.indirectOffset,
    userData: geometry.userData,
    box: geometry.boundingBox
      ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()] : null,
    sphere: geometry.boundingSphere
      ? { center: geometry.boundingSphere.center.toArray(), radius: geometry.boundingSphere.radius } : null,
  };
}

/** Zero-copy handoff. Transferring this wire consumes the original bake's
 * array buffers; callers must not render or otherwise reuse that bake.
 * Arrays stay typed views, retaining byte offsets and shared-buffer aliases.
 * Allocation IDs/UUIDs and event callbacks are deliberately not wire data.
 */
export function packWreckBake(baked: WreckBake): { wire: WreckBakeWire; transfer: ArrayBuffer[] } {
  const buffers = new Set<ArrayBuffer>();
  const wire: WreckBakeWire = {
    geo: packGeometry(baked.geo, buffers),
    shadowGeo: baked.shadowGeo ? packGeometry(baked.shadowGeo, buffers) : null,
    hx: baked.hx,
    hz: baked.hz,
    h: baked.h,
    tris: baked.tris,
  };
  return { wire, transfer: [...buffers] };
}

function unpackAttribute(wire: WreckAttributeWire): THREE.BufferAttribute {
  // Unlike the typed convenience subclasses, this constructor does not copy.
  const attribute = new THREE.BufferAttribute(wire.array, wire.itemSize, wire.normalized);
  attribute.name = wire.name;
  attribute.usage = wire.usage;
  attribute.gpuType = wire.gpuType;
  attribute.version = wire.version;
  attribute.updateRanges = wire.updateRanges.map(range => ({ ...range }));
  return attribute;
}

function unpackGeometry(wire: WreckGeometryWire): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  try {
    Object.assign(geometry, { name: wire.name, type: wire.type });
    geometry.attributes = Object.fromEntries(wire.attributes.map(([name, attribute]) =>
      [name, unpackAttribute(attribute)]));
    geometry.setIndex(wire.index ? unpackAttribute(wire.index) : null);
    geometry.morphAttributes = Object.fromEntries(wire.morphAttributes.map(([name, attributes]) =>
      [name, attributes.map(unpackAttribute)]));
    geometry.morphTargetsRelative = wire.morphTargetsRelative;
    geometry.groups = wire.groups.map(group => ({ ...group }));
    geometry.drawRange = { ...wire.drawRange };
    geometry.indirectOffset = Array.isArray(wire.indirectOffset)
      ? [...wire.indirectOffset] : wire.indirectOffset;
    geometry.userData = wire.userData;
    geometry.boundingBox = wire.box
      ? new THREE.Box3(new THREE.Vector3(...wire.box[0]), new THREE.Vector3(...wire.box[1])) : null;
    geometry.boundingSphere = wire.sphere
      ? new THREE.Sphere(new THREE.Vector3(...wire.sphere.center), wire.sphere.radius) : null;
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

/** Inflate only wrappers and existing bounds: never merge, paint, scan,
 * normalize, compact, or recompute any geometry on the receiving thread.
 */
export function unpackWreckBake(wire: WreckBakeWire): WreckBake {
  const geo = unpackGeometry(wire.geo);
  try {
    return {
      geo,
      shadowGeo: wire.shadowGeo ? unpackGeometry(wire.shadowGeo) : null,
      hx: wire.hx,
      hz: wire.hz,
      h: wire.h,
      tris: wire.tris,
    };
  } catch (error) {
    geo.dispose();
    throw error;
  }
}
