import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAP_IDS } from '../src/world/maps/catalog.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { encodeCollisionManifest, decodeCollisionManifest } from './collisionManifestCodec.ts';
import { collisionManifestCounts, validateCollisionManifestCounts } from './collisionManifestFormat.ts';
import { createCollisionManifestLoader } from './collisionManifestLoader.ts';
import {
  assertUnchangedCollisionShards, collisionCaptureOptions, readCollisionCaptureEntries,
  writeCollisionManifestIndex, writeCollisionManifestShard,
} from '../tools/worldCollisionManifestFiles.mjs';

const shape = ['v', 0.1234, 0, 3.125, 0, 0, 4.5678];
const record = { b: [0, 0, 0, 4, 2, 5], s: shape, q: 1, p: 7, k: 'crate' };
const manifest = {
  obstacles: [record, { ...record, s: ['m', shape, ['c', 2, 3, 0.9]] }],
  colliders: [record], concealers: [[2, 3, 4, 0.75]],
};
const packed = encodeCollisionManifest(manifest, 'primitive-kind-dict-v3');
// A fixed mixed geometry corpus tests dictionary efficiency independently of
// evolving map layouts. Real manifests still have exact byte ceilings below.
const footprint = ['v', -4.125, -7.875, 3.625, -7.875, 4.125, -6.625,
  4.125, 6.625, 3.625, 7.875, -3.625, 7.875, -4.125, 6.625, -4.125, -6.625];
const wall = ['v', -3.625, -7.875, 3.625, -7.875, 3.625, -7.625, -3.625, -7.625];
const codecFixtureRecords = [0, 1, 2, 3].map(p => ({
  b: [-4.125, 0, -7.875, 4.125, 3.125, 7.875],
  s: ['m', footprint, wall, ['c', p + 0.125, p + 0.375, 0.625]],
  q: 1, p, k: 'building',
}));
const codecFixture = { obstacles: codecFixtureRecords, colliders: codecFixtureRecords,
  concealers: [[1.125, 2.375, 3.625, 0.75]] };
const codecFixtureText = JSON.stringify(codecFixture);
const encodedFixture = encodeCollisionManifest(codecFixture, 'primitive-kind-dict-v4');
assert.deepEqual(decodeCollisionManifest(encodedFixture), codecFixture);
assert.equal(encodedFixture.obstacles[0].s[1], 0, 'fixed corpus exercises reference zero');
assert.ok(Buffer.byteLength(JSON.stringify(encodedFixture)) < Buffer.byteLength(codecFixtureText) * 0.8,
  'exact dictionary materially reduces the fixed mixed primitive corpus');
