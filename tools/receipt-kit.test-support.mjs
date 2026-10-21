// The receipts' shared test kit (gate plan "a shared test kit", 2026-10-02): the tolerance assertions and the geometry
// digest about 120 receipts each used to define for themselves. Node built-ins only, so importing it adds this one
// file to a receipt's cached input closure. tools/receipt-kit.selftest.mjs pins the boundaries and the digest layout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Assert a finite `actual` within `tolerance` of `expected`, bounds included. */
export function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected} ±${tolerance}`);
}

/** near() with the bound excluded: |actual - expected| < tolerance. */
export function nearStrict(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance,
    `${label}: ${actual} vs ${expected} ±${tolerance} (exclusive)`);
}

const bytesOf = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/**
 * sha256 (hex) of a BufferGeometry: each attribute in name order (its name, with `layout` its item size and
 * normalized flag, then the bytes of its own view), the index bytes, and with `groups` the draw groups as JSON.
 */
export function geometryHash(geometry, { layout = false, groups = false } = {}) {
  const hash = createHash('sha256');
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name];
    hash.update(name);
    if (layout) hash.update(String(attribute.itemSize)).update(String(attribute.normalized));
    hash.update(bytesOf(attribute.array));
  }
  if (geometry.index) hash.update(bytesOf(geometry.index.array));
  if (groups) hash.update(JSON.stringify(geometry.groups));
  return hash.digest('hex');
}

// A failing assert.equal/deepEqual on three.js objects dumps and diffs both operands whole (depth 1000, every typed-array
// element): two scene graphs reached 28-40 GB in the 226 gate. tools/object3d-assert-lint.mjs bans those operands.
const GRAPH_FLAGS = ['isObject3D', 'isBufferGeometry', 'isMaterial', 'isTexture', 'isSource', 'isBufferAttribute',
  'isInterleavedBufferAttribute', 'isInterleavedBuffer', 'isSkeleton'];
const graphSerials = new WeakMap();
let nextGraphSerial = 1;

/**
 * A deepEqual-safe view of `value`: each three.js graph object (Object3D, geometry, attribute, material, texture) becomes
 * a short identity label, `Mesh "hull" #12`, whose serial is fixed per object for the process, so two labels are equal
 * exactly when they name the same object; so does a fixture's stand-in node with its own `parent`. Arrays, plain
 * records, Maps and Sets are copied with their sharing and cycles kept; every other value stays itself.
 */
export function graphLabels(value, copies = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  // A three.js object, or a fixture's stand-in node (anything that links up a tree through its own `parent`): deepEqual
  // stops at the first identical reference, so these compare by identity.
  if (GRAPH_FLAGS.some((flag) => value[flag] === true) || (!Array.isArray(value) && Object.hasOwn(value, 'parent'))) {
    if (!graphSerials.has(value)) graphSerials.set(value, nextGraphSerial++);
    const type = typeof value.type === 'string' && value.type ? value.type : value.constructor?.name ?? 'Object';
    return `${type}${typeof value.name === 'string' && value.name ? ` ${JSON.stringify(value.name)}` : ''} #${graphSerials.get(value)}`;
  }
  if (copies.has(value)) return copies.get(value);
  if (Array.isArray(value)) {
    const copy = [];
    copies.set(value, copy);
    for (const item of value) copy.push(graphLabels(item, copies));
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map();
    copies.set(value, copy);
    for (const [key, item] of value) copy.set(graphLabels(key, copies), graphLabels(item, copies));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    copies.set(value, copy);
    for (const item of value) copy.add(graphLabels(item, copies));
    return copy;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy = Object.create(prototype);
  copies.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = graphLabels(item, copies);
  return copy;
}
