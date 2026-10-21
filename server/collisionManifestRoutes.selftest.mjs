// collisionManifestRoutes.selftest (physics stream, 2026-10-16; the coordinator's ruling with the MP lane): each collision
// manifest format is served on its own route, and the production before it keeps its own files there, byte for byte, so a
// tab left open at the deploy that hosts or is elected still decodes its own format and its own world. (The maps lane,
// 2026-10-20; the coordinator's ruling) 229's manifests are the v5 codec's (server/collisionManifestCodec.ts) on
// /mp-collision/v3; production 228's v4 files are frozen on /mp-collision/v2; production 224's on /mp-collision are retired
// (227 and 228 have shipped, and the build-mismatch refusal sends any older tab to Refresh).
//   1. The frozen route's files (server/world-collision-manifests-228) are production 228's committed shards (ed0f3e31b,
//      228p; the same tree as 228's ac0a12960): its index's sha256 is 228's, and every shard it names has the bytes and the
//      sha256 the index pins; this tree's codec still decodes them.
//   2. The build serves this tree's manifests at /mp-collision/v3 and the frozen ones at /mp-collision/v2 (vite.config.ts),
//      nothing at /mp-collision itself, the host reads v3 (mp/host/worldCollision.ts COLLISION_MANIFEST_ROUTE), and no
//      runtime source (src/, server/) names an older route.
//   3. The format: a 166-part compound record encodes, decodes and validates; 256 parts pass; 257 are refused by the
//      codec and by the validator.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeCollisionManifest, decodeCollisionManifest } from './collisionManifestCodec.ts';
import { COLLISION_COMPOUND_MAX_PARTS, readCollisionManifest, readCollisionManifestIndex, validateCollisionManifestCounts } from './collisionManifestFormat.ts';
import { COLLISION_MANIFEST_ROUTE } from '../src/mp/host/worldCollision.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// ---- 1. the frozen route's files are production 228's
const frozen = join(root, 'server/world-collision-manifests-228');
const FROZEN_INDEX_SHA256 = '9cc99a2945eb1ead82be2e326035b77ca5317060d133bdebb189a141e76001d6'; // ed0f3e31b (production 228p):server/world-collision-manifests/index.json
const indexBytes = readFileSync(join(frozen, 'index.json'));
assert.equal(sha(indexBytes), FROZEN_INDEX_SHA256, 'the frozen index is production 228\'s, byte for byte');
const index = readCollisionManifestIndex(JSON.parse(indexBytes.toString('utf8')));
let shards = 0;
const named = new Set(['index.json']);
const check = (file, entry) => {
  const bytes = readFileSync(join(frozen, file));
  assert.equal(bytes.byteLength, entry.bytes, `${file}: the index's byte count`);
  assert.equal(sha(bytes), entry.sha256, `${file}: the index's sha256`);
  named.add(file); shards++;
};
for (const [id, entry] of Object.entries(index.maps)) check(`${id}.json`, entry);
for (const [variant, maps] of Object.entries(index.variants ?? {})) for (const [id, entry] of Object.entries(maps)) check(`${id}@${variant}.json`, entry);
assert.deepEqual(readdirSync(frozen).filter((file) => file.endsWith('.json')).sort(), [...named].sort(), 'nothing on the frozen route the index does not name');
// (a small shard: this tree's codec reads production 228's format)
const sample = JSON.parse(readFileSync(join(frozen, 'mars.json'), 'utf8'));
assert.equal(sample.encoding, 'primitive-kind-dict-v4');
validateCollisionManifestCounts(decodeCollisionManifest(sample), index.maps.mars);

// ---- 2. the routes
assert.equal(COLLISION_MANIFEST_ROUTE, '/mp-collision/v3', 'the host reads v3');
const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
assert.match(vite, /\{ route: '\/mp-collision\/v3', dir: resolve\(.*'server\/world-collision-manifests'\) \}/, 'the build serves this tree\'s manifests at v3');
assert.match(vite, /\{ route: '\/mp-collision\/v2', dir: resolve\(.*'server\/world-collision-manifests-228'\) \}/, 'and production 228\'s frozen files at v2');
assert.doesNotMatch(vite, /route: '\/mp-collision'/, 'nothing is served at the retired route');
assert.equal(existsSync(join(root, 'server/world-collision-manifests-224')), false, 'production 224\'s files are retired');
const offenders = [];
const scan = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('world-collision-manifests')) continue;
    if (statSync(path).isDirectory()) { scan(path); continue; }
    if (!/\.(ts|mjs|js)$/.test(name) || /\.selftest\.mjs$/.test(name)) continue;
    const text = readFileSync(path, 'utf8');
    if (/['"`]\/mp-collision(?!\/v3)(['"`/])/.test(text)) offenders.push(path.slice(root.length));
  }
};
scan(join(root, 'src')); scan(join(root, 'server'));
assert.deepEqual(offenders, [], 'no runtime source names an older route');

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
// (v5: a record is [its key order, ...values]; its shape at the key order's 's')
const shapeAt = tampered.keys[tampered.obstacles[0][0]].indexOf('s') + 1;
tampered.obstacles[0][shapeAt].push(tampered.obstacles[0][shapeAt][1]);
assert.throws(() => decodeCollisionManifest(tampered), /invalid/, 'the codec refuses 257 parts');
console.log(`collisionManifestRoutes.selftest: v2 holds production 228's ${shards} shards byte for byte; the build serves v3 and the host reads it; 224's route is retired; `
  + `a 166-part record round-trips, ${COLLISION_COMPOUND_MAX_PARTS} pass, 257 are refused`);