assert.deepEqual(collisionCaptureOptions(['owned-session']), {
  session: 'owned-session', mapIds: MAP_IDS, partial: false, headless: false, cacheDir: null, node: false, check: false,
}, 'existing complete export keeps the full canonical roster');
assert.deepEqual(collisionCaptureOptions(['owned-session', '--maps', 'whiteout']), {
  session: 'owned-session', mapIds: ['whiteout'], partial: true, headless: false, cacheDir: null, node: false, check: false,
});
assert.deepEqual(collisionCaptureOptions(['--maps=whiteout,polders']).mapIds, ['polders', 'whiteout']);
for (const args of [['--maps'], ['--maps='], ['--maps=invalid'], ['--maps=whiteout,whiteout'],
  ['--maps=whiteout', '--maps=polders'], ['owned-session', 'unexpected'], ['--unknown']]) {
  assert.throws(() => collisionCaptureOptions(args), /map|argument/);
}
// round 61 (2026-09-24): the headless mode captures on the tool's own checkout without a session; a warm optimizer
// cache is the caller's own and applies to that mode only
assert.deepEqual(collisionCaptureOptions(['--headless', '--maps', 'autumn', '--cache-dir=/tmp/warm']), {
  session: 'cot-manifest', mapIds: ['autumn'], partial: true, headless: true, cacheDir: '/tmp/warm', node: false, check: false,
}, 'a headless partial capture names its maps and its own cache');
// 2026-10-01: the Node build (tools/headlessWorldCollision.mjs) regenerates or checks shards without a browser; a
// check never writes, and neither mode takes a browser session
assert.deepEqual(collisionCaptureOptions(['--node', '--maps', 'desert']), {
  session: 'cot-manifest', mapIds: ['desert'], partial: true, headless: false, cacheDir: null, node: true, check: false,
}, 'a Node partial build names its maps');
assert.deepEqual(collisionCaptureOptions(['--check']), {
  session: 'cot-manifest', mapIds: MAP_IDS, partial: false, headless: false, cacheDir: null, node: true, check: true,
}, 'a drift check builds every map in Node');
// 2026-10-08 (destruction core lane): a mode's battlefield variant builds in Node into its own `<map>@<variant>.json`
assert.deepEqual(collisionCaptureOptions(['--variant=assault-trenches', '--maps', 'verdant']), {
  session: 'cot-manifest', mapIds: ['verdant'], partial: true, headless: false, cacheDir: null, node: true, check: false,
  variant: 'assault-trenches',
}, 'a variant build runs in Node');
assert.equal(collisionCaptureOptions(['--check', '--variant=assault-trenches']).variant, 'assault-trenches');
for (const args of [['--variant=moon-craters'], ['--variant=assault-trenches', '--variant=assault-trenches'], ['--variant=assault-trenches', '--headless']]) {
  assert.throws(() => collisionCaptureOptions(args), /variant|node|headless/);
}
for (const args of [['--node', '--headless'], ['--node', 'owned-session'], ['--check', '--check'], ['--node', '--node']]) {
  assert.throws(() => collisionCaptureOptions(args), /node|check|session|headless/);
}
for (const args of [['--headless', 'owned-session'], ['--headless', '--headless'], ['--cache-dir=/tmp/warm'],
  ['--headless', '--cache-dir='], ['--headless', '--cache-dir=/a', '--cache-dir=/b']]) {
  assert.throws(() => collisionCaptureOptions(args), /headless|cache-dir/);
}
assert.equal(packed.encoding, 'primitive-kind-dict-v3');
assert.equal(encodeCollisionManifest(manifest).encoding, 'primitive-kind-dict-v5', 'the writer\'s default is v5');
assert.deepEqual(packed.kinds, ['crate']);
assert.equal(packed.obstacles[0].k, 0, 'kind reference zero is valid');
// (v3: the interned primitive in integers of 1/10000 m, its corners as steps from the one before)
assert.deepEqual(packed.shapes, [['V', 1234, 0, 30016, 0, -31250, 45678]], 'only repeated exact primitives are interned');
assert.deepEqual(packed.obstacles[0].B, [0, 0, 0, 40000, 20000, 50000], 'exact bounds in integers of 1/10000 m');
assert.equal(Object.hasOwn(packed.obstacles[0], 'b'), false);
assert.equal(packed.obstacles[0].s, 0, 'reference zero is valid');
assert.equal(packed.obstacles[1].s[1], 0, 'compound children use the same primitive table');
const restored = decodeCollisionManifest(packed);
assert.deepEqual(restored, manifest, 'bounds, metadata, points, order, and precision are exact');
assert.strictEqual(restored.obstacles[0].s, restored.colliders[0].s);
assert.ok(Object.isFrozen(restored.obstacles[0].s), 'shared primitive tuples are immutable');
assert.throws(() => { restored.obstacles[0].s[1] = 999; }, TypeError);
assert.deepEqual(decodeCollisionManifest(manifest), manifest, 'unencoded in-memory fixtures remain supported');
const legacy = encodeCollisionManifest(manifest, 'primitive-dict-v1');
assert.equal(legacy.encoding, 'primitive-dict-v1');
assert.equal(Object.hasOwn(legacy, 'kinds'), false, 'explicit v1 encoding has no new format fields');
assert.equal(legacy.obstacles[0].k, 'crate', 'v1 retains inline string metadata');
assert.deepEqual(decodeCollisionManifest(legacy), manifest, 'existing v1 shards remain readable');
assert.deepEqual(encodeCollisionManifest(decodeCollisionManifest(legacy), legacy.encoding), legacy,
  'explicit v1 re-encoding remains byte-stable');
assert.throws(() => encodeCollisionManifest(manifest, 'unknown'), /encoding is invalid/);

const metadataFixture = {
  obstacles: [
    { b: record.b, k: 'first', q: false, m: null, e: null, t: null, p: null },
    { b: record.b, s: shape, k: '', q: 0, m: 0, e: 0, t: 0, p: 0 },
    { b: record.b, k: null, q: true, m: -0.1234, e: 0.5678 },
    { b: record.b },
    { b: record.b, k: 'frequent' },
    { b: record.b, k: 'frequent' },
  ],
  colliders: [{ b: record.b, k: 'second' }],
};
const metadataEncoded = encodeCollisionManifest(metadataFixture);
assert.deepEqual(metadataEncoded.kinds, ['frequent', 'first', '', 'second'],
  'frequent kinds receive short IDs and equal-count ties retain first-seen order');
for (const encoding of ['primitive-dict-v1', 'primitive-kind-dict-v2', 'primitive-kind-dict-v3', 'primitive-kind-dict-v4', 'primitive-kind-dict-v5']) {
  const encoded = encodeCollisionManifest(metadataFixture, encoding);
  assert.deepEqual(decodeCollisionManifest(JSON.parse(JSON.stringify(encoded))),
    { ...metadataFixture, concealers: undefined },
    `${encoding} preserves missing/null/empty kinds, shapeless records and every metadata value`);
}

