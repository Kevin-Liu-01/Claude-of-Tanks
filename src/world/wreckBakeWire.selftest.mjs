import assert from 'node:assert/strict';
import * as THREE from 'three';
import { outputIdentity, RECIPES } from '../../tools/wreck-paint-bench.mjs';
import { packWreckBake, unpackWreckBake } from './wreckBakeWire.ts';

function attributes(geometry) {
  return geometry ? [
    ...Object.values(geometry.attributes),
    ...(geometry.index ? [geometry.index] : []),
    ...Object.values(geometry.morphAttributes).flat(),
  ] : [];
}

function wireAttributes(geometry) {
  return geometry ? [
    ...geometry.attributes.map(([, attribute]) => attribute),
    ...(geometry.index ? [geometry.index] : []),
    ...geometry.morphAttributes.flatMap(([, values]) => values),
  ] : [];
}

function extraMetadata(baked) {
  return [baked.geo, baked.shadowGeo].map(geometry => geometry && ({
    indirectOffset: geometry.indirectOffset,
    attributes: attributes(geometry).map(attribute => ({
      version: attribute.version, updateRanges: attribute.updateRanges,
      byteOffset: attribute.array.byteOffset,
    })),
  }));
}

function transferRoundTrip(baked, label) {
  const expected = outputIdentity(baked);
  const metadata = extraMetadata(baked);
  const originals = [...attributes(baked.geo), ...attributes(baked.shadowGeo)];
  const { wire, transfer } = packWreckBake(baked);
  const packed = [...wireAttributes(wire.geo), ...wireAttributes(wire.shadowGeo)];
  assert.deepEqual(packed.map(attribute => attribute.array), originals.map(attribute => attribute.array));
  for (let i = 0; i < packed.length; i++) {
    assert.equal(packed[i].array, originals[i].array, `${label}: packing must not copy a stream`);
  }
  assert.deepEqual(transfer, [...new Set(originals.map(attribute => attribute.array.buffer))]);
  const received = structuredClone(wire, { transfer });
  for (const buffer of transfer) assert.equal(buffer.byteLength, 0, `${label}: original buffer detached`);
  for (const attribute of originals) assert.equal(attribute.array.byteLength, 0);

  const forbidden = ['computeBoundingBox', 'computeBoundingSphere', 'computeVertexNormals', 'normalizeNormals', 'toNonIndexed'];
  const saved = forbidden.map(name => THREE.BufferGeometry.prototype[name]);
  let inflated;
  try {
    for (const name of forbidden) THREE.BufferGeometry.prototype[name] = () => {
      assert.fail(`${label}: receiver must not call ${name}`);
    };
    inflated = unpackWreckBake(received);
  } finally {
    forbidden.forEach((name, i) => { THREE.BufferGeometry.prototype[name] = saved[i]; });
  }
  const receivedAttributes = [...wireAttributes(received.geo), ...wireAttributes(received.shadowGeo)];
  const inflatedAttributes = [...attributes(inflated.geo), ...attributes(inflated.shadowGeo)];
  for (let i = 0; i < inflatedAttributes.length; i++) {
    assert.equal(inflatedAttributes[i].array, receivedAttributes[i].array,
      `${label}: inflation must reuse the transferred typed view`);
  }
  assert.deepEqual(outputIdentity(inflated), expected, `${label}: all ordered bytes and metadata survive`);
  assert.deepEqual(extraMetadata(inflated), metadata, `${label}: upload metadata and view offsets survive`);
  baked.geo.dispose(); baked.shadowGeo?.dispose();
  return inflated;
}

function metadataFixture(IndexArray) {
  const buffer = new ArrayBuffer(128);
  const position = new THREE.BufferAttribute(new Float32Array(buffer, 16, 9), 3);
  position.array.set([0, -0, 0, 1, 0, 0, 0, 1, 0]);
  position.name = 'authored position';
  position.setUsage(THREE.DynamicDrawUsage);
  position.needsUpdate = true;
  position.addUpdateRange(3, 6);
  const normal = new THREE.BufferAttribute(new Float32Array(buffer, 52, 9), 3, true);
  normal.array.set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const index = new THREE.BufferAttribute(new IndexArray(buffer, 88, 3), 1);
  index.array.set([2, 0, 1]); index.gpuType = THREE.IntType; index.name = 'ordered corners';
  index.needsUpdate = true; index.needsUpdate = true; index.addUpdateRange(0, 3);
  const geo = new THREE.BufferGeometry();
  // Deliberately nonalphabetic order and aliased views, including morph data.
  geo.setAttribute('normal', normal);
  geo.setAttribute('position', position);
  geo.setAttribute('color', new THREE.BufferAttribute(position.array, 3));
  geo.setIndex(index);
  geo.morphAttributes = { normal: [normal], position: [position] };
  geo.morphTargetsRelative = true;
  geo.name = 'metadata / null-shadow fixture';
  geo.userData = { nested: { order: ['rust', 'char'], signedZero: -0 }, label: 'wreck' };
  geo.addGroup(0, 3, 7);
  geo.setDrawRange(0, Infinity);
  geo.indirectOffset = [0, 4];
  // Preserve stored bounds, even when they intentionally exceed the vertices.
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-2, -0, -3), new THREE.Vector3(2, 5, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0, 2, 0), 8);
  return { geo, shadowGeo: null, hx: 2, hz: 3, h: 5, tris: 1 };
}

