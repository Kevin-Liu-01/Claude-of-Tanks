// A browser host on the mobile tier plays on the desktop's records (physics stream PH.15, 2026-10-16; the coordinator: "the
// authority must use the shard's records ... regardless of the host's device tier"). The process resolves the phone tier
// before anything reads it (as tools/capture-world-collision-manifests.mjs --tier=mobile does), then the host's world is
// loaded as matchHostCore loads it (worldCollision.ts loadCollisionWorld: the committed manifest, fetched and verified):
// on Saltwind — the field walls' crushable spans among its records — it holds every obstacle, collider and concealer of
// the desktop's committed shard (server/dedicatedWorldCollision.ts), record for record and index for index, so a phone
// host judges hits and crushes on the walls every desktop peer stands. (That a phone's own props build stands those same
// records is the drift check at the phone tier, and fieldWallCollision.selftest for the walls' spans.)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

globalThis.window ??= {};
globalThis.window.location = { search: '?tier=mobile' };
globalThis.window.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { resolveDeviceTier } = await import('../../engine/quality.ts');
assert.equal(resolveDeviceTier(), 'mobile', 'the process runs at the phone tier');

const { createDedicatedWorldCollision } = await import('../../../server/dedicatedWorldCollision.ts');
const { COLLISION_MANIFEST_ROUTE, collisionManifestFileName, loadCollisionWorld } = await import('./worldCollision.ts');
const directory = new URL('../../../server/world-collision-manifests/', import.meta.url);
const files = new Map();
for (const file of readdirSync(directory)) {
  if (!file.endsWith('.json')) continue;
  const bytes = readFileSync(new URL(file, directory));
  const name = file === 'index.json' ? file : collisionManifestFileName(file.slice(0, -5), createHash('sha256').update(bytes).digest('hex'));
  files.set(`${COLLISION_MANIFEST_ROUTE}/${name}`, bytes);
}
const fetchImpl = async (url) => {
  const bytes = files.get(url);
  if (!bytes) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), json: async () => JSON.parse(bytes.toString('utf8')) };
};
const MAP = 'saltwind';
const hosted = await loadCollisionWorld(MAP, COLLISION_MANIFEST_ROUTE, { fetchImpl });
const shard = createDedicatedWorldCollision(MAP);
const same = (a, b, what) => {
  assert.equal(a.length, b.length, `${what}: the same count`);
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual([a[i].kind, a[i].min, a[i].max, a[i].propIdx, a[i].crushable, a[i].shape2], [b[i].kind, b[i].min, b[i].max, b[i].propIdx, b[i].crushable, b[i].shape2],
      `${what} ${i}: the shard's record`);
  }
};
same(hosted.getObstacles(), shard.getObstacles(), 'obstacle');
same(hosted.getColliders(), shard.getColliders(), 'collider');
assert.equal(hosted.getConcealment().length, shard.getConcealment().length, 'the same concealers');
const walls = hosted.getObstacles().filter((record) => record.kind === 'field-wall').length;
console.log(`worldCollisionMobileTier.selftest: a host at the phone tier plays ${MAP} on the desktop's shard, `
  + `${hosted.getObstacles().length} obstacles (${walls} field-wall spans) and ${hosted.getColliders().length} colliders record for record`);
