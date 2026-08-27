import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { decodePropModelArchive } from './propsModelStore.ts';

const source = JSON.parse(readFileSync(new URL('./props-models.json', import.meta.url), 'utf8'));
const packed = gunzipSync(readFileSync(new URL('./props-models.bin.gz', import.meta.url)));
const view = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
const decoded = decodePropModelArchive(view);

assert.deepEqual(Object.keys(decoded).sort(), Object.keys(source).sort());
for (const [name, model] of Object.entries(source)) {
  const live = decoded[name];
  assert.ok(live, `${name} exists in the packed archive`);
  assert.deepEqual(Array.from(live.positions), Array.from(new Float32Array(model.positions)));
  assert.deepEqual(Array.from(live.normals), Array.from(new Float32Array(model.normals)));
  assert.deepEqual(Array.from(live.colors), Array.from(new Float32Array(model.colors)));
  assert.deepEqual(Array.from(live.indices), model.indices);
  assert.deepEqual(live.bbox.min, Array.from(new Float32Array(model.bbox.min)));
  assert.deepEqual(live.bbox.max, Array.from(new Float32Array(model.bbox.max)));
  assert.equal(live.tris, model.tris);
}

assert.throws(() => decodePropModelArchive(new ArrayBuffer(8)), /archive/i);
console.log('propsModelStore.selftest: packed geometry is exact and bounds-checked');
