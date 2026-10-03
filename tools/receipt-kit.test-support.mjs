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