// (2026-10-14, the shards' storage budget) v3 is exact or it is v2: every primitive kind and its corners round-trip bit
// for bit through integers of 1/10000 m; a number with more decimals, or bounds with one, stays as v2 wrote it; an
// existing v2 shard stays readable and re-encodes byte-stable as v2
const v3Fixture = {
  obstacles: [
    { b: [-12.5, 0.25, -3.0001, 12.5, 6.4416, 3], k: 'structure', q: 1,
      s: ['m', ['w', 0.3416, 60.8416, -161.45, -47.95, -138.55, -47.95, -138.55, -34.769, -161.45, -34.769],
        ['p', 60.8416, 61.4416, -150, -41.3595, 2, 0.0302, -0.2421, 61.4436, 0, 0, 3.25, -161.65, -48.15, -138.35, -48.15, -138.35, -34.569],
        ['c', 2.5, -3.75, 0.9, 0, 1.2], ['o', 1, 2, 0.5, 0.25, 0.7854, -0.5, 2]] },
    { b: [0, 0, 0, 1, 1, 1], s: ['v', 0.1, 0.2, 1.000001, 0.2, 1, 1] },
    { b: [0.123456, 0, 0, 1, 1, 1], s: ['c', 0, 0, 1] },
  ],
  colliders: [{ b: [-1, -2, -3, 1, 2, 3], s: ['v', -1, -3, 1, -3, 1, 3, -1, 3] }],
  concealers: [[1.125, 2.375, 3.625, 0.75]],
};
const v3 = encodeCollisionManifest(v3Fixture, 'primitive-kind-dict-v3');
assert.equal(v3.encoding, 'primitive-kind-dict-v3');
assert.deepEqual(v3.obstacles[0].s.slice(1).map((part) => part[0]), ['W', 'P', 'C', 'O'], 'every primitive kind compacts');
assert.equal(v3.obstacles[1].s[0], 'v', 'a primitive with a number of more than four decimals stays as v2 wrote it');
assert.ok(Object.hasOwn(v3.obstacles[2], 'b') && !Object.hasOwn(v3.obstacles[2], 'B'), 'and so do such bounds');
assert.deepEqual(Object.keys(v3.obstacles[0]), ['B', 'k', 'q', 's'], 'the compact bounds take the key\'s place');
const v3Back = decodeCollisionManifest(JSON.parse(JSON.stringify(v3)));
assert.deepEqual(v3Back, v3Fixture, 'v3 decodes bit for bit');
assert.deepEqual(Object.keys(v3Back.obstacles[0]), Object.keys(v3Fixture.obstacles[0]), 'in the record\'s key order');
assert.deepEqual(encodeCollisionManifest(v3Back, 'primitive-kind-dict-v3'), v3, 'v3 re-encodes byte-stable');
const v2 = encodeCollisionManifest(v3Fixture, 'primitive-kind-dict-v2');
assert.deepEqual(decodeCollisionManifest(JSON.parse(JSON.stringify(v2))), v3Fixture, 'v2 shards remain readable');
assert.deepEqual(encodeCollisionManifest(decodeCollisionManifest(v2), 'primitive-kind-dict-v2'), v2, 'and re-encode byte-stable as v2');

