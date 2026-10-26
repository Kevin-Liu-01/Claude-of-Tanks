// The riding parts' wire (UI-LOCKDOWN E, 2026-10-25): the riding-parts worker (ridingPartsWorker.ts) posts the entries it
// builds into ridingPartsCache.ts's stores as transferable arrays, and the prebuild (ridingPartsPrebuild.ts) seeds them.
import * as THREE from 'three';
import type { RidingCradleFit } from './machineGunGeometry.ts';
import { RIDING_CRADLE_PARTS, RIDING_STATION_PARTS } from './ridingPartsCache.ts';

/** The public fitting (KIT.fittings) that builds a key's entry, and the options it was built with (mats aside). */
export function ridingPartsSource(key: string): { readonly fitting: string; readonly options: Record<string, unknown> } | null {
  const at = key.indexOf('{');
  if (at < 0) return null;
  const prefix = key.slice(0, at);
  const fitting = prefix === '' ? 'pintleMG' : prefix === 'americanM2:' ? 'americanM2' : prefix === 'americanRws:' ? 'americanRws'
    : prefix === 'openYokeRws:' ? 'openYokeRws' : null;
  return fitting ? { fitting, options: JSON.parse(key.slice(at)) as Record<string, unknown> } : null;
}

interface AttributeWire {
  readonly array: Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array;
  readonly itemSize: number;
  readonly normalized: boolean;
  readonly name: string;
  readonly usage: number;
  readonly gpuType: number;
}
interface GeometryWire {
  readonly name: string;
  readonly attributes: readonly (readonly [string, AttributeWire])[];
  readonly index: AttributeWire | null;
  readonly groups: readonly { start: number; count: number; materialIndex?: number }[];
  readonly drawRange: { start: number; count: number };
  readonly boundingBox: readonly number[] | null;
  readonly boundingSphere: readonly number[] | null;
  readonly userData: Record<string, unknown>;
}
/** One entry as a worker posts it: its slots' geometries as transferable arrays, and a cradle's fit. */
export interface RidingPartsWire {
  readonly key: string;
  readonly sets: readonly (readonly (readonly [string, readonly GeometryWire[]])[])[];
  readonly fit: RidingCradleFit | null;
}

function attributeWire(attribute: THREE.BufferAttribute): AttributeWire {
  const array = attribute.array as AttributeWire['array'];
  return { array: array.slice(), itemSize: attribute.itemSize, normalized: attribute.normalized, name: attribute.name,
    usage: attribute.usage, gpuType: attribute.gpuType };
}
function geometryWire(geometry: THREE.BufferGeometry): GeometryWire {
  if (Object.keys(geometry.morphAttributes).length) throw new Error('riding parts: a morph target does not travel');
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
    if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) throw new Error('riding parts: an interleaved attribute does not travel');
    return [name, attributeWire(attribute as THREE.BufferAttribute)] as const;
  });
  const box = geometry.boundingBox, sphere = geometry.boundingSphere;
  return {
    name: geometry.name, attributes, index: geometry.index ? attributeWire(geometry.index) : null,
    groups: geometry.groups.map((group) => ({ ...group })), drawRange: { ...geometry.drawRange },
    boundingBox: box ? [...box.min.toArray(), ...box.max.toArray()] : null,
    boundingSphere: sphere ? [...sphere.center.toArray(), sphere.radius] : null,
    // structured clone carries the plain values a fitting's geometry stamps (flags, slot names, number lists)
    userData: structuredClone(geometry.userData) as Record<string, unknown>,
  };
}
function attributeFrom(wire: AttributeWire): THREE.BufferAttribute {
  const attribute = new THREE.BufferAttribute(wire.array, wire.itemSize, wire.normalized);
  attribute.name = wire.name;
  attribute.usage = wire.usage as THREE.Usage;
  attribute.gpuType = wire.gpuType as THREE.AttributeGPUType;
  return attribute;
}
function geometryFrom(wire: GeometryWire): THREE.BufferGeometry {
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
  geometry.userData = wire.userData;
  return geometry;
}

/** A cached entry as a worker posts it (null when the key holds none). */
export function ridingPartsWire(key: string): RidingPartsWire | null {
  const cradle = RIDING_CRADLE_PARTS.get(key), station = cradle ? null : RIDING_STATION_PARTS.get(key);
  const slots = cradle?.parts ?? station;
  if (!slots) return null;
  return { key, sets: slots.map((set) => set.map(([slot, geos]) => [slot, geos.map(geometryWire)] as const)),
    fit: cradle ? structuredClone(cradle.fit) : null };
}

/** The arrays a wire can hand over without a copy. */
export function ridingPartsTransfer(wire: RidingPartsWire): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const set of wire.sets) for (const [, geos] of set) for (const geometry of geos) {
    for (const [, attribute] of geometry.attributes) buffers.add(attribute.array.buffer as ArrayBuffer);
    if (geometry.index) buffers.add(geometry.index.array.buffer as ArrayBuffer);
  }
  return [...buffers];
}

/** Seed an entry a worker built; a key a build already filled keeps its own. Returns whether it was seeded. */
export function seedRidingParts(wire: RidingPartsWire): boolean {
  if (RIDING_CRADLE_PARTS.has(wire.key) || RIDING_STATION_PARTS.has(wire.key)) return false;
  const parts = wire.sets.map((set) => set.map(([slot, geos]) => [slot, geos.map(geometryFrom)] as const));
  if (wire.fit) RIDING_CRADLE_PARTS.set(wire.key, { parts, fit: wire.fit });
  else RIDING_STATION_PARTS.set(wire.key, parts);
  return true;
}

/** Every key the caches hold (built in-line or seeded). */
export function ridingPartKeys(): string[] {
  return [...RIDING_CRADLE_PARTS.keys(), ...RIDING_STATION_PARTS.keys()];
}
