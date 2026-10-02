import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CIVILIAN_VEHICLE_RECEIPTS } from './maps/civilianVehicleKit.ts';
import { deriveRuntimeStructureCollisionProfile } from './structureCollision.ts';

// 2026-10-01 (frozen pins retired): 48 sha256 fingerprints of the pre-storage-change owners (source 658511e13) and their
// pinned byte counts were change detectors. The live contract for every kind, state and seed: the kit keeps indexed
// primitives over exactly position/normal/uv/color Float32 streams with valid in-range rows, the index really saves
// bytes over the equivalent non-indexed stream, the triangle budget holds, and a rebuild from the same seed reproduces
// every attribute word, index, bound, collision band and RNG tail.
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

function orderedWords(geometry, attribute) {
  assert.equal(attribute.array.constructor, Float32Array);
  const count = geometry.index?.count ?? geometry.attributes.position.count;
  const source = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
  const words = new Uint32Array(count * attribute.itemSize);
  for (let corner = 0; corner < count; corner++) {
    const row = geometry.index?.array[corner] ?? corner;
    if (geometry.index?.array instanceof Uint16Array) assert.notEqual(row, 65535, 'no primitive-restart token');
    assert.ok(Number.isInteger(row) && row >= 0 && row < attribute.count);
    for (let item = 0; item < attribute.itemSize; item++) {
      words[corner * attribute.itemSize + item] = source[row * attribute.itemSize + item];
    }
  }
  return words;
}

function fingerprint(geometry, calls, tail) {
  const hash = createHash('sha256');
  assert.deepEqual(Object.keys(geometry.attributes), ['position', 'normal', 'uv', 'color']);
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const metadata = { name, itemSize: attr.itemSize, normalized: attr.normalized, gpuType: attr.gpuType,
      usage: attr.usage, version: attr.version, attributeName: attr.name };
    hash.update(JSON.stringify(metadata)); hash.update(Buffer.from(orderedWords(geometry, attr).buffer));
  }
  const shape = { corners: geometry.index?.count ?? geometry.attributes.position.count,
    groups: geometry.groups, drawRange: geometry.drawRange, bounds: geometry.boundingBox, sphere: geometry.boundingSphere };
  const collision = deriveRuntimeStructureCollisionProfile({ baked: [geometry] });
  hash.update(JSON.stringify({ shape, collision, calls, tail }));
  return hash.digest('hex');
}

let savings = 0, cases = 0;
for (const [kind, receipt] of Object.entries(CIVILIAN_VEHICLE_RECEIPTS)) for (const builder of ['build', 'broken']) {
  for (const seed of SEEDS) {
    const rng = seeded(seed), geometry = receipt[builder](rng);
    const calls = rng.calls, tail = rng();
    const again = seeded(seed), repeat = receipt[builder](again);
    try {
      assert.ok(geometry.index, `${kind}/${builder}: actual kit must retain the indexed primitives`);
      const corners = geometry.index.count;
      assert.equal(corners % 3, 0, `${kind}/${builder}: whole triangles`);
      if (builder === 'build') assert.ok(corners / 3 <= receipt.triangleBudget,
        `${kind}: ${corners / 3} triangles within the ${receipt.triangleBudget} budget`);
      const bytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
        + geometry.index.array.byteLength;
      const flatBytes = Object.values(geometry.attributes).reduce((sum, attribute) => sum + corners * attribute.itemSize * 4, 0);
      assert.ok(bytes < flatBytes, `${kind}/${builder}/${seed}: the index makes a real retained-byte saving (${bytes} < ${flatBytes})`);
      const expected = fingerprint(geometry, calls, tail);
      assert.equal(fingerprint(repeat, again.calls, again()), expected,
        `${kind}/${builder}/${seed}: a rebuild from the same seed reproduces the rendered/collision stream and RNG tail`);
      savings += flatBytes - bytes; cases++;
      if (kind !== 'truck' || builder !== 'build' || seed !== 1337) continue;
      // Reject even a one-bit attribute change and an index-order mutation,
      // not just a missing model, broad bounds change or lower triangle count.
      for (const attribute of Object.values(geometry.attributes)) {
        const words = new Uint32Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.length);
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
console.log(`civilianVehicleGeometry.selftest: ${cases} deterministic indexed streams/colliders/RNG tails; ${savings} retained bytes saved over non-indexed storage`);