// (the perf lane, 2026-10-16: the shards' storage budget) v4 is v3 with a record's bounds as steps from its shape's own
// reference box ('D') and a concealer on a tree's exact circle centre as [tree index, radius, add]; exact both ways
{
  const tree = (t, x, z, b) => ({ b, s: ['c', x, z, 0.35], q: 1, k: 'tree', t });
  const v4Fixture = {
    obstacles: [...v3Fixture.obstacles, tree(0, 12.5, -3.25, [12.15, 0.5, -3.6, 12.8499, 9.25, -2.9]),
      tree(1, 40.0625, 7, [39.7125, 0, 6.65, 40.4125, 8, 7.35]), tree(2, 40.0625, 7, [39.7125, 0, 6.65, 40.4125, 8, 7.35]),
      { b: [1, 0, 1, 2, 3, 2], s: ['o', 1.5, 1.5, 0.5, 0.5, 0.7853981633974483, 0, 3], k: 'crate' },
      { b: [0, 0, 0, 1, 1, 1], s: ['p', 0, 1, 0.5, 0.5, 1, 0.1, 0.123456789, 1, 0, 0, 1, 0, 1, 1], k: 'deck' }],
    colliders: v3Fixture.colliders,
    concealers: [[12.5, -3.25, 1.68, 0.08], [40.0625, 7, 2, 0.08], [5, 5, 1, 0.1], [12.5, -3.2500001, 1, 0.08]],
  };
  const v4 = encodeCollisionManifest(v4Fixture, 'primitive-kind-dict-v4');
  assert.equal(v4.encoding, 'primitive-kind-dict-v4');
  const record = v4.obstacles[0];
  assert.deepEqual(Object.keys(record), ['D', 'k', 'q', 's'], 'the steps take the bounds\' place');
  assert.ok(record.D.every((n) => Number.isSafeInteger(n)), 'integer steps from the shape\'s box');
  assert.deepEqual(v4.obstacles[3].D, [0, 5000, 0, -1, 92500, 0], 'a tree: the circle\'s extents (one step short on one side), its vertical span');
  assert.ok(Object.hasOwn(v4.obstacles[1], 'B') && !Object.hasOwn(v4.obstacles[1], 'D'), 'an inexact shape keeps v3\'s bounds');
  assert.ok(Object.hasOwn(v4.obstacles[2], 'b'), 'inexact bounds stay as v2 wrote them');
  assert.ok(Object.hasOwn(v4.obstacles[6], 'D'), 'a box\'s yaw is not read: its centre and its vertical extent are');
  assert.ok(Object.hasOwn(v4.obstacles[7], 'D'), 'nor a drawn top\'s planes');
  assert.deepEqual(v4.concealers[0], [0, 1.68, 0.08], 'a concealer on a tree\'s centre names the tree');
  assert.deepEqual(v4.concealers[1], [40.0625, 7, 2, 0.08], 'a centre two trees share stays as it is');
  assert.deepEqual(v4.concealers.slice(2), v4Fixture.concealers.slice(2), 'and so does any concealer off a centre');
  const back = decodeCollisionManifest(JSON.parse(JSON.stringify(v4)));
  assert.deepEqual(back, v4Fixture, 'v4 decodes bit for bit');
  for (let i = 0; i < back.obstacles.length; i++) {
    assert.deepEqual(Object.keys(back.obstacles[i]), Object.keys(v4Fixture.obstacles[i]), `record ${i} in its key order`);
    back.obstacles[i].b.forEach((n, j) => assert.ok(Object.is(n, v4Fixture.obstacles[i].b[j]), `record ${i} bound ${j} exact`));
  }
  assert.deepEqual(encodeCollisionManifest(back, 'primitive-kind-dict-v4'), v4, 'v4 re-encodes byte-stable');
  assert.deepEqual(decodeCollisionManifest(JSON.parse(JSON.stringify(v3))), v3Fixture, 'v3 shards remain readable');
  for (const corrupt of [
    (value) => { value.obstacles[0].D = [0, 0, 0, 1, 1]; },
    (value) => { value.obstacles[0].D[1] = 0.5; },
    (value) => { value.obstacles[0].B = [0, 0, 0, 1, 1, 1]; },
    (value) => { delete value.obstacles[0].s; },
    (value) => { value.concealers[0] = [99, 1, 0.08]; },
    (value) => { value.concealers[0] = ['a', 1, 0.08]; },
  ]) {
    const value = structuredClone(v4);
    corrupt(value);
    assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject a corrupt v4 record or concealer');
  }
}
// (the maps lane, 2026-10-20: the 229 shard diet) v5 is v4 with the dictionary in order of use, a record as [its key
// order, ...values], zero steps as 0, a list's inline compact parts chained from one position and footing to the next, and
// a collider that is an obstacle exactly as the obstacle's index; exact both ways
{
  const wallPart = (x0, z0, y0, y1) => ['w', y0, y1, x0, z0, x0 + 4, z0, x0 + 4, z0 + 0.25, x0, z0 + 0.25];
  const house = (x, z) => ({ b: [x, 0.5, z, x + 8.5, 6.5, z + 6.25], s: ['m', wallPart(x, z, 0.5, 6.5), wallPart(x + 4.5, z + 6, 0.5, 6.25),
    ['c', x + 1.5, z + 2, 0.5, 0.5, 2.5], ['o', x + 2, z + 3, 0.5, 0.25, 0, 0.5, 1.5]], k: 'structure', g: 3 });
  const v5Fixture = {
    obstacles: [house(-123.4567, 250.125), house(-110.25, 251.5), ...v3Fixture.obstacles,
      { b: [1, 0, 1, 2, 3, 2], s: ['o', 1.5, 1.5, 0.5, 0.5, 0.7853981633974483, 0, 3], k: 'crate' },
      { b: [0, 0, 0, 1, 1, 1], s: ['p', 0, 1, 0.5, 0.5, 1, 0.1, 0.123456789, 1, 0, 0, 1, 0, 1, 1], k: 'deck' },
      { b: [0, 0, 0, 2, 0, 2], s: ['v', 0, 0, 2, 0, 2, 2], q: 1, k: 'crate' }],
    colliders: [],
    concealers: v3Fixture.concealers,
  };
  v5Fixture.colliders = [v5Fixture.obstacles[1], structuredClone(v5Fixture.obstacles[0]), { ...v5Fixture.obstacles[3], g: 4 }, ...v3Fixture.colliders];
  const v5 = encodeCollisionManifest(v5Fixture);
  assert.equal(v5.encoding, 'primitive-kind-dict-v5');
  assert.ok(Array.isArray(v5.keys) && v5.keys.every((order) => order.every((key) => typeof key === 'string')), 'a table of key orders');
  assert.ok(v5.obstacles.every((record) => Array.isArray(record) && Number.isSafeInteger(record[0])), 'every record is [its key order, ...values]');
  assert.deepEqual(v5.keys[v5.obstacles[0][0]], ['D', 's', 'k', 'g'], 'the bounds\' key names their encoding');
  assert.equal(v5.colliders[0], 1, 'a collider that is an obstacle exactly is its index');
  assert.equal(v5.colliders[1], 0, 'and so is a copy of one');
  assert.ok(Array.isArray(v5.colliders[2]), 'one alike but for a key is its own record');
  const steps = v5.obstacles[v5.obstacles.length - 1];
  assert.equal(steps[v5.keys[steps[0]].indexOf('D') + 1], 0, 'steps that are all zero are 0');
  // the second wall's first corner, 4.5 m east and 6 m north of the first wall's, as that step; its footing the same
  const shapeOf = (record) => record[v5.keys[record[0]].indexOf('s') + 1];
  const [, first, second] = shapeOf(v5.obstacles[0]);
  assert.deepEqual(first.slice(0, 5), ['W', 5000, 60000, -1234567, 2501250], 'the list\'s first part from 0');
  assert.deepEqual(second.slice(0, 5), ['W', 0, 57500, 45000, 60000], 'the next part from the one before: its footing, span and corner');
  // (after the first house's circle and box: the box's centre and footing are the chain's when the next record starts)
  assert.deepEqual(shapeOf(v5.obstacles[1])[1].slice(0, 5), ['W', 0, 60000, 112067, -16250], 'the chain runs on from record to record');
  const back = decodeCollisionManifest(JSON.parse(JSON.stringify(v5)));
  assert.deepEqual(back, v5Fixture, 'v5 decodes bit for bit');
  for (const list of ['obstacles', 'colliders']) {
    back[list].forEach((record, i) => {
      assert.deepEqual(Object.keys(record), Object.keys(v5Fixture[list][i]), `${list} ${i} in its key order`);
      record.b.forEach((n, j) => assert.ok(Object.is(n, v5Fixture[list][i].b[j]), `${list} ${i} bound ${j} exact`));
    });
  }
  assert.notStrictEqual(back.colliders[0], back.obstacles[1], 'a collider named by its obstacle is its own record');
  assert.notStrictEqual(back.colliders[0].b, back.obstacles[1].b);
  assert.notStrictEqual(back.colliders[0].s, back.obstacles[1].s);
  assert.deepEqual(encodeCollisionManifest(back), v5, 'v5 re-encodes byte-stable');
  assert.deepEqual(decodeCollisionManifest(encodeCollisionManifest(v5Fixture)), v5Fixture, 'and decodes in memory');
  // the dictionary in order of use: a primitive used three times before one used twice
  const shared = ['v', 0, 0, 1, 0, 1, 1], twice = ['v', 5, 5, 6, 5, 6, 6];
  const ordered = encodeCollisionManifest({ obstacles: [
    { b: [5, 0, 5, 6, 0, 6], s: twice }, { b: [5, 0, 5, 6, 0, 6], s: twice, k: 'a' },
    { b: [0, 0, 0, 1, 0, 1], s: shared }, { b: [0, 0, 0, 1, 0, 1], s: shared, k: 'a' }, { b: [0, 0, 0, 1, 0, 1], s: shared, k: 'b' },
  ], colliders: [] });
  assert.deepEqual(ordered.shapes, [['V', 0, 0, 10000, 0, 0, 10000], ['V', 50000, 50000, 10000, 0, 0, 10000]], 'the most used first');
  assert.ok(Buffer.byteLength(JSON.stringify(encodeCollisionManifest(codecFixture))) < Buffer.byteLength(JSON.stringify(encodedFixture)),
    'v5 is smaller than v4 on the fixed corpus');
  for (const corrupt of [
    (value) => { value.obstacles[0][0] = v5.keys.length; },
    (value) => { value.obstacles[0].push(1); },
    (value) => { value.obstacles[0] = 0; },
    (value) => { value.colliders[0] = v5.obstacles.length; },
    (value) => { value.colliders[0] = -1; },
    (value) => { value.colliders[0] = 0.5; },
    (value) => { value.keys = [['D', 's', 'b']]; },
    (value) => { value.keys = [['__proto__']]; },
    (value) => { value.keys[0] = [1]; },
    (value) => { value.keys = 'D,s'; },
    (value) => { delete value.keys; },
    (value) => { shapeOf(value.obstacles[0])[2][3] = 0.5; },
    (value) => { shapeOf(value.obstacles[0])[2] = ['W', 1, 2]; },
    (value) => { const r = value.obstacles[0]; r[value.keys[r[0]].indexOf('D') + 1] = 1; },
  ]) {
    const value = structuredClone(v5);
    corrupt(value);
    assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject a corrupt v5 record, reference or key order');
  }
}
for (const corrupt of [
  (value) => { value.obstacles[0].b = [0, 0, 0, 1, 1, 1]; },
  (value) => { value.obstacles[0].B = [0, 0, 0, 1, 1]; },
  (value) => { value.obstacles[0].B[2] = 0.5; },
  (value) => { value.obstacles[0].s[1][3] = 1.5; },
  (value) => { value.obstacles[0].s[1] = ['W', 1, 2, 3]; },
  (value) => { value.colliders[0].s = ['V', 0, 0, 1]; },
]) {
  const value = structuredClone(v3);
  corrupt(value);
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject a corrupt compact record or primitive');
}

