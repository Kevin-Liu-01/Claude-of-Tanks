import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CIVILIAN_VEHICLE_RECEIPTS } from './maps/civilianVehicleKit.ts';
import { LEGACY_DRAWS } from './maps/civilianVehicleLegacy.ts';

// The map-vehicles lane (2026-10-05): the kit's geometry contract for every role, both states and three seeds — one
// indexed geometry over exactly position / normal / uv / colour (Float32) and the surface stream `surf` (normalized
// bytes: roughness, metalness, paint mask) with valid in-range rows, an index that really saves bytes over the
// non-indexed stream, and a rebuild from the same seed that reproduces every attribute word, index, bound and the RNG
// tail (the builder spends exactly the legacy builder's draws).
const SEEDS = [1337, 2049, 7719];
function seeded(seed) {
  const next = () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    next.calls++;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  next.calls = 0;
  return next;
}

function fingerprint(geometry, calls, tail) {
  const hash = createHash('sha256');
  assert.deepEqual(Object.keys(geometry.attributes), ['position', 'normal', 'uv', 'color', 'surf']);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const isSurf = name === 'surf';
    assert.equal(attr.array.constructor, isSurf ? Uint8Array : Float32Array, `${name} storage`);
    assert.equal(attr.normalized, isSurf, `${name} normalization`);
    hash.update(name); hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
  }
  const index = geometry.index;
  for (let i = 0; i < index.count; i++) {
    const row = index.array[i];
    assert.ok(Number.isInteger(row) && row >= 0 && row < geometry.attributes.position.count, 'index rows in range');
  }
  if (index.array instanceof Uint16Array) assert.ok(!index.array.includes(65535), 'no primitive-restart token');
  hash.update(Buffer.from(index.array.buffer, index.array.byteOffset, index.array.byteLength));
  hash.update(JSON.stringify({ bounds: geometry.boundingBox, sphere: geometry.boundingSphere, calls, tail }));
  return hash.digest('hex');
}

let savings = 0, cases = 0;
for (const [kind, receipt] of Object.entries(CIVILIAN_VEHICLE_RECEIPTS)) for (const builder of ['build', 'broken']) {
  for (const seed of SEEDS) {
    const rng = seeded(seed), geometry = receipt[builder](rng);
    const calls = rng.calls, tail = rng();
    assert.equal(calls, LEGACY_DRAWS[kind][builder], `${kind}/${builder}: the legacy builder's draws from the stream`);
    const again = seeded(seed), repeat = receipt[builder](again);
    try {
      assert.ok(geometry.index, `${kind}/${builder}: indexed`);
      const corners = geometry.index.count;
      assert.equal(corners % 3, 0, `${kind}/${builder}: whole triangles`);
      if (builder === 'build') assert.ok(corners / 3 <= receipt.triangleBudget, `${kind}: ${corners / 3} within ${receipt.triangleBudget}`);
      const bytes = Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) + geometry.index.array.byteLength;
      const flat = Object.values(geometry.attributes).reduce((sum, a) => sum + corners * a.itemSize * a.array.BYTES_PER_ELEMENT, 0);
      assert.ok(bytes < flat, `${kind}/${builder}/${seed}: the index saves bytes (${bytes} < ${flat})`);
      const expected = fingerprint(geometry, calls, tail);
      assert.equal(fingerprint(repeat, again.calls, again()), expected, `${kind}/${builder}/${seed}: a rebuild reproduces the streams and the RNG tail`);
      savings += flat - bytes; cases++;
      if (kind !== 'truck' || builder !== 'build' || seed !== 1337) continue;
      // reject a one-bit attribute change and an index-order mutation
      for (const attribute of Object.values(geometry.attributes)) {
        const words = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
        words[0] ^= 1;
        assert.notEqual(fingerprint(geometry, calls, tail), expected);
        words[0] ^= 1;
      }
      const indices = geometry.index.array;
      [indices[0], indices[1]] = [indices[1], indices[0]];
      assert.notEqual(fingerprint(geometry, calls, tail), expected, 'triangle winding/order is preserved');
      [indices[0], indices[1]] = [indices[1], indices[0]];
      assert.equal(fingerprint(geometry, calls, tail), expected, 'negative-control mutations are fully restored');
    } finally { geometry.dispose(); repeat.dispose(); }
  }
}
assert.equal(cases, Object.keys(CIVILIAN_VEHICLE_RECEIPTS).length * 2 * SEEDS.length, 'every kind, both states and three seeds');
console.log(`civilianVehicleGeometry.selftest: ${cases} deterministic indexed streams and RNG tails; ${savings} bytes saved over non-indexed storage`);
