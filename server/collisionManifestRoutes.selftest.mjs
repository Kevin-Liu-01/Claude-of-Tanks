// collisionManifestRoutes.selftest (physics stream, 2026-10-16; the coordinator's ruling with the MP lane): each collision
// manifest format is served on its own route, and the production before it keeps its own files there, byte for byte, so a
// tab left open at the deploy that hosts or is elected still decodes its own format and its own world, until the deploy
// after it has shipped (docs/MULTIPLAYER-V2.md "Manifest routes"). (The maps lane, 2026-10-20) 229's manifests are the v5
// codec's (server/collisionManifestCodec.ts) on /mp-collision/v3. Production 224's on /mp-collision and production 228's
// on /mp-collision/v2 are retired (272: every deploy since has shipped, and the build-mismatch refusal sends any older tab
// to Refresh).
//   1. The retired sets are gone: no server/world-collision-manifests-224 or -228 directory.
//   2. The build serves this tree's manifests at /mp-collision/v3 and nothing at /mp-collision or /mp-collision/v2
//      (vite.config.ts), the host reads v3 (mp/host/worldCollision.ts COLLISION_MANIFEST_ROUTE), and no runtime source
//      (src/, server/) names an older route.
//   3. The format: a 166-part compound record encodes, decodes and validates; 256 parts pass; 257 are refused by the
//      codec and by the validator.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeCollisionManifest, decodeCollisionManifest } from './collisionManifestCodec.ts';
import { COLLISION_COMPOUND_MAX_PARTS, readCollisionManifest } from './collisionManifestFormat.ts';
import { COLLISION_MANIFEST_ROUTE } from '../src/mp/host/worldCollision.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

// ---- 1. the retired sets are gone
for (const release of ['224', '228']) {
  assert.equal(existsSync(join(root, `server/world-collision-manifests-${release}`)), false, `production ${release}'s files are retired`);
}

// ---- 2. the routes
assert.equal(COLLISION_MANIFEST_ROUTE, '/mp-collision/v3', 'the host reads v3');
const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
assert.match(vite, /\{ route: '\/mp-collision\/v3', dir: resolve\(.*'server\/world-collision-manifests'\) \}/, 'the build serves this tree\'s manifests at v3');
assert.doesNotMatch(vite, /route: '\/mp-collision(?:\/v2)?'/, 'nothing is served at the retired routes');
assert.doesNotMatch(vite, /world-collision-manifests-\d/, 'the build reads no frozen set');
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
console.log(`collisionManifestRoutes.selftest: the build serves v3 and the host reads it; 224's and 228's routes are retired; `
  + `a 166-part record round-trips, ${COLLISION_COMPOUND_MAX_PARTS} pass, 257 are refused`);
