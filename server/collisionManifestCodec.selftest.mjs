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
const packed = encodeCollisionManifest(manifest);
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
const encodedFixture = encodeCollisionManifest(codecFixture);
assert.deepEqual(decodeCollisionManifest(encodedFixture), codecFixture);
assert.equal(encodedFixture.obstacles[0].s[1], 0, 'fixed corpus exercises reference zero');
assert.ok(Buffer.byteLength(JSON.stringify(encodedFixture)) < Buffer.byteLength(codecFixtureText) * 0.8,
  'exact dictionary materially reduces the fixed mixed primitive corpus');
assert.deepEqual(collisionCaptureOptions(['owned-session']), {
  session: 'owned-session', mapIds: MAP_IDS, partial: false,
}, 'existing complete export keeps the full canonical roster');
assert.deepEqual(collisionCaptureOptions(['owned-session', '--maps', 'whiteout']), {
  session: 'owned-session', mapIds: ['whiteout'], partial: true,
});
assert.deepEqual(collisionCaptureOptions(['--maps=whiteout,polders']).mapIds, ['polders', 'whiteout']);
for (const args of [['--maps'], ['--maps='], ['--maps=invalid'], ['--maps=whiteout,whiteout'],
  ['--maps=whiteout', '--maps=polders'], ['owned-session', 'unexpected'], ['--unknown']]) {
  assert.throws(() => collisionCaptureOptions(args), /map|argument/);
}
assert.equal(packed.encoding, 'primitive-dict-v1');
assert.deepEqual(packed.shapes, [shape], 'only repeated exact primitives are interned');
assert.equal(packed.obstacles[0].s, 0, 'reference zero is valid');
assert.equal(packed.obstacles[1].s[1], 0, 'compound children use the same primitive table');
const restored = decodeCollisionManifest(packed);
assert.deepEqual(restored, manifest, 'bounds, metadata, points, order, and precision are exact');
assert.strictEqual(restored.obstacles[0].s, restored.colliders[0].s);
assert.ok(Object.isFrozen(restored.obstacles[0].s), 'shared primitive tuples are immutable');
assert.throws(() => { restored.obstacles[0].s[1] = 999; }, TypeError);
assert.deepEqual(decodeCollisionManifest(manifest), manifest, 'unencoded in-memory fixtures remain supported');

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
for (const invalid of [['m'], ['m', -1], ['m', ['m', shape]], ['m', ...Array(65).fill(0)]]) {
  const value = fresh(); value.obstacles[0].s = invalid;
  assert.throws(() => decodeCollisionManifest(value), /invalid/, 'reject invalid compound/ref nesting');
}
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
// Frozen published receipts at afaf62b60, before native recapture. Tight OBBs
// replace redundant compound walls: raw bytes shrink faster than dictionary
// bytes, so raw-relative compression is not a stable map storage budget.
// Keep every map below its prior actual encoded size (not a relaxed ratio).
const previousShardBytes = {
  verdant: 1402315, desert: 599567, winter: 1177056, urban: 2645339,
  coastal: 853167, autumn: 1372225, steppe: 719830, railyard: 872036,
  frontier: 1667904, fjord: 1410232, delta: 1430739, badlands: 839003,
  monsoon: 1888601, alpine: 1795157, caldera: 1218614, foundry: 1149519,
  ruinspires: 2960310, blackglass: 1727148, titan_gorge: 849674, skybridge: 1097045,
  polders: 953559, copper_mesa: 727167, airfield: 786018, oasis: 685786,
  whiteout: 541698, orchard: 1135684, longleaf: 1218490, mangrove: 1055765,
  saltwind: 873926, reservoir: 1282807,
};
assert.deepEqual(Object.keys(previousShardBytes), MAP_IDS, 'storage budget covers every canonical map');
let rawBytes = 0, encodedBytes = 0, publishedBytes = 0;
for (const id of MAP_IDS) {
  const bytes = readFileSync(new URL(`${id}.json`, directory));
  const entry = index.maps[id];
  assert.equal(bytes.length, entry.bytes, `${id} byte receipt`);
  assert.ok(bytes.length <= previousShardBytes[id], `${id} published shard must not exceed its prior byte budget`);
  publishedBytes += bytes.length;
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${id} checksum receipt`);
  const original = decodeCollisionManifest(JSON.parse(bytes.toString('utf8')));
  validateCollisionManifestCounts(original, entry);
  const encoded = encodeCollisionManifest(original);
  const decoded = decodeCollisionManifest(JSON.parse(JSON.stringify(encoded)));
  assert.deepEqual(decoded, original, `${id} exact all-record primitive round trip`);
  assert.deepEqual(encodeCollisionManifest(decoded), encoded, `${id} deterministic dictionary order`);
  assert.deepEqual(collisionManifestCounts(decoded), collisionManifestCounts(original), `${id} exact census`);
  rawBytes += Buffer.byteLength(JSON.stringify(original));
  encodedBytes += Buffer.byteLength(JSON.stringify(encoded));
}
assert.equal(encodedBytes, publishedBytes, 'published shards are the canonical exact dictionary encoding');
assert.ok(publishedBytes <= 36936381, 'complete roster storage cannot exceed the frozen published budget');

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
  assert.equal(generated.encoding, packed.encoding, 'future browser captures use the exact dictionary writer');
  assert.deepEqual(generated.shapes, packed.shapes);
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
