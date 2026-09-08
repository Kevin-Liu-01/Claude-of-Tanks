// Browser-side measurement preparation, not a runtime quality/LOD override.
export const RESIDENCY_TERRAIN_PROTOCOL = 'countdown-lookahead-v1';

/** Drain exactly the production countdown queue, then verify after real frames. */
export function settleResidencyTerrain(expected = null) {
  const { world, camera } = window.__DEBUG;
  if (typeof world?.warmTerrainLookahead !== 'function') throw new Error('Terrain warming API unavailable');
  const stats = world.group.children.find(child => child.name === 'terrain')?.userData.streamingStats;
  if (!stats?.indexPool) throw new Error('Terrain streaming receipt unavailable');
  const snapshot = () => ({
    worldUuid: world.group.uuid,
    camera: [...camera.position.toArray(), ...camera.quaternion.toArray()],
    initialGeometryCount: stats.initialGeometryCount,
    streamedGeometryCount: stats.streamedGeometryCount,
    indexReferences: stats.indexPool.references,
  });
  const buildOne = () => {
    const built = world.warmTerrainLookahead(camera.position, 1);
    if (built !== 0 && built !== 1) throw new Error('Terrain warming violated its single-job budget');
    return built;
  };
  if (expected) {
    if (buildOne() !== 0) throw new Error('Terrain topology was not settled after actual rendered frames');
    const actual = snapshot();
    if (JSON.stringify(actual) !== JSON.stringify(expected.topology)) {
      throw new Error('Terrain topology or capture camera changed during actual rendered frames');
    }
    return { ...expected, verified: true, pendingAfterRender: 0 };
  }
  let jobs = 0;
  for (let call = 0; call < 256; call++) {
    if (buildOne() === 0) return {
      protocol: 'countdown-lookahead-v1', jobs, exhausted: true, topology: snapshot(),
    };
    jobs++;
  }
  throw new Error('Terrain warming did not reach a finite settled topology');
}
