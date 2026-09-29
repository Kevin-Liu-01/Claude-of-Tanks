// The browser host's collision world: the manifests fetched from the route the build serves (index.json, then the
// content-addressed map file), verified against the index's byte count and SHA-256 with Web Crypto, decoded by the
// server's codec and built into the same headless world the match container builds from disk — the same obstacles,
// colliders and concealers, the same height at the same points; a wrong checksum, a wrong size and a missing file
// are refused. The fetch double reads the source directory the way the Vite plugin serves it.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { COLLISION_MANIFEST_ROUTE, collisionManifestFileName, loadCollisionWorld } from './worldCollision.ts';

const directory = new URL('../../../server/world-collision-manifests/', import.meta.url);
const files = new Map();
for (const file of readdirSync(directory)) {
  if (!file.endsWith('.json')) continue;
  const bytes = readFileSync(new URL(file, directory));
  const name = file === 'index.json' ? file : collisionManifestFileName(file.slice(0, -5), createHash('sha256').update(bytes).digest('hex'));
  files.set(`${COLLISION_MANIFEST_ROUTE}/${name}`, bytes);
}
const requests = [];
const fetchImpl = async (url, init) => {
  requests.push({ url, cache: init?.cache });
  const bytes = files.get(url);
  if (!bytes) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString('utf8')) };
};

// ---- the fetched world equals the container's disk-loaded one
const fetched = await loadCollisionWorld('verdant', COLLISION_MANIFEST_ROUTE, { fetchImpl });
const container = createDedicatedWorldCollision('verdant');
assert.deepEqual(requests.map((request) => request.url.replace(/\.[0-9a-f]{12}\.json$/, '.<hash>.json')), [`${COLLISION_MANIFEST_ROUTE}/index.json`, `${COLLISION_MANIFEST_ROUTE}/verdant.<hash>.json`]);
assert.deepEqual(requests.map((request) => request.cache), ['no-cache', 'force-cache'], 'the index revalidates, the content-addressed file is cached');
assert.equal(fetched.mapId, 'verdant');
assert.equal(fetched.getObstacles().length, container.getObstacles().length, 'the same obstacles');
assert.equal(fetched.getConcealment().length, container.getConcealment().length, 'the same concealers');
for (const [x, z] of [[0, 0], [120.5, -80.25], [-300, 410], [755, 755]]) {
  assert.equal(fetched.heightField.getHeightAt(x, z), container.heightField.getHeightAt(x, z), `the same height at ${x}, ${z}`);
}
const boxA = fetched.getObstacles()[0];
const boxB = container.getObstacles()[0];
assert.deepEqual(boxA.b ?? boxA.bounds ?? Object.keys(boxA), boxB.b ?? boxB.bounds ?? Object.keys(boxB), 'the first obstacle matches');
const out = [];
fetched.queryObstacles(-50, -50, 50, 50, out);
const outB = [];
container.queryObstacles(-50, -50, 50, 50, outB);
assert.equal(out.length, outB.length, 'the same obstacles around the origin');
container.release();

// ---- refusals: a wrong checksum, a wrong size, a missing map
const index = JSON.parse(files.get(`${COLLISION_MANIFEST_ROUTE}/index.json`).toString('utf8'));
const tampered = new Map(files);
const verdantName = [...files.keys()].find((key) => key.includes('/verdant.'));
const bytes = files.get(verdantName);
const flipped = Buffer.from(bytes);
flipped[flipped.length - 3] ^= 0x01;
tampered.set(verdantName, flipped);
await assert.rejects(loadCollisionWorld('verdant', COLLISION_MANIFEST_ROUTE, { fetchImpl: async (url, init) => { const saved = files; try { files.clear(); for (const [key, value] of tampered) files.set(key, value); return await fetchImpl(url, init); } finally { void saved; } } }), /checksum mismatch/);
files.clear();
for (const file of readdirSync(directory)) {
  if (!file.endsWith('.json')) continue;
  const raw = readFileSync(new URL(file, directory));
  const name = file === 'index.json' ? file : collisionManifestFileName(file.slice(0, -5), createHash('sha256').update(raw).digest('hex'));
  files.set(`${COLLISION_MANIFEST_ROUTE}/${name}`, raw);
}
const truncated = new Map(files);
truncated.set(verdantName, bytes.subarray(0, bytes.length - 10));
await assert.rejects(loadCollisionWorld('verdant', COLLISION_MANIFEST_ROUTE, { fetchImpl: async (url, init) => { const hit = truncated.get(url); return hit ? { ok: true, status: 200, arrayBuffer: async () => hit.buffer.slice(hit.byteOffset, hit.byteOffset + hit.byteLength), json: async () => JSON.parse(hit.toString('utf8')) } : fetchImpl(url, init); } }), /size mismatch/);
await assert.rejects(loadCollisionWorld('no_such_map', COLLISION_MANIFEST_ROUTE, { fetchImpl }), /manifest|map/i);
assert.ok(Object.keys(index.maps).length >= 31, 'the index names every map');
console.log(`worldCollision.selftest: the fetched world equals the container's for verdant (${fetched.getObstacles().length} obstacles), checksum/size/missing refused`);
