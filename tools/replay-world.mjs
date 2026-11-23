// The world a recorded solo battle stepped on, built in Node (replay-system-275, docs/REPLAY.md §4): the page's own
// world (src/world/map.ts createMap) behind the world receipts' small DOM fixture (tools/headlessWorldCollision.mjs),
// so the replay collides with the records the page's battle did, at their full precision. The dedicated shards
// (server/world-collision-manifests) are a capture of those records rounded to 0.1 mm: a five-minute Verdant battle
// recorded on the page's world replays to its last step on this world and drifts at step 1200 on the shard's.
// Built once per map per process (~6.6 s for Verdant).
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';

const worlds = new Map();

/** (276 sim-det-trig (f)) `--world=shard`: the dedicated server's world, inflated from the committed 0.1 mm shard, with
 *  the page's spawn points: what an online battle collides on. A solo recording on the 276 page (sim-world-packed)
 *  must hold on it to its last step. */
export async function createReplayWorldFor(mapId, argv = process.argv) {
  if (!argv.includes('--world=shard')) return createReplayWorld(mapId);
  const [{ createDedicatedWorldCollision }, { withLayoutSpawnPoints }] = await Promise.all([
    import('../server/dedicatedWorldCollision.ts'), import('../src/game/replay/replayRunner.ts')]);
  return withLayoutSpawnPoints(createDedicatedWorldCollision(mapId, { retain: true }));
}

/** The page's world for `mapId` (with its own spawn points), built on first use. */
export async function createReplayWorld(mapId) {
  if (worlds.has(mapId)) return worlds.get(mapId);
  installWorldBuildFixture();
  globalThis.window ??= globalThis;
  const THREE = await import('three');
  const [{ preloadPropModels }, { loadMapKits }, { getMapConfig }, fleet] = await Promise.all([
    import('../src/world/propsModelStore.ts'), import('../src/world/worldKits.ts'), import('../src/world/maps/index.ts'),
    import('../src/vehicles/fleetFactory.ts')]);
  await preloadPropModels();
  const config = getMapConfig(mapId);
  // the wreck cast bakes real hull geometry, and the map's kits its set pieces: both resident before the build
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  await loadMapKits(config);
  const { createMap } = await import('../src/world/map.ts');
  const engine = { scene: new THREE.Scene(), anisotropy: 4, setupShadowMaterial() {}, renderer: null, camera: new THREE.PerspectiveCamera(), quality: 'low' };
  const world = createMap(engine, { mapId });
  worlds.set(mapId, world);
  return world;
}
