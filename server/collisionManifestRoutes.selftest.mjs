// collisionManifestRoutes.selftest (physics stream, 2026-10-16; the coordinator's ruling with the MP lane): 226's collision
// manifests carry compound records of up to 256 parts (the pillboxes' embrasures on their structure bands) and are served
// on their own route; 225's files stay on the old one, byte for byte, for one release.
//   1. The legacy route's files (server/world-collision-manifests-225) are 225's committed shards (e8a8c8527): its index's
//      sha256 is 225's, and every shard it names has the bytes and the sha256 the index pins — so a 225 tab that hosts
//      or is elected after 226 deploys fetches files its own codec decodes, of its own world.
//   2. The build serves this tree's manifests at /mp-collision/v2 and the frozen ones at /mp-collision (vite.config.ts),
//      the host reads v2 (mp/host/worldCollision.ts COLLISION_MANIFEST_ROUTE), and no runtime source (src/, server/)
//      names the legacy route.
//   3. The format: a 166-part compound record encodes, decodes and validates; 256 parts pass; 257 are refused by the
//      codec and by the validator.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeCollisionManifest, decodeCollisionManifest } from './collisionManifestCodec.ts';
import { COLLISION_COMPOUND_MAX_PARTS, readCollisionManifest, readCollisionManifestIndex } from './collisionManifestFormat.ts';
import { COLLISION_MANIFEST_ROUTE } from '../src/mp/host/worldCollision.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// ---- 1. the legacy route's files are 225's
const legacy = join(root, 'server/world-collision-manifests-225');
const LEGACY_INDEX_SHA256 = '055051c88da584545fc1b98db4fbeadcb25767d9b12e3c16fb76ad227ec623e6'; // e8a8c8527:server/world-collision-manifests/index.json
const indexBytes = readFileSync(join(legacy, 'index.json'));
assert.equal(sha(indexBytes), LEGACY_INDEX_SHA256, 'the legacy index is 225\'s, byte for byte');
const index = readCollisionManifestIndex(JSON.parse(indexBytes.toString('utf8')));
let shards = 0;
const named = new Set(['index.json']);
const check = (file, entry) => {
  const bytes = readFileSync(join(legacy, file));
  assert.equal(bytes.byteLength, entry.bytes, `${file}: the index's byte count`);
  assert.equal(sha(bytes), entry.sha256, `${file}: the index's sha256`);
  named.add(file); shards++;
};
for (const [id, entry] of Object.entries(index.maps)) check(`${id}.json`, entry);
for (const [variant, maps] of Object.entries(index.variants ?? {})) for (const [id, entry] of Object.entries(maps)) check(`${id}@${variant}.json`, entry);
assert.deepEqual(readdirSync(legacy).filter((file) => file.endsWith('.json')).sort(), [...named].sort(), 'nothing on the legacy route the index does not name');

// ---- 2. the routes
assert.equal(COLLISION_MANIFEST_ROUTE, '/mp-collision/v2', 'the host reads v2');
const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
assert.match(vite, /\{ route: '\/mp-collision\/v2', dir: resolve\(.*'server\/world-collision-manifests'\) \}/, 'the build serves this tree\'s manifests at v2');
assert.match(vite, /\{ route: '\/mp-collision', dir: resolve\(.*'server\/world-collision-manifests-225'\) \}/, 'and 225\'s frozen files at the old route');
const offenders = [];
const scan = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('world-collision-manifests')) continue;
    if (statSync(path).isDirectory()) { scan(path); continue; }
    if (!/\.(ts|mjs|js)$/.test(name) || /\.selftest\.mjs$/.test(name)) continue;
    const text = readFileSync(path, 'utf8');
    if (/['"`]\/mp-collision(?!\/v2)(['"`/])/.test(text)) offenders.push(path.slice(root.length));
  }
};
scan(join(root, 'src')); scan(join(root, 'server'));
assert.deepEqual(offenders, [], 'no runtime source names the legacy route');

// ---- 3. the format at 256 parts
const part = (k) => ({ kind: 'convex', cx: k, cz: 0, points: [k, 0, k + 0.5, 0, k + 0.5, 0.4, k, 0.4], y0: 0, y1: 1 + (k % 3) * 0.1 });
const manifestOf = (n) => ({
  obstacles: [{ min: [0, 0, 0], max: [n + 1, 1.2, 1], kind: 'bunker', shape2: { kind: 'compound', cx: n / 2, cz: 0.2, parts: Array.from({ length: n }, (_, k) => part(k)) } }],
  colliders: [], concealers: [],
});
// (the packed form the capture writes: tools/headlessWorldCollision.mjs packWorldCollision)
const { packWorldCollision } = await import('../tools/headlessWorldCollision.mjs');
for (const n of [166, COLLISION_COMPOUND_MAX_PARTS]) {
  const packed = packWorldCollision(manifestOf(n));
  const encoded = encodeCollisionManifest(readCollisionManifest(packed));
  const decoded = decodeCollisionManifest(JSON.parse(JSON.stringify(encoded)));
  assert.equal(decoded.obstacles[0].s.length - 1, n, `a ${n}-part record round-trips`);
  assert.doesNotThrow(() => readCollisionManifest(decoded), `and validates (${n})`);
}
const over = packWorldCollision(manifestOf(COLLISION_COMPOUND_MAX_PARTS + 1));
assert.throws(() => readCollisionManifest(over), /invalid|collision/i, 'the validator refuses 257 parts');
const encoded = encodeCollisionManifest(readCollisionManifest(packWorldCollision(manifestOf(COLLISION_COMPOUND_MAX_PARTS))));
const tampered = JSON.parse(JSON.stringify(encoded));
tampered.obstacles[0].s.push(tampered.obstacles[0].s[1]);
assert.throws(() => decodeCollisionManifest(tampered), /invalid/, 'the codec refuses 257 parts');
console.log(`collisionManifestRoutes.selftest: the legacy route holds 225's ${shards} shards byte for byte; the build serves v2 and the host reads it; `
  + `a 166-part record round-trips, ${COLLISION_COMPOUND_MAX_PARTS} pass, 257 are refused`);
