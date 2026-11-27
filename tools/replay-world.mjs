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
 *  must hold on it to its last step. (replay-receipts-279) The recording's world: its map in its mode's battlefield
 *  variant (src/game/replay/replaySetup.ts recordedTerrainVariant; Frontline Assault's trenches). */
export async function createReplayWorldFor(recording, argv = process.argv) {
  const { recordedTerrainVariant } = await import('../src/game/replay/replaySetup.ts');
  const mapId = String(recording.header.setup.mapId), variant = recordedTerrainVariant(recording.header);
  if (!argv.includes('--world=shard')) return createReplayWorld(mapId, variant);
  const [{ createDedicatedWorldCollision }, { withLayoutSpawnPoints }] = await Promise.all([
    import('../server/dedicatedWorldCollision.ts'), import('../src/game/replay/replayRunner.ts')]);
  return withLayoutSpawnPoints(createDedicatedWorldCollision(mapId, { retain: true, variant }));
}

/** The page's world for `mapId` in `terrainVariant` (with its own spawn points), built on first use. */
export async function createReplayWorld(mapId, terrainVariant = null) {
  const key = terrainVariant ? `${mapId}@${terrainVariant}` : mapId;
  if (worlds.has(key)) return worlds.get(key);
  installWorldBuildFixture();
  globalThis.window ??= globalThis;
  const THREE = await import('three');
  const [{ preloadPropModels }, { loadMapKits }, { worldBuildConfig }, fleet] = await Promise.all([
    import('../src/world/propsModelStore.ts'), import('../src/world/worldKits.ts'), import('../src/world/worldBuildConfig.ts'),
    import('../src/vehicles/fleetFactory.ts')]);
  await preloadPropModels();
  const config = worldBuildConfig(mapId, terrainVariant);
  // the wreck cast bakes real hull geometry, and the map's kits its set pieces: both resident before the build
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  await loadMapKits(config);
  const { createMap } = await import('../src/world/map.ts');
  const engine = { scene: new THREE.Scene(), anisotropy: 4, setupShadowMaterial() {}, renderer: null, camera: new THREE.PerspectiveCamera(), quality: 'low' };
  const world = createMap(engine, { mapId, ...(terrainVariant ? { terrainVariant } : {}) });
  worlds.set(key, world);
  return world;
}