// No terrain bake is needed to prove mutable match inflation is independent.
const heightField = { getHeightAt: () => 0 };
const a = createHeadlessCollisionWorld({ heightField, manifest: restored });
const b = createHeadlessCollisionWorld({ heightField, manifest: restored });
a.getObstacles()[0].shape2.points[0] = 999;
a.getObstacles()[1].shape2.parts[0].points[0] = 888;
a.getObstacles()[0].min[0] = 777;
assert.equal(b.getObstacles()[0].shape2.points[0], shape[1]);
assert.equal(b.getObstacles()[1].shape2.parts[0].points[0], shape[1]);
assert.equal(a.getColliders()[0].shape2.points[0], shape[1]);
assert.equal(restored.obstacles[0].s[1], shape[1]);
assert.equal(b.getObstacles()[0].min[0], 0);

const fresh = () => structuredClone(packed);
for (const invalid of [-1, 1, 0.5, NaN, Infinity, '0', null, {}, true]) {
  const value = fresh(); value.obstacles[0].s = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, `reject invalid reference ${String(invalid)}`);
}
for (const invalid of [null, {}, [null], [0], [['m', shape]], [['v', 0, 0]], new Array(1), new Array(131073)]) {
  const value = fresh(); value.shapes = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject invalid primitive table');
}
// (physics stream, 2026-10-16) a compound carries at most 256 parts (collisionManifestFormat.ts COLLISION_COMPOUND_MAX_PARTS)
for (const valid of [['m', ...Array(65).fill(0)], ['m', ...Array(256).fill(0)]]) {
  const value = fresh(); value.obstacles[0].s = valid;
  assert.doesNotThrow(() => decodeCollisionManifest(value), `a compound of ${valid.length - 1} parts decodes`);
}
for (const invalid of [['m'], ['m', -1], ['m', ['m', shape]], ['m', ...Array(257).fill(0)]]) {
  const value = fresh(); value.obstacles[0].s = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject invalid compound/ref nesting');
}
for (const invalid of [-1, 1, 0.5, NaN, Infinity, {}, [], true]) {
  const value = fresh(); value.obstacles[0].k = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, `reject invalid kind reference ${String(invalid)}`);
}
for (const invalid of [undefined, null, {}, [null], [0], [true], [[]], new Array(1), new Array(1025)]) {
  const value = fresh(); value.kinds = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject invalid/missing kind table');
}
const missingKinds = fresh(); delete missingKinds.kinds;
assert.throws(() => decodeCollisionManifest(missingKinds), /kind dictionary is invalid/);
const legacyKindReference = structuredClone(legacy); legacyKindReference.obstacles[0].k = 0;
assert.throws(() => decodeCollisionManifest(legacyKindReference), /kind reference is invalid/,
  'v1 cannot resolve new-format kind references');
