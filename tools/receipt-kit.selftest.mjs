// The shared receipt kit (receipt-kit.test-support.mjs): near() includes its bound and nearStrict() excludes it, both
// reject non-finite values and name the label and both values; geometryHash() follows its documented layout (checked
// against an independent digest, not a pinned literal), reads each attribute's own view, ignores attribute insertion
// order and sees every byte, the index, and with its options the attribute layout and the draw groups.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BufferAttribute, BufferGeometry } from 'three';
import { geometryHash, near, nearStrict } from './receipt-kit.test-support.mjs';

near(1.25, 1, 0.25, 'bound included');
near(-3, -3, 0, 'exact');
assert.throws(() => near(1.2501, 1, 0.25, 'beyond the bound'), { message: 'beyond the bound: 1.2501 vs 1 ±0.25' });
assert.throws(() => near(Number.NaN, 1, Infinity, 'nan'), /^AssertionError/);
assert.throws(() => near(Infinity, 1, Infinity, 'infinite actual'), { message: 'infinite actual: Infinity vs 1 ±Infinity' });
nearStrict(1.2, 1, 0.25, 'inside');
assert.throws(() => nearStrict(1.25, 1, 0.25, 'on the bound'), { message: 'on the bound: 1.25 vs 1 ±0.25 (exclusive)' });
assert.throws(() => nearStrict(Number.NaN, 0, 1, 'nan'), /nan: NaN vs 0 ±1 \(exclusive\)/);

function geometry({ order = ['position', 'normal'], offset = 0, positionValue = 0, index = [0, 1, 2], groups = [] } = {}) {
  const g = new BufferGeometry();
  const backing = new Float32Array(offset + 9).fill(7);
  const positions = backing.subarray(offset, offset + 9);
  positions.set([positionValue, 0, 0, 1, 0, 0, 0, 1, 0]);
  const attributes = { position: new BufferAttribute(positions, 3), normal: new BufferAttribute(new Float32Array(9).fill(1), 3) };
  for (const name of order) g.setAttribute(name, attributes[name]);
  if (index) g.setIndex(index);
  for (const [start, count] of groups) g.addGroup(start, count);
  return g;
}
const view = (array) => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
function independentDigest(g) {
  const hash = createHash('sha256');
  for (const name of ['normal', 'position']) hash.update(name).update(view(g.attributes[name].array));
  hash.update(view(g.index.array));
  return hash.digest('hex');
}

const base = geometry();
assert.equal(geometryHash(base), independentDigest(base), 'name-sorted name and view bytes per attribute, then the index');
assert.match(geometryHash(base), /^[0-9a-f]{64}$/);
assert.equal(geometryHash(geometry({ order: ['normal', 'position'] })), geometryHash(base), 'attribute insertion order is not identity');
assert.equal(geometryHash(geometry({ offset: 5 })), geometryHash(base), 'an attribute viewing a larger buffer hashes its own bytes only');
assert.notEqual(geometryHash(geometry({ positionValue: 1e-7 })), geometryHash(base), 'one moved vertex changes the digest');
assert.notEqual(geometryHash(geometry({ index: [0, 2, 1] })), geometryHash(base), 'the index is part of the digest');
assert.notEqual(geometryHash(geometry({ index: null })), geometryHash(base), 'an unindexed copy differs');
const renamed = geometry();
renamed.setAttribute('uv', renamed.getAttribute('normal'));
renamed.deleteAttribute('normal');
assert.notEqual(geometryHash(renamed), geometryHash(base), 'attribute names are part of the digest');

const relaid = geometry();
relaid.setAttribute('normal', new BufferAttribute(new Float32Array(9).fill(1), 9));
assert.equal(geometryHash(relaid), geometryHash(base), 'without layout the item size is not identity');
assert.notEqual(geometryHash(relaid, { layout: true }), geometryHash(base, { layout: true }), 'layout covers the item size');
const normalized = geometry();
normalized.getAttribute('normal').normalized = true;
assert.notEqual(geometryHash(normalized, { layout: true }), geometryHash(base, { layout: true }), 'layout covers the normalized flag');
const grouped = geometry({ groups: [[0, 3]] });
assert.equal(geometryHash(grouped), geometryHash(base), 'without groups the draw groups are not identity');
assert.notEqual(geometryHash(grouped, { groups: true }), geometryHash(base, { groups: true }), 'groups covers the draw groups');

console.log('receipt-kit.selftest: near/nearStrict bounds and messages, and the geometry digest layout, views and options pass');
