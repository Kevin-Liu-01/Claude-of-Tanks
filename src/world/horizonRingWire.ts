// The horizon ring pipeline on the wire (2026-10-08, the time-to-battle lane): what horizonRingGeometrySteps returns,
// packed for a worker's postMessage (every typed array transferred, nothing copied) and unpacked into the same pipeline
// on the page. The geometry travels as its attributes (insertion order, item size, normalisation, the arrays), its
// index, groups, draw range, userData and bounds; everything else in the pipeline is plain data and typed arrays and
// goes by structured clone as it is — a field a later pass adds (a new array on the relief bake, say) rides through
// with no change here.
import * as THREE from 'three';
import type { HorizonRingPipeline } from './maps/horizon.ts';

interface GeometryWire {
  name: string;
  attributes: Array<{ name: string; array: THREE.TypedArray; itemSize: number; normalized: boolean }>;
  index: THREE.TypedArray | null;
  groups: Array<{ start: number; count: number; materialIndex?: number }>;
  drawRange: { start: number; count: number };
  userData: Record<string, unknown>;
  boundingSphere: [number, number, number, number] | null;
  boundingBox: [number, number, number, number, number, number] | null;
}

export interface HorizonRingWire {
  pipeline: Omit<HorizonRingPipeline, 'geometry'>;
  geometry: GeometryWire;
}

function packGeometry(geometry: THREE.BufferGeometry): GeometryWire {
  const attributes: GeometryWire['attributes'] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error(`horizon ring: interleaved ${name}`);
    const a = attribute as THREE.BufferAttribute;
    attributes.push({ name, array: a.array, itemSize: a.itemSize, normalized: a.normalized });
  }
  if (Object.keys(geometry.morphAttributes).length) throw new Error('horizon ring: morph attributes do not travel');
  const s = geometry.boundingSphere, b = geometry.boundingBox;
  return {
    name: geometry.name, attributes, index: geometry.index ? geometry.index.array : null,
    groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
    drawRange: { start: geometry.drawRange.start, count: geometry.drawRange.count },
    userData: geometry.userData,
    boundingSphere: s ? [s.center.x, s.center.y, s.center.z, s.radius] : null,
    boundingBox: b ? [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z] : null,
  };
}

function unpackGeometry(wire: GeometryWire): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.name = wire.name;
  for (const { name, array, itemSize, normalized } of wire.attributes) geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized));
  if (wire.index) geometry.setIndex(new THREE.BufferAttribute(wire.index, 1));
  for (const { start, count, materialIndex } of wire.groups) geometry.addGroup(start, count, materialIndex);
  geometry.setDrawRange(wire.drawRange.start, wire.drawRange.count);
  geometry.userData = wire.userData;
  if (wire.boundingSphere) {
    const [x, y, z, r] = wire.boundingSphere;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), r);
  }
  if (wire.boundingBox) {
    const [a, b, c, d, e, f] = wire.boundingBox;
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f));
  }
  return geometry;
}

/** Every ArrayBuffer reachable in a value (each once): the wire's transfer list. */
function buffersOf(value: unknown, out: Set<ArrayBuffer> = new Set(), seen: Set<object> = new Set()): Set<ArrayBuffer> {
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer);
    return out;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) buffersOf(child, out, seen);
  return out;
}

/** The pipeline packed for postMessage: the wire and the buffers to transfer (the worker's own arrays, handed over). */
export function packHorizonRing(pipeline: HorizonRingPipeline): { wire: HorizonRingWire; transfer: ArrayBuffer[] } {
  const { geometry, ...rest } = pipeline;
  const wire: HorizonRingWire = { pipeline: rest, geometry: packGeometry(geometry) };
  return { wire, transfer: [...buffersOf(wire)] };
}

/** The pipeline back from its wire (the wire's arrays become the pipeline's: unpack a copy to keep the wire). */
export function unpackHorizonRing(wire: HorizonRingWire): HorizonRingPipeline {
  return { ...wire.pipeline, geometry: unpackGeometry(wire.geometry) };
}

/** A deep copy of a wire, every array its own (the same-map cache keeps one and hands out copies of it). */
export function copyHorizonRingWire(wire: HorizonRingWire): HorizonRingWire {
  return structuredClone(wire);
}
