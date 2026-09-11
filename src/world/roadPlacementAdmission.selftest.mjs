import assert from 'node:assert/strict';
import { createHeightField, createLayout } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { originalRoadPlacementConfig } from './maps/roadEndpoints.ts';
import { originalExitConfig } from '../../tools/road-authored-exit-fixture.mjs';
import { historicalRoadHeightField, historicalRoadLayout } from './roadHistoryTestOracle.mjs';

let samples = 0;
for (const id of MAP_IDS) {
  const cfg = getMapConfig(id), originalCfg = originalExitConfig(cfg);
  assert.deepEqual(originalRoadPlacementConfig(cfg), originalCfg, `${id}: literal original path configuration`);
  assert.deepEqual(createLayout(originalCfg, false).roads, historicalRoadLayout(originalCfg).roads,
    `${id}: original sampled grid and authored paths, including clipped Coastal terminals`);
  for (const seed of [1337, ...(['coastal','frontier','alpine','reservoir'].includes(id) ? [2025] : [])]) {
    const field = createHeightField(seed, cfg), expected = historicalRoadHeightField(seed, originalCfg);
    if (!field._createRoadPlacementSampler) continue;
    const allocations = [], NativeFloat32Array = globalThis.Float32Array;
    globalThis.Float32Array = new Proxy(NativeFloat32Array, {construct(Target,args) {
      const value = new Target(...args); allocations.push(value.byteLength); return value;
    }});
    let sampler;
    try {
      const steps = field._createRoadPlacementSampler(); let result = steps.next();
      while (!result.done) result = steps.next(); sampler = result.value;
    } finally { globalThis.Float32Array = NativeFloat32Array; }
    assert.ok(allocations.every(bytes => bytes < 1025 * 1025 * 4), `${id}: no retained gameplay fast grid allocated`);
    assert.deepEqual(Object.keys(sampler).sort(), ['_roadDist','getGroundType','getHeightAt','getNormalAt'].sort());
    const points = expected._layout.roads.flatMap(line => line.flatMap(([x,z]) => [[x,z],[x+7.25,z-3.125]]));
    for (let z=-500; z<=500; z+=50) for (let x=-500; x<=500; x+=50) points.push([x+.123,z-.456]);
    for (const [x,z] of points) {
      const label = `${id}/${seed} at ${x},${z}`;
      assert.equal(sampler._roadDist(x,z), expected._roadDist(x,z), `${label}: Float32 road distance`);
      assert.equal(sampler.getHeightAt(x,z), expected.getHeightAt(x,z), `${label}: exact original support`);
      assert.equal(sampler.getGroundType(x,z), expected.getGroundType(x,z), `${label}: original wet-ground admission`);
      assert.deepEqual(sampler.getNormalAt(x,z).toArray(), expected.getNormalAt(x,z).toArray(), `${label}: original slope`);
      samples++;
    }
  }
}
console.log(`roadPlacementAdmission: ${MAP_IDS.length} original layouts; ${samples} exact seeded admission samples; no gameplay fast-grid allocation PASS`);
