import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!globalThis.gc) {
  const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url)], {
    stdio: 'inherit', timeout: 120_000,
  });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, 'GC-isolated map lifecycle worker passed');
} else {
  const {
    createDedicatedWorldCollision, dedicatedCollisionCacheStats, dedicatedCollisionManifestStats,
  } = await import('./dedicatedWorldCollision.ts');
  const { createAuthoritativeMatch, authoritativeTerrainCacheStats } = await import('../src/sim/authoritativeMatch.ts');
  const players = [
    { id: 'memory-alpha', specId: 'm1a2', team: 'alpha' },
    { id: 'memory-bravo', specId: 'm1a2', team: 'bravo' },
  ];
  const settle = async () => {
    await new Promise(setImmediate);
    globalThis.gc(); globalThis.gc();
    return process.memoryUsage();
  };
  const imported = await settle();
  assert.ok(imported.heapUsed < 50 * 1024 * 1024,
    'headless collision import must not retain a whole-roster JSON geometry bundle');
  assert.equal(dedicatedCollisionCacheStats().manifests.builds, 0,
    'import and census do not eagerly parse any map geometry');
  const ids = Object.keys(dedicatedCollisionManifestStats());

  function exerciseSharing() {
    const a = createDedicatedWorldCollision(ids[0], { retain: true });
    const b = createDedicatedWorldCollision(ids[0], { retain: true });
    assert.strictEqual(a.heightField, b.heightField);
    assert.equal(dedicatedCollisionCacheStats().terrain.activeLeases, 2);
    const tree = a.getObstacles().find((record) => record.treeIdx != null);
    const otherTree = b.getObstacles().find((record) => record.treeIdx === tree.treeIdx);
    a.crushObstacle(tree);
    assert.equal(otherTree.dead, undefined, 'destruction does not cross match boundaries');
    const before = authoritativeTerrainCacheStats();
    const simulation = createAuthoritativeMatch({ mapId: ids[0], players, worldCollision: a });
    assert.strictEqual(simulation.heightField, a.heightField);
    assert.deepEqual(authoritativeTerrainCacheStats(), before, 'dedicated authority avoids the second bake');
    for (const id of ids.slice(1)) createDedicatedWorldCollision(id);
    assert.strictEqual(createDedicatedWorldCollision(ids[0]).heightField, a.heightField,
      'active leases survive a whole-roster idle sweep');
    a.release(); a.release(); b.release();
  }

  function sweep() {
    for (const id of ids) {
      const world = createDedicatedWorldCollision(id, { retain: true });
      const match = createAuthoritativeMatch({ mapId: id, players, worldCollision: world });
      assert.strictEqual(match.heightField, world.heightField);
      world.release();
    }
  }

  exerciseSharing();
  sweep();
  const first = await settle();
  sweep();
  const second = await settle();
  const cache = dedicatedCollisionCacheStats();
  assert.equal(cache.terrain.activeMaps, 0);
  assert.equal(cache.terrain.activeLeases, 0);
  assert.equal(cache.terrain.idleMaps, 2);
  assert.equal(cache.manifests.idleMaps, 2);
  assert.equal(authoritativeTerrainCacheStats().builds, 0);
  assert.ok(second.arrayBuffers - imported.arrayBuffers < 12 * 1024 * 1024,
    'all-map history retains at most two ~5.5 MB heightfields');
  assert.ok(second.arrayBuffers - first.arrayBuffers < 256 * 1024,
    'repeating a full roster sweep reaches an ArrayBuffer plateau');
  assert.ok(second.heapUsed - first.heapUsed < 4 * 1024 * 1024,
    'match-local geometry and object grids collect after teardown');
  console.log(JSON.stringify({ maps: ids.length, imported, first, second, cache }));
  console.log('dedicatedWorldCollisionMemory.selftest: shared terrain, isolated destruction, and GC plateau passed');
}