for (const IndexArray of [Uint16Array, Uint32Array]) {
  const fixture = metadataFixture(IndexArray);
  if (IndexArray === Uint32Array) {
    fixture.geo.setDrawRange(1, 2);
    fixture.geo.boundingBox = null; fixture.geo.boundingSphere = null;
    fixture.shadowGeo = new THREE.BufferGeometry();
    fixture.shadowGeo.setAttribute('position', fixture.geo.attributes.position);
  }
  const inflated = transferRoundTrip(fixture, IndexArray.name);
  assert.equal(inflated.shadowGeo === null, IndexArray === Uint16Array);
  assert.equal(inflated.geo.index.array.constructor, IndexArray);
  assert.equal(new Set([...attributes(inflated.geo), ...attributes(inflated.shadowGeo)]
    .map(attribute => attribute.array.buffer)).size, 1);
  inflated.geo.dispose(); inflated.shadowGeo?.dispose();
}

{
  const fixture = metadataFixture(Uint16Array);
  const { wire } = packWreckBake(fixture);
  const malformed = { ...wire.geo, attributes: [
    ['position', { ...wire.geo.attributes[0][1], array: [] }],
  ] };
  const dispose = THREE.BufferGeometry.prototype.dispose;
  let disposals = 0;
  try {
    THREE.BufferGeometry.prototype.dispose = function () { disposals++; dispose.call(this); };
    assert.throws(() => unpackWreckBake({ ...wire, geo: malformed }), /Typed Array/);
    assert.equal(disposals, 1, 'malformed visible geometry disposes its partial wrapper');
    disposals = 0;
    assert.throws(() => unpackWreckBake({ ...wire, shadowGeo: malformed }), /Typed Array/);
    assert.equal(disposals, 2, 'malformed shadow disposes itself and the completed visible geometry');
  } finally {
    THREE.BufferGeometry.prototype.dispose = dispose;
    fixture.geo.dispose();
  }
}

for (const unsupported of [
  new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(9), 3), 3, 0),
  new THREE.InstancedBufferAttribute(new Float32Array(9), 3),
  new THREE.Float16BufferAttribute(new Uint16Array(9), 3),
]) {
  const fixture = metadataFixture(Uint16Array);
  fixture.geo.setAttribute('position', unsupported);
  assert.throws(() => packWreckBake(fixture), /Unsupported static wreck buffer attribute/);
  fixture.geo.dispose();
}

if (!process.argv.includes('--fixtures-only')) {
  // This full test is CPU-heavy; its caller owns the shared capture FIFO.
  const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
  const { bakeTankWreck } = await import('./wrecks.ts');
  assert.equal(typeof globalThis.document, 'undefined', 'production bakes remain DOM-free');
  for (const recipe of [...RECIPES, { specId: 'm551_sheridan', seed: 1326, pop: true }]) {
    await ensureTankBuilder(recipe.specId);
    const baked = bakeTankWreck({}, recipe.specId, recipe);
    assert.ok(baked, `${recipe.specId}: real synchronous bake succeeds`);
    const inflated = transferRoundTrip(baked, recipe.specId);
    const unchanged = outputIdentity(inflated);
    inflated.geo.attributes.color.array[0] += 0.01;
    assert.notEqual(outputIdentity(inflated).sha256, unchanged.sha256,
      `${recipe.specId}: negative-control paint corruption changes exact identity`);
    inflated.geo.dispose(); inflated.shadowGeo?.dispose();
    console.log(`wreckBakeWire: ${recipe.specId} exact transfer passed`);
  }
}

console.log('wreckBakeWire selftest passed');
