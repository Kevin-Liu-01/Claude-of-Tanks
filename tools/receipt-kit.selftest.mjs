// The shared receipt kit (receipt-kit.test-support.mjs): near() includes its bound and nearStrict() excludes it, both
// reject non-finite values and name the label and both values; geometryHash() follows its documented layout (checked
// against an independent digest, not a pinned literal), reads each attribute's own view, ignores attribute insertion
// order and sees every byte, the index, and with its options the attribute layout and the draw groups; graphLabels() gives
// each three.js object one identity label and keeps every other value.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, Texture } from 'three';
import { geometryHash, graphLabels, near, nearStrict } from './receipt-kit.test-support.mjs';

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

// graphLabels: one short identity label per three.js object (the same object, the same label; a same-named twin, another),
// lists and records mapped through, every other value kept as it is; a failing deepEqual on labels names objects in a line.
const turret = new Group(); turret.name = 'rig_turret';
const hull = new Mesh(new BoxGeometry(), new MeshBasicMaterial()); hull.name = 'hull';
const twin = new Mesh(hull.geometry, hull.material); twin.name = 'hull';
turret.add(hull, twin);
const [hullLabel, twinLabel] = graphLabels([hull, twin]);
assert.match(hullLabel, /^Mesh "hull" #\d+$/);
assert.notEqual(hullLabel, twinLabel, 'a same-named twin is another object');
assert.equal(graphLabels(hull), hullLabel, 'one object keeps its label');
assert.match(graphLabels(new Group()), /^Group #\d+$/, 'no name, no quotes');
assert.match(graphLabels(hull.material), /^MeshBasicMaterial #\d+$/);
assert.match(graphLabels(hull.geometry), /^BoxGeometry #\d+$/);
assert.match(graphLabels(hull.geometry.getAttribute('position')), /^Float32BufferAttribute #\d+$/, 'no type field: the class name');
assert.match(graphLabels(new Texture()), /^Texture #\d+$/);
const color = new Color(1, 0, 0), values = new Float32Array([1, 2]);
assert.equal(graphLabels(color), color, 'a value object stays itself: deepEqual still compares its fields');
assert.equal(graphLabels(values), values);
assert.deepEqual(graphLabels({ owner: turret, parts: [hull, null, 3], tags: new Set([twin]), byName: new Map([['hull', hull]]) }),
  { owner: graphLabels(turret), parts: [hullLabel, null, 3], tags: new Set([twinLabel]), byName: new Map([['hull', hullLabel]]) });
// Plain stand-ins keep their sharing and cycles, so deepEqual on them gives the verdict it gave on the originals.
const loop = { hull }; loop.self = loop;
const loopView = graphLabels(loop);
assert.ok(loopView !== loop && loopView.self === loopView && loopView.hull === hullLabel);
const fakeScene = { children: [] }, fakeRoot = { name: 'stage', parent: fakeScene };
fakeScene.children.push(fakeRoot);
assert.match(graphLabels(fakeRoot), /^Object "stage" #\d+$/, 'a stand-in node (own parent) is labelled like a three.js one');
assert.deepEqual(graphLabels(fakeScene.children), graphLabels([fakeRoot]), 'cyclic plain stand-ins compare as before');
assert.throws(() => assert.deepEqual(graphLabels(fakeScene.children), graphLabels([{ name: 'stage', parent: fakeScene }])),
  assert.AssertionError, 'another stand-in is another node');
const record = { kind: 'zone', at: [1, 2], owner: hull };
assert.deepEqual(graphLabels(record), graphLabels({ kind: 'zone', at: [1, 2], owner: hull }), 'records still compare by value');
const nullProto = Object.assign(Object.create(null), { hull });
assert.equal(Object.getPrototypeOf(graphLabels(nullProto)), null, 'a null-prototype record keeps its prototype');
assert.deepEqual(graphLabels(turret.children), graphLabels([hull, twin]), 'the same children in order');
let failure;
try { assert.deepEqual(graphLabels(turret.children), graphLabels([twin, hull])); } catch (error) { failure = error; }
assert.ok(failure instanceof assert.AssertionError && failure.message.length < 400, 'order matters; the message stays short');
assert.match(failure.message, /Mesh "hull" #\d+/);
assert.throws(() => assert.deepEqual(graphLabels([hull]), graphLabels([new Mesh()])), assert.AssertionError);

console.log('receipt-kit.selftest: near/nearStrict bounds and messages, the geometry digest layout, views and options, and the graphLabels identity labels pass');