for (const encoding of [undefined, 'primitive-dict-v2', 1, null]) {
  const value = fresh(); value.encoding = encoding;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject unknown/missing codec marker');
}
const missing = fresh(); delete missing.shapes;
assert.throws(() => decodeCollisionManifest(missing), /invalid/);
const badBounds = fresh(); badBounds.colliders[0].b = [0, 0];
assert.throws(() => decodeCollisionManifest(badBounds), /invalid/);
for (const [key, invalid] of [['q', 2], ['m', '2'], ['e', Infinity], ['k', {}], ['t', '1'], ['p', NaN]]) {
  const value = fresh(); value.obstacles[0][key] = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, `reject invalid metadata ${key}`);
}
const badConcealment = fresh(); badConcealment.concealers = [[1, 2, '3', 4]];
assert.throws(() => decodeCollisionManifest(badConcealment), /invalid/);
const recordReference = fresh(); recordReference.colliders[0] = 0;
assert.throws(() => decodeCollisionManifest(recordReference), /invalid/, 'whole-record references are not supported');

const directory = new URL('./world-collision-manifests/', import.meta.url);
assert.equal(existsSync(new URL('./world-collision-manifests.json', import.meta.url)), false,
  'retired whole-roster monolith must not remain beside the bounded shards');
const index = JSON.parse(readFileSync(new URL('index.json', directory), 'utf8'));
assert.deepEqual(Object.keys(index.maps), MAP_IDS);
const indexBeforeRetiredCli = readFileSync(new URL('index.json', directory));
for (const [tool, args] of [
  ['worldCollisionManifestFiles.mjs', ['--migrate']],
  ['capture-world-collision-manifests.mjs', ['--migrate']],
  ['capture-world-collision-manifests.mjs', ['unused-session', '--migrate']],
  ['capture-world-collision-manifests.mjs', ['--migrate=true']],
]) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL(`../tools/${tool}`, import.meta.url)), ...args], {
    encoding: 'utf8', timeout: 10_000, env: { ...process.env, PATH: '' },
  });
  assert.equal(child.status, 1, `${tool} rejects retired migration`);
  assert.match(child.stderr, /--migrate is retired/);
  assert.doesNotMatch(child.stderr, /spawn.*agent-browser|ENOENT/,
    'retired option is rejected before any browser process is invoked');
  assert.equal(child.stdout, '', 'retired option cannot start a capture or publish receipts');
}
assert.deepEqual(readFileSync(new URL('index.json', directory)), indexBeforeRetiredCli,
  'retired CLI invocations never alter the published index');
