#!/usr/bin/env node
// World collider audit CLI (the hitbox lane, 2026-10-07). Builds each map's world in Node (the shard builders) and
// measures every collider against the geometry it stands for (tools/worldColliderAudit.mjs).
//
//   node tools/world-collider-audit.mjs --maps=redrock,titan_gorge --families=rocks --out=<file.json>
//   node tools/world-collider-audit.mjs                       # every map, every family
//
// Families: rocks (boulders, talus blocks, outcrops, crushable small rocks, the scenery's rock masses).
import { writeFileSync } from 'node:fs';
import { MAP_IDS } from '../src/world/maps/catalog.ts';
import { installWorldBuildFixture } from './headlessWorldCollision.mjs';
import { auditMapWorld, summariseAudit } from './worldColliderAudit.mjs';
import { createObstacleGrid } from '../src/world/collision.ts';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const mapIds = (option('maps', '') || MAP_IDS.join(',')).split(',').filter(Boolean);
for (const id of mapIds) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
const families = (option('families', 'rocks') || 'rocks').split(',');
const out = option('out');
const rays = !args.includes('--no-rays');

installWorldBuildFixture();
const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
  import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
  import('../src/world/props.ts'), import('../src/vehicles/fleetFactory.ts'), import('../src/world/propsModelStore.ts'),
]);
await models.preloadPropModels();

const results = {};
for (const mapId of mapIds) {
  const started = performance.now();
  const config = maps.getMapConfig(mapId);
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const dressing = props.createProps(field, engine, 2002, config, flora);
  const built = performance.now();
  const audit = auditMapWorld({ mapId, field, flora, dressing, families, rays, createObstacleGrid });
  results[mapId] = audit;
  const summary = summariseAudit(audit);
  console.log(`${mapId}: built ${((built - started) / 1000).toFixed(1)} s, audited ${((performance.now() - built) / 1000).toFixed(1)} s`);
  for (const line of summary) console.log('  ' + line);
  for (const mesh of [dressing.group, flora.group]) mesh.traverse((o) => o.geometry?.dispose?.());
}
if (out) {
  writeFileSync(out, JSON.stringify(results, null, 1) + '\n');
  console.log(`wrote ${out}`);
}
