// src/world/maps/fractureWreckWire.ts — (the destructible-kits lane, 2026-10-11) a settled wreck's geometry across the
// worker boundary (fractureWreckWorker.ts -> fractureWreckClient.ts): its attribute arrays transferred, not copied, and
// wrapped again on the page without a pass over a vertex. A wreck is plain, non-interleaved streams (fractureSettle.ts
// finish, the night mask); anything else is refused rather than silently reinterpreted.
import * as THREE from 'three';

type WireArray = Float32Array | Uint8Array | Uint16Array | Uint32Array | Int8Array | Int16Array | Int32Array;

interface AttributeWire { name: string; array: WireArray; itemSize: number; normalized: boolean }

export interface FractureWreckWire {
  attributes: AttributeWire[];
  index: AttributeWire | null;
  groups: Array<{ start: number; count: number; materialIndex?: number }>;
}

function packAttribute(name: string, attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  buffers: Set<ArrayBuffer>): AttributeWire {
  if (!(attribute instanceof THREE.BufferAttribute) || attribute instanceof THREE.InstancedBufferAttribute) {
    throw new TypeError(`fracture wreck: ${name} is not a plain buffer attribute`);
  }
  const array = attribute.array as WireArray;
  if (!(array.buffer instanceof ArrayBuffer)) throw new TypeError(`fracture wreck: ${name} is not on a transferable buffer`);
  buffers.add(array.buffer);
  return { name, array, itemSize: attribute.itemSize, normalized: attribute.normalized };
}

/** Packs a wreck for postMessage; transferring the list detaches the geometry's arrays (dispose it, never draw it). */
export function packFractureWreck(geometry: THREE.BufferGeometry): { wire: FractureWreckWire; transfer: ArrayBuffer[] } {
  const buffers = new Set<ArrayBuffer>();
  const wire: FractureWreckWire = {
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => packAttribute(name, attribute, buffers)),
    index: geometry.index ? packAttribute('index', geometry.index, buffers) : null,
    groups: geometry.groups.map((group) => ({ ...group })),
  };
  return { wire, transfer: [...buffers] };
}

/** The wreck again on this side: wrappers only. */
export function unpackFractureWreck(wire: FractureWreckWire): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const a of wire.attributes) geometry.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (wire.index) geometry.setIndex(new THREE.BufferAttribute(wire.index.array, 1, wire.index.normalized));
  for (const group of wire.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  return geometry;
}