// 2026-10-01 (frozen pins retired): a per-map table of prior shard sizes (afaf62b60, re-based +10 % at every recapture)
// was a change detector of each map's collision content, and it went red the moment two maps joined. The storage
// contract is now: every canonical map publishes a shard, no single shard exceeds a uniform ceiling (the largest shard,
// Ruinspires at 7.41 MB on 2026-10-01, plus ~15 %), and the whole roster stays inside the published storage budget.
const SHARD_CEILING_BYTES = 8_500_000;
assert.deepEqual(Object.keys(index.maps).sort(), [...MAP_IDS].sort(), 'a published collision shard for every canonical map');
let rawBytes = 0, encodedBytes = 0, publishedBytes = 0;
for (const id of MAP_IDS) {
  const bytes = readFileSync(new URL(`${id}.json`, directory));
  const entry = index.maps[id];
  assert.equal(bytes.length, entry.bytes, `${id} byte receipt`);
  assert.ok(bytes.length <= SHARD_CEILING_BYTES, `${id} published shard stays inside the per-shard storage ceiling (${bytes.length} B)`);
  publishedBytes += bytes.length;
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${id} checksum receipt`);
  const published = JSON.parse(bytes.toString('utf8'));
  const original = decodeCollisionManifest(published);
  validateCollisionManifestCounts(original, entry);
  // Canonical bytes are version-specific: a partial native capture must not
  // rewrite untouched v1 siblings merely because the newest writer is v2.
  const encoded = encodeCollisionManifest(original, published.encoding);
  const decoded = decodeCollisionManifest(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded, original, `${id} exact all-record primitive round trip`);
  assert.deepEqual(encodeCollisionManifest(decoded, published.encoding), encoded, `${id} deterministic dictionary order`);
  assert.equal(JSON.stringify(encoded), bytes.toString('utf8'), `${id} version-specific canonical bytes`);
  const latest = encodeCollisionManifest(original);
  assert.deepEqual(decodeCollisionManifest(JSON.parse(JSON.stringify(latest))), original,
    `${id} newest format preserves all geometry, metadata and record order`);
  assert.deepEqual(encodeCollisionManifest(decodeCollisionManifest(latest)), latest,
    `${id} newest kind and primitive dictionaries are deterministic`);
  assert.deepEqual(collisionManifestCounts(decoded), collisionManifestCounts(original), `${id} exact census`);
  rawBytes += Buffer.byteLength(JSON.stringify(original));
  encodedBytes += Buffer.byteLength(JSON.stringify(encoded));
}
assert.equal(encodedBytes, publishedBytes, 'published shards are the canonical exact dictionary encoding');
// 2026-09-19 hitbox pass: 57637660 bytes captured with per-part vertical extents (+10 % headroom); was 36936381
// 2026-10-14 deploy 224: 65390916 bytes (+5 % headroom, the coordinator's ruling); was 63401426. Causes over main's
// 60268739: F3 stones under drawn tops +2825679, F2 roof decks and wreck tops +1685869, the builders +445114, the
// bunkers +381381, the gates +90858, Steinburg +23790, bld-integrity-r2 -325595, the wells -4919. A 225 shard diet
// (compact stone planes and deck encodings) aims back under 63.4 MB.
// 2026-10-16 integ/226 (the perf lane, v4): 73536197 bytes over the budget (DST-04's craters, PH.15's Saltwind spans, the
// crushables, the new props, the bunker shells); v4's bounds as steps from each shape's own box and the tree concealers
// by tree index bring the same records to 66736390, bit for bit (tools/transcode-collision-manifests.mjs). The budget
// stays. What it protects is the deployed corpus (base + variants 138.7 MB at /mp-collision/v2/, beside the frozen 224
// set's 129 MB); a host fetches one shard, the largest Ruinspires at 6.35 MB raw, 1.50 MB gzip, 1.10 MB brotli.
// 2026-10-17 integ/227: 68592722 bytes after fence v2 (fence colliders +0.96 MB, blackglass/shanghai +626 KB, oasis/siwa
// +119 KB, copper_mesa +39 KB, whiteout +37 KB, delta +35 KB, polders -22 KB, badlands -2 KB; main 16aeab482 = 66753467);
// budget +5 % headroom (coordinator ruling), was 68660462. A 228 shard diet aims back under 68.66 MB.
// 2026-10-20 integ/229 (the maps lane, the shard diet): the v5 codec (dictionary in order of use, records by key order,
// parts chained from one position and footing to the next, colliders that are obstacles by index) takes the same records
// from 69027017 to 58440955 bytes, bit for bit (tools/transcode-collision-manifests.mjs); the budget is back to 68660462.
assert.ok(publishedBytes <= 68660462, 'complete roster storage cannot exceed the frozen published budget');

// Hash-valid corruptions must still be rejected by the loader's schema/census.
const temporary = mkdtempSync(join(tmpdir(), 'cot-collision-codec-'));
const fixture = pathToFileURL(temporary + '/');
try {
  const fullEntries = {};
  for (const id of MAP_IDS) fullEntries[id] = writeCollisionManifestShard(id, manifest, fixture);
  writeCollisionManifestIndex(fullEntries, fixture);
  const retained = readCollisionCaptureEntries(['whiteout'], fixture);
  const siblingBytes = new Map(MAP_IDS.filter((id) => id !== 'whiteout')
    .map((id) => [id, readFileSync(new URL(`${id}.json`, fixture))]));
  const replacement = { ...manifest, concealers: [[9, 8, 7, 0.5]] };
  retained.whiteout = writeCollisionManifestShard('whiteout', replacement, fixture);
  assertUnchangedCollisionShards(retained, ['whiteout'], fixture);
  const refreshed = writeCollisionManifestIndex(retained, fixture);
  assert.deepEqual(Object.keys(refreshed.maps), MAP_IDS, 'one-map refresh still publishes all30');
  for (const [id, bytes] of siblingBytes) {
    assert.deepEqual(refreshed.maps[id], fullEntries[id], `${id} receipt is preserved exactly`);
    assert.deepEqual(readFileSync(new URL(`${id}.json`, fixture)), bytes, `${id} bytes are preserved exactly`);
  }
  writeFileSync(new URL('polders.json', fixture), '{}');
  assert.throws(() => readCollisionCaptureEntries(['whiteout'], fixture), /checksum mismatch/);
  writeCollisionManifestIndex({ verdant: fullEntries.verdant }, fixture);
  assert.throws(() => readCollisionCaptureEntries(['whiteout'], fixture), /complete canonical/);
  writeCollisionManifestShard('verdant', manifest, fixture);
  const generated = JSON.parse(readFileSync(new URL('verdant.json', fixture), 'utf8'));
  const newest = encodeCollisionManifest(manifest);
  assert.equal(generated.encoding, newest.encoding, 'future browser captures use the exact dictionary writer (v5)');
  assert.deepEqual(generated.shapes, newest.shapes);
  assert.deepEqual(decodeCollisionManifest(generated), manifest);
  const install = (data, census = collisionManifestCounts(manifest)) => {
    const text = JSON.stringify(data);
    writeFileSync(new URL('verdant.json', fixture), text);
    writeCollisionManifestIndex({ verdant: {
      ...census, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'),
    } }, fixture);
  };
  const invalid = fresh(); invalid.colliders[0].s = 7;
  install(invalid);
  assert.throws(() => createCollisionManifestLoader(fixture).get('verdant'), /reference is invalid/);
  install(packed, { ...collisionManifestCounts(manifest), colliders: 99 });
  assert.throws(() => createCollisionManifestLoader(fixture).get('verdant'), /census mismatch/);
  install(packed);
  writeFileSync(new URL('verdant.json', fixture), JSON.stringify(packed).replace('crate', 'Crate'));
  assert.throws(() => createCollisionManifestLoader(fixture).get('verdant'), /checksum mismatch/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log(`collisionManifestCodec.selftest: exact ${MAP_IDS.length}-map round trips, immutable primitives, isolated match shapes, corruption gates passed (${rawBytes} -> ${encodedBytes} bytes)`);
