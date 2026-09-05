import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCollisionManifestLoader } from './collisionManifestLoader.ts';
import { createBrowserDedicatedWorldCollision } from './dedicatedWorldCollisionBrowser.ts';
import { readCollisionManifestIndex } from './collisionManifestFormat.ts';
import { encodeCollisionManifest } from './collisionManifestCodec.ts';
import { writeCollisionManifestIndex, writeCollisionManifestShard } from '../tools/worldCollisionManifestFiles.mjs';

const fixture = mkdtempSync(join(tmpdir(), 'cot-collision-loader-'));
const directory = pathToFileURL(fixture + '/');
const empty = { obstacles: [], colliders: [], concealers: [] };
const maps = {};
for (const id of ['verdant', 'desert', 'winter']) maps[id] = writeCollisionManifestShard(id, empty, directory);
const index = writeCollisionManifestIndex(maps, directory);

try {
  const loader = createCollisionManifestLoader(directory);
  assert.equal(loader.cacheStats().builds, 0, 'index import parses no geometry');
  assert.equal(Object.keys(loader.stats()).length, 3);
  assert.equal(loader.cacheStats().builds, 0, 'census reads only the small index');
  for (const id of Object.keys(maps)) loader.get(id);
  assert.equal(loader.cacheStats().idleMaps, 2, 'packed-record cache has a fixed ceiling');
  assert.throws(() => loader.get('../verdant'), /missing compatible/);
  assert.throws(() => loader.get('__proto__'), /missing compatible/);
  assert.throws(() => loader.get('coastal'), /missing compatible/);
  assert.throws(() => readCollisionManifestIndex({ ...index, terrainSeed: 7 }), /invalid/);

  // A same-size corruption must fail on checksum before JSON/schema parsing.
  const verdant = new URL('verdant.json', directory);
  const bytes = readFileSync(verdant, 'utf8');
  writeFileSync(verdant, bytes.replace('obstacles', 'Obstacles'));
  assert.throws(() => loader.get('verdant'), /checksum mismatch/);
  assert.equal(loader.cacheStats().builds, 3, 'failed loads never enter the cache');
  writeFileSync(verdant, '{}');
  assert.throws(() => loader.get('verdant'), /size mismatch/);

  // Exercise the browser adapter with plain fetched bytes, no DOM or Node I/O
  // imported by the browser entry itself. Other maps must never be requested.
  const savedFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(String(url).endsWith('index.json')
      ? JSON.stringify(index) : JSON.stringify(encodeCollisionManifest(empty)), { status: 200 });
  };
  try {
    const world = await createBrowserDedicatedWorldCollision('verdant');
    assert.equal(world.mapId, 'verdant');
    assert.equal(world.getObstacles().length, 0);
    assert.equal(requested.length, 2, 'browser fixture fetches only index and selected shard');
    assert.ok(requested[1].endsWith('/verdant.json'));
  } finally {
    globalThis.fetch = savedFetch;
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log('collisionManifestLoader.selftest: lazy bounded loading, integrity, and browser adapter passed');
